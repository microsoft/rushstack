import * as gulp from 'gulp';
import * as path from 'path';
import * as fs from 'fs';

import { GulpTask } from '@microsoft/gulp-core-build';
import { ExternalApiHelper } from '@microsoft/api-extractor';

const files: string[] = ['resources/external-api-types/es6-collections/index.d.ts',
                         'resources/external-api-types/es6-promise/index.d.ts',
                         'resources/external-api-types/whatwg-fetch/index.d.ts'];

export class RunApiExtractorOnExternalApiTypes extends GulpTask<void> {
  public name: string = 'run-api-extractor';

  public executeTask(gulp: gulp.Gulp, completeCallback?: (result?: Object) => void): void {
    let outputPath: string = path.join(this.buildConfig.rootPath, this.buildConfig.libFolder);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }

    outputPath = path.join(outputPath, 'external-api-json');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }

    for (const filePath of files) {
      const rootDir: string = path.dirname(filePath);
      const outputApiJsonFilePath: string = path.join(outputPath, `${path.basename(rootDir)}.api.json`);
      const entryPointFile: string = path.join(this.buildConfig.rootPath, filePath);
      ExternalApiHelper.generateApiJson(this.buildConfig.rootPath, entryPointFile, outputApiJsonFilePath);
    }

    completeCallback();
  }
}

export default new RunApiExtractorOnExternalApiTypes(); // tslint:disable-line:export-name
