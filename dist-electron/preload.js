"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    openFiles: (options) => electron_1.ipcRenderer.invoke('dialog:openFiles', options),
    readFile: (filePath) => electron_1.ipcRenderer.invoke('file:read', filePath),
    writeFile: (filePath, content) => electron_1.ipcRenderer.invoke('file:write', filePath, content),
    saveFileDialog: (options) => electron_1.ipcRenderer.invoke('dialog:saveFile', options),
});
