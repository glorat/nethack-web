import { useEffect, useState } from "preact/hooks";
import { type Achievement, earned, ordered } from "../achievements";
import { loadAchievements } from "../server/api";

const earnedOn = (at: number) => new Date(at).toLocaleDateString(undefined, { dateStyle: "medium" });

/** The player's achievements from online games, shown once they've earned one. */
export function Achievements() {
  const [list, setList] = useState<Achievement[] | null>(null);
  useEffect(() => {
    loadAchievements().then(
      setList,
      // offline play has to work without the server, so this says nothing
      (e) => console.warn("couldn't load achievements", e),
    );
  }, []);
  if (!list || !earned(list).length) return null;
  return (
    <section class="landing-panel landing-device">
      <h2>
        Your achievements <small>{`${earned(list).length} of ${list.length} earned`}</small>
      </h2>
      <ul class="achievements">
        {ordered(list).map((a, i) => (
          <Row key={"id" in a ? a.id : `hidden-${i}`} a={a} />
        ))}
      </ul>
    </section>
  );
}

function Row({ a }: { a: Achievement }) {
  if ("hidden" in a)
    return (
      <li class="locked">
        <strong>Hidden achievement</strong>
        <span>Shown once earned</span>
      </li>
    );
  return (
    <li class={a.earned ? "earned" : "locked"}>
      <strong>{a.name}</strong>
      <span>{a.description}</span>
      <small>{a.earned ? `${earnedOn(a.earned.at)}, turn ${a.earned.turn.toLocaleString()}` : "Not yet"}</small>
    </li>
  );
}
