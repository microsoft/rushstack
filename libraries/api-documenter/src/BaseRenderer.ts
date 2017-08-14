// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as path from 'path';

export abstract class BasePage {
  public readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  public abstract writeToFile(): void;
}

export abstract class BaseRenderer {
  public readonly outputFolder: string;

  /**
   * The file extension written by the renderer.  Example: ".md"
   */
  public abstract readonly outputFileExtension: string;

  public constructor(outputFolder: string) {
    this.outputFolder = outputFolder;
  }

  public abstract createPage(id: string): BasePage;

  public deleteOutputFiles(): void {
    const extensionRegExp: RegExp = new RegExp(this.outputFileExtension.replace('.', '\\.') + '$', 'i');
    for (const filename of fsx.readdirSync(this.outputFolder)) {
      if (filename.match(extensionRegExp)) {
        const filenamePath: string = path.join(this.outputFolder, filename);
        fsx.removeSync(filenamePath);
      }
    }
  }
}
