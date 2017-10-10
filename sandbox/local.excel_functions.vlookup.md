[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [vlookup](local.excel_functions.vlookup.md)

# Excel\_Functions.vlookup method

Looks for a value in the leftmost column of a table, and then returns a value in the same row from a column you specify. By default, the table must be sorted in an ascending order. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
vlookup(lookupValue: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, tableArray: Excel.Range | number | Excel.RangeReference | Excel.FunctionResult<any>, colIndexNum: Excel.Range | number | Excel.RangeReference | Excel.FunctionResult<any>, rangeLookup?: boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number | string | boolean>;
```
**Returns:** `FunctionResult<number | string | boolean>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `lookupValue` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `tableArray` | `Excel.Range | number | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `colIndexNum` | `Excel.Range | number | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `rangeLookup` | `boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

