import { useLayoutEffect } from "preact/hooks";

interface Props {
  /** What the core said as it ended, such as a farewell. */
  text: string;
  onNewGame(): void;
  onQuit(): void;
}

export function GameOverDialog({ text, onNewGame, onQuit }: Props) {
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // not a key held from closing the last window, which the player pressed before this appeared
      if ((e.key !== "Enter" && e.key !== "Escape") || e.repeat) return;
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
        <div class="dialog-buttons">
          <button onClick={onQuit}>Quit</button>
          <button class="primary" onClick={onNewGame}>
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
