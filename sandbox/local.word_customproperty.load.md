[Home](./index) &gt; [local](local.md) &gt; [Word\_CustomProperty](local.word_customproperty.md) &gt; [load](local.word_customproperty.load.md)

# Word\_CustomProperty.load method

Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties.

**Signature:**
```javascript
load(option?: string | string[] | OfficeExtension.LoadOption): Word.CustomProperty;
```
**Returns:** `Word.CustomProperty`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `option` | `string | string[] | OfficeExtension.LoadOption` |  |

