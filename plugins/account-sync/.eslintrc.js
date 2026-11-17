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
      },
    ],
  },
};
