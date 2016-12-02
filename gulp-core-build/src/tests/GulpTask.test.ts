'use strict';
/// <reference path='../../typings/main.d.ts' />

import { expect } from 'chai';
import { serial, parallel, GulpTask } from '../index';
import gutil = require('gulp-util');
import gulp = require('gulp');
import { Readable } from 'stream';

interface IConfig {
}

let testArray: string[] = [];

class PromiseTask extends GulpTask<IConfig> {
  public name: string = 'promise';

  public taskConfig: IConfig = {
  };

  /* tslint:disable:no-any */
  public executeTask(gulp: gulp.Gulp): Promise<any> {
  /* tslint:enable:no-any */
    return new Promise<void>((resolve: () => void, reject: () => void) => {
      testArray.push(this.name);
      resolve();
    });
  }
}

class StreamTask extends GulpTask<IConfig> {
  public name: string = 'stream';

  public taskConfig: IConfig = {
  };

  /* tslint:disable:no-any */
  public executeTask(gulp: gulp.Gulp): any {
  /* tslint:enable:no-any */
    const stream: Readable = new Readable({ objectMode: true });

    // Add no opt function to make it compat with through
    stream['_read'] = () => { // tslint:disable-line:no-string-literal
      // Do Nothing
     };

    setTimeout(() => {

      let file: gutil.File = new gutil.File({
        path: 'test.js',
        contents: new Buffer('test')
      });

      stream.push(file);

      testArray.push(this.name);

      stream.emit('end');
    }, 100);

    return stream;
  }
}

class SyncTask extends GulpTask<IConfig> {
  public name: string = 'sync';

  public taskConfig: IConfig = {
  };

  public executeTask(gulp: gulp.Gulp): void {
    testArray.push(this.name);
  }
}

class SyncWithReturnTask extends GulpTask<IConfig> {
  public name: string = 'sync-with-return';

  public taskConfig: IConfig = {
  };

  public executeTask(gulp: gulp.Gulp): void {
    testArray.push(this.name);
  }
}

class CallbackTask extends GulpTask<IConfig> {
  public name: string = 'callback';

  public taskConfig: IConfig = {
  };

  public executeTask(gulp: gulp.Gulp, callback: (result?: Object) => void): void {
    testArray.push(this.name);
    callback();
  }
}

let tasks: GulpTask<IConfig>[] = [
];

tasks.push(new PromiseTask());
tasks.push(new StreamTask());
tasks.push(new SyncTask());
tasks.push(new SyncWithReturnTask());
tasks.push(new CallbackTask());

describe('GulpTask', () => {
  for (const task of tasks) {
    it(`${task.name} serial`, (done) => {
      testArray = [];
      task.setConfig({ addToMe: testArray });
      serial(task).execute({}).then(() => {
        expect(testArray).to.deep.equal([task.name]);
        done();
      }).catch(error => done(error));
    });

    it(`${task.name} parallel`, (done) => {
      testArray = [];
      task.setConfig({ addToMe: testArray });
      parallel(task).execute({}).then(() => {
        expect(testArray).to.deep.equal([task.name]);
        done();
      }).catch(error => done(error));
    });
  }

  it(`all tasks serial`, (done) => {
    testArray = [];
    for (const task of tasks) {
      task.setConfig({ addToMe: testArray });
    }
    serial(tasks).execute({}).then(() => {
      for (const task of tasks) {
        expect(testArray.indexOf(task.name)).to.be.greaterThan(-1);
      }
      done();
    }).catch(error => done(error));
  });

  it(`all tasks parallel`, (done) => {
    testArray = [];
    for (const task of tasks) {
      task.setConfig({ addToMe: testArray });
    }
    parallel(tasks).execute({}).then(() => {
      for (const task of tasks) {
        expect(testArray.indexOf(task.name)).to.be.greaterThan(-1);
      }
      done();
    }).catch(error => done(error));
  });

});
