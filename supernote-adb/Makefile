# The one task entry point: `make validate` is the gate before a commit, and CI runs the same target.
.PHONY: validate

validate:
	python3 scripts/text_check.py
	python3 scripts/dry_check.py
	bash scripts/run_suites.sh
