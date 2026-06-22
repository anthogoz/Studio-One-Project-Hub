import React, { useState, useEffect } from 'react';

const DEFAULT_RULES = [
  { pattern: 'kick', color: '#ef4444' },
  { pattern: 'snare', color: '#f97316' },
  { pattern: 'clap', color: '#f97316' },
  { pattern: 'hat', color: '#eab308' },
  { pattern: 'perc', color: '#eab308' },
  { pattern: 'shaker', color: '#eab308' },
  { pattern: 'bass', color: '#a855f7' },
  { pattern: '808', color: '#a855f7' },
  { pattern: 'sub', color: '#a855f7' },
  { pattern: 'vocal', color: '#3b82f6' },
  { pattern: 'vox', color: '#3b82f6' },
  { pattern: 'lead', color: '#3b82f6' },
  { pattern: 'synth', color: '#10b981' },
  { pattern: 'pad', color: '#10b981' },
  { pattern: 'key', color: '#10b981' },
  { pattern: 'piano', color: '#10b981' },
  { pattern: 'guitar', color: '#10b981' },
  { pattern: 'melody', color: '#10b981' },
  { pattern: 'bus', color: '#06b6d4' },
  { pattern: 'group', color: '#06b6d4' },
  { pattern: 'fx', color: '#6b7280' },
  { pattern: 'reverb', color: '#6b7280' },
  { pattern: 'delay', color: '#6b7280' }
];

export default function SessionColorizer({ parsedData, songPath, onReloadProject }) {
  const [rules, setRules] = useState(() => {
    const saved = localStorage.getItem('s1_colorizer_rules');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load rules from localStorage', e);
      }
    }
    return DEFAULT_RULES;
  });
  const [newPattern, setNewPattern] = useState('');
  const [newColor, setNewColor] = useState('#ef4444');
  const [isApplying, setIsApplying] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const tracks = parsedData?.tracks || [];

  // Persist rules to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('s1_colorizer_rules', JSON.stringify(rules));
  }, [rules]);

  // Helper to match a track name to a rule and get its preview color
  const getPreviewColor = (trackName, currentTrackColor) => {
    const matchedRule = rules.find(r => {
      const pat = r.pattern.toLowerCase().trim();
      return pat && trackName.toLowerCase().includes(pat);
    });
    return matchedRule ? matchedRule.color : currentTrackColor;
  };

  const handleAddRule = () => {
    if (!newPattern.trim()) return;
    setRules([...rules, { pattern: newPattern.trim(), color: newColor }]);
    setNewPattern('');
  };

  const handleRemoveRule = (index) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleUpdateRuleColor = (index, color) => {
    const updated = [...rules];
    updated[index].color = color;
    setRules(updated);
  };

  const handleUpdateRulePattern = (index, newPat) => {
    const updated = [...rules];
    updated[index].pattern = newPat;
    setRules(updated);
  };

  const handleAddRuleFromTrack = (trackName, trackColor) => {
    if (!trackName) return;
    const cleanName = trackName.toLowerCase().trim();
    if (rules.some(r => r.pattern.toLowerCase().trim() === cleanName)) {
      return; // Already exists
    }
    const colorToUse = trackColor && trackColor !== 'rgba(255,255,255,0.1)' ? trackColor : newColor;
    setRules([...rules, { pattern: cleanName, color: colorToUse }]);
  };

  const handleResetDefaults = () => {
    setRules(DEFAULT_RULES);
  };

  const handleClearRules = () => {
    setRules([]);
  };

  const handleApplyColors = () => {
    setIsApplying(true);
    setStatus({ type: '', message: '' });

    fetch('http://localhost:3001/api/recolor-tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songPath, rules })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to recolor tracks.');
        return res.json();
      })
      .then(data => {
        setIsApplying(false);
        setStatus({ type: 'success', message: 'Project recolored successfully! Reloading project data...' });
        setTimeout(() => {
          onReloadProject();
        }, 1500);
      })
      .catch(err => {
        setIsApplying(false);
        setStatus({ type: 'error', message: err.message });
      });
  };

  // Convert S1 color (which could be ABGR/RGBA hex string like "ffea3939" or index) to standard display color
  const formatS1Color = (colStr) => {
    if (!colStr || colStr === 'N/A') return 'rgba(255,255,255,0.1)';
    if (colStr.startsWith('ff') && colStr.length === 8) {
      return '#' + colStr.substring(2);
    }
    if (colStr.length === 6) {
      return '#' + colStr;
    }
    return colStr.startsWith('#') ? colStr : '#' + colStr;
  };

  const PRESET_COLORS = [
    '#ef4444', // Red
    '#f97316', // Orange
    '#f59e0b', // Amber
    '#eab308', // Yellow
    '#10b981', // Green
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#6366f1', // Indigo
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#6b7280', // Gray
    '#ffffff'  // White
  ];

  return (
    <div className="glass-card">
      <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>🎨 Session Auto-Colorizer</span>
        <div>
          <button className="btn-secondary" onClick={handleResetDefaults} style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem', marginRight: '0.5rem' }}>
            Reset Defaults
          </button>
          <button className="btn-secondary" onClick={handleClearRules} style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem', color: '#ef4444' }}>
            Clear All
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Define rules based on track name keywords to automatically colorize your entire project. The colorizer updates both your timeline tracks and your mixer console tracks.
      </p>

      {status.message && (
        <div style={{
          padding: '0.9rem 1.25rem', borderRadius: '8px', color: 'white', marginBottom: '2rem',
          background: status.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: status.type === 'success' ? '1px solid #10b981' : '1px solid #ef4444',
          fontSize: '0.88rem'
        }}>
          {status.type === 'success' ? '✅' : '⚠️'} {status.message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
        {/* Left Side: Rule Builder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h4 style={{ color: 'white', marginBottom: '1rem' }}>Define Keywords & Colors</h4>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <input
                type="text"
                value={newPattern}
                onChange={e => setNewPattern(e.target.value)}
                placeholder="e.g. kick, snare, lead vox"
                style={{
                  flex: 1, padding: '0.6rem 0.9rem',
                  borderRadius: 6, border: '1px solid var(--border-focus)',
                  background: 'rgba(0,0,0,0.3)', color: 'white',
                  outline: 'none', fontSize: '0.85rem'
                }}
              />
              <input
                type="color"
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
                style={{
                  width: '42px', height: '38px', padding: '2px', border: '1px solid var(--border-clean)',
                  background: 'transparent', borderRadius: '6px', cursor: 'pointer'
                }}
              />
              <button className="btn-secondary" onClick={handleAddRule} style={{ padding: '0.6rem 1.1rem', fontSize: '0.85rem' }}>
                Add Rule
              </button>
            </div>

            {/* Color Presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginRight: '0.25rem' }}>Quick presets:</span>
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setNewColor(color)}
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: color,
                    border: newColor === color ? '2px solid white' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    transform: newColor === color ? 'scale(1.15)' : 'none',
                    transition: 'all 0.15s ease',
                    boxShadow: newColor === color ? `0 0 8px ${color}` : 'none'
                  }}
                  title={color}
                />
              ))}
            </div>

            {/* Rules list */}
            <div style={{
              maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--border-clean)',
              borderRadius: '6px', background: 'rgba(0,0,0,0.1)'
            }}>
              {rules.length === 0 ? (
                <p style={{ padding: '1.5rem', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
                  No coloration rules defined. Add a rule above or click 'Reset Defaults'.
                </p>
              ) : (
                rules.map((rule, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.5rem 0.75rem', borderBottom: idx === rules.length - 1 ? 'none' : '1px solid var(--border-clean)'
                  }}>
                    <input
                      type="color"
                      value={rule.color}
                      onChange={e => handleUpdateRuleColor(idx, e.target.value)}
                      style={{
                        width: '24px', height: '24px', padding: '0', border: 'none',
                        background: 'transparent', cursor: 'pointer', borderRadius: '4px'
                      }}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>contains</span>
                    <input
                      type="text"
                      value={rule.pattern}
                      onChange={e => handleUpdateRulePattern(idx, e.target.value)}
                      style={{
                        flex: 1,
                        padding: '0.3rem 0.6rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-clean)',
                        background: 'rgba(0,0,0,0.2)',
                        color: 'white',
                        fontSize: '0.85rem',
                        outline: 'none',
                        transition: 'border-color 0.15s ease'
                      }}
                    />
                    <button
                      onClick={() => handleRemoveRule(idx)}
                      style={{
                        background: 'transparent', border: 'none', color: 'var(--text-muted)',
                        cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem 0.5rem'
                      }}
                      onMouseEnter={e => e.target.style.color = '#ef4444'}
                      onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            className="btn-secondary"
            onClick={handleApplyColors}
            disabled={isApplying || tracks.length === 0}
            style={{
              padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600,
              background: 'white', color: 'black', width: '100%',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem'
            }}
          >
            {isApplying ? 'Applying Coloration...' : '🚀 Apply Colors to Studio One Project'}
          </button>
        </div>

        {/* Right Side: Preview */}
        <div>
          <h4 style={{ color: 'white', marginBottom: '1rem' }}>Track List Color Preview</h4>
          <div style={{
            maxHeight: '520px', overflowY: 'auto', border: '1px solid var(--border-clean)',
            borderRadius: '6px', padding: '0.75rem', background: 'rgba(0,0,0,0.1)'
          }}>
            {tracks.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                No tracks in this project to preview.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {tracks.map((t, idx) => {
                  const currentFormatted = formatS1Color(t.color);
                  const previewColor = getPreviewColor(t.name, currentFormatted);
                  const isModified = previewColor !== currentFormatted;
                  const hasExactRule = rules.some(r => r.pattern.toLowerCase().trim() === t.name.toLowerCase().trim());

                  return (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem', borderRadius: '4px', background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-clean)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                        {/* Current color circle */}
                        <div style={{
                          width: '14px', height: '14px', borderRadius: '50%',
                          background: currentFormatted, flexShrink: 0
                        }} title="Current color" />
                        <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          ({t.type})
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {isModified && (
                          <span style={{ fontSize: '0.65rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>
                            WILL CHANGE
                          </span>
                        )}
                        {!hasExactRule && (
                          <button
                            onClick={() => handleAddRuleFromTrack(t.name, currentFormatted)}
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid var(--border-clean)',
                              color: 'var(--text-secondary)',
                              fontSize: '0.72rem',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => {
                              e.target.style.background = 'rgba(255,255,255,0.1)';
                              e.target.style.color = 'white';
                            }}
                            onMouseLeave={e => {
                              e.target.style.background = 'rgba(255,255,255,0.05)';
                              e.target.style.color = 'var(--text-secondary)';
                            }}
                          >
                            ➕ Colorize
                          </button>
                        )}
                        {/* Preview color square */}
                        <div style={{
                          width: '28px', height: '18px', borderRadius: '4px',
                          background: previewColor, border: '1px solid rgba(255,255,255,0.2)'
                        }} title="Preview color" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
