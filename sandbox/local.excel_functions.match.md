[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [match](local.excel_functions.match.md)

# Excel\_Functions.match method

Returns the relative position of an item in an array that matches a specified value in a specified order. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
match(lookupValue: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, lookupArray: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, matchType?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `lookupValue` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `lookupArray` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `matchType` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

