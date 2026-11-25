# Root checks that need no toolchain; each subproject has its own gate, chosen by scripts/gates.py (gates.json).
.PHONY: validate
validate:
	python3 scripts/text_check.py .
	python3 scripts/issue_links.py .
	python3 scripts/sleep_guard.py .
	python3 scripts/dry_check.py --root .
