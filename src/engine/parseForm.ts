// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Schema JSON → the editable form model — docs/FORMS.md §1.
 *
 * The same input contract as the read-only parser: **untrusted, untyped JSON, and it must not
 * throw on any input**. A schema is authored by a third party in a visual builder, delivered over
 * a network and usually read back out of an offline cache; every one of those steps can produce
 * something unexpected, and a form that renders imperfectly is recoverable while an app that
 * crashes on open is not.
 *
 * Where the two parsers differ is what they are allowed to discard. This one discards nothing.
 * A hidden component keeps its default, a datagrid keeps its children, and a type nobody
 * recognises is inferred into the closest primitive and flagged, rather than dropped.
 *
 * Pure. Imports nothing from React or React Native.
 */

import { baseFieldType } from '../parse/baseFieldType';
import { asString, isObject, toPositiveInt, type JsonObject } from '../parse/json';
import { toField } from '../parse/toField';
import type { SchemaField, SchemaFieldOption } from '../parse/types';
import type {
  ComponentIssue,
  ComponentRole,
  ConditionalRule,
  FileConfig,
  FormColumn,
  FormComponent,
  FormDefinition,
  FormTab,
  FormTableCell,
  GridConfig,
  LayoutKind,
  SelectConfig,
  ValidationRules,
} from './types';
import { indexPath, joinPath } from './dataPaths';

/** Types the engine understands, grouped by what they do with data. */
const ROLES: Record<string, { role: ComponentRole; layout?: LayoutKind }> = {
  panel: { role: 'layout', layout: 'panel' },
  fieldset: { role: 'layout', layout: 'panel' },
  well: { role: 'layout', layout: 'panel' },
  columns: { role: 'layout', layout: 'columns' },
  tabs: { role: 'layout', layout: 'tabs' },
  table: { role: 'layout', layout: 'table' },
  container: { role: 'container' },
  form: { role: 'container' },
  datagrid: { role: 'grid' },
  editgrid: { role: 'grid' },
  content: { role: 'display' },
  htmlelement: { role: 'display' },
  button: { role: 'display' },
};

/**
 * Value-carrying types with a real implementation behind them. Anything outside this set and
 * outside {@link ROLES} goes through inference and is flagged.
 */
const KNOWN_INPUTS = new Set([
  'textfield',
  'textarea',
  'number',
  'currency',
  'checkbox',
  'radio',
  'selectboxes',
  'select',
  'email',
  'phoneNumber',
  'url',
  'password',
  'datetime',
  'day',
  'time',
  'tags',
  'signature',
  'file',
  'hidden',
  'survey',
  'address',
]);

/**
 * Types banned at the schema layer — docs/FORMS.md §7. They should never reach a device, so one
 * arriving means the backend transform has a gap. It is reported loudly rather than guessed at:
 * both are recursive structures whose data cannot be captured by any primitive.
 */
const BANNED = new Set(['tree', 'datamap']);

/** Schema properties whose value is JavaScript. Present means the component is not supported. */
const CUSTOM_JS_PROPERTIES = [
  'customConditional',
  'customDefaultValue',
  'customValidation',
] as const;

function readValidation(component: JsonObject): ValidationRules {
  const validate = isObject(component.validate) ? component.validate : {};
  const number = (value: unknown): number | undefined => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const pattern = asString(validate.pattern);
  const message = asString(validate.customMessage) || asString(validate.customPrivateMessage);
  return {
    required: validate.required === true,
    minLength: number(validate.minLength),
    maxLength: number(validate.maxLength),
    min: number(validate.min),
    max: number(validate.max),
    pattern: pattern || undefined,
    minWords: number(validate.minWords),
    maxWords: number(validate.maxWords),
    minSelectedCount: number(validate.minSelectedCount),
    maxSelectedCount: number(validate.maxSelectedCount),
    customMessage: message || undefined,
  };
}

/**
 * Both declarative conditional forms — docs/FORMS.md §3.
 *
 * A `conditional` whose `when` is empty is Form.io's own "no condition" state; the builder writes
 * the object out whether or not the author filled it in, so an empty `when` must mean "always
 * visible" rather than "hidden because nothing equals nothing".
 */
function readConditional(component: JsonObject): ConditionalRule | undefined {
  const conditional = component.conditional;
  if (!isObject(conditional)) return undefined;

  if (conditional.json !== undefined && conditional.json !== null && conditional.json !== '') {
    return { kind: 'json', logic: conditional.json };
  }

  const when = asString(conditional.when);
  if (!when) return undefined;

  const eq = conditional.eq;
  return {
    kind: 'simple',
    // Form.io writes `show` as a boolean or as the strings "true"/"false".
    show: conditional.show === true || conditional.show === 'true',
    when,
    eq: eq === undefined || eq === null ? '' : String(eq),
  };
}

function readSelectConfig(component: JsonObject, field: SchemaField): SelectConfig {
  const raw = asString(component.dataSrc, 'values');
  const dataSrc = (
    ['values', 'url', 'resource', 'custom', 'json', 'indexeddb'].includes(raw) ? raw : 'values'
  ) as SelectConfig['dataSrc'];
  return {
    dataSrc,
    resolvedOffline: (field.options?.length ?? 0) > 0,
    multiple: component.multiple === true,
  };
}

function readGridConfig(component: JsonObject, base: string): GridConfig {
  return {
    // A datagrid is a table you type into, so it opens with a row. An edit grid is a list you
    // add entries to, so it opens empty. Both are Form.io's own defaults.
    initEmpty: component.initEmpty === true || base === 'editgrid',
    addLabel: asString(component.addAnother) || 'Add Another',
    removeLabel: asString(component.removeRow) || 'Remove',
  };
}

function readFileConfig(component: JsonObject): FileConfig {
  const size = component.fileMaxSize;
  return {
    multiple: component.multiple === true,
    pattern: asString(component.filePattern),
    maxSize: parseFileSize(size),
    imageOnly: component.image === true || asString(component.filePattern).includes('image'),
  };
}

/** Form.io writes `fileMaxSize` as a human string: `1MB`, `500KB`, `2GB`. */
function parseFileSize(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = asString(value).trim().toUpperCase();
  const match = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/.exec(text);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2] ?? 'B';
  const scale = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[unit] ?? 1;
  return Number.isFinite(amount) ? Math.round(amount * scale) : undefined;
}

/**
 * `select` with `dataSrc: "json"` keeps its choices as raw rows plus a `valueProperty`, rather
 * than as `{ label, value }` pairs. Resolving it here means one more schema shape works offline
 * instead of arriving as an empty dropdown.
 */
function jsonSelectOptions(component: JsonObject): SchemaFieldOption[] | undefined {
  const data = isObject(component.data) ? component.data : undefined;
  const rows = data?.json;
  const parsed = typeof rows === 'string' ? safeParseJson(rows) : rows;
  if (!Array.isArray(parsed)) return undefined;

  const valueKey = asString(component.valueProperty) || 'value';
  const labelKey = asString(component.labelProperty) || 'label';
  const options: SchemaFieldOption[] = [];
  for (const row of parsed) {
    if (!isObject(row)) {
      if (row === undefined || row === null || row === '') continue;
      options.push({ value: String(row), label: String(row) });
      continue;
    }
    const value = row[valueKey] ?? row.value;
    if (value === undefined || value === null || value === '') continue;
    const label = row[labelKey] ?? row.label ?? value;
    options.push({ value: String(value), label: String(label) });
  }
  return options.length > 0 ? options : undefined;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function customJsIssues(component: JsonObject): ComponentIssue[] {
  const found: string[] = [];

  for (const property of CUSTOM_JS_PROPERTIES) {
    if (asString(component[property]).trim()) found.push(property);
  }
  const validate = isObject(component.validate) ? component.validate : {};
  if (asString(validate.custom).trim()) found.push('validate.custom');
  if (typeof component.calculateValue === 'string' && component.calculateValue.trim()) {
    found.push('calculateValue');
  }
  if (typeof component.defaultValue === 'string' && asString(component.customDefaultValue)) {
    found.push('customDefaultValue');
  }
  // Advanced logic can carry a JavaScript trigger or a JavaScript-valued action.
  if (Array.isArray(component.logic)) {
    for (const entry of component.logic) {
      if (!isObject(entry)) continue;
      const trigger = isObject(entry.trigger) ? entry.trigger : {};
      if (trigger.type === 'javascript' || asString(trigger.javascript).trim()) {
        found.push('logic.trigger');
        break;
      }
    }
  }

  if (found.length === 0) return [];
  return [
    {
      severity: 'error',
      code: 'custom-javascript',
      message: `Uses custom JavaScript (${found.join(', ')}), which this app cannot run. Update the form or the app.`,
    },
  ];
}

interface Inference {
  role: ComponentRole;
  layout?: LayoutKind;
  issue: ComponentIssue;
}

/**
 * Guess a shape for a type the engine has never seen — docs/FORMS.md §5.
 *
 * A last resort, and deliberately timid. Something with children keeps its children so the tree
 * below it still renders; something with a choice list becomes a select; something the schema
 * marks as non-input is display-only and safe to draw as nothing. Everything else becomes a text
 * field, which captures *something* rather than losing the answer.
 *
 * Inference produces a warning, not an error: the component still works, so blocking the whole
 * submission over it would strand a worker who has no way to fix the schema from the field.
 * Anything inference cannot honestly cover is an error and does block — see {@link BANNED}.
 */
function infer(component: JsonObject, type: string): Inference {
  const label = asString(component.label) || asString(component.key) || type;
  const warning = (message: string): ComponentIssue => ({
    severity: 'warning',
    code: 'unknown-type',
    message,
  });

  if (Array.isArray(component.components)) {
    return {
      role: asString(component.key) ? 'container' : 'layout',
      layout: asString(component.key) ? undefined : 'group',
      issue: warning(`"${label}" is a ${type}, which this app does not know. Its contents are shown as a plain group.`),
    };
  }

  if (component.input === false) {
    return {
      role: 'display',
      issue: warning(`"${label}" is a ${type}, which this app does not know. It carries no data and is not shown.`),
    };
  }

  return {
    role: 'input',
    issue: warning(`"${label}" is a ${type}, which this app does not know. It is shown as a text field so the answer is not lost.`),
  };
}

function toColumns(component: JsonObject): FormColumn[] {
  const raw = Array.isArray(component.columns) ? component.columns : [];
  return raw.filter(isObject).map((column) => {
    const size = asString(column.size, 'md');
    return {
      // Form.io defaults an unset span to 6 — half a row.
      width: toPositiveInt(column.width) ?? 6,
      offset: toPositiveInt(column.offset) ?? 0,
      size: (['xs', 'sm', 'md', 'lg', 'xl'].includes(size) ? size : 'md') as FormColumn['size'],
      children: parseFormComponents(column.components),
    };
  });
}

function toTabs(component: JsonObject): FormTab[] {
  const raw = Array.isArray(component.components) ? component.components : [];
  return raw
    .filter((tab) => isObject(tab) && tab.mobileHidden !== true)
    .map((tab, index) => ({
      key: asString(tab.key, `tab${index + 1}`),
      label: asString(tab.label) || asString(tab.title) || `Tab ${index + 1}`,
      children: parseFormComponents(tab.components),
    }));
}

function toTableRows(component: JsonObject): FormTableCell[][] {
  const raw = Array.isArray(component.rows) ? component.rows : [];
  return raw.map((row) =>
    (Array.isArray(row) ? row : [])
      .filter(isObject)
      .map((cell) => ({ children: parseFormComponents(cell.components) }))
  );
}

/**
 * `content` and `htmlelement` hold authored markup. It is reduced to text here rather than in the
 * renderer so that both platforms agree on the result and neither needs an HTML parser.
 *
 * Block-level tags become line breaks, everything else is dropped, and the five XML entities are
 * decoded. Instructional copy survives; formatting does not. That is the honest trade: the
 * alternative is either a WebView or a sanitiser, and both are larger decisions than a paragraph
 * of help text justifies.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\u2022 ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Roles that hold a value of their own and therefore contribute a key to the submission. */
function isDataRole(role: ComponentRole): boolean {
  return role === 'input' || role === 'container' || role === 'grid';
}

function normalizeOne(component: JsonObject): FormComponent | FormComponent[] {
  const type = asString(component.type);
  const base = baseFieldType(type);
  const key = asString(component.key, type);

  // A component with no type but with children is a grouping artefact of the builder. It carries
  // no chrome and no data scope, so its children lay out as siblings — the same rule the
  // read-only parser applies.
  if (!type && Array.isArray(component.components)) {
    return parseFormComponents(component.components);
  }

  const known = ROLES[base];
  const issues: ComponentIssue[] = [...customJsIssues(component)];

  let role: ComponentRole;
  let layout: LayoutKind | undefined;

  if (known) {
    role = known.role;
    layout = known.layout;
  } else if (BANNED.has(base)) {
    role = 'display';
    issues.push({
      severity: 'error',
      code: 'unknown-type',
      message: `"${asString(component.label, key)}" is a ${type}. It nests data this app cannot capture and must be replaced in the form builder.`,
    });
  } else if (KNOWN_INPUTS.has(base)) {
    role = 'input';
  } else {
    const inferred = infer(component, type || 'component');
    role = inferred.role;
    layout = inferred.layout;
    issues.push(inferred.issue);
  }

  const field = toField(component, key);
  const options = field.options ?? (base === 'select' ? jsonSelectOptions(component) : undefined);
  // A panel's heading is `title`, or `legend` on a fieldset — never `label`, which the builder
  // leaves at the component's internal name. Reading `label` prints the key on every card.
  const label =
    known?.layout === 'panel'
      ? asString(component.title) || asString(component.legend) || asString(component.label)
      : field.label;
  const resolvedField: SchemaField =
    options === field.options && label === field.label ? field : { ...field, options, label };

  const select = base === 'select' ? readSelectConfig(component, resolvedField) : undefined;
  if (select && select.dataSrc !== 'values' && !select.resolvedOffline) {
    issues.push({
      severity: 'warning',
      code: 'unresolved-remote-options',
      message: `"${resolvedField.label}" loads its choices from the server and they were not available offline. Type the value instead.`,
    });
  }

  const children = known?.layout === 'columns' || known?.layout === 'tabs' || known?.layout === 'table'
    ? []
    : parseFormComponents(component.components);

  return {
    key,
    type,
    base,
    role,
    layout,
    field: resolvedField,
    // Form.io omits `input` on layout components and sets it false on display ones.
    input: isDataRole(role) && component.input !== false && !!key,
    // Vise's builder writes mobileHidden independently of Form.io's cross-platform
    // hidden flag. Both retain their values/defaults while staying off the screen.
    hidden: component.hidden === true || component.mobileHidden === true || base === 'hidden',
    protected: component.protected === true,
    multiple: component.multiple === true,
    validate: readValidation(component),
    conditional: readConditional(component),
    // Form.io's default. `false` only when the author explicitly turned it off.
    clearOnHide: component.clearOnHide !== false,
    defaultValue: component.defaultValue,
    calculate: isObject(component.calculateValue) ? component.calculateValue : undefined,
    calculateOverride: component.allowCalculateOverride === true,
    children,
    columns: known?.layout === 'columns' ? toColumns(component) : undefined,
    tabs: known?.layout === 'tabs' ? toTabs(component) : undefined,
    tableRows: known?.layout === 'table' ? toTableRows(component) : undefined,
    html: role === 'display' ? htmlToText(asString(component.html) || asString(component.content)) || undefined : undefined,
    collapsible: component.collapsible === true,
    collapsed: component.collapsible === true && component.collapsed === true,
    select,
    file: base === 'file' || base === 'signature' ? readFileConfig(component) : undefined,
    grid: role === 'grid' ? readGridConfig(component, base) : undefined,
    issues,
  };
}

/** Convert a Form.io `components` array into the editable model. Never throws. */
export function parseFormComponents(components: unknown): FormComponent[] {
  if (!Array.isArray(components)) return [];
  const out: FormComponent[] = [];
  for (const component of components) {
    if (!isObject(component)) continue;
    const normalized = normalizeOne(component);
    if (Array.isArray(normalized)) out.push(...normalized);
    else out.push(normalized);
  }
  return out;
}

/**
 * Walk every component in a tree, in document order, with its absolute data path.
 *
 * Grid rows are not visited: a grid's children describe one row and are re-pathed per row by the
 * engine, which is the only place that knows how many rows there are.
 */
export function walkComponents(
  components: FormComponent[],
  visit: (component: FormComponent, path: string) => void,
  parentPath = ''
): void {
  for (const component of components) {
    const path = component.input ? joinPath(parentPath, component.key) : parentPath;
    visit(component, path);

    if (component.role === 'grid') continue;

    walkComponents(component.children, visit, path);
    for (const column of component.columns ?? []) walkComponents(column.children, visit, path);
    for (const tab of component.tabs ?? []) walkComponents(tab.children, visit, path);
    for (const row of component.tableRows ?? []) {
      for (const cell of row) walkComponents(cell.children, visit, path);
    }
  }
}

/** Every component in a grid row, with paths scoped to that row: `lines[2].qty`. */
export function walkGridRow(
  grid: FormComponent,
  gridPath: string,
  rowIndex: number,
  visit: (component: FormComponent, path: string) => void
): void {
  walkComponents(grid.children, visit, indexPath(gridPath, rowIndex));
}

function collectIssues(components: FormComponent[]): FormDefinition['issues'] {
  const issues: FormDefinition['issues'] = [];
  walkComponents(components, (component, path) => {
    for (const issue of component.issues) {
      issues.push({ path: path || component.key, issue });
    }
  });
  return issues;
}

/**
 * Build a form from a stored schema.
 *
 * Accepts the bare Form.io document, a `{ data: { … } }` record envelope, or a raw components
 * array, because backends differ in how much of the document they keep and a cache is one more
 * place the shape can change. Anything unrecognisable yields an empty form rather than an error:
 * the host falls back to its own layout, which is the right response both to "the schema has not
 * synced yet" and to "the schema is broken".
 */
export function parseForm(schema: unknown): FormDefinition {
  const document = isObject(schema) && isObject(schema.data) && !Array.isArray(schema.components)
    ? (schema.data as JsonObject)
    : isObject(schema)
      ? schema
      : {};

  const rawComponents = Array.isArray(schema)
    ? schema
    : Array.isArray(document.components)
      ? document.components
      : [];

  const components = parseFormComponents(rawComponents);
  const display = asString(document.display, 'form');

  return {
    title: asString(document.title),
    path: asString(document.path),
    display: (display === 'wizard' || display === 'pdf' ? display : 'form') as FormDefinition['display'],
    components,
    issues: collectIssues(components),
  };
}
