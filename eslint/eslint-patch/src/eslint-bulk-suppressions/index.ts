import path from 'path';
import { eslintFolder } from '../_patch-base';
// @ts-ignore
// import { Linter as LinterPatch } from './linter-patch-for-eslint-v8.7.0';
import { findAndConsoleLogPatchPath, patchClass, whichPatchToLoad } from './bulk-suppressions-patch';

console.log('HELLO THERE');

if (!eslintFolder) {
  console.error(
    '@rushstack/eslint-patch/eslint-bulk-suppressions: Could not find ESLint installation to patch.'
  );
  process.exit(1);
}
if (process.env.ESLINT_BULK_FIND === 'true') {
  findAndConsoleLogPatchPath();
  process.exit(0);
}

const patchForSpecificESLintVersion = whichPatchToLoad(eslintFolder);
if (!patchForSpecificESLintVersion) process.exit();
const { Linter: LinterPatch } = require(`./${patchForSpecificESLintVersion}`);

const pathToLinterJs = path.join(eslintFolder, 'lib/linter/linter.js');
const { Linter } = require(pathToLinterJs);

patchClass(Linter, LinterPatch);
