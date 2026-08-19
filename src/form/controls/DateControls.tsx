// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { formatFieldValue } from '../../render/formatFieldValue';
import { useFormioTheme } from '../../theme/FormioThemeProvider';
import type { FormioIcons } from '../../theme/FormioTheme';
import { useFormioRender, type FormioControlProps } from '../context';
import { useFormStyles } from '../formStyles';

/**
 * `datetime`, `time` and `day` — docs/COMPONENTS.md.
 *
 * A calendar widget is a native dependency, and this package has none. So the host's picker is
 * used when it supplied one through `adapters.pickDateTime`, and typing is the fallback when it
 * did not. The fallback is not a placeholder for a real implementation: a crew logging a time
 * they wrote on paper an hour ago often types faster than they scroll, and it works on every
 * build including one shipped over the air.
 */

const ICON: Record<string, keyof FormioIcons> = { datetime: 'calendar', time: 'clock' };

export function DateTimeControl({
  component,
  value,
  onChange,
  onBlur,
  errors,
  readOnly,
}: FormioControlProps) {
  const styles = useFormStyles();
  const { colors, metrics, icons } = useFormioTheme();
  const { adapters } = useFormioRender();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const { field, base } = component;
  const disabled = readOnly || field.disabled;
  const stored = typeof value === 'string' ? value : '';
  const Icon = icons[ICON[base] ?? 'calendar'];

  const open = useCallback(() => {
    if (disabled) return;
    const pick = adapters.pickDateTime;
    if (!pick) {
      setTyping(true);
      return;
    }
    void pick(component, stored)
      .then((next) => {
        // `undefined` means the host has no picker for this type; fall through to typing rather
        // than leaving a control that does nothing when tapped.
        if (next === undefined) setTyping(true);
        else if (next !== null) onChange(next);
      })
      .catch(() => setTyping(true))
      .finally(onBlur);
  }, [adapters, component, disabled, onBlur, onChange, stored]);

  if (typing && !disabled) {
    return (
      <TextInput
        style={[styles.input, errors.length > 0 && styles.inputInvalid]}
        value={draft ?? stored}
        autoFocus
        placeholder={field.placeholder ?? (base === 'time' ? 'HH:MM' : 'YYYY-MM-DD HH:MM')}
        placeholderTextColor={colors.text.placeholder}
        onChangeText={setDraft}
        onBlur={() => {
          onChange(draft ?? stored);
          setDraft(null);
          setTyping(false);
          onBlur();
        }}
      />
    );
  }

  const shown = formatFieldValue(stored, field);
  return (
    <Pressable
      style={[
        styles.pressableControl,
        errors.length > 0 && styles.inputInvalid,
        disabled && styles.inputDisabled,
      ]}
      disabled={disabled}
      onPress={open}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={shown ? styles.pressableValue : styles.pressablePlaceholder}>
        {shown || field.placeholder || ''}
      </Text>
      <Icon size={metrics.control.iconSize} color={colors.text.tertiary} />
    </Pressable>
  );
}

/**
 * `day` — Month / Day / Year sub-inputs.
 *
 * Form.io stores the value as `MM/DD/YYYY` **regardless of the display order**, so `dayFirst`
 * changes only which box is drawn first, never how the string is read or written. Getting that
 * backwards silently swaps two of the three numbers, and the result still looks like a date.
 */
export function DayControl({ component, value, onChange, onBlur, readOnly }: FormioControlProps) {
  const styles = useFormStyles();
  const { colors } = useFormioTheme();
  const { field } = component;
  const config = field.day;
  const disabled = readOnly || field.disabled;

  const [month = '', day = '', year = ''] = typeof value === 'string' ? value.split('/') : [];

  const write = (next: { month?: string; day?: string; year?: string }) => {
    const parts = [next.month ?? month, next.day ?? day, next.year ?? year];
    // An entirely blank date is stored as absent rather than as `//`, which the server reads as
    // a malformed date instead of as no answer.
    onChange(parts.every((part) => part === '') ? '' : parts.join('/'));
  };

  const cells: { key: 'month' | 'day' | 'year'; label: string; text: string; length: number }[] = [];
  const monthCell = { key: 'month' as const, label: 'Month', text: month, length: 2 };
  const dayCell = { key: 'day' as const, label: 'Day', text: day, length: 2 };

  if (config?.dayFirst) {
    if (config.showDay) cells.push(dayCell);
    if (config.showMonth) cells.push(monthCell);
  } else {
    if (config?.showMonth !== false) cells.push(monthCell);
    if (config?.showDay !== false) cells.push(dayCell);
  }
  if (config?.showYear !== false) cells.push({ key: 'year', label: 'Year', text: year, length: 4 });

  return (
    <View style={styles.dayRow}>
      {cells.map((cell) => (
        <View key={cell.key} style={styles.dayCell}>
          {!config?.hideInputLabels && <Text style={styles.subLabel}>{cell.label}</Text>}
          <TextInput
            style={[styles.input, disabled && styles.inputDisabled]}
            value={cell.text}
            editable={!disabled}
            keyboardType="number-pad"
            maxLength={cell.length}
            placeholder={cell.label}
            placeholderTextColor={colors.text.placeholder}
            onChangeText={(text) => write({ [cell.key]: text.replace(/\D/g, '') })}
            onBlur={onBlur}
          />
        </View>
      ))}
    </View>
  );
}
