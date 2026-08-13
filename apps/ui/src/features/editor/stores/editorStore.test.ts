import { describe, expect, it } from "vitest";

import { createEditorStore } from "./editorStore";

describe("editorStore", () => {
  it("carries encoding and read-only state on a tab", () => {
    const store = createEditorStore("s1");

    store.getState().addTab({
      id: "t1",
      remotePath: "/r/bin",
      fileName: "bin",
      content: "",
      originalContent: "",
      dirty: false,
      loading: true,
      error: null,
      language: "plaintext",
      encoding: "base64",
      readOnly: true
    });

    const tab = store.getState().tabs[0];
    expect(tab.encoding).toBe("base64");
    expect(tab.readOnly).toBe(true);
  });

  it("defaults a text tab to editable utf-8", () => {
    const store = createEditorStore("s1");

    store.getState().addTab({
      id: "t1",
      remotePath: "/r/txt",
      fileName: "txt",
      content: "hi",
      originalContent: "hi",
      dirty: false,
      loading: false,
      error: null,
      language: "plaintext",
      encoding: "utf-8",
      readOnly: false
    });

    expect(store.getState().tabs[0].readOnly).toBe(false);
  });
});
