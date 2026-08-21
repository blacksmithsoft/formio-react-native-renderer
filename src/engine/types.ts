// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The editable form model — docs/FORMS.md §1.
 *
 * This is the contract between the schema and the headless engine, and it is a superset of the
 * read-only layout tree in `parse/types.ts`. The two exist side by side on purpose:
 *
 * - `SchemaLayoutNode` is a *projection for drawing*. It drops hidden components, flattens bare
 *   containers and reduces data components to a marker, because a viewer needs none of that.
 * - `FormComponent` is a *projection for editing*. Nothing may be dropped: a hidden field still
 *   carries a default value the server expects, a datagrid still owns rows, and an unsupported
 *   component still has to be reported rather than forgotten.
 *
 * Display properties are not duplicated. Every component embeds the same normalised
 * {@link SchemaField} the viewer uses, so the two paths cannot drift on what a label or a
 * placeholder means, and the read-only controls can be reused verbatim when `readOnly` is set.
 */

import type { SchemaField } from '../parse/types';

/**
 * What a component does with submission data. This, not the raw type, is what the engine
 * switches on when it walks the tree.
 */
export type ComponentRole =
  /** Owns a value at its own path. */
  | 'input'
  /** Scopes its children under its own key as an object — `container`. */
  | 'container'
  /** Scopes its children under its own key as an array of rows — `datagrid`, `editgrid`. */
  | 'grid'
  /** Groups children without scoping data — `panel`, `columns`, `tabs`, `table`, `fieldset`. */
  | 'layout'
  /** Draws something and holds no value — `content`, `htmlelement`, `button`. */
  | 'display';

/** How a layout component arranges its children. `undefined` for every other role. */
export type LayoutKind = 'panel' | 'columns' | 'tabs' | 'table' | 'group';

/**
 * A problem found while normalising a component.
 *
 * Severity is the whole point of recording these. The two cases behave differently and
 * conflating them produces either forms nobody can submit or silent data loss:
 *
 * - `error` — the component cannot be rendered faithfully and its data cannot be trusted. The
 *   form is marked non-submittable. An unknown type with nested structure, or custom JavaScript.
 * - `warning` — the component is degraded but still usable and its data is still valid. A remote
 *   `select` whose options were never inlined, rendered as free text. Visible, logged, but it
 *   does not block a worker in the field from finishing the job.
 */
export interface ComponentIssue {
  severity: 'error' | 'warning';
  /** Stable identifier for telemetry aggregation. Never localised. */
  code: ComponentIssueCode;
  /** Human-readable, shown in the placeholder drawn in place of the component. */
  message: string;
}

export type ComponentIssueCode =
  | 'unknown-type'
  | 'custom-javascript'
  | 'unresolved-remote-options'
  | 'malformed-component';

/** Declarative conditional visibility. Custom JavaScript is never represented here. */
export type ConditionalRule =
  | {
      kind: 'simple';
      /** `true` shows the component when the test passes, `false` hides it. */
      show: boolean;
      /** The key of the component being tested. Compared against the whole submission. */
      when: string;
      /** The value to compare against, stringified. */
      eq: string;
    }
  | { kind: 'json'; logic: unknown };

/** The declarative validation set — docs/FORMS.md §4. `unique` is server-side only. */
export interface ValidationRules {
  required: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  /** A regular expression *source* string. Compiled lazily and cached; never `eval`ed. */
  pattern?: string;
  minWords?: number;
  maxWords?: number;
  /** `selectboxes` only. */
  minSelectedCount?: number;
  maxSelectedCount?: number;
  /** Replaces the generated message for every rule on this component when set. */
  customMessage?: string;
}

/** `select` sourcing. Anything other than `values` needs the backend transform — docs/FORMS.md §7. */
export interface SelectConfig {
  dataSrc: 'values' | 'url' | 'resource' | 'custom' | 'json' | 'indexeddb';
  /** True once options are available offline, whether authored inline or inlined by the backend. */
  resolvedOffline: boolean;
  multiple: boolean;
}

/** `datagrid` and `editgrid` row behaviour. */
export interface GridConfig {
  /**
   * Start with no rows. Form.io defaults a `datagrid` to one empty row and an `editgrid` to
   * none, which is the difference between a table you type into and a list you add entries to.
   */
  initEmpty: boolean;
  addLabel: string;
  removeLabel: string;
  /**
   * The author asked for a real table — one column per child, labels in a header — rather than
   * the stack of cards a grid otherwise becomes. Honoured at every width: columns share the
   * space until they would drop below `tableMinColumnWidth`, then the table scrolls sideways.
   */
  displayAsTable: boolean;
}

/** `file` and `signature` capture limits, read by the host's capture adapter. */
export interface FileConfig {
  multiple: boolean;
  /** Comma-separated Form.io `filePattern`, e.g. `image/*,.pdf`. Empty means anything. */
  pattern: string;
  /** Maximum size in bytes, or `undefined` for no limit. */
  maxSize?: number;
  /** `true` when the component should offer the camera rather than the library. */
  imageOnly: boolean;
}

export interface FormColumn {
  /** Form.io column span out of 12. */
  width: number;
  offset: number;
  /**
   * The Bootstrap breakpoint at or above which `width` applies. Below it the column takes the
   * full row, which is exactly what a narrowed browser window does — docs/FORMS.md §8.
   */
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  children: FormComponent[];
}

export interface FormTab {
  key: string;
  label: string;
  children: FormComponent[];
}

export interface FormTableCell {
  children: FormComponent[];
}

export interface FormComponent {
  /** Submission data key, relative to the enclosing scope. Empty for pure layout. */
  key: string;
  /** The raw Form.io type, `custom_` prefix intact. */
  type: string;
  /** `type` with the `custom_` prefix stripped. Every behavioural test uses this. */
  base: string;
  role: ComponentRole;
  layout?: LayoutKind;

  /** The normalised display contract, shared with the read-only renderer. */
  field: SchemaField;

  /**
   * Whether the component contributes a key to the submission. Form.io's own `input` flag,
   * defaulted per role. A `display` component is never `true`.
   */
  input: boolean;
  /**
   * Schema-level `hidden`. The component is never drawn but still holds its value, because a
   * hidden field with a default is how a form stamps a constant the server requires.
   */
  hidden: boolean;
  /** Form.io `protected`: the server never returns the stored value. */
  protected: boolean;
  /** `multiple: true` stores an array of values at a single key. */
  multiple: boolean;

  validate: ValidationRules;
  conditional?: ConditionalRule;
  /**
   * Remove the value from the submission when a conditional hides the component. Form.io
   * defaults this to `true`, and matching that exactly is what keeps the server from rejecting a
   * submission that carries data for a field it considers hidden.
   */
  clearOnHide: boolean;
  defaultValue?: unknown;
  /**
   * A JSON Logic rule that derives this component's value from the rest of the submission.
   * String (JavaScript) `calculateValue` is recorded as an issue instead — never evaluated.
   */
  calculate?: unknown;
  /** Recalculate even after the user has edited the field (Form.io `allowCalculateOverride`). */
  calculateOverride: boolean;

  /** Children for `container`, `grid` and `group`/`panel` layouts. Empty otherwise. */
  children: FormComponent[];
  columns?: FormColumn[];
  tabs?: FormTab[];
  /** Rows of cells for `table`. Drawn stacked on mobile — docs/FORMS.md §8. */
  tableRows?: FormTableCell[][];
  /** `content` / `htmlelement`: the authored markup, before HTML is reduced to text. */
  html?: string;
  /** `panel` / `fieldset`: start collapsed. */
  collapsible: boolean;
  collapsed: boolean;

  select?: SelectConfig;
  file?: FileConfig;
  grid?: GridConfig;

  /** Non-empty when the component is degraded or unrenderable — see {@link ComponentIssue}. */
  issues: ComponentIssue[];
}

/** A whole form, as the engine sees it. */
export interface FormDefinition {
  title: string;
  path: string;
  display: 'form' | 'wizard' | 'pdf';
  components: FormComponent[];
  /**
   * Every issue in the tree, flattened, with the absolute path of the component that raised it.
   * The host logs these once per form open rather than once per render.
   */
  issues: { path: string; issue: ComponentIssue }[];
}
