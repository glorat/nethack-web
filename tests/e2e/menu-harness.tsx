import { h, render } from "preact";
import { MenuDialog } from "../../src/ui/dialogs/MenuDialog";
import type { MenuHow, MenuItem } from "../../src/protocol";

/** Mounts the real menu component for a request from the real core, for browser tests. */
export function mountMenu(request: { how: MenuHow; prompt: string; items: MenuItem[]; unlisted: string }) {
  const root = document.createElement("div");
  root.id = "qa-menu";
  document.body.append(root);
  const sheet = { image: new Image(), width: 32, height: 32, columns: 1 };
  const close = () => {
    render(null, root);
    root.remove();
  };
  render(
    h(MenuDialog, {
      ...request,
      sheet,
      onDone: (selection: unknown) => {
        (window as unknown as { __qaSelection: unknown }).__qaSelection = selection;
        close();
      },
    }),
    root,
  );
}
