import * as JSZip from 'jszip';
import * as path from 'path';
import { FileSystem, FileSystemStats, AlreadyExistsBehavior } from '@rushstack/node-core-library';
import { IDeployState } from './DeployManager';

// JSZip is dependant on Blob being declared.
declare global {
  // eslint-disable-next-line
  type Blob = any;
}
export class DeployArchiver {
  public static async createArchive(deployState: IDeployState): Promise<void> {
    if (deployState.scenarioConfiguration.json.postCopySourceFolder !== undefined) {
      const sourceFolderPath: string = FileSystem.getRealPath(
        deployState.scenarioConfiguration.json.postCopySourceFolder
      );
      FileSystem.copyFiles({
        sourcePath: sourceFolderPath,
        destinationPath: deployState.targetRootFolder,
        alreadyExistsBehavior: AlreadyExistsBehavior.Error
      });
    }
    if (deployState.createArchiveFileName !== undefined) {
      if (!deployState.createArchiveFileName.endsWith('.zip')) {
        console.log(
          'Create-archive currently only supports creation of zip files. Skipping create-archive step.\n'
        );
        return;
      }
      console.log('Invoking "JSZip"...\n');
      const zip: JSZip = this._getZipOfFolder(deployState.targetRootFolder);
      const zipContent: Buffer = await zip.generateAsync({
        type: 'nodebuffer',
        platform: 'UNIX'
      });

      FileSystem.writeFile(
        path.join(deployState.targetRootFolder, deployState.createArchiveFileName),
        zipContent
      );

      console.log('\nCompleted "JSZip" successfully.');
    }
  }

  private static _getFilePathsRecursively(dir: string): string[] {
    // returns a flat array of absolute paths of all files recursively contained in the dir
    let results: string[] = [];
    const list: string[] = FileSystem.readFolder(dir);

    let pending: number = list.length;
    if (!pending) return results;

    for (let file of list) {
      file = path.resolve(dir, file);

      const stat: FileSystemStats = FileSystem.getLinkStatistics(file);

      if (stat && stat.isDirectory()) {
        results = results.concat(this._getFilePathsRecursively(file));
      } else {
        results.push(file);
      }

      if (!--pending) return results;
    }

    return results;
  }

  private static _getZipOfFolder(dir: string): typeof JSZip {
    // returns a JSZip instance filled with contents of dir.
    const allPaths: string[] = this._getFilePathsRecursively(dir);

    const zip: JSZip = new JSZip();
    for (const filePath of allPaths) {
      const addPath: string = path.relative(dir, filePath);
      const stat: FileSystemStats = FileSystem.getLinkStatistics(filePath);
      const permissions: number = stat.mode;

      if (stat.isSymbolicLink()) {
        zip.file(addPath, FileSystem.readLink(filePath), {
          unixPermissions: parseInt('120755', 8),
          dir: stat.isDirectory()
        });
      } else {
        const data: Buffer = FileSystem.readFileToBuffer(filePath);
        zip.file(addPath, data, {
          unixPermissions: permissions,
          dir: stat.isDirectory()
        });
      }
    }

    return zip;
  }
}
