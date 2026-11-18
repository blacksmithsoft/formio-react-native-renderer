// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * The phone layout, as data — docs/FORMS.md §8.
 *
 * A phone is not a narrow tablet. Honouring a four-across row at 390dp leaves 67dp of input per
 * field, and a table that scrolls sideways is unusable in a gloved hand. So below
 * `phone.breakpoint` the renderer stops reproducing the authored grid and re-flows the same
 * components by three rules:
 *
 * 1. **At most two fields share a row**, and only fields whose answers are short.
 * 2. **Nothing scrolls sideways.** A table of records becomes a stack of cards.
 * 3. **Every section is a card.** A titled panel is a card that starts closed; fields that sit
 *    outside any panel are gathered into an untitled card that is always open.
 *
 * This file decides *what goes where* and draws nothing, so the rules can be tested as data and
 * read without a view tree in the way. `PhoneCards.tsx` draws the result.
 *
 * Document order is never changed. A short field that has no short neighbour takes a row of its
 * own rather than being moved next to one: the order of a form is the order it is filled in.
 */

import { evaluateConditional } from '../engine/conditionals';
import { getAtPath, joinPath } from '../engine/dataPaths';
import type { FormComponent } from '../engine/types';
import { resolveFormColumnSpan } from './columnLayout';

/** A select whose longest choice is at most this many characters still reads in half a row. */
const SHORT_OPTION_LENGTH = 12;
/** Inline radio options whose labels total at most this many characters fit half a row. */
const SHORT_RADIO_LENGTH = 10;
const SHORT_RADIO_OPTIONS = 3;
/** A radio option longer than this is stacked: inline, it would run off the edge of the card. */
const INLINE_RADIO_OPTION_LENGTH = 20;
/** A label longer than this wraps past two lines in half a row, so the field keeps a full one. */
const LONG_LABEL_LENGTH = 40;
/**
 * A column authored at a third of the row or less was already narrow on a tablet, so its
 * content fits half a phone row. A half-row tablet column holds more than that.
 */
const NARROW_COLUMN_SPAN = 4;

/** Whether a measured container width selects the phone layout. */
export function isPhoneWidth(width: number, breakpoint: number): boolean {
  return width < breakpoint;
}

/**
 * How much of a row a component may share.
 *
 * - `short` — the answer is always short (a number, a date, a Yes/No). Pairs with a `short`
 *   neighbour anywhere.
 * - `row` — single-line free text. It *can* hold a long answer, so it pairs only where the
 *   author already placed it in a narrow column or a table cell.
 * - `wide` — always takes the full row.
 */
export type PhoneFit = 'short' | 'row' | 'wide';

export function phoneFit(component: FormComponent): PhoneFit {
  if (component.role !== 'input' || component.multiple) return 'wide';
  const { field, base } = component;
  if (field.label.trim().length > LONG_LABEL_LENGTH) return 'wide';

  switch (base) {
    case 'number':
    case 'currency':
    case 'datetime':
    case 'time':
      return 'short';
    case 'select': {
      // No inlined choices means their length is unknown, and unknown is treated as long.
      const options = field.options ?? [];
      return options.length > 0 && options.every((option) => option.label.length <= SHORT_OPTION_LENGTH)
        ? 'short'
        : 'wide';
    }
    case 'radio': {
      const options = field.options ?? [];
      const total = options.reduce((sum, option) => sum + option.label.length, 0);
      return options.length > 0 && options.length <= SHORT_RADIO_OPTIONS && total <= SHORT_RADIO_LENGTH
        ? 'short'
        : 'wide';
    }
    case 'textfield':
    case 'email':
    case 'url':
    case 'phoneNumber':
    case 'password':
    case 'checkbox':
      return 'row';
    default:
      return 'wide';
  }
}

const projected = new WeakMap<FormComponent, FormComponent>();

/**
 * The component as a phone draws it.
 *
 * Three display properties are settled here, once, so that no control has to know which layout
 * it is in:
 *
 * - the label always sits **above** the control — a left label takes a third of a row a phone
 *   does not have;
 * - radio options run **inline** when each is short enough to stay inside the card;
 * - select-box options are always **stacked**.
 *
 * Cached per component, so the object handed to a control keeps its identity between renders.
 */
export function phoneComponent(component: FormComponent): FormComponent {
  const cached = projected.get(component);
  if (cached) return cached;

  const { field, base } = component;
  let inline = field.inline;
  if (base === 'radio') {
    inline = (field.options ?? []).every((option) => option.label.length <= INLINE_RADIO_OPTION_LENGTH);
  } else if (base === 'selectboxes') {
    inline = false;
  }

  const next =
    field.labelPosition === 'top' && field.inline === inline
      ? component
      : { ...component, field: { ...field, labelPosition: 'top' as const, inline } };
  projected.set(component, next);
  return next;
}

/** Where a run of components sits in the submission. Mirrors `NodeProps`. */
export interface PhoneScope {
  parentPath: string;
  row?: Record<string, unknown>;
  rowIndex?: number;
}

export interface PhoneItem {
  /** Stable within one flow, for React keys. */
  id: string;
  component: FormComponent;
  scope: PhoneScope;
  /**
   * `notices` draws only the component's notices. Its children were hoisted into the flow —
   * a `columns`, a `container` — and its warning must not be lost with its chrome.
   */
  kind: 'component' | 'notices';
  fit: PhoneFit;
  /** Set on the fields of one authored row, which may pair with each other and nothing else. */
  rowGroup?: string;
  /**
   * Draws its own card chrome — a panel, a tab strip, a grid of record cards. At the top level
   * it stands alone instead of being gathered into the untitled card.
   */
  standalone: boolean;
}

export interface PhonePlanOptions {
  /** The whole submission, which conditionals are evaluated against. */
  data: Record<string, unknown>;
  /** A host control replaces this component outright, so its size is unknown. */
  isHostDrawn: (component: FormComponent) => boolean;
  /** Any host override applies to this component, including one matched by type. */
  hasOverride: (component: FormComponent) => boolean;
}

/** The same test `ComponentRenderer` applies, so a pair is never planned around an absent field. */
function isDrawn(component: FormComponent, scope: PhoneScope, data: Record<string, unknown>): boolean {
  if (component.hidden) return false;
  const path = component.input ? joinPath(scope.parentPath, component.key) : scope.parentPath;
  const logic = scope.row ? { root: data, row: scope.row } : { root: data };
  const input = component.input ? getAtPath(data, path) : undefined;
  return evaluateConditional(component.conditional, logic, input, scope.rowIndex);
}

/** A `button`, or a `content` with nothing in it: present in the schema, absent from the screen. */
function drawsNothing(component: FormComponent): boolean {
  return (
    component.role === 'display' &&
    component.base !== 'reviewpage' &&
    !component.html &&
    !(component.htmlBlocks && component.htmlBlocks.length > 0) &&
    component.issues.length === 0
  );
}

/**
 * Cells the author placed side by side: the columns of a `columns`, the cells of a table row.
 *
 * When each cell holds exactly one field they are a row, and its fields may pair with each
 * other. Otherwise each cell is a list of its own and the lists simply follow one another.
 * `narrow` says whether a cell was narrow enough as authored for single-line text to share a
 * phone row; a table cell always is.
 */
export function flattenPhoneRow(
  cells: FormComponent[][],
  scope: PhoneScope,
  options: PhonePlanOptions,
  id: string,
  narrow: (cell: number) => boolean = () => true
): PhoneItem[] {
  const lists = cells.map((children, cell) => flattenPhoneFlow(children, scope, options, `${id}/${cell}/`));
  const filled = lists.filter((list) => list.length > 0);
  const isRow =
    filled.length >= 2 &&
    filled.every((list) => list.length === 1 && list[0]?.kind === 'component' && !list[0].standalone);
  if (!isRow) return lists.flat();

  return lists.flatMap((list, cell) =>
    list.map((item) => ({
      ...item,
      rowGroup: id,
      fit: item.fit === 'row' && !narrow(cell) ? ('wide' as const) : item.fit,
    }))
  );
}

/**
 * Reduce a component list to the things a phone draws one under another.
 *
 * Chrome-less wrappers disappear: the children of a `columns`, a `container`, a one-row `table`
 * and a bare group are hoisted into the surrounding flow, each still carrying the data scope it
 * had inside its wrapper. What is left is fields, plus the components that draw a card of their
 * own.
 */
export function flattenPhoneFlow(
  components: FormComponent[],
  scope: PhoneScope,
  options: PhonePlanOptions,
  prefix = ''
): PhoneItem[] {
  const out: PhoneItem[] = [];

  components.forEach((component, index) => {
    if (!isDrawn(component, scope, options.data)) return;

    const id = `${prefix}${index}:${component.key}`;
    // Only a component that owns data re-scopes its children. Layout never does.
    const inner: PhoneScope = component.input
      ? { ...scope, parentPath: joinPath(scope.parentPath, component.key) }
      : scope;

    const push = (fit: PhoneFit, standalone: boolean): void => {
      out.push({ id, component, scope, kind: 'component', fit, standalone });
    };
    const notices = (): void => {
      if (component.issues.length === 0) return;
      out.push({ id: `${id}!`, component, scope, kind: 'notices', fit: 'wide', standalone: false });
    };
    const hoist = (children: FormComponent[]): void => {
      out.push(...flattenPhoneFlow(children, inner, options, `${id}/`));
    };

    switch (component.role) {
      case 'layout':
        switch (component.layout) {
          case 'panel':
            push('wide', true);
            return;
          case 'tabs':
            if ((component.tabs ?? []).length > 0) push('wide', true);
            return;
          case 'columns': {
            const columns = component.columns ?? [];
            notices();
            out.push(
              ...flattenPhoneRow(
                columns.map((column) => column.children),
                inner,
                options,
                id,
                (cell) => resolveFormColumnSpan(columns[cell]?.width ?? 0) <= NARROW_COLUMN_SPAN
              )
            );
            return;
          }
          case 'table': {
            const rows = component.tableRows ?? [];
            if (rows.length > 1) {
              // Several rows are several records; each becomes a sub-card — see `PhoneTable`.
              push('wide', false);
            } else if (rows[0]) {
              notices();
              out.push(...flattenPhoneRow(rows[0].map((cell) => cell.children), inner, options, id));
            }
            return;
          }
          default:
            notices();
            hoist(component.children);
            return;
        }
      case 'container':
        notices();
        hoist(component.children);
        return;
      case 'display':
        if (!drawsNothing(component)) push('wide', false);
        return;
      case 'grid':
        // A data grid draws its rows as cards of their own. An edit grid is a list of one-line
        // summaries, which belongs inside a card like any other field. A host-drawn grid brings
        // whatever chrome the host gave it.
        push('wide', options.hasOverride(component) || component.base !== 'editgrid');
        return;
      case 'input':
        push(options.isHostDrawn(component) ? 'wide' : phoneFit(component), false);
        return;
      default:
        push('wide', false);
    }
  });

  return out;
}

/** One row of a phone card: a field on its own, or two side by side. Never three. */
export type PhoneLine =
  | { kind: 'single'; item: PhoneItem }
  | { kind: 'pair'; left: PhoneItem; right: PhoneItem };

function canPair(left: PhoneItem, right: PhoneItem): boolean {
  if (left.kind !== 'component' || right.kind !== 'component') return false;
  if (left.standalone || right.standalone) return false;
  // An authored row pairs within itself only; a loose field never joins one.
  if (left.rowGroup !== right.rowGroup) return false;
  return left.rowGroup
    ? left.fit !== 'wide' && right.fit !== 'wide'
    : left.fit === 'short' && right.fit === 'short';
}

/** Lay a flow out in rows of at most two, pairing only adjacent items and never reordering. */
export function pairPhoneItems(items: PhoneItem[]): PhoneLine[] {
  const lines: PhoneLine[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) continue;
    const next = items[index + 1];
    if (next && canPair(item, next)) {
      lines.push({ kind: 'pair', left: item, right: next });
      index += 1;
    } else {
      lines.push({ kind: 'single', item });
    }
  }
  return lines;
}

/** What the top level of a phone form is made of. */
export type PhoneBlock =
  | { kind: 'card'; id: string; lines: PhoneLine[] }
  | { kind: 'standalone'; item: PhoneItem };

/**
 * Split a top-level flow into cards.
 *
 * Anything that draws its own card stands alone. Every run of fields between two of those is
 * gathered into one untitled card, so no field on a phone ever sits loose on the page.
 */
export function groupPhoneBlocks(items: PhoneItem[]): PhoneBlock[] {
  const blocks: PhoneBlock[] = [];
  let loose: PhoneItem[] = [];

  const flush = (): void => {
    const first = loose[0];
    if (!first) return;
    blocks.push({ kind: 'card', id: `card-${first.id}`, lines: pairPhoneItems(loose) });
    loose = [];
  };

  for (const item of items) {
    if (item.standalone) {
      flush();
      blocks.push({ kind: 'standalone', item });
    } else {
      loose.push(item);
    }
  }
  flush();
  return blocks;
}

/**
 * Whether any of `targets` — error keys, or the one path being revealed — lies inside this
 * subtree.
 *
 * A grid's rows live under `path[n]` and a container's fields under `path.key`, so a prefix
 * test finds a target inside either without walking the row template against live data.
 */
export function subtreeOwnsPath(
  components: FormComponent[],
  parentPath: string,
  targets: readonly string[]
): boolean {
  if (targets.length === 0) return false;
  for (const component of components) {
    const path = component.input ? joinPath(parentPath, component.key) : parentPath;
    if (component.input && path) {
      const hit = targets.some(
        (target) => target === path || target.startsWith(`${path}[`) || target.startsWith(`${path}.`)
      );
      if (hit) return true;
    }
    if (subtreeOwnsPath(component.children, path, targets)) return true;
    for (const column of component.columns ?? []) {
      if (subtreeOwnsPath(column.children, path, targets)) return true;
    }
    for (const tab of component.tabs ?? []) {
      if (subtreeOwnsPath(tab.children, path, targets)) return true;
    }
    for (const tableRow of component.tableRows ?? []) {
      for (const cell of tableRow) {
        if (subtreeOwnsPath(cell.children, path, targets)) return true;
      }
    }
  }
  return false;
}

/** The heading of one record card. */
export interface PhoneRecordHeading {
  /** The label of the column the title was taken from, drawn small above it. */
  caption?: string;
  title: string;
  /** The column that became the title. It is not repeated in the card body. */
  titleKey?: string;
}

/** `Add Certificate` names the thing being added; `Add Another` names nothing. */
function recordNoun(grid: FormComponent): string {
  const match = /^\s*add\s+(.+?)\s*$/i.exec(grid.grid?.addLabel ?? '');
  const noun = match?.[1];
  if (noun && !/^(another|more|new|row|item)$/i.test(noun)) return noun;
  return grid.field.label.trim();
}

/**
 * What a record card is called.
 *
 * A row that carries a read-only text column is identified by it — the certificate *type*, the
 * checklist's serial number — because that is what the author put there to tell rows apart. A
 * row with nothing of the kind is numbered: `Quantity #2`.
 */
export function phoneRecordHeading(
  grid: FormComponent,
  row: Record<string, unknown>,
  index: number
): PhoneRecordHeading {
  for (const child of grid.children) {
    if (child.hidden || child.role !== 'input' || child.base !== 'textfield') continue;
    if (!child.field.disabled || child.field.multiline || !child.field.label.trim()) continue;
    const value = row[child.key];
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const title = String(value).trim();
    if (title) return { caption: child.field.label.trim(), title, titleKey: child.key };
  }
  const noun = recordNoun(grid);
  return { title: noun ? `${noun} #${index + 1}` : `#${index + 1}` };
}

/**
 * The columns drawn in a record card's body.
 *
 * Two are left out: the column that became the heading, and a checkbox with no label. In a
 * table that checkbox is a tick column whose meaning comes from the header row beside it; on a
 * card it is a box with nothing to say what ticking it does. A *required* one stays: a field
 * the form will not submit without has to be somewhere the user can reach it.
 */
export function phoneRecordFields(grid: FormComponent, heading: PhoneRecordHeading): FormComponent[] {
  return grid.children.filter((child) => {
    if (heading.titleKey !== undefined && child.key === heading.titleKey) return false;
    const blankTick = child.base === 'checkbox' && child.field.label.trim() === '';
    return !blankTick || child.field.required;
  });
}
