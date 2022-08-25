/**
 * Will be renamed to avoid a name conflict with the exported `DuplicateName` from
 * index.ts.
 * @public
 */
type DuplicateName = number;

/** @public */
export function someFunction2(): DuplicateName {
  return 5;
}

/** @public */
class AnotherDuplicateName {}

/** @public */
export function someFunction7(): AnotherDuplicateName {
  return new AnotherDuplicateName();
}
