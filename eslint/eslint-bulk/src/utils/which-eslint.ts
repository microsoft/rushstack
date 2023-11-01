import { execSync } from 'child_process';
import path from 'path';

const SUPPORTED_VERSIONS = ['8.6.0', '8.7.0', '8.21.0', '8.22.0', '8.23.0', '8.23.1'];

export function whichEslint(packagePath: string, unsafeEslintVersion?: boolean): string {
  // Try to find a local ESLint installation, the one that should be listed as a dev dependency in package.json
  // and installed in node_modules
  try {
    const localEslintApiPath = require.resolve('eslint', { paths: [packagePath] });
    const localEslintPath = path.dirname(path.dirname(localEslintApiPath));
    const eslintPackageJson = require(path.join(localEslintPath, 'package.json'));
    const localEslintVersion = eslintPackageJson.version;
    const eslintExecutable = path.join(localEslintPath, 'bin', 'eslint.js');

    if (SUPPORTED_VERSIONS.includes(localEslintVersion)) {
      return `node ${eslintExecutable}`;
    }
  } catch {
    if (!unsafeEslintVersion) {
      throw new Error(
        '@rushstack/eslint-bulk: eslint is specified as a dev dependency in package.json, but eslint-bulk cannot find it in node_modules.'
      );
    }
  }

  if (!unsafeEslintVersion) {
    throw new Error(
      `@rushstack/eslint-bulk: Unable to find a supported local ESLint installation. Supported versions are ${SUPPORTED_VERSIONS.join(
        ', '
      )}`
    );
  }

  return guessEslintVersion();
}

function guessEslintVersion() {
  try {
    const globalEslintVersion = execSync('eslint -v', { stdio: 'ignore' })
      .toString()
      .trim()
      // get rid of the "v" prefix
      .slice(1);

    if (SUPPORTED_VERSIONS.includes(globalEslintVersion)) {
      return 'eslint';
    }
  } catch {
    // If we can't find a global ESLint installation or read its version, we do nothing and move on to the next step
  }

  // Try to find a npx ESLint installation
  try {
    const npxEslintVersion = execSync('npx eslint -v', { stdio: 'ignore' })
      .toString()
      .trim() // get rid of the "v" prefix
      .slice(1);

    if (SUPPORTED_VERSIONS.includes(npxEslintVersion)) {
      return 'npx eslint';
    }
  } catch {
    // If we can't find a npx ESLint installation or read its version, we do nothing and move on to the next step
  }

  // If we haven't returned by now, we didn't find a supported local or npx version, so we fetch a specific remote version
  return 'npx eslint@8.23.1';
}
