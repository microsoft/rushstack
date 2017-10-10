[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [varA](local.excel_functions.vara.md)

# Excel\_Functions.varA method

Estimates variance based on a sample, including logical values and text. Text and the logical value FALSE have the value 0; the logical value TRUE has the value 1. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
varA(...values: Array<number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `values` | `Array<number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>>` |  |

