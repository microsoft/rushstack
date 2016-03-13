import { IBuildConfig } from './IBuildConfig';

export interface IExecutable {
  execute: (config: IBuildConfig) => Promise<any>;
}

export default IExecutable;
