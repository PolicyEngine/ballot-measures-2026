"""Pins, dataset revisions and Modal names shared across the repository.

Every number in the dashboard comes from one policyengine-us release and
one Populace dataset revision, both recorded here and in each run's
``manifest.json``.
"""

from __future__ import annotations

# Exact policyengine-us pin. The 2.60 line is the first with state school
# meal coverage (policyengine-us#10238, needed for North Dakota Measure
# No. 2). It also contains the Colorado Initiative 195 contrib (#9431),
# California Proposition 3 (#9601) and the Washington millionaires tax
# (#7908). Mirrored in pyproject.toml, scripts/modal_pipeline.py and
# scripts/modal_household_api.py; tests/test_registry.py keeps them equal.
POLICYENGINE_US_PIN = "policyengine-us==2.60.4"

# Populace ACS local-area national file (PUMA-assigned CD-119, county and
# state geography) on the Hugging Face dataset repo.
POPULACE_REPO = "policyengine/populace-us"
POPULACE_FILENAME = "populace_us_2024_acs_local.h5"
DATASET_REVISIONS = {
    # 2026-10-17 release. It binds state x AGI-band SOI targets
    # (microcosm#1102), which the top-bracket measures (CO, CA, WA) need.
    "buildo-1017": "populace-us-2024-buildo-acs-local-766b7c7-20261017T030317Z",
    # 2026-09-23 release, used by the MT and PA dashboards. Fallback only.
    "buildo-0923": "populace-us-2024-buildo-acs-local-767312d60-20260923T074941Z",
}
DEFAULT_REVISION = "buildo-1017"


def resolve_revision(revision: str | None = None) -> str:
    """Accept a short alias from ``DATASET_REVISIONS`` or a full revision."""
    if revision is None:
        revision = DEFAULT_REVISION
    return DATASET_REVISIONS.get(revision, revision)


# Modal names.
PIPELINE_APP_NAME = "ballot-measures-2026-pipeline"
HOUSEHOLD_APP_NAME = "ballot-measures-2026-household"
RESULTS_VOLUME_NAME = "ballot-measures-2026-results"

# Dollar change below which a household counts as unaffected.
CHANGE_THRESHOLD = 1.0
