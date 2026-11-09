#!/usr/bin/env bash
# Builds the two single-file HTML pages in dist/ from src/.
set -euo pipefail
cd "$(dirname "$0")"
python3 src/build.py assets/sample_doc_pages src/core_template.html dist/gripspread_core.html
python3 src/build_experiment.py src/experiment_template.html src/engine.js dist/gripspread_experiment.html
python3 src/inject_calib.py dist/gripspread_experiment.html
python3 src/build_experiment.py src/tuning_template.html src/engine.js dist/gripspread_tuning.html
cp src/imu_calib.html dist/gripspread_imu_calib.html
cp src/analysis.html dist/gripspread_analysis.html
cp src/index.html dist/index.html
cp src/admin.html dist/gripspread_admin.html
python3 src/inject_server.py dist/gripspread_experiment.html dist/gripspread_tuning.html dist/gripspread_imu_calib.html dist/gripspread_analysis.html dist/gripspread_admin.html
# demo data for the analysis page's "데모" button (invented participants, fixed seed)
rm -rf dist/demo && python3 analysis/make_fake_data.py dist/demo 12 >/dev/null && python3 -c "import os,json; json.dump(sorted(x for x in os.listdir('dist/demo') if x.endswith('.zip')), open('dist/demo/index.json','w'))"
