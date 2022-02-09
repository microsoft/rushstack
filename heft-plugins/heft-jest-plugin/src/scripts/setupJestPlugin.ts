import { JestPlugin } from '../JestPlugin';

import type { IRunScriptOptions, IBuildStageProperties } from '@rushstack/heft';

export async function runAsync(options: IRunScriptOptions<IBuildStageProperties>): Promise<void> {
  await JestPlugin._setupJestAsync(
    options.scopedLogger,
    options.heftConfiguration,
    options.debugMode,
    options.properties
  );
}
