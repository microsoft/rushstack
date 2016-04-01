import { IBuildConfig } from './IBuildConfig';

export interface IExecutable {
  /** Execution method. */
  execute: (config: IBuildConfig) => Promise<void>;

  /** Optional name to give the task. If no name is provided, the "Running subtask" logging will be silent. */
  name?: string;

  /** Optional callback to indicate if the task is enabled or not. */
  isEnabled?: () => boolean;

  /** Optional method to indicate directory matches to clean up when the nuke task is run. */
  getNukeMatch?: () => string[];
}
