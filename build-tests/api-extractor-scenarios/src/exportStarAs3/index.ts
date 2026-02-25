/**
 * Test that when exporting namespaces, we don't export members that got trimmed.
 * See this issue: https://github.com/microsoft/rushstack/issues/2791
 */
export * as NS from './NamespaceWithTrimming.ts';
