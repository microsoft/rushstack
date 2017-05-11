// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import Validator = require('z-schema');
import * as os from 'os';
import * as path from 'path';
import JsonFile from './JsonFile';

export type ValidateErrorCallback = (errorDescription: string) => void;

export default class JsonSchemaValidator {
  private _validator: Validator;
  private _schemaObject: Object;

  public static loadFromFile(schemaFilename: string): JsonSchemaValidator {
    const schemaObject: Object = JsonFile.loadJsonFile(schemaFilename);
    return new JsonSchemaValidator(schemaObject);
  }

  private static _formatErrorDetails(errorDetails: Validator.SchemaErrorDetail[], indent: string,
    buffer: string): string {
    for (const errorDetail of errorDetails) {
      buffer += os.EOL + indent + `Error: ${errorDetail.path}`;
      buffer += os.EOL + indent + `       ${errorDetail.message}`;

      if (errorDetail.inner) {
        buffer = JsonSchemaValidator._formatErrorDetails(errorDetail.inner, indent + '  ', buffer);
      }
    }
    return buffer;
  }

  public validateObject(jsonObject: Object, errorCallback: ValidateErrorCallback): void {

    // Remove the $schema reference that appears in the configuration object (used for IntelliSense),
    // since we are replacing it with the precompiled version.  The validator.setRemoteReference()
    // API is a better way to handle this, but we'd first need to publish the schema file
    // to a public web server where Visual Studio can find it.
    delete jsonObject['$schema']; // tslint:disable-line:no-string-literal

    if (!this._validator.validate(jsonObject, this._schemaObject)) {
      const errorDetails: Validator.SchemaErrorDetail[] = this._validator.getLastErrors();

      let buffer: string = 'JSON schema validation failed:';

      buffer = JsonSchemaValidator._formatErrorDetails(errorDetails, '  ', buffer);
      errorCallback(buffer);
    }
  }

  private constructor(schemaObject: Object) {
    this._schemaObject = schemaObject;
    this._validator = new Validator({
      breakOnFirstError: true,
      noTypeless: true
    });
  }
}
