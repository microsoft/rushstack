[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageName](./node-core-library.packagename.md)

## PackageName class

Various functions for working with package names that may include scopes.

<b>Signature:</b>

```typescript
export declare class PackageName 
```

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[combineParts(scope, unscopedName)](./node-core-library.packagename.combineparts.md)</p> | <p>`static`</p> | <p>Combines an optional package scope with an unscoped root name.</p> |
|  <p>[getScope(packageName)](./node-core-library.packagename.getscope.md)</p> | <p>`static`</p> | <p></p> |
|  <p>[getUnscopedName(packageName)](./node-core-library.packagename.getunscopedname.md)</p> | <p>`static`</p> | <p></p> |
|  <p>[isValidName(packageName)](./node-core-library.packagename.isvalidname.md)</p> | <p>`static`</p> | <p>Returns true if the specified package name is valid, or false otherwise.</p> |
|  <p>[parse(packageName)](./node-core-library.packagename.parse.md)</p> | <p>`static`</p> | <p>Same as [PackageName.tryParse()](./node-core-library.packagename.tryparse.md)<!-- -->, except this throws an exception if the input cannot be parsed.</p> |
|  <p>[tryParse(packageName)](./node-core-library.packagename.tryparse.md)</p> | <p>`static`</p> | <p>This attempts to parse a package name that may include a scope component. The packageName must not be an empty string.</p> |
|  <p>[validate(packageName)](./node-core-library.packagename.validate.md)</p> | <p>`static`</p> | <p>Throws an exception if the specified name is not a valid package name. The packageName must not be an empty string.</p> |

