import { IBuildConfiguration } from './IBuildConfiguration';

export interface IExecutable {
  /**
   * Helper function which is called one time when the task is registered
   */
  onRegister?: () => void;

  /**
   * Execution method.
   */
  execute: (configuration: IBuildConfiguration) => Promise<void>;

  /**
   * Optional name to give the task. If no name is provided, the "Running subtask" logging will be silent.
   */
  name?: string;

  /**
   * Optional callback to indicate if the task is enabled or not.
   */
  isEnabled?: (configuration?: IBuildConfiguration) => boolean;

  /**
   * Optional method to indicate directory matches to clean up when the clean task is run.
   */
  /* tslint:disable-next-line:no-any */
  getCleanMatch?: (configuration: IBuildConfiguration, taskConfiguration?: any) => string[];
}
