// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { HtmlBlock, HtmlBoxStyle, HtmlEdges, HtmlSpan, HtmlTextStyle } from '../engine/htmlBlocks';
import { normalizeExternalUrl } from '../engine/htmlBlocks';
import { Mark } from '../render/controls/Mark';
import { useFormioTheme } from '../theme/FormioThemeProvider';
import { useFormioRender } from './context';
import { useFormStyles } from './formStyles';
import { useFormioLayout } from './layoutMode';
import { isCrowdedHtmlTable, planPhoneHtmlTable, type PhoneHtmlField } from './phoneHtmlTable';

/** Bare `http(s)` / `www.` runs inside flattened instructional copy. */
const PLAIN_URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function openExternalUrl(url: string, openUrl?: (href: string) => void): void {
  if (openUrl) {
    openUrl(url);
    return;
  }
  void Linking.openURL(url).catch(() => undefined);
}

/**
 * Instructional copy with pressable website URLs. Used for flattened `content` / `htmlelement`
 * text and for field descriptions that still carry a raw URL string.
 */
export function LinkifiedText({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
}) {
  const { adapters } = useFormioRender();
  const parts: Array<{ text: string; href?: string }> = [];
  let last = 0;
  PLAIN_URL_RE.lastIndex = 0;
  for (const match of text.matchAll(PLAIN_URL_RE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    const raw = match[0] ?? '';
    const href = normalizeExternalUrl(raw.startsWith('www.') ? `https://${raw}` : raw);
    parts.push(href ? { text: raw, href } : { text: raw });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  if (parts.length === 0) parts.push({ text });

  return (
    <Text style={style}>
      {parts.map((part, index) =>
        part.href ? (
          <Text
            key={index}
            style={{ textDecorationLine: 'underline', color: '#0563C1' }}
            onPress={() => openExternalUrl(part.href!, adapters.openUrl)}
          >
            {part.text}
          </Text>
        ) : (
          <Text key={index}>{part.text}</Text>
        )
      )}
    </Text>
  );
}

/**
 * Authored HTML, drawn — docs/FORMS.md §8.
 *
 * The parser in `engine/htmlBlocks` has already done the hard part: every block carries the
 * absolute style that applies to it, so this file is a translation and nothing more. Nothing here
 * inspects markup, and no block is ever resized to fit an assumption the author did not make —
 * that is the whole point. A box is as wide as the author asked, an image keeps its aspect ratio,
 * and a line of inline content stays one line.
 *
 * The two deliberate departures from the browser, both because the alternative is unusable on a
 * phone: an `<table>` scrolls sideways at a legible column width instead of shrinking, and a
 * `<button>` is not drawn at all.
 */

export function HtmlBlocks({ blocks }: { blocks: HtmlBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <HtmlBlockView key={index} block={block} />
      ))}
    </>
  );
}

function HtmlBlockView({ block }: { block: HtmlBlock }) {
  switch (block.kind) {
    case 'image':
      return <HtmlImageView block={block} />;
    case 'box':
      return <HtmlBoxView block={block} />;
    case 'table':
      return <HtmlTableView block={block} />;
    case 'field':
      return <HtmlFieldView block={block} />;
    case 'radio':
      return <HtmlRadioView block={block} />;
    default:
      return <HtmlTextView block={block} />;
  }
}

function HtmlBoxView({ block }: { block: HtmlBlock }) {
  const children = block.children ?? [];
  return (
    <View style={boxStyle(block.style)}>
      <HtmlBlocks blocks={children} />
    </View>
  );
}

function HtmlTextView({ block }: { block: HtmlBlock }) {
  const styles = useFormStyles();
  const { adapters } = useFormioRender();
  const spans = block.spans;
  return (
    <Text style={[styles.htmlText, textStyle(block.style)]}>
      {spans
        ? spans.map((span, index) => <HtmlSpanView key={index} span={span} openUrl={adapters.openUrl} />)
        : block.text}
    </Text>
  );
}

function HtmlSpanView({
  span,
  openUrl,
}: {
  span: HtmlSpan;
  openUrl?: (href: string) => void;
}) {
  if (!span.href) {
    return span.style ? <Text style={textStyle(span.style)}>{span.text}</Text> : <>{span.text}</>;
  }
  // Match LinkifiedText: underline + link blue unless the author already set a color.
  return (
    <Text
      style={[
        textStyle(span.style),
        { textDecorationLine: 'underline', color: span.style?.color ?? '#0563C1' },
      ]}
      onPress={() => openExternalUrl(span.href!, openUrl)}
    >
      {span.text}
    </Text>
  );
}

/**
 * `width: auto` is the default in HTML and impossible in React Native: an `Image` is not sized by
 * its contents. The parser reads the pixel size out of the encoded image, which turns `auto` into
 * an aspect ratio here. Without one — a `file:` image, an unknown format — the image falls back to
 * the theme's height rather than collapsing to nothing.
 */
function HtmlImageView({ block }: { block: HtmlBlock }) {
  const { metrics } = useFormioTheme();
  const style = block.style;
  const ratio =
    block.imageWidth && block.imageHeight ? block.imageWidth / block.imageHeight : undefined;
  const width = style?.widthPercent !== undefined ? (`${style.widthPercent}%` as const) : style?.width;
  const height = style?.height;

  let sizing: ImageStyle;
  if (width !== undefined && height !== undefined) sizing = { width, height };
  else if (height !== undefined) sizing = ratio ? { height, aspectRatio: ratio } : { height, width: '100%' };
  else if (width !== undefined) {
    sizing = ratio ? { width, aspectRatio: ratio } : { width, height: metrics.form.htmlImageHeight };
  } else if (ratio && block.imageWidth) {
    // The browser default for a bare `<img>`: intrinsic size, never wider than its container.
    sizing = { width: '100%', maxWidth: block.imageWidth, aspectRatio: ratio };
  } else {
    sizing = { width: '100%', height: metrics.form.htmlImageHeight };
  }

  return (
    <Image
      source={{ uri: block.imageUri }}
      style={[boxStyle(style, false) as ImageStyle, sizing]}
      resizeMode="contain"
    />
  );
}

/**
 * An HTML `<table>` keeps a legible column width and scrolls sideways — docs/FORMS.md §8. The
 * cell's own padding, border and background are honoured; its authored width is not, because a
 * percentage of a table that is wider than the screen is not what the author measured.
 *
 * That is the wide layout. On a phone the table is fitted to the width instead, because there a
 * sideways scroller is the thing that is unusable.
 */
function HtmlTableView({ block }: { block: HtmlBlock }) {
  const styles = useFormStyles();
  const { metrics } = useFormioTheme();
  const phone = useFormioLayout() === 'phone';
  const rows = block.rows ?? [];
  const spanOf = (cell: HtmlBlock): number => (cell.colspan && cell.colspan > 0 ? cell.colspan : 1);
  const columns = Math.max(1, ...rows.map((row) => row.reduce((sum, cell) => sum + spanOf(cell), 0)));
  const colWidth = metrics.form.tableMinColumnWidth;

  // A phone form never scrolls sideways — docs/FORMS.md §8. The columns share the width the
  // table has, in proportion to their spans, and the text in them wraps. Inputs cannot wrap, so
  // a table with more than two to a row is drawn as cards instead.
  if (phone && isCrowdedHtmlTable(rows)) return <HtmlTableCards rows={rows} />;
  if (phone) {
    return (
      <View style={[styles.htmlTable, boxStyle(block.style, false)]}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={[styles.htmlTableRow, rowIndex === 0 && styles.htmlTableFirstRow]}>
            {row.map((cell, cellIndex) => (
              <View
                key={cellIndex}
                style={[
                  styles.htmlTableCell,
                  cell.header && styles.htmlTableHeaderCell,
                  boxStyle(cell.style, false),
                  styles.phoneHtmlTableCell,
                  { flex: spanOf(cell) },
                ]}
              >
                <HtmlBlocks blocks={cell.children ?? []} />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <ScrollView horizontal nestedScrollEnabled>
      <View style={[styles.htmlTable, boxStyle(block.style, false), { minWidth: colWidth * columns }]}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={[styles.htmlTableRow, rowIndex === 0 && styles.htmlTableFirstRow]}>
            {row.map((cell, cellIndex) => (
              <View
                key={cellIndex}
                style={[
                  styles.htmlTableCell,
                  cell.header && styles.htmlTableHeaderCell,
                  boxStyle(cell.style, false),
                  { width: colWidth * spanOf(cell) },
                ]}
              >
                <HtmlBlocks blocks={cell.children ?? []} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** One input of a re-flowed table row, under the column heading it used to sit below. */
function HtmlCardField({ field }: { field: PhoneHtmlField }) {
  const styles = useFormStyles();
  return (
    <View style={styles.field}>
      {!!field.label && <Text style={styles.label}>{field.label}</Text>}
      <View style={field.label ? styles.controlSpacing : undefined}>
        <HtmlBlocks blocks={field.cell.children ?? []} />
      </View>
    </View>
  );
}

/**
 * A table of inputs on a phone: one card per body row — see `phoneHtmlTable.ts`. The cell
 * borders and backgrounds go with the grid they belonged to; the inputs keep their own style.
 */
function HtmlTableCards({ rows }: { rows: HtmlBlock[][] }) {
  const styles = useFormStyles();
  return (
    <View style={styles.phoneStack}>
      {planPhoneHtmlTable(rows).map((row, rowIndex) =>
        row.kind === 'text' ? (
          <View key={rowIndex}>
            {row.cells.map((cell, cellIndex) => (
              <HtmlBlocks key={cellIndex} blocks={cell.children ?? []} />
            ))}
          </View>
        ) : (
          <View key={rowIndex} style={styles.phoneSubCard}>
            {!!row.card.title && <Text style={styles.phoneSubRecordTitle}>{row.card.title}</Text>}
            <View style={[styles.phoneCardBody, !!row.card.title && styles.phoneSubCardBody]}>
              {row.card.notes.map((cell, noteIndex) => (
                <View key={`note-${noteIndex}`} style={styles.phoneBlockGap}>
                  <HtmlBlocks blocks={cell.children ?? []} />
                </View>
              ))}
              {row.card.lines.map((line, lineIndex) =>
                line.kind === 'single' ? (
                  <HtmlCardField key={lineIndex} field={line.field} />
                ) : (
                  <View key={lineIndex} style={styles.phonePair}>
                    <View style={styles.phonePairCell}>
                      <HtmlCardField field={line.left} />
                    </View>
                    <View style={styles.phonePairCell}>
                      <HtmlCardField field={line.right} />
                    </View>
                  </View>
                )
              )}
            </View>
          </View>
        )
      )}
    </View>
  );
}

function HtmlFieldView({ block }: { block: HtmlBlock }) {
  const styles = useFormStyles();
  const { colors } = useFormioTheme();
  const { form, readOnly } = useFormioRender();
  const path = block.bindPath;
  if (!path) return null;

  const stored = form.getValue(path);
  const value = stored === undefined || stored === null ? '' : String(stored);
  const disabled = readOnly || form.readOnly;

  return (
    <TextInput
      style={[
        styles.input,
        styles.htmlFieldInput,
        block.fieldType === 'textarea' && styles.inputMultiline,
        textStyle(block.style),
        boxStyle(block.style),
      ]}
      value={value}
      editable={!disabled}
      placeholder={block.placeholder || (block.fieldType === 'date' ? 'Date' : undefined)}
      placeholderTextColor={colors.text.placeholder}
      multiline={block.fieldType === 'textarea'}
      onChangeText={(text) => form.setValue(path, text)}
      onBlur={() => form.touch(path)}
      accessibilityLabel={block.placeholder || path}
    />
  );
}

function HtmlRadioView({ block }: { block: HtmlBlock }) {
  const styles = useFormStyles();
  const { form, readOnly } = useFormioRender();
  const path = block.bindPath;
  const option = block.radioValue ?? '';
  const selected = path ? String(form.getValue(path) ?? '') === option : false;
  const disabled = readOnly || form.readOnly || !path;

  return (
    <Pressable
      style={[styles.htmlRadio, boxStyle(block.style)]}
      disabled={disabled}
      onPress={() => {
        if (!path) return;
        form.setValue(path, selected ? '' : option);
        form.touch(path);
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={option || path}
    >
      <Mark checked={selected} radio />
    </Pressable>
  );
}

/**
 * A box style, translated. Only the keys the author set are emitted: an absent key must stay
 * absent so the stylesheet underneath it still applies.
 *
 * `sizing` is switched off where the layout is ours rather than the author's — a table column, an
 * image that carries its own aspect ratio — so a stray `width: 100%` cannot collapse it.
 */
function boxStyle(style: HtmlBoxStyle | undefined, sizing = true): ViewStyle | undefined {
  if (!style) return undefined;
  const out: ViewStyle = {};

  if (style.background) out.backgroundColor = style.background;
  if (style.row) out.flexDirection = 'row';
  if (style.wrap) out.flexWrap = 'wrap';
  if (style.alignItems) out.alignItems = style.alignItems;
  if (style.justify) out.justifyContent = style.justify;
  if (style.gap !== undefined) out.gap = style.gap;

  if (sizing) {
    if (style.grow !== undefined) {
      // CSS `flex: n` is `n 1 0%`, and so is React Native's, but only via the longhands here.
      out.flexGrow = style.grow;
      out.flexShrink = 1;
      out.flexBasis = 0;
    }
    if (style.widthPercent !== undefined) out.width = `${style.widthPercent}%`;
    else if (style.width !== undefined) out.width = style.width;
    if (style.maxWidth !== undefined) out.maxWidth = style.maxWidth;
    if (style.height !== undefined) out.height = style.height;
    if (style.minHeight !== undefined) out.minHeight = style.minHeight;
  }

  edge(out, 'padding', style.padding);
  edge(out, 'margin', style.margin);

  const border = style.borderWidth;
  if (border) {
    if (border.top !== undefined) out.borderTopWidth = border.top;
    if (border.right !== undefined) out.borderRightWidth = border.right;
    if (border.bottom !== undefined) out.borderBottomWidth = border.bottom;
    if (border.left !== undefined) out.borderLeftWidth = border.left;
  }
  const borderColor = style.borderColor;
  if (borderColor) {
    if (borderColor.top) out.borderTopColor = borderColor.top;
    if (borderColor.right) out.borderRightColor = borderColor.right;
    if (borderColor.bottom) out.borderBottomColor = borderColor.bottom;
    if (borderColor.left) out.borderLeftColor = borderColor.left;
  }
  if (style.radius !== undefined) out.borderRadius = style.radius;

  return out;
}

function edge(out: ViewStyle, prop: 'padding' | 'margin', edges: HtmlEdges | undefined): void {
  if (!edges) return;
  if (edges.top !== undefined) out[`${prop}Top`] = edges.top;
  if (edges.right !== undefined) out[`${prop}Right`] = edges.right;
  if (edges.bottom !== undefined) out[`${prop}Bottom`] = edges.bottom;
  if (edges.left !== undefined) out[`${prop}Left`] = edges.left;
}

function textStyle(style: HtmlTextStyle | undefined): TextStyle | undefined {
  if (!style) return undefined;
  const out: TextStyle = {};
  if (style.color) out.color = style.color;
  if (style.fontSize !== undefined) out.fontSize = style.fontSize;
  if (style.lineHeight !== undefined) out.lineHeight = style.lineHeight;
  // A theme line height sized for body copy clips a heading, so a resized run gets its own.
  else if (style.fontSize !== undefined) out.lineHeight = Math.round(style.fontSize * 1.3);
  if (style.bold) out.fontWeight = '700';
  if (style.italic) out.fontStyle = 'italic';
  if (style.underline || style.strike) {
    out.textDecorationLine =
      style.underline && style.strike
        ? 'underline line-through'
        : style.underline
          ? 'underline'
          : 'line-through';
  }
  if (style.align) out.textAlign = style.align;
  return out;
}
