import { vitals, type Metric } from "./metric";

/**
 * Where the game's turns went, each turn put down to what the hero did with it, to tell food spent on progress from
 * food spent going nowhere: exploring new squares, walking over known ones, changing level, fighting, searching or
 * resting, eating, praying, or something else; the same counted only while Hungry or worse; and idle turns, more than
 * 100 past the last progress (a new square, experience level, kill or depth).
 */
const IDLE_AFTER = 100;
const SEARCH = "s".charCodeAt(0);
const FIGHT = /You (hit|miss|kill|destroy)|\b(hits|bites|misses|stings|butts|kicks|claws|touches you)[!.]/;
const HUNGRY = 2;

export const activity: Metric = {
  name: "activity",
  tier: "visible",
  create() {
    const turns: Record<string, number> = {};
    const hungry: Record<string, number> = {};
    // for "other" turns, the keys pressed in them -> turns
    const otherKeys: Record<string, number> = {};
    let idle = 0;
    let idleHungry = 0;
    let longestIdle = { turns: 0, from: 0 };
    let lastProgress = 0;
    let xl = 0;
    let depth = 0;
    const visited = new Set<string>();
    let last: { turn: number; level: string; square: string } | null = null;
    let keys: number[] = [];
    let messages: string[] = [];
    return {
      step(s) {
        const v = vitals(s);
        for (const m of s.messages) messages.push(m.text);
        const level = `${s.dungeon}/${s.level}`;
        const square = `${level}/${s.hero?.x}/${s.hero?.y}`;
        const key = s.answer?.tag === "k" ? Number(s.answer.rest) : null;
        if (last === null) {
          visited.add(square);
          last = { turn: v.turn, level, square };
        } else if (v.turn > last.turn) {
          const spent = v.turn - last.turn;
          const text = messages.join(" ");
          let what: string;
          if (level !== last.level) what = "travel";
          else if (square !== last.square) what = visited.has(square) ? "walk" : "explore";
          else if (FIGHT.test(text)) what = "fight";
          else if (/You finish eating|You stop eating|This .* is delicious|tastes|You're having a hard time getting all of it down/.test(text)) what = "eat";
          else if (/You begin praying|You finish your prayer/.test(text)) what = "pray";
          else if (keys.includes(SEARCH)) what = "search";
          else what = "other";

          const progressed = what === "explore" || v.xl > xl || (v.depth ?? 0) > depth || /You kill|You destroy/.test(text);
          const idleBefore = Math.max(0, last.turn - lastProgress - IDLE_AFTER);
          const idleNow = Math.max(0, v.turn - lastProgress - IDLE_AFTER);
          idle += idleNow - idleBefore;
          if (v.hunger >= HUNGRY) idleHungry += idleNow - idleBefore;
          if (v.turn - lastProgress > longestIdle.turns) longestIdle = { turns: v.turn - lastProgress, from: lastProgress };
          if (progressed) lastProgress = v.turn;
          xl = Math.max(xl, v.xl);
          depth = Math.max(depth, v.depth ?? 0);
          turns[what] = (turns[what] ?? 0) + spent;
          if (what === "other") {
            const k = keys.map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : `#${c}`)).join("").slice(0, 12) || "(none)";
            otherKeys[k] = (otherKeys[k] ?? 0) + spent;
          }
          if (v.hunger >= HUNGRY) hungry[what] = (hungry[what] ?? 0) + spent;
          visited.add(square);
          last = { turn: v.turn, level, square };
          keys = [];
          messages = [];
        }
        if (key !== null) keys.push(key);
      },
      result: () => ({ turns, hungry, otherKeys, idle, idleHungry, longestIdle }),
    };
  },
};
