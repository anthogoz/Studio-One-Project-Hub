import React, { useEffect, useRef, useState } from 'react';

export default function ProjectBrowser({ onProjectSelected, isLoading }) {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [workspaceDir, setWorkspaceDir] = useState('');
  const [newWorkspace, setNewWorkspace] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef(null);

  const sortedProjects = React.useMemo(() => {
    let list = [...projects];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.songName && p.songName.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;

      if (sortBy === 'date') {
        valA = a.mtime || 0;
        valB = b.mtime || 0;
      } else if (sortBy === 'size') {
        valA = a.size || 0;
        valB = b.size || 0;
      } else if (sortBy === 'complexity') {
        valA = a.trackCount || 0;
        valB = b.trackCount || 0;
      } else if (sortBy === 'plugins') {
        valA = a.pluginCount || 0;
        valB = b.pluginCount || 0;
      }

      if (valA === valB) {
        return a.name.localeCompare(b.name);
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [projects, sortBy, sortOrder, searchQuery]);

  const loadProjects = (dir) => {
    setIsScanning(true);
    fetch(`http://localhost:3001/api/projects${dir ? `?workspaceDir=${encodeURIComponent(dir)}` : ''}`)
      .then(res => res.json())
      .then(data => {
        setIsScanning(false);
        if (data.projects) setProjects(data.projects);
      })
      .catch(() => {
        setIsScanning(false);
        setError('Could not connect to backend server. Make sure the Node server is running.');
      });
  };

  useEffect(() => {
    // Get current workspace + projects
    fetch('http://localhost:3001/api/workspace')
      .then(r => r.json())
      .then(data => {
        setWorkspaceDir(data.workspaceDir || '');
        setNewWorkspace(data.workspaceDir || '');
      })
      .catch(() => { });
    loadProjects();
  }, []);

  const handleBrowseWorkspace = () => {
    setIsScanning(true);
    setWorkspaceError('');
    fetch('http://localhost:3001/api/browse-workspace', { method: 'POST' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to open directory browser.');
        return res.json();
      })
      .then(data => {
        setIsScanning(false);
        if (data.error) {
          setWorkspaceError(data.error);
          return;
        }
        if (data.cancelled) {
          return; // user cancelled, do nothing
        }
        if (data.selectedPath) {
          setNewWorkspace(data.selectedPath);
          setWorkspaceDir(data.selectedPath);
          setIsScanning(true);
          fetch('http://localhost:3001/api/workspace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dir: data.selectedPath }),
          })
            .then(r => r.json())
            .then(workspaceData => {
              setIsScanning(false);
              if (workspaceData.error) { setWorkspaceError(workspaceData.error); return; }
              setWorkspaceDir(workspaceData.workspaceDir);
              setProjects(workspaceData.projects || []);
              setError('');
            })
            .catch(() => {
              setIsScanning(false);
              setWorkspaceError('Failed to change workspace.');
            });
        }
      })
      .catch(err => {
        setIsScanning(false);
        setWorkspaceError(err.message || 'Failed to open directory browser.');
      });
  };

  const handleChangeWorkspace = () => {
    if (!newWorkspace.trim()) return;
    setWorkspaceError('');
    setIsScanning(true);
    fetch('http://localhost:3001/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: newWorkspace.trim() }),
    })
      .then(r => r.json())
      .then(data => {
        setIsScanning(false);
        if (data.error) { setWorkspaceError(data.error); return; }
        setWorkspaceDir(data.workspaceDir);
        setProjects(data.projects || []);
        setError('');
      })
      .catch(() => {
        setIsScanning(false);
        setWorkspaceError('Failed to change workspace.');
      });
  };

  // Handle file chosen via native picker or drag-and-drop
  const handleFile = (file) => {
    if (!file || !file.name.endsWith('.song')) {
      setError('Please select a valid Studio One .song file.');
      return;
    }
    setError('');

    // Match by filename against workspace projects
    const matched = projects.find(p => p.songName === file.name);
    if (matched) {
      onProjectSelected(matched);
      return;
    }

    // File is outside the workspace — show helpful message
    setError(`"${file.name}" is outside the current workspace folder. Add it to the Detected Projects list by moving it into S1TOOLS, or change the workspace root below.`);
  };

  const handleInputChange = (e) => {
    handleFile(e.target.files?.[0]);
    e.target.value = ''; // reset so same file can be re-selected
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto' }}>

      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-heading)', fontSize: '3rem', fontWeight: 800,
          marginBottom: '1rem', color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem'
        }}>
          <img src="/icon.png" alt="Logo" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
          <span>Studio One Project Hub</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>
          Analyze, clean up, and generate templates from your Studio One projects.
        </p>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
          padding: '0.9rem 1.25rem', borderRadius: '8px', color: 'white',
          marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '0.88rem', gap: '1rem',
        }}>
          <span>⚠️ {error}</span>
          <button className="btn-secondary" onClick={() => setError('')} style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', flexShrink: 0 }}>✕</button>
        </div>
      )}

      {/* File Picker card */}
      <div className="glass-card" style={{ marginBottom: '2.5rem' }}>
        <h3 className="glass-card-header">📂 Open a Project</h3>

        {/* Hidden native file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".song"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />

        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragging ? 'white' : 'var(--border-focus)'}`,
            borderRadius: 10,
            padding: '2.5rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragging ? 'rgba(255,255,255,0.04)' : 'transparent',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', pointerEvents: 'none' }}>🎵</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'white', marginBottom: '0.4rem', pointerEvents: 'none' }}>
            Click to browse or drag & drop a .song file
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', pointerEvents: 'none' }}>
            Supports Studio One .song files
          </div>
        </div>
      </div>

      {/* Workspace config */}
      <div style={{ marginBottom: '2.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-clean)' }}>
        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          📁 Workspace Folder
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          The app scans this folder for Studio One projects. Change it to include projects stored elsewhere.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className="btn-secondary"
            onClick={handleBrowseWorkspace}
            disabled={isScanning}
            style={{
              padding: '0.6rem 1.1rem',
              fontSize: '0.85rem',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: isScanning ? 'not-allowed' : 'pointer',
              opacity: isScanning ? 0.7 : 1,
            }}
            title="Browse Folders"
          >
            📂 Browse
          </button>
          <input
            type="text"
            value={newWorkspace}
            onChange={e => setNewWorkspace(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !isScanning && handleChangeWorkspace()}
            placeholder="e.g. D:\Lnkhey\Documents\S1"
            disabled={isScanning}
            style={{
              flex: 1, padding: '0.6rem 0.9rem',
              borderRadius: 6, border: '1px solid var(--border-focus)',
              background: 'rgba(0,0,0,0.3)', color: 'white',
              outline: 'none', fontFamily: 'monospace', fontSize: '0.82rem',
              opacity: isScanning ? 0.5 : 1,
              cursor: isScanning ? 'not-allowed' : 'text',
            }}
          />
          <button
            className="btn-secondary"
            onClick={handleChangeWorkspace}
            disabled={isScanning}
            style={{
              padding: '0.6rem 1.1rem',
              fontSize: '0.85rem',
              flexShrink: 0,
              cursor: isScanning ? 'not-allowed' : 'pointer',
              opacity: isScanning ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '90px'
            }}
          >
            {isScanning ? (
              <span style={{
                width: '12px',
                height: '12px',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                borderTopColor: 'white',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.6s linear infinite'
              }} />
            ) : (
              'Apply'
            )}
          </button>
        </div>
        {workspaceError && (
          <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem' }}>⚠️ {workspaceError}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          {workspaceDir && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, fontFamily: 'monospace' }}>
              Current: {workspaceDir}
            </p>
          )}
          {isScanning && (
            <p style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 500, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{
                width: '10px',
                height: '10px',
                border: '2px solid rgba(56, 189, 248, 0.2)',
                borderTopColor: '#38bdf8',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.6s linear infinite'
              }} />
              Scanning folder...
            </p>
          )}
        </div>
      </div>

      {/* Detected projects */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', color: 'white', margin: 0 }}>
            📦 Detected in Workspace
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Search projects..."
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-clean)',
                background: 'var(--bg-primary)',
                color: 'white',
                fontSize: '0.8rem',
                outline: 'none',
                minWidth: '200px'
              }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-clean)',
                background: 'var(--bg-primary)',
                color: 'white',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="date">📅 Mod. Date</option>
              <option value="size">💾 File Size</option>
              <option value="complexity">⚡ Tracks (Complexity)</option>
              <option value="plugins">🔌 Plugins (Complexity)</option>
            </select>

            <button
              className="btn-secondary"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
              title="Reverse sort order"
            >
              {sortOrder === 'asc' ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {isScanning ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 2rem',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed var(--border-clean)',
            borderRadius: '12px',
            gap: '1.0rem',
            color: 'var(--text-secondary)'
          }}>
            <div className="spinner" />
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'white' }}>
              🔍 Scanning folder...
            </span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              Calculating size and complexity of Studio One projects...
            </p>
          </div>
        ) : sortedProjects.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', border: '1px dashed var(--border-clean)', borderRadius: '8px', fontSize: '0.9rem' }}>
            No Studio One projects detected in the workspace directory.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {sortedProjects.map((proj, idx) => {
              const formatDate = (mtime) => {
                if (!mtime) return '';
                try {
                  const date = new Date(mtime);
                  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                } catch (e) {
                  return '';
                }
              };

              const formatSize = (bytes) => {
                if (!bytes) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
              };

              return (
                <div
                  key={idx}
                  className="glass-card"
                  onClick={() => !isLoading && !isScanning && onProjectSelected(proj)}
                  style={{ cursor: isScanning ? 'not-allowed' : 'pointer', position: 'relative', overflow: 'hidden', paddingLeft: '1.75rem', paddingBottom: '1.25rem', opacity: isScanning ? 0.6 : 1 }}
                >
                  <div style={{ width: 4, height: '100%', position: 'absolute', left: 0, top: 0, background: 'var(--accent-primary)', borderRadius: '8px 0 0 8px' }} />
                  <h4 style={{ color: 'white', fontWeight: 600, fontSize: '1rem', marginBottom: '0.3rem', wordBreak: 'break-all' }}>{proj.name}</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', wordBreak: 'break-all', marginBottom: '0.5rem' }}>
                    {proj.songName}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', marginBottom: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {proj.mtime && <span>📅 Modified: <strong>{formatDate(proj.mtime)}</strong></span>}
                    {proj.size > 0 && <span>💾 Size: <strong>{formatSize(proj.size)}</strong></span>}
                    {(proj.trackCount > 0 || proj.pluginCount > 0) && (
                      <span>⚡ Complexity: <strong>{proj.trackCount || 0} tracks • {proj.pluginCount || 0} plugins</strong></span>
                    )}
                  </div>

                  <span style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                    Open →
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
