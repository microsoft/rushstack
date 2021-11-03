import { ConfigurationFile, IConfigurationFileOptions } from '@rushstack/heft-config-file';
import * as path from 'path';

export interface IEsbuildBuildConfiguration {
  outdir: string;
  outbase: string;
  bundle: boolean;
  entryPoints: string[];
  target: string | string[];
  format: 'iife' | 'cjs' | 'esm';
}
export interface IEsbuildConfigurationJson {
  builds: IEsbuildBuildConfiguration[];
}

let esbuildConfigurationFileLoader: ConfigurationFile<IEsbuildConfigurationJson> | undefined;

/**
 * Returns the loader for the `config/esbuild.json` config file.
 */
export function configurationFileLoader(): ConfigurationFile<IEsbuildConfigurationJson> {
  if (!esbuildConfigurationFileLoader) {
    const schemaPath: string = path.resolve(__dirname, '..', 'schemas', 'esbuild.schema.json');
    esbuildConfigurationFileLoader = new ConfigurationFile<IEsbuildConfigurationJson>({
      projectRelativeFilePath: 'config/esbuild.json',
      jsonSchemaPath: schemaPath
    } as IConfigurationFileOptions<IEsbuildConfigurationJson>);
  }

  return esbuildConfigurationFileLoader;
}
