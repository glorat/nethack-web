// The Guidebook's own words for each role and race, read from the core's doc/Guidebook.mn as the page is built (vite.config.ts).

function sharedStart(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i]!.toLowerCase() === b[i]!.toLowerCase()) i++;
  return i;
}

/**
 * The paragraphs on roles and races whose opening shares the longest start with a name the core gives, as the Guidebook
 * names them in the plural: "Caveman" finds "Cavemen", and "elf" "Elves".
 */
export function guidebookMatches(name: string, paragraphs: [string, string][] = __GUIDEBOOK_CHARACTERS__): [string, string][] {
  const longest = Math.max(0, ...paragraphs.map(([opening]) => sharedStart(name, opening)));
  return longest > 0 ? paragraphs.filter(([opening]) => sharedStart(name, opening) === longest) : [];
}

/** The Guidebook's paragraph on a role or race, by the name the core gives it. */
export function guidebookText(name: string): string | undefined {
  const found = guidebookMatches(name);
  return found.length === 1 ? found[0]![1] : undefined;
}
