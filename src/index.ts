import { ServeTask } from './ServeTask';
import { ReloadTask } from './ReloadTask';

export const serve = new ServeTask();
export const reload = new ReloadTask();

export default serve;
