import { IBuildConfig } from './IBuildConfig';

export interface ITask<CONFIG_TYPE> {
  config: (taskConfig: CONFIG_TYPE) => void;

  execute: (config: IBuildConfig) => Promise<any>;

  name?: string;
  buildConfig?: IBuildConfig;
  taskConfig?: CONFIG_TYPE;
}

export default ITask;
