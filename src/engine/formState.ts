// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The reconciliation rules that turn a form plus a submission into the next submission —
 * docs/FORMS.md §5.
 *
 * Defaults, calculated values, `clearOnHide` and validation are all expressed here as pure
 * functions over `(form, data)`. The React hook in `useFormioForm.ts` is a thin wrapper around
 * them, which is what lets the sync layer re-validate a queued submission days later, on a
 * background task, with no renderer in sight.
 *
 * Pure. Imports nothing from React or React Native.
 */

import { evaluateCalculate } from './calculateValue';
import { getAtPath, hasAtPath, setAtPath, unsetAtPath } from './dataPaths';
import { forEachInstance } from './traverse';
import type { FormComponent, FormDefinition } from './types';

import { validateComponent } from './validation';

export type SubmissionData = Record<string, unknown>;
export type FormErrors = Record<string, string[]>;

/**
 * Cap on the reconcile fixed point.
 *
 * Defaults, calculations and `clearOnHide` feed each other: clearing a hidden field can change a
 * conditional, which can hide another field. Real schemas settle in one or two passes. The cap
 * exists so that a schema whose rules oscillate — A hides B, B shows A — degrades to a stable
 * arbitrary choice instead of hanging the UI thread, which is the one outcome a field app cannot
 * afford.
 */
const MAX_PASSES = 8;

function asRecord(value: unknown): SubmissionData {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as SubmissionData)
    : {};
}

/**
 * The value a component starts at.
 *
 * A checkbox and a selectboxes group need a concrete empty value rather than `undefined`,
 * because `undefined` renders as an indeterminate control and serialises to a key the server
 * never receives.
 */
export function initialValueFor(component: FormComponent): unknown {
  if (component.defaultValue !== undefined) return component.defaultValue;

  if (component.role === 'grid') {
    return component.grid?.initEmpty ? [] : [emptyRow(component)];
  }
  if (component.role === 'datamap') return {};
  if (component.role === 'tree') return emptyTreeNode(component);
  if (component.role === 'container') return {};
  if (component.multiple) return [];

  switch (component.base) {
    case 'checkbox':
      return false;
    case 'selectboxes':
      return Object.fromEntries((component.field.options ?? []).map((option) => [option.value, false]));
    case 'survey':
      return {};
    case 'file':
      return [];
    default:
      return undefined;
  }
}

/** A fresh grid row, with every child at its own initial value. */
export function emptyRow(grid: FormComponent): SubmissionData {
  const row: SubmissionData = {};
  const fill = (components: FormComponent[]): void => {
    for (const child of components) {
      if (child.input && child.key) {
        const value = initialValueFor(child);
        if (value !== undefined) row[child.key] = value;
      }
      if (child.role === 'grid' || child.role === 'datamap' || child.role === 'tree') continue;
      fill(child.children);
      for (const column of child.columns ?? []) fill(column.children);
      for (const tab of child.tabs ?? []) fill(tab.children);
      for (const tableRow of child.tableRows ?? []) {
        for (const cell of tableRow) fill(cell.children);
      }
    }
  };
  fill(grid.children);
  return row;
}

/** A fresh Form.io tree node: field defaults under `data`, no children. */
export function emptyTreeNode(tree: FormComponent): { data: SubmissionData; children: [] } {
  return { data: emptyRow(tree), children: [] };
}

/**
 * Seed every absent value from its default.
 *
 * Only absent ones: a value already in the submission is the user's, or the server's, and either
 * outranks a default. Run on load and on reset, never on change.
 */
export function applyDefaults(form: FormDefinition, data: SubmissionData): SubmissionData {
  let next = data;
  forEachInstance(form.components, next, (instance) => {
    const { component, path } = instance;
    if (!component.input || !path) return;
    if (hasAtPath(next, path)) return;
    const value = initialValueFor(component);
    if (value === undefined) return;
    next = setAtPath(next, path, value);
  });
  return next;
}

/**
 * Recompute calculated components.
 *
 * JSON Logic and the two compiled JavaScript shapes (`rowIndex + n`, a quoted list) are applied
 * here. Unrecognised JavaScript never reaches this function — it is recorded as an issue at parse
 * time. `allowCalculateOverride` means the user's edit wins once they have made one, so the
 * caller passes the set of paths the user has touched.
 */
export function applyCalculations(
  form: FormDefinition,
  data: SubmissionData,
  touched: ReadonlySet<string>
): SubmissionData {
  let next = data;
  forEachInstance(form.components, next, (instance) => {
    const { component, path, scope, visible, rowIndex } = instance;
    if (!component.calculate || !component.input || !path || !visible) return;
    if (component.calculateOverride && touched.has(path)) return;

    const context = scope.row ? { ...scope.root, ...scope.row } : scope.root;
    const value = evaluateCalculate(component.calculate, rowIndex, context);
    if (value === null || value === undefined) return;
    if (Object.is(getAtPath(next, path), value)) return;
    next = setAtPath(next, path, value);
  });
  return next;
}

/** Paths whose value must be removed because a conditional hid the component that owns it. */
function hiddenDataPaths(form: FormDefinition, data: SubmissionData): string[] {
  const paths: string[] = [];
  forEachInstance(form.components, data, ({ component, path, visible }) => {
    if (visible || !component.input || !path) return;
    if (!component.clearOnHide) return;
    if (!hasAtPath(data, path)) return;
    paths.push(path);
  });

  // A hidden container clears as one value. Dropping its descendants keeps a later unset from
  // walking into a branch that no longer exists, and keeps grid-row splicing from renumbering
  // paths mid-pass.
  return paths.filter(
    (path) => !paths.some((other) => other !== path && path.startsWith(`${other}.`) || (other !== path && path.startsWith(`${other}[`)))
  );
}

/**
 * Remove the values of conditionally hidden components — docs/FORMS.md §5.
 *
 * Form.io defaults `clearOnHide` to `true`, and matching it is not cosmetic: the server expects
 * a hidden field to be absent, and a submission that carries data for one is rejected. This is
 * the single most common cause of a form that validates on device and fails at sync.
 */
export function applyClearOnHide(form: FormDefinition, data: SubmissionData): SubmissionData {
  let next = data;
  for (const path of hiddenDataPaths(form, next)) {
    next = unsetAtPath(next, path);
  }
  return next;
}

/**
 * Bring a submission into agreement with its form: calculations, then `clearOnHide`, until
 * nothing changes.
 *
 * Identity comparison is the loop's exit condition, which is why every write in `dataPaths` is
 * immutable and returns the original object when it changes nothing.
 */
export function reconcile(
  form: FormDefinition,
  data: SubmissionData,
  touched: ReadonlySet<string> = new Set()
): SubmissionData {
  let next = data;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const calculated = applyCalculations(form, next, touched);
    const cleared = applyClearOnHide(form, calculated);
    if (cleared === next) return next;
    next = cleared;
  }
  return next;
}

export interface ValidationResult {
  errors: FormErrors;
  /**
   * Whether the form may be submitted at all, separately from whether the answers are valid.
   * An `error`-severity component issue sets this to `false` no matter what the user types:
   * partial data on a field they could not see is worse than no submission — docs/FORMS.md §6.
   */
  blocked: boolean;
  blockingIssues: FormDefinition['issues'];
}

/**
 * Validate a whole submission.
 *
 * Only visible components are checked. That is how Form.io expresses conditional requiredness,
 * and diverging from it produces forms nobody can submit.
 */
export function validateForm(form: FormDefinition, data: SubmissionData): ValidationResult {
  const blockingIssues = form.issues.filter((entry) => entry.issue.severity === 'error');
  return {
    errors: collectErrors(form.components, data),
    blocked: blockingIssues.length > 0,
    blockingIssues,
  };
}

/**
 * Validation errors for a subtree, keyed by absolute path.
 *
 * Takes components rather than a whole form so the wizard shell can ask "is *this page* valid"
 * without validating pages the user has not reached. `data` stays the whole submission, because
 * a conditional on page three may well be testing an answer from page one.
 */
export function collectErrors(
  components: FormComponent[],
  data: SubmissionData
): FormErrors {
  const errors: FormErrors = {};
  forEachInstance(components, data, ({ component, path, visible }) => {
    if (!visible || component.hidden) return;
    if (!component.input || !path) return;
    // A container has no answer of its own; its children carry the rules.
    if (component.role === 'container') return;

    const messages = validateComponent(component, getAtPath(data, path));
    if (messages.length > 0) errors[path] = messages;
  });
  return errors;
}

/** Every visible data path under a subtree. Used to reveal one wizard page's errors at a time. */
export function pathsIn(components: FormComponent[], data: SubmissionData): string[] {
  const paths: string[] = [];
  forEachInstance(components, data, ({ component, path, visible }) => {
    if (visible && component.input && path) paths.push(path);
  });
  return paths;
}

/** The object to POST. A copy, so a caller cannot mutate engine state by editing it. */
export function toSubmission(data: SubmissionData): { data: SubmissionData } {
  return { data: asRecord(JSON.parse(JSON.stringify(data)) as unknown) };
}
