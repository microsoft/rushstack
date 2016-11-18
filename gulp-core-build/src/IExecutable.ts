import { IBuildConfig } from './IBuildConfig';

export interface IExecutable<TASK_CONFIG> {
  /** Execution method. */
  execute: (config: IBuildConfig) => Promise<void>;

  /** Optional name to give the task. If no name is provided, the "Running subtask" logging will be silent. */
  name?: string;

  /** A JSON Schema object which will be used to validate this task's configuration file */
  schema?: Object;

  /**
   * Deep merges config settings into task config.
   */
  mergeConfig?: (taskConfig: TASK_CONFIG) => void;

  /**
   * Shallow merges config settings into the task config.
   */
  setConfig?: (taskConfig: TASK_CONFIG) => void;

  /** Optional callback to indicate if the task is enabled or not. */
  isEnabled?: (config?: IBuildConfig) => boolean;

  /** Optional method to indicate directory matches to clean up when the clean task is run. */
  getCleanMatch?: (config: IBuildConfig, taskConfig?: TASK_CONFIG) => string[]; /* tslint:disable-line:no-any */
}
