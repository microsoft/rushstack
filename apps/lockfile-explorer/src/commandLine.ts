// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface ICommandLine {
  showedHelp: boolean;
  error: string | undefined;
  subspace: string | undefined;
}

function showHelp(): void {
  console.log(
    `
Usage: lockfile-explorer [--subspace SUBSPACE]
       lockfile-explorer [--help]

Launches the Lockfile Explorer app.  You can also use "lfx" as shorthand alias
for "lockfile-explorer".

Parameters:

--help, -h
       Show command line help

--subspace SUBSPACE, -s SUBSPACE
       Load the lockfile for the specified Rush subspace.
`.trim()
  );
}

export function parseCommandLine(args: string[]): ICommandLine {
  const result: ICommandLine = { showedHelp: false, error: undefined, subspace: undefined };

  let i: number = 0;

  while (i < args.length) {
    const parameter: string = args[i];
    ++i;

    switch (parameter) {
      case '--help':
      case '-h':
      case '/?':
        showHelp();
        result.showedHelp = true;
        return result;

      case '--subspace':
      case '-s':
        if (i >= args.length || args[i].startsWith('-')) {
          result.error = `Expecting argument after "${parameter}"`;
          return result;
        }
        result.subspace = args[i];
        ++i;
        break;

      default:
        result.error = 'Unknown parameter ' + JSON.stringify(parameter);
        return result;
    }
  }

  return result;
}
