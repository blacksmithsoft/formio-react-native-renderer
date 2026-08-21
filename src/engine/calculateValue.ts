// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Compile the `calculateValue` JavaScript that real schemas actually ship.
 *
 * String calculations cannot run under Hermes, so the parser used to record them as a blocking
 * error. That was honest and it stranded three Tasnim checklists whose only "custom JS" is
 * `rowIndex + 1` and a literal question list. Compiling those two shapes into a structured rule
 * is not an interpreter: there is no `eval`, and anything that does not match falls through to
 * the existing error.
 *
 * Pure. Imports nothing from React or React Native. Never throws.
 */

import { apply } from './jsonLogic';

export type CalculatedRule =
  | { kind: 'json'; logic: unknown }
  | { kind: 'rowIndex'; offset: number }
  | { kind: 'rowPick'; values: string[] };

/**
 * Turn an authored `calculateValue` into a rule the engine can apply, or `undefined` when it is
 * JavaScript this app cannot honour.
 */
export function compileCalculateValue(value: unknown): CalculatedRule | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return { kind: 'json', logic: value };
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;

  const compact = text.replace(/\s+/g, ' ').replace(/;+\s*$/, '').trim();
  const serial = /^(?:value|row\.[A-Za-z_]\w*)\s*=\s*_?rowIndex(?:\s*\+\s*(\d+))?$/i.exec(compact);
  if (serial) {
    const offset = serial[1] ? Number(serial[1]) : 0;
    return Number.isFinite(offset) ? { kind: 'rowIndex', offset } : undefined;
  }

  if (!/\w+\s*\[\s*_?rowIndex\s*\]/.test(text)) return undefined;
  const values = extractQuotedStrings(text);
  return values.length > 0 ? { kind: 'rowPick', values } : undefined;
}

/** Apply a compiled rule. `rowIndex` is `-1` when the component is not inside a grid row. */
export function evaluateCalculate(rule: CalculatedRule, rowIndex: number, scope: unknown): unknown {
  if (rule.kind === 'rowIndex') return rowIndex < 0 ? undefined : rowIndex + rule.offset;
  if (rule.kind === 'rowPick') return rowIndex < 0 ? '' : (rule.values[rowIndex] ?? '');
  return apply(rule.logic, scope);
}

function extractQuotedStrings(source: string): string[] {
  const array = /\[([\s\S]*?)\]/.exec(source);
  if (!array) return [];
  const values: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(array[1] ?? ''))) {
    values.push(unescapeQuoted(match[1] ?? match[2] ?? ''));
  }
  return values;
}

function unescapeQuoted(value: string): string {
  return value.replace(/\\([\\'"nrt])/g, (_, ch: string) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    return ch;
  });
}
