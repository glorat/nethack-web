import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { wikiUrl } from "../port/describe";

/** How long the pointer rests before a tooltip shows, for every tooltip the page draws. */
export const TOOLTIP_DELAY = 300;

interface Shown {
  text: string;
  left: number;
  top: number;
}

interface Pinned extends Shown {
  wiki: string | null;
  el: HTMLElement;
  /** The top of the element it explains, to show above it if there's no room below. */
  above: number;
}

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"]);

export type TipProps = ReturnType<ReturnType<typeof useTooltip>["on"]>;

/**
 * A tooltip drawn by the page rather than the browser, so its delay is ours.
 * `show` waits TOOLTIP_DELAY, then shows the text at the point given; a later `show` or `hide` cancels it.
 * Elements given `on` also open the tip as a popover when clicked or tapped, with a link to the NetHack Wiki.
 */
export function useTooltip() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const pending = useRef(0);
  const hovered = useRef<HTMLElement | null>(null);
  const popover = useRef<HTMLDivElement>(null);

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

  const unpin = () => setPinned(null);

  /**
   * Props that show `tip` under the element they're on: on hover for a mouse only, as a tap has nothing to end it,
   * and as a popover on a click or tap. Screen readers need the tip as hidden text in the element too: see `Described`.
   */
  const on = (tip: string | undefined, wiki?: string) =>
    tip
      ? {
          "data-tip": tip,
          "data-wiki": wiki,
          onPointerEnter: (e: PointerEvent) => {
            if (e.pointerType !== "mouse") return;
            const el = e.currentTarget as HTMLElement;
            hovered.current = el;
            const r = el.getBoundingClientRect();
            show(() => el.getAttribute("data-tip"), r.left, r.bottom + 4);
          },
          onPointerLeave: () => {
            hovered.current = null;
            hide();
          },
          onClick: (e: MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            const r = el.getBoundingClientRect();
            hide();
            setPinned({ text: tip, wiki: wiki ?? null, left: r.left, top: r.bottom + 4, above: r.top - 4, el });
          },
        }
      : {};

  /** After a render: drop a tip whose element went or lost its tip, and show a changed one's new text. */
  const sync = () => {
    const el = hovered.current;
    if (el) {
      const tip = el.isConnected ? el.getAttribute("data-tip") : null;
      if (!tip) {
        hovered.current = null;
        hide();
      } else setShown((s) => (s && s.text !== tip ? { ...s, text: tip } : s));
    }
    setPinned((p) => {
      if (!p) return p;
      const tip = p.el.isConnected ? p.el.getAttribute("data-tip") : null;
      if (!tip) return null;
      const wiki = p.el.getAttribute("data-wiki");
      return tip === p.text && wiki === p.wiki ? p : { ...p, text: tip, wiki };
    });
  };

  // any key closes the popover and still plays, but Escape only closes it, as the map's menu does;
  // listening from layout, as an effect can run a frame after the popover shows
  useLayoutEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      // not keys typed ahead, replayed into a dialog, nor a modifier held for a Cmd-click on the link
      if (!e.isTrusted || MODIFIERS.has(e.key)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        // a dialog that opened under the popover listens on window too
        e.stopImmediatePropagation();
      }
      unpin();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", unpin);
    window.addEventListener("resize", unpin);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", unpin);
      window.removeEventListener("resize", unpin);
    };
  }, [pinned !== null]);

  // keep the popover inside the window, above what it explains if there's no room below
  useLayoutEffect(() => {
    const el = popover.current;
    if (!pinned || !el) return;
    el.style.left = `${pinned.left}px`;
    const { width, height } = el.getBoundingClientRect();
    const top = pinned.top + height > window.innerHeight ? pinned.above - height : pinned.top;
    el.style.left = `${Math.max(0, Math.min(pinned.left, window.innerWidth - width))}px`;
    el.style.top = `${Math.max(0, top)}px`;
  }, [pinned]);

  const element = pinned ? (
    <div class="tip-backdrop" onMouseDown={unpin} onContextMenu={(e) => e.preventDefault()}>
      <div class="tip-popover" role="dialog" aria-label="What this means" ref={popover} onMouseDown={(e) => e.stopPropagation()}>
        <p>{pinned.text}</p>
        {pinned.wiki ? (
          <a href={wikiUrl(pinned.wiki)} target="_blank" rel="noopener" onClick={unpin}>
            Search the NetHack Wiki for ‘{pinned.wiki}’
          </a>
        ) : null}
      </div>
    </div>
  ) : shown ? (
    <div class="tooltip" role="tooltip" style={{ left: `${shown.left}px`, top: `${shown.top}px` }}>
      {shown.text}
    </div>
  ) : null;

  return { show, hide, on, sync, element };
}

/** A tip as text for screen readers only; `aria-description` would do, but some browsers show it as a tooltip too. */
export function Described({ tip }: { tip: string | undefined }) {
  return tip ? <span class="screen-reader-only">{tip}</span> : null;
}
