import React, { useState } from 'react';

export default function TemplateGenerator({ parsedData, songXmlDoc, songPath }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleGenerateTemplate = async () => {
    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      // Clone the XML document to avoid modifying the active app state
      const docClone = songXmlDoc.cloneNode(true);

      // List of tag names representing events, clips, and notes in the timeline
      const tagsToRemove = [
        'AudioEvent',
        'MusicEvent',
        'Event',
        'AudioPart',
        'MusicPart',
        'Note',
        'Performance'
      ];

      let removedCount = 0;
      tagsToRemove.forEach(tagName => {
        const elements = docClone.getElementsByTagName(tagName);
        // We must loop backwards since HTMLCollection is live
        for (let i = elements.length - 1; i >= 0; i--) {
          const el = elements[i];
          if (el.parentNode) {
            el.parentNode.removeChild(el);
            removedCount++;
          }
        }
      });

      console.log(`Stripped ${removedCount} timeline events from song XML.`);

      // Serialize back to XML string
      const serializer = new XMLSerializer();
      const strippedSongXml = serializer.serializeToString(docClone);

      // Call API to save new .song file
      const res = await fetch('http://localhost:3001/api/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalSongPath: songPath,
          strippedSongXml
        })
      });

      const data = await res.json();
      setIsLoading(false);

      if (data.success) {
        setMessage(`Success! Template generated and saved as: "${data.filename}" in your project directory.`);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setIsLoading(false);
      console.error(err);
      setError(`Failed to generate template: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '650px', margin: '0 auto' }}>
      <div className="glass-card">
        <h3 className="glass-card-header">✨ S1 Project Template Generator</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
          This tool generates a clean project template from your active session. It duplicates the `.song` project, empties the timeline of all audio clips and MIDI notes, but preserves the following settings:
        </p>

        <ul style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', paddingLeft: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <li>🟢 All tracks and folder structures (with names and colors)</li>
          <li>🟢 Full mixer console setup (fader levels, panning, mutes, solos)</li>
          <li>🟢 All FX channels and group busses</li>
          <li>🟢 Entire insert plugin chains and presets (e.g. vocal stacks, mastering racks)</li>
          <li>🟢 Auxiliary sends and sidechain routing</li>
          <li>🟢 Song tempo (BPM), markers, and signatures</li>
        </ul>

        <div style={{ background: 'rgba(0, 242, 254, 0.05)', border: '1px solid rgba(0, 242, 254, 0.1)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>💡 Pro-Tip:</span>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            This is perfect for starting your next session with the exact same premium vocal chains and mastering tools without having to rebuild them from scratch.
          </p>
        </div>

        <button
          className="btn-primary"
          onClick={handleGenerateTemplate}
          disabled={isLoading}
          style={{ width: '100%', padding: '0.8rem', fontSize: '1rem' }}
        >
          {isLoading ? 'Processing...' : 'Generate and Save Template .song'}
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
