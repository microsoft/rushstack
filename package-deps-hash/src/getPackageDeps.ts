import * as child_process from 'child_process';
import { IPackageDeps } from './IPackageDeps';

const PROCESS_OUTPUT_DELIMITER: string = '///~X~X~X~X~X~X~///';

export function getPackageDeps(packagePath: string = process.cwd(), excludedPaths?: string[]): IPackageDeps {
  const excludedHashes: { [key: string]: boolean } = {};

  if (excludedPaths) {
    excludedPaths.forEach(path => excludedHashes[path] = true);
  }

  const stdout: string = child_process.execSync(
    `git ls-tree HEAD -r && echo ${PROCESS_OUTPUT_DELIMITER} && git status -s -u .`,
    { cwd: packagePath }).toString();

  const changes: IPackageDeps = {
    files: {}
  };
  const processOutputBlocks: string[] = stdout.split(PROCESS_OUTPUT_DELIMITER);

  // Note: The output of git ls-tree uses \n newlines regardless of OS.
  processOutputBlocks[0].split('\n').forEach(line => {

    // A line is expected to look like:
    // 100644 blob 3451bccdc831cb43d7a70ed8e628dcf9c7f888c8    src/typings/tsd.d.ts

    if (line) {
      // Take everything after the "100644 blob", which is just the hash and filename
      const parts: string[] = line.substr(line.indexOf('blob ') + 5).split('\t');
      if (!excludedHashes[parts[1]]) {
        changes.files[parts[1]] = parts[0];
      }
    }
  });


  // If there was an issue with `git ls-tree`, or there are no current changes, processOutputBlocks[1]
  // will be empty or undefined
  if (processOutputBlocks[1]) {
    const filesToHash: string[] = [];

    /*
     * Typically, processOutputBlocks[1] will look something like:
     * M temp_modules/rush-package-deps-hash/package.json
     * D package-deps-hash/src/index.ts
     */

    // Note: The output of git hash-object uses \n newlines regardless of OS.
    processOutputBlocks[1]
      .trim()
      .split('\n')
      .forEach(line => {
        const parts: string[] = line.trim().split(' ');
        /*
         * parts[1] == 'D' or 'M' or 'A'
         * parts[2] == filename
         */

        if (parts.length === 2) {
          // If the file is currently deleted, then it will have a 'D'
          if (parts[0] === 'D') {
            delete changes.files[parts[1]];
          } else {
            // Otherwise the file was changed or added and we should get the current hash
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

      // The result of hashStdout will be a list of file hashes delimited by newlines

      const hashes: string[] = hashStdout.split('\n');

      filesToHash.forEach((filename, i) => changes.files[filename] = hashes[i]);
    }
  }
  return changes;
}
