[Home](./index) &gt; [local](local.md) &gt; [Excel\_FunctionResult](local.excel_functionresult.md) &gt; [load](local.excel_functionresult.load.md)

# Excel\_FunctionResult.load method

Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties.

**Signature:**
```javascript
load(option?: string | string[] | OfficeExtension.LoadOption): FunctionResult<T>;
```
**Returns:** `FunctionResult<T>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `option` | `string | string[] | OfficeExtension.LoadOption` |  |

