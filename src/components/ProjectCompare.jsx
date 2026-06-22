import React, { useEffect, useState } from 'react';

export default function ProjectCompare({ activeProject, activeParsedData }) {
  const [projectsList, setProjectsList] = useState([]);
  const [compareSongPath, setCompareSongPath] = useState('');
  const [compareData, setCompareData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load all projects in the workspace to populate comparison dropdown
  useEffect(() => {
    fetch('http://localhost:3001/api/projects')
      .then(res => res.json())
      .then(data => {
        if (data.projects) {
          // Filter out the active project itself
          const list = data.projects.filter(p => p.songPath !== activeProject.songPath);
          setProjectsList(list);
          if (list.length > 0) {
            setCompareSongPath(list[0].songPath);
          }
        }
      })
      .catch(err => console.error('Error fetching projects list:', err));
  }, [activeProject.songPath]);

  // Helper: Parse XML for the secondary song
  const parseSecondarySongData = (xmlStrings) => {
    const parser = new DOMParser();
    
    // Inject namespaces
    const fixXml = (xml) => {
      if (!xml) return xml;
      if (xml.includes('xmlns:x=')) return xml;
      const match = xml.match(/<([A-Za-z0-9_:-]+)/);
      if (match) {
        const rootTag = match[1];
        return xml.replace(`<${rootTag}`, `<${rootTag} xmlns:x="http://presonus.com"`);
      }
      return xml;
    };

    const metaDoc = parser.parseFromString(fixXml(xmlStrings.metainfo), "text/xml");
    const songDoc = parser.parseFromString(fixXml(xmlStrings.song), "text/xml");
    const mixerDoc = parser.parseFromString(fixXml(xmlStrings.audiomixer), "text/xml");

    // Extract Metadata
    const metadata = {};
    const attrs = metaDoc.getElementsByTagName("Attribute");
    for (let i = 0; i < attrs.length; i++) {
      metadata[attrs[i].getAttribute("id")] = attrs[i].getAttribute("value");
    }

    // Extract Tracks
    const tracks = [];
    const lists = songDoc.getElementsByTagName("List");
    let tracksList = null;
    for (let i = 0; i < lists.length; i++) {
      let hasTracksId = false;
      for (let j = 0; j < lists[i].attributes.length; j++) {
        if (lists[i].attributes[j].localName === 'id' && lists[i].attributes[j].value === 'Tracks') {
          hasTracksId = true;
          break;
        }
      }
      if (hasTracksId) {
        tracksList = lists[i];
        break;
      }
    }

    if (tracksList) {
      for (let i = 0; i < tracksList.children.length; i++) {
        const child = tracksList.children[i];
        const name = child.getAttribute("name") || "Unnamed";
        const type = child.tagName;
        let typeLabel = type === 'MediaTrack' ? (child.querySelector("SpeakerSetup") ? 'Audio Track' : 'Instrument (Synth)') : type;
        tracks.push({ name, type: typeLabel });
      }
    }

    // Extract Mixer Channels
    const channels = [];
    const channelTags = ['AudioOutputChannel', 'AudioGroupChannel', 'AudioSynthChannel', 'AudioTrackChannel'];
    channelTags.forEach(tag => {
      const list = mixerDoc.getElementsByTagName(tag);
      for (let i = 0; i < list.length; i++) {
        const chan = list[i];
        const name = chan.getAttribute("name") || chan.getAttribute("label") || "Unnamed";
        const gain = chan.getAttribute("gain") || "1.0";
        
        // Extract insert plugins names
        const inserts = [];
        const insertsNode = Array.from(chan.getElementsByTagName("Attributes")).find(n => {
          return Array.from(n.attributes).some(a => a.localName === 'id' && a.value === 'Inserts');
        });
        if (insertsNode) {
          const subAttrs = insertsNode.getElementsByTagName("Attributes");
          for (let j = 0; j < subAttrs.length; j++) {
            const classID = subAttrs[j].getAttribute("classID");
            if (classID) {
              inserts.push(subAttrs[j].getAttribute("name") || "Plugin");
            }
          }
        }

        channels.push({ name, gain, inserts });
      }
    });

    return { metadata, tracks, channels };
  };

  const handleCompare = () => {
    if (!compareSongPath) return;
    setIsLoading(true);
    setError('');
    setCompareData(null);

    fetch(`http://localhost:3001/api/load-xmls?songPath=${encodeURIComponent(compareSongPath)}`)
      .then(res => {
        if (!res.ok) throw new Error('Could not read secondary project files.');
        return res.json();
      })
      .then(data => {
        const parsed = parseSecondarySongData(data);
        setCompareData(parsed);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setIsLoading(false);
      });
  };

  // Difference Calculations
  const diffMetadata = () => {
    if (!compareData) return [];
    const meta1 = activeParsedData.metadata;
    const meta2 = compareData.metadata;
    
    const keys = [
      { id: 'Document:Title', label: 'Song Title' },
      { id: 'Media:Tempo', label: 'Tempo (BPM)' },
      { id: 'Media:KeySignature', label: 'Key Signature' },
      { id: 'Media:SampleRate', label: 'Sample Rate' },
      { id: 'Media:BitDepth', label: 'Bit Depth' },
      { id: 'Media:TrackCount', label: 'Track Count' }
    ];

    return keys.map(k => {
      const val1 = meta1[k.id] || 'N/A';
      const val2 = meta2[k.id] || 'N/A';
      return {
        label: k.label,
        val1,
        val2,
        isDifferent: val1.toString() !== val2.toString()
      };
    });
  };

  const diffTracks = () => {
    if (!compareData) return { added: [], removed: [], common: [] };
    const t1 = activeParsedData.tracks.map(t => t.name);
    const t2 = compareData.tracks.map(t => t.name);

    const added = t2.filter(t => !t1.includes(t));
    const removed = t1.filter(t => !t2.includes(t));
    const common = t1.filter(t => t2.includes(t));

    return { added, removed, common };
  };

  const diffMixer = () => {
    if (!compareData) return [];
    const chans1 = activeParsedData.channels;
    const chans2 = compareData.channels;

    const result = [];
    // Compare matching channel names
    chans1.forEach(c1 => {
      const c2 = chans2.find(c => c.name === c1.name);
      if (c2) {
        const plugins1 = c1.inserts.map(i => i.name);
        const plugins2 = c2.inserts;

        // Check if plugin chains or volumes are different
        const pluginsEqual = JSON.stringify(plugins1) === JSON.stringify(plugins2);
        const volumeEqual = c1.gain_db === c2.gain_db; // simplified

        if (!pluginsEqual || !volumeEqual) {
          result.push({
            name: c1.name,
            volume1: c1.gain_db || 'N/A',
            volume2: c2.gain_db || 'N/A', // need format conversion or raw values
            plugins1,
            plugins2,
            isDifferent: true
          });
        }
      }
    });
    return result;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
      <div className="glass-card">
        <h3 className="glass-card-header">👥 Studio One Song Comparator (Song Diff)</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Select another project in your workspace to perform a side-by-side diff. This tool inspects tracks, metadata, tempo, and plugin inserts to outline the exact variations between session versions.
        </p>

        {/* Project Selector bar */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem' }}>
          <select
            className="btn-secondary"
            value={compareSongPath}
            onChange={(e) => setCompareSongPath(e.target.value)}
            style={{ flex: 1, padding: '0.5rem 1rem', background: 'var(--bg-primary)', color: 'white', borderRadius: '4px', border: '1px solid var(--border-clean)' }}
          >
            {projectsList.map((p, idx) => (
              <option key={idx} value={p.songPath}>
                {p.name} ({p.songName})
              </option>
            ))}
            {projectsList.length === 0 && (
              <option value="">No other songs found in workspace</option>
            )}
          </select>
          
          <button
            className="btn-primary"
            onClick={handleCompare}
            disabled={!compareSongPath || isLoading}
          >
            {isLoading ? 'Comparing...' : 'Compare Sessions'}
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', padding: '1rem', borderRadius: '6px', color: '#ef4444', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {compareData && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
            
            {/* 1. Metadata Differences */}
            <div>
              <h4 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
                📋 Session Metadata Comparison
              </h4>
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Metadata Field</th>
                    <th>Active Project ({activeProject.name})</th>
                    <th>Compared Project</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {diffMetadata().map((m, idx) => (
                    <tr key={idx} style={{ background: m.isDifferent ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      <td style={{ fontWeight: 500 }}>{m.label}</td>
                      <td>{m.val1}</td>
                      <td>{m.val2}</td>
                      <td style={{ color: m.isDifferent ? 'white' : 'var(--text-secondary)', fontWeight: m.isDifferent ? 600 : 400 }}>
                        {m.isDifferent ? '≠ Modified' : '＝ Unchanged'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 2. Track List Changes */}
            <div>
              <h4 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
                📁 Track Differences
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    ➕ Added in Compared Project ({diffTracks().added.length})
                  </span>
                  <ul style={{ listStyle: 'none', marginTop: '0.75rem', paddingLeft: 0 }}>
                    {diffTracks().added.map((t, idx) => (
                      <li key={idx} style={{ color: 'white', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: '4px' }}>
                        + {t}
                      </li>
                    ))}
                    {diffTracks().added.length === 0 && (
                      <li style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>None</li>
                    )}
                  </ul>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    ➖ Missing in Compared Project ({diffTracks().removed.length})
                  </span>
                  <ul style={{ listStyle: 'none', marginTop: '0.75rem', paddingLeft: 0 }}>
                    {diffTracks().removed.map((t, idx) => (
                      <li key={idx} style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'monospace', marginBottom: '4px' }}>
                        - {t}
                      </li>
                    ))}
                    {diffTracks().removed.length === 0 && (
                      <li style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>None</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            {/* 3. Plugin Chain Variations */}
            <div>
              <h4 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
                🔌 Mixer Plugin & Routing Variations
              </h4>
              <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border-clean)', borderRadius: '6px' }}>
                <table className="premium-table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Active Plugin Chain</th>
                      <th>Compared Plugin Chain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffMixer().map((c, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                          {c.plugins1.join(' ➡️ ') || <span style={{ color: 'var(--text-muted)' }}>No plugins</span>}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'white' }}>
                          {c.plugins2.join(' ➡️ ') || <span style={{ color: 'var(--text-muted)' }}>No plugins</span>}
                        </td>
                      </tr>
                    ))}
                    {diffMixer().length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                          🎉 All matching mixer channel inserts are identical between versions!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
