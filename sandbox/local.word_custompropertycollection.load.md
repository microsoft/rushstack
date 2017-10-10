[Home](./index) &gt; [local](local.md) &gt; [Word\_CustomPropertyCollection](local.word_custompropertycollection.md) &gt; [load](local.word_custompropertycollection.load.md)

# Word\_CustomPropertyCollection.load method

Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties.

**Signature:**
```javascript
load(option?: string | string[] | OfficeExtension.LoadOption): Word.CustomPropertyCollection;
```
**Returns:** `Word.CustomPropertyCollection`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `option` | `string | string[] | OfficeExtension.LoadOption` |  |

