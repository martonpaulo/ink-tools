/** Plugin Diagnostics' own strings, English only (#257); the shared ones come from ui-kit. */
const REBUILD_STEPS = [
  'On the Mac, build and install Probe from main with «python3 scripts/device_build.py plugins/plugin-diagnostics --install», which adds the native step (#310).',
  'Run the probe again.',
];

export const copy = {
  title: 'Plugin Diagnostics',
  run: 'Run Probe',
  hint: 'Runs the probe in src/probe.ts. Each line also goes to logcat under SNPROBE.',
  failed: 'The probe failed',
  /** The code block's spoken name (#405). */
  output: 'Probe output',
  'needs.native': {
    what: 'The native module ProbeProviders is missing',
    reason: 'This build has no native step, so the probe cannot read the Digest provider.',
    steps: REBUILD_STEPS,
  },
  'needs.listener': {
    what: 'The native module ProbeProviders has no listener',
    reason: 'This build has no native step, so the probe cannot open a listener.',
    steps: REBUILD_STEPS,
  },
} as const satisfies Record<string, unknown>;
