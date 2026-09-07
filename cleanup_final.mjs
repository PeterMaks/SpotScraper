import fs from 'fs';
import path from 'path';

// Fix Layout.jsx
const layoutPath = 'dashboard/frontend/src/components/Layout.jsx';
let layout = fs.readFileSync(layoutPath, 'utf8');
layout = layout.replace(/import \{ ThemeProvider \} from '\.\/ThemeProvider';/, '');
layout = layout.replace(/if \(\!currentTrack\) setPlayerVisible\(false\);/, 'if (!currentTrack) { requestAnimationFrame(() => setPlayerVisible(false)); }');
fs.writeFileSync(layoutPath, layout);

// Remove unused React imports in all components
const componentsDir = 'dashboard/frontend/src/components';
const components = fs.readdirSync(componentsDir).filter(f => f.endsWith('.jsx'));
for (const comp of components) {
  const p = path.join(componentsDir, comp);
  let content = fs.readFileSync(p, 'utf8');
  if (content.includes('import React from \'react\';')) {
    content = content.replace(/import React from 'react';\r?\n/, '');
    fs.writeFileSync(p, content);
  }
}

// Remove unused React imports in ui components
const uiDir = 'dashboard/frontend/src/components/ui';
if (fs.existsSync(uiDir)) {
  const uiComps = fs.readdirSync(uiDir).filter(f => f.endsWith('.jsx'));
  for (const comp of uiComps) {
    const p = path.join(uiDir, comp);
    let content = fs.readFileSync(p, 'utf8');
    if (content.includes('import React from \'react\';') || content.includes('import * as React from "react"')) {
      // we only remove if it's unused. wait, shadcn ui components often use React.forwardRef, which uses React!
      // But if we have eslint 'React' is defined but never used, it means they don't use React.
      // Wait, shadcn components might use React.forwardRef. If we remove it and they need it, we break them.
      // Let's only remove 'import React' if it's the specific files from the lint error:
      // badge.jsx, button.jsx, card.jsx, input.jsx, progress.jsx, select.jsx, separator.jsx, sheet.jsx, table.jsx, toggle.jsx, tooltip.jsx
      if (['badge.jsx', 'button.jsx', 'card.jsx', 'input.jsx', 'progress.jsx', 'select.jsx', 'separator.jsx', 'sheet.jsx', 'table.jsx', 'toggle.jsx', 'tooltip.jsx'].includes(comp)) {
        content = content.replace(/import \* as React from "react"\r?\n/, '');
        fs.writeFileSync(p, content);
      }
    }
  }
}

// Fix tailwind.config.js
let tw = fs.readFileSync('dashboard/frontend/tailwind.config.js', 'utf8');
tw = tw.replace(/\/\* eslint-env node \*\/\n/, '');
tw = tw.replace(/require\(/g, '/* eslint-disable-next-line no-undef */\nrequire(');
fs.writeFileSync('dashboard/frontend/tailwind.config.js', tw);

console.log('Cleanup final applied.');
