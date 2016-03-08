import { TypeScriptTask } from './TypeScriptTask';
import { TSLintTask } from './TSLintTask';

export { ITask } from 'gulp-core-build';
export const typescript = new TypeScriptTask();
export const tslint = new TSLintTask();

export default typescript;
