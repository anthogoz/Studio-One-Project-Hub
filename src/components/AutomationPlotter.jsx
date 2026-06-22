import React, { useEffect, useState } from 'react';

export default function AutomationPlotter({ songPath }) {
  const [plotMode, setPlotMode] = useState('load'); // 'load' or 'generator'
  const [envelopes, setEnvelopes] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState('');
  const [points, setPoints] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // LFO parameters
  const [lfoShape, setLfoShape] = useState('sine');
  const [lfoBeats, setLfoBeats] = useState(16);
  const [lfoFrequency, setLfoFrequency] = useState(0.25); // cycles per beat
  const [lfoAmplitude, setLfoAmplitude] = useState(1.0);
  const [lfoOffset, setLfoOffset] = useState(0.5);
  const [lfoResolution, setLfoResolution] = useState(8); // points per beat

  // 1. Fetch available envelopes
  useEffect(() => {
    fetch(`http://localhost:3001/api/list-performances?songPath=${encodeURIComponent(songPath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.envelopex) {
          setEnvelopes(data.envelopex);
        }
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load envelope files list.');
      });
  }, [songPath]);

  // 2. Load envelope points on selection (load mode)
  const handleSelectEntry = (entryPath) => {
    setSelectedEntry(entryPath);
    if (!entryPath) {
      setPoints([]);
      return;
    }

    setIsLoading(true);
    setError('');
    setPoints([]);

    fetch(`http://localhost:3001/api/load-performance?songPath=${encodeURIComponent(songPath)}&entryPath=${encodeURIComponent(entryPath)}`)
      .then(res => res.json())
      .then(data => {
        setIsLoading(false);
        if (data.events) {
          setPoints(data.events);
        } else {
          setError('Failed to parse envelope points or file is empty.');
        }
      })
      .catch(err => {
        setIsLoading(false);
        console.error(err);
        setError('Failed to retrieve envelope points.');
      });
  };

  // 3. Dynamic LFO Generator
  useEffect(() => {
    if (plotMode === 'generator') {
      const pts = [];
      const step = 1 / lfoResolution;
      const totalSteps = lfoBeats * lfoResolution;

      for (let i = 0; i <= totalSteps; i++) {
        const beat = i * step;
        const cycle = beat * lfoFrequency;
        const phase = (cycle % 1) * 2 * Math.PI;
        let rawVal = 0;

        switch (lfoShape) {
          case 'sine':
            rawVal = Math.sin(phase);
            break;
          case 'triangle':
            const t = cycle % 1;
            rawVal = t < 0.5 ? (t * 4 - 1) : (3 - t * 4);
            break;
          case 'sawtooth':
            rawVal = (cycle % 1) * 2 - 1;
            break;
          case 'square':
            rawVal = (cycle % 1) < 0.5 ? 1 : -1;
            break;
          case 'random':
            // repeatable sample and hold random values based on step index
            const stepIndex = Math.floor(cycle);
            const seed = Math.sin(stepIndex * 12.9898 + 78.233) * 43758.5453;
            rawVal = (seed - Math.floor(seed)) * 2 - 1;
            break;
        }

        let value = lfoOffset + rawVal * lfoAmplitude * 0.5;
        // clamp
        value = Math.max(0, Math.min(1, value));
        pts.push({ start: beat, value });
      }
      setPoints(pts);
    } else {
      // Clear points if switching back and no entry is selected
      if (!selectedEntry) {
        setPoints([]);
      }
    }
  }, [plotMode, lfoShape, lfoBeats, lfoFrequency, lfoAmplitude, lfoOffset, lfoResolution]);

  // Dimensions of SVG plot area
  const svgWidth = 800;
  const svgHeight = 250;
  const padding = 30;

  // Find min/max values
  let minVal = 0.0;
  let maxVal = 1.0;
  let maxTime = 16.0;

  if (points.length > 0) {
    minVal = Math.min(...points.map(pt => pt.value));
    maxVal = Math.max(...points.map(pt => pt.value));
    maxTime = Math.max(...points.map(pt => pt.start));

    // Add tiny margin to Y axis
    const diff = maxVal - minVal;
    if (diff < 0.01) {
      maxVal += 0.1;
      minVal = Math.max(0.0, minVal - 0.1);
    } else {
      maxVal += diff * 0.1;
      minVal = Math.max(0.0, minVal - diff * 0.1);
    }
  }

  // Helper to map coordinates
  const getX = (t) => {
    return padding + (t / maxTime) * (svgWidth - padding * 2);
  };
  const getY = (val) => {
    const scale = (val - minVal) / (maxVal - minVal);
    return svgHeight - padding - scale * (svgHeight - padding * 2);
  };

  // Generate SVG polyline path
  const linePoints = points.map(pt => `${getX(pt.start)},${getY(pt.value)}`).join(' ');

  const getExportFilename = () => {
    if (plotMode === 'generator') {
      return `lfo_${lfoShape}_${lfoBeats}b`;
    }
    return selectedEntry.split('/').pop().replace('.envelopex', '') || 'automation';
  };

  const handleExportCSV = () => {
    let csv = 'Beat,Value\n';
    points.forEach(pt => {
      csv += `${pt.start.toFixed(4)},${pt.value.toFixed(6)}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getExportFilename()}_automation.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = JSON.stringify(points, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getExportFilename()}_automation.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSVG = () => {
    const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="background:#0d0d0f; font-family: sans-serif;">
  <!-- Grid Lines -->
  ${Array.from({ length: 5 }).map((_, idx) => {
    const scaleVal = minVal + (idx / 4) * (maxVal - minVal);
    const y = getY(scaleVal);
    return `<line x1="${padding}" y1="${y}" x2="${svgWidth - padding}" y2="${y}" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
    <text x="${padding - 5}" y="${y + 4}" fill="#52525b" font-size="9" text-anchor="end">${scaleVal.toFixed(2)}</text>`;
  }).join('\n')}
  ${Array.from({ length: 9 }).map((_, idx) => {
    const t = (idx / 8) * maxTime;
    const x = getX(t);
    return `<line x1="${x}" y1="${padding}" x2="${x}" y2="${svgHeight - padding}" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
    <text x="${x}" y="${svgHeight - padding + 15}" fill="#52525b" font-size="9" text-anchor="middle">${t.toFixed(0)}b</text>`;
  }).join('\n')}
  <!-- Path -->
  <polyline fill="none" stroke="#00f2fe" stroke-width="1.5" points="${linePoints}" />
  <!-- Points -->
  ${points.map(pt => `<circle cx="${getX(pt.start)}" cy="${getY(pt.value)}" r="3" fill="#18181b" stroke="#00f2fe" stroke-width="1.5" />`).join('\n')}
</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getExportFilename()}_automation.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMidiCC = (ccNumber = 11) => {
    const ticksPerBeat = 480;
    const events = [];

    points.forEach(pt => {
      events.push({
        tick: Math.round(pt.start * ticksPerBeat),
        type: 0xB0,
        ccNum: ccNumber,
        val: Math.min(127, Math.max(0, Math.round(pt.value * 127)))
      });
    });

    events.sort((a, b) => a.tick - b.tick);

    const bytes = [];
    const writeVarLength = (val) => {
      const resBytes = [];
      let temp = val;
      resBytes.push(temp & 0x7F);
      while (temp > 127) {
        temp >>>= 7;
        resBytes.push((temp & 0x7F) | 0x80);
      }
      return resBytes.reverse();
    };

    // Tempo Event (Default 120 bpm)
    const tempoMicro = Math.round(60000000 / 120);
    bytes.push(0x00);
    bytes.push(0xff);
    bytes.push(0x51);
    bytes.push(0x03);
    bytes.push((tempoMicro >> 16) & 0xff);
    bytes.push((tempoMicro >> 8) & 0xff);
    bytes.push(tempoMicro & 0xff);

    let lastTick = 0;
    events.forEach(e => {
      const delta = e.tick - lastTick;
      const vlq = writeVarLength(delta);
      vlq.forEach(b => bytes.push(b));

      bytes.push(e.type);
      bytes.push(e.ccNum);
      bytes.push(e.val);

      lastTick = e.tick;
    });

    // End of track
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
      0x00, 0x00, // format 0
      0x00, 0x01, // 1 track
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
    a.href = url;
    a.download = `${getExportFilename()}_CC${ccNumber}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
      <div className="glass-card">
        <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📈 Automation & Modulation Hub</span>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '3px', borderRadius: '4px' }}>
            <button
              onClick={() => { setPlotMode('load'); setError(''); }}
              style={{
                background: plotMode === 'load' ? 'var(--accent-primary)' : 'transparent',
                color: plotMode === 'load' ? 'black' : 'white',
                border: 'none',
                padding: '0.3rem 0.8rem',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              📂 Read Envelopes
            </button>
            <button
              onClick={() => { setPlotMode('generator'); setError(''); }}
              style={{
                background: plotMode === 'generator' ? 'var(--accent-primary)' : 'transparent',
                color: plotMode === 'generator' ? 'black' : 'white',
                border: 'none',
                padding: '0.3rem 0.8rem',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              ⚡ LFO Generator
            </button>
          </div>
        </div>

        {plotMode === 'load' ? (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Select an automation curve file (`.envelopex`) to visualize fader movements, parameter sweeps, and mute states over the timeline.
            </p>

            {/* Dropdown selector */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <select
                value={selectedEntry}
                onChange={(e) => handleSelectEntry(e.target.value)}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border-clean)',
                  background: 'var(--bg-primary)',
                  color: 'white',
                  outline: 'none',
                  minWidth: '320px',
                  fontSize: '0.9rem'
                }}
              >
                <option value="">-- Choose an automation envelope file ({envelopes.length} curves) --</option>
                {envelopes.map((env, idx) => (
                  <option key={idx} value={env.path}>
                    {env.name} ({env.pointsCount} points)
                  </option>
                ))}
              </select>
              {isLoading && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading...</span>}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Design modular automation waveforms (sine, triangle, square, random) and export them directly as MIDI CC files to modulate hardware synth parameters or VSTs in Studio One.
            </p>

            {/* LFO Generator Parameters Panel */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '1rem',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-clean)',
              padding: '1rem',
              borderRadius: '6px'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Waveform Shape</label>
                <select
                  value={lfoShape}
                  onChange={(e) => setLfoShape(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.8rem' }}
                >
                  <option value="sine">Sine</option>
                  <option value="triangle">Triangle</option>
                  <option value="sawtooth">Sawtooth</option>
                  <option value="square">Square</option>
                  <option value="random">Random (S&H)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Length ({lfoBeats} Beats)</label>
                <select
                  value={lfoBeats}
                  onChange={(e) => setLfoBeats(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.8rem' }}
                >
                  <option value="4">4 Beats (1 bar)</option>
                  <option value="8">8 Beats (2 bars)</option>
                  <option value="16">16 Beats (4 bars)</option>
                  <option value="32">32 Beats (8 bars)</option>
                  <option value="64">64 Beats (16 bars)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>LFO Speed / Frequency</label>
                <select
                  value={lfoFrequency}
                  onChange={(e) => setLfoFrequency(parseFloat(e.target.value))}
                  style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.8rem' }}
                >
                  <option value="0.0625">1 cycle every 16 beats</option>
                  <option value="0.125">1 cycle every 8 beats</option>
                  <option value="0.25">1 cycle every 4 beats</option>
                  <option value="0.5">1 cycle every 2 beats</option>
                  <option value="1.0">1 cycle per beat</option>
                  <option value="2.0">2 cycles per beat</option>
                  <option value="4.0">4 cycles per beat</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Amplitude (Range)</label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={lfoAmplitude}
                  onChange={(e) => setLfoAmplitude(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>{Math.round(lfoAmplitude * 100)}%</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>DC Offset (Center)</label>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={lfoOffset}
                  onChange={(e) => setLfoOffset(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>{lfoOffset.toFixed(2)}</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Resolution</label>
                <select
                  value={lfoResolution}
                  onChange={(e) => setLfoResolution(parseInt(e.target.value))}
                  style={{ width: '100%', padding: '0.4rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.8rem' }}
                >
                  <option value="4">4 pts/beat (16th notes)</option>
                  <option value="8">8 pts/beat (32nd notes)</option>
                  <option value="16">16 pts/beat (64th notes)</option>
                  <option value="32">32 pts/beat (Super Fine)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(255, 0, 127, 0.1)', border: '1px solid #ef4444', padding: '1rem', borderRadius: '4px', color: 'white', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {points.length > 0 ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <span>Total Points: <strong>{points.length}</strong></span>
              <span>Timeline: <strong>{maxTime.toFixed(1)} beats</strong></span>
              <span>Value range: <strong>{minVal.toFixed(2)} - {maxVal.toFixed(2)}</strong></span>
            </div>

            {/* Export Toolbar */}
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              marginBottom: '1.5rem',
              flexWrap: 'wrap',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.02)',
              padding: '0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border-clean)'
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Export curve:</span>
              <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }} onClick={handleExportCSV}>
                📄 CSV
              </button>
              <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }} onClick={handleExportJSON}>
                🧬 JSON
              </button>
              <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }} onClick={handleExportSVG}>
                🖼️ Vector SVG
              </button>
              <span style={{ height: '16px', width: '1px', background: 'var(--border-clean)', margin: '0 0.5rem' }}></span>
              <button className="btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', background: '#38bdf8', borderColor: '#38bdf8', color: 'black' }} onClick={() => handleExportMidiCC(11)}>
                🎹 MIDI CC11 (Expression)
              </button>
              <button className="btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', background: '#38bdf8', borderColor: '#38bdf8', color: 'black' }} onClick={() => handleExportMidiCC(1)}>
                🎹 MIDI CC1 (Modwheel)
              </button>
            </div>

            {/* SVG Plot */}
            <div style={{ background: '#0d0d0f', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-clean)', overflowX: 'auto' }}>
              <svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ minWidth: '700px' }}>
                
                {/* Horizontal grid lines */}
                {Array.from({ length: 5 }).map((_, idx) => {
                  const scaleVal = minVal + (idx / 4) * (maxVal - minVal);
                  const y = getY(scaleVal);
                  return (
                    <g key={idx}>
                      <line x1={padding} y1={y} x2={svgWidth - padding} y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                      <text x={padding - 5} y={y + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">{scaleVal.toFixed(2)}</text>
                    </g>
                  );
                })}

                {/* Vertical beat lines */}
                {Array.from({ length: 9 }).map((_, idx) => {
                  const t = (idx / 8) * maxTime;
                  const x = getX(t);
                  return (
                    <g key={idx}>
                      <line x1={x} y1={padding} x2={x} y2={svgHeight - padding} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                      <text x={x} y={svgHeight - padding + 15} fill="var(--text-muted)" fontSize="9" textAnchor="middle">{t.toFixed(0)}b</text>
                    </g>
                  );
                })}

                {/* Polyline path */}
                {points.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth="1.5"
                    points={linePoints}
                  />
                )}

                {/* Automation Point Dots - Render less dense dots for generated LFO to avoid visual clutter */}
                {points.filter((_, i) => plotMode !== 'generator' || i % Math.max(1, Math.floor(lfoResolution / 2)) === 0).map((pt, idx) => {
                  const cx = getX(pt.start);
                  const cy = getY(pt.value);
                  return (
                    <circle
                      key={idx}
                      cx={cx}
                      cy={cy}
                      r={plotMode === 'generator' ? "2.5" : "4"}
                      fill="var(--bg-secondary)"
                      stroke="var(--accent-primary)"
                      strokeWidth="1.5"
                      cursor="pointer"
                    >
                      <title>{`Time: ${pt.start.toFixed(2)}b | Value: ${pt.value.toFixed(4)}`}</title>
                    </circle>
                  );
                })}

              </svg>
            </div>
          </div>
        ) : (
          !isLoading && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '4rem' }}>
              No automation active. Switch to LFO Generator or choose an envelope file to visualize.
            </p>
          )
        )}
      </div>
    </div>
  );
}
