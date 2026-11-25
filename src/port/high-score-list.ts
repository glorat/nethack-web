// The core's own high-score list, as topten.c writes it at a game's end: its header, or what it says of the
// game's place on that list.
const LINES = [/^ No {2}Points {5}Name/, /^You made the top ten list!$/, /^You reached the \d+(st|nd|rd|th) place on the top \d+ list\.$/];

/** Whether a text window's lines are the core's high-score list. */
export const isHighScoreList = (lines: readonly { text: string }[]): boolean => lines.some(({ text }) => LINES.some((line) => line.test(text)));
