

import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from "react";
import { useAppContext } from "../AppContext";
import { ThemeProvider, useTheme } from './ThemeProvider';
import Icons from './Icons';
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
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

/**
 * Rotating chevron edge trigger — uses useSidebar() state to drive
 * the sidebar-trigger-chevron CSS class rotation.
 * Must render inside <SidebarProvider>.
 */
function SidebarEdgeTrigger() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';
  return (
    <div className="absolute top-1/2 -translate-y-1/2 -right-3.5 z-50 hidden md:flex">
      <button
        onClick={toggleSidebar}
        className="press-scale size-7 rounded-full border border-white/20 bg-background/80 hover:bg-background/95 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.20)] flex items-center justify-center text-foreground hover:text-primary"
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {/* ChevronLeft — points left when expanded, rotates 180° (→ right) when collapsed */}
        <svg
          className="sidebar-trigger-chevron size-3.5"
          data-collapsed={isCollapsed ? 'true' : undefined}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 12L6 8l4-4" />
        </svg>
      </button>
    </div>
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

  // Mounted state for audio player slide-up entrance
  const [playerVisible, setPlayerVisible] = useState(false);
  useEffect(() => {
    if (currentTrack && !playerVisible) {
      // Small rAF delay so CSS transition fires after element is in DOM
      const raf = requestAnimationFrame(() => setPlayerVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    if (!currentTrack) { requestAnimationFrame(() => setPlayerVisible(false)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  const sliderRef = useRef(null);
  const timeTextRef = useRef(null);

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
        <div className="blob-drift absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-green-500/15 dark:bg-green-500/10 blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="blob-drift-slow absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/15 dark:bg-emerald-500/8 blur-[120px] mix-blend-screen pointer-events-none" />
      </div>

      <TooltipProvider delayDuration={0}>
        <SidebarProvider>
          <Sidebar variant="inset" collapsible="icon" className="backdrop-blur-2xl border-r border-white/20 dark:border-white/10">
            <SidebarHeader>
              <div className="flex items-center justify-between p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
                <div className="flex items-center gap-3">
                  <div className="sidebar-logo flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold shrink-0 text-lg">
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
                    <SidebarMenuButton asChild isActive={location.pathname.startsWith('/visualizer')} tooltip="Pulsar Visualizer" className="h-11 text-base font-medium rounded-xl">
                      <NavLink to="/visualizer">
                        <Icons.Activity className="size-5" />
                        <span>Visualizer</span>
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
              <div className="p-4 flex items-center gap-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:m-1 bg-sidebar/50 rounded-xl m-2 border border-sidebar-border backdrop-blur-md">
                <span
                  className="scraper-status-dot size-3 rounded-full shrink-0"
                  data-status={
                    scraperStatus === 'running' ? 'running'
                      : scraperStatus === 'success' ? 'success'
                        : scraperStatus === 'error' ? 'error'
                          : 'idle'
                  }
                />
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

            <SidebarEdgeTrigger />
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
            crossOrigin="anonymous"
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

          {currentTrack && location.pathname !== '/visualizer' && (
            <div
              style={{
                opacity: playerVisible ? 1 : 0,
                transform: playerVisible ? 'translate(-50%, 0)' : 'translate(-50%, 12px)',
                transition: 'opacity 300ms cubic-bezier(0.23,1,0.32,1), transform 300ms cubic-bezier(0.23,1,0.32,1)',
              }}
              className="fixed bottom-6 left-1/2 w-[95%] max-w-3xl rounded-2xl border border-white/20 bg-background/80 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-4 flex items-center justify-between gap-6 z-[100]"
            >
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
                  <Button variant="ghost" size="icon" className="press-scale hover:bg-white/10 rounded-full" onClick={handlePlayPrev} disabled={downloads.length === 0} title="Previous">
                    <Icons.SkipBack className="size-5" />
                  </Button>
                  <Button variant="outline" size="icon" className="press-scale size-11 rounded-full bg-primary text-primary-foreground border-0 shadow-lg hover:bg-[#1db954] hover:scale-105 flex items-center justify-center" onClick={() => currentTrack && setIsPlaying(!isPlaying)} disabled={!currentTrack}>
                    <span className="t-icon-swap" data-state={isPlaying ? 'a' : 'b'}>
                      <span className="t-icon" data-icon="a">
                        <Icons.Pause className="size-5" />
                      </span>
                      <span className="t-icon" data-icon="b">
                        <Icons.Play className="size-5 translate-x-0.5" />
                      </span>
                    </span>
                  </Button>
                  <Button variant="ghost" size="icon" className="press-scale hover:bg-white/10 rounded-full" onClick={handlePlayNext} disabled={downloads.length === 0} title="Next">
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

