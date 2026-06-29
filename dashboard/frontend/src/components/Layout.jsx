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
      {/* Super High Glassmorphism Background layer */}
      <div className="fixed inset-0 z-[-1] bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 dark:from-blue-900/30 dark:via-purple-900/30 dark:to-pink-900/30">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/30 blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/30 blur-[120px] mix-blend-screen pointer-events-none" />
      </div>

      <TooltipProvider delayDuration={0}>
        <SidebarProvider>
          <Sidebar variant="inset" collapsible="icon" className="backdrop-blur-2xl border-r border-white/20 dark:border-white/10">
            <SidebarHeader>
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shrink-0 shadow-lg shadow-primary/20">
                    S
                  </div>
                  <span className="font-semibold text-lg truncate group-data-[collapsible=icon]:hidden drop-shadow-sm">SpotScraper</span>
                </div>
                {/* Desktop Trigger inside the Sidebar */}
                <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
                  <ThemeToggle />
                  <SidebarTrigger className="hidden md:flex" />
                </div>
              </div>
            </SidebarHeader>
            
            <SidebarContent>
              <SidebarGroup>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/dashboard')} tooltip="Dashboard">
                      <NavLink to="/dashboard">
                        <Icons.Dashboard />
                        <span>Dashboard</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/scraper')} tooltip="Scraper Control">
                      <NavLink to="/scraper">
                        <Icons.Scraper />
                        <span>Scraper Control</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/downloads')} tooltip="Downloads">
                      <NavLink to="/downloads">
                        <Icons.Downloads />
                        <span>Downloads ({downloads.length})</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/logs')} tooltip="Detailed Logs">
                      <NavLink to="/logs">
                        <Icons.Logs />
                        <span>Detailed Logs</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/acquire')} tooltip="Data Guide">
                      <NavLink to="/acquire">
                        <Icons.Acquire />
                        <span>Data Guide</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
              <div className="p-4 flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2 bg-sidebar/50 rounded-xl m-2 border border-sidebar-border backdrop-blur-md">
                <span className={`size-2.5 rounded-full shrink-0 shadow-[0_0_8px_currentColor] ${scraperStatus === 'running' ? 'bg-blue-500 text-blue-500 animate-pulse' : scraperStatus === 'success' ? 'bg-green-500 text-green-500' : scraperStatus === 'error' ? 'bg-red-500 text-red-500' : 'bg-gray-500 text-gray-500'}`}></span>
                <span className="text-sm font-medium text-muted-foreground truncate group-data-[collapsible=icon]:hidden drop-shadow-sm">
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
              <SidebarTrigger className="size-7 rounded-full border border-white/20 bg-background/80 hover:bg-background/95 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.15)] flex items-center justify-center text-foreground hover:scale-105 hover:text-primary transition-all duration-300 [&>svg]:size-3.5" />
            </div>
          </Sidebar>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col relative min-h-screen overflow-hidden bg-background/20 backdrop-blur-3xl m-2 rounded-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.1)]">
            {/* Mobile-only floating trigger since sidebar hides completely on mobile */}
            <div className="absolute top-4 left-4 z-50 md:hidden flex items-center gap-2">
              <SidebarTrigger className="bg-background/50 backdrop-blur-md border border-white/10 shadow-sm" />
              <ThemeToggle className="bg-background/50 backdrop-blur-md border border-white/10 shadow-sm" />
            </div>
            
            <div className="flex-1 overflow-auto p-4 pt-16 md:pt-6 md:p-6 lg:p-8 custom-scrollbar">
              <Outlet />
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
            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl rounded-2xl border border-white/20 bg-background/80 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-3 flex items-center justify-between gap-4 z-[100] transition-all duration-500 ${isPlaying ? 'translate-y-0 opacity-100' : 'translate-y-0 opacity-100'}`}>
              <div className="flex items-center gap-3 w-1/3 min-w-[180px]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-inner border border-white/10">
                  <Icons.Music className="size-5 drop-shadow-md" />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate font-semibold text-sm drop-shadow-sm" title={currentTrack.title || currentTrack.name.replace('.mp3', '')}>
                    {currentTrack.title || currentTrack.name.replace('.mp3', '')}
                  </span>
                  <span className="truncate text-xs text-muted-foreground drop-shadow-sm" title={currentTrack.artist || 'Unknown Artist'}>
                    {currentTrack.artist || 'Unknown Artist'}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col items-center gap-1 w-1/3 flex-1">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-full" onClick={handlePlayPrev} disabled={downloads.length === 0} title="Previous">
                    <Icons.SkipBack className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="size-9 rounded-full bg-background/50 backdrop-blur-md border-white/20 shadow-md hover:bg-white/20 flex items-center justify-center" onClick={() => currentTrack && setIsPlaying(!isPlaying)} disabled={!currentTrack}>
                    <span className="t-icon-swap" data-state={isPlaying ? 'a' : 'b'}>
                      <span className="t-icon" data-icon="a">
                        <Icons.Pause className="size-4" />
                      </span>
                      <span className="t-icon" data-icon="b">
                        <Icons.Play className="size-4 translate-x-0.5" />
                      </span>
                    </span>
                  </Button>
                  <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-full" onClick={handlePlayNext} disabled={downloads.length === 0} title="Next">
                    <Icons.SkipForward className="size-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 w-full max-w-md">
                  <span ref={timeTextRef} className="text-[10px] font-medium text-muted-foreground w-8 text-right tabular-nums">0:00</span>
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
                  <span className="text-[10px] font-medium text-muted-foreground w-8 tabular-nums">{formatTime(duration)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 w-1/3 justify-end min-w-[120px]">
                <Icons.Volume className="size-4 text-muted-foreground" />
                <input 
                  type="range" 
                  className="w-20 h-1.5 cursor-pointer appearance-none rounded-full bg-secondary/50 accent-primary backdrop-blur-sm" 
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
