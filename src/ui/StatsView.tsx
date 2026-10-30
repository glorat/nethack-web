import { conditionSeverity, encumbranceSeverity, hungerSeverity, type Severity } from "../port/badges";
import type { StatusValue } from "../protocol";
import { nhColor } from "./colors";

const CONDITION_LABELS: Record<string, string> = {
  BAREH: "Bare-handed", BLIND: "Blind", BUSY: "Busy", CONF: "Confused", DEAF: "Deaf",
  ELF_IRON: "Iron", FLY: "Flying", FOODPOIS: "Food poisoned", GLOWHANDS: "Glowing hands",
  GRAB: "Grabbed", HALLU: "Hallucinating", HELD: "Held", ICY: "Icy", INLAVA: "In lava",
  LEV: "Levitating", PARLYZ: "Paralyzed", RIDE: "Riding", SLEEPING: "Asleep", SLIME: "Slimed",
  SLIPPERY: "Slippery", STONE: "Stoning", STRNGL: "Strangled", STUN: "Stunned",
  SUBMERGED: "Underwater", TERMILL: "Ill", TETHERED: "Tethered", TRAPPED: "Trapped",
  UNCONSC: "Unconscious", WOUNDEDL: "Wounded legs", HOLDING: "Holding",
};

// the gold field is "<encoded gold glyph>:<amount>"; the glyph is "\G" plus 8 hex digits
function clean(text: string | undefined): string {
  return (text ?? "").replace(/\\G[0-9a-fA-F]{8}:?/g, "").trim();
}

function value(fields: Record<string, StatusValue>, name: string): string {
  return clean(fields[name]?.text);
}

function Meter({ label, cur, max, kind }: { label: string; cur: string; max: string; kind: string }) {
  const c = Number(cur);
  const m = Number(max);
  const pct = m > 0 ? Math.max(0, Math.min(100, (c / m) * 100)) : 0;
  const low = m > 0 && c / m < 1 / 3;
  return (
    <div class={`meter ${kind}${low ? " low" : ""}`}>
      <span class="meter-label">{label}</span>
      <div class="meter-bar">
        <div class="meter-fill" style={{ width: `${pct}%` }} />
        <span class="meter-text">{cur}({max})</span>
      </div>
    </div>
  );
}

export function StatsView({ fields }: { fields: Record<string, StatusValue> }) {
  if (!fields.BL_TITLE) return <div class="stats" />;
  const stat = (label: string, name: string) => {
    const change = fields[name]?.change;
    return (
      <div class="stat">
        <span class="stat-label">{label}</span>
        <span class="stat-value" style={{ color: nhColor(fields[name]?.color ?? 8) }}>
          {value(fields, name)}
          {change ? (
            <span
              class={`stat-change ${change.improved ? "better" : "worse"}`}
              role="img"
              aria-label={`${change.direction > 0 ? "up" : "down"}, ${change.improved ? "better" : "worse"}`}
            >
              {change.direction > 0 ? "↑" : "↓"}
            </span>
          ) : null}
        </span>
      </div>
    );
  };
  const conditions = (fields.BL_CONDITION?.text ?? "").split(" ").filter(Boolean);
  const hunger = value(fields, "BL_HUNGER");
  const encumbrance = value(fields, "BL_CAP");
  const badges = conditions.map((c): [string, Severity] => [CONDITION_LABELS[c] ?? c, conditionSeverity(c)]);
  if (encumbrance) badges.unshift([encumbrance, encumbranceSeverity(encumbrance)]);
  if (hunger) badges.unshift([hunger, hungerSeverity(hunger)]);
  const exp = value(fields, "BL_EXP");
  return (
    <div class="stats">
      <div class="stats-title">{value(fields, "BL_TITLE")}</div>
      <div class="stats-sub">
        {value(fields, "BL_ALIGN")} · {value(fields, "BL_LEVELDESC")}
      </div>
      <Meter label="HP" cur={value(fields, "BL_HP")} max={value(fields, "BL_HPMAX")} kind="hp" />
      <Meter label="Pw" cur={value(fields, "BL_ENE")} max={value(fields, "BL_ENEMAX")} kind="pw" />
      <div class="stat-grid">
        {stat("St", "BL_STR")}
        {stat("Dx", "BL_DX")}
        {stat("Co", "BL_CO")}
        {stat("In", "BL_IN")}
        {stat("Wi", "BL_WI")}
        {stat("Ch", "BL_CH")}
        {stat("AC", "BL_AC")}
        {stat(fields.BL_HD?.text ? "HD" : "XL", fields.BL_HD?.text ? "BL_HD" : "BL_XP")}
        {stat("$", "BL_GOLD")}
        {exp ? stat("Exp", "BL_EXP") : null}
        {fields.BL_TIME?.text ? stat("T", "BL_TIME") : null}
        {fields.BL_SCORE?.text ? stat("Score", "BL_SCORE") : null}
      </div>
      {badges.length ? (
        <div class="badges">
          {badges.map(([text, severity]) => (
            <span class={`badge ${severity}`}>{text}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
