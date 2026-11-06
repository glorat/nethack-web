// Temporary tap-latency diagnostics for a preview build: never merge.

type Tap = {
  at: number;
  target: string;
  commandingAtDown: boolean;
  downDelay: number;
  liftToMarkPaint?: number;
  pressMs?: number;
  movedPx?: number;
  cancelled?: boolean;
  upToClick?: number;
  clickDelay?: number;
  clickHandlerMs?: number;
  toNotCommanding?: number;
  toCursor?: number;
  toCursorPaint?: number;
  toCommanding?: number;
  cursorChanges: number;
  events: { name: string; duration: number; inputDelay: number; processing: number; presentation: number }[];
  longTasks: number[];
  scrolls: { after: number; what: string; dx: number; dy: number }[];
};

const MAX_TAPS = 60;
const taps: Tap[] = [];
const allLongTasks: { at: number; ms: number }[] = [];
let current: Tap | null = null;
let down: { x: number; y: number; t: number } | null = null;
let clickAt = 0;

const r = (n: number) => Math.round(n);
const since = () => (current ? performance.now() - clickAt : 0);
const commanding = () => !!document.querySelector(".app[data-commanding]");

function describeTarget(el: EventTarget | null): string {
  if (!(el instanceof Element)) return "?";
  if (el.closest(".map canvas")) return "map";
  const button = el.closest("button");
  if (button) return `button:${(button.getAttribute("aria-label") ?? button.textContent ?? "").trim().slice(0, 20)}`;
  return el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "");
}

function onPointerDown(e: PointerEvent) {
  if (!e.isPrimary) return;
  const now = performance.now();
  down = { x: e.clientX, y: e.clientY, t: now };
  current = {
    at: r(now),
    target: describeTarget(e.target),
    commandingAtDown: commanding(),
    downDelay: r(now - e.timeStamp),
    cursorChanges: 0,
    events: [],
    longTasks: [],
    scrolls: [],
  };
  taps.push(current);
  if (taps.length > MAX_TAPS) taps.shift();
  for (const el of [document.querySelector(".map"), document.scrollingElement]) if (el) scrolled.set(el, { x: el.scrollLeft, y: el.scrollTop });
  update();
}

function onPointerUp(e: PointerEvent) {
  if (!e.isPrimary || !current || !down) return;
  current.pressMs = r(performance.now() - down.t);
  current.movedPx = r(Math.hypot(e.clientX - down.x, e.clientY - down.y));
  if (e.type === "pointercancel") current.cancelled = true;
  else {
    const tap = current;
    const lifted = e.timeStamp;
    requestAnimationFrame(() => requestAnimationFrame(() => (tap.liftToMarkPaint = r(performance.now() - lifted))));
  }
  update();
}

function onClick(e: MouseEvent) {
  if (!current) return;
  const now = performance.now();
  clickAt = now;
  current.upToClick = down && current.pressMs !== undefined ? r(now - down.t - current.pressMs) : undefined;
  current.clickDelay = r(now - e.timeStamp);
  const tap = current;
  // bubbling: runs after the app's own handlers
  window.addEventListener("click", () => (tap.clickHandlerMs = r(performance.now() - now)), { once: true });
  update();
}

function watchDom() {
  const app = document.querySelector(".app");
  const canvas = document.querySelector(".map canvas");
  if (!app || !canvas) return false;
  new MutationObserver(() => {
    const tap = current;
    if (!tap || !clickAt) return;
    if (commanding()) tap.toCommanding ??= r(since());
    else tap.toNotCommanding ??= r(since());
    update();
  }).observe(app, { attributes: true, attributeFilter: ["data-commanding"] });
  new MutationObserver(() => {
    const tap = current;
    if (!tap || !clickAt) return;
    tap.cursorChanges++;
    if (tap.toCursor === undefined) {
      tap.toCursor = r(since());
      const from = clickAt;
      requestAnimationFrame(() => requestAnimationFrame(() => (tap.toCursorPaint = r(performance.now() - from))));
    }
    update();
  }).observe(canvas, { attributes: true, attributeFilter: ["data-cursor"] });
  return true;
}

const scrolled = new WeakMap<object, { x: number; y: number }>();
function onScroll(e: Event) {
  const page = e.target === document;
  const el = page ? document.scrollingElement : (e.target as Element);
  if (!el) return;
  const now = { x: el.scrollLeft, y: el.scrollTop };
  const before = scrolled.get(el) ?? now;
  scrolled.set(el, now);
  const tap = current;
  if (!tap || performance.now() - tap.at > 3000 || tap.scrolls.length >= 40) return;
  tap.scrolls.push({ after: r(performance.now() - tap.at), what: page ? "page" : describeTarget(el), dx: r(now.x - before.x), dy: r(now.y - before.y) });
  update();
}

function onViewportScroll() {
  const v = visualViewport;
  const tap = current;
  if (!v || !tap || performance.now() - tap.at > 3000 || tap.scrolls.length >= 40) return;
  tap.scrolls.push({ after: r(performance.now() - tap.at), what: "visualViewport", dx: r(v.offsetLeft), dy: r(v.offsetTop) });
}

function observePerformance() {
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        if (!["pointerdown", "pointerup", "touchstart", "touchend", "click"].includes(entry.name)) continue;
        const tap = [...taps].reverse().find((t) => t.at <= entry.processingStart + 1 && entry.startTime >= t.at - 2000);
        if (!tap) continue;
        tap.events.push({
          name: entry.name,
          duration: r(entry.duration),
          inputDelay: r(entry.processingStart - entry.startTime),
          processing: r(entry.processingEnd - entry.processingStart),
          presentation: r(entry.startTime + entry.duration - entry.processingEnd),
        });
      }
      update();
    }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        allLongTasks.push({ at: r(entry.startTime), ms: r(entry.duration) });
        if (allLongTasks.length > 200) allLongTasks.shift();
        const tap = [...taps].reverse().find((t) => entry.startTime >= t.at - 500 && entry.startTime <= t.at + 2000);
        tap?.longTasks.push(r(entry.duration));
      }
      update();
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    type Script = { invoker: string; invokerType: string; sourceURL: string; sourceFunctionName: string; sourceCharPosition: number; duration: number; forcedStyleAndLayoutDuration: number; pauseDuration: number };
    type Frame = PerformanceEntry & { renderStart: number; styleAndLayoutStart: number; blockingDuration: number; scripts: Script[] };
    new PerformanceObserver((list) => {
      for (const f of list.getEntries() as Frame[]) {
        if (f.duration < 150) continue;
        const end = f.startTime + f.duration;
        slowFrames.push({
          at: r(f.startTime),
          ms: r(f.duration),
          blocking: r(f.blockingDuration),
          scriptMs: r(f.scripts.reduce((s, x) => s + x.duration, 0)),
          beforeRender: r((f.renderStart || end) - f.startTime),
          rafAndObservers: f.renderStart ? r((f.styleAndLayoutStart || end) - f.renderStart) : 0,
          styleLayoutPaint: f.styleAndLayoutStart ? r(end - f.styleAndLayoutStart) : 0,
          scripts: f.scripts
            .filter((s) => s.duration >= 10)
            .map((s) => ({
              ms: r(s.duration),
              forcedLayout: r(s.forcedStyleAndLayoutDuration),
              invoker: s.invoker,
              type: s.invokerType,
              fn: s.sourceFunctionName,
              src: s.sourceURL.replace(location.origin, ""),
              char: s.sourceCharPosition,
            })),
        });
        if (slowFrames.length > 20) slowFrames.shift();
      }
      update();
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch {}
}

const slowFrames: Record<string, unknown>[] = [];

function environment() {
  const canvas = document.querySelector<HTMLCanvasElement>(".map canvas");
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    build: BUILD,
    ua: navigator.userAgent,
    dpr: devicePixelRatio,
    layoutViewport: `${innerWidth}x${innerHeight}`,
    visualViewport: visualViewport ? `${r(visualViewport.width)}x${r(visualViewport.height)} scale ${visualViewport.scale.toFixed(2)} at ${r(visualViewport.offsetLeft)},${r(visualViewport.offsetTop)}` : null,
    pageWidth: document.documentElement.scrollWidth,
    menubarWidth: r(document.querySelector(".menubar")?.scrollWidth ?? 0),
    cores: navigator.hardwareConcurrency,
    memoryGB: nav.deviceMemory,
    canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
    touchAction: canvas ? getComputedStyle(canvas.parentElement!).touchAction : null,
    uptimeS: r(performance.now() / 1000),
  };
}

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function report() {
  return JSON.stringify({ env: environment(), taps, longTasks: allLongTasks, slowFrames }, null, 0);
}

const BUILD = new URL(import.meta.url).pathname.split("/").pop()?.replace(/\.js$/, "") ?? "?";

let summary: HTMLSpanElement;
let scheduled = false;
function update() {
  if (scheduled || !summary) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    const mapTaps = taps.filter((t) => t.target === "map");
    const toMove = mapTaps.map((t) => t.toCursorPaint).filter((n): n is number => n !== undefined);
    const noClick = mapTaps.filter((t) => t.clickDelay === undefined).length;
    const stalls = taps.filter((t) => t.events.some((e) => e.duration >= 200));
    const withScroll = stalls.filter((t) => t.scrolls.length).length;
    summary.textContent = `${BUILD} · map taps ${mapTaps.length} · move p50 ${median(toMove) ?? "-"} max ${toMove.length ? Math.max(...toMove) : "-"}ms · no click ${noClick} · stalls ${stalls.length} (scrolled ${withScroll})`;
  }, 250);
}

async function copy(button: HTMLButtonElement) {
  const text = report();
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;inset:10% 5%;z-index:1000;font-size:10px";
    area.onblur = () => area.remove();
    document.body.append(area);
    area.select();
    button.textContent = "Select & copy";
  }
  setTimeout(() => (button.textContent = "Copy"), 2000);
}

const KEY = "nethack.diag";

/** ?diag on any page turns the bar on for this device, ?diag=0 off. */
export function diagnosticsWanted(): boolean {
  const asked = new URLSearchParams(location.search).get("diag");
  try {
    if (asked === "0") localStorage.removeItem(KEY);
    else if (asked !== null) localStorage.setItem(KEY, "1");
    return localStorage.getItem(KEY) === "1";
  } catch {
    return asked !== null && asked !== "0";
  }
}

export function startDiagnostics() {
  if (!diagnosticsWanted()) return;
  for (const type of ["pointerdown", "pointerup", "pointercancel"]) document.addEventListener(type, ((e: PointerEvent) => (type === "pointerdown" ? onPointerDown(e) : onPointerUp(e))) as EventListener, { capture: true });
  document.addEventListener("click", onClick, { capture: true });
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  visualViewport?.addEventListener("scroll", onViewportScroll);
  observePerformance();

  const bar = document.createElement("div");
  bar.style.cssText =
    "position:fixed;left:0;top:0;z-index:1000;display:flex;gap:6px;align-items:center;box-sizing:border-box;padding:2px 6px;font:11px system-ui;color:#fff;background:rgba(120,0,120,.85)";
  summary = document.createElement("span");
  summary.textContent = "diagnostics on";
  const copyButton = document.createElement("button");
  copyButton.textContent = "Copy";
  copyButton.style.cssText = "min-height:0;padding:2px 8px;font:inherit";
  copyButton.onclick = (e) => {
    e.stopPropagation();
    copy(copyButton);
  };
  const clear = document.createElement("button");
  clear.textContent = "Clear";
  clear.style.cssText = copyButton.style.cssText;
  clear.onclick = (e) => {
    e.stopPropagation();
    taps.length = 0;
    allLongTasks.length = 0;
    slowFrames.length = 0;
    current = null;
    update();
  };
  bar.append(summary, copyButton, clear);
  document.body.append(bar);
  // fixed elements follow the layout viewport, which is wider and taller than the screen when the page overflows it
  const place = () => {
    const v = visualViewport;
    if (!v) return;
    bar.style.width = `${v.width}px`;
    bar.style.transform = `translate(${v.offsetLeft}px, ${v.offsetTop + v.height - bar.offsetHeight}px)`;
  };
  visualViewport?.addEventListener("resize", place);
  visualViewport?.addEventListener("scroll", place);
  new ResizeObserver(place).observe(bar);
  place();

  const wait = setInterval(() => watchDom() && clearInterval(wait), 500);
}
