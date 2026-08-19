// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The suite runs in Node, not on a device.
 *
 * `react-native` ships untranspiled Flow, so it is aliased to a small mock that renders host
 * elements a test renderer can inspect. That keeps the suite fast and deterministic, and it is
 * enough because the renderer only ever composes `View`, `Text` and `Image` — the real package
 * is still what the sources are typechecked against.
 */
export default defineConfig({
  resolve: {
    alias: {
      'react-native': fileURLToPath(new URL('./test/mocks/react-native.tsx', import.meta.url)),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
