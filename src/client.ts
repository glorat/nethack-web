import type {
  Answer,
  GameEvent,
  GameRequest,
  ReplayControl,
  ReplayMessage,
  StartOptions,
  UiMessage,
  WorkerMessage,
} from "./protocol";

export interface ClientHandlers {
  events(events: GameEvent[]): void;
  request(id: number, request: GameRequest): void;
  replay?(message: ReplayMessage): void;
}

/** Main-thread handle on the game worker. */
export class GameClient {
  private readonly worker: Worker;
  private readonly descriptions = new Map<number, (text: string | null) => void>();
  private nextDescribeId = 1;

  constructor(handlers: ClientHandlers) {
    this.worker = new Worker(new URL("./worker/worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const msg = ev.data;
      if (msg.type === "events") handlers.events(msg.events);
      else if (msg.type === "request") handlers.request(msg.id, msg.request);
      else if (msg.type === "description") {
        this.descriptions.get(msg.id)?.(msg.text);
        this.descriptions.delete(msg.id);
      } else handlers.replay?.(msg);
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

  /** What farlook would say about a map square; null outside play. */
  describe(x: number, y: number): Promise<string | null> {
    const id = this.nextDescribeId++;
    this.send({ type: "describe", id, x, y });
    return new Promise((resolve) => this.descriptions.set(id, resolve));
  }
}
