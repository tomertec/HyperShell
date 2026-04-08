import type { IpcMainInvokeEvent } from "electron";
import { ipcChannels, editorOpenRequestSchema } from "@sshterm/shared";
import { editorWindowManager } from "../windows/editorWindowManager";

export function registerEditorIpc(
  ipcMain: { handle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void }
): () => void {
  const handleOpenEditor = (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = editorOpenRequestSchema.parse(rawRequest);
    editorWindowManager.openEditor(request.sftpSessionId, request.remotePath);
  };

  ipcMain.handle(ipcChannels.editor.openEditor, handleOpenEditor);

  return () => {
    // Follow the same cleanup pattern as other IPC handlers in registerIpc.ts
  };
}
