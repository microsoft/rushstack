import stripJsonComments = require('strip-json-comments');
import * as fs from 'fs';
import * as os from 'os';

/**
 * Utilities for reading/writing JSON files.
 */
export default class JsonFile {

  /* tslint:disable:no-any */ // JSON objects are dynamically typed
  public static loadJsonFile(jsonFilename: string): any {
    if (!fs.existsSync(jsonFilename)) {
      throw new Error(`Input file not found: ${jsonFilename}`);
    }

    const buffer: Buffer = fs.readFileSync(jsonFilename);
    const stripped: string = stripJsonComments(buffer.toString());
    try {
      return JSON.parse(stripped);
    } catch (error) {
      throw new Error(`Error reading "${jsonFilename}":` + os.EOL + `  ${error.message}`);
    }
  }

  public static saveJsonFile(jsonData: any, jsonFilename: string): void {
    const stringified: string = JSON.stringify(jsonData, undefined, 2) + '\n';
    fs.writeFileSync(jsonFilename, stringified.replace('\n', '\r\n'));
  }
  /* tslint:enable:no-any */
}

