"""Top-income coverage against IRS SOI, and coverage-scaled revenue.

The CO, CA and WA income tax measures turn on income above $500k and $1M,
where survey-based microdata are thin. The pipeline tabulates each state's
filers in the dataset's own year (``FILER_YEAR``) and compares them with
IRS SOI Historic Table 2 for the latest published tax year (``SOI``).

The Populace build has more $1M+ filers than SOI but less income above $1M
(fewer very high incomes), so the coverage-scaled revenue change scales:

- the $500k-$1M band's change by SOI / model AGI in that band;
- the $1M+ band's change in two parts: the top-rate change on AGI above $1M
  (``kind_params["top_rate_change"]``) by SOI / model AGI above $1M, and
  the rest (what each $1M+ return pays up to the threshold) by SOI / model
  returns over $1M;
- changes below $500k unscaled.

It is a methodology figure for the validation tab; the dashboard's
headlines are the model's own numbers. Pure numpy.
"""

from __future__ import annotations

import numpy as np

FILER_YEAR = 2024
SOI_YEAR = 2023
TOP = 1_000_000.0

# IRS SOI Historic Table 2, tax year 2023 (released August 2026), "All
# returns" column, AGI in dollars: https://www.irs.gov/pub/irs-soi/
# 23in06co.xlsx, 23in05ca.xlsx and 23in48wa.xlsx (rows "Number of returns"
# and "Adjusted gross income (AGI)"; columns "$500,000 under $1,000,000"
# and "$1,000,000 or more").
SOI: dict[str, dict[str, float]] = {
    "CO": {
        "returns": 3_086_830,
        "agi": 314_115_675_000,
        "returns_500k_1m": 38_030,
        "agi_500k_1m": 25_370_899_000,
        "returns_1m_plus": 15_610,
        "agi_1m_plus": 47_266_883_000,
    },
    "CA": {
        "returns": 18_482_300,
        "agi": 2_050_805_047_000,
        "returns_500k_1m": 317_160,
        "agi_500k_1m": 213_715_326_000,
        "returns_1m_plus": 132_720,
        "agi_1m_plus": 400_221_114_000,
    },
    "WA": {
        "returns": 3_781_890,
        "agi": 434_342_159_000,
        "returns_500k_1m": 67_020,
        "agi_500k_1m": 44_630_153_000,
        "returns_1m_plus": 23_370,
        "agi_1m_plus": 60_595_722_000,
    },
}
for _figures in SOI.values():
    _figures["agi_above_1m"] = (
        _figures["agi_1m_plus"] - TOP * _figures["returns_1m_plus"]
    )

COVERAGE_KEYS = (
    "returns",
    "agi",
    "returns_500k_1m",
    "agi_500k_1m",
    "returns_1m_plus",
    "agi_1m_plus",
    "agi_above_1m",
)

METRICS: tuple[str, ...] = (
    "revenue_coverage_scaled",
    "soi_coverage_returns_1m_plus",
    "soi_coverage_agi_above_1m",
)


def tabulate(agi, weight) -> dict:
    """Weighted returns and AGI, overall and at $500k-$1M and $1M+."""
    agi = np.asarray(agi, dtype=float)
    weight = np.asarray(weight, dtype=float)
    out = {"returns": float(weight.sum()), "agi": float((weight * agi).sum())}
    for name, low, high in (("500k_1m", 5e5, TOP), ("1m_plus", TOP, np.inf)):
        band = (agi >= low) & (agi < high)
        out[f"returns_{name}"] = float(weight[band].sum())
        out[f"agi_{name}"] = float((weight * agi)[band].sum())
        out[f"records_{name}"] = int(band.sum())
    top = agi >= TOP
    out["agi_above_1m"] = float((weight * (agi - TOP))[top].sum())
    return out


def coverage(model: dict, soi: dict) -> dict:
    """Model / SOI for each tabulated quantity."""
    return {key: model[key] / soi[key] for key in COVERAGE_KEYS}


def scale_factors(model: dict, soi: dict) -> dict:
    return {
        "500k_1m": soi["agi_500k_1m"] / model["agi_500k_1m"],
        "1m_plus_returns": soi["returns_1m_plus"] / model["returns_1m_plus"],
        "1m_plus_above": soi["agi_above_1m"] / model["agi_above_1m"],
    }


def coverage_scaled_change(agi, weight, delta, top_rate_change: float, scale) -> dict:
    """Split a tax change by AGI band and scale it to SOI coverage."""
    agi = np.asarray(agi, dtype=float)
    weight = np.asarray(weight, dtype=float)
    delta = np.asarray(delta, dtype=float)
    below = agi < 5e5
    middle = (agi >= 5e5) & (agi < TOP)
    top = agi >= TOP
    by_band = {
        "under_500k": float((weight * delta)[below].sum()),
        "500k_1m": float((weight * delta)[middle].sum()),
        "1m_plus": float((weight * delta)[top].sum()),
    }
    above = float((weight * top_rate_change * (agi - TOP))[top].sum())
    at_threshold = by_band["1m_plus"] - above
    scaled = (
        by_band["under_500k"]
        + by_band["500k_1m"] * scale["500k_1m"]
        + at_threshold * scale["1m_plus_returns"]
        + above * scale["1m_plus_above"]
    )
    return {
        "by_band": by_band,
        "above_threshold": above,
        "at_threshold": at_threshold,
        "scaled": scaled,
    }


def top_tail_metrics(
    state: str, filers: dict, base: dict, reform: dict, top_rate_change
):
    """metrics.csv values for one income tax measure-year.

    ``filers`` is ``tabulate`` of the state's filers in ``FILER_YEAR``.
    """
    soi = SOI[state]
    ratios = coverage(filers, soi)
    change = coverage_scaled_change(
        base["tu_agi"],
        base["tu_weight"],
        np.asarray(reform["tu_state_tax"], dtype=float)
        - np.asarray(base["tu_state_tax"], dtype=float),
        top_rate_change,
        scale_factors(filers, soi),
    )
    metrics = {
        "revenue_coverage_scaled": change["scaled"],
        "soi_coverage_returns_1m_plus": ratios["returns_1m_plus"],
        "soi_coverage_agi_above_1m": ratios["agi_above_1m"],
    }
    detail = {
        "revenue_change_by_agi_band": change["by_band"],
        "revenue_change_1m_plus_above_threshold": change["above_threshold"],
        "revenue_change_1m_plus_at_threshold": change["at_threshold"],
    }
    return metrics, detail


def state_summary(state: str, filers: dict) -> dict:
    """Manifest record: the filer tabulation, SOI, coverage and scales."""
    soi = SOI[state]
    return {
        "filer_year": FILER_YEAR,
        "soi_year": SOI_YEAR,
        "model_filers": filers,
        "soi": soi,
        "coverage": coverage(filers, soi),
        "band_scale": scale_factors(filers, soi),
    }
