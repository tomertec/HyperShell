import { describe, expect, it, vi } from "vitest";

import { ipcChannels } from "@sshterm/shared";

const electronMocks = vi.hoisted(() => {
  const trayInstance = {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn()
  };

  return {
    trayInstance,
    app: {
      getAppPath: vi.fn(() => "/app"),
      quit: vi.fn()
    },
    Menu: {
      buildFromTemplate: vi.fn((template: unknown[]) => ({ template }))
    },
    Tray: vi.fn(() => trayInstance),
    nativeImage: {
      createEmpty: vi.fn(() => "empty-image")
    }
  };
});

vi.mock("electron", () => electronMocks);

import { createTray, type TrayActions } from "./createTray";

type MenuTemplateItem = {
  label?: string;
  type?: string;
  click?: () => void;
};

function createFakeBrowserWindow(visible = true, destroyed = false) {
  const show = vi.fn();
  const hide = vi.fn();
  const send = vi.fn();

  return {
    show,
    hide,
    isVisible: vi.fn(() => visible),
    isDestroyed: vi.fn(() => destroyed),
    webContents: {
      isDestroyed: vi.fn(() => destroyed),
      send
    }
  } as unknown as {
    show: typeof show;
    hide: typeof hide;
    isVisible: () => boolean;
    isDestroyed: () => boolean;
    webContents: {
      isDestroyed: () => boolean;
      send: typeof send;
    };
  };
}

function createTrayDeps() {
  const menuTemplates: MenuTemplateItem[][] = [];
  const trayInstance = {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn()
  };

  const TrayClass = vi.fn(() => trayInstance);
  const MenuClass = {
    buildFromTemplate(template: MenuTemplateItem[]) {
      menuTemplates.push(template);
      return { template };
    }
  };
  const nativeImageFactory = {
    createEmpty: vi.fn(() => "empty-image")
  };
  const appRef = {
    getAppPath: vi.fn(() => "/app"),
    quit: vi.fn()
  };

  return {
    TrayClass: TrayClass as unknown as new (
      icon: unknown
    ) => typeof trayInstance,
    MenuClass,
    nativeImageFactory,
    appRef,
    menuTemplates,
    trayInstance
  };
}

describe("createTray", () => {
  it("toggles show and hide on click based on window visibility", () => {
    const windowVisible = createFakeBrowserWindow(true);
    const visibleDeps = createTrayDeps();

    createTray(windowVisible, undefined, visibleDeps);
    const clickHandler = visibleDeps.trayInstance.on.mock.calls.find(
      ([event]) => event === "click"
    )?.[1] as (() => void) | undefined;

    expect(clickHandler).toBeTypeOf("function");
    clickHandler?.();
    expect(windowVisible.hide).toHaveBeenCalledTimes(1);
    expect(windowVisible.show).not.toHaveBeenCalled();

    const windowHidden = createFakeBrowserWindow(false);
    const hiddenDeps = createTrayDeps();
    createTray(windowHidden, undefined, hiddenDeps);
    const hiddenClickHandler = hiddenDeps.trayInstance.on.mock.calls.find(
      ([event]) => event === "click"
    )?.[1] as (() => void) | undefined;

    hiddenClickHandler?.();
    expect(windowHidden.show).toHaveBeenCalledTimes(1);
    expect(windowHidden.hide).not.toHaveBeenCalled();
  });

  it("sends quick-connect when the window and webContents are alive", () => {
    const window = createFakeBrowserWindow(false, false);
    const deps = createTrayDeps();

    createTray(window, undefined, deps);
    const quickConnectItem = deps.menuTemplates[0]?.find(
      (item) => item.label === "Quick Connect"
    );

    quickConnectItem?.click?.();

    expect(window.webContents.send).toHaveBeenCalledWith(
      ipcChannels.tray.quickConnect
    );
  });

  it("ignores quick-connect when the window or webContents is destroyed", () => {
    const destroyedWindow = createFakeBrowserWindow(false, true);
    const deps = createTrayDeps();

    createTray(destroyedWindow, undefined, deps);
    const quickConnectItem = deps.menuTemplates[0]?.find(
      (item) => item.label === "Quick Connect"
    );

    quickConnectItem?.click?.();

    expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
  });

  it("builds the expected menu wiring", () => {
    const window = createFakeBrowserWindow(false);
    const deps = createTrayDeps();
    const actions: TrayActions = {
      showWindow: vi.fn(),
      hideWindow: vi.fn(),
      openQuickConnect: vi.fn()
    };

    createTray(window, actions, deps);

    expect(deps.TrayClass).toHaveBeenCalledTimes(1);
    expect(deps.trayInstance.setToolTip).toHaveBeenCalledWith("SSHTerm");
    expect(deps.menuTemplates[0]).toEqual([
      {
        label: "Show",
        click: expect.any(Function)
      },
      {
        label: "Hide",
        click: expect.any(Function)
      },
      {
        type: "separator"
      },
      {
        label: "Quick Connect",
        click: expect.any(Function)
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        click: expect.any(Function)
      }
    ]);

    const [showItem, hideItem, , quickConnectItem, , quitItem] =
      deps.menuTemplates[0] ?? [];

    showItem.click?.();
    hideItem.click?.();
    quickConnectItem.click?.();
    quitItem.click?.();

    expect(actions.showWindow).toHaveBeenCalledTimes(1);
    expect(actions.hideWindow).toHaveBeenCalledTimes(1);
    expect(actions.openQuickConnect).toHaveBeenCalledTimes(1);
    expect(deps.appRef.quit).toHaveBeenCalledTimes(1);
  });
});
