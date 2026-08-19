// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Conditional visibility — docs/FORMS.md §3.
 *
 * Two declarative forms, and only two. Custom JavaScript is never interpreted: it is caught at
 * parse time and reported as an issue, because evaluating arbitrary code from a schema is a
 * security decision rather than a feature, and Hermes disables the tools for it anyway.
 *
 * Pure. Imports nothing from React or React Native.
 */

import { apply, truthy } from './jsonLogic';
import { getAtPath } from './dataPaths';
import type { ConditionalRule, FormComponent } from './types';

/**
 * The data a conditional is evaluated against.
 *
 * `row` exists because Form.io evaluates a conditional inside a datagrid against that row first
 * and the whole submission second. Without it, a rule like "show Notes when Status is Failed"
 * would read the first row's status for every row.
 */
export interface ConditionalScope {
  root: Record<string, unknown>;
  row?: Record<string, unknown>;
}

/** Row scope wins, then the submission root. Matches Form.io's contextual data resolution. */
function resolve(scope: ConditionalScope, key: string): unknown {
  if (scope.row) {
    const fromRow = getAtPath(scope.row, key);
    if (fromRow !== undefined) return fromRow;
  }
  return getAtPath(scope.root, key);
}

/**
 * Compare a stored value against the `eq` of a simple conditional.
 *
 * Three shapes, because three components store their answer differently and the author sees one
 * dropdown for all of them:
 *
 * - a `selectboxes` map is checked for `eq` being ticked;
 * - an array (a `multiple` field, or tags) is checked for `eq` being present;
 * - everything else is compared as a string, which is what makes `"true"` match `true` and
 *   `"3"` match `3`. Form.io's builder writes `eq` as text whatever the field's real type is.
 */
function matches(value: unknown, eq: string): boolean {
  if (Array.isArray(value)) return value.some((entry) => String(entry) === eq);
  if (value !== null && typeof value === 'object') {
    return (value as Record<string, unknown>)[eq] === true;
  }
  if (value === undefined || value === null) return eq === '';
  return String(value) === eq;
}

/**
 * Whether a rule shows its component. `undefined` means no rule, which is always visible.
 *
 * Never throws. A malformed rule resolves to visible: a component nobody can see is a worse
 * failure than one that should have been hidden, because the user can at least ignore the
 * second.
 */
export function evaluateConditional(
  rule: ConditionalRule | undefined,
  scope: ConditionalScope
): boolean {
  if (!rule) return true;

  if (rule.kind === 'json') {
    const result = apply(rule.logic, scope.row ? { ...scope.root, ...scope.row } : scope.root);
    // A rule that evaluates to null could not be resolved — treat it as "no opinion".
    return result === null || result === undefined ? true : truthy(result);
  }

  const hit = matches(resolve(scope, rule.when), rule.eq);
  return rule.show ? hit : !hit;
}

/**
 * Whether a component is drawn and validated at all.
 *
 * `hidden` in the schema is not the same thing as hidden by a conditional. A hidden component
 * keeps its value and its default — it is how a form stamps a constant the server requires — so
 * it is invisible but still submitted. A conditionally hidden component is genuinely absent, and
 * §5 of the spec turns on that distinction: hidden components are not validated.
 */
export function isConditionallyVisible(
  component: FormComponent,
  scope: ConditionalScope
): boolean {
  return evaluateConditional(component.conditional, scope);
}
