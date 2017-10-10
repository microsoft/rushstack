[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [choose](local.excel_functions.choose.md)

# Excel\_Functions.choose method

Chooses a value or action to perform from a list of values, based on an index number. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
choose(indexNum: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, ...values: Array<Excel.Range | number | string | boolean | Excel.RangeReference | Excel.FunctionResult<any>>): FunctionResult<number | string | boolean>;
```
**Returns:** `FunctionResult<number | string | boolean>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `indexNum` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `values` | `Array<Excel.Range | number | string | boolean | Excel.RangeReference | Excel.FunctionResult<any>>` |  |

