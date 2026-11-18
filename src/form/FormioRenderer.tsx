// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { SubmissionData } from '../engine/formState';
import type { FormioTelemetry } from '../engine/telemetry';
import { forEachInstance } from '../engine/traverse';
import type { FormComponent, FormDefinition } from '../engine/types';
import { useFormioForm, type FormioFormInstance } from '../engine/useFormioForm';
import { FormioResolvedThemeProvider, useFormioTheme } from '../theme/FormioThemeProvider';
import { resolvePhoneTheme } from '../theme/mergeTheme';
import { NodeList } from './ComponentRenderer';
import {
  createContainerWidthStore,
  FormioContainerWidthContext,
  FormioRenderProvider,
  type ComponentOverrides,
  type FieldRegistration,
  type FormioAdapters,
  type FormScrollMetrics,
  type FormScrollable,
  scrollContentHost,
  type SectionRegistration,
} from './context';
import { useFormStyles } from './formStyles';
import { FormioLayoutProvider, useResolvedLayout, type FormioLayoutPreference } from './layoutMode';

/**
 * Layer 2 — the pure renderer. docs/FORMS.md §1.
 *
 * It renders into whatever the parent provides and owns no layout container beyond a plain
 * `View`. Scroll, safe area, keyboard avoidance and the submit button all belong to the shell,
 * because the same renderer has to work embedded inside a parent's existing `ScrollView` — two
 * nested vertical scrollers break gestures, and two `KeyboardAvoidingView`s fight each other.
 *
 * `scrollable` and `showSubmit` exist for the standalone case and both default to `false`. If
 * you are setting either one inside a parent that already scrolls, that is the bug.
 */

/** What a parent that owns the save action can drive from outside. */
export interface FormioRendererHandle {
  /** Validate, reveal errors, scroll to the first one, and return the submission if it passed. */
  submit: () => { data: SubmissionData } | null;
  validate: () => boolean;
  getData: () => SubmissionData;
  reset: (data?: SubmissionData) => void;
  /** Reveal the first field with an error. Returns whether anything was scrolled to. */
  scrollToFirstError: () => boolean;
  /** Non-empty when an unsupported component makes the form non-submittable — §6. */
  getBlockingIssues: () => FormDefinition['issues'];
}

/** Minimal structural type for the scroll container, so hosts can pass any of the RN scrollers. */
interface Scrollable extends FormScrollable {
  scrollTo?: (options: { y?: number; x?: number; animated?: boolean }) => void;
}

export interface FormioRendererProps {
  /** A raw Form.io schema. Ignored when `form` is supplied. */
  schema?: unknown;
  /** An engine instance from `useFormioForm`, when the parent needs to share the state. */
  form?: FormioFormInstance;
  /**
   * Render only these top-level components instead of the whole form. The wizard shell uses it
   * to draw one page at a time; the engine still holds and validates the entire submission,
   * which is what keeps a value from being cleared while its page is off screen.
   */
  components?: FormComponent[];
  /** DEFAULT false — the parent owns scroll. */
  scrollable?: boolean;
  /** DEFAULT false — the parent may own the action. */
  showSubmit?: boolean;
  readOnly?: boolean;
  /**
   * DEFAULT `'auto'` — the phone layout below `phone.breakpoint` of measured width, the wide
   * layout at or above it. Pin `'phone'` or `'wide'` only when the host knows better than the
   * width does: a preview that must show the phone form in a wide pane, say.
   */
  layout?: FormioLayoutPreference;
  /**
   * The parent's scroll container, so `scrollToFirstError` works while embedded. Without it, a
   * failed validation on a long form leaves the user looking at a screen with no visible error.
   */
  scrollRef?: { current: Scrollable | null };
  /**
   * Live host-scroll position, so a long data grid can mount only the rows on screen. A store
   * rather than state: putting `y` on context would re-render every field on every frame.
   */
  scrollMetrics?: FormScrollMetrics;
  overrides?: ComponentOverrides;
  adapters?: FormioAdapters;
  /**
   * Where unsupported components get reported — §6.
   *
   * Ignored when `form` is supplied, since that engine already has its own sink. Without this,
   * the only record that a form met a type it could not draw is the placeholder on one worker's
   * screen, and they have no way to tell anyone what it said.
   */
  telemetry?: FormioTelemetry;
  onSubmit?: (submission: { data: SubmissionData }) => void;
  /** Drawn above the components. Used by the wizard shell for its progress indicator. */
  header?: ReactNode;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

const NO_OVERRIDES: ComponentOverrides = {};
const NO_ADAPTERS: FormioAdapters = {};

/** Space left above a revealed field so it does not sit flush against the top edge. */
const SCROLL_MARGIN = 24;

function FormioRendererImpl(props: FormioRendererProps, ref: Ref<FormioRendererHandle>) {
  const {
    schema,
    form: provided,
    components,
    scrollable = false,
    showSubmit = false,
    readOnly = false,
    layout: layoutPreference = 'auto',
    scrollRef,
    scrollMetrics,
    overrides = NO_OVERRIDES,
    adapters = NO_ADAPTERS,
    telemetry,
    onSubmit,
    header,
    footer,
    style,
    contentContainerStyle,
  } = props;

  // The hook cannot be called conditionally, so it always runs; when the parent supplied an
  // engine this one is handed `undefined`, which parses to an empty form and costs nothing.
  const own = useFormioForm(provided ? undefined : schema, undefined, { readOnly, telemetry });
  const form = provided ?? own;

  // A store, not state: a rotation re-renders only the components that read the width.
  const [widthStore] = useState(createContainerWidthStore);
  const fields = useRef(new Map<string, FieldRegistration>());
  const sections = useRef(new Set<SectionRegistration>());
  const innerScroll = useRef<Scrollable | null>(null);
  /** The errored path a closed card was opened for, until its field mounts and can be measured. */
  const pendingReveal = useRef<string | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The layout follows the space the form was given, and the phone layout brings its own
  // metrics with it — docs/FORMS.md §8.
  const theme = useFormioTheme();
  const layout = useResolvedLayout(layoutPreference, widthStore, theme.metrics.phone.breakpoint);
  const activeTheme = layout === 'phone' ? resolvePhoneTheme(theme) : theme;

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => widthStore.set(event.nativeEvent.layout.width),
    [widthStore]
  );

  const scrollToRegistration = useCallback(
    (registration: FieldRegistration): boolean => {
      const target = scrollRef?.current ?? innerScroll.current;
      if (!target || typeof target.scrollTo !== 'function') return false;

      // Fabric wants a host instance (`getInnerViewRef`). Paper tags (`getInnerViewNode`) are
      // skipped. The scroller itself is last so a host mock that only has `scrollTo` still works.
      const relativeTo = scrollContentHost(target) ?? target;

      registration.measure(
        relativeTo,
        (y) => target.scrollTo?.({ y: Math.max(y - SCROLL_MARGIN, 0), animated: true }),
        () => undefined
      );
      return true;
    },
    [scrollRef]
  );

  const registerField = useCallback(
    (path: string, registration: FieldRegistration | null) => {
      if (!registration) {
        fields.current.delete(path);
        return;
      }
      fields.current.set(path, registration);
      if (pendingReveal.current !== path) return;

      // The field a card was opened for has just mounted. It registers from an effect, before
      // the card around it has necessarily been laid out, so the measurement waits one tick.
      pendingReveal.current = null;
      clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => scrollToRegistration(registration), 0);
    },
    [scrollToRegistration]
  );

  const registerSection = useCallback((section: SectionRegistration) => {
    sections.current.add(section);
    return () => {
      sections.current.delete(section);
    };
  }, []);

  useEffect(() => () => clearTimeout(revealTimer.current), []);

  /**
   * The errored path highest on the screen.
   *
   * Document order comes from walking the form against its data rather than from the
   * registration map: registration order is mount order, and a conditional that reveals a field
   * mid-form would put it last.
   */
  const firstErrorPath = useCallback((): string | null => {
    const errors = form.errors;
    if (Object.keys(errors).length === 0) return null;
    let found: string | null = null;
    forEachInstance(form.form.components, form.data, ({ path, visible }) => {
      if (found || !visible || !path) return;
      if (errors[path]?.length) found = path;
    });
    return found ?? Object.keys(errors)[0] ?? null;
  }, [form]);

  const scrollToFirstError = useCallback((): boolean => {
    const path = firstErrorPath();
    if (!path) return false;
    const registration = fields.current.get(path);
    if (registration) return scrollToRegistration(registration);

    // Not mounted. On a phone that means its card is closed: a closed card draws no fields, so
    // there is nothing to measure yet. Open every card that holds the path — a nested one opens
    // itself as it mounts — and scroll once the field registers.
    let opened = false;
    sections.current.forEach((section) => {
      if (!section.owns(path)) return;
      section.open();
      opened = true;
    });
    if (!opened) return false;
    pendingReveal.current = path;
    return true;
  }, [firstErrorPath, scrollToRegistration]);

  const submit = useCallback((): { data: SubmissionData } | null => {
    if (!form.validate()) {
      scrollToFirstError();
      return null;
    }
    const submission = form.getSubmission();
    onSubmit?.(submission);
    return submission;
  }, [form, onSubmit, scrollToFirstError]);

  useImperativeHandle(
    ref,
    () => ({
      submit,
      validate: () => form.validate(),
      getData: () => form.data,
      reset: (data?: SubmissionData) => form.reset(data),
      scrollToFirstError,
      getBlockingIssues: () => form.blockingIssues,
    }),
    [form, scrollToFirstError, submit]
  );

  const context = useMemo(
    () => ({
      form,
      readOnly: readOnly || form.readOnly,
      overrides,
      adapters,
      registerField,
      scrollRef,
      scrollMetrics,
      registerSection,
      pendingReveal,
    }),
    [form, readOnly, overrides, adapters, registerField, scrollRef, scrollMetrics, registerSection]
  );

  // Held still between renders. Everything below reads the form through context and updates
  // from there, so a render of the root that changed nothing for the form — the window being
  // resized — stops here instead of handing every field a new context to re-render for.
  const list = components ?? form.form.components;
  const content = useMemo(
    () => (
      <FormioRenderProvider {...context}>
        {header}
        <NodeList components={list} parentPath="" />
        {footer}
        {showSubmit && <SubmitBar form={form} onPress={submit} />}
      </FormioRenderProvider>
    ),
    [context, header, list, footer, showSubmit, form, submit]
  );

  const body = (
    <FormioContainerWidthContext.Provider value={widthStore}>
      <FormioResolvedThemeProvider theme={activeTheme}>
        <FormioLayoutProvider value={layout}>{content}</FormioLayoutProvider>
      </FormioResolvedThemeProvider>
    </FormioContainerWidthContext.Provider>
  );

  if (scrollable) {
    return (
      <ScrollView
        ref={(instance) => {
          innerScroll.current = instance as Scrollable | null;
        }}
        style={style}
        contentContainerStyle={contentContainerStyle}
        onLayout={onLayout}
        keyboardShouldPersistTaps="handled"
      >
        {body}
      </ScrollView>
    );
  }

  return (
    <View style={style} onLayout={onLayout}>
      {body}
    </View>
  );
}

/**
 * Only drawn when `showSubmit` is set. The shells use their own, pinned to the bottom.
 *
 * A blocked form disables the button and says why on the button itself. A submit that silently
 * does nothing is the single most common way an app teaches people it is broken.
 */
export function SubmitBar({
  form,
  onPress,
  label = 'Submit',
}: {
  form: FormioFormInstance;
  onPress: () => void;
  label?: string;
}) {
  const styles = useFormStyles();
  const blocked = form.blocked;

  return (
    <View style={styles.buttonRow}>
      <Pressable
        style={[styles.button, styles.submitButton, blocked && styles.buttonDisabled]}
        disabled={blocked}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked }}
      >
        <Text style={[styles.buttonLabel, blocked && styles.buttonLabelDisabled]}>
          {blocked ? 'Cannot submit — app update required' : label}
        </Text>
      </Pressable>
    </View>
  );
}

export const FormioRenderer = forwardRef(FormioRendererImpl);
FormioRenderer.displayName = 'FormioRenderer';
