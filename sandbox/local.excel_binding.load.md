[Home](./index) &gt; [local](local.md) &gt; [Excel\_Binding](local.excel_binding.md) &gt; [load](local.excel_binding.load.md)

# Excel\_Binding.load method

Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties.

**Signature:**
```javascript
load(option?: string | string[] | OfficeExtension.LoadOption): Excel.Binding;
```
**Returns:** `Excel.Binding`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `option` | `string | string[] | OfficeExtension.LoadOption` |  |

