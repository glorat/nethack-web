import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { HANDLE_FORMAT, HANDLE_HINT, type Profile, requestNote } from "../account";
import { askForHandle, loadProfile, signInWithPassword } from "../server/api";

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
      Sign In with Google
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
      <p>The name others see beside your games and scores, whatever you call your characters. It can't be changed for now.</p>
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

/** Sign-in by email and password, for a player not yet signed in. */
export function PasswordSignIn({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"ready" | "sending" | "failed">("ready");
  if (profile.email) {
    return (
      <section class="frame password-sign-in">
        <h2 class="frame-label">Verify your email</h2>
        <p>Open the link sent to {profile.email}, then reload this page.</p>
        <button type="button" onClick={onSignOut}>
          Sign Out
        </button>
      </section>
    );
  }
  const send = async () => {
    setState("sending");
    try {
      await signInWithPassword(email, password);
      location.reload();
    } catch (e) {
      console.warn("couldn't sign in", e);
      setState("failed");
    }
  };
  return (
    <form
      class="frame password-sign-in"
      onSubmit={(e) => {
        e.preventDefault();
        if (state !== "sending") void send();
      }}
    >
      <h2 class="frame-label">Sign in with a password</h2>
      <label for="password-email">Email</label>
      <input id="password-email" type="email" required autoComplete="username" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
      <label for="password">Password</label>
      <input id="password" type="password" required minLength={6} autoComplete="current-password" value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
      <button type="submit" class="primary" disabled={state === "sending"}>
        Sign In
      </button>
      {state === "failed" ? <p role="alert">Couldn't sign in. Check the email and password, and try again.</p> : null}
    </form>
  );
}
