import type { MenuItem } from "../protocol";
import { tileStyle, type TileSheet } from "../tiles";

const ICON = 24;

interface Props {
  items: MenuItem[];
  sheet: TileSheet;
  onChoose(letter: string): void;
}

export function InventoryView({ items, sheet, onChoose }: Props) {
  return (
    <aside class="inventory">
      <h2>Inventory</h2>
      {items.map((item) =>
        item.identifier === 0 ? (
          <h3 class="inv-heading">{item.text}</h3>
        ) : (
          <button class="inv-item" onClick={() => onChoose(item.accelerator)} title={item.text}>
            <span class="inv-icon" style={tileStyle(sheet, item.tile, ICON)} />
            <span class="inv-letter">{item.accelerator}</span>
            <span class="inv-text">{item.text}</span>
          </button>
        ),
      )}
    </aside>
  );
}
