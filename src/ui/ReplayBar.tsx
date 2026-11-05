import type { ReplayControl, ReplayProgress } from "../protocol";

/** A place in the replay worth jumping to, such as an entry in the game's chronicle. */
export interface ReplayChapter {
  turn: number;
  line: number;
  text: string;
  kind: string;
}

export const REPLAY_SPEEDS = [
  { label: "1×", turnsPerSecond: 2 },
  { label: "4×", turnsPerSecond: 8 },
  { label: "16×", turnsPerSecond: 32 },
  { label: "Max", turnsPerSecond: Infinity },
];

interface Props {
  progress: ReplayProgress;
  lastTurn: number;
  turnsPerSecond: number;
  control(control: ReplayControl): void;
  chapters?: ReplayChapter[];
  /** A chapter chosen, after the replay is told to go there. */
  onChapter?(chapter: ReplayChapter): void;
  onDownload(): void;
  onExit(): void;
}

export function ReplayBar({ progress, lastTurn, turnsPerSecond, control, chapters = [], onChapter, onDownload, onExit }: Props) {
  const { turn, line, playing, seeking, ended } = progress;
  // the last one the replay has gone past
  const current = chapters.reduce((at, c, i) => (c.line < line || (ended && !ended.error) ? i : at), -1);
  const go = (chapter: ReplayChapter) => {
    control({ action: "seek", line: chapter.line });
    onChapter?.(chapter);
  };
  return (
    <div class="replay-bar" role="toolbar" aria-label="Replay">
      <button onClick={() => control({ action: playing ? "pause" : "play" })} disabled={seeking}>
        {playing ? "Pause" : ended ? "Play Again" : "Play"}
      </button>
      <button onClick={() => control({ action: "step" })} disabled={seeking || playing || !!ended}>
        Step
      </button>
      <select
        aria-label="Speed"
        value={String(turnsPerSecond)}
        onChange={(e) => control({ action: "speed", turnsPerSecond: Number((e.target as HTMLSelectElement).value) })}
      >
        {REPLAY_SPEEDS.map((s) => (
          <option value={String(s.turnsPerSecond)}>{s.label}</option>
        ))}
      </select>
      <span class="replay-track">
        <input
          type="range"
          aria-label="Turn"
          min={0}
          max={lastTurn}
          value={turn}
          disabled={seeking}
          onChange={(e) => control({ action: "seek", turn: Number((e.target as HTMLInputElement).value) })}
        />
        {lastTurn > 0
          ? chapters.map((c) => (
              <button
                type="button"
                class={`replay-mark ${c.kind}`}
                style={{ left: `${Math.min(100, (c.turn / lastTurn) * 100)}%` }}
                title={`Turn ${c.turn}: ${c.text}`}
                aria-label={`Go to turn ${c.turn}: ${c.text}`}
                tabIndex={-1}
                disabled={seeking}
                onClick={() => go(c)}
              />
            ))
          : null}
      </span>
      <span class="replay-turn">
        {seeking ? "Going to turn…" : `Turn ${turn} of ${lastTurn}`}
      </span>
      {ended?.error ? <span class="replay-error">This replay is no longer available.</span> : null}
      {ended && !ended.error ? <span class="replay-done">End of the recording</span> : null}
      <span class="replay-spacer" />
      <button onClick={onDownload}>Download</button>
      <button onClick={onExit}>Exit Replay</button>
      {chapters.length ? (
        <div class="replay-chapters" role="group" aria-label="Chapters">
          {chapters.map((c, i) => (
            <button type="button" class={`replay-chapter ${c.kind}`} aria-current={i === current ? "step" : undefined} disabled={seeking} onClick={() => go(c)}>
              <small>T{c.turn}</small> {c.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
