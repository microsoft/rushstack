/// <reference types="jju" />
/// <reference types="z-schema" />

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

import Validator = require('z-schema');
import jju = require('jju');

const schemaKey: string = '$schema';

export interface ISchemaValidatorResult {
  details?: ZSchema.SchemaError[];
  name?: string;
  message?: string;
}

/**
 * Wrapper functions around z-schema which help improve ease of use
 */
export class SchemaValidator {
  private static _schemaValidator: ZSchema.Validator = new Validator({
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
      const error: ISchemaValidatorResult = this._schemaValidator.getLastError();
      throw this.getFormattedErrorMessage(error, dataFilePath);
    }
    return undefined;
  }

  public static getFormattedErrorMessage(error: ISchemaValidatorResult, dataFilePath?: string): string {
    const errorMessage: string =
      (dataFilePath ? `Error parsing file '${path.basename(dataFilePath)}'${os.EOL}` : '') +
      this._extractInnerErrorMessages(error.details).join(os.EOL);

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

  private static _extractInnerErrorMessages(errors: ZSchema.SchemaError[]): string[] {
    const errorList: string[] = [];
    errors.map((error) => { errorList.push(...this._formatZSchemaError(error)); });
    return errorList;
  }

  private static _formatZSchemaError(error: ZSchema.SchemaError): string[] {
    const innerErrors: string[] = [];

    /* tslint:disable-next-line:no-any */
    ((error as any).details as ZSchema.SchemaError[] || []).forEach((innerErr) => {
      innerErrors.push(...this._formatZSchemaError(innerErr));
    });

    return [`(${error.path}) ${error.message}`].concat(innerErrors);
  };
}
