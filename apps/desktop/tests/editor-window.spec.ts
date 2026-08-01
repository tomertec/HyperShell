import { expect, test } from "@playwright/test";

import {
  closeApp,
  createDataDir,
  launchApp,
  removeDataDir,
  type LaunchedApp
} from "./electronHarness";

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp(createDataDir());
});

test.afterEach(async () => {
  await closeApp(launched.app);
  removeDataDir(launched.dataDir);
});

test("editor:open spawns a second BrowserWindow", async () => {
  expect(launched.app.windows()).toHaveLength(1);

  const editorWindow = launched.app.waitForEvent("window");

  await launched.page.evaluate(() =>
    window.hypershell.editorOpen({
      sftpSessionId: "e2e-sftp-session",
      remotePath: "/tmp/e2e-example.txt"
    })
  );

  const editor = await editorWindow;
  await editor.waitForLoadState("domcontentloaded");

  expect(launched.app.windows().length).toBeGreaterThanOrEqual(2);
});

test("opening the same session twice reuses the editor window", async () => {
  const firstWindow = launched.app.waitForEvent("window");
  await launched.page.evaluate(() =>
    window.hypershell.editorOpen({
      sftpSessionId: "e2e-reuse",
      remotePath: "/tmp/first.txt"
    })
  );
  await (await firstWindow).waitForLoadState("domcontentloaded");

  const afterFirst = launched.app.windows().length;

  await launched.page.evaluate(() =>
    window.hypershell.editorOpen({
      sftpSessionId: "e2e-reuse",
      remotePath: "/tmp/second.txt"
    })
  );

  // Same sftpSessionId routes the file into the existing window rather than
  // stacking a new one per opened file. Give a would-be second window time to
  // appear before asserting that none did.
  await launched.page.waitForTimeout(1_500);
  expect(launched.app.windows().length).toBe(afterFirst);
});

test("rejects an editor request that fails schema validation", async () => {
  const error = await launched.page.evaluate(async () => {
    try {
      await window.hypershell.editorOpen({
        // remotePath is required by the shared schema.
        sftpSessionId: "e2e-invalid"
      } as { sftpSessionId: string; remotePath: string });
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  });

  expect(error).not.toBeNull();
});
