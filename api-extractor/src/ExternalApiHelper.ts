import * as ts from 'typescript';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import Extractor from './Extractor';
import ApiJsonGenerator from './generators/ApiJsonGenerator';

/**
 * ExternalApiHelper has the specific use case of generating an API json file from third party definition files.
 * This class is invoked by the gulp-core-build-typescript gulpfile, where the external package names are 
 * hard wired. 
 * The job of this method is almost the same as the API Exactractor task that is executed on first party packages, 
 * with the exception that all packages analyzed here are external packages with definition files.
 */
export default class ExternalApiHelper {

  /**
   * @param rootDir - the absolute path containing a 'package.json' file and is also a parent of the 
   * external package file. Ex: build.absolute_build_path.
   * @param libFolder - the path to the lib folder relative to the rootDir, this is where 
   * 'external-api-json/external_package.api.json' file will be written. Ex: 'lib'.
   * @param externalPackageFilePath - the path to the '*.d.ts' file of the external package relative to the rootDir. 
   * Ex: 'resources/external-api-json/es6-promise/index.t.ds'
   */
  public static generateApiJson(rootDir: string, libFolder: string, externalPackageFilePath: string): void {
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      experimentalDecorators: true,
      jsx: ts.JsxEmit.React,
      rootDir: rootDir
    };
    const extractor: Extractor = new Extractor( {
      compilerOptions: compilerOptions,
      errorHandler:
        (message: string, fileName: string, lineNumber: number): void => {
          console.log(`TypeScript error: ${message}` + os.EOL
            + `  ${fileName}#${lineNumber}`);
        }
    });

    let outputPath: string = path.join(rootDir, libFolder);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }

    outputPath = path.join(outputPath, 'external-api-json');
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }

    const externalPackageRootDir: string = path.dirname(externalPackageFilePath);
    const outputApiJsonFilePath: string = path.join(outputPath, `${path.basename(externalPackageRootDir)}.api.json`);
    const entryPointFile: string = path.join(rootDir, externalPackageFilePath);

    extractor.analyze({
      entryPointFile: entryPointFile, // local/bundles/platform-exports.ts',
      otherFiles: []
    });

    const apiJsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
    apiJsonGenerator.writeJsonFile(outputApiJsonFilePath, extractor);

  }
}
