/// <reference path='../../../typings/tsd.d.ts' />
/// <reference types='mocha' />

import { assert } from 'chai';

import { Stopwatch, StopwatchState } from '../Stopwatch';

function pseudoTimeMilliseconds(times: number[]): () => number {
  return () => times.shift();
}

function pseudoTimeSeconds(times: number[]): () => number {
  return pseudoTimeMilliseconds(times.map(time => time * 1000));
}

describe('Stopwatch', () => {
  it('allows a static invocation as a quick shorthand', (done: MochaDone) => {
    assert.equal(Stopwatch.start().reset().toString(), '0.00 seconds (stopped)');
    done();
  });

  it('stopping before starting does nothing', (done: MochaDone) => {
    const watch: Stopwatch = new Stopwatch();
    watch.stop();
    assert.equal(watch.toString(), '0.00 seconds (stopped)');
    done();
  });

  it('can\'t start twice', (done: MochaDone) => {
    const watch: Stopwatch = new Stopwatch();
    assert.throws(() => {
      watch.start();
      watch.start();
    });
    done();
  });

  it('reflects the proper state', (done: MochaDone) => {
    const watch: Stopwatch = new Stopwatch();
    assert.equal(watch.state, StopwatchState.Stopped);
    watch.start();
    assert.equal(watch.state, StopwatchState.Started);
    watch.stop();
    assert.equal(watch.state, StopwatchState.Stopped);
    watch.reset();
    assert.equal(watch.state, StopwatchState.Stopped);
    done();
  });

  it('gives 0.00 seconds after being reset', (done: MochaDone) => {
    const watch: Stopwatch = new Stopwatch();
    watch.start();
    watch.reset();
    assert.equal(watch.toString(), '0.00 seconds (stopped)');
    done();
  });

  it('gives 0.00 seconds when not running', (done: MochaDone) => {
    const watch: Stopwatch = new Stopwatch();
    assert.equal(watch.toString(), '0.00 seconds (stopped)');
    done();
  });

  it('uses the latest time when the clock is not stopped', (done: MochaDone) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 1, 2]));
    watch.start();
    assert.equal(watch.toString(), '1.00 seconds');
    assert.equal(watch.toString(), '2.00 seconds');
    done();
  });

  it('uses the stop time when the clock is stopped', (done: MochaDone) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 1, 2]));
    watch.start();
    watch.stop();
    assert.equal(watch.toString(), '1.00 seconds');
    assert.equal(watch.toString(), '1.00 seconds');
    done();
  });

  it('gives elapsed seconds when < 1 minute', (done: MochaDone) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 1, 2, 3.25]));
    watch.start();
    watch.stop();
    assert.equal(watch.toString(), '1.00 seconds');
    done();
  });

  it('gives elapsed minutes and seconds when > 1 minute', (done: MochaDone) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 400]));
    watch.start();
    watch.stop();
    assert.equal(watch.toString(), '6 minutes 40.0 seconds');
    done();
  });

  it('gives elapsed minute and seconds when time >=60 <=119 seconds', (done: MochaDone) => {
    const watch: Stopwatch = new Stopwatch(pseudoTimeSeconds([0, 61.25]));
    watch.start();
    watch.stop();
    assert.equal(watch.toString(), '1 minute 1.3 seconds');
    done();
  });
});
