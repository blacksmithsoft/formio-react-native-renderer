// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { computeWindow } from '../../src/form/windowedRows';

describe('computeWindow', () => {
  const height = () => 40;

  it('returns an empty slice for no rows', () => {
    expect(computeWindow(0, 0, height, 0, 200)).toEqual({
      start: 0,
      end: 0,
      topSpacer: 0,
      bottomSpacer: 0,
    });
  });

  it('keeps the first rows when the table sits at the top of the page', () => {
    const window = computeWindow(20, 0, height, 0, 120, 1);
    expect(window.start).toBe(0);
    expect(window.end).toBeGreaterThan(0);
    expect(window.end).toBeLessThan(20);
    expect(window.topSpacer).toBe(0);
    expect(window.bottomSpacer).toBe((20 - window.end) * 40);
  });

  it('skips rows that sit above the visible window', () => {
    const window = computeWindow(20, 0, height, 400, 120, 1);
    expect(window.start).toBeGreaterThan(0);
    expect(window.topSpacer).toBe(window.start * 40);
    expect(window.end).toBeGreaterThan(window.start);
  });
});
