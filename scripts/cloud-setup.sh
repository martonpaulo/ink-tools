#!/usr/bin/env bash
# Cloud session setup for ink-tools. Runs once at the start of a cloud backlog run.
# Each subproject installs its own dependencies on demand; nothing global is needed here.
set -euo pipefail
echo "ink-tools: no global setup required; subprojects install their own toolchains."
