// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

console.log('NCL.Executable.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
import * as child_process from 'child_process';
console.log('NCL.Executable.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
import * as os from 'os';
console.log('NCL.Executable.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
import * as path from 'path';
console.log('NCL.Executable.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);

import { FileSystem } from './FileSystem';
console.log('NCL.Executable.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);
import { PosixModeBits } from './PosixModeBits';
console.log('NCL.Executable.ts  : 6: ' + (new Date().getTime() % 20000) / 1000.0);

/**
 * Typings for one of the streams inside IExecutableSpawnSyncOptions.stdio.
 * @public
 */
export type ExecutableStdioStreamMapping =
  | 'pipe'
  | 'ignore'
  | 'inherit'
  | NodeJS.WritableStream
  | NodeJS.ReadableStream
  | number
  | undefined;

/**
 * Typings for IExecutableSpawnSyncOptions.stdio.
 * @public
 */
export type ExecutableStdioMapping = 'pipe' | 'ignore' | 'inherit' | ExecutableStdioStreamMapping[];

/**
 * Options for Executable.tryResolve().
 * @public
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
 * @public
 */
export interface IExecutableSpawnSyncOptions extends IExecutableResolveOptions {
  /**
   * The content to be passed to the child process's stdin.
   *
   * NOTE: If specified, this content replaces any IExecutableSpawnSyncOptions.stdio[0]
   * mapping for stdin.
   */
  input?: string;

  /**
   * The stdio mappings for the child process.
   *
   * NOTE: If IExecutableSpawnSyncOptions.input is provided, it will take precedence
   * over the stdin mapping (stdio[0]).
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
 * The NodeJS child_process API provides a solution for launching child processes, however
 * its design encourages reliance on the operating system shell for certain features.
 * Invoking the OS shell is not safe, not portable, and generally not recommended:
 *
 * - Different shells have different behavior and command-line syntax, and which shell you
 *   will get with NodeJS is unpredictable.  There is no universal shell guaranteed to be
 *   available on all platforms.
 *
 * - If a command parameter contains symbol characters, a shell may interpret them, which
 *   can introduce a security vulnerability
 *
 * - Each shell has different rules for escaping these symbols.  On Windows, the default
 *   shell is incapable of escaping certain character sequences.
 *
 * The Executable API provides a pure JavaScript implementation of primitive shell-like
 * functionality for searching the default PATH, appending default file extensions on Windows,
 * and executing a file that may contain a POSIX shebang.  This primitive functionality
 * is sufficient (and recommended) for most tooling scenarios.
 *
 * If you need additional shell features such as wildcard globbing, environment variable
 * expansion, piping, or built-in commands, then we recommend to use the `@microsoft/rushell`
 * library instead.  Rushell is a pure JavaScript shell with a standard syntax that is
 * guaranteed to work consistently across all platforms.
 *
 * @public
 */
export class Executable {
  /**
   * Synchronously create a child process and optionally capture its output.
   *
   * @remarks
   * This function is similar to child_process.spawnSync().  The main differences are:
   *
   * - It does not invoke the OS shell unless the executable file is a shell script.
   * - Command-line arguments containing special characters are more accurately passed
   *   through to the child process.
   * - If the filename is missing a path, then the shell's default PATH will be searched.
   * - If the filename is missing a file extension, then Windows default file extensions
   *   will be searched.
   *
   * @param filename - The name of the executable file.  This string must not contain any
   * command-line arguments.  If the name contains any path delimiters, then the shell's
   * default PATH will not be searched.
   * @param args - The command-line arguments to be passed to the process.
   * @param options - Additional options
   * @returns the same data type as returned by the NodeJS child_process.spawnSync() API
   *
   * @privateRemarks
   *
   * NOTE: The NodeJS spawnSync() returns SpawnSyncReturns<string> or SpawnSyncReturns<Buffer>
   * polymorphically based on the options.encoding parameter value.  This is a fairly confusing
   * design.  In most cases, developers want string with the default encoding.  If/when someone
   * wants binary output or a non-default text encoding, we will introduce a separate API function
   * with a name like "spawnWithBufferSync".
   */
  public static spawnSync(
    filename: string,
    args: string[],
    options?: IExecutableSpawnSyncOptions
  ): child_process.SpawnSyncReturns<string> {
    if (!options) {
      options = {};
    }

    const context: IExecutableContext = Executable._getExecutableContext(options);

    const resolvedPath: string | undefined = Executable._tryResolve(filename, options, context);
    if (!resolvedPath) {
      throw new Error(`The executable file was not found: "${filename}"`);
    }

    const spawnOptions: child_process.SpawnSyncOptionsWithStringEncoding = {
      cwd: context.currentWorkingDirectory,
      env: context.environment,
      input: options.input,
      stdio: options.stdio,
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer,

      // Contrary to what the NodeJS typings imply, we must explicitly specify "utf8" here
      // if we want the result to be SpawnSyncReturns<string> instead of SpawnSyncReturns<Buffer>.
      encoding: 'utf8',

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

    const environment: NodeJS.ProcessEnv = (options && options.environment) || process.env;
    const fileExtension: string = path.extname(resolvedPath);

    if (os.platform() === 'win32') {
      // Do we need a custom handler for this file type?
      switch (fileExtension.toUpperCase()) {
        case '.EXE':
        case '.COM':
          // okay to execute directly
          break;
        case '.BAT':
        case '.CMD': {
          Executable._validateArgsForWindowsShell(args);

          // These file types must be invoked via the Windows shell
          let shellPath: string | undefined = environment.COMSPEC;
          if (!shellPath || !Executable._canExecute(shellPath, context)) {
            shellPath = Executable.tryResolve('cmd.exe');
          }
          if (!shellPath) {
            throw new Error(
              `Unable to execute "${path.basename(resolvedPath)}" ` +
                `because CMD.exe was not found in the PATH`
            );
          }

          const shellArgs: string[] = [];
          // /D: Disable execution of AutoRun commands when starting the new shell context
          shellArgs.push('/d');
          // /S: Disable Cmd.exe's parsing of double-quote characters inside the command-line
          shellArgs.push('/s');
          // /C: Execute the following command and then exit immediately
          shellArgs.push('/c');

          // If the path contains special charactrers (e.g. spaces), escape them so that
          // they don't get interpreted by the shell
          shellArgs.push(Executable._getEscapedForWindowsShell(resolvedPath));
          shellArgs.push(...args);

          return child_process.spawnSync(shellPath, shellArgs, spawnOptions);
        }
        default:
          throw new Error(
            `Cannot execute "${path.basename(resolvedPath)}" because the file type is not supported`
          );
      }
    }

    return child_process.spawnSync(resolvedPath, args, spawnOptions);
  }

  /**
   * Given a filename, this determines the absolute path of the executable file that would
   * be executed by a shell:
   *
   * - If the filename is missing a path, then the shell's default PATH will be searched.
   * - If the filename is missing a file extension, then Windows default file extensions
   *   will be searched.
   *
   * @remarks
   *
   * @param filename - The name of the executable file.  This string must not contain any
   * command-line arguments.  If the name contains any path delimiters, then the shell's
   * default PATH will not be searched.
   * @param options - optional other parameters
   * @returns the absolute path of the executable, or undefined if it was not found
   */
  public static tryResolve(filename: string, options?: IExecutableResolveOptions): string | undefined {
    return Executable._tryResolve(filename, options || {}, Executable._getExecutableContext(options));
  }

  private static _tryResolve(
    filename: string,
    options: IExecutableResolveOptions,
    context: IExecutableContext
  ): string | undefined {
    // NOTE: Since "filename" cannot contain command-line arguments, the "/" here
    // must be interpreted as a path delimiter
    const hasPathSeparators: boolean =
      filename.indexOf('/') >= 0 || (os.platform() === 'win32' && filename.indexOf('\\') >= 0);

    // Are there any path separators?
    if (hasPathSeparators) {
      // If so, then don't search the PATH.  Just resolve relative to the current working directory
      const resolvedPath: string = path.resolve(context.currentWorkingDirectory, filename);
      return Executable._tryResolveFileExtension(resolvedPath, context);
    } else {
      // Otherwise if it's a bare name, then try everything in the shell PATH
      const pathsToSearch: string[] = Executable._getSearchFolders(context);

      for (const pathToSearch of pathsToSearch) {
        const resolvedPath: string = path.join(pathToSearch, filename);
        const result: string | undefined = Executable._tryResolveFileExtension(resolvedPath, context);
        if (result) {
          return result;
        }
      }

      // No match was found
      return undefined;
    }
  }

  private static _tryResolveFileExtension(
    resolvedPath: string,
    context: IExecutableContext
  ): string | undefined {
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

    if (os.platform() === 'win32') {
      // NOTE: For Windows, we don't validate that the file extension appears in PATHEXT.
      // That environment variable determines which extensions can be appended if the
      // extension is missing, but it does not affect whether a file may be executed or not.
      // Windows does have a (seldom used) ACL that can be used to deny execution permissions
      // for a file, but NodeJS doesn't expose that API, so we don't bother checking it.

      // However, Windows *does* require that the file has some kind of file extension
      if (path.extname(filePath) === '') {
        return false;
      }
    } else {
      // For Unix, check whether any of the POSIX execute bits are set
      try {
        // eslint-disable-next-line no-bitwise
        if ((FileSystem.getPosixModeBits(filePath) & PosixModeBits.AllExecute) === 0) {
          return false; // not executable
        }
      } catch (error) {
        // If we have trouble accessing the file, ignore the error and consider it "not executable"
        // since that's what a shell would do
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

    // NOTE: Cmd.exe on Windows always searches the current working directory first.
    // PowerShell and Unix shells do NOT do that, because it's a security concern.
    // We follow their behavior.

    for (const splitPath of pathList.split(path.delimiter)) {
      const trimmedPath: string = splitPath.trim();
      if (trimmedPath !== '') {
        if (!seenPaths.has(trimmedPath)) {
          // Fun fact: If you put relative paths in your PATH environment variable,
          // all shells will dynamically match them against the current working directory.
          // This is a terrible design, and in practice nobody does that, but it is supported...
          // so we allow it here.
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
      options = {};
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
   * Given an input string containing special symbol characters, this inserts the "^" escape
   * character to ensure the symbols are interpreted literally by the Windows shell.
   */
  private static _getEscapedForWindowsShell(text: string): string {
    const escapableCharRegExp: RegExp = /[%\^&|<> ]/g;
    return text.replace(escapableCharRegExp, (value) => '^' + value);
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
        // with a caret (^), which allows these characters to be successfully passed
        // through to the batch file %1 variables.  But they will be expanded again
        // whenever they are used.  For example, NPM's binary wrapper batch files
        // use "%*" to pass their arguments to Node.exe, which causes them to be expanded
        // again.  Unfortunately the Cmd.exe batch language provides native escaping
        // function (that could be used to insert the carets again).
        //
        // We could work around that by adding double carets, but in general there
        // is no way to predict how many times the variable will get expanded.
        // Thus, there is no generally reliable way to pass these characters.
        throw new Error(
          `The command line argument ${JSON.stringify(arg)} contains a` +
            ` special character ${JSON.stringify(match[0])} that cannot be escaped for the Windows shell`
        );
      }
    }
  }
}
