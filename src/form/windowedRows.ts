// Copyright 2026 BlackSmithSoft B.V.
// SPDX-License-Identifier: Apache-2.0

import { useRef, useSyncExternalStore, type MutableRefObject } from 'react';
import type { FormScrollMetrics } from './context';

/**
 * A host ScrollView mounts every child. A data grid with dozens of rows cannot afford that, and
 * a nested FlatList would steal the page's vertical gesture. So the grid keeps one scroller
 * (the host's) and only mounts the rows that currently intersect it.
 *
 * The host publishes scroll position through {@link FormScrollMetrics}. That store must not live
 * on React context as changing numbers: a context update on every frame would re-render the
 * whole form. `useSyncExternalStore` lets a grid re-render only when the visible *range* changes.
 */

/** Below this many rows the window is the whole list — measuring would cost more than it saves. */
export const WINDOW_AFTER = 8;
const OVERSCAN = 4;

const NOOP_SUBSCRIBE = () => () => undefined;

export interface RowWindow {
  start: number;
  end: number;
  topSpacer: number;
  bottomSpacer: number;
}

export function computeWindow(
  count: number,
  tableOffsetY: number,
  getHeight: (index: number) => number,
  scrollY: number,
  viewportHeight: number,
  overscan = OVERSCAN
): RowWindow {
  if (count === 0) return { start: 0, end: 0, topSpacer: 0, bottomSpacer: 0 };

  const overscanPx = overscan * getHeight(0);
  const viewTop = scrollY - overscanPx;
  const viewBottom = scrollY + viewportHeight + overscanPx;

  let acc = tableOffsetY;
  let start = 0;
  while (start < count) {
    const height = getHeight(start);
    if (acc + height > viewTop) break;
    acc += height;
    start += 1;
  }
  const topSpacer = acc - tableOffsetY;

  let end = start;
  while (end < count && acc < viewBottom) {
    acc += getHeight(end);
    end += 1;
  }

  let bottomSpacer = 0;
  for (let index = end; index < count; index += 1) {
    bottomSpacer += getHeight(index);
  }

  return { start, end, topSpacer, bottomSpacer };
}

function rangeKey(window: RowWindow): string {
  return `${window.start}:${window.end}:${window.topSpacer}:${window.bottomSpacer}`;
}

function parseRangeKey(key: string): RowWindow {
  const [start, end, topSpacer, bottomSpacer] = key.split(':').map(Number);
  return {
    start: start ?? 0,
    end: end ?? 0,
    topSpacer: topSpacer ?? 0,
    bottomSpacer: bottomSpacer ?? 0,
  };
}

/**
 * The slice of `rows` that should be mounted for the current host scroll position.
 *
 * With no metrics — tests, or a host that does not scroll — every row is returned, which is
 * the behaviour the grid had before windowing existed.
 */
export function useRowWindow(
  count: number,
  tableOffsetY: number,
  estimatedRowHeight: number,
  measuredHeights: MutableRefObject<Map<number, number>>,
  metrics: FormScrollMetrics | undefined
): RowWindow {
  const all: RowWindow = { start: 0, end: count, topSpacer: 0, bottomSpacer: 0 };
  const deps = useRef({ count, tableOffsetY, estimatedRowHeight, measuredHeights, metrics });
  deps.current = { count, tableOffsetY, estimatedRowHeight, measuredHeights, metrics };

  const getSnapshot = () => {
    const current = deps.current;
    if (!current.metrics || current.count <= WINDOW_AFTER) {
      return rangeKey({ start: 0, end: current.count, topSpacer: 0, bottomSpacer: 0 });
    }
    const { y, height } = current.metrics.getSnapshot();
    if (height <= 0) {
      return rangeKey({ start: 0, end: current.count, topSpacer: 0, bottomSpacer: 0 });
    }
    return rangeKey(
      computeWindow(
        current.count,
        current.tableOffsetY,
        (index) => current.measuredHeights.current.get(index) ?? current.estimatedRowHeight,
        y,
        height
      )
    );
  };

  const key = useSyncExternalStore(metrics?.subscribe ?? NOOP_SUBSCRIBE, getSnapshot, getSnapshot);
  return count <= WINDOW_AFTER || !metrics ? all : parseRangeKey(key);
}
