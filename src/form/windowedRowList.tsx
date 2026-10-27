// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import {
  FormioRenderContext,
  scrollContentHost,
  type FormScrollable,
  type FormScrollMetrics,
} from './context';
import { useRowWindow } from './windowedRows';

/**
 * Row windowing for any list drawn inside the host's vertical scroller — the package's own grids
 * and a host's override controls alike. A host table of a hundred crew rows costs the same as
 * the package's data grid only if it windows the same way, so the machinery lives here once.
 */

type MeasurableNode = {
  measureLayout?: (
    relativeTo: never,
    onSuccess: (x: number, y: number) => void,
    onFail: () => void
  ) => void;
} | null;

export function measureNodeY(
  node: MeasurableNode,
  relativeTo: unknown,
  onY: (y: number) => void,
  onFail: () => void
): void {
  // A number is a Paper native tag. Fabric logs and returns without calling either callback.
  if (
    !node ||
    typeof relativeTo !== 'object' ||
    relativeTo === null ||
    typeof node.measureLayout !== 'function'
  ) {
    onFail();
    return;
  }
  try {
    node.measureLayout(relativeTo as never, (_x, y) => onY(y), onFail);
  } catch {
    onFail();
  }
}

/**
 * Where a list's body sits in the host scroll content, and the metrics to window it with.
 *
 * Metrics are withheld until the offset is known, so a list never windows against offset 0 and
 * briefly mounts the wrong rows.
 */
export function useListOffset(
  scrollRef: { current: FormScrollable | null } | undefined,
  scrollMetrics: FormScrollMetrics | undefined
) {
  const bodyRef = useRef<View>(null);
  const [tableOffsetY, setTableOffsetY] = useState(0);
  const [offsetKnown, setOffsetKnown] = useState(!scrollRef);

  const captureOffset = useCallback(() => {
    const relativeTo = scrollContentHost(scrollRef?.current);
    if (!relativeTo || !bodyRef.current) {
      setOffsetKnown(true);
      return;
    }
    measureNodeY(
      bodyRef.current as unknown as MeasurableNode,
      relativeTo,
      (y) => {
        setTableOffsetY((current) => (Math.abs(current - y) < 1 ? current : y));
        setOffsetKnown(true);
      },
      () => setOffsetKnown(true)
    );
  }, [scrollRef]);

  return {
    bodyRef,
    tableOffsetY,
    metrics: offsetKnown ? scrollMetrics : undefined,
    captureOffset,
  };
}

export function WindowedRowList({
  count,
  estimatedRowHeight,
  tableOffsetY,
  metrics,
  renderRow,
  onRangeChange,
}: {
  count: number;
  estimatedRowHeight: number;
  tableOffsetY: number;
  metrics: FormScrollMetrics | undefined;
  renderRow: (index: number, onLayout: (event: LayoutChangeEvent) => void) => ReactNode;
  /**
   * Called when the mounted range moves. A list's own `onLayout` does not fire when something
   * above it in the form grows, so this is where a stale offset gets corrected.
   */
  onRangeChange?: () => void;
}) {
  const measuredHeights = useRef(new Map<number, number>());
  const window = useRowWindow(count, tableOffsetY, estimatedRowHeight, measuredHeights, metrics);
  const rangeChanged = useRef(onRangeChange);
  rangeChanged.current = onRangeChange;
  const windowed = metrics !== undefined;
  useEffect(() => {
    if (windowed) rangeChanged.current?.();
  }, [window.start, window.end, windowed]);

  return (
    <>
      {window.topSpacer > 0 ? <View style={{ height: window.topSpacer }} /> : null}
      {Array.from({ length: window.end - window.start }, (_, offset) => {
        const index = window.start + offset;
        return renderRow(index, (event) => {
          const height = event.nativeEvent.layout.height;
          const previous = measuredHeights.current.get(index);
          if (previous !== undefined && Math.abs(previous - height) < 1) return;
          measuredHeights.current.set(index, height);
        });
      })}
      {window.bottomSpacer > 0 ? <View style={{ height: window.bottomSpacer }} /> : null}
    </>
  );
}

export interface FormioWindowedRowsProps {
  count: number;
  /** Used for rows not yet measured. Close is enough: every mounted row reports its real height. */
  estimatedRowHeight: number;
  /** Stable keys keep a row's state with the row when rows above it are added or removed. */
  keyForRow: (index: number) => string;
  renderRow: (index: number) => ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mounts only the rows of a long list that intersect the host scroller.
 *
 * Usable from any control drawn inside `<FormioRenderer>`. Outside one — a screen that reuses
 * the same table without a form — there is nothing to window against and every row is drawn.
 */
export function FormioWindowedRows({
  count,
  estimatedRowHeight,
  keyForRow,
  renderRow,
  style,
}: FormioWindowedRowsProps) {
  const context = useContext(FormioRenderContext);
  const offset = useListOffset(context?.scrollRef, context?.scrollMetrics);

  return (
    <View ref={offset.bodyRef} onLayout={offset.captureOffset} style={style}>
      <WindowedRowList
        count={count}
        estimatedRowHeight={estimatedRowHeight}
        tableOffsetY={offset.tableOffsetY}
        metrics={offset.metrics}
        onRangeChange={offset.captureOffset}
        renderRow={(index, onLayout) => (
          <View key={keyForRow(index)} onLayout={onLayout} collapsable={false}>
            {renderRow(index)}
          </View>
        )}
      />
    </View>
  );
}
