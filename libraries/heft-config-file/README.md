# @rushstack/heft-config-file

A library for loading JSON configuration files in the [Heft](https://rushstack.io/pages/heft/overview/) build
system. It supports `extends`-based inheritance between config files, configurable property merge strategies,
automatic path resolution, and JSON schema validation.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/libraries/heft-config-file/CHANGELOG.md) - Find
  out what's new in the latest version
- [API Reference](https://api.rushstack.io/pages/heft-config-file/)

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.

---

## Overview

`@rushstack/heft-config-file` provides a structured way to load JSON config files that:

- **Extend** a parent config file via an `"extends"` field (including across packages)
- **Merge** parent and child properties with configurable inheritance strategies (append, merge, replace, or custom)
- **Resolve paths** in property values relative to the config file, project root, or via Node.js module resolution
- **Validate** the merged result against a JSON schema
- **Support rigs** by falling back to a [rig package](https://rushstack.io/pages/heft/rig_packages/) profile if the project doesn't have its own config file

---

## For config file authors (Heft users)

If you're writing or customizing a config file that uses this system (e.g. `heft.json`, `typescript.json`, or
a plugin's config file), here's what you need to know.

### The `extends` field

Config files can inherit from a parent file using `"extends"`:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
  "extends": "@my-company/build-config/config/heft.json"
}
```

The `"extends"` value is resolved using Node.js module resolution, so it can be:

- A relative path: `"extends": "../shared/base.json"`
- A package reference: `"extends": "@my-company/rig/profiles/default/config/heft.json"`

Circular `extends` chains are detected and will throw an error.

### How property inheritance works

When a child config extends a parent, each top-level property is merged according to its **inheritance type**.
The inheritance type is configured by the package that defines the config file schema (not by the user).

The built-in inheritance types are:

| Type | Applies to | Behavior |
|------|-----------|---------|
| `replace` | any | Child value completely replaces the parent value (default for objects) |
| `append` | arrays only | Child array elements are appended after parent array elements (default for arrays) |
| `merge` | objects only | Shallow merge: child properties override parent properties, parent-only properties are kept |
| `custom` | any | A custom merge function defined by the loader |

**Setting a property to `null`** always removes the parent's value, regardless of inheritance type.

### Per-property inline override: `$propertyName.inheritanceType`

If the schema allows it, you can override the inheritance type for an individual property directly in your
config file using the `"$<propertyName>.inheritanceType"` annotation:

```json
{
  "extends": "./base.json",

  "$plugins.inheritanceType": "append",
  "plugins": [
    { "pluginName": "my-plugin" }
  ],

  "$settings.inheritanceType": "merge",
  "settings": {
    "strict": true
  }
}
```

These annotations work at any nesting level — you can annotate a nested property the same way:

```json
{
  "extends": "./base.json",

  "$d.inheritanceType": "merge",
  "d": {
    "$g.inheritanceType": "append",
    "g": [{ "h": "B" }],

    "$i.inheritanceType": "replace",
    "i": [{ "j": "B" }]
  }
}
```

The inline annotation takes precedence over any default set by the loader.

**Note:** `$propertyName.inheritanceType` is a loader-level annotation and is stripped from the final config
object; it will not appear in the merged result or be validated by the schema.

### Path resolution

Properties that represent file system paths may be automatically resolved by the loader. The resolution
method is determined by the loader's configuration, not the config file author. The original (unresolved)
value is preserved and can be retrieved via the API.

---

## For API consumers (plugin/loader authors)

If you're writing a Heft plugin that needs to load a config file, use `ProjectConfigurationFile` or
`NonProjectConfigurationFile`.

### `ProjectConfigurationFile`

Use this for config files stored at a known path relative to the project root, with optional rig support.

```typescript
import { ProjectConfigurationFile, InheritanceType, PathResolutionMethod } from '@rushstack/heft-config-file';

interface IMyPluginConfig {
  outputFolder: string;
  plugins: string[];
  settings?: {
    strict: boolean;
  };
  extends?: string;
}

const loader = new ProjectConfigurationFile<IMyPluginConfig>({
  // Path relative to the project root
  projectRelativeFilePath: 'config/my-plugin.json',

  // Provide either jsonSchemaPath or jsonSchemaObject
  jsonSchemaPath: require.resolve('./schemas/my-plugin.schema.json'),

  // Configure how properties merge when a config file uses "extends"
  propertyInheritance: {
    plugins: { inheritanceType: InheritanceType.append },
    settings: { inheritanceType: InheritanceType.merge }
    // Properties not listed here use the default for their type
  },

  // Optionally override the default inheritance for all arrays or all objects
  propertyInheritanceDefaults: {
    array: { inheritanceType: InheritanceType.append },   // built-in default
    object: { inheritanceType: InheritanceType.replace }  // built-in default
  },

  // Automatically resolve path properties to absolute paths
  jsonPathMetadata: {
    '$.outputFolder': {
      pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
    }
  }
});

// Load config for a project (throws if not found)
const config = loader.loadConfigurationFileForProject(terminal, projectPath);

// Load config with rig fallback
const config = loader.loadConfigurationFileForProject(terminal, projectPath, rigConfig);

// Returns undefined instead of throwing if the file doesn't exist
const config = loader.tryLoadConfigurationFileForProject(terminal, projectPath, rigConfig);

// Async variants are also available:
// loader.loadConfigurationFileForProjectAsync(...)
// loader.tryLoadConfigurationFileForProjectAsync(...)
```

When a `rigConfig` is provided and the project does not have its own config file, the loader falls back to
the same relative path inside the rig's profile folder.

### `NonProjectConfigurationFile`

Use this for config files at arbitrary absolute paths (not bound to a project root):

```typescript
import { NonProjectConfigurationFile } from '@rushstack/heft-config-file';

const loader = new NonProjectConfigurationFile<IMyConfig>({
  jsonSchemaPath: '/path/to/schema.json'
});

const config = loader.loadConfigurationFile(terminal, '/absolute/path/to/config.json');
// Also: tryLoadConfigurationFile, loadConfigurationFileAsync, tryLoadConfigurationFileAsync
```

### JSON schema

Supply either a file path or an inline object:

```typescript
// From a file path
{ jsonSchemaPath: require.resolve('./schemas/my-plugin.schema.json') }

// Inline
{ jsonSchemaObject: { type: 'object', properties: { ... } } }
```

Schema validation runs **after** all inheritance merging, so the schema describes the shape of the final
merged result.

### Custom validation

For validation logic that JSON schema cannot express, supply a `customValidationFunction`:

```typescript
const loader = new ProjectConfigurationFile<IMyPluginConfig>({
  projectRelativeFilePath: 'config/my-plugin.json',
  jsonSchemaPath: require.resolve('./schemas/my-plugin.schema.json'),

  customValidationFunction: (configFile, configFilePath, terminal) => {
    if (configFile.outputFolder === configFile.inputFolder) {
      terminal.writeErrorLine('outputFolder and inputFolder must be different');
      return false;
    }
    return true;
  }
});
```

The function is called after schema validation. If it returns anything other than `true`, an error is thrown.
The function may also throw its own error to provide a custom message.

### Path resolution

Use `jsonPathMetadata` to automatically resolve string properties that represent file system paths. Keys are
[JSONPath](https://jsonpath.com/) expressions, so wildcards work for arrays and nested objects:

```typescript
jsonPathMetadata: {
  // Resolve a specific property
  '$.outputFolder': {
    pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
  },

  // Resolve all "path" properties inside an array of objects
  '$.plugins.*.path': {
    pathResolutionMethod: PathResolutionMethod.resolvePathRelativeToConfigurationFile
  },

  // Node.js module resolution (like require.resolve)
  '$.loaderPackage': {
    pathResolutionMethod: PathResolutionMethod.nodeResolve
  },

  // Custom resolver
  '$.specialPath': {
    pathResolutionMethod: PathResolutionMethod.custom,
    customResolver: ({ propertyValue, configurationFilePath }) => {
      return myCustomResolve(propertyValue, configurationFilePath);
    }
  }
}
```

Available resolution methods:

| Method | Behavior |
|--------|---------|
| `resolvePathRelativeToConfigurationFile` | `path.resolve(configFileDir, value)` |
| `resolvePathRelativeToProjectRoot` | `path.resolve(projectRoot, value)` |
| `nodeResolve` | Node.js `require.resolve`-style resolution |
| `custom` | Call your own resolver function |

### Inspecting source file and original values

After loading, you can query where objects came from and what their pre-resolution values were:

```typescript
const config = loader.loadConfigurationFileForProject(terminal, projectPath);

// Which config file did this object come from?
const sourceFile = loader.getObjectSourceFilePath(config);
// e.g. "/my-project/config/my-plugin.json"

// What was the raw value of a property before path resolution?
const originalValue = loader.getPropertyOriginalValue({
  parentObject: config,
  propertyName: 'outputFolder'
});
// e.g. "./dist"  (before being resolved to an absolute path)
```

These methods work on any object that was loaded as part of the config file (including nested objects).

### Custom inheritance functions

For cases where the built-in merge strategies aren't enough:

```typescript
import { InheritanceType } from '@rushstack/heft-config-file';

const loader = new ProjectConfigurationFile<IMyConfig>({
  projectRelativeFilePath: 'config/my-plugin.json',
  jsonSchemaPath: require.resolve('./schemas/my-plugin.schema.json'),
  propertyInheritance: {
    myProperty: {
      inheritanceType: InheritanceType.custom,
      inheritanceFunction: (childValue, parentValue) => {
        // Merge logic here; return the combined result
        return { ...parentValue, ...childValue, extra: 'added' };
      }
    }
  }
});
```

The function receives `(childValue, parentValue)` and must return the merged result. It is not called if the
child sets the property to `null` — in that case the property is simply deleted.

### Inheritance precedence

When a child config file is merged with its parent, the inheritance type for each property is resolved in
this order (highest precedence first):

1. **Inline annotation** in the config file: `"$myProp.inheritanceType": "append"`
2. **`propertyInheritance`** option passed to the loader constructor
3. **`propertyInheritanceDefaults`** option (per type: `array` or `object`)
4. **Built-in defaults**: `append` for arrays, `replace` for objects

### Testing

`TestUtilities.stripAnnotations` removes the internal tracking metadata from a loaded config object,
which is useful when writing snapshot tests:

```typescript
import { TestUtilities } from '@rushstack/heft-config-file';

const config = loader.loadConfigurationFileForProject(terminal, projectPath);
expect(TestUtilities.stripAnnotations(config)).toMatchSnapshot();
```
