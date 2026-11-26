module.exports = {
  root: true,
  extends: '@react-native',
  // Pinned, so linting ../../packages/ui-kit (#93), which has no react of its own, needs no detection.
  settings: {react: {version: '19.0.0'}},
  // Lane worktrees (.claude/worktrees) and scratch work are checked in their own checkout.
  ignorePatterns: ['.claude/', '.scratch/', '.toolchain/', 'build/'],
  rules: {
    // No animation on e-ink (brief section 8.4, #80): each frame is a slow, visible refresh.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'react-native',
            importNames: ['Animated', 'LayoutAnimation', 'ActivityIndicator'],
            message: 'No animation on e-ink (brief section 8.4).',
          },
        ],
        // A deep React Native path's typings can name an export its file lacks (#405); ui-kit,
        // which this config lints, is where the one such import was.
        patterns: [{group: ['react-native/Libraries/*'], message: "Import from 'react-native', whose typings match its exports (#405)."}],
      },
    ],
  },
};
