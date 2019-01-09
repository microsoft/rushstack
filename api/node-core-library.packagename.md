[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageName](./node-core-library.packagename.md)

## PackageName class

Various functions for working with package names that may include scopes.

<b>Signature:</b>

```typescript
export declare class PackageName 
```

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [combineParts(scope, unscopedName)](./node-core-library.packagename.combineparts.md) | `static` | Combines an optional package scope with an unscoped root name. |
|  [getScope(packageName)](./node-core-library.packagename.getscope.md) | `static` |  |
|  [getUnscopedName(packageName)](./node-core-library.packagename.getunscopedname.md) | `static` |  |
|  [isValidName(packageName)](./node-core-library.packagename.isvalidname.md) | `static` | Returns true if the specified package name is valid, or false otherwise. |
|  [parse(packageName)](./node-core-library.packagename.parse.md) | `static` | Same as [PackageName.tryParse()](./node-core-library.packagename.tryparse.md)<!-- -->, except this throws an exception if the input cannot be parsed. |
|  [tryParse(packageName)](./node-core-library.packagename.tryparse.md) | `static` | This attempts to parse a package name that may include a scope component. The packageName must not be an empty string. |
|  [validate(packageName)](./node-core-library.packagename.validate.md) | `static` | Throws an exception if the specified name is not a valid package name. The packageName must not be an empty string. |

