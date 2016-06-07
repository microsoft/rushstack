import { IExecutable } from 'gulp-core-build';
import { SassTask } from './SassTask';

export const sass: IExecutable = new SassTask();

/* tslint:disable:export-name */
export default sass;
/* tslint:enable:export-name */
