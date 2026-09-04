// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { baseFieldType } from './baseFieldType';
import { asString, isObject, toPositiveInt, type JsonObject } from './json';
import { toField } from './toField';
import type { SchemaColumn, SchemaLayoutNode } from './types';

/**
 * Components that carry no read-only value of their own: containers that own their children's
 * rendering, data components the host draws itself, and value-less chrome.
 *
 * This is a denylist, not an allowlist. Anything not listed here (and not a layout container)
 * becomes a field, so a type the backend adds later degrades to label + value instead of
 * silently disappearing — see docs/ARCHITECTURE.md.
 *
 * Matched on the base type, so `custom_file` and `custom_editgrid` are excluded too. Matching the
 * raw type, with an explicit `custom_datagrid` entry, is SPEC.md §9 gap 2.
 */
const NON_FIELD_TYPES = new Set([
  'tabs',
  'table',
  'container',
  'form',
  'datagrid',
  'editgrid',
  'datamap',
  'tree',
  'button',
  'file',
  'content',
  'htmlelement',
  'hidden',
  'reviewpage',
]);

function toColumns(component: JsonObject, key: string): SchemaLayoutNode {
  const raw = Array.isArray(component.columns) ? component.columns : [];
  const columns: SchemaColumn[] = raw.filter(isObject).map((col) => ({
    // Form.io defaults an unset span to 6 — half a row.
    width: toPositiveInt(col.width) ?? 6,
    offset: toPositiveInt(col.offset) ?? 0,
    children: parseSchemaNodes(col.components),
  }));
  return { kind: 'columns', key, columns };
}

/**
 * Convert a Form.io `components` array into layout nodes: containers recursed, order preserved.
 *
 * Never throws. Anything that is not an array of objects degrades to the closest well-formed
 * subtree — docs/SPEC.md §1 and §3.
 */
export function parseSchemaNodes(components: unknown): SchemaLayoutNode[] {
  if (!Array.isArray(components)) return [];
  const nodes: SchemaLayoutNode[] = [];

  for (const component of components) {
    if (!isObject(component)) continue;
    if (component.hidden === true || component.mobileHidden === true) continue;
    const type = asString(component.type);
    const key = asString(component.key, type);

    const base = baseFieldType(type);
    if (base === 'panel' || base === 'fieldset' || base === 'well') {
      nodes.push({
        kind: 'panel',
        key,
        title: asString(component.title) || asString(component.legend) || asString(component.label),
        collapsible: component.collapsible === true,
        children: parseSchemaNodes(component.components),
      });
      continue;
    }

    if (type === 'columns') {
      nodes.push(toColumns(component, key));
      continue;
    }

    // A bare container (an unnamed group in the builder) contributes no chrome of its own —
    // flatten its children so they lay out as siblings.
    if (!type && Array.isArray(component.components)) {
      nodes.push(...parseSchemaNodes(component.components));
      continue;
    }

    if (NON_FIELD_TYPES.has(base)) {
      nodes.push({ kind: 'unsupported', key, type, label: asString(component.label, key) });
      continue;
    }

    nodes.push({ kind: 'field', field: toField(component, key) });
  }

  return nodes;
}
