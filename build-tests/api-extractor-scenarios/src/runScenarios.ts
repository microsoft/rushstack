// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRunScriptOptions } from '@rushstack/heft';
import { Async, FileSystem, type FolderItem, JsonFile, Text } from '@rushstack/node-core-library';
import {
  Extractor,
  ExtractorConfig,
  CompilerState,
  type ExtractorResult,
  type ExtractorMessage,
  ConsoleMessageId,
  ExtractorLogLevel
} from '@microsoft/api-extractor';

export async function runAsync({
  heftTaskSession: {
    logger,
    parameters: { production }
  },
  heftConfiguration: { buildFolderPath }
}: IRunScriptOptions): Promise<void> {
  const entryPoints: string[] = [];

  const scenarioFolderNames: string[] = [];
  const folderItems: FolderItem[] = await FileSystem.readFolderItemsAsync(__dirname);
  for (const folderItem of folderItems) {
    if (folderItem.isDirectory()) {
      scenarioFolderNames.push(folderItem.name);
    }
  }

  await Async.forEachAsync(
    scenarioFolderNames,
    async (scenarioFolderName) => {
      const entryPoint: string = `${buildFolderPath}/lib/${scenarioFolderName}/index.d.ts`;
      entryPoints.push(entryPoint);

      const overridesPath = `${buildFolderPath}/src/${scenarioFolderName}/config/api-extractor-overrides.json`;

      let apiExtractorJsonOverrides;
      try {
        apiExtractorJsonOverrides = await JsonFile.loadAsync(overridesPath);
      } catch (e) {
        if (!FileSystem.isNotExistError(e)) {
          throw e;
        }
      }

      const apiExtractorJson = {
        $schema: 'https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json',

        mainEntryPointFilePath: entryPoint,

        apiReport: {
          enabled: true,
          reportFolder: `<projectFolder>/temp/etc/${scenarioFolderName}`
        },

        dtsRollup: {
          enabled: true,
          untrimmedFilePath: `<projectFolder>/temp/etc/${scenarioFolderName}/rollup.d.ts`
        },

        docModel: {
          enabled: true,
          apiJsonFilePath: `<projectFolder>/temp/etc/${scenarioFolderName}/<unscopedPackageName>.api.json`
        },

        newlineKind: 'os',

        messages: {
          extractorMessageReporting: {
            // For test purposes, write these warnings into .api.md
            // TODO: Capture the full list of warnings in the tracked test output file
            'ae-cyclic-inherit-doc': {
              logLevel: 'warning',
              addToApiReportFile: true
            },
            'ae-unresolved-link': {
              logLevel: 'warning',
              addToApiReportFile: true
            }
          }
        },

        testMode: true,
        ...apiExtractorJsonOverrides
      };

      const apiExtractorJsonPath: string = `${buildFolderPath}/temp/configs/api-extractor-${scenarioFolderName}.json`;

      await Promise.all([
        JsonFile.saveAsync(apiExtractorJson, apiExtractorJsonPath, { ensureFolderExists: true }),
        FileSystem.ensureFolderAsync(`${buildFolderPath}/temp/etc/${scenarioFolderName}`)
      ]);
    },
    { concurrency: 10 }
  );

  let compilerState: CompilerState | undefined = undefined;
  for (const scenarioFolderName of scenarioFolderNames) {
    logger.terminal.writeLine(`Scenario: ${scenarioFolderName}`);

    // Run API Extractor programmatically
    const apiExtractorJsonPath: string = `${buildFolderPath}/temp/configs/api-extractor-${scenarioFolderName}.json`;
    const extractorConfig: ExtractorConfig = ExtractorConfig.loadFileAndPrepare(apiExtractorJsonPath);

    if (!compilerState) {
      compilerState = CompilerState.create(extractorConfig, {
        additionalEntryPoints: entryPoints
      });
    }

    const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
      localBuild: true,
      showVerboseMessages: true,
      messageCallback: (message: ExtractorMessage) => {
        switch (message.messageId) {
          case ConsoleMessageId.ApiReportCreated:
            // This script deletes the outputs for a clean build, so don't issue a warning if the file gets created
            message.logLevel = ExtractorLogLevel.None;
            break;
          case ConsoleMessageId.Preamble:
            // Less verbose output
            message.logLevel = ExtractorLogLevel.None;
            break;
        }
      },
      compilerState
    });

    if (extractorResult.errorCount > 0) {
      logger.emitError(new Error(`Encountered ${extractorResult.errorCount} API Extractor error(s)`));
    }
  }

  const inFolderPath: string = `${buildFolderPath}/temp/etc`;
  const outFolderPath: string = `${buildFolderPath}/etc`;

  const inFolderPaths: AsyncIterable<string> = enumerateFolderPaths(inFolderPath, '');
  const outFolderPaths: AsyncIterable<string> = enumerateFolderPaths(outFolderPath, '');
  const outFolderPathsSet: Set<string> = new Set<string>();

  for await (const outFolderPath of outFolderPaths) {
    outFolderPathsSet.add(outFolderPath);
  }

  await Async.forEachAsync(
    inFolderPaths,
    async (folderItemPath) => {
      outFolderPathsSet.delete(folderItemPath);

      const sourceFileContents: string = await FileSystem.readFileAsync(inFolderPath + folderItemPath);
      const outFilePath: string = outFolderPath + folderItemPath;
      let outFileContents: string | undefined;
      try {
        outFileContents = await FileSystem.readFileAsync(outFilePath);
      } catch (e) {
        if (!FileSystem.isNotExistError(e)) {
          throw e;
        }
      }

      const normalizedSourceFileContents: string = Text.convertToLf(sourceFileContents);
      const normalizedOutFileContents: string | undefined = outFileContents
        ? Text.convertToLf(outFileContents)
        : undefined;

      if (normalizedSourceFileContents !== normalizedOutFileContents) {
        if (!production) {
          logger.emitWarning(
            new Error(`The file "${outFilePath}" has been updated and must be committed to Git.`)
          );
          await FileSystem.writeFileAsync(outFilePath, normalizedSourceFileContents, {
            ensureFolderExists: true
          });
        } else {
          logger.emitError(
            new Error(
              `The file "${outFilePath}" does not match the expected output. Build this project in non-production ` +
                'mode and commit the changes.'
            )
          );
        }
      }
    },
    { concurrency: 10 }
  );

  if (outFolderPathsSet.size > 0) {
    if (production) {
      const outFolderPathsList: string = Array.from(outFolderPathsSet).join(', ');
      logger.emitError(
        new Error(
          `There are extra files (${outFolderPathsList}) in the "etc" folder. Build this project ` +
            'in non-production mode and commit the changes.'
        )
      );
    } else {
      await Async.forEachAsync(
        outFolderPathsSet,
        async (outFolderPath) => {
          logger.emitWarning(
            new Error(`The file "${outFolderPath}" has been deleted. Commit this change to Git.`)
          );
          await FileSystem.deleteFileAsync(`${outFolderPath}/${outFolderPath}`);
        },
        { concurrency: 10 }
      );
    }
  }
}

async function* enumerateFolderPaths(
  absoluteFolderPath: string,
  relativeFolderPath: string
): AsyncIterable<string> {
  const folderItems: FolderItem[] = await FileSystem.readFolderItemsAsync(absoluteFolderPath);
  for (const folderItem of folderItems) {
    const childRelativeFolderPath: string = `${relativeFolderPath}/${folderItem.name}`;
    if (folderItem.isDirectory()) {
      yield* enumerateFolderPaths(`${absoluteFolderPath}/${folderItem.name}`, childRelativeFolderPath);
    } else {
      yield childRelativeFolderPath;
    }
  }
}
