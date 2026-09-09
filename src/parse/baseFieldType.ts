// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Types that are not stock Form.io names but behave like one we already draw.
 *
 * Applied after the `custom_` strip, so `custom_datagrid` still becomes `datagrid` and
 * `assignable_panel` becomes `panel`. An exact alias, not a prefix: `custom` is the JSON
 * component, not every `custom_*` field.
 */
const TYPE_ALIASES: Record<string, string> = {
  assignable_panel: 'panel',
  edittable: 'datagrid',
  datatable: 'datagrid',
  dynamicWizard: 'editgrid',
  custom: 'textarea',
  resource: 'textfield',
  // Form.io premium. A sketchpad is a drawing surface; a tagpad is a keyed group of
  // child fields (the image-tag overlay is not something a phone can honour offline).
  sketchpad: 'signature',
  tagpad: 'container',
  // Modal Edit is a web-only overlay. On a phone the children just sit inline.
  modaledit: 'container',
  modalEdit: 'container',
};

/**
 * Strip the branded prefix off backend variants (`custom_radio`, `custom_select`, …), which
 * behave and render exactly like the stock component they wrap.
 *
 * Every type test in the parser and the renderer goes through this. Matching a raw type is the
 * bug behind SPEC.md §9 gaps 1 and 2.
 */
export function baseFieldType(type: string): string {
  const stripped = type.replace(/^custom_/, '');
  return TYPE_ALIASES[stripped] ?? stripped;
}
