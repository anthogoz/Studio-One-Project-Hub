import React, { useState } from 'react';

export default function VocalChainCopier({ parsedData, projectDir, songXmlDoc, mixerXmlDoc }) {
  const { channels } = parsedData;
  const [selectedChannelName, setSelectedChannelName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Filter channels that have inserts
  const channelsWithInserts = channels.filter(ch => ch.inserts.length > 0);

  const selectedChannel = channels.find(ch => ch.name === selectedChannelName);

  const handleExport = async (mode) => {
    if (!selectedChannel) return;
    setError('');
    setMessage('');

    try {
      // Find the channel in mixerXmlDoc
      // Since it's parsed as a DOM document:
      const tag = selectedChannel.type === 'Audio Track' ? 'AudioTrackChannel' 
                  : selectedChannel.type === 'Instrument (Synth)' ? 'AudioSynthChannel'
                  : selectedChannel.type === 'Bus / Group' ? 'AudioGroupChannel' : 'AudioOutputChannel';
      
      const elements = mixerXmlDoc.getElementsByTagName(tag);
      let channelNode = null;
      for (let i = 0; i < elements.length; i++) {
        if (elements[i].getAttribute('name') === selectedChannel.name) {
          channelNode = elements[i];
          break;
        }
      }

      if (!channelNode) {
        throw new Error('Could not find channel node in XML document');
      }

      const insertsNode = channelNode.querySelector("Attributes[id='Inserts']");
      if (!insertsNode) {
        throw new Error('This channel has no inserts XML node.');
      }

      // Serialize XML Node
      const serializer = new XMLSerializer();
      const presetXml = serializer.serializeToString(insertsNode);

      if (mode === 'download') {
        // Download via browser
        const blob = new Blob([presetXml], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedChannel.label.replace(/[^a-zA-Z0-9_\-]/g, '_')}_VocalChain.multipreset`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setMessage('Preset downloaded successfully in your browser!');
      } else {
        // Save to local folder Presets/
        const res = await fetch('http://localhost:3001/api/export-preset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectDir,
            trackName: selectedChannel.label,
            presetXml
          })
        });
        const data = await res.json();
        if (data.success) {
          setMessage(`Preset successfully saved on disk to: ${data.presetPath}`);
        } else {
          throw new Error(data.error);
        }
      }
    } catch (err) {
      console.error(err);
      setError(`Export failed: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div className="glass-card">
        <h3 className="glass-card-header">🧬 Vocal Chain & Preset Copier</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Select any track from your project to extract its entire serial inserts chain. You can download it as a Studio One multi-preset or save it to your local project presets directory.
        </p>

        {/* Dropdown Selector */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Select Channel to Extract
          </label>
          <select
            value={selectedChannelName}
            onChange={(e) => {
              setSelectedChannelName(e.target.value);
              setMessage('');
              setError('');
            }}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-tertiary)', color: 'white', outline: 'none', fontSize: '1rem' }}
          >
            <option value="">-- Choose a channel ({channelsWithInserts.length} channels with plugins) --</option>
            {channelsWithInserts.map((ch, idx) => (
              <option key={idx} value={ch.name}>
                {ch.label} ({ch.type} - {ch.inserts.length} plugins)
              </option>
            ))}
          </select>
        </div>

        {/* Selected Channel Details */}
        {selectedChannel && (
          <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '1.5rem' }}>
            <h4 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-muted)', paddingBottom: '0.5rem' }}>
              Inserts Chain for **{selectedChannel.label}**
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {selectedChannel.inserts.map((ins, idx) => (
                <div key={idx} style={{ fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '4px' }}>
                  <span style={{ fontWeight: 600, color: ins.bypass ? 'var(--text-muted)' : 'var(--accent-cyan)' }}>
                    {idx + 1}. {ins.name}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {ins.bypass ? 'Bypassed' : 'Active'} {ins.preset ? `(${ins.preset})` : ''}
                  </span>
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button className="btn-primary" onClick={() => handleExport('disk')}>
                💾 Save to Project folder
              </button>
              <button className="btn-secondary" onClick={() => handleExport('download')}>
                📥 Download Multipreset
              </button>
            </div>
          </div>
        )}

        {message && (
          <div style={{ background: 'rgba(0, 242, 254, 0.1)', border: '1px solid var(--accent-cyan)', padding: '1rem', borderRadius: '6px', color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(255, 0, 127, 0.1)', border: '1px solid var(--accent-pink)', padding: '1rem', borderRadius: '6px', color: 'var(--accent-pink)', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
