// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Text, View } from 'react-native';
import type { SchemaField } from '../../parse/types';
import { useFormioTheme } from '../../theme/FormioThemeProvider';
import type { FormioIcons } from '../../theme/FormioTheme';
import { formatFieldValue } from '../formatFieldValue';
import { ControlBox, ValueText } from './ControlBox';
import { useControlStyles } from './controlStyles';

/** The trailing icon Form.io draws inside these inputs, keyed by base type. */
const TRAILING_ICON: Record<string, keyof FormioIcons> = {
  datetime: 'calendar',
  time: 'clock',
  select: 'chevronDown',
};

/**
 * The box every text-like component draws: prefix, value or placeholder, suffix, trailing icon.
 *
 * This is also where an unrecognised type lands, which is the point — an unknown component
 * renders as a label and its value rather than disappearing.
 */
export function DefaultControl({
  field,
  value,
  type,
}: {
  field: SchemaField;
  value: unknown;
  /** The base type, already stripped of any `custom_` prefix. */
  type: string;
}) {
  const styles = useControlStyles();
  const { colors, metrics, icons } = useFormioTheme();

  // `password` components are `protected` server-side, so the value only ever means "set".
  const text = type === 'password' ? (value ? '••••••••' : '') : formatFieldValue(value, field);
  const prefix = type === 'currency' ? field.currency || field.prefix : field.prefix;
  const iconSlot = TRAILING_ICON[type];
  const Icon = iconSlot ? icons[iconSlot] : undefined;

  return (
    <ControlBox field={field} style={field.multiline ? styles.controlTextarea : undefined}>
      <View style={styles.controlRow}>
        {!!prefix && <Text style={styles.affix}>{prefix}</Text>}
        <View style={styles.controlValue}>
          <ValueText text={text} field={field} />
        </View>
        {!!field.suffix && <Text style={styles.affix}>{field.suffix}</Text>}
        {Icon && <Icon size={metrics.control.iconSize} color={colors.text.tertiary} />}
      </View>
    </ControlBox>
  );
}
