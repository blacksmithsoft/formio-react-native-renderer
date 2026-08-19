// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Walking a form against its data — docs/FORMS.md §2.
 *
 * The tree and the submission are different shapes: one datagrid component describes any number
 * of rows, and each row gives its children different paths and a different conditional scope. So
 * every traversal in the engine happens *against data*, not against the schema alone, and this
 * file is the single place that expansion is implemented.
 *
 * Pure. Imports nothing from React or React Native.
 */

import { evaluateConditional, type ConditionalScope } from './conditionals';
import { getAtPath, indexPath, joinPath } from './dataPaths';
import type { FormComponent } from './types';

export interface ComponentInstance {
  component: FormComponent;
  /** Absolute data path. Empty for components that hold no value. */
  path: string;
  /** The scope its conditional was evaluated in — the row, when it sits inside a grid. */
  scope: ConditionalScope;
  /**
   * Visible to the user *and* to validation: its own conditional passes and so does every
   * ancestor's. Schema-level `hidden` does not clear this flag — a hidden field still holds and
   * submits its value, it simply is not drawn.
   */
  visible: boolean;
  /** The enclosing grid row, when there is one. `-1` otherwise. */
  rowIndex: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function childGroups(component: FormComponent): FormComponent[][] {
  const groups: FormComponent[][] = [];
  if (component.children.length > 0) groups.push(component.children);
  for (const column of component.columns ?? []) groups.push(column.children);
  for (const tab of component.tabs ?? []) groups.push(tab.children);
  for (const row of component.tableRows ?? []) {
    for (const cell of row) groups.push(cell.children);
  }
  return groups;
}

/**
 * Visit every component instance in document order, expanding grid rows.
 *
 * `visit` is called for the parent before its children, so a caller can stop descending by
 * reading `visible` — which is what validation does, since a hidden branch is not validated.
 */
export function forEachInstance(
  components: FormComponent[],
  data: Record<string, unknown>,
  visit: (instance: ComponentInstance) => void,
  context: { parentPath?: string; row?: Record<string, unknown>; visible?: boolean; rowIndex?: number } = {}
): void {
  const parentPath = context.parentPath ?? '';
  const parentVisible = context.visible ?? true;
  const rowIndex = context.rowIndex ?? -1;
  const scope: ConditionalScope = context.row ? { root: data, row: context.row } : { root: data };

  for (const component of components) {
    const path = component.input ? joinPath(parentPath, component.key) : parentPath;
    const visible = parentVisible && evaluateConditional(component.conditional, scope);

    visit({ component, path, scope, visible, rowIndex });

    if (component.role === 'grid') {
      const rows = getAtPath(data, path);
      if (!Array.isArray(rows)) continue;
      for (let index = 0; index < rows.length; index += 1) {
        forEachInstance(component.children, data, visit, {
          parentPath: indexPath(path, index),
          row: asRecord(rows[index]),
          visible,
          rowIndex: index,
        });
      }
      continue;
    }

    for (const group of childGroups(component)) {
      forEachInstance(group, data, visit, {
        parentPath: path,
        row: context.row,
        visible,
        rowIndex,
      });
    }
  }
}

/**
 * The subset of the tree a conditional leaves visible, as a tree.
 *
 * Grid rows are not expanded here: the renderer expands them itself, because it needs the row
 * index for keys and for the remove button. This is the shape callers mean by
 * "the schema after conditional evaluation".
 */
export function visibleComponents(
  components: FormComponent[],
  data: Record<string, unknown>,
  context: { parentPath?: string; row?: Record<string, unknown> } = {}
): FormComponent[] {
  const parentPath = context.parentPath ?? '';
  const scope: ConditionalScope = context.row ? { root: data, row: context.row } : { root: data };
  const out: FormComponent[] = [];

  for (const component of components) {
    if (!evaluateConditional(component.conditional, scope)) continue;
    if (component.hidden) continue;

    const path = component.input ? joinPath(parentPath, component.key) : parentPath;
    const childContext = { parentPath: path, row: context.row };

    out.push({
      ...component,
      children:
        component.role === 'grid'
          ? component.children
          : visibleComponents(component.children, data, childContext),
      columns: component.columns?.map((column) => ({
        ...column,
        children: visibleComponents(column.children, data, childContext),
      })),
      tabs: component.tabs?.map((tab) => ({
        ...tab,
        children: visibleComponents(tab.children, data, childContext),
      })),
      tableRows: component.tableRows?.map((row) =>
        row.map((cell) => ({ children: visibleComponents(cell.children, data, childContext) }))
      ),
    });
  }

  return out;
}
