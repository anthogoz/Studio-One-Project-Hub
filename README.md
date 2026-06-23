# <img src="media/icon.png" width="36" height="36" align="center" /> Studio One Project Hub

> A powerful desktop companion app for **PreSonus Studio One** — analyze, visualize, clean, and maintain your music projects without ever opening the DAW.

[![Version](https://img.shields.io/github/v/release/anthogoz/Studio-One-Project-Hub?style=flat-square)](https://github.com/anthogoz/Studio-One-Project-Hub/releases)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square)
[![License](https://img.shields.io/github/license/anthogoz/Studio-One-Project-Hub?style=flat-square)](https://github.com/anthogoz/Studio-One-Project-Hub/blob/master/LICENSE)

---

## ✨ Features

| Module | Description |
|--------|-------------|
| 📊 **Dashboard** | Metadata overview — tempo, sample rate, markers, track count, audio clips |
| 🎛️ **Mixer Console** | Full channel strip view — inserts, sends, routing, gain, pan, mute/solo |
| 🔗 **Signal Flow Map** | Interactive visual graph of the full routing chain |
| 👥 **Song Diff** | Compare two versions of a project side by side |
| 🕐 **Version History** | Browse `.song` snapshots and see what changed over time |
| ❄️ **Freeze & Latency Advisor** | Score channels by CPU and latency weight, get freeze recommendations |
| 🔍 **Missing Media Relinker** | Detect broken audio paths, fuzzy-match files in your workspace, relink in-place |
| 🎼 **Sound Variations Editor** | Build articulation maps, import Cubase `.expressionmap`, export `.soundvariation` |
| 📁 **Plugin Doctor** | Map VST2 plugins to their VST3 equivalents directly in the project file |
| 🧽 **Session Cleaner** | Find and remove unused audio files from your `Media/` folder |
| 🎴 **Sample Browser** | Browse and preview all audio clips used in the project |
| 🎨 **Auto Colorizer** | Apply keyword-based color rules to tracks automatically |
| 🧬 **Vocal Chain Copier** | Copy an insert chain from one channel to another |
| 🎬 **Video Sync Advisor** | Detect video tracks and sync settings |
| 🎹 **MIDI & Automation** | Visualize piano roll events and automation curves |
| ⚙️ **Utilities** | Notepad, export, misc tools |

---

## 📦 Download

Go to the [**Releases**](https://github.com/anthogoz/Studio-One-Project-Hub/releases) page and grab the latest binary for your OS:

- **Windows** — `.exe` installer (NSIS, Windows 10/11 x64)
- **macOS** — `.dmg` (Intel + Apple Silicon)
- **Linux** — `.AppImage` (x64)

---

## 🚀 Getting Started

### 1. Install
Download and run the installer for your platform from the [Releases](https://github.com/anthogoz/Studio-One-Project-Hub/releases) page.

### 2. Set Your Workspace
On first launch, you'll be prompted to set your **Studio One Songs folder** — this is the root directory where all your `.song` project folders are stored (e.g. `Documents\Studio One\Songs`).

### 3. Open a Project
Click on any project in the browser to load it. All analysis happens **locally** — no data leaves your machine.

---

## 🔒 Privacy & Safety

- **All processing is 100% local** — no internet connection, no telemetry, no cloud sync.
- The app reads your `.song` files (ZIP archives) to extract XML data.
- Before modifying any project file, a **timestamped backup** is always saved inside the project's `History/` folder.
- Your workspace path is stored in `workspace-config.json` (local only, excluded from Git).

---

## 🛠️ Development

### Prerequisites
- Node.js 20+
- npm

### Setup
```bash
git clone https://github.com/anthogoz/Studio-One-Project-Hub.git
cd Studio-One-Project-Hub
npm install
```

### Run (web mode — browser at localhost:5173)
```bash
# Terminal 1: Start Express backend
npm run server

# Terminal 2: Start Vite frontend
npm run dev
```

### Run (Electron desktop app)
```bash
npm run electron:dev
```

### Build installer
```bash
# Windows
npm run electron:build:win

# macOS
npm run electron:build:mac

# Linux
npm run electron:build:linux
```

---

## 📁 Project Structure

```
├── src/
│   ├── components/       # React UI modules (one file per feature)
│   ├── App.jsx           # Main layout + navigation
│   └── index.css         # Global dark glassmorphic design system
├── server.js             # Express backend (ZIP reading, file ops, APIs)
├── electron-main.js      # Electron shell
├── public/               # Static assets (icons)
└── .github/workflows/    # CI/CD — automated release pipeline
```

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

---

## 📝 License

[MIT](LICENSE) — © 2026-2026 anthogoz

---

> **Disclaimer:** This project is an independent tool and is not affiliated with, endorsed by, or sponsored by PreSonus Audio Electronics, Inc. "Studio One" is a trademark of PreSonus Audio Electronics, Inc.
