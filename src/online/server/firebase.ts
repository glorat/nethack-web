import { initializeApp } from "firebase/app";
import { CustomProvider, getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  connectAuthEmulator,
  EmailAuthProvider,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithRedirect,
  type OAuthCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut as authSignOut,
  unlink,
} from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { appCheckRefused, type OnlineDeps, refusedAddress } from "../session";
import type { Profile } from "../account";
import type { Achievement } from "../achievements";
import type { FinishedGame, GameResult, LeaderboardEntry } from "../results";
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
 * What coming back from Google came to. An account that's already someone's is left alone: by its Google account,
 * held so signing in to it needs no second trip; by its address, which then signs in with a password.
 */
export type SignInReturn =
  | { kind: "none" | "signed in" }
  | { kind: "taken"; byGoogle: boolean; email: string | null }
  | { kind: "password account"; email: string | null };

let googleAccount: OAuthCredential | null = null;

const codeOf = (e: unknown) => (e as { code?: string }).code;
const emailOf = (e: unknown) => (e as { customData?: { email?: string } }).customData?.email ?? null;

/** Sends the player to Google to make an account of the player here, keeping their games. The page comes back for `finishSignIn`. */
export async function createAccountWithGoogle(): Promise<void> {
  await signedIn();
  await linkWithRedirect(auth.currentUser!, new GoogleAuthProvider());
}

/**
 * Signs in to the player's Google account, leaving the games played here behind: at once if Google has just said it's
 * someone's, otherwise by sending the player to Google, which comes back for `finishSignIn`.
 */
export async function signInWithGoogle(): Promise<void> {
  await signedIn();
  const held = googleAccount;
  googleAccount = null;
  if (!held) return signInWithRedirect(auth, new GoogleAuthProvider());
  await signInWithCredential(auth, held);
  await refreshToken();
}

export async function finishSignIn(): Promise<SignInReturn> {
  try {
    if (!(await getRedirectResult(auth))) return { kind: "none" };
  } catch (e) {
    const code = codeOf(e);
    if (code === "auth/account-exists-with-different-credential") return { kind: "password account", email: emailOf(e) };
    if (code !== "auth/credential-already-in-use" && code !== "auth/email-already-in-use") throw e;
    const byGoogle = code === "auth/credential-already-in-use";
    googleAccount = byGoogle ? GoogleAuthProvider.credentialFromError(e as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]) : null;
    return { kind: "taken", byGoogle, email: emailOf(e) };
  }
  await refreshToken();
  return { kind: "signed in" };
}

/** Makes an account of the player here, keeping their games. It counts once the address is verified, by the email this sends. */
export async function createAccount(email: string, password: string): Promise<void> {
  await signedIn();
  try {
    await linkWithCredential(auth.currentUser!, EmailAuthProvider.credential(email, password));
  } catch (e) {
    if (codeOf(e) === "auth/email-already-in-use" || codeOf(e) === "auth/credential-already-in-use") throw Object.assign(new Error("taken"), { code: "taken" });
    throw e;
  }
  remember(MADE_HERE, auth.currentUser!.uid);
  await refreshToken();
  await sendVerification();
}

/** Signs in to an account, leaving the games played here behind. One still to be verified is sent another email. */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  await signedIn();
  await signInWithEmailAndPassword(auth, email, password);
  await refreshToken();
  if (!auth.currentUser!.emailVerified) await sendVerification();
}

/** Signed in or not, the player can sign in again to send another. */
async function sendVerification(): Promise<void> {
  await sendEmailVerification(auth.currentUser!, { url: homeHere() }).catch((e) => console.warn("couldn't send the verification email", e));
}

export const resendVerification = async (): Promise<void> => sendEmailVerification(auth.currentUser!, { url: homeHere() });

/** Says nothing of whether the address has an account, as with email enumeration protection on, where it can't. */
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email, { url: homeHere() }).catch((e) => {
    if (codeOf(e) !== "auth/user-not-found") throw e;
  });
}

/**
 * Takes back an address still to be verified, to make the account with another: from a player who added it here,
 * keeping them and their games, and otherwise by signing out, as the address may be all an account signed in to has.
 * Says whether the player is still the same.
 */
export async function forgetAddress(): Promise<boolean> {
  const user = auth.currentUser!;
  if (recalled(MADE_HERE) !== user.uid) {
    await signOut();
    return false;
  }
  await unlink(user, "password");
  await refreshToken();
  return true;
}

const MADE_HERE = "nethack-web.accountMadeHere";

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn("couldn't keep", key, e);
  }
}

function recalled(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const homeHere = () => `${location.origin}${location.pathname}`;

/** The server reads how the player signed in from the token, which has to say so now. */
async function refreshToken(): Promise<void> {
  await auth.currentUser?.getIdToken(true);
}

/** Forgets the account in this browser, in every tab. The next request makes a new anonymous player. */
export const signOut = () => authSignOut(auth);

export async function profile(): Promise<Profile> {
  await signedIn();
  const user = auth.currentUser!;
  // an address verified from another tab or device is only known once asked for, and the server reads it from the token
  if (user.email && !(await user.getIdTokenResult()).claims.email_verified) {
    await user.reload();
    if (user.emailVerified) await refreshToken();
  }
  return { ...(await userRequest<Omit<Profile, "email">>("profile", {})), email: user.email };
}

export const requestHandle = (input: { handle: string; sentAt: number }) => userRequest<{ status: "awaiting approval" }>("requestHandle", input);

export const startGame: OnlineDeps["startGame"] = (input) => userRequest("startGame", input);

export const listGames: OnlineDeps["listGames"] = (input) => userRequest("listGames", input);

export const resumeGame: OnlineDeps["resumeGame"] = (input) => userRequest("resumeGame", input);

export const finishedGames = (input: { sentAt: number }) => userRequest<{ games: FinishedGame[] }>("finishedGames", input);

export const deleteGame = (input: { game: string; sentAt: number }) => userRequest<{ status: "deleted" }>("deleteGame", input);

/** Scores a game that has just ended, through the batch that ended it; on a function of its own, as it replays the game. */
export async function scoreGame(input: { game: string; through: string; sentAt: number }): Promise<{ result?: GameResult }> {
  await signedIn();
  // longer than the server allows it, so its own answer comes first
  return (await httpsCallable<unknown, { result?: GameResult }>(functions, "score", { timeout: 310_000 })({ method: "scoreGame", input })).data;
}

export const leaderboard = (input: { sentAt: number }) => publicRequest<{ entries: LeaderboardEntry[] }>("leaderboard", input);

export const achievements = () => userRequest<{ achievements: Achievement[] }>("achievements", {});

/** Anyone may ask; the player gets their own game as soon as it ends, and others once it has been scored. */
export const watchGame = (input: { game: string; sentAt: number }) => publicRequest<{ recording: string } | null>("watchGame", input);

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
