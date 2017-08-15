// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';
import { IDomPage } from './SimpleDom';

export abstract class BasePageRenderer {
  public readonly outputFolder: string;

  /**
   * The file extension written by the renderer.  Example: ".md"
   */
  public abstract readonly outputFileExtension: string;

  public constructor(outputFolder: string) {
    this.outputFolder = outputFolder;
  }

  public abstract writePage(domPage: IDomPage): void;

  public deleteOutputFiles(): void {
    const extensionRegExp: RegExp = new RegExp(this.outputFileExtension.replace('.', '\\.') + '$', 'i');
    for (const filename of fsx.readdirSync(this.outputFolder)) {
      if (filename.match(extensionRegExp)) {
        const filenamePath: string = path.join(this.outputFolder, filename);
        fsx.removeSync(filenamePath);
      }
    }
  }

  protected getFilenameForDocId(docId: string): string {
    return docId + this.outputFileExtension;
  }
}
