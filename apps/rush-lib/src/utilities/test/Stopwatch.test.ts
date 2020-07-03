// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Stopwatch, StopwatchState } from '../Stopwatch';

function pseudoTimeMilliseconds(times: number[]): () => number {
  return () => times.shift()!;
}

function pseudoTimeSeconds(times: number[]): () => number {
  return pseudoTimeMilliseconds(times.map((time) => time * 1000));
}

describe('Stopwatch', () => {
  it('allows a static invocation as a quick shorthand', (done: jest.DoneCallback) => {
    expect(Stopwatch.start().reset().toString()).toEqual('0.00 seconds (stopped)');
    done();
  });

  it('stopping before starting does nothing', (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch();
    watch.stop();
    expect(watch.toString()).toEqual('0.00 seconds (stopped)');
    done();
  });

  it("can't start twice", (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch();
    expect(() => {
      watch.start();
      watch.start();
    }).toThrow();
    done();
  });

  it('reflects the proper state', (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch();
    expect(watch.state).toEqual(StopwatchState.Stopped);
    watch.start();
    expect(watch.state).toEqual(StopwatchState.Started);
    watch.stop();
    expect(watch.state).toEqual(StopwatchState.Stopped);
    watch.reset();
    expect(watch.state).toEqual(StopwatchState.Stopped);
    done();
  });

  it('gives 0.00 seconds after being reset', (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch();
    watch.start();
    watch.reset();
    expect(watch.toString()).toEqual('0.00 seconds (stopped)');
    expect(watch.duration).toEqual(0);
    done();
  });

  it('gives 0.00 seconds when not running', (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch();
    expect(watch.toString()).toEqual('0.00 seconds (stopped)');
    expect(watch.duration).toEqual(0);
    done();
  });

  it('uses the latest time when the clock is not stopped', (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 1, 2]));
    watch.start();
    expect(watch.toString()).toEqual('1.00 seconds');
    expect(watch.toString()).toEqual('2.00 seconds');
    done();
  });

  it('uses the stop time when the clock is stopped', (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 1, 2]));
    watch.start();
    watch.stop();
    expect(watch.toString()).toEqual('1.00 seconds');
    expect(watch.toString()).toEqual('1.00 seconds');
    done();
  });

  it('gives elapsed seconds when < 1 minute', (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 1, 2, 3.25]));
    watch.start();
    watch.stop();
    expect(watch.toString()).toEqual('1.00 seconds');
    done();
  });

  it('gives elapsed minutes and seconds when > 1 minute', (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 400]));
    watch.start();
    watch.stop();
    expect(watch.toString()).toEqual('6 minutes 40.0 seconds');
    done();
  });

  it('gives elapsed minute and seconds when time >=60 <=119 seconds', (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 61.25]));
    watch.start();
    watch.stop();
    expect(watch.toString()).toEqual('1 minute 1.3 seconds');
    done();
  });

  it('uses the latest time when the clock is not stopped', (done: jest.DoneCallback) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 1, 2]));
    watch.start();
    expect(watch.toString()).toEqual('1.00 seconds');
    expect(watch.toString()).toEqual('2.00 seconds');
    done();
  });

  it('returns duration when the clock is stopped', () => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 61.25]));
    watch.start();
    watch.stop();
    expect(watch.duration).toEqual(61.25);
  });

  it('returns duration using the latest time when the clock is not stopped', () => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 1, 2]));
    watch.start();
    expect(watch.duration).toEqual(1);
    expect(watch.duration).toEqual(2);
  });
});
