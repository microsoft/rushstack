import { ServeTask } from './ServeTask';
import { ReloadTask } from './ReloadTask';

export const serve: ServeTask = new ServeTask();
export const reload: ReloadTask = new ReloadTask();

/* tslint:disable:export-name */
export default serve;
/* tslint:enable:export-name */
