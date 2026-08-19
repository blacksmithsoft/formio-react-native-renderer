// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useRef, type ComponentType, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { SubmissionData } from '../engine/formState';
import type { FormioTelemetry } from '../engine/telemetry';
import { useFormioForm, type FormioFormInstance } from '../engine/useFormioForm';
import { FormioRenderer, SubmitBar, type FormioRendererHandle } from '../form/FormioRenderer';
import type { ComponentOverrides, FormioAdapters } from '../form/context';
import { useFormStyles } from '../form/formStyles';
import { useShellStyles } from './shellStyles';

/**
 * Layer 3 — the standalone screen. docs/FORMS.md §1.
 *
 * Everything the renderer is forbidden to own lives here: the safe area, keyboard avoidance, the
 * scroll container and the submit button. That separation is the reason the same renderer can be
 * dropped into a parent that already scrolls without nesting two scrollers or fighting over the
 * keyboard.
 *
 * The submit bar sits **outside** the scroll view. A submit button that scrolls away is a submit
 * button people cannot find, and on a long form that is most of them.
 */

export interface FormioScreenProps {
  schema: unknown;
  initialData?: SubmissionData;
  onSubmit?: (submission: { data: SubmissionData }) => void;
  onChange?: (data: SubmissionData) => void;
  readOnly?: boolean;
  submitLabel?: string;
  overrides?: ComponentOverrides;
  adapters?: FormioAdapters;
  /** Where unsupported components get reported — docs/FORMS.md §6. */
  telemetry?: FormioTelemetry;
  header?: ReactNode;
  footer?: ReactNode;
  /**
   * Defaults to a plain `View`.
   *
   * React Native's own `SafeAreaView` is iOS-only and deprecated, and
   * `react-native-safe-area-context` cannot be a dependency of a package whose contract is
   * `react` and `react-native` alone. So the host passes its own, once, and every screen in the
   * app inserts the same one.
   */
  SafeArea?: ComponentType<{ style?: StyleProp<ViewStyle>; children?: ReactNode }>;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function FormioScreen({
  schema,
  initialData,
  onSubmit,
  onChange,
  readOnly = false,
  submitLabel,
  overrides,
  adapters,
  telemetry,
  header,
  footer,
  SafeArea = View,
  style,
  contentContainerStyle,
}: FormioScreenProps) {
  const shell = useShellStyles();
  const form = useFormioForm(schema, initialData, { readOnly, onChange, telemetry });
  const rendererRef = useRef<FormioRendererHandle | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const submit = useCallback(() => {
    rendererRef.current?.submit();
  }, []);

  return (
    <SafeArea style={[shell.screen, style]}>
      <KeyboardAvoidingView
        style={shell.fill}
        // Only iOS needs this. On Android the window resizes, and adding padding on top of that
        // pushes the focused field off the screen instead of onto it.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={shell.fill}
          contentContainerStyle={[shell.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <FormioRenderer
            ref={rendererRef}
            form={form}
            scrollRef={scrollRef}
            readOnly={readOnly}
            overrides={overrides}
            adapters={adapters}
            onSubmit={onSubmit}
            header={header}
            footer={footer}
          />
        </ScrollView>

        {!readOnly && <ActionBar form={form} onSubmit={submit} label={submitLabel} />}
      </KeyboardAvoidingView>
    </SafeArea>
  );
}

/** The pinned bar. Separated so the wizard can put its own controls in the same place. */
export function ActionBar({
  form,
  onSubmit,
  label,
  children,
}: {
  form: FormioFormInstance;
  onSubmit: () => void;
  label?: string;
  children?: ReactNode;
}) {
  const shell = useShellStyles();
  const styles = useFormStyles();

  return (
    <View style={shell.actionBar}>
      <View style={styles.buttonRow}>
        {children}
        <SubmitBar form={form} onPress={onSubmit} label={label} />
      </View>
    </View>
  );
}
