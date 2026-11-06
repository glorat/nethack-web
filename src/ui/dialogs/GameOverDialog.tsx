import { useEffect, useLayoutEffect, useState } from "preact/hooks";
import type { FinishedScore } from "../mode";

interface Scoring {
  startedAt: number;
  expectedMs: number;
  /** Null until it comes. */
  score: FinishedScore | null;
}

interface Props {
  /** What the core said as it ended, such as a farewell. */
  text: string;
  onNewGame(): void;
  onQuit(): void;
  /** Watches the game again; absent until its recording has come, or if it can't replay. */
  onReplay?(): void;
  /** The game's score, for a game that gets one. */
  scoring?: Scoring;
}

/** How far along to show a wait expected to take `expectedMs`: steady until then, then ever slower, never quite done. */
export function waitShown(elapsedMs: number, expectedMs: number): number {
  if (elapsedMs < expectedMs) return (0.9 * elapsedMs) / expectedMs;
  return 0.9 + 0.09 * (1 - Math.exp(-(elapsedMs - expectedMs) / expectedMs));
}

function ScoreWait({ startedAt, expectedMs }: { startedAt: number; expectedMs: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  const shown = Math.round(100 * waitShown(now - startedAt, expectedMs));
  return (
    <div class="score-wait">
      <div id="score-wait-label">Working out your score…</div>
      <div class="meter-bar" role="progressbar" aria-labelledby="score-wait-label" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown}>
        <div class="meter-fill" style={{ width: `${shown}%` }} />
      </div>
    </div>
  );
}

function ScoreLine({ scoring }: { scoring: Scoring }) {
  const { score } = scoring;
  if (!score) return <ScoreWait startedAt={scoring.startedAt} expectedMs={scoring.expectedMs} />;
  if (score.kind === "unscored") return <div class="score-line">This game couldn't be scored.</div>;
  if (score.kind === "later") return <div class="score-line">Your score isn't ready yet. It will appear on the home page.</div>;
  const points = score.points === undefined ? null : `You scored ${score.points.toLocaleString()} ${score.points === 1 ? "point" : "points"}. `;
  return (
    <div class="score-line">
      {points ?? "Your game is scored. "}
      <a href={score.address}>See your game's page</a>
    </div>
  );
}

export function GameOverDialog({ text, onNewGame, onQuit, onReplay, scoring }: Props) {
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // not a key held from closing the last window, which the player pressed before this appeared
      if ((e.key !== "Enter" && e.key !== "Escape") || e.repeat) return;
      // Enter on a link or button is for that, such as the game's page, and for nothing behind the dialog
      if (e.key === "Enter" && e.target instanceof Element && e.target.closest("a, button")) {
        e.stopImmediatePropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Enter") onNewGame();
      else onQuit();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-label="The game is over">
        <div class="dialog-title">The game is over</div>
        <div>{text ? `${text} ` : ""}Start a new game, or quit to the home page.</div>
        {/* there from the start, so what replaces the wait is announced */}
        <div role="status">{scoring ? <ScoreLine scoring={scoring} /> : null}</div>
        <div class="dialog-buttons">
          {onReplay ? <button onClick={onReplay}>Replay</button> : null}
          <button onClick={onQuit}>Quit</button>
          <button class="primary" onClick={onNewGame}>
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
