import { useState } from "preact/hooks";
import { HANDLE_FORMAT, HANDLE_HINT, type Profile, requestNote } from "../account";
import { askForHandle, loadProfile } from "../server/api";

/** Who's signed in, in the landing bar, or the way to sign in. */
export function AccountBar({ profile, onSignIn, signingIn }: { profile: Profile | null; onSignIn: () => void; signingIn: boolean }) {
  if (profile?.signedIn) return <span class="account">{profile.handle ? `Signed in as ${profile.handle}` : "Signed in"}</span>;
  return (
    <button type="button" class="account" onClick={onSignIn} disabled={signingIn}>
      Sign In with Google
    </button>
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
      class="landing-panel handle-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && state !== "sending") void send();
      }}
    >
      <h2>Choose your handle</h2>
      <p>Your public name on the server, shown with your online games and scores whatever you call your characters. It can't be changed for now.</p>
      <label for="handle">Handle</label>
      <input id="handle" value={handle} maxLength={20} autoComplete="off" onInput={(e) => setHandle((e.target as HTMLInputElement).value)} aria-describedby="handle-hint" />
      <small id="handle-hint">{HANDLE_HINT}</small>
      <button type="submit" class="primary" disabled={!valid || state === "sending"}>
        Request Handle
      </button>
      {note ? <p role="alert">{note}</p> : null}
      {state === "awaiting" ? <p role="status">Your request to set your handle is awaiting approval.</p> : null}
      {state === "failed" ? <p role="alert">Can't reach the server. Try again.</p> : null}
    </form>
  );
}
