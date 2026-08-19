// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import type { FormioControlProps } from '../context';
import { useFormStyles } from '../formStyles';
import { useFormioTheme } from '../../theme/FormioThemeProvider';

/**
 * The text-entry control behind eight component types — docs/COMPONENTS.md.
 *
 * `textfield`, `textarea`, `number`, `currency`, `email`, `url`, `phoneNumber` and `password`
 * differ on the web only in keyboard, mask and validation. Validation lives in the engine and
 * the mask is not reproduced, so what is left here is the keyboard and the addons. One control
 * with a lookup table is honest about that; eight near-identical files would not be.
 */

const KEYBOARD: Record<string, KeyboardTypeOptions> = {
  number: 'numeric',
  currency: 'decimal-pad',
  email: 'email-address',
  url: 'url',
  phoneNumber: 'phone-pad',
};

/**
 * Types where the platform's own autocorrect actively harms the answer: an asset tag becomes a
 * dictionary word, an email gets a capital letter, a URL gets a space.
 */
const NO_ASSIST = new Set(['email', 'url', 'password', 'number', 'currency', 'phoneNumber']);

/**
 * Keep the raw text the user typed while the field has focus.
 *
 * A number field that parses on every keystroke cannot be typed into: `1.` parses to `1`, the
 * value written back is `1`, and the decimal point disappears from under the cursor. So the
 * string is held locally and committed as a number on blur.
 */
function useDraft(value: unknown, numeric: boolean) {
  const [draft, setDraft] = useState<string | null>(null);
  const committed = value === undefined || value === null ? '' : String(value);
  return {
    text: draft ?? committed,
    setDraft,
    /** What to store for a given piece of text. */
    parse: (text: string): unknown => {
      if (!numeric) return text;
      if (text.trim() === '') return undefined;
      const parsed = Number(text);
      // A half-typed or genuinely non-numeric entry is stored as text so validation can report
      // it, rather than being silently swallowed into NaN.
      return Number.isFinite(parsed) ? parsed : text;
    },
  };
}

export function TextControl({
  component,
  value,
  onChange,
  onBlur,
  errors,
  readOnly,
}: FormioControlProps) {
  const styles = useFormStyles();
  const { colors } = useFormioTheme();
  const [focused, setFocused] = useState(false);

  const { field, base } = component;
  const numeric = base === 'number' || base === 'currency';
  const { text, setDraft, parse } = useDraft(value, numeric);
  const disabled = readOnly || field.disabled;

  const prefix = base === 'currency' ? field.currency || field.prefix : field.prefix;
  const invalid = errors.length > 0;

  const inputStyle = [
    styles.input,
    field.multiline && styles.inputMultiline,
    focused && !invalid && styles.inputFocused,
    invalid && styles.inputInvalid,
    disabled && styles.inputDisabled,
  ];

  const input = (
    <TextInput
      style={prefix || field.suffix ? styles.affixInput : inputStyle}
      value={text}
      editable={!disabled}
      placeholder={field.placeholder}
      placeholderTextColor={colors.text.placeholder}
      multiline={field.multiline}
      // An authored row count is a real intent — a 10-row textarea is asking for a paragraph.
      numberOfLines={field.multiline ? field.rows : undefined}
      secureTextEntry={base === 'password'}
      keyboardType={KEYBOARD[base]}
      autoCapitalize={NO_ASSIST.has(base) ? 'none' : 'sentences'}
      autoCorrect={!NO_ASSIST.has(base)}
      maxLength={component.validate.maxLength}
      onChangeText={setDraft}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setDraft(null);
        onChange(parse(text));
        onBlur();
      }}
    />
  );

  if (!prefix && !field.suffix) return input;

  return (
    <View
      style={[
        styles.affixRow,
        focused && !invalid && styles.inputFocused,
        invalid && styles.inputInvalid,
        disabled && styles.inputDisabled,
      ]}
    >
      {!!prefix && <Text style={styles.affix}>{prefix}</Text>}
      {input}
      {!!field.suffix && <Text style={styles.affix}>{field.suffix}</Text>}
    </View>
  );
}
