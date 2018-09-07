[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageName](./node-core-library.packagename.md)

# PackageName class

Various functions for working with package names that may include scopes.

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`combineParts(scope, unscopedName)`](./node-core-library.packagename.combineparts.md) |  | `string` | Combines an optional package scope with an unscoped root name. |
|  [`getScope(packageName)`](./node-core-library.packagename.getscope.md) |  | `string` | The parsed NPM scope, or an empty string if there was no scope. The scope value will always include the at-sign. |
|  [`getUnscopedName(packageName)`](./node-core-library.packagename.getunscopedname.md) |  | `string` | The parsed NPM package name without the scope. |
|  [`isValidName(packageName)`](./node-core-library.packagename.isvalidname.md) |  | `boolean` | Returns true if the specified package name is valid, or false otherwise. |
|  [`parse(packageName)`](./node-core-library.packagename.parse.md) |  | `IParsedPackageName` | Same as [PackageName.tryParse](./node-core-library.packagename.tryparse.md)<!-- -->, except this throws an exception if the input cannot be parsed. |
|  [`tryParse(packageName)`](./node-core-library.packagename.tryparse.md) |  | `IParsedPackageNameOrError` | This attempts to parse a package name that may include a scope component. The packageName must not be an empty string. |
|  [`validate(packageName)`](./node-core-library.packagename.validate.md) |  | `void` | Throws an exception if the specified name is not a valid package name. The packageName must not be an empty string. |

