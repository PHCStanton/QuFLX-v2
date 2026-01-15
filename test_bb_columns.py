
import pandas as pd
import numpy as np
try:
    import pandas_ta as ta
    PANDAS_TA_AVAILABLE = True
except ImportError:
    PANDAS_TA_AVAILABLE = False

if PANDAS_TA_AVAILABLE:
    df = pd.DataFrame({"close": np.random.randn(100).cumsum()})
    bb_data = ta.bbands(df["close"], length=20, std=2.0)
    print("Columns with std=2.0:")
    print(bb_data.columns.tolist())
    
    bb_data2 = ta.bbands(df["close"], length=20, std=2)
    print("\nColumns with std=2:")
    print(bb_data2.columns.tolist())
else:
    print("pandas-ta not available")
