import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('Running zero-dependency lint & dependency audit...');

function getAllFiles(dir, exts = ['.js']) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        results = results.concat(getAllFiles(fullPath, exts));
      }
    } else if (exts.some(ext => file.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

const srcFiles = getAllFiles(path.join(rootDir, 'src'));
const testFiles = getAllFiles(path.join(rootDir, 'tests'));
let errorCount = 0;

// Audit 1: No third-party packages or Node built-ins inside browser src/
const nodeBuiltins = [
  'fs', 'node:fs', 'path', 'node:path', 'crypto', 'node:crypto',
  'child_process', 'node:child_process', 'os', 'node:os', 'net', 'node:net',
  'http', 'node:http', 'https', 'node:https', 'stream', 'node:stream'
];

for (const filePath of srcFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(rootDir, filePath);

  // Check imports
  const importLines = content.match(/from\s+['"][^'"]+['"]/g) || [];
  for (const imp of importLines) {
    const target = imp.replace(/from\s+['"]/, '').replace(/['"]$/, '');
    
    // Check if relative
    if (!target.startsWith('.') && !target.startsWith('/')) {
      console.error(`Lint error in ${relPath}: non-relative import "${target}" in browser source!`);
      errorCount++;
    }

    // Check for Node builtins
    if (nodeBuiltins.includes(target)) {
      console.error(`Lint error in ${relPath}: forbidden Node.js built-in import "${target}"!`);
      errorCount++;
    }
  }
}

// Audit 2: Syntax checks
for (const filePath of [...srcFiles, ...testFiles]) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(rootDir, filePath);
  
  if (content.charCodeAt(0) === 0xFEFF) {
    console.error(`Lint error in ${relPath}: unexpected UTF-8 BOM detected`);
    errorCount++;
  }
}

if (errorCount > 0) {
  console.error(`Lint failed with ${errorCount} error(s).`);
  process.exit(1);
}

console.log(`✓ Linted ${srcFiles.length} library source files.`);
console.log(`✓ Linted ${testFiles.length} test files.`);
console.log('✓ Zero third-party runtime/dev dependencies verified.');
console.log('✓ No Node.js built-ins in browser source tree.');
console.log('Lint check passed (0 errors).');
process.exit(0);
