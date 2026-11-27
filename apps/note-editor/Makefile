# Task entry points of Note Editor, the shared targets of the owner's Swift apps
# (bench-project-standards swift-apps.md, Make targets). `make check` is the gate before every commit
# and the Validate workflow's job; the app has no public distribution, so no dmg, keys or appcast.

.DEFAULT_GOAL := help

.PHONY: help build test lint format validate check app icon strings renders clean

CONFIGURATION ?= debug
# NoteFormat/, the reader package, is linted with the app; its nested .swiftlint.yml adds its own rules.
SWIFT_SOURCES ?= Sources Tests NoteFormat
# Spotlight skips a *.noindex folder (workbench#1517); every SwiftPM call and script uses it.
SWIFT_SCRATCH ?= .build.noindex
# Icon Composer's renderer, run from its real path: it finds icrtool beside itself.
ICTOOL ?= $(shell xcode-select -p)/../Applications/Icon Composer.app/Contents/Executables/ictool

# A stable signature when this Mac has one (swift-apps.md, Local signing): the untracked .env, else
# the main checkout's, for a worktree. Make keeps a quoted value's quotes, so they are removed.
-include .env
ifeq ($(LOCAL_SIGNING_IDENTITY)$(DEVELOPER_ID_IDENTITY),)
-include $(shell git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/../apps/note-editor/.env
endif
export
LOCAL_SIGNING_IDENTITY := $(subst ",,$(LOCAL_SIGNING_IDENTITY))
DEVELOPER_ID_IDENTITY := $(subst ",,$(DEVELOPER_ID_IDENTITY))

FORCE ?=
FORCE_FLAG = $(if $(filter 1,$(FORCE)),--force,)

help: ## List the targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  make %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build (CONFIGURATION=debug|release); fails on any warning in a project file
	@scripts/fail-on-warnings.sh -- swift build -c $(CONFIGURATION) --scratch-path $(SWIFT_SCRATCH)

test: ## Swift Testing suites; fail on any warning
	@scripts/fail-on-warnings.sh -- swift test --scratch-path $(SWIFT_SCRATCH)

lint: ## SwiftLint, then swift-format lint; read-only, fails on any finding
	@swiftlint lint --strict --quiet $(SWIFT_SOURCES)
	@swift format lint --strict --recursive $(SWIFT_SOURCES)

format: ## Rewrite the sources with swift-format (the only target that edits sources)
	@swift format format --in-place --recursive $(SWIFT_SOURCES)

validate: ## Repository invariants (scripts/validate.sh); no compiler, seconds
	@scripts/validate.sh

check: build lint test validate ## Everything a commit needs, stopping at the first failure

app: ## build/Note Editor.app, signed with the identity in .env, else ad-hoc (FORCE=1 replaces)
	@scripts/package-app.sh $(FORCE_FLAG)

icon: ## Render the app icon's four appearances to build/icon to check them by eye
	@mkdir -p build/icon
	@for r in Default Dark ClearLight TintedDark; do \
		"$(ICTOOL)" "$(CURDIR)/Support/AppIcon.icon" --export-image --output-file "$(CURDIR)/build/icon/$$r.png" \
			--platform macOS --rendition $$r --width 512 --height 512 --scale 1 \
			--tint-color 0.25 --tint-strength 0.75 >/dev/null; done
	@echo "Wrote build/icon/{Default,Dark,ClearLight,TintedDark}.png"

strings: ## Refresh Support/Localizable.xcstrings from the String(localized:) calls
	@scripts/strings.sh

renders: ## Every window state, light and dark, at three sizes, off screen, into $RENDER_EVIDENCE
	@test -n "$(RENDER_EVIDENCE)" || { echo "error: set RENDER_EVIDENCE to the folder for the renders" >&2; exit 2; }
	@mkdir -p "$(RENDER_EVIDENCE)"
	@swift test --scratch-path $(SWIFT_SCRATCH) --filter RenderTests

clean: ## Remove the build output
	@rm -rf $(SWIFT_SCRATCH) .build build artifacts
