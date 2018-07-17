// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { FileSystem } from './FileSystem';

/**
 * Options for Executable.tryResolve().
 * @beta
 */
export interface IExecutableResolveOptions {
  /**
   * The current working directory.  If omitted, process.cwd() will be used.
   */
  currentWorkingDirectory?: string;

  /**
   * The environment variables for the child process.  If omitted, process.env will be used.
   */
  environment?: NodeJS.ProcessEnv;
}

/**
 * The Executable class provides a safe, portable, recommended solution for tools that need
 * to launch child processes.
 *
 * @remarks
 * The child_process API lacks certain higher-level features, which encourages reliance on
 * the operating system shell.  Invoking the OS shell is not safe, not portable, and
 * generally not recommended:
 *
 * - Different shells have different behavior and command-line syntax, and which shell you
 *   will get is unpredictable.  There is no universal shell guaranteed to be available on
 *   all platforms.
 *
 * - If a command parameter contains symbol characters, a shell may process them, which
 *   can introduce a security vulnerability
 *
 * - Each shell has different rules for escaping these symbols.  On Windows, the default
 *   shell is incapable of escaping certain character sequences.
 *
 * The Executable class provides a pure JavaScript implementation of the primitive functionality
 * for searching the PATH, correctly passing command-line arguments (which may contain
 * symbols or spaces), and finding the registered launcher based on the file extension
 * or POSIX shebang.  This primitive functionality is sufficient (and recommended) for
 * most tooling scenarios.
 *
 * If you really do need full shell evaluation (e.g. wildcard globbing, environment variable
 * expansion, piping, etc.) then it's recommended to use the `@microsoft/rushell` library
 * instead.  Rushell has a pure JavaScript shell parser with a standard syntax that is
 * guaranteed to work consistently on all platforms.
 *
 * @beta
 */
export class Executable {
  /**
   * Search for an executable file with the specified name and return its path.
   *
   * @remarks
   * If the name has a relative path, it will be resolved relative to the current working directory.
   * If the name has no path, then the shell PATH will be searched.  If the name is missing a Windows
   * file extension, it may be appended (based on the PATHEXT environment variable).
   *
   * @param name - the name of the executable, which may be missing the path or file extension
   * @param options - optional other parameters
   * @returns the absolute path of the executable, or undefined if it was not found
   */
  public static tryResolve(name: string, options?: IExecutableResolveOptions): string | undefined {
    const environment: NodeJS.ProcessEnv = options && options.environment
      || process.env;
    const currentWorkingDirectory: string = options && path.resolve(options.currentWorkingDirectory)
      || process.cwd();

    // File extensions that will be appended automatically on Windows
    const windowsDefaultExtensions: string[] = [];

    // tslint:disable-next-line:no-string-literal
    const pathExtVariable: string = environment['PATHEXT'] || '';
    for (const splitValue of pathExtVariable.split(';')) {
      const trimmed: string = splitValue.trim();
      // Ignore malformed extensions
      if (/^\.[a-z0-9\.]*[a-z0-9]$/i.test(trimmed)) {
        // Don't add the same extension twice
        if (windowsDefaultExtensions.indexOf(trimmed) < 0) {
          windowsDefaultExtensions.push(trimmed);
        }
      }
    }

    // Test each folder to see if we can find the executable there
    for (const shellPathFolder of Executable._getSearchFolders(environment, currentWorkingDirectory)) {
      const resolvedName: string = path.join(shellPathFolder, name);

      if (Executable._canExecute(resolvedName)) {
        return resolvedName;
      }

      // Try the default file extensions
      for (const shellExtension of windowsDefaultExtensions) {
        const resolvedNameWithExtension: string = resolvedName + shellExtension;

        if (Executable._canExecute(resolvedNameWithExtension)) {
          return resolvedNameWithExtension;
        }
      }
    }

    return undefined;
  }

  /**
   * This is used when searching the shell PATH for an executable, to determine
   * whether a match should be skipped or not.  If it returns true, this does not
   * guarantee that the file can be successfully executed.
   */
  private static _canExecute(filePath: string): boolean {
    return FileSystem.exists(filePath);
  }

  /**
   * Returns the list of folders where we will search for an executable,
   * based on the PATH environment variable.
   */
  private static _getSearchFolders(environment: NodeJS.ProcessEnv,
    currentWorkingDirectory: string): string[] {

    // tslint:disable-next-line:no-string-literal
    const pathList: string = environment['PATH'] || '';

    const folders: string[] = [];
    folders.push(currentWorkingDirectory);

    // Avoid processing duplicates
    const seenPaths: Set<string> = new Set<string>();

    for (const splitPath of pathList.split(';')) {
      const trimmedPath: string = splitPath.trim();
      if (trimmedPath !== '') {
        if (!seenPaths.has(trimmedPath)) {
          // Note that PATH is allowed to contain relative paths, which will be resolved
          // relative to the current working directory.
          const resolvedPath: string = path.resolve(currentWorkingDirectory, trimmedPath);

          if (!seenPaths.has(resolvedPath)) {
            if (FileSystem.exists(resolvedPath)) {
              folders.push(resolvedPath);
            }

            seenPaths.add(resolvedPath);
          }

          seenPaths.add(trimmedPath);
        }
      }
    }

    return folders;
  }
}
