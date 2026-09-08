import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, ErrorState, LoadingScreen } from "../components/ui";
import { api, ApiRequestError } from "../lib/api";
import type { GroupDTO } from "@shared/types";

interface Preview {
  invite: {
    groupId: string;
    groupName: string;
    groupStatus: string;
    memberCount: number;
    alreadyMember: boolean;
  };
}

export function JoinGroup() {
  const { code = "" } = useParams();
  const nav = useNavigate();
  const [preview, setPreview] = useState<Preview["invite"] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { invite } = await api<Preview>(`/invites/${code}`);
        setPreview(invite);
      } catch (e) {
        setErr(
          e instanceof ApiRequestError ? e.message : "This invite isn’t valid.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  const join = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { group } = await api<{ group: GroupDTO }>(
        `/invites/${code}/join`,
        { method: "POST", body: {} },
      );
      nav(`/groups/${group.id}`, { replace: true });
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Could not join.");
      setBusy(false);
    }
  };

  if (loading) return <LoadingScreen label="Checking your invite…" />;
  if (err && !preview)
    return <ErrorState title="Invite problem" message={err} />;
  if (!preview) return null;

  return (
    <div className="py-8 text-center">
      <div className="mb-3 text-4xl">🎟️</div>
      <h1 className="text-2xl font-extrabold">You’re invited to</h1>
      <p className="mt-1 text-lg font-bold text-brand-600">
        {preview.groupName}
      </p>
      <p className="mt-1 text-sm text-navy-400">
        {preview.memberCount} member{preview.memberCount === 1 ? "" : "s"} so far
      </p>

      {err && <p className="mt-4 text-sm font-medium text-danger-600">{err}</p>}

      <div className="mx-auto mt-6 max-w-xs">
        <Button className="w-full" loading={busy} onClick={join}>
          {preview.alreadyMember ? "Open group" : "Join group"}
        </Button>
      </div>
    </div>
  );
}
