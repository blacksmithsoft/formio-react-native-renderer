// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFormioTheme } from '../../theme/FormioThemeProvider';
import type { FormioControlProps } from '../context';
import { useFormStyles } from '../formStyles';

/**
 * `tags` — chips plus an entry box.
 *
 * Form.io stores tags either as an array or as one comma-separated string, depending on the
 * component's `storeas`. Whichever came in is what goes back out: rewriting the shape would make
 * the submission disagree with what the web renderer produces for the same form.
 */

function readTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return raw.map((tag) => tag.trim()).filter(Boolean);
}

export function TagsControl({ component, value, onChange, onBlur, readOnly }: FormioControlProps) {
  const styles = useFormStyles();
  const { colors } = useFormioTheme();
  const [draft, setDraft] = useState('');

  const { field } = component;
  const disabled = readOnly || field.disabled;
  const tags = readTags(value);
  const storedAsString = typeof value === 'string';

  const write = (next: string[]) => onChange(storedAsString ? next.join(',') : next);

  const commit = () => {
    const entered = draft
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag) => !tags.includes(tag));
    setDraft('');
    if (entered.length > 0) write([...tags, ...entered]);
    onBlur();
  };

  return (
    <View>
      {tags.length > 0 && (
        <View style={[styles.chipRow, styles.controlSpacing]}>
          {tags.map((tag) => (
            <Pressable
              key={tag}
              style={styles.chip}
              disabled={disabled}
              onPress={() => write(tags.filter((entry) => entry !== tag))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${tag}`}
            >
              <Text style={styles.chipText}>{tag}</Text>
              {!disabled && <Text style={styles.chipRemove}>{'\u00D7'}</Text>}
            </Pressable>
          ))}
        </View>
      )}
      {!disabled && (
        <TextInput
          style={[styles.input, styles.controlSpacing]}
          value={draft}
          placeholder={field.placeholder ?? 'Add a tag'}
          placeholderTextColor={colors.text.placeholder}
          autoCapitalize="none"
          returnKeyType="done"
          onChangeText={setDraft}
          onSubmitEditing={commit}
          onBlur={commit}
        />
      )}
    </View>
  );
}
