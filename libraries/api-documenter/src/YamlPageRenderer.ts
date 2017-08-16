// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import yaml = require('js-yaml');

import {
  IDomPage
} from './SimpleDom';

import { BasePageRenderer } from './BasePageRenderer';
import { RenderingHelpers } from './RenderingHelpers';

export class YamlPageRenderer extends BasePageRenderer {
  public get outputFileExtension(): string { // abstract
    return '.yaml';
  }

  public writePage(domPage: IDomPage): void { // abstract
    const filename: string = path.join(this.outputFolder, this.getFilenameForDocId(domPage.docId));

    console.log('Writing: ' + filename + os.EOL);

    RenderingHelpers.validateNoUndefinedMembers(domPage);
    const stringified: string = yaml.safeDump(domPage, {
      lineWidth: 120
    });
    const normalized: string = stringified.split('\n').join('\r\n');
    fsx.writeFileSync(filename, normalized);
  }
}
