import type { Extension } from "@codemirror/state";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";

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
  markdown: () => markdown()
};

export function getLanguageExtension(filename: string): Extension | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const factory = EXTENSION_MAP[extension];
  return factory ? factory() : null;
}
