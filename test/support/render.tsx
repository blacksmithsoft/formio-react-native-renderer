// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import type { ReactElement } from 'react';
import { act } from 'react';
import TestRenderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet } from '../mocks/react-native';

/** Test-renderer plumbing, kept out of the tests themselves. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React 19 prints this on every `create`. Swallow just this line so a real warning still stands
// out in the output.
const reportError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) return;
  reportError(...args);
};

export interface ScrollCall {
  x?: number;
  y?: number;
  animated?: boolean;
}

/**
 * Every programmatic scroll the tree has asked for, in order. Cleared by each {@link render}.
 *
 * Shared by all the scrollers rather than held per node, because `createNodeMock` is called
 * afresh on every access — the object a `ref` captured and the one `testInstance.instance`
 * returns are different objects, so anything recorded on the mock itself is unreadable from a
 * test. Nothing in the renderer scrolls except on purpose, so one list stays unambiguous.
 */
export const scrollCalls: ScrollCall[] = [];

/**
 * Stand-ins for the native handles a `ref` on a host component would give.
 *
 * Two are modelled, both because a scroll depends on them. `measureLayout` on a `View` is what
 * `scrollToFirstError` reads, and each mock reports a y offset derived from a counter so that
 * "the field highest on the screen" is a meaningful question in a tree with no geometry.
 * `scrollTo` on a `ScrollView` is what a table-mode data grid calls to reveal an errored column.
 */
function nodeMock(element: ReactElement & { type: unknown }): unknown {
  if (element.type === 'ScrollView') {
    return { scrollTo: (options: ScrollCall) => scrollCalls.push(options) };
  }
  if (element.type !== 'View') return null;
  const y = (nodeMock.next += 100);
  return {
    measureLayout: (_relativeTo: unknown, onSuccess: (x: number, y: number) => void) => {
      onSuccess(0, y);
    },
  };
}
nodeMock.next = 0;

export function render(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  nodeMock.next = 0;
  scrollCalls.length = 0;
  act(() => {
    renderer = TestRenderer.create(element, { createNodeMock: nodeMock });
  });
  if (!renderer) throw new Error('render produced nothing');
  return renderer;
}

export function hostNodes(renderer: ReactTestRenderer, type: string): ReactTestInstance[] {
  return renderer.root.findAll((node) => isHost(node, type));
}

/** The mock's host components are plain strings, which `ElementType` does not model. */
function isHost(node: ReactTestInstance, type: string): boolean {
  return (node.type as unknown as string) === type;
}

/** Every string drawn by the tree, in order. */
export function texts(renderer: ReactTestRenderer): string[] {
  return hostNodes(renderer, 'Text').flatMap((node) => {
    const children = Array.isArray(node.props.children)
      ? node.props.children
      : [node.props.children];
    return children.filter((child: unknown): child is string => typeof child === 'string');
  });
}

export function styleOf(node: ReactTestInstance): Record<string, unknown> {
  return StyleSheet.flatten(node.props.style);
}

/**
 * Drive the renderer's `onLayout` measurement. The renderer root is the only node that carries
 * one, and until it fires the tree assumes the narrow layout.
 */
export function measure(renderer: ReactTestRenderer, width: number): void {
  const root = renderer.root.findAll(
    (node) => isHost(node, 'View') && typeof node.props.onLayout === 'function'
  )[0];
  if (!root) throw new Error('no measurable root');
  act(() => {
    root.props.onLayout({ nativeEvent: { layout: { width, height: 0, x: 0, y: 0 } } });
  });
}
