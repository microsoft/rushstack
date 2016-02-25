import TaskStatus from './TaskStatus';
import { ITaskWriter } from './TaskWriterFactory';

export interface ITask {
  name: string;
  status: TaskStatus;
  execute: (writer: ITaskWriter) => Promise<any>;
  dependencies: Array<ITask>;
  dependents: Array<ITask>;
};

export default ITask;