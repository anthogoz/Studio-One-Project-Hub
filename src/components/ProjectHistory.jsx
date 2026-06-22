import React, { useState, useEffect, useMemo } from 'react';

const API = 'http://localhost:3001';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(isoDate) {
  if (!isoDate) return 'Unknown';
  const d = new Date(isoDate);
  return d.toLocaleString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatTime(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

const SAVE_TYPE_COLORS = {
  'Autosaved': { bg: 'rgba(0, 242, 254, 0.12)', border: 'rgba(0, 242, 254, 0.3)', text: '#00f2fe', dot: '#00f2fe' },
  'Before Autosave': { bg: 'rgba(255, 200, 0, 0.1)', border: 'rgba(255, 200, 0, 0.3)', text: '#ffc800', dot: '#ffc800' },
  'Manual Save': { bg: 'rgba(180, 120, 255, 0.1)', border: 'rgba(180, 120, 255, 0.3)', text: '#b478ff', dot: '#b478ff' },
};

function getSaveColor(saveType) {
  return SAVE_TYPE_COLORS[saveType] || SAVE_TYPE_COLORS['Manual Save'];
}

export default function ProjectHistory({ projectDir, activeProject, activeParsedData }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Comparison State
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [comparedFilename, setComparedFilename] = useState('');

  useEffect(() => {
    if (!projectDir) return;
    setLoading(true);
    setError('');
    fetch(`${API}/api/project-history?projectDir=${encodeURIComponent(projectDir)}`)
      .then(r => r.json())
      .then(data => {
        setLoading(false);
        if (data.error) { setError(data.error); return; }
        setSnapshots(data.snapshots || []);
      })
      .catch(e => { setLoading(false); setError(e.message); });
  }, [projectDir]);

  // Group snapshots by day
  const byDay = useMemo(() => {
    const groups = {};
    snapshots.forEach(s => {
      const day = s.isoDate ? formatDay(s.isoDate) : 'Unknown';
      if (!groups[day]) groups[day] = [];
      groups[day].push(s);
    });
    return groups;
  }, [snapshots]);

  const maxSize = useMemo(() => Math.max(...snapshots.map(s => s.size), 1), [snapshots]);

  const totalGrowth = snapshots.length > 1
    ? snapshots[snapshots.length - 1].size - snapshots[0].size
    : 0;

  const sessionDuration = useMemo(() => {
    if (snapshots.length < 2) return null;
    const first = new Date(snapshots[0].isoDate);
    const last = new Date(snapshots[snapshots.length - 1].isoDate);
    const diffMs = last - first;
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [snapshots]);

  // Helper: Parse XML for the compared snapshot
  const parseSecondarySongData = (xmlStrings) => {
    const parser = new DOMParser();
    
    const fixXml = (xml) => {
      if (!xml) return xml;
      if (xml.includes('xmlns:x=')) return xml;
      const match = xml.match(/<([A-Za-z0-9_:-]+)/);
      if (match) {
        const rootTag = match[1];
        return xml.replace(`<${rootTag}`, `<${rootTag} xmlns:x="http://presonus.com"`);
      }
      return xml;
    };

    const metaDoc = parser.parseFromString(fixXml(xmlStrings.metainfo), "text/xml");
    const songDoc = parser.parseFromString(fixXml(xmlStrings.song), "text/xml");
    const mixerDoc = parser.parseFromString(fixXml(xmlStrings.audiomixer), "text/xml");

    // Extract Metadata
    const metadata = {};
    const attrs = metaDoc.getElementsByTagName("Attribute");
    for (let i = 0; i < attrs.length; i++) {
      metadata[attrs[i].getAttribute("id")] = attrs[i].getAttribute("value");
    }

    // Extract Tracks
    const tracks = [];
    const lists = songDoc.getElementsByTagName("List");
    let tracksList = null;
    for (let i = 0; i < lists.length; i++) {
      let hasTracksId = false;
      for (let j = 0; j < lists[i].attributes.length; j++) {
        if (lists[i].attributes[j].localName === 'id' && lists[i].attributes[j].value === 'Tracks') {
          hasTracksId = true;
          break;
        }
      }
      if (hasTracksId) {
        tracksList = lists[i];
        break;
      }
    }

    if (tracksList) {
      for (let i = 0; i < tracksList.children.length; i++) {
        const child = tracksList.children[i];
        const name = child.getAttribute("name") || "Unnamed";
        const type = child.tagName;
        let typeLabel = type === 'MediaTrack' ? (child.querySelector("SpeakerSetup") ? 'Audio Track' : 'Instrument (Synth)') : type;
        tracks.push({ name, type: typeLabel });
      }
    }

    // Extract Mixer Channels
    const channels = [];
    const channelTags = ['AudioOutputChannel', 'AudioGroupChannel', 'AudioSynthChannel', 'AudioTrackChannel'];
    channelTags.forEach(tag => {
      const list = mixerDoc.getElementsByTagName(tag);
      for (let i = 0; i < list.length; i++) {
        const chan = list[i];
        const name = chan.getAttribute("name") || chan.getAttribute("label") || "Unnamed";
        const gain = chan.getAttribute("gain") || "1.0";
        
        // Extract insert plugins names
        const inserts = [];
        const insertsNode = Array.from(chan.getElementsByTagName("Attributes")).find(n => {
          return Array.from(n.attributes).some(a => a.localName === 'id' && a.value === 'Inserts');
        });
        if (insertsNode) {
          const subAttrs = insertsNode.getElementsByTagName("Attributes");
          for (let j = 0; j < subAttrs.length; j++) {
            const classID = subAttrs[j].getAttribute("classID");
            if (classID) {
              inserts.push(subAttrs[j].getAttribute("name") || "Plugin");
            }
          }
        }

        channels.push({ name, gain, inserts });
      }
    });

    return { metadata, tracks, channels };
  };

  const handleCompareSnapshot = (snap) => {
    setCompareLoading(true);
    setCompareError('');
    setCompareData(null);
    setComparedFilename(snap.filename);

    const compareSongPath = `${projectDir}\\History\\${snap.filename}`;

    fetch(`http://localhost:3001/api/load-xmls?songPath=${encodeURIComponent(compareSongPath)}`)
      .then(res => {
        if (!res.ok) throw new Error('Could not read historical snapshot ZIP.');
        return res.json();
      })
      .then(data => {
        const parsed = parseSecondarySongData(data);
        setCompareData(parsed);
        setCompareLoading(false);
      })
      .catch(err => {
        console.error(err);
        setCompareError(`Comparison failed: ${err.message}`);
        setCompareLoading(false);
      });
  };

  // Diff operations
  const diffMetadata = () => {
    if (!compareData || !activeParsedData) return [];
    const meta1 = activeParsedData.metadata;
    const meta2 = compareData.metadata;
    
    const keys = [
      { id: 'Document:Title', label: 'Song Title' },
      { id: 'Media:Tempo', label: 'Tempo (BPM)' },
      { id: 'Media:KeySignature', label: 'Key Signature' },
      { id: 'Media:SampleRate', label: 'Sample Rate' },
      { id: 'Media:BitDepth', label: 'Bit Depth' },
      { id: 'Media:TrackCount', label: 'Track Count' }
    ];

    return keys.map(k => {
      const val1 = meta1[k.id] || 'N/A';
      const val2 = meta2[k.id] || 'N/A';
      return {
        label: k.label,
        val1,
        val2,
        isDifferent: val1.toString() !== val2.toString()
      };
    });
  };

  const diffTracks = () => {
    if (!compareData || !activeParsedData) return { added: [], removed: [], common: [] };
    const t1 = activeParsedData.tracks.map(t => t.name);
    const t2 = compareData.tracks.map(t => t.name);

    const added = t2.filter(t => !t1.includes(t)); // present in history but missing in active
    const removed = t1.filter(t => !t2.includes(t)); // present in active but missing in history
    const common = t1.filter(t => t2.includes(t));

    return { added, removed, common };
  };

  const diffMixer = () => {
    if (!compareData || !activeParsedData) return [];
    const chans1 = activeParsedData.channels;
    const chans2 = compareData.channels;

    const result = [];
    chans1.forEach(c1 => {
      const c2 = chans2.find(c => c.name === c1.name);
      if (c2) {
        const plugins1 = c1.inserts.map(i => i.name);
        const plugins2 = c2.inserts;

        const pluginsEqual = JSON.stringify(plugins1) === JSON.stringify(plugins2);
        const volumeEqual = c1.gain_db === c2.gain_db;

        if (!pluginsEqual || !volumeEqual) {
          result.push({
            name: c1.name,
            volume1: c1.gain_db || 'N/A',
            volume2: c2.gain_db || 'N/A',
            plugins1,
            plugins2,
            isDifferent: true
          });
        }
      }
    });
    return result;
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '1rem', color: 'var(--text-secondary)' }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(0,242,254,0.1)', borderLeft: '3px solid #00f2fe', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      Loading history...
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div className="glass-card" style={{ color: 'var(--accent-pink)', textAlign: 'center', padding: '2rem' }}>
      ⚠️ {error}
    </div>
  );

  if (snapshots.length === 0) return (
    <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
      <p>No snapshots found in the History/ folder.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
        {[
          { icon: '🕐', label: 'Snapshots', value: snapshots.length },
          { icon: '📅', label: 'Session length', value: sessionDuration || '—' },
          { icon: '💾', label: 'Final size', value: formatBytes(snapshots[snapshots.length - 1]?.size || 0) },
          { icon: '📈', label: 'Total growth', value: `+${formatBytes(totalGrowth)}` },
          { icon: '🎚️', label: 'Tracks (final)', value: snapshots[snapshots.length - 1]?.trackCount || '—' },
          { icon: '🎵', label: 'Detected BPM', value: snapshots[snapshots.length - 1]?.bpm ? `${snapshots[snapshots.length - 1].bpm} BPM` : '—' },
        ].map((stat, i) => (
          <div key={i} className="glass-card" style={{ padding: '1rem 1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{stat.icon}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>{stat.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Size Growth Chart */}
      <div className="glass-card">
        <h3 className="glass-card-header">📊 Project size evolution</h3>

        <div style={{ position: 'relative', overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${Math.max(800, snapshots.length * 70)} 160`}
            width="100%"
            height="160"
            style={{ display: 'block', minWidth: `${snapshots.length * 70}px` }}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
              const y = 140 - frac * 120;
              return (
                <g key={i}>
                  <line x1="40" y1={y} x2={Math.max(800, snapshots.length * 70) - 10} y2={y}
                    stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
                  <text x="2" y={y + 4} fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="monospace">
                    {formatBytes(maxSize * frac)}
                  </text>
                </g>
              );
            })}

            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#00f2fe" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {snapshots.length > 1 && (() => {
              const W = Math.max(800, snapshots.length * 70);
              const getX = (i) => 50 + (i / (snapshots.length - 1)) * (W - 80);
              const getY = (size) => 140 - (size / maxSize) * 120;

              const pathPoints = snapshots.map((s, i) => `${getX(i)},${getY(s.size)}`).join(' L ');
              const areaPath = `M ${getX(0)},140 L ${pathPoints} L ${getX(snapshots.length - 1)},140 Z`;

              return (
                <>
                  <path d={areaPath} fill="url(#areaGrad)" />
                  <path d={`M ${pathPoints}`} fill="none" stroke="#00f2fe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {snapshots.map((s, i) => {
                    const x = getX(i);
                    const y = getY(s.size);
                    const col = getSaveColor(s.saveType);
                    const isHov = hoveredIdx === i;
                    return (
                      <g key={i}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredIdx(i)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        onClick={() => {
                          setSelected(selected?.index === i ? null : s);
                          setCompareData(null);
                          setCompareError('');
                        }}
                      >
                        <circle cx={x} cy={y} r={isHov ? 7 : 5} fill={col.dot} stroke="#09090b" strokeWidth="2"
                          style={{ transition: 'r 0.15s ease' }} />
                        {isHov && (
                          <foreignObject x={x - 70} y={y - 52} width="140" height="46">
                            <div xmlns="http://www.w3.org/1999/xhtml"
                              style={{
                                background: '#1a1a2e', border: `1px solid ${col.border}`,
                                borderRadius: 6, padding: '4px 8px', fontSize: '10px',
                                color: 'white', textAlign: 'center', lineHeight: '1.5',
                                pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
                              }}>
                               <strong style={{ color: col.text }}>{s.saveType}</strong><br />
                               {formatBytes(s.size)} · {formatTime(s.isoDate)}
                            </div>
                          </foreignObject>
                        )}
                      </g>
                    );
                  })}
                </>
              );
            })()}
          </svg>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 50px 0 50px', marginTop: '-4px' }}>
          {snapshots.length > 0 && (
            <>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatTime(snapshots[0].isoDate)}</span>
              {snapshots.length > 2 && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {formatTime(snapshots[Math.floor(snapshots.length / 2)]?.isoDate)}
                </span>
              )}
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatTime(snapshots[snapshots.length - 1].isoDate)}</span>
            </>
          )}
        </div>
      </div>

      {/* Timeline by Day */}
      <div className="glass-card">
        <h3 className="glass-card-header">🕐 Save timeline</h3>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {Object.entries(SAVE_TYPE_COLORS).map(([type, col]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: col.text }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot }} />
              {type === 'Autosaved' ? 'Autosave' : type === 'Before Autosave' ? 'Before Autosave' : 'Manual Save'}
            </div>
          ))}
        </div>

        {Object.entries(byDay).map(([day, daySnaps]) => (
          <div key={day} style={{ marginBottom: '2rem' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              marginBottom: '1rem', paddingBottom: '0.5rem',
              borderBottom: '1px solid rgba(255,255,255,0.07)'
            }}>
              <div style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, padding: '2px 10px', fontSize: '0.8rem', color: 'white', fontWeight: 600
              }}>📅 {day}</div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{daySnaps.length} snapshot{daySnaps.length > 1 ? 's' : ''}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingLeft: '1.5rem', borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
              {daySnaps.map((snap, i) => {
                const col = getSaveColor(snap.saveType);
                const isSelected = selected?.index === snap.index;
                const prevSnap = snap.index > 0 ? snapshots[snap.index - 1] : null;
                const trackDiff = prevSnap ? snap.trackCount - prevSnap.trackCount : 0;
                const markerDiff = prevSnap ? snap.markerCount - prevSnap.markerCount : 0;

                return (
                  <div
                    key={i}
                    onClick={() => {
                      setSelected(isSelected ? null : snap);
                      setCompareData(null);
                      setCompareError('');
                    }}
                    style={{
                      background: isSelected ? col.bg : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? col.border : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 8,
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.dot, flexShrink: 0, boxShadow: `0 0 6px ${col.dot}` }} />
                      <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: 'white', fontWeight: 600 }}>
                        {formatTime(snap.isoDate)}
                      </span>
                      <span style={{
                        background: col.bg, border: `1px solid ${col.border}`,
                        color: col.text, borderRadius: 4,
                        padding: '1px 8px', fontSize: '0.72rem', fontWeight: 600
                      }}>
                        {snap.saveType === 'Autosaved' ? 'Autosave' : snap.saveType === 'Before Autosave' ? 'Before Auto' : 'Manual'}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {formatBytes(snap.size)}
                      </span>
                      {snap.sizeDelta !== 0 && (
                        <span style={{
                          fontSize: '0.75rem',
                          color: snap.sizeDelta > 0 ? '#00f2fe' : '#ff6b6b',
                          fontFamily: 'monospace', fontWeight: 600
                        }}>
                          {snap.sizeDelta > 0 ? '+' : ''}{formatBytes(snap.sizeDelta)}
                        </span>
                      )}
                    </div>

                    <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(snap.size / maxSize) * 100}%`,
                        background: `linear-gradient(to right, ${col.dot}, ${col.dot}88)`,
                        borderRadius: 2,
                        transition: 'width 0.4s ease'
                      }} />
                    </div>

                    {/* Expanded detail */}
                    {isSelected && (
                      <div 
                        onClick={e => e.stopPropagation()} // Stop toggle when clicking inside details
                        style={{
                          display: 'flex', flexDirection: 'column', gap: '1rem',
                          marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: 6
                        }}
                      >
                        {/* Info Grid */}
                        <div style={{
                          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                          gap: '0.5rem'
                        }}>
                          {[
                            { label: '🎚️ Tracks', value: snap.trackCount || '—', diff: trackDiff },
                            { label: '📌 Markers', value: snap.markerCount || '—', diff: markerDiff },
                            { label: '🎵 BPM', value: snap.bpm ? `${snap.bpm}` : '—' },
                            { label: '📦 Size', value: formatBytes(snap.size) },
                            { label: '🗓️ Date', value: formatDate(snap.isoDate) },
                            { label: '📄 File', value: snap.filename.replace(/^[^)]+\)\./,'').replace('.song',''), title: snap.filename },
                          ].map((item, j) => (
                            <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.label}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{
                                  fontSize: '0.85rem', color: 'white', fontFamily: 'monospace',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                }} title={item.title}>
                                  {item.value}
                                </span>
                                {item.diff !== undefined && item.diff !== 0 && (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    color: item.diff > 0 ? '#00f2fe' : '#ff6b6b',
                                    fontWeight: 700
                                  }}>
                                    ({item.diff > 0 ? '+' : ''}{item.diff})
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Compare Button */}
                        <div style={{ borderTop: '1px solid var(--border-clean)', paddingTop: '0.75rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                          <button
                            className="btn-primary"
                            onClick={() => handleCompareSnapshot(snap)}
                            disabled={compareLoading}
                            style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                          >
                            {compareLoading ? 'Comparing...' : '🔍 Compare with Active Version'}
                          </button>
                        </div>

                        {/* Comparative Results block */}
                        {compareError && (
                          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', padding: '0.5rem 1rem', borderRadius: '4px', color: '#ef4444', fontSize: '0.82rem' }}>
                            {compareError}
                          </div>
                        )}

                        {compareData && comparedFilename === snap.filename && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)', marginTop: '0.5rem' }}>
                            {/* 1. Metadata Differences */}
                            <div>
                              <h5 style={{ color: 'white', marginBottom: '0.5rem', fontWeight: 600 }}>
                                📋 Metadata Variations (Active Session vs History)
                              </h5>
                              <table className="premium-table" style={{ fontSize: '0.8rem' }}>
                                <thead>
                                  <tr>
                                    <th>Metadata</th>
                                    <th>Active Version</th>
                                    <th>Historical Version</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {diffMetadata().map((m, idx) => (
                                    <tr key={idx} style={{ background: m.isDifferent ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                      <td style={{ fontWeight: 500 }}>{m.label}</td>
                                      <td>{m.val1}</td>
                                      <td>{m.val2}</td>
                                      <td style={{ color: m.isDifferent ? '#00f2fe' : 'var(--text-secondary)', fontWeight: m.isDifferent ? 600 : 400 }}>
                                        {m.isDifferent ? '≠ Modified' : '＝ Unchanged'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* 2. Track Differences */}
                            <div>
                              <h5 style={{ color: 'white', marginBottom: '0.5rem', fontWeight: 600 }}>
                                📁 Track Variations
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
                                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    ➕ Missing in Active Version (Present in History) ({diffTracks().added.length})
                                  </span>
                                  <ul style={{ listStyle: 'none', marginTop: '0.5rem', paddingLeft: 0, maxHeight: '120px', overflowY: 'auto' }}>
                                    {diffTracks().added.map((t, idx) => (
                                      <li key={idx} style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontFamily: 'monospace', marginBottom: '2px' }}>
                                        + {t}
                                      </li>
                                    ))}
                                    {diffTracks().added.length === 0 && (
                                      <li style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>None</li>
                                    )}
                                  </ul>
                                </div>

                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
                                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    ➖ Added in Active Version (Missing in History) ({diffTracks().removed.length})
                                  </span>
                                  <ul style={{ listStyle: 'none', marginTop: '0.5rem', paddingLeft: 0, maxHeight: '120px', overflowY: 'auto' }}>
                                    {diffTracks().removed.map((t, idx) => (
                                      <li key={idx} style={{ color: '#00f2fe', fontSize: '0.78rem', fontFamily: 'monospace', marginBottom: '2px' }}>
                                        - {t}
                                      </li>
                                    ))}
                                    {diffTracks().removed.length === 0 && (
                                      <li style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>None</li>
                                    )}
                                  </ul>
                                </div>
                              </div>
                            </div>

                            {/* 3. Plugin Chain Variations */}
                            <div>
                              <h5 style={{ color: 'white', marginBottom: '0.5rem', fontWeight: 600 }}>
                                🔌 Mixer Plugin Chain Variations
                              </h5>
                              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-clean)', borderRadius: '6px' }}>
                                <table className="premium-table" style={{ marginTop: 0, fontSize: '0.8rem' }}>
                                  <thead>
                                    <tr>
                                      <th>Channel</th>
                                      <th>Active Version</th>
                                      <th>Historical Version</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {diffMixer().map((c, idx) => (
                                      <tr key={idx}>
                                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                                        <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                                          {c.plugins1.join(' ➡️ ') || <span style={{ color: 'var(--text-muted)' }}>No plugins</span>}
                                        </td>
                                        <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'white' }}>
                                          {c.plugins2.join(' ➡️ ') || <span style={{ color: 'var(--text-muted)' }}>No plugins</span>}
                                        </td>
                                      </tr>
                                    ))}
                                    {diffMixer().length === 0 && (
                                      <tr>
                                        <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1rem' }}>
                                          🎉 All matching mixer channel inserts are identical between versions!
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
