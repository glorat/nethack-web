import { inventory, vitals, type Metric, type Step, type Vitals } from "./metric";

/**
 * Moments a player would regret, from what the game shows: sudden losses of HP or armor, theft, afflictions, angered
 * gods and peacefuls, going too deep, being held while hurt, being stuck or stalled on a level. Each marker keeps the
 * messages and the HP and AC trend before it, and the answer count, to find it in the recording.
 */
const MESSAGES: [string, Severity, RegExp][] = [
  // gear
  ["theft", "high", /\b(stole|steals|You gladly (hand over|let (him|her) take|start removing)|charms you)\b/],
  ["gold stolen", "low", /Your purse feels lighter/],
  ["weapon lost", "high", /welded to your hand|disarms you|Someone disarms|snatches your/],
  ["gear destroyed", "medium", /\b(is destroyed|are destroyed|crumbles? (to dust|away)|rots? away completely|dissolves completely|turns to dust)\b/],
  // afflictions
  ["lycanthropy", "high", /You feel feverish\./],
  ["polymorphed", "medium", /You turn into an? |Your new form doesn't seem healthy/],
  // angering gods and people
  ["prayer failed", "high", /You feel that \w+ is displeased|Thou hast (angered|strayed)|You are hit by a bolt of lightning|"Thou /],
  ["peaceful angered", "high", /You murderer!|gets angry!|You're under arrest|You hear the shrieks of anguish|Halt, thief!/],
  ["pet killed", "low", /You feel guilty|You have a sad feeling/],
  // a pet dying of hunger, out of sight or in it, and the warnings before
  ["pet starved", "medium", /You feel (sad|bummed) for a moment|\bstarves\./],
  ["pet starving", "medium", /is confused from hunger|You feel worried about|seems famished/],
  // held while hurt (checked against HP below)
  ["held", "medium", /You cannot escape from|engulfs you|swallows you whole|You are caught in a bear trap|You stumble into a spider web|You are stuck to/],
];

const AFFLICTIONS: [string, string][] = [
  ["STONE", "stoning"],
  ["SLIME", "sliming"],
  ["STRNGL", "strangling"],
  ["FOODPOIS", "food poisoning"],
  ["TERMILL", "illness"],
];

const WEAK = 3;

type Severity = "high" | "medium" | "low";

export interface Regret {
  turn: number;
  kind: string;
  severity: Severity;
  detail: string;
  keys: number;
  hp: number;
  hpmax: number;
  ac: number;
  depth: number;
  xl: number;
  trend: [number, number, number][];
  messages: string[];
}

export const regrets: Metric = {
  name: "regrets",
  tier: "visible",
  create() {
    const markers: Regret[] = [];
    const history: { turn: number; hp: number; hpmax: number; ac: number; xl: number }[] = [];
    const messages: { turn: number; text: string }[] = [];
    const lastByKind = new Map<string, number>();
    let nearDeath = false;
    let conditions = new Set<string>();
    let maxHpMax = 0;
    let maxDepth = 0;
    let depth = 0;
    let level: string | null = null;
    let levelSince = 0;
    let lastStalled = 0;
    let hungerWeak = false;
    let hadWeapon = false;
    const cursedSeen = new Set<string>();
    const visited = new Set<string>();
    let lastNewSquare = 0;
    let lastStuck = 0;
    let turn = -1;

    /** At most one marker of a kind every 20 turns, so one fight doesn't make dozens. */
    const mark = (s: Step, v: Vitals, kind: string, severity: Severity, detail: string) => {
      if (v.turn - (lastByKind.get(kind) ?? -Infinity) < 20) return;
      lastByKind.set(kind, v.turn);
      markers.push({
        turn: v.turn, kind, severity, detail, keys: s.index, hp: v.hp, hpmax: v.hpmax, ac: v.ac, depth, xl: v.xl,
        trend: history.slice(-20).map((h) => [h.turn, h.hp, h.ac]),
        messages: messages.map((m) => `${m.turn} ${m.text}`),
      });
    };

    return {
      step(s) {
        const v = vitals(s);
        if (v.depth !== null) depth = v.depth;
        for (const { text } of s.messages) {
          messages.push({ turn: v.turn, text });
          if (messages.length > 15) messages.shift();
          for (const [kind, severity, re] of MESSAGES) {
            if (!re.test(text)) continue;
            if (kind === "held" && v.hp * 2 >= v.hpmax) continue;
            mark(s, v, kind, severity, text.match(re)![0]);
          }
        }
        for (const [bit, name] of AFFLICTIONS) if (v.conditions.has(bit) && !conditions.has(bit)) mark(s, v, name, "high", name);
        conditions = v.conditions;

        if (v.turn === turn) return;
        turn = v.turn;
        const { hp, hpmax, ac } = v;
        const changedForm = messages.slice(-3).some((m) => m.turn >= turn - 1 && /You turn into|You return to|You feel like a new/.test(m.text));

        // health
        const recent = history.filter((h) => h.turn >= turn - 3);
        const peak = Math.max(hp, ...recent.map((h) => h.hp));
        if (!changedForm && hpmax > 0 && peak - hp >= 0.4 * hpmax) mark(s, v, "sudden HP loss", "high", `${peak} -> ${hp} of ${hpmax} in 3 turns`);
        if (hp * 5 < hpmax && !nearDeath) {
          nearDeath = true;
          mark(s, v, "near death", "high", `${hp}/${hpmax}`);
        }
        if (hp * 2 > hpmax) nearDeath = false;
        const prev = history[history.length - 1];
        if (!changedForm && hpmax < maxHpMax && prev && hpmax < prev.hpmax) mark(s, v, "max HP lost", "high", `${prev.hpmax} -> ${hpmax}`);
        const lastXl = prev ? prev.xl : v.xl;
        if (v.xl < lastXl && !changedForm) mark(s, v, "level lost", "high", `XL ${lastXl} -> ${v.xl}`);
        maxHpMax = Math.max(maxHpMax, hpmax);

        // armor class: worse by 3 within 10 turns, unless the hero was dressing or undressing
        const window = history.filter((h) => h.turn >= turn - 10);
        const best = Math.min(ac, ...window.map((h) => h.ac));
        const dressing = messages.some((m) => m.turn >= turn - 10 && /You (finish taking off|were wearing|finish your dressing|are now wearing)/.test(m.text));
        if (ac - best >= 3 && !dressing) mark(s, v, "AC jump", "high", `AC ${best} -> ${ac}${changedForm ? " (changed form)" : ""}`);

        // the inventory, read once a turn: a lost weapon, and weak from hunger with nothing to eat
        const items = inventory(s);
        const hasWeapon = items.some(({ text }) => /\((weapon in|tethered to|wielded in) |\(wielded\)/.test(text));
        // cursed gear on the hero: it can't come off, a welded weapon can't be changed
        for (const { text } of items) {
          const worn = /\((being worn|weapon in|wielded|on (left|right) hand|in use)/.test(text);
          if (!worn || !/(^|\s)cursed\b/.test(text)) continue;
          // the same item as it erodes or its enchantment shows: "cursed burnt -1 mummy wrapping"
          const key = text.replace(/^(a|an|\d+) /, "").replace(/ \(.*$/, "").replace(/\b(very|thoroughly|burnt|rotted|rusty|corroded|cursed|[+-]\d+) /g, "");
          if (cursedSeen.has(key)) continue;
          cursedSeen.add(key);
          // a stuck weapon or body armor, and rings and amulets, cursed ones often doing harm (strangulation, hunger, teleportitis)
          const serious = /weapon in|wielded|mail|plate|armor|coat|amulet|ring\b|on (left|right) hand/.test(text);
          mark(s, v, "cursed gear", serious ? "high" : "medium", text);
        }
        if (hadWeapon && !hasWeapon && !changedForm) mark(s, v, "weapon lost", "high", "no wielded weapon");
        hadWeapon = hasWeapon;
        const weak = v.hunger >= WEAK;
        if (weak && !hungerWeak && !items.some((i) => i.heading === "Comestibles")) mark(s, v, "weak with no food", "medium", "no food carried");
        hungerWeak = weak;

        // too deep for its strength, on first reaching a depth
        if (depth > maxDepth) {
          maxDepth = depth;
          if (depth > v.xl + 2) mark(s, v, "too deep", "medium", `depth ${depth} at XL ${v.xl}`);
        }

        // stuck: a thousand turns without setting foot on a new square
        const here = `${s.dungeon}/${s.level}`;
        if (s.hero) {
          const square = `${here}/${s.hero.x}/${s.hero.y}`;
          if (!visited.has(square)) {
            visited.add(square);
            lastNewSquare = turn;
          }
        }
        if (turn - lastNewSquare > 1000 && turn - lastStuck > 1000) {
          lastStuck = turn;
          mark(s, v, "stuck", "medium", `no new square for ${turn - lastNewSquare} turns`);
        }

        // stalled: three thousand turns on one level, new squares or not
        if (here !== level) {
          level = here;
          levelSince = turn;
          lastStalled = turn;
        }
        if (turn - lastStalled >= 3000) {
          lastStalled = turn;
          mark(s, v, "stalled", "medium", `${turn - levelSince} turns on ${s.dungeon} ${s.level}`);
        }

        history.push({ turn, hp, hpmax, ac, xl: v.xl });
        if (history.length > 30) history.shift();
      },
      result: () => markers,
    };
  },
};
