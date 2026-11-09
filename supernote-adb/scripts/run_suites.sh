#!/bin/bash
#
# Run every tests/*.test.sh suite of a repository the way Skill Deck runs its own (#797).
#
#     scripts/run_suites.sh [ROOT]
#
# - A suite that prints `command not found` fails, even when it exits 0: an undefined helper skips
#   its check and the suite still reports a pass. This reads the suite's stderr rather than trapping
#   status 127, because macOS /bin/bash 3.2 has no `command_not_found_handle`.
# - GNU grep comes first on PATH when the machine has `ggrep` and its `grep` is another (macOS
#   ships BSD grep, some set-ups ugrep): `\t` in a basic pattern is a tab to ugrep and a `t` to
#   the GNU grep of an Ubuntu runner, so a suite could pass here and fail in CI. With no GNU grep it
#   says so.
# - VERBOSE is the one output switch: 1 (default) streams each suite, 0 prints only failures and
#   the summary. Any other value exits 2.
#
# Exit status: 0 when every suite passes, 1 when any fails or none exists, 2 on a usage error.
# Copy it unchanged to scripts/run_suites.sh; the `suite-runner` rule of
# check_repository_conventions.py reads the copy.

set -u

case "${VERBOSE:-1}" in
    0) verbose=0 ;;
    1) verbose=1 ;;
    *)
        printf "run_suites.sh: VERBOSE must be 0 or 1; got '%s'.\n" "$VERBOSE" >&2
        exit 2
        ;;
esac
if (( $# > 1 )); then
    printf 'usage: run_suites.sh [ROOT]\n' >&2
    exit 2
fi
root=${1:-.}
if [[ ! -d $root/tests ]]; then
    printf 'run_suites.sh: no tests/ folder under %s\n' "$root" >&2
    exit 2
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/run-suites.XXXXXX") || exit 1
trap 'rm -rf "$work"' EXIT
if command -v ggrep >/dev/null 2>&1 && ! grep --version 2>/dev/null | head -1 | grep -q 'GNU grep'; then
    mkdir "$work/bin" && ln -s "$(command -v ggrep)" "$work/bin/grep"
    PATH=$work/bin:$PATH
    export PATH
    (( verbose )) && printf 'Using GNU grep, as CI does.\n\n'
elif ! grep --version 2>/dev/null | head -1 | grep -q 'GNU grep'; then
    printf 'Warning: no GNU grep (ggrep) here; a grep pattern escape may behave differently in CI.\n\n' >&2
fi

shopt -s nullglob
suites=("$root"/tests/*.test.sh)
if (( ${#suites[@]} == 0 )); then
    printf 'run_suites.sh: no tests/*.test.sh suite under %s\n' "$root" >&2
    exit 1
fi

passed=0
failed=0
for suite in "${suites[@]}"; do
    label=${suite#"$root"/}
    (( verbose )) && printf 'Running %s\n' "$label"
    if (( verbose )); then
        { VERBOSE=1 bash "$suite" 2>&1 1>&3 3>&- | tee "$work/stderr" >&2; } 3>&1
        status=${PIPESTATUS[0]}
    else
        VERBOSE=0 bash "$suite" >"$work/stdout" 2>"$work/stderr"
        status=$?
    fi
    unknown=$(grep 'command not found' "$work/stderr")
    if [[ -n $unknown ]]; then
        printf 'Suite called an unknown command: %s\n%s\n' "$label" "$unknown" >&2
        status=1
    fi
    if (( status == 0 )); then
        passed=$((passed + 1))
    else
        failed=$((failed + 1))
        if (( ! verbose )); then
            printf 'Failed suite: %s\n' "$label" >&2
            tail -20 "$work/stdout" "$work/stderr" >&2
        fi
    fi
    (( verbose )) && printf '\n'
done

printf '%d suites passed, %d failed\n' "$passed" "$failed"
(( failed == 0 ))
