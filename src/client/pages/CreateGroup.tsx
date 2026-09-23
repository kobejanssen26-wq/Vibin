import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import { useLang } from "../lib/i18n";
import type { GroupDTO } from "@shared/types";

const IDEA_KEYS = ["idea1", "idea2", "idea3", "idea4", "idea5"] as const;

export function CreateGroup() {
  const { t } = useLang();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { group } = await api<{ group: GroupDTO }>("/groups", {
        method: "POST",
        body: { name: name.trim() },
      });
      nav(`/groups/${group.id}/configure`, { replace: true });
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : t("createGroup.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-2xl font-extrabold">{t("createGroup.title")}</h1>
      <p className="mt-1 text-sm text-navy-400">
        {t("createGroup.subtitle")}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field
          label={t("createGroup.label")}
          placeholder={t("createGroup.idea1")}
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {IDEA_KEYS.map((k) => {
            const label = t(`createGroup.${k}` as never);
            return (
              <button
                key={k}
                type="button"
                className="chip"
                onClick={() => setName(label)}
              >
                {label}
              </button>
            );
          })}
        </div>
        {err && <p className="text-sm font-medium text-danger-600">{err}</p>}
        <Button type="submit" loading={busy} className="w-full">
          {t("createGroup.submit")}
        </Button>
      </form>
    </div>
  );
}
