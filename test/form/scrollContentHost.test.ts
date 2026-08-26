// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { scrollContentHost } from '../../src/form/context';

describe('scrollContentHost', () => {
  const inner = { kind: 'inner' };

  it('returns null when there is no scroller', () => {
    expect(scrollContentHost(null)).toBeNull();
    expect(scrollContentHost(undefined)).toBeNull();
    expect(scrollContentHost({})).toBeNull();
  });

  it('prefers getInnerViewRef over Paper numeric tags', () => {
    expect(
      scrollContentHost({
        getInnerViewRef: () => inner,
        getInnerViewNode: () => 1,
        getScrollableNode: () => 2,
      })
    ).toBe(inner);
  });

  it('skips numeric tags so Fabric measureLayout is never handed one', () => {
    expect(
      scrollContentHost({
        getInnerViewNode: () => 1,
        getScrollableNode: () => 2,
      })
    ).toBeNull();
  });

  it('falls through to the first object among the Paper names', () => {
    expect(scrollContentHost({ getInnerViewNode: () => inner })).toBe(inner);
    expect(scrollContentHost({ getScrollableNode: () => inner })).toBe(inner);
  });
});
