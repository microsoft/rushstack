import { TypeScriptTask } from './TypeScriptTask';
import { TSLintTask } from './TSLintTask';
import { TextTask } from './TextTask';
import { TSNpmLintTask } from './TSNpmLintTask';
import { IExecutable, parallel, serial } from 'gulp-core-build';

export const typescript: TypeScriptTask = new TypeScriptTask();
export const tslint: TSLintTask = new TSLintTask();
export const text: TextTask = new TextTask();
export const tsNpmLint: TSNpmLintTask = new TSNpmLintTask();

/* tslint:disable:export-name */
export default parallel(tslint, serial(typescript, tsNpmLint)) as IExecutable;
/* tslint:enable:export-name */
