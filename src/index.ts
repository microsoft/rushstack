import { TypeScriptTask } from './TypeScriptTask';
import { TSLintTask } from './TSLintTask';
import { TextTask } from './TextTask';
import { TSNpmLintTask } from './TSNpmLintTask';
import { IExecutable, parallel, serial } from 'gulp-core-build';

export const typescript = new TypeScriptTask();
export const tslint = new TSLintTask();
export const text = new TextTask();
export const tsNpmLint = new TSNpmLintTask();

export default parallel(tslint, serial(typescript, tsNpmLint)) as IExecutable;
