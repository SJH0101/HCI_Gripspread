#!/usr/bin/env bash
# Builds the two single-file HTML pages in dist/ from src/.
set -euo pipefail
cd "$(dirname "$0")"
python3 src/build.py assets/sample_doc_pages src/core_template.html dist/gripspread_core.html
python3 src/build_experiment.py src/experiment_template.html src/engine.js dist/gripspread_experiment.html
python3 src/inject_calib.py dist/gripspread_experiment.html
python3 src/build_experiment.py src/pilot_template.html src/engine.js dist/gripspread_pilot.html
cp src/imu_calib.html dist/gripspread_imu_calib.html
cp src/analysis.html dist/gripspread_analysis.html
