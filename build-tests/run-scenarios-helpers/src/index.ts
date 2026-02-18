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

export interface IRunScenariosOptions {
  libFolderPath: string;
  additionalApiExtractorConfig?: {};
  afterApiExtractorAsync?: (scenarioFolderName: string) => Promise<void>;
}

export async function runScenariosAsync(
  {
    heftTaskSession: {
      logger,
      parameters: { production }
    },
    heftConfiguration: { buildFolderPath }
  }: IRunScriptOptions,
  { libFolderPath, additionalApiExtractorConfig, afterApiExtractorAsync }: IRunScenariosOptions
): Promise<void> {
  const entryPoints: string[] = [];
  const scenariosWithCustomCompilerOptions: string[] = [];

  const scenarioFolderNames: string[] = [];
  const libDtsFolderPath: string = `${buildFolderPath}/lib-dts`;
  const folderItems: FolderItem[] = await FileSystem.readFolderItemsAsync(libDtsFolderPath);
  for (const folderItem of folderItems) {
    if (folderItem.isDirectory()) {
      scenarioFolderNames.push(folderItem.name);
    }
  }

  await Async.forEachAsync(
    scenarioFolderNames,
    async (scenarioFolderName) => {
      const entryPoint: string = `${libDtsFolderPath}/${scenarioFolderName}/index.d.ts`;
      entryPoints.push(entryPoint);

      const overridesPath: string = `${buildFolderPath}/src/${scenarioFolderName}/config/api-extractor-overrides.json`;

      let apiExtractorJsonOverrides: {} | undefined;
      try {
        apiExtractorJsonOverrides = await JsonFile.loadAsync(overridesPath);
      } catch (e) {
        if (!FileSystem.isNotExistError(e)) {
          throw e;
        }
      }

      if (apiExtractorJsonOverrides && 'compiler' in apiExtractorJsonOverrides) {
        scenariosWithCustomCompilerOptions.push(scenarioFolderName);
      }

      const apiExtractorJson: {} = {
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
        testMode: true,

        ...additionalApiExtractorConfig,
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

  let baseCompilerState: CompilerState | undefined = undefined;
  for (const scenarioFolderName of scenarioFolderNames) {
    logger.terminal.writeLine(`Scenario: ${scenarioFolderName}`);

    // Run API Extractor programmatically
    const apiExtractorJsonPath: string = `${buildFolderPath}/temp/configs/api-extractor-${scenarioFolderName}.json`;
    const extractorConfig: ExtractorConfig = ExtractorConfig.loadFileAndPrepare(apiExtractorJsonPath);

    let compilerState: CompilerState;
    if (scenariosWithCustomCompilerOptions.includes(scenarioFolderName)) {
      logger.terminal.writeLine(`Using custom compiler state (${scenarioFolderName})`);
      compilerState = CompilerState.create(extractorConfig, {
        additionalEntryPoints: entryPoints
      });
    } else {
      if (!baseCompilerState) {
        baseCompilerState = CompilerState.create(extractorConfig, {
          additionalEntryPoints: entryPoints
        });
      }
      compilerState = baseCompilerState;
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

    await afterApiExtractorAsync?.(scenarioFolderName);
  }

  const baseInFolderPath: string = `${buildFolderPath}/temp/etc`;
  const baseOutFolderPath: string = `${buildFolderPath}/etc`;

  const inFolderPaths: AsyncIterable<string> = enumerateFolderPaths(baseInFolderPath, '');
  const outFolderPaths: AsyncIterable<string> = enumerateFolderPaths(baseOutFolderPath, '');
  const outFolderPathsSet: Set<string> = new Set<string>();

  for await (const outFolderPath of outFolderPaths) {
    outFolderPathsSet.add(outFolderPath);
  }

  const nonMatchingFiles: string[] = [];
  await Async.forEachAsync(
    inFolderPaths,
    async (folderItemPath) => {
      outFolderPathsSet.delete(folderItemPath);

      const sourceFileContents: string = await FileSystem.readFileAsync(baseInFolderPath + folderItemPath);
      const outFilePath: string = baseOutFolderPath + folderItemPath;
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
        nonMatchingFiles.push(outFilePath);
        if (!production) {
          await FileSystem.writeFileAsync(outFilePath, normalizedSourceFileContents, {
            ensureFolderExists: true
          });
        }
      }
    },
    { concurrency: 10 }
  );

  if (outFolderPathsSet.size > 0) {
    nonMatchingFiles.push(...outFolderPathsSet);
    if (!production) {
      await Async.forEachAsync(
        outFolderPathsSet,
        async (outFolderPath) => {
          await FileSystem.deleteFileAsync(`${outFolderPath}/${outFolderPath}`);
        },
        { concurrency: 10 }
      );
    }
  }

  if (nonMatchingFiles.length > 0) {
    const errorLines: string[] = [];
    for (const nonMatchingFile of nonMatchingFiles.sort()) {
      errorLines.push(`  ${nonMatchingFile}`);
    }

    if (production) {
      logger.emitError(
        new Error(
          'The following file(s) do not match the expected output. Build this project in non-production ' +
            `mode and commit the changes:\n${errorLines.join('\n')}`
        )
      );
    } else {
      logger.emitWarning(
        new Error(
          `The following file(s) do not match the expected output and must be committed to Git:\n` +
            errorLines.join('\n')
        )
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
