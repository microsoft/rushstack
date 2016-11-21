import { IBuildConfig } from './IBuildConfig';

export interface IExecutable {
  /** Execution method. */
  execute: (config: IBuildConfig) => Promise<void>;

  /** Optional name to give the task. If no name is provided, the "Running subtask" logging will be silent. */
  name?: string;

  /** A JSON Schema object which will be used to validate this task's configuration file */
  schema?: Object;

  /** Optional callback to indicate if the task is enabled or not. */
  isEnabled?: (config?: IBuildConfig) => boolean;

  /** Optional method to indicate directory matches to clean up when the clean task is run. */
  getCleanMatch?: (config: IBuildConfig, taskConfig?: any) => string[]; /* tslint:disable-line:no-any */
}
