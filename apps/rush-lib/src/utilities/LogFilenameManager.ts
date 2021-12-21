// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ProjectLogWritable } from '../logic/taskExecution/ProjectLogWritable';

export class LogFilenameManager {
  private readonly _logFilenamesToCommandNameMap: Map<string, Set<string>> = new Map();
  private readonly _commandNamesWithLogFilenameCollisions: Set<string> = new Set();

  public getLogFilename(commandToRun: string): string {
    const logFilename: string = ProjectLogWritable.normalizeNameForLogFilenames(
      // "rebuild" and "build" should write to the same log file ("build.log")
      commandToRun
    );

    // Ensure two log files won't collide
    let commandsToRunForLogFilename: Set<string> | undefined =
      this._logFilenamesToCommandNameMap.get(logFilename);
    if (!commandsToRunForLogFilename) {
      commandsToRunForLogFilename = new Set<string>();
      this._logFilenamesToCommandNameMap.set(logFilename, commandsToRunForLogFilename);
    }

    commandsToRunForLogFilename.add(commandToRun);
    if (commandsToRunForLogFilename.size > 1) {
      this._commandNamesWithLogFilenameCollisions.add(logFilename);
    }

    return logFilename;
  }

  public throwErrorIfLogFilenameCollisionsExist(): void {
    if (this._commandNamesWithLogFilenameCollisions.size > 0) {
      const errorMessageParts: string[] = [];
      for (const commandNameWithLogFilenameCollisions of this._commandNamesWithLogFilenameCollisions) {
        const collidingCommands: string[] = Array.from(
          this._logFilenamesToCommandNameMap.get(commandNameWithLogFilenameCollisions)!
        );
        errorMessageParts.push(
          `- [${collidingCommands.join(', ')}] will all write to ` +
            `"<projectName>.${commandNameWithLogFilenameCollisions}.log" files`
        );
      }

      throw new Error(
        `The following command names will produce log files with names that will ` +
          `collide:\n${errorMessageParts.join('\n')}`
      );
    }
  }
}
