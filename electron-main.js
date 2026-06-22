import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// Start backend Express server in the same process
import './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    title: 'Studio One Project Hub',
    backgroundColor: '#09090b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    // In dev mode, load the local Vite dev server
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    // In production mode, load the compiled static files
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
