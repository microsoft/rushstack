[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [type](local.excel_functions.type.md)

# Excel\_Functions.type method

Returns an integer representing the data type of a value: number = 1; text = 2; logical value = 4; error value = 16; array = 64. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
type(value: boolean | string | number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `value` | `boolean | string | number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

