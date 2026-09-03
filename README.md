# Partner Pipeline Financials

This dashboard reads from `data/pipeline.json`. Raw extracts live locally in `data/raw/` and are NEVER committed (enforced by `.gitignore` + a pre-commit hook). To refresh data, run `scripts/build_data.py` locally, then commit only the updated `pipeline.json`.

After cloning, install the pre-commit hook: `cp scripts/hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`
