// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { isObject } from './json';
import { parseSchemaNodes } from './parseSchemaNodes';
import type { SchemaLayoutNode } from './types';

/**
 * Resolve the top-level components array from a stored template version. Backends differ in how
 * much of the Form.io document they keep, so both wrappers are accepted — docs/SPEC.md §1.
 */
function resolveRootComponents(schemaData: unknown): unknown[] | null {
  if (!isObject(schemaData)) return null;
  if (Array.isArray(schemaData.components)) return schemaData.components;
  const nested = schemaData.data;
  if (isObject(nested) && Array.isArray(nested.components)) return nested.components;
  return null;
}

/**
 * Depth-first search for the `components` of one tab. A `tabs` component nested inside a column
 * is normal in real templates, so both `components` and `columns[].components` are walked;
 * searching only `components` silently misses it. First match wins.
 */
function findTabComponents(components: unknown, tabKey: string): unknown[] | null {
  if (!Array.isArray(components)) return null;

  for (const component of components) {
    if (!isObject(component)) continue;

    if (component.type === 'tabs' && Array.isArray(component.components)) {
      for (const tab of component.components) {
        if (
          isObject(tab) &&
          tab.key === tabKey &&
          tab.mobileHidden !== true &&
          Array.isArray(tab.components)
        ) {
          return tab.components;
        }
      }
    }

    const fromChildren = findTabComponents(component.components, tabKey);
    if (fromChildren) return fromChildren;

    if (Array.isArray(component.columns)) {
      for (const col of component.columns) {
        if (!isObject(col)) continue;
        const fromColumn = findTabComponents(col.components, tabKey);
        if (fromColumn) return fromColumn;
      }
    }
  }

  return null;
}

/**
 * Build the layout tree for a single tab of a template-version schema.
 *
 * Returns `[]` when the schema is missing, malformed, or has no such tab. That is a supported
 * state, not an error: the host falls back to its own static layout, which is the right
 * behaviour both for "the schema has not synced yet" and for "the schema is broken".
 */
export function parseSchemaTabLayout(schemaData: unknown, tabKey: string): SchemaLayoutNode[] {
  const root = resolveRootComponents(schemaData);
  if (!root) return [];
  const tabComponents = findTabComponents(root, tabKey);
  return tabComponents ? parseSchemaNodes(tabComponents) : [];
}
