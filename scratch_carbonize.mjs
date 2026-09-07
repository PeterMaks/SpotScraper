import fs from 'fs';

const dashPath = 'dashboard/frontend/src/pages/Dashboard.jsx';
let dashCode = fs.readFileSync(dashPath, 'utf8');

const startMarker = '<div data-impeccable-variants="29c6ebbc" data-impeccable-variant-count="3" style={{ display: "contents" }}>';
const endMarker = '{/* impeccable-variants-end 29c6ebbc */}';

if (dashCode.includes(startMarker) && dashCode.includes(endMarker)) {
  const startIndex = dashCode.indexOf(startMarker);
  const endIndex = dashCode.indexOf(endMarker) + endMarker.length + 12; // include trailing \n    </div>

  const block = dashCode.substring(startIndex, endIndex);

  // Extract the content of Variant 1
  const v1Start = block.indexOf('<div data-impeccable-variant="1">');
  const v1End = block.indexOf('<div data-impeccable-variant="2"');
  
  if (v1Start !== -1 && v1End !== -1) {
    let v1Content = block.substring(v1Start, v1End);
    
    // Remove the wrapper <div data-impeccable-variant="1"> and its closing </div>
    v1Content = v1Content.replace('<div data-impeccable-variant="1">\n', '');
    v1Content = v1Content.replace(/\s*<\/div>\s*$/, '\n');
    
    // Apply the CSS rule for text_size directly to the HTML
    v1Content = v1Content.replace('className="text-3xl font-extrabold tracking-tight"', 'className="text-2xl font-extrabold tracking-tight"');

    // Replace the whole block with the unwrapped v1Content
    dashCode = dashCode.substring(0, startIndex) + v1Content + dashCode.substring(endIndex);
    
    fs.writeFileSync(dashPath, dashCode);
    console.log('Successfully carbonized Dashboard.jsx');
  } else {
    console.log('Could not find Variant 1 boundaries');
  }
} else {
  console.log('Could not find impeccable-variants block');
}
