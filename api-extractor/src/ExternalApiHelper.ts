import * as ts from 'typescript';
import * as os from 'os';
import Analyzer from './Analyzer';
import ApiJsonGenerator from './generators/ApiJsonGenerator';

export default class ExternalApiHelper {

  public static generateApiJson(rootDir: string, entryPointFile: string, outputApiJsonFilePath: string): void {
    const analyzer: Analyzer = new Analyzer(
        (message: string, fileName: string, lineNumber: number): void => {
          console.log(`TypeScript error: ${message}` + os.EOL
            + `  ${fileName}#${lineNumber}`);
        }
      );

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
