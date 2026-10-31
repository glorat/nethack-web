import type { ShadowStatus } from "../protocol";

interface Props {
  status: ShadowStatus | null;
  onDownload(): void;
}

function summary(status: ShadowStatus | null): string {
  if (!status) return "Shadow: starting";
  if (status.state === "following") return `Shadow: following, turn ${status.turn}`;
  if (status.state === "ended") return `Shadow: matched to the end, turn ${status.turn}`;
  return `Shadow: went differently at turn ${status.turn}: ${status.message}`;
}

export function ShadowBar({ status, onDownload }: Props) {
  return (
    <div class="replay-bar" role="status" aria-label="Shadow">
      <span class={status?.state === "mismatch" ? "replay-error" : undefined}>{summary(status)}</span>
      <span class="replay-spacer" />
      <button onClick={onDownload}>Download Debug Package</button>
    </div>
  );
}
