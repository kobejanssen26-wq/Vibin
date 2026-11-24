/** File name -> language id + label. Light on purpose: the File Manager shell imports this without pulling in CodeMirror. */
export type LangId = "ts" | "tsx" | "jsx" | "js" | "json" | "html" | "xml" | "css" | "md" | "sql" | "plain";

export function kindFor(filename: string): { id: LangId; label: string } {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return { id: "ts", label: "TypeScript" };
    case "tsx":
      return { id: "tsx", label: "TypeScript JSX" };
    case "jsx":
      return { id: "jsx", label: "JavaScript JSX" };
    case "js":
    case "mjs":
    case "cjs":
      return { id: "js", label: "JavaScript" };
    case "json":
    case "jsonc":
    case "webmanifest":
      return { id: "json", label: "JSON" };
    case "html":
    case "htm":
      return { id: "html", label: "HTML" };
    case "svg":
    case "xml":
      return { id: "xml", label: "XML" };
    case "css":
      return { id: "css", label: "CSS" };
    case "md":
    case "mdx":
      return { id: "md", label: "Markdown" };
    case "sql":
      return { id: "sql", label: "SQL" };
    case "yml":
    case "yaml":
      return { id: "plain", label: "YAML" };
    case "sh":
    case "bash":
    case "ps1":
      return { id: "plain", label: "Shell" };
    case "py":
      return { id: "plain", label: "Python" };
    case "toml":
      return { id: "plain", label: "TOML" };
    default:
      return { id: "plain", label: "Plain text" };
  }
}
