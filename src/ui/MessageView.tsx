import { useEffect, useRef } from "preact/hooks";
import { messageLook } from "../port/messages";
import type { Message } from "../port/state";

export function MessageView({ messages, batch }: { messages: Message[]; batch: number }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  return (
    <div class="messages" ref={list}>
      {messages.map((m) => {
        const classes = m.separator ? ["separator"] : [m.batch === batch && "current", messageLook(m.text, m.attr)];
        return (
          <div key={m.id} class={["message", ...classes].filter(Boolean).join(" ")}>
            {m.text}
          </div>
        );
      })}
    </div>
  );
}
