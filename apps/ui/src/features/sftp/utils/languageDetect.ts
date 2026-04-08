import type { Extension } from "@codemirror/state";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { php } from "@codemirror/lang-php";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { sql } from "@codemirror/lang-sql";

const EXTENSION_MAP: Record<string, () => Extension> = {
  js: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  json: () => json(),
  py: () => python(),
  xml: () => xml(),
  yaml: () => yaml(),
  yml: () => yaml(),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  md: () => markdown(),
  markdown: () => markdown(),
  php: () => php(),
  rs: () => rust(),
  go: () => go(),
  java: () => java(),
  c: () => cpp(),
  cpp: () => cpp(),
  cc: () => cpp(),
  h: () => cpp(),
  hpp: () => cpp(),
  sql: () => sql(),
  sh: () => javascript(),
  bash: () => javascript(),
  ini: () => yaml(),
  toml: () => yaml(),
  conf: () => yaml(),
  cfg: () => yaml(),
  env: () => yaml(),
  properties: () => yaml(),
  svg: () => xml(),
  xsl: () => xml(),
  xsd: () => xml(),
  wsdl: () => xml(),
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

export function getLanguageExtension(filename: string): Extension | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const factory = EXTENSION_MAP[extension];
  return factory ? factory() : null;
}
