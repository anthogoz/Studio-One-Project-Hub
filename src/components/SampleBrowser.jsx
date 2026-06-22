import React, { useState, useEffect, useRef, useCallback } from 'react';

const API = 'http://localhost:3001';

const EXT_ICON = {
  '.wav':  '🔊',
  '.mp3':  '🎵',
  '.aiff': '🎶',
  '.aif':  '🎶',
  '.flac': '💎',
  '.ogg':  '📻',
  '.m4a':  '🎧',
};

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDuration(secs) {
  if (!secs || isNaN(secs)) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Waveform canvas component using Web Audio API
function Waveform({ audioBuffer, progress }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !audioBuffer) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / W);
    ctx.clearRect(0, 0, W, H);
    for (let x = 0; x < W; x++) {
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) {
        const sample = data[x * step + j] || 0;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      const played = x / W <= progress;
      ctx.fillStyle = played ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)';
      const top = ((1 - max) / 2) * H;
      const bottom = ((1 - min) / 2) * H;
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
    }
  }, [audioBuffer, progress]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={56}
      style={{ width: '100%', height: '56px', display: 'block', borderRadius: '4px', cursor: 'pointer' }}
    />
  );
}

export default function SampleBrowser({ projectDir }) {
  const [currentDir, setCurrentDir] = useState(null);
  const [parent, setParent] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [dirs, setDirs] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Audio player state
  const [selectedFile, setSelectedFile] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animFrameRef = useRef(null);

  // Quick shortcuts
  const shortcuts = projectDir ? [
    { label: '📂 Media', path: `${projectDir}\\Media` },
    { label: '🎚️ Samples', path: `${projectDir}\\Samples` },
    { label: '📁 Project', path: projectDir },
  ] : [];

  const browse = useCallback((dir) => {
    setLoading(true);
    setError('');
    const url = dir
      ? `${API}/api/browse-files?dir=${encodeURIComponent(dir)}`
      : `${API}/api/browse-files`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        setLoading(false);
        if (data.error) { setError(data.error); return; }
        setCurrentDir(data.currentDir);
        setParent(data.parent);
        setBreadcrumbs(data.breadcrumbs || []);
        setDirs(data.dirs || []);
        setFiles(data.files || []);
      })
      .catch(e => { setLoading(false); setError(e.message); });
  }, []);

  useEffect(() => {
    if (projectDir) {
      browse(`${projectDir}\\Media`);
    } else {
      browse(null);
    }
  }, [projectDir, browse]);

  const decodeAudio = useCallback(async (filePath) => {
    setLoadingAudio(true);
    setAudioBuffer(null);
    try {
      const res = await fetch(`${API}/api/stream-audio?filePath=${encodeURIComponent(filePath)}`);
      const arrayBuf = await res.arrayBuffer();
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const decoded = await audioCtxRef.current.decodeAudioData(arrayBuf);
      setAudioBuffer(decoded);
    } catch (e) {
      console.warn('Waveform decode failed:', e);
    }
    setLoadingAudio(false);
  }, []);

  const handleSelectFile = useCallback((file) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    cancelAnimationFrame(animFrameRef.current);
    setSelectedFile(file);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const audio = new Audio();
    audio.src = `${API}/api/stream-audio?filePath=${encodeURIComponent(file.path)}`;
    audio.volume = volume;
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      cancelAnimationFrame(animFrameRef.current);
    });
    audioRef.current = audio;
    decodeAudio(file.path);

    // Auto-play on selection
    audio.play().then(() => {
      setIsPlaying(true);
      const tick = () => {
        setCurrentTime(audio.currentTime);
        if (!audio.paused) animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    }).catch(() => {});
  }, [volume, decodeAudio]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !selectedFile) return;
    if (isPlaying) {
      audio.pause();
      cancelAnimationFrame(animFrameRef.current);
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
      const tick = () => {
        setCurrentTime(audio.currentTime);
        if (!audio.paused) animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, [isPlaying, selectedFile]);

  const handleSeek = useCallback((e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  const handleVolume = useCallback((e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    };
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    // Outer: full height flex column — browser scrolls, player sticks to bottom
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 4rem)',  // fill remaining viewport
    }}>

      {/* ── Scrollable browser area ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '1rem' }}>

        {/* Shortcuts */}
        {shortcuts.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {shortcuts.map((s, i) => (
              <button key={i} className="btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}
                onClick={() => browse(s.path)}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* File Browser card */}
        <div className="glass-card">

          {/* Breadcrumbs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {parent && (
              <button onClick={() => browse(parent)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '2px 6px', borderRadius: 4 }}>
                ←
              </button>
            )}
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>}
                <button onClick={() => browse(crumb.path)}
                  style={{
                    background: i === breadcrumbs.length - 1 ? 'rgba(255,255,255,0.06)' : 'none',
                    border: 'none',
                    color: i === breadcrumbs.length - 1 ? 'white' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '0.8rem',
                    fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                    padding: '2px 8px', borderRadius: 4,
                  }}>
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
            {loading && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Loading...</span>}
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.75rem' }}>⚠️ {error}</div>}

          {/* Directories */}
          {dirs.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              {dirs.map((d, i) => (
                <div key={i} onClick={() => browse(d.path)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.6rem', borderRadius: 5, cursor: 'pointer', color: 'var(--text-secondary)', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: '0.9rem' }}>📁</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{d.name}</span>
                </div>
              ))}
            </div>
          )}

          {dirs.length > 0 && files.length > 0 && (
            <div style={{ height: 1, background: 'var(--border-clean)', margin: '0.5rem 0' }} />
          )}

          {files.length === 0 && dirs.length === 0 && !loading && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
              No audio files found here.
            </div>
          )}

          {/* Audio file rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {files.map((file, i) => {
              const isSelected = selectedFile?.path === file.path;
              const isThisPlaying = isSelected && isPlaying;
              return (
                <div key={i} onClick={() => handleSelectFile(file)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.5rem 0.6rem', borderRadius: 6, cursor: 'pointer',
                    background: isSelected ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: `1px solid ${isSelected ? 'rgba(255,255,255,0.12)' : 'transparent'}`,
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ width: 20, textAlign: 'center', fontSize: '0.85rem', flexShrink: 0 }}>
                    {isThisPlaying
                      ? <span style={{ color: '#00f2fe' }}>▶</span>
                      : <span style={{ color: 'var(--text-muted)' }}>{EXT_ICON[file.ext] || '🔊'}</span>}
                  </span>
                  <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? 'white' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </span>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // prevent triggering audio playback
                      const a = document.createElement('a');
                      a.href = `${API}/api/stream-audio?filePath=${encodeURIComponent(file.path)}`;
                      a.download = file.name;
                      a.click();
                    }}
                    className="btn-secondary"
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem',
                      border: '1px solid var(--border-clean)',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: '4px',
                      flexShrink: 0,
                      cursor: 'pointer'
                    }}
                    title="Download raw file"
                  >
                    📥
                  </button>

                  <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-clean)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
                    {file.ext.replace('.', '').toUpperCase()}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0, minWidth: 55, textAlign: 'right' }}>
                    {formatBytes(file.size)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>{/* end scrollable area */}

      {/* ── Sticky player at bottom ── */}
      {selectedFile && (
        <div style={{
          flexShrink: 0,
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-clean)',
          padding: '0.85rem 1.25rem',
        }}>
          {/* Top row: play + info + volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.6rem' }}>
            <button onClick={togglePlay}
              style={{
                width: 38, height: 38, borderRadius: '50%',
                background: isPlaying ? 'rgba(255,255,255,0.08)' : 'white',
                border: '2px solid white', color: isPlaying ? 'white' : '#09090b',
                fontSize: '0.9rem', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}>
              {isPlaying ? '⏸' : '▶'}
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
                {formatBytes(selectedFile.size)} · {selectedFile.ext.replace('.', '').toUpperCase()}
                {duration > 0 && ` · ${formatDuration(duration)}`}
              </div>
            </div>

            {/* Volume & Download */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = `${API}/api/stream-audio?filePath=${encodeURIComponent(selectedFile.path)}`;
                  a.download = selectedFile.name;
                  a.click();
                }}
                className="btn-primary"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: '4px', cursor: 'pointer' }}
                title="Download active sample"
              >
                📥 Download
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>🔊</span>
                <input type="range" min="0" max="1" step="0.01" value={volume}
                  onChange={handleVolume} className="fader-slider" style={{ width: 65 }} />
              </div>
            </div>
          </div>

          {/* Waveform */}
          <div style={{ position: 'relative', background: '#09090b', borderRadius: 5, overflow: 'hidden', marginBottom: '0.5rem', cursor: 'pointer' }}
            onClick={handleSeek}>
            {loadingAudio ? (
              <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Analyzing waveform...
              </div>
            ) : (
              <Waveform audioBuffer={audioBuffer} progress={progress} />
            )}
            {duration > 0 && (
              <div style={{
                position: 'absolute', top: 0, bottom: 0, width: 1,
                background: '#00f2fe', left: `${progress * 100}%`,
                pointerEvents: 'none', boxShadow: '0 0 4px #00f2fe',
              }} />
            )}
          </div>

          {/* Seek bar + times */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)', minWidth: 34 }}>
              {formatDuration(currentTime)}
            </span>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, cursor: 'pointer' }} onClick={handleSeek}>
              <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(to right, #00f2fe, #4facfe)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)', minWidth: 34, textAlign: 'right' }}>
              {formatDuration(duration)}
            </span>
          </div>
        </div>
      )}

    </div>
  );
}
