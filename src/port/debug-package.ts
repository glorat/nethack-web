// A file a developer can take away to reproduce a game. See docs/recording.md.
import type { ShadowStatus } from "../protocol";

export interface DebugPackage {
  recording: string;
  /** The bones the recording names, by hash, which it doesn't hold. */
  bones: Map<string, Uint8Array>;
}

/** The hashes of the bones a recording names. */
export function namedBones(text: string): string[] {
  return [...new Set([...text.matchAll(/^\d+ bones \S+ ([0-9a-f]{64})$/gm)].map((m) => m[1]))];
}

function toBase64(data: Uint8Array): string {
  let text = "";
  // a spread of a whole file would overflow the stack
  for (let i = 0; i < data.length; i += 0x8000) text += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(text);
}

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const encoded = (files: Record<string, Uint8Array>) =>
  Object.fromEntries(Object.entries(files).map(([name, data]) => [name, toBase64(data)]));

export function buildDebugPackage(made: {
  recording: string;
  files: Record<string, Uint8Array>;
  bones: Record<string, Uint8Array>;
  /** What the recording held before it was cut back to where a replay last went right. */
  failed: string | null;
  shadow: ShadowStatus | null;
}): string {
  const { files: shadowFiles, ...shadow } = made.shadow ?? { state: null };
  const compared = made.shadow?.state === "mismatch";
  return JSON.stringify({
    version: __NETHACK_VERSION__,
    core: __CORE_COMMIT__,
    browser: typeof navigator === "undefined" ? "" : navigator.userAgent,
    shadow,
    recording: made.recording,
    failed: made.failed,
    bones: encoded(made.bones),
    files: compared ? encoded(made.files) : null,
    shadowFiles: compared && shadowFiles ? encoded(shadowFiles) : null,
  });
}

export function readDebugPackage(text: string): DebugPackage {
  const { recording, bones } = JSON.parse(text) as { recording: string; bones: Record<string, string> };
  return { recording, bones: new Map(Object.entries(bones).map(([hash, data]) => [hash, fromBase64(data)])) };
}

export function debugPackageName(): string {
  return `nethack-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}
