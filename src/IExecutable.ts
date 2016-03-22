import { IBuildConfig } from './IBuildConfig';

export interface IExecutable {
  execute: (config: IBuildConfig) => Promise<any>;

  name?: string;
  isEnabled?: () => boolean;
}

export default IExecutable;
