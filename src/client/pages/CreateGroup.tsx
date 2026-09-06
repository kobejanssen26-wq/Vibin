import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field } from "../components/ui";
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
      <h1 className="text-2xl font-extrabold">Name your group</h1>
      <p className="mt-1 text-sm text-ink-muted">
        You can change this later. Next you’ll set what, where and when.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field
          label="Group name"
          placeholder="Weekend with the boys"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {IDEAS.map((i) => (
            <button
              key={i}
              type="button"
              className="chip"
              onClick={() => setName(i)}
            >
              {i}
            </button>
          ))}
        </div>
        {err && <p className="text-sm font-medium text-coral-600">{err}</p>}
        <Button type="submit" loading={busy} className="w-full">
          Create group
        </Button>
      </form>
    </div>
  );
}
