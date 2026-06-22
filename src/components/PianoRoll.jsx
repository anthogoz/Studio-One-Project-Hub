import React, { useEffect, useState, useRef } from 'react';

// MIDI pitch helper to get Note Name
const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const getNoteName = (pitch) => {
  const octave = Math.floor(pitch / 12) - 1;
  const name = PITCH_NAMES[pitch % 12];
  return `${name}${octave}`;
};

export default function PianoRoll({ songPath, parsedData }) {
  const [performances, setPerformances] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState('');
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef(null);
  const playbackTimerRef = useRef(null);

  // Extract BPM (with floating point rounding fix)
  const bpmRaw = parsedData?.metadata['Media:Tempo'];
  const bpm = (() => {
    if (!bpmRaw) return 120;
    const tempo = parseFloat(bpmRaw);
    if (isNaN(tempo)) return 120;
    if (Math.abs(tempo - Math.round(tempo)) < 0.005) {
      return Math.round(tempo);
    }
    return tempo;
  })();

  // Calculate startShift to align to a 4-beat bar boundary to avoid long empty space at start
  const minStart = notes.length > 0 ? Math.min(...notes.map(n => n.start)) : 0;
  const startShift = minStart >= 4 ? Math.floor(minStart / 4) * 4 : 0;

  // 1. Fetch available performances
  useEffect(() => {
    fetch(`http://localhost:3001/api/list-performances?songPath=${encodeURIComponent(songPath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.musicx) {
          setPerformances(data.musicx);
        }
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load performance files list.');
      });

    return () => {
      // Cleanup on unmount
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {}
      }
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
      }
    };
  }, [songPath]);

  const stopMidi = () => {
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setIsPlaying(false);
  };

  const playMidi = () => {
    if (notes.length === 0) return;
    
    stopMidi();
 
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = ctx;
    setIsPlaying(true);
 
    const now = ctx.currentTime;
    const beatDuration = 60 / bpm;
 
    notes.forEach(note => {
      // Safety check: skip events without a valid pitch
      if (note.pitch === undefined || note.pitch === null || isNaN(note.pitch)) {
        return;
      }
 
      try {
        const startTime = now + ((note.start - startShift) * beatDuration);
        const duration = note.length * beatDuration;
        const endTime = startTime + duration;
 
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
 
        const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
 
        const vel = note.velocity || 0.8;
        const maxVolume = vel * 0.12; // keep at clean moderate volume
 
        // Envelope ADSR
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(maxVolume, startTime + 0.01);
        gainNode.gain.setTargetAtTime(maxVolume * 0.6, startTime + 0.01, 0.05);
        gainNode.gain.setValueAtTime(maxVolume * 0.6, endTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime + 0.15);
 
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
 
        osc.start(startTime);
        osc.stop(endTime + 0.15);
      } catch (err) {
        console.warn('Failed to schedule preview note:', note, err);
      }
    });
 
    let maxEndTime = 0;
    notes.forEach(note => {
      if (note.pitch === undefined || note.pitch === null || isNaN(note.pitch)) return;
      const endTime = ((note.start - startShift) + note.length) * beatDuration;
      if (endTime > maxEndTime) maxEndTime = endTime;
    });
 
    const timer = setTimeout(() => {
      setIsPlaying(false);
    }, (maxEndTime * 1000) + 200);
    playbackTimerRef.current = timer;
  };

  const handleExportMidi = () => {
    if (notes.length === 0) return;

    const ticksPerBeat = 480;
    const events = [];

    notes.forEach(note => {
      if (note.pitch === undefined || note.pitch === null || isNaN(note.pitch)) {
        return;
      }
      events.push({
        tick: Math.round((note.start - startShift) * ticksPerBeat),
        type: 0x90, // Note On
        pitch: note.pitch,
        vel: Math.round((note.velocity || 0.8) * 127)
      });
      events.push({
        tick: Math.round(((note.start - startShift) + note.length) * ticksPerBeat),
        type: 0x80, // Note Off
        pitch: note.pitch,
        vel: 64
      });
    });

    // Sort ticks, Note Off before Note On
    events.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      return a.type - b.type;
    });

    const bytes = [];

    const writeVarLength = (val) => {
      const bytes = [];
      let temp = val;
      bytes.push(temp & 0x7F);
      while (temp > 127) {
        temp >>>= 7;
        bytes.push((temp & 0x7F) | 0x80);
      }
      return bytes.reverse();
    };

    // Tempo Event: delta 0, FF 51 03 [3 tempo bytes]
    const tempoMicro = Math.round(60000000 / bpm);
    bytes.push(0x00);
    bytes.push(0xff);
    bytes.push(0x51);
    bytes.push(0x03);
    bytes.push((tempoMicro >> 16) & 0xff);
    bytes.push((tempoMicro >> 8) & 0xff);
    bytes.push(tempoMicro & 0xff);

    // Note Events
    let lastTick = 0;
    events.forEach(e => {
      const delta = e.tick - lastTick;
      const vlq = writeVarLength(delta);
      vlq.forEach(b => bytes.push(b));

      bytes.push(e.type);
      bytes.push(e.pitch);
      bytes.push(e.vel);

      lastTick = e.tick;
    });

    // End of Track Event: delta 0, FF 2F 00
    bytes.push(0x00);
    bytes.push(0xff);
    bytes.push(0x2f);
    bytes.push(0x00);

    const trackHeader = [0x4d, 0x54, 0x72, 0x6b];
    const trackLen = bytes.length;
    const trackSize = [
      (trackLen >> 24) & 0xff,
      (trackLen >> 16) & 0xff,
      (trackLen >> 8) & 0xff,
      trackLen & 0xff
    ];

    const fileHeader = [
      0x4d, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00,
      0x00, 0x01,
      (ticksPerBeat >> 8) & 0xff, ticksPerBeat & 0xff
    ];

    const finalBytes = new Uint8Array([
      ...fileHeader,
      ...trackHeader,
      ...trackSize,
      ...bytes
    ]);

    const blob = new Blob([finalBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const cleanName = selectedEntry.split('/').pop().replace('.musicx', '') || 'clip';
    a.href = url;
    a.download = `${cleanName}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 2. Load performance notes on selection
  const handleSelectEntry = (entryPath) => {
    stopMidi();
    setSelectedEntry(entryPath);
    if (!entryPath) {
      setNotes([]);
      return;
    }

    setIsLoading(true);
    setError('');
    setNotes([]);

    fetch(`http://localhost:3001/api/load-performance?songPath=${encodeURIComponent(songPath)}&entryPath=${encodeURIComponent(entryPath)}`)
      .then(res => res.json())
      .then(data => {
        setIsLoading(false);
        if (data.events) {
          setNotes(data.events);
        } else {
          setError('Failed to parse notes or file is empty.');
        }
      })
      .catch(err => {
        setIsLoading(false);
        console.error(err);
        setError('Failed to retrieve performance notes.');
      });
  };

  // Determine active pitch range and beats to fit grid
  let minPitch = 127;
  let maxPitch = 0;
  let maxBeats = 16; // default beats grid

  notes.forEach(n => {
    if (n.pitch !== undefined && n.pitch !== null && !isNaN(n.pitch)) {
      if (n.pitch < minPitch) minPitch = n.pitch;
      if (n.pitch > maxPitch) maxPitch = n.pitch;
    }
    const endBeat = (n.start - startShift) + n.length;
    if (endBeat > maxBeats) maxBeats = Math.ceil(endBeat);
  });

  // Safe padding
  if (minPitch === 127) minPitch = 60;
  if (maxPitch === 0) maxPitch = 72;
  
  // Pad the range slightly for nicer padding
  minPitch = Math.max(0, minPitch - 2);
  maxPitch = Math.min(127, maxPitch + 2);

  // Generate list of pitches top-to-bottom
  const pitchRange = [];
  for (let p = maxPitch; p >= minPitch; p--) {
    pitchRange.push(p);
  }

  // Width variables
  const gridWidth = Math.max(800, maxBeats * 40);
  const beatWidth = gridWidth / maxBeats;
  const rowHeight = 24;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1.5rem', width: '100%', maxWidth: '100%' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
        <h3 className="glass-card-header">🎹 MIDI Piano Roll Viewer</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Select a MIDI performance clip (`.musicx`) from your project to visualize and preview its notes, positions, and lengths, or export it to a standard `.mid` file.
        </p>

        {/* Selector and Info Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
          gap: '1.5rem', 
          marginBottom: '1.5rem' 
        }}>
          {/* Left panel: Controls */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '1rem', 
            background: 'rgba(0, 0, 0, 0.15)', 
            padding: '1.25rem', 
            borderRadius: '8px', 
            border: '1px solid var(--border-clean)' 
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
              Clip Selection & Playback
            </span>
            <select
              value={selectedEntry}
              onChange={(e) => handleSelectEntry(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 1rem',
                borderRadius: '6px',
                border: '1px solid var(--border-focus)',
                background: 'var(--bg-primary)',
                color: 'white',
                outline: 'none',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              <option value="">-- Choose a MIDI performance file ({performances.length} clips) --</option>
              {performances.filter(p => p.isUsed && !p.isDuplicate).length > 0 && (
                <optgroup label="✅ Active MIDI Clips (In Use)">
                  {performances.filter(p => p.isUsed && !p.isDuplicate).map((perf, idx) => (
                    <option key={`used-${idx}`} value={perf.path}>
                      {perf.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {performances.filter(p => p.isDuplicate).length > 0 && (
                <optgroup label="👥 Duplicate MIDI Clips (Identical)">
                  {performances.filter(p => p.isDuplicate).map((perf, idx) => (
                    <option key={`dup-${idx}`} value={perf.path}>
                      {perf.name} (Dup of {perf.primaryName})
                    </option>
                  ))}
                </optgroup>
              )}
              {performances.filter(p => !p.isUsed && !p.isDuplicate).length > 0 && (
                <optgroup label="⚠️ Orphan MIDI Clips (Unused)">
                  {performances.filter(p => !p.isUsed && !p.isDuplicate).map((perf, idx) => (
                    <option key={`unused-${idx}`} value={perf.path}>
                      {perf.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '0.25rem 0' }}>
                <span className="spinner-mini" style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.6s linear infinite'
                }} />
                Loading clip notes...
              </div>
            )}

            {notes.length > 0 && (
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                {isPlaying ? (
                  <button 
                    className="btn-secondary" 
                    onClick={stopMidi} 
                    style={{ flex: 1, background: '#ef4444', color: 'white', padding: '0.65rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', border: 'none', fontWeight: 600, borderRadius: '6px' }}
                  >
                    ⏹️ Stop Preview
                  </button>
                ) : (
                  <button 
                    className="btn-secondary" 
                    onClick={playMidi} 
                    style={{ flex: 1, background: '#10b981', color: 'white', padding: '0.65rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', border: 'none', fontWeight: 600, borderRadius: '6px' }}
                  >
                    ▶️ Play Preview
                  </button>
                )}

                <button 
                  className="btn-secondary" 
                  onClick={handleExportMidi} 
                  style={{ flex: 1, padding: '0.65rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 600, borderRadius: '6px' }}
                >
                  📥 Export .MIDI
                </button>
              </div>
            )}
          </div>

          {/* Right panel: Details & Badges */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '1rem', 
            background: 'rgba(0, 0, 0, 0.15)', 
            padding: '1.25rem', 
            borderRadius: '8px', 
            border: '1px solid var(--border-clean)',
            justifyContent: selectedEntry ? 'space-between' : 'center'
          }}>
            {!selectedEntry ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem 0' }}>
                <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}>ℹ️</span>
                Please select a clip to display its properties and statistics.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                    Clip Properties
                  </span>
                  {(() => {
                    const currentPerf = performances.find(p => p.path === selectedEntry);
                    if (!currentPerf) return null;
                    return (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                        {currentPerf.isUsed ? (
                          <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(16, 185, 129, 0.08)', padding: '0.35rem 0.65rem', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.2)', fontWeight: 600 }}>
                            ✅ Active Clip
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#f43f5e', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(244, 63, 94, 0.08)', padding: '0.35rem 0.65rem', borderRadius: '4px', border: '1px solid rgba(244, 63, 94, 0.2)', fontWeight: 600 }}>
                            ⚠️ Orphan Clip
                          </span>
                        )}
                        {currentPerf.isDuplicate ? (
                          <span style={{ fontSize: '0.75rem', color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(56, 189, 248, 0.08)', padding: '0.35rem 0.65rem', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.2)', fontWeight: 600 }} title={`Identical to: ${currentPerf.duplicates.join(', ')}`}>
                            👥 Duplicate of {currentPerf.primaryName}
                          </span>
                        ) : currentPerf.hasDuplicates ? (
                          <span style={{ fontSize: '0.75rem', color: '#a855f7', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(168, 85, 247, 0.08)', padding: '0.35rem 0.65rem', borderRadius: '4px', border: '1px solid rgba(168, 85, 247, 0.2)', fontWeight: 600 }} title={`Identical copies: ${currentPerf.duplicates.join(', ')}`}>
                            👥 Has identical copies ({currentPerf.duplicates.length})
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(255, 255, 255, 0.03)', padding: '0.35rem 0.65rem', borderRadius: '4px', border: '1px solid var(--border-clean)', fontWeight: 600 }}>
                            ⭐ Unique Clip
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {notes.length > 0 && (
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '0.5rem 1rem', 
                    background: 'rgba(0, 0, 0, 0.1)', 
                    padding: '0.75rem', 
                    borderRadius: '6px', 
                    border: '1px solid rgba(255,255,255,0.02)', 
                    fontSize: '0.8rem' 
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Notes:</span>{' '}
                      <strong style={{ color: 'white' }}>{notes.length}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Pitch Range:</span>{' '}
                      <strong style={{ color: 'white' }}>{getNoteName(minPitch + 2)} - {getNoteName(maxPitch - 2)}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Length:</span>{' '}
                      <strong style={{ color: 'white' }}>{maxBeats} beats</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Tempo:</span>{' '}
                      <strong style={{ color: 'white' }}>{bpm} BPM</strong>
                    </div>
                    {startShift > 0 && (
                      <div style={{ gridColumn: 'span 2', marginTop: '0.15rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Start Shift:</span>{' '}
                        <strong style={{ color: 'white' }}>{startShift} beats (~{startShift / 4} bars)</strong>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(255, 0, 127, 0.1)', border: '1px solid #ef4444', padding: '1rem', borderRadius: '4px', color: 'white', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {notes.length > 0 && (
          <div>

            {/* Scrollable Piano Roll Board */}
            <div style={{ 
              display: 'flex', 
              border: '1px solid var(--border-clean)', 
              borderRadius: '6px', 
              overflow: 'auto',
              maxHeight: '450px',
              background: '#0d0d0f',
              width: '100%',
              maxWidth: '100%'
            }}>
              
              {/* Keyboard Guide (Left Column) Sticky */}
              <div style={{ 
                width: '60px', 
                flexShrink: 0, 
                position: 'sticky', 
                left: 0, 
                zIndex: 10,
                background: '#121214',
                borderRight: '2px solid var(--border-clean)'
              }}>
                {pitchRange.map((pitch, idx) => {
                  const isBlack = [1, 3, 6, 8, 10].includes(pitch % 12);
                  return (
                    <div
                      key={idx}
                      style={{
                        height: `${rowHeight}px`,
                        background: isBlack ? '#18181b' : '#ffffff',
                        color: isBlack ? '#a1a1aa' : '#18181b',
                        borderBottom: '1px solid #27272a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        paddingRight: '6px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        userSelect: 'none'
                      }}
                    >
                      {getNoteName(pitch)}
                    </div>
                  );
                })}
              </div>

              {/* Grid Canvas (Right Area) */}
              <div style={{ 
                position: 'relative', 
                width: `${gridWidth}px`, 
                height: `${pitchRange.length * rowHeight}px` 
              }}>
                
                {/* Horizontal Grid lines */}
                {pitchRange.map((pitch, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: `${idx * rowHeight}px`,
                      width: '100%',
                      height: `${rowHeight}px`,
                      borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                      background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      pointerEvents: 'none'
                    }}
                  />
                ))}

                {/* Vertical Beat grid lines */}
                {Array.from({ length: maxBeats }).map((_, beatIdx) => (
                  <div
                    key={beatIdx}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: `${beatIdx * beatWidth}px`,
                      height: '100%',
                      width: '1px',
                      borderLeft: beatIdx % 4 === 0 
                        ? '1px solid rgba(255, 255, 255, 0.15)' 
                        : '1px dashed rgba(255, 255, 255, 0.04)',
                      pointerEvents: 'none'
                    }}
                  />
                ))}

                {/* Note Blocks */}
                {notes.map((note, idx) => {
                  if (note.pitch === undefined || note.pitch === null || isNaN(note.pitch)) return null;
                  const pitchIndex = pitchRange.indexOf(note.pitch);
                  if (pitchIndex === -1) return null;

                  const left = (note.start - startShift) * beatWidth;
                  const width = Math.max(12, note.length * beatWidth);
                  const top = pitchIndex * rowHeight + 3; // slight offset margin
                  const height = rowHeight - 6;

                  // color based on velocity
                  const vel = note.velocity || 0.8;
                  const opacity = 0.3 + vel * 0.7; // map 0-1 to 0.3-1.0
                  
                  return (
                    <div
                      key={idx}
                      style={{
                        position: 'absolute',
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                        borderRadius: '3px',
                        background: `rgba(255, 255, 255, ${opacity})`,
                        border: '1px solid var(--accent-primary)',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease'
                      }}
                      title={`Note: ${getNoteName(note.pitch)} | Start: ${note.start.toFixed(2)} beats (shifted: ${(note.start - startShift).toFixed(2)}) | Length: ${note.length.toFixed(2)} beats | Velocity: ${Math.round(vel * 127)}`}
                      onMouseEnter={(e) => {
                        e.target.style.transform = 'scaleY(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = 'scaleY(1)';
                      }}
                    />
                  );
                })}

              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
