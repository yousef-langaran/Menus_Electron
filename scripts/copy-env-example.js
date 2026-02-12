const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const example = path.join(root, '.env.example');
const releaseDir = path.join(root, 'release', 'win-unpacked');

if (!fs.existsSync(example)) return;
if (!fs.existsSync(releaseDir)) return;

const dest = path.join(releaseDir, '.env.example');
fs.copyFileSync(example, dest);
console.log('[Menus] Copied .env.example to', releaseDir, '- rename to .env and set NEXT_PUBLIC_API_BASE_URL (or API_BASE_URL).');
