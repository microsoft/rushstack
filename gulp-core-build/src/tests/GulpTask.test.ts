'use strict';

import 'es6-promise';
import { assert, expect } from 'chai';
import { serial, parallel, GulpTask } from '../index';
import gutil = require('gulp-util');
import gulp = require('gulp');
import { Readable } from 'stream';
import * as path from 'path';

interface IConfiguration {
}

let testArray: string[] = [];

class PromiseTask extends GulpTask<IConfiguration> {
  public name: string = 'promise';

  public taskConfiguration: IConfiguration = {
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

class StreamTask extends GulpTask<IConfiguration> {
  public name: string = 'stream';

  public taskConfiguration: IConfiguration = {
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

      const file: gutil.File = new gutil.File({
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

class SyncTask extends GulpTask<IConfiguration> {
  public name: string = 'sync';

  public taskConfiguration: IConfiguration = {
  };

  public executeTask(gulp: gulp.Gulp): void {
    testArray.push(this.name);
  }
}

class SyncWithReturnTask extends GulpTask<IConfiguration> {
  public name: string = 'sync-with-return';

  public taskConfiguration: IConfiguration = {
  };

  public executeTask(gulp: gulp.Gulp): void {
    testArray.push(this.name);
  }
}

class CallbackTask extends GulpTask<IConfiguration> {
  public name: string = 'callback';

  public taskConfiguration: IConfiguration = {
  };

  public executeTask(gulp: gulp.Gulp, callback: (result?: Object) => void): void {
    testArray.push(this.name);
    callback();
  }
}

interface ISimpleConfiguration {
  shouldDoThings: boolean;
}

class SchemaTask extends GulpTask<ISimpleConfiguration> {
  public name: string = 'schema-task';

  public taskConfiguration: ISimpleConfiguration = {
    shouldDoThings: false
  };

  public executeTask(gulp: gulp.Gulp, callback: (result?: Object) => void): void {
    callback();
  }

  protected _getConfigurationFilePath(): string {
    return path.join(__dirname, 'schema-task.config.json');
  }
}

const tasks: GulpTask<IConfiguration>[] = [
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
      task.setConfiguration({ addToMe: testArray });
      serial(task).execute({}).then(() => {
        expect(testArray).to.deep.equal([task.name]);
        done();
      }).catch(error => done(error));
    });

    it(`${task.name} parallel`, (done) => {
      testArray = [];
      task.setConfiguration({ addToMe: testArray });
      parallel(task).execute({}).then(() => {
        expect(testArray).to.deep.equal([task.name]);
        done();
      }).catch(error => done(error));
    });
  }

  it(`all tasks serial`, (done) => {
    testArray = [];
    for (const task of tasks) {
      task.setConfiguration({ addToMe: testArray });
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
      task.setConfiguration({ addToMe: testArray });
    }
    parallel(tasks).execute({}).then(() => {
      for (const task of tasks) {
        expect(testArray.indexOf(task.name)).to.be.greaterThan(-1);
      }
      done();
    }).catch(error => done(error));
  });

  it(`reads schema file if loadSchema is implemented`, (done) => {
    const schemaTask: SchemaTask = new SchemaTask();
    assert.isFalse(schemaTask.taskConfiguration.shouldDoThings);
    schemaTask.onRegister();
    assert.isTrue(schemaTask.taskConfiguration.shouldDoThings);
    done();
  });

  it(`throws validation error is configuration does not conform to schema file`, (done) => {
    const schemaTask: SchemaTask = new SchemaTask();

    // tslint:disable-next-line:no-any
    (schemaTask as any)._getConfigurationFilePath = (): string => {
      return path.join(__dirname, 'other-schema-task.config.json');
    };

    assert.isFalse(schemaTask.taskConfiguration.shouldDoThings);
    assert.throws(schemaTask.onRegister);
    done();
  });
});
