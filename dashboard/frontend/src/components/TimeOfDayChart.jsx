import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";

const COLORS = [
  'oklch(0.7 0.18 200)',  // morning - teal
  'oklch(0.72 0.16 80)',  // afternoon - amber
  'oklch(0.6 0.22 280)',  // evening - purple
  'oklch(0.5 0.15 250)',  // night - indigo
];

export default function TimeOfDayChart({ data = [] }) {
  if (data.length === 0) return null;
  const total = data.reduce((sum, d) => sum + d.hours, 0);

  return (
    <Card className="backdrop-blur-xl bg-card/40 border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.08)] flex flex-col">
      <CardHeader className="items-center sm:items-start pb-0">
        <CardTitle>Listening by Time of Day</CardTitle>
        <CardDescription>Distribution across your day</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex items-center justify-center">
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius="80%"
                dataKey="hours"
                nameKey="period"
                stroke="oklch(1 0 0 / 20%)"
                strokeWidth={2}
                cornerRadius={6}
                paddingAngle={2}
                label={({ period, hours }) => `${Math.round((hours / total) * 100)}%`}
                labelLine={false}
              >
                {data.map((entry, i) => (
                  <Cell key={entry.period} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'oklch(0.15 0 0 / 80%)',
                  border: '1px solid oklch(1 0 0 / 15%)',
                  borderRadius: '0.75rem',
                  backdropFilter: 'blur(12px)',
                  color: '#fff',
                  fontSize: '0.8rem',
                }}
                formatter={(value) => [`${value} hrs`, '']}
              />
              <Legend
                formatter={(value) => <span style={{ color: 'oklch(0.7 0 0)', fontSize: '0.75rem' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
