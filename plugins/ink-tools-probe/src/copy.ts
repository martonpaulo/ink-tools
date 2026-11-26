/** Ink Tools Probe's own strings, English only (#257); the shared ones come from ui-kit. */
const REBUILD_STEPS = [
  'On the Mac, run the command below. It builds Ink Tools Probe with the native step and installs it on the tablet.',
  'Then run the probe again.',
];
/** The one command the rebuild steps name, shown in ui-kit's code block (#405). */
const REBUILD_COMMAND = 'python3 scripts/device_build.py plugins/ink-tools-probe --install';

export const copy = {
  title: 'Ink Tools Probe',
  run: 'Run Probe',
  hint: 'Runs the probe in src/probe.ts. Each line also goes to logcat under SNPROBE.',
  failed: 'The probe failed',
  /** The code block's spoken name (#405). */
  output: 'Probe output',
  /** A finished probe that printed nothing. */
  noLines: 'The probe printed no lines.',
  'needs.native': {
    what: 'The native module ProbeProviders is missing',
    reason: 'This build has no native step, so the probe cannot read the Digest provider.',
    steps: REBUILD_STEPS,
    command: REBUILD_COMMAND,
  },
  'needs.listener': {
    what: 'The native module ProbeProviders has no listener',
    reason: 'This build has no native step, so the probe cannot open a listener.',
    steps: REBUILD_STEPS,
    command: REBUILD_COMMAND,
  },
} as const satisfies Record<string, unknown>;
