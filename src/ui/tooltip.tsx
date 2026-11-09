import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { wikiUrl } from "../port/describe";
import { tipParts } from "../port/hints";

/** How long the pointer rests before a tooltip shows, for every tooltip the page draws. */
export const TOOLTIP_DELAY = 300;

interface Shown {
  text: string;
  left: number;
  top: number;
}

/**
 * A tooltip drawn by the page rather than the browser, so its delay is ours.
 * `show` waits TOOLTIP_DELAY, then shows the text at the point given; a later `show` or `hide` cancels it.
 */
export function useTooltip() {
  const [shown, setShown] = useState<Shown | null>(null);
  const pending = useRef(0);

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

  const element = shown ? (
    <div class="tooltip" role="tooltip" style={{ left: `${shown.left}px`, top: `${shown.top}px` }}>
      {shown.text}
    </div>
  ) : null;

  return { show, hide, element };
}

interface Open extends Shown {
  wiki: string | null;
  el: HTMLElement;
  /** The top of the element it explains, to show above it if there's no room below. */
  above: number;
  onDismissed?: () => void;
}

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"]);

export type ToggletipProps = ReturnType<ReturnType<typeof useToggletip>["on"]>;

/**
 * A toggletip: a click or tap on an element opens its tip in a popover, with a link to the NetHack Wiki,
 * closed by a click or tap elsewhere or a key. Screen readers need the tip as hidden text in the element: see `Described`.
 */
export function useToggletip() {
  const [open, setOpen] = useState<Open | null>(null);
  const popover = useRef<HTMLDivElement>(null);

  const close = () => setOpen(null);
  const current = useRef(open);
  current.current = open;
  /** Closed by the player, having read it, as against by a resize or the element going. */
  const dismiss = () => {
    current.current?.onDismissed?.();
    close();
  };

  const on = (tip: string | undefined, wiki?: string, onDismissed?: () => void) =>
    tip
      ? {
          "data-tip": tip,
          "data-wiki": wiki,
          onClick: (e: MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            const r = el.getBoundingClientRect();
            setOpen({ text: tip, wiki: wiki ?? null, left: r.left, top: r.bottom + 4, above: r.top - 4, el, onDismissed });
          },
        }
      : {};

  /** After a render: close if the element went or lost its tip, or show its new text. */
  const sync = () =>
    setOpen((o) => {
      if (!o) return o;
      const tip = o.el.isConnected ? o.el.getAttribute("data-tip") : null;
      if (!tip) return null;
      const wiki = o.el.getAttribute("data-wiki");
      return tip === o.text && wiki === o.wiki ? o : { ...o, text: tip, wiki };
    });

  // any key closes the popover and still plays, but Escape only closes it, as the map's menu does;
  // listening from layout, as an effect can run a frame after the popover shows
  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // not keys typed ahead, replayed into a dialog, nor a modifier held for a Cmd-click on the link
      if (!e.isTrusted || MODIFIERS.has(e.key)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        // a dialog that opened under the popover listens on window too
        e.stopImmediatePropagation();
      }
      dismiss();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [open !== null]);

  // keep the popover inside the window, above what it explains if there's no room below
  useLayoutEffect(() => {
    const el = popover.current;
    if (!open || !el) return;
    el.style.left = `${open.left}px`;
    const { width, height } = el.getBoundingClientRect();
    const top = open.top + height > window.innerHeight ? open.above - height : open.top;
    el.style.left = `${Math.max(0, Math.min(open.left, window.innerWidth - width))}px`;
    el.style.top = `${Math.max(0, top)}px`;
  }, [open]);

  const element = open ? (
    <div class="tip-backdrop" onMouseDown={dismiss} onContextMenu={(e) => e.preventDefault()}>
      <div class="tip-popover" role="dialog" aria-label="What this means" ref={popover} onMouseDown={(e) => e.stopPropagation()}>
        <p>{tipParts(open.text).map((p) => (p.key ? <kbd>{p.text}</kbd> : p.text))}</p>
        {open.wiki ? (
          <a href={wikiUrl(open.wiki)} target="_blank" rel="noopener" onClick={dismiss}>
            Search the NetHack Wiki for ‘{open.wiki}’
          </a>
        ) : null}
      </div>
    </div>
  ) : null;

  return { on, sync, element };
}

/** A tip as text for screen readers only; screen readers support `aria-description` too unevenly to rely on. */
export function Described({ tip }: { tip: string | undefined }) {
  return tip ? <span class="screen-reader-only">{tip}</span> : null;
}
