import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('receiptPrint', () => {
  ipcRenderer.send('receipt-preview-print');
});
