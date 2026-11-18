// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Which of the two layouts a form is drawn in — docs/FORMS.md §8.
 *
 * `wide` reproduces the authored grid: columns keep their spans and a data grid is a table.
 * `phone` re-flows the same components into cards, two fields to a row at most, with nothing
 * that scrolls sideways. The choice is made once, at the renderer root, from the width the form
 * was actually given, and travels by context so every component below agrees.
 */

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';
import type { ContainerWidthStore } from './context';
import { isPhoneWidth } from './phoneLayout';

export type FormioLayout = 'phone' | 'wide';

/** `auto` decides from the measured container width; the other two pin the layout. */
export type FormioLayoutPreference = 'auto' | FormioLayout;

const FormioLayoutContext = createContext<FormioLayout>('wide');

export const FormioLayoutProvider = FormioLayoutContext.Provider;

/**
 * The layout the surrounding form is drawn in. `wide` outside a `<FormioRenderer>`.
 *
 * A host override that draws its own table can read this to switch to cards at the same moment
 * the rest of the form does, instead of deciding for itself from the screen size.
 */
export function useFormioLayout(): FormioLayout {
  return useContext(FormioLayoutContext);
}

/**
 * Resolve the layout for a renderer root.
 *
 * The container's measured width decides. Until the first layout pass there is no measurement,
 * and guessing wrong costs a whole second mount of the form — on a phone, of the layout the
 * user will never see. So for that one frame the window width is used as an **upper bound**: a
 * container cannot be wider than the window it is in, which means a window under the breakpoint
 * is proof of a container under it. A window over the breakpoint proves nothing, and the form
 * stays wide until it is measured, exactly as it did before the phone layout existed.
 *
 * This is the only place the window is consulted, and never as the width of the form.
 */
export function useResolvedLayout(
  preference: FormioLayoutPreference,
  widthStore: ContainerWidthStore,
  breakpoint: number
): FormioLayout {
  const windowWidth = useWindowDimensions().width;

  const windowIsPhone = windowWidth > 0 && isPhoneWidth(windowWidth, breakpoint);

  // The snapshot is the answer, not the width, so the first measurement and any rotation that
  // does not change the answer leave the root alone.
  const resolve = useCallback((): boolean => {
    const width = widthStore.getSnapshot();
    return width === undefined ? windowIsPhone : isPhoneWidth(width, breakpoint);
  }, [widthStore, breakpoint, windowIsPhone]);
  const phone = useSyncExternalStore(widthStore.subscribe, resolve, resolve);

  if (preference !== 'auto') return preference;
  return phone ? 'phone' : 'wide';
}

/**
 * How deep in cards the current flow is. `0` is the top level, where loose fields are gathered
 * into a card; anything above it is already inside one, where a nested section is a sub-card.
 */
const PhoneDepthContext = createContext(0);

export const PhoneDepthProvider = PhoneDepthContext.Provider;

export function usePhoneDepth(): number {
  return useContext(PhoneDepthContext);
}
