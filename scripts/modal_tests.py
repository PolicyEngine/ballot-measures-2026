"""Run the slow Python tests on Modal.

The ``slow`` tests (pytest marker; deselected by default in pyproject.toml)
build policyengine-us tax-benefit systems and run one household per
measure, which takes minutes and several GB of memory. This runs them in a
Modal container instead of on a laptop and writes the log to the results
Volume, so a dead local driver loses nothing (export PYTHONIOENCODING=utf-8
PYTHONUTF8=1 first on Windows):

    modal run --detach scripts/modal_tests.py::kickoff          # start
    modal run scripts/modal_tests.py::results                   # print the log

``kickoff --args "-k nd_measure"`` passes extra pytest arguments. The image
and ``run_in_repo`` are shared so other entrypoints (for example one that
regenerates the example households) can be added below.
"""

import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import modal

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ballot_calc.config import RESULTS_VOLUME_NAME

# Mirrored from ballot_calc/config.py; tests/test_registry.py keeps it equal.
POLICYENGINE_US_PIN = "policyengine-us==2.72.4"

APP_NAME = "ballot-measures-2026-tests"
RESULTS_DIR = "/results"
LOG_PATH = "tests/latest.txt"

app = modal.App(APP_NAME)
volume = modal.Volume.from_name(RESULTS_VOLUME_NAME, create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.13")
    # pypi.org directly: Modal's PyPI mirror lags new policyengine-us releases.
    .pip_install(
        POLICYENGINE_US_PIN,
        "numpy>=1.24.0",
        "pytest",
        "pytest-timeout",
        index_url="https://pypi.org/simple",
    )
    .add_local_dir(
        str(REPO_ROOT),
        "/repo",
        ignore=[
            ".git",
            ".venv*",
            "**/node_modules",
            "**/.next",
            "**/__pycache__",
            "frontend/public/data/geojson",
            "local_cache",
        ],
    )
)


def run_in_repo(command: list, log_path: str | None = None) -> int:
    """Run ``command`` in /repo, streaming output to the logs and, if given,
    to ``log_path`` on the Volume. PYTHONPATH is stripped so the container's
    site-packages, not a stray path, provide the packages."""
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    partial = os.devnull
    if log_path:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        partial = log_path + ".partial"
    with open(partial, "w") as log:
        log.write(f"# started {datetime.now(UTC).isoformat()}\n")
        log.write(f"# {' '.join(command)}\n")
        proc = subprocess.Popen(
            command,
            cwd="/repo",
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        for line in proc.stdout:
            print(line, end="")
            log.write(line)
        code = proc.wait()
        log.write(f"# exit={code}\n")
    if log_path:
        os.replace(partial, log_path)
        volume.commit()
    return code


@app.function(
    image=image, cpu=2, memory=16384, timeout=2 * 3600, volumes={RESULTS_DIR: volume}
)
def run_tests(args: str = "") -> int:
    """pytest -m slow (plus any extra arguments), logged to the Volume."""
    command = [
        sys.executable,
        "-m",
        "pytest",
        "tests",
        "-m",
        "slow",
        "-v",
        "-p",
        "no:cacheprovider",
        "--timeout=1800",
        "--durations=15",
        *args.split(),
    ]
    return run_in_repo(command, f"{RESULTS_DIR}/{LOG_PATH}")


@app.local_entrypoint()
def kickoff(args: str = ""):
    call = run_tests.spawn(args)
    print(
        f"Spawned {call.object_id}; read the log with: modal run scripts/modal_tests.py::results"
    )


@app.local_entrypoint()
def results():
    text = b"".join(volume.read_file(LOG_PATH)).decode()
    print(text[-8000:])
