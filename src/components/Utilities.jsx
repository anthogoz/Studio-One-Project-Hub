import React, { useState } from 'react';
import TemplateGenerator from './TemplateGenerator';
import VersionConverter from './VersionConverter';

export default function Utilities({ parsedData, songPath, songXmlDoc }) {
  const [activeSubTab, setActiveSubTab] = useState('template');

  return (
    <div className="glass-card">
      <div className="glass-card-header">
        <span>⚙️ Session Utilities</span>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
        Access all admin, cleanup, and export tools to manage and optimize your Studio One project files.
      </p>

      {/* Sub-tab navigation */}
      <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.75rem', marginBottom: '2rem' }}>
        <button
          onClick={() => setActiveSubTab('template')}
          style={{
            background: activeSubTab === 'template' ? 'white' : 'transparent',
            color: activeSubTab === 'template' ? 'black' : 'var(--text-secondary)',
            border: activeSubTab === 'template' ? '1px solid white' : '1px solid var(--border-clean)',
            fontWeight: 600,
            fontSize: '0.85rem',
            padding: '0.5rem 1.2rem',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          ✨ Template Generator
        </button>
        <button
          onClick={() => setActiveSubTab('converter')}
          style={{
            background: activeSubTab === 'converter' ? 'white' : 'transparent',
            color: activeSubTab === 'converter' ? 'black' : 'var(--text-secondary)',
            border: activeSubTab === 'converter' ? '1px solid white' : '1px solid var(--border-clean)',
            fontWeight: 600,
            fontSize: '0.85rem',
            padding: '0.5rem 1.2rem',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          🔄 Version Converter
        </button>
      </div>

      {/* Sub-tab Content Area */}
      <div style={{ minHeight: '300px' }}>
        {activeSubTab === 'template' && (
          <TemplateGenerator
            parsedData={parsedData}
            songXmlDoc={songXmlDoc}
            songPath={songPath}
          />
        )}
        {activeSubTab === 'converter' && (
          <VersionConverter
            songPath={songPath}
          />
        )}
      </div>
    </div>
  );
}
