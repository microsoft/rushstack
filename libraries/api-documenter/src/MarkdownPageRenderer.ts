// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { IDomPage } from './SimpleDom';

import { BasePageRenderer } from './BasePageRenderer';

class SimpleWriter {
  private _buffer: string = '';

  public write(s: string): void {
    this._buffer += s;
  }

  public writeLine(s: string = ''): void {
    this._buffer += s + '\n';
  }

  public toString(): string {
    return this._buffer;
  }
}

export class MarkdownPageRenderer extends BasePageRenderer {
  public get outputFileExtension(): string { // abstract
    return '.md';
  }

  public writePage(domPage: IDomPage): void { // abstract
    const filename: string = path.join(this.outputFolder, domPage.docId + this.outputFileExtension);

    console.log('Writing: ' + filename + os.EOL);

    const writer: SimpleWriter = new SimpleWriter();
    writer.writeLine('<!-- ' + domPage.docId + ' -->');
    writer.writeLine();

    writer.writeLine('# ' + domPage.title);
    writer.writeLine();

    fsx.writeFileSync(filename, writer.toString());
  }
}
