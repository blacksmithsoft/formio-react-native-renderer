// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { createRef, type ReactElement } from 'react';
import { act } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { FormioRenderer, type FormioRendererHandle } from '../../src/form/FormioRenderer';
import type { ComponentOverrides, FormioAdapters } from '../../src/form/context';
import type { FormioTelemetry } from '../../src/engine/telemetry';
import { hostNodes, render } from '../support/render';

/** Mounting the editable renderer and poking at it, kept out of the tests themselves. */

export interface Mounted {
  renderer: ReactTestRenderer;
  /**
   * The current handle.
   *
   * `useImperativeHandle` rebuilds the object on every render, so holding one across a state
   * change reads stale data. Real callers say `formRef.current.submit()` at the moment they need
   * it, which always sees the latest; the tests do the same through this function.
   */
  handle: () => FormioRendererHandle;
  /** Call a handle method with the update wrapped in `act`. */
  run: <T>(action: (handle: FormioRendererHandle) => T) => T;
  inputs: () => ReactTestInstance[];
  pressables: () => ReactTestInstance[];
  /** Every string the tree drew, in order. */
  texts: () => string[];
  type: (index: number, text: string) => void;
  press: (matcher: string | number) => void;
  measure: (width: number) => void;
}

export function mount(
  schema: unknown,
  options: {
    readOnly?: boolean;
    overrides?: ComponentOverrides;
    adapters?: FormioAdapters;
    telemetry?: FormioTelemetry;
    element?: (ref: ReturnType<typeof createRef<FormioRendererHandle>>) => ReactElement;
  } = {}
): Mounted {
  const ref = createRef<FormioRendererHandle>();
  const renderer = render(
    options.element?.(ref) ?? (
      <FormioRenderer
        ref={ref}
        schema={schema}
        readOnly={options.readOnly}
        overrides={options.overrides}
        adapters={options.adapters}
        telemetry={options.telemetry}
      />
    )
  );

  const handle = (): FormioRendererHandle => {
    if (!ref.current) throw new Error('renderer exposed no handle');
    return ref.current;
  };

  const inputs = () => hostNodes(renderer, 'TextInput');
  const pressables = () => hostNodes(renderer, 'Pressable');

  const texts = (): string[] =>
    hostNodes(renderer, 'Text').flatMap((node) => {
      const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
      return children.filter((child: unknown): child is string => typeof child === 'string');
    });

  return {
    renderer,
    handle,
    run: (action) => {
      let result!: ReturnType<typeof action>;
      act(() => {
        result = action(handle());
      });
      return result;
    },
    inputs,
    pressables,
    texts,
    type: (index, text) => {
      const input = inputs()[index];
      if (!input) throw new Error(`no TextInput at index ${index}`);
      act(() => {
        input.props.onChangeText(text);
      });
      // The value is committed on blur, which is where a number becomes a number.
      act(() => {
        input.props.onBlur();
      });
    },
    press: (matcher) => {
      const targets = pressables();
      const target =
        typeof matcher === 'number'
          ? targets[matcher]
          : targets.find((node) => containsText(node, matcher));
      if (!target) throw new Error(`no Pressable matching ${String(matcher)}`);
      act(() => {
        target.props.onPress();
      });
    },
    measure: (width) => {
      const root = renderer.root.findAll(
        (node) => (node.type as unknown as string) === 'View' && typeof node.props.onLayout === 'function'
      )[0];
      if (!root) throw new Error('no measurable root');
      act(() => {
        root.props.onLayout({ nativeEvent: { layout: { width, height: 0, x: 0, y: 0 } } });
      });
    },
  };
}

function containsText(node: ReactTestInstance, needle: string): boolean {
  return node
    .findAll((child) => (child.type as unknown as string) === 'Text')
    .some((child) => JSON.stringify(child.props.children ?? '').includes(needle));
}
