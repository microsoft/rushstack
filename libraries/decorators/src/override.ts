// tslint:disable:no-any

/**
 * This decorator is applied to a class's member function or property.
 * It indicates that the definition overrides another defintion (of the same name)
 * from the base class.  The base class definition must be marked as \@virtual.
 * This decorator is currently used for documentation purposes only.
 * In the future, it may be enforced at runtime.
 *
 * @public
 */
export function override(target: Object, propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<any>): void {
  // Eventually we may implement runtime validation (e.g. in DEBUG builds)
  // but currently this decorator is only used by the build tools.
}
