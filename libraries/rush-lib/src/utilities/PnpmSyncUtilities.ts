// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  type ILogMessageCallbackOptions,
  LogMessageIdentifier,
  type LogMessageDetails,
  LogMessageKind,
  pnpmSyncUpdateFileAsync
} from 'pnpm-sync-lib';

import { AlreadyReportedError, Async, FileSystem, JsonFile, Path } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import { RushConstants } from '../logic/RushConstants';

interface IPnpmModulesForSync {
  layoutVersion?: number;
  nodeLinker?: string;
  packageManager?: string;
  virtualStoreDir?: string;
  injectedDeps?: Record<string, string[]>;
}

export class PnpmSyncUtilities {
  public static async prepareFromModulesAsync(options: {
    modulesFilePath: string;
    lockfileFolder: string;
    lockfileId: string;
    pnpmVersion: string;
    sourceProjectFolders: Iterable<string>;
    terminal: ITerminal;
  }): Promise<void> {
    const { modulesFilePath, lockfileFolder, lockfileId, pnpmVersion, terminal } = options;
    const yaml: typeof import('js-yaml') = await import('js-yaml');
    const modules: IPnpmModulesForSync | undefined = yaml.load(
      await FileSystem.readFileAsync(modulesFilePath)
    ) as IPnpmModulesForSync | undefined;
    if (
      modules?.layoutVersion !== 5 ||
      modules.nodeLinker !== 'isolated' ||
      modules.packageManager !== `pnpm@${pnpmVersion}` ||
      typeof modules.virtualStoreDir !== 'string' ||
      !modules.virtualStoreDir
    ) {
      throw new Error(
        `Cannot prepare injected dependency sync from an unsupported PNPM layout: ${modulesFilePath}`
      );
    }

    if (
      modules.injectedDeps !== undefined &&
      (!modules.injectedDeps ||
        typeof modules.injectedDeps !== 'object' ||
        Array.isArray(modules.injectedDeps))
    ) {
      throw new Error(`Invalid injectedDeps in ${modulesFilePath}`);
    }
    const injectedDeps: Record<string, string[]> = modules.injectedDeps ?? {};
    const sourceProjectFolders: Set<string> = new Set(
      Array.from(options.sourceProjectFolders, (folder) => path.resolve(folder))
    );
    // injectedDeps paths are lockfile-relative; virtualStoreDir is node_modules-relative.
    const virtualStoreFolder: string = path.resolve(path.dirname(modulesFilePath), modules.virtualStoreDir);
    const injectedEntries: [string, string[]][] = Object.entries(injectedDeps);
    // The virtual store may not exist when nothing was installed, so only resolve it when needed.
    const virtualStoreRealPath: string = injectedEntries.length
      ? await FileSystem.getRealPathAsync(virtualStoreFolder)
      : virtualStoreFolder;

    const preparedEntries: [string, string[]][] = await Async.mapAsync(
      injectedEntries,
      async ([sourceRelativePath, targets]): Promise<[string, string[]]> => {
        const sourceProjectFolder: string = path.resolve(lockfileFolder, sourceRelativePath);
        if (!sourceProjectFolders.has(sourceProjectFolder)) {
          throw new Error(
            `PNPM injected dependency is not a configured Rush project: ${sourceProjectFolder}`
          );
        }
        if (!Array.isArray(targets) || targets.some((target) => typeof target !== 'string' || !target)) {
          throw new Error(`Invalid injected dependency targets for ${sourceProjectFolder}`);
        }
        const targetFolders: string[] = Array.from(
          new Set(targets.map((target) => path.resolve(lockfileFolder, target)))
        );
        for (const targetFolder of targetFolders) {
          if (!Path.isUnder(targetFolder, virtualStoreFolder)) {
            throw new Error(`PNPM injected dependency target is outside the virtual store: ${targetFolder}`);
          }
        }

        const [sourcePackageJson, sourceRealPath] = await Promise.all([
          JsonFile.loadAsync(`${sourceProjectFolder}/package.json`) as Promise<{ name?: string }>,
          FileSystem.getRealPathAsync(sourceProjectFolder)
        ]);
        if (typeof sourcePackageJson.name !== 'string' || !sourcePackageJson.name) {
          throw new Error(`Missing package name for PNPM injected dependency: ${sourceProjectFolder}`);
        }

        await Async.forEachAsync(
          targetFolders,
          async (targetFolder: string) => {
            const targetRealPath: string = await FileSystem.getRealPathAsync(targetFolder);
            if (targetRealPath === sourceRealPath || !Path.isUnder(targetRealPath, virtualStoreRealPath)) {
              throw new Error(
                `PNPM injected dependency target is not a materialized virtual-store copy: ${targetFolder}`
              );
            }
            const targetPackageJson: { name?: string } = await JsonFile.loadAsync(
              `${targetFolder}/package.json`
            );
            if (targetPackageJson.name !== sourcePackageJson.name) {
              throw new Error(
                `PNPM injected dependency target has an unexpected package name: ${targetFolder}`
              );
            }
          },
          { concurrency: 10 }
        );

        return [sourceProjectFolder, targetFolders];
      },
      { concurrency: 10 }
    );
    const preparedTargets: Map<string, string[]> = new Map(preparedEntries);

    // Sources that pnpm no longer injects must drop this lockfile's stale destinations.
    await Async.forEachAsync(
      sourceProjectFolders,
      async (sourceProjectFolder: string) => {
        if (
          !preparedTargets.has(sourceProjectFolder) &&
          (await FileSystem.existsAsync(
            `${sourceProjectFolder}/${RushConstants.nodeModulesFolderName}/${RushConstants.pnpmSyncFilename}`
          ))
        ) {
          preparedTargets.set(sourceProjectFolder, []);
        }
      },
      { concurrency: 50 }
    );

    // Every destination has been validated above, before any sync descriptor is written.
    await Async.forEachAsync(
      preparedTargets,
      async ([sourceProjectFolder, targetFolders]) => {
        await FileSystem.ensureFolderAsync(`${sourceProjectFolder}/${RushConstants.nodeModulesFolderName}`);
        await pnpmSyncUpdateFileAsync({
          sourceProjectFolder,
          targetFolders,
          lockfileId,
          logMessageCallback: (message: ILogMessageCallbackOptions) =>
            PnpmSyncUtilities.processLogMessage(message, terminal)
        });
      },
      { concurrency: 10 }
    );
  }

  public static processLogMessage(options: ILogMessageCallbackOptions, terminal: ITerminal): void {
    const message: string = options.message;
    const details: LogMessageDetails = options.details;

    // Special formatting for interested messages
    switch (details.messageIdentifier) {
      case LogMessageIdentifier.PREPARE_FINISHING:
        terminal.writeVerboseLine(
          _addLinePrefix(
            `Regenerated ${RushConstants.pnpmSyncFilename} in ${Math.round(details.executionTimeInMs)} ms`
          )
        );
        return;

      case LogMessageIdentifier.COPY_FINISHING:
        {
          const customMessage: string =
            `Synced ${details.fileCount} ` +
            (details.fileCount === 1 ? 'file' : 'files') +
            ` in ${Math.round(details.executionTimeInMs)} ms`;

          terminal.writeVerboseLine(_addLinePrefix(customMessage));
        }
        return;

      case LogMessageIdentifier.PREPARE_REPLACING_FILE:
        {
          const customMessage: string =
            `Expecting ${RushConstants.pnpmSyncFilename} version ${details.expectedVersion}, ` +
            `but found version ${details.actualVersion}`;

          terminal.writeVerboseLine(_addLinePrefix(message));
          terminal.writeVerboseLine(_addLinePrefix(customMessage));
        }
        return;

      case LogMessageIdentifier.COPY_ERROR_INCOMPATIBLE_SYNC_FILE: {
        terminal.writeErrorLine(
          _addLinePrefix(
            `The workspace was installed using an incompatible version of pnpm-sync.\n` +
              `Please run "rush install" or "rush update" again.`
          )
        );

        terminal.writeLine(
          _addLinePrefix(
            `Expecting ${RushConstants.pnpmSyncFilename} version ${details.expectedVersion}, ` +
              `but found version ${details.actualVersion}\n` +
              `Affected folder: ${details.pnpmSyncJsonPath}`
          )
        );
        throw new AlreadyReportedError();
      }
    }

    // Default handling for other messages
    switch (options.messageKind) {
      case LogMessageKind.ERROR:
        terminal.writeErrorLine(Colorize.red('ERROR: pnpm-sync: ' + message));
        throw new AlreadyReportedError();

      case LogMessageKind.WARNING:
        terminal.writeWarningLine(Colorize.yellow('pnpm-sync: ' + message));
        return;

      case LogMessageKind.INFO:
      case LogMessageKind.VERBOSE:
        terminal.writeDebugLine(_addLinePrefix(message));
        return;
    }
  }
}

function _addLinePrefix(message: string): string {
  return message
    .split('\n')
    .map((x) => (x.trim() ? Colorize.cyan(`pnpm-sync: `) + x : x))
    .join('\n');
}
