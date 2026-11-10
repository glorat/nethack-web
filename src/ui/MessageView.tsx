import { useEffect, useRef } from "preact/hooks";
import { messageHint } from "../port/hints";
import { isUrgent, messageLook, pinnedMessage } from "../port/messages";
import type { Message } from "../port/state";
import type { HintMarker } from "./hints";

export function MessageView({
  messages,
  batch,
  letGo,
  onLetGo,
  hint,
}: {
  messages: Message[];
  batch: number;
  letGo: number;
  onLetGo(id: number): void;
  hint: HintMarker;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const pinned = pinnedMessage(messages, letGo);
  return (
    <div class="messages" ref={list}>
      {messages.map((m) => {
        const classes = m.separator
          ? ["separator"]
          : [m.batch === batch && "current", messageLook(m.text, m.attr), isUrgent(m.attr) && "urgent", m.id === pinned && "pinned"];
        return (
          <div
            key={m.id}
            class={["message", ...classes].filter(Boolean).join(" ")}
            title={m.id === pinned ? "Kept in view. Click to let it scroll away." : undefined}
            onClick={m.id === pinned ? () => onLetGo(m.id) : undefined}
          >
            {m.text}
            {m.separator ? null : hint(messageHint(m.text))}
          </div>
        );
      })}
    </div>
  );
}
