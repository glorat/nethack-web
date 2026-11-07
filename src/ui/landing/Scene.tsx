import { ROOM, ROOM_NOTES, SHEET_COLUMNS, TILES, type TileName } from "../../port/scene";

const SHEET = `${import.meta.env.BASE_URL}tiles/tiles64.png`;

/** A tile's place on the sheet, in squares, for a background drawn at the scene's square size. */
const at = (name: TileName) => `calc(var(--square) * ${-(TILES[name] % SHEET_COLUMNS)}) calc(var(--square) * ${-Math.floor(TILES[name] / SHEET_COLUMNS)})`;

/** The room in the game's painted tiles, with notes for a new player on what's in it. */
export function Scene({ notes }: { notes: boolean }) {
  return (
    <div class="scene" role="img" aria-label="A room on the first level: you, a wizard, with your little dog, a newt, some gold, a potion and the stairs down">
      {ROOM.flatMap((row, r) =>
        row.map((square, c) => {
          const [under, over] = Array.isArray(square) ? square : [square];
          return (
            <span
              key={`${r}-${c}`}
              style={{
                backgroundImage: over ? `url(${SHEET}), url(${SHEET})` : `url(${SHEET})`,
                backgroundPosition: over ? `${at(over)}, ${at(under)}` : at(under),
              }}
            />
          );
        }),
      )}
      {notes
        ? ROOM_NOTES.map((n) => (
            <span key={n.text} class={`scene-note${n.below ? " below" : ""}`} style={{ left: `calc(var(--square) * ${n.column + 0.5})`, top: `calc(var(--square) * ${n.below ? n.row + 1 : n.row})` }} aria-hidden="true">
              {n.text}
            </span>
          ))
        : null}
    </div>
  );
}
