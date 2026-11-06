import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { checkOptionsFile, type ConfigProblem } from "../../config-check";
import { choose, chosen, GAME_SETTINGS } from "../../port/game-settings";
import { BASE_OPTIONS, configFile } from "../../port/options";

interface Props {
  text: string;
  /** null to keep the file as it was; false back if the text couldn't be kept. */
  onDone(text: string | null): boolean;
}

export function GameSettingsDialog({ text, onDone }: Props) {
  const [value, setValue] = useState(text);
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problems, setProblems] = useState<ConfigProblem[]>([]);
  const area = useRef<HTMLTextAreaElement>(null);
  const common = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => common.current?.querySelector("select")?.focus(), []);
  // keys typed here are text, not commands for the game, which listens on window
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape" && !e.isComposing && !checking) onDone(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  const edit = (next: string) => {
    setValue(next);
    setProblems([]);
  };
  const problemList = useRef<HTMLDivElement>(null);
  // nothing can change or close the dialog while the core checks the file, so its answer is about what's shown
  const save = async () => {
    setChecking(true);
    const found = await checkOptionsFile(new URL(import.meta.env.BASE_URL, location.href).href, configFile(BASE_OPTIONS, value)).catch(
      (e) => {
        // kept unchecked, as the core will say what's wrong at the start of the next game
        console.warn("couldn't check the options file", e);
        return [];
      },
    );
    setChecking(false);
    if (found.length) {
      setProblems(found);
      requestAnimationFrame(() => problemList.current?.querySelector("button")?.focus());
      return;
    }
    setFailed(!onDone(value));
  };
  const showLine = (line: number) => {
    const el = area.current;
    if (!el) return;
    const lines = value.split("\n");
    const start = lines.slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
    el.focus();
    el.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  };
  return (
    <div class="dialog-backdrop">
      <div class="dialog settings-dialog" role="dialog" aria-label="Game Settings">
        <div class="dialog-title">Game Settings</div>
        <div class="settings-body">
          <div class="settings-common" ref={common}>
            {GAME_SETTINGS.map((setting) => {
              const now = chosen(value, setting);
              return (
                <label class="setting" key={setting.name}>
                  <span class="setting-label">{setting.label}</span>
                  <select
                    disabled={checking}
                    value={"choice" in now ? setting.choices.indexOf(now.choice) : -1}
                    onChange={(e) => edit(choose(value, setting, setting.choices[Number((e.target as HTMLSelectElement).value)]))}
                  >
                    {"written" in now ? (
                      <option value={-1} disabled>
                        As in the file: {now.written}
                      </option>
                    ) : null}
                    {setting.choices.map((choice, i) => (
                      <option key={choice.label} value={i}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          <label class="settings-file">
            <span class="setting-label">Options file</span>
            <textarea ref={area} class="options-text" spellcheck={false} wrap="off" readOnly={checking} value={value} onInput={(e) => edit((e.target as HTMLTextAreaElement).value)} />
          </label>
        </div>
        {problems.length ? (
          <div class="settings-problems" role="alert" aria-label="What's wrong with the options file" ref={problemList}>
            <ul>
              {problems.map((p, i) =>
                p.line === null ? (
                  <li key={i}>{p.message}.</li>
                ) : (
                  <li key={i}>
                    <button type="button" class="link-inline" onClick={() => showLine(p.line!)}>
                      Line {p.line}
                    </button>
                    : {p.message}.
                  </li>
                ),
              )}
            </ul>
          </div>
        ) : null}
        <div class="dialog-buttons">
          <span class="hint">
            {failed
              ? "This browser won't keep the file; copy it somewhere safe."
              : problems.length
                ? "Fix these lines to save."
                : "Changes take effect when you start a new game."}
          </span>
          <button disabled={checking} onClick={() => onDone(null)}>Cancel</button>
          <button class="primary" disabled={checking} onClick={() => void save()}>
            {checking ? "Checking…" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
