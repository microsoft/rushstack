import { TypeScriptTask } from './TypeScriptTask';
import { TSLintTask } from './TSLintTask';
import { ITask, parallel } from 'gulp-core-build';

export const typescript = new TypeScriptTask();
export const tslint = new TSLintTask();

export default parallel(tslint, typescript) as ITask<any>;
