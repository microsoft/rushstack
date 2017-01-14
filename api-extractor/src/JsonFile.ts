import * as fsx from 'fs-extra';
import * as os from 'os';
import * as jju from 'jju';
import Validator = require('z-schema');

export type ValidateErrorCallback = (errorDetail: string) => void;

interface ISchemaError extends ZSchema.SchemaError {
  // Ex. "z-schema validation error"
  name: string;
  details: Array<IErrorDetail>;
}

interface IErrorDetail extends ZSchema.SchemaError {
  inner?: IErrorDetail[];
}

/**
 * Utilities for reading/writing JSON files.
 */
export default class JsonFile {

  public static validateSchema(jsonObject: Object, jsonSchemaObject: Object,
    errorCallback: ValidateErrorCallback): void {

    // Remove the $schema reference that appears in the configuration object (used for IntelliSense),
    // since we are replacing it with the precompiled version.  The validator.setRemoteReference()
    // API is a better way to handle this, but we'd first need to publish the schema file
    // to a public web server where Visual Studio can find it.
    // tslint:disable-next-line:no-string-literal
    delete jsonSchemaObject['$schema'];

    const validator: ZSchema.Validator = new Validator({
      breakOnFirstError: false,
      noTypeless: true
    });

    if (!validator.validate(jsonObject, jsonSchemaObject)) {
      const error: ISchemaError = validator.getLastError() as ISchemaError;

      let errorDetail: string = 'JSON schema validation failed:';

      errorDetail = JsonFile._formatErrorDetails(error.details, '  ', errorDetail);
      errorCallback(errorDetail);
    }
  }

  public static loadJsonFile(jsonFilename: string): {} {
    if (!fsx.existsSync(jsonFilename)) {
      throw new Error(`Input file not found: ${jsonFilename}`);
    }

    const buffer: Buffer = fsx.readFileSync(jsonFilename);
    try {
      return jju.parse(buffer.toString());
    } catch (error) {
      throw new Error(`Error reading "${jsonFilename}":` + os.EOL + `  ${error.message}`);
    }
  }

  public static saveJsonFile(jsonFilename: string, jsonData: {}): void {
    JsonFile._validateNoUndefinedMembers(jsonData);
    const stringified: string = JSON.stringify(jsonData, undefined, 2) + '\n';
    const normalized: string = JsonFile._getAllReplaced(stringified, '\n', '\r\n');
    fsx.writeFileSync(jsonFilename, normalized);
  }

  /**
   * Used to validate a data structure before writing.  Reports an error if there
   * are any undefined members.
   */
  // tslint:disable-next-line:no-any
  private static _validateNoUndefinedMembers(json: any): void {
    if (!json) {
      return;
    }
    if (typeof json === 'object') {
      for (const key of Object.keys(json)) {
        // tslint:disable-next-line:no-any
        const value: any = json[key];
        if (value === undefined) {
          throw new Error(`The key "${key}" is undefined`);
        }
        JsonFile._validateNoUndefinedMembers(value);
      }
    }

  }

  private static _formatErrorDetails(errorDetails: IErrorDetail[], indent: string,
    result: string): string {
    for (const detail of errorDetails) {
      result += os.EOL + indent + `Error: ${detail.path}`;
      // result += os.EOL + indent + `       ${detail.code}`;
      result += os.EOL + indent + `       ${detail.message}`;

      if (detail.inner) {
        result = JsonFile._formatErrorDetails(detail.inner, indent + '  ', result);
      }
    }
    return result;
  }

  /**
   * Returns the same thing as targetString.replace(searchValue, replaceValue), except that
   * all matches are replaced, rather than just the first match.
   * @param targetString  The string to be modified
   * @param searchValue   The value to search for
   * @param replaceValue  The replacement text
   */
  private static _getAllReplaced(targetString: string, searchValue: string, replaceValue: string): string {
    return targetString.split(searchValue).join(replaceValue);
  }
}
