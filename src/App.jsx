import React, { useState } from 'react';
import ProjectBrowser from './components/ProjectBrowser';
import Dashboard from './components/Dashboard';
import MixerConsole from './components/MixerConsole';
import PerformanceHub from './components/PerformanceHub';
import SessionColorizer from './components/SessionColorizer';
import ProjectHistory from './components/ProjectHistory';
import Utilities from './components/Utilities';
import WorkspaceAudit from './components/WorkspaceAudit';
import ProjectCompare from './components/ProjectCompare';
import SignalFlowMap from './components/SignalFlowMap';
import SampleBrowser from './components/SampleBrowser';
import VocalChainCopier from './components/VocalChainCopier';
import ProjectCleaner from './components/ProjectCleaner';
import PluginDoctor from './components/PluginDoctor';
import VideoSyncAdvisor from './components/VideoSyncAdvisor';
import FreezeAdvisor from './components/FreezeAdvisor';
import MediaRelinker from './components/MediaRelinker';
import SoundVariations from './components/SoundVariations';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentProject, setCurrentProject] = useState(null);
  const [xmls, setXmls] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [songXmlDoc, setSongXmlDoc] = useState(null);
  const [mixerXmlDoc, setMixerXmlDoc] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showWorkspaceAudit, setShowWorkspaceAudit] = useState(false);

  // 1. Fetch XML strings for selected project & parse them
  const handleProjectSelected = (project) => {
    setIsLoading(true);
    setLoadError('');

    fetch(`http://localhost:3001/api/load-xmls?songPath=${encodeURIComponent(project.songPath)}`)
      .then(res => {
        if (!res.ok) throw new Error('Project files could not be read.');
        return res.json();
      })
      .then(data => {
        setIsLoading(false);
        setCurrentProject(project);
        setXmls(data);
        parseAndBuildData(data);
      })
      .catch(err => {
        setIsLoading(false);
        console.error(err);
        setLoadError(`Failed to load project: ${err.message}`);
      });
  };

  const fixXmlNamespaces = (xml) => {
    if (!xml) return xml;
    if (xml.includes('xmlns:x=')) return xml;
    const match = xml.match(/<([A-Za-z0-9_:-]+)/);
    if (match) {
      const rootTag = match[1];
      return xml.replace(`<${rootTag}`, `<${rootTag} xmlns:x="http://presonus.com"`);
    }
    return xml;
  };

  const parseAndBuildData = (xmlStrings) => {
    try {
      const parser = new DOMParser();

      const fixedMeta = fixXmlNamespaces(xmlStrings.metainfo);
      const fixedSong = fixXmlNamespaces(xmlStrings.song);
      const fixedMedia = fixXmlNamespaces(xmlStrings.mediapool);
      const fixedMixer = fixXmlNamespaces(xmlStrings.audiomixer);

      // Parse to DOM documents (so we can pass them to sub-components for modifications)
      const metaDoc = parser.parseFromString(fixedMeta, "text/xml");
      const songDoc = parser.parseFromString(fixedSong, "text/xml");
      const mediaDoc = parser.parseFromString(fixedMedia, "text/xml");
      const mixerDoc = parser.parseFromString(fixedMixer, "text/xml");

      setSongXmlDoc(songDoc);
      setMixerXmlDoc(mixerDoc);

      // Extract Metadata
      const metadata = {};
      const attrs = metaDoc.getElementsByTagName("Attribute");
      for (let i = 0; i < attrs.length; i++) {
        metadata[attrs[i].getAttribute("id")] = attrs[i].getAttribute("value");
      }

      // Extract Markers
      const markers = [];
      const markerTrack = songDoc.getElementsByTagName("MarkerTrack")[0];
      if (markerTrack) {
        const markerEvents = markerTrack.getElementsByTagName("MarkerEvent");
        for (let i = 0; i < markerEvents.length; i++) {
          markers.push({
            name: markerEvents[i].getAttribute("name") || "Marker",
            start: markerEvents[i].getAttribute("start") || "0",
            type: markerEvents[i].getAttribute("markerType") || "0"
          });
        }
      }

      // Extract Tracks
      const tracks = [];
      const lists = songDoc.getElementsByTagName("List");
      let tracksList = null;
      for (let i = 0; i < lists.length; i++) {
        let hasTracksId = false;
        for (let j = 0; j < lists[i].attributes.length; j++) {
          if (lists[i].attributes[j].localName === 'id' && lists[i].attributes[j].value === 'Tracks') {
            hasTracksId = true;
            break;
          }
        }
        if (hasTracksId) {
          tracksList = lists[i];
          break;
        }
      }

      if (tracksList) {
        for (let i = 0; i < tracksList.children.length; i++) {
          const child = tracksList.children[i];
          const name = child.getAttribute("name") || "Unnamed";
          const type = child.tagName;

          let typeLabel = type;
          if (type === 'MediaTrack') {
            const hasSpeaker = child.querySelector("SpeakerSetup") !== null;
            typeLabel = hasSpeaker ? 'Audio Track' : 'Instrument (Synth)';
          } else if (type === 'MarkerTrack') {
            typeLabel = 'Markers';
          } else if (type === 'ChordTrack') {
            typeLabel = 'Chords';
          } else if (type === 'ArrangerTrack') {
            typeLabel = 'Arranger';
          } else if (type === 'LyricsTrack') {
            typeLabel = 'Lyrics';
          } else if (type === 'VideoTrack') {
            typeLabel = 'Video';
          }

          tracks.push({
            name,
            type: typeLabel,
            color: child.getAttribute("color"),
            trackID: child.getAttribute("trackID")
          });
        }
      }

      // Extract Media Pool Audio Clips
      const audioClips = [];
      const clips = mediaDoc.getElementsByTagName("AudioClip");
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const urlElem = clip.getElementsByTagName("Url")[0];
        const url = urlElem ? urlElem.getAttribute("url") : "";
        const filename = url ? url.split(/[/\\]/).pop() : "Unknown";

        let sampleRate = "";
        let bitDepth = "";
        let numChannels = "";
        const fmts = clip.getElementsByTagName("Attributes");
        for (let j = 0; j < fmts.length; j++) {
          let isFormat = false;
          for (let k = 0; k < fmts[j].attributes.length; k++) {
            if (fmts[j].attributes[k].localName === 'id' && fmts[j].attributes[k].value === 'format') {
              isFormat = true;
              break;
            }
          }
          if (isFormat) {
            sampleRate = fmts[j].getAttribute("sampleRate") || "";
            bitDepth = fmts[j].getAttribute("bitDepth") || "";
            numChannels = fmts[j].getAttribute("numChannels") || "";
            break;
          }
        }

        audioClips.push({
          name: filename,
          url,
          use_count: parseInt(clip.getAttribute("useCount") || "0"),
          peak: parseFloat(clip.getAttribute("peak") || "0"),
          sample_rate: sampleRate,
          bit_depth: bitDepth,
          channels: numChannels
        });
      }

      // Extract Mixer Channels
      const channels = [];

      const gainToDb = (gainStr) => {
        try {
          const gain = parseFloat(gainStr);
          if (gain <= 0) return "-∞ dB";
          const db = 20 * Math.log10(gain);
          if (Math.abs(db) < 0.01) return "0 dB";
          return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
        } catch (e) {
          return "0 dB";
        }
      };

      const panToString = (panStr) => {
        try {
          const pan = parseFloat(panStr);
          if (Math.abs(pan - 0.5) < 0.01) return "Center";
          if (pan < 0.5) return `Left ${Math.round((0.5 - pan) * 200)}%`;
          return `Right ${Math.round((pan - 0.5) * 200)}%`;
        } catch (e) {
          return "Center";
        }
      };

      const channelTags = [
        { tag: 'AudioOutputChannel', type: 'Output' },
        { tag: 'AudioGroupChannel', type: 'Bus / Group' },
        { tag: 'AudioSynthChannel', type: 'Instrument (Synth)' },
        { tag: 'AudioTrackChannel', type: 'Audio Track' }
      ];

      channelTags.forEach(({ tag, type }) => {
        const list = mixerDoc.getElementsByTagName(tag);
        for (let i = 0; i < list.length; i++) {
          const chan = list[i];
          const name = chan.getAttribute("name") || "";
          let label = chan.getAttribute("label") || "";
          if (!label) {
            label = chan.getAttribute("name") || "Unnamed";
          }
          const gain = chan.getAttribute("gain") || "1.0";
          const pan = chan.getAttribute("pan") || "0.5";
          const mute = chan.getAttribute("mute") === "1";
          const solo = chan.getAttribute("solo") === "1";
          const color = chan.getAttribute("color") || "N/A";

          // Destination
          const dests = chan.getElementsByTagName("Connection");
          let destination = "";
          for (let j = 0; j < dests.length; j++) {
            let isDest = false;
            for (let k = 0; k < dests[j].attributes.length; k++) {
              if (dests[j].attributes[k].localName === 'id' && dests[j].attributes[k].value === 'destination') {
                isDest = true;
                break;
              }
            }
            if (isDest) {
              destination = dests[j].getAttribute("friendlyName") || dests[j].getAttribute("objectID") || "";
              break;
            }
          }

          // Inserts
          const inserts = [];
          const insertsNodes = chan.getElementsByTagName("Attributes");
          let insertsNode = null;
          for (let j = 0; j < insertsNodes.length; j++) {
            let isInserts = false;
            for (let k = 0; k < insertsNodes[j].attributes.length; k++) {
              if (insertsNodes[j].attributes[k].localName === 'id' && insertsNodes[j].attributes[k].value === 'Inserts') {
                isInserts = true;
                break;
              }
            }
            if (isInserts) {
              insertsNode = insertsNodes[j];
              break;
            }
          }

          if (insertsNode) {
            const allSubAttrs = insertsNode.getElementsByTagName("Attributes");
            for (let j = 0; j < allSubAttrs.length; j++) {
              const sub = allSubAttrs[j];
              const classID = sub.getAttribute("classID");
              if (classID) {
                const plugName = sub.getAttribute("name") || "Plugin";
                const bypass = sub.getAttribute("bypass") === "1";

                // Get preset path
                const presetNode = sub.parentNode.querySelector("String[id='presetPath']");
                let preset = "";
                if (presetNode) {
                  preset = presetNode.getAttribute("text") || "";
                  preset = preset.split(/[/\\]/).pop();
                }

                inserts.push({
                  name: plugName,
                  bypass,
                  preset,
                  classID
                });
              }
            }
          }

          // Sends
          const sends = [];
          const sendsNodes = chan.getElementsByTagName("Attributes");
          let sendsNode = null;
          for (let j = 0; j < sendsNodes.length; j++) {
            let isSends = false;
            for (let k = 0; k < sendsNodes[j].attributes.length; k++) {
              if (sendsNodes[j].attributes[k].localName === 'id' && sendsNodes[j].attributes[k].value === 'Sends') {
                isSends = true;
                break;
              }
            }
            if (isSends) {
              sendsNode = sendsNodes[j];
              break;
            }
          }

          if (sendsNode) {
            for (let j = 0; j < sendsNode.children.length; j++) {
              const sendSlot = sendsNode.children[j];
              const destConn = sendSlot.querySelector("Connection[id='destination']");
              if (destConn) {
                const destName = destConn.getAttribute("friendlyName") || "Unknown";
                const bypass = sendSlot.getAttribute("bypass") === "1";
                const level = sendSlot.getAttribute("level") || "1.0";
                const prefader = sendSlot.getAttribute("prefader") === "1";
                sends.push({
                  destination: destName,
                  bypass,
                  level: gainToDb(level),
                  prefader
                });
              }
            }
          }

          channels.push({
            type,
            name,
            label,
            gain_db: gainToDb(gain),
            pan_str: panToString(pan),
            mute,
            solo,
            color,
            destination,
            inserts,
            sends
          });
        }
      });

      setParsedData({
        metadata,
        markers,
        tracks,
        audioClips,
        channels
      });
      setActiveTab('dashboard');

    } catch (e) {
      console.error(e);
      setLoadError(`Failed to parse XML: ${e.message}`);
    }
  };

  const handleCloseProject = () => {
    setCurrentProject(null);
    setXmls(null);
    setParsedData(null);
    setSongXmlDoc(null);
    setMixerXmlDoc(null);
    setLoadError('');
  };

  const NAV_GROUPS = [
    {
      label: 'Session Overview',
      items: [
        { id: 'dashboard', icon: '📊', label: 'Dashboard' },
        { id: 'history', icon: '🕐', label: 'Version History' },
        { id: 'compare', icon: '👥', label: 'Song Diff' },
        { id: 'freezeadvisor', icon: '❄️', label: 'Freeze Advisor' },
      ]
    },
    {
      label: 'Arrangement & Mix',
      items: [
        { id: 'mixer', icon: '🎛️', label: 'Mixer Console' },
        { id: 'signalflow', icon: '🔗', label: 'Signal Flow Map' },
        { id: 'midi_automation', icon: '🎹', label: 'MIDI & Automation' },
        { id: 'videosync', icon: '🎬', label: 'Video Sync Advisor' },
      ]
    },
    {
      label: 'Media & Presets',
      items: [
        { id: 'samples', icon: '🎴', label: 'Sample Browser' },
        { id: 'colorizer', icon: '🎨', label: 'Auto Colorizer' },
        { id: 'vocalcopier', icon: '🧬', label: 'Vocal Chain Copier' },
        { id: 'soundvariations', icon: '🎼', label: 'Sound Variations' },
      ]
    },
    {
      label: 'Project Maintenance',
      items: [
        { id: 'cleaner', icon: '🧽', label: 'Session Cleaner' },
        { id: 'plugindoctor', icon: '📁', label: 'Plugin Doctor' },
        { id: 'relinker', icon: '🔍', label: 'Media Relinker' },
        { id: 'utilities', icon: '⚙️', label: 'Utilities' },
      ]
    },
  ];

  return (
    <div className="app-container">

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <img src="./icon.png" alt="Logo" className="logo-img" />
          <span>Studio One Project Hub</span>
        </div>

        {/* Current project info */}
        {currentProject ? (
          <div className="sidebar-project">
            Active project
            <strong title={currentProject.name}>{currentProject.name}</strong>
          </div>
        ) : (
          <div className="sidebar-project">
            No project loaded
          </div>
        )}

        {/* Nav groups — only when a project is open */}
        {currentProject && NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div className="sidebar-section-label">{group.label}</div>
            <div className="sidebar-nav">
              {group.items.map(item => (
                <button
                  key={item.id}
                  className={`nav-tab ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.id)}
                >
                  <span className="tab-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="sidebar-spacer" />

        {/* Footer actions */}
        <div className="sidebar-footer">
          {!currentProject ? (
            <button className="nav-tab" style={{ width: '100%' }} onClick={() => setShowWorkspaceAudit(!showWorkspaceAudit)}>
              <span className="tab-icon">📊</span>
              Workspace Audit
            </button>
          ) : (
            <button className="nav-tab" style={{ color: '#ef4444', width: '100%' }} onClick={handleCloseProject}>
              <span className="tab-icon">🚪</span>
              Close project
            </button>
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="content-area">
        {loadError && (
          <div style={{ maxWidth: '800px', margin: '2rem auto', background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', padding: '1rem', borderRadius: '8px', color: 'white' }}>
            <strong>Error:</strong> {loadError}
          </div>
        )}

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: '1rem' }}>
            <div style={{ border: '3px solid rgba(255,255,255,0.05)', borderLeft: '3px solid white', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Extracting & parsing project data...</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : !currentProject ? (
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', minHeight: 0 }}>
            {showWorkspaceAudit ? (
              <WorkspaceAudit onClose={() => setShowWorkspaceAudit(false)} />
            ) : (
              <ProjectBrowser onProjectSelected={handleProjectSelected} isLoading={isLoading} />
            )}
          </div>
        ) : parsedData ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {activeTab === 'dashboard' && (
              <Dashboard
                parsedData={parsedData}
                currentProject={currentProject}
                xmls={xmls}
              />
            )}
            {activeTab === 'history' && (
              <ProjectHistory
                projectDir={currentProject.dirPath}
                activeProject={currentProject}
                activeParsedData={parsedData}
              />
            )}
            {activeTab === 'compare' && (
              <ProjectCompare
                activeProject={currentProject}
                activeParsedData={parsedData}
              />
            )}
            {activeTab === 'freezeadvisor' && (
              <FreezeAdvisor parsedData={parsedData} />
            )}
            {activeTab === 'mixer' && (
              <MixerConsole
                parsedData={parsedData}
                projectDir={currentProject.dirPath}
                songPath={currentProject.songPath}
                songXmlDoc={songXmlDoc}
                mixerXmlDoc={mixerXmlDoc}
              />
            )}
            {activeTab === 'signalflow' && (
              <SignalFlowMap parsedData={parsedData} />
            )}
            {activeTab === 'midi_automation' && (
              <PerformanceHub
                songXmlDoc={songXmlDoc}
                parsedData={parsedData}
                songPath={currentProject.songPath}
              />
            )}
            {activeTab === 'videosync' && (
              <VideoSyncAdvisor songXmlDoc={songXmlDoc} />
            )}
            {activeTab === 'samples' && (
              <SampleBrowser projectDir={currentProject.dirPath} />
            )}
            {activeTab === 'colorizer' && (
              <SessionColorizer
                parsedData={parsedData}
                songPath={currentProject.songPath}
                onReloadProject={() => handleProjectSelected(currentProject)}
              />
            )}
            {activeTab === 'vocalcopier' && (
              <VocalChainCopier
                parsedData={parsedData}
                projectDir={currentProject.dirPath}
                songXmlDoc={songXmlDoc}
                mixerXmlDoc={mixerXmlDoc}
              />
            )}
            {activeTab === 'soundvariations' && (
              <SoundVariations />
            )}
            {activeTab === 'cleaner' && (
              <ProjectCleaner
                parsedData={parsedData}
                projectDir={currentProject.dirPath}
                songName={currentProject.songName}
                songPath={currentProject.songPath}
              />
            )}
            {activeTab === 'plugindoctor' && (
              <PluginDoctor
                parsedData={parsedData}
                songPath={currentProject.songPath}
              />
            )}
            {activeTab === 'relinker' && (
              <MediaRelinker
                songPath={currentProject.songPath}
                projectDir={currentProject.dirPath}
              />
            )}
            {activeTab === 'utilities' && (
              <Utilities
                parsedData={parsedData}
                songPath={currentProject.songPath}
                songXmlDoc={songXmlDoc}
              />
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
