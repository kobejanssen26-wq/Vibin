import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui";
import { api, ApiRequestError } from "../lib/api";
import { useLang } from "../lib/i18n";
import type { GroupDTO } from "@shared/types";

/**
 * Accepts a bare code ("ABC123") or a pasted invite link
 * ("vibin.be/join/ABC123", with or without protocol) and extracts the code —
 * users copy/paste the whole link far more often than the code alone.
 */
function extractCode(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/\/join\/([A-Za-z0-9]+)/i);
  if (m) return m[1]!.toUpperCase();
  return trimmed.replace(/\s+/g, "").toUpperCase();
}

export function JoinGroupBox() {
  const { t } = useLang();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = extractCode(code);
    if (!clean) return;
    setBusy(true);
    setErr(null);
    try {
      const { group } = await api<{ group: GroupDTO }>(`/invites/${clean}/join`, {
        method: "POST",
        body: {},
      });
      nav(`/groups/${group.id}`);
    } catch (e) {
      setErr(
        e instanceof ApiRequestError ? e.message : t("joinBox.error"),
      );
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-dashed border-paper-line px-4 py-4">
      <h2 className="text-sm font-bold text-navy-700">{t("joinBox.title")}</h2>
      <p className="mt-0.5 text-xs text-navy-400">
        {t("joinBox.subtitle")}
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-start gap-2">
        <input
          aria-label={t("joinBox.inviteCode")}
          placeholder="ABC123 or vibin.be/join/ABC123"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="field min-w-0 flex-1"
        />
        <Button type="submit" variant="outline" loading={busy} disabled={!code.trim()}>
          {t("joinBox.submit")}
        </Button>
      </form>
      {err && (
        <p className="mt-2 animate-float-up text-xs font-medium text-danger-600">{err}</p>
      )}
    </div>
  );
}
