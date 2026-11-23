import fs from 'fs';

const logFile = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity-ide/brain/1e5b953e-586a-41bc-b30c-fc27142a38a1/.system_generated/tasks/task-110.log', 'utf8');

let event;
for (const line of logFile.split('\n')) {
  if (line.startsWith('{"type":"generate"')) {
    event = JSON.parse(line);
    break;
  }
}

const wrapperBlock = event.scaffold.wrapperBlock;
const originalHtmlRaw = wrapperBlock.substring(
  wrapperBlock.indexOf('<div className="flex flex-col gap-8 pb-32">'),
  wrapperBlock.indexOf('      {/* Variants: insert below this line */}')
);
const originalHtml = originalHtmlRaw.replace(/\s*<\/div>\s*$/, '');

// Variant 1: Rhythm / Density
const v1Params = JSON.stringify([
  {id: 'density', kind: 'steps', options: [{value: 'snug', label: 'Snug'}, {value: 'airy', label: 'Airy'}], default: 'snug', label: 'Density'},
  {id: 'text_size', kind: 'toggle', default: true, label: 'Compact Text'}
]);
let v1Html = originalHtml
  .replace(/gap-8/g, 'gap-4')
  .replace(/gap-6/g, 'gap-4')
  .replace(/gap-5/g, 'gap-3')
  .replace(/p-6/g, 'p-4')
  .replace(/pb-32/g, 'pb-16')
  .replace(/text-4xl/g, 'text-3xl')
  .replace(/text-xl/g, 'text-lg');

// Variant 2: Hierarchy (Open Layout, less card background)
const v2Params = JSON.stringify([
  {id: 'borders', kind: 'toggle', default: false, label: 'Show Borders'},
  {id: 'shadow', kind: 'range', min: 0, max: 1, step: 0.1, default: 0, label: 'Shadow Depth'}
]);
let v2Html = originalHtml
  .replace(/bg-card\/40/g, 'bg-transparent')
  .replace(/border-white\/15/g, 'border-transparent')
  .replace(/border-white\/10/g, 'border-transparent')
  .replace(/shadow-sm/g, 'shadow-none')
  .replace(/backdrop-blur-xl/g, '');

// Variant 3: Micro-details (Heavier glass, rounder)
const v3Params = JSON.stringify([
  {id: 'radius', kind: 'steps', options: [{value: 'xl', label: 'XL'}, {value: 'full', label: 'Full'}], default: 'xl', label: 'Corner Radius'},
  {id: 'glass', kind: 'range', min: 0, max: 1, step: 0.1, default: 0.8, label: 'Glass Opacity'}
]);
let v3Html = originalHtml
  .replace(/bg-card\/40/g, 'bg-card/80')
  .replace(/border-white\/15/g, 'border-white/20')
  .replace(/rounded-xl/g, 'rounded-3xl');

const css = `
<style data-impeccable-css="29c6ebbc">{\`
  @scope ([data-impeccable-variant="1"]) {
    :scope[data-p-density="airy"] > .flex { gap: 2rem; }
    :scope[data-p-text_size="1"] h2 { font-size: 1.5rem; line-height: 2rem; }
  }
  @scope ([data-impeccable-variant="2"]) {
    :scope[data-p-borders="1"] .border-transparent { border-color: rgba(255,255,255,0.1) !important; }
  }
  @scope ([data-impeccable-variant="3"]) {
    :scope[data-p-radius="full"] .rounded-3xl { border-radius: 9999px !important; }
    :scope .bg-card\\\\/80 { background-color: color-mix(in srgb, var(--card) calc(var(--p-glass, 0.8) * 100%), transparent) !important; }
  }
\`}</style>
`;

const variantsStr = `
      ${css}
      <div data-impeccable-variant="1" data-impeccable-params='${v1Params}'>
${v1Html}
      </div>
      <div data-impeccable-variant="2" style={{ display: 'none' }} data-impeccable-params='${v2Params}'>
${v2Html}
      </div>
      <div data-impeccable-variant="3" style={{ display: 'none' }} data-impeccable-params='${v3Params}'>
${v3Html}
      </div>
`;

const finalWrapper = wrapperBlock.replace(
  '      {/* Variants: insert below this line */}',
  '      {/* Variants: insert below this line */}\n' + variantsStr
);

const dashPath = 'dashboard/frontend/src/pages/Dashboard.jsx';
const dashCode = fs.readFileSync(dashPath, 'utf8');
const lines = dashCode.split('\n');

// Replace lines 253 to 524 with the split lines of finalWrapper
lines.splice(253, 525 - 254 + 1, ...finalWrapper.split('\n'));

fs.writeFileSync(dashPath, lines.join('\n'));
console.log('Successfully wrote variants to Dashboard.jsx');
