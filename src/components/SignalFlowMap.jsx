import React from 'react';

export default function SignalFlowMap({ parsedData }) {
  const { channels } = parsedData;

  // Separate channels into logical routing nodes
  const sources = channels.filter(c => c.type === 'Audio Track' || c.type === 'Instrument (Synth)');
  const groups = channels.filter(c => c.type === 'Bus / Group');
  const outputs = channels.filter(c => c.type === 'Output');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
      <div className="glass-card">
        <h3 className="glass-card-header">🔗 signal Flow & Routing Map</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '2rem' }}>
          Visual topology of your session routing. Traces how audio moves from tracks (left) through group busses and send FX (middle) to reach the main stereo output (right).
        </p>

        {/* 3-Column Diagram */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1.2fr 1fr 0.8fr', 
          gap: '3rem', 
          alignItems: 'stretch',
          position: 'relative'
        }}>
          
          {/* Column 1: Source Tracks (Audio & Synth) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ color: 'white', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Tracks & Synths ({sources.length})
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '550px', overflowY: 'auto', paddingRight: '6px' }}>
              {sources.map((src, idx) => {
                let colorIndicator = 'rgba(255,255,255,0.05)';
                if (src.color && src.color !== 'N/A' && src.color.startsWith('FF')) {
                  colorIndicator = '#' + src.color.substring(2);
                }

                return (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-clean)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      borderLeft: `4px solid ${colorIndicator}`
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'white' }}>{src.label}</div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      <span>Out: <strong style={{ color: 'var(--text-primary)' }}>{src.destination || 'Main'}</strong></span>
                      {src.sends.length > 0 && (
                        <span style={{ color: 'var(--text-secondary)' }}>Sends: <strong>{src.sends.filter(s=>!s.bypass).length}</strong></span>
                      )}
                    </div>

                    {/* Active Sends list */}
                    {src.sends.filter(s=>!s.bypass).length > 0 && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', borderTop: '1px dashed var(--border-clean)', paddingTop: '4px' }}>
                        {src.sends.filter(s=>!s.bypass).map((snd, sidx) => (
                          <div key={sidx}>➡️ {snd.destination} ({snd.level})</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 2: Busses and FX Sends */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ color: 'white', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Sub-Busses & Send FX ({groups.length})
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {groups.length === 0 ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No subgroups or send auxes.</span>
              ) : (
                groups.map((group, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-clean)',
                      borderRadius: '6px',
                      padding: '0.85rem'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'white' }}>🎚️ {group.label}</div>
                    
                    {/* Routing info */}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      Routing: ➡️ **{group.destination || 'Main'}**
                    </div>

                    {/* Show what is routed to this bus */}
                    {(() => {
                      const routedSources = sources.filter(s => s.destination === group.label);
                      const routedSends = sources.filter(s => s.sends.some(snd => !snd.bypass && snd.destination === group.label));
                      
                      return (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px', borderTop: '1px solid var(--border-clean)', paddingTop: '6px' }}>
                          {routedSources.length > 0 && (
                            <div>
                              <span>Inflows:</span>
                              <div style={{ paddingLeft: '4px', fontWeight: 'bold' }}>
                                {routedSources.map(s => s.label).join(', ')}
                              </div>
                            </div>
                          )}
                          {routedSends.length > 0 && (
                            <div style={{ marginTop: '4px' }}>
                              <span>Send Inflows:</span>
                              <div style={{ paddingLeft: '4px', fontStyle: 'italic' }}>
                                {routedSends.map(s => s.label).join(', ')}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 3: Output Channels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ color: 'white', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Main Output
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {outputs.map((out, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--accent-primary)',
                    borderRadius: '6px',
                    padding: '1.25rem',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'white' }}>🔊 {out.label}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    Fader: **{out.gain_db}**
                  </div>
                  
                  {/* List active mastering plugins */}
                  {out.inserts.length > 0 && (
                    <div style={{ 
                      marginTop: '1.5rem', 
                      textAlign: 'left', 
                      fontSize: '0.75rem', 
                      borderTop: '1px solid var(--border-clean)', 
                      paddingTop: '1rem' 
                    }}>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>Master FX Rack:</div>
                      {out.inserts.map((ins, iidx) => (
                        <div key={iidx} style={{ 
                          padding: '3px 6px', 
                          background: 'rgba(0,0,0,0.3)', 
                          borderRadius: '4px', 
                          marginBottom: '4px',
                          border: '1px solid var(--border-clean)',
                          color: ins.bypass ? 'var(--text-muted)' : 'var(--text-primary)'
                        }}>
                          {ins.name} {ins.bypass && '(BYP)'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
