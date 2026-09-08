import { FormEvent, useEffect, useRef, useState } from "react";
import { usePoll } from "../lib/usePoll";
import { api } from "../lib/api";
import { Avatar } from "./ui";
import { IconSend } from "./icons";
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
    <div className="flex h-[62vh] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto py-1 pr-1">
        {!data ? (
          <ChatSkeleton />
        ) : data.messages.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-sm font-semibold text-navy">No messages yet</p>
              <p className="mt-1 text-xs text-navy-400">
                Match updates land here automatically. Say hi.
              </p>
            </div>
          </div>
        ) : (
          data.messages.map((m) =>
            m.kind === "system" ? (
              <p
                key={m.id}
                className="mx-auto w-fit rounded-full border border-paper-line bg-paper-soft px-3 py-1 text-center text-xs font-medium text-navy-500"
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
                    className="mt-4 shrink-0"
                  />
                )}
                <div className={`max-w-[80%] ${m.isYou ? "items-end text-right" : ""} flex flex-col`}>
                  {!m.isYou && (
                    <p className="mb-0.5 px-1 text-xs font-semibold text-navy-400">
                      {m.author?.displayName}
                    </p>
                  )}
                  <p
                    className={`inline-block px-3.5 py-2 text-sm leading-relaxed ${
                      m.isYou
                        ? "rounded-2xl rounded-br-md bg-brand-500 text-white"
                        : "rounded-2xl rounded-bl-md border border-paper-line bg-paper-card text-navy"
                    }`}
                  >
                    {m.body}
                  </p>
                  <p className="mt-1 px-1 text-[10px] text-navy-300">
                    {relativeTime(m.createdAt)}
                  </p>
                </div>
              </div>
            ),
          )
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={send}
        className="mt-2 flex items-center gap-2 border-t border-paper-line pt-3"
      >
        <input
          className="field flex-1"
          placeholder="Message the group…"
          maxLength={LIMITS.message.max}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="btn-primary grid h-12 w-12 shrink-0 place-items-center !px-0"
          disabled={busy || !text.trim()}
          aria-label="Send message"
        >
          <IconSend size={18} />
        </button>
      </form>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-3 py-2">
      <div className="skeleton mx-auto h-6 w-40 rounded-full" />
      <div className="flex gap-2">
        <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
        <div className="skeleton h-10 w-2/5" />
      </div>
      <div className="flex flex-row-reverse gap-2">
        <div className="skeleton h-10 w-1/2" />
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
        <div className="skeleton h-14 w-3/5" />
      </div>
    </div>
  );
}
