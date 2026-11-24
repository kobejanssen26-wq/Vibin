import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cc } from "../api";
import { AdminApiError } from "../api";
import { Badge, Btn, ErrorNote, Loading, PageTitle, Panel } from "../ui";
import { kindFor } from "./language";

/**
 * File Manager: browse the project (the GitHub repository), open a file, edit it in a CodeMirror
 * editor and save it as a commit. Everything that matters is enforced on the server (permissions,
 * path validation, protected files); this page only presents it.
 */
const CodeEditor = lazy(() => import("./CodeEditor"));

interface Entry {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
  ownerOnly: boolean;
}
interface Config {
  configured: boolean;
  repo: string | null;
  branch: string | null;
  canWrite: boolean;
  maxEditBytes: number;
}
interface OpenFile {
  path: string;
  name: string;
  kind: "text" | "binary" | "too_large";
  sha: string;
  size: number;
  content: string | null;
  ownerOnly: boolean;
  canEdit: boolean;
  branch: string;
}
interface DirState {
  entries?: Entry[];
  loading?: boolean;
  error?: string;
}

const errText = (e: unknown) =>
  e instanceof AdminApiError || e instanceof Error ? e.message : "Something went wrong.";

const DISCARD = "You have unsaved changes in this file. Discard them?";

export function FileManager() {
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [tree, setTree] = useState<Record<string, DirState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));
  const [file, setFile] = useState<OpenFile | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string; reload?: boolean } | null>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [explorerOpen, setExplorerOpen] = useState(false);

  const dirty = file?.kind === "text" && text !== saved;
  const dirtyRef = useRef(false);
  dirtyRef.current = !!dirty;

  /* ------------------------------ tree loading ----------------------------- */
  const loadDir = useCallback(async (path: string) => {
    setTree((t) => ({ ...t, [path]: { ...t[path], loading: true, error: undefined } }));
    try {
      const r = await cc<{ entries: Entry[] }>(`/files/list?path=${encodeURIComponent(path)}`);
      setTree((t) => ({ ...t, [path]: { entries: r.entries } }));
    } catch (e) {
      setTree((t) => ({ ...t, [path]: { error: errText(e) } }));
    }
  }, []);

  useEffect(() => {
    cc<Config>("/files/config")
      .then((c) => {
        setConfig(c);
        if (c.configured) void loadDir("");
      })
      .catch((e) => setConfigError(errText(e)));
  }, [loadDir]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else {
        next.add(path);
        if (!tree[path]?.entries) void loadDir(path);
      }
      return next;
    });
  };

  /* ------------------------------ open / save ------------------------------ */
  const openFile = useCallback(
    async (path: string) => {
      if (dirtyRef.current && !window.confirm(DISCARD)) return;
      setOpening(path);
      setNotice(null);
      try {
        const f = await cc<OpenFile>(`/files/read?path=${encodeURIComponent(path)}`);
        setFile(f);
        setText(f.content ?? "");
        setSaved(f.content ?? "");
        setCursor({ line: 1, col: 1 });
        setEditorKey((k) => k + 1);
        setExplorerOpen(false);
      } catch (e) {
        setNotice({ tone: "error", text: errText(e) });
      } finally {
        setOpening(null);
      }
    },
    [],
  );

  const save = useCallback(async () => {
    if (!file || !file.canEdit || file.kind !== "text" || saving || text === saved) return;
    setSaving(true);
    setNotice(null);
    try {
      const r = await cc<{ sha: string; commit: { sha: string; url: string | null } }>("/files/write", {
        method: "PUT",
        body: { path: file.path, content: text, sha: file.sha },
      });
      setFile((f) => (f ? { ...f, sha: r.sha } : f));
      setSaved(text);
      setNotice({
        tone: "ok",
        text: `Saved to ${file.branch} (commit ${r.commit.sha.slice(0, 7)}). It goes live with the next deploy.`,
      });
    } catch (e) {
      const conflict = e instanceof AdminApiError && e.status === 409;
      setNotice({ tone: "error", text: errText(e), reload: conflict });
    } finally {
      setSaving(false);
    }
  }, [file, saving, text, saved]);

  const reload = useCallback(async () => {
    if (!file) return;
    if (dirtyRef.current && !window.confirm(DISCARD)) return;
    setText(saved); // so openFile doesn't ask twice
    dirtyRef.current = false;
    await openFile(file.path);
  }, [file, saved, openFile]);

  /* ------------------------ unsaved-changes protection --------------------- */
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    // In-app navigation (sidebar links etc.): ask before leaving with unsaved edits.
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname) return;
      if (!window.confirm(DISCARD)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !e.defaultPrevented) {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const saveRef = useRef(save);
  saveRef.current = save;

  const lang = useMemo(() => (file ? kindFor(file.name).label : ""), [file]);

  /* --------------------------------- render -------------------------------- */
  if (configError) return <ErrorNote message={configError} />;
  if (!config) return <Loading label="Loading File Manager…" />;

  if (!config.configured) {
    return (
      <>
        <PageTitle title="File Manager" />
        <Panel title="Connect the repository" subtitle="The File Manager edits the project through GitHub.">
          <div className="space-y-3 text-[13px] leading-relaxed text-slate-700">
            <p>
              VIBIN runs on Cloudflare Workers, which have no filesystem of their own, so the File Manager works on the
              GitHub repository (the real source of the site). It is switched on by one secret:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                On GitHub create a <b>fine-grained personal access token</b> for this one repository with{" "}
                <b>Contents: Read and write</b> (nothing else).
              </li>
              <li>
                Store it as a Worker secret:{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">npx wrangler secret put GITHUB_TOKEN</code>
              </li>
              <li>
                Check <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">GITHUB_REPO</code> and{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">GITHUB_BRANCH</code> in{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">wrangler.jsonc</code> and deploy.
              </li>
            </ol>
            <p className="text-slate-500">The token stays on the server; it is never sent to the browser.</p>
          </div>
        </Panel>
      </>
    );
  }

  const root = tree[""];

  const explorer = (
    <div className="flex h-full min-h-0 flex-col bg-[#252526] text-[13px] text-slate-300">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span className="truncate">{config.repo}</span>
        <button
          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
          onClick={() => void loadDir("")}
          title="Refresh"
          aria-label="Refresh file list"
        >
          ↻
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1" role="tree" aria-label="Project files">
        {root?.loading && !root.entries && <p className="px-3 py-2 text-slate-500">Loading…</p>}
        {root?.error && <p className="px-3 py-2 text-rose-300">{root.error}</p>}
        {root?.entries?.map((e) => (
          <TreeNode
            key={e.path}
            entry={e}
            depth={0}
            tree={tree}
            expanded={expanded}
            activePath={file?.path ?? null}
            opening={opening}
            onToggle={toggleDir}
            onOpen={openFile}
          />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <PageTitle
        title="File Manager"
        right={
          <div className="flex items-center gap-2">
            <Badge tone="slate">{config.branch}</Badge>
            {!config.canWrite && <Badge tone="amber">View only</Badge>}
          </div>
        }
      />
      <div className="flex h-[calc(100vh-10rem)] min-h-[440px] overflow-hidden rounded-lg border border-slate-700 bg-[#1e1e1e] shadow-sm">
        {/* explorer: always visible on large screens, a drawer on small ones */}
        <aside className="hidden w-64 shrink-0 border-r border-black/40 lg:block">{explorer}</aside>
        {explorerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button className="absolute inset-0 bg-black/50" aria-label="Close file list" onClick={() => setExplorerOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">{explorer}</div>
          </div>
        )}

        <section className="flex min-w-0 flex-1 flex-col">
          {/* tab / toolbar */}
          <div className="flex items-center gap-2 border-b border-black/40 bg-[#2d2d2d] px-2 py-1.5 text-[13px] text-slate-200">
            <button
              className="rounded px-2 py-1 text-slate-300 hover:bg-white/10 lg:hidden"
              onClick={() => setExplorerOpen(true)}
              aria-label="Open file list"
            >
              ☰ Files
            </button>
            {file ? (
              <>
                <span className="flex min-w-0 items-center gap-1.5 rounded-t bg-[#1e1e1e] px-3 py-1" title={file.path}>
                  <span className="truncate font-medium">{file.name}</span>
                  {dirty && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Unsaved changes" aria-label="Unsaved changes" />
                  )}
                </span>
                <span className="hidden min-w-0 truncate text-xs text-slate-400 md:inline">{file.path}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {file.kind === "text" && file.canEdit ? (
                    <Btn variant="primary" className="!py-1 !text-xs" disabled={!dirty} loading={saving} onClick={() => void save()}>
                      Save
                    </Btn>
                  ) : (
                    <Badge tone="amber">{file.ownerOnly ? "Owner-only file" : "Read-only"}</Badge>
                  )}
                  <Btn variant="ghost" className="!py-1 !text-xs !text-slate-300 hover:!bg-white/10" onClick={() => void reload()}>
                    Reload
                  </Btn>
                </span>
              </>
            ) : (
              <span className="px-2 text-xs text-slate-400">No file open</span>
            )}
          </div>

          {notice && (
            <div
              role={notice.tone === "error" ? "alert" : "status"}
              className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs ${
                notice.tone === "ok" ? "bg-emerald-900/60 text-emerald-100" : "bg-rose-900/70 text-rose-100"
              }`}
            >
              <span>{notice.text}</span>
              <span className="flex shrink-0 gap-2">
                {notice.reload && (
                  <button className="font-semibold underline" onClick={() => void reload()}>
                    Reload file
                  </button>
                )}
                <button aria-label="Dismiss" className="opacity-70 hover:opacity-100" onClick={() => setNotice(null)}>
                  ✕
                </button>
              </span>
            </div>
          )}

          {/* editor area */}
          <div className="relative min-h-0 flex-1">
            {opening && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-[#1e1e1e]/70 text-sm text-slate-300">Opening…</div>
            )}
            {!file && (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-400">
                <div>
                  <p className="text-base font-semibold text-slate-200">Choose a file</p>
                  <p className="mt-1">Pick a file in the list to view or edit it. Saving creates a commit on {config.branch}.</p>
                </div>
              </div>
            )}
            {file && file.kind !== "text" && (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-400">
                <div>
                  <p className="text-base font-semibold text-slate-200">
                    {file.kind === "binary" ? "Binary file" : "File too large for the editor"}
                  </p>
                  <p className="mt-1">
                    {file.kind === "binary"
                      ? "This file isn't text, so it can't be shown or edited here."
                      : `Files over ${Math.round(config.maxEditBytes / 1000)} KB can't be edited in the admin panel.`}
                  </p>
                </div>
              </div>
            )}
            {file && file.kind === "text" && (
              <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-400">Loading editor…</div>}>
                <CodeEditor
                  key={editorKey}
                  value={file.content ?? ""}
                  filename={file.name}
                  readOnly={!file.canEdit}
                  onChange={setText}
                  onSave={() => void saveRef.current()}
                  onCursor={(line, col) => setCursor({ line, col })}
                />
              </Suspense>
            )}
          </div>

          {/* status bar */}
          <div className="flex items-center gap-3 border-t border-black/40 bg-[#0e639c] px-3 py-1 text-[11px] text-white">
            <span className="truncate">{file ? file.path : config.repo}</span>
            {file?.kind === "text" && (
              <>
                <span className="ml-auto hidden sm:inline">
                  Ln {cursor.line}, Col {cursor.col}
                </span>
                <span>{lang}</span>
                <span>{dirty ? "● Unsaved" : saving ? "Saving…" : "Saved"}</span>
              </>
            )}
          </div>
        </section>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Edits are committed to <b>{config.branch}</b> in {config.repo}. Nothing changes on the live site until the next deploy.
        Environment files, keys and credentials are never shown.
      </p>
    </>
  );
}

function TreeNode({
  entry,
  depth,
  tree,
  expanded,
  activePath,
  opening,
  onToggle,
  onOpen,
}: {
  entry: Entry;
  depth: number;
  tree: Record<string, DirState>;
  expanded: Set<string>;
  activePath: string | null;
  opening: string | null;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  const pad = { paddingLeft: `${8 + depth * 14}px` };
  if (entry.type === "file") {
    const active = activePath === entry.path;
    return (
      <button
        role="treeitem"
        aria-selected={active}
        onClick={() => onOpen(entry.path)}
        style={pad}
        className={`flex w-full items-center gap-1.5 py-[3px] pr-2 text-left hover:bg-white/10 ${
          active ? "bg-[#37373d] text-white" : ""
        } ${opening === entry.path ? "opacity-60" : ""}`}
        title={entry.ownerOnly ? `${entry.path} (owner-only file)` : entry.path}
      >
        <span className="w-3 shrink-0 text-center text-[10px] text-slate-500">•</span>
        <span className="truncate">{entry.name}</span>
        {entry.ownerOnly && <span className="ml-auto text-[10px] text-amber-300/80">🔒</span>}
      </button>
    );
  }
  const isOpen = expanded.has(entry.path);
  const state = tree[entry.path];
  return (
    <div role="group">
      <button
        role="treeitem"
        aria-expanded={isOpen}
        onClick={() => onToggle(entry.path)}
        style={pad}
        className="flex w-full items-center gap-1.5 py-[3px] pr-2 text-left font-medium text-slate-200 hover:bg-white/10"
      >
        <span className="w-3 shrink-0 text-center text-[10px] text-slate-400">{isOpen ? "▾" : "▸"}</span>
        <span className="truncate">{entry.name}</span>
      </button>
      {isOpen && (
        <>
          {state?.loading && !state.entries && (
            <p style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }} className="py-1 text-xs text-slate-500">
              Loading…
            </p>
          )}
          {state?.error && (
            <p style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }} className="py-1 text-xs text-rose-300">
              {state.error}
            </p>
          )}
          {state?.entries?.map((e) => (
            <TreeNode
              key={e.path}
              entry={e}
              depth={depth + 1}
              tree={tree}
              expanded={expanded}
              activePath={activePath}
              opening={opening}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </>
      )}
    </div>
  );
}
