/**
 * Test that when exporting namespaces, we don't export members that got trimmed.
 * See this issue: https://github.com/microsoft/rushstack/issues/2791
 */
import * as NS from './NamespaceWithTrimming.ts';
export { NS };
