import { ITask } from './ITask';
import { IBuildConfig } from './IBuildConfig';
import { log } from './logging';

let chalk = require('chalk');

export class GulpTask implements ITask {
  public name: string = 'unnamed gulp task';
  public buildConfig: IBuildConfig;

  public executeTask(gulp: any, completeCallback: (result?: any) => void): any {
    throw 'The task subclass is missing the "executeTask" method.';
  }

  public execute(config: IBuildConfig): Promise<any> {
    this.buildConfig = config;

    if (this.name) {
      log(`Starting subtask '${ chalk.cyan(this.name) }'...`);
    }

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
        console.log(`The task ${ this.name } threw an exception: ${ e }`);
        reject(e);
      }

      if (stream) {
        stream
          .on('error', (error) => {
            reject(error);
          })
          .on('end', () => {
       debugger;
            resolve();
          });
      }
    });
  }

  public resolvePath(localPath: string): string {
    let path = require('path');

    return path.resolve(path.join(this.buildConfig.rootPath, localPath));
  }

  public readConfig(localPath: string): string {
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

