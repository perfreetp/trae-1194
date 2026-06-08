import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFiles: (options?: any) => ipcRenderer.invoke('dialog:openFiles', options),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:write', filePath, content),
  saveFileDialog: (options?: any) => ipcRenderer.invoke('dialog:saveFile', options),
});

declare global {
  interface Window {
    electronAPI: {
      openFiles: (options?: any) => Promise<any[]>;
      readFile: (filePath: string) => Promise<string | null>;
      writeFile: (filePath: string, content: string) => Promise<boolean>;
      saveFileDialog: (options?: any) => Promise<any>;
    };
  }
}
