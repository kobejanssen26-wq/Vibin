/**
 * CodeMirror 6 editor used by the File Manager. Loaded lazily (its own chunk) so the rest of the admin
 * panel doesn't pay for it. One instance per opened file: the File Manager re-mounts it with a new
 * `key` whenever a different file (or a fresh copy of the same file) is loaded.
 */
import { useEffect, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";
import { kindFor } from "./language";

/** CodeMirror language extension for a file name (plain text gets none). */
function extensionFor(filename: string): Extension | null {
  switch (kindFor(filename).id) {
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "jsx":
      return javascript({ jsx: true });
    case "js":
      return javascript();
    case "json":
      return json();
    case "html":
    case "xml":
      return html();
    case "css":
      return css();
    case "md":
      return markdown();
    case "sql":
      return sql();
    default:
      return null;
  }
}

export interface CodeEditorProps {
  value: string;
  filename: string;
  readOnly: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onCursor: (line: number, col: number) => void;
}

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    lineHeight: "1.55",
  },
  ".cm-gutters": { borderRight: "1px solid rgba(255,255,255,0.06)" },
});

export default function CodeEditor({ value, filename, readOnly, onChange, onSave, onCursor }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onChange, onSave, onCursor });
  cb.current = { onChange, onSave, onCursor };

  useEffect(() => {
    if (!host.current) return;
    const lang = extensionFor(filename);
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          rectangularSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                cb.current.onSave();
                return true;
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
          ]),
          ...(lang ? [lang] : []),
          oneDark,
          baseTheme,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
            if (u.selectionSet || u.docChanged) {
              const head = u.state.selection.main.head;
              const line = u.state.doc.lineAt(head);
              cb.current.onCursor(line.number, head - line.from + 1);
            }
          }),
        ],
      }),
    });
    return () => view.destroy();
    // One editor per file: the parent re-mounts this component (via `key`) for a new document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="h-full min-h-0 w-full" />;
}
