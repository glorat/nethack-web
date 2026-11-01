import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { WriteResult } from "../port/upload";

// Not a secret: a web app's Firebase config is public, and security rules decide what it may do.
const app = initializeApp({
  apiKey: "AIzaSyBwQKEX0nHFghDaYRhTK8QilSvWZbtNCRA",
  authDomain: "nethack-web-server.firebaseapp.com",
  // the emulators' project, which can't reach the real one: for now this only runs against them
  projectId: "demo-nethack",
  storageBucket: "nethack-web-server.firebasestorage.app",
  messagingSenderId: "1055631746678",
  appId: "1:1055631746678:web:ad062b1b08d70120a06157",
});

const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9299", { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8299);
const functions = getFunctions(app, "europe-west1");
connectFunctionsEmulator(functions, "127.0.0.1", 5299);

async function signedIn(): Promise<string> {
  await auth.authStateReady();
  return (auth.currentUser ?? (await signInAnonymously(auth)).user).uid;
}

/** Who the server says this player is. */
export async function whoami(): Promise<string> {
  await signedIn();
  const call = httpsCallable<unknown, { uid: string }>(functions, "user");
  return (await call({ method: "whoami", input: {} })).data.uid;
}

export async function writeBatch(game: string, id: string, lines: string, sentAt: number): Promise<WriteResult> {
  const uid = await signedIn();
  try {
    await setDoc(doc(db, `users/${uid}/games/${game}/batches/${id}`), { lines, sentAt, receivedAt: serverTimestamp() });
    return "stored";
  } catch (e) {
    // a client can only create a batch, so that's what's refused of one already there
    if ((e as { code?: string }).code === "permission-denied") return "exists";
    throw e;
  }
}
