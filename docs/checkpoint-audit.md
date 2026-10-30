# Checkpoint audit

Does recovering from a checkpoint taken at a command prompt bring back the state a real save and restore would? A static read of the core (`nethack/`, audited at `c5b25cb11`), comparing `save_currentstate()` (mode WRITING) and recovery (`recover_savefile()` then `dorecover`) with `dosave0()` (mode WRITING|FREEING) and restore.

## Differences fixed

| Where | What | Fix |
|---|---|---|
| `save.c:900` | `u.ustuck_mid`, `u.usteed_mid`, `polearm.m_id` set only while freeing | `save_currentstate()` sets them around the write (`458f3e5fc`) |
| `save.c:893` | `forget_temple_entry()` ran in every mode, resetting live priests | Skipped while `in_checkpoint` (`e301fff5a`) |
| `save.c:142` | `dosave0` undoes the full moon's +1 and Friday 13th's -1 luck before writing, and startup applies it again; a checkpoint didn't undo it, so each recovery on such a day added another step | `save_currentstate()` undoes it around the write (`8fe74df59`) |
| `save.c:783`, `restore.c:285` | `context.victual.piece`, `tin.tin`, `spbook.book` are nulled only as the item is freed; a checkpoint wrote a floor item's raw pointer, which recovery's freeing of levels compares objects against, so an object at the same address could become the meal, tin or book in progress | `save_currentstate()` nulls them around the write; their `o_id`s are set whenever they are (`2b1465465`) |
| `engrave.c:1565` | Writing an engraving reset its text pointers to the buffer start on the live engraving, in every mode, so after a checkpoint a rubbed engraving got its leading spaces back (vanilla's level-arrival checkpoint did the same) | The pointers are put back after writing (`d63d584ae`) |

## Differences that don't matter

- **`dosave0` steps that don't apply at a command prompt:**
  - `u.uinvulnerable` is only set while praying.
  - `iflags.save_uswallow`, `save_uinwater` and `save_uburied` are only set around a display wait.
  - `done_object_cleanup` finds nothing in use or in flight.
  - `light.c:430` finds no camera flashes, and `vision_full_recalc` is already handled.
- **Ball and chain while swallowed:** a real save drops them to the floor first. A checkpoint saves them as loose, which matches play.
- **Vision:** `vision_recalc(2)` clears arrays that aren't saved.
- **Not game state:** `notice_mon_off`, the overwrite prompt and compression.

## The same in both

- **Timers and light sources:** they swap pointers for ids around each write in every mode, and filter local from global.
- **Raw pointers inside objects and monsters:** they are rebuilt the same way on restore.
- **Write order:** level first, then game state, as `dosave0` does.
- **Mode checks that only decide freeing:** every other `release_data`, `update_file` and FREEING check only decides whether memory is freed after writing. That covers:
  - `savecemetery`, `savedamage`, `save_stairs`, `savetrapchn`, `savefruitchn`, `savelevchn`
  - `save_dungeon`, `save_regions`, `save_worm`, `save_waterlevel`, `save_track`
  - `savenames`, `save_oracles`, `save_killers`
  - `save_artifacts`, `save_rooms`, `save_luadata`
- **Recovery:** `recover_savefile` writes the same layout as `dosave0`, and `in_self_recover` changes nothing.

## Limits of the approach

- Checkpoints follow `svm.moves`. A fast hero's extra action in a turn, and commands that take no time (naming, `#adjust`, options), wait for the next turn.
- `checkpoint` off in the options leaves nothing to recover.
- A checkpoint can pause inside its write (`getmsghistory` is a window callback). So can a level change, between saving the old level and the arrival checkpoint. Neither reaches IndexedDB: the worker only syncs while waiting for a key and at game end.

## Not covered

- Field-level serialisation (`sfbase.c`, `sfstruct.c`).
- The internals of the restore functions for regions, worms and the water level.
- Bones and SFCTOOL.
