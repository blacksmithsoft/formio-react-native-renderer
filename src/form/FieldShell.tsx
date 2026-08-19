// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { FormComponent } from '../engine/types';
import { useFormioRender } from './context';
import { useFormStyles } from './formStyles';

/**
 * Label, control, description and errors — the frame every input sits in.
 *
 * It is also where a field makes itself findable. `scrollToFirstError` on a long embedded form is
 * the difference between "the save button did nothing" and "here is the field you missed", and
 * it needs a handle on each field's view to measure against whatever is doing the scrolling.
 * Registration happens here rather than in each control so that no control can forget.
 */

/** Types that draw their own label beside the control, exactly as the web renderer does. */
function isSelfLabelled(component: FormComponent): boolean {
  return component.base === 'checkbox';
}

export interface FieldShellProps {
  component: FormComponent;
  path: string;
  errors: string[];
  children: ReactNode;
}

export function FieldShell({ component, path, errors, children }: FieldShellProps) {
  const styles = useFormStyles();
  const { registerField } = useFormioRender();
  const viewRef = useRef<ComponentRef<typeof View> | null>(null);

  const measure = useCallback(
    (relativeTo: unknown, onSuccess: (y: number) => void, onFail: () => void) => {
      const node = viewRef.current;
      // Every path out of here is guarded. A measurement that fails must degrade to "do not
      // scroll", never to a crash in the middle of a failed save.
      if (!node || !relativeTo || typeof node.measureLayout !== 'function') {
        onFail();
        return;
      }
      try {
        node.measureLayout(
          relativeTo as never,
          (_x: number, y: number) => onSuccess(y),
          () => onFail()
        );
      } catch {
        onFail();
      }
    },
    []
  );

  useEffect(() => {
    if (!path) return undefined;
    registerField(path, { measure });
    return () => registerField(path, null);
  }, [path, measure, registerField]);

  const { field } = component;
  const label = !isSelfLabelled(component) && !!field.label && (
    <Text style={styles.label}>
      {field.label}
      {field.required && <Text style={styles.requiredMark}> *</Text>}
    </Text>
  );

  const footer = (
    <>
      {!!field.description && <Text style={styles.description}>{field.description}</Text>}
      {errors.map((message) => (
        <Text key={message} style={styles.error}>
          {message}
        </Text>
      ))}
    </>
  );

  if (field.labelPosition === 'left' && label) {
    return (
      <View ref={viewRef} style={styles.leftLabelRow}>
        <View style={[styles.leftLabel, field.labelWidth ? { flexBasis: `${field.labelWidth}%` } : null]}>
          {label}
        </View>
        {/* The description and errors belong under the control, not under the label. */}
        <View style={styles.leftControl}>
          {children}
          {footer}
        </View>
      </View>
    );
  }

  return (
    <View ref={viewRef} style={styles.field}>
      {label}
      <View style={label ? styles.controlSpacing : undefined}>{children}</View>
      {footer}
    </View>
  );
}
