// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Narrowing helpers for untrusted schema JSON.
 *
 * The parser's entire input is untyped and third-party authored, so narrowing is the job rather
 * than an inconvenience: nothing in here may throw, whatever it is handed.
 */

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** A finite number greater than zero, or `undefined`. Coerces numeric strings, as Form.io emits. */
export function toPositiveInt(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}
