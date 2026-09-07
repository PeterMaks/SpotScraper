import fs from 'fs';
import path from 'path';

const pagesDir = 'dashboard/frontend/src/pages';

// Dashboard.jsx
let dash = fs.readFileSync(path.join(pagesDir, 'Dashboard.jsx'), 'utf8');
dash = dash.replace(/import React from 'react';/g, 'import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from "react";');
fs.writeFileSync(path.join(pagesDir, 'Dashboard.jsx'), dash);

// DetailedLogs.jsx
let logs = fs.readFileSync(path.join(pagesDir, 'DetailedLogs.jsx'), 'utf8');
logs = logs.replace(/import React, \{ useState, useEffect, useRef \} from 'react';/g, 'import { useState, useEffect, useRef } from "react";');
logs = logs.replace(/import \{ Badge \} from '@\/components\/ui\/badge';\r?\n/g, '');
fs.writeFileSync(path.join(pagesDir, 'DetailedLogs.jsx'), logs);

// Downloads.jsx
let down = fs.readFileSync(path.join(pagesDir, 'Downloads.jsx'), 'utf8');
down = down.replace(/import React, \{ useState \} from 'react';/g, 'import { useState } from "react";');
down = down.replace(/const \[isPendingValue, setIsPending\] = useState\(false\);/g, 'const [, setIsPending] = useState(false);');
down = down.replace(/const \[isPending, setIsPending\] = useState\(false\);/g, 'const [, setIsPending] = useState(false);');
fs.writeFileSync(path.join(pagesDir, 'Downloads.jsx'), down);

// ScraperControl.jsx
let scrap = fs.readFileSync(path.join(pagesDir, 'ScraperControl.jsx'), 'utf8');
scrap = scrap.replace(/import React, \{ useState, useEffect \} from 'react';/g, 'import { useState, useEffect } from "react";');
scrap = scrap.replace(/import \{ CardFooter \} from '@\/components\/ui\/card';\r?\n/g, '');
scrap = scrap.replace(/const \[scraperMode\] = useState/g, 'const [scraperMode, setScraperMode] = useState');
scrap = scrap.replace(/const \[scraperMode, setScraperMode\] = useState/g, 'const [scraperMode] = useState');
fs.writeFileSync(path.join(pagesDir, 'ScraperControl.jsx'), scrap);

// AcquireDataGuide.jsx
let acq = fs.readFileSync(path.join(pagesDir, 'AcquireDataGuide.jsx'), 'utf8');
acq = acq.replace(/import React, \{ useState \} from 'react';/g, 'import { useState } from "react";');
fs.writeFileSync(path.join(pagesDir, 'AcquireDataGuide.jsx'), acq);

// tailwind.config.js - replace require with import if module, wait, tailwind config uses CJS or ESM?
// it says require is not defined. We can just add /* eslint-env node */ at the top of tailwind.config.js
let tw = fs.readFileSync('dashboard/frontend/tailwind.config.js', 'utf8');
if (!tw.includes('/* eslint-env node */')) {
  tw = '/* eslint-env node */\n' + tw;
  fs.writeFileSync('dashboard/frontend/tailwind.config.js', tw);
}

console.log('Final lint fixes applied.');
