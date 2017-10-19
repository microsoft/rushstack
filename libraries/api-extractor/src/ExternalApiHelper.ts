// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';
import { ApiExtractor } from './extractor/ApiExtractor';

/**
 * ExternalApiHelper has the specific use case of generating an API json file from third-party definition files.
 * This class is invoked by the gulp-core-build-typescript gulpfile, where the external package names are
 * hard wired.
 * The job of this method is almost the same as the API Extractor task that is executed on first party packages,
 * with the exception that all packages analyzed here are external packages with definition files.
 *
 * @beta
 */
export default class ExternalApiHelper {

  /**
   * @param rootDir - the absolute path containing a 'package.json' file and is also a parent of the
   * external package file. Ex: build.absolute_build_path.
   * @param libFolder - the path to the lib folder relative to the rootDir, this is where
   * 'external-api-json/external_package.api.json' file will be written. Ex: 'lib'.
   * @param externalPackageFilePath - the path to the '*.d.ts' file of the external package relative to the rootDir.
   * Ex: 'resources/external-api-json/es6-collection/index.t.ds'
   */
  public static generateApiJson(rootDir: string, libFolder: string, externalPackageFilePath: string): void {
    const entryPointFile: string = path.resolve(rootDir, externalPackageFilePath);
    const entryPointFolder: string = path.dirname(entryPointFile);

    const overrideTsconfig: { } = {
      target: 'es5',
      module: 'commonjs',
      moduleResolution: 'node',
      experimentalDecorators: true,
      jsx: 'react',
      rootDir: entryPointFolder
    };

    let outputPath: string = path.resolve(rootDir, libFolder);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }

    outputPath = path.join(outputPath, 'external-api-json');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }

    const apiExtractor: ApiExtractor = new ApiExtractor({
      compiler: {
        configType: 'tsconfig',
        rootFolder: entryPointFolder,
        overrideTsconfig: overrideTsconfig
      },
      project: {
        entryPointSourceFile: entryPointFile
      },
      apiReviewFile: {
        enabled: false
      },
      apiJsonFile: {
        enabled: true,
        outputFolder: outputPath
      }
    }, {
       customLogger: {
        logVerbose: (message: string) => { /* don't log */ },
        logInfo: (message: string) => console.log(message),
        logWarning: (message: string) => console.error(message),
        logError: (message: string) => console.error(message)
      }
    });

    apiExtractor.analyzeProject();
  }
}
