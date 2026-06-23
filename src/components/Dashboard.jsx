import React, { useState } from 'react';
import CollabMemo from './CollabMemo';
import SessionSheet from './SessionSheet';

export default function Dashboard({ parsedData, currentProject, xmls }) {
  const [activeSubTab, setActiveSubTab] = useState('stats');
  const [showSessionSheet, setShowSessionSheet] = useState(false);

  const { metadata, markers, tracks, channels } = parsedData;

  // Calculate length
  const lengthSec = parseFloat(metadata['Media:Length'] || 0);
  const minutes = Math.floor(lengthSec / 60);
  const seconds = Math.floor(lengthSec % 60);

  // Categorize tracks
  const audioTracks = tracks.filter(t => t.type === 'Audio Track');
  const instTracks = tracks.filter(t => t.type === 'Instrument (Synth)');
  const automationTracks = tracks.filter(t => t.type === 'AutomationTrack');

  // CPU Complexity Rating
  let totalPlugins = 0;
  let heavyPlugins = 0;
  channels.forEach(ch => {
    ch.inserts.forEach(ins => {
      totalPlugins++;
      const name = ins.name.toLowerCase();
      if (
        name.includes('omnisphere') ||
        name.includes('zenology') ||
        name.includes('contact') ||
        name.includes('kontakt') ||
        name.includes('soothe') ||
        name.includes('ozone') ||
        name.includes('valhalla')
      ) {
        heavyPlugins++;
      }
    });
  });

  const getComplexityRating = () => {
    const score = (totalPlugins * 0.5) + (heavyPlugins * 2.5);
    if (score < 15) return { text: 'Low 🟢', desc: 'Lightweight project. Will run easily on any setup.' };
    if (score < 40) return { text: 'Moderate 🟡', desc: 'Standard project size. Runs well on average hardware.' };
    return { text: 'High 🔴', desc: 'Heavy CPU loads. Freezing heavy instrument tracks recommended.' };
  };

  const rating = getComplexityRating();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Upper toolbar / Sub-tabs */}
      <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setActiveSubTab('stats')}
            style={{
              background: activeSubTab === 'stats' ? 'white' : 'transparent',
              color: activeSubTab === 'stats' ? 'black' : 'var(--text-secondary)',
              border: activeSubTab === 'stats' ? '1px solid white' : '1px solid var(--border-clean)',
              fontWeight: 600,
              fontSize: '0.85rem',
              padding: '0.4rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            📊 Overview & Stats
          </button>
          <button
            onClick={() => setActiveSubTab('collab')}
            style={{
              background: activeSubTab === 'collab' ? 'white' : 'transparent',
              color: activeSubTab === 'collab' ? 'black' : 'var(--text-secondary)',
              border: activeSubTab === 'collab' ? '1px solid white' : '1px solid var(--border-clean)',
              fontWeight: 600,
              fontSize: '0.85rem',
              padding: '0.4rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🤝 Collaboration Space
          </button>
        </div>

        <button 
          className="btn-primary" 
          onClick={() => setShowSessionSheet(true)}
          style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          📋 Technical Session Sheet
        </button>
      </div>

      {/* Main Tab Area */}
      {activeSubTab === 'stats' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
          {/* 1. Stat Cards Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Tempo</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', fontWeight: 800, color: '#38bdf8' }}>
                {(() => {
                  const tempoStr = metadata['Media:Tempo'];
                  if (!tempoStr) return '120';
                  const tempo = parseFloat(tempoStr);
                  if (isNaN(tempo)) return tempoStr;
                  if (Math.abs(tempo - Math.round(tempo)) < 0.005) {
                    return Math.round(tempo).toString();
                  }
                  return (Math.round(tempo * 100) / 100).toString();
                })()} <span style={{ fontSize: '1rem', fontWeight: 500 }}>BPM</span>
              </span>
            </div>

            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Length</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', fontWeight: 800, color: '#3b82f6' }}>
                {minutes}m {seconds}s
              </span>
            </div>

            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Format</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 800, color: 'white', marginTop: '0.5rem' }}>
                {metadata['Media:SampleRate'] ? `${parseInt(metadata['Media:SampleRate'])/1000} kHz` : '48 kHz'}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                {metadata['Media:BitDepth'] || '24'}-bit / {metadata['Media:TimeSignatureNumerator'] || '4'}/{metadata['Media:TimeSignatureDenominator'] || '4'}
              </span>
            </div>

            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Tracks</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', fontWeight: 800, color: '#a855f7' }}>
                {tracks.length}
              </span>
            </div>
          </div>

          {/* 2. Middle Row: Track counts & CPU Audits */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
            <div className="glass-card">
              <h3 className="glass-card-header">📋 Track Breakdown</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  <h4 style={{ color: '#38bdf8' }}>Audio Tracks</h4>
                  <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>{audioTracks.length}</p>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  <h4 style={{ color: '#ec4899' }}>VST Instruments</h4>
                  <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>{instTracks.length}</p>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  <h4 style={{ color: '#3b82f6' }}>Automation Tracks</h4>
                  <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>{automationTracks.length}</p>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  <h4 style={{ color: 'white' }}>Group Buses</h4>
                  <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>
                    {channels.filter(c => c.type === 'Bus / Group').length}
                  </p>
                </div>
              </div>
            </div>

            {/* CPU Complexity Estimator */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 className="glass-card-header">⚡ Estimated CPU Complexity</h3>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{rating.text}</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  {rating.desc}
                </p>
              </div>
              
              <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-clean)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                  <span>Total FX Inserts</span>
                  <span style={{ fontWeight: 600 }}>{totalPlugins}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>Heavy VST Plugins (Omnisphere, Soothe...)</span>
                  <span style={{ fontWeight: 600, color: '#ec4899' }}>{heavyPlugins}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Timeline / Structure Section */}
          <div className="glass-card">
            <h3 className="glass-card-header">📍 Arrangement Structure (Markers)</h3>
            {markers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No arrangement markers defined in this song.</p>
            ) : (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', position: 'relative', margin: '2rem 1rem' }}>
                  {markers.map((m, idx) => {
                    const maxBar = 350; 
                    const startBar = parseInt(m.start || 0);
                    const percent = Math.min(100, (startBar / maxBar) * 100);
                    
                    return (
                      <div
                        key={idx}
                        style={{
                          position: 'absolute',
                          left: `${percent}%`,
                          transform: 'translateX(-50%)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#38bdf8', border: '2px solid var(--bg-primary)' }}></div>
                        <span style={{ fontSize: '0.8rem', color: 'white', marginTop: '8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{m.name}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Bar {startBar}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <CollabMemo parsedData={parsedData} currentProject={currentProject} xmls={xmls} />
      )}

      {/* 4. Fullscreen Modal for Printable Session Sheet */}
      {showSessionSheet && (
        <div className="session-sheet-modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '2rem'
        }}>
          <div className="glass-card session-sheet-modal-card" style={{
            width: '90%',
            maxWidth: '1200px',
            height: '90%',
            overflowY: 'auto',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-focus)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal close button */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.5rem' }}>
              <button 
                onClick={() => setShowSessionSheet(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.5rem 1rem'
                }}
              >
                ✕ Close
              </button>
            </div>
            
            {/* Embedded Session Sheet content */}
            <div style={{ padding: '0 2rem 2rem 2rem', flex: 1 }}>
              <SessionSheet parsedData={parsedData} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
