// A short pick-one menu reads better as a question with an answer button for each item, as Cocoa shows it.
import type { MenuHow, MenuItem } from "../protocol";

const MOST_ANSWERS = 4;
const LONGEST_ANSWER = 40;

/** A line's columns: tab-separated, or set apart by runs of spaces that don't end a sentence or clause. */
export function splitFields(line: string): string[] {
  const text = line.replaceAll("\t", "  ");
  const fields: string[] = [];
  let start = 0;
  for (const gap of text.matchAll(/ {2,}/g)) {
    const at = gap.index!;
    const end = at + gap[0].length;
    if (at > start && end < text.length && !".!?,".includes(text[at - 1])) {
      fields.push(text.slice(start, at));
      start = end;
    }
  }
  fields.push(text.slice(start));
  return fields;
}

/** A line is a heading if items come under it, it has an attribute, or it ends in a colon; otherwise it's text. */
function isHeading(line: MenuItem, next: MenuItem | undefined): boolean {
  const text = line.text.trim();
  return (next !== undefined && next.identifier !== 0) || (line.attr !== 0 && text.length > 0) || (!line.text.startsWith(" ") && text.endsWith(":"));
}

/** 2 to 4 short single-column answers, with no pictures and no headings over groups of items. */
export function isQuestion(how: MenuHow, items: MenuItem[]): boolean {
  if (how !== "one" || items.some((i) => i.tile >= 0)) return false;
  let answers = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.identifier === 0) {
      if (isHeading(item, items[i + 1])) return false;
      continue;
    }
    const fields = splitFields(item.text.trim());
    if (++answers > MOST_ANSWERS || fields.length > 1 || fields[0].length > LONGEST_ANSWER) return false;
  }
  return answers >= 2;
}
