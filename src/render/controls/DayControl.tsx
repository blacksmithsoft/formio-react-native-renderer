// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Text, View } from 'react-native';
import type { SchemaField } from '../../parse/types';
import { ControlBox } from './ControlBox';
import { useControlStyles } from './controlStyles';

/**
 * Month / Day / Year sub-inputs, each a default control with its own small label.
 *
 * Form.io stores a `day` value as `MM/DD/YYYY` regardless of the display order, so `dayFirst`
 * changes only which box is drawn first — never how the stored string is read. Getting that
 * backwards silently swaps two of the three numbers.
 */
export function DayControl({ field, value }: { field: SchemaField; value: unknown }) {
  const styles = useControlStyles();
  const config = field.day;
  const parts = typeof value === 'string' ? value.split('/') : [];
  const [month = '', day = '', year = ''] = parts;

  const inputs: { key: string; label: string; text: string }[] = [];
  const monthInput = { key: 'month', label: 'Month', text: month };
  const dayInput = { key: 'day', label: 'Day', text: day };
  if (config?.dayFirst) {
    if (config.showDay) inputs.push(dayInput);
    if (config.showMonth) inputs.push(monthInput);
  } else {
    if (config?.showMonth !== false) inputs.push(monthInput);
    if (config?.showDay !== false) inputs.push(dayInput);
  }
  if (config?.showYear !== false) inputs.push({ key: 'year', label: 'Year', text: year });

  return (
    <View style={styles.dayRow}>
      {inputs.map((input) => (
        <View key={input.key} style={styles.dayCell}>
          {!config?.hideInputLabels && <Text style={styles.subLabel}>{input.label}</Text>}
          <ControlBox field={field}>
            <Text style={input.text ? styles.controlText : styles.controlEmpty}>{input.text}</Text>
          </ControlBox>
        </View>
      ))}
    </View>
  );
}
