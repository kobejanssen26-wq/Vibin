import { useState } from "react";
import { IconCheck, IconShare } from "./icons";

export function InviteBox({
  code,
  url,
}: {
  code: string | null;
  url: string | null;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  if (!code || !url) return null;

  const copy = async (what: "code" | "link", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked — the value is visible to copy manually */
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my VIBIN group", url });
      } catch {
        /* cancelled */
      }
    } else {
      void copy("link", url);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="eyebrow">Invite code</p>
          <button
            type="button"
            onClick={() => copy("code", code)}
            className="press mt-1 font-mono text-xl font-bold tracking-[0.2em] text-navy"
          >
            {code}
          </button>
        </div>
        <button
          type="button"
          onClick={() => copy("code", code)}
          className="btn-outline px-3 py-1.5 text-[13px]"
        >
          {copied === "code" ? (
            <span className="inline-flex items-center gap-1 text-lime-600">
              <IconCheck size={13} /> Copied
            </span>
          ) : (
            "Copy"
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-paper-line px-4 py-3">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="field flex-1 truncate bg-paper-soft/60 text-xs"
        />
        <button
          className="btn-primary shrink-0 px-3 py-2.5 text-[13px]"
          onClick={share}
        >
          <IconShare size={14} /> Share
        </button>
      </div>
    </div>
  );
}
