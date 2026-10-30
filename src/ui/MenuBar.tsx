import { useEffect, useRef, useState } from "preact/hooks";

export interface MenuEntry {
  title: string;
  /** The key that does the same, shown to learn. */
  key?: string;
  disabled?: boolean;
  /** A setting that's on, shown with a check. */
  checked?: boolean;
  indent?: boolean;
  run(): void;
}

export interface BarMenu {
  title: string;
  /** null is a separator. */
  entries: (MenuEntry | null)[];
}

export function MenuBar({ menus }: { menus: BarMenu[] }) {
  const [open, setOpenState] = useState<string | null>(null);
  const isOpen = useRef(false);
  const setOpen = (title: string | null) => {
    isOpen.current = title !== null;
    setOpenState(title);
  };

  // added as the game starts, before any dialog's listener, so an open menu hears keys first:
  // Escape only closes the menu; any other key closes it and plays on
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // not keys typed ahead, replayed into a dialog: the player hasn't seen that the menu is open
      if (!isOpen.current || !e.isTrusted) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      setOpen(null);
    };
    const close = () => setOpen(null);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
    };
  }, []);

  return (
    <nav class="menubar" role="menubar">
      {open ? <div class="menubar-backdrop" onMouseDown={() => setOpen(null)} /> : null}
      {menus.map((menu) => (
        <div class="menubar-menu">
          <button
            class={`menubar-title${open === menu.title ? " open" : ""}`}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === menu.title}
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(open === menu.title ? null : menu.title);
            }}
            onMouseEnter={() => open && setOpen(menu.title)}
          >
            {menu.title}
          </button>
          {open === menu.title ? (
            <div class="menubar-list" role="menu" aria-label={menu.title}>
              {menu.entries.map((entry) =>
                entry ? (
                  <button
                    role={entry.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                    aria-checked={entry.checked}
                    class={entry.indent ? "indent" : undefined}
                    disabled={entry.disabled}
                    onClick={() => {
                      setOpen(null);
                      entry.run();
                    }}
                  >
                    <span>
                      <span class="menubar-check">{entry.checked ? "✓" : ""}</span>
                      {entry.title}
                    </span>
                    {entry.key ? <span class="menubar-key">{entry.key}</span> : null}
                  </button>
                ) : (
                  <hr />
                ),
              )}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
