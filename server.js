import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';
import os from 'os';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // support large XML payloads

// Writable AppData Directory for config files (persists in packaged Electron app)
const USER_DATA_DIR = (() => {
  const homeDir = os.homedir();
  let appDataPath;
  if (process.platform === 'win32') {
    appDataPath = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    appDataPath = path.join(homeDir, 'Library', 'Application Support');
  } else {
    appDataPath = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
  }
  
  const targetDir = path.join(appDataPath, 'studio-one-project-hub');
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    return targetDir;
  } catch (e) {
    console.error('Failed to create settings directory, falling back to home dir:', e);
    return homeDir;
  }
})();

const CONFIG_FILE = path.join(USER_DATA_DIR, 'workspace-config.json');
const CACHE_FILE = path.join(USER_DATA_DIR, 'workspace-cache.json');

// Migrate existing configuration from local folder to USER_DATA_DIR if present
const OLD_CONFIG_FILE = path.join(__dirname, 'workspace-config.json');
const OLD_CACHE_FILE = path.join(__dirname, 'workspace-cache.json');

if (fs.existsSync(OLD_CONFIG_FILE) && !fs.existsSync(CONFIG_FILE)) {
  try {
    fs.copyFileSync(OLD_CONFIG_FILE, CONFIG_FILE);
    console.log('Migrated configuration file to:', CONFIG_FILE);
  } catch (e) {
    console.error('Failed to migrate config file:', e);
  }
}

if (fs.existsSync(OLD_CACHE_FILE) && !fs.existsSync(CACHE_FILE)) {
  try {
    fs.copyFileSync(OLD_CACHE_FILE, CACHE_FILE);
    console.log('Migrated cache file to:', CACHE_FILE);
  } catch (e) {
    console.error('Failed to migrate cache file:', e);
  }
}

function getDefaultWorkspace() {
  const username = os.userInfo().username;
  const homeDir = os.homedir();
  
  const candidates = [
    // 1. C:\Users\<username>\Documents\Studio One\Songs
    path.join(homeDir, 'Documents', 'Studio One', 'Songs'),
    // 2. D:\Users\<username>\Documents\Studio One\Songs
    path.join('D:', 'Users', username, 'Documents', 'Studio One', 'Songs'),
    // 3. D:\Documents\Studio One\Songs
    path.join('D:', 'Documents', 'Studio One', 'Songs'),
    // 4. C:\Documents\Studio One\Songs
    path.join('C:', 'Documents', 'Studio One', 'Songs'),
  ];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        console.log('Found default Studio One songs directory:', dir);
        return dir;
      }
    } catch (e) {
      // ignore
    }
  }

  // Fallback to parent of project root
  return path.resolve(__dirname, '..');
}

let WORKSPACE_DIR = getDefaultWorkspace();
let PROJECT_CACHE = {};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (config.workspaceDir && fs.existsSync(config.workspaceDir) && fs.statSync(config.workspaceDir).isDirectory()) {
      WORKSPACE_DIR = config.workspaceDir;
      console.log('Loaded persisted workspace directory:', WORKSPACE_DIR);
    }
  } catch (e) {
    console.error('Error reading workspace-config.json:', e);
  }
}

if (fs.existsSync(CACHE_FILE)) {
  try {
    PROJECT_CACHE = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log('Loaded project metadata cache with', Object.keys(PROJECT_CACHE).length, 'entries');
  } catch (e) {
    console.error('Error reading workspace-cache.json:', e);
  }
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(PROJECT_CACHE, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving workspace-cache.json:', e);
  }
}

// Helper: Scan for projects
function scanProjects(baseDir) {
  const projects = [];
  let cacheUpdated = false;
  try {
    function walk(dir, depth = 0) {
      if (depth > 3) return;
      try {
        const items = fs.readdirSync(dir);
        let songFile = items.find(f => f.endsWith('.song'));
        if (songFile) {
          const songPath = path.join(dir, songFile);
          try {
            const stat = fs.statSync(songPath);
            const mtime = stat.mtime.getTime();
            const size = stat.size;
            
            let trackCount = 0;
            let pluginCount = 0;
            
            const cached = PROJECT_CACHE[songPath];
            if (cached && cached.mtime === mtime && cached.size === size) {
              trackCount = cached.trackCount;
              pluginCount = cached.pluginCount;
            } else {
              try {
                const zip = new AdmZip(songPath);
                const metainfoEntry = zip.getEntry('metainfo.xml');
                if (metainfoEntry) {
                  const text = metainfoEntry.getData().toString('utf8');
                  const tcMatch = text.match(/id="Media:TrackCount"\s+value="(\d+)"/);
                  if (tcMatch) trackCount = parseInt(tcMatch[1], 10);
                }
                const mixerEntry = zip.getEntry('Devices/audiomixer.xml');
                if (mixerEntry) {
                  const mixerText = mixerEntry.getData().toString('utf8');
                  const matches = mixerText.match(/classID=/g);
                  pluginCount = matches ? matches.length : 0;
                }
              } catch (e) {
                // ignore zip reading errors
              }
              
              PROJECT_CACHE[songPath] = { mtime, size, trackCount, pluginCount };
              cacheUpdated = true;
            }

            projects.push({
              name: path.basename(dir),
              dirPath: dir,
              songPath: songPath,
              songName: songFile,
              mtime,
              size,
              trackCount,
              pluginCount
            });
          } catch (e) {
            // fallback if stat fails
            projects.push({
              name: path.basename(dir),
              dirPath: dir,
              songPath: songPath,
              songName: songFile,
              mtime: 0,
              size: 0,
              trackCount: 0,
              pluginCount: 0
            });
          }
        } else {
          for (const item of items) {
            if (item.startsWith('.') || item === 'node_modules' || item === 'System Volume Information' || item === 'Backup_Unused_Media') continue;
            const itemPath = path.join(dir, item);
            try {
              if (fs.statSync(itemPath).isDirectory()) {
                walk(itemPath, depth + 1);
              }
            } catch (e) { /* skip inaccessible directories */ }
          }
        }
      } catch (err) { /* skip inaccessible folders */ }
    }
    walk(baseDir);
  } catch (err) {
    console.error('Error scanning projects:', err);
  }

  // Sort by mtime descending (most recently modified/created first)
  projects.sort((a, b) => b.mtime - a.mtime);

  if (cacheUpdated) {
    saveCache();
  }

  return projects;
}

// 0. Get / Set workspace root
app.get('/api/workspace', (req, res) => {
  res.json({ workspaceDir: WORKSPACE_DIR });
});

app.post('/api/workspace', (req, res) => {
  const { dir } = req.body;
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return res.status(400).json({ error: 'Invalid directory path.' });
  }
  WORKSPACE_DIR = path.resolve(dir);
  console.log('Workspace changed to:', WORKSPACE_DIR);

  // Persist workspace setting to config file
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ workspaceDir: WORKSPACE_DIR }, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving workspace-config.json:', e);
  }

  res.json({ workspaceDir: WORKSPACE_DIR, projects: scanProjects(WORKSPACE_DIR) });
});

// 0b. Open native OS folder selector dialog and return the selected path
app.post('/api/browse-workspace', (req, res) => {
  if (process.platform !== 'win32') {
    return res.status(400).json({ error: 'Folder selection browser is only supported on Windows in web mode.' });
  }

  // PowerShell command to open Windows native FolderBrowserDialog
  const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select Studio One Songs Folder'; $d.ShowNewFolderButton = $true; $r = $d.ShowDialog(); if ($r -eq 'OK') { Write-Output $d.SelectedPath }"`;

  exec(psCommand, (err, stdout, stderr) => {
    if (err) {
      console.error('Error opening folder dialog:', err);
      return res.status(500).json({ error: 'Failed to open directory browser.' });
    }
    const selectedPath = stdout.trim();
    if (selectedPath) {
      res.json({ selectedPath });
    } else {
      res.json({ cancelled: true });
    }
  });
});

// 1. Get all projects in the workspace
app.get('/api/projects', (req, res) => {
  const projects = scanProjects(WORKSPACE_DIR);
  res.json({ projects });
});

// 1b. Resolve a .song file by filename only (for file picker)
app.get('/api/resolve-song', (req, res) => {
  const { songName } = req.query;
  if (!songName) return res.status(400).json({ error: 'songName required.' });

  // Search all projects in workspace
  const projects = scanProjects(WORKSPACE_DIR);
  const match = projects.find(p => p.songName === songName);
  if (match) {
    return res.json({ project: match });
  }

  // Deep search: walk workspace subfolders looking for the file
  function findSong(dir, depth = 0) {
    if (depth > 4) return null;
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        try {
          const stat = fs.statSync(itemPath);
          if (stat.isFile() && item === songName) {
            const dirPath = path.dirname(itemPath);
            return { name: path.basename(dirPath), dirPath, songPath: itemPath, songName: item };
          }
          if (stat.isDirectory()) {
            const found = findSong(itemPath, depth + 1);
            if (found) return found;
          }
        } catch (e) { /* skip */ }
      }
    } catch (e) { /* skip */ }
    return null;
  }

  const found = findSong(WORKSPACE_DIR);
  if (found) return res.json({ project: found });

  res.json({ project: null });
});

// 2. Load raw XML strings from the .song ZIP file
app.get('/api/load-xmls', (req, res) => {
  const { songPath } = req.query;
  if (!songPath || !fs.existsSync(songPath)) {
    return res.status(404).json({ error: 'Song file not found.' });
  }

  try {
    const zip = new AdmZip(songPath);
    const result = {
      metainfo: '',
      song: '',
      mediapool: '',
      audiomixer: '',
      notepad: '',
      notes: ''
    };

    const filesToRead = {
      'metainfo.xml': 'metainfo',
      'Song/song.xml': 'song',
      'Song/mediapool.xml': 'mediapool',
      'Devices/audiomixer.xml': 'audiomixer',
      'notepad.xml': 'notepad',
      'notes.txt': 'notes'
    };

    for (const [zipEntryPath, key] of Object.entries(filesToRead)) {
      const entry = zip.getEntry(zipEntryPath);
      if (entry) {
        let content = entry.getData();
        // Decode correctly
        let text = '';
        try {
          // Remove UTF-8 BOM if present
          text = content.toString('utf8').replace(/^\uFEFF/, '');
        } catch (e) {
          text = content.toString('utf16le');
        }
        result[key] = text;
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Error reading .song zip:', err);
    res.status(500).json({ error: `Failed to parse .song archive: ${err.message}` });
  }
});

// 2b. Upload a .song file as binary — no path needed, works for any file
app.post('/api/upload-song', express.raw({ type: 'application/octet-stream', limit: '200mb' }), (req, res) => {
  try {
    const buf = req.body; // Buffer
    if (!buf || !buf.length) {
      return res.status(400).json({ error: 'No file data received.' });
    }

    const zip = new AdmZip(buf);
    const result = { metainfo: '', song: '', mediapool: '', audiomixer: '', notepad: '', notes: '' };

    const filesToRead = {
      'metainfo.xml': 'metainfo',
      'Song/song.xml': 'song',
      'Song/mediapool.xml': 'mediapool',
      'Devices/audiomixer.xml': 'audiomixer',
      'notepad.xml': 'notepad',
      'notes.txt': 'notes'
    };

    for (const [zipEntryPath, key] of Object.entries(filesToRead)) {
      const entry = zip.getEntry(zipEntryPath);
      if (entry) {
        let text = '';
        try {
          text = entry.getData().toString('utf8').replace(/^\uFEFF/, '');
        } catch (e) {
          text = entry.getData().toString('utf16le');
        }
        result[key] = text;
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Error parsing uploaded .song:', err);
    res.status(500).json({ error: `Failed to parse uploaded .song: ${err.message}` });
  }
});

// 3. Scan physical Media/ directory and compare with mediapool active files
app.get('/api/media-status', (req, res) => {
  const { projectDir } = req.query;
  if (!projectDir || !fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Project folder not found.' });
  }

  const mediaDir = path.join(projectDir, 'Media');
  const filesOnDisk = [];
  
  if (fs.existsSync(mediaDir)) {
    try {
      const items = fs.readdirSync(mediaDir);
      for (const item of items) {
        const itemPath = path.join(mediaDir, item);
        if (fs.statSync(itemPath).isFile()) {
          const stats = fs.statSync(itemPath);
          filesOnDisk.push({
            name: item,
            path: itemPath,
            size: stats.size,
            mtime: stats.mtime
          });
        }
      }
    } catch (e) {
      console.error('Error scanning media dir:', e);
    }
  }

  const backupDir = path.join(projectDir, 'Backup_Unused_Media');
  const filesInBackup = [];
  
  if (fs.existsSync(backupDir)) {
    try {
      const items = fs.readdirSync(backupDir);
      for (const item of items) {
        const itemPath = path.join(backupDir, item);
        if (fs.statSync(itemPath).isFile()) {
          const stats = fs.statSync(itemPath);
          filesInBackup.push({
            name: item,
            path: itemPath,
            size: stats.size,
            mtime: stats.mtime
          });
        }
      }
    } catch (e) {
      console.error('Error scanning backup dir:', e);
    }
  }

  res.json({ filesOnDisk, filesInBackup });
});

// 4. Move unused files to a backup directory inside the project
app.post('/api/clean-media', (req, res) => {
  const { projectDir, filesToClean } = req.body; // filesToClean is array of filenames
  if (!projectDir || !fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Project folder not found.' });
  }

  const mediaDir = path.join(projectDir, 'Media');
  const backupDir = path.join(projectDir, 'Backup_Unused_Media');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const moved = [];
  const errors = [];

  for (const filename of filesToClean) {
    const srcPath = path.join(mediaDir, filename);
    const destPath = path.join(backupDir, filename);
    
    if (fs.existsSync(srcPath)) {
      try {
        fs.renameSync(srcPath, destPath);
        moved.push(filename);
      } catch (err) {
        errors.push({ filename, error: err.message });
      }
    } else {
      errors.push({ filename, error: 'File does not exist on disk' });
    }
  }

  res.json({ success: true, moved, errors, backupDir });
});

// 4.5. Move files from Backup_Unused_Media back to Media folder (Undo Clean)
app.post('/api/restore-media', (req, res) => {
  const { projectDir, filesToRestore } = req.body;
  if (!projectDir || !fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Project folder not found.' });
  }

  const mediaDir = path.join(projectDir, 'Media');
  const backupDir = path.join(projectDir, 'Backup_Unused_Media');

  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  const restored = [];
  const errors = [];

  for (const filename of filesToRestore) {
    const srcPath = path.join(backupDir, filename);
    const destPath = path.join(mediaDir, filename);
    
    if (fs.existsSync(srcPath)) {
      try {
        fs.renameSync(srcPath, destPath);
        restored.push(filename);
      } catch (err) {
        errors.push({ filename, error: err.message });
      }
    } else {
      errors.push({ filename, error: 'File does not exist in backup' });
    }
  }

  res.json({ success: true, restored, errors });
});

// 4.6. Workspace Plugin Audit: scans all projects in parent workspace
app.get('/api/workspace-audit', (req, res) => {
  const projects = scanProjects(WORKSPACE_DIR);
  const totalProjects = projects.length;
  
  const pluginCounts = {};
  const pluginRegistry = {}; // classID -> name
  const stockPlugins = new Set([
    "Pro EQ", "Pro EQ³", "Compressor", "Limiter", "Binaural Pan", "Beat Delay", 
    "Analog Delay", "Room Reverb", "MixVerb", "RedLightDist", "Ampire", "Pedalboard", 
    "Autofilter", "Chorus", "Flanger", "Phaser", "Tremolo", "X-Trem", "Rotary", 
    "Gate", "Expander", "Limiter2", "Fat Channel", "Pipeline", "Scope", 
    "Spectrum Meter", "Tuner", "Level Meter", "Dual Pan", "Splitter", "Console Shaper", 
    "CTC-1", "PortaCassette", "Vocoder", "Open AIR", "Empire", "Tone Generator", 
    "Input Delay", "Phase Meter", "IR Maker", "VU Meter"
  ]);

  const projectComplexity = [];

  for (const proj of projects) {
    let trackCount = 0;
    let pluginCount = 0;
    let localPlugins = [];
    
    try {
      if (fs.existsSync(proj.songPath)) {
        const zip = new AdmZip(proj.songPath);
        
        // Count tracks from metainfo if available
        const metainfoEntry = zip.getEntry('metainfo.xml');
        if (metainfoEntry) {
          const text = metainfoEntry.getData().toString('utf8');
          const trackCountMatch = text.match(/id="Media:TrackCount"\s+value="(\d+)"/);
          if (trackCountMatch) {
            trackCount = parseInt(trackCountMatch[1]);
          }
        }

        // Parse audiomixer to extract plugins
        const mixerEntry = zip.getEntry('Devices/audiomixer.xml');
        if (mixerEntry) {
          const mixerText = mixerEntry.getData().toString('utf8');
          const matches = mixerText.matchAll(/<Attributes\s+([^>]+)>/g);
          for (const match of matches) {
            const attribsStr = match[1];
            if (attribsStr.includes('classID=')) {
              const classIDMatch = attribsStr.match(/classID="([^"]+)"/);
              const nameMatch = attribsStr.match(/name="([^"]+)"/);
              if (classIDMatch && nameMatch) {
                const name = nameMatch[1];
                const classID = classIDMatch[1];
                pluginCounts[name] = (pluginCounts[name] || 0) + 1;
                pluginRegistry[classID] = name;
                pluginCount++;
                localPlugins.push(name);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(`Error auditing project ${proj.name}:`, e);
    }

    projectComplexity.push({
      name: proj.name,
      songPath: proj.songPath,
      trackCount,
      pluginCount,
      plugins: localPlugins
    });
  }

  // Sort plugins by popularity
  const sortedPlugins = Object.entries(pluginCounts)
    .map(([name, count]) => ({
      name,
      count,
      isStock: stockPlugins.has(name)
    }))
    .sort((a, b) => b.count - a.count);

  const workspacePlugins = Object.entries(pluginRegistry).map(([classID, name]) => {
    let format = 'VST3';
    if (stockPlugins.has(name)) {
      format = 'Stock';
    } else if (classID.startsWith('{565354')) {
      format = 'VST2';
    }
    return { name, classID, format };
  });

  res.json({
    totalProjects,
    plugins: sortedPlugins,
    projectComplexity,
    workspacePlugins
  });
});

// 4.7. Package project for collaboration: copies song and active files to collab ZIP
app.post('/api/package-project', (req, res) => {
  const { projectDir, activeFiles, songName } = req.body;
  if (!projectDir || !fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Project folder not found.' });
  }

  try {
    const songPath = path.join(projectDir, songName);
    const mediaDir = path.join(projectDir, 'Media');
    const collabZipName = `${path.basename(projectDir)} - Collab.zip`;
    const collabZipPath = path.join(projectDir, collabZipName);

    const zip = new AdmZip();

    // 1. Add the .song file
    if (fs.existsSync(songPath)) {
      zip.addLocalFile(songPath);
    } else {
      throw new Error(`Song file ${songName} not found in project folder.`);
    }

    // 2. Add only the active media files
    if (fs.existsSync(mediaDir)) {
      for (const filename of activeFiles) {
        const filePath = path.join(mediaDir, filename);
        if (fs.existsSync(filePath)) {
          // Add into a 'Media' directory within the zip
          zip.addLocalFile(filePath, 'Media');
        }
      }
    }

    // Write zip to project folder
    zip.writeZip(collabZipPath);
    const stats = fs.statSync(collabZipPath);

    res.json({
      success: true,
      collabZipPath,
      filename: collabZipName,
      size: stats.size
    });
  } catch (err) {
    console.error('Error packaging project:', err);
    res.status(500).json({ error: `Failed to package collaboration project: ${err.message}` });
  }
});

// Helper: Update XML colors based on keyword rules
function updateXmlColors(xmlContent, rules) {
  const tagRegex = /<(MediaTrack|AudioTrackChannel|AudioSynthChannel|AudioGroupChannel|AudioOutputChannel|FolderTrack|ChordTrack|ArrangerTrack|LyricsTrack|VideoTrack|SynthTrack)\s+([^>]+)>/g;
  
  return xmlContent.replace(tagRegex, (match, tagName, attrsStr) => {
    const nameMatch = attrsStr.match(/name="([^"]+)"/);
    if (!nameMatch) return match;
    const name = nameMatch[1];
    
    const matchingRule = rules.find(r => {
      const pat = r.pattern.toLowerCase().trim();
      return pat && name.toLowerCase().includes(pat);
    });
    
    if (matchingRule) {
      let targetColor = matchingRule.color.toLowerCase().replace('#', '');
      if (targetColor.length === 6) {
        targetColor = 'ff' + targetColor;
      }
      
      let updatedAttrs = attrsStr;
      if (attrsStr.includes('color=')) {
        updatedAttrs = attrsStr.replace(/color="[^"]*"/, `color="${targetColor}"`);
      } else {
        updatedAttrs = attrsStr + ` color="${targetColor}"`;
      }
      return `<${tagName} ${updatedAttrs}>`;
    }
    return match;
  });
}

// API: Recolor tracks in a project
app.post('/api/recolor-tracks', (req, res) => {
  const { songPath, rules } = req.body;
  if (!songPath || !fs.existsSync(songPath)) {
    return res.status(404).json({ error: 'Song file not found.' });
  }
  if (!rules || !Array.isArray(rules)) {
    return res.status(400).json({ error: 'Rules array is required.' });
  }

  try {
    const zip = new AdmZip(songPath);
    
    // 1. Process Song/song.xml
    const songEntry = zip.getEntry('Song/song.xml');
    if (songEntry) {
      let xml = songEntry.getData().toString('utf8');
      xml = updateXmlColors(xml, rules);
      zip.updateFile('Song/song.xml', Buffer.from(xml, 'utf8'));
    }
    
    // 2. Process Devices/audiomixer.xml
    const mixerEntry = zip.getEntry('Devices/audiomixer.xml');
    if (mixerEntry) {
      let xml = mixerEntry.getData().toString('utf8');
      xml = updateXmlColors(xml, rules);
      zip.updateFile('Devices/audiomixer.xml', Buffer.from(xml, 'utf8'));
    }
    
    // Write changes back to the .song ZIP
    zip.writeZip(songPath);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error recoloring tracks:', err);
    res.status(500).json({ error: `Failed to recolor tracks: ${err.message}` });
  }
});

// API: Remap VST classIDs and names in Devices/audiomixer.xml
app.post('/api/remap-plugins', (req, res) => {
  const { songPath, rules } = req.body;
  if (!songPath || !fs.existsSync(songPath)) {
    return res.status(404).json({ error: 'Song file not found.' });
  }
  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    return res.status(400).json({ error: 'Rules array is required.' });
  }

  try {
    const projectDir = path.dirname(songPath);
    
    // 1. Create a backup snapshot in History/
    const historyDir = path.join(projectDir, 'History');
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    const date = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    const baseName = path.basename(songPath, '.song');
    const backupName = `${baseName} ${timestamp} (Before Plugin Remap).song`;
    const backupPath = path.join(historyDir, backupName);
    
    fs.copyFileSync(songPath, backupPath);
    console.log(`Created plugin remap backup at: ${backupPath}`);

    // 2. Open ZIP and modify Devices/audiomixer.xml
    const zip = new AdmZip(songPath);
    const mixerEntry = zip.getEntry('Devices/audiomixer.xml');
    
    if (mixerEntry) {
      let xml = mixerEntry.getData().toString('utf8');
      
      rules.forEach(rule => {
        // Remap classIDs
        const srcClassID = rule.sourceClassID;
        const targetClassID = rule.targetClassID;
        const escapedClassID = srcClassID.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const classIDRegex = new RegExp(`classID="${escapedClassID}"`, 'g');
        xml = xml.replace(classIDRegex, `classID="${targetClassID}"`);

        // Remap names
        const srcName = rule.sourceName;
        const targetName = rule.targetName;
        const escapedName = srcName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const nameRegex = new RegExp(`name="${escapedName}"`, 'g');
        xml = xml.replace(nameRegex, `name="${targetName}"`);
      });

      zip.updateFile('Devices/audiomixer.xml', Buffer.from(xml, 'utf8'));
    }

    // Write changes back to the ZIP
    zip.writeZip(songPath);

    res.json({ success: true, backupName });
  } catch (err) {
    console.error('Error remapping plugins:', err);
    res.status(500).json({ error: `Failed to remap plugins: ${err.message}` });
  }
});

// XML escaping helper
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// XML unescaping helper
function unescapeXml(safe) {
  return safe.replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&apos;/g, "'");
}

// Convert file URL to OS path
function fileUrlToPath(url) {
  let unescaped = unescapeXml(url);
  let pathPart = unescaped.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, '');
  try {
    pathPart = decodeURIComponent(pathPart);
  } catch (e) {
    // ignore
  }
  return path.normalize(pathPart);
}

// Helper: walk directory recursively and index standard media files
function buildWorkspaceIndex(baseDir) {
  const index = new Map(); // filename.toLowerCase() -> array of absolute paths
  let count = 0;
  
  function walk(dir, depth = 0) {
    if (depth > 6) return;
    if (count > 50000) return;
    
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (item.startsWith('.') || item === 'node_modules' || item === 'System Volume Information' || item === 'History' || item === 'Backup_Unused_Media') {
          continue;
        }
        const fullPath = path.join(dir, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            const mediaExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff', '.mid', '.midi', '.mp4', '.m4a', '.mov', '.avi'];
            if (mediaExtensions.includes(ext)) {
              const lowerName = item.toLowerCase();
              if (!index.has(lowerName)) {
                index.set(lowerName, []);
              }
              index.get(lowerName).push(fullPath);
              count++;
            }
          } else if (stat.isDirectory()) {
            walk(fullPath, depth + 1);
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }
  }

  walk(baseDir);
  return index;
}

// Endpoint: get missing media clips status and scan workspace for relocations
app.get('/api/media-relink-status', (req, res) => {
  const { songPath, customSearchDir } = req.query;
  if (!songPath || !fs.existsSync(songPath)) {
    return res.status(404).json({ error: 'Song file not found.' });
  }

  try {
    const zip = new AdmZip(songPath);
    const mediapoolEntry = zip.getEntry('Song/mediapool.xml');
    if (!mediapoolEntry) {
      return res.json({ success: true, missingClips: [] });
    }

    const xmlText = mediapoolEntry.getData().toString('utf8').replace(/^\uFEFF/, '');
    
    // Find all file:/// URLs
    const fileUrls = new Set();
    let match;
    const urlRegex = /url="(file:\/\/[^"]+)"/gi;
    while ((match = urlRegex.exec(xmlText)) !== null) {
      fileUrls.add(match[1]);
    }

    // Index the workspace
    const index = buildWorkspaceIndex(WORKSPACE_DIR);
    
    // Index project directory if it is different
    const projDir = path.dirname(songPath);
    if (!projDir.startsWith(WORKSPACE_DIR)) {
      const projIndex = buildWorkspaceIndex(projDir);
      for (const [key, paths] of projIndex.entries()) {
        if (!index.has(key)) {
          index.set(key, []);
        }
        paths.forEach(p => {
          if (!index.get(key).includes(p)) {
            index.get(key).push(p);
          }
        });
      }
    }

    // Index customSearchDir if provided
    if (customSearchDir && fs.existsSync(customSearchDir)) {
      const customIndex = buildWorkspaceIndex(customSearchDir);
      for (const [key, paths] of customIndex.entries()) {
        if (!index.has(key)) {
          index.set(key, []);
        }
        paths.forEach(p => {
          if (!index.get(key).includes(p)) {
            index.get(key).push(p);
          }
        });
      }
    }

    const missingClips = [];

    fileUrls.forEach(url => {
      const originalPath = fileUrlToPath(url);
      let exists = false;
      try {
        exists = fs.existsSync(originalPath);
      } catch (e) {
        // ignore errors on invalid paths
      }
      
      if (!exists) {
        const fileName = path.basename(originalPath);
        const lowerName = fileName.toLowerCase();
        const suggestions = index.get(lowerName) || [];
        
        missingClips.push({
          sourceUrl: url,
          fileName,
          originalPath,
          suggestions
        });
      }
    });

    res.json({ success: true, missingClips });
  } catch (err) {
    console.error('Error analyzing media relink status:', err);
    res.status(500).json({ error: `Failed to analyze media pool: ${err.message}` });
  }
});

// Endpoint: Apply media relinking in-place and create project backup
app.post('/api/relink-media', (req, res) => {
  const { songPath, relinkRules } = req.body;
  if (!songPath || !fs.existsSync(songPath)) {
    return res.status(404).json({ error: 'Song file not found.' });
  }
  if (!relinkRules || !Array.isArray(relinkRules) || relinkRules.length === 0) {
    return res.status(400).json({ error: 'Relink rules are required.' });
  }

  try {
    const projectDir = path.dirname(songPath);
    
    // 1. Create a backup snapshot in History/
    const historyDir = path.join(projectDir, 'History');
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    const date = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    const baseName = path.basename(songPath, '.song');
    const backupName = `${baseName} ${timestamp} (Before Media Relink).song`;
    const backupPath = path.join(historyDir, backupName);
    
    fs.copyFileSync(songPath, backupPath);
    console.log(`Created media relink backup at: ${backupPath}`);

    // 2. Open ZIP and modify Song/mediapool.xml
    const zip = new AdmZip(songPath);
    const mediapoolEntry = zip.getEntry('Song/mediapool.xml');
    
    if (mediapoolEntry) {
      let xml = mediapoolEntry.getData().toString('utf8');
      
      relinkRules.forEach(rule => {
        const srcUrl = rule.sourceUrl;
        const targetPath = rule.targetPath;
        
        // Format to file URL
        const targetUrl = 'file:///' + targetPath.replace(/\\/g, '/');
        
        const escapedSrcUrl = escapeXml(srcUrl);
        const escapedTargetUrl = escapeXml(targetUrl);
        
        const searchStr = `url="${escapedSrcUrl}"`;
        const replaceStr = `url="${escapedTargetUrl}"`;
        
        xml = xml.split(searchStr).join(replaceStr);
      });

      zip.updateFile('Song/mediapool.xml', Buffer.from(xml, 'utf8'));
    }

    // Write changes back to the ZIP
    zip.writeZip(songPath);

    res.json({ success: true, backupName });
  } catch (err) {
    console.error('Error relinking media:', err);
    res.status(500).json({ error: `Failed to relink media: ${err.message}` });
  }
});


// 5. Generate template: writes a new stripped .song file
app.post('/api/save-template', (req, res) => {
  const { originalSongPath, strippedSongXml } = req.body;
  if (!originalSongPath || !fs.existsSync(originalSongPath)) {
    return res.status(404).json({ error: 'Original song not found.' });
  }

  try {
    const dir = path.dirname(originalSongPath);
    const ext = path.extname(originalSongPath);
    const base = path.basename(originalSongPath, ext);
    const templateName = `${base} - Template${ext}`;
    const newSongPath = path.join(dir, templateName);

    // Read original zip
    const zip = new AdmZip(originalSongPath);
    
    // Replace Song/song.xml
    // Note: S1 uses UTF-8 XML. Make sure to write as buffer.
    zip.updateFile('Song/song.xml', Buffer.from(strippedSongXml, 'utf8'));

    // We can also clear unused references from mediapool or leave them empty
    // Write new zip to disk
    zip.writeZip(newSongPath);

    res.json({ success: true, newSongPath, filename: templateName });
  } catch (err) {
    console.error('Error writing template:', err);
    res.status(500).json({ error: `Failed to save template: ${err.message}` });
  }
});

// 6. Export vocal chain as preset
app.post('/api/export-preset', (req, res) => {
  const { projectDir, trackName, presetXml } = req.body;
  if (!projectDir || !fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Project folder not found.' });
  }

  try {
    const presetDir = path.join(projectDir, 'Presets');
    if (!fs.existsSync(presetDir)) {
      fs.mkdirSync(presetDir, { recursive: true });
    }

    const cleanTrackName = trackName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `${cleanTrackName}_VocalChain.multipreset`;
    const presetPath = path.join(presetDir, filename);

    // Studio One Multipresets are XML structures wrapped in a specific envelope.
    // We will save the raw plugin chain XML. The user can import or rename.
    fs.writeFileSync(presetPath, presetXml, 'utf8');

    res.json({ success: true, presetPath, filename });
  } catch (err) {
    console.error('Error exporting preset:', err);
    res.status(500).json({ error: `Failed to export preset: ${err.message}` });
  }
});

// 7. List MIDI performances and automation envelopes inside .song
app.get('/api/list-performances', (req, res) => {
  const { songPath } = req.query;
  if (!songPath || !fs.existsSync(songPath)) {
    return res.status(404).json({ error: 'Song file not found.' });
  }

  try {
    const zip = new AdmZip(songPath);
    const entries = zip.getEntries();
    
    // Parse mediapool and song XML
    const mediaEntry = zip.getEntry('Song/mediapool.xml');
    const songEntry = zip.getEntry('Song/song.xml');
    
    const musicxMap = new Map(); // path -> mediaID
    const usedMediaIDs = new Set();
    
    if (mediaEntry && songEntry) {
      const mediapoolXml = mediaEntry.getData().toString('utf8');
      const songXml = songEntry.getData().toString('utf8');
      
      const clipRegex = /<MusicClip\s+([^>]+)>([\s\S]*?)<\/MusicClip>/g;
      let match;
      while ((match = clipRegex.exec(mediapoolXml)) !== null) {
        const attrsStr = match[1];
        const innerStr = match[2];
        const mediaIDMatch = attrsStr.match(/mediaID="([^"]+)"/);
        const urlMatch = innerStr.match(/url="([^"]+)"/);
        
        if (mediaIDMatch && urlMatch) {
          const mediaID = mediaIDMatch[1];
          let url = urlMatch[1];
          if (url.startsWith('media:///')) {
            url = url.replace('media:///', '');
          }
          musicxMap.set(url.toLowerCase(), mediaID);
        }
      }
      
      // Find all mediaIDs in song.xml
      musicxMap.forEach((mediaID, relPath) => {
        const escapedID = mediaID.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regexID = new RegExp(escapedID, 'gi');
        if (songXml.match(regexID)) {
          usedMediaIDs.add(mediaID);
        }
      });
    }

    const musicx = [];
    const envelopex = [];

    entries.forEach(entry => {
      const name = entry.entryName;
      if (name.endsWith('.musicx')) {
        const entryPathLower = name.toLowerCase();
        const mediaID = musicxMap.get(entryPathLower);
        const isUsed = mediaID ? usedMediaIDs.has(mediaID) : false;

        let events = [];
        try {
          events = parseMusicx(entry.getData());
        } catch (e) {
          console.error(`Error parsing musicx entry ${name}:`, e);
        }

        // Create a signature of the notes list
        // Note: round values to avoid tiny float variations
        const noteSignatures = events.map(n => 
          `${n.pitch},${(n.start || 0).toFixed(3)},${(n.length || 0).toFixed(3)},${(n.velocity || 0.8).toFixed(3)}`
        ).sort();
        const signature = noteSignatures.join('|') || 'empty';

        musicx.push({
          name: path.basename(name, '.musicx'),
          path: name,
          isUsed,
          signature,
          notesCount: events.length
        });
      } else if (name.endsWith('.envelopex')) {
        let pts = [];
        try {
          pts = parseEnvelopex(entry.getData());
        } catch (e) {
          console.error(`Error parsing envelopex entry ${name}:`, e);
        }
        if (pts.length > 0) {
          envelopex.push({
            name: name.replace('Envelopes/', '').replace('.envelopex', ''),
            path: name,
            pointsCount: pts.length
          });
        }
      }
    });

    // Group by signature to find duplicates
    const sigGroups = {};
    musicx.forEach(clip => {
      const sig = clip.signature;
      if (!sigGroups[sig]) sigGroups[sig] = [];
      sigGroups[sig].push(clip);
    });

    // Mark duplicate status: Keep the first one as primary, only flag subsequent ones as isDuplicate
    musicx.forEach(clip => {
      const group = sigGroups[clip.signature] || [];
      if (group.length > 1) {
        const isPrimary = (group[0].path === clip.path);
        const otherNames = group
          .filter(c => c.path !== clip.path)
          .map(c => c.name);
        
        clip.duplicates = otherNames;
        clip.isDuplicate = !isPrimary; // Only secondary copies are classified as isDuplicate category
        clip.hasDuplicates = true;
        clip.primaryName = group[0].name;
      } else {
        clip.duplicates = [];
        clip.isDuplicate = false;
        clip.hasDuplicates = false;
        clip.primaryName = clip.name;
      }
    });

    res.json({ musicx, envelopex });
  } catch (err) {
    console.error('Error listing performances:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: Parse binary .musicx events (big-endian doubles for times/lengths)
function parseMusicx(buf) {
  const events = [];
  let offset = 0;
  
  const startList = buf.indexOf('events[');
  if (startList !== -1) {
    offset = startList;
  }
  
  while (true) {
    const idx = buf.indexOf('{i', offset);
    if (idx === -1) break;
    
    const endIdx = buf.indexOf('}', idx);
    if (endIdx === -1) break;
    
    const eventBuf = buf.subarray(idx, endIdx + 1);
    const event = {};
    
    // Pitch
    const pIdx = eventBuf.indexOf('pitchi');
    if (pIdx !== -1 && pIdx + 6 < eventBuf.length) {
      event.pitch = eventBuf[pIdx + 6];
    }
    
    // Start
    const sIdx = eventBuf.indexOf('startD');
    if (sIdx !== -1 && sIdx + 14 <= eventBuf.length) {
      event.start = eventBuf.readDoubleBE(sIdx + 6);
    } else {
      event.start = 0.0;
    }
    
    // Length
    const lIdx = eventBuf.indexOf('lengthD');
    if (lIdx !== -1 && lIdx + 15 <= eventBuf.length) {
      event.length = eventBuf.readDoubleBE(lIdx + 7);
    } else {
      event.length = 0.0;
    }
    
    // Velocity
    const vIdx = eventBuf.indexOf('velocityD');
    if (vIdx !== -1 && vIdx + 17 <= eventBuf.length) {
      event.velocity = eventBuf.readDoubleBE(vIdx + 9);
    } else {
      event.velocity = 0.8;
    }
    
    events.push(event);
    offset = idx + 2;
  }
  return events;
}

// Helper: Parse binary .envelopex curves
function parseEnvelopex(buf) {
  const points = [];
  let offset = 0;
  
  const startList = buf.indexOf('events[');
  if (startList !== -1) {
    offset = startList;
  }

  while (true) {
    const idx = buf.indexOf('{i', offset);
    if (idx === -1) break;
    
    const endIdx = buf.indexOf('}', idx);
    if (endIdx === -1) break;
    
    const eventBuf = buf.subarray(idx, endIdx + 1);
    const pt = {};
    
    // Start
    const sIdx = eventBuf.indexOf('startD');
    if (sIdx !== -1 && sIdx + 14 <= eventBuf.length) {
      pt.start = eventBuf.readDoubleBE(sIdx + 6);
    } else {
      pt.start = 0.0;
    }
    
    // Value
    const vIdx = eventBuf.indexOf('valueD');
    if (vIdx !== -1 && vIdx + 14 <= eventBuf.length) {
      pt.value = eventBuf.readDoubleBE(vIdx + 6);
    } else {
      pt.value = 0.0;
    }
    
    points.push(pt);
    offset = idx + 2;
  }
  return points;
}

// 8. Load and parse a specific performance file
app.get('/api/load-performance', (req, res) => {
  const { songPath, entryPath } = req.query;
  if (!songPath || !fs.existsSync(songPath)) {
    return res.status(404).json({ error: 'Song file not found.' });
  }
  if (!entryPath) {
    return res.status(400).json({ error: 'Entry path parameter required.' });
  }

  try {
    const zip = new AdmZip(songPath);
    const entry = zip.getEntry(entryPath);
    if (!entry) {
      return res.status(404).json({ error: `Entry ${entryPath} not found in archive.` });
    }

    const buf = entry.getData();
    let events = [];

    if (entryPath.endsWith('.musicx')) {
      events = parseMusicx(buf);
      res.json({ type: 'midi', events });
    } else if (entryPath.endsWith('.envelopex')) {
      events = parseEnvelopex(buf);
      res.json({ type: 'automation', events });
    } else {
      res.status(400).json({ error: 'Unsupported performance file extension.' });
    }
  } catch (err) {
    console.error('Error loading performance:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. Convert S1 song version to older (v6 or v7)
app.post('/api/convert-version', (req, res) => {
  const { songPath, targetVersion } = req.body;
  if (!songPath || !fs.existsSync(songPath)) {
    return res.status(404).json({ error: 'Song file not found.' });
  }

  try {
    const dir = path.dirname(songPath);
    const ext = path.extname(songPath);
    const base = path.basename(songPath, ext);
    const newFilename = `${base} - v${targetVersion}${ext}`;
    const newSongPath = path.join(dir, newFilename);

    // Duplicate original zip
    fs.copyFileSync(songPath, newSongPath);

    // Open duplicate zip
    const zip = new AdmZip(newSongPath);
    
    // Read metainfo.xml
    const metainfoEntry = zip.getEntry('metainfo.xml');
    if (!metainfoEntry) {
      throw new Error('metainfo.xml not found inside the .song package.');
    }

    let metainfoText = metainfoEntry.getData().toString('utf8');

    // Target values
    let formatVersion = '8'; // Studio One 7
    let generatorValue = 'Studio Pro/7.2.0.98560';

    const tVersion = String(targetVersion);
    if (tVersion === '6') {
      formatVersion = '7'; // Studio One 6
      generatorValue = 'Studio Pro/6.5.2.96420';
    } else if (tVersion === '5') {
      formatVersion = '6'; // Studio One 5
      generatorValue = 'Studio Pro/5.5.2.86520';
    } else if (tVersion === '4') {
      formatVersion = '5'; // Studio One 4
      generatorValue = 'Studio Pro/4.6.2.58720';
    } else if (tVersion === '3') {
      formatVersion = '4'; // Studio One 3
      generatorValue = 'Studio Pro/3.5.6.46910';
    }

    // Replace
    metainfoText = metainfoText.replace(
      /id="Document:FormatVersion" value="[^"]*"/,
      `id="Document:FormatVersion" value="${formatVersion}"`
    );
    metainfoText = metainfoText.replace(
      /id="Document:Generator" value="[^"]*"/,
      `id="Document:Generator" value="${generatorValue}"`
    );

    // Write back
    zip.updateFile('metainfo.xml', Buffer.from(metainfoText, 'utf8'));
    zip.writeZip(newSongPath);

    res.json({ success: true, newSongPath, filename: newFilename });
  } catch (err) {
    console.error('Error converting S1 version:', err);
    res.status(500).json({ error: `Failed to convert project: ${err.message}` });
  }
});

// 10. Project History Timeline
app.get('/api/project-history', (req, res) => {
  const { projectDir } = req.query;
  if (!projectDir || !fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Project folder not found.' });
  }

  const historyDir = path.join(projectDir, 'History');
  if (!fs.existsSync(historyDir)) {
    return res.json({ snapshots: [] });
  }

  const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.song'));
  const snapshots = [];

  for (const filename of files) {
    const filePath = path.join(historyDir, filename);
    const stats = fs.statSync(filePath);

    // Parse timestamp from filename e.g. "Korazon - Sexy 20260503-165206 (Before Autosave).song"
    const tsMatch = filename.match(/(\d{8})-(\d{6})/);
    const labelMatch = filename.match(/\(([^)]+)\)/);

    let isoDate = null;
    if (tsMatch) {
      const d = tsMatch[1]; // 20260503
      const t = tsMatch[2]; // 165206
      isoDate = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`;
    }

    const saveType = labelMatch ? labelMatch[1] : 'Manual Save';

    // Extract metadata from inside the .song zip
    let trackCount = 0;
    let markerCount = 0;
    let bpm = null;
    let formatVersion = null;

    try {
      const zip = new AdmZip(filePath);

      const metainfoEntry = zip.getEntry('metainfo.xml');
      if (metainfoEntry) {
        const text = metainfoEntry.getData().toString('utf8');
        const tcMatch = text.match(/id="Media:TrackCount"\s+value="(\d+)"/);
        if (tcMatch) trackCount = parseInt(tcMatch[1]);
        const fvMatch = text.match(/id="Document:FormatVersion"\s+value="([^"]+)"/);
        if (fvMatch) formatVersion = fvMatch[1];
      }

      const songEntry = zip.getEntry('Song/song.xml');
      if (songEntry) {
        const text = songEntry.getData().toString('utf8');
        // Count markers
        const markerMatches = text.match(/<MarkerEvent/g);
        markerCount = markerMatches ? markerMatches.length : 0;
        // BPM from tempo: BPM = 60 / tempo
        const tempoMatch = text.match(/tempo="([^"]+)"/);
        if (tempoMatch) {
          const t = parseFloat(tempoMatch[1]);
          if (t > 0) bpm = parseFloat((60 / t).toFixed(1));
        }
      }
    } catch (e) {
      // Non-blocking: skip metadata if zip fails
    }

    snapshots.push({
      filename,
      filePath,
      isoDate,
      saveType,
      size: stats.size,
      trackCount,
      markerCount,
      bpm,
      formatVersion
    });
  }

  // Sort chronologically
  snapshots.sort((a, b) => {
    if (!a.isoDate) return 1;
    if (!b.isoDate) return -1;
    return new Date(a.isoDate) - new Date(b.isoDate);
  });

  // Add size delta between consecutive snapshots
  for (let i = 0; i < snapshots.length; i++) {
    snapshots[i].index = i;
    snapshots[i].sizeDelta = i > 0 ? snapshots[i].size - snapshots[i - 1].size : 0;
  }

  res.json({ snapshots });
});

// 11. Browse filesystem for audio files
const AUDIO_EXTS = new Set(['.wav', '.mp3', '.aiff', '.aif', '.flac', '.ogg', '.m4a']);

app.get('/api/browse-files', (req, res) => {
  let { dir } = req.query;

  // Default to workspace dir if none provided
  if (!dir) dir = WORKSPACE_DIR;

  // Normalize & resolve
  dir = path.resolve(dir);

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return res.status(404).json({ error: 'Directory not found.' });
  }

  try {
    const items = fs.readdirSync(dir);
    const dirs = [];
    const files = [];

    for (const item of items) {
      if (item.startsWith('.')) continue; // skip hidden
      const itemPath = path.join(dir, item);
      try {
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          dirs.push({ name: item, path: itemPath });
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (AUDIO_EXTS.has(ext)) {
            files.push({ name: item, path: itemPath, size: stat.size, ext });
          }
        }
      } catch (e) { /* skip permission errors */ }
    }

    // Build breadcrumbs
    const parts = dir.split(path.sep).filter(Boolean);
    const breadcrumbs = parts.map((part, i) => ({
      name: part,
      path: path.sep + parts.slice(0, i + 1).join(path.sep)
    }));

    const parent = path.dirname(dir) !== dir ? path.dirname(dir) : null;

    res.json({ currentDir: dir, parent, breadcrumbs, dirs, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Stream an audio file (with Range support for seeking)
app.get('/api/stream-audio', (req, res) => {
  const { filePath } = req.query;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.wav':  'audio/wav',
    '.mp3':  'audio/mpeg',
    '.aiff': 'audio/aiff',
    '.aif':  'audio/aiff',
    '.flac': 'audio/flac',
    '.ogg':  'audio/ogg',
    '.m4a':  'audio/mp4',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    // Partial content for seeking
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// 13. Get unused MIDI clips status
app.get('/api/midi-cleaner-status', (req, res) => {
  const { songPath } = req.query;
  if (!songPath || !fs.existsSync(songPath)) {
    return res.status(404).json({ error: 'Song file not found.' });
  }

  try {
    const zip = new AdmZip(songPath);
    
    const mediaEntry = zip.getEntry('Song/mediapool.xml');
    const songEntry = zip.getEntry('Song/song.xml');
    if (!mediaEntry || !songEntry) {
      return res.json({ unusedClips: [] });
    }

    const mediapoolXml = mediaEntry.getData().toString('utf8');
    const songXml = songEntry.getData().toString('utf8');

    // Parse MusicClips from mediapool.xml
    const musicClips = [];
    const clipRegex = /<MusicClip\s+([^>]+)>([\s\S]*?)<\/MusicClip>/g;
    let match;
    while ((match = clipRegex.exec(mediapoolXml)) !== null) {
      const attrsStr = match[1];
      const innerStr = match[2];
      
      const nameMatch = attrsStr.match(/name="([^"]+)"/);
      const mediaIDMatch = attrsStr.match(/mediaID="([^"]+)"/);
      const useCountMatch = attrsStr.match(/useCount="(\d+)"/);
      const urlMatch = innerStr.match(/url="([^"]+)"/);

      const name = nameMatch ? nameMatch[1] : 'Unknown';
      const mediaID = mediaIDMatch ? mediaIDMatch[1] : '';
      const useCount = useCountMatch ? parseInt(useCountMatch[1]) : 0;
      let url = urlMatch ? urlMatch[1] : '';
      
      // Clean url from media:/// prefix
      let relativePath = url;
      if (url.startsWith('media:///')) {
        relativePath = url.replace('media:///', '');
      }

      musicClips.push({ name, mediaID, useCount, relativePath, rawUrl: url });
    }

    // Check which ones are referenced in song.xml
    const unusedClips = [];
    musicClips.forEach(clip => {
      if (!clip.mediaID) return;
      const escapedID = clip.mediaID.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regexID = new RegExp(escapedID, 'gi');
      const occurrences = (songXml.match(regexID) || []).length;
      
      if (occurrences === 0) {
        // Find if the file actually exists in ZIP archive
        const zipEntry = zip.getEntry(clip.relativePath);
        const size = zipEntry ? zipEntry.header.size : 0;
        
        unusedClips.push({
          name: clip.name,
          mediaID: clip.mediaID,
          relativePath: clip.relativePath,
          rawUrl: clip.rawUrl,
          size
        });
      }
    });

    res.json({ unusedClips });
  } catch (err) {
    console.error('Error in /api/midi-cleaner-status:', err);
    res.status(500).json({ error: err.message });
  }
});

// 14. Clean unused MIDI clips (remove from ZIP and mediapool.xml)
app.post('/api/clean-midi-clips', (req, res) => {
  const { songPath, mediaIDs } = req.body;
  if (!songPath || !fs.existsSync(songPath)) {
    return res.status(404).json({ error: 'Song file not found.' });
  }
  if (!mediaIDs || !Array.isArray(mediaIDs) || mediaIDs.length === 0) {
    return res.status(400).json({ error: 'List of mediaIDs to clean is required.' });
  }

  try {
    const projectDir = path.dirname(songPath);
    
    // 1. Create a backup snapshot of the .song file in the project's History/ folder
    const historyDir = path.join(projectDir, 'History');
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    const date = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const yyyymmdd = date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate());
    const hhmmss = pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
    const timestamp = `${yyyymmdd}-${hhmmss}`;
    const baseSongName = path.basename(songPath, '.song');
    const backupSongName = `${baseSongName} ${timestamp} (Before MIDI Cleanup).song`;
    const backupPath = path.join(historyDir, backupSongName);
    
    // Copy the original file as backup
    fs.copyFileSync(songPath, backupPath);
    console.log(`Created MIDI cleanup backup at: ${backupPath}`);

    // 2. Open ZIP
    const zip = new AdmZip(songPath);
    const mediaEntry = zip.getEntry('Song/mediapool.xml');
    if (!mediaEntry) {
      throw new Error('mediapool.xml not found inside the project package.');
    }

    let mediapoolXml = mediaEntry.getData().toString('utf8');

    const cleanedMediaIDs = [];
    const cleanedFilePaths = [];

    // Find the relative path for each mediaID in mediapoolXml so we can delete the file
    mediaIDs.forEach(mediaID => {
      const escapedID = mediaID.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const blockRegex = new RegExp(`<MusicClip[^>]*mediaID="${escapedID}"[^>]*>([\\s\\S]*?)<\\/MusicClip>`, 'i');
      const match = mediapoolXml.match(blockRegex);
      
      if (match) {
        const innerXml = match[1];
        const urlMatch = innerXml.match(/url="media:\/\/\/([^"]+)"/i);
        if (urlMatch) {
          cleanedFilePaths.push(urlMatch[1]);
        }
        
        // Remove the block from the XML
        mediapoolXml = mediapoolXml.replace(blockRegex, '');
        cleanedMediaIDs.push(mediaID);
      }
    });

    // 3. Write updated mediapool.xml back into ZIP
    zip.updateFile('Song/mediapool.xml', Buffer.from(mediapoolXml, 'utf8'));

    // 4. Delete the corresponding performance (.musicx) files from the ZIP
    const deletedFiles = [];
    cleanedFilePaths.forEach(relPath => {
      const entry = zip.getEntry(relPath);
      if (entry) {
        zip.deleteFile(relPath);
        deletedFiles.push(relPath);
      }
    });

    // 5. Write the ZIP file to disk
    zip.writeZip(songPath);

    res.json({
      success: true,
      backupPath,
      cleanedMediaIDs,
      deletedFiles
    });
  } catch (err) {
    console.error('Error cleaning MIDI clips:', err);
    res.status(500).json({ error: `Failed to clean MIDI clips: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Studio One Analyzer backend running on http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use, assuming another instance of the backend is active.`);
  } else {
    console.error('Server error:', err);
  }
});
