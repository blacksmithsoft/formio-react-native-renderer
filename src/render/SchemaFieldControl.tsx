// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { baseFieldType } from '../parse/baseFieldType';
import type { SchemaField } from '../parse/types';
import { CheckboxControl } from './controls/CheckboxControl';
import { DayControl } from './controls/DayControl';
import { DefaultControl } from './controls/DefaultControl';
import { OptionList } from './controls/OptionList';
import { SignatureControl } from './controls/SignatureControl';
import { SurveyControl } from './controls/SurveyControl';
import { TagsControl } from './controls/TagsControl';

/**
 * Draws one Form.io component the way the web renderer draws it — docs/COMPONENTS.md.
 *
 * Read-only: controls show their value and take no input, and `disabled` gets the greyed
 * treatment rather than blocked touches. Public so a host can keep the renderer's layout and
 * substitute its own widget for one field type.
 */

/** Types that draw their own label. Form.io puts a checkbox label beside the box. */
export function isSelfLabelled(field: SchemaField): boolean {
  return baseFieldType(field.type) === 'checkbox';
}

/** Checked keys of a `selectboxes` submission (`{ a: true, b: false }`). */
function checkedValues(raw: unknown): Set<string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return new Set();
  return new Set(
    Object.entries(raw as Record<string, unknown>)
      .filter(([, checked]) => checked === true)
      .map(([value]) => value)
  );
}

export interface SchemaFieldControlProps {
  field: SchemaField;
  /** The submission value for `field.key`. */
  value?: unknown;
}

export function SchemaFieldControl({ field, value }: SchemaFieldControlProps) {
  // Branded backend types behave exactly like the component they wrap, so the switch is on the
  // base type — `custom_radio` must draw a radio group, not fall through to a text box.
  const type = baseFieldType(field.type);

  switch (type) {
    case 'signature':
      return <SignatureControl field={field} value={value} />;

    case 'day':
      return <DayControl field={field} value={value} />;

    case 'survey':
      return <SurveyControl field={field} value={value} />;

    case 'tags':
      return <TagsControl field={field} value={value} />;

    case 'checkbox':
      return <CheckboxControl field={field} value={value} />;

    case 'radio':
      return (
        <OptionList
          options={field.options ?? []}
          selected={new Set(value === undefined || value === null ? [] : [String(value)])}
          inline={field.inline}
          radio
        />
      );

    case 'selectboxes':
      return (
        <OptionList
          options={field.options ?? []}
          selected={checkedValues(value)}
          inline={field.inline}
          radio={false}
        />
      );

    default:
      return <DefaultControl field={field} value={value} type={type} />;
  }
}

export default SchemaFieldControl;
