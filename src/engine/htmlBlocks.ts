// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

/**
 * Authored HTML → native-drawable blocks — docs/FORMS.md §8.
 *
 * This is not an HTML engine. It keeps the pieces that can be drawn with `View`, `Text` and
 * `Image` without a WebView or a network: embedded images, a handful of banner styles, and a
 * flex row. Everything else is reduced to text, which is what {@link htmlToText} already did.
 *
 * Pure. Imports nothing from React or React Native. Never throws.
 */

export type HtmlAlign = 'left' | 'center' | 'right';

export interface HtmlBlock {
  kind: 'text' | 'image' | 'banner' | 'row' | 'stack';
  text?: string;
  /** `data:image/…` or `file:` only — remote URLs are dropped so a cached form stays offline. */
  imageUri?: string;
  background?: string;
  color?: string;
  align?: HtmlAlign;
  bold?: boolean;
  children?: HtmlBlock[];
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
  'source',
  'track',
  'wbr',
]);

const NAMED_COLORS: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  red: '#FF0000',
  orange: '#FFA500',
  navy: '#000080',
  gray: '#808080',
  grey: '#808080',
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

interface Style {
  background?: string;
  color?: string;
  align?: HtmlAlign;
  bold?: boolean;
  flex?: boolean;
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

/**
 * True when the blocks carry layout the flattened string would lose: an embedded image, a
 * coloured banner, or a row. Plain instructional copy still goes through {@link htmlToText}.
 */
export function htmlBlocksHaveChrome(blocks: HtmlBlock[]): boolean {
  return blocks.some(isChrome);
}

function isChrome(block: HtmlBlock): boolean {
  if (block.kind === 'image' || block.kind === 'row') return true;
  if (block.kind === 'banner' && (block.background || block.color || block.align)) return true;
  if (block.kind === 'stack') return (block.children ?? []).some(isChrome);
  return false;
}

export function parseHtmlBlocks(html: string): HtmlBlock[] {
  if (!html) return [];
  const { nodes } = parseAst(html, 0);
  return collapse(convert(nodes));
}

function parseAst(source: string, start: number, stop?: string): { nodes: Ast[]; index: number } {
  const nodes: Ast[] = [];
  let index = start;

  while (index < source.length) {
    if (stop && matchClose(source, index, stop)) {
      const close = source.indexOf('>', index);
      return { nodes, index: close === -1 ? source.length : close + 1 };
    }

    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }

    if (source[index] !== '<') {
      const next = source.indexOf('<', index);
      const end = next === -1 ? source.length : next;
      nodes.push({ kind: 'text', value: source.slice(index, end) });
      index = end;
      continue;
    }

    const close = source.indexOf('>', index);
    if (close === -1) {
      nodes.push({ kind: 'text', value: source.slice(index) });
      break;
    }

    const raw = source.slice(index + 1, close).trim();
    if (raw.startsWith('/') || raw.startsWith('!') || raw.startsWith('?')) {
      index = close + 1;
      continue;
    }

    const selfClose = raw.endsWith('/');
    const body = selfClose ? raw.slice(0, -1).trim() : raw;
    const { tag, attrs } = parseOpenTag(body);
    const lower = tag.toLowerCase();

    if (lower === 'script' || lower === 'style') {
      const endTag = source.toLowerCase().indexOf(`</${lower}>`, close + 1);
      index = endTag === -1 ? source.length : endTag + lower.length + 3;
      continue;
    }

    if (VOID.has(lower) || selfClose) {
      nodes.push({ kind: 'el', tag: lower, attrs, children: [] });
      index = close + 1;
      continue;
    }

    const inner = parseAst(source, close + 1, lower);
    nodes.push({ kind: 'el', tag: lower, attrs, children: inner.nodes });
    index = inner.index;
  }

  return { nodes, index };
}

function matchClose(source: string, index: number, tag: string): boolean {
  if (source[index] !== '<') return false;
  const slice = source.slice(index, index + tag.length + 3).toLowerCase();
  return slice.startsWith(`</${tag}`) && /[>\s/]/.test(slice[tag.length + 2] ?? '>');
}

function parseOpenTag(body: string): { tag: string; attrs: Record<string, string> } {
  const match = /^[^\s/]+/.exec(body);
  const tag = match?.[0] ?? '';
  const attrs: Record<string, string> = {};
  const attrRe = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  attrRe.lastIndex = tag.length;
  let found: RegExpExecArray | null;
  while ((found = attrRe.exec(body))) {
    const name = found[1]?.toLowerCase();
    if (!name) continue;
    attrs[name] = found[2] ?? found[3] ?? found[4] ?? '';
  }
  return { tag, attrs };
}

function convert(nodes: Ast[]): HtmlBlock[] {
  const out: HtmlBlock[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      const text = collapseSpace(decodeEntities(node.value));
      if (text) out.push({ kind: 'text', text });
      continue;
    }

    const { tag, attrs } = node;
    if (tag === 'br') {
      out.push({ kind: 'text', text: '\n' });
      continue;
    }
    if (tag === 'img') {
      const imageUri = offlineImageUri(attrs.src);
      if (imageUri) out.push({ kind: 'image', imageUri });
      continue;
    }

    const style = parseStyle(attrs.style);
    if (tag === 'strong' || tag === 'b' || /^h[1-6]$/.test(tag)) style.bold = true;
    const inner = convert(node.children);

    const elementChildren = node.children.filter((child): child is El => child.kind === 'el' && child.tag !== 'br');
    if (style.flex && elementChildren.length > 1) {
      const cells = elementChildren
        .map((child) => asCell(convert([child]).map((block) => applyTypo(block, style))))
        .filter((cell) => !isEmpty(cell));
      if (cells.length > 0) {
        out.push({ kind: 'row', background: style.background, children: cells });
      }
      continue;
    }

    const images = inner.filter((block) => block.kind === 'image');
    const rest = inner.filter((block) => block.kind !== 'image');
    const styled = !!(style.background || style.color || style.align);
    const text = rest.map(blockText).filter(Boolean).join(' ').trim();

    if (styled && rest.every((block) => block.kind === 'text' || block.kind === 'banner') && !rest.some((block) => block.kind === 'row' || block.kind === 'stack')) {
      out.push(...images);
      if (text) {
        out.push({
          kind: 'banner',
          text,
          background: style.background,
          color: style.color,
          align: style.align,
          bold: style.bold || rest.some((block) => block.bold),
        });
      } else if (style.background && images.length === 0) {
        out.push({ kind: 'banner', background: style.background });
      }
      continue;
    }

    if (style.bold) {
      out.push(...images);
      for (const block of rest) {
        if (block.kind === 'text' || block.kind === 'banner') out.push({ ...block, bold: true });
        else out.push(block);
      }
      continue;
    }

    out.push(...inner);
  }
  return out;
}

function applyTypo(block: HtmlBlock, style: Style): HtmlBlock {
  if (block.kind === 'stack' || block.kind === 'row') {
    return { ...block, children: (block.children ?? []).map((child) => applyTypo(child, style)) };
  }
  if (block.kind === 'image') return block;
  return {
    ...block,
    kind: block.kind === 'text' ? 'banner' : block.kind,
    color: block.color ?? style.color,
    align: block.align ?? style.align,
    bold: block.bold || style.bold,
  };
}

function asCell(blocks: HtmlBlock[]): HtmlBlock {
  const kept = collapse(blocks).filter((block) => !isEmpty(block));
  if (kept.length === 0) return { kind: 'text' };
  if (kept.length === 1) return kept[0]!;
  return { kind: 'stack', children: kept };
}

function isEmpty(block: HtmlBlock): boolean {
  if (block.kind === 'image') return !block.imageUri;
  if (block.kind === 'row' || block.kind === 'stack') return (block.children ?? []).every(isEmpty);
  return !block.text && !block.background;
}

function blockText(block: HtmlBlock): string {
  if (block.text) return block.text;
  return (block.children ?? []).map(blockText).filter(Boolean).join(' ');
}

function collapse(blocks: HtmlBlock[]): HtmlBlock[] {
  const out: HtmlBlock[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.kind === 'text' && last?.kind === 'text' && !last.bold && !block.bold) {
      last.text = `${last.text ?? ''} ${block.text ?? ''}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    if (block.kind === 'stack' || block.kind === 'row') {
      out.push({ ...block, children: collapse(block.children ?? []) });
      continue;
    }
    out.push({ ...block });
  }
  return out.filter((block) => !isEmpty(block));
}

function parseStyle(raw: string | undefined): Style {
  const style: Style = {};
  if (!raw) return style;
  for (const part of raw.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (!key || !value) continue;
    if (key === 'background-color' || key === 'background') {
      const color = parseColor(value.split(/\s+/)[0] ?? '');
      if (color) style.background = color;
    } else if (key === 'color') {
      const color = parseColor(value);
      if (color) style.color = color;
    } else if (key === 'text-align') {
      if (value === 'center' || value === 'left' || value === 'right') style.align = value;
    } else if (key === 'font-weight') {
      if (value === 'bold' || Number(value) >= 600) style.bold = true;
    } else if (key === 'display' && value.includes('flex')) {
      style.flex = true;
    }
  }
  return style;
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

function offlineImageUri(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const value = src.trim();
  if (value.startsWith('data:image/') || value.startsWith('file:')) return value;
  return undefined;
}

function collapseSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}
