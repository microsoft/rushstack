[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [ddb](local.excel_functions.ddb.md)

# Excel\_Functions.ddb method

Returns the depreciation of an asset for a specified period using the double-declining balance method or some other method you specify. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
ddb(cost: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, salvage: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, life: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, period: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, factor?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `cost` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `salvage` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `life` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `period` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `factor` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

