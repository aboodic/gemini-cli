/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import type React from 'react';
import { theme } from '../../semantic-colors.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';

import { type DOMElement, measureElement, Box, ResizeObserver } from 'ink';

export const SCROLL_TO_ITEM_END = Number.MAX_SAFE_INTEGER;

type VirtualizedListProps<T> = {
  data: T[];
  renderItem: (info: { item: T; index: number }) => React.ReactElement;
  estimatedItemHeight: (index: number) => number;
  keyExtractor: (item: T, index: number) => string;
  initialScrollIndex?: number;
  initialScrollOffsetInIndex?: number;
  scrollbarThumbColor?: string;
};

export type VirtualizedListRef<T> = {
  scrollBy: (delta: number) => void;
  scrollTo: (offset: number) => void;
  scrollToEnd: () => void;
  scrollToIndex: (params: {
    index: number;
    viewOffset?: number;
    viewPosition?: number;
  }) => void;
  scrollToItem: (params: {
    item: T;
    viewOffset?: number;
    viewPosition?: number;
  }) => void;
  getScrollIndex: () => number;
  getScrollState: () => {
    scrollTop: number;
    scrollHeight: number;
    innerHeight: number;
  };
};

function findLastIndex<T>(
  array: T[],
  predicate: (value: T, index: number, obj: T[]) => unknown,
): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i, array)) {
      return i;
    }
  }
  return -1;
}

function VirtualizedList<T>(
  props: VirtualizedListProps<T>,
  ref: React.Ref<VirtualizedListRef<T>>,
) {
  const {
    data,
    renderItem,
    estimatedItemHeight,
    keyExtractor,
    initialScrollIndex,
    initialScrollOffsetInIndex,
  } = props;

  const [scrollAnchor, setScrollAnchor] = useState(() => {
    const scrollToEnd =
      initialScrollIndex === SCROLL_TO_ITEM_END ||
      (typeof initialScrollIndex === 'number' &&
        initialScrollIndex >= data.length - 1 &&
        initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);

    if (scrollToEnd) {
      return {
        index: data.length > 0 ? data.length - 1 : 0,
        offset: SCROLL_TO_ITEM_END,
      };
    }

    if (typeof initialScrollIndex === 'number') {
      return {
        index: Math.max(0, Math.min(data.length - 1, initialScrollIndex)),
        offset: initialScrollOffsetInIndex ?? 0,
      };
    }

    return { index: 0, offset: 0 };
  });
  const [isStickingToBottom, setIsStickingToBottom] = useState(() => {
    const scrollToEnd =
      initialScrollIndex === SCROLL_TO_ITEM_END ||
      (typeof initialScrollIndex === 'number' &&
        initialScrollIndex >= data.length - 1 &&
        initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);
    return scrollToEnd;
  });
  const containerRef = useRef<DOMElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const itemRefs = useRef<Array<DOMElement | null>>([]);
  const [heights, setHeights] = useState<number[]>([]);
  const isInitialScrollSet = useRef(false);

  const { totalHeight, offsets } = useMemo(() => {
    const offsets: number[] = [0];
    let totalHeight = 0;
    for (let i = 0; i < data.length; i++) {
      const height = heights[i] ?? estimatedItemHeight(i);
      totalHeight += height;
      offsets.push(totalHeight);
    }
    return { totalHeight, offsets };
  }, [heights, data, estimatedItemHeight]);

  useEffect(() => {
    setHeights((prevHeights) => {
      if (data.length === prevHeights.length) {
        return prevHeights;
      }

      const newHeights = [...prevHeights];
      if (data.length < prevHeights.length) {
        newHeights.length = data.length;
      } else {
        for (let i = prevHeights.length; i < data.length; i++) {
          newHeights[i] = estimatedItemHeight(i);
        }
      }
      return newHeights;
    });
  }, [data, estimatedItemHeight]);

  const elementToIndexRef = useRef(new Map<DOMElement, number>());
  const itemsObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(
    () => () => {
      itemsObserverRef.current?.disconnect();
      itemsObserverRef.current = null;
    },
    [],
  );

  const setItemRef = useCallback((el: DOMElement | null, index: number) => {
    const prevEl = itemRefs.current[index];
    if (prevEl === el) {
      return;
    }

    if (prevEl && itemsObserverRef.current) {
      itemsObserverRef.current.unobserve(prevEl);
      elementToIndexRef.current.delete(prevEl);
    }

    itemRefs.current[index] = el;

    if (el) {
      elementToIndexRef.current.set(el, index);
      if (!itemsObserverRef.current) {
        itemsObserverRef.current = new ResizeObserver((entries) => {
          setHeights((prevHeights) => {
            let newHeights: number[] | null = null;
            for (const entry of entries) {
              const idx = elementToIndexRef.current.get(entry.target);
              if (idx !== undefined) {
                const height = Math.round(entry.contentRect.height);
                if (height !== prevHeights[idx]) {
                  if (!newHeights) {
                    newHeights = [...prevHeights];
                  }
                  newHeights[idx] = height;
                }
              }
            }
            return newHeights ?? prevHeights;
          });
        });
      }
      itemsObserverRef.current.observe(el);
    }
  }, []);

  const scrollableContainerHeight = containerRef.current
    ? Math.round(measureElement(containerRef.current).height)
    : containerHeight;

  const getAnchorForScrollTop = useCallback(
    (
      scrollTop: number,
      offsets: number[],
    ): { index: number; offset: number } => {
      const index = findLastIndex(offsets, (offset) => offset <= scrollTop);
      if (index === -1) {
        return { index: 0, offset: 0 };
      }

      return { index, offset: scrollTop - offsets[index] };
    },
    [],
  );

  const scrollTop = useMemo(() => {
    const offset = offsets[scrollAnchor.index];
    if (typeof offset !== 'number') {
      return 0;
    }

    if (scrollAnchor.offset === SCROLL_TO_ITEM_END) {
      const itemHeight = heights[scrollAnchor.index] ?? 0;
      return offset + itemHeight - scrollableContainerHeight;
    }

    return offset + scrollAnchor.offset;
  }, [scrollAnchor, offsets, heights, scrollableContainerHeight]);

  const prevDataLength = useRef(data.length);
  const prevTotalHeight = useRef(totalHeight);
  const prevScrollTop = useRef(scrollTop);
  const prevContainerHeight = useRef(scrollableContainerHeight);

  const stateRef = useRef({
    dataLength: data.length,
    totalHeight,
    scrollTop,
    scrollableContainerHeight,
    isStickingToBottom,
    scrollAnchor,
    offsets,
    containerHeight,
    initialScrollIndex,
    initialScrollOffsetInIndex,
  });

  stateRef.current = {
    dataLength: data.length,
    totalHeight,
    scrollTop,
    scrollableContainerHeight,
    isStickingToBottom,
    scrollAnchor,
    offsets,
    containerHeight,
    initialScrollIndex,
    initialScrollOffsetInIndex,
  };

  const syncScroll = useCallback(() => {
    const {
      dataLength,
      totalHeight,
      scrollTop: currentScrollTop,
      scrollableContainerHeight: currentContainerHeight,
      isStickingToBottom: currentlySticking,
      scrollAnchor: currentAnchor,
      offsets: currentOffsets,
      containerHeight: currentMeasContainerHeight,
      initialScrollIndex: initIndex,
      initialScrollOffsetInIndex: initOffset,
    } = stateRef.current;

    // Handle initial scroll
    if (
      !isInitialScrollSet.current &&
      currentOffsets.length > 1 &&
      totalHeight > 0 &&
      currentMeasContainerHeight > 0
    ) {
      if (typeof initIndex === 'number') {
        const scrollToEnd =
          initIndex === SCROLL_TO_ITEM_END ||
          (initIndex >= dataLength - 1 && initOffset === SCROLL_TO_ITEM_END);

        if (scrollToEnd) {
          setScrollAnchor({
            index: dataLength > 0 ? dataLength - 1 : 0,
            offset: SCROLL_TO_ITEM_END,
          });
          setIsStickingToBottom(true);
          isInitialScrollSet.current = true;
        } else {
          const index = Math.max(0, Math.min(dataLength - 1, initIndex));
          const offset = initOffset ?? 0;
          const newScrollTop = (currentOffsets[index] ?? 0) + offset;
          const clampedScrollTop = Math.max(
            0,
            Math.min(totalHeight - currentContainerHeight, newScrollTop),
          );
          setScrollAnchor(
            getAnchorForScrollTop(clampedScrollTop, currentOffsets),
          );
          isInitialScrollSet.current = true;
        }
      }
    }

    // Handle sticking to bottom
    const contentPreviouslyFit =
      prevTotalHeight.current <= prevContainerHeight.current;
    const wasScrolledToBottomPixels =
      prevScrollTop.current >=
      prevTotalHeight.current - prevContainerHeight.current - 1;
    const wasAtBottom = contentPreviouslyFit || wasScrolledToBottomPixels;

    if (wasAtBottom && currentScrollTop >= prevScrollTop.current) {
      setIsStickingToBottom(true);
    }

    const listGrew = dataLength > prevDataLength.current;
    const containerChanged =
      prevContainerHeight.current !== currentContainerHeight;

    if (
      (listGrew && (currentlySticking || wasAtBottom)) ||
      (currentlySticking && containerChanged)
    ) {
      setScrollAnchor({
        index: dataLength > 0 ? dataLength - 1 : 0,
        offset: SCROLL_TO_ITEM_END,
      });
      if (!currentlySticking) {
        setIsStickingToBottom(true);
      }
    } else if (
      (currentAnchor.index >= dataLength ||
        currentScrollTop > totalHeight - currentContainerHeight) &&
      dataLength > 0
    ) {
      const newScrollTop = Math.max(0, totalHeight - currentContainerHeight);
      setScrollAnchor(getAnchorForScrollTop(newScrollTop, currentOffsets));
    } else if (dataLength === 0) {
      setScrollAnchor({ index: 0, offset: 0 });
    }

    prevDataLength.current = dataLength;
    prevTotalHeight.current = totalHeight;
    prevScrollTop.current = currentScrollTop;
    prevContainerHeight.current = currentContainerHeight;
  }, [getAnchorForScrollTop]);

  const containerObserverRef = useRef<ResizeObserver | null>(null);
  const setContainerRef = useCallback(
    (node: DOMElement | null) => {
      if (containerObserverRef.current) {
        containerObserverRef.current.disconnect();
        containerObserverRef.current = null;
      }
      (containerRef as React.MutableRefObject<DOMElement | null>).current =
        node;
      if (node) {
        const height = Math.round(measureElement(node).height);
        setContainerHeight(height);
        stateRef.current.containerHeight = height;
        stateRef.current.scrollableContainerHeight = height;
        syncScroll();
        const observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            setContainerHeight(Math.round(entry.contentRect.height));
            syncScroll();
          }
        });
        observer.observe(node);
        containerObserverRef.current = observer;
      }
    },
    [syncScroll],
  );

  const innerObserverRef = useRef<ResizeObserver | null>(null);
  const setInnerRef = useCallback(
    (node: DOMElement | null) => {
      if (innerObserverRef.current) {
        innerObserverRef.current.disconnect();
        innerObserverRef.current = null;
      }
      if (node) {
        const height = Math.round(measureElement(node).height);
        stateRef.current.totalHeight = height;
        syncScroll();
        const observer = new ResizeObserver(() => {
          syncScroll();
        });
        observer.observe(node);
        innerObserverRef.current = observer;
      }
    },
    [syncScroll],
  );

  const startIndex = Math.max(
    0,
    findLastIndex(offsets, (offset) => offset <= scrollTop) - 1,
  );
  const endIndexOffset = offsets.findIndex(
    (offset) => offset > scrollTop + scrollableContainerHeight,
  );
  const endIndex =
    endIndexOffset === -1
      ? data.length - 1
      : Math.min(data.length - 1, endIndexOffset);

  const topSpacerHeight = offsets[startIndex] ?? 0;
  const bottomSpacerHeight =
    totalHeight - (offsets[endIndex + 1] ?? totalHeight);

  const renderedItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const item = data[i];
    if (item) {
      renderedItems.push(
        <Box
          key={keyExtractor(item, i)}
          width="100%"
          ref={(el) => {
            setItemRef(el, i);
          }}
        >
          {renderItem({ item, index: i })}
        </Box>,
      );
    }
  }

  const { getScrollTop, setPendingScrollTop } = useBatchedScroll(scrollTop);

  useImperativeHandle(
    ref,
    () => ({
      scrollBy: (delta: number) => {
        if (delta < 0) {
          setIsStickingToBottom(false);
        }
        const currentScrollTop = getScrollTop();
        const newScrollTop = Math.max(
          0,
          Math.min(
            totalHeight - scrollableContainerHeight,
            currentScrollTop + delta,
          ),
        );
        setPendingScrollTop(newScrollTop);
        setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
      },
      scrollTo: (offset: number) => {
        setIsStickingToBottom(false);
        const newScrollTop = Math.max(
          0,
          Math.min(totalHeight - scrollableContainerHeight, offset),
        );
        setPendingScrollTop(newScrollTop);
        setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
      },
      scrollToEnd: () => {
        setIsStickingToBottom(true);
        if (data.length > 0) {
          setScrollAnchor({
            index: data.length - 1,
            offset: SCROLL_TO_ITEM_END,
          });
        }
      },
      scrollToIndex: ({
        index,
        viewOffset = 0,
        viewPosition = 0,
      }: {
        index: number;
        viewOffset?: number;
        viewPosition?: number;
      }) => {
        setIsStickingToBottom(false);
        const offset = offsets[index];
        if (offset !== undefined) {
          const newScrollTop = Math.max(
            0,
            Math.min(
              totalHeight - scrollableContainerHeight,
              offset - viewPosition * scrollableContainerHeight + viewOffset,
            ),
          );
          setPendingScrollTop(newScrollTop);
          setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
        }
      },
      scrollToItem: ({
        item,
        viewOffset = 0,
        viewPosition = 0,
      }: {
        item: T;
        viewOffset?: number;
        viewPosition?: number;
      }) => {
        setIsStickingToBottom(false);
        const index = data.indexOf(item);
        if (index !== -1) {
          const offset = offsets[index];
          if (offset !== undefined) {
            const newScrollTop = Math.max(
              0,
              Math.min(
                totalHeight - scrollableContainerHeight,
                offset - viewPosition * scrollableContainerHeight + viewOffset,
              ),
            );
            setPendingScrollTop(newScrollTop);
            setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
          }
        }
      },
      getScrollIndex: () => scrollAnchor.index,
      getScrollState: () => ({
        scrollTop: getScrollTop(),
        scrollHeight: totalHeight,
        innerHeight: containerHeight,
      }),
    }),
    [
      offsets,
      scrollAnchor,
      totalHeight,
      getAnchorForScrollTop,
      data,
      scrollableContainerHeight,
      getScrollTop,
      setPendingScrollTop,
      containerHeight,
    ],
  );

  return (
    <Box
      ref={setContainerRef}
      overflowY="scroll"
      overflowX="hidden"
      scrollTop={scrollTop}
      scrollbarThumbColor={props.scrollbarThumbColor ?? theme.text.secondary}
      width="100%"
      height="100%"
      flexDirection="column"
      paddingRight={1}
    >
      <Box ref={setInnerRef} flexShrink={0} width="100%" flexDirection="column">
        <Box height={topSpacerHeight} flexShrink={0} />
        {renderedItems}
        <Box height={bottomSpacerHeight} flexShrink={0} />
      </Box>
    </Box>
  );
}

const VirtualizedListWithForwardRef = forwardRef(VirtualizedList) as <T>(
  props: VirtualizedListProps<T> & { ref?: React.Ref<VirtualizedListRef<T>> },
) => React.ReactElement;

export { VirtualizedListWithForwardRef as VirtualizedList };

VirtualizedList.displayName = 'VirtualizedList';
