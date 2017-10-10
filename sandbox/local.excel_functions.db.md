[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [db](local.excel_functions.db.md)

# Excel\_Functions.db method

Returns the depreciation of an asset for a specified period using the fixed-declining balance method. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
db(cost: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, salvage: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, life: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, period: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, month?: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `cost` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `salvage` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `life` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `period` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `month` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

