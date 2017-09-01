// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IMarkupPage } from '@microsoft/api-extractor';

import * as fsx from 'fs-extra';
import * as path from 'path';

/**
 * This is an abstract base class for plug-ins that convert the IMarkupPage representation
 * to various output formats.
 */
export abstract class BasePageRenderer {
  public readonly outputFolder: string;

  /**
   * The file extension written by the renderer.  Example: ".md"
   */
  public abstract readonly outputFileExtension: string;

  public constructor(outputFolder: string) {
    this.outputFolder = outputFolder;
  }

  /**
   * Write a file containing a single page of documentation.
   */
  public abstract writePage(domPage: IMarkupPage): void;

  /**
   * Delete all the output files created by this renderer.
   */
  public deleteOutputFiles(): void {
    const extensionRegExp: RegExp = new RegExp(this.outputFileExtension.replace('.', '\\.') + '$', 'i');
    for (const filename of fsx.readdirSync(this.outputFolder)) {
      if (filename.match(extensionRegExp)) {
        const filenamePath: string = path.join(this.outputFolder, filename);
        fsx.removeSync(filenamePath);
      }
    }
  }

  /**
   * Generate the filename for a given document ID.
   */
  protected getFilenameForDocId(docId: string): string {
    return docId + this.outputFileExtension;
  }
}
