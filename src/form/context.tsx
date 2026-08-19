// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Layer 2 plumbing: everything a control needs that is not its own value — docs/FORMS.md §6.
 *
 * Four things travel through here, and each is here rather than in props because the tree
 * between the renderer root and a control is arbitrarily deep:
 *
 * - the **form engine**, so a control can read and write its own path;
 * - the **measured container width**, so layout decisions read the space the form actually has
 *   rather than the size of the screen — see the note on `Dimensions` below;
 * - **host overrides and adapters**, which is how a package with no native dependencies still
 *   ends up with a real date picker and a real camera in the app that embeds it;
 * - **field registration**, so `scrollToFirstError` can find the control it needs to reveal.
 *
 * `Dimensions.get('window')` is never used anywhere in this package. A form can sit in a modal,
 * in a padded card, in a tablet split view or in a half-width panel, and the window width is
 * wrong in every one of them.
 */

import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { FormioFormInstance } from '../engine/useFormioForm';
import type { FormComponent } from '../engine/types';

/** What a control is handed. The same shape for every type in the registry. */
export interface FormioControlProps {
  component: FormComponent;
  /** Absolute data path — `lines[2].qty`, never just `qty`. */
  path: string;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Call when the control loses focus, so its errors may be revealed. */
  onBlur: () => void;
  errors: string[];
  readOnly: boolean;
}

export type FormioControl = ComponentType<FormioControlProps>;

/**
 * Host replacements for individual controls, matched by component `key` first and raw `type`
 * second.
 *
 * This is the escape hatch that keeps the package honest about its own limits. A date picker, a
 * camera and a signature pad all need native modules that a general-purpose renderer cannot
 * depend on, so the package ships an OTA-safe text-based default for each and the host swaps in
 * the real thing. Matching on `key` as well as `type` lets one unusual field be special-cased
 * without forking the type.
 */
export interface ComponentOverrides {
  byType?: Record<string, FormioControl>;
  byKey?: Record<string, FormioControl>;
}

/** What a host's picker hands back. Deliberately smaller than what gets stored. */
export interface CapturedFile {
  /** `file://` path on the device, already persisted outside the cache directory. */
  uri: string;
  name: string;
  size?: number;
  type?: string;
}

/**
 * One entry of a `file` component's value — docs/FORMS.md §9.
 *
 * Shaped like Form.io's own file entry so that a submission uploaded from the phone is
 * indistinguishable from one made on the web. `storage: 'local'` is the offline state: the
 * binary is on the device and only the reference is in the submission. The sync layer uploads
 * the binary, rewrites the entry to `storage: 'url'`, and only then posts the submission. A
 * submission still holding a `'local'` entry has not finished syncing and must not be sent.
 */
export interface FormioFileValue {
  /**
   * `'url'` means the binary is on the server and the entry is finished.
   *
   * Anything else means it is still on the device. `'local'` is what this package writes;
   * `'mobile'` is accepted because that is the marker the Vise backend's upload endpoint already
   * uses, and a value the sync layer fails to recognise is a photo that never gets uploaded.
   */
  storage: 'local' | 'mobile' | 'url';
  name: string;
  originalName?: string;
  size?: number;
  type?: string;
  /** Present while the binary exists only on the device. */
  localUri?: string;
  /** Present once the binary has been uploaded. */
  url?: string;
}

/**
 * Capabilities the package cannot implement itself, supplied by the host.
 *
 * Every one is optional. A control whose adapter is missing still renders, still shows any value
 * it already has, and says plainly that capture is unavailable — it never throws and never
 * disappears.
 */
export interface FormioAdapters {
  pickFiles?: (component: FormComponent) => Promise<CapturedFile[]>;
  /**
   * Capture a signature. A data-URL string is stored inline, exactly as the web renderer does;
   * a captured file goes through two-phase sync like any other binary. Hosts should return a
   * string unless their signatures are large enough to bloat the submission.
   */
  captureSignature?: (component: FormComponent) => Promise<CapturedFile | string | null>;
  /** Resolve a stored file entry to something `Image` can display, online or off. */
  resolveFileUri?: (file: FormioFileValue) => string | undefined;
  /**
   * Present the host's own date, time or day picker. Returning `null` means the user cancelled;
   * returning `undefined` means the host has no picker and the text field should take over.
   */
  pickDateTime?: (
    component: FormComponent,
    current: string
  ) => Promise<string | null | undefined>;
  /** Present the host's own option list. Falls back to an inline list when absent. */
  pickOption?: (
    component: FormComponent,
    options: { label: string; value: string }[],
    current: string
  ) => Promise<string | null | undefined>;
}

export interface FieldRegistration {
  /** Measured against the scroll container on demand by `scrollToFirstError`. */
  measure: (
    relativeTo: unknown,
    onSuccess: (y: number) => void,
    onFail: () => void
  ) => void;
}

export interface FormioRenderContextValue {
  form: FormioFormInstance;
  containerWidth: number | undefined;
  readOnly: boolean;
  overrides: ComponentOverrides;
  adapters: FormioAdapters;
  /**
   * Registration order is document order, which is what makes "the first error" mean the one
   * highest on the screen rather than the first key in an object.
   */
  registerField: (path: string, registration: FieldRegistration | null) => void;
}

const MISSING = 'FormioRenderer context is missing. Render controls inside <FormioRenderer>.';

export const FormioRenderContext = createContext<FormioRenderContextValue | null>(null);

export function useFormioRender(): FormioRenderContextValue {
  const value = useContext(FormioRenderContext);
  if (!value) throw new Error(MISSING);
  return value;
}

export interface FormioRenderProviderProps extends FormioRenderContextValue {
  children?: ReactNode;
}

export function FormioRenderProvider({ children, ...value }: FormioRenderProviderProps) {
  return <FormioRenderContext.Provider value={value}>{children}</FormioRenderContext.Provider>;
}
