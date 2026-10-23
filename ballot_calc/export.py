"""Export the measure registry for the frontend.

    python -m ballot_calc.export

writes ``frontend/public/data/measures.json``. The file carries a hash of
the registry's computational fields; the pipeline records the same hash in
``manifest.json`` so ``fetch`` and the tests can tell when committed
results came from a different registry.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict
from pathlib import Path

from .config import POLICYENGINE_US_PIN
from .measures import ELECTION_DATE, MEASURES
from .states import STATES

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "frontend" / "public" / "data" / "measures.json"

# Fields that change the numbers. Display-only fields are left out so copy
# edits don't invalidate committed results.
_COMPUTATIONAL_FIELDS = (
    "slug",
    "state",
    "kind",
    "years",
    "baseline_overrides",
    "reform_overrides",
    "target_variable",
    "target_sign",
    "state_revenue_variables",
    "state_spending_variables",
    "federal_revenue_variables",
    "federal_spending_variables",
    "income_bands",
    "kind_params",
)


def _json_safe(value):
    """Replace non-finite floats with strings JSON (and browsers) accept."""
    if isinstance(value, float) and not math.isfinite(value):
        return "Infinity" if value > 0 else "-Infinity"
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def registry_hash() -> str:
    payload = [
        {name: _json_safe(getattr(m, name)) for name in _COMPUTATIONAL_FIELDS}
        for m in MEASURES.values()
    ]
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def measures_json() -> dict:
    measures = []
    for m in MEASURES.values():
        geo = STATES[m.state]
        record = _json_safe(asdict(m))
        record.update(
            {
                "state_name": geo.name,
                "state_fips": geo.fips,
                "has_districts": geo.has_districts,
                "district_count": len(geo.district_geoids) if geo.has_districts else 0,
            }
        )
        measures.append(record)
    return {
        "election_date": ELECTION_DATE,
        "pin": POLICYENGINE_US_PIN,
        "registry_hash": registry_hash(),
        "measures": measures,
    }


def write(path: Path = OUTPUT_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(measures_json(), indent=2) + "\n", encoding="utf-8")
    return path


if __name__ == "__main__":
    print(f"Wrote {write()}")
