[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [priceMat](local.excel_functions.pricemat.md)

# Excel\_Functions.priceMat method

Returns the price per $100 face value of a security that pays interest at maturity. 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
priceMat(settlement: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, maturity: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, issue: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, rate: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, yld: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, basis?: number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `settlement` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `maturity` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `issue` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `rate` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `yld` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `basis` | `number | string | boolean | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |

