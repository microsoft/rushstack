// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';
import { FileSystem, JsonFile } from '@rushstack/node-core-library';
interface IRushProject {
  packageName: string;
  projectFolder: string;
}
export const loadRushProjectFromConfigurationFile = (filepath: string): IRushProject[] => {
  if (!FileSystem.exists(filepath) || !filepath.endsWith('rush.json')) {
    throw new Error('File not exist or not correct');
  }

  const rushConfig: {
    projects: IRushProject[];
  } = JsonFile.parseString(FileSystem.readFile(filepath).toString());
  return rushConfig.projects.map((p) => {
    return {
      ...p,
      projectRelativeFolder: p.projectFolder,
      projectFolder: path.resolve(path.dirname(filepath), p.projectFolder)
    };
  });
};
