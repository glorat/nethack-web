import { useLayoutEffect, useState } from "preact/hooks";
import { guidebookText } from "../../port/guidebook";
import {
  ALIGNS,
  GENDERS,
  cycleStage,
  moveChoice,
  nextStage,
  prevStage,
  randomPick,
  randomStage,
  withRace,
  withRole,
  type PlayerFocus,
  type PlayerStage,
} from "../../port/player";
import type { PlayerChoices, PlayerPick } from "../../protocol";
import { beep } from "../beep";
import { tileBox, tileStyle, type TileSheet } from "../../tiles";

const ROLE_KEYS = "abchkmprRstvw";
const RACE_KEYS = "hedgo";
const GENDER_KEYS = ["m", "f"];
const ALIGN_KEYS = ["l", "n", "c"];

const JUMPS: Record<PlayerStage, { key: string; label: string; stage: PlayerStage }[]> = {
  role: [
    { key: "/", label: "Race", stage: "race" },
    { key: '"', label: "Gender", stage: "gender" },
    { key: "[", label: "Alignment", stage: "align" },
  ],
  race: [
    { key: "?", label: "Role", stage: "role" },
    { key: '"', label: "Gender", stage: "gender" },
    { key: "[", label: "Alignment", stage: "align" },
  ],
  gender: [
    { key: "?", label: "Role", stage: "role" },
    { key: "/", label: "Race", stage: "race" },
    { key: "[", label: "Alignment", stage: "align" },
  ],
  align: [
    { key: "?", label: "Role", stage: "role" },
    { key: "/", label: "Race", stage: "race" },
    { key: '"', label: "Gender", stage: "gender" },
  ],
};

const ICON = 32;
const PORTRAIT = 96;
const FEMALE = 1;

interface Props {
  choices: PlayerChoices;
  sheet: TileSheet;
  onDone(pick: PlayerPick): void;
  onQuit(): void;
}

export function PlayerDialog({ choices, sheet, onDone, onQuit }: Props) {
  const [pick, setPick] = useState(() => randomPick(choices));
  const [active, setActive] = useState<PlayerFocus>("role");
  const female = pick.gender === FEMALE;
  const role = choices.roles[pick.role];
  const race = choices.races[pick.race];
  const icon = tileBox(sheet, ICON, ICON);
  const portrait = tileBox(sheet, PORTRAIT, PORTRAIT);

  const go = (next: PlayerPick, from: PlayerStage, advance = true) => {
    setPick(next);
    const following = advance ? nextStage(choices, next, from) : null;
    setActive(following ?? from);
  };
  const chooseRole = (i: number, advance = true) => go(withRole(choices, pick, i), "role", advance);
  const chooseRace = (i: number, advance = true) => go(withRace(choices, pick, i), "race", advance);
  const chooseGender = (i: number, advance = true) => go({ ...pick, gender: i }, "gender", advance);
  const chooseAlign = (i: number, advance = true) => go({ ...pick, align: i }, "align", advance);
  const randomize = (stage: PlayerStage) => go(randomStage(choices, pick, stage), stage);
  const accept = (stage: PlayerStage) => {
    const following = nextStage(choices, pick, stage);
    if (following) setActive(following);
  };
  const back = prevStage(choices, pick, active);
  const escape = () => (back ? setActive(back) : onQuit());
  const randomizeActive = () => randomize(active);

  // layout effect: listen before the dialog is painted, or a fast key press is lost
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (k === "q") {
        handled();
        onQuit();
        return;
      }
      if (k === "Escape") {
        handled();
        escape();
        return;
      }
      if (k === "Tab") {
        handled();
        setActive(cycleStage(choices, pick, active, e.shiftKey));
        return;
      }
      const delta: -1 | 1 | null =
        active === "role" || active === "race"
          ? k === "ArrowUp"
            ? -1
            : k === "ArrowDown"
              ? 1
              : null
          : k === "ArrowLeft"
            ? -1
            : k === "ArrowRight"
              ? 1
              : null;
      if (delta) {
        handled();
        const moved = moveChoice(choices, pick, active, delta);
        if (moved) setPick(moved);
        return;
      }
      if (k.toLowerCase() === "y") {
        handled();
        onDone(pick);
        return;
      }
      if (k === "Enter" || k === " ") {
        handled();
        accept(active);
        return;
      }
      if (k === "*") {
        handled();
        randomize(active);
        return;
      }
      if (active === "role") {
        const i = ROLE_KEYS.indexOf(k);
        if (i >= 0) {
          handled();
          chooseRole(i);
        } else if (k === "/") {
          handled();
          setActive("race");
        } else if (k === '"') {
          handled();
          setActive("gender");
        } else if (k === "[") {
          handled();
          setActive("align");
        } else if (k.length === 1) {
          beep();
        }
      } else if (active === "race") {
        const i = RACE_KEYS.indexOf(k.toLowerCase());
        if (i >= 0 && k.length === 1) {
          handled();
          chooseRace(i);
        } else if (k === "?") {
          handled();
          setActive("role");
        } else if (k === '"') {
          handled();
          setActive("gender");
        } else if (k === "[") {
          handled();
          setActive("align");
        } else if (k.length === 1) {
          beep();
        }
      } else if (active === "gender") {
        const i = GENDER_KEYS.indexOf(k.toLowerCase());
        if (i >= 0 && k.length === 1) {
          handled();
          chooseGender(i);
        } else if (k === "?") {
          handled();
          setActive("role");
        } else if (k === "/") {
          handled();
          setActive("race");
        } else if (k === "[") {
          handled();
          setActive("align");
        } else if (k.length === 1) {
          beep();
        }
      } else if (active === "align") {
        const i = ALIGN_KEYS.indexOf(k.toLowerCase());
        if (i >= 0 && k.length === 1) {
          handled();
          chooseAlign(i);
        } else if (k === "?") {
          handled();
          setActive("role");
        } else if (k === "/") {
          handled();
          setActive("race");
        } else if (k === '"') {
          handled();
          setActive("gender");
        } else if (k.length === 1) {
          beep();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div class="dialog-backdrop">
      <div class="dialog player-dialog" role="dialog" aria-label="Choose your character">
        <div class="dialog-title">Choose your character</div>
        <PlayerActions
          focus={active}
          back={back}
          onJump={(stage) => setActive(stage)}
          onEscape={escape}
          onQuit={onQuit}
        />
        <div class="player-lists">
          <div
            class={active === "role" ? "player-list active" : "player-list"}
            role="listbox"
            aria-label="Role"
            onPointerDown={() => setActive("role")}
            onFocusCapture={() => setActive("role")}
          >
            {choices.roles.map((r, ro) => (
              <button
                role="option"
                aria-selected={ro === pick.role}
                aria-keyshortcuts={ROLE_KEYS[ro]}
                class={ro === pick.role ? "player-item selected" : "player-item"}
                onClick={() => chooseRole(ro, false)}
              >
                <span class="player-key" aria-hidden="true">
                  {ROLE_KEYS[ro]}
                </span>
                <span
                  class="player-icon"
                  style={{ width: `${icon.width}px`, height: `${icon.height}px`, ...tileStyle(sheet, female ? r.femaleTile : r.tile, icon.width, icon.height) }}
                />
                {female ? r.femaleName : r.name}
              </button>
            ))}
          </div>
          <div
            class={active === "race" ? "player-list active" : "player-list"}
            role="listbox"
            aria-label="Race"
            onPointerDown={() => setActive("race")}
            onFocusCapture={() => setActive("race")}
          >
            {choices.races.map((r, ra) => (
              <button
                role="option"
                aria-selected={ra === pick.race}
                aria-keyshortcuts={RACE_KEYS[ra]}
                class={ra === pick.race ? "player-item selected" : "player-item"}
                disabled={!choices.validRace[pick.role][ra]}
                onClick={() => chooseRace(ra, false)}
              >
                <span class="player-key" aria-hidden="true">
                  {RACE_KEYS[ra]}
                </span>
                <span
                  class="player-icon"
                  style={{ width: `${icon.width}px`, height: `${icon.height}px`, ...tileStyle(sheet, female ? r.femaleTile : r.tile, icon.width, icon.height) }}
                />
                {r.name}
              </button>
            ))}
          </div>
          <div class="player-about" aria-live="polite">
            {role ? (
              <span
                class="player-portrait"
                aria-hidden="true"
                style={{ width: `${portrait.width}px`, height: `${portrait.height}px`, ...tileStyle(sheet, female ? role.femaleTile : role.tile, portrait.width, portrait.height) }}
              />
            ) : null}
            <p>{role ? guidebookText(role.name) : null}</p>
            <p>{race ? guidebookText(race.name) : null}</p>
          </div>
        </div>
        <Choice
          label="Gender"
          names={GENDERS}
          keys={GENDER_KEYS}
          value={pick.gender}
          allowed={choices.validGender[pick.role][pick.race]}
          active={active === "gender"}
          onActivate={() => setActive("gender")}
          onChange={(i) => chooseGender(i, false)}
        />
        <Choice
          label="Alignment"
          names={ALIGNS}
          keys={ALIGN_KEYS}
          value={pick.align}
          allowed={choices.validAlign[pick.role][pick.race]}
          active={active === "align"}
          onActivate={() => setActive("align")}
          onChange={(i) => chooseAlign(i, false)}
        />
        <div class="dialog-buttons">
          <button aria-keyshortcuts="*" onClick={randomizeActive}>
            <span class="player-key" aria-hidden="true">
              *
            </span>{" "}
            Random
          </button>
          <button
            class="primary"
            aria-keyshortcuts="y"
            onClick={() => onDone(pick)}
          >
            <span class="player-key" aria-hidden="true">
              y
            </span>{" "}
            Play
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerActions(props: {
  focus: PlayerFocus;
  back: PlayerStage | null;
  onJump(stage: PlayerStage): void;
  onEscape(): void;
  onQuit(): void;
}) {
  const escapeLabel = props.back ? "Back" : "Quit";
  return (
    <div class="player-actions" role="group" aria-label="Character choice actions">
      {JUMPS[props.focus].map((jump) => (
        <button class="player-action" aria-keyshortcuts={jump.key} onClick={() => props.onJump(jump.stage)}>
          <kbd>{jump.key}</kbd> {jump.label}
        </button>
      ))}
      <button class="player-action" aria-keyshortcuts="Escape" onClick={props.onEscape}>
        <kbd>Esc</kbd> {escapeLabel}
      </button>
      <button class="player-action" aria-keyshortcuts="q" onClick={props.onQuit}>
        <kbd>q</kbd> Quit
      </button>
    </div>
  );
}

function Choice(props: {
  label: string;
  names: string[];
  keys: string[];
  value: number;
  allowed: boolean[];
  active: boolean;
  onActivate(): void;
  onChange(i: number): void;
}) {
  return (
    <div
      class={props.active ? "player-choice active" : "player-choice"}
      role="radiogroup"
      aria-label={props.label}
      onPointerDown={props.onActivate}
      onFocusCapture={props.onActivate}
    >
      <span class="player-choice-label">{props.label}</span>
      {props.names.map((name, i) => (
        <button
          role="radio"
          aria-checked={i === props.value}
          aria-keyshortcuts={props.keys[i]}
          class={i === props.value ? "selected" : undefined}
          disabled={!props.allowed[i]}
          onClick={() => props.onChange(i)}
        >
          <span class="player-key" aria-hidden="true">
            {props.keys[i]}
          </span>{" "}
          {name}
        </button>
      ))}
    </div>
  );
}
