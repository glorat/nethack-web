import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { GameClient } from "../client";
import { commandToRun, listCommands } from "../port/extcmd";
import { ArrowChords, keyCode, takeLine, type KeyLike } from "../port/keys";
import { applyEvents, initialState, nextBatch } from "../port/state";
import type { Answer, GameRequest } from "../protocol";
import { loadTileSheet, type TileSheet } from "../tiles";
import { DirectionDialog } from "./dialogs/DirectionDialog";
import { ExtCommandDialog } from "./dialogs/ExtCommandDialog";
import { InputDialog } from "./dialogs/InputDialog";
import { MenuDialog } from "./dialogs/MenuDialog";
import { PlayerDialog } from "./dialogs/PlayerDialog";
import { TextDialog } from "./dialogs/TextDialog";
import { YesNoDialog } from "./dialogs/YesNoDialog";
import { EquipmentView } from "./EquipmentView";
import { InventoryView } from "./InventoryView";
import { MapView } from "./MapView";
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

  const sendKey = (k: KeyLike) => {
    const code = keyCode(k);
    if (code === null) return;
    waitingForKey.current = false;
    inventoryKey.current = 0;
    setState(nextBatch);
    client.key(code);
  };

  const client = useMemo(
    () =>
      new GameClient({
        events: (events) => setState((s) => applyEvents(s, events)),
        request: (id, request) => {
          // a pick is for the menu the inventory key opens next, or nothing
          const letter = pendingPick.current;
          pendingPick.current = null;
          if (request.kind === "key" || request.kind === "poskey") {
            const next = typeAhead.current.shift();
            if (next) return sendKey(next);
            waitingForKey.current = true;
            inventoryKey.current = request.kind === "poskey" ? request.inventoryKey : 0;
            return;
          }
          waitingForKey.current = false;
          inventoryKey.current = 0;
          // an arrow held as a dialog opens is its first key, as it was before chords
          typeAhead.current.push(...chords.current.up());
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

  // zoom keys and Ctrl-Cmd-S work with a dialog open too, as Cocoa's menu shortcuts do: this listener is
  // added before any dialog's, and the browser would zoom the page otherwise
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
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
    inventoryKey.current = 0;
    waitingForKey.current = false;
    pendingPick.current = letter;
    setState(nextBatch);
    client.key(key);
  };

  const start = (name: string) => {
    setPlaying(true);
    client.start({
      assetBase: new URL("./", document.baseURI).href,
      options: `name:${name},${BASE_OPTIONS}${ascii ? ",ascii_map" : ""}`,
    });
  };

  if (state.error) return <div class="fatal">{state.error}</div>;
  if (!sheet) return <div class="loading">Loading tiles…</div>;
  if (!playing) return <StartScreen onStart={start} />;

  return (
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
          onAscii={
            state.status.BL_TITLE
              ? (on) => {
                  setState((s) => ({ ...s, asciiMap: on }));
                  saveAscii(on);
                  client.asciiMap(on);
                }
              : undefined
          }
          describe={(x, y) => client.describe(x, y)}
          onZoom={zoom}
          onShowInventory={showInventory ? undefined : () => setShowInventory(true)}
          onClick={(x, y, button) => {
            if (pending) return;
            inventoryKey.current = 0;
            setState(nextBatch);
            client.click(x, y, button);
          }}
        />
      </div>
      {showInventory ? (
        <InventoryView items={state.inventory} sheet={sheet} onChoose={chooseItem} onHide={() => setShowInventory(false)} />
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
      {pending ? <PendingDialog pending={pending} sheet={sheet} answer={answer} passOn={(k) => typeAhead.current.unshift(k)} /> : null}
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
