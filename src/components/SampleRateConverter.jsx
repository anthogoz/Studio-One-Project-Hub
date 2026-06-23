import React, { useState } from 'react';

export default function SampleRateConverter({ songPath, parsedData, onReloadProject }) {
  // Get current sample rate from parsedData metadata (if available)
  const currentHz = parsedData?.metadata?.['Media:SampleRate'] || '44100';
  const currentKhz = `${(parseInt(currentHz, 10) / 1000).toFixed(1)} kHz`;

  const [targetSampleRate, setTargetSampleRate] = useState('48000');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleConvert = async () => {
    if (targetSampleRate === currentHz) {
      setError(`The project is already set to ${currentKhz}. Please choose a different target sample rate.`);
      return;
    }

    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('http://localhost:3001/api/convert-sample-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songPath,
          targetSampleRate: parseInt(targetSampleRate, 10)
        })
      });

      const data = await res.json();
      setIsLoading(false);

      if (data.success) {
        setMessage(`Success! Project sample rate converted to ${(targetSampleRate / 1000).toFixed(1)} kHz. A backup has been saved in the project History folder: "${data.backupName}"`);
        if (onReloadProject) {
          // Trigger hot reload of project data so the UI updates
          setTimeout(() => {
            onReloadProject();
          }, 1000);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setIsLoading(false);
      console.error(err);
      setError(`Sample rate conversion failed: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '650px', margin: '0 auto' }}>
      <div className="glass-card">
        <h3 className="glass-card-header">📻 Studio One Sample Rate Converter</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: '1.5' }}>
          Change your project's default sample rate target (e.g. converting a project from 44.1 kHz to 48 kHz or 96 kHz). This updates the project metadata so that Studio One configures the hardware sample rate accordingly when opening the song.
        </p>

        {/* Current Info Row */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Current Sample Rate</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginTop: '0.3rem' }}>{currentKhz}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Project Bit Depth</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginTop: '0.3rem' }}>{parsedData?.metadata?.['Media:BitDepth'] || '24'} bit</div>
          </div>
        </div>

        {/* Target Selector */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Target Sample Rate
          </label>
          <select
            value={targetSampleRate}
            onChange={(e) => {
              setTargetSampleRate(e.target.value);
              setMessage('');
              setError('');
            }}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid var(--border-clean)', background: 'var(--bg-primary)', color: 'white', outline: 'none', fontSize: '1rem' }}
          >
            <option value="44100">44.1 kHz (CD Standard)</option>
            <option value="48000">48.0 kHz (Video & Film Standard)</option>
            <option value="88200">88.2 kHz (High-Res Music)</option>
            <option value="96000">96.0 kHz (Studio Production Standard)</option>
            <option value="176400">176.4 kHz (Ultra-High-Res)</option>
            <option value="192000">192.0 kHz (Ultra-High-Res Production)</option>
          </select>
        </div>

        {/* Info Board */}
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-clean)', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'white', fontWeight: 600 }}>⚠️ Important Resampling Information:</span>
          <ul style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <li>This action modifies the project header file target rate.</li>
            <li>It does **not** physically resample or edit the audio files in your `Media/` folder.</li>
            <li>When opening the converted project, Studio One will automatically resample all imported files on the fly using its high-quality real-time conversion engine.</li>
            <li>Converting to a higher rate (e.g. 44.1 ➡️ 96 kHz) will offer higher processing precision for plug-ins, but will increase CPU consumption slightly in your DAW.</li>
          </ul>
        </div>

        <button
          className="btn-primary"
          onClick={handleConvert}
          disabled={isLoading}
          style={{ width: '100%', padding: '0.8rem', fontSize: '1rem' }}
        >
          {isLoading ? 'Converting Sample Rate...' : `Convert Sample Rate to ${(parseInt(targetSampleRate, 10)/1000).toFixed(1)} kHz`}
        </button>

        {message && (
          <div style={{ marginTop: '1.5rem', background: 'rgba(0, 242, 254, 0.1)', border: '1px solid var(--accent-cyan)', padding: '1rem', borderRadius: '6px', color: 'var(--accent-cyan)', fontSize: '0.9rem', lineHeight: '1.4' }}>
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
