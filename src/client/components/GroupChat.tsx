import { FormEvent, useEffect, useRef, useState } from "react";
import { usePoll } from "../lib/usePoll";
import { api } from "../lib/api";
import { Avatar, Spinner } from "./ui";
import { relativeTime } from "../lib/format";
import type { MessageDTO } from "@shared/types";
import { LIMITS } from "@shared/constants";

export function GroupChat({ groupId }: { groupId: string }) {
  const { data, refetch } = usePoll<{ messages: MessageDTO[] }>(
    `/groups/${groupId}/messages`,
    4000,
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api(`/groups/${groupId}/messages`, { method: "POST", body: { body } });
      setText("");
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[60vh] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pb-3">
        {!data ? (
          <div className="grid place-items-center py-10 text-ink-muted">
            <Spinner />
          </div>
        ) : (
          data.messages.map((m) =>
            m.kind === "system" ? (
              <p
                key={m.id}
                className="mx-auto w-fit rounded-full bg-ink/5 px-3 py-1 text-center text-xs font-medium text-ink-muted"
              >
                {m.body}
              </p>
            ) : (
              <div
                key={m.id}
                className={`flex gap-2 ${m.isYou ? "flex-row-reverse" : ""}`}
              >
                {!m.isYou && (
                  <Avatar
                    name={m.author?.displayName ?? "?"}
                    url={m.author?.avatarUrl}
                    size={28}
                  />
                )}
                <div className={`max-w-[78%] ${m.isYou ? "text-right" : ""}`}>
                  {!m.isYou && (
                    <p className="text-xs font-semibold text-ink-muted">
                      {m.author?.displayName}
                    </p>
                  )}
                  <p
                    className={`inline-block rounded-2xl px-3 py-2 text-sm ${
                      m.isYou
                        ? "bg-mingo-gradient text-white"
                        : "bg-paper-soft text-ink"
                    }`}
                  >
                    {m.body}
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-muted">
                    {relativeTime(m.createdAt)}
                  </p>
                </div>
              </div>
            ),
          )
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-ink/5 pt-3">
        <input
          className="field flex-1"
          placeholder="Message the group…"
          maxLength={LIMITS.message.max}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary px-4" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
