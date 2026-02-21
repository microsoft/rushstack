// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminalProvider, TerminalProviderSeverity } from '@rushstack/terminal';

import { WatchManager } from '../WatchManager.ts';
import { WatchProject } from '../WatchProject.ts';

class TestTerminalProvider implements ITerminalProvider {
  public readonly supportsColor: boolean = false;
  public readonly eolCharacter: string = '\n';

  private _partialLine: string = '';

  public readonly messages: string[] = [];

  public write(data: string, severity: TerminalProviderSeverity): void {
    const parts: string[] = data.split('\n');

    if (parts.length === 1) {
      // No newline input
      this._partialLine += data;
    }

    // prepend the partial line to the first part, which is now a complete line
    parts[0] = this._partialLine + parts[0];

    // The last part is the next partial line (or '' if the input ends with a newline)
    this._partialLine = parts.pop() ?? '';

    // What's left are complete lines
    this.messages.push(...parts);
  }

  public retrieveMessages(): string[] {
    const result: string[] = [...this.messages];
    this.messages.length = 0;
    return result;
  }
}

describe(WatchManager.name, () => {
  test('handles an empty array correctly', async () => {
    const terminalProvider = new TestTerminalProvider();
    const manager: WatchManager = new WatchManager(terminalProvider);

    // d ---> c ---> b --+--> a
    //                   |
    //               e --+

    const a: WatchProject = new WatchProject('a');
    const b: WatchProject = new WatchProject('b', [a]);
    const c: WatchProject = new WatchProject('c', [b]);
    const d: WatchProject = new WatchProject('d', [c]);
    const e: WatchProject = new WatchProject('e', [a]);

    manager.initialize([a, b, c, d, e]);

    expect(terminalProvider.retrieveMessages()).toMatchInlineSnapshot(`Array []`);

    manager.writeBuildLines(a, ['1', '2']);

    expect(terminalProvider.retrieveMessages()).toMatchInlineSnapshot(`
      Array [
        ">>> REBUILD a -----------------------------------",
        "1",
        "2",
      ]
    `);

    manager.writeBuildLines(b, ['3']);

    expect(terminalProvider.retrieveMessages()).toMatchInlineSnapshot(`Array []`);

    manager.writeBuildLines(c, ['4']);

    expect(terminalProvider.retrieveMessages()).toMatchInlineSnapshot(`Array []`);

    manager.markSucceeded(a);

    expect(terminalProvider.retrieveMessages()).toMatchInlineSnapshot(`
      Array [
        ">>> SUCCESS a -----------------------------------",
        ">>> REBUILD b -----------------------------------",
        "3",
      ]
    `);

    manager.writeBuildLines(b, ['5']);

    expect(terminalProvider.retrieveMessages()).toMatchInlineSnapshot(`
      Array [
        "5",
      ]
    `);

    manager.writeBuildLines(a, ['6']);

    expect(terminalProvider.retrieveMessages()).toMatchInlineSnapshot(`
      Array [
        ">>> (interrupted by upstream project)",
        ">>> REBUILD a -----------------------------------",
        "6",
      ]
    `);
  });
});
