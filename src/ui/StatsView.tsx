import { AC_TIP, statusBadges } from "../port/badges";
import { meterLevel } from "../port/meter";
import { heroText, levelText } from "../port/status-header";
import type { StatusValue } from "../protocol";
import { nhColor } from "./colors";

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
  return (
    <div class={`meter ${kind} ${meterLevel(c, m)}`}>
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
  const stat = (label: string, name: string, tip?: string) => {
    const change = fields[name]?.change;
    return (
      <div class="stat" title={tip}>
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
  const badges = statusBadges(conditions, hunger, encumbrance);
  const exp = value(fields, "BL_EXP");
  return (
    <div class="stats">
      <div class="stats-title">{value(fields, "BL_TITLE")}</div>
      <div class="stats-sub">{heroText(value(fields, "BL_ALIGN"), value(fields, "hero_kind"))}</div>
      <div class="stats-sub">{levelText(value(fields, "BL_LEVELDESC"), value(fields, "dungeon_name"), Number(value(fields, "dungeon_level")))}</div>
      <Meter label="HP" cur={value(fields, "BL_HP")} max={value(fields, "BL_HPMAX")} kind="hp" />
      <Meter label="Pw" cur={value(fields, "BL_ENE")} max={value(fields, "BL_ENEMAX")} kind="pw" />
      <div class="stat-grid">
        {stat("St", "BL_STR")}
        {stat("Dx", "BL_DX")}
        {stat("Co", "BL_CO")}
        {stat("In", "BL_IN")}
        {stat("Wi", "BL_WI")}
        {stat("Ch", "BL_CH")}
        {stat("AC", "BL_AC", AC_TIP)}
        {stat(fields.BL_HD?.text ? "HD" : "XL", fields.BL_HD?.text ? "BL_HD" : "BL_XP")}
        {stat("$", "BL_GOLD")}
        {exp ? stat("Exp", "BL_EXP") : null}
        {fields.BL_TIME?.text ? stat("T", "BL_TIME") : null}
        {fields.BL_SCORE?.text ? stat("Score", "BL_SCORE") : null}
      </div>
      {badges.length ? (
        <div class="badges">
          {badges.map(({ label, severity, tip }) => (
            <span class={`badge ${severity}`} title={tip}>
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
