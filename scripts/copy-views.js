#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'backend', 'views');
const dest = path.join(__dirname, '..', 'dist', 'backend', 'views'); // FIXED

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

try {
  copyDir(src, dest);
  console.log('✓ Views copied successfully');
} catch (error) {
  console.error('Error copying views:', error);
  process.exit(1);
}
