import React, { useState } from 'react';
import StructureTempoMap from './StructureTempoMap';
import PianoRoll from './PianoRoll';
import AutomationPlotter from './AutomationPlotter';

export default function PerformanceHub({ songXmlDoc, parsedData, songPath }) {
  const [activeSubTab, setActiveSubTab] = useState('pianoroll');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Common Arranger Ruler / Structure */}
      {songXmlDoc && parsedData && (
        <StructureTempoMap songXmlDoc={songXmlDoc} parsedData={parsedData} />
      )}

      {/* 2. Sub-tab navigation */}
      <div className="glass-card" style={{ padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setActiveSubTab('pianoroll')}
            className="btn-secondary"
            style={{
              background: activeSubTab === 'pianoroll' ? 'var(--accent-muted)' : 'transparent',
              color: activeSubTab === 'pianoroll' ? 'white' : 'var(--text-secondary)',
              border: activeSubTab === 'pianoroll' ? '1px solid var(--accent-primary)' : '1px solid var(--border-clean)',
              fontWeight: 600,
              fontSize: '0.85rem',
              padding: '0.4rem 1rem',
              borderRadius: '6px'
            }}
          >
            🎹 Piano Roll / MIDI Clips
          </button>
          <button
            onClick={() => setActiveSubTab('automation')}
            className="btn-secondary"
            style={{
              background: activeSubTab === 'automation' ? 'var(--accent-muted)' : 'transparent',
              color: activeSubTab === 'automation' ? 'white' : 'var(--text-secondary)',
              border: activeSubTab === 'automation' ? '1px solid var(--accent-primary)' : '1px solid var(--border-clean)',
              fontWeight: 600,
              fontSize: '0.85rem',
              padding: '0.4rem 1rem',
              borderRadius: '6px'
            }}
          >
            📈 Automation Curves
          </button>
        </div>

        {/* 3. Sub-tab Content Area */}
        <div style={{ minHeight: '400px' }}>
          {activeSubTab === 'pianoroll' && (
            <PianoRoll songPath={songPath} parsedData={parsedData} />
          )}
          {activeSubTab === 'automation' && (
            <AutomationPlotter songPath={songPath} />
          )}
        </div>
      </div>
    </div>
  );
}
