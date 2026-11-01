// Plays a recording for the page: at a chosen speed, pausing, stepping a turn
// at a time, and seeking by playing again from the start without showing it.
import { applyEvents, initialState } from "../port/state";
import type { GameEvent, GameRequest, ReplayControl, ReplayMessage, ReplayProgress } from "../protocol";
import { type BootCore, never, replay } from "./replayer";

// prompts flash up to 1×; faster, only what they did shows
const FLASH_UP_TO = 2;
const FLASH_MS = 700;
const DELAY_MS = 50;
// at full speed the core never gives the worker back otherwise, so controls would wait for the session's end
const YIELD_EVERY_MS = 30;
// a browser can't redraw the map for every event at speed, and falls far behind trying
const SEND_EVERY_MS = 30;

export interface RunnerPage {
  events(events: GameEvent[]): void;
  replay(message: ReplayMessage): void;
}

export class ReplayRunner {
  /** Which playing-through this is; a seek starts another, and the ones before it stop answering. */
  private run = 0;
  private playing = true;
  private stepping = false;
  private seekTo: number | null = null;
  private turn = 0;
  private state = initialState();
  private ended: ReplayProgress["ended"] = null;
  /** Paces waiting for play to go on, woken by any control, each checking whether it's still wanted. */
  private waiting: (() => void)[] = [];
  private yielded = 0;
  private sleeping = 0;
  /** What the page hasn't been sent yet, at speeds that send only now and then. */
  private held: GameEvent[] = [];
  private sent = 0;

  constructor(
    private readonly text: string,
    /**
     * Boots cores for one playing-through; a new one is asked for at each seek.
     * `current` says whether that playing-through is still wanted, for a core
     * that finishes loading after a seek or stop not to start.
     */
    private readonly boot: (current: () => boolean) => BootCore,
    private readonly page: RunnerPage,
    private turnsPerSecond: number,
    private readonly bones?: (hash: string) => Uint8Array | undefined,
  ) {}

  /** Nothing more will happen until a control comes: no timer is running, and a pace is waiting for play to go on. */
  get idle(): boolean {
    return this.sleeping === 0 && this.waiting.length > 0;
  }

  start(): void {
    this.begin();
  }

  /** Stops for good: every core is left waiting, never answered again. */
  stop(): void {
    this.run++;
    const waiting = this.waiting;
    this.waiting = [];
    for (const wake of waiting) wake();
  }

  control(control: ReplayControl): void {
    this.sendHeld();
    switch (control.action) {
      case "play":
        if (this.ended) {
          this.seekTo = null;
          this.begin();
        }
        this.playing = true;
        break;
      case "pause":
        this.playing = false;
        break;
      case "step":
        if (this.ended) return;
        this.stepping = true;
        this.playing = true;
        break;
      case "speed":
        this.turnsPerSecond = control.turnsPerSecond;
        break;
      case "seek":
        this.seekTo = control.turn;
        this.playing = false;
        this.begin();
        break;
    }
    const waiting = this.waiting;
    this.waiting = [];
    for (const wake of waiting) wake();
    this.sendProgress();
  }

  private begin(): void {
    const run = ++this.run;
    this.turn = 0;
    this.stepping = false;
    // the page has the game's frame up already; the cores' own start-up comes as events
    this.state = { ...initialState(), started: true };
    this.ended = null;
    this.page.replay({ type: "replay_state", state: this.state });
    // a prompt flashing when the last playing-through was replaced
    this.page.replay({ type: "replay_prompt", request: null });
    replay(this.text, this.boot(() => run === this.run), {
      post: (events) => this.post(run, events),
      pace: (at) => this.pace(run, at),
      delay: () => this.delay(run),
      bones: this.bones,
    }).then(
      () => this.end(run, null),
      (e: unknown) => this.end(run, e instanceof Error ? e.message : String(e)),
    );
    this.progress();
  }

  private post(run: number, events: GameEvent[]): void {
    if (run !== this.run) return;
    this.state = applyEvents(this.state, events);
    if (this.seekTo !== null) return;
    if (this.turnsPerSecond > FLASH_UP_TO) this.held.push(...events.filter((e) => e.type !== "bell"));
    else this.page.events(events);
  }

  private async delay(run: number): Promise<void> {
    if (this.seekTo === null && this.turnsPerSecond <= FLASH_UP_TO) await this.sleep(DELAY_MS);
    else await this.breathe();
    if (run !== this.run) return never();
  }

  private async pace(run: number, at: { turn?: number; request?: GameRequest }): Promise<void> {
    if (run !== this.run) return never();
    if (at.turn !== undefined) {
      this.turn = at.turn;
      if (this.seekTo !== null && at.turn >= this.seekTo) this.arrive();
      else if (this.stepping) {
        this.stepping = false;
        this.playing = false;
      }
      this.progress();
    }
    if (this.seekTo !== null || !Number.isFinite(this.turnsPerSecond)) {
      if (this.seekTo === null && Date.now() - this.sent >= SEND_EVERY_MS) this.send();
      await this.breathe();
      if (run !== this.run) return never();
      if (this.seekTo !== null) return;
    } else if (at.turn !== undefined) {
      if (this.turnsPerSecond > FLASH_UP_TO) this.send();
      await this.sleep(1000 / this.turnsPerSecond);
      if (run !== this.run) return never();
    }
    await this.untilPlaying(run);
    if (at.request && this.turnsPerSecond <= FLASH_UP_TO) {
      this.page.replay({ type: "replay_prompt", request: at.request });
      await this.sleep(FLASH_MS);
      if (run !== this.run) return never();
      this.page.replay({ type: "replay_prompt", request: null });
      // a pause during the flash holds the answer back
      await this.untilPlaying(run);
    }
  }

  private async untilPlaying(run: number): Promise<void> {
    if (!this.playing) this.send();
    while (!this.playing) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
      if (run !== this.run) return never();
    }
  }

  /** Lets the worker see the page's messages now and then while the core runs flat out. */
  private async breathe(): Promise<void> {
    if (Date.now() - this.yielded < YIELD_EVERY_MS) return;
    await this.sleep(0);
    this.yielded = Date.now();
  }

  private async sleep(ms: number): Promise<void> {
    this.sleeping++;
    await new Promise((resolve) => setTimeout(resolve, ms));
    this.sleeping--;
  }

  /** A seek has reached its turn: show all it skipped, and wait there. */
  private arrive(): void {
    this.seekTo = null;
    this.playing = false;
    this.page.replay({ type: "replay_state", state: this.state });
  }

  private end(run: number, error: string | null): void {
    if (run !== this.run) return;
    if (this.seekTo !== null) this.arrive();
    if (error) console.warn("the replay stopped", error);
    this.ended = { error };
    this.playing = false;
    this.stepping = false;
    this.progress();
  }

  private sendHeld(): void {
    if (!this.held.length) return;
    this.page.events(this.held);
    this.held = [];
  }

  private send(): void {
    this.sendHeld();
    this.sendProgress();
    this.sent = Date.now();
  }

  private progress(): void {
    if (this.seekTo !== null || !this.playing || this.ended || this.turnsPerSecond <= FLASH_UP_TO) this.send();
  }

  private sendProgress(): void {
    this.page.replay({
      type: "replay_progress",
      progress: { turn: this.turn, playing: this.playing, seeking: this.seekTo !== null, ended: this.ended },
    });
  }
}
