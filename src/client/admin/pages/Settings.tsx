import { useEffect, useState } from "react";
import { cc } from "../api";
import { useResource } from "../lib";
import {
  Badge,
  Btn,
  ErrorNote,
  Field,
  Input,
  Loading,
  Panel,
  PageTitle,
} from "../ui";

interface SettingsResp {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  previewAccessSet: boolean;
  encryptionConfigured: boolean;
  recoveryConfigured: boolean;
  emailConfigured: boolean;
}

export function Settings() {
  const { data, loading, error, reload } = useResource<SettingsResp>(
    () => cc<SettingsResp>("/settings"),
    "settings",
  );
  const [msg, setMsg] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (data) setMsg(data.maintenanceMessage);
  }, [data]);

  const put = async (key: string, value: string) => {
    setBusy(key);
    setNote(null);
    try {
      await cc("/settings", { method: "PUT", body: { key, value } });
      reload();
      setNote("Saved.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageTitle title="Settings" />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {note && (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
          {note}
        </p>
      )}

      {data && (
        <div className="space-y-4">
          <Panel title="Maintenance mode">
            <div className="flex items-center gap-3">
              <Badge tone={(data.maintenanceMode ? "red" : "green") as never}>
                {data.maintenanceMode ? "ON — users see a maintenance screen" : "off"}
              </Badge>
              <Btn
                variant={data.maintenanceMode ? "neutral" : "danger"}
                loading={busy === "maintenance_mode"}
                onClick={() => {
                  if (
                    data.maintenanceMode ||
                    confirm(
                      "Turn ON maintenance mode? All normal users will get a 503 until you turn it off. The Command Center stays reachable.",
                    )
                  ) {
                    put("maintenance_mode", data.maintenanceMode ? "0" : "1");
                  }
                }}
              >
                {data.maintenanceMode ? "Turn off" : "Turn on"}
              </Btn>
            </div>
            <div className="mt-4 max-w-lg">
              <Field label="Message shown to users">
                <Input
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder="Back in a few minutes."
                  className="w-full"
                />
              </Field>
              <Btn
                variant="neutral"
                className="mt-2"
                loading={busy === "maintenance_message"}
                onClick={() => put("maintenance_message", msg)}
              >
                Save message
              </Btn>
            </div>
          </Panel>

          <Panel
            title="Toegangscode (binnenkort-pagina)"
            subtitle="Terwijl onderhoud/binnenkort aanstaat kun je met deze code toch de echte site openen. Bewaard als hash, nooit leesbaar."
          >
            <div className="space-y-2">
              <Badge tone={(data.previewAccessSet ? "green" : "red") as never}>
                {data.previewAccessSet ? "Code ingesteld" : "Geen code — niemand komt binnen"}
              </Badge>
              <Field label="Nieuwe code (min. 6 tekens)">
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="bv. VIBIN-2026-xxxx"
                    className="w-64"
                    autoComplete="off"
                  />
                  <Btn
                    variant="neutral"
                    onClick={() => {
                      const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                      const r = crypto.getRandomValues(new Uint8Array(12));
                      setCode([...r].map((b) => abc[b % abc.length]).join("").replace(/(.{4})(?=.)/g, "$1-"));
                    }}
                  >
                    Willekeurige code
                  </Btn>
                </div>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Btn
                  loading={busy === "preview_access_code"}
                  disabled={code.trim().length < 6}
                  onClick={async () => {
                    await put("preview_access_code", code.trim());
                    setNote(`Code opgeslagen: ${code.trim()} — bewaar hem nu, hij is hierna niet meer te zien. Oude toegangen zijn ongeldig.`);
                    setCode("");
                  }}
                >
                  Code opslaan
                </Btn>
                {data.previewAccessSet && (
                  <Btn
                    variant="danger"
                    onClick={() => {
                      if (window.confirm("Code verwijderen? Dan komt niemand meer langs de binnenkort-pagina (behalve via /admin).")) {
                        void put("preview_access_code", "");
                      }
                    }}
                  >
                    Code verwijderen
                  </Btn>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Server configuration" subtitle="Set via deployment secrets — shown here as status only">
            <ul className="space-y-1.5 text-[13px]">
              <ConfigRow ok={data.encryptionConfigured} label="ENCRYPTION_KEY (credential vault + TOTP)" />
              <ConfigRow ok={data.recoveryConfigured} label="OWNER_RECOVERY_SECRET (break-glass recovery)" />
              <ConfigRow ok={data.emailConfigured} label="EMAIL_API_KEY (transactional email)" optional />
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}

function ConfigRow({
  ok,
  label,
  optional,
}: {
  ok: boolean;
  label: string;
  optional?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className={ok ? "text-emerald-600" : optional ? "text-slate-300" : "text-rose-500"}>
        {ok ? "✓" : optional ? "○" : "✗"}
      </span>
      <span className="text-slate-700">{label}</span>
      {!ok && !optional && (
        <Badge tone="red">
          <span className="ml-1">not set</span>
        </Badge>
      )}
    </li>
  );
}
