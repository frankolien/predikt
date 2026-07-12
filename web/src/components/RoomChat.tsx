import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { api, streamRoomChat, type ChatMessage, type RoomKind } from "../lib/api";
import { Avatar, Card, Eyebrow, LiveDot } from "./ui";
import { cn } from "../lib/cn";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Live group chat for a room — a pool, a cup, or a fantasy league. The people who joined
 * this room, talking in real time. History loads once; new messages arrive over an SSE
 * stream (including the sender's own echo from the server, so every client renders the
 * SAME canonical copy). Membership is enforced server-side; a non-member's history fetch
 * 403s and we render nothing. One component, dropped into all three room views.
 */
export function RoomChat({ kind, id, meId }: { kind: RoomKind; id: string; meId?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [gated, setGated] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Append de-duped by id — the stream echoes the sender's own message, and send()
  // also returns it, so the same id can arrive twice.
  const merge = (incoming: ChatMessage[]) =>
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const add = incoming.filter((m) => !seen.has(m.id));
      return add.length ? [...prev, ...add] : prev;
    });

  useEffect(() => {
    let live = true;
    setMessages([]);
    setGated(false);
    api.rooms.chat
      .list(kind, id)
      .then((r) => live && setMessages(r.messages))
      .catch(() => live && setGated(true)); // not a member (403) → no chat surface
    const stop = streamRoomChat(kind, id, (m) => merge([m]));
    return () => {
      live = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  // Stick to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { message } = await api.rooms.chat.send(kind, id, body);
      merge([message]);
      setText(""); // keep the text on failure so nothing is lost
    } catch {
      /* leave the input intact for a retry */
    } finally {
      setSending(false);
    }
  };

  if (gated) return null;

  return (
    <Card className="flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>room chat</Eyebrow>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-steel">
          <LiveDot /> live
        </span>
      </div>

      <div ref={scrollRef} className="flex max-h-72 min-h-[3rem] flex-col gap-2.5 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-faint">Be the first to call it in the room.</p>
        ) : (
          messages.map((m) => {
            const mine = !!meId && m.userId === meId;
            return (
              <div key={m.id} className={cn("flex items-start gap-2", mine && "flex-row-reverse")}>
                <Avatar seed={m.handle} size={26} />
                <div className={cn("flex max-w-[78%] flex-col", mine && "items-end")}>
                  <div className={cn("flex items-baseline gap-2", mine && "flex-row-reverse")}>
                    <span className="font-mono text-[11px] font-semibold text-silver">{mine ? "You" : m.handle}</span>
                    <span className="font-mono text-[10px] tabular-nums text-faint">{time(m.createdAt)}</span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 whitespace-pre-wrap break-words rounded-default px-3 py-1.5 text-[13px] leading-snug text-chalk",
                      mine ? "bg-live-soft" : "bg-panel-2",
                    )}
                  >
                    {m.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          maxLength={500}
          placeholder="Message the room…"
          className="flex-1 rounded-default border border-edge-2 bg-panel-2 px-3 py-2 text-[13px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          aria-label="Send message"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-default border border-edge-2 text-silver hover:border-live hover:text-live disabled:opacity-40 disabled:hover:border-edge-2 disabled:hover:text-silver"
        >
          <Send size={15} />
        </button>
      </div>
    </Card>
  );
}
