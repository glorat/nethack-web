// The options file's most common settings, as choices for the Game Settings panel.
import { optionSettings, withOption } from "./options";

export interface SettingChoice {
  label: string;
  /** How the file sets it, or null to leave it to the game. */
  option: string | null;
  /** Other ways a file may set it, in lower case. */
  alike?: string[];
}

export interface GameSetting {
  name: string;
  label: string;
  choices: SettingChoice[];
}

export const GAME_SETTINGS: GameSetting[] = [
  {
    name: "tutorial",
    label: "Tutorial",
    choices: [
      { label: "Ask at the start of each game", option: null },
      { label: "Always play it first", option: "tutorial" },
      { label: "Never", option: "!tutorial", alike: ["notutorial"] },
    ],
  },
  {
    name: "number_pad",
    label: "Move with",
    choices: [
      { label: "Letters (h j k l y u b n)", option: null, alike: ["number_pad:0", "!number_pad", "nonumber_pad"] },
      { label: "Number pad", option: "number_pad:1", alike: ["number_pad"] },
      { label: "Number pad, phone layout (1 2 3 on top)", option: "number_pad:3" },
      { label: "Letters, with y and z swapped", option: "number_pad:-1" },
    ],
  },
];

/** The choice the file makes, or what it says instead when that isn't one of them. */
export function chosen(file: string, setting: GameSetting): { choice: SettingChoice } | { written: string } {
  const set = optionSettings(file, setting.name);
  if (set.length > 1) return { written: set.join(", ") };
  const written = set[0]?.replace(/\s+/g, "").toLowerCase() ?? null;
  const choice = setting.choices.find((c) => (c.option?.toLowerCase() ?? null) === written || (written !== null && c.alike?.includes(written)));
  return choice ? { choice } : { written: set[0] };
}

export const choose = (file: string, setting: GameSetting, choice: SettingChoice): string => withOption(file, setting.name, choice.option);
