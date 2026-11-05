import { useEffect, useRef, useState } from "preact/hooks";

/** How long the pointer rests before a tooltip shows, for every tooltip the page draws. */
export const TOOLTIP_DELAY = 300;

interface Shown {
  text: string;
  left: number;
  top: number;
}

export type TipProps = ReturnType<ReturnType<typeof useTooltip>["on"]>;

/**
 * A tooltip drawn by the page rather than the browser, so its delay is ours.
 * `show` waits TOOLTIP_DELAY, then shows the text at the point given; a later `show` or `hide` cancels it.
 */
export function useTooltip() {
  const [shown, setShown] = useState<Shown | null>(null);
  const pending = useRef(0);
  const hovered = useRef<HTMLElement | null>(null);

  const hide = () => {
    clearTimeout(pending.current);
    pending.current = 0;
    setShown(null);
  };

  const show = (text: () => string | null | Promise<string | null>, left: number, top: number) => {
    hide();
    const timer = window.setTimeout(async () => {
      const t = await text();
      if (t && pending.current === timer) setShown({ text: t, left, top });
    }, TOOLTIP_DELAY);
    pending.current = timer;
  };

  useEffect(() => () => clearTimeout(pending.current), []);

  /**
   * Props that show `tip` under the element they're on, for a mouse only, as a tap has nothing to end it.
   * The tip is also the element's description for screen readers.
   */
  const on = (tip: string | undefined) =>
    tip
      ? {
          "aria-description": tip,
          onPointerEnter: (e: PointerEvent) => {
            if (e.pointerType !== "mouse") return;
            const el = e.currentTarget as HTMLElement;
            hovered.current = el;
            const r = el.getBoundingClientRect();
            show(() => el.getAttribute("aria-description"), r.left, r.bottom + 4);
          },
          onPointerLeave: () => {
            hovered.current = null;
            hide();
          },
        }
      : {};

  /** After a render: hide the tip if its element went or lost its tip, or show its new text. */
  const sync = () => {
    const el = hovered.current;
    if (!el) return;
    const tip = el.isConnected ? el.getAttribute("aria-description") : null;
    if (!tip) {
      hovered.current = null;
      hide();
    } else setShown((s) => (s && s.text !== tip ? { ...s, text: tip } : s));
  };

  const element = shown ? (
    <div class="tooltip" role="tooltip" style={{ left: `${shown.left}px`, top: `${shown.top}px` }}>
      {shown.text}
    </div>
  ) : null;

  return { show, hide, on, sync, element };
}
