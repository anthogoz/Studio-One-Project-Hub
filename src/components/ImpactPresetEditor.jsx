import React, { useEffect, useState, useMemo } from 'react';

const BANK_RANGES = {
  A: { min: 36, max: 51, label: 'Bank A (C1 - D#2)' },
  B: { min: 52, max: 67, label: 'Bank B (E2 - G#3)' },
  C: { min: 68, max: 83, label: 'Bank C (A3 - C#5)' },
  D: { min: 84, max: 99, label: 'Bank D (D5 - F#6)' },
};

function getNoteName(note) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = notes[note % 12];
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
}

export default function ImpactPresetEditor({ parsedData }) {
  const [presets, setPresets] = useState([]);
  const [selectedPresetPath, setSelectedPresetPath] = useState('');
  const [pads, setPads] = useState([]);
  const [selectedPads, setSelectedPads] = useState([]); // list of note numbers
  const [activeBank, setActiveBank] = useState('A');
  
  const [renameValue, setRenameValue] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Missing sample checker status
  const [checkedFilesStatus, setCheckedFilesStatus] = useState({});

  // Auto-map folder state
  const [folderPath, setFolderPath] = useState('');

  // Bank operations state
  const [copyFromBank, setCopyFromBank] = useState('A');
  const [copyToBank, setCopyToBank] = useState('B');
  const [swapBank1, setSwapBank1] = useState('A');
  const [swapBank2, setSwapBank2] = useState('B');
  const [clearTargetBank, setClearTargetBank] = useState('A');

  // 1. Fetch presets list on mount
  const fetchPresets = () => {
    setIsLoading(true);
    setError('');
    fetch('http://localhost:3001/api/impact-presets')
      .then(res => res.json())
      .then(data => {
        setIsLoading(false);
        if (data.presets) {
          setPresets(data.presets);
          if (data.message) {
            setMessage(data.message);
          }
        }
      })
      .catch(err => {
        setIsLoading(false);
        console.error(err);
        setError('Failed to fetch Impact presets list from server.');
      });
  };

  useEffect(() => {
    fetchPresets();
  }, []);

  // Check existence of files
  const checkSamplesExistence = (padsList) => {
    const paths = [];
    padsList.forEach(pad => {
      if (pad.samples && Array.isArray(pad.samples)) {
        pad.samples.forEach(s => {
          if (s && !paths.includes(s)) {
            paths.push(s);
          }
        });
      }
    });

    if (paths.length === 0) return;

    fetch('http://localhost:3001/api/check-files-existence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths })
    })
      .then(res => res.json())
      .then(data => {
        if (data.results) {
          setCheckedFilesStatus(data.results);
        }
      })
      .catch(err => {
        console.error('Error checking files existence:', err);
      });
  };

  // 2. Load selected preset
  const handleLoadPreset = (presetPath) => {
    if (!presetPath) {
      setPads([]);
      setSelectedPads([]);
      setCheckedFilesStatus({});
      return;
    }
    setSelectedPresetPath(presetPath);
    setIsLoading(true);
    setError('');
    setMessage('');

    fetch(`http://localhost:3001/api/load-impact-preset?presetPath=${encodeURIComponent(presetPath)}`)
      .then(res => res.json())
      .then(data => {
        setIsLoading(false);
        if (data.success && data.pads) {
          setPads(data.pads);
          setSelectedPads([]);
          checkSamplesExistence(data.pads);
        } else {
          throw new Error(data.error || 'Failed to load pads.');
        }
      })
      .catch(err => {
        setIsLoading(false);
        console.error(err);
        setError(`Failed to load preset data: ${err.message}`);
      });
  };

  // 3. Save preset
  const handleSavePreset = async () => {
    if (!selectedPresetPath || pads.length === 0) return;
    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('http://localhost:3001/api/save-impact-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetPath: selectedPresetPath,
          pads
        })
      });

      const data = await res.json();
      setIsLoading(false);

      if (data.success) {
        setMessage('Preset saved successfully! Changes written directly to .preset file.');
        checkSamplesExistence(pads);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setIsLoading(false);
      setError(`Failed to save preset: ${err.message}`);
    }
  };

  // Selection toggle
  const handleTogglePadSelection = (note) => {
    if (selectedPads.includes(note)) {
      setSelectedPads(selectedPads.filter(n => n !== note));
    } else {
      setSelectedPads([...selectedPads, note]);
    }
  };

  // Helper to edit pad fields
  const updatePadData = (note, fields) => {
    setPads(prevPads => {
      const exists = prevPads.some(p => p.note === note);
      let updated;
      if (exists) {
        updated = prevPads.map(p => p.note === note ? { ...p, ...fields, isEmptySlot: false } : p);
      } else {
        updated = [...prevPads, {
          note,
          label: '',
          samples: [],
          mute: false,
          solo: false,
          playmode: 1,
          ...fields,
          isEmptySlot: false
        }].sort((a, b) => a.note - b.note);
      }
      return updated;
    });
  };

  // Bulk Actions
  const handleBulkClear = () => {
    if (selectedPads.length === 0) return;
    const updated = pads.map(pad => {
      if (selectedPads.includes(pad.note)) {
        return {
          ...pad,
          label: '',
          samples: [],
          mute: false,
          solo: false
        };
      }
      return pad;
    });
    setPads(updated);
    setSelectedPads([]);
    setMessage(`Cleared ${selectedPads.length} pad(s). Remember to save changes.`);
  };

  const handleBulkRename = (e) => {
    e.preventDefault();
    if (!renameValue.trim() || selectedPads.length === 0) return;
    
    const sortedSelected = [...selectedPads].sort((a, b) => a - b);
    
    const updated = pads.map(pad => {
      if (selectedPads.includes(pad.note)) {
        const index = sortedSelected.indexOf(pad.note) + 1;
        const nameSuffix = selectedPads.length > 1 ? ` ${index}` : '';
        return {
          ...pad,
          label: `${renameValue.trim()}${nameSuffix}`
        };
      }
      return pad;
    });

    setPads(updated);
    setSelectedPads([]);
    setRenameValue('');
    setShowRenameModal(false);
    setMessage('Pads renamed successfully. Remember to save changes.');
  };

  // Bank Actions
  const handleCopyBank = () => {
    if (copyFromBank === copyToBank) {
      setError('Source and destination banks must be different.');
      return;
    }
    const fromRange = BANK_RANGES[copyFromBank];
    const toRange = BANK_RANGES[copyToBank];
    
    let updatedPads = [...pads];
    
    for (let i = 0; i < 16; i++) {
      const fromNote = fromRange.min + i;
      const toNote = toRange.min + i;
      
      const sourcePad = pads.find(p => p.note === fromNote);
      const destIdx = updatedPads.findIndex(p => p.note === toNote);
      
      if (sourcePad) {
        const copiedPad = {
          ...sourcePad,
          note: toNote,
          isEmptySlot: false
        };
        if (destIdx !== -1) {
          updatedPads[destIdx] = copiedPad;
        } else {
          updatedPads.push(copiedPad);
        }
      } else {
        if (destIdx !== -1) {
          updatedPads.splice(destIdx, 1);
        }
      }
    }
    
    setPads(updatedPads.sort((a, b) => a.note - b.note));
    setMessage(`Successfully copied Bank ${copyFromBank} to Bank ${copyToBank}.`);
  };

  const handleSwapBank = () => {
    if (swapBank1 === swapBank2) {
      setError('Please choose two different banks to swap.');
      return;
    }
    const r1 = BANK_RANGES[swapBank1];
    const r2 = BANK_RANGES[swapBank2];
    
    let updatedPads = [...pads];
    
    for (let i = 0; i < 16; i++) {
      const n1 = r1.min + i;
      const n2 = r2.min + i;
      
      const p1 = pads.find(p => p.note === n1);
      const p2 = pads.find(p => p.note === n2);
      
      const idx1 = updatedPads.findIndex(p => p.note === n1);
      if (idx1 !== -1) updatedPads.splice(idx1, 1);
      
      const idx2 = updatedPads.findIndex(p => p.note === n2);
      if (idx2 !== -1) updatedPads.splice(idx2, 1);
      
      if (p1) {
        updatedPads.push({ ...p1, note: n2 });
      }
      if (p2) {
        updatedPads.push({ ...p2, note: n1 });
      }
    }
    
    setPads(updatedPads.sort((a, b) => a.note - b.note));
    setMessage(`Successfully swapped Bank ${swapBank1} and Bank ${swapBank2}.`);
  };

  const handleClearBank = () => {
    const range = BANK_RANGES[clearTargetBank];
    const updatedPads = pads.filter(p => p.note < range.min || p.note > range.max);
    setPads(updatedPads);
    setMessage(`Cleared all pads in Bank ${clearTargetBank}.`);
  };

  // Auto Map folder logic
  const handleAutoMapDirectory = async () => {
    if (!folderPath.trim()) return;
    setIsLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`http://localhost:3001/api/browse-files?dir=${encodeURIComponent(folderPath.trim())}`);
      const data = await res.json();
      setIsLoading(false);
      if (data.error) {
        throw new Error(data.error);
      }
      if (!data.files || data.files.length === 0) {
        throw new Error('No audio files found in the specified directory.');
      }
      
      // Sort alphabetically
      const audioFiles = data.files
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      const range = BANK_RANGES[activeBank];
      let mappedCount = 0;
      const updatedPads = [...pads];

      for (let i = 0; i < 16; i++) {
        const note = range.min + i;
        if (i < audioFiles.length) {
          const file = audioFiles[i];
          const padIdx = updatedPads.findIndex(p => p.note === note);
          
          const newPadData = {
            note,
            label: file.name.replace(/\.[^/.]+$/, ""), // strip extension
            samples: [file.path],
            mute: false,
            solo: false,
            playmode: 1
          };

          if (padIdx !== -1) {
            updatedPads[padIdx] = newPadData;
          } else {
            updatedPads.push(newPadData);
          }
          mappedCount++;
        }
      }

      setPads(updatedPads.sort((a, b) => a.note - b.note));
      setMessage(`Successfully mapped ${mappedCount} samples to Bank ${activeBank}.`);
      checkSamplesExistence(updatedPads);
    } catch (err) {
      setIsLoading(false);
      setError(`Auto-mapping failed: ${err.message}`);
    }
  };

  // Get pads for the active bank (fill in empty spots to render a full 16-pad grid)
  const bankPads = useMemo(() => {
    const range = BANK_RANGES[activeBank];
    const grid = [];
    
    for (let note = range.max; note >= range.min; note--) {
      const existing = pads.find(p => p.note === note);
      grid.push(existing || {
        note,
        label: '',
        samples: [],
        mute: false,
        solo: false,
        playmode: 1,
        isEmptySlot: true
      });
    }
    return grid;
  }, [pads, activeBank]);

  // Active single selected pad details
  const isSingleSelected = selectedPads.length === 1;
  const activeNote = isSingleSelected ? selectedPads[0] : null;
  const activePad = useMemo(() => {
    if (!activeNote) return null;
    return pads.find(p => p.note === activeNote) || {
      note: activeNote,
      label: '',
      samples: [],
      mute: false,
      solo: false,
      playmode: 1,
      isEmptySlot: true
    };
  }, [pads, activeNote]);

  const getSampleFilename = (samples) => {
    if (!samples || samples.length === 0) return 'Empty';
    return samples.map(s => s.split(/[/\\]/).pop()).join(', ');
  };

  // Count missing files in total
  const missingSamplesCount = useMemo(() => {
    let count = 0;
    pads.forEach(pad => {
      pad.samples?.forEach(s => {
        if (checkedFilesStatus[s] === false) {
          count++;
        }
      });
    });
    return count;
  }, [pads, checkedFilesStatus]);

  return (
    <div style={{ maxWidth: '1200px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header Card */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="glass-card-header">🥁 Impact XT Preset & Kit Editor</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1rem 0', lineHeight: '1.6' }}>
              Advanced management system for Studio One Impact XT presets. Load a kit to inspect samples, edit individual pad parameters (Mute/Solo, Trigger Modes, Layer Assignments), auto-map sound directories, and copy banks.
            </p>
          </div>
          
          <button className="btn-primary" onClick={handleSavePreset} disabled={isLoading || !selectedPresetPath} style={{ minWidth: '160px' }}>
            {isLoading ? 'Saving Preset...' : '💾 Save Preset'}
          </button>
        </div>

        {/* Preset Selector & Global Check */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginTop: '1.5rem', background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-clean)' }}>
          <div style={{ flex: '2 1 300px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
              Loaded Kit Preset
            </label>
            <select
              value={selectedPresetPath}
              onChange={(e) => handleLoadPreset(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-clean)', background: 'var(--bg-primary)', color: 'white', outline: 'none', fontSize: '0.95rem' }}
            >
              <option value="">-- Choose an Impact preset from your user library --</option>
              {presets.map((p, i) => (
                <option key={i} value={p.path}>
                  {p.relPath}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-secondary" onClick={fetchPresets} style={{ height: '42px', padding: '0 1rem' }}>
              🔄 Refresh List
            </button>
            {pads.length > 0 && (
              <button className="btn-secondary" onClick={() => checkSamplesExistence(pads)} style={{ height: '42px', padding: '0 1rem' }}>
                🔍 Verify Mapped Files
              </button>
            )}
          </div>

          {pads.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {missingSamplesCount > 0 ? (
                <span style={{ color: 'var(--accent-pink)', fontSize: '0.85rem', fontWeight: 'bold', background: 'rgba(255,0,127,0.1)', padding: '0.4rem 0.8rem', borderRadius: '4px', border: '1px solid var(--accent-pink)' }}>
                  ⚠️ {missingSamplesCount} Missing Sample(s)
                </span>
              ) : (
                <span style={{ color: 'var(--accent-cyan)', fontSize: '0.85rem', fontWeight: 'bold', background: 'rgba(0,242,254,0.1)', padding: '0.4rem 0.8rem', borderRadius: '4px', border: '1px solid var(--accent-cyan)' }}>
                  ✓ All Mapped Samples Mapped & Verified
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {pads.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem', alignItems: 'start' }}>
          
          {/* LEFT PANEL: 16-Pad Grid view */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', color: 'white', margin: 0 }}>
                  Drum Pads Grid
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Click to select. Ctrl/Shift selection is simulated by multiple clicks.
                </span>
              </div>
              
              {/* Bank Selector Buttons */}
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {Object.keys(BANK_RANGES).map(bank => (
                  <button
                    key={bank}
                    onClick={() => {
                      setActiveBank(bank);
                      setSelectedPads([]); // clear selection when switching banks
                    }}
                    style={{
                      background: activeBank === bank ? 'white' : 'transparent',
                      color: activeBank === bank ? 'black' : 'var(--text-secondary)',
                      border: activeBank === bank ? '1px solid white' : '1px solid var(--border-clean)',
                      padding: '0.3rem 0.8rem',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.1s ease'
                    }}
                  >
                    {bank}
                  </button>
                ))}
              </div>
            </div>

            {/* 4x4 Grid Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', width: '100%', marginBottom: '1.5rem' }}>
              {bankPads.map((pad) => {
                const isSelected = selectedPads.includes(pad.note);
                const hasSample = pad.samples && pad.samples.length > 0;
                
                // Check if any sample on this pad is missing
                const hasMissingSample = pad.samples?.some(s => checkedFilesStatus[s] === false);

                return (
                  <div
                    key={pad.note}
                    onClick={() => handleTogglePadSelection(pad.note)}
                    style={{
                      background: isSelected 
                        ? 'rgba(168, 85, 247, 0.25)' 
                        : hasMissingSample
                          ? 'rgba(239, 68, 68, 0.08)'
                          : hasSample 
                            ? 'rgba(255, 255, 255, 0.03)' 
                            : 'rgba(0, 0, 0, 0.2)',
                      border: isSelected 
                        ? '2px solid #a855f7' 
                        : hasMissingSample
                          ? '1px dashed #ef4444'
                          : hasSample 
                            ? '1px solid rgba(255,255,255,0.1)' 
                            : '1px solid var(--border-clean)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      height: '110px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      transition: 'all 0.15s ease',
                      opacity: pad.isEmptySlot ? 0.45 : 1
                    }}
                  >
                    {/* Note Tag / Info */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '0.7rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 600 }}>{getNoteName(pad.note)}</span>
                      {hasMissingSample && <span style={{ color: '#ef4444', fontWeight: 'bold' }}>MISSING</span>}
                      {!hasMissingSample && hasSample && <span style={{ color: 'var(--accent-cyan)', fontSize: '0.65rem', fontWeight: 'bold' }}>{pad.samples.length} Lyr</span>}
                    </div>

                    {/* Pad Label */}
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: isSelected ? 'white' : pad.label ? 'white' : 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%', textAlign: 'center', margin: '0.3rem 0' }}>
                      {pad.label || 'Unnamed Pad'}
                    </div>

                    {/* Sample Name snippet */}
                    <div style={{ fontSize: '0.65rem', color: hasMissingSample ? '#ef4444' : 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%', textAlign: 'left' }} title={getSampleFilename(pad.samples)}>
                      {getSampleFilename(pad.samples)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Clear Selection Button */}
            {selectedPads.length > 0 && (
              <button className="btn-secondary" onClick={() => setSelectedPads([])} style={{ alignSelf: 'flex-start', fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}>
                Clear Selection
              </button>
            )}
          </div>

          {/* RIGHT PANEL: Inspector (Single Selection) or Bulk Panel (Multiple Selection) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* 1. SINGLE PAD INSPECTOR */}
            {isSingleSelected && activePad && (
              <div className="glass-card" style={{ borderLeft: '3px solid #a855f7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'white', margin: 0 }}>
                    Pad Inspector: <strong style={{ color: '#c084fc' }}>{getNoteName(activePad.note)}</strong>
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Note #{activePad.note}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  {/* Label Text Input */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>Pad Name / Label</label>
                    <input
                      type="text"
                      value={activePad.label || ''}
                      onChange={(e) => updatePadData(activePad.note, { label: e.target.value })}
                      placeholder="e.g. Kick 1, Snare Drum..."
                      style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary)', border: '1px solid var(--border-clean)', borderRadius: '4px', color: 'white', outline: 'none' }}
                    />
                  </div>

                  {/* Play Mode & Mute/Solo Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>Trigger Mode</label>
                      <select
                        value={activePad.playmode || 1}
                        onChange={(e) => updatePadData(activePad.note, { playmode: parseInt(e.target.value, 10) })}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-clean)', borderRadius: '4px', color: 'white', outline: 'none' }}
                      >
                        <option value={1}>One-Shot (Full sample plays)</option>
                        <option value={2}>Loop (Repeats until released)</option>
                        <option value={3}>Gate (Plays while note held)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>Status States</label>
                      <div style={{ display: 'flex', gap: '0.5rem', height: '36px' }}>
                        <button
                          onClick={() => updatePadData(activePad.note, { mute: !activePad.mute })}
                          style={{
                            flex: 1,
                            borderRadius: '4px',
                            border: activePad.mute ? '1px solid #ef4444' : '1px solid var(--border-clean)',
                            background: activePad.mute ? 'rgba(239,68,68,0.2)' : 'transparent',
                            color: activePad.mute ? '#ef4444' : 'var(--text-secondary)',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          Mute
                        </button>
                        <button
                          onClick={() => updatePadData(activePad.note, { solo: !activePad.solo })}
                          style={{
                            flex: 1,
                            borderRadius: '4px',
                            border: activePad.solo ? '1px solid #fbbf24' : '1px solid var(--border-clean)',
                            background: activePad.solo ? 'rgba(251,191,36,0.2)' : 'transparent',
                            color: activePad.solo ? '#fbbf24' : 'var(--text-secondary)',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          Solo
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sample Mappings Layers Manager */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                      Sample Layers Mapped ({activePad.samples?.length || 0})
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {activePad.samples?.map((samplePath, idx) => {
                        const exists = checkedFilesStatus[samplePath] !== false;
                        return (
                          <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-clean)', borderRadius: '6px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Layer #{idx + 1}</span>
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                <span style={{
                                  fontSize: '0.65rem',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '3px',
                                  background: exists ? 'rgba(0,242,254,0.1)' : 'rgba(239,68,68,0.1)',
                                  color: exists ? 'var(--accent-cyan)' : '#ef4444',
                                  fontWeight: 'bold'
                                }}>
                                  {exists ? 'Verified' : 'Missing'}
                                </span>
                                <button
                                  onClick={() => {
                                    const updatedSamples = activePad.samples.filter((_, sIdx) => sIdx !== idx);
                                    updatePadData(activePad.note, { samples: updatedSamples });
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            
                            {/* File Path Editor */}
                            <input
                              type="text"
                              value={samplePath}
                              onChange={(e) => {
                                const newSamples = [...activePad.samples];
                                newSamples[idx] = e.target.value;
                                updatePadData(activePad.note, { samples: newSamples });
                              }}
                              style={{ width: '100%', padding: '0.4rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', color: 'white', fontSize: '0.75rem', fontFamily: 'monospace' }}
                            />
                          </div>
                        );
                      })}
                      
                      {(!activePad.samples || activePad.samples.length === 0) && (
                        <div style={{ textAlign: 'center', padding: '1rem', border: '1px dashed var(--border-clean)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          No samples loaded. Pad will trigger no sound.
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          const updatedSamples = [...(activePad.samples || []), ''];
                          updatePadData(activePad.note, { samples: updatedSamples });
                        }}
                        style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem' }}
                      >
                        ➕ Add Blank Layer
                      </button>
                    </div>
                  </div>

                  {/* QUICK ASSIGN FROM ACTIVE PROJECT MEDIA POOL */}
                  {parsedData?.audioClips && parsedData.audioClips.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border-clean)', paddingTop: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>
                        Quick-Assign Sample from Song Clips
                      </label>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            const newSamples = [...(activePad.samples || []), e.target.value];
                            updatePadData(activePad.note, {
                              samples: newSamples,
                              label: activePad.label || e.target.selectedOptions[0].text.replace(/\.[^/.]+$/, "")
                            });
                            e.target.value = ''; // reset dropdown
                          }
                        }}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-primary)', border: '1px solid var(--border-clean)', borderRadius: '4px', color: 'white', outline: 'none', fontSize: '0.85rem' }}
                      >
                        <option value="">-- Choose a clip from current song Media Pool --</option>
                        {parsedData.audioClips.map((clip, idx) => (
                          <option key={idx} value={clip.url}>
                            {clip.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* 2. BULK ACTIONS (MULTIPLE SELECTIONS) */}
            {!isSingleSelected && selectedPads.length > 1 && (
              <div className="glass-card">
                <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1.2rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
                  Bulk Actions ({selectedPads.length} Pads Selected)
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => setShowRenameModal(true)}
                      style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                    >
                      ✏️ Rename Selected
                    </button>
                    <button
                      className="btn-danger"
                      onClick={handleBulkClear}
                      style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                    >
                      🗑️ Clear Selected
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. AUTO-MAP DIRECTORY CARD */}
            <div className="glass-card">
              <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
                📁 Auto-Map Directory to Bank
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.4' }}>
                Input an absolute folder path on your computer. All audio files in that folder will be mapped to the current active bank (16 pads) sorted alphabetically.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <input
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="e.g. D:\Samples\DrumKit\Wavs"
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary)', border: '1px solid var(--border-clean)', borderRadius: '4px', color: 'white', outline: 'none', fontSize: '0.85rem' }}
                />
                
                <button
                  className="btn-secondary"
                  onClick={handleAutoMapDirectory}
                  disabled={!folderPath.trim() || isLoading}
                  style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                >
                  🚀 Auto-Map Files to Bank {activeBank}
                </button>
              </div>
            </div>

            {/* 4. ADVANCED BANK UTILITIES */}
            <div className="glass-card">
              <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
                ⚙️ Bank Layout Utilities
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontSize: '0.85rem' }}>
                
                {/* Copy bank */}
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
                  <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Copy Bank Layout</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span>From</span>
                    <select value={copyFromBank} onChange={(e) => setCopyFromBank(e.target.value)} style={{ padding: '0.25rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)' }}>
                      {['A','B','C','D'].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <span>to</span>
                    <select value={copyToBank} onChange={(e) => setCopyToBank(e.target.value)} style={{ padding: '0.25rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)' }}>
                      {['A','B','C','D'].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <button className="btn-secondary" onClick={handleCopyBank} style={{ marginLeft: 'auto', padding: '0.25rem 0.75rem' }}>Apply</button>
                  </div>
                </div>

                {/* Swap banks */}
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
                  <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Swap Banks</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span>Swap Bank</span>
                    <select value={swapBank1} onChange={(e) => setSwapBank1(e.target.value)} style={{ padding: '0.25rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)' }}>
                      {['A','B','C','D'].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <span>with</span>
                    <select value={swapBank2} onChange={(e) => setSwapBank2(e.target.value)} style={{ padding: '0.25rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)' }}>
                      {['A','B','C','D'].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <button className="btn-secondary" onClick={handleSwapBank} style={{ marginLeft: 'auto', padding: '0.25rem 0.75rem' }}>Swap</button>
                  </div>
                </div>

                {/* Clear bank */}
                <div>
                  <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)' }}>Clear Bank</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span>Clear Bank</span>
                    <select value={clearTargetBank} onChange={(e) => setClearTargetBank(e.target.value)} style={{ padding: '0.25rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)' }}>
                      {['A','B','C','D'].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <button className="btn-danger" onClick={handleClearBank} style={{ marginLeft: 'auto', padding: '0.25rem 0.75rem' }}>Clear All</button>
                  </div>
                </div>

              </div>
            </div>

            {/* MESSAGE / ERROR LOG */}
            {(message || error) && (
              <div className="glass-card">
                {message && (
                  <div style={{ background: 'rgba(0, 242, 254, 0.1)', border: '1px solid var(--accent-cyan)', padding: '0.75rem', borderRadius: '6px', color: 'var(--accent-cyan)', fontSize: '0.8rem', lineHeight: '1.4' }}>
                    {message}
                  </div>
                )}
                {error && (
                  <div style={{ background: 'rgba(255, 0, 127, 0.1)', border: '1px solid var(--accent-pink)', padding: '0.75rem', borderRadius: '6px', color: 'var(--accent-pink)', fontSize: '0.8rem' }}>
                    {error}
                  </div>
                )}
              </div>
            )}

          </div>
          
        </div>
      )}

      {/* RENAME DIALOG MODAL (For Bulk selection) */}
      {showRenameModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '400px' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: 'white' }}>✏️ Bulk Rename Selected Pads</h4>
            <form onSubmit={handleBulkRename}>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="e.g. Perc, Tom, Bass..."
                autoFocus
                style={{
                  width: '100%', padding: '0.6rem', marginBottom: '1.5rem',
                  background: 'var(--bg-primary)', color: 'white',
                  border: '1px solid var(--border-clean)', borderRadius: '4px',
                  outline: 'none', fontSize: '0.95rem'
                }}
              />
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowRenameModal(false);
                    setRenameValue('');
                  }}
                  style={{ padding: '0.4rem 1rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: '0.4rem 1rem' }}
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
