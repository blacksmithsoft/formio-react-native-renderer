// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Text, View } from 'react-native';
import type { SchemaField } from '../../parse/types';
import { ControlBox, ValueText } from './ControlBox';
import { useControlStyles } from './controlStyles';

/** Form.io stores tags either as an array or as one comma-separated string. */
function readTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return raw.map((tag) => tag.trim()).filter(Boolean);
}

/** Chips inside the control box; with no tags it draws as an empty default control. */
export function TagsControl({ field, value }: { field: SchemaField; value: unknown }) {
  const styles = useControlStyles();
  const tags = readTags(value);

  if (tags.length === 0) {
    return (
      <ControlBox field={field}>
        <ValueText text="" field={field} />
      </ControlBox>
    );
  }

  return (
    <ControlBox field={field} style={styles.tagsBox}>
      {tags.map((tag, index) => (
        <View key={`${tag}-${index}`} style={styles.tag}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      ))}
    </ControlBox>
  );
}
