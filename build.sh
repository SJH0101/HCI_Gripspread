#!/usr/bin/env bash
# Builds the two single-file HTML pages in dist/ from src/.
set -euo pipefail
cd "$(dirname "$0")"
python3 src/build.py assets/sample_doc_pages src/core_template.html dist/gripspread_core.html
python3 src/build_experiment.py src/experiment_template.html src/engine.js dist/gripspread_experiment.html
