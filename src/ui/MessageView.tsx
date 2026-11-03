import { useEffect, useRef } from "preact/hooks";
import type { Message } from "../port/state";

export function MessageView({ messages, batch }: { messages: Message[]; batch: number }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  return (
    <div class="messages" ref={list}>
      {messages.map((m) => (
        <div key={m.id} class={`message${m.separator ? " separator" : m.batch === batch ? " current" : ""}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
}
