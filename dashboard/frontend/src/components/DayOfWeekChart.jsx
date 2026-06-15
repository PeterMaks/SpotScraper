import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";

export default function DayOfWeekChart({ data = [] }) {
  if (data.length === 0) return null;

  return (
    <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)] col-span-1 md:col-span-2">
      <CardHeader>
        <CardTitle>Listening by Day of Week</CardTitle>
        <CardDescription>Total hours spent listening each day</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 10%)" vertical={false} />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'oklch(0.6 0 0)', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'oklch(0.6 0 0)', fontSize: 11 }}
                width={40}
                tickFormatter={(v) => `${v}h`}
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
                formatter={(value) => [`${value} hrs`, 'Listening']}
                cursor={{ fill: 'oklch(1 0 0 / 5%)' }}
              />
              <Bar
                dataKey="hours"
                fill="oklch(0.6 0.2 280)"
                radius={[6, 6, 0, 0]}
                barSize={32}
                background={{ fill: 'oklch(1 0 0 / 5%)', radius: 6 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
