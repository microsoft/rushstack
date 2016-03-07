import { IBuildConfig } from './IBuildConfig';
export interface ITask {
    execute: (config: IBuildConfig) => Promise<any>;
    name?: string;
}
export default ITask;
