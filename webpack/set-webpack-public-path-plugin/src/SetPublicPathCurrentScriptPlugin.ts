// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type webpack from 'webpack';

import { SetPublicPathPluginBase } from './SetPublicPathPluginBase.ts';

const PLUGIN_NAME: string = 'set-webpack-public-path-current-script-plugin';

const CURRENT_SCRIPT_VARIABLE_NAME: string = '__RUSHSTACK_CURRENT_SCRIPT__';
const PUBLIC_PATH_VARIABLE_NAME: string = '_publicPath';

type JavascriptModulesPluginHooks = ReturnType<
  typeof webpack.javascript.JavascriptModulesPlugin.getCompilationHooks
>;
type CodeGenerationResults = Parameters<
  Parameters<JavascriptModulesPluginHooks['render']['tap']>[1]
>[1]['codeGenerationResults'];

/**
 * This simple plugin wraps the webpack bundle in an IIFE that sets a the `document.currentScript` value to a variable
 * that is then used to populate the `__webpack_public_path__` variable.
 *
 * @public
 */
export class SetPublicPathCurrentScriptPlugin extends SetPublicPathPluginBase {
  public constructor() {
    super(PLUGIN_NAME);
  }

  protected _applyCompilation(thisWebpack: typeof webpack, compilation: webpack.Compilation): void {
    const outputLibraryType: string | undefined = compilation.options.output.library?.type;

    class SetPublicPathRuntimeModule extends thisWebpack.RuntimeModule {
      public constructor() {
        super('publicPath', thisWebpack.RuntimeModule.STAGE_BASIC);
      }

      public generate(): string {
        return [
          `var ${PUBLIC_PATH_VARIABLE_NAME} = ${CURRENT_SCRIPT_VARIABLE_NAME} ? ${CURRENT_SCRIPT_VARIABLE_NAME}.src : '';`,
          `${thisWebpack.RuntimeGlobals.publicPath} = ${PUBLIC_PATH_VARIABLE_NAME}.slice(0, ${PUBLIC_PATH_VARIABLE_NAME}.lastIndexOf('/') + 1);`
        ].join('\n');
      }
    }

    const runtimeModule: SetPublicPathRuntimeModule = new SetPublicPathRuntimeModule();

    function appliesToChunk(chunk: webpack.Chunk, codeGenerationResults: CodeGenerationResults): boolean {
      return chunk.hasRuntime() && codeGenerationResults.has(runtimeModule, chunk.runtime);
    }

    compilation.hooks.runtimeRequirementInTree
      .for(thisWebpack.RuntimeGlobals.publicPath)
      .tap(PLUGIN_NAME, (chunk: webpack.Chunk, set: Set<string>) => {
        compilation.addRuntimeModule(chunk, runtimeModule);
      });

    const javascriptModulesPluginHooks: JavascriptModulesPluginHooks =
      thisWebpack.javascript.JavascriptModulesPlugin.getCompilationHooks(compilation);

    javascriptModulesPluginHooks.render.tap(
      { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
      (source, { codeGenerationResults, chunk }) => {
        if (appliesToChunk(chunk, codeGenerationResults)) {
          return new thisWebpack.sources.ConcatSource(
            `(()=>{ var ${CURRENT_SCRIPT_VARIABLE_NAME} = document.currentScript; `,
            source,
            '})();'
          );
        } else {
          return source;
        }
      }
    );

    javascriptModulesPluginHooks.chunkHash.tap(PLUGIN_NAME, (chunk, hash, { codeGenerationResults }) => {
      hash.update(PLUGIN_NAME);
      if (appliesToChunk(chunk, codeGenerationResults)) {
        hash.update('set-public-path');
      }
    });

    compilation.hooks.afterSeal.tap(PLUGIN_NAME, () => {
      let hasProblematicLibraryType: boolean = false;
      switch (outputLibraryType) {
        case 'var':
        case 'module':
          hasProblematicLibraryType = true;
          break;
      }

      if (hasProblematicLibraryType) {
        const codeGenerationResults: CodeGenerationResults | undefined = compilation.codeGenerationResults;
        if (!codeGenerationResults) {
          compilation.errors.push(
            new thisWebpack.WebpackError(
              `${PLUGIN_NAME}: codeGenerationResults is undefined in afterSeal. This is unexpected and may indicate a misconfiguration or bug.`
            )
          );
          return;
        }
        let appliesToAnyChunk: boolean = false;
        for (const chunk of compilation.chunks) {
          if (appliesToChunk(chunk, codeGenerationResults)) {
            appliesToAnyChunk = true;
            break;
          }
        }

        if (appliesToAnyChunk) {
          compilation.errors.push(
            new thisWebpack.WebpackError(
              `The "${outputLibraryType}" output.library.type is not supported by the ${SetPublicPathCurrentScriptPlugin.name}` +
                ' plugin. Including this plugin with produce unexpected or invalid results.'
            )
          );
        }
      }
    });
  }
}
