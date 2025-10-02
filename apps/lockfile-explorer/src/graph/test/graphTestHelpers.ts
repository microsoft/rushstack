// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import yaml from 'js-yaml';

import { FileSystem, NewlineKind } from '@rushstack/node-core-library';

import {
  type IJsonLfxGraph,
  type IJsonLfxWorkspace,
  lfxGraphSerializer,
  type LfxGraph
} from '../../../build/lfx-shared';
import * as lfxGraphLoader from '../lfxGraphLoader';

const FIXTURES_FOLDER: string = path.resolve(__dirname, '../../../src/graph/test/fixtures/');

export async function loadAndSerializeLFxGraphAsync(options: {
  workspace: IJsonLfxWorkspace;
  lockfilePathUnderFixtures: string;
}): Promise<string> {
  const lockfileYaml: string = await FileSystem.readFileAsync(
    FIXTURES_FOLDER + options.lockfilePathUnderFixtures,
    { convertLineEndings: NewlineKind.Lf }
  );
  const lockfileObject = yaml.load(lockfileYaml);
  const graph: LfxGraph = lfxGraphLoader.generateLockfileGraph(lockfileObject, options.workspace);
  const serializedObject: IJsonLfxGraph = lfxGraphSerializer.serializeToJson(graph);
  const serializedYaml: string = yaml.dump(serializedObject, {
    noRefs: true,
    sortKeys: true,
    noCompatMode: true,
    lineWidth: 110
  });
  return serializedYaml;
}
