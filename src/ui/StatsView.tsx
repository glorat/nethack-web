import { useEffect, useRef } from "preact/hooks";
import { quietBadges, STAT_TIPS, STAT_WIKI, type StatName, statusBadges } from "../port/badges";
import { meterLevel } from "../port/meter";
import { dungeonHint } from "../port/hints";
import { heroText, levelText } from "../port/status-header";
import type { StatusValue } from "../protocol";
import { nhColor } from "./colors";
import type { HintMarker } from "./hints";
import { Described, type ToggletipProps, useToggletip } from "./tooltip";

// the gold field is "<encoded gold glyph>:<amount>"; the glyph is "\G" plus 8 hex digits
function clean(text: string | undefined): string {
  return (text ?? "").replace(/\\G[0-9a-fA-F]{8}:?/g, "").trim();
}

function value(fields: Record<string, StatusValue>, name: string): string {
  return clean(fields[name]?.text);
}

function Meter({ label, cur, max, kind, tip, on }: { label: string; cur: string; max: string; kind: string; tip: string; on: ToggletipProps }) {
  const c = Number(cur);
  const m = Number(max);
  const pct = m > 0 ? Math.max(0, Math.min(100, (c / m) * 100)) : 0;
  return (
    <div class={`meter ${kind} ${meterLevel(c, m)}`} {...on}>
      <span class="meter-label">{label}</span>
      <div class="meter-bar">
        <div class="meter-fill" style={{ width: `${pct}%` }} />
        <span class="meter-text">{cur}({max})</span>
      </div>
      <Described tip={tip} />
    </div>
  );
}

export function StatsView({ fields, hint }: { fields: Record<string, StatusValue>; hint: HintMarker }) {
  const toggletip = useToggletip();
  // what was clicked may have changed or gone
  useEffect(toggletip.sync, [fields]);
  const quiet = useRef<Set<string> | null>(null);
  if (!fields.BL_TITLE) {
    quiet.current = null;
    return <div class="stats" />;
  }
  const stat = (label: string, name: StatName) => {
    const change = fields[name]?.change;
    return (
      <div key={name} class="stat" {...toggletip.on(STAT_TIPS[name], STAT_WIKI[name])}>
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
        <Described tip={STAT_TIPS[name]} />
      </div>
    );
  };
  const conditions = (fields.BL_CONDITION?.text ?? "").split(" ").filter(Boolean);
  const hunger = value(fields, "BL_HUNGER");
  const encumbrance = value(fields, "BL_CAP");
  const badges = statusBadges(conditions, hunger, encumbrance);
  const quieted = quietBadges(quiet.current, badges.map((b) => b.label));
  quiet.current = quieted;
  const exp = value(fields, "BL_EXP");
  return (
    <div class="stats">
      <div class="stats-title">{value(fields, "BL_TITLE")}</div>
      <div class="stats-sub">{heroText(value(fields, "BL_ALIGN"), value(fields, "hero_kind"))}</div>
      <div class="stats-sub stats-level">
        <span>{levelText(value(fields, "BL_LEVELDESC"), value(fields, "dungeon_name"), Number(value(fields, "dungeon_level")))}</span>
        {hint(dungeonHint(value(fields, "dungeon_name"), Number(value(fields, "dungeon_level"))))}
      </div>
      <Meter label="HP" cur={value(fields, "BL_HP")} max={value(fields, "BL_HPMAX")} kind="hp" tip={STAT_TIPS.BL_HP} on={toggletip.on(STAT_TIPS.BL_HP, STAT_WIKI.BL_HP)} />
      <Meter label="Pw" cur={value(fields, "BL_ENE")} max={value(fields, "BL_ENEMAX")} kind="pw" tip={STAT_TIPS.BL_ENE} on={toggletip.on(STAT_TIPS.BL_ENE, STAT_WIKI.BL_ENE)} />
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
          {badges.map(({ label, severity, tip, wiki }) => (
            <span key={label} class={`badge ${severity}${quieted.has(label) ? " quiet" : ""}`} {...toggletip.on(tip, wiki)}>
              {label}
              <Described tip={tip} />
            </span>
          ))}
        </div>
      ) : null}
      {toggletip.element}
    </div>
  );
}
