# Contributing

## Commit messages

The same convention applies here and in the `nethack` submodule.

- **Subject only:** one imperative sentence that says what changed in behaviour, not how, with no body. Start with a capital, no full stop, aim for 72 characters or fewer.
  - "Draw the floor under monsters on lit room squares", not "Update backgroundTile in game.ts".
  - Join several user-facing changes in one sentence with commas: "Fix two crashes, survive errors in the window code, and offer to recover a crashed game".
- **No prefixes:** no `feat:`/`fix:`, scopes or emoji.
- **Releases:** `Release <version>`, as its own commit.
- **Submodule updates:** say what the core change brings in ("Update the core to draw background tiles from glyph numbers"), not "Bump nethack submodule".

In the `nethack` fork, keep each commit small and self-contained, so it could be offered upstream on its own.

## Licences

Both repositories are under the NetHack General Public License, which requires the following.

- **Changing a core file:** the first time a file in `nethack/` differs from `NetHack-5.0.0_Released`, add this line below its copyright header, as a comment in that file's syntax, with that day's date. Put it in its own fork commit, so the other commits can still be offered upstream.
  - `Modified for nethack-web by Kevin Tam from <YYYY-MM-DD>; the history of the "web" branch of glorat/NetHack gives each change and its date.`
- **Adding a core file:** give it a copyright and licence header like the core's other files.
- **Bundling other software:** when something new ships to players, such as a runtime dependency or a library compiled into the core, add its notice to `public/third-party-licenses.txt`. Tools used only for development don't count.
