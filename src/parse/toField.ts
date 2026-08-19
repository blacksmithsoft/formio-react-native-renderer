// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { baseFieldType } from './baseFieldType';
import { asString, isObject, toPositiveInt, type JsonObject } from './json';
import type {
  SchemaDayConfig,
  SchemaField,
  SchemaFieldOption,
  SchemaLabelPosition,
  SchemaSurveyConfig,
} from './types';

/** Field mapping — docs/SPEC.md §4. */

function normalizeOptions(raw: unknown): SchemaFieldOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SchemaFieldOption[] = [];
  for (const entry of raw) {
    if (!isObject(entry)) continue;
    const { value, label } = entry;
    // A blank `value` is the placeholder row the Form.io editor keeps while you type.
    if (value === undefined || value === null || value === '') continue;
    out.push({
      value: String(value),
      label: label !== undefined && label !== null ? String(label) : String(value),
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Form.io writes `top`, `bottom`, `left-left`, `left-right` or `right-left`. */
function readLabelPosition(raw: unknown): SchemaLabelPosition {
  return typeof raw === 'string' && raw.startsWith('left') ? 'left' : 'top';
}

/**
 * Only `select` keeps its choices under `data.values`; everything else uses `values`.
 *
 * Matched on the base type so a branded `custom_select` resolves its options too — matching the
 * raw type here is SPEC.md §9 gap 1.
 */
function readOptions(component: JsonObject, base: string): SchemaFieldOption[] | undefined {
  if (base === 'select') {
    const data = component.data;
    return normalizeOptions(isObject(data) ? data.values : undefined);
  }
  return normalizeOptions(component.values);
}

/** A `day` sub-input is shown unless its `fields.<name>.hide` flag is set. */
function readDayConfig(component: JsonObject, base: string): SchemaDayConfig | undefined {
  if (base !== 'day') return undefined;
  const fields = isObject(component.fields) ? component.fields : {};
  const shown = (name: string): boolean => {
    const field = fields[name];
    return !(isObject(field) && field.hide === true);
  };
  return {
    showDay: shown('day'),
    showMonth: shown('month'),
    showYear: shown('year'),
    dayFirst: component.dayFirst === true,
    hideInputLabels: component.hideInputLabels === true,
  };
}

function readSurveyConfig(component: JsonObject, base: string): SchemaSurveyConfig | undefined {
  if (base !== 'survey') return undefined;
  return {
    questions: normalizeOptions(component.questions) ?? [],
    values: normalizeOptions(component.values) ?? [],
  };
}

export function toField(component: JsonObject, key: string): SchemaField {
  const type = asString(component.type);
  const base = baseFieldType(type);
  const validate = component.validate;
  return {
    key,
    type,
    label: asString(component.label, key),
    labelPosition: readLabelPosition(component.labelPosition),
    labelWidth: toPositiveInt(component.labelWidth),
    description: asString(component.description) || undefined,
    placeholder: asString(component.placeholder) || undefined,
    multiline: base === 'textarea',
    disabled: component.disabled === true,
    required: isObject(validate) && validate.required === true,
    options: readOptions(component, base),
    inline: component.inline === true,
    prefix: asString(component.prefix) || undefined,
    suffix: asString(component.suffix) || undefined,
    currency: asString(component.currency) || undefined,
    rows: toPositiveInt(component.rows),
    footer: asString(component.footer) || undefined,
    day: readDayConfig(component, base),
    survey: readSurveyConfig(component, base),
  };
}
