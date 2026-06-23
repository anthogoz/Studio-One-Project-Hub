import React, { useState } from 'react';

export default function ProjectUtilities({ songPath }) {
  const [valhallaLoading, setValhallaLoading] = useState(false);
  const [valhallaMsg, setValhallaMsg] = useState('');
  const [valhallaErr, setValhallaErr] = useState('');

  const [muteSoloLoading, setMuteSoloLoading] = useState(false);
  const [muteSoloMsg, setMuteSoloMsg] = useState('');
  const [muteSoloErr, setMuteSoloErr] = useState('');

  // 1. Run Valhalla Mix Fix
  const runValhallaFix = async () => {
    setValhallaLoading(true);
    setValhallaMsg('');
    setValhallaErr('');
    try {
      const res = await fetch('http://localhost:3001/api/utility/fix-valhalla-mix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songPath })
      });
      const data = await res.json();
      setValhallaLoading(false);
      if (res.ok && data.success) {
        setValhallaMsg(data.message + (data.backupCreated ? ' (A safety backup of your .song file was created.)' : ''));
      } else {
        setValhallaErr(data.message || data.error || 'Failed to apply Valhalla fix.');
      }
    } catch (err) {
      setValhallaLoading(false);
      setValhallaErr('Network error trying to contact server.');
      console.error(err);
    }
  };

  // 2. Run Mute/Solo Reset
  const runMuteSoloReset = async () => {
    setMuteSoloLoading(true);
    setMuteSoloMsg('');
    setMuteSoloErr('');
    try {
      const res = await fetch('http://localhost:3001/api/utility/reset-mute-solo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songPath })
      });
      const data = await res.json();
      setMuteSoloLoading(false);
      if (res.ok && data.success) {
        setMuteSoloMsg(data.message + (data.backupCreated ? ' (A safety backup of your .song file was created.)' : ''));
      } else {
        setMuteSoloErr(data.message || data.error || 'Failed to reset mute/solo.');
      }
    } catch (err) {
      setMuteSoloLoading(false);
      setMuteSoloErr('Network error trying to contact server.');
      console.error(err);
    }
  };

  return (
    <div style={{ maxWidth: '850px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Title */}
      <div className="glass-card">
        <h2 className="glass-card-header">🛠️ Quick Project Utilities</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6', margin: 0 }}>
          Run automated utility scripts to repair, clean up, or reset properties inside your active Studio One project file. 
          All modifications are applied safely, creating a backup file next to your song before writing changes.
        </p>
      </div>

      {/* Grid of Utilities */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* Valhalla Fixer Card */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🌊 Valhalla Mix Reset Fixer
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              Scans your project's saved VST2 preset cache files (`.fxb`) and translates old Valhalla Vintage Verb version tags from `1.0.0` to `2.0.2`. 
              This prevents a known bug in newer versions of Studio One where old Valhalla instances fail to load their saved mix and jump to 100% wet.
            </p>
          </div>

          <div>
            {valhallaMsg && (
              <div style={{ background: 'rgba(0, 242, 254, 0.08)', border: '1px solid var(--accent-cyan)', padding: '0.75rem', borderRadius: '6px', color: 'var(--accent-cyan)', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: '1.4' }}>
                ✓ {valhallaMsg}
              </div>
            )}
            {valhallaErr && (
              <div style={{ background: 'rgba(255, 0, 127, 0.08)', border: '1px solid var(--accent-pink)', padding: '0.75rem', borderRadius: '6px', color: 'var(--accent-pink)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                ⚠️ {valhallaErr}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={runValhallaFix}
              disabled={valhallaLoading}
              style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', fontWeight: 'bold' }}
            >
              {valhallaLoading ? 'Patching Presets...' : '🔧 Patch Valhalla Presets'}
            </button>
          </div>
        </div>

        {/* Mute/Solo Reset Card */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔊 Global Mute & Solo Reset
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              Scans your mixer configuration (`audiomixer.xml`) and clears all active Mute and Solo states on all audio tracks, synths, output buses, and groups at once. 
              Highly useful for resetting a cluttered session's routing state before exporting stems or doing A/B comparisons.
            </p>
          </div>

          <div>
            {muteSoloMsg && (
              <div style={{ background: 'rgba(0, 242, 254, 0.08)', border: '1px solid var(--accent-cyan)', padding: '0.75rem', borderRadius: '6px', color: 'var(--accent-cyan)', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: '1.4' }}>
                ✓ {muteSoloMsg}
              </div>
            )}
            {muteSoloErr && (
              <div style={{ background: 'rgba(255, 0, 127, 0.08)', border: '1px solid var(--accent-pink)', padding: '0.75rem', borderRadius: '6px', color: 'var(--accent-pink)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                ⚠️ {muteSoloErr}
              </div>
            )}

            <button
              className="btn-secondary"
              onClick={runMuteSoloReset}
              disabled={muteSoloLoading}
              style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', fontWeight: 'bold' }}
            >
              {muteSoloLoading ? 'Resetting Channels...' : '🔊 Reset All Mutes & Solos'}
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
