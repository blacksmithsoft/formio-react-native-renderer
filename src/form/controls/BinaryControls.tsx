// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useFormioRender, type CapturedFile, type FormioControlProps, type FormioFileValue } from '../context';
import { useFormStyles } from '../formStyles';

/**
 * `file` and `signature` — docs/FORMS.md §9.
 *
 * These are the two components a renderer cannot implement alone: capture needs the camera, the
 * document picker and the filesystem, all of which are native modules and none of which belong
 * in a package whose entire contract is `react` and `react-native`. So capture is a host
 * adapter, and this file is what happens around it.
 *
 * The important behaviour is what happens when the adapter is *missing*. The control still
 * renders, still shows every file already attached, and says plainly that capture is
 * unavailable. It never throws and never disappears — a form that hides its own file field is
 * one nobody can report as broken.
 */

function readFiles(value: unknown): FormioFileValue[] {
  if (Array.isArray(value)) return value.filter(isFileValue);
  return isFileValue(value) ? [value] : [];
}

function isFileValue(value: unknown): value is FormioFileValue {
  return value !== null && typeof value === 'object' && typeof (value as FormioFileValue).name === 'string';
}

function toFileValue(file: CapturedFile): FormioFileValue {
  return {
    storage: 'local',
    name: file.name,
    originalName: file.name,
    size: file.size,
    type: file.type,
    localUri: file.uri,
  };
}

function describe(file: FormioFileValue): string {
  if (file.size === undefined) return file.name;
  const kb = file.size / 1024;
  return kb < 1024 ? `${file.name} · ${Math.round(kb)} KB` : `${file.name} · ${(kb / 1024).toFixed(1)} MB`;
}

/** A labelled action. Kept local so the controls do not each invent their own button. */
function ActionButton({
  label,
  onPress,
  disabled,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const styles = useFormStyles();
  return (
    <Pressable
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text
        style={[
          styles.buttonLabel,
          secondary && styles.buttonLabelSecondary,
          disabled && styles.buttonLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FileControl({ component, value, onChange, onBlur, readOnly }: FormioControlProps) {
  const styles = useFormStyles();
  const { adapters } = useFormioRender();
  const [busy, setBusy] = useState(false);

  const disabled = readOnly || component.field.disabled;
  const files = readFiles(value);
  const multiple = component.file?.multiple ?? false;
  const canCapture = typeof adapters.pickFiles === 'function';

  const add = useCallback(() => {
    const pick = adapters.pickFiles;
    if (!pick || disabled) return;
    setBusy(true);
    void pick(component)
      .then((picked) => {
        if (picked.length === 0) return;
        const added = picked.map(toFileValue);
        onChange(multiple ? [...files, ...added] : added.slice(0, 1));
      })
      // A cancelled or failed pick leaves the existing attachments alone. There is nothing
      // useful to say to a user who has just dismissed their own file picker.
      .catch(() => undefined)
      .finally(() => {
        setBusy(false);
        onBlur();
      });
  }, [adapters, component, disabled, files, multiple, onBlur, onChange]);

  const remove = (index: number) => {
    onChange(files.filter((_, position) => position !== index));
    onBlur();
  };

  return (
    <View>
      {files.map((file, index) => (
        <View key={`${file.name}-${index}`} style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.chipText}>{describe(file)}</Text>
            {!disabled && (
              <Pressable onPress={() => remove(index)} accessibilityRole="button">
                <Text style={styles.chipRemove}>Remove</Text>
              </Pressable>
            )}
          </View>
          {file.storage === 'local' && (
            <Text style={styles.hint}>Saved on this device. It will upload when you are back online.</Text>
          )}
        </View>
      ))}

      {!disabled &&
        (canCapture ? (
          (multiple || files.length === 0) && (
            <ActionButton
              label={busy ? 'Opening…' : component.file?.imageOnly ? 'Add photo' : 'Add file'}
              onPress={add}
              disabled={busy}
              secondary
            />
          )
        ) : (
          <Text style={styles.hint}>
            Attaching files needs a newer version of this app. Existing attachments are shown above.
          </Text>
        ))}
    </View>
  );
}

/**
 * `signature`.
 *
 * The stored value is whatever the web stores — a data URL — when the host returns one, so a
 * signature captured on a phone renders in the web viewer with no translation. A host whose
 * signatures are large enough to bloat the submission may return a captured file instead, and it
 * then rides the same two-phase upload as any other binary.
 */
export function SignatureControl({
  component,
  value,
  onChange,
  onBlur,
  readOnly,
}: FormioControlProps) {
  const styles = useFormStyles();
  const { adapters } = useFormioRender();
  const [busy, setBusy] = useState(false);

  const disabled = readOnly || component.field.disabled;
  const canCapture = typeof adapters.captureSignature === 'function';

  const dataUrl = typeof value === 'string' && value.startsWith('data:image') ? value : '';
  const file = isFileValue(value) ? value : undefined;
  const uri = dataUrl || (file ? (adapters.resolveFileUri?.(file) ?? file.localUri ?? file.url ?? '') : '');
  const signed = !!uri;

  const capture = useCallback(() => {
    const sign = adapters.captureSignature;
    if (!sign || disabled) return;
    setBusy(true);
    void sign(component)
      .then((result) => {
        if (result === null) return;
        onChange(typeof result === 'string' ? result : toFileValue(result));
      })
      .catch(() => undefined)
      .finally(() => {
        setBusy(false);
        onBlur();
      });
  }, [adapters, component, disabled, onBlur, onChange]);

  return (
    <View>
      <Pressable
        style={styles.signaturePad}
        disabled={disabled || !canCapture}
        onPress={capture}
        accessibilityRole="button"
        accessibilityLabel={signed ? 'Signed. Tap to sign again.' : 'Tap to sign'}
      >
        {signed ? (
          <Image source={{ uri }} style={styles.signatureImage} resizeMode="contain" />
        ) : (
          <Text style={styles.hint}>
            {canCapture ? (busy ? 'Opening…' : 'Tap to sign') : 'Signing needs a newer version of this app'}
          </Text>
        )}
      </Pressable>

      <Text style={styles.signatureCaption}>{component.field.footer || 'Sign above'}</Text>

      {signed && !disabled && (
        <View style={styles.buttonRow}>
          <ActionButton
            label="Clear"
            secondary
            onPress={() => {
              onChange('');
              onBlur();
            }}
          />
        </View>
      )}
    </View>
  );
}
