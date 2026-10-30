import { useLayoutEffect } from "preact/hooks";

export function AboutDialog({ onClose }: { onClose(): void }) {
  // the game doesn't hear keys while this is open; Escape or Return closes it
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      // Return on a link follows it
      if (e.key !== "Escape" && (e.key !== "Enter" || (e.target as Element).closest?.("a, button"))) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  return (
    <div class="dialog-backdrop">
      <div class="dialog about-dialog" role="dialog" aria-label="About NetHack">
        <div class="dialog-title">About NetHack</div>
        <p>
          Based on{" "}
          <a href="https://www.nethack.org/" target="_blank" rel="noopener">
            NetHack {__NETHACK_VERSION__}
          </a>{" "}
          by the NetHack DevTeam, distributed under the{" "}
          <a href={`${import.meta.env.BASE_URL}license.txt`} target="_blank" rel="noopener">
            NetHack General Public License
          </a>
          . This web port is unofficial, and not affiliated with the DevTeam. It also includes{" "}
          <a href={`${import.meta.env.BASE_URL}third-party-licenses.txt`} target="_blank" rel="noopener">
            other open source software
          </a>
          .
        </p>
        <p>
          Web version by Kevin Tam (
          <a href="https://github.com/glorat" target="_blank" rel="noopener">
            glorat
          </a>
          ). Source code and issue tracker on GitHub:{" "}
          <a href="https://github.com/glorat/nethack-web" target="_blank" rel="noopener">
            nethack-web
          </a>
          .
        </p>
        <p>
          Modelled on{" "}
          <a href="https://github.com/glorat/nethack-cocoa" target="_blank" rel="noopener">
            nethack-cocoa
          </a>
          , the Cocoa interface by Bryce Cogswell and Dirk Zimmermann.
        </p>
        <p>
          Painted tiles by Kevin Tam, derived from the NetHack tiles and distributed under the NetHack General Public
          License. Classic tiles from NetHack.
        </p>
        <div class="dialog-buttons">
          <button class="primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
