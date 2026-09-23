import { useState } from "react";
import { IconCheck, IconShare } from "./icons";
import { useLang } from "../lib/i18n";

export function InviteBox({
  code,
  url,
}: {
  code: string | null;
  url: string | null;
}) {
  const { t } = useLang();
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
        await navigator.share({ title: t("invite.shareTitle"), url });
      } catch {
        /* user cancelled */
      }
    } else {
      void copy("link", url);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <p className="eyebrow">{t("invite.title")}</p>
      </div>

      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => copy("code", code)}
          className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-paper-line bg-paper-soft/60 px-4 py-3 transition-colors hover:border-brand-300"
        >
          <span className="flex-1 text-left font-mono text-2xl font-extrabold tracking-[0.35em] text-navy">
            {code}
          </span>
          <span className="text-xs font-bold text-navy-400 group-hover:text-brand-600">
            {copied === "code" ? (
              <span className="inline-flex items-center gap-1 text-lime-600">
                <IconCheck size={14} /> {t("invite.copied")}
              </span>
            ) : (
              t("invite.tapToCopy")
            )}
          </span>
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
          className="btn-outline shrink-0 px-3 py-2.5 text-sm"
          onClick={() => copy("link", url)}
        >
          {copied === "link" ? t("invite.copied") : t("invite.copy")}
        </button>
      </div>

      <div className="border-t border-paper-line p-3">
        <button className="btn-primary w-full" onClick={share}>
          <IconShare size={16} /> {t("invite.share")}
        </button>
      </div>
    </div>
  );
}
