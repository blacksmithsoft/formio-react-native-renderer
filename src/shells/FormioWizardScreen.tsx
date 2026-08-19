// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { collectErrors, pathsIn, type SubmissionData } from '../engine/formState';
import type { FormioTelemetry } from '../engine/telemetry';
import { useFormioForm } from '../engine/useFormioForm';
import { FormioRenderer, SubmitBar, type FormioRendererHandle } from '../form/FormioRenderer';
import type { ComponentOverrides, FormioAdapters } from '../form/context';
import { useFormStyles } from '../form/formStyles';
import { useShellStyles } from './shellStyles';
import { splitWizardPages } from './wizardPages';

/**
 * Layer 3 — the wizard shell. docs/FORMS.md §8.
 *
 * A `display: "wizard"` form is special-cased rather than flattened, because one page per screen
 * is a better fit for a phone than the web version is, and flattening would throw away structure
 * the author deliberately created.
 *
 * Two behaviours are worth stating, because both are easy to get wrong and neither is visible in
 * a screenshot:
 *
 * **The engine holds the whole submission at all times.** Only the current page is *rendered*.
 * If pages were mounted and unmounted as separate forms, `clearOnHide` would strip every answer
 * on the pages that are off screen.
 *
 * **Advancing validates only the page you are on.** Calling full validation on every Next would
 * light up pages the user has not reached, which reads as a form rejecting itself before it has
 * been filled in.
 */

export interface FormioWizardScreenProps {
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
  /** See the note on `FormioScreen`. Defaults to a plain `View`. */
  SafeArea?: ComponentType<{ style?: StyleProp<ViewStyle>; children?: ReactNode }>;
  style?: StyleProp<ViewStyle>;
}

export function FormioWizardScreen({
  schema,
  initialData,
  onSubmit,
  onChange,
  readOnly = false,
  submitLabel,
  overrides,
  adapters,
  telemetry,
  SafeArea = View,
  style,
}: FormioWizardScreenProps) {
  const shell = useShellStyles();
  const styles = useFormStyles();

  const form = useFormioForm(schema, initialData, { readOnly, onChange, telemetry });
  const rendererRef = useRef<FormioRendererHandle | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const [index, setIndex] = useState(0);

  const pages = useMemo(() => splitWizardPages(form.form), [form.form]);
  const page = pages[Math.min(index, pages.length - 1)];
  const isLast = index >= pages.length - 1;

  const goTo = useCallback((next: number) => {
    setIndex(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const next = useCallback(() => {
    if (!page) return;
    // Reveal only this page's fields, then ask whether this page is clean.
    form.touchMany(pathsIn(page.components, form.data));
    const pageErrors = collectErrors(page.components, form.data);
    if (Object.keys(pageErrors).length > 0) {
      rendererRef.current?.scrollToFirstError();
      return;
    }
    goTo(index + 1);
  }, [form, goTo, index, page]);

  const submit = useCallback(() => {
    rendererRef.current?.submit();
  }, []);

  return (
    <SafeArea style={[shell.screen, style]}>
      <KeyboardAvoidingView
        style={shell.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={shell.fill}
          contentContainerStyle={shell.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <FormioRenderer
            ref={rendererRef}
            form={form}
            components={page?.components}
            scrollRef={scrollRef}
            readOnly={readOnly}
            overrides={overrides}
            adapters={adapters}
            onSubmit={onSubmit}
            header={
              <>
                <Progress index={index} total={pages.length} />
                {!!page?.title && <Text style={shell.pageTitle}>{page.title}</Text>}
              </>
            }
          />
        </ScrollView>

        {!readOnly && (
          <View style={shell.actionBar}>
            <View style={styles.buttonRow}>
              {index > 0 && (
                <Pressable
                  style={[styles.button, styles.buttonSecondary]}
                  onPress={() => goTo(index - 1)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.buttonLabel, styles.buttonLabelSecondary]}>Back</Text>
                </Pressable>
              )}

              {isLast ? (
                <SubmitBar form={form} onPress={submit} label={submitLabel} />
              ) : (
                <Pressable
                  style={[styles.button, styles.submitButton]}
                  onPress={next}
                  accessibilityRole="button"
                >
                  <Text style={styles.buttonLabel}>Next</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeArea>
  );
}

/** A bar and a count. Enough to answer "how much of this is left", which is the only question. */
function Progress({ index, total }: { index: number; total: number }) {
  const shell = useShellStyles();
  const percent = total <= 1 ? 100 : ((index + 1) / total) * 100;

  return (
    <View style={shell.progressRow}>
      <View style={shell.progressTrack}>
        <View style={[shell.progressFill, { width: `${percent}%` }]} />
      </View>
      <Text style={shell.progressLabel}>{`${index + 1} / ${total}`}</Text>
    </View>
  );
}
