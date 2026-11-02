import { initializeApp } from "firebase/app";
import { type AppCheck, getToken as getAppCheckToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { OnlineDeps } from "../port/online";
import type { WriteResult } from "../port/upload";

// Not a secret: a web app's Firebase config is public, and security rules decide what it may do.
const app = initializeApp({
  apiKey: "AIzaSyBwQKEX0nHFghDaYRhTK8QilSvWZbtNCRA",
  authDomain: "nethack-web-server.firebaseapp.com",
  // a dev build uses the emulators' project, which can't reach the real one
  projectId: import.meta.env.DEV ? "demo-nethack" : "nethack-web-server",
  storageBucket: "nethack-web-server.firebasestorage.app",
  messagingSenderId: "1055631746678",
  appId: "1:1055631746678:web:ad062b1b08d70120a06157",
});

/**
 * If reCAPTCHA can't load, the SDK's wait for it never ends and every Firebase call waits too.
 * A rejection makes the SDK carry on without a token, which is enough while enforcement is off.
 */
function givingUpAfter(ms: number, provider: ReCaptchaEnterpriseProvider): ReCaptchaEnterpriseProvider {
  // getToken isn't in the SDK's types; tests/e2e/app-check.spec.ts fails if it stops being called
  const internal = provider as unknown as { getToken(...args: unknown[]): Promise<unknown> };
  const getToken = internal.getToken.bind(provider);
  let gaveUp = false;
  internal.getToken = async (...args) => {
    if (gaveUp) throw new Error("reCAPTCHA is unavailable");
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        gaveUp = true;
        reject(new Error("reCAPTCHA is unavailable"));
      }, ms);
    });
    const attempt = getToken(...args);
    // only one that's still hanging is reason not to try; a slow one is over, and the next can use what it loaded
    void attempt.catch(() => {}).finally(() => (gaveUp = false));
    return Promise.race([attempt, timeout]).finally(() => clearTimeout(timer));
  };
  return provider;
}

// a dev build's emulators don't check tokens, and this would call out to Google
const appCheck: AppCheck | null = import.meta.env.DEV
  ? null
  : initializeAppCheck(app, {
      provider: givingUpAfter(5000, new ReCaptchaEnterpriseProvider("6LdcDAwuAAAAAA81qI1LoGLPgWlCU6hMogns6GWM")),
      isTokenAutoRefreshEnabled: true,
    });

async function hasAppCheckToken(): Promise<boolean> {
  if (!appCheck) return true;
  try {
    await getAppCheckToken(appCheck);
    return true;
  } catch {
    return false;
  }
}

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "europe-west1");
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, "http://127.0.0.1:9299", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8299);
  connectFunctionsEmulator(functions, "127.0.0.1", 5299);
}

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

async function userRequest<Output>(method: string, input: object): Promise<Output> {
  await signedIn();
  return (await httpsCallable<unknown, Output>(functions, "user")({ method, input })).data;
}

export const startGame: OnlineDeps["startGame"] = (input) => userRequest("startGame", input);

export const listGames: OnlineDeps["listGames"] = (input) => userRequest("listGames", input);

export const resumeGame: OnlineDeps["resumeGame"] = (input) => userRequest("resumeGame", input);

export const seed = (input: { game: string; turn: number; sentAt: number }) =>
  userRequest<{ seed: number; now: number; validTurns: number }>("seed", input);

export async function writeBatch(game: string, id: string, lines: string, sentAt: number): Promise<WriteResult> {
  const uid = await signedIn();
  try {
    await setDoc(doc(db, `users/${uid}/games/${game}/batches/${id}`), { lines, sentAt, receivedAt: serverTimestamp() });
    return "stored";
  } catch (e) {
    // A client can only create a batch, so that's what's refused of one already there. Having no App Check token is
    // refused with the same code, and those lines haven't been stored.
    if ((e as { code?: string }).code === "permission-denied" && (await hasAppCheckToken())) return "exists";
    throw e;
  }
}
