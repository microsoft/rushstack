// tslint:disable:export-name

import { TypeScriptTask } from './TypeScriptTask';
import { TSLintTask } from './TSLintTask';
import { TextTask } from './TextTask';
import { RemoveTripleSlashReferenceTask } from './RemoveTripleSlashReferenceTask';
import { IExecutable, parallel, serial } from '@microsoft/gulp-core-build';

export const typescript: TypeScriptTask = new TypeScriptTask();
export const tslint: TSLintTask = new TSLintTask();
export const text: TextTask = new TextTask();
export const removeTripleSlash: RemoveTripleSlashReferenceTask = new RemoveTripleSlashReferenceTask();

export default parallel(tslint, serial(typescript, removeTripleSlash)) as IExecutable;
