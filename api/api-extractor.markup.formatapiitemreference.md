[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Markup](./api-extractor.markup.md) &gt; [formatApiItemReference](./api-extractor.markup.formatapiitemreference.md)

# Markup.formatApiItemReference method

This formats an IApiItemReference as its AEDoc notation.

**Signature:**
```javascript
static formatApiItemReference(apiItemReference: IApiItemReference): string;
```
**Returns:** `string`

## Remarks

Depending on the provided components, example return values might look like "@ms/my-library:SomeClass.someProperty", "my-library:SomeClass", "SomeClass", or "SomeClass.someProperty".

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `apiItemReference` | `IApiItemReference` |  |

