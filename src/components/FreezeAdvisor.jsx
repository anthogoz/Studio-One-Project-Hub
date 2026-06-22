import React, { useMemo } from 'react';

export default function FreezeAdvisor({ parsedData }) {
  // 1. Database of CPU and latency estimations for VSTs
  const channelMetrics = useMemo(() => {
    if (!parsedData || !parsedData.channels) return [];

    return parsedData.channels.map(chan => {
      let latencyVal = 0;
      let cpuVal = 0;
      const heavyPlugins = [];

      if (chan.inserts && Array.isArray(chan.inserts)) {
        chan.inserts.forEach(plug => {
          if (plug.bypass) return; // ignore bypassed plugins

          const name = plug.name.toLowerCase();
          let latScore = 10; // base default
          let cpuScore = 15; // base default
          let isHeavy = false;

          // Latency Weight
          if (name.includes('vocalign') || name.includes('vocalign')) {
            latScore = 200;
            isHeavy = true;
          } else if (name.includes('rx') || name.includes('de-click') || name.includes('de-noise')) {
            latScore = 160;
            isHeavy = true;
          } else if (name.includes('melodyne')) {
            latScore = 150;
            isHeavy = true;
          } else if (name.includes('auto-tune') || name.includes('autotune')) {
            latScore = 120;
            isHeavy = true;
          } else if (name.includes('soothe')) {
            latScore = 90;
            isHeavy = true;
          } else if (name.includes('ozone')) {
            latScore = 80;
            isHeavy = true;
          } else if (name.includes('pro-l') || name.includes('limiter')) {
            latScore = 40;
          } else if (name.includes('valhalla') || name.includes('reverb') || name.includes('delay')) {
            latScore = 20;
          }

          // CPU Weight
          if (name.includes('kontakt')) {
            cpuScore = 95;
            isHeavy = true;
          } else if (name.includes('omnisphere')) {
            cpuScore = 90;
            isHeavy = true;
          } else if (name.includes('serum')) {
            cpuScore = 80;
            isHeavy = true;
          } else if (name.includes('nectar')) {
            cpuScore = 60;
            isHeavy = true;
          } else if (name.includes('neutron')) {
            cpuScore = 60;
            isHeavy = true;
          } else if (name.includes('labs')) {
            cpuScore = 40;
          } else if (name.includes('halftime')) {
            cpuScore = 30;
          } else if (name.includes('pro eq') || name.includes('compressor') || name.includes('gate')) {
            cpuScore = 5; // native stock are extremely light
            latScore = 0;
          }

          latencyVal += latScore;
          cpuVal += cpuScore;

          if (isHeavy) {
            heavyPlugins.push(plug.name);
          }
        });
      }

      // Final complexity index
      const complexityScore = Math.round((cpuVal * 0.6) + (latencyVal * 0.4));

      return {
        name: chan.label || chan.name || "Unnamed",
        type: chan.type || "Audio Track",
        color: chan.color,
        insertsCount: chan.inserts ? chan.inserts.length : 0,
        latencyVal,
        cpuVal,
        complexityScore,
        heavyPlugins,
        rawInserts: chan.inserts || []
      };
    });
  }, [parsedData]);

  // Leaders
  const sortedByLatency = useMemo(() => {
    return [...channelMetrics].sort((a, b) => b.latencyVal - a.latencyVal);
  }, [channelMetrics]);

  const sortedByCpu = useMemo(() => {
    return [...channelMetrics].sort((a, b) => b.cpuVal - a.cpuVal);
  }, [channelMetrics]);

  // Overall Project Stats
  const totals = useMemo(() => {
    let totalLatency = 0;
    let totalCpu = 0;
    let totalInserts = 0;
    channelMetrics.forEach(m => {
      totalLatency += m.latencyVal;
      totalCpu += m.cpuVal;
      totalInserts += m.insertsCount;
    });
    return { totalLatency, totalCpu, totalInserts };
  }, [channelMetrics]);

  // Freeze Candidates (Must be freezeable, i.e., Audio Tracks or Instruments. Busses/Outputs cannot be frozen)
  const freezeCandidates = useMemo(() => {
    return channelMetrics
      .filter(m => (m.type === 'Audio Track' || m.type === 'Instrument (Synth)') && m.insertsCount > 0)
      .sort((a, b) => b.complexityScore - a.complexityScore)
      .slice(0, 5);
  }, [channelMetrics]);

  return (
    <div style={{ maxWidth: '1000px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Introduction Card */}
      <div className="glass-card">
        <h2 className="glass-card-header">❄️ Freeze & Latency Advisor</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: '1.6' }}>
          Analyze active VST routing chains, processing delays, and heavy synth plugins. Freezing high-latency or resource-intensive tracks releases memory, lowers buffer strain, and stops DAW audio glitches.
        </p>

        {/* Global Summary Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.2rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Cumulative VST Inserts</span>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white', marginTop: '0.5rem' }}>{totals.totalInserts}</div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Active effects in mixer</span>
          </div>

          <div style={{
            background: totals.totalLatency > 500 ? 'rgba(255, 0, 127, 0.05)' : 'rgba(255,255,255,0.02)',
            padding: '1.2rem',
            borderRadius: '6px',
            border: totals.totalLatency > 500 ? '1px solid rgba(255, 0, 127, 0.2)' : '1px solid var(--border-clean)'
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Calculated Latency Weight</span>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: totals.totalLatency > 500 ? 'var(--accent-pink)' : 'white', marginTop: '0.5rem' }}>
              {totals.totalLatency} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>pts</span>
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Total buffering delay weight</span>
          </div>

          <div style={{
            background: totals.totalCpu > 1000 ? 'rgba(0, 242, 254, 0.05)' : 'rgba(255,255,255,0.02)',
            padding: '1.2rem',
            borderRadius: '6px',
            border: totals.totalCpu > 1000 ? '1px solid rgba(0, 242, 254, 0.2)' : '1px solid var(--border-clean)'
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Estimated CPU Strain</span>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: totals.totalCpu > 1000 ? 'var(--accent-cyan)' : 'white', marginTop: '0.5rem' }}>
              {totals.totalCpu > 1200 ? 'High 🔥' : totals.totalCpu > 600 ? 'Moderate ⚡' : 'Low 🟢'}
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Load based on active synth/FX density</span>
          </div>
        </div>
      </div>

      {/* Main Analysis Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem' }}>
        
        {/* Left: Latency & CPU Leaderboards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Latency Leaderboard */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              ⚠️ Top Processing Latency Channels
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {sortedByLatency.slice(0, 5).map((chan, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.01)',
                  border: '1px solid var(--border-clean)',
                  padding: '0.75rem 1rem',
                  borderRadius: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '4px', height: '24px', borderRadius: '2px', background: chan.color ? `#${chan.color.substring(2)}` : 'var(--text-muted)' }} />
                    <div>
                      <strong style={{ color: 'white', fontSize: '0.9rem' }}>{chan.name}</strong>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {chan.type} • {chan.insertsCount} inserts
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: chan.latencyVal > 100 ? 'var(--accent-pink)' : 'white'
                    }}>
                      {chan.latencyVal} pts
                    </span>
                    {chan.heavyPlugins.length > 0 && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--accent-pink)', marginTop: '0.15rem' }}>
                        {chan.heavyPlugins[0]}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CPU Leaderboard */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              ⚡ Top CPU Density Channels
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {sortedByCpu.slice(0, 5).map((chan, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.01)',
                  border: '1px solid var(--border-clean)',
                  padding: '0.75rem 1rem',
                  borderRadius: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '4px', height: '24px', borderRadius: '2px', background: chan.color ? `#${chan.color.substring(2)}` : 'var(--text-muted)' }} />
                    <div>
                      <strong style={{ color: 'white', fontSize: '0.9rem' }}>{chan.name}</strong>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {chan.type} • {chan.insertsCount} VSTs
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: chan.cpuVal > 100 ? 'var(--accent-cyan)' : 'white'
                    }}>
                      {chan.cpuVal} pts
                    </span>
                    {chan.heavyPlugins.some(p => p.toLowerCase().includes('kontakt') || p.toLowerCase().includes('omnisphere') || p.toLowerCase().includes('serum')) && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)', marginTop: '0.15rem' }}>
                        Synth/Sampler Load
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right: Recommendations & Optimization Tips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Candidates for Freeze */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1.2rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              ❄️ Freeze Recommendation candidates
            </h3>

            {freezeCandidates.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1.5rem' }}>
                No active audio or synth tracks found with plugins to freeze.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {freezeCandidates.map((chan, idx) => (
                  <div key={idx} style={{
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid var(--border-clean)',
                    borderRadius: '4px',
                    padding: '0.75rem 1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'white', fontSize: '0.85rem' }}>{chan.name}</span>
                      <span style={{
                        padding: '0.15rem 0.4rem',
                        borderRadius: '3px',
                        fontSize: '0.65rem',
                        fontWeight: 'bold',
                        background: 'rgba(0, 242, 254, 0.15)',
                        color: 'var(--accent-cyan)'
                      }}>
                        Rank #{idx + 1}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.4rem', lineHeight: '1.4' }}>
                      {chan.type} using <strong>{chan.insertsCount} inserts</strong>. Freezing this track will save approximately:
                    </div>
                    <ul style={{ paddingLeft: '1rem', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <li>~{Math.round(chan.cpuVal / totals.totalCpu * 100 || 0)}% of project VST processing load.</li>
                      <li>Remove {chan.latencyVal} pts latency from live recording path.</li>
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System Optimization Tips */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              🔧 DAW System Optimization Tips
            </h3>
            
            <ul style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              paddingLeft: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.8rem',
              lineHeight: '1.5'
            }}>
              <li>
                <strong>Increase Block Size (Buffer)</strong>: Set your audio interface buffer to **1024 or 2048 samples** during mixing sessions to give your CPU enough buffer time for inserts.
              </li>
              <li>
                <strong>Lower Buffer for Recording</strong>: Reduce block size to **64 or 128 samples** when recording vocals or MIDI synths to minimize latency. Temporarily freeze other backing tracks beforehand.
              </li>
              <li>
                <strong>Enable Dropout Protection</strong>: In Studio One, go to *Options / Preferences ➡️ Audio Setup ➡️ Processing* and set *Dropout Protection* to **High** or **Maximum**.
              </li>
              <li>
                <strong>Prefer VST3 over VST2</strong>: VST3 plugins support dynamic CPU suspension, meaning they do not consume CPU cycles when there is no audio passing through their channel.
              </li>
            </ul>
          </div>

        </div>

      </div>

    </div>
  );
}
