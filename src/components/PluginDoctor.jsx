import React, { useState, useEffect, useMemo } from 'react';

export default function PluginDoctor({ parsedData, songPath }) {
  const [workspacePlugins, setWorkspacePlugins] = useState([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [rules, setRules] = useState([]);
  const [selectedPlugin, setSelectedPlugin] = useState('');
  const [targetClassID, setTargetClassID] = useState('');
  const [targetName, setTargetName] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch workspace plugins on mount
  useEffect(() => {
    setIsLoadingWorkspace(true);
    fetch('http://localhost:3001/api/workspace-audit')
      .then(res => res.json())
      .then(data => {
        setIsLoadingWorkspace(false);
        if (data.workspacePlugins) {
          setWorkspacePlugins(data.workspacePlugins);
        }
      })
      .catch(err => {
        setIsLoadingWorkspace(false);
        console.error("Error loading workspace plugins database:", err);
      });
  }, []);

  // 2. Gather all unique plugins from active project mixer channels
  const uniquePlugins = useMemo(() => {
    if (!parsedData || !parsedData.channels) return [];
    
    const map = new Map();
    const stockList = new Set([
      "Pro EQ", "Pro EQ³", "Compressor", "Limiter", "Binaural Pan", "Beat Delay", 
      "Analog Delay", "Room Reverb", "MixVerb", "RedLightDist", "Ampire", "Pedalboard", 
      "Autofilter", "Chorus", "Flanger", "Phaser", "Tremolo", "X-Trem", "Rotary", 
      "Gate", "Expander", "Limiter2", "Fat Channel", "Pipeline", "Scope", 
      "Spectrum Meter", "Tuner", "Level Meter", "Dual Pan", "Splitter", "Console Shaper", 
      "CTC-1", "PortaCassette", "Vocoder", "Open AIR", "Empire", "Tone Generator", 
      "Input Delay", "Phase Meter", "IR Maker", "VU Meter"
    ]);

    parsedData.channels.forEach(chan => {
      if (chan.inserts && Array.isArray(chan.inserts)) {
        chan.inserts.forEach(plug => {
          if (!plug.classID) return;
          const key = `${plug.classID}_${plug.name}`;
          
          if (!map.has(key)) {
            let format = 'VST3';
            if (stockList.has(plug.name)) {
              format = 'Stock';
            } else if (plug.classID.startsWith('{565354')) {
              format = 'VST2';
            }

            map.set(key, {
              classID: plug.classID,
              name: plug.name,
              format,
              count: 0,
              channelsUsed: []
            });
          }
          
          const entry = map.get(key);
          entry.count++;
          if (!entry.channelsUsed.includes(chan.label)) {
            entry.channelsUsed.push(chan.label);
          }
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [parsedData]);

  // Statistics
  const stats = useMemo(() => {
    let vst2 = 0;
    let vst3 = 0;
    let stock = 0;
    uniquePlugins.forEach(p => {
      if (p.format === 'VST2') vst2++;
      else if (p.format === 'VST3') vst3++;
      else stock++;
    });
    return { total: uniquePlugins.length, vst2, vst3, stock };
  }, [uniquePlugins]);

  // Fuzzy matching suggestions from workspace
  const getWorkspaceSuggestions = (sourceName, sourceClassID) => {
    if (!sourceName) return [];
    
    // Clean strings (remove x64 suffixes and special symbols)
    const clean = (name) => name
      .toLowerCase()
      .replace(/_x64|x64|\.64|_vst|vst/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .trim();
      
    const cleanSrc = clean(sourceName);
    
    return workspacePlugins.filter(p => {
      // Must not match the exact classID already in the project
      if (p.classID === sourceClassID) return false;
      
      const cleanDest = clean(p.name);
      // Suggester returns a match if names overlap significantly
      return cleanDest.includes(cleanSrc) || cleanSrc.includes(cleanDest);
    });
  };

  const suggestions = useMemo(() => {
    if (!selectedPlugin) return [];
    const srcPlugin = uniquePlugins.find(p => p.classID === selectedPlugin);
    if (!srcPlugin) return [];
    return getWorkspaceSuggestions(srcPlugin.name, srcPlugin.classID);
  }, [selectedPlugin, uniquePlugins, workspacePlugins]);

  // Real-time search in workspace database
  const filteredWorkspacePlugins = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return workspacePlugins.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.classID.toLowerCase().includes(q)
    ).slice(0, 8); // limit results
  }, [searchQuery, workspacePlugins]);

  // Preset Mapping Suggestion
  const handleSuggest = (plugin) => {
    setSelectedPlugin(plugin.classID);
    setTargetName(plugin.name.replace('_x64', '').replace('.64', ''));
    
    // Auto populate VST3 classID mapping suggestions if known (hardcoded safety fallback)
    if (plugin.name.includes('Auto-Tune')) {
      setTargetClassID('{56535455-4154-5220-4175-746F2D54756E}'); 
    } else if (plugin.name.includes('Valhalla')) {
      setTargetClassID('{56535456-5668-3061-6C68-616C6C617665}'); 
    } else if (plugin.name.includes('Nectar')) {
      setTargetClassID('{5653544E-6374-344E-6563-746172203400}'); 
    } else {
      setTargetClassID('');
    }
  };

  const handleAddRule = (e) => {
    e.preventDefault();
    if (!selectedPlugin || !targetClassID.trim() || !targetName.trim()) {
      setError('Please select a plugin and fill out target classID and name.');
      return;
    }

    const sourcePlugin = uniquePlugins.find(p => p.classID === selectedPlugin);
    if (!sourcePlugin) return;

    // Check if rule already exists
    if (rules.some(r => r.sourceClassID === selectedPlugin)) {
      setError('A mapping rule already exists for this plugin.');
      return;
    }

    const newRule = {
      sourceClassID: sourcePlugin.classID,
      sourceName: sourcePlugin.name,
      targetClassID: targetClassID.trim(),
      targetName: targetName.trim(),
      sourceFormat: sourcePlugin.format
    };

    setRules([...rules, newRule]);
    setSelectedPlugin('');
    setTargetClassID('');
    setTargetName('');
    setError('');
    setSearchQuery('');
    setMessage('Mapping rule added.');
  };

  const handleRemoveRule = (index) => {
    const updated = [...rules];
    updated.splice(index, 1);
    setRules(updated);
    setMessage('Rule removed.');
  };

  const handleApplyMapping = async () => {
    if (rules.length === 0) {
      setError('Add at least one mapping rule before applying.');
      return;
    }

    setIsApplying(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('http://localhost:3001/api/remap-plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songPath,
          rules
        })
      });

      const data = await res.json();
      setIsApplying(false);

      if (data.success) {
        setMessage(`Success! Plugins mapped successfully. Project file updated on disk. A backup has been saved in the project History folder: "${data.backupName}"`);
        setRules([]);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setIsApplying(false);
      console.error(err);
      setError(`Mapping failed: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Overview Card */}
      <div className="glass-card">
        <h2 className="glass-card-header">📁 VST Plugin Doctor & Registry Mapper</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: '1.6' }}>
          Upgrades, downgrades, and maps missing third-party plugin paths. If a project uses VST2 plugins that are missing on your system, you can easily map them to their corresponding VST3 versions. The tool modifies the project's mixer configurations directly.
        </p>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>{stats.total}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>Total Plugins</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-cyan)' }}>{stats.vst3}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>VST3 Formats</div>
          </div>
          <div style={{ background: 'rgba(255, 0, 127, 0.05)', padding: '1rem', borderRadius: '6px', border: '1px solid rgba(255, 0, 127, 0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-pink)' }}>{stats.vst2}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>Legacy VST2</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{stats.stock}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>Stock S1 FX</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem' }}>
        
        {/* Left: Active Plugins List */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
            Project Active Plugins List
          </h3>

          <div style={{ overflowY: 'auto', maxHeight: '450px', paddingRight: '0.2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-clean)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0.25rem' }}>Name</th>
                  <th>Format</th>
                  <th>ClassID (GUID)</th>
                  <th style={{ textAlign: 'center' }}>Instances</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {uniquePlugins.map((plug, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', verticalAlign: 'middle' }}>
                    <td style={{ padding: '0.8rem 0.25rem', fontWeight: 600, color: 'white' }}>{plug.name}</td>
                    <td>
                      <span style={{
                        padding: '0.15rem 0.4rem',
                        borderRadius: '3px',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        background: plug.format === 'VST2' ? 'rgba(255, 0, 127, 0.15)' : plug.format === 'VST3' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255,255,255,0.05)',
                        color: plug.format === 'VST2' ? 'var(--accent-pink)' : plug.format === 'VST3' ? 'var(--accent-cyan)' : 'var(--text-muted)'
                      }}>
                        {plug.format}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.72rem' }} title={plug.classID}>
                      {plug.classID.substring(0, 15)}...
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{plug.count}</td>
                    <td style={{ textAlign: 'right' }}>
                      {plug.format === 'VST2' ? (
                        <button
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', borderColor: 'var(--accent-pink)', color: 'var(--accent-pink)' }}
                          onClick={() => handleSuggest(plug)}
                        >
                          🔧 Map VST3
                        </button>
                      ) : (
                        <button
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                          onClick={() => handleSuggest(plug)}
                        >
                          🔧 Remap
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Mapping Rules Builder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Form */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              Create Remapping Rule
            </h3>

            {isLoadingWorkspace && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }}>
                ⏳ Scanning workspace for plugin ClassIDs...
                <style>{`@keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }`}</style>
              </div>
            )}

            <form onSubmit={handleAddRule} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Source Plugin (In Project)</label>
                <select
                  value={selectedPlugin}
                  onChange={(e) => {
                    setSelectedPlugin(e.target.value);
                    const plug = uniquePlugins.find(p => p.classID === e.target.value);
                    if (plug) handleSuggest(plug);
                  }}
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem' }}
                >
                  <option value="">-- Choose a plugin --</option>
                  {uniquePlugins.map((plug, idx) => (
                    <option key={idx} value={plug.classID}>
                      [{plug.format}] {plug.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fuzzy Suggestions (Direct Counterparts) */}
              {suggestions.length > 0 && (
                <div style={{ border: '1px solid rgba(0, 242, 254, 0.2)', background: 'rgba(0, 242, 254, 0.02)', padding: '0.75rem', borderRadius: '4px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                    💡 Detected VST3 Match in other projects (click to use):
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '100px', overflowY: 'auto' }}>
                    {suggestions.map((sug, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setTargetName(sug.name);
                          setTargetClassID(sug.classID);
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-clean)',
                          borderRadius: '3px',
                          padding: '0.35rem 0.5rem',
                          textAlign: 'left',
                          color: 'var(--accent-cyan)',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          width: '100%',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.07)'}
                        onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.03)'}
                      >
                        <span style={{ fontWeight: 600 }}>{sug.name} <strong style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>({sug.format})</strong></span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {sug.classID.substring(0, 14)}...
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* VST Search database from workspace */}
              {!isLoadingWorkspace && workspacePlugins.length > 0 && (
                <div style={{ border: '1px solid var(--border-clean)', background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '4px' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>
                    🔍 Search VST3 database from Workspace ({workspacePlugins.length} total)
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type to filter workspace plugins (e.g. FabFilter, Valhalla)..."
                    style={{ width: '100%', padding: '0.4rem 0.6rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '3px', fontSize: '0.8rem', outline: 'none', marginBottom: '0.5rem' }}
                  />
                  
                  {filteredWorkspacePlugins.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '120px', overflowY: 'auto' }}>
                      {filteredWorkspacePlugins.map((sug, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setTargetName(sug.name);
                            setTargetClassID(sug.classID);
                          }}
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--border-clean)',
                            borderRadius: '3px',
                            padding: '0.35rem 0.5rem',
                            textAlign: 'left',
                            color: 'var(--accent-cyan)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            width: '100%',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.07)'}
                          onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.03)'}
                        >
                          <span style={{ fontWeight: 600 }}>{sug.name} <strong style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>({sug.format})</strong></span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {sug.classID.substring(0, 14)}...
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Target Plugin Name</label>
                <input
                  type="text"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  placeholder="e.g. ValhallaVintageVerb"
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Target ClassID (GUID)</label>
                <input
                  type="text"
                  value={targetClassID}
                  onChange={(e) => setTargetClassID(e.target.value)}
                  placeholder="e.g. {56535456-6565-3376-616c-68616c6c6176}"
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem', outline: 'none', fontFamily: 'monospace' }}
                />
              </div>

              <button type="submit" className="btn-secondary" style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', fontWeight: 600 }}>
                ➕ Add Mapping Rule
              </button>
            </form>
          </div>

          {/* Active Rules List */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              Active Mapping Rules ({rules.length})
            </h3>

            {rules.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1.5rem' }}>
                No active remapping rules declared.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {rules.map((rule, idx) => (
                  <div key={idx} style={{
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid var(--border-clean)',
                    borderRadius: '4px',
                    padding: '0.6rem 0.8rem',
                    fontSize: '0.78rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'white' }}>
                        {rule.sourceName} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({rule.sourceFormat})</span>
                      </div>
                      <div style={{ color: 'var(--accent-cyan)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                        ➡️ {rule.targetName}
                      </div>
                      <div style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: '0.15rem' }}>
                        ID: {rule.targetClassID.substring(0, 20)}...
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveRule(idx)}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem' }}
                      title="Delete rule"
                    >
                      🗑️
                    </button>
                  </div>
                ))}

                <button
                  onClick={handleApplyMapping}
                  disabled={isApplying}
                  className="btn-primary"
                  style={{ width: '100%', padding: '0.7rem', fontSize: '0.88rem', fontWeight: 'bold' }}
                >
                  {isApplying ? 'Applying Remapping...' : '🚀 Apply Mapping to Project File'}
                </button>
              </div>
            )}

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

      </div>

    </div>
  );
}
