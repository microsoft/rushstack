[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [averageA](local.excel_functions.averagea.md)

# Excel\_Functions.averageA method

Returns the average (arithmetic mean) of its arguments, evaluating text and FALSE in arguments as 0; TRUE evaluates as 1. Arguments can be numbers, names, arrays, or references. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
averageA(...values: Array<number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `values` | `Array<number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>>` |  |

