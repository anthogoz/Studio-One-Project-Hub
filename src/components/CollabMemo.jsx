import React, { useState } from 'react';

export default function CollabMemo({ parsedData, currentProject, xmls }) {
  const { metadata, tracks, channels, audioClips } = parsedData;
  const [isPackaging, setIsPackaging] = useState(false);
  const [packStatus, setPackStatus] = useState({ type: '', message: '' });

  // 1. Calculate length
  const lengthSec = parseFloat(metadata['Media:Length'] || 0);
  const minutes = Math.floor(lengthSec / 60);
  const seconds = Math.floor(lengthSec % 60);
  const bpmRaw = metadata['Media:Tempo'];
  const bpm = (() => {
    if (!bpmRaw) return '120';
    const tempo = parseFloat(bpmRaw);
    if (isNaN(tempo)) return bpmRaw;
    if (Math.abs(tempo - Math.round(tempo)) < 0.005) {
      return Math.round(tempo).toString();
    }
    return (Math.round(tempo * 100) / 100).toString();
  })();
  const sampleRate = metadata['Media:SampleRate'] ? `${parseInt(metadata['Media:SampleRate'])/1000} kHz` : '44.1 kHz';
  const bitDepth = metadata['Media:BitDepth'] || '24';
  const timeSig = `${metadata['Media:TimeSignatureNumerator'] || '4'}/${metadata['Media:TimeSignatureDenominator'] || '4'}`;

  // 2. Classify plugins (Stock vs. Third-Party)
  const stockPluginNames = new Set([
    "Pro EQ", "Pro EQ³", "Compressor", "Limiter", "Binaural Pan", "Beat Delay", 
    "Analog Delay", "Room Reverb", "MixVerb", "RedLightDist", "Ampire", "Pedalboard", 
    "Autofilter", "Chorus", "Flanger", "Phaser", "Tremolo", "X-Trem", "Rotary", 
    "Gate", "Expander", "Limiter2", "Fat Channel", "Pipeline", "Scope", 
    "Spectrum Meter", "Tuner", "Level Meter", "Dual Pan", "Splitter", "Console Shaper", 
    "CTC-1", "PortaCassette", "Vocoder", "Open AIR", "Empire", "Tone Generator", 
    "Input Delay", "Phase Meter", "IR Maker", "VU Meter"
  ]);

  const pluginInstances = {};
  channels.forEach(ch => {
    ch.inserts.forEach(ins => {
      pluginInstances[ins.name] = (pluginInstances[ins.name] || 0) + 1;
    });
  });

  const thirdPartyPlugins = [];
  const stockPlugins = [];

  Object.entries(pluginInstances).forEach(([name, count]) => {
    const isStock = stockPluginNames.has(name);
    const item = { name, count };
    if (isStock) {
      stockPlugins.push(item);
    } else {
      thirdPartyPlugins.push(item);
    }
  });

  // 3. Extract Notepad notes
  // notepad.xml or notes.txt
  const rawNotes = xmls?.notes || '';
  let cleanNotes = rawNotes.trim();

  if (!cleanNotes && xmls?.notepad) {
    // Basic fallback parsing if it's XML
    try {
      const match = xmls.notepad.match(/<Text[^>]*>([\s\S]*?)<\/Text>/);
      if (match) cleanNotes = match[1].trim();
    } catch (e) {
      cleanNotes = 'No notes found.';
    }
  }
  if (!cleanNotes) cleanNotes = 'No notes written in the project notepad.';

  // 4. Generate Markdown Memo
  const generateMarkdownMemo = () => {
    let memo = `# 🤝 Studio One Project Collaboration Memo\n`;
    memo += `**Project:** ${currentProject.name}\n`;
    memo += `**BPM:** ${bpm} BPM\n`;
    memo += `**Length:** ${minutes}m ${seconds}s\n`;
    memo += `**Format:** ${sampleRate} / ${bitDepth}-bit (${timeSig})\n\n`;

    memo += `## 🔌 Required Third-Party Plugins\n`;
    if (thirdPartyPlugins.length === 0) {
      memo += `_None! Fully stock session._\n\n`;
    } else {
      thirdPartyPlugins.forEach(p => {
        memo += `- [ ] **${p.name}** (${p.count} instance${p.count > 1 ? 's' : ''})\n`;
      });
      memo += `\n`;
    }

    memo += `## 📝 Session Notes\n`;
    memo += `\`\`\`text\n${cleanNotes}\n\`\`\`\n\n`;

    memo += `--- \n`;
    memo += `_Generated with S1 Toolkit._`;
    return memo;
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(generateMarkdownMemo());
    alert('Collaboration Memo copied to clipboard! You can paste it into Discord, Slack or a README.md file.');
  };

  // 5. Create lighter package for collab
  const handleCreatePackage = () => {
    setIsPackaging(true);
    setPackStatus({ type: '', message: '' });

    // Filter audio files that are actively used (useCount > 0)
    const activeFiles = audioClips.filter(c => c.use_count > 0).map(c => c.name);

    fetch('http://localhost:3001/api/package-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectDir: currentProject.dirPath,
        songName: currentProject.songName,
        activeFiles
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to package project.');
        return res.json();
      })
      .then(data => {
        setIsPackaging(false);
        const sizeMb = (data.size / (1024 * 1024)).toFixed(1);
        setPackStatus({
          type: 'success',
          message: `Lightweight ZIP package created successfully! Saved as: "${data.filename}" (${sizeMb} MB) inside your project directory.`
        });
      })
      .catch(err => {
        setIsPackaging(false);
        setPackStatus({ type: 'error', message: err.message });
      });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
      
      {/* Overview Grid */}
      <div className="glass-card">
        <div className="glass-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🤝 Collaboration Hub</span>
          <button className="btn-secondary" onClick={handleCopyToClipboard} style={{ fontSize: '0.82rem', padding: '0.4rem 1rem' }}>
            📋 Copy Memo to Clipboard
          </button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Prepare this project for sharing. Generate checklist reports of required plugins and package your song file along with only active audio clips (ignoring heavy unused files/takes).
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tempo & Time</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'white', marginTop: '0.25rem' }}>{bpm} BPM ({timeSig})</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Session Duration</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'white', marginTop: '0.25rem' }}>{minutes}m {seconds}s</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Format Quality</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'white', marginTop: '0.25rem' }}>{sampleRate} / {bitDepth}b</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active Clips / Total</span>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'white', marginTop: '0.25rem' }}>
              {audioClips.filter(c => c.use_count > 0).length} / {audioClips.length}
            </div>
          </div>
        </div>
      </div>

      {/* Two column: Plugins checklist and packaging tool */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* Column 1: Plugins Checklist */}
        <div className="glass-card">
          <h3 className="glass-card-header">🔌 Collaborator Plugin Checklist</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '1rem' }}>
            List of third-party plugins that your collaborator MUST have installed to load this session correctly.
          </p>

          <h4 style={{ color: '#f97316', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ⚠️ Third-Party Plugins ({thirdPartyPlugins.length})
          </h4>
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-clean)', borderRadius: '6px', padding: '0.5rem', background: 'rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
            {thirdPartyPlugins.length === 0 ? (
              <p style={{ color: '#10b981', fontSize: '0.82rem', padding: '0.5rem', fontWeight: 600 }}>
                Clean stock project! Collaborator does not need any external plugins.
              </p>
            ) : (
              thirdPartyPlugins.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.82rem', color: 'white' }}>
                  <span style={{ fontFamily: 'monospace' }}>{p.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{p.count} instance{p.count > 1 ? 's' : ''}</span>
                </div>
              ))
            )}
          </div>

          <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ✓ Stock Studio One Plugins ({stockPlugins.length})
          </h4>
          <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-clean)', borderRadius: '6px', padding: '0.5rem', background: 'rgba(0,0,0,0.1)' }}>
            {stockPlugins.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '0.5rem' }}>No stock plugins used.</p>
            ) : (
              stockPlugins.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span style={{ fontFamily: 'monospace' }}>{p.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{p.count} inst.</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: Packager and Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Package for sharing */}
          <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justify: 'space-between' }}>
            <div>
              <h3 className="glass-card-header">📦 Export Lightweight Collab ZIP</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.5rem', marginBottom: '1.25rem' }}>
                Create a ZIP file containing the `.song` file and ONLY active media files ({audioClips.filter(c => c.use_count > 0).length} files). This skips all unused recording files, making the folder light and fast to upload.
              </p>
            </div>

            {packStatus.message && (
              <div style={{
                padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.8rem', color: 'white', marginBottom: '1rem',
                background: packStatus.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border: packStatus.type === 'success' ? '1px solid #10b981' : '1px solid #ef4444'
              }}>
                {packStatus.message}
              </div>
            )}

            <button
              className="btn-secondary"
              onClick={handleCreatePackage}
              disabled={isPackaging}
              style={{
                width: '100%', padding: '0.75rem', fontSize: '0.9rem', fontWeight: 600,
                background: 'white', color: 'black', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem'
              }}
            >
              {isPackaging ? 'Packaging files...' : '🎁 Build Lightweight Collab ZIP'}
            </button>
          </div>

          {/* Project Notes */}
          <div className="glass-card" style={{ flex: 1 }}>
            <h3 className="glass-card-header">📝 Notepad Notes</h3>
            <div style={{
              marginTop: '0.75rem', padding: '0.75rem', borderRadius: '6px',
              background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-clean)',
              minHeight: '80px', maxHeight: '150px', overflowY: 'auto'
            }}>
              <pre style={{
                margin: 0, fontFamily: 'monospace', fontSize: '0.82rem',
                color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
              }}>
                {cleanNotes}
              </pre>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
