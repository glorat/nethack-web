import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { GameClient } from "../client";
import { keyCode } from "../port/keys";
import { applyEvents, initialState, nextBatch } from "../port/state";
import type { Answer, GameRequest } from "../protocol";
import { loadTileSheet, type TileSheet } from "../tiles";
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

function savedCell(): number {
  try {
    const saved = Number(localStorage.getItem(ZOOM_KEY));
    if (MAP_CELLS.includes(saved)) return saved;
  } catch {}
  return 32;
}
const BASE_OPTIONS = "perm_invent,!autopickup,menucolors,time,showexp";

interface Pending {
  id: number;
  request: Exclude<GameRequest, { kind: "key" } | { kind: "poskey" }>;
}

export function App() {
  const [sheet, setSheet] = useState<TileSheet | null>(null);
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState<Pending | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cell, setCell] = useState(savedCell);
  // non-zero only while the core waits for a command with no keys queued
  const inventoryKey = useRef(0);
  const pendingPick = useRef<string | null>(null);

  const client = useMemo(
    () =>
      new GameClient({
        events: (events) => setState((s) => applyEvents(s, events)),
        request: (id, request) => {
          // a pick is for the menu the inventory key opens next, or nothing
          const letter = pendingPick.current;
          pendingPick.current = null;
          if (request.kind === "key" || request.kind === "poskey") {
            inventoryKey.current = request.kind === "poskey" ? request.inventoryKey : 0;
            return;
          }
          inventoryKey.current = 0;
          if (letter && request.kind === "menu") {
            const item = request.items.find((i) => i.identifier !== 0 && i.accelerator === letter);
            if (item) {
              client.answer(id, { kind: "menu", selection: [{ identifier: item.identifier, count: -1 }] });
              return;
            }
          }
          setPending({ id, request });
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
    const onKey = (e: KeyboardEvent) => {
      if (!playing || pending) return;
      const code = keyCode(e);
      if (code === null) return;
      e.preventDefault();
      inventoryKey.current = 0;
      setState(nextBatch);
      client.key(code);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, pending, client]);

  const answer = (a: Answer) => {
    if (!pending) return;
    client.answer(pending.id, a);
    setPending(null);
  };

  const chooseItem = (letter: string) => {
    const key = inventoryKey.current;
    if (!key || pending) return;
    inventoryKey.current = 0;
    pendingPick.current = letter;
    setState(nextBatch);
    client.key(key);
  };

  const start = (name: string) => {
    setPlaying(true);
    client.start({
      assetBase: new URL("./", document.baseURI).href,
      options: `name:${name},${BASE_OPTIONS}`,
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
          describe={(x, y) => client.describe(x, y)}
          onZoom={(step) => {
            const next = MAP_CELLS[Math.min(MAP_CELLS.length - 1, Math.max(0, MAP_CELLS.indexOf(cell) + step))];
            setCell(next);
            try {
              localStorage.setItem(ZOOM_KEY, String(next));
            } catch {}
          }}
          onClick={(x, y, button) => {
            if (pending) return;
            inventoryKey.current = 0;
            setState(nextBatch);
            client.click(x, y, button);
          }}
        />
      </div>
      <InventoryView items={state.inventory} sheet={sheet} onChoose={chooseItem} />
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
      {pending ? <PendingDialog pending={pending} sheet={sheet} answer={answer} /> : null}
    </div>
  );
}

function PendingDialog({ pending, sheet, answer }: { pending: Pending; sheet: TileSheet; answer(a: Answer): void }) {
  const r = pending.request;
  switch (r.kind) {
    case "yn":
      return (
        <YesNoDialog
          query={r.query}
          choices={r.choices}
          defaultChoice={r.defaultChoice}
          onDone={(key) => answer({ kind: "yn", key: key ?? "\x1b" })}
        />
      );
    case "getlin":
      return <InputDialog query={r.query} onDone={(text) => answer({ kind: "getlin", text })} />;
    case "menu":
      return (
        <MenuDialog
          key={pending.id}
          how={r.how}
          prompt={r.prompt}
          items={r.items}
          sheet={sheet}
          onDone={(selection) => answer({ kind: "menu", selection })}
        />
      );
    case "text":
      return <TextDialog lines={r.lines} onDone={() => answer({ kind: "text" })} />;
    case "ext_cmd":
      return <ExtCommandDialog commands={r.commands} onDone={(index) => answer({ kind: "ext_cmd", index })} />;
    case "player":
      return <PlayerDialog choices={r.choices} sheet={sheet} onDone={(pick) => answer({ kind: "player", ...pick })} />;
  }
}
