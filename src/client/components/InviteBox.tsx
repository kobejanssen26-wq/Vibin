import { useState } from "react";

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
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the value is visible to copy manually */
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my Mingo group", url });
      } catch {
        /* user cancelled */
      }
    } else {
      void copy("link", url);
    }
  };

  return (
    <div className="card p-4">
      <p className="text-sm font-bold">Invite your crew</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 rounded-xl bg-paper-soft px-3 py-2 text-center text-lg font-extrabold tracking-widest">
          {code}
        </code>
        <button
          className="btn-ghost px-3 py-2 text-sm"
          onClick={() => copy("code", code)}
        >
          {copied === "code" ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input readOnly value={url} className="field flex-1 text-xs" />
        <button
          className="btn-ghost px-3 py-2 text-sm"
          onClick={() => copy("link", url)}
        >
          {copied === "link" ? "Copied" : "Copy"}
        </button>
      </div>
      <button className="btn-primary mt-3 w-full py-2 text-sm" onClick={share}>
        Share invite link
      </button>
    </div>
  );
}
