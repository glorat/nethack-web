import { useEffect, useLayoutEffect, useState } from "preact/hooks";
import type { FinishedScore } from "../mode";

interface Scoring {
  startedAt: number;
  expectedMs: number;
  /** The points the game itself counted, shown until the score comes. */
  preview?: number;
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

const pointsText = (points: number) => `You scored ${points.toLocaleString()} ${points === 1 ? "point" : "points"}. `;

function ScoreWait({ startedAt, expectedMs, label }: { startedAt: number; expectedMs: number; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  const shown = Math.round(100 * waitShown(now - startedAt, expectedMs));
  return (
    <div class="score-wait">
      <div id="score-wait-label">{label}</div>
      <div class="meter-bar" role="progressbar" aria-labelledby="score-wait-label" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown}>
        <div class="meter-fill" style={{ width: `${shown}%` }} />
      </div>
    </div>
  );
}

function ScoreLine({ scoring }: { scoring: Scoring }) {
  const { score, preview } = scoring;
  if (!score)
    return (
      <>
        {preview === undefined ? null : <div class="score-line">{pointsText(preview)}</div>}
        <ScoreWait startedAt={scoring.startedAt} expectedMs={scoring.expectedMs} label={preview === undefined ? "Working out your score…" : "Confirming your score…"} />
      </>
    );
  if (score.kind === "unscored") return <div class="score-line">This game couldn't be scored.</div>;
  if (score.kind === "later")
    return <div class="score-line">{preview === undefined ? "" : pointsText(preview)}Your score isn't confirmed yet. It will appear on the home page.</div>;
  const points = score.points === undefined ? null : pointsText(score.points);
  return (
    <>
      <div class="score-line">
        {points ?? "Your game is scored. "}
        <a href={score.address}>See your game's page</a>
      </div>
      {score.signIn ? <div class="score-sign-in">It's public as Anonymous. Sign in to put your handle on it.</div> : null}
    </>
  );
}

export function GameOverDialog({ text, onNewGame, onQuit, onReplay, scoring }: Props) {
  const score = scoring?.score;
  const signIn = score?.kind === "scored" ? score.signIn : undefined;
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
          {signIn ? (
            <button class="dialog-left" onClick={() => location.assign(signIn)}>
              Sign In…
            </button>
          ) : null}
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
