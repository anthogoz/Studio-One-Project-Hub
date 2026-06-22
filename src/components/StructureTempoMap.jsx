import React, { useMemo } from 'react';

export default function StructureTempoMap({ songXmlDoc, parsedData }) {
  const { markers } = parsedData;

  // 1. Extract Tempo Map Segments
  const tempoSegments = useMemo(() => {
    if (!songXmlDoc) return [];
    const segments = [];
    const nodes = songXmlDoc.getElementsByTagName("TempoMapSegment");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const start = parseFloat(node.getAttribute("start") || "0");
      const end = parseFloat(node.getAttribute("end") || "0");
      const tempo = parseFloat(node.getAttribute("tempo") || "0.5");
      // BPM = 60 / tempo
      const bpm = tempo > 0 ? parseFloat((60 / tempo).toFixed(1)) : 120.0;
      segments.push({ start, end, bpm });
    }
    return segments;
  }, [songXmlDoc]);

  // 2. Extract Time Signatures
  const timeSignatures = useMemo(() => {
    if (!songXmlDoc) return [];
    const list = [];
    const nodes = songXmlDoc.getElementsByTagName("TimeSignatureMapSegment");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const start = parseFloat(node.getAttribute("start") || "0");
      const num = node.getAttribute("numerator") || "4";
      const den = node.getAttribute("denominator") || "4";
      list.push({ start, label: `${num}/${den}` });
    }
    return list;
  }, [songXmlDoc]);

  // 3. Extract Key Signatures
  const keySignatures = useMemo(() => {
    if (!songXmlDoc) return [];
    const list = [];
    const keyMap = songXmlDoc.getElementsByTagName("KeySignatureMap")[0];
    if (keyMap) {
      const attrsList = keyMap.getElementsByTagName("Attributes");
      for (let i = 0; i < attrsList.length; i++) {
        const attrs = attrsList[i];
        const rootVal = attrs.getAttribute("root") || "0";
        const scaleVal = attrs.getAttribute("scale") || "";
        const start = parseFloat(attrs.getAttribute("start") || "0");
        
        const keyNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const rootIndex = parseInt(rootVal);
        const keyName = keyNames[rootIndex] || "C";
        const scaleLabel = scaleVal.toLowerCase().includes("minor") ? "Minor" : "Major";
        
        list.push({ start, label: `${keyName} ${scaleLabel}` });
      }
    }
    return list;
  }, [songXmlDoc]);

  // Max length of song in seconds/beats to draw timeline boundaries
  // Use markers or fall back to 300 beats
  const songLengthBeats = useMemo(() => {
    if (markers.length === 0) return 300;
    const endMarker = markers.find(m => m.name.toLowerCase() === 'fin' || m.type === '3');
    if (endMarker) {
      return parseFloat(endMarker.start);
    }
    return Math.max(...markers.map(m => parseFloat(m.start))) + 20;
  }, [markers]);

  // Color generator for marker blocks
  const getMarkerColor = (name) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('intro')) return '#52525b'; // Zinc 600
    if (lowerName.includes('verse') || lowerName.includes('couplet')) return '#27272a'; // Zinc 800
    if (lowerName.includes('chorus') || lowerName.includes('refrain')) return 'white'; // White
    if (lowerName.includes('bridge') || lowerName.includes('pont')) return '#3f3f46'; // Zinc 700
    if (lowerName.includes('solo')) return '#71717a';
    return '#18181b'; // Default dark card bg
  };

  const getMarkerTextColor = (name) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('chorus') || lowerName.includes('refrain')) return '#09090b';
    return 'white';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
      <div className="glass-card">
        <h3 className="glass-card-header">🎵 Interactive Song Structure & Tempo Map</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          This visualizer displays the arrangement structure (based on project markers) and the master tempo curve (BPM changes) mapped directly from the song's internal tempo maps.
        </p>

        {/* Global Track Signatures */}
        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Master Tempo: </span>
            <strong style={{ color: 'white' }}>{tempoSegments[0]?.bpm || 120} BPM</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Time Signature: </span>
            <strong style={{ color: 'white' }}>{timeSignatures[0]?.label || '4/4'}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Key Signature: </span>
            <strong style={{ color: 'white' }}>{keySignatures[0]?.label || 'C Major'}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Arrangement Width: </span>
            <strong style={{ color: 'white' }}>{Math.round(songLengthBeats)} Beats</strong>
          </div>
        </div>

        {/* 1. Arranger Marker Timeline blocks */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h4 style={{ color: 'white', marginBottom: '1rem', fontSize: '0.95rem' }}>
            📅 Marker Blocks & Arrangement Sections
          </h4>
          
          {markers.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '1rem', border: '1px dashed var(--border-clean)', borderRadius: '6px', textAlign: 'center' }}>
              No markers defined in this project.
            </p>
          ) : (
            <div style={{ 
              position: 'relative', 
              height: '60px', 
              background: '#09090b', 
              borderRadius: '6px', 
              border: '1px solid var(--border-clean)', 
              overflow: 'hidden',
              display: 'flex'
            }}>
              {/* Build blocks between markers */}
              {markers
                .sort((a, b) => parseFloat(a.start) - parseFloat(b.start))
                .map((m, idx, arr) => {
                  const startPos = parseFloat(m.start);
                  const endPos = idx < arr.length - 1 ? parseFloat(arr[idx + 1].start) : songLengthBeats;
                  const widthPercent = Math.max(2, ((endPos - startPos) / songLengthBeats) * 100);
                  
                  return (
                    <div
                      key={idx}
                      style={{
                        width: `${widthPercent}%`,
                        background: getMarkerColor(m.name),
                        borderRight: '1px solid var(--border-clean)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '4px',
                        cursor: 'default',
                        transition: 'opacity 0.15s ease'
                      }}
                      title={`${m.name} (Start: ${startPos} beats)`}
                    >
                      <span style={{ 
                        color: getMarkerTextColor(m.name), 
                        fontSize: '0.75rem', 
                        fontWeight: 600, 
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        width: '100%'
                      }}>
                        {m.name}
                      </span>
                      <span style={{ 
                        fontSize: '0.65rem', 
                        color: getMarkerTextColor(m.name) === '#09090b' ? 'rgba(0,0,0,0.6)' : 'var(--text-secondary)'
                      }}>
                        {Math.round(startPos)}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* 2. Tempo BPM Curve plot */}
        <div>
          <h4 style={{ color: 'white', marginBottom: '1rem', fontSize: '0.95rem' }}>
            📈 Master Tempo Envelope (BPM changes)
          </h4>

          <div style={{ background: '#09090b', border: '1px solid var(--border-clean)', borderRadius: '6px', padding: '1.5rem 1rem' }}>
            {/* Draw a basic line plot of the BPM curve */}
            <svg viewBox="0 0 1000 150" width="100%" height="150" style={{ overflow: 'visible' }}>
              {/* Grid lines */}
              <line x1="0" y1="20" x2="1000" y2="20" stroke="var(--border-clean)" strokeDasharray="3,3" />
              <line x1="0" y1="75" x2="1000" y2="75" stroke="var(--border-clean)" strokeDasharray="3,3" />
              <line x1="0" y1="130" x2="1000" y2="130" stroke="var(--border-clean)" strokeDasharray="3,3" />
              
              {/* Plot Path */}
              {tempoSegments.length > 0 && (
                (() => {
                  let pathD = "";
                  
                  // Map points to SVG coordinates
                  // X ranges from 0 to 1000 representing beats
                  // Y ranges from 130 to 20 representing BPM (between min and max BPM)
                  const bpms = tempoSegments.map(s => s.bpm);
                  const maxBpm = Math.max(...bpms, 140);
                  const minBpm = Math.min(...bpms, 80);
                  const bpmRange = maxBpm - minBpm || 10;

                  const getX = (beats) => (beats / songLengthBeats) * 1000;
                  const getY = (bpm) => 130 - ((bpm - minBpm) / bpmRange) * 110;

                  // Initial point
                  pathD += `M 0 ${getY(tempoSegments[0].bpm)}`;

                  tempoSegments.forEach((s, idx) => {
                    const startX = getX(s.start);
                    const endX = s.end > 1e100 ? 1000 : getX(s.end);
                    const y = getY(s.bpm);
                    
                    pathD += ` L ${startX} ${y}`;
                    pathD += ` L ${endX} ${y}`;
                  });

                  return (
                    <>
                      <path
                        d={pathD}
                        fill="none"
                        stroke="white"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Dots on tempo changes */}
                      {tempoSegments.map((s, idx) => {
                        if (s.start === 0 && idx === 0) return null;
                        const x = getX(s.start);
                        const y = getY(s.bpm);
                        return (
                          <g key={idx}>
                            <circle cx={x} cy={y} r="4" fill="white" stroke="#09090b" strokeWidth="1" />
                            <text x={x} y={y - 10} fill="var(--text-secondary)" fontSize="10" textAnchor="middle" fontFamily="monospace">
                              {s.bpm} BPM
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()
              )}

              {/* Grid text labels */}
              {tempoSegments.length > 0 && (
                (() => {
                  const bpms = tempoSegments.map(s => s.bpm);
                  const maxBpm = Math.max(...bpms, 140);
                  const minBpm = Math.min(...bpms, 80);
                  return (
                    <>
                      <text x="10" y="16" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">{Math.round(maxBpm)} BPM</text>
                      <text x="10" y="79" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">{Math.round((maxBpm + minBpm) / 2)} BPM</text>
                      <text x="10" y="142" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">{Math.round(minBpm)} BPM</text>
                    </>
                  );
                })()
              )}
            </svg>
          </div>
        </div>

      </div>
    </div>
  );
}
