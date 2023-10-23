import path from 'path';
import { eslintFolder } from '../_patch-base';
// @ts-ignore
// import { Linter as LinterPatch } from './linter-patch-for-eslint-v8.7.0';
import { patchClass, whichPatchToLoad } from './bulk-suppressions-patch';

if (!eslintFolder) process.exit();

const patchForSpecificESLintVersion = whichPatchToLoad(eslintFolder);
if (!patchForSpecificESLintVersion) process.exit();
const { Linter: LinterPatch } = require(`./${patchForSpecificESLintVersion}`);

const pathToLinterJs = path.join(eslintFolder, 'lib/linter/linter.js');
const { Linter } = require(pathToLinterJs);

patchClass(Linter, LinterPatch);
