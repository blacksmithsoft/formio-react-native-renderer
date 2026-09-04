// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Submission shapes for `datamap` and `tree` — the two Form.io types that store nested objects
 * rather than a primitive or a row array.
 *
 * Both must round-trip the exact JSON the web renderer writes. A text box would stringify them;
 * these helpers are the contract the engine and the controls share instead.
 *
 * Pure. Imports nothing from React or React Native.
 */

export type SubmissionRecord = Record<string, unknown>;

/** One Form.io tree node: field values under `data`, child nodes under `children`. */
export interface TreeNodeValue {
  data: SubmissionRecord;
  children: unknown[];
}

export function asRecord(value: unknown): SubmissionRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as SubmissionRecord)
    : {};
}

/**
 * Read a stored tree value as a node.
 *
 * Form.io writes `{ data, children }`. A flat object — leftover from an older export, or a
 * default the builder put in `defaultValue` — is treated as `data` so the fields still appear.
 */
export function asTreeNode(value: unknown): TreeNodeValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { data: {}, children: [] };
  }
  const record = value as SubmissionRecord;
  if ('data' in record || 'children' in record) {
    return {
      data: asRecord(record.data),
      children: Array.isArray(record.children) ? record.children : [],
    };
  }
  return { data: record, children: [] };
}

export function isEmptyTreeNode(value: unknown): boolean {
  const node = asTreeNode(value);
  const dataEmpty = Object.keys(node.data).length === 0 || Object.values(node.data).every(isVacant);
  return dataEmpty && node.children.every(isEmptyTreeNode);
}

function isVacant(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as SubmissionRecord).length === 0;
  return false;
}

/** Next unused key in a datamap, so adding a row never silently overwrites one. */
export function uniqueMapKey(map: SubmissionRecord, base = 'key'): string {
  if (!Object.prototype.hasOwnProperty.call(map, base)) return base;
  let suffix = 1;
  while (Object.prototype.hasOwnProperty.call(map, `${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

/**
 * Rename a datamap key, preserving insertion order.
 *
 * An empty or unchanged name is a no-op. A collision gets a numeric suffix rather than
 * overwriting the other entry — losing a value the user can still see is worse than a ugly key.
 */
export function renameMapKey(map: SubmissionRecord, from: string, to: string): SubmissionRecord {
  const trimmed = to.trim();
  if (!trimmed || trimmed === from) return map;
  let next = trimmed;
  if (Object.prototype.hasOwnProperty.call(map, next)) {
    next = uniqueMapKey(map, trimmed);
  }
  const renamed: SubmissionRecord = {};
  for (const [key, value] of Object.entries(map)) {
    renamed[key === from ? next : key] = value;
  }
  return renamed;
}
