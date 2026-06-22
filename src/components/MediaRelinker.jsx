import React, { useState, useEffect } from 'react';

export default function MediaRelinker({ songPath, projectDir }) {
  const [missingClips, setMissingClips] = useState([]);
  const [customSearchDir, setCustomSearchDir] = useState('');
  const [relinkMap, setRelinkMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isRelinking, setIsRelinking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Fetch missing clips on load
  const loadMissingClips = (searchDir = '') => {
    setIsLoading(true);
    setError('');
    setMessage('');
    
    let url = `http://localhost:3001/api/media-relink-status?songPath=${encodeURIComponent(songPath)}`;
    if (searchDir) {
      url += `&customSearchDir=${encodeURIComponent(searchDir)}`;
    }

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to analyze media pool status.');
        return res.json();
      })
      .then(data => {
        setIsLoading(false);
        if (data.success) {
          setMissingClips(data.missingClips);
          
          // Auto-apply single exact suggestion if available to make workflow smooth
          const initialMap = {};
          data.missingClips.forEach(clip => {
            if (clip.suggestions && clip.suggestions.length === 1) {
              initialMap[clip.sourceUrl] = clip.suggestions[0];
            }
          });
          setRelinkMap(prev => ({ ...prev, ...initialMap }));
        } else {
          setError(data.error || 'Unknown error checking media status.');
        }
      })
      .catch(err => {
        setIsLoading(false);
        console.error(err);
        setError(`Failed to fetch media status: ${err.message}`);
      });
  };

  useEffect(() => {
    loadMissingClips();
  }, [songPath]);

  // Folder browser triggers native popup via server
  const handleBrowseSearchDir = () => {
    fetch('http://localhost:3001/api/browse-workspace', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.selectedPath) {
          setCustomSearchDir(data.selectedPath);
          loadMissingClips(data.selectedPath);
        }
      })
      .catch(err => {
        console.error(err);
        setError('Failed to open native directory browser.');
      });
  };

  const handleSelectSuggestion = (sourceUrl, targetPath) => {
    setRelinkMap(prev => ({
      ...prev,
      [sourceUrl]: targetPath
    }));
  };

  const handleManualPathChange = (sourceUrl, pathValue) => {
    setRelinkMap(prev => ({
      ...prev,
      [sourceUrl]: pathValue
    }));
  };

  const handleApplyRelinking = () => {
    const rules = Object.entries(relinkMap)
      .filter(([_, targetPath]) => targetPath && targetPath.trim() !== '')
      .map(([sourceUrl, targetPath]) => ({
        sourceUrl,
        targetPath: targetPath.trim()
      }));

    if (rules.length === 0) {
      setError('Please resolve at least one missing file path before relinking.');
      return;
    }

    setIsRelinking(true);
    setError('');
    setMessage('');

    fetch('http://localhost:3001/api/relink-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        songPath,
        relinkRules: rules
      })
    })
      .then(res => res.json())
      .then(data => {
        setIsRelinking(false);
        if (data.success) {
          setMessage(`Successfully relinked ${rules.length} media file(s). A backup has been saved in the project History folder as "${data.backupName}".`);
          setRelinkMap({});
          // Reload missing files to show resolved status
          loadMissingClips(customSearchDir);
        } else {
          setError(data.error || 'Failed to update media links.');
        }
      })
      .catch(err => {
        setIsRelinking(false);
        console.error(err);
        setError(`Relink request failed: ${err.message}`);
      });
  };

  const handleAutoMatchAll = () => {
    const newMap = { ...relinkMap };
    missingClips.forEach(clip => {
      if (clip.suggestions && clip.suggestions.length > 0) {
        // Match the first suggestion if available
        newMap[clip.sourceUrl] = clip.suggestions[0];
      }
    });
    setRelinkMap(newMap);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Overview Card */}
      <div className="glass-card">
        <h2 className="glass-card-header">🔍 Missing Media Relinker</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: '1.6' }}>
          Scans for audio files that have broken absolute links (e.g. referencing paths on another user's machine) and repairs them. It crawls workspace subdirectories for files with matching filenames and lets you relink them in place inside the project.
        </p>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', fontWeight: 600 }}>
              Scan Workspace & Custom Search Directory
            </label>
            <input
              type="text"
              value={customSearchDir}
              onChange={(e) => setCustomSearchDir(e.target.value)}
              placeholder="Workspace root is scanned by default. Set custom search path here..."
              style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem', outline: 'none' }}
            />
          </div>
          <button onClick={handleBrowseSearchDir} className="btn-secondary" style={{ height: '38px', marginTop: '1.25rem', whiteSpace: 'nowrap' }}>
            📁 Browse Folder...
          </button>
          <button onClick={() => loadMissingClips(customSearchDir)} className="btn-secondary" style={{ height: '38px', marginTop: '1.25rem', whiteSpace: 'nowrap' }} disabled={isLoading}>
            {isLoading ? 'Scanning...' : '🔄 Scan Links'}
          </button>
        </div>
      </div>

      {/* Main Panel */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.1rem', color: 'white', margin: 0 }}>
            Broken Media References ({missingClips.length})
          </h3>
          {missingClips.length > 0 && (
            <button onClick={handleAutoMatchAll} className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}>
              💡 Auto-Match All Suggestions
            </button>
          )}
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0', gap: '1rem' }}>
            <div style={{ border: '3px solid rgba(255,255,255,0.05)', borderLeft: '3px solid white', borderRadius: '50%', width: '32px', height: '32px', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Crawling directories & matching filenames...</span>
          </div>
        ) : missingClips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--accent-cyan)', background: 'rgba(0, 242, 254, 0.02)', border: '1px dotted rgba(0, 242, 254, 0.3)', borderRadius: '6px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
            <strong style={{ fontSize: '0.95rem' }}>No Missing Files!</strong>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.3rem' }}>
              All audio clips in this project exist at their declared storage paths on disk.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Missing clips table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-clean)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem 0.25rem', width: '25%' }}>Missing Filename</th>
                    <th style={{ width: '35%' }}>Original Path Reference</th>
                    <th style={{ width: '40%' }}>New Resolved Path</th>
                  </tr>
                </thead>
                <tbody>
                  {missingClips.map((clip, idx) => {
                    const mappedPath = relinkMap[clip.sourceUrl] || '';
                    const hasSingleSuggestion = clip.suggestions && clip.suggestions.length === 1;
                    const hasMultipleSuggestions = clip.suggestions && clip.suggestions.length > 1;
                    
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', verticalAlign: 'top' }}>
                        {/* Filename */}
                        <td style={{ padding: '1rem 0.25rem', fontWeight: 600, color: 'white' }}>
                          <span style={{ color: '#ef4444', marginRight: '0.3rem' }}>⚠️</span>
                          {clip.fileName}
                        </td>
                        
                        {/* Original Path */}
                        <td style={{ padding: '1rem 0.25rem', color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: '1.4', wordBreak: 'break-all' }}>
                          {clip.originalPath}
                        </td>
                        
                        {/* New resolved path edit / suggest */}
                        <td style={{ padding: '0.8rem 0.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <input
                            type="text"
                            value={mappedPath}
                            onChange={(e) => handleManualPathChange(clip.sourceUrl, e.target.value)}
                            placeholder="Paste absolute path on disk..."
                            style={{
                              width: '100%',
                              padding: '0.45rem',
                              background: mappedPath ? 'rgba(0, 242, 254, 0.05)' : 'var(--bg-primary)',
                              color: mappedPath ? 'var(--accent-cyan)' : 'white',
                              border: mappedPath ? '1px solid var(--accent-cyan)' : '1px solid var(--border-clean)',
                              borderRadius: '3px',
                              fontSize: '0.8rem',
                              outline: 'none'
                            }}
                          />

                          {/* Auto-matching suggestions list */}
                          {clip.suggestions && clip.suggestions.length > 0 ? (
                            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(0,242,254,0.1)', padding: '0.5rem', borderRadius: '4px' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                                Found Counterpart{clip.suggestions.length > 1 ? 's' : ''} (Click to apply):
                              </span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {clip.suggestions.map((sug, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => handleSelectSuggestion(clip.sourceUrl, sug)}
                                    style={{
                                      background: mappedPath === sug ? 'rgba(0, 242, 254, 0.1)' : 'rgba(255,255,255,0.03)',
                                      border: '1px solid var(--border-clean)',
                                      borderRadius: '3px',
                                      padding: '0.3rem 0.5rem',
                                      textAlign: 'left',
                                      color: mappedPath === sug ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                                      fontSize: '0.72rem',
                                      cursor: 'pointer',
                                      display: 'block',
                                      width: '100%',
                                      wordBreak: 'break-all',
                                      transition: 'all 0.1s ease'
                                    }}
                                  >
                                    📍 {sug}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              No files with matching name found in workspace.
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Relink trigger button */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--border-clean)', paddingTop: '1rem' }}>
              <button
                onClick={handleApplyRelinking}
                disabled={isRelinking || Object.keys(relinkMap).length === 0}
                className="btn-primary"
                style={{ width: '100%', padding: '0.8rem', fontSize: '0.9rem', fontWeight: 'bold' }}
              >
                {isRelinking ? 'Applying Relink Rules...' : '🚀 Relink & Fix Project Media Pool'}
              </button>

              {message && (
                <div style={{ background: 'rgba(0, 242, 254, 0.1)', border: '1px solid var(--accent-cyan)', padding: '0.8rem', borderRadius: '4px', color: 'var(--accent-cyan)', fontSize: '0.8rem', lineHeight: '1.4' }}>
                  {message}
                </div>
              )}

              {error && (
                <div style={{ background: 'rgba(255, 0, 127, 0.1)', border: '1px solid var(--accent-pink)', padding: '0.8rem', borderRadius: '4px', color: 'var(--accent-pink)', fontSize: '0.8rem' }}>
                  {error}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
