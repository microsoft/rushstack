// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { BaseRenderer, BasePage } from './BaseRenderer';

export class MarkdownPage extends BasePage {
  private _renderer: MarkdownRenderer;

  constructor(id: string, renderer: MarkdownRenderer) {
    super(id);
    this._renderer = renderer;
  }

  public writeToFile(): void { // abstract
    const filename: string = path.join(this._renderer.outputFolder,
      this.id + this._renderer.outputFileExtension);

    console.log('Writing: ' + filename + os.EOL);
    fsx.writeFileSync(filename, '');
  }
}

export class MarkdownRenderer extends BaseRenderer {
  public createPage(id: string): BasePage { // abstract
    return new MarkdownPage(id, this);
  }

  public get outputFileExtension(): string { // abstract
    return '.md';
  }
}
