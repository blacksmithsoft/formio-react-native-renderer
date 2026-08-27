// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Authored HTML → native-drawable blocks — docs/FORMS.md §8.
 *
 * This is not a browser. It is a box model over the subset of HTML and CSS the schemas in the
 * field actually use: nested `div`s, embedded images, an HTML `<table>`, the inputs those tables
 * contain, and the inline styles that letterheads are built from — `display: flex`, `flex`,
 * `width`, `height`, `padding`, `margin`, `border`, `background-color`, `color`, `font-size`,
 * `font-weight` and `text-align`.
 *
 * Two properties matter more than the length of that list, because they are what a flattened
 * string or a fixed-size image loses:
 *
 * - **Sizing follows the author.** A flex child with `flex: 1` grows; a sibling without it is as
 *   wide as its contents. Splitting a row into equal halves is what made a logo occupy half a
 *   letterhead when the author asked for `height: 80px; width: auto`.
 * - **Inline content stays on its line.** Text, `<strong>` and `<img>` are inline-level, so
 *   `<strong>Note:</strong> see below` is one line with one bold run — not two paragraphs — and a
 *   stray character beside an image sits beside it rather than under it.
 *
 * Inheritance is resolved here, not in the renderer: every block and span carries the absolute
 * text style that applies to it, so drawing a block never depends on where it came from.
 *
 * Pure. Imports nothing from React or React Native. Never throws.
 */

export type HtmlAlign = 'left' | 'center' | 'right' | 'justify';

export type HtmlFieldType = 'text' | 'textarea' | 'date';

export type HtmlAlignItems = 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';

export type HtmlJustify =
  | 'flex-start'
  | 'center'
  | 'flex-end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';

/** One value per side, in CSS order. Absent sides are unset, not zero. */
export interface HtmlEdges {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface HtmlEdgeColors {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

/**
 * The inheritable half of the CSS subset. Resolved against the ancestors, so these are the
 * absolute values that apply — never a delta. `fontSize` and `lineHeight` are in points; both are
 * left unset when the author did not ask for a size, which is what lets the theme own the default.
 */
export interface HtmlTextStyle {
  color?: string;
  fontSize?: number;
  lineHeight?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: HtmlAlign;
}

/** A box: the inheritable text style plus everything that does not inherit. */
export interface HtmlBoxStyle extends HtmlTextStyle {
  background?: string;
  /** `display: flex` — children are laid out along the main axis instead of stacking. */
  row?: boolean;
  wrap?: boolean;
  alignItems?: HtmlAlignItems;
  justify?: HtmlJustify;
  gap?: number;
  /** `flex: <n>` — the share of the free space this box takes. Unset means "as wide as needed". */
  grow?: number;
  width?: number;
  widthPercent?: number;
  maxWidth?: number;
  height?: number;
  minHeight?: number;
  padding?: HtmlEdges;
  margin?: HtmlEdges;
  borderWidth?: HtmlEdges;
  borderColor?: HtmlEdgeColors;
  radius?: number;
}

/** A run of text inside one line. `style` is present only where it differs from the block's. */
export interface HtmlSpan {
  text: string;
  style?: HtmlTextStyle;
}

export interface HtmlBlock {
  kind: 'text' | 'image' | 'box' | 'table' | 'field' | 'radio';
  /** `text`: the whole line, flattened. Always present, so callers never have to walk spans. */
  text?: string;
  /** `text`: the styled runs, when the line is not uniform. */
  spans?: HtmlSpan[];
  /** `data:image/…` or `file:` only — remote URLs are dropped so a cached form stays offline. */
  imageUri?: string;
  /**
   * Pixel size read out of the image's own header. Without it `width: auto` cannot be honoured:
   * React Native, unlike a browser, does not size an image from its contents.
   */
  imageWidth?: number;
  imageHeight?: number;
  /** `box`: the children, in document order. */
  children?: HtmlBlock[];
  /** `table`: rows of cells. Every cell is a `box`. */
  rows?: HtmlBlock[][];
  colspan?: number;
  rowspan?: number;
  header?: boolean;
  fieldType?: HtmlFieldType;
  /**
   * Submission path this control writes. `data[calibratedName]` becomes `calibratedName`.
   * Unnamed inputs get a stable path from {@link assignHtmlBindPaths}.
   */
  bindPath?: string;
  placeholder?: string;
  radioValue?: string;
  style?: HtmlBoxStyle;
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Inline-level tags: their content joins the surrounding line instead of breaking it. */
const INLINE = new Set([
  'a',
  'abbr',
  'b',
  'big',
  'cite',
  'code',
  'del',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'time',
  'tt',
  'u',
  'var',
]);

/**
 * Tags whose open implies the close of an already-open one. Without these a schema that drops a
 * `</td>` — and they do — swallows the rest of the table into one cell.
 */
const IMPLIED_CLOSE: Record<string, string[]> = {
  li: ['li'],
  p: ['p'],
  td: ['td', 'th'],
  th: ['td', 'th'],
  tr: ['td', 'th', 'tr'],
  thead: ['td', 'th', 'tr'],
  tbody: ['td', 'th', 'tr', 'thead'],
  tfoot: ['td', 'th', 'tr', 'thead', 'tbody'],
  option: ['option'],
};

/** Browser defaults for the tags that carry one. Relative sizes resolve against the parent. */
const HEADING_SCALE: Record<string, number> = {
  h1: 2,
  h2: 1.5,
  h3: 1.17,
  h4: 1,
  h5: 0.83,
  h6: 0.67,
};

/** Only used to resolve `em`, `%` and heading scales when no ancestor set a size. */
const REFERENCE_FONT_SIZE = 16;

const NAMED_COLORS: Record<string, string> = {
  aqua: '#00FFFF',
  black: '#000000',
  blue: '#0000FF',
  brown: '#A52A2A',
  darkblue: '#00008B',
  darkgray: '#A9A9A9',
  darkgrey: '#A9A9A9',
  darkgreen: '#006400',
  darkred: '#8B0000',
  fuchsia: '#FF00FF',
  gainsboro: '#DCDCDC',
  gold: '#FFD700',
  gray: '#808080',
  green: '#008000',
  grey: '#808080',
  lightblue: '#ADD8E6',
  lightgray: '#D3D3D3',
  lightgrey: '#D3D3D3',
  lightyellow: '#FFFFE0',
  lime: '#00FF00',
  maroon: '#800000',
  navy: '#000080',
  olive: '#808000',
  orange: '#FFA500',
  pink: '#FFC0CB',
  purple: '#800080',
  red: '#FF0000',
  silver: '#C0C0C0',
  teal: '#008080',
  white: '#FFFFFF',
  whitesmoke: '#F5F5F5',
  yellow: '#FFFF00',
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  bull: '\u2022',
  cent: '\u00A2',
  copy: '\u00A9',
  deg: '\u00B0',
  divide: '\u00F7',
  euro: '\u20AC',
  frac12: '\u00BD',
  ge: '\u2265',
  gt: '>',
  hellip: '\u2026',
  laquo: '\u00AB',
  ldquo: '\u201C',
  le: '\u2264',
  lsquo: '\u2018',
  lt: '<',
  mdash: '\u2014',
  micro: '\u00B5',
  middot: '\u00B7',
  nbsp: '\u00A0',
  ndash: '\u2013',
  ne: '\u2260',
  para: '\u00B6',
  plusmn: '\u00B1',
  pound: '\u00A3',
  quot: '"',
  raquo: '\u00BB',
  rdquo: '\u201D',
  reg: '\u00AE',
  rsquo: '\u2019',
  sect: '\u00A7',
  sup2: '\u00B2',
  sup3: '\u00B3',
  times: '\u00D7',
  trade: '\u2122',
  yen: '\u00A5',
};

interface El {
  kind: 'el';
  tag: string;
  attrs: Record<string, string>;
  children: Ast[];
}
interface Tx {
  kind: 'text';
  value: string;
}
type Ast = El | Tx;

type Decls = Record<string, string>;

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

/**
 * True when the blocks carry layout the flattened string would lose: an embedded image, a table,
 * a control, a painted or sized box, or a row. Plain instructional copy — even bold copy — still
 * goes through {@link htmlToText}, because a paragraph reads better as one wrapped string than as
 * a stack of lines.
 */
export function htmlBlocksHaveChrome(blocks: HtmlBlock[]): boolean {
  return blocks.some(isChrome);
}

function isChrome(block: HtmlBlock): boolean {
  if (block.kind === 'image' || block.kind === 'table') return true;
  if (block.kind === 'field' || block.kind === 'radio') return true;
  if (isPainted(block.style)) return true;
  if (block.kind === 'box') return (block.children ?? []).some(isChrome);
  return false;
}

/** The styles a flattened string cannot carry. Font size and weight alone are not enough. */
function isPainted(style: HtmlBoxStyle | undefined): boolean {
  if (!style) return false;
  return !!(
    style.background ||
    style.color ||
    style.align ||
    style.row ||
    style.grow !== undefined ||
    style.width !== undefined ||
    style.widthPercent !== undefined ||
    style.height !== undefined ||
    style.minHeight !== undefined ||
    edgeSum(style.borderWidth) > 0 ||
    edgeSum(style.padding) > 0
  );
}

function edgeSum(edges: HtmlEdges | undefined): number {
  if (!edges) return 0;
  return (edges.top ?? 0) + (edges.right ?? 0) + (edges.bottom ?? 0) + (edges.left ?? 0);
}

/**
 * Give unnamed HTML inputs a stable path under the owning component key, so a thermometer
 * reading table still submits even when the author left `name` off the `<input>`.
 */
export function assignHtmlBindPaths(blocks: HtmlBlock[], ownerKey: string): HtmlBlock[] {
  let index = 0;
  const nextPath = (): string => {
    index += 1;
    return ownerKey ? `${ownerKey}__f${index}` : `html__f${index}`;
  };

  const walk = (block: HtmlBlock): HtmlBlock => {
    if ((block.kind === 'field' || block.kind === 'radio') && !block.bindPath) {
      return { ...block, bindPath: nextPath() };
    }
    if (block.kind === 'table' && block.rows) {
      return { ...block, rows: block.rows.map((row) => row.map(walk)) };
    }
    if (block.children) {
      return { ...block, children: block.children.map(walk) };
    }
    return block;
  };

  return blocks.map(walk);
}

export function parseHtmlBlocks(html: string): HtmlBlock[] {
  if (!html) return [];
  return tidy(blockChildren(parseAst(html), {}));
}

// ---------------------------------------------------------------------------------------------
// Tokenising
// ---------------------------------------------------------------------------------------------

/**
 * A stack, not recursion. Authored markup is routinely unbalanced — a missing `</div>`, a `</td>`
 * that never arrives — and a recursive parser reads the rest of the document as the contents of
 * whatever was left open. Closing the nearest matching ancestor, and ignoring a close tag that
 * matches nothing, is what a browser does and is the difference between a table and one cell.
 */
function parseAst(source: string): Ast[] {
  const root: El = { kind: 'el', tag: '#root', attrs: {}, children: [] };
  const stack: El[] = [root];
  const top = (): El => stack[stack.length - 1] ?? root;
  const pushText = (value: string): void => {
    if (value) top().children.push({ kind: 'text', value });
  };

  let index = 0;
  while (index < source.length) {
    const lt = source.indexOf('<', index);
    if (lt === -1) {
      pushText(source.slice(index));
      break;
    }
    if (lt > index) pushText(source.slice(index, lt));

    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }

    const gt = findTagEnd(source, lt);
    if (gt === -1) {
      pushText(source.slice(lt));
      break;
    }

    const raw = source.slice(lt + 1, gt).trim();
    index = gt + 1;

    if (raw.startsWith('!') || raw.startsWith('?')) continue;

    if (raw.startsWith('/')) {
      const tag = (/^[^\s/>]+/.exec(raw.slice(1).trim())?.[0] ?? '').toLowerCase();
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth]?.tag === tag) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }

    const selfClose = raw.endsWith('/');
    const { tag, attrs } = parseOpenTag(selfClose ? raw.slice(0, -1) : raw);
    if (!tag) continue;

    if (tag === 'script' || tag === 'style') {
      const end = source.toLowerCase().indexOf(`</${tag}`, index);
      index = end === -1 ? source.length : end;
      continue;
    }

    const implied = IMPLIED_CLOSE[tag];
    if (implied) {
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (implied.includes(stack[depth]?.tag ?? '')) {
          stack.length = depth;
          break;
        }
      }
    }

    const el: El = { kind: 'el', tag, attrs, children: [] };
    top().children.push(el);
    if (!VOID.has(tag) && !selfClose) stack.push(el);
  }

  return root.children;
}

/** The `>` that ends a tag, skipping the quoted attribute values that may contain one. */
function findTagEnd(source: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return index;
  }
  return -1;
}

function parseOpenTag(body: string): { tag: string; attrs: Record<string, string> } {
  const written = /^[^\s/]+/.exec(body.trim())?.[0] ?? '';
  const tag = written.toLowerCase();
  const attrs: Record<string, string> = {};
  if (!tag) return { tag, attrs };
  const attrRe = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  attrRe.lastIndex = body.indexOf(written) + written.length;
  let found: RegExpExecArray | null;
  while ((found = attrRe.exec(body))) {
    const name = found[1]?.toLowerCase();
    if (!name) continue;
    attrs[name] = decodeEntities(found[2] ?? found[3] ?? found[4] ?? '');
  }
  return { tag, attrs };
}

// ---------------------------------------------------------------------------------------------
// Flow: inline runs, replaced elements and blocks
// ---------------------------------------------------------------------------------------------

type Flow =
  | { type: 'spans'; spans: HtmlSpan[] }
  /** An `<img>` or an `<input>`: inline-level, but drawn as its own view. */
  | { type: 'replaced'; block: HtmlBlock }
  | { type: 'block'; block: HtmlBlock };

/** The children of a normal-flow container: inline runs grouped into lines, blocks kept apart. */
function blockChildren(nodes: Ast[], inherited: HtmlTextStyle): HtmlBlock[] {
  return groupLines(flowOf(nodes, inherited), inherited);
}

function flowOf(nodes: Ast[], inherited: HtmlTextStyle): Flow[] {
  const out: Flow[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      const text = collapseSpace(decodeEntities(node.value));
      if (text) out.push({ type: 'spans', spans: [{ text, style: inherited }] });
      continue;
    }
    out.push(...convertElement(node, inherited));
  }
  return out;
}

function convertElement(node: El, inherited: HtmlTextStyle): Flow[] {
  const { tag, attrs } = node;

  if (tag === 'br') return [{ type: 'spans', spans: [{ text: '\n', style: inherited }] }];

  const decls = parseDeclarations(attrs.style);
  if (decls.display === 'none') return [];

  if (tag === 'img') {
    const image = imageBlock(attrs, decls, inherited);
    return image ? [{ type: 'replaced', block: image }] : [];
  }

  if (tag === 'input' || tag === 'textarea') {
    const control = htmlControl(tag, attrs, styleOf(decls, inherited, tag));
    return control ? [{ type: 'replaced', block: control }] : [];
  }

  if (tag === 'table') {
    const table = htmlTable(node, styleOf(decls, inherited, tag));
    return table ? [{ type: 'block', block: table }] : [];
  }

  if (tag === 'hr') {
    const style = { ...ruleStyle(), ...(boxPart(styleOf(decls, inherited, tag)) ?? {}) };
    return [{ type: 'block', block: { kind: 'box', style } }];
  }

  const style = styleOf(decls, inherited, tag);
  const text = textPart(style);
  const box = boxPart(style);

  if (style.row) {
    return [
      {
        type: 'block',
        block: { kind: 'box', ...(box ? { style: box } : {}), children: flexItems(node.children, text) },
      },
    ];
  }

  const flow = flowOf(node.children, text);

  // An inline element keeps its content in the surrounding line. Its own inline styles are
  // already resolved into the spans, so nothing is lost by dissolving the element itself.
  if (INLINE.has(tag) && !isBoxLike(box) && !flow.some((item) => item.type === 'block')) {
    return flow;
  }

  const children = groupLines(flow, text);
  if (tag === 'li') children.unshift(bulletBlock(text));
  if (children.length === 0 && !isPainted(box)) return [];
  return [{ type: 'block', block: { kind: 'box', ...(box ? { style: box } : {}), children } }];
}

/**
 * Group a flow into lines. Consecutive inline content becomes one line — a single `text` block
 * when it is all text, or a row when an image or a control sits in the middle of it — and every
 * block-level child breaks the line, exactly as it does in a browser.
 */
function groupLines(flow: Flow[], inherited: HtmlTextStyle): HtmlBlock[] {
  const out: HtmlBlock[] = [];
  let line: Flow[] = [];

  const flush = (): void => {
    if (line.length === 0) return;
    const current = line;
    line = [];

    if (current.every((item) => item.type === 'spans')) {
      const spans = trimSpans(mergeSpans(current.flatMap((item) => item.spans)));
      if (spans.length > 0) out.push(textBlock(spans, inherited));
      return;
    }

    const children: HtmlBlock[] = [];
    for (const item of current) {
      if (item.type === 'spans') {
        // Whitespace between two replaced elements is not worth a view of its own.
        const spans = trimSpans(mergeSpans(item.spans));
        if (spans.length > 0) children.push(textBlock(spans, inherited));
      } else {
        children.push(fillControl(item.block));
      }
    }
    if (children.length === 1) out.push(children[0]!);
    else if (children.length > 1) {
      // On a line, `text-align` positions the run along the line, which is what a flex main-axis
      // alignment does here. Each item is as wide as its contents, so its own alignment is moot.
      const justify =
        inherited.align === 'center' ? 'center' : inherited.align === 'right' ? 'flex-end' : undefined;
      out.push({
        kind: 'box',
        style: { row: true, alignItems: 'center', wrap: true, ...(justify ? { justify } : {}) },
        children,
      });
    }
  };

  for (const item of flow) {
    if (item.type === 'block') {
      flush();
      out.push(item.block);
      continue;
    }
    line.push(item);
  }
  flush();
  return out;
}

/**
 * The children of a flex container. Every child node is an item — including a bare text run,
 * which is why a stray character after an `<img/>` belongs beside it and not under it. Text nodes
 * that are only whitespace are not items, which is what keeps indented markup from growing gaps.
 */
function flexItems(nodes: Ast[], inherited: HtmlTextStyle): HtmlBlock[] {
  const out: HtmlBlock[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      const text = collapseSpace(decodeEntities(node.value)).trim();
      if (text) out.push(textBlock([{ text, style: inherited }], inherited));
      continue;
    }
    for (const item of convertElement(node, inherited)) {
      if (item.type === 'spans') {
        const spans = trimSpans(mergeSpans(item.spans));
        if (spans.length > 0) out.push(textBlock(spans, inherited));
      } else {
        out.push(fillControl(item.block));
      }
    }
  }
  return out;
}

function textBlock(spans: HtmlSpan[], inherited: HtmlTextStyle): HtmlBlock {
  const style = pruneStyle(inherited);
  const runs = spans.map((span) => {
    const diff = diffText(span.style, inherited);
    return diff ? { text: span.text, style: diff } : { text: span.text };
  });
  const uniform = runs.every((run) => !run.style);
  return {
    kind: 'text',
    text: runs.map((run) => run.text).join(''),
    ...(uniform && runs.length <= 1 ? {} : { spans: runs }),
    ...(style ? { style } : {}),
  };
}

/**
 * A text input sharing a line with anything else takes the space that is left. React Native does
 * not give an input the browser's default width, so measured by its own (empty) contents it would
 * collapse to nothing and the row would look like a caption with no answer.
 */
function fillControl(block: HtmlBlock): HtmlBlock {
  if (block.kind !== 'field') return block;
  const style = block.style;
  if (style?.width !== undefined || style?.widthPercent !== undefined || style?.grow !== undefined) {
    return block;
  }
  return { ...block, style: { ...style, grow: 1 } };
}

function bulletBlock(inherited: HtmlTextStyle): HtmlBlock {
  return textBlock([{ text: '\u2022 ', style: inherited }], inherited);
}

function ruleStyle(): HtmlBoxStyle {
  return { borderWidth: { top: 1 }, borderColor: { top: NAMED_COLORS.gray }, margin: { top: 8, bottom: 8 } };
}

function mergeSpans(spans: HtmlSpan[]): HtmlSpan[] {
  const out: HtmlSpan[] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && sameText(last.style, span.style)) {
      last.text += span.text;
      continue;
    }
    out.push({ ...span });
  }
  return out;
}

/** A line does not start or end with the whitespace that indentation put there. */
function trimSpans(spans: HtmlSpan[]): HtmlSpan[] {
  const out = spans.map((span) => ({ ...span }));
  const first = out[0];
  if (first) first.text = first.text.replace(/^[\t\n\f\r ]+/, '');
  const last = out[out.length - 1];
  if (last) last.text = last.text.replace(/[\t\n\f\r ]+$/, '');
  return out.filter((span) => span.text.length > 0);
}

// ---------------------------------------------------------------------------------------------
// Images, controls and tables
// ---------------------------------------------------------------------------------------------

function imageBlock(
  attrs: Record<string, string>,
  decls: Decls,
  inherited: HtmlTextStyle
): HtmlBlock | undefined {
  const imageUri = offlineImageUri(attrs.src);
  if (!imageUri) return undefined;
  const style = styleOf(decls, inherited, 'img');
  const attrWidth = toPx(attrs.width, inherited.fontSize);
  const attrHeight = toPx(attrs.height, inherited.fontSize);
  if (style.width === undefined && style.widthPercent === undefined && attrWidth !== undefined) {
    style.width = attrWidth;
  }
  if (style.height === undefined && attrHeight !== undefined) style.height = attrHeight;
  const intrinsic = imageSize(imageUri);
  const pruned = boxPart(style);
  return {
    kind: 'image',
    imageUri,
    ...(intrinsic ? { imageWidth: intrinsic.width, imageHeight: intrinsic.height } : {}),
    ...(pruned ? { style: pruned } : {}),
  };
}

function htmlControl(
  tag: string,
  attrs: Record<string, string>,
  style: HtmlBoxStyle
): HtmlBlock | undefined {
  const type = (attrs.type || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();
  if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'image') return undefined;

  const pruned = pruneStyle(style);

  if (type === 'radio' || type === 'checkbox') {
    const assignment = parseFormioAssignment(attrs.onclick || attrs.onchange);
    return {
      kind: 'radio',
      bindPath: assignment?.path ?? bindPathFromName(attrs.name),
      radioValue: assignment?.value ?? attrs.value,
      ...(pruned ? { style: pruned } : {}),
    };
  }

  return {
    kind: 'field',
    fieldType:
      type === 'date' || type === 'datetime-local' || type === 'time'
        ? 'date'
        : tag === 'textarea'
          ? 'textarea'
          : 'text',
    bindPath: bindPathFromName(attrs.name),
    placeholder: attrs.placeholder,
    ...(pruned ? { style: pruned } : {}),
  };
}

/**
 * The Tasnim checklists write answers with
 * `onclick="Formio.getForm().submission.data.q1='yes'"`. That is JavaScript we will not run;
 * the assignment target is data, and a regex is enough to recover it.
 */
function parseFormioAssignment(script: string | undefined): { path: string; value: string } | undefined {
  if (!script) return undefined;
  const match =
    /submission\.data(?:\.([A-Za-z_]\w*)|\[['"]([A-Za-z_]\w*)['"]\])\s*=\s*['"]([^'"]*)['"]/.exec(
      script
    );
  const path = match?.[1] || match?.[2];
  if (!path) return undefined;
  return { path, value: match?.[3] ?? '' };
}

function bindPathFromName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const matches = [...name.matchAll(/\[([^[\]]+)\]/g)].map((entry) => entry[1] ?? '');
  if (matches.length > 0) {
    const parts = matches.map((part) => part.replace(/^['"]|['"]$/g, '')).filter(Boolean);
    return parts.length > 0 ? parts.join('.') : undefined;
  }
  if (/^[A-Za-z_]\w*$/.test(name) && !/_radio$/.test(name)) return name;
  return undefined;
}

function htmlTable(node: El, style: HtmlBoxStyle): HtmlBlock | undefined {
  const rows: HtmlBlock[][] = [];
  const text = textPart(style);
  const visit = (ast: Ast): void => {
    if (ast.kind !== 'el') return;
    if (ast.tag === 'tr') {
      const rowStyle = textPart(styleOf(parseDeclarations(ast.attrs.style), text, 'tr'));
      const cells = ast.children
        .filter((child): child is El => child.kind === 'el' && (child.tag === 'td' || child.tag === 'th'))
        .map((cell) => htmlCell(cell, rowStyle));
      if (cells.length > 0) rows.push(cells);
      return;
    }
    for (const child of ast.children) visit(child);
  };
  for (const child of node.children) visit(child);
  if (rows.length === 0) return undefined;
  const pruned = boxPart(style);
  return { kind: 'table', rows, ...(pruned ? { style: pruned } : {}) };
}

/** A cell is always a box, so the renderer can put the cell's own padding and border on it. */
function htmlCell(node: El, inherited: HtmlTextStyle): HtmlBlock {
  const style = styleOf(parseDeclarations(node.attrs.style), inherited, node.tag);
  const text = textPart(style);
  const children = style.row ? flexItems(node.children, text) : blockChildren(node.children, text);
  const colspan = Number.parseInt(node.attrs.colspan ?? '', 10);
  const rowspan = Number.parseInt(node.attrs.rowspan ?? '', 10);
  const box = boxPart(style);
  return {
    kind: 'box',
    children,
    header: node.tag === 'th' ? true : undefined,
    colspan: Number.isFinite(colspan) && colspan > 1 ? colspan : undefined,
    rowspan: Number.isFinite(rowspan) && rowspan > 1 ? rowspan : undefined,
    ...(box ? { style: box } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Tidying
// ---------------------------------------------------------------------------------------------

function tidy(blocks: HtmlBlock[]): HtmlBlock[] {
  const out: HtmlBlock[] = [];
  for (const block of blocks) {
    const kept = tidyBlock(block);
    if (kept) out.push(kept);
  }
  return out;
}

function tidyBlock(block: HtmlBlock): HtmlBlock | undefined {
  if (block.kind === 'table') {
    const rows = (block.rows ?? []).map((row) =>
      row.map((cell) => ({ ...cell, children: tidy(cell.children ?? []) }))
    );
    return { ...block, rows };
  }

  if (block.kind === 'box') {
    const children = tidy(block.children ?? []);
    // A wrapper that neither paints nor positions is not layout, and dropping it keeps a
    // deeply nested letterhead from becoming a deeply nested view tree.
    if (children.length === 1 && !isBoxLike(block.style) && !block.style?.row) return children[0];
    if (children.length === 0 && !isPainted(block.style)) return undefined;
    return { ...block, children };
  }

  if (block.kind === 'image') return block.imageUri ? block : undefined;
  if (block.kind === 'text') return block.text ? block : undefined;
  return block;
}

/** True when a box does something a bare wrapper does not: paint, size, space or position. */
function isBoxLike(style: HtmlBoxStyle | undefined): boolean {
  if (!style) return false;
  return !!(
    style.background ||
    style.row ||
    style.grow !== undefined ||
    style.width !== undefined ||
    style.widthPercent !== undefined ||
    style.maxWidth !== undefined ||
    style.height !== undefined ||
    style.minHeight !== undefined ||
    style.alignItems ||
    style.justify ||
    style.radius !== undefined ||
    edgeSum(style.padding) > 0 ||
    edgeSum(style.margin) > 0 ||
    edgeSum(style.borderWidth) > 0
  );
}

// ---------------------------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------------------------

function parseDeclarations(raw: string | undefined): Decls {
  const decls: Decls = {};
  if (!raw) return decls;
  for (const part of raw.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (key && value) decls[key] = value;
  }
  return decls;
}

/**
 * The resolved style of one element: what it inherits, then the browser default for its tag, then
 * its own declarations. Sizes are absolute by the time they leave here.
 */
function styleOf(decls: Decls, inherited: HtmlTextStyle, tag: string): HtmlBoxStyle {
  const style: HtmlBoxStyle = { ...inherited };
  const base = inherited.fontSize ?? REFERENCE_FONT_SIZE;

  const scale = HEADING_SCALE[tag];
  if (scale !== undefined) {
    style.bold = true;
    style.fontSize = round(base * scale);
  }
  if (tag === 'strong' || tag === 'b') style.bold = true;
  if (tag === 'i' || tag === 'em' || tag === 'var' || tag === 'cite') style.italic = true;
  if (tag === 'u' || tag === 'ins') style.underline = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') style.strike = true;
  if (tag === 'small') style.fontSize = round(base * 0.83);
  if (tag === 'big') style.fontSize = round(base * 1.2);
  if (tag === 'center') style.align = 'center';
  if (tag === 'th') {
    style.bold = true;
    style.align = 'center';
  }

  // font-size first: every other relative length resolves against it.
  const fontSize = toPx(decls['font-size'], base);
  if (fontSize !== undefined) style.fontSize = fontSize;
  const em = style.fontSize ?? base;

  for (const [key, value] of Object.entries(decls)) {
    applyDeclaration(style, key, value, em);
  }

  if (decls['line-height'] === undefined && fontSize !== undefined) {
    // A theme line height sized for body copy clips a 24pt banner. The browser's `normal` is
    // roughly 1.2–1.4 depending on the font; the middle of that is close enough and never clips.
    style.lineHeight = round(em * 1.3);
  }

  if (style.width !== undefined && decls['box-sizing'] !== 'border-box') {
    // CSS sizes the content box by default; React Native always sizes the border box.
    style.width = round(
      style.width +
        (style.padding?.left ?? 0) +
        (style.padding?.right ?? 0) +
        (style.borderWidth?.left ?? 0) +
        (style.borderWidth?.right ?? 0)
    );
  }

  return style;
}

function applyDeclaration(style: HtmlBoxStyle, key: string, value: string, em: number): void {
  const lower = value.toLowerCase();
  switch (key) {
    case 'background':
    case 'background-color': {
      const color = parseColor(lower.split(/\s+/)[0] ?? '');
      if (color) style.background = color;
      return;
    }
    case 'color': {
      const color = parseColor(lower);
      if (color) style.color = color;
      return;
    }
    case 'text-align': {
      if (lower === 'center' || lower === 'left' || lower === 'right' || lower === 'justify') {
        style.align = lower;
      } else if (lower === 'start') style.align = 'left';
      else if (lower === 'end') style.align = 'right';
      return;
    }
    case 'font-weight': {
      style.bold = lower === 'bold' || lower === 'bolder' || Number(lower) >= 600;
      return;
    }
    case 'font-style': {
      style.italic = lower === 'italic' || lower === 'oblique';
      return;
    }
    case 'text-decoration':
    case 'text-decoration-line': {
      style.underline = lower.includes('underline');
      style.strike = lower.includes('line-through');
      return;
    }
    case 'line-height': {
      const unitless = Number(lower);
      style.lineHeight = Number.isFinite(unitless) && lower === String(unitless)
        ? round(em * unitless)
        : toPx(lower, em);
      return;
    }
    case 'display': {
      if (lower.includes('flex')) style.row = true;
      return;
    }
    case 'flex-direction': {
      if (lower.startsWith('column')) style.row = false;
      return;
    }
    case 'flex-wrap': {
      style.wrap = lower.startsWith('wrap');
      return;
    }
    case 'align-items': {
      style.alignItems = parseAlignItems(lower);
      return;
    }
    case 'justify-content': {
      style.justify = parseJustify(lower);
      return;
    }
    case 'gap':
    case 'row-gap':
    case 'column-gap': {
      const gap = toPx(lower, em);
      if (gap !== undefined) style.gap = gap;
      return;
    }
    case 'flex': {
      const grow = Number(lower.split(/\s+/)[0]);
      if (Number.isFinite(grow)) style.grow = grow;
      return;
    }
    case 'flex-grow': {
      const grow = Number(lower);
      if (Number.isFinite(grow)) style.grow = grow;
      return;
    }
    case 'width': {
      const percent = toPercent(lower);
      if (percent !== undefined) {
        style.widthPercent = percent;
        style.width = undefined;
      } else {
        const width = toPx(lower, em);
        if (width !== undefined) {
          style.width = width;
          style.widthPercent = undefined;
        }
      }
      return;
    }
    case 'max-width': {
      const maxWidth = toPx(lower, em);
      if (maxWidth !== undefined) style.maxWidth = maxWidth;
      return;
    }
    case 'height': {
      const height = toPx(lower, em);
      if (height !== undefined) style.height = height;
      return;
    }
    case 'min-height': {
      const minHeight = toPx(lower, em);
      if (minHeight !== undefined) style.minHeight = minHeight;
      return;
    }
    case 'border-radius': {
      const radius = toPx(lower.split(/\s+/)[0] ?? '', em);
      if (radius !== undefined) style.radius = radius;
      return;
    }
    default:
      break;
  }

  if (key === 'padding' || key === 'margin') {
    const edges = parseEdges(lower, em);
    if (edges) style[key] = { ...style[key], ...edges };
    return;
  }
  const spacing = /^(padding|margin)-(top|right|bottom|left)$/.exec(key);
  if (spacing) {
    const side = spacing[2] as keyof HtmlEdges;
    const length = toPx(lower, em) ?? 0;
    const prop = spacing[1] as 'padding' | 'margin';
    style[prop] = { ...style[prop], [side]: length };
    return;
  }

  const border = /^border(?:-(top|right|bottom|left))?(?:-(width|color|style))?$/.exec(key);
  if (border) {
    applyBorder(style, border[1] as keyof HtmlEdges | undefined, border[2], lower, em);
  }
}

function applyBorder(
  style: HtmlBoxStyle,
  side: keyof HtmlEdges | undefined,
  facet: string | undefined,
  value: string,
  em: number
): void {
  const sides: Array<keyof HtmlEdges> = side ? [side] : ['top', 'right', 'bottom', 'left'];
  const setWidth = (width: number): void => {
    const edges: HtmlEdges = { ...style.borderWidth };
    for (const entry of sides) edges[entry] = width;
    style.borderWidth = edges;
  };
  const setColor = (color: string): void => {
    const edges: HtmlEdgeColors = { ...style.borderColor };
    for (const entry of sides) edges[entry] = color;
    style.borderColor = edges;
  };

  if (facet === 'width') {
    setWidth(toPx(value, em) ?? 0);
    return;
  }
  if (facet === 'color') {
    const color = parseColor(value);
    if (color) setColor(color);
    return;
  }
  if (facet === 'style') {
    if (value === 'none' || value === 'hidden') setWidth(0);
    return;
  }

  // The shorthand: `1px solid #000`, `none`, `medium dashed white`.
  if (value === 'none' || value === 'hidden' || value === '0') {
    setWidth(0);
    return;
  }
  let width: number | undefined;
  let color: string | undefined;
  for (const token of value.split(/\s+/)) {
    const length = toPx(token, em);
    if (length !== undefined && width === undefined) {
      width = length;
      continue;
    }
    const parsed = parseColor(token);
    if (parsed) color = parsed;
  }
  setWidth(width ?? 1);
  if (color) setColor(color);
}

function parseEdges(value: string, em: number): HtmlEdges | undefined {
  const parts = value.split(/\s+/).map((part) => toPx(part, em) ?? 0);
  if (parts.length === 0) return undefined;
  const [first = 0, second, third, fourth] = parts;
  if (second === undefined) return { top: first, right: first, bottom: first, left: first };
  if (third === undefined) return { top: first, right: second, bottom: first, left: second };
  if (fourth === undefined) return { top: first, right: second, bottom: third, left: second };
  return { top: first, right: second, bottom: third, left: fourth };
}

function parseAlignItems(value: string): HtmlAlignItems | undefined {
  if (value === 'center' || value === 'stretch' || value === 'baseline') return value;
  if (value === 'flex-start' || value === 'start' || value === 'self-start') return 'flex-start';
  if (value === 'flex-end' || value === 'end' || value === 'self-end') return 'flex-end';
  return undefined;
}

function parseJustify(value: string): HtmlJustify | undefined {
  if (value === 'center' || value === 'space-between' || value === 'space-around' || value === 'space-evenly') {
    return value;
  }
  if (value === 'flex-start' || value === 'start' || value === 'left') return 'flex-start';
  if (value === 'flex-end' || value === 'end' || value === 'right') return 'flex-end';
  return undefined;
}

function toPx(value: string | undefined, em: number | undefined): number | undefined {
  if (!value) return undefined;
  const token = value.trim().toLowerCase();
  if (!token || token === 'auto' || token === 'inherit' || token === 'initial') return undefined;
  const match = /^(-?\d*\.?\d+)(px|pt|em|rem|%|vw|vh)?$/.exec(token);
  if (!match) return NAMED_LENGTHS[token];
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  const base = em ?? REFERENCE_FONT_SIZE;
  switch (match[2]) {
    case 'pt':
      return round(amount * 1.333);
    case 'em':
    case 'rem':
      return round(amount * base);
    case '%':
      // Only reached for font-size, where a percentage is of the inherited size.
      return round((amount / 100) * base);
    case 'vw':
    case 'vh':
      return undefined;
    default:
      return round(amount);
  }
}

const NAMED_LENGTHS: Record<string, number> = { thin: 1, medium: 3, thick: 5 };

function toPercent(value: string): number | undefined {
  const match = /^(-?\d*\.?\d+)%$/.exec(value.trim());
  if (!match) return undefined;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : undefined;
}

function parseColor(value: string): string | undefined {
  const token = value.trim().toLowerCase();
  if (NAMED_COLORS[token]) return NAMED_COLORS[token];
  if (/^#([0-9a-f]{3})$/i.test(token)) {
    const [, r, g, b] = token;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#([0-9a-f]{6})$/i.test(token)) return token.toUpperCase();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(token);
  if (!rgb) return undefined;
  const hex = (part: string | undefined) =>
    Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0');
  return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`.toUpperCase();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

const TEXT_KEYS: Array<keyof HtmlTextStyle> = [
  'color',
  'fontSize',
  'lineHeight',
  'bold',
  'italic',
  'underline',
  'strike',
  'align',
];

/** The part of a box style children inherit. */
function textPart(style: HtmlBoxStyle): HtmlTextStyle {
  const out: HtmlTextStyle = {};
  for (const key of TEXT_KEYS) {
    const value = style[key];
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/**
 * The part only the box itself uses. Text styles are left off deliberately: they are inherited, so
 * every block inside already carries them, and repeating them on the wrapper would make a nested
 * letterhead look styled when nothing about the box is.
 */
function boxPart(style: HtmlBoxStyle): HtmlBoxStyle | undefined {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (TEXT_KEYS.includes(key as keyof HtmlTextStyle)) continue;
    out[key] = value;
  }
  return pruneStyle(out as HtmlBoxStyle);
}

/** Drop the keys that carry nothing, so an unstyled block has no `style` at all. */
function pruneStyle<T extends object>(style: T | undefined): T | undefined {
  if (!style) return undefined;
  const out = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'object' && value !== null) {
      const inner = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined)
      );
      if (Object.keys(inner).length === 0) continue;
      out[key] = inner;
      continue;
    }
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

function sameText(left: HtmlTextStyle | undefined, right: HtmlTextStyle | undefined): boolean {
  return TEXT_KEYS.every((key) => (left?.[key] ?? undefined) === (right?.[key] ?? undefined));
}

/** What a span overrides. Absent when the span reads exactly like its line. */
function diffText(
  span: HtmlTextStyle | undefined,
  base: HtmlTextStyle
): HtmlTextStyle | undefined {
  if (!span) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of TEXT_KEYS) {
    const value = span[key];
    if (value === undefined || value === false) continue;
    if (value === base[key]) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? (out as HtmlTextStyle) : undefined;
}

function offlineImageUri(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const value = src.trim();
  if (value.startsWith('data:image/') || value.startsWith('file:')) return value;
  return undefined;
}

function collapseSpace(text: string): string {
  // `\s` would fold a non-breaking space, which is the one space an author asked to keep.
  return text.replace(/[\t\n\f\r ]+/g, ' ');
}

function decodeEntities(html: string): string {
  if (!html.includes('&')) return html;
  return html.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    const token = body.toLowerCase();
    if (token.startsWith('#')) {
      const code = token.startsWith('#x')
        ? Number.parseInt(token.slice(2), 16)
        : Number.parseInt(token.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[token] ?? match;
  });
}

// ---------------------------------------------------------------------------------------------
// Intrinsic image size
// ---------------------------------------------------------------------------------------------

/**
 * A browser sizes `width: auto` from the image itself; React Native cannot, so the size is read
 * out of the encoded header here — once, at parse time — and handed to the renderer as an aspect
 * ratio. Only the leading bytes are decoded: enough to clear a colour profile, not the pixels.
 */
const MAX_HEADER_BYTES = 65536;

interface Size {
  width: number;
  height: number;
}

function imageSize(uri: string): Size | undefined {
  const comma = uri.indexOf(',');
  if (comma === -1) return undefined;
  if (!uri.slice(0, comma).toLowerCase().includes(';base64')) return undefined;
  const bytes = decodeBase64(uri.slice(comma + 1), MAX_HEADER_BYTES);
  if (!bytes || bytes.length < 16) return undefined;
  return pngSize(bytes) ?? gifSize(bytes) ?? bmpSize(bytes) ?? webpSize(bytes) ?? jpegSize(bytes);
}

const BASE64 = (() => {
  const table = new Int16Array(128).fill(-1);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let index = 0; index < alphabet.length; index += 1) {
    table[alphabet.charCodeAt(index)] = index;
  }
  return table;
})();

function decodeBase64(text: string, limit: number): Uint8Array | undefined {
  const out = new Uint8Array(Math.min(limit, Math.ceil((text.length * 3) / 4) + 3));
  let length = 0;
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < text.length && length < limit; index += 1) {
    const code = text.charCodeAt(index);
    const value = code < 128 ? BASE64[code]! : -1;
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[length] = (buffer >> bits) & 0xff;
      length += 1;
    }
  }
  return length > 0 ? out.subarray(0, length) : undefined;
}

function u16be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

function u16le(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
}

function u32be(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] ?? 0) << 24) | ((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)
  );
}

function u32le(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16) | ((bytes[at + 3] ?? 0) << 24)
  );
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  let out = '';
  for (let index = 0; index < length; index += 1) out += String.fromCharCode(bytes[at + index] ?? 0);
  return out;
}

function size(width: number, height: number): Size | undefined {
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function pngSize(bytes: Uint8Array): Size | undefined {
  if (bytes[0] !== 0x89 || ascii(bytes, 1, 3) !== 'PNG') return undefined;
  return size(u32be(bytes, 16), u32be(bytes, 20));
}

function gifSize(bytes: Uint8Array): Size | undefined {
  if (ascii(bytes, 0, 3) !== 'GIF') return undefined;
  return size(u16le(bytes, 6), u16le(bytes, 8));
}

function bmpSize(bytes: Uint8Array): Size | undefined {
  if (ascii(bytes, 0, 2) !== 'BM' || bytes.length < 26) return undefined;
  return size(Math.abs(u32le(bytes, 18)), Math.abs(u32le(bytes, 22)));
}

function webpSize(bytes: Uint8Array): Size | undefined {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return undefined;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X') return size(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1);
  if (chunk === 'VP8 ') return size(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
  if (chunk === 'VP8L') {
    const bits = u32le(bytes, 21);
    return size((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  return undefined;
}

function u24le(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);
}

function jpegSize(bytes: Uint8Array): Size | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let index = 2;
  while (index + 9 < bytes.length) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1] ?? 0;
    if (marker === 0xff) {
      index += 1;
      continue;
    }
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      index += 2;
      continue;
    }
    const length = u16be(bytes, index + 2);
    if (length < 2) return undefined;
    const isFrameHeader =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isFrameHeader) return size(u16be(bytes, index + 7), u16be(bytes, index + 5));
    // Entropy-coded data starts here and is not worth scanning.
    if (marker === 0xda) return undefined;
    index += 2 + length;
  }
  return undefined;
}
