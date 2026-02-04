/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Box, type DOMElement, ResizeObserver } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { useScrollable } from '../../contexts/ScrollProvider.js';
import { useAnimatedScrollbar } from '../../hooks/useAnimatedScrollbar.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';

interface ScrollableProps {
  children?: React.ReactNode;
  width?: number;
  height?: number | string;
  maxWidth?: number;
  maxHeight?: number;
  hasFocus: boolean;
  scrollToBottom?: boolean;
  flexGrow?: number;
}

export const Scrollable: React.FC<ScrollableProps> = ({
  children,
  width,
  height,
  maxWidth,
  maxHeight,
  hasFocus,
  scrollToBottom,
  flexGrow,
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(scrollTop);
  scrollTopRef.current = scrollTop;

  const [containerNode, setContainerNode] = useState<DOMElement | null>(null);
  const ref = useRef<DOMElement>(null);

  const [size, setSize] = useState({
    innerHeight: 0,
    scrollHeight: 0,
  });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const childrenCountRef = useRef(React.Children.count(children));
  const lastMeasuredChildrenCountRef = useRef(React.Children.count(children));
  childrenCountRef.current = React.Children.count(children);

  const propsRef = useRef({ scrollToBottom });
  propsRef.current = { scrollToBottom };

  const containerObserverRef = useRef<ResizeObserver | null>(null);
  const setRef = useCallback((node: DOMElement | null) => {
    if (containerObserverRef.current) {
      containerObserverRef.current.disconnect();
      containerObserverRef.current = null;
    }
    (ref as React.MutableRefObject<DOMElement | null>).current = node;
    setContainerNode(node);
    if (node) {
      containerObserverRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const newInnerHeight = Math.round(entry.contentRect.height);
          setSize((prev) => {
            if (prev.innerHeight === newInnerHeight) {
              return prev;
            }
            const next = { ...prev, innerHeight: newInnerHeight };
            const isAtBottom =
              scrollTopRef.current >= prev.scrollHeight - prev.innerHeight - 1;

            if (isAtBottom) {
              setScrollTop(Math.max(0, next.scrollHeight - next.innerHeight));
            }
            return next;
          });
        }
      });
      containerObserverRef.current.observe(node);
    }
  }, []);

  const contentRef = useRef<DOMElement>(null);
  const contentObserverRef = useRef<ResizeObserver | null>(null);
  const setContentRef = useCallback((node: DOMElement | null) => {
    if (contentObserverRef.current) {
      contentObserverRef.current.disconnect();
      contentObserverRef.current = null;
    }
    (contentRef as React.MutableRefObject<DOMElement | null>).current = node;
    if (node) {
      contentObserverRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const newScrollHeight = Math.round(entry.contentRect.height);
          setSize((prev) => {
            if (prev.scrollHeight === newScrollHeight) {
              return prev;
            }
            const next = { ...prev, scrollHeight: newScrollHeight };
            const isAtBottom =
              scrollTopRef.current >= prev.scrollHeight - prev.innerHeight - 1;

            const currentCount = childrenCountRef.current;
            const childCountChanged =
              currentCount !== lastMeasuredChildrenCountRef.current;

            if (
              isAtBottom ||
              (propsRef.current.scrollToBottom && childCountChanged)
            ) {
              setScrollTop(Math.max(0, next.scrollHeight - next.innerHeight));
            }

            lastMeasuredChildrenCountRef.current = currentCount;
            return next;
          });
        }
      });
      contentObserverRef.current.observe(node);
    }
  }, []);

  const { getScrollTop, setPendingScrollTop } = useBatchedScroll(scrollTop);

  const scrollBy = useCallback(
    (delta: number) => {
      const { scrollHeight, innerHeight } = sizeRef.current;
      const current = getScrollTop();
      const next = Math.min(
        Math.max(0, current + delta),
        Math.max(0, scrollHeight - innerHeight),
      );
      setPendingScrollTop(next);
      setScrollTop(next);
    },
    [getScrollTop, setPendingScrollTop],
  );

  const { scrollbarColor, flashScrollbar, scrollByWithAnimation } =
    useAnimatedScrollbar(hasFocus, scrollBy);

  useKeypress(
    (key: Key) => {
      if (key.shift) {
        if (key.name === 'up') {
          scrollByWithAnimation(-1);
        }
        if (key.name === 'down') {
          scrollByWithAnimation(1);
        }
      }
    },
    { isActive: hasFocus },
  );

  const getScrollState = useCallback(
    () => ({
      scrollTop: getScrollTop(),
      scrollHeight: size.scrollHeight,
      innerHeight: size.innerHeight,
    }),
    [getScrollTop, size.scrollHeight, size.innerHeight],
  );

  const hasFocusCallback = useCallback(() => hasFocus, [hasFocus]);

  const scrollableEntry = useMemo(
    () => ({
      ref: ref as React.RefObject<DOMElement>,
      getScrollState,
      scrollBy: scrollByWithAnimation,
      hasFocus: hasFocusCallback,
      flashScrollbar,
    }),
    [getScrollState, scrollByWithAnimation, hasFocusCallback, flashScrollbar],
  );

  useScrollable(scrollableEntry, hasFocus && containerNode !== null);

  return (
    <Box
      ref={setRef}
      maxHeight={maxHeight}
      width={width ?? maxWidth}
      height={height}
      flexDirection="column"
      overflowY="scroll"
      overflowX="hidden"
      scrollTop={scrollTop}
      flexGrow={flexGrow}
      scrollbarThumbColor={scrollbarColor}
    >
      {/*
        This inner box is necessary to prevent the parent from shrinking
        based on the children's content. It also adds a right padding to
        make room for the scrollbar.
      */}
      <Box
        ref={setContentRef}
        flexShrink={0}
        paddingRight={1}
        flexDirection="column"
      >
        {children}
      </Box>
    </Box>
  );
};
