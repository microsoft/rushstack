// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" />
import * as fs from 'node:fs';
import * as path from 'node:path';

export function getScssFiles(): string[] {
  const srcFolder: string = path.join(__dirname, '../../src');
  const sourceFiles: string[] = fs
    .readdirSync(srcFolder, { withFileTypes: true })
    .filter((file: fs.Dirent) => {
      const { name } = file;
      return file.isFile() && !name.startsWith('_') && (name.endsWith('.sass') || name.endsWith('.scss'));
    })
    .map((dirent) => dirent.name);
  return sourceFiles;
}

export function validateSnapshots(dir: string, fileName: string): void {
  const originalExt: string = path.extname(fileName);
  const basename: string = path.basename(fileName, originalExt) + '.';
  const files: fs.Dirent[] = fs.readdirSync(dir, { withFileTypes: true });
  const filteredFiles: fs.Dirent[] = files.filter((file: fs.Dirent) => {
    return file.isFile() && file.name.startsWith(basename);
  });
  expect(filteredFiles.map((x) => x.name)).toMatchSnapshot(`files`);
  filteredFiles.forEach((file: fs.Dirent) => {
    if (!file.isFile() || !file.name.startsWith(basename)) {
      return;
    }
    const filePath: string = path.join(dir, file.name);
    const fileContents: string = fs.readFileSync(filePath, 'utf8');
    const normalizedFileContents: string = fileContents.replace(/\r/gm, '');
    expect(normalizedFileContents).toMatchSnapshot(`${file.name}`);
  });
}
