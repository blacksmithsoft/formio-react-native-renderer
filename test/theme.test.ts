// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { defaultFormioTheme } from '../src/index';
import { mergeTheme } from '../src/theme/mergeTheme';

/** The token contract in docs/THEMING.md, and the merge behaviour a host depends on. */

const { colors, metrics, icons } = defaultFormioTheme;

function everyColor(): [string, string][] {
  return Object.entries(colors).flatMap(([group, tokens]) =>
    Object.entries(tokens as Record<string, string>).map(
      ([name, value]): [string, string] => [`${group}.${name}`, value]
    )
  );
}

describe('default theme', () => {
  it('is fully opaque throughout', () => {
    // Translucent colours composite differently across platforms and would break golden-image
    // comparison for no benefit.
    for (const [token, value] of everyColor()) {
      expect(value, token).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('pins the values other implementations are matched against', () => {
    expect(metrics.grid).toEqual({ columns: 12, gutter: 12, breakpoint: 1024 });
    expect(metrics.control.minHeight).toBe(38);
    expect(metrics.control.textareaMinHeight).toBe(84);
    expect(colors.misc.signaturePad).toBe('#F5F5EB');
  });

  it('keeps the derived metrics consistent', () => {
    // Documented as "control.padY plus one dp", held as a token so the two platforms round the
    // same way rather than each computing it.
    expect(metrics.label.baselineOffset).toBe(metrics.control.padY + 1);
    // A larger container radius is what keeps a control's corner from merging into the panel's.
    expect(metrics.panel.radius).toBeGreaterThan(metrics.control.radius);
  });

  it('fills all four icon slots without an icon library', () => {
    expect(Object.keys(icons).sort()).toEqual(['calendar', 'check', 'chevronDown', 'clock']);
  });
});

describe('mergeTheme', () => {
  it('keeps the tokens a host did not mention', () => {
    const merged = mergeTheme(defaultFormioTheme, {
      colors: { brand: { primary: '#123456' } },
      metrics: { grid: { breakpoint: 700 } },
    });

    expect(merged.colors.brand.primary).toBe('#123456');
    expect(merged.colors.text.primary).toBe(colors.text.primary);
    expect(merged.metrics.grid.breakpoint).toBe(700);
    expect(merged.metrics.grid.columns).toBe(metrics.grid.columns);
    expect(merged.icons.check).toBe(icons.check);
  });

  it('leaves the defaults untouched', () => {
    mergeTheme(defaultFormioTheme, { colors: { surface: { card: '#000000' } } });
    expect(defaultFormioTheme.colors.surface.card).toBe('#FFFFFF');
  });

  it('ignores a missing or malformed override', () => {
    expect(mergeTheme(defaultFormioTheme, undefined)).toBe(defaultFormioTheme);
    expect(mergeTheme(defaultFormioTheme, {}).colors).toEqual(colors);
  });
});
