import { tombstone } from "../../port/tombstone";

/** The core's tombstone for a finished game, as text. */
export function Grave({ who, points, death, year }: { who: string; points: number | undefined; death: string | undefined; year: number | undefined }) {
  const rows = tombstone({ who, points, death, year });
  return (
    <pre class="grave" role="img" aria-label={[who, points !== undefined ? `${points.toLocaleString("en-US")} points` : "", death, year].filter(Boolean).join(", ")}>
      {rows.map((r) => `${r.before}${r.engraved ?? ""}${r.after ?? ""}`).join("\n")}
    </pre>
  );
}
