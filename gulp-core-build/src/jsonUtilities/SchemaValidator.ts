/// <reference types="jju" />

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

import Validator = require('z-schema');
import jju = require('jju');

const schemaKey: string = '$schema';

/**
 * Wrapper functions around z-schema which help improve ease of use
 */
export class SchemaValidator {
  private static _schemaValidator: Validator = new Validator({
    breakOnFirstError: true,
    noExtraKeywords: true,
    noTypeless: true
  });

  /**
   * A function which validates a dataFile against a schemFile, both specified
   * as paths. It will throw if there is an issue with the file,
   * otherwise it will return the validated datafile.
   */
  public static readAndValidateJson<TResult>(dataFilePath: string, schemaFilePath: string): TResult {
    const data: TResult = this.readCommentedJsonFile(dataFilePath) as TResult;
    const schema: Object = this.readCommentedJsonFile(schemaFilePath);
    this.validate(data, schema, dataFilePath);
    return data;
  }

  /**
   * A function which validates a data object against a schema object.
   * It will throw if there is an issue with the data object.
   * For an improved error message, pass the filename in the optional third parameter
   */
  public static validate(data: Object, schema: Object, dataFilePath?: string): void {
    if (!this._schemaValidator.validate(data, schema)) {
      const errors: Validator.SchemaErrorDetail[] = this._schemaValidator.getLastErrors();
      throw this.getFormattedErrorMessage(errors, dataFilePath);
    }
    return undefined;
  }

  public static getFormattedErrorMessage(errors: Validator.SchemaErrorDetail[], dataFilePath?: string): string {
    const errorMessage: string =
      (dataFilePath ? `Error parsing file '${path.basename(dataFilePath)}'${os.EOL}` : '') +
      this._extractInnerErrorMessages(errors).join(os.EOL);

    return os.EOL + 'ERROR: ' + errorMessage + os.EOL + os.EOL;
  }

  public static readCommentedJsonFile<TResult>(filename: string): TResult {
    const contents: Buffer = fs.readFileSync(filename);
    let rawConfig: Object;
    try {
       rawConfig = jju.parse(contents.toString());
    } catch (error) {
      throw new Error(`Error reading '${filename}':` + os.EOL + `  ${error.message}`);
    }

    // it would eventually be nice to infer the schema based on this value
    delete rawConfig[schemaKey];
    return rawConfig as TResult;
  }

  private static _extractInnerErrorMessages(errors: Validator.SchemaErrorDetail[]): string[] {
    const errorList: string[] = [];
    errors.map((error) => { errorList.push(...this._formatZSchemaError(error)); });
    return errorList;
  }

  private static _formatZSchemaError(error: Validator.SchemaErrorDetail): string[] {
    const innerErrors: string[] = [];

    error.inner.forEach((innerErr: Validator.SchemaErrorDetail) => {
      innerErrors.push(...this._formatZSchemaError(innerErr));
    });

    return [`(${error.path}) ${error.message}`].concat(innerErrors);
  };
}
