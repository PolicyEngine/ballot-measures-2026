"""Modal web endpoint for the dashboard's household calculator.

The household tab calls this endpoint so household figures come from the
same policyengine-us release, and the same registry overrides, as the
statewide pipeline. It serves ``ballot_calc.household.HouseholdCalculator``
for all six measures; scripts/compute_example_households.py runs the same
calculator for the precomputed example households.

Deploy a preview (the Vercel preview's NEXT_PUBLIC_HOUSEHOLD_API_URL):

    export PYTHONIOENCODING=utf-8 PYTHONUTF8=1   # Windows
    modal deploy --name bm26-household-preview scripts/modal_household_api.py
    # https://policyengine--bm26-household-preview-householdapi-web.modal.run

Deploy production only after the dashboard PR is approved:

    modal deploy scripts/modal_household_api.py
    # https://policyengine--ballot-measures-2026-household-householdapi-web.modal.run

Modal labels are limited to 63 characters, which is why the preview app
has a short name. Keep one container warm around the election (Oct 29 -
Nov 4) without redeploying, and set it back to 0 afterwards:

    python -c "import modal; modal.Cls.from_name('ballot-measures-2026-household', 'HouseholdApi')().update_autoscaler(min_containers=1)"

Endpoints:
    GET  /health     -> {"status": "ok", "pin": ..., "measures": [slugs]}
    POST /calculate  -> request and response shapes in ballot_calc/household.py;
                        422 with {"detail": message} for an invalid request

Cold starts restore a memory snapshot taken after the nine tax-benefit
systems (current law, the Proposition NN and South Dakota current-law
variants, and the six measures passing) are built and warmed with one
request per measure and year, so a new container answers in seconds rather
than minutes. Each container serves one request at a time (the calculator
holds a lock); Modal scales out under load and to zero when idle.
"""

import sys
from pathlib import Path

import modal

# The repository root, so ``ballot_calc`` is importable when Modal loads this
# file from scripts/ (in the container the package sits beside this file).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ballot_calc import config  # noqa: E402

# Exact policyengine-us pin. Mirrors POLICYENGINE_US_PIN in
# ballot_calc/config.py, pyproject.toml and scripts/modal_pipeline.py.
POLICYENGINE_US_PIN = "policyengine-us==2.60.4"
if POLICYENGINE_US_PIN != config.POLICYENGINE_US_PIN:
    raise RuntimeError(
        f"{__file__} pins {POLICYENGINE_US_PIN} but ballot_calc/config.py pins "
        f"{config.POLICYENGINE_US_PIN}"
    )

app = modal.App(config.HOUSEHOLD_APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(POLICYENGINE_US_PIN, "fastapi[standard]")
    .add_local_python_source("ballot_calc")
)


def _rss_gb() -> float:
    """Resident memory of this container's process, in GB (Linux only)."""
    try:
        with open("/proc/self/status") as status:
            for line in status:
                if line.startswith("VmRSS"):
                    return round(int(line.split()[1]) / 1e6, 2)
    except OSError:
        pass
    return float("nan")


@app.cls(
    image=image,
    cpu=2,
    memory=16384,
    enable_memory_snapshot=True,
    scaledown_window=15 * 60,
    timeout=300,
    # Building and warming the nine systems before the snapshot takes
    # minutes; restores from the snapshot start in seconds.
    startup_timeout=20 * 60,
    max_containers=10,
)
class HouseholdApi:
    @modal.enter(snap=True)
    def load(self):
        import time

        from ballot_calc.household import (
            HouseholdCalculator,
            HouseholdInput,
            example_payload,
        )
        from ballot_calc.measures import MEASURES

        start = time.time()
        self.calculator = HouseholdCalculator()
        print(f"Built {len(self.calculator.systems)} systems in {time.time() - start:.0f}s")
        # Warm every system's parameter and formula caches for every scored
        # year before the snapshot is taken, then exempt the warm caches
        # from garbage collection along with the systems.
        for measure in MEASURES.values():
            for year in measure.years:
                payload = example_payload(measure, measure.example_profiles[0], year)
                self.calculator.calculate(HouseholdInput.from_dict(payload))
                print(f"Warmed {measure.slug} {year}: {self.calculator.last_timings}")
        self.calculator.freeze()
        print(f"Warmed in {time.time() - start:.0f}s, rss {_rss_gb()} GB; snapshotting")

    @modal.enter(snap=False)
    def ready(self):
        # Runs on every start, after a snapshot restore or after load().
        print("Container ready")

    @modal.asgi_app()
    def web(self):
        from typing import Any

        from fastapi import Body, FastAPI, HTTPException
        from fastapi.middleware.cors import CORSMiddleware

        from ballot_calc.household import HouseholdInput
        from ballot_calc.measures import MEASURE_SLUGS

        api = FastAPI(title="2026 ballot measures household calculator")
        api.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
        )

        @api.get("/health")
        def health():
            return {
                "status": "ok",
                "pin": POLICYENGINE_US_PIN,
                "measures": list(MEASURE_SLUGS),
            }

        @api.post("/calculate")
        def calculate(payload: Any = Body(...)):
            try:
                household = HouseholdInput.from_dict(payload)
            except (KeyError, TypeError, ValueError) as err:
                # HouseholdInputError (a ValueError) carries the message.
                raise HTTPException(status_code=422, detail=str(err))
            response = self.calculator.calculate(household)
            print(
                f"{household.measure} {household.year}: "
                f"{self.calculator.last_timings}, rss {_rss_gb()} GB"
            )
            return response

        return api
