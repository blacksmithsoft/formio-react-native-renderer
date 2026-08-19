// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The declarative validation set — docs/FORMS.md §4.
 *
 * The server revalidates on POST, so every rule missing here becomes a submission that is
 * accepted in the field and rejected days later at sync time. That failure mode — a worker who
 * fills a form offline, goes home, and learns three days later that it failed — is the one this
 * file exists to prevent, which is why it implements the whole set rather than just `required`.
 *
 * Messages copy Form.io's own defaults so that an error a user sees on the phone reads the same
 * as the one the web renderer would have shown for the same field.
 *
 * `unique` is deliberately absent: it cannot be answered without the server, and guessing at it
 * offline would block valid submissions.
 *
 * Pure. Imports nothing from React or React Native.
 */

import type { FormComponent, ValidationRules } from './types';

/**
 * Form.io's own email pattern. Copied rather than improved: the point is to accept exactly what
 * the server accepts, and a stricter rule here is a submission the user cannot make.
 */
const EMAIL =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const URL = /^(?:(?:https?|ftp):\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;

/**
 * Compiled `validate.pattern` sources.
 *
 * `new RegExp` is not `eval` — it compiles a pattern, it does not execute code — so it is safe
 * under Hermes. It can still throw on a malformed source, which is why every compile is guarded
 * and a bad pattern degrades to "no pattern rule" rather than to a crash on form open.
 */
const PATTERNS = new Map<string, RegExp | null>();

function compile(source: string): RegExp | null {
  const cached = PATTERNS.get(source);
  if (cached !== undefined) return cached;
  let compiled: RegExp | null = null;
  try {
    // Form.io anchors the author's pattern, so `\d{3}` means the whole value, not a substring.
    compiled = new RegExp(`^${source}$`);
  } catch {
    compiled = null;
  }
  PATTERNS.set(source, compiled);
  return compiled;
}

/**
 * Whether a value counts as "not answered".
 *
 * Each shape here is a real component: an unticked checkbox is `false`, a `selectboxes` with
 * nothing chosen is a map of `false`, and an empty file list is `[]`. A plain falsy test would
 * call the number `0` empty, which would make a required "Defects found" field unanswerable
 * with the correct answer.
 */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'boolean') return value === false;
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    const entries = Object.values(value as Record<string, unknown>);
    if (entries.length === 0) return true;
    // A selectboxes map is empty when nothing is ticked. Any other object with content is not.
    return entries.every((entry) => entry === false);
  }
  return false;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

function countSelected(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).filter((entry) => entry === true).length;
  }
  return isEmptyValue(value) ? 0 : 1;
}

/** The text a value contributes to length and pattern rules. */
function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Types whose value is checked for a shape as well as for the declared rules. */
const TYPE_RULES: Record<string, (value: unknown, label: string) => string | null> = {
  email: (value, label) => {
    const text = asText(value);
    return text && !EMAIL.test(text.trim()) ? `${label} must be a valid email.` : null;
  },
  url: (value, label) => {
    const text = asText(value);
    return text && !URL.test(text.trim()) ? `${label} must be a valid url.` : null;
  },
  number: (value, label) => (asNumber(value) === undefined ? `${label} must be a number.` : null),
  currency: (value, label) => (asNumber(value) === undefined ? `${label} must be a number.` : null),
  /**
   * Deliberately lenient. Form.io applies an input mask rather than a strict server rule, and
   * field crews enter extensions, international prefixes and radio call-signs. Rejecting those
   * on device would block a submission the server would have accepted.
   */
  phoneNumber: (value, label) => {
    const text = asText(value);
    if (!text) return null;
    return (text.match(/\d/g)?.length ?? 0) >= 7 ? null : `${label} must be a valid phone number.`;
  },
};

function applyRules(
  rules: ValidationRules,
  value: unknown,
  label: string,
  base: string
): string[] {
  const errors: string[] = [];

  const text = asText(value);
  if (text !== undefined) {
    if (rules.minLength !== undefined && text.length < rules.minLength) {
      errors.push(`${label} must have at least ${rules.minLength} characters.`);
    }
    if (rules.maxLength !== undefined && text.length > rules.maxLength) {
      errors.push(`${label} must have no more than ${rules.maxLength} characters.`);
    }
    if (rules.minWords !== undefined && countWords(text) < rules.minWords) {
      errors.push(`${label} must have at least ${rules.minWords} words.`);
    }
    if (rules.maxWords !== undefined && countWords(text) > rules.maxWords) {
      errors.push(`${label} must have no more than ${rules.maxWords} words.`);
    }
    if (rules.pattern) {
      const pattern = compile(rules.pattern);
      if (pattern && !pattern.test(text)) {
        errors.push(`${label} does not match the pattern ${rules.pattern}`);
      }
    }
  }

  const numeric = asNumber(value);
  if (numeric !== undefined) {
    if (rules.min !== undefined && numeric < rules.min) {
      errors.push(`${label} cannot be less than ${rules.min}.`);
    }
    if (rules.max !== undefined && numeric > rules.max) {
      errors.push(`${label} cannot be greater than ${rules.max}.`);
    }
  }

  if (rules.minSelectedCount !== undefined && countSelected(value) < rules.minSelectedCount) {
    errors.push(`Please select at least ${rules.minSelectedCount} items.`);
  }
  if (rules.maxSelectedCount !== undefined && countSelected(value) > rules.maxSelectedCount) {
    errors.push(`Please select no more than ${rules.maxSelectedCount} items.`);
  }

  const typeRule = TYPE_RULES[base];
  if (typeRule) {
    const failure = typeRule(value, label);
    if (failure) errors.push(failure);
  }

  return errors;
}

/**
 * Validate one component's value.
 *
 * The caller decides whether the component is visible; a hidden component must never reach this
 * function. That is how Form.io expresses conditional requiredness — a field can be
 * `required: true` and still not block submission when its conditional hides it — and getting it
 * wrong makes forms unsubmittable.
 */
export function validateComponent(component: FormComponent, value: unknown): string[] {
  const label = component.field.label || component.key;
  const rules = component.validate;
  const empty = isEmptyValue(value);

  if (rules.required && empty) {
    return [rules.customMessage ?? `${label} is required`];
  }

  // On a grid, `minLength` and `maxLength` count rows rather than characters — Form.io reuses
  // the same two properties for both, and reading them as text lengths would silently pass.
  if (component.role === 'grid') {
    const rows = Array.isArray(value) ? value.length : 0;
    const errors: string[] = [];
    if (rules.minLength !== undefined && rows < rules.minLength) {
      errors.push(`${label} must have at least ${rules.minLength} rows.`);
    }
    if (rules.maxLength !== undefined && rows > rules.maxLength) {
      errors.push(`${label} must have no more than ${rules.maxLength} rows.`);
    }
    return rules.customMessage && errors.length > 0 ? [rules.customMessage] : errors;
  }

  // Every remaining rule describes the shape of an answer, so an unanswered optional field
  // passes them all. Running them on `undefined` produces errors nobody can act on.
  if (empty) return [];

  const errors = applyRules(rules, value, label, component.base);
  if (errors.length === 0) return [];

  // `customMessage` replaces the generated text for the whole component, which is what the web
  // renderer does — one authored message, however many rules it covers.
  return rules.customMessage ? [rules.customMessage] : errors;
}
