// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as ts from 'typescript';
import colors = require('colors');

import {
  JsonFile,
  FileSystem
} from '@microsoft/node-core-library';

import { ExtractorConfig } from './ExtractorConfig';
import { IExtractorInvokeOptions } from './Extractor';
import { TypeScriptMessageFormatter } from '../analyzer/TypeScriptMessageFormatter';

/**
 * This class represents the TypeScript compiler state.  This allows an optimization where multiple invocations
 * of API Extractor can reuse the same TypeScript compiler analysis.
 *
 * @public
 */
export class CompilerState {
  /**
   * The TypeScript compiler's `Program` object, which represents a complete scope of analysis.
   */
  public readonly program: ts.Program;

  private constructor(properties: CompilerState) {
    this.program = properties.program;
  }

  /**
   * Create a compiler state for use with the specified `IExtractorInvokeOptions`.
   */
  public static create(extractorConfig: ExtractorConfig, options?: IExtractorInvokeOptions): CompilerState {

    let tsconfig: {} | undefined = extractorConfig.overrideTsconfig;
    if (!tsconfig) {
      // If it wasn't overridden, then load it from disk
      tsconfig = JsonFile.load(path.join(extractorConfig.rootFolder, 'tsconfig.json'));
    }

    const commandLine: ts.ParsedCommandLine = ts.parseJsonConfigFileContent(
      tsconfig,
      ts.sys,
      extractorConfig.rootFolder
    );

    if (!commandLine.options.skipLibCheck && extractorConfig.skipLibCheck) {
      commandLine.options.skipLibCheck = true;
      console.log(colors.cyan(
        'API Extractor was invoked with skipLibCheck. This is not recommended and may cause ' +
        'incorrect type analysis.'
      ));
    }

    CompilerState._updateCommandLineForTypescriptPackage(commandLine, options);

    // Append the mainEntryPointFile and remove any non-declaration files from the list
    const analysisFilePaths: string[] = CompilerState._generateFilePathsForAnalysis(
      commandLine.fileNames.concat(extractorConfig.mainEntryPointFile)
    );

    const program: ts.Program = ts.createProgram(analysisFilePaths, commandLine.options);

    if (commandLine.errors.length > 0) {
      const errorText: string = TypeScriptMessageFormatter.format(commandLine.errors[0].messageText);
      throw new Error(`Error parsing tsconfig.json content: ${errorText}`);
    }

    return new CompilerState({
      program
    });
  }

 /**
   * Given a list of absolute file paths, return a list containing only the declaration
   * files.  Duplicates are also eliminated.
   *
   * @remarks
   * The tsconfig.json settings specify the compiler's input (a set of *.ts source files,
   * plus some *.d.ts declaration files used for legacy typings).  However API Extractor
   * analyzes the compiler's output (a set of *.d.ts entry point files, plus any legacy
   * typings).  This requires API Extractor to generate a special file list when it invokes
   * the compiler.
   *
   * Duplicates are removed so that entry points can be appended without worrying whether they
   * may already appear in the tsconfig.json file list.
   */
  private static _generateFilePathsForAnalysis(inputFilePaths: string[]): string[] {
    const analysisFilePaths: string[] = [];

    const seenFiles: Set<string> = new Set<string>();

    for (const inputFilePath of inputFilePaths) {
      const inputFileToUpper: string = inputFilePath.toUpperCase();
      if (!seenFiles.has(inputFileToUpper)) {
        seenFiles.add(inputFileToUpper);

        if (!path.isAbsolute(inputFilePath)) {
          throw new Error('Input file is not an absolute path: ' + inputFilePath);
        }

        if (ExtractorConfig.hasDtsFileExtension(inputFilePath)) {
          analysisFilePaths.push(inputFilePath);
        }
      }
    }

    return analysisFilePaths;
  }

  /**
   * Update the parsed command line to use paths from the specified TS compiler folder, if
   * a TS compiler folder is specified.
   */
  private static _updateCommandLineForTypescriptPackage(
    commandLine: ts.ParsedCommandLine,
    options?: IExtractorInvokeOptions
  ): void {
    const DEFAULT_BUILTIN_LIBRARY: string = 'lib.d.ts';
    const OTHER_BUILTIN_LIBRARIES: string[] = ['lib.es5.d.ts', 'lib.es6.d.ts'];

    if (options && options.typescriptCompilerFolder) {
      commandLine.options.noLib = true;
      const compilerLibFolder: string = path.join(options.typescriptCompilerFolder, 'lib');

      let foundBaseLib: boolean = false;
      const filesToAdd: string[] = [];
      for (const libFilename of commandLine.options.lib || []) {
        if (libFilename === DEFAULT_BUILTIN_LIBRARY) {
          // Ignore the default lib - it'll get added later
          continue;
        }

        if (OTHER_BUILTIN_LIBRARIES.indexOf(libFilename) !== -1) {
          foundBaseLib = true;
        }

        const libPath: string = path.join(compilerLibFolder, libFilename);
        if (!FileSystem.exists(libPath)) {
          throw new Error(`lib ${libFilename} does not exist in the compiler specified in typescriptLibPackage`);
        }

        filesToAdd.push(libPath);
      }

      if (!foundBaseLib) {
        // If we didn't find another version of the base lib library, include the default
        filesToAdd.push(path.join(compilerLibFolder, 'lib.d.ts'));
      }

      if (!commandLine.fileNames) {
        commandLine.fileNames = [];
      }

      commandLine.fileNames.push(...filesToAdd);

      commandLine.options.lib = undefined;
    }
  }

}
