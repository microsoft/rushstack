// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { PLUGIN_NAME as SassPluginName } from './constants';
export type { ISassPluginAccessor } from './SassPlugin';
export {
  createClassPositionRecorder,
  resolveStylesheetPositions,
  resolveSourceUrl,
  type IClassPositionRecorder,
  type IResolvedClassPosition,
  type IRawSourceMap
} from './SassDeclarationMaps';
