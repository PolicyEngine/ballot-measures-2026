"""Pre-compute the dashboard's example households.

Runs every measure's ``example_profiles`` (ballot_calc/measures.py), for
every tax year the measure scores, through
``ballot_calc.household.HouseholdCalculator`` -- the code the household
API serves -- in a Modal container, and writes
frontend/public/data/example_households.json:

    {"pin": "policyengine-us==...", "generated_at_utc": "...Z",
     "measures": {slug: {"years": {"2027": {"households": [
         {"id", "label", "input", "response"}, ...]}}}}}

``input`` is the POST /calculate request for the household and
``response`` exactly what the endpoint returns for it, so the household
tab can show the examples without calling the API, and fall back to them
if the API is unreachable.

    export PYTHONIOENCODING=utf-8 PYTHONUTF8=1   # Windows
    modal run scripts/compute_example_households.py            # compute and write
    modal run scripts/compute_example_households.py --force    # write even if a check fails

Before writing, the script prints each example's change and checks the
direction each measure must move its examples (``CHECKS``); a failed check
stops the write, since it usually means a stale pin or a wrong override.

To confirm a deployed endpoint returns the committed responses (no Modal
container needed; the first request may wait for a cold start):

    python scripts/compute_example_households.py --check https://policyengine--bm26-household-preview-householdapi-web.modal.run
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import modal

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from ballot_calc import config  # noqa: E402

OUTPUT_PATH = REPO_ROOT / "frontend" / "public" / "data" / "example_households.json"

app = modal.App("bm26-example-households")
image = (
    modal.Image.debian_slim(python_version="3.13")
    # pypi.org directly: Modal's PyPI mirror lags new policyengine-us
    # releases (it stopped at 2.68.0 when 2.72.4 was pinned).
    .pip_install(config.POLICYENGINE_US_PIN, index_url="https://pypi.org/simple")
    .add_local_python_source("ballot_calc")
)

# (measure, year or None for every year, example id, what must hold,
#  test(baseline, reform)) on the at-income values. Single-filer profiles
# put all wages on the head.
CHECKS = (
    (
        "co-amendment-87",
        None,
        "married-couple-1-2m-wages-2-kids",
        "pays more Colorado tax",
        lambda b, r: (
            r["state_tax"] > b["state_tax"] and r["net_income"] < b["net_income"]
        ),
    ),
    (
        "co-amendment-87",
        None,
        "single-filer-45k-wages",
        "pays less Colorado tax",
        lambda b, r: (
            r["state_tax"] < b["state_tax"] and r["net_income"] > b["net_income"]
        ),
    ),
    (
        "co-prop-nn",
        2027,
        "single-filer-40k-wages",
        "loses the $43 TY2027 refund",
        lambda b, r: (
            b["refund"] == 43
            and r["refund"] == 0
            and abs(r["net_income"] - b["net_income"] + 43) < 0.02
        ),
    ),
    (
        "co-prop-nn",
        2028,
        "single-filer-40k-wages",
        "loses the $47 TY2028 refund",
        lambda b, r: (
            b["refund"] == 47
            and r["refund"] == 0
            and abs(r["net_income"] - b["net_income"] + 47) < 0.02
        ),
    ),
    (
        "ca-prop-3",
        None,
        "married-couple-3m-wages",
        "pays more California tax",
        lambda b, r: (
            r["state_tax"] > b["state_tax"] and r["net_income"] < b["net_income"]
        ),
    ),
    (
        "ca-prop-3",
        None,
        "single-filer-150k-wages",
        "is unaffected",
        lambda b, r: (
            r["state_tax"] == b["state_tax"] and r["net_income"] == b["net_income"]
        ),
    ),
    (
        "wa-i-645",
        2028,
        "married-couple-5m-wages",
        "pays 9.9% x ($5M - $1M deduction) = $396,000 less Washington tax",
        lambda b, r: abs((b["state_tax"] - r["state_tax"]) - 0.099 * 4_000_000) < 1,
    ),
    (
        "wa-i-645",
        None,
        "married-couple-5m-wages",
        "pays less Washington tax",
        lambda b, r: (
            r["state_tax"] < b["state_tax"] and r["net_income"] > b["net_income"]
        ),
    ),
    (
        "wa-i-645",
        None,
        "married-couple-250k-wages-2-kids",
        "is unaffected",
        lambda b, r: (
            r["state_tax"] == b["state_tax"] and r["net_income"] == b["net_income"]
        ),
    ),
    (
        "nd-measure-2",
        None,
        "married-couple-110k-3-kids",
        "gains free-meal value",
        lambda b, r: (
            r["free_meals"] > b["free_meals"]
            and r["meal_value"] > b["meal_value"]
            and r["net_income"] > b["net_income"]
        ),
    ),
    (
        "sd-amendment-i",
        None,
        "single-adult-20k-wages",
        "moves from Medicaid to a subsidized marketplace plan; cash falls by the premium",
        lambda b, r: (
            (b["coverage_status"], r["coverage_status"])
            == ("medicaid", "subsidized_marketplace")
            and b["medicaid_enrolled"] >= 1
            and r["medicaid_enrolled"] == 0
            and r["ptc"] > b["ptc"]
            and r["marketplace_premium"] > 0
            # Net income counts health benefits, less the premium paid.
            and abs(
                (r["net_income"] - b["net_income"])
                - (
                    r["medicaid"]
                    - b["medicaid"]
                    + r["ptc"]
                    - b["ptc"]
                    - (r["marketplace_premium"] - b["marketplace_premium"])
                )
            )
            < 1
            and abs(
                (r["cash_net_income"] - b["cash_net_income"])
                + (r["marketplace_premium"] - b["marketplace_premium"])
            )
            < 0.02
        ),
    ),
    (
        "sd-amendment-i",
        None,
        "single-adult-14k-wages",
        "loses Medicaid with no premium tax credit (coverage gap); no cash change",
        lambda b, r: (
            (b["coverage_status"], r["coverage_status"], r["no_option_reason"])
            == ("medicaid", "no_subsidized_option", "below_poverty_line")
            and b["medicaid_enrolled"] >= 1
            and r["medicaid_enrolled"] == 0
            and r["ptc"] == 0
            and abs(r["cash_net_income"] - b["cash_net_income"]) < 0.02
        ),
    ),
)


def build_payload(calculator) -> dict:
    """Every measure's example households for every scored year."""
    from ballot_calc.household import HouseholdInput, example_id, example_payload
    from ballot_calc.measures import MEASURES

    measures = {}
    for measure in MEASURES.values():
        years = {}
        for year in measure.years:
            households = []
            for profile in measure.example_profiles:
                request = example_payload(measure, profile, year)
                response = calculator.calculate(HouseholdInput.from_dict(request))
                households.append(
                    {
                        "id": example_id(profile["label"]),
                        "label": profile["label"],
                        "input": request,
                        "response": response,
                    }
                )
            years[str(year)] = {"households": households}
        measures[measure.slug] = {"years": years}
    return {
        "pin": config.POLICYENGINE_US_PIN,
        "generated_at_utc": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "measures": measures,
    }


@app.function(image=image, cpu=2, memory=16384, timeout=3600)
def compute() -> dict:
    from ballot_calc.household import HouseholdCalculator

    return build_payload(HouseholdCalculator())


def iter_households(payload: dict):
    for slug, entry in payload["measures"].items():
        for year, block in entry["years"].items():
            for household in block["households"]:
                yield slug, int(year), household


def check_results(payload: dict) -> list[tuple[str, int, str, str, bool]]:
    """``(measure, year, id, expectation, passed)`` for every applicable check."""
    results = []
    for slug, year, household in iter_households(payload):
        at = household["response"]["at_income"]
        for c_slug, c_year, c_id, expectation, test in CHECKS:
            if c_slug == slug and c_id == household["id"] and c_year in (None, year):
                results.append(
                    (
                        slug,
                        year,
                        household["id"],
                        expectation,
                        bool(test(at["baseline"], at["reform"])),
                    )
                )
    return results


def _show(value) -> str:
    return f"{value:,.2f}" if isinstance(value, (int, float)) else str(value)


def summary_lines(payload: dict) -> list[str]:
    """One line per example: at-income levels and reform - baseline changes."""
    lines = []
    for slug, year, household in iter_households(payload):
        at = household["response"]["at_income"]
        base, reform = at["baseline"], at["reform"]
        changes = ", ".join(
            f"{key} {_show(base[key])} -> {_show(reform[key])}"
            for key in base
            if key != "net_income"
        )
        lines.append(
            f"{slug} {year} | {household['label']} | {household['response']['filing_status']} | "
            f"net income {base['net_income']:,.2f} -> {reform['net_income']:,.2f} "
            f"({reform['net_income'] - base['net_income']:+,.2f}) | {changes}"
        )
    return lines


# A JSON scalar without spaces: a number, true/false/null, or a string of
# letters, digits, underscores and hyphens (coverage_status values).
_SCALAR = r'(?:-?[0-9.eE+-]+|true|false|null|"[A-Za-z0-9_-]*")'
_SCALAR_LIST = re.compile(rf"\[\s*((?:{_SCALAR},\s*)*{_SCALAR})\s*\]")


def to_json(payload: dict) -> str:
    """Indented JSON with each list of numbers (or short codes) on one line."""
    text = json.dumps(payload, indent=1)
    return (
        _SCALAR_LIST.sub(lambda m: "[" + re.sub(r"\s+", "", m.group(1)) + "]", text)
        + "\n"
    )


def write(payload: dict, force: bool) -> None:
    print("\n".join(summary_lines(payload)))
    results = check_results(payload)
    print()
    for slug, year, hid, expectation, passed in results:
        print(f"{'PASS' if passed else 'FAIL'}  {slug} {year} {hid}: {expectation}")
    expected = sum(1 for _ in CHECKS)
    if len(results) < expected:
        print(
            f"Only {len(results)} checks matched an example; expected at least {expected}."
        )
    failed = [r for r in results if not r[-1]]
    if (failed or len(results) < expected) and not force:
        raise SystemExit(
            "Checks failed; not writing. Rerun with --force to write anyway."
        )
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(to_json(payload), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")


def compare_with_endpoint(url: str) -> int:
    """POST each committed example to ``url`` and compare the responses."""
    committed = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    url = url.rstrip("/")
    worst = 0.0
    mismatches = 0

    def compare(path, expected, actual):
        nonlocal worst, mismatches
        if isinstance(expected, dict):
            if set(expected) != set(actual):
                mismatches += 1
                print(f"  {path}: keys differ ({sorted(set(expected) ^ set(actual))})")
                return
            for key in expected:
                compare(f"{path}.{key}", expected[key], actual[key])
        elif isinstance(expected, list):
            if len(expected) != len(actual):
                mismatches += 1
                print(f"  {path}: {len(actual)} values, expected {len(expected)}")
                return
            for i, (e, a) in enumerate(zip(expected, actual)):
                compare(f"{path}[{i}]", e, a)
        elif isinstance(expected, (int, float)) and not isinstance(expected, bool):
            diff = abs(float(expected) - float(actual))
            worst = max(worst, diff)
            if diff > 0.011:
                mismatches += 1
                print(f"  {path}: {actual} != {expected}")
        elif expected != actual:
            mismatches += 1
            print(f"  {path}: {actual!r} != {expected!r}")

    for slug, year, household in iter_households(committed):
        request = urllib.request.Request(
            f"{url}/calculate",
            data=json.dumps(household["input"]).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=600) as reply:
            actual = json.loads(reply.read())
        print(f"{slug} {year} {household['id']}")
        compare("response", household["response"], actual)
    print(f"{mismatches} mismatches; largest numeric difference {worst:.4f}")
    return 1 if mismatches else 0


@app.local_entrypoint()
def main(force: bool = False):
    write(compute.remote(), force)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--check",
        metavar="URL",
        help="compare a deployed endpoint with the committed file",
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="compute in this process (needs policyengine-us installed; heavy)",
    )
    parser.add_argument(
        "--force", action="store_true", help="write even if a check fails"
    )
    args = parser.parse_args()
    if args.check:
        raise SystemExit(compare_with_endpoint(args.check))
    if args.local:
        from ballot_calc.household import HouseholdCalculator

        write(build_payload(HouseholdCalculator()), args.force)
    else:
        parser.error(
            "run on Modal with `modal run scripts/compute_example_households.py`, or pass --local or --check URL"
        )
