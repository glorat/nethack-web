import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { type Achievement, earned, grouped, latest, type Shown } from "../achievements";
import { gameWatchAddress } from "../results";
import { loadAchievements } from "../server/api";

const LATEST = 4;

const earnedOn = (at: number) => new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" });

/** The player's achievements from online games, shown once they've earned one: the latest, with the rest a click away. */
export function Achievements({ reload }: { reload: number }) {
  const [list, setList] = useState<Achievement[] | null>(null);
  const [all, setAll] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    loadAchievements().then(
      setList,
      // offline play has to work without the server, so this says nothing
      (e) => console.warn("couldn't load achievements", e),
    );
  }, [reload]);
  if (!list || !earned(list).length) return null;
  const count = earned(list).length;
  return (
    <section class="landing-panel landing-device">
      <h2>
        Your achievements <small>{`${count} of ${list.length} earned`}</small>
      </h2>
      <progress class="achievement-progress" max={list.length} value={count} aria-hidden="true" />
      <ul class="achievements">
        {latest(list, LATEST).map((a) => (
          <Row key={a.id} a={a} />
        ))}
      </ul>
      <button type="button" class="link-button" ref={opener} onClick={() => setAll(true)}>
        See All Achievements
      </button>
      {all ? (
        <AllAchievements
          list={list}
          onClose={() => {
            setAll(false);
            setTimeout(() => opener.current?.focus());
          }}
        />
      ) : null}
    </section>
  );
}

function AllAchievements({ list, onClose }: { list: Achievement[]; onClose(): void }) {
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  const { groups, hidden } = grouped(list);
  return (
    <div class="dialog-backdrop">
      <div class="dialog achievements-dialog" role="dialog" aria-label="Your achievements">
        <div class="dialog-title">{`Your achievements: ${earned(list).length} of ${list.length} earned`}</div>
        {/* a scroller holding links isn't reachable by keyboard unless it's focusable itself */}
        <div class="achievements-groups" tabIndex={0} role="region" aria-label="All achievements">
          {groups.map((g) => (
            <section key={g.name}>
              <h3>
                {g.name} <small>{`${g.items.filter((a) => a.earned).length} of ${g.items.length} earned`}</small>
              </h3>
              <ul class="achievements">
                {g.items.map((a) => (
                  <Row key={a.id} a={a} />
                ))}
              </ul>
            </section>
          ))}
          {hidden ? <p class="hint">{hidden === 1 ? "1 more is hidden until you earn it." : `${hidden} more are hidden until you earn them.`}</p> : null}
        </div>
        <div class="dialog-buttons">
          <button class="primary" autoFocus onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ a }: { a: Shown }) {
  return (
    <li class={a.earned ? "earned" : "locked"}>
      <strong>{a.name}</strong>
      <span>{a.description}</span>
      {a.earned ? (
        <small>
          {`${earnedOn(a.earned.at)}, turn ${a.earned.turn.toLocaleString()} · `}
          <a href={gameWatchAddress(a.earned.game)} aria-label={`Watch the game that earned ${a.name}`}>
            Watch
          </a>
        </small>
      ) : (
        <small>Not yet</small>
      )}
    </li>
  );
}
