import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { api, ApiRequestError } from "../lib/api";
import type { GroupDTO } from "@shared/types";

const IDEAS = [
  "Weekend with the boys",
  "Family",
  "Date night",
  "Holiday",
  "Team outing",
];

export function CreateGroup() {
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
      setErr(e instanceof ApiRequestError ? e.message : "Could not create group.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        back={{ to: "/app", label: "Groups" }}
        title="Name your group"
        subtitle="You can change this later. Next you’ll set what, where and when."
      />

      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Group name"
          placeholder="Weekend with the boys"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="stagger flex flex-wrap gap-2">
          {IDEAS.map((i) => (
            <button
              key={i}
              type="button"
              className={name === i ? "chip-on" : "chip"}
              onClick={() => setName(i)}
            >
              {i}
            </button>
          ))}
        </div>
        {err && <p className="text-sm font-medium text-danger-600 motion-safe:animate-shake">{err}</p>}
        <Button type="submit" loading={busy} className="w-full">
          Create group
        </Button>
      </form>
    </div>
  );
}
