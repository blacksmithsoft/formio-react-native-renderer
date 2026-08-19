// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Text, View } from 'react-native';
import type { SchemaField } from '../../parse/types';
import { Mark } from './Mark';
import { useControlStyles } from './controlStyles';

/**
 * Backends are inconsistent about serialising booleans, and a strict `=== true` would leave real
 * checked boxes looking empty.
 */
function isChecked(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

/** A box with the field's own label beside it. The renderer draws no label above this control. */
export function CheckboxControl({ field, value }: { field: SchemaField; value: unknown }) {
  const styles = useControlStyles();
  return (
    <View style={styles.option}>
      <Mark checked={isChecked(value)} />
      <Text style={styles.optionLabel}>{field.label}</Text>
    </View>
  );
}
