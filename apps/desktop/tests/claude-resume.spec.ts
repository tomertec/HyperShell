import { expect, test } from "@playwright/test";

import {
  closeApp,
  createDataDir,
  launchApp,
  readSessionLog,
  removeDataDir,
  sessionLogPath
} from "./electronHarness";

// Reproduces the reported failure end to end: a workspace saved with a tab that
// was running a Claude conversation must, after a restart, offer that
// conversation and type `claude --resume` into the restored shell.
//
// The terminal is read through the session logger rather than the DOM: the
// rows are painted by a native ghostty surface Chromium cannot see into, and
// `data` events no longer reach the renderer either (routeSessionEvent.ts
// feeds them to that surface's host). The logger taps the same stream in main.
const CONVERSATION = "9b5c76c7-ce88-49c8-976d-e482c9db9581";

test("a restored local tab resumes the Claude conversation it was running", async () => {
  const dataDir = createDataDir();

  try {
    // First run: find a real PowerShell profile and save a workspace that looks
    // like one where the user had typed `claude` in that tab.
    const first = await launchApp(dataDir);
    const profileId = await first.page.evaluate(async () => {
      const profiles = await window.hypershell!.listLocalProfiles!();
      const shell = profiles.find((profile) =>
        /powershell|pwsh/i.test(profile.executable)
      );
      return shell?.id ?? null;
    });
    expect(profileId, "no PowerShell profile was detected").not.toBeNull();

    await first.page.evaluate(
      async ({ profileId, conversation }) => {
        await window.hypershell!.workspaceSaveLast!({
          tabs: [
            {
              transport: "local",
              profileId: profileId!,
              title: "PowerShell",
              type: "terminal",
              claudeSessionId: conversation,
            },
          ],
          splitDirection: "horizontal",
          paneSizes: [100],
          paneCount: 1,
        });
      },
      { profileId, conversation: CONVERSATION }
    );
    await closeApp(first.app);

    // Second run: the restore banner, then the Claude prompt, then the command.
    const second = await launchApp(dataDir);
    const logPath = sessionLogPath(dataDir, "resume.log");

    // Arm the logger on whatever session the restored tab opens. Installed
    // before the click that opens it, and main only types the resume command
    // after 500ms of pty quiet at a prompt-shaped tail
    // (SessionManager.scheduleStartupCommandWrite), so a logger started on the
    // session's first event is comfortably ahead of the echo it is here to
    // catch.
    await second.page.evaluate((filePath) => {
      const seen = new Set<string>();
      window.hypershell!.onSessionEvent!((event) => {
        if (seen.has(event.sessionId)) return;
        seen.add(event.sessionId);
        void window.hypershell!.loggingStart!({ sessionId: event.sessionId, filePath });
      });
    }, logPath);

    await second.page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(second.page.getByText("Claude session")).toBeVisible();
    await second.page.getByRole("button", { name: "Resume it" }).click();

    // PSReadLine colours each token as the shell echoes it, so the command is
    // only contiguous once the escape sequences are gone: the logger strips
    // most of them on the way to disk and readSessionLog takes the rest.
    await expect
      .poll(() => readSessionLog(logPath), {
        timeout: 30_000,
        message: "the resume command was never typed into the shell"
      })
      .toContain("claude --resume");

    await closeApp(second.app);
  } finally {
    removeDataDir(dataDir);
  }
});
