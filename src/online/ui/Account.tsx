import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { HANDLE_FORMAT, HANDLE_HINT, type Profile, requestNote, signInFailure } from "../account";
import {
  askForHandle,
  createAccount,
  createAccountWithGoogle,
  forgetAddress,
  loadProfile,
  resendVerification,
  resetPassword,
  signInWithGoogle,
  signInWithPassword,
} from "../server/api";

interface AccountBarProps {
  profile: Profile | null;
  onSignIn: () => void;
  signingIn: boolean;
  onSignOut: () => void;
}

/** Who's signed in, in the landing bar, with their account's menu, or the way to sign in. */
export function AccountBar({ profile, onSignIn, signingIn, onSignOut }: AccountBarProps) {
  if (profile?.signedIn) return <AccountMenu profile={profile} onSignOut={onSignOut} />;
  return (
    <button type="button" class="account" onClick={onSignIn} disabled={signingIn}>
      {profile?.email ? "Verify Email…" : "Sign In"}
    </button>
  );
}

function AccountMenu({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  // before paint, so a key pressed as the menu appears already finds it listening
  useLayoutEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    const close = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [open]);
  const name = profile.handle ?? "Signed In";
  return (
    <div
      class="account-menu"
      onFocusOut={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {open ? <div class="menubar-backdrop" onMouseDown={() => setOpen(false)} /> : null}
      <button type="button" class="account" ref={button} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {name}
      </button>
      {open ? (
        <div class="account-popup">
          <div class="account-who">
            <strong>{name}</strong>
            {profile.email ? <span>{profile.email}</span> : null}
          </div>
          <hr />
          <div role="menu" aria-label="Account">
            <button
              type="button"
              role="menuitem"
              ref={first}
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A signed-in player's choice of handle, which the server grants in its own time. */
export function HandlePrompt({ profile, onProfile }: { profile: Profile; onProfile: (profile: Profile) => void }) {
  const [handle, setHandle] = useState("");
  const [state, setState] = useState<"choosing" | "sending" | "awaiting" | "failed">("choosing");
  const valid = HANDLE_FORMAT.test(handle);
  const note = state === "choosing" ? requestNote(profile) : null;
  const send = async () => {
    setState("sending");
    try {
      await askForHandle(handle);
      setState("awaiting");
      const fresh = await loadProfile();
      // a refusal comes back as a note on the request, to choose again
      if (fresh.handle || requestNote(fresh)) setState("choosing");
      onProfile(fresh);
    } catch (e) {
      console.warn("couldn't ask for a handle", e);
      setState("failed");
    }
  };
  return (
    <form
      class="frame handle-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && state !== "sending") void send();
      }}
    >
      <h2 class="frame-label">Choose your handle</h2>
      <p>The name others see on all your games and scores, whatever you call your characters. It can't be changed for now.</p>
      <label for="handle">Handle</label>
      <input id="handle" value={handle} maxLength={20} autoComplete="off" onInput={(e) => setHandle((e.target as HTMLInputElement).value)} aria-describedby="handle-hint" />
      <small id="handle-hint">{HANDLE_HINT}</small>
      <button type="submit" class="primary" disabled={!valid || state === "sending"}>
        Request Handle
      </button>
      {note ? <p role="alert">{note}</p> : null}
      {state === "awaiting" ? <p role="status">Checking your handle…</p> : null}
      {state === "failed" ? <p role="alert">Can't reach the server. Try again.</p> : null}
    </form>
  );
}

export type SignInTab = "new" | "sign in";

/** How the sign-in dialog opens: on which tab, and with what it has to say, as when Google has just found an account. */
export interface SignInStart {
  tab: SignInTab;
  email?: string;
  note?: string;
  /** The note is that the account exists, which Sign In Instead answers. */
  taken?: boolean;
}

interface SignInDialogProps {
  profile: Profile;
  /** The player's games here, which a new account keeps and signing in leaves behind. */
  games: number;
  start: SignInStart;
  onProfile: (profile: Profile) => void;
  onClose: () => void;
}

const RESEND_MS = 60_000;

/** Making an account of the player here, which keeps their games, or signing in to one they have, which doesn't. */
export function SignInDialog({ profile, games, start, onProfile, onClose }: SignInDialogProps) {
  const [tab, setTab] = useState<SignInTab>(start.tab);
  const [email, setEmail] = useState(start.email ?? "");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(start.note ?? "");
  const [taken, setTaken] = useState(start.taken ?? false);
  const [reset, setReset] = useState<"" | "sent" | "needs email" | "failed">("");
  const dialog = useRef<HTMLDivElement>(null);
  const verifying = profile.email !== null && !profile.signedIn;
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  useEffect(() => dialog.current?.querySelector<HTMLElement>("[data-first]")?.focus(), [verifying]);
  const fail = (e: unknown, withGoogle = false) => {
    console.warn("couldn't sign in", e);
    const code = (e as { code?: string }).code;
    setTaken(code === "taken");
    setNote(withGoogle ? "Couldn't sign in with Google. Try again." : signInFailure(code));
    setBusy(false);
  };
  const choose = (next: SignInTab) => {
    setTab(next);
    setNote("");
    setTaken(false);
    setReset("");
  };
  const submit = async () => {
    setBusy(true);
    setNote("");
    setReset("");
    try {
      await (tab === "new" ? createAccount(email, password) : signInWithPassword(email, password));
      const fresh = await loadProfile();
      if (fresh.signedIn) location.reload();
      else {
        setBusy(false);
        onProfile(fresh);
      }
    } catch (e) {
      fail(e);
    }
  };
  // Preact's types allow an input one type or the other, not a choice of them
  const passwordType = (shown ? "text" : "password") as "password";
  const google = () => {
    setBusy(true);
    setNote("");
    // making an account leaves for Google; signing in to one Google has just found doesn't
    (tab === "new" ? createAccountWithGoogle() : signInWithGoogle().then(() => location.reload())).catch((e) => fail(e, true));
  };
  const sendReset = () => {
    setNote("");
    if (!email) return setReset("needs email");
    resetPassword(email).then(
      () => setReset("sent"),
      (e) => {
        console.warn("couldn't send a password reset", e);
        setReset("failed");
      },
    );
  };
  return (
    <div class="dialog-backdrop sign-in-backdrop">
      <div class="frame sign-in-dialog" role="dialog" aria-modal="true" aria-labelledby="sign-in-title" ref={dialog}>
        <h2 class="frame-label" id="sign-in-title">
          {verifying ? "Check your email" : "Account"}
        </h2>
        <button type="button" class="dialog-close" aria-label="Close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {verifying ? (
          <Verify email={profile.email!} onProfile={onProfile} />
        ) : (
          <>
            <div class="sign-in-tabs" role="tablist" aria-label="Account">
              {(["new", "sign in"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  id={`sign-in-tab-${t === "new" ? "new" : "existing"}`}
                  aria-selected={tab === t}
                  aria-controls="sign-in-panel"
                  tabIndex={tab === t ? 0 : -1}
                  data-first={tab === t ? "" : undefined}
                  onClick={() => choose(t)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    const other = t === "new" ? "sign in" : "new";
                    choose(other);
                    (e.currentTarget.parentElement?.querySelector(`[aria-controls][tabindex]:not([aria-selected="true"])`) as HTMLElement | null)?.focus();
                  }}
                >
                  {t === "new" ? "New Account" : "Sign In"}
                </button>
              ))}
            </div>
            <div id="sign-in-panel" role="tabpanel" aria-labelledby={`sign-in-tab-${tab === "new" ? "new" : "existing"}`}>
            <form
              class="sign-in-panel"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void submit();
              }}
            >
              {games > 0 ? <p>{tab === "new" ? gamesKept(games) : gamesSwapped(games)}</p> : null}
              <button type="button" class="sign-in-google" disabled={busy} onClick={google}>
                <GoogleMark />
                {tab === "new" ? "Create Account with Google" : "Sign In with Google"}
              </button>
              <div class="sign-in-or" aria-hidden="true">
                <span />
                or
                <span />
              </div>
              {note ? (
                <p class="sign-in-note" role="alert">
                  {note}{" "}
                  {taken ? (
                    <button
                      type="button"
                      class="link-inline"
                      onClick={() => {
                        choose("sign in");
                        // this button goes with the note it ends
                        document.getElementById("sign-in-tab-existing")?.focus();
                      }}
                    >
                      Sign In Instead
                    </button>
                  ) : null}
                </p>
              ) : null}
              <label for="sign-in-email">Email</label>
              <input id="sign-in-email" type="email" required autoComplete="username" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
              <label for="sign-in-password">Password</label>
              <div class="sign-in-password">
                <input
                  id="sign-in-password"
                  type={passwordType}
                  required
                  minLength={6}
                  autoComplete={tab === "new" ? "new-password" : "current-password"}
                  value={password}
                  onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                />
                <button type="button" aria-pressed={shown} onClick={() => setShown(!shown)}>
                  {shown ? "Hide" : "Show"}
                </button>
              </div>
              <div class="sign-in-row">
                <button type="submit" class="primary" disabled={busy}>
                  {tab === "new" ? "Create Account" : "Sign In"}
                </button>
                {tab === "sign in" ? (
                  <button type="button" class="link-inline" onClick={sendReset}>
                    Reset Password
                  </button>
                ) : null}
              </div>
              {reset === "sent" ? <p role="status">If {email} has an account, an email to set a new password is on its way.</p> : null}
              {reset === "needs email" ? <p role="alert">Enter your email, then choose Reset Password.</p> : null}
              {reset === "failed" ? <p role="alert">Couldn't send it. Check the email, and try again.</p> : null}
            </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Waiting for the player to open the link sent to their address, which signs them in here once they have. */
function Verify({ email, onProfile }: { email: string; onProfile: (profile: Profile) => void }) {
  const [resent, setResent] = useState<"" | "sent" | "failed">("");
  // an email has only just gone, to make the account or sign in
  const [waiting, setWaiting] = useState(true);
  const [forgetting, setForgetting] = useState(false);
  useEffect(() => {
    const cooled = setTimeout(() => setWaiting(false), RESEND_MS);
    return () => clearTimeout(cooled);
  }, []);
  useEffect(() => {
    // the link is opened in another tab, or on another device
    const check = () => {
      if (document.visibilityState !== "visible") return;
      loadProfile().then(
        (p) => p.signedIn && location.reload(),
        (e) => console.warn("couldn't read the profile", e),
      );
    };
    addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  const resend = () => {
    setWaiting(true);
    resendVerification().then(
      () => {
        setResent("sent");
        setTimeout(() => setWaiting(false), RESEND_MS);
      },
      (e) => {
        console.warn("couldn't send the verification email", e);
        setResent("failed");
        setTimeout(() => setWaiting(false), RESEND_MS);
      },
    );
  };
  const another = () => {
    setForgetting(true);
    forgetAddress()
      .then(async (same) => (same ? onProfile(await loadProfile()) : location.reload()))
      .catch((e) => {
        console.warn("couldn't forget the address", e);
        setForgetting(false);
      });
  };
  return (
    <div class="sign-in-panel">
      <p>
        Open the link sent to <strong>{email}</strong>. You're signed in here as soon as you have.
      </p>
      <p class="sign-in-aside">Not there? Check your spam folder.</p>
      {resent === "sent" ? <p role="status">Sent again. It can take a minute to arrive.</p> : null}
      {resent === "failed" ? <p role="alert">Couldn't send it. Try again.</p> : null}
      <div class="sign-in-row">
        <button type="button" data-first="" disabled={waiting} onClick={resend}>
          Send Again
        </button>
        <button type="button" class="link-inline" disabled={forgetting} onClick={another}>
          Use Another Email
        </button>
      </div>
    </div>
  );
}

const gamesKept = (n: number) => (n === 1 ? "Your game comes with you." : `Your ${n} games come with you.`);

const gamesSwapped = (n: number) =>
  n === 1 ? "Signing in swaps your game here for that account's. New Account keeps it." : `Signing in swaps your ${n} games here for that account's. New Account keeps them.`;

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}
