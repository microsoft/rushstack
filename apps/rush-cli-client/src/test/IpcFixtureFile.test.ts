// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { readIpcFixtureEvents, readPressureGateAsync, writeIpcFixtureFile } from './IpcFixtureFile';

const filesystem: typeof fs = jest.requireActual('node:fs');

describe('IPC fixture file publication', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-publication-'));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    ['allocate.json', '{"additionalMemoryBytes":123}'],
    ['allocate.json.adjust', '{"additionalMemoryBytes":456}'],
    ['allocate.json.release', '{}'],
    ['cancel.json', '{"cancelled":true}'],
    ['cancel.json.adjust', '{"cancelled":true}'],
    ['cancel.json.release', '{"cancelled":true}'],
    ['run-input.json', '{"value":"next-request"}']
  ])('hides incomplete %s from a separate reader until its closed payload is published', (name, contents) => {
    const filename: string = path.join(directory, name);
    const write: typeof fs.writeFileSync = fs.writeFileSync;
    const rename: typeof fs.renameSync = fs.renameSync;
    let descriptor: number | undefined;
    let reader: SpawnSyncReturns<string> | undefined;
    jest.spyOn(filesystem, 'writeFileSync').mockImplementationOnce((target, data, options) => {
      if (typeof target === 'number') {
        descriptor = target;
        fs.writeSync(target, '{');
      } else {
        write(target, '{', options);
      }
      reader = spawnSync(process.execPath, [
        '-e',
        "const fs=require('node:fs');const file=process.argv[1];" +
          "console.log(fs.existsSync(file)?JSON.stringify(JSON.parse(fs.readFileSync(file,'utf8'))):'pending');",
        filename
      ], { encoding: 'utf8' });
      if (typeof target === 'number') {
        fs.ftruncateSync(target, 0);
        fs.writeSync(target, String(data), 0, 'utf8');
      } else {
        write(target, data, options);
      }
    });
    jest.spyOn(filesystem, 'renameSync').mockImplementationOnce((from, to) => {
      if (descriptor !== undefined) {
        expect(() => fs.fstatSync(descriptor!)).toThrow(expect.objectContaining({ code: 'EBADF' }));
      }
      rename(from, to);
    });

    writeIpcFixtureFile(filename, contents);

    expect(reader?.error).toBeUndefined();
    expect(reader?.status).toBe(0);
    expect(reader?.stdout.trim()).toBe('pending');
    expect(JSON.parse(fs.readFileSync(filename, 'utf8'))).toEqual(JSON.parse(contents));
    expect(fs.readdirSync(directory)).toEqual([name]);
  });

  it('keeps a previous complete input visible until its replacement is complete', () => {
    const filename: string = path.join(directory, 'input.json');
    writeIpcFixtureFile(filename, '{"value":"old"}');
    const write: typeof fs.writeFileSync = fs.writeFileSync;
    let observed: unknown;
    jest.spyOn(filesystem, 'writeFileSync').mockImplementationOnce((target, contents, options) => {
      observed = JSON.parse(fs.readFileSync(filename, 'utf8'));
      write(target, contents, options);
    });
    writeIpcFixtureFile(filename, '{"value":"new"}');
    expect(observed).toEqual({ value: 'old' });
    expect(JSON.parse(fs.readFileSync(filename, 'utf8'))).toEqual({ value: 'new' });
  });

  it.each(['write', 'rename'])('cleans only its own staging file after a %s failure', (failurePoint) => {
    const sentinel: string = path.join(directory, '.other-writer.tmp');
    fs.writeFileSync(sentinel, 'owned by another publisher');
    const filename: string = path.join(directory, 'gate.json');
    const failure: Error = new Error('publication failed');
    if (failurePoint === 'write') {
      jest.spyOn(filesystem, 'writeFileSync').mockImplementationOnce(() => { throw failure; });
    } else {
      jest.spyOn(filesystem, 'renameSync').mockImplementationOnce(() => { throw failure; });
    }
    expect(() => writeIpcFixtureFile(filename, '{}')).toThrow(failure);
    expect(fs.readdirSync(directory)).toEqual(['.other-writer.tmp']);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('owned by another publisher');
  });

  it.each(['pressure-ready', 'pressure-allocated', 'pressure-adjusted'])(
    'does not publish a partial %s frame or substitute a previous request sample',
    (kind) => {
      const filename: string = path.join(directory, 'events.jsonl');
      const previous = { kind, pressureGate: 'previous-request', residentMemoryBytes: 1 };
      const current = { kind, pressureGate: 'current-request', residentMemoryBytes: 2 };
      const contents: string = JSON.stringify(current);
      fs.writeFileSync(filename, `${JSON.stringify(previous)}\n${contents.slice(0, 10)}`);
      expect(readIpcFixtureEvents(filename)).toEqual([previous]);
      fs.appendFileSync(filename, `${contents.slice(10)}\n`);
      expect(readIpcFixtureEvents(filename)).toEqual([previous, current]);
    }
  );

  it('surfaces malformed complete event frames instead of ignoring or retrying them', () => {
    const filename: string = path.join(directory, 'events.jsonl');
    fs.writeFileSync(filename, '{"kind":}\n');
    expect(() => readIpcFixtureEvents(filename)).toThrow(SyntaxError);
  });

  it('surfaces malformed published gate JSON and cancellation immediately', async () => {
    const filename: string = path.join(directory, 'gate.json');
    writeIpcFixtureFile(filename, '{');
    await expect(readPressureGateAsync(filename, performance.now() + 10000)).rejects.toThrow(SyntaxError);
    writeIpcFixtureFile(filename, '{"cancelled":true}');
    await expect(readPressureGateAsync(filename, performance.now() + 10000)).rejects.toThrow(
      'Pressure fixture setup was cancelled.'
    );
  });

  it('does not let an old completed phase release a new request', async () => {
    writeIpcFixtureFile(path.join(directory, 'old-request.release'), '{}');
    const filename: string = path.join(directory, 'new-request.release');
    let settled: boolean = false;
    const reading: Promise<unknown> = readPressureGateAsync(filename, performance.now() + 10000)
      .finally(() => { settled = true; });
    const rejected: Promise<void> = expect(reading).rejects.toThrow('Pressure fixture setup was cancelled.');
    try {
      expect(settled).toBe(false);
    } finally {
      writeIpcFixtureFile(filename, '{"cancelled":true}');
      await rejected;
    }
  });
});
