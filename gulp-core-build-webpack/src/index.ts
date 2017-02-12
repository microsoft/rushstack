import { WebpackTask } from './WebpackTask';

export { IWebpackTaskConfiguration, WebpackTask } from './WebpackTask'

/* tslint:disable:export-name */
export const webpack: WebpackTask = new WebpackTask();
export default webpack;
/* tslint:enable:export-name */
