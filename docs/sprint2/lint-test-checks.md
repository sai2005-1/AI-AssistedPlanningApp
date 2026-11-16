# Lint and test-file checks

Source baseline: `e26a64a651067d6e3732c84b3120c7a84207a869`.
Task: T25, with user-authorized test isolation verification. November 16, 2026.

- `pnpm lint`: ESLint recommended JavaScript/TypeScript checks, zero warnings.
- `pnpm format:check`: formatting for application frontend/library TypeScript and check configuration.
- `pnpm test:isolation`: checks imports and direct test declarations in implementation files; 11 dedicated test files, no embedded tests. This is a static convention check, not proof against every possible alias or dynamic test declaration.
- `pnpm test`: 220 passed, 5 expected failures, 3 skipped; two emulator-dependent files skipped. No live Firebase verification is claimed.
- `pnpm exec tsc --noEmit --incremental false`: passed.
- `git diff --check`: passed.

The test runner now explicitly uses UTC, as requested by the existing recurrence fixtures. This makes the normal test command reproducible; it does not fix or prove timezone/DST behavior in the calendar parser. Existing expected-failure cases remain visible.

Replaced the unsupported legacy ESLint JSON config with flat configuration and installed its TypeScript parser/plugin dependencies. Removed one unused import. Updated oxfmt from 0.2 to 0.78 after the old version removed required TypeScript separators; that invalid output was reverted. Formatted app-owned TypeScript using explicit project formatting preferences. No managed Payload route, schema, environment, or application authentication behavior changed. Team review and production verification remain outstanding; no build, deployment, or Figma review is claimed.
