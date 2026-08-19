// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { SchemaField } from '../../parse/types';
import { useControlStyles } from './controlStyles';

/** The bordered box every text-like control shares — docs/COMPONENTS.md. */
export function ControlBox({
  field,
  children,
  style,
}: {
  field: SchemaField;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useControlStyles();
  return (
    <View style={[styles.control, field.disabled && styles.controlDisabled, style]}>{children}</View>
  );
}

/**
 * An empty control shows its placeholder and nothing else. No "N/A", no dash: a column of
 * stand-ins reads as data rather than as absence, which is the difference between a renderer
 * that looks like a form and one that looks like a report.
 */
export function ValueText({ text, field }: { text: string; field: SchemaField }) {
  const styles = useControlStyles();
  return text ? (
    <Text style={styles.controlText}>{text}</Text>
  ) : (
    <Text style={styles.controlEmpty}>{field.placeholder ?? ''}</Text>
  );
}
