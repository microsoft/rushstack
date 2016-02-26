import TaskStatus from './TaskStatus';
import { ITaskWriter } from './TaskWriterFactory';

export interface ITaskDefinition {
  name: string;
  execute: (writer: ITaskWriter) => Promise<any>;
}

export interface ITask extends ITaskDefinition {
  status: TaskStatus;
  dependencies: Array<ITask>;
  dependents: Array<ITask>;
};

export default ITask;
