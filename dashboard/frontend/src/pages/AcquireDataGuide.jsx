import React, { useState } from 'react';
import { 
  UserCircle, Settings, Download, CheckSquare, 
  MousePointerClick, Mail, Database, ListMusic, 
  FileJson, Info, Music, ExternalLink, ArrowRight,
  DatabaseZap
} from 'lucide-react';
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

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
    <div className="flex flex-col items-center py-10 px-6 w-full animate-in fade-in duration-500">
      <header className="text-center mb-16 max-w-3xl">
        <div className="inline-flex items-center gap-3 mb-8 px-6 py-3 bg-secondary/50 border rounded-2xl shadow-sm">
          <div className="flex size-8 rounded-lg bg-gradient-to-br from-primary to-blue-500 items-center justify-center text-white">
            <DatabaseZap size={20} />
          </div>
          <span className="text-2xl font-extrabold tracking-tight">SpotScraper</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Acquire Your Audio Footprint</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
          Whether you need your complete extended streaming history in JSON or just your playlists, follow the guides below to securely export your data.
        </p>
      </header>

      <div className="flex relative bg-secondary/50 p-1.5 rounded-full mb-12 border w-full max-w-md mx-auto">
        <Button 
          variant={activeTab === 'full' ? 'default' : 'ghost'} 
          className="flex-1 rounded-full text-sm font-semibold h-10"
          onClick={() => setActiveTab('full')}
        >
          <Database size={16} className="mr-2" /> Full JSON Data
        </Button>
        <Button 
          variant={activeTab === 'playlists' ? 'default' : 'ghost'} 
          className="flex-1 rounded-full text-sm font-semibold h-10"
          onClick={() => setActiveTab('playlists')}
        >
          <ListMusic size={16} className="mr-2" /> Playlists Only
        </Button>
      </div>

      <div className="w-full max-w-4xl mx-auto">
        {activeTab === 'full' && (
          <Card className="p-8 border bg-card">
            <div className="flex items-center gap-4 mb-8">
              <div className="flex size-12 rounded-xl bg-primary/15 items-center justify-center text-primary">
                <FileJson size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Download Your Data Tool</h2>
                <p className="text-muted-foreground text-sm">Official method via Privacy Settings</p>
              </div>
            </div>

            <p className="text-foreground mb-8 text-base">
              To request a copy of your personal data (including extended streaming history, playlists, and account details) from Spotify, use the "Download your data" tool in your Privacy Settings.
            </p>

            <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-6">Follow these steps:</h3>

            <div className="grid gap-4 mb-12">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-4 p-5 bg-secondary/30 rounded-2xl border">
                  <div className="text-muted-foreground bg-background p-2.5 rounded-xl border">
                    {step.icon}
                  </div>
                  <p className="text-base pt-2">{step.text}</p>
                </div>
              ))}
            </div>

            <div className="p-6 rounded-2xl bg-primary/5 border border-primary/20 flex gap-5">
              <div className="text-primary pt-1">
                <Info size={24} />
              </div>
              <div>
                <h4 className="text-lg font-bold mb-2">What happens next</h4>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Spotify will compile your data and send you an email containing a secure download link. <strong className="text-foreground">This process can take up to 30 days.</strong> Once you receive the email, download the ZIP file, which will contain your data in easily readable JSON files.
                </p>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'playlists' && (
          <Card className="p-8 border bg-card text-center flex flex-col items-center">
            <div className="flex items-center gap-4 mb-8 self-start text-left w-full">
              <div className="flex size-12 rounded-xl bg-purple-500/15 items-center justify-center text-purple-500">
                <Music size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Exportify for Playlists</h2>
                <p className="text-muted-foreground text-sm">Fastest method for playlist metadata</p>
              </div>
            </div>

            <p className="text-foreground mb-12 text-base text-left w-full">
              If you only need your playlists and don't want to wait 30 days for Spotify's full archive, <strong>Exportify</strong> is a secure third-party tool that connects to the Spotify API and instantly generates CSV files of your playlists.
            </p>

            <div className="flex flex-col items-center gap-8 p-12 bg-secondary/30 rounded-3xl border w-full">
              <div className="flex size-20 rounded-3xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border items-center justify-center text-foreground shadow-lg">
                <ExternalLink size={32} />
              </div>
              
              <div>
                <h3 className="text-xl font-bold mb-2">exportify.net</h3>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  Login securely with Spotify to view and export any of your saved playlists instantly.
                </p>
              </div>

              <Button asChild size="lg" className="rounded-full px-8 h-14 text-base font-bold shadow-xl shadow-primary/20 hover:scale-105 transition-transform">
                <a href="https://exportify.net" target="_blank" rel="noopener noreferrer">
                  Launch Exportify <ArrowRight size={18} className="ml-2" />
                </a>
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
