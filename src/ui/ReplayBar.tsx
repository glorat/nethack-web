import type { ReplayControl, ReplayProgress } from "../protocol";

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
  onDownload(): void;
  onExit(): void;
}

export function ReplayBar({ progress, lastTurn, turnsPerSecond, control, onDownload, onExit }: Props) {
  const { turn, playing, seeking, ended } = progress;
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
      <input
        type="range"
        aria-label="Turn"
        min={0}
        max={lastTurn}
        value={turn}
        disabled={seeking}
        onChange={(e) => control({ action: "seek", turn: Number((e.target as HTMLInputElement).value) })}
      />
      <span class="replay-turn">
        {seeking ? "Going to turn…" : `Turn ${turn} of ${lastTurn}`}
      </span>
      {ended?.error ? <span class="replay-error">Stopped: the game went differently from its recording ({ended.error})</span> : null}
      {ended && !ended.error ? <span class="replay-done">End of the recording</span> : null}
      <span class="replay-spacer" />
      <button onClick={onDownload}>Download</button>
      <button onClick={onExit}>Exit Replay</button>
    </div>
  );
}
