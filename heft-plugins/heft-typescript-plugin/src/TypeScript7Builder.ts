// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import * as semver from 'semver';
// These are compile-time-only imports: Node10 resolution cannot resolve the beta's package exports.
import type { API, Diagnostic, ParsedCommandLine, Program } from 'typescript-7/dist/api/async/api';
import type { FileSystemCallbacks, FileSystemEntries } from 'typescript-7/dist/api/fs';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import type { IScopedLogger, IWatchFileSystem } from '@rushstack/heft';

import { importAsync } from './typeScript7Loader.cjs';

type TypeScript7API = typeof import('typescript-7/dist/api/async/api');

interface ITypeScript7BuilderOptions {
  typescriptPackagePath: string;
  buildFolderPath: string;
  tsconfigPath: string;
  logger: IScopedLogger;
  watchFs?: IWatchFileSystem;
  abortSignal: AbortSignal;
}

export class TypeScript7Builder {
  private readonly _options: ITypeScript7BuilderOptions;

  public constructor(options: ITypeScript7BuilderOptions) {
    this._options = options;
  }

  public async invokeAsync(): Promise<void> {
    const { typescriptPackagePath, buildFolderPath, tsconfigPath, logger, abortSignal } = this._options;
    if (abortSignal.aborted) {
      return;
    }
    const { version } = JsonFile.load(path.join(typescriptPackagePath, 'package.json')) as {
      version: string;
    };
    if (!semver.valid(version) || semver.major(version) !== 7) {
      throw new Error(`The typescript7-plugin requires TypeScript 7; resolved TypeScript ${version}.`);
    }
    const resolveFromTypeScript: NodeJS.Require = createRequire(path.join(typescriptPackagePath, 'package.json'));
    const typescript: TypeScript7API = (await importAsync(
      pathToFileURL(resolveFromTypeScript.resolve('typescript/async')).href
    )) as TypeScript7API;

    const api: API = new typescript.API({
      cwd: buildFolderPath,
      fs: this._createFileSystem()
    });
    try {
      const config: ParsedCommandLine = await api.parseConfigFile(tsconfigPath);
      if (abortSignal.aborted) {
        return;
      }
      if (config.projectReferences?.length) {
        throw new Error(
          'The typescript7-plugin does not build project references. Build referenced projects separately.'
        );
      }
      const program: Program = await api.createProgram(
        config.fileNames,
        {
          ...config.options,
          configFilePath: tsconfigPath,
          noCheck: false,
          declaration: true,
          emitDeclarationOnly: true
        },
        { configFileParsingDiagnostics: config.errors }
      );
      // A new API for every invocation also invalidates native filesystem and configuration caches.
      const diagnostics: Diagnostic[] = [...config.errors];
      for (const getDiagnosticsAsync of [
        () => program.getConfigFileParsingDiagnostics(),
        () => program.getProgramDiagnostics(),
        () => program.getGlobalDiagnostics(),
        () => program.getSyntacticDiagnostics(),
        () => program.getSemanticDiagnostics(),
        () => program.getDeclarationDiagnostics()
      ]) {
        if (abortSignal.aborted) {
          return;
        }
        diagnostics.push(...(await getDiagnosticsAsync()));
      }
      if (!abortSignal.aborted && !config.options.noEmit) {
        diagnostics.push(...(await program.emit()).diagnostics);
      }
      if (abortSignal.aborted) {
        return;
      }
      const reportedDiagnostics: Set<string> = new Set();
      for (const diagnostic of diagnostics) {
        const text: string = typescript.formatDiagnostics([diagnostic], api).trimEnd();
        if (!reportedDiagnostics.has(text)) {
          reportedDiagnostics.add(text);
          if (diagnostic.category === 1) {
            logger.emitError(new Error(text));
          } else if (diagnostic.category === 0) {
            logger.emitWarning(new Error(text));
          } else {
            logger.terminal.writeLine(text);
          }
        }
      }
    } finally {
      await api.close();
    }
  }

  private _createFileSystem(): FileSystemCallbacks {
    const { watchFs, abortSignal } = this._options;
    const stat = (filePath: string): fs.Stats | undefined => {
      try {
        return watchFs ? watchFs.statSync(filePath) : fs.statSync(filePath);
      } catch (error) {
        if (!FileSystem.isNotExistError(error as Error)) {
          throw error;
        }
        return undefined;
      }
    };
    return {
      fileExists: (filePath) => !!stat(filePath)?.isFile(),
      directoryExists: (filePath) => !!stat(filePath)?.isDirectory(),
      stat,
      readFile: (filePath) => {
        // IWatchFileSystem has no readFile: track the read, including a missing file, before opening it.
        watchFs?.getStateAndTrack(filePath);
        try {
          return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
          if (!FileSystem.isNotExistError(error as Error)) {
            throw error;
          }
          return undefined;
        }
      },
      getAccessibleEntries: (directoryPath) => {
        const result: FileSystemEntries = { files: [], directories: [], symlinks: [] };
        let entries: fs.Dirent[];
        try {
          entries = watchFs
            ? watchFs.readdirSync(directoryPath, { withFileTypes: true })
            : fs.readdirSync(directoryPath, { withFileTypes: true });
        } catch (error) {
          if (!FileSystem.isNotExistError(error as Error)) {
            throw error;
          }
          return result;
        }
        for (const entry of entries) {
          if (entry.isSymbolicLink()) {
            result.symlinks!.push(entry.name);
          }
          const entryStat: fs.Dirent | fs.Stats | undefined = entry.isSymbolicLink()
            ? stat(path.join(directoryPath, entry.name))
            : entry;
          if (entryStat?.isFile()) {
            result.files.push(entry.name);
          } else if (entryStat?.isDirectory()) {
            result.directories.push(entry.name);
          }
        }
        return result;
      },
      realpath: (filePath) => {
        watchFs?.getStateAndTrack(filePath);
        const realPath: string = fs.realpathSync(filePath);
        watchFs?.getStateAndTrack(realPath);
        return realPath;
      },
      writeFile: (filePath, contents) => {
        if (abortSignal.aborted) {
          return;
        }
        if (!/(\.d\.[cm]?ts(\.map)?|\.tsbuildinfo)$/.test(filePath)) {
          throw new Error(
            `The typescript7-plugin cannot emit JavaScript or other non-declaration output: ${filePath}`
          );
        }
        FileSystem.writeFile(filePath, contents, { ensureFolderExists: true });
      },
      removeFile: (filePath) => {
        throw new Error(`Unexpected TypeScript compiler file removal: ${filePath}`);
      }
    };
  }
}
