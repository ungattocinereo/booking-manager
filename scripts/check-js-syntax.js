const { execFileSync, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.js'],
  { encoding: 'utf8' }
)
  .split('\n')
  .map(file => file.trim())
  .filter(file => file && existsSync(file));

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${files.length} JavaScript files`);
