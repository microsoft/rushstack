// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { JsonFile } from '@rushstack/node-core-library';

describe('Heft action-wide sharding mode', () => {
  const project: string = path.join(__dirname, 'sharding-mode-fixture');
  let created: boolean;

  beforeEach(() => {
    created = false;
    fs.mkdirSync(project);
    created = true;
    fs.mkdirSync(path.join(project, 'config'));
    JsonFile.save({ name: 'sharding-mode-fixture', version: '1.0.0' }, path.join(project, 'package.json'));
    JsonFile.save(
      {
        lifecyclePlugins: [{ pluginName: 'lifecycle', entryPoint: '../fixtures/ShardingLifecyclePlugin.js' }],
        taskPlugins: [{ pluginName: 'task', entryPoint: '../fixtures/ShardingTaskPlugin.js' }]
      },
      path.join(project, 'heft-plugin.json')
    );
    JsonFile.save(
      {
        heftPlugins: [{ pluginPackage: 'sharding-mode-fixture', pluginName: 'lifecycle' }],
        aliasesByName: { 'test-alias': { actionName: 'test' } },
        phasesByName: {
          test: {
            cleanFiles: [{ sourcePath: 'keep.txt' }],
            tasksByName: {
              first: { taskPlugin: { pluginPackage: 'sharding-mode-fixture', pluginName: 'task' } },
              second: { taskPlugin: { pluginPackage: 'sharding-mode-fixture', pluginName: 'task' } }
            }
          }
        }
      },
      path.join(project, 'config', 'heft.json')
    );
    fs.writeFileSync(path.join(project, 'keep.txt'), 'keep');
  });

  afterEach(() => {
    if (created) fs.rmSync(project, { recursive: true });
  });

  function run(args: string[]): SpawnSyncReturns<string> {
    const result: SpawnSyncReturns<string> = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', 'start.js'), ...args],
      { cwd: project, encoding: 'utf8', timeout: 15000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    return result;
  }

  function expectPluginContexts(root: string, mode: 'shard' | 'collate' | undefined): void {
    for (const relative of ['test/first', 'test/second', 'lifecycle.lifecycle']) {
      const taskTemp: string = path.join(root, relative);
      expect(JsonFile.load(path.join(taskTemp, 'session.json'))).toMatchObject({
        ...(mode ? { sharding: { mode, shardCount: 3 } } : {}),
        source: project,
        output: mode === 'shard' ? root : project,
        temp: root,
        taskTemp
      });
    }
    expect(JsonFile.load(path.join(root, 'test', 'first', 'session.json'))).toMatchObject({
      phase: 'test',
      task: 'first'
    });
  }

  it.each([
    ['temp/shards/2', '2'],
    ['temp/shards/part-2', 'part-2'],
    ['temp\\shards\\part-2', 'part-2']
  ])('normalizes native shard output %s and isolates every plugin before apply', (output, slot) => {
    const result = run(['test-alias', '--shard', '2/3', '--shard-output-directory', output]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expectPluginContexts(path.join(project, 'temp', 'shards', slot), 'shard');
    expect(fs.existsSync(path.join(project, 'temp', 'test'))).toBe(false);
    expect(fs.readFileSync(path.join(project, 'keep.txt'), 'utf8')).toBe('keep');
  });

  it('supports an explicit template with a suffix and leaves sibling slots unchanged', () => {
    const sibling: string = path.join(project, 'temp', 'shards', 'slot-1-result');
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, 'sentinel'), 'other slot');
    const result = run([
      'test',
      '--shard',
      '2/3',
      '--shard-parent-folder',
      'temp/shards',
      '--shard-folder-name-template',
      'slot-{shardIndex}-result',
      '--shard-output-directory',
      'temp\\shards\\slot-2-result'
    ]);
    expect(result.status).toBe(0);
    expectPluginContexts(path.join(project, 'temp', 'shards', 'slot-2-result'), 'shard');
    expect(fs.readFileSync(path.join(sibling, 'sentinel'), 'utf8')).toBe('other slot');
  });

  it.each([
    ['temp/shards/', undefined, '{shardIndex}'],
    ['temp/shards/part-', undefined, 'part-{shardIndex}'],
    ['temp\\shards\\part-', undefined, 'part-{shardIndex}'],
    ['temp/shards', 'slot-{shardIndex}-result', 'slot-{shardIndex}-result']
  ])(
    'normalizes collator prefix/template %s without writing inputs',
    (parent, template, expectedTemplate) => {
      const args: string[] = ['test', '--shard-count', '3', '--shard-parent-folder', parent!];
      if (template) args.push('--shard-folder-name-template', template);
      const result = run(args);
      expect(result.status).toBe(0);
      expectPluginContexts(path.join(project, 'temp'), 'collate');
      expect(JsonFile.load(path.join(project, 'temp', 'test', 'first', 'session.json'))).toMatchObject({
        sharding: {
          shardParentFolderPath: path.join(project, 'temp', 'shards'),
          shardFolderNameTemplate: expectedTemplate
        }
      });
      expect(fs.existsSync(path.join(project, 'temp', 'shards'))).toBe(false);
    }
  );

  it('preserves ordinary plugin paths and exposes no sharding mode', () => {
    const result = run(['test']);
    expect(result.status).toBe(0);
    expectPluginContexts(path.join(project, 'temp'), undefined);
    expect(JsonFile.load(path.join(project, 'temp', 'test', 'first', 'session.json'))).not.toHaveProperty(
      'sharding'
    );
  });

  it.each([
    ['test', '--clean', '--shard', '1/3', '--shard-output-directory', 'temp/shards/1'],
    ['test-watch', '--shard-count', '3', '--shard-parent-folder', 'temp/shards/'],
    ['test', '--shard', '1/3', '--shard-count', '3', '--shard-parent-folder', 'temp/shards/'],
    ['test', '--shard', '1/3'],
    ['test', '--shard-count', '0', '--shard-parent-folder', 'temp/shards/'],
    ['test', '--shard-count', '3', '--shard-folder-name-template', '{shardIndex}'],
    [
      'test',
      '--shard-count',
      '3',
      '--shard-parent-folder',
      'temp',
      '--shard-folder-name-template',
      '{shardIndex}'
    ],
    [
      'test',
      '--shard-count',
      '3',
      '--shard-parent-folder',
      'temp/test/first',
      '--shard-folder-name-template',
      '{shardIndex}'
    ],
    ['test', '--shard', '1/3', '--shard-output-directory', '../shards/1'],
    ['test', '--shard', '1/3', '--shard-output-directory', 'temp/shards/2'],
    [
      'test',
      '--shard',
      '1/3',
      '--shard-output-directory',
      'temp/other/1',
      '--shard-parent-folder',
      'temp/shards',
      '--shard-folder-name-template',
      '{shardIndex}'
    ]
  ])('rejects invalid or destructive modes before any plugin applies: %j', (...args) => {
    const result = run(args);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toBe('');
    expect(fs.existsSync(path.join(project, 'temp'))).toBe(false);
    expect(fs.readFileSync(path.join(project, 'keep.txt'), 'utf8')).toBe('keep');
    expect(result.stdout).not.toContain('Waiting for changes');
  });
});
