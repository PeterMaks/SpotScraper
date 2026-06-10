import React, { useState } from 'react';
import { 
  UserCircle, Settings, Download, CheckSquare, 
  MousePointerClick, Mail, Database, ListMusic, 
  FileJson, Info, Music, ExternalLink, ArrowRight,
  DatabaseZap
} from 'lucide-react';

export default function AcquireDataGuide() {
  const [activeTab, setActiveTab] = useState('full');

  const steps = [
    { icon: <UserCircle size={20} />, text: "Log in to your account dashboard on the Spotify Account Page." },
    { icon: <Settings size={20} />, text: "Click on Privacy Settings in the menu on the left side of the screen." },
    { icon: <Download size={20} />, text: "Scroll down to the Download your data section." },
    { icon: <CheckSquare size={20} />, text: "Select the information you want—make sure to check the Extended Streaming History box for all your historical listening data." },
    { icon: <MousePointerClick size={20} />, text: "Click Request data." },
    { icon: <Mail size={20} />, text: "Spotify will send a verification link to your email. Open your inbox and click the link to confirm your request." }
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 24px',
      width: '100%'
    }}>
      {/* Header */}
      <header style={{
        textAlign: 'center',
        marginBottom: '64px',
        maxWidth: '800px',
        animation: 'fadeInUp 0.8s ease-out forwards'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '32px',
          padding: '12px 24px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-blue) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFF'
          }}>
            <DatabaseZap size={20} />
          </div>
          <span style={{
            fontSize: '24px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#FFF'
          }}>
            SpotScraper
          </span>
        </div>
        <h1 style={{ 
          fontSize: '48px', 
          fontWeight: 800, 
          letterSpacing: '-0.04em',
          marginBottom: '16px',
          background: 'linear-gradient(135deg, #FFF 0%, #B3B3B3 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Acquire Your Audio Footprint
        </h1>
        <p style={{
          fontSize: '18px',
          color: 'var(--text-muted)',
          maxWidth: '600px',
          margin: '0 auto',
          textWrap: 'balance'
        }}>
          Whether you need your complete extended streaming history in JSON or just your playlists, follow the guides below to securely export your data.
        </p>
      </header>

      {/* Toggle / Tabs */}
      <div style={{
        display: 'flex',
        position: 'relative',
        background: 'rgba(255, 255, 255, 0.05)',
        padding: '6px',
        borderRadius: '100px',
        marginBottom: '48px',
        border: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(10px)',
        width: '400px'
      }}>
        {/* Sliding Pill Background */}
        <div style={{
          position: 'absolute',
          top: '6px',
          bottom: '6px',
          left: activeTab === 'full' ? '6px' : '50%',
          right: activeTab === 'full' ? '50%' : '6px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '100px',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 0
        }} />
        
        <button 
          onClick={() => setActiveTab('full')}
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            padding: '12px 32px',
            borderRadius: '100px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'full' ? '#FFF' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: '15px',
            cursor: 'pointer',
            transition: 'color 0.4s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
          <Database size={18} />
          Full JSON Data
        </button>
        <button 
          onClick={() => setActiveTab('playlists')}
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            padding: '12px 32px',
            borderRadius: '100px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'playlists' ? '#FFF' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: '15px',
            cursor: 'pointer',
            transition: 'color 0.4s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
          <ListMusic size={18} />
          Playlists Only
        </button>
      </div>

      {/* Main Content Area */}
      <div style={{
        width: '100%',
        maxWidth: '900px',
        position: 'relative',
        minHeight: '400px'
      }}>
        {activeTab === 'full' && (
          <div className="glass-card animate-fade-in" style={{ padding: '48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'rgba(29, 185, 84, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <FileJson size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 700 }}>Download Your Data Tool</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '15px', margin: 0 }}>Official method via Privacy Settings</p>
              </div>
            </div>

            <p style={{ color: '#E0E0E0', marginBottom: '32px', fontSize: '16px' }}>
              To request a copy of your personal data (including extended streaming history, playlists, and account details) from Spotify, use the "Download your data" tool in your Privacy Settings.
            </p>

            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--primary)', marginBottom: '24px', fontWeight: 700 }}>Follow these steps:</h3>

            <div style={{ display: 'grid', gap: '16px', marginBottom: '48px' }}>
              {steps.map((step, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '20px',
                  padding: '20px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.03)'
                }}>
                  <div style={{ 
                    color: 'var(--text-muted)', 
                    background: 'rgba(255,255,255,0.05)', 
                    padding: '10px', 
                    borderRadius: '12px' 
                  }}>
                    {step.icon}
                  </div>
                  <p style={{ fontSize: '16px', color: '#FFF', paddingTop: '8px', margin: 0 }}>{step.text}</p>
                </div>
              ))}
            </div>

            <div style={{
              padding: '24px',
              borderRadius: '16px',
              background: 'linear-gradient(145deg, rgba(29, 185, 84, 0.1) 0%, rgba(29, 185, 84, 0.02) 100%)',
              border: '1px solid rgba(29, 185, 84, 0.2)',
              display: 'flex',
              gap: '20px'
            }}>
              <div style={{ color: 'var(--primary)', paddingTop: '4px' }}>
                <Info size={24} />
              </div>
              <div>
                <h4 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#FFF' }}>What happens next</h4>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
                  Spotify will compile your data and send you an email containing a secure download link. <strong>This process can take up to 30 days.</strong> Once you receive the email, download the ZIP file, which will contain your data in easily readable JSON files.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'playlists' && (
          <div className="glass-card animate-fade-in" style={{ padding: '48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'rgba(144, 89, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
                <Music size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 700 }}>Exportify for Playlists</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '15px', margin: 0 }}>Fastest method for playlist metadata</p>
              </div>
            </div>

            <p style={{ color: '#E0E0E0', marginBottom: '48px', fontSize: '16px', lineHeight: 1.6 }}>
              If you only need your playlists and don't want to wait 30 days for Spotify's full archive, <strong>Exportify</strong> is a secure third-party tool that connects to the Spotify API and instantly generates CSV files of your playlists.
            </p>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '32px',
              padding: '48px 24px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '24px',
              border: '1px solid rgba(255,255,255,0.03)',
              textAlign: 'center'
            }}>
              <div style={{ 
                width: '80px', 
                height: '80px', 
                borderRadius: '24px', 
                background: 'linear-gradient(135deg, rgba(144,89,255,0.2) 0%, rgba(46,119,208,0.2) 100%)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFF',
                boxShadow: '0 8px 32px rgba(144,89,255,0.2)'
              }}>
                <ExternalLink size={32} />
              </div>
              
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>exportify.net</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '15px', maxWidth: '400px', margin: 0 }}>
                  Login securely with Spotify to view and export any of your saved playlists instantly.
                </p>
              </div>

              <a 
                href="https://exportify.net" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 32px',
                  background: 'var(--text-main)',
                  color: 'var(--bg-base)',
                  borderRadius: '100px',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '16px',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 8px 24px rgba(255,255,255,0.2)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 32px rgba(255,255,255,0.3)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1) translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(255,255,255,0.2)';
                }}
              >
                Launch Exportify <ArrowRight size={18} />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
