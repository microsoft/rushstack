import { ITask } from './ITask';
export { ITask } from './ITask';
export { GulpTask } from './GulpTask';
export { log, logError } from './logging';
export declare function task(taskName: string, task: ITask): ITask;
export declare function serial(...tasks: ITask[]): ITask;
export declare function parallel(...tasks: ITask[]): ITask;
export declare function initialize(gulp: any, configOverrides?: any): void;
