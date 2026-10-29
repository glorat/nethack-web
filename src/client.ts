import type { Answer, GameEvent, GameRequest, StartOptions, UiMessage, WorkerMessage } from "./protocol";

export interface ClientHandlers {
  events(events: GameEvent[]): void;
  request(id: number, request: GameRequest): void;
}

/** Main-thread handle on the game worker. */
export class GameClient {
  private readonly worker: Worker;

  constructor(handlers: ClientHandlers) {
    this.worker = new Worker(new URL("./worker/worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const msg = ev.data;
      if (msg.type === "events") handlers.events(msg.events);
      else handlers.request(msg.id, msg.request);
    };
    this.worker.onerror = (ev) => handlers.events([{ type: "error", text: ev.message || "worker failed" }]);
  }

  private send(msg: UiMessage): void {
    this.worker.postMessage(msg);
  }

  start(start: StartOptions): void {
    this.send({ type: "start", start });
  }

  key(code: number): void {
    this.send({ type: "key", code });
  }

  click(x: number, y: number, button: number): void {
    this.send({ type: "click", x, y, button });
  }

  answer(id: number, answer: Answer): void {
    this.send({ type: "answer", id, answer });
  }
}
