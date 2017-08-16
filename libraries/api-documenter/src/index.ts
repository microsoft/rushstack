// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { Documenter } from './Documenter';
import { MarkdownPageRenderer } from './MarkdownPageRenderer';
import { YamlPageRenderer } from './YamlPageRenderer';

const myPackageJsonFilename: string = path.resolve(path.join(
  __dirname, '..', 'package.json')
);
const myPackageJson: { version: string } = require(myPackageJsonFilename);

console.log(os.EOL + colors.bold(`api-documenter ${myPackageJson.version}` + os.EOL));

const documenter: Documenter = new Documenter();
const inputFolder: string = path.join(__dirname, '../files/input');
for (const filename of fsx.readdirSync(inputFolder)) {
  if (filename.match(/\.api\.json$/i)) {
    console.log(`Reading ${filename}`);
    const filenamePath: string = path.join(inputFolder, filename);
    documenter.loadApiJsonFile(filenamePath);
  }
}

const dataFolder: string = path.join(__dirname, '../files');

const markdownPageRenderer: MarkdownPageRenderer = new MarkdownPageRenderer(path.join(dataFolder, 'markdown'));
documenter.writeDocs(markdownPageRenderer);

const yamlPageRenderer: YamlPageRenderer = new YamlPageRenderer(path.join(dataFolder, 'yaml'));
documenter.writeDocs(yamlPageRenderer);
