import * as ts from 'typescript';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import Analyzer from './Analyzer';
import ApiJsonGenerator from './generators/ApiJsonGenerator';

export default class ExternalApiHelper {

  public static generateApiJson(rootDir: string, libFolder: string, externalPackageFilePath: string): void {
    const analyzer: Analyzer = new Analyzer(
        (message: string, fileName: string, lineNumber: number): void => {
          console.log(`TypeScript error: ${message}` + os.EOL
            + `  ${fileName}#${lineNumber}`);
        }
      );

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

    analyzer.analyze({
      compilerOptions: {
        target: ts.ScriptTarget.ES5,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        experimentalDecorators: true,
        jsx: ts.JsxEmit.React,
        rootDir: rootDir
      },
      entryPointFile: entryPointFile, // local/bundles/platform-exports.ts',
      otherFiles: []
    });

    const apiJsonGenerator: ApiJsonGenerator = new ApiJsonGenerator();
    apiJsonGenerator.writeJsonFile(outputApiJsonFilePath, analyzer);

  }
}
