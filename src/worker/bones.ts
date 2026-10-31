// The bones this browser keeps; a host's to answer the core with. See docs/recording.md.
import type { NetHackModule } from "./memory";
import { sha256 } from "./sha256";

const DIR = "/save/bones";

export class BonesDb {
  constructor(private readonly fs: NetHackModule["FS"]) {}

  /** The bones waiting for this level, which no other game will now get. */
  take(name: string): Uint8Array | null {
    const waiting = `${DIR}/${name}`;
    if (!this.fs.analyzePath(waiting).exists) return null;
    const data = this.get(this.fs.readFile(waiting, { encoding: "utf8" }));
    this.fs.unlink(waiting);
    return data ?? null;
  }

  /** Bones left at a death; those already waiting for the level stay. */
  keep(name: string, data: Uint8Array): void {
    if (!this.fs.analyzePath(DIR).exists) this.fs.mkdir(DIR);
    const waiting = `${DIR}/${name}`;
    if (this.fs.analyzePath(waiting).exists) return;
    const hash = sha256(data);
    this.fs.writeFile(`${DIR}/${hash}`, data);
    this.fs.writeFile(waiting, hash);
  }

  get(hash: string): Uint8Array | undefined {
    const path = `${DIR}/${hash}`;
    return this.fs.analyzePath(path).exists ? this.fs.readFile(path) : undefined;
  }
}
