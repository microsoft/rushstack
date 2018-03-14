[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [Markup](./api-extractor.markup.md) &gt; [createApiLinkFromText](./api-extractor.markup.createapilinkfromtext.md)

# Markup.createApiLinkFromText method

Constructs an IMarkupApiLink element that represents a hyperlink to the specified API object. The hyperlink is applied to a plain text string.

**Signature:**
```javascript
static createApiLinkFromText(text: string, target: IApiItemReference): IMarkupApiLink;
```
**Returns:** `IMarkupApiLink`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `text` | `string` | the text string that will serve as the link text |
|  `target` | `IApiItemReference` | the API object that the hyperlink will point to |

