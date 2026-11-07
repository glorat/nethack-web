import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { GameClient, ShadowClient } from "../client";
import { WIKI_URL } from "../port/describe";
import { commandToRun, listCommands } from "../port/extcmd";
import { ArrowChords, keyCode, takeLine, type KeyLike } from "../port/keys";
import { playerName, savedName } from "../port/name";
import { BASE_OPTIONS, configFile, keptOption, OPTIONS_KEY, savedOptions, savedOptionsFile, saveOptions as keepOptions } from "../port/options";
import { applyEvents, initialState, nextBatch } from "../port/state";
import { biggerTextSize, DEFAULT_TEXT_SIZE, nearestTextSize, smallerTextSize, textSizeFromOptions } from "../port/textsize";
import type { Answer, GameRequest, ReplayProgress, ShadowStatus } from "../protocol";
import { buildDebugPackage, debugPackageName, namedBones } from "../port/debug-package";
import { homeAddress, keepLastMode, placeOf, playAddress } from "../port/modes";
import { lastGame } from "../offline/last-game";
import { offlineMode } from "../offline/ui/mode";
import { downloadRecording, downloadText, lastTurnIn, replayable } from "../port/recording";
import { shadowWanted } from "../port/shadow";
import { onlineMode } from "../online/ui/mode";
import { watchedGame } from "../online/results";
import { type Chapter, loadChapters, startingPoint } from "../online/story";
import { finishedGameRecording } from "../online/server/api";
import { DEFAULT_TILE_SET, importedTileSet, TILE_SETS, type TileSet, tileSetFileName, tileSetNamed } from "../port/tilesets";
import { loadImportedSheet, loadTileSheet, type TileSheet } from "../tiles";
import { forgetTileSet, importedTileSets, keepTileSet, keptThisVisitOnly, tileSetFile } from "./imported-tiles";
import { beep, wakeBeep } from "./beep";
import type { AsciiFont } from "./ascii";
import { AboutDialog } from "./dialogs/AboutDialog";
import { DirectionDialog } from "./dialogs/DirectionDialog";
import { ExtCommandDialog } from "./dialogs/ExtCommandDialog";
import { FontDialog, SIZES } from "./dialogs/FontDialog";
import { GameOverDialog } from "./dialogs/GameOverDialog";
import { InputDialog } from "./dialogs/InputDialog";
import { MenuDialog } from "./dialogs/MenuDialog";
import { GameSettingsDialog } from "./dialogs/GameSettingsDialog";
import { PlayerDialog } from "./dialogs/PlayerDialog";
import { TextDialog } from "./dialogs/TextDialog";
import { YesNoDialog } from "./dialogs/YesNoDialog";
import { EquipmentView } from "./EquipmentView";
import { InventoryView } from "./InventoryView";
import { QuickActions } from "./QuickActions";
import { keyLike } from "./keyevent";
import { type PageMode, SAVED_FAREWELL } from "./mode";
import { MapView } from "./MapView";
import { type BarMenu, MenuBar, type MenuEntry } from "./MenuBar";
import { COMMAND_MENUS, type CommandItem, GAME_MENU, HELP_MENU, WIZARD_MENU } from "./commands";
import { MessageView } from "./MessageView";
import { ReplayBar, REPLAY_SPEEDS } from "./ReplayBar";
import { ShadowBar } from "./ShadowBar";
import { StatsView } from "./StatsView";

const TILE_SET_KEY = "nethack.tileSet";
// before an imported set's name in TILE_SET_KEY, so one named like a shipped set stays the player's
const IMPORTED_PREFIX = "imported:";

function savedTileSet(): TileSet {
  try {
    const saved = localStorage.getItem(TILE_SET_KEY) ?? "";
    if (saved.startsWith(IMPORTED_PREFIX)) return importedTileSet(saved.slice(IMPORTED_PREFIX.length));
    return tileSetNamed(saved) ?? DEFAULT_TILE_SET;
  } catch {
    return DEFAULT_TILE_SET;
  }
}

function sameTileSet(a: TileSet, b: TileSet): boolean {
  return a.file === b.file && !!a.imported === !!b.imported;
}
const MAP_CELLS = [16, 24, 32, 48, 64];
const ZOOM_KEY = "nethack.mapCell";
const DEFAULT_CELL = 32;
// with Cmd or Ctrl, as Cocoa's View menu has them; 0 is back to the starting size
const ZOOM_KEYS: Record<string, -1 | 0 | 1> = { "=": 1, "+": 1, "-": -1, "0": 0 };
const ASCII_KEY = "nethack.asciiMap";
const ASCII_FONT_KEY = "nethack.asciiFont";
const INVENTORY_KEY = "nethack.showInventory";
const TOOLBAR_KEY = "nethack.showToolbar";
const INVENTORY_WIDTH_KEY = "nethack.inventoryWidth";
const TEXT_SIZE_KEY = "nethack.textSize";
// only the game and watch pages load this, so anywhere else is taken as offline, which reaches nothing
const PLACE = placeOf(location.pathname) ?? { mode: "offline", page: "play" };
const LANDING_PATH = homeAddress(PLACE.mode);
keepLastMode(PLACE.mode);
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

function savedShowToolbar(): boolean {
  try {
    return localStorage.getItem(TOOLBAR_KEY) !== "0";
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

function savedAsciiFont(): AsciiFont | null {
  try {
    const font = JSON.parse(localStorage.getItem(ASCII_FONT_KEY) ?? "null");
    // a quote would break the CSS font it goes into
    if (typeof font?.family === "string" && /^[^"\\]+$/.test(font.family) && SIZES.includes(font.size))
      return { family: font.family, size: font.size };
  } catch {}
  return null;
}

function saveAsciiFont(font: AsciiFont | null) {
  try {
    if (font) localStorage.setItem(ASCII_FONT_KEY, JSON.stringify(font));
    else localStorage.removeItem(ASCII_FONT_KEY);
  } catch {}
}

interface Pending {
  id: number;
  request: Exclude<GameRequest, { kind: "key" } | { kind: "poskey" }>;
  /** Text typed ahead into a # or getlin prompt. */
  typed?: string;
}

interface Props {
  /** The recording of the game this page just played, to replay in place of what the address asks for. */
  handedOver?: string;
  /** Replays the game this page just played: this App goes, and another comes with `handedOver`. */
  onReplay(text: string): void;
}

/** Keeps the address naming the chapter the replay was sent to, or nothing once it's sent elsewhere. */
function movedTo(line: number | null): void {
  const address = new URL(location.href);
  for (const name of ["line", "turn", "play"]) address.searchParams.delete(name);
  if (line !== null) address.searchParams.set("line", String(line));
  if (address.href !== location.href) history.replaceState(null, "", address);
}

export function App({ handedOver, onReplay }: Props) {
  // the address asks for a replay, in place of playing: of the last finished game here, or of an online game from the server
  const [watched] = useState(() => (PLACE.mode === "online" && PLACE.page === "watch" ? watchedGame(location.search) : null));
  const [replay, setReplay] = useState<{ text: string | null; loading?: boolean } | null>(() =>
    handedOver !== undefined
      ? { text: handedOver }
      : PLACE.page !== "watch"
        ? null
        : PLACE.mode === "online"
          ? { text: null, loading: !!watched }
          : { text: lastGame() },
  );
  const [chapters, setChapters] = useState<Chapter[]>([]);
  useEffect(() => {
    if (!watched) return;
    loadChapters(watched).then(setChapters, (e) => console.warn("couldn't load the game's chapters", e));
  }, []);
  useEffect(() => {
    if (!watched || handedOver !== undefined) return;
    finishedGameRecording(watched).then(
      (text) => setReplay({ text }),
      (e) => {
        console.warn("couldn't fetch the game to watch", e);
        setReplay({ text: null });
      },
    );
  }, []);
  const [replayProgress, setReplayProgress] = useState<ReplayProgress>({ turn: 0, line: 0, playing: true, seeking: false, ended: null });
  const [replaySpeed, setReplaySpeed] = useState(REPLAY_SPEEDS[0].turnsPerSecond);
  const replayLastTurn = useMemo(() => ((replay?.text && lastTurnIn(replay.text)) || 0), [replay]);
  /** The game's recording, once it has ended. */
  const [recorded, setRecorded] = useState<string | null>(null);
  // a developer's option: a second core follows the game by its recording, to catch one that would replay differently
  const shadow = useRef<ShadowClient | null>(null);
  const shadowRecording = useRef("");
  const [shadowStatus, setShadowStatus] = useState<ShadowStatus | null>(null);
  const [shadowing] = useState(() => !replay && shadowWanted());
  const [notice, setNotice] = useState<string | null>(null);
  const [mode] = useState<PageMode | null>(() => (replay ? null : PLACE.mode === "online" ? onlineMode(setNotice) : offlineMode(setNotice)));
  const [gameLost, setGameLost] = useState(false);
  const unseen = useRef(!!mode?.dropsUnseenKeys);
  const [sheet, setSheet] = useState<TileSheet | null>(null);
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState<Pending | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cell, setCellState] = useState(savedCell);
  const [editingOptions, setEditingOptions] = useState(false);
  const [about, setAbout] = useState(false);
  const [choosingFont, setChoosingFont] = useState(false);
  const [asciiFont, setAsciiFont] = useState(savedAsciiFont);
  // the browser's own dialogs, during which the game hears no keys
  const ownDialog = editingOptions || about || choosingFont;
  /** False if the browser wouldn't keep it, which the editor says. */
  const saveOptions = (text: string | null): boolean => {
    if (text !== null && !keepOptions(text)) return false;
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
  const [showToolbar, setShowToolbarState] = useState(savedShowToolbar);
  const setShowToolbar = (show: boolean) => {
    setShowToolbarState(show);
    try {
      localStorage.setItem(TOOLBAR_KEY, show ? "1" : "0");
    } catch {}
  };
  // what the hero can do where they stand, as of the last command prompt
  const [hereActions, setHereActions] = useState("");
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
  const repeatKey = useRef(0);
  const runCommand = (name: string) => {
    if (!commandKey.current || pendingRef.current) return;
    // as an extended command it would clear the command it repeats
    if (name === "repeat" && repeatKey.current) return sendCode(repeatKey.current);
    pendingCommand.current = name;
    sendCode(commandKey.current);
  };
  // #hereaction, then the action's name for the line it asks for
  const runHereAction = (name: string) => {
    if (!commandKey.current || pendingRef.current) return beep();
    const key = (k: string) => ({ key: k, ctrlKey: false, altKey: false, metaKey: false });
    typeAhead.current.push(...[...name].map(key), key("Enter"));
    runCommand("hereaction");
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
          mode?.events(events);
          for (const e of events) {
            if (e.type === "bell") beep();
            if (e.type === "game_lost") setGameLost(true);
            if (e.type === "text_size") optionsTextSize.current(e.size, e.atStart);
            // a replayed game's options are its player's, not to be kept as this one's
            if (e.type === "options_file" && !replay)
              try {
                localStorage.setItem(OPTIONS_KEY, savedOptionsFile(e.text, BASE_OPTIONS));
              } catch {}
            if (e.type === "keep_option" && !replay) keepOptions(keptOption(savedOptions(), e.option));
            if (e.type === "recording") {
              mode?.finished(e.text);
              setRecorded(e.text);
            }
            if (e.type === "recorded_before") {
              shadowRecording.current = e.text;
              shadow.current?.before(e.text);
            }
            if (e.type === "recorded" && shadow.current) {
              if (e.lines.length) shadowRecording.current += `${e.lines.join("\n")}\n`;
              shadow.current.lines(e.lines, e.atPrompt);
            }
          }
        },
        seedWanted: (id) => {
          void mode?.seed().then((answer) => answer && client.seedReply(id, answer.seed, answer.now));
        },
        request: (id, request) => {
          if (unseen.current) {
            unseen.current = false;
            typeAhead.current = [];
          }
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
            repeatKey.current = request.kind === "poskey" ? request.repeatKey : 0;
            if (request.kind === "poskey" && request.commandKey) setHereActions(request.hereActions);
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
        replay: (message) => {
          if (message.type === "replay_prompt") {
            const r = message.request;
            show(r && r.kind !== "key" && r.kind !== "poskey" ? { id: 0, request: r } : null);
          }
          else if (message.type === "replay_state") setState(message.state);
          else setReplayProgress(message.progress);
        },
      }),
    [],
  );
  useEffect(
    () => () => {
      client.stop();
      shadow.current?.stop();
    },
    [],
  );
  const replayHere = (text: string) => {
    // what leaving the page would have done, and what it still has to do once the replay's page goes
    mode?.closing();
    window.addEventListener("pagehide", () => mode?.closing());
    history.replaceState(null, "", mode!.replayAddress());
    onReplay(text);
  };

  const [tileSet, setTileSetState] = useState(savedTileSet);
  const [imported, setImported] = useState<string[]>([]);
  const listImported = () => importedTileSets().then(setImported);
  useEffect(() => void listImported(), []);
  /** save: chosen in the View menu; tile_file's choice isn't kept, as it is the option's. */
  const setTileSet = (set: TileSet, save: boolean) => {
    setTileSetState(set);
    if (save)
      try {
        localStorage.setItem(TILE_SET_KEY, set.imported ? IMPORTED_PREFIX + set.file : set.file);
      } catch {}
  };
  const say = (text: string) => setState((s) => applyEvents(s, [{ type: "message", text, attr: 0 }]));
  /** forget: the saved choice can't load, so it is replaced, not tried again at every start. */
  const tileSetProblem = (name: string, forget: boolean, why?: string) => {
    say(why ?? `The tile set "${name}" can't be used, so the default tile set is shown instead.`);
    setTileSet(DEFAULT_TILE_SET, forget);
  };
  useEffect(() => {
    // a choice made while this one loads wins, whichever arrives first
    let live = true;
    // the saved choice is forgotten only if the set is gone or broken, not if the browser couldn't be asked this time
    let forget = true;
    const loading = tileSet.imported
      ? tileSetFile(tileSet.file).then(
          (file) => {
            if (!file) throw new Error(`The tile set "${tileSet.file}" isn't in this browser any more, so the default tile set is shown instead.`);
            return loadImportedSheet(tileSet.file, file).catch((e: Error) => {
              throw new Error(`The tile set "${tileSet.file}" can't be used, so the default tile set is shown instead. ${e.message}`);
            });
          },
          () => {
            forget = false;
            throw new Error(`The tile set "${tileSet.file}" couldn't be read from this browser just now, so the default tile set is shown instead.`);
          },
        )
      : loadTileSheet(new URL(`${import.meta.env.BASE_URL}tiles/${tileSet.file}`, location.href).href, tileSet.size);
    loading
      .then((loaded) => live && setSheet(loaded))
      .catch((e) => {
        if (!live) return;
        if (tileSet === DEFAULT_TILE_SET) setState((s) => ({ ...s, error: String(e) }));
        else tileSetProblem(tileSet.file, forget, tileSet.imported ? e.message : undefined);
      });
    return () => {
      live = false;
    };
  }, [tileSet]);
  // tile_file overrides the menu's choice, as the Guidebook says it overrides the default
  useEffect(() => {
    if (state.tileFile === null) return;
    const tileFile = state.tileFile;
    void importedTileSets().then((mine) => {
      const named = tileSetNamed(tileFile, mine);
      if (named) setTileSet(named, false);
      else tileSetProblem(tileSetFileName(tileFile), false);
    });
  }, [state.tileFile]);
  const importInput = useRef<HTMLInputElement>(null);
  const importTileSets = async (files: File[]) => {
    let chosen: string | null = null;
    for (const file of files) {
      const name = file.name;
      try {
        URL.revokeObjectURL((await loadImportedSheet(name, file)).image.src);
      } catch (e) {
        say(`"${name}" can't be used as a tile set. ${(e as Error).message}`);
        continue;
      }
      if (imported.includes(name) && !confirm(`A tile set named "${name}" is already imported. Replace it?`)) continue;
      if (!(await keepTileSet(name, file)))
        say(`This browser isn't keeping files for this site, so the tile set "${name}" will be gone when you close this page.`);
      chosen = name;
    }
    await listImported();
    if (chosen === null) return;
    // the same set again still has to show its new image
    setTileSet(importedTileSet(chosen), !keptThisVisitOnly(chosen));
    if (ascii) toggleAscii?.(false);
  };
  const removeTileSet = async (set: TileSet) => {
    if (!confirm(`Remove the tile set "${set.file}" from this browser?`)) return;
    await forgetTileSet(set.file);
    await listImported();
    if (sameTileSet(tileSet, set)) setTileSet(DEFAULT_TILE_SET, true);
  };

  useEffect(() => {
    const type = (keys: KeyLike[]) => {
      for (const k of keys) {
        if (waitingForKey.current) sendKey(k);
        else typeAhead.current.push(k);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!playing || pendingRef.current || replay) return;
      const k = keyLike(e);
      if (keyCode(k) === null) return;
      e.preventDefault();
      type(chords.current.down(k));
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
    if (state.asciiMap !== null && !replay) saveAscii(state.asciiMap);
  }, [state.asciiMap]);

  // zoom keys, text size keys, Cmd-period and Ctrl-Cmd-S work with a dialog open too, as Cocoa's menu shortcuts do: this listener is
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
      // Cmd-period cancels, as in macOS and iPadOS apps, for keyboards without Esc
      if (e.metaKey && !e.ctrlKey && !e.altKey && e.key === ".") {
        e.preventDefault();
        e.stopImmediatePropagation();
        (e.target ?? window).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
        return;
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
    // but not these, whose first key could destroy a game the player hasn't been asked about yet
    if (pending?.request.kind === "yn" && ["ynr", "yrn"].includes(pending.request.choices)) typeAhead.current = [];
    while (pending && answered.current !== pending.id && typeAhead.current.length) {
      const k = typeAhead.current.shift()!;
      window.dispatchEvent(new KeyboardEvent("keydown", { ...k, cancelable: true }));
    }
  }, [pending]);

  const answer = (a: Answer) => {
    const p = pendingRef.current;
    // a replay answers its prompts itself
    if (!p || replay) return;
    answered.current = p.id;
    client.answer(p.id, a);
    show(null);
  };

  const chooseItem = (letter: string) => {
    const key = inventoryKey.current;
    if (!key || pendingRef.current) return beep();
    setInventoryKey(0);
    setCommandKey(0);
    waitingForKey.current = false;
    pendingPick.current = letter;
    setState(nextBatch);
    client.key(key);
  };

  useEffect(() => {
    const closing = () => mode?.closing();
    window.addEventListener("pagehide", closing);
    return () => window.removeEventListener("pagehide", closing);
  }, []);

  const start = async (name: string) => {
    wakeBeep();
    setPlaying(true);
    const assetBase = new URL(import.meta.env.BASE_URL, location.href).href;
    const options = `name:${name}`;
    const config = configFile(`${BASE_OPTIONS}${ascii ? ",ascii_map" : ""}`, savedOptions());
    if (!mode) return;
    const start = await mode.start({ name, assetBase, options, config, shadowed: shadowing });
    if (start) client.start(start);
  };

  useEffect(() => {
    if (replay) {
      if (replay.loading) return;
      // one from the server that can't be had says so instead
      if (!replay.text) {
        if (!watched) location.replace(LANDING_PATH);
      } else if (sheet && !playing) {
        setPlaying(true);
        client.replay(new URL(import.meta.env.BASE_URL, location.href).href, replay.text, replaySpeed);
        // a link to a moment in the game
        const start = watched ? startingPoint(location.search) : null;
        if (start) client.replayControl({ action: "seek", ...start });
      }
      return;
    }
    const name = playerName(new URLSearchParams(location.search).get("name") ?? savedName());
    if (!name) location.replace(LANDING_PATH);
    else if (sheet && !playing) {
      if (shadowing) shadow.current = new ShadowClient(new URL(import.meta.env.BASE_URL, location.href).href, setShadowStatus);
      void start(name);
    }
  }, [sheet, replay]);

  // replace: Back from the landing page shouldn't start another game
  useEffect(() => {
    if (replay || state.gameOver !== SAVED_FAREWELL) return;
    void mode?.leaving().then(() => location.replace(LANDING_PATH));
  }, [state.gameOver]);

  // absent until the core has read its options, which would overrule a switch made before; and in a replay,
  // where the switch is part of the recording
  const toggleAscii = state.status.BL_TITLE && !replay
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
      disabled: !commanding || ownDialog,
      run: () => runCommand(item.command),
    };
  const menus: BarMenu[] = [
    {
      title: "Game",
      entries: [
        ...GAME_MENU.slice(0, 1).map(command),
        // not over a question, whose keys the editor's text would answer
        { title: "Game Settings…", disabled: !!pending || ownDialog, run: () => setEditingOptions(true) },
        ...GAME_MENU.slice(1).map(command),
        null,
        {
          title: "New Game",
          disabled: !replay && state.gameOver === null,
          // a new online game is chosen at home, where its time zone is
          run: () => (replay ? location.assign(PLACE.mode === "online" ? LANDING_PATH : playAddress("offline")) : location.reload()),
        },
      ],
    },
    {
      title: "View",
      entries: [
        { title: "Use ASCII Mode", checked: ascii, disabled: !toggleAscii, run: () => toggleAscii?.(!ascii) },
        ...[...TILE_SETS, ...imported.map(importedTileSet)].map((set) => ({
          title: set.imported ? (keptThisVisitOnly(set.file) ? `${set.file} (until you close this page)` : set.file) : `${set.title} Tiles`,
          checked: !ascii && sameTileSet(set, tileSet),
          indent: true,
          // choosing tiles is choosing to see them, which waits as switching ASCII mode does
          disabled: ascii && !toggleAscii,
          run: () => {
            setTileSet(set, !(set.imported && keptThisVisitOnly(set.file)));
            if (ascii) toggleAscii?.(false);
          },
        })),
        { title: "Import Tile Set…", disabled: ascii && !toggleAscii, run: () => importInput.current?.click() },
        ...(tileSet.imported && !ascii ? [{ title: `Remove "${tileSet.file}"...`, run: () => void removeTileSet(tileSet) }] : []),
        {
          title: "Choose Font…",
          // it switches to ASCII mode, and no question should come up over it
          disabled: (!ascii && !toggleAscii) || (!commanding && state.gameOver === null) || ownDialog,
          run: () => setChoosingFont(true),
        },
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
        { title: showToolbar ? "Hide Toolbar" : "Show Toolbar", run: () => setShowToolbar(!showToolbar) },
      ],
    },
    // only in a debug-mode game, as Cocoa shows it
    ...(wizard ? [...COMMAND_MENUS, WIZARD_MENU] : COMMAND_MENUS).map((menu) => ({ title: menu.title, entries: menu.items.map(command) })),
    {
      title: "Help",
      entries: [
        ...HELP_MENU.map(command),
        null,
        { title: "NetHack Wiki", run: () => window.open(WIKI_URL, "_blank", "noopener") },
        null,
        // only while the game waits for a command or has ended, so no question comes up over it
        { title: "About NetHack", disabled: (!commanding && state.gameOver === null) || ownDialog, run: () => setAbout(true) },
      ],
    },
  ];

  if (state.error) return <div class="fatal">{state.error}</div>;
  if (watched && replay && !replay.loading && !replay.text) {
    return (
      <div class="fatal">
        This game can't be watched. If it ended just now, try again in a few minutes. <a href={LANDING_PATH}>Back to the home page</a>
      </div>
    );
  }
  if (gameLost) {
    return (
      <div class="fatal">
        Sorry, this game can't be brought back. <a href={mode?.newGameAddress()}>Start a new game</a>
      </div>
    );
  }
  if (!sheet) return <div class="loading">Loading tiles…</div>;
  const optionsDialog = editingOptions ? <GameSettingsDialog text={savedOptions()} onDone={saveOptions} /> : null;
  if (!playing) return <div class="loading">Loading…</div>;

  return (
    <div class="app" data-commanding={commanding || undefined}>
      {notice ? (
        <div class="server-waiting" role="status">
          {notice}
        </div>
      ) : null}
      <MenuBar menus={menus} />
      <input
        ref={importInput}
        type="file"
        accept=".png,.bmp,image/png,image/bmp"
        multiple
        hidden
        onChange={(e) => {
          const input = e.currentTarget;
          const files = [...(input.files ?? [])];
          // so choosing the same file again is still a change
          input.value = "";
          void importTileSets(files);
        }}
      />
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
            scale={cell / DEFAULT_CELL}
            asciiFont={asciiFont}
            ascii={ascii}
            onAscii={toggleAscii}
            describe={(x, y) => client.describe(x, y)}
            onZoom={zoom}
            onShowInventory={showInventory ? undefined : () => setShowInventory(true)}
            toolbar={
              showToolbar && !replay && state.gameOver === null ? <QuickActions names={hereActions} onRun={runHereAction} /> : null
            }
            onClick={(x, y, button) => {
              if (pending || state.gameOver !== null || replay) return;
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
        {!replay && state.gameOver !== null && state.gameOver !== SAVED_FAREWELL && !ownDialog ? (
          <GameOverDialog
            text={state.gameOver}
            onNewGame={() => location.reload()}
            onQuit={() => location.replace(LANDING_PATH)}
            onReplay={recorded !== null && replayable(recorded) ? () => replayHere(recorded) : undefined}
          />
        ) : null}
        {optionsDialog}
        {about ? <AboutDialog onClose={() => setAbout(false)} /> : null}
        {choosingFont ? (
          <FontDialog
            font={asciiFont}
            onDone={(font) => {
              setChoosingFont(false);
              if (font === undefined) return;
              setAsciiFont(font);
              saveAsciiFont(font);
              // choosing a font is choosing to see it, as in Cocoa
              if (font && !ascii) toggleAscii?.(true);
            }}
          />
        ) : null}
        {pending ? <PendingDialog pending={pending} sheet={sheet} answer={answer} passOn={(k) => typeAhead.current.unshift(k)} /> : null}
      </div>
      {shadowing ? (
        <ShadowBar
          status={shadowStatus}
          onDownload={async () => {
            const text = recorded ?? shadowRecording.current;
            const { files, bones } = await client.files(namedBones(text));
            const made = { recording: text, files, bones, shadow: shadowStatus };
            downloadText(buildDebugPackage(made), debugPackageName());
          }}
        />
      ) : null}
      {replay?.text ? (
        <ReplayBar
          progress={replayProgress}
          lastTurn={replayLastTurn}
          turnsPerSecond={replaySpeed}
          control={(control) => {
            if (control.action === "speed") setReplaySpeed(control.turnsPerSecond);
            // the address names where the replay was sent only while it's there
            if (control.action === "seek" && "turn" in control) movedTo(null);
            client.replayControl(control);
          }}
          chapters={chapters}
          onChapter={({ line }) => movedTo(line)}
          onDownload={() => downloadRecording(replay.text!)}
          onExit={() => location.replace(LANDING_PATH)}
        />
      ) : null}
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
