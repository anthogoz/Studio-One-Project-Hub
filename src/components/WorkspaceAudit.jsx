import React, { useEffect, useState } from 'react';

export default function WorkspaceAudit({ onClose }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('http://localhost:3001/api/workspace-audit')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load workspace audit data');
        return res.json();
      })
      .then(resData => {
        setData(resData);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
        <div style={{ border: '4px solid rgba(255,255,255,0.05)', borderLeft: '4px solid white', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '1rem' }}></div>
        <span style={{ color: 'var(--text-secondary)' }}>Auditing all projects in the workspace...</span>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card" style={{ maxWidth: '600px', margin: '2rem auto' }}>
        <h3 className="glass-card-header" style={{ color: '#ef4444' }}>⚠️ Audit Failed</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error}</p>
        <button className="btn-secondary" onClick={onClose}>Back to Browser</button>
      </div>
    );
  }

  const { totalProjects, plugins, projectComplexity } = data;

  const totalPluginsCount = plugins.reduce((sum, p) => sum + p.count, 0);
  const thirdPartyPlugins = plugins.filter(p => !p.isStock);
  const stockPluginsCount = plugins.filter(p => p.isStock).length;
  const stockRatio = plugins.length > 0 ? Math.round((stockPluginsCount / plugins.length) * 100) : 100;

  // Project complexity profiles (plugins count is weighted 3x tracks to highlight complexity)
  const sortedProjects = [...projectComplexity].sort((a, b) => {
    const complexityA = (a.pluginCount * 3) + a.trackCount;
    const complexityB = (b.pluginCount * 3) + b.trackCount;
    return complexityB - complexityA;
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
      <div className="glass-card">
        <div className="glass-card-header">
          <span>📊 Workspace Global Plugin & Project Audit</span>
          <button className="btn-secondary" onClick={onClose} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
            Close Audit
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          This report analyzes all Studio One project folders inside your workspace directory. It extracts channel insert plugin chains and track counts to build a global index of your studio workflow.
        </p>

        {/* Global Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '1.25rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Projects</span>
            <h2 style={{ fontSize: '2rem', color: 'white', marginTop: '0.25rem' }}>{totalProjects}</h2>
          </div>
          <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '1.25rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Unique Plugins Active</span>
            <h2 style={{ fontSize: '2rem', color: 'white', marginTop: '0.25rem' }}>{plugins.length}</h2>
          </div>
          <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '1.25rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Stock / Third-Party Ratio</span>
            <h2 style={{ fontSize: '2rem', color: 'white', marginTop: '0.25rem' }}>{stockRatio}% / {100 - stockRatio}%</h2>
          </div>
          <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '1.25rem', borderRadius: '6px', border: '1px solid var(--border-clean)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Plugin Instances</span>
            <h2 style={{ fontSize: '2rem', color: 'white', marginTop: '0.25rem' }}>{totalPluginsCount}</h2>
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          
          {/* Column 1: Top Plugins */}
          <div>
            <h4 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              🔌 Most Popular Plugins in your Workspace
            </h4>
            <div style={{ maxHeight: '450px', overflowY: 'auto', border: '1px solid var(--border-clean)', borderRadius: '6px' }}>
              <table className="premium-table" style={{ marginTop: 0 }}>
                <thead>
                  <tr>
                    <th>Plugin Name</th>
                    <th>Type</th>
                    <th>Instance Count</th>
                  </tr>
                </thead>
                <tbody>
                  {plugins.slice(0, 20).map((plug, idx) => (
                    <tr key={idx}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{plug.name}</td>
                      <td>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          padding: '2px 6px', 
                          borderRadius: '3px',
                          background: plug.isStock ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.2)', 
                          color: plug.isStock ? 'var(--text-secondary)' : 'white',
                          border: '1px solid var(--border-clean)'
                        }}>
                          {plug.isStock ? 'Stock' : 'Third-Party'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: '2rem' }}>{plug.count}</td>
                    </tr>
                  ))}
                  {plugins.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No plugins detected in any project.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Column 2: Project list & complexity profile */}
          <div>
            <h4 style={{ color: 'white', marginBottom: '1rem', borderBottom: '1px solid var(--border-clean)', paddingBottom: '0.5rem' }}>
              📁 Projects ordered by Complexity
            </h4>
            <div style={{ maxHeight: '450px', overflowY: 'auto', border: '1px solid var(--border-clean)', borderRadius: '6px' }}>
              <table className="premium-table" style={{ marginTop: 0 }}>
                <thead>
                  <tr>
                    <th>Project Name</th>
                    <th>Tracks</th>
                    <th>Plugin Count</th>
                    <th>Complexity Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProjects.map((proj, idx) => {
                    let profile = 'Light';
                    let profileColor = 'var(--text-secondary)';
                    if (proj.trackCount > 35 || proj.pluginCount > 40) {
                      profile = 'Heavyweight';
                      profileColor = 'white';
                    } else if (proj.trackCount > 15 || proj.pluginCount > 15) {
                      profile = 'Moderate';
                      profileColor = 'var(--text-primary)';
                    }
                    
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 500 }}>{proj.name}</td>
                        <td>{proj.trackCount}</td>
                        <td>{proj.pluginCount}</td>
                        <td>
                          <strong style={{ color: profileColor, fontSize: '0.8rem' }}>{profile}</strong>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedProjects.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No projects found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
