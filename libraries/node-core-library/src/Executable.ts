// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';

import { FileSystem, PosixModeBits } from './FileSystem';

/**
 * Typings for one of the streams inside IExecutableSpawnSyncOptions.stdio.
 * @beta
 */
export type ExecutableStdioStreamMapping = 'pipe' | 'ignore' | 'inherit'
  | NodeJS.WritableStream | NodeJS.ReadableStream
  | number | undefined;

/**
 * Typings for IExecutableSpawnSyncOptions.stdio.
 * @beta
 */
export type ExecutableStdioMapping = 'pipe' | 'ignore' | 'inherit' | ExecutableStdioStreamMapping[];

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
 * Options for Executable.execute().
 * @beta
 */
export interface IExecutableSpawnSyncOptions extends IExecutableResolveOptions {
  /**
   * The content to be passed to the child process's stdin.
   */
  input?: string;

  /**
   * The stdio mappings for the child process.
   */
  stdio?: ExecutableStdioMapping;

  /**
   * The maximum time the process is allowed to run before it will be terminated.
   */
  timeoutMs?: number;

  /**
   * The largest amount of bytes allowed on stdout or stderr for this synchonous operation.
   * If exceeded, the child process will be terminated.  The default is 200 * 1024.
   */
  maxBuffer?: number;

  /**
   * The encoding used for all stdio inputs/outputs.  The default is 'buffer'.
   */
  encoding?: string | BufferEncoding;
}

// Common environmental state used by Executable members
interface IExecutableContext {
  currentWorkingDirectory: string;
  environment: NodeJS.ProcessEnv;
  // For Windows, the parsed PATHEXT environment variable
  windowsExecutableExtensions: string[];
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
   * Synchronously create a child process and optionally capture its output.
   *
   * @remarks
   * This function is similar to child_process.spawnSync().  The main differences are:
   * It only invokes the OS shell when the executable is a shell script.  File extensions
   * can be omitted on Windows.  Command-line arguments containing special characters
   * are more accurately passed through to the child process.
   */
  public static spawnSync(command: string, args: string[], options?: IExecutableSpawnSyncOptions):
    child_process.SpawnSyncReturns<string> {

    if (!options) {
      options = { };
    }

    const context: IExecutableContext = Executable._getExecutableContext(options);

    const resolvedPath: string | undefined = Executable._tryResolve(command, options, context);
    if (!resolvedPath) {
      throw new Error(`The executable file was not found: "${command}"`);
    }

    const spawnOptions: child_process.SpawnSyncOptionsWithStringEncoding = {
      cwd: context.currentWorkingDirectory,
      env: context.environment,
      input: options.input,
      stdio: options.stdio,
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer,
      encoding: options.encoding,

      // NOTE: This is always false, because Rushell is recommended instead of relying on the OS shell.
      shell: false
    } as child_process.SpawnSyncOptionsWithStringEncoding;

    // PROBLEM: Given an "args" array of strings that may contain special characters (e.g. spaces,
    // backslashes, quotes), ensure that these strings pass through to the child process's ARGV array
    // without anything getting corrupted along the way.
    //
    // On Unix you just pass the array to spawnSync().  But on Windows, this is a very complex problem:
    // - The Win32 CreateProcess() API expects the args to be encoded as a single text string
    // - The decoding of this string is up to the application (not the OS), and there are 3 different
    //   algorithms in common usage:  the cmd.exe shell, the Microsoft CRT library init code, and
    //   the Win32 CommandLineToArgvW()
    // - The encodings are counterintuitive and have lots of special cases
    // - NodeJS spawnSync() tries do the encoding without knowing which decoder will be used
    //
    // See these articles for a full analysis:
    // http://www.windowsinspired.com/understanding-the-command-line-string-and-arguments-received-by-a-windows-program/
    // http://www.windowsinspired.com/how-a-windows-programs-splits-its-command-line-into-individual-arguments/

    const environment: NodeJS.ProcessEnv = options && options.environment
      || process.env;
    const fileExtension: string = path.extname(resolvedPath);

    if (fileExtension.toUpperCase() === '.JS') {
      // Inherit the parent's node.exe
      const nodePath: string = process.execPath;
      const nodeArgs: string[] = [];
      nodeArgs.push(resolvedPath);
      nodeArgs.push(...args);
      return child_process.spawnSync(nodePath, nodeArgs, spawnOptions);
    }

    if (os.platform() === 'win32') {
      // Do we need a custom handler for this file type?
      switch (fileExtension.toUpperCase()) {
        case '.EXE':
        case '.COM':
          // okay to execute directly
          break;
        case '.BAT':
        case '.CMD':
          {
            Executable._validateArgsForWindowsShell(args);

            // These file types must be invoked via the Windows shell
            let shellPath: string | undefined = environment.COMSPEC;
            if (!shellPath || !Executable._canExecute(shellPath, context)) {
              shellPath = Executable.tryResolve('cmd.exe');
            }
            if (!shellPath) {
              throw new Error(`Unable to execute "${path.basename(resolvedPath)}" `
                + `because CMD.exe was not found in the PATH`);
            }

            const shellArgs: string[] = [];
            shellArgs.push('/d');
            shellArgs.push('/s');
            shellArgs.push('/c');
            shellArgs.push(resolvedPath);
            shellArgs.push(...args);

            return child_process.spawnSync(shellPath, shellArgs, spawnOptions);
          }
        default:
          throw new Error(`Cannot execute "${path.basename(resolvedPath)}" because the file type is not supported`);
      }
    }

    return child_process.spawnSync(resolvedPath, args, spawnOptions);
  }

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
    return Executable._tryResolve(name, options || { }, Executable._getExecutableContext(options));
  }

  private static _tryResolve(name: string, options: IExecutableResolveOptions,
    context: IExecutableContext): string | undefined {

    const hasPathSeparators: boolean = name.indexOf('/') >= 0
      || (os.platform() === 'win32' && name.indexOf('\\') >= 0);

    const pathsToSearch: string[] = [];

    // Are there any path separators?
    if (hasPathSeparators) {
      // If so, then only search the resolved path
      pathsToSearch.push(path.resolve(context.currentWorkingDirectory, name));
    } else {
      // Otherwise if it's a bare name, then try everything in the shell PATH
      pathsToSearch.push(...Executable._getSearchFolders(context));
    }

    for (const pathToSearch of pathsToSearch) {
      const resolvedPath: string = path.join(pathToSearch, name);

      if (Executable._canExecute(resolvedPath, context)) {
        return resolvedPath;
      }

      // Try the default file extensions
      for (const shellExtension of context.windowsExecutableExtensions) {
        const resolvedNameWithExtension: string = resolvedPath + shellExtension;

        if (Executable._canExecute(resolvedNameWithExtension, context)) {
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
  private static _canExecute(filePath: string, context: IExecutableContext): boolean {
    if (!FileSystem.exists(filePath)) {
      return false;
    }

    const fileExtension: string = path.extname(filePath);

    if (os.platform() === 'win32') {
      // Does the file have an executable file extension?
      let matchFound: boolean = false;
      for (const executableExtension of context.windowsExecutableExtensions) {
        if (fileExtension.localeCompare(executableExtension) === 0) {
          matchFound = true;
          break;
        }
      }

      if (fileExtension.localeCompare('.js') === 0) {
        // The .js extension is special and always allowed since this is NodeJS.
        // However, that file extension must be specified explitily unless it was added to PATHEXT
        // (which is not usually the case).
        matchFound = true;
      }

      if (!matchFound) {
        return false;
      }
    } else {
      // For Unix, check whether any of the POSIX execute bits are set, but don't
      // require this for JavaSCript scripts (since this is NodeJS)
      if (fileExtension.localeCompare('.js') !== 0) {
        try {
          // tslint:disable-next-line:no-bitwise
          if ((FileSystem.getPosixModeBits(filePath) & PosixModeBits.AllExecute) === 0) {
            return false; // not executable
          }
        } catch (error) {
          // If we have trouble accessing the file, ignore the error and consider it "not executable"
          // since that's what a shell would do
        }
      }
    }
    return true;
  }

  /**
   * Returns the list of folders where we will search for an executable,
   * based on the PATH environment variable.
   */
  private static _getSearchFolders(context: IExecutableContext): string[] {

    const pathList: string = context.environment.PATH || '';

    const folders: string[] = [];

    // Avoid processing duplicates
    const seenPaths: Set<string> = new Set<string>();

    if (os.platform() === 'win32') {
      // On Window, the current directory is always tried first
      folders.push(context.currentWorkingDirectory);
      seenPaths.add(context.currentWorkingDirectory);
    }

    for (const splitPath of pathList.split(path.delimiter)) {
      const trimmedPath: string = splitPath.trim();
      if (trimmedPath !== '') {
        if (!seenPaths.has(trimmedPath)) {
          // Note that PATH is allowed to contain relative paths, which will be resolved
          // relative to the current working directory.
          const resolvedPath: string = path.resolve(context.currentWorkingDirectory, trimmedPath);

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

  private static _getExecutableContext(options: IExecutableResolveOptions | undefined): IExecutableContext {
    if (!options) {
      options = { };
    }

    const environment: NodeJS.ProcessEnv = options.environment || process.env;

    let currentWorkingDirectory: string;
    if (options.currentWorkingDirectory) {
      currentWorkingDirectory = path.resolve(options.currentWorkingDirectory);
    } else {
      currentWorkingDirectory = process.cwd();
    }

    const windowsExecutableExtensions: string[] = [];

    if (os.platform() === 'win32') {
      const pathExtVariable: string = environment.PATHEXT || '';
      for (const splitValue of pathExtVariable.split(';')) {
        const trimmed: string = splitValue.trim().toLowerCase();
        // Ignore malformed extensions
        if (/^\.[a-z0-9\.]*[a-z0-9]$/i.test(trimmed)) {
          // Don't add the same extension twice
          if (windowsExecutableExtensions.indexOf(trimmed) < 0) {
            windowsExecutableExtensions.push(trimmed);
          }
        }
      }
    }

    return {
      environment,
      currentWorkingDirectory,
      windowsExecutableExtensions
    };
  }

  /**
   * Checks for characters that are unsafe to pass to a Windows batch file
   * due to the way that cmd.exe implements escaping.
   */
  private static _validateArgsForWindowsShell(args: string[]): void {
    const specialCharRegExp: RegExp = /[%\^&|<>\r\n]/g;

    for (const arg of args) {
      const match: RegExpMatchArray | null = arg.match(specialCharRegExp);
      if (match) {
        // NOTE: It is possible to escape some of these characters by prefixing them
        // with a caret (^), however npm-binary-wrapper.cmd the arguments to NodeJS
        // using "%*" which reevaluates them after they were already unescaped.
        // There
        throw new Error(`The command line argument ${JSON.stringify(arg)} contains a`
          + ` special character ${JSON.stringify(match[0])} that cannot be escaped for the Windows shell`);
      }
    }
  }
}
