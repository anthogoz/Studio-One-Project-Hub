import React, { useState } from 'react';

export default function MixerConsole({ parsedData }) {
  const { channels } = parsedData;
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Output', 'Bus / Group', 'Instrument (Synth)', 'Audio Track'];

  const filteredChannels = selectedCategory === 'All' 
    ? channels 
    : channels.filter(ch => ch.type === selectedCategory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
          {/* Category selector filter */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            {categories.map((cat, idx) => (
              <button
                key={idx}
                className={`nav-tab ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '0.5rem 1.2rem',
                  borderRadius: '20px',
                  border: selectedCategory === cat ? 'none' : '1px solid var(--border-muted)',
                  background: selectedCategory === cat ? 'linear-gradient(135deg, #00f2fe, #4facfe)' : 'rgba(255,255,255,0.03)',
                  color: selectedCategory === cat ? 'var(--bg-primary)' : 'var(--text-secondary)'
                }}
              >
                {cat} ({cat === 'All' ? channels.length : channels.filter(c => c.type === cat).length})
              </button>
            ))}
          </div>

          {/* Horizontal scrolling mixer board */}
          <div style={{ 
            display: 'flex', 
            gap: '1.25rem', 
            overflowX: 'auto', 
            paddingBottom: '2rem',
            alignItems: 'flex-start',
            minHeight: '600px'
          }}>
            {filteredChannels.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No channels found in this category.</p>
            ) : (
              filteredChannels.map((ch, idx) => {
                const isMuted = ch.mute;
                const isSolo = ch.solo;
                
                // Get color indicator
                let colorIndicator = 'rgba(255,255,255,0.1)';
                if (ch.color && ch.color !== 'N/A' && ch.color.startsWith('FF')) {
                  colorIndicator = '#' + ch.color.substring(2);
                }
                
                return (
                  <div 
                    key={idx}
                    className="glass-card" 
                    style={{ 
                      width: '230px', 
                      flexShrink: 0, 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '1rem',
                      padding: '1rem',
                      borderTop: `4px solid ${colorIndicator}`,
                      position: 'relative'
                    }}
                  >
                    {/* Header */}
                    <div style={{ minHeight: '50px' }}>
                      <h4 style={{ color: 'white', fontSize: '1rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ch.label}>
                        {ch.label}
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                        {ch.type}
                      </span>
                    </div>

                    {/* Vertical Fader Column */}
                    <div style={{ 
                      height: '200px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '6px',
                      position: 'relative',
                      padding: '10px 0'
                    }}>
                      {/* dB Ticks background */}
                      <div style={{ 
                        position: 'absolute', 
                        right: '15px', 
                        height: '80%', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'space-between',
                        fontSize: '0.65rem',
                        color: 'var(--text-muted)',
                        pointerEvents: 'none'
                      }}>
                        <span>+10</span>
                        <span>0</span>
                        <span>-6</span>
                        <span>-12</span>
                        <span>-24</span>
                        <span>-∞</span>
                      </div>

                      {/* Fader slider container */}
                      <div style={{
                        transform: 'rotate(-90deg)',
                        width: '140px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {/* Visual slider track */}
                        <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', position: 'relative' }}>
                          {/* Active slot indicator (mock) */}
                          <div style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '18px',
                            height: '18px',
                            borderRadius: '3px',
                            background: 'var(--text-primary)',
                            border: '2px solid #00f2fe',
                            boxShadow: '0 0 5px #00f2fe'
                          }}></div>
                        </div>
                      </div>

                      <span style={{ color: '#00f2fe', fontWeight: 700, fontSize: '0.9rem', marginTop: '10px' }}>
                        {ch.gain_db}
                      </span>
                    </div>

                    {/* Panning & M/S controls */}
                    <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Pan</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'white' }}>{ch.pan_str}</span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {/* Mute button */}
                        <button style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '4px',
                          border: 'none',
                          fontWeight: 'bold',
                          fontSize: '0.75rem',
                          background: isMuted ? 'var(--accent-pink)' : 'rgba(255,255,255,0.05)',
                          color: isMuted ? 'white' : 'var(--text-secondary)'
                        }}>M</button>
                        {/* Solo button */}
                        <button style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '4px',
                          border: 'none',
                          fontWeight: 'bold',
                          fontSize: '0.75rem',
                          background: isSolo ? '#ffb900' : 'rgba(255,255,255,0.05)',
                          color: isSolo ? 'black' : 'var(--text-secondary)'
                        }}>S</button>
                      </div>
                    </div>

                    {/* Routing Output */}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-clean)', paddingTop: '0.5rem' }}>
                      Output: <strong style={{ color: 'var(--accent-blue)' }}>{ch.destination || 'Main'}</strong>
                    </div>

                    {/* Inserts Rack */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Inserts ({ch.inserts.length})
                      </span>
                      <div style={{ 
                        maxHeight: '120px', 
                        overflowY: 'auto', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '4px',
                        padding: '2px'
                      }}>
                        {ch.inserts.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No inserts</span>
                        ) : (
                          ch.inserts.map((ins, idx) => (
                            <div 
                              key={idx} 
                              style={{ 
                                fontSize: '0.75rem', 
                                padding: '4px 6px', 
                                background: ins.bypass ? 'rgba(255,255,255,0.02)' : 'rgba(79, 172, 254, 0.1)', 
                                borderRadius: '4px',
                                border: ins.bypass ? '1px dashed var(--border-clean)' : '1px solid rgba(79, 172, 254, 0.2)',
                                color: ins.bypass ? 'var(--text-muted)' : 'var(--text-primary)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                              title={ins.preset ? `Preset: ${ins.preset}` : ''}
                            >
                              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                                {ins.name}
                              </span>
                              {ins.bypass && <span style={{ fontSize: '0.6rem', color: 'var(--accent-pink)', fontWeight: 600 }}>BYP</span>}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Sends Rack */}
                    {ch.sends.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border-clean)', paddingTop: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                          Sends ({ch.sends.length})
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {ch.sends.map((snd, idx) => (
                            <div key={idx} style={{ 
                              fontSize: '0.7rem', 
                              color: snd.bypass ? 'var(--text-muted)' : 'var(--text-secondary)',
                              display: 'flex', 
                              justifyContent: 'space-between' 
                            }}>
                              <span style={{ textDecoration: snd.bypass ? 'line-through' : 'none' }}>➡️ {snd.destination}</span>
                              <span style={{ color: snd.bypass ? 'var(--text-muted)' : '#00f2fe' }}>{snd.level}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
      </div>
    </div>
  );
}
