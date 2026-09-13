import { useState } from "react";
import { cc } from "../api";
import { useResource } from "../lib";
import { Badge, Btn, ErrorNote, Input, Loading, Panel, PageTitle, Table, Td, Th, Tr } from "../ui";

interface Cat {
  id: string;
  label: string;
  icon: string;
  sort: number;
  active: number;
}

export function Categories() {
  const { data, loading, error, reload } = useResource<{ categories: Cat[] }>(
    () => cc<{ categories: Cat[] }>("/categories"),
    "categories",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  const cats = [...(data?.categories ?? [])].sort((a, b) => a.sort - b.sort);

  const toggleActive = async (c: Cat) => {
    setBusy(c.id);
    try {
      await cc(`/categories/${c.id}`, { method: "PATCH", body: { active: !c.active } });
      reload();
    } finally {
      setBusy(null);
    }
  };

  const saveLabel = async (id: string) => {
    setBusy(id);
    try {
      await cc(`/categories/${id}`, { method: "PATCH", body: { label: labelDraft.trim() } });
      setEditingId(null);
      reload();
    } finally {
      setBusy(null);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...cats];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j]!, next[index]!];
    setBusy("reorder");
    try {
      await cc("/categories/reorder", { method: "POST", body: { ids: next.map((c) => c.id) } });
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageTitle title="Categories" />
      <Panel
        subtitle="Rename, reorder and activate/deactivate the swipe-filter categories — changes apply immediately, no deploy needed. The id set itself is fixed (icon/colour lookups for these ids live in several swipe-UI components)."
        bodyClassName=""
      >
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}
        {data && (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Icon</Th>
                <Th>Label</Th>
                <Th>Id</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {cats.map((c, i) => (
                <Tr key={c.id}>
                  <Td>
                    <div className="flex gap-1">
                      <Btn variant="ghost" className="!px-1.5 !py-0.5 !text-xs" disabled={i === 0} loading={busy === "reorder"} onClick={() => move(i, -1)}>
                        ▲
                      </Btn>
                      <Btn variant="ghost" className="!px-1.5 !py-0.5 !text-xs" disabled={i === cats.length - 1} loading={busy === "reorder"} onClick={() => move(i, 1)}>
                        ▼
                      </Btn>
                    </div>
                  </Td>
                  <Td className="text-lg">{c.icon}</Td>
                  <Td>
                    {editingId === c.id ? (
                      <div className="flex items-center gap-2">
                        <Input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} className="w-40" />
                        <Btn variant="primary" className="!py-1 !text-xs" loading={busy === c.id} onClick={() => saveLabel(c.id)}>
                          Save
                        </Btn>
                        <Btn variant="ghost" className="!py-1 !text-xs" onClick={() => setEditingId(null)}>
                          Cancel
                        </Btn>
                      </div>
                    ) : (
                      <button
                        className="font-medium text-brand-600 hover:underline"
                        onClick={() => {
                          setEditingId(c.id);
                          setLabelDraft(c.label);
                        }}
                      >
                        {c.label}
                      </button>
                    )}
                  </Td>
                  <Td className="font-mono text-xs text-slate-400">{c.id}</Td>
                  <Td>
                    <Badge tone={c.active ? "green" : "slate"}>{c.active ? "Active" : "Inactive"}</Badge>
                  </Td>
                  <Td>
                    <Btn variant="ghost" className="!py-1 !text-xs" loading={busy === c.id} onClick={() => toggleActive(c)}>
                      {c.active ? "Deactivate" : "Activate"}
                    </Btn>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
