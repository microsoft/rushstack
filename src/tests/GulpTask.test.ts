'use strict';
/// <reference path='../../typings/main.d.ts' />

import 'es6-promise';
import { expect } from 'chai';
import { serial, parallel, GulpTask } from '../index';
import gutil = require('gulp-util');
import gulp = require('gulp');
import { Readable } from 'stream';

interface IConfig {
}

let testArray = [];

class PromiseTask extends GulpTask<IConfig> {
  public name = 'promise';

  public taskConfig: IConfig = {
  };

  public executeTask(gulp: gulp.Gulp): any {
    return new Promise((resolve, reject) => {
      testArray.push(this.name);
      resolve();
    });
  }
}

class StreamTask extends GulpTask<IConfig> {
  public name = 'stream';

  public taskConfig: IConfig = {
  };

  public executeTask(gulp: gulp.Gulp): any {
    let stream = new Readable({ objectMode: true });

    // Add no opt function to make it compat with through
    stream._read = function() {
      // Do Nothing
     };

    setTimeout(() => {

      let file = new gutil.File({
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
  public name = 'sync';

  public taskConfig: IConfig = {
  };

  public executeTask(gulp: gulp.Gulp): any {
    testArray.push(this.name);
  }
}

class SyncWithReturnTask extends GulpTask<IConfig> {
  public name = 'sync-with-return';

  public taskConfig: IConfig = {
  };

  public executeTask(gulp: gulp.Gulp): any {
    testArray.push(this.name);
    return true;
  }
}

class CallbackTask extends GulpTask<IConfig> {
  public name = 'callback';

  public taskConfig: IConfig = {
  };

  public executeTask(gulp: gulp.Gulp, callback: (result?: any) => void): any {
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
  for (let task of tasks) {
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
    for (let task of tasks) {
      task.setConfig({ addToMe: testArray });
    }
    serial(tasks).execute({}).then(() => {
      for (let task of tasks) {
        expect(testArray.indexOf(task.name)).to.be.greaterThan(-1);
      }
      done();
    }).catch(error => done(error));
  });

  it(`all tasks parallel`, (done) => {
    testArray = [];
    for (let task of tasks) {
      task.setConfig({ addToMe: testArray });
    }
    parallel(tasks).execute({}).then(() => {
      for (let task of tasks) {
        expect(testArray.indexOf(task.name)).to.be.greaterThan(-1);
      }
      done();
    }).catch(error => done(error));
  });

});

