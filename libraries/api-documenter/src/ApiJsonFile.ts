// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';

import { ApiJsonGenerator } from '@microsoft/api-extractor';
import { IApiPackage } from '@microsoft/api-extractor';
import { JsonFile, IJsonSchemaErrorInfo } from '@microsoft/node-core-library';

/**
 * TODO: This should be converted into a public API for the API Extractor library.
 */
export class ApiJsonFile {
  public readonly docPackage: IApiPackage;
  public readonly packageName: string;

  public static loadFromFile(apiJsonFilePath: string): ApiJsonFile {
    const docPackage: IApiPackage = JsonFile.loadAndValidateWithCallback(apiJsonFilePath, ApiJsonGenerator.jsonSchema,
      (errorInfo: IJsonSchemaErrorInfo) => {
        const errorMessage: string
          = path.basename(apiJsonFilePath) + ' does not conform to the expected schema.' + os.EOL
          + '(Was it created by an incompatible release of API Extractor?)' + os.EOL
          + errorInfo.details;

        console.log(os.EOL + 'ERROR: ' + errorMessage + os.EOL + os.EOL);
        throw new Error(errorMessage);
      }
    );

    const packageName: string = path.basename(apiJsonFilePath).replace(/\.api\.json$/i, '');
    return new ApiJsonFile(packageName, docPackage);
  }

  private constructor(packageName: string, docPackage: IApiPackage) {
    this.packageName = packageName;
    this.docPackage = docPackage;
  }
}
