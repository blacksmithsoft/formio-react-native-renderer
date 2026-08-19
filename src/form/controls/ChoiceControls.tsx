// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { SchemaFieldOption } from '../../parse/types';
import { Mark } from '../../render/controls/Mark';
import { useFormioTheme } from '../../theme/FormioThemeProvider';
import { useFormioRender, type FormioControlProps } from '../context';
import { useFormStyles } from '../formStyles';

/**
 * `checkbox`, `radio`, `selectboxes` and `select` — docs/COMPONENTS.md.
 *
 * The mark itself is reused from the read-only renderer, so a checked box looks identical
 * whether the form is being filled in or being read back. Only the tap handling is new.
 */

function options(component: FormioControlProps['component']): SchemaFieldOption[] {
  return component.field.options ?? [];
}

/** A tap target wrapping a mark and its label. Disabled rows still draw, greyed, and do nothing. */
function OptionRow({
  label,
  checked,
  radio,
  disabled,
  onPress,
}: {
  label: string;
  checked: boolean;
  radio: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useFormStyles();
  return (
    <Pressable
      style={styles.option}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={{ checked, disabled }}
    >
      <Mark checked={checked} radio={radio} />
      <Text style={styles.optionLabel}>{label}</Text>
    </Pressable>
  );
}

export function CheckboxControl({ component, value, onChange, onBlur, readOnly }: FormioControlProps) {
  const { field } = component;
  const disabled = readOnly || field.disabled;
  // Backends are inconsistent about serialising booleans, and a strict `=== true` would leave a
  // genuinely checked box looking empty.
  const checked = value === true || value === 'true' || value === 1;

  return (
    <OptionRow
      label={field.label}
      checked={checked}
      radio={false}
      disabled={disabled}
      onPress={() => {
        onChange(!checked);
        onBlur();
      }}
    />
  );
}

export function RadioControl({ component, value, onChange, onBlur, readOnly }: FormioControlProps) {
  const styles = useFormStyles();
  const { field } = component;
  const disabled = readOnly || field.disabled;
  const selected = value === undefined || value === null ? '' : String(value);

  return (
    <View style={field.inline ? styles.optionsInline : undefined}>
      {options(component).map((option) => (
        <OptionRow
          key={option.value}
          label={option.label}
          checked={selected === option.value}
          radio
          disabled={disabled}
          onPress={() => {
            // Tapping the selected radio clears it. Form.io allows this and it is the only way
            // to un-answer an optional radio group on a touch screen.
            onChange(selected === option.value ? '' : option.value);
            onBlur();
          }}
        />
      ))}
    </View>
  );
}

export function SelectBoxesControl({
  component,
  value,
  onChange,
  onBlur,
  readOnly,
}: FormioControlProps) {
  const styles = useFormStyles();
  const { field } = component;
  const disabled = readOnly || field.disabled;
  const map = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return (
    <View style={field.inline ? styles.optionsInline : undefined}>
      {options(component).map((option) => (
        <OptionRow
          key={option.value}
          label={option.label}
          checked={map[option.value] === true}
          radio={false}
          disabled={disabled}
          onPress={() => {
            // The whole map is written back, including the `false` entries. Form.io's server
            // expects every option to be present, and sending only the ticked ones is read as
            // the others having been removed.
            const next: Record<string, boolean> = {};
            for (const entry of options(component)) {
              next[entry.value] = entry.value === option.value ? map[entry.value] !== true : map[entry.value] === true;
            }
            onChange(next);
            onBlur();
          }}
        />
      ))}
    </View>
  );
}

/**
 * `select`.
 *
 * A native picker is a native dependency, so the package ships two OTA-safe behaviours instead:
 * the host's own picker when it supplied one through `adapters.pickOption`, and an inline
 * expanding list when it did not. The inline list is not a downgrade on a phone — it is one tap
 * fewer than a modal and it works with the schema's own option order.
 */
export function SelectControl(props: FormioControlProps) {
  const { component, value, onChange, onBlur, readOnly, errors } = props;
  const styles = useFormStyles();
  const { colors, metrics, icons } = useFormioTheme();
  const { adapters } = useFormioRender();
  const [open, setOpen] = useState(false);

  const { field } = component;
  const disabled = readOnly || field.disabled;
  const list = options(component);
  const selected = value === undefined || value === null ? '' : String(value);
  const selectedLabel = list.find((option) => option.value === selected)?.label ?? selected;
  const Chevron = icons.chevronDown;

  const openPicker = useCallback(() => {
    if (disabled) return;
    const pick = adapters.pickOption;
    if (!pick) {
      setOpen((current) => !current);
      return;
    }
    void pick(component, list, selected)
      .then((choice) => {
        // `undefined` means the host declined to present anything; fall back to the inline list
        // rather than leaving a control that does nothing when tapped.
        if (choice === undefined) setOpen((current) => !current);
        else if (choice !== null) onChange(choice);
      })
      .catch(() => setOpen((current) => !current))
      .finally(onBlur);
  }, [adapters, component, disabled, list, onBlur, onChange, selected]);

  return (
    <View>
      <Pressable
        style={[
          styles.pressableControl,
          errors.length > 0 && styles.inputInvalid,
          disabled && styles.inputDisabled,
        ]}
        disabled={disabled}
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
      >
        <Text style={selectedLabel ? styles.pressableValue : styles.pressablePlaceholder}>
          {selectedLabel || field.placeholder || ''}
        </Text>
        <Chevron size={metrics.control.iconSize} color={colors.text.tertiary} />
      </Pressable>

      {open && !disabled && (
        <View style={styles.controlSpacing}>
          {list.length === 0 ? (
            <Text style={styles.hint}>No choices are available offline for this field.</Text>
          ) : (
            list.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                checked={selected === option.value}
                radio
                disabled={false}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                  onBlur();
                }}
              />
            ))
          )}
        </View>
      )}
    </View>
  );
}
