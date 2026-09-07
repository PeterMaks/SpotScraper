import fs from 'fs';
import path from 'path';

const pagesDir = 'dashboard/frontend/src/pages';

// Dashboard.jsx
let dash = fs.readFileSync(path.join(pagesDir, 'Dashboard.jsx'), 'utf8');
dash = dash.replace(/import \{ useState, useEffect, useMemo, useRef \} from "react";/, 'import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from "react";');
dash = dash.replace(/const \[isAnimating, setIsAnimating\] = useState\(false\);/, '');
dash = dash.replace(/setIsAnimating\(false\);/, '');
dash = dash.replace(/const raf = requestAnimationFrame\(\(\) => setIsAnimating\(true\)\);/, 'const raf = requestAnimationFrame(() => {});');
dash = dash.replace(/useEffect\(\(\) => \{ setIsAnimating\(true\); \}, \[\]\);/, '');
fs.writeFileSync(path.join(pagesDir, 'Dashboard.jsx'), dash);

// DetailedLogs.jsx
let logs = fs.readFileSync(path.join(pagesDir, 'DetailedLogs.jsx'), 'utf8');
logs = logs.replace(/import React, \{ useState, useEffect, useRef \} from 'react';/, 'import { useState, useEffect, useRef } from "react";');
logs = logs.replace(/import \{ Badge \} from '@\/components\/ui\/badge';/, '');
fs.writeFileSync(path.join(pagesDir, 'DetailedLogs.jsx'), logs);

// Downloads.jsx
let down = fs.readFileSync(path.join(pagesDir, 'Downloads.jsx'), 'utf8');
down = down.replace(/import React, \{ useState \} from 'react';/, 'import { useState } from "react";');
down = down.replace(/const \[isPending, setIsPending\] = useState\(false\);/, 'const [isPendingValue, setIsPending] = useState(false);');
fs.writeFileSync(path.join(pagesDir, 'Downloads.jsx'), down);

// ScraperControl.jsx
let scrap = fs.readFileSync(path.join(pagesDir, 'ScraperControl.jsx'), 'utf8');
scrap = scrap.replace(/import React, \{ useState, useEffect \} from 'react';/, 'import { useState, useEffect } from "react";');
scrap = scrap.replace(/import \{ CardFooter \} from '@\/components\/ui\/card';/, '');
scrap = scrap.replace(/const \[scraperMode, setScraperMode\] = useState/, 'const [scraperMode] = useState');
fs.writeFileSync(path.join(pagesDir, 'ScraperControl.jsx'), scrap);

// AcquireDataGuide.jsx
let acq = fs.readFileSync(path.join(pagesDir, 'AcquireDataGuide.jsx'), 'utf8');
acq = acq.replace(/import React, \{ useState \} from 'react';/, 'import { useState } from "react";');
fs.writeFileSync(path.join(pagesDir, 'AcquireDataGuide.jsx'), acq);

console.log('Lint fixes applied.');
