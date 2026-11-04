import { initializeApp } from "firebase/app";
import { CustomProvider, getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, getRedirectResult, GoogleAuthProvider, linkWithRedirect, signInAnonymously, signInWithCredential, signOut as authSignOut } from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { appCheckRefused, type OnlineDeps, refusedAddress } from "../session";
import type { Profile } from "../account";
import type { Achievement } from "../achievements";
import type { FinishedGame, LeaderboardEntry } from "../results";
import type { WriteResult } from "../upload";

// Not a secret: a web app's Firebase config is public, and security rules decide what it may do.
const app = initializeApp({
  apiKey: "AIzaSyBwQKEX0nHFghDaYRhTK8QilSvWZbtNCRA",
  // Google only accepts listed redirect addresses, and a preview deploy's random one can't be listed
  authDomain: location.hostname === "nethack.app" ? "nethack.app" : "nethack-web-server.firebaseapp.com",
  // a dev build uses the emulators' project, which can't reach the real one
  projectId: import.meta.env.DEV ? "demo-nethack" : "nethack-web-server",
  storageBucket: "nethack-web-server.firebasestorage.app",
  messagingSenderId: "1055631746678",
  appId: "1:1055631746678:web:ad062b1b08d70120a06157",
});

// the emulators require a token but don't verify its signature, and reCAPTCHA would call out to Google
const appCheck = initializeAppCheck(app, {
  provider: import.meta.env.DEV
    ? new CustomProvider({ getToken: async () => ({ token: unsignedAppCheckToken(), expireTimeMillis: Date.now() + 3_600_000 }) })
    : new ReCaptchaEnterpriseProvider("6LdcDAwuAAAAAA81qI1LoGLPgWlCU6hMogns6GWM"),
  isTokenAutoRefreshEnabled: true,
});

function unsignedAppCheckToken(): string {
  const part = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${part({ alg: "none", typ: "JWT" })}.${part({ sub: "1:0:web:dev", aud: ["projects/demo-nethack"], exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
}

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "europe-west1");
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, "http://127.0.0.1:9299", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8299);
  connectFunctionsEmulator(functions, "127.0.0.1", 5299);
}

/**
 * Nothing goes to the server without a token. Until there's one this waits, for as long as reCAPTCHA takes. A refusal
 * won't change by retrying, so it ends the page; anything else throws, for the caller's usual retry.
 */
async function holdingToken(): Promise<void> {
  try {
    await getToken(appCheck);
  } catch (e) {
    if (appCheckRefused(e)) location.replace(refusedAddress());
    throw e;
  }
}

let anonymousSignIn: Promise<string> | null = null;

async function signedIn(): Promise<string> {
  await holdingToken();
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  // requests made together must not each make a player of their own
  anonymousSignIn ??= signInAnonymously(auth)
    .then((c) => c.user.uid)
    .finally(() => (anonymousSignIn = null));
  return anonymousSignIn;
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

/** Needs no sign-in, but sends one if there is one, so the server knows who's asking. */
async function publicRequest<Output>(method: string, input: object): Promise<Output> {
  await holdingToken();
  await auth.authStateReady();
  return (await httpsCallable<unknown, Output>(functions, "publicApi")({ method, input })).data;
}

/**
 * Sends the player to Google to link their account to the anonymous player here, so their uid and games carry over.
 * The page comes back with the answer, for `finishSignIn`.
 */
export async function signInWithGoogle(): Promise<void> {
  await signedIn();
  const current = auth.currentUser!;
  if (current.isAnonymous) await linkWithRedirect(current, new GoogleAuthProvider());
}

/**
 * Whether coming back from Google signed the player in. An account that's already someone's is signed in to instead,
 * leaving this browser's anonymous games with the anonymous uid.
 */
export async function finishSignIn(): Promise<boolean> {
  try {
    if (!(await getRedirectResult(auth))) return false;
  } catch (e) {
    const credential = GoogleAuthProvider.credentialFromError(e as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
    if ((e as { code?: string }).code !== "auth/credential-already-in-use" || !credential) throw e;
    await signInWithCredential(auth, credential);
  }
  // the server reads how the player signed in from the token, which has to say so now
  await auth.currentUser?.getIdToken(true);
  return true;
}

/** Forgets the account in this browser, in every tab. The next request makes a new anonymous player. */
export const signOut = () => authSignOut(auth);

export const profile = async (): Promise<Profile> => ({
  ...(await userRequest<Omit<Profile, "email">>("profile", {})),
  email: auth.currentUser?.email ?? null,
});

export const requestHandle = (input: { handle: string; sentAt: number }) => userRequest<{ status: "awaiting approval" }>("requestHandle", input);

export const startGame: OnlineDeps["startGame"] = (input) => userRequest("startGame", input);

export const listGames: OnlineDeps["listGames"] = (input) => userRequest("listGames", input);

export const resumeGame: OnlineDeps["resumeGame"] = (input) => userRequest("resumeGame", input);

export const finishedGames = (input: { sentAt: number }) => userRequest<{ games: FinishedGame[] }>("finishedGames", input);

export const leaderboard = (input: { sentAt: number }) => publicRequest<{ entries: LeaderboardEntry[] }>("leaderboard", input);

export const achievements = () => userRequest<{ achievements: Achievement[] }>("achievements", {});

export const gameRecording = (input: { game: string; sentAt: number }) => userRequest<{ recording: string } | null>("gameRecording", input);

export const seed = (input: { game: string; turn: number; sentAt: number }) =>
  userRequest<{ seed: number; now: number; validTurns: number }>("seed", input);

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
