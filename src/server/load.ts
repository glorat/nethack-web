import type { FirebaseApp } from "firebase/app";

/**
 * The server's client, or null if it can't be had. The game must never wait on this or depend on
 * it, so that it plays the same with no connection: import Firebase only through here.
 */
export async function loadServer(load: () => Promise<{ app: FirebaseApp }> = () => import("./firebase")): Promise<FirebaseApp | null> {
  try {
    return (await load()).app;
  } catch (e) {
    console.warn("server unavailable", e);
    return null;
  }
}
