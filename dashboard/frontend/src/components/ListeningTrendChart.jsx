import React, { useMemo, useState, useTransition } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ListeningTrendChart({ data = [], isAllPlatforms = false }) {
  const [selectedYear, setSelectedYear] = useState('All');
  const [splitPlatforms, setSplitPlatforms] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Extract unique years for the dropdown
  const years = useMemo(() => {
    const ySet = new Set();
    data.forEach(d => ySet.add(d.date.substring(0, 4)));
    return Array.from(ySet).sort((a, b) => b.localeCompare(a));
  }, [data]);

  // Filter data by year and add timestamp for continuous time scale
  const chartData = useMemo(() => {
    let filtered = data;
    if (selectedYear !== 'All') {
      filtered = data.filter(d => d.date.startsWith(selectedYear));
    }
    return filtered.map(d => ({
      ...d,
      timestamp: new Date(d.date).getTime()
    }));
  }, [data, selectedYear]);

  return (
    <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)] col-span-1 md:col-span-2 lg:col-span-3 transition-all duration-300">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2">
        <div>
          <CardTitle>Listening Trend</CardTitle>
          <CardDescription>Daily listening hours over time</CardDescription>
        </div>
        <div className="flex items-center gap-3">
          {isAllPlatforms && (
            <label
              className="flex items-center gap-2 text-xs font-medium cursor-pointer text-muted-foreground hover:text-foreground transition-colors select-none"
              title="Split by platform"
            >
              {/* Toggle switch */}
              <span
                role="checkbox"
                aria-checked={splitPlatforms}
                onClick={() => startTransition(() => setSplitPlatforms(p => !p))}
                style={{
                  display: 'inline-flex',
                  width: 32,
                  height: 18,
                  borderRadius: 9999,
                  background: splitPlatforms ? '#1ed760' : 'oklch(0.3 0 0 / 60%)',
                  transition: 'background 200ms cubic-bezier(0.23,1,0.32,1)',
                  position: 'relative',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute',
                  top: 2,
                  left: splitPlatforms ? 16 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 200ms cubic-bezier(0.23,1,0.32,1)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }} />
              </span>
              Split Platforms
            </label>
          )}
          
          <Select value={selectedYear} onValueChange={(v) => startTransition(() => setSelectedYear(v))}>
            <SelectTrigger className="w-[110px] h-8 text-xs font-semibold">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="All">All Time</SelectItem>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="w-full h-[280px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">No listening data for {selectedYear === 'All' ? 'this platform' : selectedYear}.</p>
          </div>
        ) : (
        <div className="w-full h-[280px] animate-in fade-in duration-700">
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.65 0.2 280)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="oklch(0.65 0.2 280)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="spotifyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1DB954" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#1DB954" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="appleGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FA243C" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#FA243C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 10%)" vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  if (selectedYear === 'All') {
                    return `${months[d.getUTCMonth()]} '${d.getUTCFullYear().toString().slice(2)}`;
                  }
                  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
                }}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'oklch(0.6 0 0)', fontSize: 11 }}
                minTickGap={35}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'oklch(0.6 0 0)', fontSize: 11 }}
                width={36}
                tickFormatter={(v) => `${Math.round(v)}h`}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'oklch(0.15 0 0 / 80%)',
                  border: '1px solid oklch(1 0 0 / 15%)',
                  borderRadius: '0.75rem',
                  backdropFilter: 'blur(12px)',
                  color: '#fff',
                  fontSize: '0.8rem',
                }}
                itemStyle={{ color: '#fff', fontWeight: 500 }}
                labelFormatter={(label) => {
                  const d = new Date(label);
                  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
                }}
              />
              {(!splitPlatforms || !isAllPlatforms) ? (
                <Area
                  type="monotone"
                  dataKey="hours"
                  name="Total Hours"
                  stroke="oklch(0.65 0.2 280)"
                  strokeWidth={2}
                  fill="url(#totalGradient)"
                  dot={false}
                  activeDot={{ r: 5, fill: 'oklch(0.65 0.2 280)', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              ) : (
                <>
                  <Area
                    type="monotone"
                    dataKey="spotifyHours"
                    name="Spotify"
                    stroke="#1DB954"
                    strokeWidth={2}
                    fill="url(#spotifyGradient)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#1DB954', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                  <Area
                    type="monotone"
                    dataKey="appleHours"
                    name="Apple Music"
                    stroke="#FA243C"
                    strokeWidth={2}
                    fill="url(#appleGradient)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#FA243C', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
