import { ITask } from './ITask';
import { IBuildConfig } from './IBuildConfig';
import { log, logStartSubtask, logEndSubtask } from './logging';

let gutil = require('gulp-util');

export class GulpTask<TASK_CONFIG> implements ITask<TASK_CONFIG> {
  public name: string;
  public buildConfig: IBuildConfig;
  public taskConfig: TASK_CONFIG;

  public config(taskConfig: TASK_CONFIG) {
    let assign = require('object-assign');
    this.taskConfig = assign({}, this.taskConfig, taskConfig);
  }

  public executeTask(gulp: any, completeCallback: (result?: any) => void): any {
    throw 'The task subclass is missing the "executeTask" method.';
  }

  public log(message: string) {
    log(`[${ gutil.colors.cyan(this.name) }] ${ message }`);
  }

  public logWarning(message: string) {
    this.log(`warning: ${ gutil.colors.yellow(message) }`);
  }

  public logError(message: string) {
    this.log(`error: ${ gutil.colors.red(message) }`);
  }

  public execute(config: IBuildConfig): Promise<any> {
    this.buildConfig = config;

    let startTime = new Date().getTime();

    logStartSubtask(this.name);

    return new Promise((resolve, reject) => {
      let stream;

      try {
        stream = this.executeTask(this.buildConfig.gulp, (result?: any) => {
          if (!result) {
            resolve();
          } else {
            reject(result);
          }
        });
      } catch (e) {
        this.logError(e);
        reject(e);
      }

      if (stream) {
        stream
          .on('error', (error) => {
            reject(error);
          })
          .on('queueDrain', () => {
            resolve();
          })
          .on('end', () => {
            resolve();
          })
          .on('close', () => {
            resolve();
          });
      }
    })
    .then(() => {
      logEndSubtask(this.name, new Date().getTime() - startTime);
    })
    .catch((ex) => {
      logEndSubtask(this.name, new Date().getTime() - startTime, ex);
      throw ex;
    });
  }

  public resolvePath(localPath: string): string {
    let path = require('path');

    return path.resolve(path.join(this.buildConfig.rootPath, localPath));
  }

  public fileExists(localPath: string): boolean {
    let fs = require('fs');
    let doesExist = false;
    let fullPath = this.resolvePath(localPath);

    try {
      let stats = fs.statSync(fullPath);
      doesExist = stats.isFile();
    } catch (e) { /* no-op */ }

    return doesExist;
  }

  public copyFile(localSourcePath: string, localDestPath?: string) {
    let path = require('path');
    let fs = require('fs-extra');

    let fullSourcePath = path.resolve(__dirname, localSourcePath);
    let fullDestPath = path.resolve(this.buildConfig.rootPath, (localDestPath || path.basename(localSourcePath)));

    fs.copySync(fullSourcePath, fullDestPath);
  }

  public readJSONSync(localPath: string): string {
    let fullPath = this.resolvePath(localPath);
    let result = null;
    let fs = require('fs');

    try {
      let content = fs.readFileSync(fullPath, 'utf8');
      result = JSON.parse(content);
    } catch (e) { /* no-op */ }

    return result;
  }
}

