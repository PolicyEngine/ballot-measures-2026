"""Per-state subsets of the national Populace ACS local-area file.

Each measure changes taxes or benefits in one state, so the pipeline
simulates that state's households only. ``build_state_subsets`` opens the
national h5 ONCE with ``USSingleYearDataset``, keeps each state's
household rows (``state_fips``) plus all their member persons and group
units (tax units, SPM units, families, marital units, via the person
table's ``person_<entity>_id`` columns), and writes one h5 per state.
Every household keeps its weight, so weighted state totals from a subset
equal state-filtered totals from a national run.

``clean_spm_composition`` then gives every SPM unit an adult:
policyengine-us (through 2.72.4) raises when it computes the SPM threshold of a unit
without one (the national file has a few child-only units).

The table selection (``select_state_tables``) is plain pandas so the fast
tests exercise it without policyengine installed; everything that reads or
writes datasets imports policyengine lazily.
"""

from __future__ import annotations

import os

import numpy as np
import pandas as pd

from .config import POPULACE_FILENAME, POPULACE_REPO, resolve_revision
from .states import STATES, StateGeo

ENTITY_TABLES = (
    "person",
    "household",
    "tax_unit",
    "spm_unit",
    "family",
    "marital_unit",
)
# (table, id column, person link column) for every group entity.
GROUP_LINKS = (
    ("tax_unit", "tax_unit_id", "person_tax_unit_id"),
    ("spm_unit", "spm_unit_id", "person_spm_unit_id"),
    ("family", "family_id", "person_family_id"),
    ("marital_unit", "marital_unit_id", "person_marital_unit_id"),
)

# spm-calculator counts a member as an SPM adult if aged 18+, or 15+ with a
# household head or spouse role.
SPM_INDEPENDENT_MIN_AGE = 15
SPM_ADULT_AGE = 18


def subset_filename(state: str, revision: str | None = None) -> str:
    """Cache filename for a state's raw subset, keyed by dataset revision."""
    return f"{state.lower()}_subset_{resolve_revision(revision)}.h5"


def clean_filename(state: str, revision: str | None = None) -> str:
    """Cache filename for a state's SPM-cleaned subset."""
    return f"{state.lower()}_subset_clean_{resolve_revision(revision)}.h5"


def load_dataset_path(revision: str | None = None) -> str:
    """Download (or reuse the cached) national ACS local-area h5."""
    from huggingface_hub import hf_hub_download

    return hf_hub_download(
        repo_id=POPULACE_REPO,
        repo_type="dataset",
        revision=resolve_revision(revision),
        filename=POPULACE_FILENAME,
    )


def check_state_households(household: pd.DataFrame, geo: StateGeo) -> dict:
    """Sanity-check one state's household rows; raise with what was found.

    Checks the household-record count against ``geo``'s plausible range and
    that the congressional district geoids are exactly ``geo``'s.
    """
    n = len(household)
    geoids = sorted(
        int(g) for g in household["congressional_district_geoid"].unique().tolist()
    )
    problems = []
    if not (geo.min_households < n < geo.max_households):
        problems.append(
            f"{n} households, outside the plausible "
            f"({geo.min_households}, {geo.max_households}) range"
        )
    if set(geoids) != set(geo.district_geoids):
        problems.append(
            f"congressional_district_geoid values {geoids}, expected "
            f"{sorted(geo.district_geoids)}"
        )
    if problems:
        raise RuntimeError(
            f"Sanity check failed for {geo.code} (state_fips {geo.fips}): "
            + "; ".join(problems)
            + ". Geography columns or states.py may need updating."
        )
    return {"households": n, "district_geoids": geoids}


def select_state_tables(
    tables: dict[str, pd.DataFrame], geo: StateGeo
) -> tuple[dict[str, pd.DataFrame], dict]:
    """Return ``geo``'s households, their members and their group units.

    ``tables`` maps entity names to the national DataFrames. Raises if the
    state's households fail ``check_state_households`` or have no members.
    """
    household = tables["household"]
    state_household = household[household["state_fips"] == geo.fips].reset_index(
        drop=True
    )
    stats = check_state_households(state_household, geo)

    person = tables["person"]
    state_person = person[
        person["person_household_id"].isin(state_household["household_id"])
    ].reset_index(drop=True)
    if len(state_person) == 0:
        raise RuntimeError(
            f"Sanity check failed for {geo.code}: households but no member "
            "persons (person_household_id linkage broken?)."
        )

    subset = {"person": state_person, "household": state_household}
    for name, id_col, link_col in GROUP_LINKS:
        df = tables.get(name)
        if df is None or len(df) == 0:
            continue
        subset[name] = df[df[id_col].isin(state_person[link_col])].reset_index(
            drop=True
        )
    stats["persons"] = len(state_person)
    stats["weighted_households"] = float(state_household["household_weight"].sum())
    return subset, stats


def _save_dataset(tables: dict, time_period: int, output_path: str) -> None:
    """Save entity tables in the layout ``USSingleYearDataset`` reads.

    ``USSingleYearDataset.save`` writes pandas "table" format, which cannot
    serialize the national file's mixed-type object columns. The loader
    reads either format, so this writes "fixed" format. It writes to a
    temporary file and renames it into place only after a complete save, so
    an interrupted run never leaves a partial file that looks cached.
    """
    from policyengine_us.data import USSingleYearDataset

    tmp_path = output_path + ".tmp.h5"
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    with pd.HDFStore(tmp_path, mode="w") as store:
        for name, df in tables.items():
            if df is not None and len(df) > 0:
                store.put(name, df, format="fixed")
        store.put("_time_period", pd.Series([int(time_period)]), format="fixed")
    USSingleYearDataset.validate_file_path(tmp_path)
    os.replace(tmp_path, output_path)


def is_valid_dataset(path: str) -> bool:
    """True if ``path`` is a complete USSingleYearDataset h5."""
    from policyengine_us.data import USSingleYearDataset

    return os.path.exists(path) and USSingleYearDataset.validate_file_path(
        path, raise_exception=False
    )


def build_state_subset(national, out_path: str, geo: StateGeo) -> dict:
    """Write ``geo``'s subset of a loaded national ``USSingleYearDataset``.

    Returns the subset's record counts and district geoids.
    """
    tables = {name: getattr(national, name) for name in ENTITY_TABLES}
    subset, stats = select_state_tables(tables, geo)
    _save_dataset(subset, int(national.time_period), out_path)
    print(
        f"Saved {geo.code} subset: {stats['households']} households, "
        f"{stats['persons']} persons, districts {stats['district_geoids']} "
        f"-> {out_path}"
    )
    return stats


def build_state_subsets(
    national_path: str, out_paths: dict[str, str], on_saved=None
) -> dict[str, dict]:
    """Load the national tables once and write each state's subset.

    ``out_paths`` maps state codes to output paths. ``on_saved(state)`` runs
    after each state is written (the pipeline commits its Volume there).
    Every state is attempted; failures are collected and raised together
    after the others are saved.
    """
    from policyengine_us.data import USSingleYearDataset

    print(f"Loading national dataset tables from {national_path}...")
    national = USSingleYearDataset(file_path=national_path)
    stats, errors = {}, {}
    for state, out_path in out_paths.items():
        try:
            stats[state] = build_state_subset(national, out_path, STATES[state])
        except RuntimeError as err:
            errors[state] = str(err)
            print(f"FAILED {state}: {err}")
            continue
        if on_saved is not None:
            on_saved(state)
    if errors:
        raise RuntimeError(f"Subset checks failed: {errors}")
    return stats


def _calc(sim, variable: str, year: int) -> np.ndarray:
    return np.asarray(sim.calculate(variable, period=year))


def fill_variable_nans(tables: dict[str, pd.DataFrame], variables: dict) -> dict:
    """Replace NaN in columns that are model input variables with each
    variable's default, in place; return ``{column: rows filled}``.

    The national file stacks CPS- and ACS-donor records, and columns that
    only one source carries are NaN for the other. policyengine-us refuses
    NaN inputs. Among model variables this hits ``parent_1_id`` and
    ``parent_2_id`` (NaN for CPS-donor persons), whose default 0 means
    "parent unknown". Source columns that are not model variables are left
    as they are; the model never reads them.
    """
    filled = {}
    for name, df in tables.items():
        for column in df.columns:
            variable = variables.get(column)
            if variable is None:
                continue
            missing = df[column].isna()
            if not missing.any():
                continue
            default = variable.default_value
            if hasattr(default, "name"):  # Enum member
                default = default.name
            df[column] = df[column].where(~missing, default)
            if variable.value_type in (int, bool):
                df[column] = df[column].astype(variable.value_type)
            filled[f"{name}.{column}"] = int(missing.sum())
    return filled


def clean_spm_composition(subset_path: str, output_path: str) -> dict:
    """Give every SPM unit an adult for spm-calculator's threshold step.

    spm-calculator counts a member as an SPM adult if aged 18+, or 15+ with
    a household head/spouse role, and raises for any SPM unit without one.
    Following Census SPM conventions:

    - a person aged 15-17 in an adult-less SPM unit heads an independent
      unit: flag them with the primitive ``is_household_head`` input (any
      younger members stay in that unit);
    - a child under 15 in a household that also has an adult SPM unit joins
      that unit (Census assigns unrelated children under 15 to the
      householder's unit);
    - a household made up only of children under 15 cannot be placed and is
      dropped.

    Model input columns holding NaN are first filled with each variable's
    default (``fill_variable_nans``).

    Writes the cleaned dataset to ``output_path`` and returns weighted
    counts of each adjustment. Raises if any SPM unit is still adult-less.
    """
    from policyengine_us import Microsimulation
    from policyengine_us.system import system

    with pd.HDFStore(subset_path, mode="r") as store:
        tables = {name: store[name] for name in ENTITY_TABLES if f"/{name}" in store}
        time_period = int(store["_time_period"].iloc[0])
    nan_filled = fill_variable_nans(tables, system.variables)
    print(f"Filled NaN model inputs with defaults: {nan_filled}")
    filled_path = output_path + ".filled.h5"
    _save_dataset(tables, time_period, filled_path)

    sim = Microsimulation(dataset=filled_path, dataset_end_year=time_period)
    spm_ids = _calc(sim, "spm_unit_id", time_period)
    adults = _calc(sim, "spm_measurement_adults", time_period)
    adultless = set(spm_ids[adults < 1].tolist())
    ages = pd.Series(
        _calc(sim, "age", time_period), index=_calc(sim, "person_id", time_period)
    )
    del sim
    os.remove(filled_path)

    person = tables["person"].copy()
    household = tables["household"]
    person_age = person["person_id"].map(ages)
    hh_weight = household.set_index("household_id")["household_weight"]

    in_adultless = person["person_spm_unit_id"].isin(adultless)
    independent = in_adultless & (person_age >= SPM_INDEPENDENT_MIN_AGE)
    # Units that gain an adult through an independent 15-17-year-old keep
    # their younger members.
    fixed_units = set(person.loc[independent, "person_spm_unit_id"])
    young = (
        in_adultless
        & (person_age < SPM_INDEPENDENT_MIN_AGE)
        & ~person["person_spm_unit_id"].isin(fixed_units)
    )

    head = person.get("is_household_head")
    head = (
        pd.Series(False, index=person.index)
        if head is None
        else head.fillna(False).astype(bool)
    )
    person["is_household_head"] = head | independent

    # The most common adult SPM unit per household, for merging young
    # children.
    adult_member = person_age >= SPM_ADULT_AGE
    adult_units = (
        person[adult_member & ~in_adultless]
        .groupby("person_household_id")["person_spm_unit_id"]
        .agg(lambda s: s.value_counts().index[0])
    )
    target_unit = person["person_household_id"].map(adult_units)
    merge = young & target_unit.notna()
    person.loc[merge, "person_spm_unit_id"] = target_unit[merge].astype(
        person["person_spm_unit_id"].dtype
    )
    drop_households = set(person.loc[young & ~merge, "person_household_id"])
    keep = ~person["person_household_id"].isin(drop_households)

    stats = {
        "spm_adultless_units": float(len(adultless)),
        "spm_independent_minor_units": float(
            person.loc[independent & keep, "person_household_id"].map(hh_weight).sum()
        ),
        "spm_minors_merged": float(
            person.loc[merge, "person_household_id"].map(hh_weight).sum()
        ),
        "child_only_households_dropped": float(
            hh_weight.reindex(list(drop_households)).sum()
        ),
        "child_only_household_records_dropped": float(len(drop_households)),
        "nan_inputs_filled": nan_filled,
    }
    person = person[keep].reset_index(drop=True)

    cleaned = {
        "person": person,
        "household": household[
            ~household["household_id"].isin(drop_households)
        ].reset_index(drop=True),
    }
    for name, id_col, link_col in GROUP_LINKS:
        df = tables.get(name)
        if df is None or len(df) == 0:
            continue
        cleaned[name] = df[df[id_col].isin(person[link_col])].reset_index(drop=True)
    _save_dataset(cleaned, time_period, output_path)

    check = Microsimulation(dataset=output_path, dataset_end_year=time_period)
    remaining = int((_calc(check, "spm_measurement_adults", time_period) < 1).sum())
    if remaining:
        raise RuntimeError(f"SPM cleaning left {remaining} SPM units without an adult.")
    stats["households_after_cleaning"] = float(len(cleaned["household"]))
    print(f"SPM composition cleaning ({output_path}): {stats}")
    return stats
