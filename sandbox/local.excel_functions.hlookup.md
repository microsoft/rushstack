[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [hlookup](local.excel_functions.hlookup.md)

# Excel\_Functions.hlookup method

Looks for a value in the top row of a table or array of values and returns the value in the same column from a row you specify. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
hlookup(lookupValue: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, tableArray: Excel.Range | number | Excel.RangeReference | Excel.FunctionResult<any>, rowIndexNum: Excel.Range | number | Excel.RangeReference | Excel.FunctionResult<any>, rangeLookup?: boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number | string | boolean>;
```
**Returns:** `FunctionResult<number | string | boolean>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `lookupValue` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `tableArray` | `Excel.Range | number | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `rowIndexNum` | `Excel.Range | number | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `rangeLookup` | `boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

