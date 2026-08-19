// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The component registry — docs/FORMS.md §6 and §10.
 *
 * One explicit map, and it is the source of truth for two separate questions:
 *
 * 1. **What can this app render?** A type absent from here goes through inference and is
 *    reported. Nothing is ever skipped silently.
 * 2. **How does a fix reach a device?** Expo pushes JavaScript over the air; it cannot push a
 *    native module. A control composed from primitives ships in minutes, and one that needs the
 *    camera needs a store release. "We'll just OTA it" is true for most of this table and
 *    silently false for the rest, and the flag is what makes that visible at authoring time
 *    rather than at release time.
 *
 * Note what `otaSafe: true` means for `file`, `signature` and `datetime`: the *control* is pure
 * JavaScript, because capture is delegated to a host adapter. Shipping the adapter is the host's
 * release problem, and `capability` names which one it needs.
 */

import type { FormComponent } from '../engine/types';
import type { ComponentOverrides, FormioControl } from './context';
import {
  CheckboxControl,
  RadioControl,
  SelectBoxesControl,
  SelectControl,
} from './controls/ChoiceControls';
import { DateTimeControl, DayControl } from './controls/DateControls';
import { FileControl, SignatureControl } from './controls/BinaryControls';
import { SurveyControl } from './controls/SurveyControl';
import { TagsControl } from './controls/TagsControl';
import { TextControl } from './controls/TextControl';
import { UnsupportedControl } from './UnsupportedControl';

/** A host capability a control degrades without, rather than fails without. */
export type HostCapability = 'files' | 'camera' | 'signature' | 'datetime' | 'location';

export interface ComponentEntry {
  /** Absent for structural types, which the renderer dispatches by role rather than by control. */
  control?: FormioControl;
  kind: 'input' | 'layout' | 'container' | 'grid' | 'display';
  /** True when the implementation is pure JavaScript and can ship over the air. */
  otaSafe: boolean;
  capability?: HostCapability;
}

const input = (control: FormioControl, capability?: HostCapability): ComponentEntry => ({
  control,
  kind: 'input',
  otaSafe: true,
  capability,
});

const structural = (kind: ComponentEntry['kind']): ComponentEntry => ({ kind, otaSafe: true });

export const COMPONENT_REGISTRY: Record<string, ComponentEntry> = {
  // Tier A — text-like
  textfield: input(TextControl),
  textarea: input(TextControl),
  number: input(TextControl),
  currency: input(TextControl),
  email: input(TextControl),
  url: input(TextControl),
  phoneNumber: input(TextControl),
  password: input(TextControl),

  // Tier A — choices
  checkbox: input(CheckboxControl),
  radio: input(RadioControl),
  selectboxes: input(SelectBoxesControl),
  select: input(SelectControl),

  // Tier A — dates. The text fallback is pure JS; a real picker is the host's.
  datetime: input(DateTimeControl, 'datetime'),
  time: input(DateTimeControl, 'datetime'),
  day: input(DayControl),

  // Tier A / B — everything else with a value
  tags: input(TagsControl),
  survey: input(SurveyControl),
  file: input(FileControl, 'files'),
  signature: input(SignatureControl, 'signature'),
  /**
   * `address` should be rewritten by the backend transform before it reaches a device — §7. One
   * arriving anyway is captured as text so the answer is not lost, and the parser has already
   * raised the warning that says so.
   */
  address: input(TextControl, 'location'),
  /** Holds a value, draws nothing. The renderer returns early before reaching this entry. */
  hidden: { kind: 'input', otaSafe: true },

  // Structural
  panel: structural('layout'),
  fieldset: structural('layout'),
  well: structural('layout'),
  columns: structural('layout'),
  tabs: structural('layout'),
  table: structural('layout'),
  container: structural('container'),
  form: structural('container'),
  datagrid: structural('grid'),
  editgrid: structural('grid'),
  content: structural('display'),
  htmlelement: structural('display'),
  button: structural('display'),
};

/**
 * The control for a component, with host overrides taking precedence.
 *
 * Resolution order is `key`, then raw `type`, then base `type`, then the registry, then the
 * unsupported placeholder. Key beats type so a host can special-case one awkward field without
 * forking the whole component type; raw type beats base type so a branded `custom_select` can be
 * overridden separately from a stock one.
 *
 * Never returns `undefined`. A control that could not be resolved draws a visible placeholder,
 * which is the whole point of §6.
 */
export function lookupControl(
  component: FormComponent,
  overrides: ComponentOverrides = {}
): FormioControl {
  return (
    overrides.byKey?.[component.key] ??
    overrides.byType?.[component.type] ??
    overrides.byType?.[component.base] ??
    COMPONENT_REGISTRY[component.base]?.control ??
    // Inference in the parser has already decided this should behave like a text field, and has
    // already attached the warning the user will see above it.
    (component.issues.length > 0 ? TextControl : UnsupportedControl)
  );
}

/** Every supported type with its release path — the table §10 asks to be kept visible. */
export function describeCoverage(): {
  type: string;
  kind: ComponentEntry['kind'];
  otaSafe: boolean;
  capability?: HostCapability;
}[] {
  return Object.entries(COMPONENT_REGISTRY)
    .map(([type, entry]) => ({
      type,
      kind: entry.kind,
      otaSafe: entry.otaSafe,
      capability: entry.capability,
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
}
