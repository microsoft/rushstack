import fs from 'fs';
import path from 'path';

export function isCorrectCwd(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'package.json'));
}
