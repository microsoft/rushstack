import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fsx from 'fs-extra';

import RushConfig from '../data/RushConfig';

export default class AsyncRecycle {
  /**
   * Moves the specified directory into the recycler directory and asynchronously deletes the recycler directory.
   *  Delete will continue even if the node process is killed.
   */
  public static recycleDirectory(rushConfig: RushConfig, directoryPath: string): void {
    const recyclerDirectory: string = AsyncRecycle._getRecyclerDirectory(rushConfig);
    const oldDirectoryName: string = path.basename(directoryPath);
    const newDirectoryPath: string = path.join(recyclerDirectory, `${oldDirectoryName}_${new Date().getTime()}`);

    // If the recycler directory doesn't already, this will create it
    fsx.renameSync(directoryPath, newDirectoryPath);

    const recyclerDirectoryContents: string = path.join(recyclerDirectory, '*');

    if (os.platform() === 'win32') {
      // Windows
      child_process.exec(`PowerShell -Command "Remove-Item -Path '\\?\${recyclerDirectoryContents}'"`);
    } else {
      // Assume 'NIX or Darwin
      child_process.exec(`rm -rf "${recyclerDirectoryContents}"`);
    }
  }

  private static _getRecyclerDirectory(rushConfig: RushConfig): string {
    return path.join(rushConfig.commonFolder, 'rush-recycler');
  }
}
