// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The layout tree: the portable contract between the parser and the renderer.
 *
 * Every property here is normalised at parse time, so the renderer never reads a raw Form.io
 * component. Optional properties are absent rather than empty — an empty string and "not set"
 * mean the same thing to a form author and must mean the same thing here.
 *
 * Specified in docs/SPEC.md §2.
 */

export interface SchemaFieldOption {
  label: string;
  value: string;
}

/** Where the label sits relative to the control. Form.io's five values, narrowed to two. */
export type SchemaLabelPosition = 'top' | 'left';

/** `day` sub-input visibility and ordering (Form.io `fields` / `dayFirst`). */
export interface SchemaDayConfig {
  showDay: boolean;
  showMonth: boolean;
  showYear: boolean;
  dayFirst: boolean;
  hideInputLabels: boolean;
}

/** `survey` matrix — one row per question, one column per value. */
export interface SchemaSurveyConfig {
  questions: SchemaFieldOption[];
  values: SchemaFieldOption[];
}

export interface SchemaField {
  /** Submission data key. Falls back to the component type when absent. */
  key: string;
  /**
   * The raw Form.io type, `custom_` prefix intact. Hosts match on real backend type names when
   * overriding a component, so the branded name is kept; the renderer switches on
   * {@link baseFieldType} instead.
   */
  type: string;
  label: string;
  labelPosition: SchemaLabelPosition;
  /** Percentage of the row taken by a left-positioned label (Form.io `labelWidth`). */
  labelWidth?: number;
  description?: string;
  placeholder?: string;
  multiline: boolean;
  disabled: boolean;
  required: boolean;
  /** Choices for `select`, `radio`, `selectboxes` and `survey`. */
  options?: SchemaFieldOption[];
  /** Lay options out in a row rather than stacking them. */
  inline: boolean;
  /** Input-group addons drawn either side of the value. */
  prefix?: string;
  suffix?: string;
  /** `currency`: ISO code or symbol drawn as a prefix. */
  currency?: string;
  /** `textarea`: requested visible rows. Parsed but not yet applied — SPEC.md §9 gap 5. */
  rows?: number;
  /** `signature`: caption under the pad. */
  footer?: string;
  day?: SchemaDayConfig;
  survey?: SchemaSurveyConfig;
}

export interface SchemaColumn {
  /** Form.io column span out of 12. */
  width: number;
  /** Parsed but not yet applied — SPEC.md §9 gap 3. */
  offset: number;
  children: SchemaLayoutNode[];
}

export type SchemaLayoutNode =
  | { kind: 'panel'; key: string; title: string; collapsible: boolean; children: SchemaLayoutNode[] }
  | { kind: 'columns'; key: string; columns: SchemaColumn[] }
  | { kind: 'field'; field: SchemaField }
  | { kind: 'unsupported'; key: string; type: string; label: string };
