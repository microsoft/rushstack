[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [findB](local.excel_functions.findb.md)

# Excel\_Functions.findB method

Finds the starting position of one text string within another text string. FINDB is case-sensitive. Use with double-byte character sets (DBCS). 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
findB(findText: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, withinText: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, startNum?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `findText` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `withinText` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `startNum` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

