import React from 'react';

export default function SessionSheet({ parsedData }) {
  const { metadata, channels, tracks } = parsedData;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += 'Track / Label,Type,Fader (dB),Pan,Output Bus,Active Inserts,Sends\n';
    channels.forEach(chan => {
      const label = `"${(chan.label || '').replace(/"/g, '""')}"`;
      const type = `"${(chan.type || '').replace(/"/g, '""')}"`;
      const gain = `"${(chan.gain_db || '').replace(/"/g, '""')}"`;
      const pan = `"${(chan.pan_str || '').replace(/"/g, '""')}"`;
      const dest = `"${(chan.destination || 'Main').replace(/"/g, '""')}"`;
      const inserts = `"${chan.inserts.map(i => `${i.name}${i.bypass ? ' (Bypassed)' : ''}`).join('; ').replace(/"/g, '""')}"`;
      const sends = `"${chan.sends.map(s => `${s.destination} (${s.level})`).join('; ').replace(/"/g, '""')}"`;
      
      csv += `${label},${type},${gain},${pan},${dest},${inserts},${sends}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata['Document:Title'] || 'Studio One Song'}_session_sheet.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportTXT = () => {
    let text = `# Session Technical Sheet: ${metadata['Document:Title'] || 'Studio One Song'}\n`;
    text += `Generated on: ${new Date().toLocaleDateString()}\n\n`;
    text += `## Project Metadata\n`;
    text += `- **Artist**: ${metadata['Media:Artist'] || 'Unknown'}\n`;
    text += `- **Tempo**: ${(() => {
      const tempoStr = metadata['Media:Tempo'];
      if (!tempoStr) return '120';
      const tempo = parseFloat(tempoStr);
      if (isNaN(tempo)) return tempoStr;
      if (Math.abs(tempo - Math.round(tempo)) < 0.005) {
        return Math.round(tempo).toString();
      }
      return (Math.round(tempo * 100) / 100).toString();
    })()} BPM\n`;
    text += `- **Time Signature**: ${metadata['Media:TimeSignatureNumerator'] || '4'}/${metadata['Media:TimeSignatureDenominator'] || '4'}\n`;
    text += `- **Format**: ${metadata['Media:SampleRate'] || '48000'} Hz / ${metadata['Media:BitDepth'] || '24'}b\n\n`;
    
    text += `## Mix Channels & Inserts\n\n`;
    channels.forEach(chan => {
      text += `### ${chan.label} (${chan.type})\n`;
      text += `- **Fader**: ${chan.gain_db} | **Pan**: ${chan.pan_str} | **Output**: ${chan.destination || 'Main'}\n`;
      if (chan.inserts.length > 0) {
        text += `- **FX Inserts**:\n`;
        chan.inserts.forEach(i => {
          text += `  - ${i.name} ${i.bypass ? '(Bypassed)' : ''}\n`;
        });
      }
      if (chan.sends.length > 0) {
        text += `- **Sends**:\n`;
        chan.sends.forEach(s => {
          text += `  - ${s.destination} (${s.level}) ${s.bypass ? '(Bypassed)' : ''}\n`;
        });
      }
      text += `\n`;
    });
    
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata['Document:Title'] || 'Studio One Song'}_session_sheet.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
      
      {/* Printable Sheet Card */}
      <div className="glass-card">
        
        {/* Header toolbar (Hidden during print) */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderBottom: '1px solid var(--border-clean)', 
          paddingBottom: '1rem',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', color: 'white' }}>📋 Session Technical Sheet</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Print or export this report to PDF, CSV, or Markdown.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={handleExportCSV}>
              📥 Export CSV
            </button>
            <button className="btn-secondary" onClick={handleExportTXT}>
              📥 Export Markdown (.md)
            </button>
            <button className="btn-primary" onClick={handlePrint}>
              🖨️ Print / Save PDF
            </button>
          </div>
        </div>

        {/* Printable Content Block */}
        <div id="session-sheet-print-content">
          
          {/* 1. Title and basic metadata */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', color: 'white', marginBottom: '0.5rem' }}>
              {metadata['Document:Title'] || 'Studio One Song'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Project Sheet Generated on: {new Date().toLocaleDateString()}
            </p>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
              gap: '1rem', 
              marginTop: '1.5rem',
              borderTop: '1px solid var(--border-clean)',
              borderBottom: '1px solid var(--border-clean)',
              padding: '1rem 0'
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ARTIST</span>
                <div style={{ fontWeight: 600 }}>{metadata['Media:Artist'] || 'Unknown'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TEMPO</span>
                <div style={{ fontWeight: 600 }}>
                  {(() => {
                    const tempoStr = metadata['Media:Tempo'];
                    if (!tempoStr) return '120';
                    const tempo = parseFloat(tempoStr);
                    if (isNaN(tempo)) return tempoStr;
                    if (Math.abs(tempo - Math.round(tempo)) < 0.005) {
                      return Math.round(tempo).toString();
                    }
                    return (Math.round(tempo * 100) / 100).toString();
                  })()} BPM
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SIGNATURE</span>
                <div style={{ fontWeight: 600 }}>{metadata['Media:TimeSignatureNumerator'] || '4'}/{metadata['Media:TimeSignatureDenominator'] || '4'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>FORMAT</span>
                <div style={{ fontWeight: 600 }}>{metadata['Media:SampleRate'] || '48000'} Hz / {metadata['Media:BitDepth'] || '24'}b</div>
              </div>
            </div>
          </div>

          {/* 2. Tracks & Channels Master Table */}
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'white', marginBottom: '1rem' }}>
              📝 Mix Channel Specifications
            </h3>
            
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Track / Label</th>
                  <th>Type</th>
                  <th>Fader (dB)</th>
                  <th>Pan</th>
                  <th>Output Bus</th>
                  <th>Active Inserts (FX Chain)</th>
                  <th>Sends</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((chan, idx) => (
                  <tr key={idx} style={{ opacity: chan.mute ? 0.6 : 1 }}>
                    <td style={{ fontWeight: 600, color: 'white' }}>
                      {chan.label} {chan.mute && ' (Muted)'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{chan.type}</td>
                    <td style={{ fontWeight: 600 }}>{chan.gain_db}</td>
                    <td>{chan.pan_str}</td>
                    <td style={{ color: 'var(--accent-blue)', fontSize: '0.8rem' }}>{chan.destination || 'Main'}</td>
                    <td>
                      {chan.inserts.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem' }}>
                          {chan.inserts.map((ins, iidx) => (
                            <span key={iidx} style={{ color: ins.bypass ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                              • {ins.name} {ins.bypass && '(byp)'}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {chan.sends.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>-</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem' }}>
                          {chan.sends.map((snd, sidx) => (
                            <span key={sidx} style={{ color: snd.bypass ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                              ➡️ {snd.destination} ({snd.level})
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

      </div>

    </div>
  );
}
