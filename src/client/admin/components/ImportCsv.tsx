import { useRef, useState } from "react";
import { cc } from "../api";
import { Badge, Btn, Panel, Select } from "../ui";

interface PreviewResp {
  importId: string;
  totalRows: number;
  createCount: number;
  updateCount: number;
  duplicateCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
  duplicates: { row: number; title: string; reason: string; existingId: string; existingTitle: string }[];
  truncated: { errors: boolean; duplicates: boolean };
}
type Decision = "skip" | "update" | "create";

export function ImportCsv({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  const reset = () => {
    setFileName(null);
    setPreview(null);
    setDecisions({});
    setErr(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    setErr(null);
    setPreview(null);
    setResult(null);
    setBusy(true);
    try {
      const csv = await file.text();
      const resp = await cc<PreviewResp>("/activities/import/preview", {
        method: "POST",
        body: { csv },
      });
      setPreview(resp);
      const initial: Record<number, Decision> = {};
      resp.duplicates.forEach((d) => (initial[d.row] = "skip"));
      setDecisions(initial);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await cc<{ created: number; updated: number; skipped: number }>(
        "/activities/import/confirm",
        {
          method: "POST",
          body: { importId: preview.importId, duplicateDecisions: decisions },
        },
      );
      setResult(r);
      onImported();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Btn variant="neutral" onClick={() => setOpen(true)}>
        Import CSV
      </Btn>
    );
  }

  return (
    <Panel
      className="mb-4"
      title="Import activities from CSV"
      right={
        <Btn
          variant="ghost"
          className="!py-1 !text-xs"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Close
        </Btn>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/admin/cc/activities/import/template.csv"
          className="text-[13px] font-medium text-brand-600 hover:underline"
        >
          Download CSV template
        </a>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="text-[13px]"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {fileName && <span className="text-xs text-slate-500">{fileName}</span>}
      </div>

      {busy && !preview && !result && <p className="mt-3 text-xs text-slate-500">Reading and validating…</p>}
      {err && <p className="mt-3 text-xs font-medium text-rose-600">{err}</p>}

      {result && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">
          Imported: {result.created} created, {result.updated} updated, {result.skipped} skipped.
        </div>
      )}

      {preview && !result && (
        <div className="mt-4">
          <p className="text-[13px] text-slate-700">
            {preview.totalRows} rows — <strong>{preview.createCount}</strong> new,{" "}
            <strong>{preview.updateCount}</strong> updates by id,{" "}
            <strong>{preview.duplicateCount}</strong> possible duplicates,{" "}
            <strong className={preview.errorCount ? "text-rose-600" : ""}>{preview.errorCount}</strong> invalid.
          </p>

          {preview.errors.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-bold uppercase text-slate-500">
                Errors {preview.truncated.errors && `(first ${preview.errors.length})`}
              </h4>
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs">
                {preview.errors.map((e) => (
                  <li key={e.row} className="text-rose-600">
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.duplicates.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-bold uppercase text-slate-500">
                Possible duplicates {preview.truncated.duplicates && `(first ${preview.duplicates.length})`} — choose what to do with each
              </h4>
              <div className="mt-1 max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.duplicates.map((d) => (
                      <tr key={d.row} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-400">#{d.row}</td>
                        <td className="py-1.5 pr-2">
                          <div className="font-medium text-slate-800">{d.title}</div>
                          <div className="text-slate-500">
                            {d.reason} — matches <Badge tone="amber">{d.existingTitle}</Badge>
                          </div>
                        </td>
                        <td className="py-1.5">
                          <Select
                            value={decisions[d.row] ?? "skip"}
                            onChange={(e) =>
                              setDecisions((s) => ({ ...s, [d.row]: e.target.value as Decision }))
                            }
                          >
                            <option value="skip">Skip</option>
                            <option value="update">Update existing</option>
                            <option value="create">Create anyway</option>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Btn variant="primary" loading={busy} onClick={confirm}>
              Confirm import
            </Btn>
            <Btn variant="ghost" onClick={reset}>
              Cancel
            </Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}
