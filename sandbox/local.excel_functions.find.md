[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [find](local.excel_functions.find.md)

# Excel\_Functions.find method

Returns the starting position of one text string within another text string. FIND is case-sensitive. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
find(findText: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, withinText: string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, startNum?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `findText` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `withinText` | `string | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `startNum` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

