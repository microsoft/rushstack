import { assert } from 'chai';
import * as fs from 'fs';

/* tslint:disable:no-function-expression - Mocha uses a poorly scoped "this" pointer */

export default class TestFileComparer {

  public static assertFileMatchesExpected(actualFilename: string, expectedFilename: string): void {
    const actualContent: string = fs.readFileSync(actualFilename).toString('utf8');
    const expectedContent: string = fs.readFileSync(expectedFilename).toString('utf8');

    assert(this.areEquivalentFileContents(actualContent, expectedContent),
      'The file content does not match the expected value:'
      + '\nEXPECTED: ' + expectedFilename
      + '\nACTUAL: ' + actualFilename);
  }

  /**
   * Compares the contents of two files, and returns true if they are equivalent.  
   * Note that these files are not normally edited by a human; the "equivalence" 
   * comparison here is intended to ignore spurious changes that might be introduced 
   * by a tool, e.g. Git newline normalization or an editor that strips
   * whitespace when saving.
   */
  public static areEquivalentFileContents(actualFileContent: string, expectedFileContent: string): boolean {
    // NOTE: "\s" also matches "\r" and "\n"
    const normalizedActual: string = actualFileContent.replace(/[\s]+/g, ' ');
    const normalizedExpected: string = expectedFileContent.replace(/[\s]+/g, ' ');
    return normalizedActual === normalizedExpected;
  }

  /**
   * Generates the report and writes it to disk.
   * @param reportFilename - The output filename
   * @param value - A string value to be written to file.
   */
  public static writeFile(reportFilename: string, value: string): void {
    const fileContent: string = this.generateFileContent(value);
    fs.writeFileSync(reportFilename, fileContent);
  }

  public static generateFileContent(value: string): string {
    // Normalize to CRLF
    if (!value) {
      throw new Error(`Expected non undefined parameter: ${value}`);
    }
    const fileContent: string = value.toString().replace(/\r?\n/g, '\r\n');
    return fileContent;
  }
}