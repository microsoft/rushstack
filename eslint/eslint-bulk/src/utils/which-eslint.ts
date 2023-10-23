import { execSync } from 'child_process';
import path from 'path';

const SUPPORTED_VERSIONS = ['v8.6.0', 'v8.7.0', 'v8.21.0', 'v8.22.0', 'v8.23.0', 'v8.23.1'];

export function whichEslint(): string {
  // Try to find a local ESLint installation
  try {
    const localEslintPath = path.dirname(require.resolve('eslint', { paths: [__dirname, process.cwd()] }));
    const eslintPackageJson = require(path.join(path.dirname(localEslintPath), 'package.json'));
    const localEslintVersion = eslintPackageJson.version;

    if (SUPPORTED_VERSIONS.includes(localEslintVersion))
      return `node ${path.join(localEslintPath, 'bin', 'eslint.js')}`;
  } catch {
    // If we can't find a local ESLint or read its version, we do nothing and move on to the next step
  }

  // Try to find a npx ESLint installation
  try {
    const npxEslintVersion = execSync('npx eslint -v', { stdio: 'ignore' }).toString().trim();

    if (SUPPORTED_VERSIONS.includes(npxEslintVersion)) return 'npx eslint';
  } catch {
    // If we can't find a npx ESLint or read its version, we do nothing and move on to the next step
  }

  // If we haven't returned by now, we didn't find a supported local or npx version, so we fetch a specific remote version
  return 'npx eslint@8.23.1';
}
