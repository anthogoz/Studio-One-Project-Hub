import React, { useState } from 'react';

export default function VersionConverter({ songPath }) {
  const [targetVersion, setTargetVersion] = useState('7');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleConvert = async () => {
    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('http://localhost:3001/api/convert-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songPath,
          targetVersion: parseInt(targetVersion)
        })
      });

      const data = await res.json();
      setIsLoading(false);

      if (data.success) {
        setMessage(`Success! Project converted and saved as: "${data.filename}" in your project folder.`);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setIsLoading(false);
      console.error(err);
      setError(`Conversion failed: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '650px', margin: '0 auto' }}>
      <div className="glass-card">
        <h3 className="glass-card-header">🔄 Studio One Version Converter</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
          Downgrade your Studio One 8 projects to older versions so you can open them in Studio One 7 or Studio One 6 (e.g. for collaboration).
        </p>

        {/* Dropdown Selector */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Target Studio One Version
          </label>
          <select
            value={targetVersion}
            onChange={(e) => {
              setTargetVersion(e.target.value);
              setMessage('');
              setError('');
            }}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--border-clean)', background: 'var(--bg-primary)', color: 'white', outline: 'none', fontSize: '1rem' }}
          >
            <option value="7">Studio One 7.x</option>
            <option value="6">Studio One 6.x</option>
            <option value="5">Studio One 5.x</option>
            <option value="4">Studio One 4.x</option>
            <option value="3">Studio One 3.x</option>
          </select>
        </div>

        {/* Warning Board */}
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-clean)', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'white', fontWeight: 600 }}>⚠️ Compatibility Notice:</span>
          <ul style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <li>The conversion modifies project metadata file flags in-place.</li>
            <li>Newer features exclusive to Studio One 8 (such as advanced routing or specific macro parameters) will be automatically ignored by older versions.</li>
            <li>Your audio tracks, midi tracks, mixer settings, panning, volume levels, inserts (VST plugins), and sends will remain intact.</li>
            <li><strong style={{ color: 'var(--accent-primary)' }}>Warning:</strong> The older the target version (especially v3/v4), the higher the risk of DAW parser crashes due to structural XML format shifts over the years.</li>
          </ul>
        </div>

        <button
          className="btn-primary"
          onClick={handleConvert}
          disabled={isLoading}
          style={{ width: '100%', padding: '0.8rem', fontSize: '1rem' }}
        >
          {isLoading ? 'Converting...' : `Convert to Studio One ${targetVersion}.x`}
        </button>

        {message && (
          <div style={{ marginTop: '1.5rem', background: 'rgba(0, 242, 254, 0.1)', border: '1px solid var(--accent-cyan)', padding: '1rem', borderRadius: '6px', color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{ marginTop: '1.5rem', background: 'rgba(255, 0, 127, 0.1)', border: '1px solid var(--accent-pink)', padding: '1rem', borderRadius: '6px', color: 'var(--accent-pink)', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
