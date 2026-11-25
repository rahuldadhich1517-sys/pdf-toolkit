import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('Verifying package distribution build state...');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

// Verify zero dependencies
const deps = Object.keys(pkg.dependencies || {});
const devDeps = Object.keys(pkg.devDependencies || {});

if (deps.length > 0) {
  console.error(`Build error: package.json has ${deps.length} runtime dependencies! Must be 0.`);
  process.exit(1);
}

if (devDeps.length > 0) {
  console.error(`Build error: package.json has ${devDeps.length} devDependencies! Must be 0.`);
  process.exit(1);
}

// Verify files specified in package.json exist
const files = pkg.files || [];
for (const file of files) {
  const fullPath = path.join(rootDir, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Build error: file or directory listed in "files" does not exist: ${file}`);
    process.exit(1);
  }
}

// Verify ES module configuration
if (pkg.type !== 'module') {
  console.error('Build error: package.json must have "type": "module"');
  process.exit(1);
}

console.log('✓ Package distribution verified:');
console.log(`  - Package name: ${pkg.name}`);
console.log(`  - Version: ${pkg.version}`);
console.log(`  - Pure ES Module (no compilation artifacts required)`);
console.log(`  - Zero runtime dependencies`);
console.log(`  - Zero devDependencies`);
console.log('Build check passed.');
process.exit(0);
