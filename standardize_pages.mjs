import fs from 'fs';
import path from 'path';

const pagesDir = 'dashboard/frontend/src/pages';
const files = ['Dashboard.jsx', 'ScraperControl.jsx', 'Downloads.jsx', 'DetailedLogs.jsx', 'AcquireDataGuide.jsx'];

for (const file of files) {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Standardize backgrounds and borders
  content = content.replace(/backdrop-blur-xl bg-card\/\d+/g, 'bg-card');
  content = content.replace(/backdrop-blur-md bg-card\/\d+/g, 'bg-card');
  content = content.replace(/bg-card\/\d+/g, 'bg-card');
  content = content.replace(/border-white\/\d+/g, 'border-border');
  content = content.replace(/border-dashed border-white\/\d+/g, 'border-dashed border-border');
  content = content.replace(/bg-secondary\/\d+/g, 'bg-secondary');
  content = content.replace(/bg-muted\/\d+/g, 'bg-muted');

  // Replace `import React` with specific hooks, and replace `React.use` with `use`
  if (content.includes('React.use')) {
    content = content.replace(/React\.use/g, 'use');
    if (file === 'Dashboard.jsx') {
      content = content.replace(/import React from 'react';\n/, 'import { useState, useEffect, useMemo, useRef } from "react";\n');
    }
  } else {
    // If no React.use, it's safe to just remove `import React` if it's the default import
    content = content.replace(/import React from 'react';\n/, '');
  }
  
  if (file === 'DetailedLogs.jsx') {
    content = content.replace(/catch \(err\) \{\}/g, 'catch (err) { console.error(err); }');
    content = content.replace(/useEffect\(\(\) => \{ fetchLogs\(\); \}, \[\]\);/g, 'useEffect(() => { fetchLogs(); }, [fetchLogs]);');
    content = content.replace(/import \{ Badge \} from '@\/components\/ui\/badge';\n/g, '');
    content = content.replace(/import React, \{ useState, useEffect, useRef \} from 'react';\n/g, 'import { useState, useEffect, useRef } from "react";\n');
  }

  if (file === 'ScraperControl.jsx') {
    content = content.replace(/import \{ CardFooter \} from '@\/components\/ui\/card';\n/g, '');
    content = content.replace(/const \[scraperMode, setScraperMode\] = useState/g, 'const [scraperMode] = useState');
    content = content.replace(/import React, \{ useState, useEffect \} from 'react';\n/g, 'import { useState, useEffect } from "react";\n');
  }

  if (file === 'Dashboard.jsx') {
    // Remove unused isAnimating from NumberPopIn
    content = content.replace(/  const \[isAnimating, setIsAnimating\] = useState\(false\);\n/g, '');
    content = content.replace(/      setIsAnimating\(false\);\n/g, '');
    content = content.replace(/      const raf = requestAnimationFrame\(\(\) => setIsAnimating\(true\)\);\n/g, '      const raf = requestAnimationFrame(() => {});\n');
    content = content.replace(/  useEffect\(\(\) => \{ setIsAnimating\(true\); \}, \[\]\);\n/g, '');
  }

  if (file === 'Downloads.jsx') {
    content = content.replace(/const isPending = /g, 'const isPendingValue = ');
    content = content.replace(/import React, \{ useState \} from 'react';\n/, 'import { useState } from "react";\n');
  }
  
  if (file === 'AcquireDataGuide.jsx') {
    content = content.replace(/import React, \{ useState \} from 'react';\n/, 'import { useState } from "react";\n');
  }

  fs.writeFileSync(filePath, content);
  console.log(`Standardized ${file}`);
}
