// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TEST_LOCKFILE } from './testLockfile';
import * as lfxGraphLoader from '../lfxGraphLoader';
import type { LockfileEntry } from '../LockfileEntry';

describe('LockfileGeneration', () => {
  it('creates a valid bi-directional graph', () => {
    const resolvedPackages = lfxGraphLoader.generateLockfileGraph(TEST_LOCKFILE);

    // Mapping of all the lockfile entries created by the lockfile
    const resolvedPackagesMap: { [key in string]: LockfileEntry } = {};
    for (const resolvedPackage of resolvedPackages) {
      resolvedPackagesMap[resolvedPackage.entryPackageName] = resolvedPackage;
    }

    const exampleLockfileImporter = resolvedPackagesMap.testApp1;

    // Ensure validity of the example lockfile entry
    expect(exampleLockfileImporter.rawEntryId).toBe('../../../apps/testApp1');
    expect(exampleLockfileImporter.entryId).toBe('project:./apps/testApp1');

    // Test that dependencies are linked in the importer project
    expect(exampleLockfileImporter.dependencies.length).toBe(2);
    const [testPackage, testPackage2] = exampleLockfileImporter.dependencies;
    expect(testPackage.name).toBe('@testPackage/core');
    expect(testPackage2.name).toBe('@testPackage2/core');

    // Test linking between the packages and the importer project
    expect(testPackage.containingEntry).toBe(exampleLockfileImporter);
    expect(testPackage2.containingEntry).toBe(exampleLockfileImporter);

    // Test that the linked packages exists as lockfileEntries
    expect(testPackage.resolvedEntry).toBe(resolvedPackagesMap[testPackage.name]);
    expect(testPackage2.resolvedEntry).toBe(resolvedPackagesMap[testPackage2.name]);
  });
});
