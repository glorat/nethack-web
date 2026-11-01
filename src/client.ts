import type {
  Answer,
  GameEvent,
  GameRequest,
  ReplayControl,
  ReplayMessage,
  ShadowStatus,
  StartOptions,
  UiMessage,
  WorkerMessage,
} from "./protocol";

export interface DebugFiles {
  files: Record<string, Uint8Array>;
  bones: Record<string, Uint8Array>;
}

export interface ClientHandlers {
  events(events: GameEvent[]): void;
  request(id: number, request: GameRequest): void;
  replay?(message: ReplayMessage): void;
  seedWanted?(id: number): void;
}

/** Main-thread handle on the game worker. */
export class GameClient {
  private readonly worker: Worker;
  private readonly descriptions = new Map<number, (text: string | null) => void>();
  private nextDescribeId = 1;
  private readonly debugFiles = new Map<number, (files: DebugFiles) => void>();

  constructor(handlers: ClientHandlers) {
    this.worker = new Worker(new URL("./worker/worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const msg = ev.data;
      if (msg.type === "events") handlers.events(msg.events);
      else if (msg.type === "request") handlers.request(msg.id, msg.request);
      else if (msg.type === "description") {
        this.descriptions.get(msg.id)?.(msg.text);
        this.descriptions.delete(msg.id);
      } else if (msg.type === "debug_files") {
        this.debugFiles.get(msg.id)?.({ files: msg.files, bones: msg.bones });
        this.debugFiles.delete(msg.id);
      } else if (msg.type === "seed_request") handlers.seedWanted?.(msg.id);
      else if (msg.type !== "shadow_status") handlers.replay?.(msg);
    };
    this.worker.onerror = (ev) => handlers.events([{ type: "error", text: ev.message || "worker failed" }]);
  }

  private send(msg: UiMessage): void {
    this.worker.postMessage(msg);
  }

  start(start: StartOptions): void {
    this.send({ type: "start", start });
  }

  /** Plays a recorded game instead of a new one. */
  replay(assetBase: string, text: string, turnsPerSecond: number): void {
    this.send({ type: "replay", assetBase, text, turnsPerSecond });
  }

  replayControl(control: ReplayControl): void {
    this.send({ type: "replay_control", control });
  }

  key(code: number): void {
    this.send({ type: "key", code });
  }

  click(x: number, y: number, button: number): void {
    this.send({ type: "click", x, y, button });
  }

  /** Switches the core's ascii_map option, as its options menu would. */
  asciiMap(on: boolean): void {
    this.send({ type: "ascii_map", on });
  }

  answer(id: number, answer: Answer): void {
    this.send({ type: "answer", id, answer });
  }

  seedReply(id: number, seed: number, now: number): void {
    this.send({ type: "seed_reply", id, seed, now });
  }

  /** What farlook would say about a map square; null outside play. */
  describe(x: number, y: number): Promise<string | null> {
    const id = this.nextDescribeId++;
    this.send({ type: "describe", id, x, y });
    return new Promise((resolve) => this.descriptions.set(id, resolve));
  }

  /** The game's files, and the bones with these hashes, for a debug package. */
  files(hashes: string[]): Promise<DebugFiles> {
    const id = this.nextDescribeId++;
    this.send({ type: "debug_files", id, hashes });
    return new Promise((resolve) => this.debugFiles.set(id, resolve));
  }
}

/** Main-thread handle on a second core, following the game by its recording. */
export class ShadowClient {
  private readonly worker = new Worker(new URL("./worker/worker.ts", import.meta.url), { type: "module" });

  constructor(assetBase: string, status: (status: ShadowStatus) => void) {
    this.worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      if (ev.data.type === "shadow_status") status(ev.data.status);
    };
    this.worker.onerror = (ev) => status({ state: "mismatch", turn: 0, message: ev.message || "the shadow's worker failed" });
    this.worker.postMessage({ type: "shadow", assetBase } satisfies UiMessage);
  }

  before(text: string): void {
    this.worker.postMessage({ type: "shadow_before", text } satisfies UiMessage);
  }

  lines(lines: string[], atPrompt: boolean): void {
    this.worker.postMessage({ type: "shadow_lines", lines, atPrompt } satisfies UiMessage);
  }
}
