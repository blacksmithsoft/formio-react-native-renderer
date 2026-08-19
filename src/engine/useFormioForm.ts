// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Layer 1 — the headless form engine. docs/FORMS.md §1.
 *
 * Everything behavioural lives below this file as pure functions; the hook only holds the state
 * and wires the callbacks. That split is deliberate and load-bearing: the sync layer has to
 * re-validate a queued submission on a background task, days after the screen that produced it
 * was unmounted, and it does that by calling {@link validateForm} directly. If validation lived
 * inside the hook it would be reachable only from a mounted component.
 *
 * Errors are **derived** from the data rather than stored beside it. Storing them means keeping
 * two things in step across asynchronous state updates, which is where "the error stayed on
 * screen after I fixed the field" comes from. Deriving them costs one tree walk per keystroke —
 * measured in microseconds even on a long form — and cannot go stale.
 *
 * The engine owns no UI. It does not know whether it is being drawn.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  applyDefaults,
  emptyRow,
  reconcile,
  toSubmission,
  validateForm,
  type FormErrors,
  type SubmissionData,
} from './formState';
import { getAtPath, indexPath, setAtPath, unsetAtPath } from './dataPaths';
import { parseForm } from './parseForm';
import { noopTelemetry, type FormioTelemetry } from './telemetry';
import { visibleComponents as computeVisible } from './traverse';
import type { FormComponent, FormDefinition } from './types';

export interface UseFormioFormOptions {
  /** Draw values, take no input. Validation still runs, so a caller can check a stored record. */
  readOnly?: boolean;
  /** Called after every change, with the reconciled data. */
  onChange?: (data: SubmissionData) => void;
  /** Where unsupported-component reports go. Defaults to a no-op. */
  telemetry?: FormioTelemetry;
}

export interface FormioFormInstance {
  /** The parsed schema. Stable for as long as the schema object is. */
  form: FormDefinition;
  data: SubmissionData;
  /** Every current validation failure, keyed by absolute data path, whether shown or not. */
  errors: FormErrors;
  /** No validation errors *and* nothing structurally blocking the form. */
  isValid: boolean;
  /**
   * An unsupported component makes the form non-submittable regardless of what the user typed —
   * docs/FORMS.md §6. Kept separate from `errors` because no amount of correcting fields will
   * clear it, and the UI has to say so rather than pointing at a field.
   */
  blocked: boolean;
  blockingIssues: FormDefinition['issues'];
  /** The schema tree with conditionally hidden branches removed. */
  visibleComponents: FormComponent[];

  getValue: (path: string) => unknown;
  setValue: (path: string, value: unknown) => void;
  /** Mark a field as interacted with, so its errors may be shown. */
  touch: (path: string) => void;
  /**
   * Reveal a set of fields' errors at once, without revealing the whole form's.
   *
   * The wizard uses this to check one page: `validate()` would light up pages the user has not
   * reached yet, which reads as a form that rejected itself before being filled in.
   */
  touchMany: (paths: string[]) => void;
  /**
   * Errors to *display* for a path.
   *
   * Empty until the user has touched the field or has tried to submit. Showing "is required" on
   * a field nobody has reached yet reads as a wall of failure on a form that has not been filled
   * in, and trains people to ignore the colour red.
   */
  errorsFor: (path: string) => string[];

  addRow: (gridPath: string, grid: FormComponent) => void;
  removeRow: (gridPath: string, index: number) => void;

  /** Validate everything and reveal all errors. Returns whether the form may be submitted. */
  validate: () => boolean;
  reset: (data?: SubmissionData) => void;
  getSubmission: () => { data: SubmissionData };
  readOnly: boolean;
  /** True once `validate` has failed, so the renderer knows to reveal untouched errors. */
  showAllErrors: boolean;
}

export function useFormioForm(
  schema: unknown,
  initialData?: SubmissionData,
  options: UseFormioFormOptions = {}
): FormioFormInstance {
  const { readOnly = false, onChange, telemetry = noopTelemetry } = options;

  const form = useMemo(() => parseForm(schema), [schema]);

  // Defaults are seeded in the initialiser rather than in an effect, so there is no first render
  // in which a required field that has a default reads as empty.
  const [data, setData] = useState<SubmissionData>(() =>
    reconcile(form, applyDefaults(form, initialData ?? {}))
  );
  const [showAllErrors, setShowAllErrors] = useState(false);
  // Not state: touching a field changes nothing on screen by itself, and re-rendering the whole
  // form on every focus event is a real cost on a long one.
  const touched = useRef<Set<string>>(new Set());
  const [touchVersion, setTouchVersion] = useState(0);

  // Reported once per parsed form. Re-reporting on every render would drown the signal in the
  // one place it is supposed to be legible.
  const reported = useRef<FormDefinition | null>(null);
  if (reported.current !== form) {
    reported.current = form;
    for (const entry of form.issues) {
      telemetry({ form: form.path, path: entry.path, type: entry.issue.code, issue: entry.issue });
    }
  }

  const validation = useMemo(() => validateForm(form, data), [form, data]);

  const update = useCallback(
    (produce: (current: SubmissionData) => SubmissionData) => {
      setData((current) => {
        const next = reconcile(form, produce(current), touched.current);
        if (next !== current) onChange?.(next);
        return next;
      });
    },
    [form, onChange]
  );

  const setValue = useCallback(
    (path: string, value: unknown) => {
      if (readOnly || !path) return;
      touched.current.add(path);
      update((current) => setAtPath(current, path, value));
    },
    [readOnly, update]
  );

  const touch = useCallback((path: string) => {
    if (!path || touched.current.has(path)) return;
    touched.current.add(path);
    // Revealing this field's error is a visible change, so it does need a render.
    setTouchVersion((version) => version + 1);
  }, []);

  const touchMany = useCallback((paths: string[]) => {
    let added = false;
    for (const path of paths) {
      if (!path || touched.current.has(path)) continue;
      touched.current.add(path);
      added = true;
    }
    if (added) setTouchVersion((version) => version + 1);
  }, []);

  const addRow = useCallback(
    (gridPath: string, grid: FormComponent) => {
      if (readOnly) return;
      update((current) => {
        const rows = getAtPath(current, gridPath);
        return setAtPath(current, gridPath, [...(Array.isArray(rows) ? rows : []), emptyRow(grid)]);
      });
    },
    [readOnly, update]
  );

  const removeRow = useCallback(
    (gridPath: string, index: number) => {
      if (readOnly) return;
      // Removing a row renumbers every row after it, so remembered paths below this grid now
      // point at the wrong row. Forgetting them is cheaper and more honest than rewriting them,
      // and the cost is that the surviving rows stop showing errors until touched again.
      for (const path of [...touched.current]) {
        if (path.startsWith(`${gridPath}[`)) touched.current.delete(path);
      }
      update((current) => unsetAtPath(current, indexPath(gridPath, index)));
    },
    [readOnly, update]
  );

  const errorsFor = useCallback(
    (path: string): string[] => {
      void touchVersion; // recomputed when a field is first touched
      if (!showAllErrors && !touched.current.has(path)) return [];
      return validation.errors[path] ?? [];
    },
    [showAllErrors, validation, touchVersion]
  );

  const validate = useCallback((): boolean => {
    setShowAllErrors(true);
    const result = validateForm(form, data);
    return Object.keys(result.errors).length === 0 && !result.blocked;
  }, [form, data]);

  const reset = useCallback(
    (next?: SubmissionData) => {
      touched.current = new Set();
      setShowAllErrors(false);
      setTouchVersion(0);
      const seeded = reconcile(form, applyDefaults(form, next ?? {}));
      setData(seeded);
      onChange?.(seeded);
    },
    [form, onChange]
  );

  const visible = useMemo(() => computeVisible(form.components, data), [form, data]);

  return {
    form,
    data,
    errors: validation.errors,
    isValid: Object.keys(validation.errors).length === 0 && !validation.blocked,
    blocked: validation.blocked,
    blockingIssues: validation.blockingIssues,
    visibleComponents: visible,
    getValue: useCallback((path: string) => getAtPath(data, path), [data]),
    setValue,
    touch,
    touchMany,
    errorsFor,
    addRow,
    removeRow,
    validate,
    reset,
    getSubmission: useCallback(() => toSubmission(data), [data]),
    readOnly,
    showAllErrors,
  };
}
