import { expect, test } from "@playwright/test";
import { installFakeBridge } from "./support/fakeBridge";

const profiles = [
  {
    id: "p1",
    name: "PowerShell",
    executable: "pwsh.exe",
    args: [],
    startingDirectory: null,
    icon: "powershell",
    color: null,
    elevated: false,
    source: "detected",
    detectKey: "pwsh7",
    isAvailable: true,
    isHidden: false,
    sortOrder: 1
  }
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installFakeBridge, { profiles });
});

test("xterm owns screen geometry and renderer canvases stay transparent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("button", { name: "PowerShell" }).click();
  await expect(page.locator(".xterm-screen")).toHaveCount(1);

  const styles = await page.locator(".xterm-screen").evaluate((screen) => {
    const element = screen as HTMLElement;
    element.style.height = "123px";

    const canvas = document.createElement("canvas");
    canvas.style.backgroundColor = "transparent";
    element.appendChild(canvas);

    return {
      screenHeight: getComputedStyle(element).height,
      canvasBackground: getComputedStyle(canvas).backgroundColor
    };
  });

  expect(styles.screenHeight).toBe("123px");
  expect(styles.canvasBackground).toBe("rgba(0, 0, 0, 0)");
});

test("PTY line feeds preserve the cursor column", async ({ page }) => {
  await page.goto("/");

  const cells = await page.evaluate(async () => {
    const [{ Terminal }, { getTerminalOptions }] = await Promise.all([
      import("/@id/@xterm/xterm"),
      import("/src/features/terminal/terminalTheme.ts")
    ]);
    const container = document.createElement("div");
    container.style.cssText = "width:800px;height:400px;position:fixed;inset:0";
    document.body.appendChild(container);

    const terminal = new Terminal(getTerminalOptions());
    terminal.open(container);
    await new Promise<void>((resolve) => terminal.write("abc\nx", resolve));

    const secondLine = terminal.buffer.active.getLine(1);
    const result = {
      columnZero: secondLine?.getCell(0)?.getChars() ?? "",
      originalColumn: secondLine?.getCell(3)?.getChars() ?? ""
    };
    terminal.dispose();
    container.remove();
    return result;
  });

  expect(cells).toEqual({ columnZero: "", originalColumn: "x" });
});
