[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [lookup](local.excel_functions.lookup.md)

# Excel\_Functions.lookup method

Looks up a value either from a one-row or one-column range or from an array. Provided for backward compatibility. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
lookup(lookupValue: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, lookupVector: Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, resultVector?: Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number | string | boolean>;
```
**Returns:** `FunctionResult<number | string | boolean>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `lookupValue` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `lookupVector` | `Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `resultVector` | `Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

