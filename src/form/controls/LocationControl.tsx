// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { FormioControlProps } from '../context';
import { useFormStyles } from '../formStyles';
import { useFormioTheme } from '../../theme/FormioThemeProvider';

/**
 * Form.io `location` — a place name plus coordinates.
 *
 * The web widget is a map. Offline, the useful part of that answer is the string and the pin,
 * so this control captures both without a native map module. A host can still override the type
 * with a real picker through `overrides.byType.location`.
 */

export interface LocationValue {
  address: string;
  lat?: number;
  lng?: number;
}

function asLocation(value: unknown): LocationValue {
  if (typeof value === 'string') return { address: value };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { address: '' };
  const record = value as Record<string, unknown>;
  const address =
    typeof record.address === 'string'
      ? record.address
      : typeof record.formattedPlace === 'string'
        ? record.formattedPlace
        : typeof record.formatted_address === 'string'
          ? record.formatted_address
          : '';
  return {
    address,
    lat: asCoord(record.lat ?? record.latitude),
    lng: asCoord(record.lng ?? record.longitude),
  };
}

function asCoord(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseCoord(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function LocationControl({ value, onChange, onBlur, errors, readOnly, component }: FormioControlProps) {
  const styles = useFormStyles();
  const { colors } = useFormioTheme();
  const location = asLocation(value);
  const [latDraft, setLatDraft] = useState<string | null>(null);
  const [lngDraft, setLngDraft] = useState<string | null>(null);
  const disabled = readOnly || component.field.disabled;
  const invalid = errors.length > 0;

  const commit = (next: LocationValue): void => {
    onChange(
      next.address || next.lat !== undefined || next.lng !== undefined
        ? { address: next.address, lat: next.lat, lng: next.lng }
        : undefined
    );
  };

  const coordInput = (
    label: string,
    text: string,
    setDraft: (value: string | null) => void,
    apply: (parsed: number | undefined) => void
  ) => (
    <View style={styles.leftControl}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          styles.controlSpacing,
          invalid && styles.inputInvalid,
          disabled && styles.inputDisabled,
        ]}
        value={text}
        editable={!disabled}
        keyboardType="decimal-pad"
        onChangeText={setDraft}
        onBlur={() => {
          apply(parseCoord(text));
          setDraft(null);
          onBlur();
        }}
      />
    </View>
  );

  return (
    <View>
      <TextInput
        style={[styles.input, invalid && styles.inputInvalid, disabled && styles.inputDisabled]}
        value={location.address}
        editable={!disabled}
        placeholder={component.field.placeholder || 'Place or landmark'}
        placeholderTextColor={colors.text.placeholder}
        onChangeText={(address) => commit({ ...location, address })}
        onBlur={onBlur}
      />
      <View style={[styles.leftLabelRow, styles.controlSpacing]}>
        {coordInput('Latitude', latDraft ?? (location.lat === undefined ? '' : String(location.lat)), setLatDraft, (lat) =>
          commit({ ...location, lat })
        )}
        {coordInput('Longitude', lngDraft ?? (location.lng === undefined ? '' : String(location.lng)), setLngDraft, (lng) =>
          commit({ ...location, lng })
        )}
      </View>
    </View>
  );
}
