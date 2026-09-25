import type { CONFIGURATION_FILE_FIELD_ANNOTATION } from '@rushstack/heft-config-file/lib/ConfigurationFileAnnotation';

import type { HeftPluginConfiguration } from '../configuration/HeftPluginConfiguration';
import type { IInternalHeftSessionPlanSeed } from '../pluginFramework/InternalHeftSession';
import type { IHeftConfigurationJson } from '../utilities/CoreConfigFiles';
import type {
  HostPlanGraphEntry,
  HostPlanGraphValue,
  IHostPlan,
  IHostPlanConfiguration,
  IHostPlanGraphAnnotation,
  IHostPlanGraphNode,
  IHostPlanObjectGraph
} from './HostPlan';

interface IRestoredAnnotation {
  configurationFilePath: string | undefined;
  originalValues: Record<string, unknown>;
  schemaPropertyOriginalValue?: unknown;
}

type RestoredNode = Record<string | symbol, unknown>;

function createEmptyNode(node: IHostPlanGraphNode): RestoredNode {
  return (node.isArray ? [] : {}) as RestoredNode;
}

function restoreHostPlanObjectGraph(graph: IHostPlanObjectGraph, annotationSymbol: symbol): unknown {
  const { nodes } = graph;
  const restoredNodes: RestoredNode[] = nodes.map(createEmptyNode);

  function resolveValue(value: HostPlanGraphValue): unknown {
    if ('node' in value) {
      const restoredNode: RestoredNode | undefined = restoredNodes[value.node];
      if (restoredNode === undefined) {
        throw new Error(`The heft plan references the unknown node ${value.node}.`);
      }
      return restoredNode;
    }
    return 'json' in value ? value.json : undefined;
  }

  function assignEntries(target: Record<string, unknown>, entries: ReadonlyArray<HostPlanGraphEntry>): void {
    for (const [key, value] of entries) {
      target[key] = resolveValue(value);
    }
  }

  function restoreAnnotation(annotation: IHostPlanGraphAnnotation): IRestoredAnnotation {
    const originalValues: Record<string, unknown> = {};
    assignEntries(originalValues, annotation.originalValues);
    const restoredAnnotation: IRestoredAnnotation = {
      configurationFilePath: annotation.configurationFilePath ?? undefined,
      originalValues
    };
    if (annotation.schemaPropertyOriginalValue !== undefined) {
      restoredAnnotation.schemaPropertyOriginalValue = resolveValue(annotation.schemaPropertyOriginalValue);
    }
    return restoredAnnotation;
  }

  for (let nodeIndex: number = 0; nodeIndex < nodes.length; nodeIndex++) {
    const node: IHostPlanGraphNode = nodes[nodeIndex];
    const restoredNode: RestoredNode = restoredNodes[nodeIndex];
    assignEntries(restoredNode as Record<string, unknown>, node.entries);
    if (node.annotation) {
      restoredNode[annotationSymbol] = restoreAnnotation(node.annotation);
    }
  }

  return resolveValue({ node: graph.rootNode });
}

function getConfigurationFileFieldAnnotationSymbol(): typeof CONFIGURATION_FILE_FIELD_ANNOTATION {
  return (
    require('@rushstack/heft-config-file/lib/ConfigurationFileAnnotation') as {
      CONFIGURATION_FILE_FIELD_ANNOTATION: typeof CONFIGURATION_FILE_FIELD_ANNOTATION;
    }
  ).CONFIGURATION_FILE_FIELD_ANNOTATION;
}

function seedPluginManifests(plan: IHostPlan): void {
  const { plugins } = plan;
  if (!plugins?.length) {
    return;
  }
  const { HeftPluginConfiguration: HeftPluginConfigurationClass } =
    require('../configuration/HeftPluginConfiguration') as {
      HeftPluginConfiguration: typeof HeftPluginConfiguration;
    };
  for (const { packageRoot, manifest } of plugins) {
    HeftPluginConfigurationClass._seedHeftPluginConfigurationJson(packageRoot, manifest);
  }
}

export function createPlanSeed(
  plan: IHostPlan,
  buildFolderPath: string
): IInternalHeftSessionPlanSeed | undefined {
  const configuration: IHostPlanConfiguration | undefined = plan.config;
  if (!configuration?.heftJson || configuration.buildFolderPath !== buildFolderPath) {
    return undefined;
  }
  const heftConfigurationJson: IHeftConfigurationJson = restoreHostPlanObjectGraph(
    configuration.heftJson,
    getConfigurationFileFieldAnnotationSymbol()
  ) as IHeftConfigurationJson;
  seedPluginManifests(plan);
  return {
    heftConfigurationJson,
    debugMessages: configuration.debugMessages ?? [],
    pluginOptionsAreValidated: plan.optionsValidated === true && plan.plugins !== undefined
  };
}
