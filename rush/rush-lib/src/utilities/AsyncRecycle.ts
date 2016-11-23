import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fsx from 'fs-extra';

import RushConfig from '../data/RushConfig';
import Utilities from './Utilities';

export default class AsyncRecycle {
  /**
   * Moves the specified directory into the recycler directory and asynchronously deletes the recycler directory.
   *  Delete will continue even if the node process is killed.
   */
  public static recycleDirectory(rushConfig: RushConfig, directoryPath: string): void {
    // We need to do a simple "fs.renameSync" here, however if the folder we're trying to rename
    // has a lock, or if its destination container doesn't exist yet,
    // then there seems to be some OS process (virus scanner?) that holds
    // a lock on the folder for a split second, which causes renameSync to
    // fail. To workaround that, retry for up to 7 seconds before giving up.
    const maxWaitTimeMs: number = 7 * 1000;

    const recyclerDirectory: string = AsyncRecycle._getRecyclerDirectory(rushConfig);
    const oldDirectoryName: string = path.basename(directoryPath);
    const newDirectoryPath: string = path.join(recyclerDirectory, `${oldDirectoryName}_${new Date().getTime()}`);

    if (!fsx.existsSync(recyclerDirectory)) {
      Utilities.createFolderWithRetry(recyclerDirectory);
    }

    Utilities.retryUntilTimeout(() => fsx.renameSync(directoryPath, newDirectoryPath),
                                maxWaitTimeMs,
                                (e) => new Error(`Error: ${e}${os.EOL}Often this is caused by a file lock ` +
                                                'from a process like the virus scanner.'),
                                'recycleDirectory');

    // Asynchronously delete the folder contents.
    const recyclerDirectoryContents: string = path.join(recyclerDirectory, '*');

    const windowsTrimmedRecyclerDirectory: string = recyclerDirectory.match(/\\$/)
      ? recyclerDirectory.substring(0, recyclerDirectory.length - 1)
      : recyclerDirectory;
    const command: string = os.platform() === 'win32'
      // Windows
      ? 'cmd.exe'
      // Assume 'NIX or Darwin
      : 'rm';

    const args: string[] = os.platform() === 'win32'
      // Windows
      ? ['/c', `FOR /F %f IN ('dir /B \\\\?\\${recyclerDirectoryContents}') DO rd /S /Q \\\\?\\${windowsTrimmedRecyclerDirectory}\\%f`] // tslint:disable-line:max-line-length
      // Assume 'NIX or Darwin
      : ['-rf', `"${recyclerDirectoryContents}"`];

    const options: child_process.SpawnOptions = {
      detached: true,
      stdio: [ 'ignore', 'ignore', 'ignore' ]
    };

    const process: child_process.ChildProcess = child_process.spawn(command, args, options);
    process.unref();
  }

  private static _getRecyclerDirectory(rushConfig: RushConfig): string {
    return path.join(rushConfig.commonFolder, 'rush-recycler');
  }
}
