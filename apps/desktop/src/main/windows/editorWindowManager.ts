import type { BrowserWindow } from "electron";
import { ipcChannels } from "@hypershell/shared";
import { createEditorWindow } from "./createEditorWindow";

interface ManagedEditorWindow {
  window: BrowserWindow;
  sftpSessionId: string;
}

export class EditorWindowManager {
  private editors: ManagedEditorWindow[] = [];
  private parentWindow: BrowserWindow | null = null;
  private rendererUrl = "";

  setParentWindow(window: BrowserWindow): void {
    this.parentWindow = window;
  }

  setRendererUrl(url: string): void {
    this.rendererUrl = url;
  }

  openEditor(sftpSessionId: string, remotePath: string): void {
    if (!this.parentWindow || this.parentWindow.isDestroyed()) {
      return;
    }

    const existing = this.editors.find(
      (e) => e.sftpSessionId === sftpSessionId && !e.window.isDestroyed()
    );

    if (existing) {
      existing.window.webContents.send(ipcChannels.editor.openFile, {
        sftpSessionId,
        remotePath,
      });
      existing.window.focus();
      return;
    }

    const window = createEditorWindow({
      sftpSessionId,
      parentWindow: this.parentWindow,
      rendererUrl: this.rendererUrl,
    });

    const entry: ManagedEditorWindow = { window, sftpSessionId };
    this.editors.push(entry);

    window.webContents.once("did-finish-load", () => {
      window.webContents.send(ipcChannels.editor.openFile, {
        sftpSessionId,
        remotePath,
      });
    });

    window.on("closed", () => {
      this.editors = this.editors.filter((e) => e !== entry);
    });
  }

  notifySessionClosed(sftpSessionId: string): void {
    for (const editor of this.editors) {
      if (editor.sftpSessionId === sftpSessionId && !editor.window.isDestroyed()) {
        editor.window.webContents.send(ipcChannels.editor.sessionClosed, {
          sftpSessionId,
        });
      }
    }
  }

  closeAll(): void {
    for (const editor of this.editors) {
      if (!editor.window.isDestroyed()) {
        editor.window.close();
      }
    }
    this.editors = [];
  }
}

export const editorWindowManager = new EditorWindowManager();
