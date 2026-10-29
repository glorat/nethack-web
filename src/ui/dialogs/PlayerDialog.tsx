import { useLayoutEffect, useState } from "preact/hooks";
import { ALIGNS, GENDERS, randomPick, withRace, withRole } from "../../port/player";
import type { PlayerChoices, PlayerPick } from "../../protocol";
import { tileStyle, type TileSheet } from "../../tiles";

const ICON = 32;
const FEMALE = 1;

interface Props {
  choices: PlayerChoices;
  sheet: TileSheet;
  onDone(pick: PlayerPick): void;
}

export function PlayerDialog({ choices, sheet, onDone }: Props) {
  const [pick, setPick] = useState(() => randomPick(choices));
  const female = pick.gender === FEMALE;

  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      onDone(pick);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div class="dialog-backdrop">
      <div class="dialog player-dialog" role="dialog" aria-label="Choose your character">
        <div class="dialog-title">Choose your character</div>
        <div class="player-lists">
          <div class="player-list" role="listbox" aria-label="Role">
            {choices.roles.map((r, ro) => (
              <button
                role="option"
                aria-selected={ro === pick.role}
                class={ro === pick.role ? "player-item selected" : "player-item"}
                onClick={() => setPick(withRole(choices, pick, ro))}
              >
                <span class="player-icon" style={tileStyle(sheet, female ? r.femaleTile : r.tile, ICON)} />
                {female ? r.femaleName : r.name}
              </button>
            ))}
          </div>
          <div class="player-list" role="listbox" aria-label="Race">
            {choices.races.map((r, ra) => (
              <button
                role="option"
                aria-selected={ra === pick.race}
                class={ra === pick.race ? "player-item selected" : "player-item"}
                disabled={!choices.validRace[pick.role][ra]}
                onClick={() => setPick(withRace(choices, pick, ra))}
              >
                <span class="player-icon" style={tileStyle(sheet, female ? r.femaleTile : r.tile, ICON)} />
                {r.name}
              </button>
            ))}
          </div>
        </div>
        <Choice
          label="Gender"
          names={GENDERS}
          value={pick.gender}
          allowed={choices.validGender[pick.role][pick.race]}
          onChange={(gender) => setPick({ ...pick, gender })}
        />
        <Choice
          label="Alignment"
          names={ALIGNS}
          value={pick.align}
          allowed={choices.validAlign[pick.role][pick.race]}
          onChange={(align) => setPick({ ...pick, align })}
        />
        <div class="dialog-buttons">
          <button onClick={() => setPick(randomPick(choices))}>Random</button>
          <button class="primary" onClick={() => onDone(pick)}>
            Play
          </button>
        </div>
      </div>
    </div>
  );
}

function Choice(props: { label: string; names: string[]; value: number; allowed: boolean[]; onChange(i: number): void }) {
  return (
    <div class="player-choice" role="radiogroup" aria-label={props.label}>
      <span class="player-choice-label">{props.label}</span>
      {props.names.map((name, i) => (
        <button
          role="radio"
          aria-checked={i === props.value}
          class={i === props.value ? "selected" : undefined}
          disabled={!props.allowed[i]}
          onClick={() => props.onChange(i)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
