import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

import type { FsEntry } from "@hypershell/shared";
import { createFakeShell } from "../../../lib/fakeShell";
import { setShell } from "../../../lib/shell";
import { createSftpStore } from "../sftpStore";
import { LocalPane } from "./LocalPane";

// jsdom doesn't implement scrollIntoView; FileList's cursor-row ref callback
// calls it unconditionally on mount. Not related to what this test verifies.
afterEach(() => {
  setShell(null);
});

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

const freshEntry: FsEntry = {
  name: "fresh.txt",
  path: "C:\\fresh\\fresh.txt",
  isDirectory: false,
  size: 1,
  modifiedAt: "2026-08-13T00:00:00.000Z"
};

describe("LocalPane stale response handling", () => {
  it("does not let a superseded out-of-root redirect overwrite path or error after navigating away", async () => {
    const store = createSftpStore("s1");
    store.getState().setLocalPath("C:\\stale");

    let resolveHome: ((value: { path: string }) => void) | null = null;
    const homePromise = new Promise<{ path: string }>((resolve) => {
      resolveHome = resolve;
    });

    const fsList = vi.fn(({ path }: { path: string }) => {
      if (path === "C:\\stale") {
        return Promise.reject(new Error("Path is outside the allowed filesystem roots"));
      }
      return Promise.resolve({ entries: [freshEntry] });
    });
    const fsGetHome = vi.fn(() => homePromise);

    setShell(createFakeShell({ fsList, fsGetHome }).shell);

    render(<LocalPane store={store} onTransfer={() => {}} onDownload={() => {}} isActive onActivate={() => {}} />);

    // The first (stale) navigation hits the "outside allowed roots" branch and
    // blocks on fsGetHome — this is the point where a second navigation can race it.
    await waitFor(() => expect(fsGetHome).toHaveBeenCalledTimes(1));

    // User navigates to a valid directory before the stale home lookup resolves.
    act(() => {
      store.getState().setLocalPath("C:\\fresh");
    });

    await waitFor(() => expect(store.getState().localEntries).toEqual([freshEntry]));
    expect(store.getState().localPath).toBe("C:\\fresh");

    // Now the stale fsGetHome resolves with a *different* home path. Its token
    // has been superseded by the C:\fresh navigation, so neither the redirect's
    // setLocalPath/setError nor the fallthrough setError may fire.
    await act(async () => {
      resolveHome?.({ path: "C:\\Users\\someone" });
      await homePromise;
    });

    expect(store.getState().localPath).toBe("C:\\fresh");
    expect(store.getState().error.local).toBeNull();
    expect(store.getState().localEntries).toEqual([freshEntry]);
  });
});
