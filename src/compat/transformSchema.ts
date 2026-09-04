// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The schema compatibility transform — docs/FORMS.md §7.
 *
 * A step that runs **before a schema ever reaches a device**: it rewrites the parts of Form.io the
 * mobile renderer cannot honour into parts it can. It is the highest-leverage piece in the whole
 * design, for three reasons:
 *
 * - the device stops meeting component types it has never heard of, so the visible fallback
 *   becomes a genuine last resort rather than a routine occurrence;
 * - remote select options are resolved here, while there is still a network, and arrive baked
 *   into the cached schema — which is the only way a remote select can work offline at all;
 * - a broken form is fixed for every device at once, without shipping an app.
 *
 * It lives in this package rather than in a backend because the *rules* are part of the renderer's
 * contract: they say exactly which subset of Form.io the renderer promises to draw. The module is
 * pure TypeScript with no React, no React Native and no I/O of its own — a Node sync service can
 * import it directly, and a backend in another language ports it against the shared fixtures in
 * `fixtures/`. What it must not become is a second, informal definition of the supported subset
 * maintained somewhere else; see the note in docs/COMPONENTS.md.
 *
 * Every run reports what it changed, and the caller is expected to keep the untransformed schema.
 * A transform that silently rewrites a form is a transform nobody can debug.
 */

import { compileCalculateValue } from '../engine/calculateValue';
import { baseFieldType } from '../parse/baseFieldType';
import { COMPONENT_REGISTRY, type HostCapability } from '../form/registry';

/** Bumped whenever the output for an unchanged input would differ. Cached schemas carry it. */
export const TRANSFORM_VERSION = 3;

type JsonObject = Record<string, unknown>;

export interface TransformChange {
  /** Dotted key path to the component, as a form author would locate it. */
  path: string;
  /** The type as authored. */
  type: string;
  /** Which rule fired. Stable across versions; safe to alert on. */
  rule:
    | 'inline-select-options'
    | 'unresolved-select-options'
    | 'address-to-fields'
    | 'signature-to-file'
    | 'strip-custom-javascript'
    | 'unknown-type';
  detail: string;
  /** `warning` means a human should look at the form. */
  severity: 'info' | 'warning';
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface TransformOptions {
  /**
   * Fetch the options for a `select` backed by a URL or a Form.io resource.
   *
   * Called once per remote select. Returning `null` leaves the component as an empty inline
   * select and records a warning — an empty dropdown the worker can see and report beats a
   * dropdown that spins forever on a device with no signal.
   */
  resolveOptions?: (component: JsonObject, path: string) => Promise<SelectOption[] | null> | SelectOption[] | null;
  /**
   * What the target app build can do. When given, components needing a capability that is absent
   * are rewritten into something that build can handle.
   */
  capabilities?: HostCapability[];
  /**
   * Remove `customConditional`, `calculateValue`, `customDefaultValue` and `validate.custom`.
   *
   * Defaults to `true`, and the trade-off is worth stating plainly. Custom JavaScript cannot run
   * under Hermes, so a component carrying it reaches the device unsupported and blocks the whole
   * form (§6). Left in place, the worker cannot submit at all. Stripped, the worst case is a field
   * that should have been hidden is visible, or a total that should have been computed has to be
   * typed — and the server still revalidates on POST. An unsubmittable form in the field is the
   * worse of the two, so stripping is the default; every strip is reported as a warning.
   */
  stripCustomJavaScript?: boolean;
  /** Lowest app version that can render each component type — §10. */
  minAppVersionByType?: Record<string, string>;
}

export interface TransformResult {
  /** The rewritten schema. Safe to cache and send to a device. */
  schema: JsonObject;
  /** Retained verbatim, as §7 requires. Never send this to a device. */
  source: unknown;
  transformVersion: number;
  /** Highest `minAppVersionByType` across the surviving components, or undefined. */
  minAppVersion?: string;
  changes: TransformChange[];
}

/**
 * Properties whose value is always JavaScript.
 *
 * `calculateValue` and `logic` are deliberately absent: both have a declarative form the engine
 * supports — a JSON Logic object, and a rule with a non-`javascript` trigger — and stripping those
 * would remove working behaviour. They are handled individually below. This list and
 * `CUSTOM_JS_PROPERTIES` in `engine/parseForm.ts` describe the same boundary from opposite sides;
 * they must agree, or the transform will leave behind exactly what the device refuses to render.
 */
const CUSTOM_JS_KEYS = ['customConditional', 'customDefaultValue', 'customValidation'] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function keyOf(component: JsonObject): string {
  return typeof component.key === 'string' && component.key ? component.key : '(unkeyed)';
}

function labelOf(component: JsonObject): string {
  return typeof component.label === 'string' && component.label ? component.label : keyOf(component);
}

/**
 * Rewrite a Form.io schema into the subset the renderer draws.
 *
 * Async because resolving remote select options is a network call in every real deployment.
 * Never throws: a schema that cannot be understood comes back unchanged with a warning, because
 * the caller's fallback — sending nothing — leaves a worker with no form at all.
 */
export async function transformSchema(schema: unknown, options: TransformOptions = {}): Promise<TransformResult> {
  const changes: TransformChange[] = [];
  const versions: string[] = [];
  const strip = options.stripCustomJavaScript ?? true;
  const capabilities = options.capabilities ? new Set(options.capabilities) : null;

  if (!isObject(schema)) {
    return { schema: { components: [] }, source: schema, transformVersion: TRANSFORM_VERSION, changes };
  }

  const record = (change: TransformChange): void => {
    changes.push(change);
  };

  /** Rewrite one component, returning the zero or more components that replace it. */
  const rewrite = async (raw: unknown, parentPath: string): Promise<JsonObject[]> => {
    if (!isObject(raw)) return [];

    const component: JsonObject = { ...raw };
    const type = typeof component.type === 'string' ? component.type : '';
    // A branded backend type behaves exactly like the stock one it wraps, so every rule below
    // matches on the base. Matching the raw type would flag `custom_textfield` as unknown, and a
    // schema full of branded primitives would drown the real warnings in noise.
    const base = baseFieldType(type);
    const path = parentPath ? `${parentPath}.${keyOf(component)}` : keyOf(component);

    if (strip) stripCustomJavaScript(component, type, path, record);

    if (base === 'address') return addressToFields(component, path, record);

    if (base === 'signature' && capabilities && !capabilities.has('signature')) {
      return signatureToFile(component, path, record);
    }

    if (base === 'select') await inlineSelectOptions(component, path, options, record);

    if (type && !COMPONENT_REGISTRY[base]) {
      record({
        path,
        type,
        rule: 'unknown-type',
        detail: `"${type}" has no renderer. It will show a placeholder on the device.`,
        severity: 'warning',
      });
    }

    const version = options.minAppVersionByType?.[base];
    if (version) versions.push(version);

    // Layout children keep the parent's path: a panel is not a data scope, so a key nested in one
    // reads the same to a form author as one at the top level.
    const childPath = component.input === false || !component.key ? parentPath : path;
    await rewriteChildren(component, childPath);
    return [component];
  };

  const rewriteList = async (list: unknown, parentPath: string): Promise<JsonObject[]> => {
    const output: JsonObject[] = [];
    for (const item of asArray(list)) output.push(...(await rewrite(item, parentPath)));
    return output;
  };

  /** Descend into every shape Form.io uses to nest components. */
  const rewriteChildren = async (component: JsonObject, parentPath: string): Promise<void> => {
    if (Array.isArray(component.components)) {
      component.components = await rewriteList(component.components, parentPath);
    }

    if (Array.isArray(component.columns)) {
      const columns: unknown[] = [];
      for (const column of component.columns) {
        if (!isObject(column)) continue;
        columns.push({ ...column, components: await rewriteList(column.components, parentPath) });
      }
      component.columns = columns;
    }

    if (Array.isArray(component.rows)) {
      const rows: unknown[] = [];
      for (const row of component.rows) {
        const cells: unknown[] = [];
        for (const cell of asArray(row)) {
          if (!isObject(cell)) continue;
          cells.push({ ...cell, components: await rewriteList(cell.components, parentPath) });
        }
        rows.push(cells);
      }
      component.rows = rows;
    }

    if (isObject(component.valueComponent)) {
      const rewritten = await rewriteList([component.valueComponent], parentPath);
      if (rewritten[0]) component.valueComponent = rewritten[0];
    }
  };

  const output: JsonObject = { ...schema };
  output.components = await rewriteList(schema.components, '');

  return {
    schema: output,
    source: schema,
    transformVersion: TRANSFORM_VERSION,
    minAppVersion: highestVersion(versions),
    changes,
  };
}

function stripCustomJavaScript(
  component: JsonObject,
  type: string,
  path: string,
  record: (change: TransformChange) => void
): void {
  const removed: string[] = [];
  const isCode = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

  for (const key of CUSTOM_JS_KEYS) {
    if (isCode(component[key])) {
      delete component[key];
      removed.push(key);
    }
  }

  // A string here is JavaScript; an object is JSON Logic. The two shapes the device can compile
  // (`rowIndex + n`, a quoted list) stay in the schema so the engine can honour them. The rest
  // is stripped, because leaving it would block the whole form on the device.
  if (isCode(component.calculateValue) && !compileCalculateValue(component.calculateValue)) {
    delete component.calculateValue;
    removed.push('calculateValue');
  }

  if (isObject(component.validate) && isCode(component.validate.custom)) {
    const validate = { ...component.validate };
    delete validate.custom;
    delete validate.customPrivate;
    component.validate = validate;
    removed.push('validate.custom');
  }

  // Advanced logic survives unless the rule is triggered by JavaScript. Dropping the whole array
  // would take working `simple` and `json` triggers with it.
  if (Array.isArray(component.logic)) {
    const kept = component.logic.filter((rule) => {
      if (!isObject(rule)) return false;
      const trigger = isObject(rule.trigger) ? rule.trigger : {};
      return trigger.type !== 'javascript' && !isCode(trigger.javascript);
    });

    if (kept.length !== component.logic.length) {
      removed.push('logic');
      if (kept.length > 0) component.logic = kept;
      else delete component.logic;
    }
  }

  if (removed.length > 0) {
    record({
      path,
      type,
      rule: 'strip-custom-javascript',
      detail: `Removed ${removed.join(', ')}. Custom JavaScript cannot run on the device; replace it with a JSON Logic rule.`,
      severity: 'warning',
    });
  }
}

async function inlineSelectOptions(
  component: JsonObject,
  path: string,
  options: TransformOptions,
  record: (change: TransformChange) => void
): Promise<void> {
  const source = typeof component.dataSrc === 'string' ? component.dataSrc : 'values';
  if (source === 'values' || source === 'json') return;

  let resolved: SelectOption[] | null = null;
  try {
    resolved = (await options.resolveOptions?.(component, path)) ?? null;
  } catch {
    // A failed lookup is a warning, not a failure. The form still ships.
    resolved = null;
  }

  component.dataSrc = 'values';
  component.data = { values: resolved ?? [] };
  delete component.template;
  delete component.selectValues;
  delete component.valueProperty;
  delete component.refreshOn;

  if (resolved) {
    record({
      path,
      type: 'select',
      rule: 'inline-select-options',
      detail: `Inlined ${resolved.length} option${resolved.length === 1 ? '' : 's'} from dataSrc "${source}" so the field works offline.`,
      severity: 'info',
    });
    return;
  }

  record({
    path,
    type: 'select',
    rule: 'unresolved-select-options',
    detail: `Could not resolve options for dataSrc "${source}". The field will render empty.`,
    severity: 'warning',
  });
}

/**
 * `address` becomes a text field plus two hidden numbers.
 *
 * The keys are chosen so the shape the server receives is predictable: the app fills `_lat` and
 * `_lng` from the device's own location, which is more accurate than a geocoded string and works
 * without a network — which a lookup-driven address widget does not.
 */
function addressToFields(
  component: JsonObject,
  path: string,
  record: (change: TransformChange) => void
): JsonObject[] {
  const key = keyOf(component);

  record({
    path,
    type: 'address',
    rule: 'address-to-fields',
    detail: `Replaced with a text field plus hidden "${key}_lat" and "${key}_lng" numbers.`,
    severity: 'info',
  });

  const hidden = (suffix: string): JsonObject => ({
    type: 'hidden',
    key: `${key}_${suffix}`,
    label: `${labelOf(component)} ${suffix}`,
    input: true,
    tableView: false,
    dataType: 'number',
  });

  return [
    {
      ...component,
      type: 'textfield',
      key,
      input: true,
      // A dropped pin has no house number; asking for the address as text keeps it useful.
      placeholder: component.placeholder ?? 'Street address',
    },
    hidden('lat'),
    hidden('lng'),
  ];
}

function signatureToFile(
  component: JsonObject,
  path: string,
  record: (change: TransformChange) => void
): JsonObject[] {
  record({
    path,
    type: 'signature',
    rule: 'signature-to-file',
    detail: 'This build has no signature pad; captured as an image file instead.',
    severity: 'info',
  });

  return [
    {
      ...component,
      type: 'file',
      input: true,
      storage: 'url',
      multiple: false,
      filePattern: 'image/*',
      image: true,
    },
  ];
}

function highestVersion(versions: string[]): string | undefined {
  if (versions.length === 0) return undefined;
  return versions.reduce((highest, candidate) => (compare(candidate, highest) > 0 ? candidate : highest));
}

function compare(a: string, b: string): number {
  const parts = (version: string) => version.split('-')[0]!.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}
