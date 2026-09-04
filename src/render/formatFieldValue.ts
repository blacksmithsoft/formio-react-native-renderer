// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import type { SchemaField, SchemaFieldOption } from '../parse/types';

/**
 * Turn a stored submission value into display text — docs/SPEC.md §6.
 *
 * Pure: imports nothing from React or React Native, and returns `''` rather than a placeholder.
 * Deciding what an empty control looks like is the renderer's job, not the formatter's.
 */

const ISO_DATETIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/;

function optionLabel(options: SchemaFieldOption[] | undefined, value: string): string {
  return options?.find((option) => option.value === value)?.label ?? value;
}

function formatScalar(raw: unknown, field: SchemaField): string {
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'number') return String(raw);
  if (typeof raw !== 'string') return '';

  const isoMatch = ISO_DATETIME.exec(raw);
  if (isoMatch) {
    const [, date = '', time = ''] = isoMatch;
    // Date-only components are stored as a midnight timestamp — drop the noise.
    return time === '00:00' ? date : `${date} ${time}`;
  }
  // Makes a radio submission of `opt1` display as `Option 1`.
  return optionLabel(field.options, raw);
}

export function formatFieldValue(raw: unknown, field: SchemaField): string {
  if (raw === undefined || raw === null || raw === '') return '';

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => formatScalar(entry, field))
      .filter(Boolean)
      .join(', ');
  }

  if (typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    // Address components store the resolved place alongside the geocoder payload.
    const formatted = record.formattedPlace ?? record.formatted_address;
    if (typeof formatted === 'string') return formatted;
    if (typeof record.address === 'string' && record.address) return record.address;
    if (record.lat !== undefined && record.lng !== undefined) return `${record.lat}, ${record.lng}`;

    // selectboxes: the map holds `false` for unchecked options, so the test must be strict.
    return Object.entries(record)
      .filter(([, checked]) => checked === true)
      .map(([value]) => optionLabel(field.options, value))
      .join(', ');
  }

  return formatScalar(raw, field);
}
