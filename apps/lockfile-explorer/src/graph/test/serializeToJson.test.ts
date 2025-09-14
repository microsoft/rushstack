// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { lfxGraphSerializer, type LfxGraph } from '../../../build/lfx-shared';

import * as lfxGraphLoader from '../lfxGraphLoader';
import { TEST_WORKSPACE, TEST_LOCKFILE } from './testLockfile';

describe('serializeToJson', () => {
  it('serializes a simple graph', () => {
    const graph = lfxGraphLoader.generateLockfileGraph(TEST_WORKSPACE, TEST_LOCKFILE);

    expect(lfxGraphSerializer.serializeToJson(graph)).toMatchInlineSnapshot(`
Object {
  "entries": Array [
    Object {
      "dependencies": Array [],
      "displayText": "",
      "entryId": "",
      "entryPackageName": "",
      "entryPackageVersion": "",
      "entrySuffix": "",
      "jsonId": 0,
      "kind": 1,
      "packageJsonFolderPath": "",
      "rawEntryId": ".",
      "referrerJsonIds": Array [],
      "transitivePeerDependencies": Array [],
    },
    Object {
      "dependencies": Array [
        Object {
          "dependencyType": "regular",
          "entryId": "/@testPackage/core/1.7.1",
          "name": "@testPackage/core",
          "peerDependencyMeta": Object {
            "name": undefined,
            "optional": undefined,
            "version": undefined,
          },
          "resolvedEntryJsonId": 2,
          "version": "1.7.1",
        },
        Object {
          "dependencyType": "regular",
          "entryId": "/@testPackage2/core/1.7.1",
          "name": "@testPackage2/core",
          "peerDependencyMeta": Object {
            "name": undefined,
            "optional": undefined,
            "version": undefined,
          },
          "resolvedEntryJsonId": 3,
          "version": "1.7.1",
        },
      ],
      "displayText": "Project: testApp1",
      "entryId": "project:./apps/testApp1",
      "entryPackageName": "testApp1",
      "entryPackageVersion": "",
      "entrySuffix": "",
      "jsonId": 1,
      "kind": 1,
      "packageJsonFolderPath": "./apps/testApp1",
      "rawEntryId": "../../../apps/testApp1",
      "referrerJsonIds": Array [],
      "transitivePeerDependencies": Array [],
    },
    Object {
      "dependencies": Array [],
      "displayText": "@testPackage/core 1.7.1",
      "entryId": "",
      "entryPackageName": "@testPackage/core",
      "entryPackageVersion": "1.7.1",
      "entrySuffix": "",
      "jsonId": 2,
      "kind": 2,
      "packageJsonFolderPath": "common/temp/undefined/node_modules/.pnpm/@testPackage+core@1.7.1/node_modules/@testPackage/core",
      "rawEntryId": "/@testPackage/core/1.7.1",
      "referrerJsonIds": Array [
        1,
      ],
      "transitivePeerDependencies": Array [],
    },
    Object {
      "dependencies": Array [],
      "displayText": "@testPackage2/core 1.7.1",
      "entryId": "",
      "entryPackageName": "@testPackage2/core",
      "entryPackageVersion": "1.7.1",
      "entrySuffix": "",
      "jsonId": 3,
      "kind": 2,
      "packageJsonFolderPath": "common/temp/undefined/node_modules/.pnpm/@testPackage2+core@1.7.1/node_modules/@testPackage2/core",
      "rawEntryId": "/@testPackage2/core/1.7.1",
      "referrerJsonIds": Array [
        1,
      ],
      "transitivePeerDependencies": Array [],
    },
  ],
  "workspace": Object {
    "pnpmLockfilePath": "/test/pnpm-lock.yaml",
    "rushConfig": undefined,
    "workspaceRootFolder": "/test",
  },
}
`);
  });

  it('deserializes a simple graph', () => {
    const originalGraph = lfxGraphLoader.generateLockfileGraph(TEST_WORKSPACE, TEST_LOCKFILE);

    const serialized: string = JSON.stringify(
      lfxGraphSerializer.serializeToJson(originalGraph),
      undefined,
      2
    );

    const deserialized: LfxGraph = lfxGraphSerializer.deserializeFromJson(JSON.parse(serialized));

    expect(deserialized.entries.length === originalGraph.entries.length);

    const reserialized: string = JSON.stringify(
      lfxGraphSerializer.serializeToJson(deserialized),
      undefined,
      2
    );

    expect(reserialized).toEqual(serialized);
  });
});
