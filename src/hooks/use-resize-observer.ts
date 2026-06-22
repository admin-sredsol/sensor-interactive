import { useState, useEffect, RefObject } from "react";

export interface Size {
  width: number;
  height: number;
}

/**
 * Custom hook that observes the size of a DOM element using ResizeObserver.
 * This replaces the `react-sizeme` library's `withSize` HOC.
 *
 * @param ref - A React ref object attached to the element to observe
 * @returns The current { width, height } of the observed element
 */
export function useResizeObserver(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Only update if dimensions actually changed (avoid unnecessary re-renders)
        setSize((prev) => {
          if (prev.width === width && prev.height === height) {
            return prev;
          }
          return { width, height };
        });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}