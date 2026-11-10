import { useEffect, useRef, useState } from "preact/hooks";
import { messageHint } from "../port/hints";
import { isPinned, isUrgent, messageLook } from "../port/messages";
import type { Message } from "../port/state";
import type { HintMarker } from "./hints";

export function MessageView({ messages, batch, hint }: { messages: Message[]; batch: number; hint: HintMarker }) {
  const list = useRef<HTMLDivElement>(null);
  // urgent messages up to this id scroll away like the rest
  const [letGo, setLetGo] = useState(-1);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  return (
    <div class="messages" ref={list}>
      {messages.map((m) => {
        const pinned = !m.separator && isPinned(m, batch, letGo);
        const classes = m.separator
          ? ["separator"]
          : [m.batch === batch && "current", messageLook(m.text, m.attr), isUrgent(m.attr) && "urgent", pinned && "pinned"];
        return (
          <div
            key={m.id}
            class={["message", ...classes].filter(Boolean).join(" ")}
            title={pinned ? "Kept in view. Click to let it scroll away." : undefined}
            onClick={pinned ? () => setLetGo(m.id) : undefined}
          >
            {m.text}
            {m.separator ? null : hint(messageHint(m.text))}
          </div>
        );
      })}
    </div>
  );
}
