
import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { ThemeProvider, useTheme } from './ThemeProvider';
import Icons from './Icons';
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

function ThemeToggle({ className }) {
  const { theme, setTheme } = useTheme();
  const stateVal = theme === 'dark' ? 'a' : 'b';
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className={className} 
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title="Toggle Theme"
    >
      <span className="t-icon-swap" data-state={stateVal}>
        <span className="t-icon" data-icon="a">
          <Icons.Sun className="size-4 text-foreground/70" />
        </span>
        <span className="t-icon" data-icon="b">
          <Icons.Moon className="size-4 text-foreground/70" />
        </span>
      </span>
    </Button>
  );
}

export default function Layout() {
  const location = useLocation();
  const {
    scraperStatus,
    downloads,
    currentTrack,
    isPlaying,
    setIsPlaying,
    duration,
    volume,
    audioRef,
    pendingPlayRef,
    handlePlayNext,
    handlePlayPrev,
    handleLoadedMetadata,
    handleVolumeChange,
    backendUrl,
  } = useAppContext();

  const sliderRef = React.useRef(null);
  const timeTextRef = React.useRef(null);

  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds)) return "0:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Spotify-inspired ambient background */}
      <div className="fixed inset-0 z-[-1] bg-gradient-to-br from-green-500/5 via-emerald-500/5 to-teal-500/5 dark:from-green-900/20 dark:via-emerald-950/20 dark:to-black/0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-green-500/15 dark:bg-green-500/10 blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/15 dark:bg-emerald-500/8 blur-[120px] mix-blend-screen pointer-events-none" />
      </div>

      <TooltipProvider delayDuration={0}>
        <SidebarProvider>
          <Sidebar variant="inset" collapsible="icon" className="backdrop-blur-2xl border-r border-white/20 dark:border-white/10">
            <SidebarHeader>
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold shrink-0 shadow-lg shadow-green-500/20 text-lg">
                    S
                  </div>
                  <span className="font-bold text-xl truncate group-data-[collapsible=icon]:hidden drop-shadow-sm tracking-tight">SpotScraper</span>
                </div>
                {/* Desktop Trigger inside the Sidebar */}
                <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
                  <ThemeToggle />
                  <SidebarTrigger className="hidden md:flex" />
                </div>
              </div>
            </SidebarHeader>
            
            <SidebarContent className="px-2 py-4">
              <SidebarGroup>
                <SidebarMenu className="gap-2">
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/dashboard')} tooltip="Dashboard" className="h-11 text-base font-medium rounded-xl">
                      <NavLink to="/dashboard">
                        <Icons.Dashboard className="size-5" />
                        <span>Dashboard</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/scraper')} tooltip="Scraper Control" className="h-11 text-base font-medium rounded-xl">
                      <NavLink to="/scraper">
                        <Icons.Scraper className="size-5" />
                        <span>Scraper Control</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/downloads')} tooltip="Downloads" className="h-11 text-base font-medium rounded-xl">
                      <NavLink to="/downloads">
                        <Icons.Downloads className="size-5" />
                        <span>Downloads ({downloads.length})</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/logs')} tooltip="Detailed Logs" className="h-11 text-base font-medium rounded-xl">
                      <NavLink to="/logs">
                        <Icons.Logs className="size-5" />
                        <span>Detailed Logs</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/acquire')} tooltip="Data Guide" className="h-11 text-base font-medium rounded-xl">
                      <NavLink to="/acquire">
                        <Icons.Acquire className="size-5" />
                        <span>Data Guide</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
              <div className="p-4 flex items-center gap-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2 bg-sidebar/50 rounded-xl m-2 border border-sidebar-border backdrop-blur-md">
                <span className={`size-3 rounded-full shrink-0 ${scraperStatus === 'running' ? 'bg-blue-500 animate-pulse shadow-[0_0_10px_currentColor]' : scraperStatus === 'success' ? 'bg-green-500 shadow-[0_0_10px_currentColor]' : scraperStatus === 'error' ? 'bg-red-500 shadow-[0_0_10px_currentColor]' : 'bg-gray-500'}`}></span>
                <span className="text-sm font-medium text-muted-foreground truncate group-data-[collapsible=icon]:hidden">
                  {scraperStatus === 'running' 
                    ? 'Scraper Running' 
                    : scraperStatus === 'success' 
                    ? 'Idle (Last OK)' 
                    : scraperStatus === 'error'
                    ? 'Idle (Error)'
                    : 'Scraper Idle'}
                </span>
              </div>
            </SidebarFooter>

            {/* Middle Edge Floating Trigger */}
            <div className="absolute top-1/2 -translate-y-1/2 -right-3.5 z-50 hidden md:flex">
              <SidebarTrigger className="size-7 rounded-full border border-white/20 bg-background/80 hover:bg-background/95 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.15)] flex items-center justify-center text-foreground hover:scale-110 hover:text-primary transition-all duration-300 [&>svg]:size-3.5" />
            </div>
          </Sidebar>

          {/* Main Content Area */}
          <main className="flex-1 min-w-0 flex flex-col relative min-h-screen overflow-hidden bg-background/20 backdrop-blur-3xl m-2 rounded-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.1)]">
            {/* Mobile-only floating trigger since sidebar hides completely on mobile */}
            <div className="absolute top-4 left-4 z-50 md:hidden flex items-center gap-2">
              <SidebarTrigger className="bg-background/50 backdrop-blur-md border border-white/10 shadow-sm" />
              <ThemeToggle className="bg-background/50 backdrop-blur-md border border-white/10 shadow-sm" />
            </div>
            
            <div className="flex-1 overflow-auto p-4 pt-16 md:pt-8 md:p-6 lg:p-10 custom-scrollbar">
              <div className="container mx-auto max-w-7xl">
                <Outlet />
              </div>
            </div>
          </main>
          
          {/* Global Audio Player */}
          <audio 
            ref={audioRef}
            preload="auto"
            onCanPlay={() => {
              if (pendingPlayRef.current) {
                pendingPlayRef.current = false;
                audioRef.current.play().catch(e => console.error("Playback failed", e));
              }
            }}
            onTimeUpdate={(e) => {
              if (sliderRef.current) sliderRef.current.value = e.target.currentTime;
              if (timeTextRef.current) timeTextRef.current.innerText = formatTime(e.target.currentTime);
            }}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handlePlayNext}
          />

          {currentTrack && (
            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-3xl rounded-2xl border border-white/20 bg-background/80 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-4 flex items-center justify-between gap-6 z-[100] transition-all duration-500`}>
              <div className="flex items-center gap-4 shrink min-w-0 flex-1">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground shadow-inner border border-white/10 overflow-hidden relative">
                  <img 
                    key={currentTrack.name}
                    src={`${backendUrl}/api/downloads/art/${encodeURIComponent(currentTrack.name)}`} 
                    className="w-full h-full object-cover absolute inset-0 z-10" 
                    loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; }}
                    alt=""
                  />
                  <Icons.Music className="size-6 drop-shadow-md absolute z-0" />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate font-bold text-sm drop-shadow-sm" title={currentTrack.title || currentTrack.name.replace('.mp3', '')}>
                    {currentTrack.title || currentTrack.name.replace('.mp3', '')}
                  </span>
                  <span className="truncate text-xs text-muted-foreground font-medium" title={currentTrack.artist || 'Unknown Artist'}>
                    {currentTrack.artist || 'Unknown Artist'}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col items-center gap-1.5 shrink-0 w-1/2">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-full" onClick={handlePlayPrev} disabled={downloads.length === 0} title="Previous">
                    <Icons.SkipBack className="size-5" />
                  </Button>
                  <Button variant="outline" size="icon" className="size-11 rounded-full bg-primary text-primary-foreground border-0 shadow-lg hover:scale-110 hover:bg-[#1db954] transition-transform flex items-center justify-center" onClick={() => currentTrack && setIsPlaying(!isPlaying)} disabled={!currentTrack}>
                    <span className="t-icon-swap" data-state={isPlaying ? 'a' : 'b'}>
                      <span className="t-icon" data-icon="a">
                        <Icons.Pause className="size-5" />
                      </span>
                      <span className="t-icon" data-icon="b">
                        <Icons.Play className="size-5 translate-x-0.5" />
                      </span>
                    </span>
                  </Button>
                  <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-full" onClick={handlePlayNext} disabled={downloads.length === 0} title="Next">
                    <Icons.SkipForward className="size-5" />
                  </Button>
                </div>
                <div className="hidden sm:flex items-center gap-2 w-full max-w-md">
                  <span ref={timeTextRef} className="text-[11px] font-medium text-muted-foreground w-10 text-right tabular-nums">0:00</span>
                  <input 
                    ref={sliderRef}
                    type="range" 
                    className="flex-1 h-1.5 cursor-pointer appearance-none rounded-full bg-secondary/50 accent-primary backdrop-blur-sm" 
                    min="0" 
                    max={duration || 0} 
                    defaultValue="0" 
                    onChange={(e) => {
                      if (audioRef.current) audioRef.current.currentTime = e.target.value;
                    }}
                  />
                  <span className="text-[11px] font-medium text-muted-foreground w-10 tabular-nums">{formatTime(duration)}</span>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-2 justify-end w-20">
                <Icons.Volume className="size-4 text-muted-foreground" />
                <input 
                  type="range" 
                  className="w-full h-1.5 cursor-pointer appearance-none rounded-full bg-secondary/50 accent-primary backdrop-blur-sm" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={volume} 
                  onChange={handleVolumeChange}
                />
              </div>
            </div>
          )}
        </SidebarProvider>
      </TooltipProvider>
    </>
  );
}

