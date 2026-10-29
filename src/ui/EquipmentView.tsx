import type { EquipmentSlot, MenuItem } from "../protocol";
import { tileStyle, type TileSheet } from "../tiles";

// slot order matches nhweb_equip_obj() in sys/libnh/libnhmain.c
const SLOT_NAMES = [
  "amulet", "helmet", "blindfold/lenses",
  "weapon", "armor", "shield",
  "gloves", "shirt", "cloak",
  "left ring", "boots", "right ring",
];

const CELL = 32;

interface Props {
  equipment: EquipmentSlot[];
  inventory: MenuItem[];
  sheet: TileSheet;
  onChoose(letter: string): void;
}

export function EquipmentView({ equipment, inventory, sheet, onChoose }: Props) {
  return (
    <div class="equipment">
      {SLOT_NAMES.map((name, slot) => {
        const item = equipment[slot];
        const letter = item?.letter ?? "";
        const text = letter ? inventory.find((i) => i.accelerator === letter)?.text : undefined;
        return (
          <button
            class="equip-slot"
            title={text ?? name}
            disabled={!letter}
            style={item ? tileStyle(sheet, item.tile, CELL) : undefined}
            onClick={() => letter && onChoose(letter)}
          />
        );
      })}
    </div>
  );
}
