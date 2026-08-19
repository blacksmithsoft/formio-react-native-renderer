// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import type { FormioTheme, PartialFormioTheme } from './FormioTheme';

/**
 * Merge a host's partial theme over a base. Two levels deep, which is exactly the depth of the
 * token contract: a host overriding two colours keeps the other twelve.
 */

function mergeGroups<T extends object>(base: T, override: unknown): T {
  if (typeof override !== 'object' || override === null) return base;
  const merged = { ...base } as Record<string, unknown>;
  for (const [name, group] of Object.entries(override as Record<string, unknown>)) {
    if (typeof group !== 'object' || group === null) continue;
    merged[name] = { ...(merged[name] as object), ...group };
  }
  return merged as T;
}

export function mergeTheme(base: FormioTheme, override?: PartialFormioTheme): FormioTheme {
  if (!override) return base;
  return {
    colors: mergeGroups(base.colors, override.colors),
    metrics: mergeGroups(base.metrics, override.metrics),
    icons: { ...base.icons, ...override.icons },
  };
}
