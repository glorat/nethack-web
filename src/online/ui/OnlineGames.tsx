import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { ascended, type FinishedGame, outcome, gameWatchAddress } from "../results";
import { deleteFinishedGame, listFinishedGames } from "../server/api";
import { shareAddress } from "../share";
import { Grave } from "../../ui/landing/Grave";

const SHOWN = 10;

const endedOn = (at: number) => new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" });

const described = ({ name, endedAt }: FinishedGame) => `${name}'s game of ${endedOn(endedAt)}`;

/** The player's finished online games, loaded once for the frames that show them. */
export function useFinishedGames(shown: boolean) {
  const [games, setGames] = useState<FinishedGame[] | null>(null);
  useEffect(() => {
    if (!shown) return;
    listFinishedGames().then(
      (found) => setGames(found),
      // offline play has to work without the server, so this says nothing
      (e) => console.warn("couldn't list finished online games", e),
    );
  }, [shown]);
  return [games, setGames] as const;
}

/** The tombstone of the player's latest finished online game that has a result. */
export function LastOnlineGame({ games }: { games: FinishedGame[] | null }) {
  const latest = games?.reduce<FinishedGame | null>((a, g) => (a && a.endedAt >= g.endedAt ? a : g), null);
  if (!latest?.result) return null;
  return (
    <section class="frame landing-device" aria-labelledby="last-online-game">
      <h2 class="frame-label" id="last-online-game">
        Your last game
      </h2>
      <Grave who={latest.name} points={latest.result.points} death={latest.result.death} year={new Date(latest.endedAt).getFullYear()} />
    </section>
  );
}

/** The player's finished online games, with each one's result once the server has replayed it, and a way to delete each. */
export function OnlineGames({ games, onGames, onDeleted }: { games: FinishedGame[] | null; onGames: (update: (games: FinishedGame[] | null) => FinishedGame[] | null) => void; onDeleted: () => void }) {
  const [note, setNote] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  if (!games?.length && !note) return null;
  const gone = (deleted: FinishedGame) => {
    onGames((all) => all!.filter((g) => g.game !== deleted.game));
    setNote(`Deleted ${described(deleted)}. You have a sad feeling for a moment, then it passes.`);
    // the row that held focus has gone
    heading.current?.focus();
    onDeleted();
  };
  return (
    <section class="frame landing-device finished-games" aria-labelledby="finished-games">
      <h2 class="frame-label" id="finished-games" ref={heading} tabIndex={-1}>
        Your finished games
      </h2>
      {/* there from the start, so screen readers announce what it comes to say */}
      <p role="status" class={note ? undefined : "visually-hidden"}>
        {note}
      </p>
      {games?.length ? (
        <ol class="device-scores online-scores">
          {games.slice(0, SHOWN).map((g) => (
            <Row key={g.game} game={g} onDeleted={() => gone(g)} onShared={setNote} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

type Asking = "no" | "sure?" | "deleting" | "unsaved" | "failed";

const PROBLEMS: Partial<Record<Asking, string>> = {
  unsaved: "This game is still being saved. You can delete it in a few minutes.",
  failed: "Couldn't delete this game. Try again.",
};

function Row({ game: g, onDeleted, onShared }: { game: FinishedGame; onDeleted: () => void; onShared: (note: string) => void }) {
  const { game, endedAt, result } = g;
  const [asking, setAsking] = useState<Asking>("no");
  const keep = useRef<HTMLButtonElement>(null);
  const del = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (asking === "sure?") keep.current?.focus();
    else if (asking === "no" && opened.current) del.current?.focus();
    opened.current ||= asking !== "no";
  }, [asking]);
  const deleting = asking === "deleting";
  const remove = () => {
    if (deleting) return;
    setAsking("deleting");
    deleteFinishedGame(game).then(
      (done) => (done === "deleted" ? onDeleted() : setAsking("unsaved")),
      (e) => {
        console.warn("couldn't delete the game", e);
        setAsking("failed");
      },
    );
  };
  const label = described(g);
  return (
    <li class={ascended(result) ? "ascended" : undefined}>
      <strong>{result?.points !== undefined ? result.points.toLocaleString() : "–"}</strong>
      <span>{outcome(g)}</span>
      <small>{endedOn(endedAt)}</small>
      <span class="online-actions">
        <a href={gameWatchAddress(game)} aria-label={`Watch ${label}`}>
          Watch
        </a>
        {result ? <ShareButton game={game} label={label} onShared={onShared} /> : null}
        <button type="button" ref={del} class="row-delete" aria-label={`Delete ${label}`} aria-expanded={asking !== "no"} onClick={() => setAsking("sure?")} disabled={asking !== "no"}>
          Delete
        </button>
      </span>
      {asking === "no" ? null : (
        <div class="row-confirm" role="group" aria-label={`Delete ${label}`}>
          <p>Delete this game? It goes from the site, your achievements and the high scores, and you can't undo it.</p>
          <p role="alert" class={PROBLEMS[asking] ? undefined : "visually-hidden"}>
            {PROBLEMS[asking] ?? ""}
          </p>
          {/* not disabled while deleting, as that would take the focus with it */}
          <button type="button" class="danger" onClick={remove} aria-disabled={deleting}>
            {deleting ? "Deleting…" : "Delete Game"}
          </button>
          <button type="button" ref={keep} onClick={() => !deleting && setAsking("no")} aria-disabled={deleting}>
            Keep It
          </button>
        </div>
      )}
    </li>
  );
}

/** Shares a scored game's link: the device's share sheet where there is one, or else a copy of the link. */
function ShareButton({ game, label, onShared }: { game: string; label: string; onShared: (note: string) => void }) {
  const share = async () => {
    const url = shareAddress(location.origin, game);
    try {
      if (navigator.share) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        onShared(`Copied the link to ${label}.`);
      }
    } catch (e) {
      // closing the share sheet is a choice, not a failure
      if ((e as Error).name !== "AbortError") onShared(`Couldn't share ${label}. Try again.`);
    }
  };
  return (
    <button type="button" class="row-share" aria-label={`Share ${label}`} onClick={() => void share()}>
      Share
    </button>
  );
}
