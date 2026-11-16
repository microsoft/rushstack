// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { LookupByPath } from '@rushstack/lookup-by-path';

import type { RushProjectConfiguration } from '../../../api/RushProjectConfiguration';
import { RushConstants } from '../../RushConstants';
import {
  InputsSnapshot,
  type IInputsSnapshotParameters,
  type IInputsSnapshotProjectMetadata,
  type InputSnapshotPolicy,
  type IRushConfigurationProjectForSnapshot
} from '../InputsSnapshot';

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

  function getStrictHash(
    input: InputsSnapshot,
    project: IRushConfigurationProjectForSnapshot,
    environment?: Record<string, string | undefined>
  ): string {
    return input.getOperationOwnStateHash(project, '_phase:build', environment, 'strict-v1');
  }

  it('Exposes the time at which it began reading the working tree', () => {
    const { options } = getTestConfig();
    expect(new InputsSnapshot(options).workingTreeReadStartTimeMs).toBeUndefined();
    expect(
      new InputsSnapshot({ ...options, workingTreeReadStartTimeMs: 1234 }).workingTreeReadStartTimeMs
    ).toBe(1234);
  });

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

    it('Fails each time for an operation whose input files cannot be listed', () => {
      const { project, options } = getTestConfig();

      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          ['_phase:build', { operationName: '_phase:build', outputFolderNames: ['lib'] }]
        ])
      };

      const input: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([
          [
            project,
            {
              projectConfig: projectConfig as RushProjectConfiguration,
              additionalFilesByOperationName: new Map([['_phase:test', new Set(['/ext/missing.json'])]])
            }
          ]
        ])
      });

      for (let i: number = 0; i < 2; i++) {
        expect(() => input.getTrackedFileHashesForOperation(project, '_phase:build')).toThrow(
          'contains tracked input file "a/lib/file3.js"'
        );
        expect(() => input.getOperationOwnStateHash(project, '_phase:build')).toThrow(
          'contains tracked input file "a/lib/file3.js"'
        );
        expect(() => input.getTrackedFileHashesForOperation(project, '_phase:test')).toThrow(
          'Could not find hash for file path "/ext/missing.json"'
        );
      }
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

    function getOutputSnapshot(
      inputKind: 'tracked' | 'additional',
      filePath: string
    ): ReturnType<typeof getTrivialSnapshot> {
      const { project, options } = getTestConfig();
      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          ['_phase:build', { operationName: '_phase:build', outputFolderNames: ['lib'] }]
        ])
      };
      return {
        project,
        input: new InputsSnapshot({
          ...options,
          hashes: new Map([
            ['a/source.js', 'source-hash'],
            ...(inputKind === 'tracked' ? [[filePath, 'uncovered-hash'] as const] : [])
          ]),
          additionalHashes: new Map([[filePath, 'uncovered-hash']]),
          projectMap: new Map([
            [
              project,
              {
                projectConfig: projectConfig as RushProjectConfiguration,
                additionalFilesByOperationName:
                  inputKind === 'additional' ? new Map([['_phase:build', new Set([filePath])]]) : undefined
              }
            ]
          ])
        })
      };
    }

    it.each([
      ['tracked', 'a/lib/uncovered.js'],
      ['additional', 'a/lib/uncovered.js'],
      ['additional', 'a/lib/../lib/uncovered.js'],
      ['additional', path.resolve('/root/a/lib/uncovered.js')]
    ] as const)('Rejects %s uncovered output inputs before operation hashing: %s', (inputKind, filePath) => {
      const { project, input } = getOutputSnapshot(inputKind, filePath);
      // Repeated failures must not expose a partially validated input map or cached operation hash.
      for (let attempt: number = 0; attempt < 2; attempt++) {
        expect(() => getStrictHash(input, project)).toThrow(`contains ${inputKind} input file "${filePath}"`);
        expect(() => input.getTrackedFileHashesForOperation(project, '_phase:build', 'strict-v1')).toThrow(
          'output to a disjoint folder'
        );
      }
    });

    it.each(['win32', 'linux'])('Uses %s path casing for output input validation', (platform) => {
      const descriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
      try {
        for (const [inputKind, filePath] of [
          ['tracked', 'a/LIB/UNCOVERED.js'],
          ['additional', 'A/LIB/UNCOVERED.js'],
          ['additional', path.resolve('/root/A/LIB/UNCOVERED.js')]
        ] as const) {
          const { project, input } = getOutputSnapshot(inputKind, filePath);
          if (platform === 'win32') {
            expect(() => getStrictHash(input, project)).toThrow(
              `contains ${inputKind} input file "${filePath}"`
            );
          } else {
            expect(
              input.getTrackedFileHashesForOperation(project, '_phase:build', 'strict-v1').get(filePath)
            ).toBe('uncovered-hash');
          }
        }
      } finally {
        Object.defineProperty(process, 'platform', descriptor);
      }
    });

    it.each([
      'a/lib-sources/uncovered.js',
      path.resolve('/root/a/lib-sources/uncovered.js'),
      path.resolve('/ext/config.json')
    ])('Preserves valid additional input keys and hashes outside output folders: %s', (filePath) => {
      const { project, input } = getOutputSnapshot('additional', filePath);
      const hashes: ReadonlyMap<string, string> = input.getTrackedFileHashesForOperation(
        project,
        '_phase:build',
        'strict-v1'
      );
      expect([...hashes]).toEqual([
        [filePath, 'uncovered-hash'],
        ['a/source.js', 'source-hash']
      ]);
      expect(input.getTrackedFileHashesForOperation(project, '_phase:build', 'strict-v1')).toBe(hashes);
      expect(() => getStrictHash(input, project)).not.toThrow();
    });

    it.each([false, true])(
      'keeps strict validation separate from legacy queries (strict first: %s)',
      (strictFirst) => {
        const { project, input } = getOutputSnapshot('additional', 'a/lib/uncovered.js');
        const strictQuery = (): string => getStrictHash(input, project);
        if (strictFirst) {
          expect(strictQuery).toThrow('contains additional input file');
        }
        const legacyHash: string = input.getOperationOwnStateHash(project, '_phase:build');
        expect(
          input.getTrackedFileHashesForOperation(project, '_phase:build').get('a/lib/uncovered.js')
        ).toBe('uncovered-hash');
        expect(strictQuery).toThrow('contains additional input file');
        expect(input.getOperationOwnStateHash(project, '_phase:build')).toBe(legacyHash);
      }
    );

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
        nodeVersion: 'v20.10.0'
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
        nodeVersion: 'v22.12.0'
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

      // Same major, different minor - should produce the same hash
      const input1: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v20.10.0'
      });

      const input2: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v20.18.3'
      });

      const result1: string = input1.getOperationOwnStateHash(project, '_phase:build');
      const result2: string = input2.getOperationOwnStateHash(project, '_phase:build');

      expect(result1).toEqual(result2);

      // Different major - should produce a different hash
      const input3: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v22.12.0'
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

      // Same major.minor, different patch - should produce the same hash
      const input1: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v20.10.0'
      });

      const input2: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v20.10.5'
      });

      const result1: string = input1.getOperationOwnStateHash(project, '_phase:build');
      const result2: string = input2.getOperationOwnStateHash(project, '_phase:build');

      expect(result1).toEqual(result2);

      // Different minor - should produce a different hash
      const input3: InputsSnapshot = new InputsSnapshot({
        ...options,
        projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
        nodeVersion: 'v20.18.0'
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

      // Different patch - should produce a different hash
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
        nodeVersion: 'v20.10.0'
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
        nodeVersion: 'v22.12.0'
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

    it("Hashes dependsOnEnvVars from an operation's own environment when one is supplied", () => {
      const { project, options } = getTestConfig();
      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          ['_phase:build', { operationName: '_phase:build', dependsOnEnvVars: ['ENV_VAR'] }]
        ])
      };
      const createSnapshot = (environment: Record<string, string>): InputsSnapshot =>
        new InputsSnapshot({
          ...options,
          projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]]),
          environment
        });
      const snapshotA: InputsSnapshot = createSnapshot({ ENV_VAR: 'a', OTHER: 'a' });
      const snapshotB: InputsSnapshot = createSnapshot({ ENV_VAR: 'b' });
      const hashA: string = createSnapshot({ ENV_VAR: 'a' }).getOperationOwnStateHash(
        project,
        '_phase:build'
      );
      const hashB: string = snapshotB.getOperationOwnStateHash(project, '_phase:build');
      expect(hashB).not.toEqual(hashA);

      // An operation that runs with another environment gets the hash of a snapshot of that environment,
      // whether or not the snapshot's own hash was already computed.
      expect(snapshotA.getOperationOwnStateHash(project, '_phase:build', { ENV_VAR: 'b' })).toEqual(hashB);
      expect(snapshotA.getOperationOwnStateHash(project, '_phase:build')).toEqual(hashA);
      expect(snapshotA.getOperationOwnStateHash(project, '_phase:build', { ENV_VAR: 'b' })).toEqual(hashB);
      // Variables that the operation does not depend on never change its hash.
      expect(
        snapshotA.getOperationOwnStateHash(project, '_phase:build', { ENV_VAR: 'a', OTHER: 'b' })
      ).toEqual(hashA);
      expect(snapshotA.getOperationOwnStateHash(project, undefined, { ENV_VAR: 'b' })).toEqual(
        snapshotB.getOperationOwnStateHash(project, undefined)
      );
    });
  });

  describe('environment identity', () => {
    function createSnapshot(
      environment: Record<string, string | undefined>,
      names: string[] = ['ENV_VAR']
    ): ReturnType<typeof getTrivialSnapshot> {
      const { project, options } = getTestConfig();
      const projectConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([
          ['_phase:build', { operationName: '_phase:build', dependsOnEnvVars: names }]
        ])
      };
      return {
        project,
        input: new InputsSnapshot({
          ...options,
          environment,
          projectMap: new Map([[project, { projectConfig: projectConfig as RushProjectConfiguration }]])
        })
      };
    }

    describe.each([false, true])('with an explicit operation environment: %s', (useOperationEnvironment) => {
      function getHash(environment: Record<string, string | undefined>, names?: string[]): string {
        const { project, input } = createSnapshot(
          useOperationEnvironment ? { ENV_VAR: 'snapshot' } : environment,
          names
        );
        return getStrictHash(input, project, useOperationEnvironment ? environment : undefined);
      }

      it('distinguishes absence, empty values and literal sentinel strings', () => {
        const values: Array<string | undefined> = [undefined, '', 'undefined', 'null', 'value'];
        expect(new Set(values.map((value) => getHash({ ENV_VAR: value }))).size).toBe(values.length);
        expect(getHash({})).toBe(getHash({ ENV_VAR: undefined }));
      });

      it.each(['win32', 'linux'])('uses %s environment-name semantics', (platform) => {
        const descriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
        Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
        try {
          const upper: string = getHash({ ENV_VAR: 'first' });
          const lower: string = getHash({ env_var: 'first' });
          const changed: string = getHash({ env_var: 'second' });
          if (platform === 'win32') {
            expect(lower).toBe(upper);
            expect(changed).not.toBe(lower);
          } else {
            expect(lower).toBe(getHash({}));
            expect(changed).toBe(lower);
            expect(lower).not.toBe(upper);
          }
        } finally {
          Object.defineProperty(process, 'platform', descriptor);
        }
      });

      it('does not include undeclared environment inputs', () => {
        expect(getHash({ ENV_VAR: 'same', OTHER: 'first' })).toBe(
          getHash({ ENV_VAR: 'same', OTHER: 'second' })
        );
      });

      it('does not confuse embedded separators with another declared variable', () => {
        const delimiter: string = RushConstants.hashDelimiter;
        expect(getHash({ A: `a${delimiter}$B=b`, B: 'c' }, ['A', 'B'])).not.toBe(
          getHash({ A: 'a', B: `b${delimiter}$B=c` }, ['A', 'B'])
        );
      });
    });

    it('captures supplied values before the first hash query', () => {
      const environment: Record<string, string | undefined> = { ENV_VAR: 'captured' };
      const { project, input } = createSnapshot(environment);
      const { project: baselineProject, input: baseline } = createSnapshot({ ...environment });
      environment.ENV_VAR = 'changed';
      expect(getStrictHash(input, project)).toBe(getStrictHash(baseline, baselineProject));
      expect(getStrictHash(input, project, environment)).not.toBe(getStrictHash(input, project));
      expect(input.getOperationOwnStateHash(project, '_phase:build')).toBe(
        input.getOperationOwnStateHash(project, '_phase:build', environment)
      );
      expect(input.getOperationOwnStateHash(project, '_phase:build')).not.toBe(
        baseline.getOperationOwnStateHash(baselineProject, '_phase:build')
      );
    });

    it.each(['win32', 'linux'])('preserves raw legacy environment identity on %s', (platform) => {
      const descriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
      try {
        const getLegacyHash = (environment: Record<string, string | undefined>): string => {
          const { input, project } = createSnapshot(environment);
          const hash: string = input.getOperationOwnStateHash(project, '_phase:build');
          expect(input.getOperationOwnStateHash(project, '_phase:build', { ENV_VAR: undefined })).toBe(hash);
          return hash;
        };
        expect(getLegacyHash({})).toBe(getLegacyHash({ ENV_VAR: '' }));
        expect(getLegacyHash({ env_var: 'nonempty' })).toBe(getLegacyHash({}));
      } finally {
        Object.defineProperty(process, 'platform', descriptor);
      }
    });

    it.each([false, true])(
      'partitions identities with no declared environment (strict first: %s)',
      (strictFirst) => {
        const { project, input } = createSnapshot({}, []);
        if (strictFirst) {
          getStrictHash(input, project);
        }
        const legacy: string = input.getOperationOwnStateHash(project, '_phase:build');
        const strict: string = getStrictHash(input, project);
        expect(strict).not.toBe(legacy);
        expect(input.getOperationOwnStateHash(project, '_phase:build')).toBe(legacy);
        expect(getStrictHash(input, project)).toBe(strict);
      }
    );

    it.each([undefined, ''])(
      'does not reuse or overwrite the snapshot hash for a different operation value (snapshot: %s)',
      (snapshotValue) => {
        const { project, input } = createSnapshot({ ENV_VAR: snapshotValue });
        const operationEnvironment: Record<string, string | undefined> = {
          ENV_VAR: snapshotValue === undefined ? '' : undefined
        };
        const { project: operationProject, input: operationSnapshot } = createSnapshot(operationEnvironment);
        const operationHash: string = getStrictHash(operationSnapshot, operationProject);
        expect(getStrictHash(input, project, operationEnvironment)).toBe(operationHash);
        const snapshotHash: string = getStrictHash(input, project);
        expect(snapshotHash).not.toBe(operationHash);
        expect(getStrictHash(input, project, operationEnvironment)).toBe(operationHash);
        operationEnvironment.ENV_VAR = snapshotValue;
        expect(getStrictHash(input, project, operationEnvironment)).toBe(snapshotHash);
        expect(getStrictHash(input, project)).toBe(snapshotHash);
      }
    );
  });

  describe('previousSnapshot', () => {
    const operationNames: (string | undefined)[] = [undefined, '_phase:build', '_phase:test'];

    interface IDerivationTestConfig {
      projects: IRushConfigurationProjectForSnapshot[];
      a: IRushConfigurationProjectForSnapshot;
      b: IRushConfigurationProjectForSnapshot;
      c: IRushConfigurationProjectForSnapshot;
      bAdditionalFiles: Set<string>;
      options: IInputsSnapshotParameters;
    }

    function getDerivationTestConfig(): IDerivationTestConfig {
      const a: IRushConfigurationProjectForSnapshot = {
        projectFolder: '/root/a',
        projectRelativeFolder: 'a'
      };
      const b: IRushConfigurationProjectForSnapshot = {
        projectFolder: '/root/b',
        projectRelativeFolder: 'b'
      };
      // A project that has no metadata, which has state only while it has files
      const c: IRushConfigurationProjectForSnapshot = {
        projectFolder: '/root/c',
        projectRelativeFolder: 'c'
      };
      // A project that has metadata but no files
      const d: IRushConfigurationProjectForSnapshot = {
        projectFolder: '/root/d',
        projectRelativeFolder: 'd'
      };

      const aConfig: Pick<
        RushProjectConfiguration,
        'incrementalBuildIgnoredGlobs' | 'operationSettingsByOperationName'
      > = {
        incrementalBuildIgnoredGlobs: ['*.md'],
        operationSettingsByOperationName: new Map([
          [
            '_phase:build',
            { operationName: '_phase:build', dependsOnEnvVars: ['FOO'], outputFolderNames: ['lib'] }
          ],
          ['_phase:test', { operationName: '_phase:test', dependsOnNodeVersion: 'major' }]
        ])
      };
      const bConfig: Pick<RushProjectConfiguration, 'operationSettingsByOperationName'> = {
        operationSettingsByOperationName: new Map([['_phase:build', { operationName: '_phase:build' }]])
      };
      const bAdditionalFiles: Set<string> = new Set(['common/shared.json', '/ext/tool.json']);

      return {
        projects: [a, b, c, d],
        a,
        b,
        c,
        bAdditionalFiles,
        options: {
          rootDir: '/root',
          additionalHashes: new Map([['/ext/tool.json', 'ext1']]),
          environment: { FOO: '1' },
          globalAdditionalFiles: ['common/config/global.json'],
          hashes: new Map([
            ['a/README.md', 'a0'],
            ['a/src/x.ts', 'a1'],
            ['a/src/y.ts', 'a2'],
            ['b/index.ts', 'b1'],
            ['c/file.ts', 'c1'],
            ['common/config/global.json', 'g1'],
            ['common/other.txt', 'o1'],
            ['common/shared.json', 's1']
          ]),
          hasUncommittedChanges: false,
          lookupByPath: new LookupByPath(
            [a, b, c, d].map((project) => [project.projectRelativeFolder, project])
          ),
          nodeVersion: 'v22.1.0',
          projectMap: new Map<IRushConfigurationProjectForSnapshot, IInputsSnapshotProjectMetadata>([
            [a, { projectConfig: aConfig as RushProjectConfiguration }],
            [
              b,
              {
                projectConfig: bConfig as RushProjectConfiguration,
                additionalFilesByOperationName: new Map([['_phase:build', bAdditionalFiles]])
              }
            ],
            [d, {}]
          ])
        }
      };
    }

    function queryAll(
      snapshot: InputsSnapshot,
      projects: IRushConfigurationProjectForSnapshot[],
      policy: InputSnapshotPolicy = 'legacy'
    ): string[] {
      const results: string[] = [];
      for (const project of projects) {
        for (const operationName of operationNames) {
          try {
            const tracked: [string, string][] = Array.from(
              snapshot.getTrackedFileHashesForOperation(project, operationName, policy)
            );
            const hash: string = snapshot.getOperationOwnStateHash(project, operationName, undefined, policy);
            const hashInOtherEnvironment: string = snapshot.getOperationOwnStateHash(
              project,
              operationName,
              {
                FOO: 'other'
              },
              policy
            );
            results.push(JSON.stringify({ tracked, hash, hashInOtherEnvironment }));
          } catch (error) {
            results.push(`error: ${error.message}`);
          }
        }
      }

      return results;
    }

    function expectSameAsNewSnapshot(
      derived: InputsSnapshot,
      options: IInputsSnapshotParameters,
      projects: IRushConfigurationProjectForSnapshot[],
      policy: InputSnapshotPolicy = 'legacy'
    ): void {
      const created: InputsSnapshot = new InputsSnapshot({ ...options, previousSnapshot: undefined });
      expect(queryAll(derived, projects, policy)).toEqual(queryAll(created, projects, policy));
      expect(derived.hashes).toBe(options.hashes);
      expect(derived.hasUncommittedChanges).toBe(options.hasUncommittedChanges);
      expect(derived.workingTreeReadStartTimeMs).toBe(options.workingTreeReadStartTimeMs);
    }

    it.each([false, true])(
      'reuses raw legacy and captured strict state independently (strict first: %s)',
      (strictFirst) => {
        const { options, a } = getDerivationTestConfig();
        const environment: Record<string, string | undefined> = { FOO: 'old' };
        const previousSnapshot: InputsSnapshot = new InputsSnapshot({ ...options, environment });
        if (strictFirst) {
          getStrictHash(previousSnapshot, a);
        }
        const legacy: string = previousSnapshot.getOperationOwnStateHash(a, '_phase:build');
        const strict: string = getStrictHash(previousSnapshot, a);
        environment.FOO = 'new';
        const next: InputsSnapshot = new InputsSnapshot({ ...options, environment, previousSnapshot });
        const fresh: InputsSnapshot = new InputsSnapshot({ ...options, environment });
        expect(next.getOperationOwnStateHash(a, '_phase:build')).toBe(legacy);
        expect(fresh.getOperationOwnStateHash(a, '_phase:build')).not.toBe(legacy);
        expect(getStrictHash(next, a)).not.toBe(strict);
        expect(getStrictHash(next, a)).toBe(getStrictHash(fresh, a));
        expect(getStrictHash(previousSnapshot, a)).toBe(strict);
      }
    );

    it.each(['legacy', 'strict-v1'] as const)('reuses only validated %s maps across snapshots', (policy) => {
      const { options, a, b, projects } = getDerivationTestConfig();
      const previousSnapshot: InputsSnapshot = new InputsSnapshot(options);
      queryAll(previousSnapshot, projects, policy);
      const hashes: Map<string, string> = new Map(options.hashes);
      hashes.set('a/src/x.ts', 'changed');
      const nextOptions: IInputsSnapshotParameters = { ...options, hashes, previousSnapshot };
      const next: InputsSnapshot = new InputsSnapshot(nextOptions);
      expect(next.getTrackedFileHashesForOperation(b, '_phase:build', policy)).toBe(
        previousSnapshot.getTrackedFileHashesForOperation(b, '_phase:build', policy)
      );
      expect(next.getTrackedFileHashesForOperation(a, '_phase:build', policy)).not.toBe(
        previousSnapshot.getTrackedFileHashesForOperation(a, '_phase:build', policy)
      );
      expectSameAsNewSnapshot(next, nextOptions, projects, policy);
    });

    it('Reuses the state of each project whose inputs did not change', () => {
      const { projects, a, b, options } = getDerivationTestConfig();
      const previousSnapshot: InputsSnapshot = new InputsSnapshot(options);
      queryAll(previousSnapshot, projects);

      const hashes: Map<string, string> = new Map(options.hashes);
      hashes.set('a/src/x.ts', 'a1-changed');
      const derivedOptions: IInputsSnapshotParameters = {
        ...options,
        hashes,
        hasUncommittedChanges: true,
        workingTreeReadStartTimeMs: 1234,
        previousSnapshot
      };
      const derived: InputsSnapshot = new InputsSnapshot(derivedOptions);

      expect(derived.getTrackedFileHashesForOperation(b, '_phase:build')).toBe(
        previousSnapshot.getTrackedFileHashesForOperation(b, '_phase:build')
      );
      expect(derived.getTrackedFileHashesForOperation(a, '_phase:build')).not.toBe(
        previousSnapshot.getTrackedFileHashesForOperation(a, '_phase:build')
      );
      expect(derived.getOperationOwnStateHash(a, '_phase:build')).not.toEqual(
        previousSnapshot.getOperationOwnStateHash(a, '_phase:build')
      );
      expectSameAsNewSnapshot(derived, derivedOptions, projects);
    });

    it('Computes the state of a project again when its files are added, changed or removed', () => {
      const { projects, a, options } = getDerivationTestConfig();
      const previousSnapshot: InputsSnapshot = new InputsSnapshot(options);
      queryAll(previousSnapshot, projects);

      const hashes: Map<string, string> = new Map(options.hashes);
      // Sorts before the other files of the project
      hashes.set('a/.eslintrc.js', 'a3');
      hashes.delete('a/src/y.ts');
      hashes.set('c/file.ts', 'c1-changed');
      hashes.set('common/other.txt', 'o1-changed');
      const derivedOptions: IInputsSnapshotParameters = { ...options, hashes, previousSnapshot };
      const derived: InputsSnapshot = new InputsSnapshot(derivedOptions);

      expect(Array.from(derived.getTrackedFileHashesForOperation(a).keys())).toEqual([
        'a/.eslintrc.js',
        'a/src/x.ts',
        'common/config/global.json'
      ]);
      expectSameAsNewSnapshot(derived, derivedOptions, projects);
    });

    it('Computes the state of a project again when one of its additional files changes', () => {
      const { projects, b, options } = getDerivationTestConfig();
      for (const [file, hashes, additionalHashes] of [
        [
          'common/shared.json',
          new Map([...options.hashes, ['common/shared.json', 's2']]),
          options.additionalHashes
        ],
        ['/ext/tool.json', options.hashes, new Map([['/ext/tool.json', 'ext2']])]
      ] as const) {
        const previousSnapshot: InputsSnapshot = new InputsSnapshot(options);
        queryAll(previousSnapshot, projects);

        const derivedOptions: IInputsSnapshotParameters = {
          ...options,
          hashes,
          additionalHashes,
          previousSnapshot
        };
        const derived: InputsSnapshot = new InputsSnapshot(derivedOptions);

        expect(derived.getTrackedFileHashesForOperation(b, '_phase:build').get(file)).not.toEqual(
          previousSnapshot.getTrackedFileHashesForOperation(b, '_phase:build').get(file)
        );
        expectSameAsNewSnapshot(derived, derivedOptions, projects);
      }
    });

    it('Removes the state of a project that has no metadata when it no longer has files', () => {
      const { projects, c, options } = getDerivationTestConfig();
      const previousSnapshot: InputsSnapshot = new InputsSnapshot(options);
      queryAll(previousSnapshot, projects);

      const hashes: Map<string, string> = new Map(options.hashes);
      hashes.delete('c/file.ts');
      const derivedOptions: IInputsSnapshotParameters = { ...options, hashes, previousSnapshot };
      const derived: InputsSnapshot = new InputsSnapshot(derivedOptions);

      expect(() => derived.getTrackedFileHashesForOperation(c)).toThrow('No information available');
      expectSameAsNewSnapshot(derived, derivedOptions, projects);

      // And creates it again when a file is added back
      const restoredOptions: IInputsSnapshotParameters = {
        ...options,
        previousSnapshot: derived
      };
      expectSameAsNewSnapshot(new InputsSnapshot(restoredOptions), restoredOptions, projects);
    });

    it('Creates the state of every project again when any other input changes', () => {
      const { projects, b, bAdditionalFiles, options } = getDerivationTestConfig();
      const hashes: Map<string, string> = new Map(options.hashes);
      hashes.set('a/src/x.ts', 'a1-changed');
      const changes: [string, () => Partial<IInputsSnapshotParameters>][] = [
        ['environment', () => ({ environment: { FOO: '2' } })],
        ['an environment variable that no operation hashes', () => ({ environment: { FOO: '1', BAR: '' } })],
        ['node version', () => ({ nodeVersion: 'v23.0.0' })],
        [
          'global additional file',
          () => ({ hashes: new Map([...hashes, ['common/config/global.json', 'g2']]) })
        ],
        ['global additional files', () => ({ globalAdditionalFiles: [] })],
        ['root directory', () => ({ rootDir: '/root/' })],
        ['lookup', () => ({ lookupByPath: new LookupByPath(Array.from(options.lookupByPath.entries())) })],
        ['project map', () => ({ projectMap: new Map(options.projectMap) })],
        [
          'additional files of an operation',
          () => {
            bAdditionalFiles.add('common/other.txt');
            return {};
          }
        ]
      ];

      for (const [name, getChange] of changes) {
        const previousSnapshot: InputsSnapshot = new InputsSnapshot(options);
        queryAll(previousSnapshot, projects);

        const derivedOptions: IInputsSnapshotParameters = {
          ...options,
          hashes,
          ...getChange(),
          previousSnapshot
        };
        const derived: InputsSnapshot = new InputsSnapshot(derivedOptions);

        const reusedState: boolean =
          derived.getTrackedFileHashesForOperation(b, '_phase:build') ===
          previousSnapshot.getTrackedFileHashesForOperation(b, '_phase:build');
        expect({ name, reusedState }).toEqual({ name, reusedState: false });
        expectSameAsNewSnapshot(derived, derivedOptions, projects);
      }
    });

    it.each([false, true])(
      'does not reuse stale environment state after caller mutation (previous hash computed: %s)',
      (computePreviousHash) => {
        const { projects, a, options } = getDerivationTestConfig();
        const environment: Record<string, string | undefined> = { FOO: 'captured' };
        options.environment = environment;
        const previousSnapshot: InputsSnapshot = new InputsSnapshot(options);
        const baselineHash: string = getStrictHash(new InputsSnapshot(options), a);
        if (computePreviousHash) {
          expect(getStrictHash(previousSnapshot, a)).toBe(baselineHash);
        }

        environment.FOO = 'changed';
        const derivedOptions: IInputsSnapshotParameters = { ...options, previousSnapshot };
        const derived: InputsSnapshot = new InputsSnapshot(derivedOptions);
        expect(getStrictHash(derived, a)).not.toBe(baselineHash);
        expect(getStrictHash(previousSnapshot, a)).toBe(baselineHash);
        expectSameAsNewSnapshot(derived, derivedOptions, projects, 'strict-v1');
      }
    );

    it.each([undefined, ''])('distinguishes absent and empty environments during reuse: %s', (value) => {
      const { projects, a, options } = getDerivationTestConfig();
      options.environment = { FOO: value };
      const previousSnapshot: InputsSnapshot = new InputsSnapshot(options);
      const baselineHash: string = getStrictHash(previousSnapshot, a);
      const derivedOptions: IInputsSnapshotParameters = {
        ...options,
        environment: { FOO: value === undefined ? '' : undefined },
        previousSnapshot
      };
      const derived: InputsSnapshot = new InputsSnapshot(derivedOptions);
      expect(getStrictHash(derived, a)).not.toBe(baselineHash);
      expectSameAsNewSnapshot(derived, derivedOptions, projects, 'strict-v1');
    });

    it.each(['win32', 'linux'])('uses %s environment-name semantics during reuse', (platform) => {
      const descriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
      try {
        const { projects, a, options } = getDerivationTestConfig();
        const previousSnapshot: InputsSnapshot = new InputsSnapshot(options);
        const previousFiles: ReadonlyMap<string, string> = previousSnapshot.getTrackedFileHashesForOperation(
          a,
          '_phase:build',
          'strict-v1'
        );
        queryAll(previousSnapshot, projects, 'strict-v1');

        const derivedOptions: IInputsSnapshotParameters = {
          ...options,
          environment: { foo: '1' },
          previousSnapshot
        };
        const derived: InputsSnapshot = new InputsSnapshot(derivedOptions);
        expect(
          derived.getTrackedFileHashesForOperation(a, '_phase:build', 'strict-v1') === previousFiles
        ).toBe(platform === 'win32');
        expectSameAsNewSnapshot(derived, derivedOptions, projects, 'strict-v1');

        const changedOptions: IInputsSnapshotParameters = {
          ...derivedOptions,
          environment: { foo: '2' }
        };
        expectSameAsNewSnapshot(new InputsSnapshot(changedOptions), changedOptions, projects, 'strict-v1');
      } finally {
        Object.defineProperty(process, 'platform', descriptor);
      }
    });

    it('Computes the same state as a new snapshot after any sequence of changes', () => {
      const { projects, bAdditionalFiles, options } = getDerivationTestConfig();
      const files: string[] = [
        'a/README.md',
        'a/src/x.ts',
        'a/src/y.ts',
        'a/src/z.ts',
        'a/b.ts',
        'a/lib/output.js',
        'a/libs/input.ts',
        'aa/file.ts',
        'b/index.ts',
        'b/util.ts',
        'c/file.ts',
        'c/other.ts',
        'd/new.ts',
        'common/other.txt',
        'common/shared.json',
        'common/zzz.txt'
      ];
      const random: () => number = createRandom(42);
      const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

      let hashes: Map<string, string> = new Map(options.hashes);
      let additionalHashes: ReadonlyMap<string, string> | undefined = options.additionalHashes;
      let previousSnapshot: InputsSnapshot = new InputsSnapshot(options);
      for (let i: number = 0; i < 300; i++) {
        // Query some operations of the previous snapshot, as a host does before it takes the next one
        for (const project of projects) {
          for (const operationName of operationNames) {
            if (random() < 0.5) {
              try {
                previousSnapshot.getOperationOwnStateHash(project, operationName);
              } catch {
                // Compared below
              }
            }
          }
        }

        hashes = new Map(hashes);
        const changeCount: number = Math.floor(random() * 4);
        for (let j: number = 0; j < changeCount; j++) {
          const file: string = pick(files);
          if (hashes.has(file) && random() < 0.4) {
            hashes.delete(file);
          } else {
            hashes.set(file, `${pick(['h1', 'h2', 'h3'])}`);
          }
        }

        if (random() < 0.2) {
          additionalHashes = new Map([['/ext/tool.json', pick(['ext1', 'ext2'])]]);
        }

        if (random() < 0.03) {
          bAdditionalFiles.add(pick(files));
        }

        const derivedOptions: IInputsSnapshotParameters = {
          ...options,
          additionalHashes,
          // Sometimes list the files out of order
          hashes: random() < 0.2 ? new Map(Array.from(hashes).reverse()) : hashes,
          previousSnapshot
        };
        const derived: InputsSnapshot = new InputsSnapshot(derivedOptions);
        expectSameAsNewSnapshot(derived, derivedOptions, projects);
        previousSnapshot = derived;
      }
    });
  });
});

function createRandom(seed: number): () => number {
  // A Park-Miller generator, so that a failure can be reproduced
  let state: number = seed;
  return (): number => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}
