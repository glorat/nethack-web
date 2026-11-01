import type { GameEvent, MapCell } from "../protocol";
import { COLNO, MAX_MESSAGES, ROWNO } from "./state";

/**
 * What a replay the player isn't shown has come to, as events that take the
 * page straight there; it holds no more however long the game has run.
 */
export class HeldEvents {
  private cleared = false;
  private cells = new Map<number, MapCell>();
  private messages: GameEvent[] = [];
  private latest = new Map<string, GameEvent>();
  private rest: GameEvent[] = [];

  add(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "map":
          for (const cell of event.cells) {
            if (cell.x >= 0 && cell.x < COLNO && cell.y >= 0 && cell.y < ROWNO) this.cells.set(cell.y * COLNO + cell.x, cell);
          }
          break;
        case "map_clear":
          this.cleared = true;
          this.cells.clear();
          break;
        case "message":
          if (!event.text.trim()) break;
          this.messages.push(event);
          if (this.messages.length >= 2 * MAX_MESSAGES) this.messages = this.messages.slice(-MAX_MESSAGES);
          break;
        // a beep long past isn't news
        case "bell":
          break;
        case "text_size":
          this.latest.set(`text_size ${event.atStart}`, event);
          break;
        case "recorded":
        case "recorded_before":
        case "recording":
          this.rest.push(event);
          break;
        default:
          this.latest.set(event.type, event);
      }
    }
  }

  all(): GameEvent[] {
    const map: GameEvent[] = [];
    if (this.cleared) map.push({ type: "map_clear" });
    if (this.cells.size) map.push({ type: "map", cells: [...this.cells.values()] });
    return [
      ...map,
      ...this.messages.slice(-MAX_MESSAGES),
      ...this.latest.values(),
      ...this.rest,
    ];
  }
}
