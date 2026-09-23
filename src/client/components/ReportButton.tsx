import { useState } from "react";
import { api, ApiRequestError } from "../lib/api";
import { Button, Modal } from "./ui";
import { useLang, type Key } from "../lib/i18n";

const CONTENT_REASONS: { id: string; key: Key }[] = [
  { id: "incorrect_info", key: "report.content.incorrect_info" },
  { id: "inappropriate", key: "report.content.inappropriate" },
  { id: "spam", key: "report.content.spam" },
  { id: "other", key: "report.other" },
];

/** Behavior reports (a person, or something someone said) skip the
 *  content-accuracy reason and lead with harassment instead. */
const BEHAVIOR_REASONS: { id: string; key: Key }[] = [
  { id: "harassment", key: "report.behavior.harassment" },
  { id: "inappropriate", key: "report.behavior.inappropriate" },
  { id: "spam", key: "report.behavior.spam" },
  { id: "other", key: "report.other" },
];

/** Shared report-a-problem flow — used for activities, groups, and (once a
 *  screen exists for them) members/messages. One report system, one UI. */
export function ReportButton({
  targetType,
  targetId,
  label,
  modalTitle,
}: {
  targetType: "activity" | "group" | "member" | "message";
  targetId: string;
  label: string;
  modalTitle: string;
}) {
  const { t } = useLang();
  const reasons = targetType === "member" || targetType === "message"
    ? BEHAVIOR_REASONS
    : CONTENT_REASONS;
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<string>(reasons[0].id);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="animate-float-up text-center text-xs text-navy-400">
        {t("report.thanks")}
      </p>
    );
  }

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/reports", {
        method: "POST",
        body: { targetType, targetId, reason, detail: detail.trim() },
      });
      setSent(true);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : t("report.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="text-center text-xs font-medium text-navy-400 underline underline-offset-2 transition-colors hover:text-navy"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <Modal title={modalTitle} onClose={() => setOpen(false)}>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold text-navy-700">
              {t("report.whatIssue")}
            </legend>
            {reasons.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-paper-line px-3 py-2.5 text-sm transition-colors has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
              >
                <input
                  type="radio"
                  name="reason"
                  className="h-4 w-4 accent-brand-500"
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                />
                {t(r.key)}
              </label>
            ))}
          </fieldset>
          <textarea
            className="field mt-3 min-h-[80px] resize-none"
            placeholder={t("report.placeholder")}
            maxLength={1000}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          {err && <p className="mt-2 text-sm font-medium text-danger-600">{err}</p>}
          <Button className="mt-3 w-full" loading={busy} onClick={submit}>
            {t("report.send")}
          </Button>
        </Modal>
      )}
    </>
  );
}
