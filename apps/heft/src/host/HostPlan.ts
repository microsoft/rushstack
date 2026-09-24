import type { JsonNull } from '@rushstack/node-core-library';

import type { IHeftPluginConfigurationJson } from '../configuration/HeftPluginConfiguration';

export type HostPlanGraphValue =
  | { readonly node: number }
  | { readonly json: string | number | boolean | JsonNull }
  | { readonly undefined: true };

export type HostPlanGraphEntry = readonly [key: string, value: HostPlanGraphValue];

export interface IHostPlanGraphAnnotation {
  readonly configurationFilePath?: string;
  readonly originalValues: ReadonlyArray<HostPlanGraphEntry>;
  readonly schemaPropertyOriginalValue?: HostPlanGraphValue;
}

export interface IHostPlanGraphNode {
  readonly isArray?: boolean;
  readonly entries: ReadonlyArray<HostPlanGraphEntry>;
  readonly annotation?: IHostPlanGraphAnnotation;
}

export interface IHostPlanObjectGraph {
  readonly rootNode: number;
  readonly nodes: ReadonlyArray<IHostPlanGraphNode>;
}

export interface IHostPlanConfiguration {
  readonly buildFolderPath?: string;
  readonly heftJson?: IHostPlanObjectGraph;
  readonly debugMessages?: ReadonlyArray<string>;
}

export interface IHostPlanPluginManifest {
  readonly packageRoot: string;
  readonly packageName: string;
  readonly manifest: IHeftPluginConfigurationJson;
}

export type HostPlanParameterValue = readonly [parameterName: string, data: unknown];

export interface IHostPlanCommand {
  readonly commandName: string;
  readonly unaliasedCommandName: string;
  readonly actionKind: 'phase' | 'run' | 'clean';
  readonly phaseName?: string;
  readonly watch: boolean;
  readonly aliasExpansionMessage?: string;
  readonly values: ReadonlyArray<HostPlanParameterValue>;
  readonly remainder?: ReadonlyArray<string>;
  readonly scopedValues?: ReadonlyArray<HostPlanParameterValue>;
}

export interface IHostPlan {
  readonly kind: 'heft-plan';
  readonly protocolVersion: number;
  readonly heftVersion: string;
  readonly argv: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly heftBinPath?: string;
  readonly config?: IHostPlanConfiguration;
  readonly plugins?: ReadonlyArray<IHostPlanPluginManifest>;
  readonly optionsValidated?: boolean;
  readonly command?: IHostPlanCommand;
}
