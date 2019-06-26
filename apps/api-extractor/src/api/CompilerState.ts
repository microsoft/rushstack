// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as ts from 'typescript';
import colors = require('colors');

import {
  JsonFile
} from '@microsoft/node-core-library';

import { ExtractorConfig } from './ExtractorConfig';
import { IExtractorInvokeOptions } from './Extractor';
import { TypeScriptMessageFormatter } from '../analyzer/TypeScriptMessageFormatter';

/**
 * Options for {@link CompilerState.create}
 * @public
 */
export interface ICompilerStateCreateOptions {
  /** {@inheritDoc IExtractorInvokeOptions.typescriptCompilerFolder} */
  typescriptCompilerFolder?: string;

  /**
   * Additional .d.ts files to include in the analysis.
   */
  additionalEntryPoints?: string[];
}

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
  public static create(extractorConfig: ExtractorConfig, options?: ICompilerStateCreateOptions): CompilerState {

    let tsconfig: {} | undefined = extractorConfig.overrideTsconfig;
    let configBasePath: string = extractorConfig.projectFolder;
    if (!tsconfig) {
      // If it wasn't overridden, then load it from disk
      tsconfig = JsonFile.load(extractorConfig.tsconfigFilePath);
      configBasePath = path.resolve(path.dirname(extractorConfig.tsconfigFilePath));
    }

    const commandLine: ts.ParsedCommandLine = ts.parseJsonConfigFileContent(
      tsconfig,
      ts.sys,
      configBasePath
    );

    if (!commandLine.options.skipLibCheck && extractorConfig.skipLibCheck) {
      commandLine.options.skipLibCheck = true;
      console.log(colors.cyan(
        'API Extractor was invoked with skipLibCheck. This is not recommended and may cause ' +
        'incorrect type analysis.'
      ));
    }

    const inputFilePaths: string[] = commandLine.fileNames.concat(extractorConfig.mainEntryPointFilePath);
    if (options && options.additionalEntryPoints) {
      inputFilePaths.push(...options.additionalEntryPoints);
    }

    // Append the entry points and remove any non-declaration files from the list
    const analysisFilePaths: string[] = CompilerState._generateFilePathsForAnalysis(inputFilePaths);

    const compilerHost: ts.CompilerHost = CompilerState._createCompilerHost(commandLine, options);

    const program: ts.Program = ts.createProgram(analysisFilePaths, commandLine.options, compilerHost);

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

  private static _createCompilerHost(commandLine: ts.ParsedCommandLine,
    options: IExtractorInvokeOptions | undefined):  ts.CompilerHost {

    // Create a default CompilerHost that we can override
    const compilerHost: ts.CompilerHost = ts.createCompilerHost(commandLine.options);

    if (options && options.typescriptCompilerFolder) {
      // Prevent a closure parameter
      const typescriptCompilerLibFolder: string = path.join(options.typescriptCompilerFolder, 'lib');
      compilerHost.getDefaultLibLocation = () => typescriptCompilerLibFolder;
    }

    return compilerHost;
  }
}
