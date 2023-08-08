// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfigurationProject } from './RushConfigurationProject';
import { SelectorExpression } from './SelectorExpressions';

/**
 * This interface allows a previously constructed RushProjectSelector to be passed around
 * and used by other lower-level objects. (For example, the "json:" selector reads and
 * parses an entire new selector expression, which might in turn load another selector
 * expression and parse it.)
 */
export interface IRushProjectSelector {
  selectExpression(expr: SelectorExpression, context: string): Promise<ReadonlySet<RushConfigurationProject>>;
}
