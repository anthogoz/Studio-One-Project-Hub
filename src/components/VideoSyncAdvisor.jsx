import React, { useState, useEffect, useMemo } from 'react';

export default function VideoSyncAdvisor({ songXmlDoc }) {
  // Parse VideoTrack from song XML if available
  const detectedVideo = useMemo(() => {
    if (!songXmlDoc) return null;
    try {
      const videoTrack = songXmlDoc.getElementsByTagName("VideoTrack")[0];
      if (videoTrack) {
        const name = videoTrack.getAttribute("name") || "Imported Video";
        const offsetBeats = parseFloat(videoTrack.getAttribute("videoStartOffset") || "0");
        const fps = parseFloat(videoTrack.getAttribute("frameRate") || "24");
        return { name, offsetBeats, fps };
      }
    } catch (e) {
      console.error("Error parsing video track XML:", e);
    }
    return null;
  }, [songXmlDoc]);

  // Extract song tempo
  const songTempo = useMemo(() => {
    if (!songXmlDoc) return 120;
    try {
      const tempoMatch = songXmlDoc.documentElement.innerHTML.match(/tempo="([^"]+)"/);
      if (tempoMatch) {
        const t = parseFloat(tempoMatch[1]);
        if (t > 0) return parseFloat((60 / t).toFixed(2));
      }
    } catch (e) {
      console.error(e);
    }
    return 120;
  }, [songXmlDoc]);

  // Advisor States
  const [videoName, setVideoName] = useState('weird_beat_scene_1.mp4');
  const [fps, setFps] = useState(24);
  const [startOffsetStr, setStartOffsetStr] = useState('01:00:00:00'); // SMPTE standard start
  const [cues, setCues] = useState([
    { id: 1, name: 'Intro Beat Hit', beat: 1, description: 'Drums enter, setting the groove.' },
    { id: 2, name: 'Tension Riser', beat: 33, description: 'Sweep starts rising, tension builds.' },
    { id: 3, name: 'The Drop (Beat Change)', beat: 49, description: 'Kick drops, pads and whistle melody enter.' },
    { id: 4, name: 'Outro Transition', beat: 97, description: 'Fade out of main drums, sweep resolves.' }
  ]);

  // Form states for new cue
  const [newCueName, setNewCueName] = useState('');
  const [newCueBeat, setNewCueBeat] = useState(1);
  const [newCueDesc, setNewCueDesc] = useState('');

  // Synchronize states with detected video if present
  useEffect(() => {
    if (detectedVideo) {
      setVideoName(detectedVideo.name);
      setFps(detectedVideo.fps);
      // convert offsetBeats to SMPTE offset
      const offsetSec = (detectedVideo.offsetBeats / songTempo) * 60;
      setStartOffsetStr(secondsToTimecodeStr(offsetSec, detectedVideo.fps));
    }
  }, [detectedVideo, songTempo]);

  // Helper: SMPTE Timecode String parser
  function timecodeStrToSeconds(tcStr, frameRate) {
    try {
      const parts = tcStr.split(':').map(Number);
      if (parts.length !== 4) return 0;
      const [h, m, s, f] = parts;
      return h * 3600 + m * 60 + s + f / frameRate;
    } catch (e) {
      return 0;
    }
  }

  // Helper: Seconds to SMPTE string formatter
  function secondsToTimecodeStr(totalSecs, frameRate) {
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = Math.floor(totalSecs % 60);
    const frames = Math.floor((totalSecs % 1) * frameRate);

    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
  }

  // Parse start offset seconds
  const startOffsetSeconds = useMemo(() => {
    return timecodeStrToSeconds(startOffsetStr, fps);
  }, [startOffsetStr, fps]);

  // Convert a song beat to SMPTE timecode
  const getBeatTimecode = (beat) => {
    // seconds from start of song
    const songSeconds = ((beat - 1) / songTempo) * 60;
    const totalSeconds = startOffsetSeconds + songSeconds;
    return secondsToTimecodeStr(totalSeconds, fps);
  };

  // Convert a song beat to clean time format (Minutes:Seconds.Milliseconds)
  const getBeatRealTime = (beat) => {
    const songSeconds = ((beat - 1) / songTempo) * 60;
    const mins = Math.floor(songSeconds / 60);
    const secs = Math.floor(songSeconds % 60);
    const ms = Math.floor((songSeconds % 1) * 1000);
    return `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };

  const handleAddCue = (e) => {
    e.preventDefault();
    if (!newCueName.trim()) return;

    const nextId = cues.length > 0 ? Math.max(...cues.map(c => c.id)) + 1 : 1;
    const newCue = {
      id: nextId,
      name: newCueName.trim(),
      beat: parseFloat(newCueBeat) || 1,
      description: newCueDesc.trim() || 'No description provided.'
    };

    const updated = [...cues, newCue].sort((a, b) => a.beat - b.beat);
    setCues(updated);
    setNewCueName('');
    setNewCueDesc('');
  };

  const handleDeleteCue = (id) => {
    setCues(cues.filter(c => c.id !== id));
  };

  const handleExportCSV = () => {
    let csv = 'Cue Name,Beat/Bar,Real Time,Timecode (SMPTE),Description\n';
    cues.forEach(cue => {
      const tc = getBeatTimecode(cue.beat);
      const rt = getBeatRealTime(cue.beat);
      csv += `"${cue.name.replace(/"/g, '""')}",${cue.beat},"${rt}","${tc}","${cue.description.replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cue_sheet_${videoName.replace(/\.[^/.]+$/, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    let md = `# 🎬 Film Scoring Cue Sheet: ${videoName}\n\n`;
    md += `* **Song Tempo**: ${songTempo} BPM\n`;
    md += `* **Video Framerate**: ${fps} fps\n`;
    md += `* **SMPTE Start Offset**: ${startOffsetStr}\n\n`;
    md += `| Cue Name | Beat | Real Time | Timecode (SMPTE) | Description |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    cues.forEach(cue => {
      md += `| **${cue.name}** | Beat ${cue.beat} | ${getBeatRealTime(cue.beat)} | \`${getBeatTimecode(cue.beat)}\` | ${cue.description} |\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cue_sheet_${videoName.replace(/\.[^/.]+$/, "")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Informative Header */}
      <div className="glass-card">
        <h2 className="glass-card-header">🎬 Video Sync & Cue Sheet Advisor</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          Align your beats to film frames. Calculate timecodes based on the song tempo and customize cue points. 
          Studio One metadata can automatically set video parameters.
        </p>

        {detectedVideo ? (
          <div style={{ background: 'rgba(0, 242, 254, 0.05)', border: '1px solid rgba(0, 242, 254, 0.2)', padding: '0.8rem 1.25rem', borderRadius: '6px', fontSize: '0.85rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🎥</span>
            <span><strong>Video Track Detected in Song file:</strong> "{detectedVideo.name}" running at {detectedVideo.fps} FPS. Synchronized successfully.</span>
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-clean)', padding: '0.8rem 1.25rem', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>ℹ️</span>
            <span>No video track detected in the active project file. Showing simulation mode. Feel free to customize the video settings below.</span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem' }}>
        
        {/* Left: Interactive Cue Sheet List */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', color: 'white', margin: 0 }}>Sync Cues & Markers List</h3>
              
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }} onClick={handleExportCSV}>
                  📄 Export CSV
                </button>
                <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }} onClick={handleExportMarkdown}>
                  📝 Export Markdown
                </button>
              </div>
            </div>

            {cues.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '4rem', fontSize: '0.9rem' }}>
                No cue markers defined yet. Add sync points on the right panel.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-clean)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem 0.25rem' }}>Cue Name</th>
                      <th>Location</th>
                      <th>Real Time</th>
                      <th>Timecode (SMPTE)</th>
                      <th>Description</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cues.map((cue, idx) => (
                      <tr key={cue.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', verticalAlign: 'top' }}>
                        <td style={{ padding: '0.8rem 0.25rem', fontWeight: 600, color: 'white' }}>{cue.name}</td>
                        <td style={{ padding: '0.8rem 0' }}>
                          <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Beat {cue.beat}</span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Bar {Math.floor((cue.beat - 1) / 4) + 1}</div>
                        </td>
                        <td style={{ padding: '0.8rem 0', color: 'var(--text-secondary)' }}>{getBeatRealTime(cue.beat)}</td>
                        <td style={{ padding: '0.8rem 0' }}>
                          <code style={{ background: 'rgba(255,255,255,0.04)', padding: '0.15rem 0.35rem', borderRadius: '3px', color: 'var(--accent-cyan)', fontSize: '0.8rem' }}>
                            {getBeatTimecode(cue.beat)}
                          </code>
                        </td>
                        <td style={{ padding: '0.8rem 0', color: 'var(--text-muted)', maxWidth: '200px' }}>{cue.description}</td>
                        <td style={{ padding: '0.8rem 0', textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteCue(cue.id)}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem' }}
                            title="Delete Cue"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Timecode Formula Notice */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-clean)', padding: '0.75rem', borderRadius: '4px', marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            <strong>💡 Sync Calculation:</strong> SMPTE = Offset ({startOffsetStr}) + ((Beat - 1) / Tempo ({songTempo} BPM)) * 60 seconds @ {fps} fps.
          </div>
        </div>

        {/* Right: Settings & Input Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Settings Card */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              Video Sync Settings
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Video File Name</label>
                <input
                  type="text"
                  value={videoName}
                  onChange={(e) => setVideoName(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Frame Rate (FPS)</label>
                  <select
                    value={fps}
                    onChange={(e) => setFps(parseFloat(e.target.value))}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem' }}
                  >
                    <option value="23.976">23.976 (Film)</option>
                    <option value="24">24 (True Film)</option>
                    <option value="25">25 (PAL / Europe)</option>
                    <option value="29.97">29.97 (NTSC)</option>
                    <option value="30">30 (NTSC High)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Tempo (BPM)</label>
                  <input
                    type="text"
                    value={songTempo}
                    disabled
                    style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem', outline: 'none', cursor: 'not-allowed' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>SMPTE Start Offset</label>
                <input
                  type="text"
                  value={startOffsetStr}
                  onChange={(e) => setStartOffsetStr(e.target.value)}
                  placeholder="HH:MM:SS:FF"
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem', outline: 'none', fontFamily: 'monospace' }}
                />
              </div>
            </div>
          </div>

          {/* Form to add marker */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              Add Sync Cue Marker
            </h3>

            <form onSubmit={handleAddCue} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Cue Point Name</label>
                <input
                  type="text"
                  value={newCueName}
                  onChange={(e) => setNewCueName(e.target.value)}
                  placeholder="e.g. Explosion Peak, Scene Transition"
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Grid Position (Beat)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.25"
                    value={newCueBeat}
                    onChange={(e) => setNewCueBeat(parseFloat(e.target.value) || 1)}
                    style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem', outline: 'none' }}
                  />
                </div>
                
                <div style={{ paddingTop: '1.1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Calculated SMPTE:</div>
                  <code style={{ color: 'var(--accent-cyan)', fontSize: '0.85rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
                    {getBeatTimecode(newCueBeat)}
                  </code>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Description / Action Note</label>
                <textarea
                  value={newCueDesc}
                  onChange={(e) => setNewCueDesc(e.target.value)}
                  placeholder="Description of visual cues or sync action..."
                  rows={2}
                  style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-clean)', borderRadius: '4px', fontSize: '0.85rem', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', fontWeight: 600 }}>
                ➕ Create Sync Marker
              </button>
            </form>
          </div>

        </div>

      </div>

    </div>
  );
}
