.PHONY: dev dev-frontend build test test-python test-slow lint format clean install
.PHONY: export preflight subsets pipeline pipeline-status pipeline-fetch top-tail poverty-flips
.PHONY: household-api example-households

# Python package: ballot_calc (registry, subsets, passes, reducers, outputs).
# Heavy compute runs on Modal; never run microsimulations locally.
PY := .venv/Scripts/python.exe
# The Modal CLI dies on a non-ASCII status glyph in a cp1252 console.
MODAL := PYTHONIOENCODING=utf-8 PYTHONUTF8=1 modal

# Port selection helper - finds the first available port in 4000-4100
define find_port
$(shell python -c "import socket, sys; \
[sys.exit(0) or print(p) for p in range(4000, 4101) \
if not (lambda s: s.bind(('', p)) or s.close())(socket.socket())] \
if 0 else (print('ERROR: no free port in 4000-4100', file=sys.stderr), sys.exit(1))" 2>nul || \
python -c "import socket; s=socket.socket(); s.bind(('',4000)); s.close(); print(4000)" 2>nul || echo 4000)
endef

install:
	cd frontend && npm install

dev: dev-frontend

dev-frontend:
	@cd frontend && set PORT=$(find_port) && npm run dev

build:
	cd frontend && npm run build

test:
	cd frontend && npm run test

# Fast Python tests (no policyengine import; seconds).
test-python:
	$(PY) -m pytest tests

# Slow household tests, on Modal.
test-slow:
	$(MODAL) run --detach scripts/modal_tests.py::kickoff

lint:
	cd frontend && npm run lint
	$(PY) -m ruff check ballot_calc scripts tests

format:
	$(PY) -m ruff format ballot_calc scripts tests

clean:
	cd frontend && if exist .next rmdir /s /q .next
	cd frontend && if exist node_modules rmdir /s /q node_modules

# Rewrite frontend/public/data/measures.json from the registry.
export:
	$(PY) -m ballot_calc.export

# One household per measure through the pipeline's policies (minutes).
preflight:
	$(MODAL) run scripts/modal_pipeline.py::preflight

# Build and SPM-clean the five state subsets (one 64 GB container).
subsets:
	$(MODAL) run --detach scripts/modal_pipeline.py::build

# Every measure-year: subsets, passes, reduce, CSVs + manifest on the
# results Volume. Detach-safe; cached passes are skipped. Rerun a subset
# with: modal run --detach scripts/modal_pipeline.py::kickoff --only co-prop-nn
pipeline:
	$(MODAL) run --detach scripts/modal_pipeline.py::kickoff

pipeline-status:
	$(MODAL) run scripts/modal_pipeline.py::status

# Verify pin, registry hash and completeness, then download into
# frontend/public/data/.
pipeline-fetch:
	$(MODAL) run scripts/modal_pipeline.py::fetch

# Print the IRS SOI top-income comparison the pipeline wrote (CO, CA, WA).
top-tail:
	PYTHONIOENCODING=utf-8 PYTHONUTF8=1 $(PY) scripts/diagnostics/tail_analysis.py

# Who crosses the poverty line in the top-income measures (Modal).
poverty-flips:
	$(MODAL) run scripts/diagnostics/poverty_flips.py

# Preview household endpoint (the production app is deployed by hand after
# the dashboard PR is approved; see scripts/modal_household_api.py).
household-api:
	$(MODAL) deploy --name bm26-household-preview scripts/modal_household_api.py

# Example households, computed on Modal.
example-households:
	$(MODAL) run scripts/compute_example_households.py
