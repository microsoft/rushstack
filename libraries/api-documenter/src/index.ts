// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { DocItemSet } from './DocItemSet';
import { YamlGenerator } from './yaml/YamlGenerator';
import { MarkdownGenerator } from './markdown/MarkdownGenerator';

const myPackageJsonFilename: string = path.resolve(path.join(
  __dirname, '..', 'package.json')
);
const myPackageJson: { version: string } = require(myPackageJsonFilename);

console.log(os.EOL + colors.bold(`api-documenter ${myPackageJson.version}` + os.EOL));

const docItemSet: DocItemSet = new DocItemSet();

const dataFolder: string = path.join(__dirname, '../files');

const inputFolder: string = path.join(dataFolder, 'input');
for (const filename of fsx.readdirSync(inputFolder)) {
  if (filename.match(/\.api\.json$/i)) {
    console.log(`Reading ${filename}`);
    const filenamePath: string = path.join(inputFolder, filename);
    docItemSet.loadApiJsonFile(filenamePath);
  }
}

docItemSet.calculateReferences();

// const yamlGenerator: YamlGenerator = new YamlGenerator(docItemSet);
// yamlGenerator.generateFiles(path.join(dataFolder, 'yaml'));

const markdownGenerator: MarkdownGenerator = new MarkdownGenerator(docItemSet);
markdownGenerator.generateFiles(path.join(dataFolder, 'markdown'));

