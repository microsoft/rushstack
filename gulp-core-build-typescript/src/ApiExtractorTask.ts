import * as fsx from 'fs-extra';
import * as gulp from 'gulp';
import * as mkdirp from 'mkdirp';
import * as os from 'os';
import * as path from 'path';
import * as through from 'through2';
import * as gulpUtil from 'gulp-util';
import { GulpTask } from '@microsoft/gulp-core-build';
import { Analyzer, IApiAnalyzerOptions, ApiFileGenerator, ApiJsonGenerator } from '@microsoft/api-extractor';
import { TsConfigProvider } from './TsConfigProvider';
import * as ts from 'typescript';

function writeStringToGulpUtilFile(content: string, filename: string = 'tempfile'): gulpUtil.File {
  return new gulpUtil.File({
    contents: new Buffer(content),
    path: filename
  });
}

export interface IApiExtractorTaskConfig {
  /**
   * Indicates whether the task should be run.
   */
  enabled?: boolean;

  /**
   * The file path of the exported entry point, relative to the project folder.
   *
   * Example "src/index.ts"
   */
  entry?: string;

  /**
   * The file path of the folder containing API files to be reviewed, relative to
   * the project folder.  This is part of an API review workflow:  During a build,
   * the ApiExtractorTask will output an API file, e.g. "my-project/temp/my-project.api.ts".
   * It will then compare this file against the last reviewed file,
   * e.g. "../api-review/my-project.api.ts" (assuming that apiReviewFolder is "../api-review").
   * If the files are different, the build will fail with an error message that instructs
   * the developer to update the approved file, and then commit it to Git.  When they
   * create a Pull Request, a VSO branch policy will look for changes under "api-review/*"
   * and require signoff from the appropriate reviewers.
   *
   * Example: "config" (for a standalone project)
   * Example: "../../common/api-review"  (for a Git repoistory with Rush)
   */
  apiReviewFolder?: string;

  /**
   * The file path of the folder containing the *.api.json output file containing
   * the API information. The default location is in the “dist” folder,
   * e.g. my-project/dist/my-project.api.json. This file should be published as part
   * of the NPM package. When building other projects that depend on this package,
   * api-extractor will look for this file in the node_modules folder and use it as an input.
   * The *.api.json file is also consumed by a tool at
   * https://github.com/SharePoint/ts-spec-gen that generates an online API documentation.
   */
  apiJsonFolder?: string;
}

/**
 * The ApiExtractorTask uses the api-extractor tool to analyze a project for public APIs. api-extractor will detect
 * common problems and generate a report of the exported public API. The task uses the entry point of a project to
 * find the aliased exports of the project. An api-extractor.ts file is generated for the project in the temp folder.
 */
export class ApiExtractorTask extends GulpTask<IApiExtractorTaskConfig>  {
  public name: string = 'api-extractor';

  public taskConfig: IApiExtractorTaskConfig = {
    enabled: false,
    entry: undefined,
    apiReviewFolder: undefined,
    apiJsonFolder: undefined
  };

  public loadSchema(): Object {
    return require('./api-extractor.schema.json');
  };

  public executeTask(gulp: gulp.Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream {
    if (!this.taskConfig.enabled || !this._validateConfiguration()) {
      completeCallback();
      return;
    }

    const entryPointFile: string = path.join(this.buildConfig.rootPath, this.taskConfig.entry);
    const typingsFilePath: string = path.join(this.buildConfig.rootPath, 'typings/tsd.d.ts');
    const otherFiles: string[] = fsx.existsSync(typingsFilePath) ? [typingsFilePath] : [];

    const compilerOptions: ts.CompilerOptions = TsConfigProvider.getConfig(this.buildConfig).compilerOptions;

    const analyzerOptions: IApiAnalyzerOptions = {
      entryPointFile,
      compilerOptions,
      otherFiles
    } as any; /* tslint:disable-line:no-any */

    /* tslint:disable-next-line */
    delete analyzerOptions.compilerOptions['typescript'];

    console.log(JSON.stringify(analyzerOptions, undefined, 2));

    const analyzer: Analyzer = new Analyzer(
      (message: string, fileName: string, lineNumber: number): void => {
        this.logWarning(`TypeScript error: ${message}` + os.EOL
          + `  ${fileName}#${lineNumber}`);
      }
    );
    analyzer.analyze(analyzerOptions);

    const jsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
    // const jsonContent: string = generator.generateJsonFileContent(analyzer);
    const jsonFileName: string = path.basename(this.buildConfig.rootPath) + '.api.json';

    if (!fsx.existsSync(this.taskConfig.apiJsonFolder)) {
      mkdirp.sync(this.taskConfig.apiJsonFolder, (err) => {
        if (err) {
          this.logError(`Could not create directory ${this.taskConfig.apiJsonFolder}`);
        }
      });
    }

    if (fsx.existsSync(this.taskConfig.apiJsonFolder)) {
      const jsonFilePath: string = path.join(this.taskConfig.apiJsonFolder, jsonFileName);
      this.logVerbose(`Writing Api JSON file to ${jsonFilePath}`);
      jsonGenerator.writeJsonFile(jsonFilePath, analyzer);
    }

    const generator: ApiFileGenerator = new ApiFileGenerator();
    const actualApiFileContent: string = generator.generateApiFileContent(analyzer);

    // Ex: "project.api.ts"
    const apiFileName: string = path.basename(this.buildConfig.rootPath) + '.api.ts';
    this.logVerbose(`Output filename is "${apiFileName}"`);

    const actualApiFilePath: string = path.join(this.buildConfig.tempFolder, apiFileName);

    let foundSourceFiles: number = 0;
    const self: ApiExtractorTask = this;
    const expectedApiFilePath: string = path.join(this.taskConfig.apiReviewFolder, apiFileName);
    return gulp.src(expectedApiFilePath)
      /* tslint:disable-next-line:no-function-expression */
      .pipe(through.obj(function (file: gulpUtil.File, enc: string, callback: () => void): void {
        const expectedApiFileContent: string = (file.contents as Buffer).toString(enc);
        foundSourceFiles++;

        if (!ApiFileGenerator.areEquivalentApiFileContents(actualApiFileContent, expectedApiFileContent)) {
          if (self.buildConfig.production) {
            // For production, issue a warning that will break the CI build.
            self.logWarning('You have changed the Public API signature for this project.  Please overwrite '
              // @microsoft/gulp-core-build seems to run JSON.stringify() on the error messages for some reason,
              // so try to avoid escaped characters:
              + `'${expectedApiFilePath.replace(/\\/g, '/')}' with a copy of '${actualApiFilePath.replace(/\\/g, '/')}'`
              + ' and then request an API review. See the Git repository README.md for more info.');
          } else {
            // For a local build, just copy the file automatically.
            self.log('You have changed the Public API signature for this project.  Updating '
              +  `'${expectedApiFilePath}'`);
            fsx.writeFileSync(expectedApiFilePath, actualApiFileContent);
          }
        }

        callback();
      }, function (callback: () => void): void {
        if (foundSourceFiles === 0) {
          self.logError(`This file is missing from the "apiReviewFolder": "${expectedApiFilePath}"`
            + ` Please copy it from the project's "temp" folder and commit it.`);
        } else if (foundSourceFiles > 1) {
          self.logError(`More than one file matching "${expectedApiFilePath}" was found. This is not expected.`);
        }

        this.push(writeStringToGulpUtilFile(actualApiFileContent, apiFileName));

        callback();
      }))
      .pipe(gulp.dest(this.buildConfig.tempFolder))
      .on('finish', () => completeCallback());
  }

  private _validateConfiguration(): boolean {
    if (!this.taskConfig.entry) {
      this.logError('Missing or empty "entry" field in api-extractor.json');
      return false;
    }
    if (!this.taskConfig.apiReviewFolder) {
      this.logError('Missing or empty "apiReviewFolder" field in api-extractor.json');
      return false;
    }

    if (!fsx.existsSync(this.taskConfig.entry)) {
      this.logError(`Entry file ${this.taskConfig.entry} does not exist.`);
      return false;
    }

    return true;
  }
}
