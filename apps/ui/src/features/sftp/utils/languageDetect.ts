import type { Extension } from "@codemirror/state";

type LanguageLoader = () => Promise<Extension>;

const EXTENSION_MAP: Record<string, LanguageLoader> = {
  js: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  tsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true, jsx: true })),
  json: () => import("@codemirror/lang-json").then((m) => m.json()),
  py: () => import("@codemirror/lang-python").then((m) => m.python()),
  xml: () => import("@codemirror/lang-xml").then((m) => m.xml()),
  yaml: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  yml: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  htm: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  md: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  markdown: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  php: () => import("@codemirror/lang-php").then((m) => m.php()),
  rs: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  go: () => import("@codemirror/lang-go").then((m) => m.go()),
  java: () => import("@codemirror/lang-java").then((m) => m.java()),
  c: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  cc: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  h: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  hpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  sql: () => import("@codemirror/lang-sql").then((m) => m.sql()),
  sh: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  bash: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  ini: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  toml: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  conf: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  cfg: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  env: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  properties: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  svg: () => import("@codemirror/lang-xml").then((m) => m.xml()),
  xsl: () => import("@codemirror/lang-xml").then((m) => m.xml()),
  xsd: () => import("@codemirror/lang-xml").then((m) => m.xml()),
  wsdl: () => import("@codemirror/lang-xml").then((m) => m.xml()),
};

const LANGUAGE_NAMES: Record<string, string> = {
  js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX",
  json: "JSON", py: "Python", xml: "XML", yaml: "YAML", yml: "YAML",
  html: "HTML", htm: "HTML", css: "CSS", md: "Markdown", markdown: "Markdown",
  php: "PHP", rs: "Rust", go: "Go", java: "Java",
  c: "C", cpp: "C++", cc: "C++", h: "C/C++ Header", hpp: "C++ Header",
  sql: "SQL", sh: "Shell", bash: "Bash",
  ini: "INI", toml: "TOML", conf: "Config", cfg: "Config",
  env: "Env", properties: "Properties",
  svg: "SVG", xsl: "XSLT", xsd: "XSD",
};

export function getLanguageName(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_NAMES[ext] ?? "Plain Text";
}

export async function getLanguageExtension(filename: string): Promise<Extension | null> {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const loader = EXTENSION_MAP[extension];
  return loader ? loader() : null;
}
