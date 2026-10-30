import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { GameClient } from "../client";
import { commandToRun, listCommands } from "../port/extcmd";
import { ArrowChords, keyCode, takeLine, type KeyLike } from "../port/keys";
import { configFile, OPTIONS_TEMPLATE } from "../port/options";
import { applyEvents, initialState, nextBatch } from "../port/state";
import { biggerTextSize, DEFAULT_TEXT_SIZE, nearestTextSize, smallerTextSize, textSizeFromOptions } from "../port/textsize";
import type { Answer, GameRequest } from "../protocol";
import { loadTileSheet, type TileSheet } from "../tiles";
import { DirectionDialog } from "./dialogs/DirectionDialog";
import { ExtCommandDialog } from "./dialogs/ExtCommandDialog";
import { InputDialog } from "./dialogs/InputDialog";
import { MenuDialog } from "./dialogs/MenuDialog";
import { OptionsDialog } from "./dialogs/OptionsDialog";
import { PlayerDialog } from "./dialogs/PlayerDialog";
import { TextDialog } from "./dialogs/TextDialog";
import { YesNoDialog } from "./dialogs/YesNoDialog";
import { EquipmentView } from "./EquipmentView";
import { InventoryView } from "./InventoryView";
import { MapView } from "./MapView";
import { type BarMenu, MenuBar, type MenuEntry } from "./MenuBar";
import { COMMAND_MENUS, type CommandItem, GAME_MENU, WIZARD_MENU } from "./commands";
import { MessageView } from "./MessageView";
import { StartScreen } from "./StartScreen";
import { StatsView } from "./StatsView";

const TILE_SIZE = 64;
const MAP_CELLS = [16, 24, 32, 48, 64];
const ZOOM_KEY = "nethack.mapCell";
const DEFAULT_CELL = 32;
// with Cmd or Ctrl, as Cocoa's View menu has them; 0 is back to the starting size
const ZOOM_KEYS: Record<string, -1 | 0 | 1> = { "=": 1, "+": 1, "-": -1, "0": 0 };
const ASCII_KEY = "nethack.asciiMap";
const INVENTORY_KEY = "nethack.showInventory";
const INVENTORY_WIDTH_KEY = "nethack.inventoryWidth";
const TEXT_SIZE_KEY = "nethack.textSize";
const OPTIONS_KEY = "nethack.options";

function savedOptions(): string {
  try {
    return localStorage.getItem(OPTIONS_KEY) ?? OPTIONS_TEMPLATE;
  } catch {
    return OPTIONS_TEMPLATE;
  }
}
// with Cmd or Ctrl and Option, as Cocoa's View menu has them; 0 is back to the default
const TEXT_SIZE_KEYS: Record<string, (size: number) => number> = {
  Equal: biggerTextSize,
  Minus: smallerTextSize,
  Digit0: () => DEFAULT_TEXT_SIZE,
};


/** The size chosen here, if one was: the options decide otherwise. */
function savedTextSize(): number | null {
  try {
    const saved = Number(localStorage.getItem(TEXT_SIZE_KEY));
    if (saved > 0) return nearestTextSize(saved);
  } catch {}
  return null;
}

/** Scales the UI's text, which the stylesheet draws at 13px. */
function applyTextSize(size: number) {
  document.documentElement.style.setProperty("--text-scale", String(size / DEFAULT_TEXT_SIZE));
}
// Cocoa's narrowest sidebar and main area, at the default text size; the stats and messages, which
// grow with the text, sit beside the equipment, which doesn't
const MIN_INVENTORY_WIDTH = 180;
const MIN_MAIN_WIDTH = 637;
const STATS_AND_MESSAGES_WIDTH = 250 + 200;
const EQUIPMENT_WIDTH = 120;

function inventoryWidth(width: number, scale: number): number {
  const main = Math.max(MIN_MAIN_WIDTH, STATS_AND_MESSAGES_WIDTH * scale + EQUIPMENT_WIDTH);
  return Math.round(Math.max(MIN_INVENTORY_WIDTH * scale, Math.min(width, window.innerWidth - main)));
}

function savedInventoryWidth(): number {
  try {
    const saved = Number(localStorage.getItem(INVENTORY_WIDTH_KEY));
    if (saved > 0) return saved;
  } catch {}
  return 300;
}

function savedShowInventory(): boolean {
  try {
    return localStorage.getItem(INVENTORY_KEY) !== "0";
  } catch {
    return true;
  }
}

function savedCell(): number {
  try {
    const saved = Number(localStorage.getItem(ZOOM_KEY));
    if (MAP_CELLS.includes(saved)) return saved;
  } catch {}
  return DEFAULT_CELL;
}

function zoomed(cell: number, step: -1 | 0 | 1): number {
  if (step === 0) return DEFAULT_CELL;
  return MAP_CELLS[Math.min(MAP_CELLS.length - 1, Math.max(0, MAP_CELLS.indexOf(cell) + step))];
}

function savedAscii(): boolean {
  try {
    return localStorage.getItem(ASCII_KEY) === "1";
  } catch {
    return false;
  }
}

function saveAscii(on: boolean) {
  try {
    localStorage.setItem(ASCII_KEY, on ? "1" : "0");
  } catch {}
}

const BASE_OPTIONS = "perm_invent,!autopickup,menucolors,time,showexp,hilite_pet,hilite_pile,force_invmenu";

interface Pending {
  id: number;
  request: Exclude<GameRequest, { kind: "key" } | { kind: "poskey" }>;
  /** Text typed ahead into a # or getlin prompt. */
  typed?: string;
}

export function App() {
  const [sheet, setSheet] = useState<TileSheet | null>(null);
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState<Pending | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cell, setCellState] = useState(savedCell);
  const [editingOptions, setEditingOptions] = useState(false);
  /** False if the browser wouldn't keep it, which the editor says. */
  const saveOptions = (text: string | null): boolean => {
    if (text !== null)
      try {
        localStorage.setItem(OPTIONS_KEY, text);
      } catch {
        return false;
      }
    setEditingOptions(false);
    return true;
  };
  const cellNow = useRef(cell);
  // settings are saved as they change: an effect waits for the next frame, which a reload can beat
  const zoom = (step: -1 | 0 | 1) => {
    const next = zoomed(cellNow.current, step);
    cellNow.current = next;
    setCellState(next);
    try {
      localStorage.setItem(ZOOM_KEY, String(next));
    } catch {}
  };
  const [showInventory, setShowInventoryState] = useState(savedShowInventory);
  const shownInventory = useRef(showInventory);
  const [textSize, setTextSizeState] = useState(() => savedTextSize() ?? DEFAULT_TEXT_SIZE);
  const textSizeNow = useRef(textSize);
  /** save: chosen here, so kept over the options' size; the default forgets the choice, as Cocoa's does. */
  const setTextSize = (size: number, save: boolean) => {
    textSizeNow.current = size;
    setTextSizeState(size);
    applyTextSize(size);
    if (!save) return;
    try {
      if (size === DEFAULT_TEXT_SIZE) localStorage.removeItem(TEXT_SIZE_KEY);
      else localStorage.setItem(TEXT_SIZE_KEY, String(size));
    } catch {}
  };
  useLayoutEffect(() => applyTextSize(textSizeNow.current), []);
  // read by the worker's events, which the client was made with before this render
  const optionsTextSize = useRef<(size: number, atStart: boolean) => void>(() => {});
  optionsTextSize.current = (size, atStart) => {
    const next = textSizeFromOptions(size, atStart, savedTextSize());
    if (next !== null) setTextSize(next, false);
  };
  // the sidebar is as wide at a bigger text size as its saved width is at the default
  const textScale = textSize / DEFAULT_TEXT_SIZE;
  const [sidebarWidth, setSidebarWidth] = useState(savedInventoryWidth);
  // the sidebar's limit follows the window
  const [, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resized = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  const resizeInventory = (width: number, done: boolean) => {
    const next = inventoryWidth(width, textScale) / textScale;
    setSidebarWidth(next);
    if (done)
      try {
        localStorage.setItem(INVENTORY_WIDTH_KEY, String(next));
      } catch {}
  };
  const setShowInventory = (show: boolean) => {
    shownInventory.current = show;
    setShowInventoryState(show);
    try {
      localStorage.setItem(INVENTORY_KEY, show ? "1" : "0");
    } catch {}
  };
  // the core's options menu can switch it too, which comes back as state.asciiMap
  const ascii = state.asciiMap ?? savedAscii();
  // non-zero only while the core waits for a command with no keys queued
  const inventoryKey = useRef(0);
  const pendingPick = useRef<string | null>(null);
  // keys typed while the core is busy: each goes to the next thing that asks, as in tty
  const typeAhead = useRef<KeyLike[]>([]);
  const chords = useRef(new ArrowChords());
  const waitingForKey = useRef(false);
  // read by the key handler, which can run before a new dialog has rendered
  const pendingRef = useRef<Pending | null>(null);
  const answered = useRef(0);

  const show = (p: Pending | null) => {
    pendingRef.current = p;
    setPending(p);
  };

  const setInventoryKey = (key: number) => {
    inventoryKey.current = key;
  };
  // the extended command key while the core waits for a command, with no keys typed ahead: the menu
  // bar's commands are only for then, and run as that key and the command's name
  const commandKey = useRef(0);
  const [commanding, setCommanding] = useState(false);
  const [wizard, setWizard] = useState(false);
  const setCommandKey = (key: number) => {
    commandKey.current = key;
    setCommanding(key !== 0);
  };
  const pendingCommand = useRef<string | null>(null);
  const runCommand = (name: string) => {
    if (!commandKey.current || pendingRef.current) return;
    pendingCommand.current = name;
    sendCode(commandKey.current);
  };

  const sendCode = (code: number) => {
    waitingForKey.current = false;
    setInventoryKey(0);
    setCommandKey(0);
    setState(nextBatch);
    client.key(code);
  };

  const sendKey = (k: KeyLike) => {
    const code = keyCode(k);
    if (code !== null) sendCode(code);
  };

  const client = useMemo(
    () =>
      new GameClient({
        events: (events) => {
          setState((s) => applyEvents(s, events));
          for (const e of events) if (e.type === "text_size") optionsTextSize.current(e.size, e.atStart);
        },
        request: (id, request) => {
          // a pick is for the menu the inventory key opens next, or nothing
          const letter = pendingPick.current;
          pendingPick.current = null;
          // a command for a prompt that didn't come is for none
          const command = pendingCommand.current;
          pendingCommand.current = null;
          if (request.kind === "key" || request.kind === "poskey") {
            const next = typeAhead.current.shift();
            if (next) return sendKey(next);
            waitingForKey.current = true;
            setInventoryKey(request.kind === "poskey" ? request.inventoryKey : 0);
            setCommandKey(request.kind === "poskey" ? request.commandKey : 0);
            if (request.kind === "poskey") setWizard(request.wizard);
            return;
          }
          waitingForKey.current = false;
          setInventoryKey(0);
          setCommandKey(0);
          // an arrow held as a dialog opens is its first key, as it was before chords
          typeAhead.current.push(...chords.current.up());
          if (command && request.kind === "ext_cmd")
            return client.answer(id, { kind: "ext_cmd", index: request.commands.find((c) => c.name === command)?.index ?? -1 });
          if (request.kind === "ext_cmd" || request.kind === "getlin") {
            const line = takeLine(typeAhead.current);
            if (line.end === "escape") return client.answer(id, request.kind === "getlin" ? { kind: "getlin", text: null } : { kind: "ext_cmd", index: -1 });
            if (line.end === "return") {
              if (request.kind === "getlin") return client.answer(id, { kind: "getlin", text: line.text });
              const run = commandToRun(request.commands, line.text, listCommands(request.commands, line.text)[0]);
              return client.answer(id, { kind: "ext_cmd", index: run?.index ?? -1 });
            }
            return show({ id, request, typed: line.text });
          }
          if (letter && request.kind === "menu") {
            const item = request.items.find((i) => i.identifier !== 0 && i.accelerator === letter);
            if (item) {
              client.answer(id, { kind: "menu", selection: [{ identifier: item.identifier, count: -1 }] });
              return;
            }
          }
          show({ id, request });
        },
      }),
    [],
  );

  useEffect(() => {
    loadTileSheet(new URL(`tiles/tiles${TILE_SIZE}.png`, document.baseURI).href, TILE_SIZE)
      .then(setSheet)
      .catch((e) => setState((s) => ({ ...s, error: String(e) })));
  }, []);

  useEffect(() => {
    const type = (keys: KeyLike[]) => {
      for (const k of keys) {
        if (waitingForKey.current) sendKey(k);
        else typeAhead.current.push(k);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!playing || pendingRef.current) return;
      if (keyCode(e) === null) return;
      e.preventDefault();
      type(chords.current.down({ key: e.key, code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey }));
    };
    const onRelease = () => type(chords.current.up());
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onRelease);
    window.addEventListener("blur", onRelease);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onRelease);
      window.removeEventListener("blur", onRelease);
    };
  }, [playing, client]);

  useEffect(() => {
    if (state.asciiMap !== null) saveAscii(state.asciiMap);
  }, [state.asciiMap]);

  // zoom keys, text size keys and Ctrl-Cmd-S work with a dialog open too, as Cocoa's menu shortcuts do: this listener is
  // added before any dialog's, and the browser would zoom the page otherwise
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      // not AltGr, which Ctrl+Alt is on Windows and Linux, typing } \\ @ and the like
      const textStep =
        (e.metaKey || e.ctrlKey) && e.altKey && !e.getModifierState("AltGraph") ? TEXT_SIZE_KEYS[e.code] : undefined;
      if (textStep) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return setTextSize(textStep(textSizeNow.current), true);
      }
      // Ctrl-Cmd-S, as Cocoa's View menu has it
      if (e.ctrlKey && e.metaKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return setShowInventory(!shownInventory.current);
      }
      const step = (e.metaKey || e.ctrlKey) && !e.altKey ? ZOOM_KEYS[e.key] : undefined;
      if (step === undefined) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      zoom(step);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [playing]);

  // keys typed before a dialog opened are its first keys; its listeners are attached by now
  useLayoutEffect(() => {
    while (pending && answered.current !== pending.id && typeAhead.current.length) {
      const k = typeAhead.current.shift()!;
      window.dispatchEvent(new KeyboardEvent("keydown", { ...k, cancelable: true }));
    }
  }, [pending]);

  const answer = (a: Answer) => {
    const p = pendingRef.current;
    if (!p) return;
    answered.current = p.id;
    client.answer(p.id, a);
    show(null);
  };

  const chooseItem = (letter: string) => {
    const key = inventoryKey.current;
    if (!key || pendingRef.current) return;
    setInventoryKey(0);
    setCommandKey(0);
    waitingForKey.current = false;
    pendingPick.current = letter;
    setState(nextBatch);
    client.key(key);
  };

  const start = (name: string) => {
    setPlaying(true);
    client.start({
      assetBase: new URL("./", document.baseURI).href,
      options: `name:${name}`,
      config: configFile(`${BASE_OPTIONS}${ascii ? ",ascii_map" : ""}`, savedOptions()),
    });
  };

  // absent until the core has read its options, which would overrule a switch made before
  const toggleAscii = state.status.BL_TITLE
    ? (on: boolean) => {
        setState((s) => ({ ...s, asciiMap: on }));
        saveAscii(on);
        client.asciiMap(on);
      }
    : undefined;
  const command = (item: CommandItem | null): MenuEntry | null =>
    item && {
      title: item.title,
      key: item.key,
      indent: item.indent,
      disabled: !commanding || editingOptions,
      run: () => runCommand(item.command),
    };
  const menus: BarMenu[] = [
    {
      title: "Game",
      entries: [
        ...GAME_MENU.slice(0, 1).map(command),
        // not over a question, whose keys the editor's text would answer
        { title: "Edit Options File...", disabled: !!pending, run: () => setEditingOptions(true) },
        ...GAME_MENU.slice(1).map(command),
      ],
    },
    {
      title: "View",
      entries: [
        { title: "Use ASCII Mode", checked: ascii, disabled: !toggleAscii, run: () => toggleAscii?.(!ascii) },
        null,
        { title: "Zoom In", key: "⌘=", run: () => zoom(1) },
        { title: "Zoom Out", key: "⌘-", run: () => zoom(-1) },
        { title: "Actual Size", key: "⌘0", run: () => zoom(0) },
        null,
        {
          title: "Bigger Text",
          key: "⌥⌘=",
          disabled: biggerTextSize(textSize) === textSize,
          run: () => setTextSize(biggerTextSize(textSizeNow.current), true),
        },
        {
          title: "Smaller Text",
          key: "⌥⌘-",
          disabled: smallerTextSize(textSize) === textSize,
          run: () => setTextSize(smallerTextSize(textSizeNow.current), true),
        },
        { title: "Default Text Size", disabled: textSize === DEFAULT_TEXT_SIZE, run: () => setTextSize(DEFAULT_TEXT_SIZE, true) },
        null,
        { title: showInventory ? "Hide Inventory" : "Show Inventory", key: "⌃⌘S", run: () => setShowInventory(!showInventory) },
      ],
    },
    // only in a debug-mode game, as Cocoa shows it
    ...(wizard ? [...COMMAND_MENUS, WIZARD_MENU] : COMMAND_MENUS).map((menu) => ({ title: menu.title, entries: menu.items.map(command) })),
  ];

  if (state.error) return <div class="fatal">{state.error}</div>;
  if (!sheet) return <div class="loading">Loading tiles…</div>;
  const optionsDialog = editingOptions ? <OptionsDialog text={savedOptions()} onDone={saveOptions} /> : null;
  if (!playing)
    return (
      <>
        <StartScreen onStart={start} onOptions={() => setEditingOptions(true)} />
        {optionsDialog}
      </>
    );

  return (
    <div class="app">
      <MenuBar menus={menus} />
      <div class="game">
        <div class="main-area">
          <header class="top">
            <StatsView fields={state.status} />
            <EquipmentView equipment={state.equipment} inventory={state.inventory} sheet={sheet} onChoose={chooseItem} />
            <MessageView messages={state.messages} batch={state.batch} />
          </header>
          <MapView
            state={state}
            sheet={sheet}
            cell={cell}
            ascii={ascii}
            onAscii={toggleAscii}
            describe={(x, y) => client.describe(x, y)}
            onZoom={zoom}
            onShowInventory={showInventory ? undefined : () => setShowInventory(true)}
            onClick={(x, y, button) => {
              if (pending) return;
              setInventoryKey(0);
              setCommandKey(0);
              setState(nextBatch);
              client.click(x, y, button);
            }}
          />
        </div>
        {showInventory ? (
          <InventoryView
            items={state.inventory}
            sheet={sheet}
            width={inventoryWidth(sidebarWidth * textScale, textScale)}
            onChoose={chooseItem}
            onHide={() => setShowInventory(false)}
            onResize={resizeInventory}
          />
        ) : null}
        {!state.started ? <div class="overlay-note">Starting…</div> : null}
        {state.gameOver ? (
          <div class="dialog-backdrop">
            <div class="dialog">
              <div class="dialog-title">{state.gameOver}</div>
              <div class="dialog-buttons">
                <button class="primary" onClick={() => location.reload()}>
                  New game
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {optionsDialog}
        {pending ? <PendingDialog pending={pending} sheet={sheet} answer={answer} passOn={(k) => typeAhead.current.unshift(k)} /> : null}
      </div>
    </div>
  );
}

function PendingDialog({
  pending,
  sheet,
  answer,
  passOn,
}: {
  pending: Pending;
  sheet: TileSheet;
  answer(a: Answer): void;
  /** Gives the game a key, ahead of any typed already. */
  passOn(k: KeyLike): void;
}) {
  const r = pending.request;
  switch (r.kind) {
    case "yn":
      if (r.directions)
        return <DirectionDialog query={r.query} directions={r.directions} onDone={(key) => answer({ kind: "yn", key: key ?? "\x1b" })} />;
      return (
        <YesNoDialog
          query={r.query}
          choices={r.choices}
          defaultChoice={r.defaultChoice}
          onDone={(key, count) => answer({ kind: "yn", key: key ?? "\x1b", count })}
        />
      );
    case "getlin":
      return <InputDialog query={r.query} initial={pending.typed} onDone={(text) => answer({ kind: "getlin", text })} />;
    case "menu":
      return (
        <MenuDialog
          key={pending.id}
          how={r.how}
          prompt={r.prompt}
          items={r.items}
          unlisted={r.unlisted}
          sheet={sheet}
          onDone={(selection) => answer({ kind: "menu", selection })}
        />
      );
    case "text":
      return (
        <TextDialog
          lines={r.lines}
          onDone={(next) => {
            if (next) passOn(next);
            answer({ kind: "text" });
          }}
        />
      );
    case "ext_cmd":
      return <ExtCommandDialog commands={r.commands} initial={pending.typed} onDone={(index) => answer({ kind: "ext_cmd", index })} />;
    case "player":
      return <PlayerDialog choices={r.choices} sheet={sheet} onDone={(pick) => answer({ kind: "player", ...pick })} />;
  }
}
