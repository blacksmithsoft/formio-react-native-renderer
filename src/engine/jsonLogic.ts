// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * A JSON Logic interpreter — docs/FORMS.md §3.
 *
 * Form.io writes advanced conditionals and simple calculations as JSON Logic, so the engine needs
 * an evaluator. It is implemented here rather than taken from `json-logic-js` for three reasons,
 * in order of weight:
 *
 * 1. **Parity.** Every behaviour in this repository has to exist twice, in TypeScript and in Dart.
 *    A dependency on one platform's package is a rule that cannot be specified, only imitated.
 * 2. **Zero dependencies.** The package's whole contract with a host is `react` and
 *    `react-native`. One transitive dependency is how that stops being true.
 * 3. **Auditability.** "No `eval`, no `new Function`" is a constraint the app is held to under
 *    Hermes. It is worth more as a property of code we can read than as a claim about a package.
 *
 * The operator set and coercion rules follow `json-logic-js` deliberately, including its
 * quirks — `+` coerces with `parseFloat`, an empty array is falsy, a missing `var` resolves to
 * `null` rather than `undefined`. Matching a well-known implementation is worth more than
 * tidying it, because the rules are authored against that implementation on the web.
 *
 * Never throws. An unknown operator, a malformed rule or a wrong argument type yields `null`,
 * because a schema that fails to evaluate must not be able to stop a form from rendering.
 *
 * Pure. Imports nothing from React or React Native.
 */

export type JsonLogicRule = unknown;

type Args = unknown[];

/** `json-logic-js` truthiness: JavaScript's, except that an empty array is falsy. */
export function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function isRuleObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `parseFloat` semantics, so `"3 apples"` is 3 and `null` is `NaN`, exactly as on the web. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return Number.parseFloat(String(value));
}

/**
 * Resolve a `var` path against the current data scope.
 *
 * `json-logic-js` splits on `.` only. Bracket indexing (`lines[0].qty`) is accepted here as well,
 * because that is how Form.io writes a datagrid path everywhere else in a schema and an author
 * copying one into a conditional should not silently get `null`. A dotted path behaves
 * identically in both, so this is a strict superset.
 */
function resolveVar(path: unknown, scope: unknown, fallback: unknown): unknown {
  if (path === undefined || path === null || path === '') return scope;

  let current: unknown = scope;
  for (const raw of String(path).split('.')) {
    for (const segment of splitBrackets(raw)) {
      if (current === null || current === undefined) return fallback;
      if (typeof current !== 'object') return fallback;
      current = (current as Record<string, unknown>)[segment];
      if (current === undefined) return fallback;
    }
  }
  return current === undefined ? fallback : current;
}

/** `lines[0]` → `['lines', '0']`; `qty` → `['qty']`. */
function splitBrackets(segment: string): string[] {
  if (!segment.includes('[')) return [segment];
  const parts: string[] = [];
  let buffer = '';
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (char === '[') {
      if (buffer) parts.push(buffer);
      buffer = '';
      continue;
    }
    if (char === ']') {
      if (buffer) parts.push(buffer);
      buffer = '';
      continue;
    }
    buffer += char;
  }
  if (buffer) parts.push(buffer);
  return parts.length > 0 ? parts : [segment];
}

function missingKeys(keys: unknown[], scope: unknown): string[] {
  const missing: string[] = [];
  for (const key of keys) {
    const value = resolveVar(key, scope, null);
    if (value === null || value === '') missing.push(String(key));
  }
  return missing;
}

/** Operators whose arguments are evaluated eagerly, left to right. */
const OPERATORS: Record<string, (args: Args) => unknown> = {
  '==': ([a, b]) => a == b, // eslint-disable-line eqeqeq -- json-logic defines `==` as loose
  '===': ([a, b]) => a === b,
  '!=': ([a, b]) => a != b, // eslint-disable-line eqeqeq -- json-logic defines `!=` as loose
  '!==': ([a, b]) => a !== b,
  '!': ([a]) => !truthy(a),
  '!!': ([a]) => truthy(a),
  // Three arguments is the "between" form: `1 < x < 10`.
  '>': ([a, b]) => Number(a) > Number(b),
  '>=': ([a, b]) => Number(a) >= Number(b),
  '<': (args) =>
    args.length > 2
      ? Number(args[0]) < Number(args[1]) && Number(args[1]) < Number(args[2])
      : Number(args[0]) < Number(args[1]),
  '<=': (args) =>
    args.length > 2
      ? Number(args[0]) <= Number(args[1]) && Number(args[1]) <= Number(args[2])
      : Number(args[0]) <= Number(args[1]),
  '+': (args) => args.reduce<number>((sum, value) => sum + toNumber(value), 0),
  '*': (args) =>
    args.length === 0 ? null : args.reduce<number>((product, value) => product * toNumber(value), 1),
  '-': (args) => (args.length === 1 ? -toNumber(args[0]) : toNumber(args[0]) - toNumber(args[1])),
  '/': ([a, b]) => toNumber(a) / toNumber(b),
  '%': ([a, b]) => toNumber(a) % toNumber(b),
  min: (args) => Math.min(...args.map(toNumber)),
  max: (args) => Math.max(...args.map(toNumber)),
  cat: (args) => args.map((value) => (value === null || value === undefined ? '' : String(value))).join(''),
  substr: ([source, start, end]) => {
    const text = String(source ?? '');
    const from = Number(start) || 0;
    const begin = from < 0 ? Math.max(text.length + from, 0) : from;
    if (end === undefined || end === null) return text.slice(begin);
    const length = Number(end);
    return length < 0 ? text.slice(begin, Math.max(text.length + length, begin)) : text.slice(begin, begin + length);
  },
  in: ([needle, haystack]) => {
    if (typeof haystack === 'string') return haystack.indexOf(String(needle)) !== -1;
    if (Array.isArray(haystack)) return haystack.includes(needle);
    return false;
  },
  merge: (args) => args.flatMap((value) => (Array.isArray(value) ? value : [value])),
  log: ([a]) => a,
};

/** Operators that must see their arguments unevaluated: short-circuits and iterators. */
const LAZY = new Set([
  'if',
  '?:',
  'and',
  'or',
  'var',
  'missing',
  'missing_some',
  'map',
  'filter',
  'reduce',
  'all',
  'some',
  'none',
]);

function applyLazy(op: string, args: Args, scope: unknown): unknown {
  switch (op) {
    case 'var': {
      const fallback = args.length > 1 ? apply(args[1], scope) : null;
      return resolveVar(apply(args[0], scope), scope, fallback);
    }

    case 'missing': {
      const first = apply(args[0], scope);
      const keys = Array.isArray(first) ? first : args.map((arg) => apply(arg, scope));
      return missingKeys(keys, scope);
    }

    case 'missing_some': {
      const need = Number(apply(args[0], scope));
      const options = apply(args[1], scope);
      if (!Array.isArray(options)) return [];
      const missing = missingKeys(options, scope);
      return options.length - missing.length >= need ? [] : missing;
    }

    case 'if':
    case '?:': {
      // `if` is variadic: condition, value, condition, value, …, else.
      for (let index = 0; index < args.length - 1; index += 2) {
        if (truthy(apply(args[index], scope))) return apply(args[index + 1], scope);
      }
      return args.length % 2 === 1 ? apply(args[args.length - 1], scope) : null;
    }

    case 'and': {
      let current: unknown = true;
      for (const arg of args) {
        current = apply(arg, scope);
        if (!truthy(current)) return current;
      }
      return current;
    }

    case 'or': {
      let current: unknown = false;
      for (const arg of args) {
        current = apply(arg, scope);
        if (truthy(current)) return current;
      }
      return current;
    }

    case 'map': {
      const items = apply(args[0], scope);
      if (!Array.isArray(items)) return [];
      return items.map((item) => apply(args[1], item));
    }

    case 'filter': {
      const items = apply(args[0], scope);
      if (!Array.isArray(items)) return [];
      return items.filter((item) => truthy(apply(args[1], item)));
    }

    case 'reduce': {
      const items = apply(args[0], scope);
      const initial = args.length > 2 ? apply(args[2], scope) : null;
      if (!Array.isArray(items)) return initial;
      return items.reduce(
        (accumulator, current) => apply(args[1], { current, accumulator }),
        initial as unknown
      );
    }

    case 'all': {
      const items = apply(args[0], scope);
      if (!Array.isArray(items) || items.length === 0) return false;
      return items.every((item) => truthy(apply(args[1], item)));
    }

    case 'some': {
      const items = apply(args[0], scope);
      if (!Array.isArray(items)) return false;
      return items.some((item) => truthy(apply(args[1], item)));
    }

    case 'none': {
      const items = apply(args[0], scope);
      if (!Array.isArray(items)) return true;
      return !items.some((item) => truthy(apply(args[1], item)));
    }

    default:
      return null;
  }
}

/**
 * Evaluate a rule against a data scope.
 *
 * A rule that is not an operator object is a literal and is returned as-is; an array is a list of
 * rules and each entry is evaluated.
 */
export function apply(rule: JsonLogicRule, scope: unknown): unknown {
  if (Array.isArray(rule)) return rule.map((entry) => apply(entry, scope));
  if (!isRuleObject(rule)) return rule;

  const keys = Object.keys(rule);
  // An object with anything other than exactly one key is not a rule. Returning it unchanged
  // keeps `{"var": "a"}` inside a literal object working, which is how authors write defaults.
  if (keys.length !== 1) return rule;

  const op = keys[0] as string;
  const raw = rule[op];
  const args: Args = Array.isArray(raw) ? raw : [raw];

  if (LAZY.has(op)) return applyLazy(op, args, scope);

  const operator = OPERATORS[op];
  // An operator we do not implement resolves to null rather than throwing. A conditional that
  // cannot be evaluated must never be able to stop the form from rendering.
  if (!operator) return null;

  return operator(args.map((arg) => apply(arg, scope)));
}

/** Whether a rule is shaped like something this interpreter can evaluate at all. */
export function isJsonLogicRule(value: unknown): boolean {
  return isRuleObject(value) && Object.keys(value).length === 1;
}
