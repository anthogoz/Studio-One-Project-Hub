import React, { useState, useRef } from 'react';

/* ───────────── constants ───────────── */
const TRIGGER_TYPES = ['NoteOn', 'ControlChange', 'ProgramChange'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#1abc9c', '#3498db', '#9b59b6', '#e91e63',
  '#ff5722', '#795548', '#607d8b', '#ffffff',
];

function midiNoteToName(note) {
  const n = parseInt(note, 10);
  if (isNaN(n) || n < 0 || n > 127) return '';
  const octave = Math.floor(n / 12) - 2;
  const name = NOTE_NAMES[n % 12];
  return `${name}${octave}`;
}

function noteNameToMidi(name) {
  if (!name) return 0;
  const match = name.match(/^([A-G]#?)(-?\d+)$/i);
  if (!match) return 0;
  const noteIndex = NOTE_NAMES.indexOf(match[1].toUpperCase());
  if (noteIndex === -1) return 0;
  const octave = parseInt(match[2], 10);
  return noteIndex + (octave + 2) * 12;
}

/* ───────────── XML builders ───────────── */
function buildSoundVariationXML(mapName, articulations) {
  const rules = articulations.map((art, idx) => {
    const color = art.color ? art.color.replace('#', '') : 'ffffff';
    let triggerXML = '';

    if (art.triggerType === 'NoteOn') {
      triggerXML = `\n\t\t\t\t<List id="triggers">\n\t\t\t\t\t<Attributes id="Trigger" type="0" note="${art.value}" velocity="${art.velocity || 127}"/>\n\t\t\t\t</List>`;
    } else if (art.triggerType === 'ControlChange') {
      triggerXML = `\n\t\t\t\t<List id="triggers">\n\t\t\t\t\t<Attributes id="Trigger" type="1" controller="${art.ccNumber || 0}" value="${art.value || 0}"/>\n\t\t\t\t</List>`;
    } else if (art.triggerType === 'ProgramChange') {
      triggerXML = `\n\t\t\t\t<List id="triggers">\n\t\t\t\t\t<Attributes id="Trigger" type="2" program="${art.value || 0}"/>\n\t\t\t\t</List>`;
    }

    return `\t\t<Attributes id="Rule" name="${escapeXmlAttr(art.name)}" color="ff${color}" outputChannel="${art.outputChannel || 0}">${triggerXML}\n\t\t</Attributes>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<SoundMap name="${escapeXmlAttr(mapName)}">
\t<List id="rules">
${rules}
\t</List>
</SoundMap>`;
}

function escapeXmlAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ───────────── Expression map parser ───────────── */
function parseExpressionMap(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const results = [];

  // Look for slot entries – Cubase wraps articulations in <obj class="PSlot">
  const slots = doc.querySelectorAll('[class="PSlot"]');
  slots.forEach(slot => {
    const nameEl = slot.querySelector('[name="name"]');
    const artName = nameEl ? (nameEl.getAttribute('value') || nameEl.textContent.trim()) : 'Articulation';

    // Find output events
    const outputEvents = slot.querySelectorAll('[class="POutputEvent"]');
    let triggerType = 'NoteOn';
    let value = 0;
    let velocity = 127;
    let ccNumber = 0;

    if (outputEvents.length > 0) {
      const ev = outputEvents[0];
      const typeEl = ev.querySelector('[name="type"]');
      const noteEl = ev.querySelector('[name="note1"], [name="pitch"]');
      const velEl  = ev.querySelector('[name="vel1"], [name="velocity"]');
      const ccEl   = ev.querySelector('[name="data1"], [name="controller"]');
      const valEl  = ev.querySelector('[name="data2"], [name="value"]');
      const progEl = ev.querySelector('[name="program"]');

      const typeVal = typeEl ? parseInt(typeEl.getAttribute('value') || '0') : 0;

      if (typeVal === 0 || typeVal === 1) {
        // Note-on (type 0 or 1 in cubase)
        triggerType = 'NoteOn';
        value = noteEl ? parseInt(noteEl.getAttribute('value') || '0') : 0;
        velocity = velEl ? parseInt(velEl.getAttribute('value') || '127') : 127;
      } else if (typeVal === 2) {
        triggerType = 'ControlChange';
        ccNumber = ccEl ? parseInt(ccEl.getAttribute('value') || '0') : 0;
        value = valEl ? parseInt(valEl.getAttribute('value') || '0') : 0;
      } else if (typeVal === 5) {
        triggerType = 'ProgramChange';
        value = progEl ? parseInt(progEl.getAttribute('value') || '0') : 0;
      }
    }

    results.push({
      name: artName,
      triggerType,
      value,
      velocity,
      ccNumber,
      color: COLORS[results.length % COLORS.length],
      outputChannel: 0,
    });
  });

  // Fallback: look for generic <obj> or <list> structures
  if (results.length === 0) {
    const anySlots = doc.querySelectorAll('list > obj, List > Attributes');
    anySlots.forEach(el => {
      const nameAttr = el.getAttribute('name') || el.querySelector('[name="name"]')?.getAttribute('value') || `Slot ${results.length + 1}`;
      results.push({
        name: nameAttr,
        triggerType: 'NoteOn',
        value: results.length,
        velocity: 127,
        ccNumber: 0,
        color: COLORS[results.length % COLORS.length],
        outputChannel: 0,
      });
    });
  }

  return results;
}

/* ───────────── component ───────────── */
export default function SoundVariations() {
  const [mapName, setMapName] = useState('My Articulation Map');
  const [articulations, setArticulations] = useState([
    { name: 'Legato', triggerType: 'NoteOn', value: 0, velocity: 127, ccNumber: 0, color: '#3498db', outputChannel: 0 },
    { name: 'Staccato', triggerType: 'NoteOn', value: 1, velocity: 127, ccNumber: 0, color: '#e74c3c', outputChannel: 0 },
  ]);
  const [editIdx, setEditIdx] = useState(null);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [preview, setPreview] = useState(false);
  const fileInputRef = useRef(null);

  /* ── helpers ── */
  const addArticulation = () => {
    setArticulations(prev => [
      ...prev,
      {
        name: `Art. ${prev.length + 1}`,
        triggerType: 'NoteOn',
        value: prev.length,
        velocity: 127,
        ccNumber: 0,
        color: COLORS[prev.length % COLORS.length],
        outputChannel: 0,
      },
    ]);
    setEditIdx(articulations.length);
  };

  const removeArticulation = (idx) => {
    setArticulations(prev => prev.filter((_, i) => i !== idx));
    if (editIdx === idx) setEditIdx(null);
  };

  const updateArt = (idx, field, val) => {
    setArticulations(prev => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a));
  };

  const moveUp = (idx) => {
    if (idx === 0) return;
    setArticulations(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setEditIdx(idx - 1);
  };

  const moveDown = (idx) => {
    if (idx >= articulations.length - 1) return;
    setArticulations(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    setEditIdx(idx + 1);
  };

  /* ── import ── */
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportError('');
    setImportSuccess('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const parsed = parseExpressionMap(text);
        if (parsed.length === 0) {
          setImportError('No articulation slots found. Make sure this is a valid Cubase .expressionmap XML file.');
        } else {
          setArticulations(parsed);
          setMapName(file.name.replace(/\.expressionmap$/i, ''));
          setImportSuccess(`Successfully imported ${parsed.length} articulation(s) from "${file.name}".`);
        }
      } catch (err) {
        setImportError(`Parse error: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /* ── export ── */
  const handleExport = () => {
    const xml = buildSoundVariationXML(mapName, articulations);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mapName.replace(/[^\w\s-]/g, '').trim()}.soundvariation`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generatedXML = buildSoundVariationXML(mapName, articulations);

  /* ── render ── */
  return (
    <div style={{ maxWidth: '1100px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Header */}
      <div className="glass-card">
        <h2 className="glass-card-header">🎼 Sound Variations Editor & Converter</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          Build articulation maps for your virtual instruments and export them as PreSonus <strong>.soundvariation</strong> preset files. Drop them into <code style={{ background: 'rgba(255,255,255,0.08)', padding: '0.1rem 0.35rem', borderRadius: '3px', fontSize: '0.8rem' }}>Documents\PreSonus\Presets\User Presets\Key Switches</code> and re-index presets in Studio One.
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0', lineHeight: '1.5', background: 'rgba(0,242,254,0.05)', border: '1px solid rgba(0,242,254,0.15)', padding: '0.75rem', borderRadius: '6px' }}>
          💡 <strong>Cubase Expression Map import:</strong> Load a <code style={{ fontSize: '0.78rem' }}>.expressionmap</code> file to auto-fill the articulations table and convert directly to Studio One format.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem', alignItems: 'start' }}>

        {/* Left – Articulation Builder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Map name + import/export */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              Map Settings
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', fontWeight: 600 }}>Map Name</label>
                <input
                  type="text"
                  value={mapName}
                  onChange={e => setMapName(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.88rem', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary"
                  style={{ flex: 1, fontSize: '0.82rem' }}
                >
                  📥 Import Cubase .expressionmap
                </button>
                <input ref={fileInputRef} type="file" accept=".expressionmap,.xml" onChange={handleImport} style={{ display: 'none' }} />
                <button onClick={handleExport} className="btn-primary" style={{ flex: 1, fontSize: '0.82rem', fontWeight: 'bold' }}>
                  📤 Export .soundvariation
                </button>
              </div>

              {importSuccess && (
                <div style={{ background: 'rgba(0,242,254,0.08)', border: '1px solid var(--accent-cyan)', padding: '0.6rem 0.8rem', borderRadius: '4px', color: 'var(--accent-cyan)', fontSize: '0.78rem' }}>
                  ✅ {importSuccess}
                </div>
              )}
              {importError && (
                <div style={{ background: 'rgba(255,0,127,0.08)', border: '1px solid var(--accent-pink)', padding: '0.6rem 0.8rem', borderRadius: '4px', color: 'var(--accent-pink)', fontSize: '0.78rem' }}>
                  ❌ {importError}
                </div>
              )}
            </div>
          </div>

          {/* Articulations list */}
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', color: 'white', margin: 0 }}>
                Articulations ({articulations.length})
              </h3>
              <button onClick={addArticulation} className="btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}>
                ➕ Add
              </button>
            </div>

            {articulations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No articulations. Click <strong>Add</strong> or import a Cubase expression map.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {articulations.map((art, idx) => (
                  <div key={idx}>
                    {/* Collapsed row */}
                    <div
                      onClick={() => setEditIdx(editIdx === idx ? null : idx)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        background: editIdx === idx ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${editIdx === idx ? 'rgba(0,242,254,0.3)' : 'var(--border-clean)'}`,
                        borderRadius: '5px', padding: '0.55rem 0.75rem',
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Color swatch */}
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: art.color, flexShrink: 0 }} />
                      {/* Name */}
                      <span style={{ flex: 1, fontWeight: 600, color: 'white', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {art.name}
                      </span>
                      {/* Trigger badge */}
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '0.15rem 0.45rem', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                        {art.triggerType === 'NoteOn'
                          ? `Key: ${midiNoteToName(art.value)} (${art.value})`
                          : art.triggerType === 'ControlChange'
                          ? `CC${art.ccNumber}=${art.value}`
                          : `PC:${art.value}`}
                      </span>
                      {/* Move buttons */}
                      <button onClick={e => { e.stopPropagation(); moveUp(idx); }} title="Move Up" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0.15rem', fontSize: '0.8rem' }}>▲</button>
                      <button onClick={e => { e.stopPropagation(); moveDown(idx); }} title="Move Down" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0.15rem', fontSize: '0.8rem' }}>▼</button>
                      <button onClick={e => { e.stopPropagation(); removeArticulation(idx); }} title="Remove" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 0.15rem', fontSize: '0.9rem' }}>🗑️</button>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{editIdx === idx ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded edit panel */}
                    {editIdx === idx && (
                      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,242,254,0.15)', borderTop: 'none', borderRadius: '0 0 5px 5px', padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        {/* Name */}
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Articulation Name</label>
                          <input type="text" value={art.name} onChange={e => updateArt(idx, 'name', e.target.value)} style={{ width: '100%', padding: '0.45rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.85rem', outline: 'none' }} />
                        </div>

                        {/* Trigger type */}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Trigger Type</label>
                          <select value={art.triggerType} onChange={e => updateArt(idx, 'triggerType', e.target.value)} style={{ width: '100%', padding: '0.45rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.82rem' }}>
                            {TRIGGER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>

                        {/* Value field depending on trigger type */}
                        {art.triggerType === 'NoteOn' && (
                          <>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>MIDI Note (0–127)</label>
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <input type="number" min="0" max="127" value={art.value} onChange={e => updateArt(idx, 'value', parseInt(e.target.value) || 0)} style={{ flex: 1, padding: '0.45rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.82rem', outline: 'none' }} />
                                <span style={{ padding: '0.45rem', color: 'var(--accent-cyan)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{midiNoteToName(art.value)}</span>
                              </div>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Velocity (0–127)</label>
                              <input type="number" min="0" max="127" value={art.velocity || 127} onChange={e => updateArt(idx, 'velocity', parseInt(e.target.value) || 127)} style={{ width: '100%', padding: '0.45rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.82rem', outline: 'none' }} />
                            </div>
                          </>
                        )}

                        {art.triggerType === 'ControlChange' && (
                          <>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>CC Number (0–127)</label>
                              <input type="number" min="0" max="127" value={art.ccNumber || 0} onChange={e => updateArt(idx, 'ccNumber', parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '0.45rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.82rem', outline: 'none' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>CC Value (0–127)</label>
                              <input type="number" min="0" max="127" value={art.value} onChange={e => updateArt(idx, 'value', parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '0.45rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.82rem', outline: 'none' }} />
                            </div>
                          </>
                        )}

                        {art.triggerType === 'ProgramChange' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Program Number (0–127)</label>
                            <input type="number" min="0" max="127" value={art.value} onChange={e => updateArt(idx, 'value', parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '0.45rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.82rem', outline: 'none' }} />
                          </div>
                        )}

                        {/* Output channel */}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Output MIDI Channel (0 = all)</label>
                          <input type="number" min="0" max="16" value={art.outputChannel || 0} onChange={e => updateArt(idx, 'outputChannel', parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '0.45rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.82rem', outline: 'none' }} />
                        </div>

                        {/* Color picker */}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Lane Color</label>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {COLORS.map(c => (
                              <button
                                key={c}
                                onClick={() => updateArt(idx, 'color', c)}
                                style={{
                                  width: '20px', height: '20px', borderRadius: '50%',
                                  background: c,
                                  border: art.color === c ? '2px solid white' : '2px solid transparent',
                                  cursor: 'pointer', padding: 0, transition: 'transform 0.1s',
                                }}
                                title={c}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right – Preview & Reference */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Quick summary card */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              Map Preview
            </h3>

            {/* Articulations mini grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '260px', overflowY: 'auto', marginBottom: '1rem' }}>
              {articulations.map((art, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid var(--border-clean)' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: art.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.82rem', color: 'white', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.name}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {art.triggerType === 'NoteOn' ? `${midiNoteToName(art.value)} vel${art.velocity || 127}` : art.triggerType === 'ControlChange' ? `CC${art.ccNumber}:${art.value}` : `PC:${art.value}`}
                  </span>
                </div>
              ))}
              {articulations.length === 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '0.5rem' }}>Empty map.</span>
              )}
            </div>

            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={articulations.length === 0}
              className="btn-primary"
              style={{ width: '100%', padding: '0.7rem', fontSize: '0.88rem', fontWeight: 'bold' }}
            >
              📤 Download {mapName}.soundvariation
            </button>
          </div>

          {/* XML Preview */}
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', color: 'white', margin: 0 }}>XML Preview</h3>
              <button onClick={() => setPreview(p => !p)} className="btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}>
                {preview ? 'Hide' : 'Show'}
              </button>
            </div>
            {preview && (
              <pre style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-clean)', borderRadius: '4px', padding: '0.75rem', fontSize: '0.7rem', color: 'var(--text-secondary)', overflowX: 'auto', overflowY: 'auto', maxHeight: '280px', lineHeight: '1.5', whiteSpace: 'pre', margin: 0 }}>
                {generatedXML}
              </pre>
            )}
          </div>

          {/* Install guide */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1rem', color: 'white', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              📋 Installation Guide
            </h3>
            <ol style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.9', margin: 0, paddingLeft: '1.2rem' }}>
              <li>Export the <strong>.soundvariation</strong> file above.</li>
              <li>Copy it to:<br />
                <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.35rem', borderRadius: '3px', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>
                  Documents\PreSonus\Presets\User Presets\Key Switches
                </code>
              </li>
              <li>In Studio One, open the Browser (Home tab).</li>
              <li>Right-click on Presets &gt; <strong>Re-Index Presets</strong>.</li>
              <li>Open any instrument track and click the 🎼 icon to assign the map.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
