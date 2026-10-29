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
