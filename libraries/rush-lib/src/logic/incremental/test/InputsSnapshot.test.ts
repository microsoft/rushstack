// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LookupByPath } from '@rushstack/lookup-by-path';

import type { RushProjectConfiguration } from '../../../api/RushProjectConfiguration.ts';
import {
  InputsSnapshot,
  type IInputsSnapshotParameters,
  type IRushConfigurationProjectForSnapshot
} from '../InputsSnapshot.ts';

describe(InputsSnapshot.name, () => {
  function getTestConfig(): {
    project: IRushConfigurationProjectForSnapshot;
    options: IInputsSnapshotParameters;
  } {
    const project: IRushConfigurationProjectForSnapshot = {
      projectFolder: '/root/a',
      projectRelativeFolder: 'a'
    };

    return {
      project,
      options: {
        rootDir: '/root',
        additionalHashes: new Map([['/ext/config.json', 'hash4']]),
        hashes: new Map([
          ['a/file1.js', 'hash1'],
          ['a/file2.js', 'hash2'],
          ['a/lib/file3.js', 'hash3'],
          ['common/config/some-config.json', 'hash5']
        ]),
        hasUncommittedChanges: false,
        lookupByPath: new LookupByPath([[project.projectRelativeFolder, project]]),
        projectMap: new Map()
      }
    };
  }

  function getTrivialSnapshot(): {
    project: IRushConfigurationProjectForSnapshot;
    input: InputsSnapshot;
  } {
    const { project, options } = getTestConfig();

    const input: InputsSnapshot = new InputsSnapshot(options);

    return { project, input };
  }

  describe(InputsSnapshot.prototype.getTrackedFileHashesForOperation.name, () => {
    it('Handles trivial input', () => {
      const { project, input } = getTrivialSnapshot();

      const result: ReadonlyMap<string, string> = input.getTrackedFileHashesForOperation(project);

      expect(result).toMatchSnapshot();
      expect(result.size).toEqual(3);
      expect(result.get('a/file1.js')).toEqual('hash1');
      expect(result.get('a/file2.js')).toEqual('hash2');
      expect(result.get('a/lib/file3.js')).toEqual('hash3');
    });

    it('Detects outputFileNames collisions', () => {
      const { project, options } = getTestConfig();

      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build',
              outputFolderNames: ['lib']
            }
          ]
        ])
      };

      options.projectMap = new Map([
        [
          project,
          {
            projectConfig: projectConfig as RushProjectConfiguration
          }
        ]
      ]);

      const input: InputsSnapshot = new InputsSnapshot(options);

      expect(() =>
        input.getTrackedFileHashesForOperation(project, '_phase:build')
      ).toThrowErrorMatchingSnapshot();
    });

    it('Respects additionalFilesByOperationName', () => {
      const { project, options } = getTestConfig();

      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build'
            }
          ]
        ])
      };

      const input: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig as RushProjectConfiguration,
              additionalFilesByOperationName: new Map([['_phase:build', new Set(['/ext/config.json'])]])
            }
          ]
        ])
      });

      const result: ReadonlyMap<string, string> = input.getTrackedFileHashesForOperation(
        project,
        '_phase:build'
      );

      expect(result).toMatchSnapshot();
      expect(result.size).toEqual(4);
      expect(result.get('a/file1.js')).toEqual('hash1');
      expect(result.get('a/file2.js')).toEqual('hash2');
      expect(result.get('a/lib/file3.js')).toEqual('hash3');
      expect(result.get('/ext/config.json')).toEqual('hash4');
    });

    it('Respects globalAdditionalFiles', () => {
      const { project, options } = getTestConfig();

      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build'
            }
          ]
        ])
      };

      const input: InputsSnapshot = new InputsSnapshot({
        ...options,
        globalAdditionalFiles: new Set(['common/config/some-config.json']),
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig as RushProjectConfiguration
            }
          ]
        ])
      });

      const result: ReadonlyMap<string, string> = input.getTrackedFileHashesForOperation(
        project,
        '_phase:build'
      );

      expect(result).toMatchSnapshot();
      expect(result.size).toEqual(4);
      expect(result.get('a/file1.js')).toEqual('hash1');
      expect(result.get('a/file2.js')).toEqual('hash2');
      expect(result.get('a/lib/file3.js')).toEqual('hash3');
      expect(result.get('common/config/some-config.json')).toEqual('hash5');
    });

    it('Respects incrementalBuildIgnoredGlobs', () => {
      const { project, options } = getTestConfig();

      const projectConfig: Pick<RushProjectConfiguration, 'incrementalBuildIgnoredGlobs'> = {
        incrementalBuildIgnoredGlobs: ['*2.js']
      };

      const input: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig as RushProjectConfiguration
            }
          ]
        ])
      });

      const result: ReadonlyMap<string, string> = input.getTrackedFileHashesForOperation(project);

      expect(result).toMatchSnapshot();
      expect(result.size).toEqual(2);
      expect(result.get('a/file1.js')).toEqual('hash1');
      expect(result.get('a/lib/file3.js')).toEqual('hash3');
    });
  });

  describe(InputsSnapshot.prototype.getOperationOwnStateHash.name, () => {
    it('Handles trivial input', () => {
      const { project, input } = getTrivialSnapshot();

      const result: string = input.getOperationOwnStateHash(project);

      expect(result).toMatchSnapshot();
    });

    it('Is invariant to input hash order', () => {
      const { project, options } = getTestConfig();

      const baseline: string = new InputsSnapshot(options).getOperationOwnStateHash(project);

      const input: InputsSnapshot = new InputsSnapshot({
        ...options,
        hashes: new Map(Array.from(options.hashes).reverse())
      });

      const result: string = input.getOperationOwnStateHash(project);

      expect(result).toEqual(baseline);
    });

    it('Detects outputFileNames collisions', () => {
      const { project, options } = getTestConfig();

      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build',
              outputFolderNames: ['lib']
            }
          ]
        ])
      };

      options.projectMap = new Map([
        [
          project,
          {
            projectConfig: projectConfig as RushProjectConfiguration
          }
        ]
      ]);

      const input: InputsSnapshot = new InputsSnapshot(options);

      expect(() => input.getOperationOwnStateHash(project, '_phase:build')).toThrowErrorMatchingSnapshot();
    });

    it('Changes if outputFileNames changes', () => {
      const { project, options } = getTestConfig();
      const baseline: string = new InputsSnapshot(options).getOperationOwnStateHash(project, '_phase:build');

      const projectConfig1: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build',
              outputFolderNames: ['lib-commonjs']
            }
          ]
        ])
      };

      const projectConfig2: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build',
              outputFolderNames: ['lib-esm']
            }
          ]
        ])
      };

      const input1: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig1 as RushProjectConfiguration
            }
          ]
        ])
      });

      const input2: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig2 as RushProjectConfiguration
            }
          ]
        ])
      });

      const result1: string = input1.getOperationOwnStateHash(project, '_phase:build');

      const result2: string = input2.getOperationOwnStateHash(project, '_phase:build');

      expect(result1).not.toEqual(baseline);
      expect(result2).not.toEqual(baseline);
      expect(result1).not.toEqual(result2);
    });

    it('Respects additionalOutputFilesByOperationName', () => {
      const { project, options } = getTestConfig();
      const baseline: string = new InputsSnapshot(options).getOperationOwnStateHash(project, '_phase:build');

      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build'
            }
          ]
        ])
      };

      const input: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig as RushProjectConfiguration,
              additionalFilesByOperationName: new Map([['_phase:build', new Set(['/ext/config.json'])]])
            }
          ]
        ])
      });

      const result: string = input.getOperationOwnStateHash(project, '_phase:build');

      expect(result).toMatchSnapshot();
      expect(result).not.toEqual(baseline);
    });

    it('Respects globalAdditionalFiles', () => {
      const { project, options } = getTestConfig();
      const baseline: string = new InputsSnapshot(options).getOperationOwnStateHash(project, '_phase:build');

      const input: InputsSnapshot = new InputsSnapshot({
        ...options,
        globalAdditionalFiles: new Set(['common/config/some-config.json'])
      });

      const result: string = input.getOperationOwnStateHash(project);

      expect(result).toMatchSnapshot();
      expect(result).not.toEqual(baseline);
    });

    it('Respects incrementalBuildIgnoredGlobs', () => {
      const { project, options } = getTestConfig();
      const baseline: string = new InputsSnapshot(options).getOperationOwnStateHash(project, '_phase:build');

      const projectConfig1: Pick<RushProjectConfiguration, 'incrementalBuildIgnoredGlobs'> = {
        incrementalBuildIgnoredGlobs: ['*2.js']
      };

      const input1: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig1 as RushProjectConfiguration
            }
          ]
        ])
      });

      const result1: string = input1.getOperationOwnStateHash(project);

      expect(result1).toMatchSnapshot();
      expect(result1).not.toEqual(baseline);

      const projectConfig2: Pick<RushProjectConfiguration, 'incrementalBuildIgnoredGlobs'> = {
        incrementalBuildIgnoredGlobs: ['*1.js']
      };

      const input2: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig2 as RushProjectConfiguration
            }
          ]
        ])
      });

      const result2: string = input2.getOperationOwnStateHash(project);

      expect(result2).toMatchSnapshot();
      expect(result2).not.toEqual(baseline);

      expect(result2).not.toEqual(result1);
    });

    it('Respects dependsOnNodeVersion', () => {
      const { project, options } = getTestConfig();
      const baseline: string = new InputsSnapshot(options).getOperationOwnStateHash(project, '_phase:build');

      const projectConfig1: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build',
              dependsOnNodeVersion: true
            }
          ]
        ])
      };

      const input1: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig1 as RushProjectConfiguration
            }
          ]
        ]),
        nodeVersion: 'v18.17.0'
      });

      const result1: string = input1.getOperationOwnStateHash(project, '_phase:build');

      expect(result1).toMatchSnapshot();
      expect(result1).not.toEqual(baseline);

      const input2: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig1 as RushProjectConfiguration
            }
          ]
        ]),
        nodeVersion: 'v20.10.0'
      });

      const result2: string = input2.getOperationOwnStateHash(project, '_phase:build');

      expect(result2).toMatchSnapshot();
      expect(result2).not.toEqual(baseline);
      expect(result2).not.toEqual(result1);
    });

    it('Respects dependsOnNodeVersion with major granularity', () => {
      const { project, options } = getTestConfig();

      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build',
              dependsOnNodeVersion: 'major'
            }
          ]
        ])
      };

      // Same major, different minor — should produce the same hash
      const input1: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v18.17.0'
      });

      const input2: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v18.20.3'
      });

      const result1: string = input1.getOperationOwnStateHash(project, '_phase:build');
      const result2: string = input2.getOperationOwnStateHash(project, '_phase:build');

      expect(result1).toEqual(result2);

      // Different major — should produce a different hash
      const input3: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v20.10.0'
      });

      const result3: string = input3.getOperationOwnStateHash(project, '_phase:build');

      expect(result3).not.toEqual(result1);
    });

    it('Respects dependsOnNodeVersion with minor granularity', () => {
      const { project, options } = getTestConfig();

      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build',
              dependsOnNodeVersion: 'minor'
            }
          ]
        ])
      };

      // Same major.minor, different patch — should produce the same hash
      const input1: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v18.17.0'
      });

      const input2: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v18.17.5'
      });

      const result1: string = input1.getOperationOwnStateHash(project, '_phase:build');
      const result2: string = input2.getOperationOwnStateHash(project, '_phase:build');

      expect(result1).toEqual(result2);

      // Different minor — should produce a different hash
      const input3: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v18.20.0'
      });

      const result3: string = input3.getOperationOwnStateHash(project, '_phase:build');

      expect(result3).not.toEqual(result1);
    });

    it('Respects dependsOnNodeVersion with patch granularity', () => {
      const { project, options } = getTestConfig();

      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build',
              dependsOnNodeVersion: 'patch'
            }
          ]
        ])
      };

      // true and 'patch' should produce identical hashes
      const projectConfigTrue: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build',
              dependsOnNodeVersion: true
            }
          ]
        ])
      };

      const inputPatch: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v18.17.1'
      });

      const inputTrue: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfigTrue as RushProjectConfiguration }]]),
        nodeVersion: 'v18.17.1'
      });

      const resultPatch: string = inputPatch.getOperationOwnStateHash(project, '_phase:build');
      const resultTrue: string = inputTrue.getOperationOwnStateHash(project, '_phase:build');

      expect(resultPatch).toEqual(resultTrue);

      // Different patch — should produce a different hash
      const input2: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v18.17.2'
      });

      const result2: string = input2.getOperationOwnStateHash(project, '_phase:build');

      expect(result2).not.toEqual(resultPatch);
    });

    it('Does not include node version when dependsOnNodeVersion is not set', () => {
      const { project, options } = getTestConfig();

      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build'
            }
          ]
        ])
      };

      const input1: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig as RushProjectConfiguration
            }
          ]
        ]),
        nodeVersion: 'v18.17.0'
      });

      const input2: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig as RushProjectConfiguration
            }
          ]
        ]),
        nodeVersion: 'v20.10.0'
      });

      const result1: string = input1.getOperationOwnStateHash(project, '_phase:build');
      const result2: string = input2.getOperationOwnStateHash(project, '_phase:build');

      expect(result1).toEqual(result2);
    });

    it('Respects dependsOnEnvVars', () => {
      const { project, options } = getTestConfig();
      const baseline: string = new InputsSnapshot(options).getOperationOwnStateHash(project, '_phase:build');

      const projectConfig1: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            {
              operationName: '_phase:build',
              dependsOnEnvVars: ['ENV_VAR']
            }
          ]
        ])
      };

      const input1: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig1 as RushProjectConfiguration
            }
          ]
        ]),
        environment: {}
      });

      const result1: string = input1.getOperationOwnStateHash(project, '_phase:build');

      expect(result1).toMatchSnapshot();
      expect(result1).not.toEqual(baseline);

      const input2: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig1 as RushProjectConfiguration
            }
          ]
        ]),
        environment: { ENV_VAR: 'some_value' }
      });

      const result2: string = input2.getOperationOwnStateHash(project, '_phase:build');

      expect(result2).toMatchSnapshot();
      expect(result2).not.toEqual(baseline);
      expect(result2).not.toEqual(result1);
    });
  });
});
