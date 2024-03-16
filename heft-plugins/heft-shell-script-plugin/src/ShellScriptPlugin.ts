import type { IHeftPlugin, HeftSession, HeftConfiguration, ScopedLogger } from '@rushstack/heft';
import { JsonSchema } from '@rushstack/node-core-library';
import chokidar from 'chokidar';
import { ShellScript } from './ShellScript';
import { runShellCommand } from './utils';

const PLUGIN_NAME: string = 'ShellScriptPlugin';
const PLUGIN_SCHEMA_PATH: string = `${__dirname}/schemas/heft-shell-script-plugin.schema.json`;

/**
 * @public
 */
export interface IShellScriptPluginOptions {
  scripts: ShellScript[];
}

export class ShellScriptPlugin implements IHeftPlugin<IShellScriptPluginOptions> {
  public readonly pluginName: string = PLUGIN_NAME;
  public readonly optionsSchema: JsonSchema = JsonSchema.fromFile(PLUGIN_SCHEMA_PATH);

  public apply(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    options: IShellScriptPluginOptions
  ): void {
    options.scripts.forEach((shellScript) => {
      const logger: ScopedLogger = heftSession.requestScopedLogger(shellScript.name);

      const run = async (watchMode: boolean): Promise<void> => {
        try {
          await runShellCommand(heftConfiguration, shellScript.command);
          logger.terminal.writeLine('Finished running command.');
          if (watchMode) {
            if ('watchCommand' in shellScript) {
              await runShellCommand(heftConfiguration, shellScript.watchCommand);
              logger.emitError(new Error('Command completed during watch mode, this should never happen.'));
            } else if ('watchGlobs' in shellScript) {
              const watcher: chokidar.FSWatcher = chokidar.watch(shellScript.watchGlobs, {
                cwd: heftConfiguration.buildFolder
              });
              watcher.on('change', async () => {
                logger.terminal.writeLine('Detected changes, rerunning command.');
                await runShellCommand(heftConfiguration, shellScript.command);
              });
              watcher.on('error', (error) => logger.emitError(error));
            } else {
              logger.terminal.writeWarningLine('No watch configuration specified.');
            }
          }
        } catch (error) {
          logger.emitError(error instanceof Error ? error : new Error('Unknown error.'));
        }
      };

      switch (shellScript.stage) {
        case 'clean':
          heftSession.hooks.clean.tap(PLUGIN_NAME, (clean) => {
            clean.hooks.run.tapPromise(PLUGIN_NAME, () => run(false));
          });
          break;
        case 'pre-compile':
          heftSession.hooks.build.tap(PLUGIN_NAME, (build) => {
            build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile) => {
              preCompile.hooks.run.tapPromise(PLUGIN_NAME, () => run(build.properties.watchMode));
            });
          });
          break;
        case 'compile':
          heftSession.hooks.build.tap(PLUGIN_NAME, (build) => {
            build.hooks.compile.tap(PLUGIN_NAME, (compile) => {
              compile.hooks.run.tapPromise(PLUGIN_NAME, () => run(build.properties.watchMode));
            });
          });
          break;
        case 'post-build':
          heftSession.hooks.build.tap(PLUGIN_NAME, (build) => {
            build.hooks.postBuild.tap(PLUGIN_NAME, (postBuild) => {
              postBuild.hooks.run.tapPromise(PLUGIN_NAME, () => run(build.properties.watchMode));
            });
          });
          break;
        case 'bundle':
          heftSession.hooks.build.tap(PLUGIN_NAME, (build) => {
            build.hooks.bundle.tap(PLUGIN_NAME, (bundle) => {
              bundle.hooks.run.tapPromise(PLUGIN_NAME, () => run(build.properties.watchMode));
            });
          });
          break;
        case 'pre-test':
          heftSession.hooks.test.tap(PLUGIN_NAME, (test) => {
            test.hooks.configureTest.tapPromise(PLUGIN_NAME, () => run(test.properties.watchMode));
          });
          break;
        case 'test':
          heftSession.hooks.test.tap(PLUGIN_NAME, (test) => {
            test.hooks.run.tapPromise(PLUGIN_NAME, () => run(test.properties.watchMode));
          });
          break;
      }
    });
  }
}
