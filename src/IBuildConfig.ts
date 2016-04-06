import { IExecutable } from './IExecutable';

export interface IBuildConfig {
  /** Proxy gulp instance. */
  gulp?: any;

  /** Array of all unique tasks. */
  uniqueTasks?: IExecutable[];

  /** Full physical path to the root path directory. */
  rootPath?: string;

  /** Source folder name where source is included.  */
  srcFolder?: string;

  /** Unbundled commonjs modules folder, which will be referenced by other node projects. */
  libFolder?: string;

  /** Unbundled amd modules folder,
   * which can be optionally set to cause build tasks to
   * ouput AMD modules if required for legacy reasons. */
  libAMDFolder?: string;

  /** Dist folder, which includes all bundled resources which would be copied to a CDN for the project. */
  distFolder?: string;

  /** Temp folder for storing temporary files. */
  tempFolder?: string;

  /** Re-log known issues after the build is complete. */
  relogIssues?: boolean;

  /** Use verbose logging. */
  verbose?: boolean;

  /** Build a full production build. */
  production?: boolean;

  /** Arbitrary property bag for a task to store environment values in. */
  properties?: { [ key: string]: any };

  /** Optional callback to be executed when a task starts. */
  onTaskStart?: (taskName: string) => void;

  /** Optional callback to be executed when a task ends. */
  onTaskEnd?: (taskName: string, duration: number[], error?: any) => void;
}
