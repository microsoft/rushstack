import * as child_process from 'child_process';
import { IPackageChanges } from './IPackageChanges';

const PROCESS_OUTPUT_DELIMITER: string = '///~X~X~X~X~X~X~///';

export function getPackageChanges(packagePath: string = process.cwd()): Promise<IPackageChanges> {
  return new Promise((complete) => {
    child_process.exec(
      `git ls-tree HEAD -r && echo ${PROCESS_OUTPUT_DELIMITER} && git status -s -u .`,
      { cwd: packagePath },
      (error: Error, stdout: string) => {
        const changes: IPackageChanges = {
          files: {},
          dependencies: {}
        };
        const processOutputBlocks: string[] = stdout.split(PROCESS_OUTPUT_DELIMITER + '\n');

        processOutputBlocks[0].split('\n').forEach(line => {
          if (line) {
            const parts: string[] = line.substr(line.indexOf('blob ') + 5).split('\t');
            changes.files[parts[1]] = parts[0];
          }
        });

        if (processOutputBlocks[1]) {
          const filesToHash: string[] = [];

          processOutputBlocks[1]
            .split('\n')
            .forEach(line => {
              const parts: string[] = line.trim().split(' ');

              if (parts.length === 2) {
                if (parts[0] === 'D') {
                  delete changes.files[parts[1]];
                } else {
                  filesToHash.push(parts[1]);
                }
              }
            });

          if (filesToHash.length) {
            child_process.exec(
              'git hash-object ' + filesToHash.join(' '),
              { cwd: packagePath },
              (hashError: Error, hashStdout: string) => {
                const hashes: string[] = hashStdout.split('\n');

                filesToHash.forEach((filename, i) => changes.files[filename] = hashes[i]);

                complete(changes);
              });
          } else {
            complete(changes);
          }
        } else {
          complete(changes);
        }
      });
  });
}
