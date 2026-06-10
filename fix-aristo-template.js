const fs = require('fs');

const filePath = 'F:/Claude/spotwereld-shopify-theme/templates/page.inbouwspots.json';
let content = fs.readFileSync(filePath, 'utf8');

// Shopify CDN URLs (1 image per variant, already uploaded)
const CDN = {
  wit:   'https://cdn.shopify.com/s/files/1/0988/8720/5208/files/Led-inbouwspots-wit-aristo.jpg?v=1779978726',
  zwart: 'https://cdn.shopify.com/s/files/1/0988/8720/5208/files/led-inbouwspot-varda-slim-fit-6w-dim-zwart-cct-switch.webp?v=1779978727',
  zilver:'https://cdn.shopify.com/s/files/1/0988/8720/5208/files/led-inbouwspot-varda-slim-fit-6w-dim-zilver-cct-switch-outledtl.webp?v=1779978726',
  koper: 'https://cdn.shopify.com/s/files/1/0988/8720/5208/files/led-inbouwspot-varda-slim-fit-6w-dim-koper-cct-switch.webp?v=1779978726',
  goud:  'https://cdn.shopify.com/s/files/1/0988/8720/5208/files/led-inbouwspot-varda-slim-fit-6w-dim-goud-cct-switch-800x800.jpg?v=1779978726',
  satin: 'https://cdn.shopify.com/s/files/1/0988/8720/5208/files/led-inbouwspot-varda-slim-fit-6w-dim-messing-cct-switch.jpg?v=1779978727',
};

// Replace all outledtl.nl image URLs
const replacements = [
  // wit
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/Led-inbouwspots-wit-aristo.jpg', CDN.wit],
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dimbaar-wit-cct-switch.webp', CDN.wit],
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dim-wit-cct-switch.webp', CDN.wit],
  // zwart
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dim-zwart-cct-switch.webp', CDN.zwart],
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/outledtl-led-inbouwspot-varda-slim-fit-6w-dim-zwart.webp', CDN.zwart],
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dim-zwart-outledtl.nl_.webp', CDN.zwart],
  // zilver
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dim-zilver-cct-switch-outledtl.webp', CDN.zilver],
  ['https://www.outledtl.nl/wp-content/uploads/2021/02/Led-inbouwspot-zilver.webp', CDN.zilver],
  ['https://www.outledtl.nl/wp-content/uploads/2021/02/led-inbouwspot-varda-slim-fit-6w-dim-zilver-cct-switch.webp', CDN.zilver],
  // koper
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dim-koper-cct-switch.webp', CDN.koper],
  ['https://www.outledtl.nl/wp-content/uploads/2020/01/led-inbouwspot-varda-outledtl-5w-koper-kopie.jpg', CDN.koper],
  ['https://www.outledtl.nl/wp-content/uploads/2020/01/led-inbouwspot-varda-slim-fit-5w-koper.webp', CDN.koper],
  // goud
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dim-goud-cct-switch-800x800.jpg', CDN.goud],
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dim-goud-cct-switch-outledtl.nl_-800x800.jpg', CDN.goud],
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/outledtl.nl-led-inbouwspot-varda-slim-fit-6w-dim-goud-cct-switch-800x800.jpg', CDN.goud],
  // satin
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dim-messing-cct-switch.jpg', CDN.satin],
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dim-brons-cct-switch-outledtl.jpg', CDN.satin],
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/outledtl-led-inbouwspot-varda-slim-fit-6w-dim-brons-cct-switch.jpg', CDN.satin],
  // driver (4th thumbnail for all variants) → use wit
  ['https://www.outledtl.nl/wp-content/uploads/2025/11/led-inbouwspot-varda-slim-fit-6w-dim-driver.webp', CDN.wit],
];

for (const [from, to] of replacements) {
  const count = (content.split(from).length - 1);
  if (count > 0) {
    content = content.split(from).join(to);
    console.log(`Replaced ${count}x: ${from.split('/').pop()}`);
  }
}

// Rename Aristo → Lesto (all text occurrences in the custom_liquid)
const before = (content.match(/Aristo/g) || []).length;
content = content.split('Aristo').join('Lesto');
console.log(`Renamed "Aristo" → "Lesto": ${before} occurrences`);

// Check for remaining outledtl.nl references
const remaining = (content.match(/outledtl\.nl/g) || []).length;
console.log(`\nRemaining outledtl.nl references: ${remaining}`);

// Verify valid JSON
try {
  JSON.parse(content);
  console.log('✓ JSON is valid');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✓ File written successfully');
} catch(e) {
  console.error('✗ JSON error:', e.message);
}
