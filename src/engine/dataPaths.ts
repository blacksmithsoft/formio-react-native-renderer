// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Absolute data paths into a Form.io submission — docs/FORMS.md §2.
 *
 * Submission data is keyed by `component.key`, and nesting containers scope that key:
 * `container` adds an object level (`address.city`), `datagrid` and `editgrid` add an array level
 * (`lines[0].qty`). Every component in the engine carries its resolved absolute path, never a bare
 * key, because a bare key is ambiguous the moment the same component appears in two grid rows.
 *
 * Reads never throw: an out-of-shape container yields `undefined`. Writes are immutable and
 * copy only the spine they touch, so React sees a new object for the branch that changed and the
 * same object everywhere else.
 *
 * Pure. Imports nothing from React or React Native.
 */

export type PathSegment = string | number;

type Container = Record<string, unknown> | unknown[];

const CACHE = new Map<string, PathSegment[]>();
/** Templates rarely exceed a few hundred distinct paths; the bound is only there to stop a
 *  pathological datagrid from growing the cache without limit. */
const CACHE_LIMIT = 2048;

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null;
}

function isIndex(segment: PathSegment): segment is number {
  return typeof segment === 'number';
}

/**
 * Split `lines[0].qty` into `['lines', 0, 'qty']`.
 *
 * Bracket contents that are not a run of digits are treated as a literal key, so a schema that
 * uses a bracket in a key name degrades to a plain property read rather than an array read on
 * `NaN`.
 */
export function parsePath(path: string): PathSegment[] {
  const cached = CACHE.get(path);
  if (cached) return cached;

  const segments: PathSegment[] = [];
  let buffer = '';

  const flush = (): void => {
    if (buffer !== '') {
      segments.push(buffer);
      buffer = '';
    }
  };

  for (let index = 0; index < path.length; index += 1) {
    const char = path[index];
    if (char === '.') {
      flush();
      continue;
    }
    if (char === '[') {
      const close = path.indexOf(']', index);
      if (close === -1) {
        // Unterminated bracket: keep the rest as a literal rather than losing it.
        buffer += path.slice(index);
        break;
      }
      const inner = path.slice(index + 1, close);
      flush();
      segments.push(/^\d+$/.test(inner) ? Number(inner) : inner);
      index = close;
      continue;
    }
    buffer += char;
  }
  flush();

  if (CACHE.size >= CACHE_LIMIT) CACHE.clear();
  CACHE.set(path, segments);
  return segments;
}

function toSegments(path: string | PathSegment[]): PathSegment[] {
  return Array.isArray(path) ? path : parsePath(path);
}

/** Append a child key to a parent path. An empty parent means the child is at the root. */
export function joinPath(parent: string, key: string): string {
  if (!key) return parent;
  return parent ? `${parent}.${key}` : key;
}

/** Append a row index to a grid path: `lines` + 0 → `lines[0]`. */
export function indexPath(parent: string, index: number): string {
  return `${parent}[${index}]`;
}

export function getAtPath(data: unknown, path: string | PathSegment[]): unknown {
  let current: unknown = data;
  for (const segment of toSegments(path)) {
    if (!isContainer(current)) return undefined;
    if (Array.isArray(current)) {
      if (!isIndex(segment)) return undefined;
      current = current[segment];
    } else {
      current = (current as Record<string, unknown>)[String(segment)];
    }
  }
  return current;
}

/**
 * Shallow-copy `value` as the kind of container `segment` needs to index into.
 *
 * A numeric segment forces an array and a string segment forces an object, so a write through a
 * path whose shape disagrees with the stored data replaces the mismatched level rather than
 * throwing. Losing one malformed branch is better than losing the submission.
 */
function cloneFor(value: unknown, segment: PathSegment): Container {
  if (isIndex(segment)) return Array.isArray(value) ? [...value] : [];
  if (isContainer(value) && !Array.isArray(value)) return { ...(value as Record<string, unknown>) };
  return {};
}

function assign(target: Container, segment: PathSegment, value: unknown): void {
  if (Array.isArray(target) && isIndex(segment)) {
    target[segment] = value;
    return;
  }
  (target as Record<string, unknown>)[String(segment)] = value;
}

function read(target: Container, segment: PathSegment): unknown {
  if (Array.isArray(target)) return isIndex(segment) ? target[segment] : undefined;
  return (target as Record<string, unknown>)[String(segment)];
}

/**
 * Immutably write `value` at `path`, creating intermediate containers as needed.
 *
 * Returns the original object when the path is empty; there is nothing sensible to write to the
 * root of a submission, and returning a copy would make every caller think something changed.
 */
export function setAtPath<T extends Record<string, unknown>>(
  data: T,
  path: string | PathSegment[],
  value: unknown
): T {
  const segments = toSegments(path);
  if (segments.length === 0) return data;

  const root = { ...data } as Record<string, unknown>;
  let cursor: Container = root;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index] as PathSegment;
    const next = segments[index + 1] as PathSegment;
    const child = cloneFor(read(cursor, segment), next);
    assign(cursor, segment, child);
    cursor = child;
  }

  assign(cursor, segments[segments.length - 1] as PathSegment, value);
  return root as T;
}

/**
 * Immutably remove the value at `path`.
 *
 * This is what `clearOnHide` uses, so it must genuinely delete the key rather than set it to
 * `undefined`: the server distinguishes "absent" from "present and empty", and a serialised
 * `undefined` would arrive as neither.
 *
 * Array elements are spliced out, which renumbers the rows after them. That is correct for a
 * datagrid row removal and is why grid rows are addressed by index only for the duration of one
 * operation.
 */
export function unsetAtPath<T extends Record<string, unknown>>(
  data: T,
  path: string | PathSegment[]
): T {
  const segments = toSegments(path);
  if (segments.length === 0) return data;

  // Nothing to remove — return the original so callers can compare by identity.
  if (getAtPath(data, segments) === undefined && !hasAtPath(data, segments)) return data;

  const root = { ...data } as Record<string, unknown>;
  let cursor: Container = root;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index] as PathSegment;
    const existing = read(cursor, segment);
    if (!isContainer(existing)) return data;
    const child: Container = Array.isArray(existing)
      ? [...existing]
      : { ...(existing as Record<string, unknown>) };
    assign(cursor, segment, child);
    cursor = child;
  }

  const last = segments[segments.length - 1] as PathSegment;
  if (Array.isArray(cursor)) {
    if (isIndex(last) && last >= 0 && last < cursor.length) cursor.splice(last, 1);
  } else {
    delete (cursor as Record<string, unknown>)[String(last)];
  }
  return root as T;
}

/** Whether the path resolves to an own property, distinguishing "absent" from "stored as null". */
export function hasAtPath(data: unknown, path: string | PathSegment[]): boolean {
  const segments = toSegments(path);
  if (segments.length === 0) return false;

  let current: unknown = data;
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (!isContainer(current)) return false;
    current = read(current, segments[index] as PathSegment);
  }
  if (!isContainer(current)) return false;

  const last = segments[segments.length - 1] as PathSegment;
  if (Array.isArray(current)) return isIndex(last) && last >= 0 && last < current.length;
  return Object.prototype.hasOwnProperty.call(current, String(last));
}
