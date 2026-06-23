import React, { useMemo } from 'react';

export default function SampleHealthAudit({ parsedData }) {
  const currentHz = parsedData?.metadata?.['Media:SampleRate'] || '44100';
  const projectKhz = `${(parseInt(currentHz, 10) / 1000).toFixed(1)} kHz`;
  
  const clips = parsedData?.audioClips || [];

  // Analyze clips
  const auditResults = useMemo(() => {
    const totalClips = clips.length;
    if (totalClips === 0) return { totalClips: 0, mismatched: [], score: 100, status: 'Clean' };

    const mismatched = [];
    clips.forEach(clip => {
      const clipRate = parseInt(clip.sample_rate, 10);
      const projectRate = parseInt(currentHz, 10);
      
      if (clipRate && projectRate && clipRate !== projectRate) {
        mismatched.push({
          name: clip.name,
          sampleRate: `${(clipRate / 1000).toFixed(1)} kHz`,
          channels: clip.channels === '2' ? 'Stereo' : 'Mono',
          bitDepth: `${clip.bit_depth} bit`,
          useCount: clip.use_count
        });
      }
    });

    const mismatchedCount = mismatched.length;
    const ratio = mismatchedCount / totalClips;
    
    // Score calculation
    let score = Math.round(100 - (ratio * 100));
    if (score < 0) score = 0;

    let status = 'Excellent';
    let statusColor = 'var(--accent-cyan)';
    let description = 'All loaded samples match your project sample rate. No unnecessary real-time resampling CPU overhead.';

    if (ratio > 0 && ratio <= 0.10) {
      status = 'Warning';
      statusColor = '#fbbf24'; // yellow
      description = 'A few audio clips do not match your project sample rate. Studio One will resample them on the fly, resulting in minor CPU overhead.';
    } else if (ratio > 0.10 && ratio <= 0.30) {
      status = 'Caution';
      statusColor = '#f97316'; // orange
      description = 'Moderate sample rate mismatch detected. Real-time resampling is adding measurable CPU overhead to your audio processing chain.';
    } else if (ratio > 0.30) {
      status = 'Alert';
      statusColor = '#ef4444'; // red
      description = 'High ratio of mismatched sample rates! Studio One is heavily loaded with real-time resampling on audio tracks. We recommend converting these samples or bouncing them to improve latency and CPU performance.';
    }

    return {
      totalClips,
      mismatched,
      score,
      status,
      statusColor,
      description
    };
  }, [clips, currentHz]);

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ maxWidth: '850px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Overview Card */}
      <div className="glass-card">
        <h2 className="glass-card-header">🧬 CPU Sample Health Auditor</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: '1.6' }}>
          Real-time sample rate conversion consumes CPU cycles in Studio One. This tool audits all audio files currently loaded in your song's Media Pool and flags any files that don't match the project rate, helping you optimize DAW latency and CPU weight.
        </p>

        {/* Audit Score Meter */}
        <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.3fr', gap: '2rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-clean)', padding: '1.5rem', borderRadius: '8px', alignItems: 'center' }}>
          
          {/* Circular Score display */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border-clean)', paddingRight: '2rem' }}>
            <div style={{
              width: '110px', height: '110px',
              borderRadius: '50%',
              border: `6px solid ${auditResults.statusColor}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 20px rgba(255,255,255,0.01), inset 0 0 15px rgba(255,255,255,0.01)`
            }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'white' }}>{auditResults.score}%</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold', marginTop: '0.2rem' }}>Health Score</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Project Rate:</span>
              <strong style={{ color: 'white', fontSize: '0.95rem' }}>{projectKhz}</strong>
              <span style={{ margin: '0 0.5rem', color: 'var(--border-clean)' }}>|</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Status:</span>
              <strong style={{ color: auditResults.statusColor, fontSize: '0.95rem', textTransform: 'uppercase' }}>{auditResults.status}</strong>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.75rem', lineHeight: '1.5' }}>
              {auditResults.description}
            </p>

            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Total Clips: <strong>{auditResults.totalClips}</strong></span>
              <span>Mismatched Rate: <strong style={{ color: auditResults.mismatched.length > 0 ? '#f97316' : 'var(--text-secondary)' }}>{auditResults.mismatched.length}</strong></span>
            </div>
          </div>

        </div>
      </div>

      {/* Mismatched List */}
      {auditResults.mismatched.length > 0 ? (
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
            Mismatched Audio Clips List ({auditResults.mismatched.length})
          </h3>

          <div style={{ overflowY: 'auto', maxHeight: '350px', border: '1px solid var(--border-clean)', borderRadius: '8px' }}>
            <table className="premium-table" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Clip Name</th>
                  <th>Clip Sample Rate</th>
                  <th>Project Sample Rate</th>
                  <th>Channels & Format</th>
                  <th style={{ textAlign: 'center' }}>Active Uses</th>
                </tr>
              </thead>
              <tbody>
                {auditResults.mismatched.map((clip, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600, color: 'white', wordBreak: 'break-all', fontFamily: 'monospace' }}>{clip.name}</td>
                    <td style={{ color: '#f97316', fontWeight: 600 }}>{clip.sampleRate}</td>
                    <td style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{projectKhz}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{clip.channels} ({clip.bitDepth})</td>
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{clip.useCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '1.5rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-clean)', padding: '1rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            <strong style={{ color: 'white' }}>💡 Optimization Tips:</strong>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <li>Inside Studio One, select the mismatched track, right-click, and choose <strong>"Bounce To New Track"</strong>. S1 will physically write a new file at the correct project sample rate.</li>
              <li>Alternatively, you can export your tracks as stems, which forces Studio One to export all audio files matching the project sample rate, eliminating resampling overhead for mixdown.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed var(--border-clean)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }}>🎉</span>
          <h3 style={{ color: 'white', margin: '0 0 0.5rem 0' }}>Perfect CPU Performance!</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '500px', margin: '0 auto' }}>
            All loaded audio files in this project match the target sample rate of {projectKhz}. Your CPU is 100% free of real-time resampling calculations.
          </p>
        </div>
      )}

    </div>
  );
}
