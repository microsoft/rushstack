## Important

If you change the Heft schemas, be sure to update the example files under **schemas/templates**.
The templates are used as a reference when updating the website documentation.

## Startup performance

At startup, Heft validates **heft.json**, every **heft-plugin.json** and every plugin's options without
compiling the schemas with ajv, using the fast path in **src/configuration/lean/**. The fast path only
accepts data when it can prove that the original `JsonSchema` validation would accept it; otherwise the
original validation runs (and produces the usual error messages).

The schemas in this folder must stay within the subset of JSON schema that the fast path supports
(see `LeanJsonSchema.ts`), otherwise every Heft invocation will load and compile ajv again. The unit test
**src/configuration/test/LeanJsonSchema.test.ts** fails if a schema in this folder is not supported.
