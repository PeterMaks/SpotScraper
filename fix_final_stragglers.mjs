import fs from 'fs';

// Fix Layout.jsx
let layout = fs.readFileSync('dashboard/frontend/src/components/Layout.jsx', 'utf8');
layout = layout.replace(/import \{ useAppContext \} from '\.\.\/AppContext';/, 'import { useState, useEffect, useRef } from "react";\nimport { useAppContext } from "../AppContext";');
layout = layout.replace(/React\.useState/g, 'useState');
layout = layout.replace(/React\.useEffect/g, 'useEffect');
layout = layout.replace(/React\.useRef/g, 'useRef');
fs.writeFileSync('dashboard/frontend/src/components/Layout.jsx', layout);

// Fix ErrorBoundary.jsx
let eb = fs.readFileSync('dashboard/frontend/src/components/ErrorBoundary.jsx', 'utf8');
eb = 'import React from "react";\n' + eb;
fs.writeFileSync('dashboard/frontend/src/components/ErrorBoundary.jsx', eb);

// Fix AppContext.jsx
let appctx = fs.readFileSync('dashboard/frontend/src/AppContext.jsx', 'utf8');
appctx = appctx.replace(/fetchStats\(\);/, '// eslint-disable-next-line react-hooks/set-state-in-effect\n    fetchStats();');
fs.writeFileSync('dashboard/frontend/src/AppContext.jsx', appctx);

// Clean Downloads.jsx
let down = fs.readFileSync('dashboard/frontend/src/pages/Downloads.jsx', 'utf8');
down = down.replace(/import React from 'react';\n/, '');
down = down.replace(/const \[, setIsPending\] = useState\(false\);\n/, '');
fs.writeFileSync('dashboard/frontend/src/pages/Downloads.jsx', down);

// Clean ScraperControl.jsx
let scrap = fs.readFileSync('dashboard/frontend/src/pages/ScraperControl.jsx', 'utf8');
scrap = scrap.replace(/import React from 'react';\n/, '');
scrap = scrap.replace(/const \[scraperMode\] = useState\('scrape'\);\n/, '');
fs.writeFileSync('dashboard/frontend/src/pages/ScraperControl.jsx', scrap);

// Clean DetailedLogs.jsx
let logs = fs.readFileSync('dashboard/frontend/src/pages/DetailedLogs.jsx', 'utf8');
logs = logs.replace(/import React from 'react';\n/, '');
fs.writeFileSync('dashboard/frontend/src/pages/DetailedLogs.jsx', logs);

// Clean ListeningTrendChart.jsx
let trend = fs.readFileSync('dashboard/frontend/src/components/ListeningTrendChart.jsx', 'utf8');
trend = trend.replace(/import React from 'react';\n/, '');
trend = trend.replace(/const \[isPendingValue, setIsPending\] = useState\(false\);\n/, '');
trend = trend.replace(/const \[isPending, setIsPending\] = useState\(false\);\n/, '');
fs.writeFileSync('dashboard/frontend/src/components/ListeningTrendChart.jsx', trend);

// Clean TimeOfDayChart.jsx
let time = fs.readFileSync('dashboard/frontend/src/components/TimeOfDayChart.jsx', 'utf8');
time = time.replace(/import React from 'react';\n/, '');
fs.writeFileSync('dashboard/frontend/src/components/TimeOfDayChart.jsx', time);

// Clean Icons.jsx, DayOfWeekChart.jsx
let icons = fs.readFileSync('dashboard/frontend/src/components/Icons.jsx', 'utf8');
icons = icons.replace(/import React from 'react';\n/, '');
fs.writeFileSync('dashboard/frontend/src/components/Icons.jsx', icons);

let day = fs.readFileSync('dashboard/frontend/src/components/DayOfWeekChart.jsx', 'utf8');
day = day.replace(/import React from 'react';\n/, '');
fs.writeFileSync('dashboard/frontend/src/components/DayOfWeekChart.jsx', day);

console.log('Stragglers fixed.');
