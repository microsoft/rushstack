// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SplitterTransform } from '../SplitterTransform';
import { MockWritable } from '../MockWritable';
import { TerminalChunkKind, type ITerminalChunk } from '../ITerminalChunk';

// Helper to create chunks succinctly
function c(text: string, kind: TerminalChunkKind = TerminalChunkKind.Stdout): ITerminalChunk {
  return { text, kind };
}

describe(SplitterTransform.name, () => {
  it('writes chunks to all initial destinations', () => {
    const a: MockWritable = new MockWritable();
    const b: MockWritable = new MockWritable();
    const splitter: SplitterTransform = new SplitterTransform({ destinations: [a, b] });

    splitter.writeChunk(c('one '));
    splitter.writeChunk(c('two ', TerminalChunkKind.Stderr));
    splitter.writeChunk(c('three'));
    splitter.close();

    // Both received identical chunk sequences
    expect(a.chunks).toEqual(b.chunks);
    // And each chunk reference should be the exact same object instance across destinations
    expect(a.chunks[0]).toBe(b.chunks[0]);
    expect(a.chunks[1]).toBe(b.chunks[1]);
    expect(a.chunks[2]).toBe(b.chunks[2]);

    expect(a.getFormattedChunks()).toMatchSnapshot();
  });

  describe('addDestination', () => {
    it('only receives subsequent chunks', () => {
      const a: MockWritable = new MockWritable();
      const b: MockWritable = new MockWritable();
      const late: MockWritable = new MockWritable();
      const splitter: SplitterTransform = new SplitterTransform({ destinations: [a, b] });

      splitter.writeChunk(c('early1 '));
      splitter.writeChunk(c('early2 '));

      splitter.addDestination(late);

      splitter.writeChunk(c('late1 '));
      splitter.writeChunk(c('late2'));
      splitter.close();

      expect(a.getAllOutput()).toBe('early1 early2 late1 late2');
      expect(b.getAllOutput()).toBe('early1 early2 late1 late2');
      expect(late.getAllOutput()).toBe('late1 late2');

      expect({
        a: a.getFormattedChunks(),
        late: late.getFormattedChunks()
      }).toMatchSnapshot();
    });
  });

  describe('removeDestination', () => {
    it('stops further writes and closes by default', () => {
      class CloseTrackingWritable extends MockWritable {
        public closed: boolean = false;
        protected onClose(): void {
          this.closed = true;
        }
      }

      const a: CloseTrackingWritable = new CloseTrackingWritable();
      const b: CloseTrackingWritable = new CloseTrackingWritable();
      const splitter: SplitterTransform = new SplitterTransform({ destinations: [a, b] });

      splitter.writeChunk(c('first '));
      splitter.removeDestination(b); // default close=true

      splitter.writeChunk(c('second'));
      splitter.close();

      // b should not have received 'second'
      expect(a.getAllOutput()).toBe('first second');
      expect(b.getAllOutput()).toBe('first ');
      expect(b.closed).toBe(true);
      expect(a.closed).toBe(true); // closed when splitter closed

      expect({ a: a.getFormattedChunks(), b: b.getFormattedChunks() }).toMatchSnapshot();
    });

    it('with close=false keeps destination open', () => {
      class CloseTrackingWritable extends MockWritable {
        public closed: boolean = false;
        protected onClose(): void {
          this.closed = true;
        }
      }

      const a: CloseTrackingWritable = new CloseTrackingWritable();
      const b: CloseTrackingWritable = new CloseTrackingWritable();
      const splitter: SplitterTransform = new SplitterTransform({ destinations: [a, b] });

      splitter.writeChunk(c('first '));
      splitter.removeDestination(b, false); // do not close

      splitter.writeChunk(c('second'));
      splitter.close();

      expect(b.closed).toBe(false); // still open since not auto-closed by splitter and removed
      // Manually close to avoid resource leak semantics
      b.close();
      expect(b.closed).toBe(true);

      expect({ a: a.getFormattedChunks(), b: b.getFormattedChunks() }).toMatchSnapshot();
    });

    it('respects preventAutoclose', () => {
      class CloseTrackingWritable extends MockWritable {
        public closed: boolean = false;
        public constructor(prevent: boolean) {
          super({ preventAutoclose: prevent });
        }
        protected onClose(): void {
          this.closed = true;
        }
      }

      const a: CloseTrackingWritable = new CloseTrackingWritable(false);
      const b: CloseTrackingWritable = new CloseTrackingWritable(true); // preventAutoclose
      const splitter: SplitterTransform = new SplitterTransform({ destinations: [a, b] });

      splitter.writeChunk(c('hello '));
      splitter.removeDestination(b); // would normally close, but preventAutoclose=true
      splitter.writeChunk(c('world'));
      splitter.close();

      expect(a.closed).toBe(true);
      expect(b.closed).toBe(false); // not closed due to preventAutoclose
      b.close();
      expect(b.closed).toBe(true);

      expect({ a: a.getFormattedChunks(), b: b.getFormattedChunks() }).toMatchSnapshot();
    });

    it('returns false when destination missing', () => {
      const a: MockWritable = new MockWritable();
      const b: MockWritable = new MockWritable();
      const splitter: SplitterTransform = new SplitterTransform({ destinations: [a] });

      const result: boolean = splitter.removeDestination(b); // not found
      expect(result).toBe(false);

      splitter.writeChunk(c('still works'));
      splitter.close();

      expect(a.getAllOutput()).toBe('still works');
    });
  });
});
