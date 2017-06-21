import * as child_process from 'child_process';
import { IPackageDeps } from './IPackageDeps';

export type GitStatusChangeType = 'D' | 'M' | 'A';

/**
 * Parses the output of the "git ls-tree" command
 */
export function parseGitLsTree(output: string): Map<string, string> {
  const changes: Map<string, string> = new Map<string, string>();

  if (output) {
    // A line is expected to look like:
    // 100644 blob 3451bccdc831cb43d7a70ed8e628dcf9c7f888c8    src/typings/tsd.d.ts
    // 160000 commit c5880bf5b0c6c1f2e2c43c95beeb8f0a808e8bac  web-build-tools
    const gitRegex: RegExp = /([0-9]{6})\s(blob|commit)\s([a-f0-9]{40})\s*(.*)/;

    // Note: The output of git ls-tree uses \n newlines regardless of OS.
    output.split('\n').forEach(line => {

      if (line) {
        // Take everything after the "100644 blob", which is just the hash and filename
        const matches: RegExpMatchArray = line.match(gitRegex);
        if (matches && matches[3] && matches[4]) {
          const hash: string = matches[3];
          const filename: string = matches[4];

          changes.set(filename, hash);

        } else {
          throw new Error(`Cannot parse git ls-tree input: "${line}"`);
        }
      }
    });
  }

  return changes;
}

/**
 * Parses the output of the "git status" command
 */
export function parseGitStatus(output: string, packagePath: string): Map<string, GitStatusChangeType> {
  const changes: Map<string, GitStatusChangeType> = new Map<string, GitStatusChangeType>();
  const filesToHash: string[] = [];

  /*
  * Typically, output will look something like:
  * M temp_modules/rush-package-deps-hash/package.json
  * D package-deps-hash/src/index.ts
  */

  // If there was an issue with `git ls-tree`, or there are no current changes, processOutputBlocks[1]
  // will be empty or undefined
  if (!output) {
    return changes;
  }

  // Note: The output of git hash-object uses \n newlines regardless of OS.
  output
    .trim()
    .split('\n')
    .forEach(line => {
      const [changeType, filename]: string[] = line.trim().split(' ');
      /*
      * changeType == 'D' or 'M' or 'A'
      * filename == path to the file
      */
      if (changeType && filename) {
        changes.set(filename, changeType as GitStatusChangeType);
      }
    });

  return changes;
}

/**
 * Takes a list of files and returns the current git hashes for them
 */
export function gitHashFiles(filesToHash: string[], packagePath: string): Map<string, string> {
  const changes: Map<string, string> = new Map<string, string>();
  if (filesToHash.length) {
    const hashStdout: string = child_process.execSync(
      'git hash-object ' + filesToHash.join(' '),
      { cwd: packagePath }).toString();

    // The result of hashStdout will be a list of file hashes delimited by newlines
    const hashes: string[] = hashStdout.split('\n');

    filesToHash.forEach((filename, i) => changes.set(filename, hashes[i]));
  }
  return changes;
}

/**
 * Executes "git ls-tree" in a folder
 */
export function gitLsTree(path: string): string {
  return child_process.execSync(
    `git ls-tree HEAD -r`,
    { cwd: path }).toString();
}

/**
 * Executes "git status" in a folder
 */
export function gitStatus(path: string): string {
  return child_process.execSync(
    `git status -s -u .`,
    { cwd: path }).toString();
}

/**
 * Collects the current git filehashes for a directory
 * @public
 */
export function getPackageDeps(packagePath: string = process.cwd(), excludedPaths?: string[]): IPackageDeps {
  const excludedHashes: { [key: string]: boolean } = {};

  if (excludedPaths) {
    excludedPaths.forEach(path => excludedHashes[path] = true);
  }

  const changes: IPackageDeps = {
    files: {}
  };

  const gitLsOutput: string = gitLsTree(packagePath);

  // Add all the checked in hashes
  parseGitLsTree(gitLsOutput).forEach((hash: string, filename: string) => {
    if (!excludedHashes[filename]) {
      changes.files[filename] = hash;
    }
  });

  // Update the checked in hashes with the current repo status
  const gitStatusOutput: string = gitStatus(packagePath);
  const currentlyChangedFiles: Map<string, GitStatusChangeType > =
    parseGitStatus(gitStatusOutput, packagePath);

  const filesToHash: string[] = [];
  currentlyChangedFiles.forEach((changeType: GitStatusChangeType, filename: string) => {
    if (changeType === 'D') {
      delete changes.files[filename];
    } else {
      if (!excludedHashes[filename]) {
        filesToHash.push(filename);
      }
    }
  });

  gitHashFiles(filesToHash, packagePath).forEach((hash: string, filename: string) => {
    changes.files[filename] = hash;
  });

  return changes;
}
