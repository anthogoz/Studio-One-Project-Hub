import React, { useEffect, useState } from 'react';

export default function ProjectCleaner({ parsedData, projectDir, songName, songPath }) {
  const { audioClips } = parsedData;
  const [diskFiles, setDiskFiles] = useState([]);
  const [unusedFiles, setUnusedFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [backupFiles, setBackupFiles] = useState([]);
  const [selectedBackupFiles, setSelectedBackupFiles] = useState([]);
  const [unusedMidi, setUnusedMidi] = useState([]);
  const [selectedMidi, setSelectedMidi] = useState([]);
  const [subTab, setSubTab] = useState('clean'); // 'clean', 'midi', 'restore', 'collab'
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // 1. Fetch files on disk & backup files
  const loadMediaStatus = () => {
    setIsLoading(true);
    fetch(`http://localhost:3001/api/media-status?projectDir=${encodeURIComponent(projectDir)}`)
      .then(res => res.json())
      .then(data => {
        setIsLoading(false);
        if (data.filesOnDisk) {
          setDiskFiles(data.filesOnDisk);
          compareFiles(data.filesOnDisk);
        }
        if (data.filesInBackup) {
          setBackupFiles(data.filesInBackup);
        }
      })
      .catch(err => {
        setIsLoading(false);
        console.error(err);
        setError('Failed to scan physical media folder.');
      });
  };

  const loadMidiStatus = () => {
    if (!songPath) return;
    setIsLoading(true);
    fetch(`http://localhost:3001/api/midi-cleaner-status?songPath=${encodeURIComponent(songPath)}`)
      .then(res => res.json())
      .then(data => {
        setIsLoading(false);
        if (data.unusedClips) {
          setUnusedMidi(data.unusedClips);
          setSelectedMidi(data.unusedClips.map(c => c.mediaID));
        }
      })
      .catch(err => {
        setIsLoading(false);
        console.error(err);
        setError('Failed to scan for unused MIDI clips.');
      });
  };

  useEffect(() => {
    loadMediaStatus();
    loadMidiStatus();
  }, [projectDir, songPath]);

  // 2. Compare files on disk with media pool
  const compareFiles = (onDisk) => {
    // Media pool files (filenames)
    const poolMap = new Map();
    audioClips.forEach(clip => {
      poolMap.set(clip.name, clip.use_count);
    });

    const unused = [];
    onDisk.forEach(f => {
      const name = f.name;
      const count = poolMap.has(name) ? poolMap.get(name) : 0;
      
      // If it's not in the pool OR it has 0 use count, it's unused
      if (!poolMap.has(name) || count === 0) {
        unused.push({
          name,
          size: f.size,
          mtime: f.mtime,
          status: !poolMap.has(name) ? 'Orphan (Not in Pool)' : '0 Use Count'
        });
      }
    });

    setUnusedFiles(unused);
    // Auto select all unused files by default
    setSelectedFiles(unused.map(u => u.name));
  };

  const handleCheckboxChange = (name) => {
    if (selectedFiles.includes(name)) {
      setSelectedFiles(selectedFiles.filter(f => f !== name));
    } else {
      setSelectedFiles([...selectedFiles, name]);
    }
  };

  const handleBackupCheckboxChange = (name) => {
    if (selectedBackupFiles.includes(name)) {
      setSelectedBackupFiles(selectedBackupFiles.filter(f => f !== name));
    } else {
      setSelectedBackupFiles([...selectedBackupFiles, name]);
    }
  };

  const handleClean = async () => {
    if (selectedFiles.length === 0) return;
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:3001/api/clean-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectDir,
          filesToClean: selectedFiles
        })
      });
      const data = await res.json();
      setIsLoading(false);

      if (data.success) {
        setMessage(`Successfully cleaned up! Moved ${data.moved.length} files to Backup folder: ${data.backupDir}`);
        setSelectedFiles([]);
        loadMediaStatus(); // reload
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setIsLoading(false);
      setError(`Cleanup failed: ${err.message}`);
    }
  };

  const handleRestore = async () => {
    if (selectedBackupFiles.length === 0) return;
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:3001/api/restore-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectDir,
          filesToRestore: selectedBackupFiles
        })
      });
      const data = await res.json();
      setIsLoading(false);

      if (data.success) {
        setMessage(`Successfully restored ${data.restored.length} files back to the Media folder!`);
        setSelectedBackupFiles([]);
        loadMediaStatus(); // reload
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setIsLoading(false);
      setError(`Restoration failed: ${err.message}`);
    }
  };

  const handleMidiCheckboxChange = (mediaID) => {
    if (selectedMidi.includes(mediaID)) {
      setSelectedMidi(selectedMidi.filter(id => id !== mediaID));
    } else {
      setSelectedMidi([...selectedMidi, mediaID]);
    }
  };

  const handleCleanMidi = async () => {
    if (selectedMidi.length === 0) return;
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:3001/api/clean-midi-clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songPath,
          mediaIDs: selectedMidi
        })
      });
      const data = await res.json();
      setIsLoading(false);

      if (data.success) {
        setMessage(`Successfully cleaned up MIDI clips! Deleted ${data.cleanedMediaIDs.length} performances. Saved backup copy to History.`);
        setSelectedMidi([]);
        loadMidiStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setIsLoading(false);
      setError(`MIDI Cleanup failed: ${err.message}`);
    }
  };

  const handlePackage = async () => {
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const activeFilesList = diskFiles
        .map(f => f.name)
        .filter(name => !unusedFiles.some(u => u.name === name));

      const res = await fetch('http://localhost:3001/api/package-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectDir,
          activeFiles: activeFilesList,
          songName: songName || 'Song.song'
        })
      });
      
      const data = await res.json();
      setIsLoading(false);

      if (data.success) {
        setMessage(`Successfully packaged collaboration ZIP! File saved at: ${data.collabZipPath} (${formatSize(data.size)})`);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setIsLoading(false);
      setError(`Packaging failed: ${err.message}`);
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalSavedSize = unusedFiles
    .filter(u => selectedFiles.includes(u.name))
    .reduce((sum, u) => sum + u.size, 0);

  const totalBackupSize = backupFiles.reduce((sum, f) => sum + f.size, 0);
  const selectedBackupSize = backupFiles
    .filter(f => selectedBackupFiles.includes(f.name))
    .reduce((sum, f) => sum + f.size, 0);

  // Extract all unique inserts in use
  const usedPlugins = [];
  parsedData.channels.forEach(ch => {
    ch.inserts.forEach(ins => {
      if (!usedPlugins.includes(ins.name)) {
        usedPlugins.push(ins.name);
      }
    });
  });

  const stockPlugins = new Set([
    "Pro EQ", "Pro EQ³", "Compressor", "Limiter", "Binaural Pan", "Beat Delay", 
    "Analog Delay", "Room Reverb", "MixVerb", "RedLightDist", "Ampire", "Pedalboard", 
    "Autofilter", "Chorus", "Flanger", "Phaser", "Tremolo", "X-Trem", "Rotary", 
    "Gate", "Expander", "Limiter2", "Fat Channel", "Pipeline", "Scope", 
    "Spectrum Meter", "Tuner", "Level Meter", "Dual Pan", "Splitter", "Console Shaper", 
    "CTC-1", "PortaCassette", "Vocoder", "Open AIR", "Empire", "Tone Generator", 
    "Input Delay", "Phase Meter", "IR Maker", "VU Meter"
  ]);

  const thirdPartyInUse = usedPlugins.filter(p => !stockPlugins.has(p));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
      <div className="glass-card">
        <h3 className="glass-card-header">🧽 Studio One Project Cleaner & Packager</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          This utility scans your project's physical `Media/` folder, compares it against the song pool structure, and lists files that are not referenced or have a usage count of 0. Selected files will be safely moved to a `Backup_Unused_Media/` folder inside your project.
        </p>

        {/* Tab Selection */}
        <div className="nav-tabs" style={{ display: 'inline-flex', marginBottom: '1.5rem' }}>
          <button className={`nav-tab ${subTab === 'clean' ? 'active' : ''}`} onClick={() => setSubTab('clean')}>
            🧽 Clean Unused Media
          </button>
          <button className={`nav-tab ${subTab === 'midi' ? 'active' : ''}`} onClick={() => setSubTab('midi')}>
            🎹 Clean Unused MIDI ({unusedMidi.length})
          </button>
          <button className={`nav-tab ${subTab === 'restore' ? 'active' : ''}`} onClick={() => setSubTab('restore')}>
            ↩️ Restore / Undo ({backupFiles.length})
          </button>
          <button className={`nav-tab ${subTab === 'collab' ? 'active' : ''}`} onClick={() => setSubTab('collab')}>
            📦 Package for Collab
          </button>
        </div>

        {/* Summary Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Active Media Files: </span>
            <strong style={{ color: 'white', marginRight: '1.5rem' }}>{diskFiles.length}</strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Unused Files: </span>
            <strong style={{ color: 'var(--text-primary)', marginRight: '1.5rem' }}>{unusedFiles.length}</strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Files in Backup: </span>
            <strong style={{ color: 'var(--text-primary)' }}>{backupFiles.length}</strong>
          </div>
          {subTab === 'clean' && unusedFiles.length > 0 && (
            <div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Disk space recoverable: </span>
              <strong style={{ color: 'white' }}>{formatSize(totalSavedSize)}</strong>
            </div>
          )}
          {subTab === 'restore' && backupFiles.length > 0 && (
            <div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total backup size: </span>
              <strong style={{ color: 'white', marginRight: '1.5rem' }}>{formatSize(totalBackupSize)}</strong>
              {selectedBackupFiles.length > 0 && (
                <>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Selected to restore: </span>
                  <strong style={{ color: 'white' }}>{formatSize(selectedBackupSize)}</strong>
                </>
              )}
            </div>
          )}
        </div>

        {/* Clean View */}
        {subTab === 'clean' && (
          unusedFiles.length === 0 ? (
            <p style={{ color: 'var(--accent-cyan)', textAlign: 'center', padding: '3rem', border: '1px dashed var(--border-clean)', borderRadius: '12px' }}>
              🎉 Your project is clean! All files in the Media folder are actively used in the arrangement.
            </p>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <button className="btn-secondary" onClick={() => setSelectedFiles(unusedFiles.map(u => u.name))} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                  Select All
                </button>
                <button className="btn-secondary" onClick={() => setSelectedFiles([])} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                  Deselect All
                </button>
              </div>

              <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border-clean)', borderRadius: '8px' }}>
                <table className="premium-table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Clean?</th>
                      <th>File Name</th>
                      <th>Size</th>
                      <th>Reason / Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unusedFiles.map((file, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(file.name)}
                            onChange={() => handleCheckboxChange(file.name)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.85rem' }}>{file.name}</td>
                        <td>{formatSize(file.size)}</td>
                        <td style={{ color: 'var(--accent-pink)' }}>{file.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  className="btn-danger"
                  onClick={handleClean}
                  disabled={selectedFiles.length === 0 || isLoading}
                >
                  {isLoading ? 'Cleaning...' : `Safe Clean up (${selectedFiles.length} files)`}
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Files will be moved, not deleted permanently.
                </span>
              </div>
            </div>
          )
        )}

        {/* MIDI Clean View */}
        {subTab === 'midi' && (
          unusedMidi.length === 0 ? (
            <p style={{ color: 'var(--accent-cyan)', textAlign: 'center', padding: '3rem', border: '1px dashed var(--border-clean)', borderRadius: '12px' }}>
              🎉 No unused MIDI clips found! All performances listed in the media pool are active in the timeline.
            </p>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <button className="btn-secondary" onClick={() => setSelectedMidi(unusedMidi.map(u => u.mediaID))} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                  Select All
                </button>
                <button className="btn-secondary" onClick={() => setSelectedMidi([])} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                  Deselect All
                </button>
              </div>

              <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border-clean)', borderRadius: '8px' }}>
                <table className="premium-table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Clean?</th>
                      <th>Clip Name</th>
                      <th>Performance File Path</th>
                      <th>Size</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unusedMidi.map((file, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedMidi.includes(file.mediaID)}
                            onChange={() => handleMidiCheckboxChange(file.mediaID)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ fontWeight: 'bold' }}>{file.name}</td>
                        <td style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{file.relativePath}</td>
                        <td>{formatSize(file.size)}</td>
                        <td style={{ color: 'var(--accent-pink)' }}>Unused (0 refs in song.xml)</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  className="btn-danger"
                  onClick={handleCleanMidi}
                  disabled={selectedMidi.length === 0 || isLoading}
                >
                  {isLoading ? 'Cleaning...' : `Clean Unused MIDI Clips (${selectedMidi.length} files)`}
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  A backup snapshot of the project will be created in the History tab before cleanup.
                </span>
              </div>
            </div>
          )
        )}

        {/* Restore View */}
        {subTab === 'restore' && (
          backupFiles.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem', border: '1px dashed var(--border-clean)', borderRadius: '12px' }}>
              📭 Backup folder is empty. No files to restore.
            </p>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <button className="btn-secondary" onClick={() => setSelectedBackupFiles(backupFiles.map(u => u.name))} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                  Select All
                </button>
                <button className="btn-secondary" onClick={() => setSelectedBackupFiles([])} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                  Deselect All
                </button>
              </div>

              <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border-clean)', borderRadius: '8px' }}>
                <table className="premium-table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Restore?</th>
                      <th>File Name</th>
                      <th>Size</th>
                      <th>Backup Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupFiles.map((file, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBackupFiles.includes(file.name)}
                            onChange={() => handleBackupCheckboxChange(file.name)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.85rem' }}>{file.name}</td>
                        <td>{formatSize(file.size)}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{new Date(file.mtime).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  className="btn-primary"
                  onClick={handleRestore}
                  disabled={selectedBackupFiles.length === 0 || isLoading}
                >
                  {isLoading ? 'Restoring...' : `Restore Selected (${selectedBackupFiles.length} files)`}
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Files will be moved back to the `Media/` folder and re-integrated into the project.
                </span>
              </div>
            </div>
          )
        )}

        {/* Collaboration View */}
        {subTab === 'collab' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
              
              {/* Plugin Compatibility Check */}
              <div style={{ background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  ⚠️ Plugin Compatibility Report
                </span>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '1rem' }}>
                  The following third-party plugins are used in this project. The collaborator must have these installed to load the project correctly:
                </p>
                <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {thirdPartyInUse.length === 0 ? (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      🎉 Only stock PreSonus plugins are used. 100% compatibility.
                    </span>
                  ) : (
                    <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                      {thirdPartyInUse.map((p, idx) => (
                        <li key={idx} style={{ color: 'white', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: '4px' }}>
                          • {p}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Package Summary */}
              <div style={{ background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  📦 Archive Summary
                </span>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '1rem' }}>
                  The collaboration ZIP file will only bundle the core `.song` file and the active media files to keep file size minimal.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Song File:</span>
                  <strong style={{ color: 'white' }}>{songName}</strong>
                  
                  <span style={{ color: 'var(--text-secondary)' }}>Active Media:</span>
                  <strong style={{ color: 'white' }}>
                    {diskFiles.length - unusedFiles.length} files
                  </strong>

                  <span style={{ color: 'var(--text-secondary)' }}>Ignored Unused:</span>
                  <strong style={{ color: 'white' }}>
                    {unusedFiles.length} files
                  </strong>
                </div>
              </div>

            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button
                className="btn-primary"
                onClick={handlePackage}
                disabled={isLoading}
              >
                {isLoading ? 'Packaging ZIP...' : 'Generate Collaboration ZIP'}
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                ZIP file will be created in the project's root folder.
              </span>
            </div>
          </div>
        )}

        {message && (
          <div style={{ marginTop: '1.5rem', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-clean)', padding: '1rem', borderRadius: '6px', color: 'white', fontSize: '0.9rem' }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{ marginTop: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '1rem', borderRadius: '6px', color: '#ef4444', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

      </div>
    </div>
  );
}


