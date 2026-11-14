import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
for (const dir of ['src','scripts','test']) for (const file of readdirSync(dir)) {
  if (!file.endsWith('.mjs')) continue;
  const result = spawnSync(process.execPath, ['--check', resolve(dir,file)], { stdio:'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Syntax checks passed.');
