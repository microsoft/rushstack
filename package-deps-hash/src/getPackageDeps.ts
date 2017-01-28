import * as child_process from 'child_process';
import { IPackageDeps } from './IPackageDeps';

const PROCESS_OUTPUT_DELIMITER: string = '///~X~X~X~X~X~X~///';

export function getPackageDeps(packagePath: string = process.cwd(), excludedPaths?: string[]): Promise<IPackageDeps> {
  const excludedHashes: {[key: string]: boolean} = {};

  if (excludedPaths) {
    excludedPaths.forEach(path => excludedHashes[path] = true);
  }

  return new Promise((complete) => {
    const stdout: string = child_process.execSync(
      `git ls-tree HEAD -r && echo ${PROCESS_OUTPUT_DELIMITER} && git status -s -u .`,
      { cwd: packagePath }).toString();

    const changes: IPackageDeps = {
      files: {}
    };
    const processOutputBlocks: string[] = stdout.split(PROCESS_OUTPUT_DELIMITER);

    // Note: The output of git ls-tree uses \n newlines regardless of OS.
    processOutputBlocks[0].split('\n').forEach(line => {
      if (line) {
        const parts: string[] = line.substr(line.indexOf('blob ') + 5).split('\t');
        if (!excludedHashes[parts[1]]) {
          changes.files[parts[1]] = parts[0];
        }
      }
    });

    if (processOutputBlocks[1]) {
      const filesToHash: string[] = [];

      // Note: The output of git hash-object uses \n newlines regardless of OS.
      processOutputBlocks[1]
        .trim()
        .split('\n')
        .forEach(line => {
          const parts: string[] = line.trim().split(' ');

          if (parts.length === 2) {
            if (parts[0] === 'D') {
              delete changes.files[parts[1]];
            } else {
              if (!excludedHashes[parts[1]]) {
                filesToHash.push(parts[1]);
              }
            }
          }
        });

      if (filesToHash.length) {
        const hashStdout: string = child_process.execSync(
          'git hash-object ' + filesToHash.join(' '),
          { cwd: packagePath }).toString();

          const hashes: string[] = hashStdout.split('\n');

          filesToHash.forEach((filename, i) => changes.files[filename] = hashes[i]);

          complete(changes);
      } else {
        complete(changes);
      }
    } else {
      complete(changes);
    }
  });
}
