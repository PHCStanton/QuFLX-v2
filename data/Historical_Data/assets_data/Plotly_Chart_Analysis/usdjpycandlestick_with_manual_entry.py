import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import io

# Full data from the provided CSV
data = """
timestamp,open,close,high,low
2025-10-15 03:40:00Z,153.118,153.142,153.152,153.094
2025-10-15 03:41:00Z,153.142,153.146,153.153,153.123
2025-10-15 03:42:00Z,153.146,153.147,153.152,153.116
2025-10-15 03:43:00Z,153.147,153.107,153.151,153.104
2025-10-15 03:44:00Z,153.107,153.15,153.152,153.107
2025-10-15 03:45:00Z,153.153,153.199,153.204,153.147
2025-10-15 03:46:00Z,153.199,153.215,153.232,153.186
2025-10-15 03:47:00Z,153.215,153.199,153.215,153.187
2025-10-15 03:48:00Z,153.199,153.179,153.21,153.165
2025-10-15 03:49:00Z,153.179,153.187,153.207,153.162
2025-10-15 03:50:00Z,153.186,153.2,153.209,153.179
2025-10-15 03:51:00Z,153.198,153.153,153.208,153.153
2025-10-15 03:52:00Z,153.151,153.199,153.199,153.145
2025-10-15 03:53:00Z,153.199,153.159,153.205,153.154
2025-10-15 03:54:00Z,153.159,153.15,153.175,153.133
2025-10-15 03:55:00Z,153.15,153.182,153.199,153.15
2025-10-15 03:56:00Z,153.179,153.209,153.219,153.178
2025-10-15 03:57:00Z,153.207,153.196,153.216,153.182
2025-10-15 03:58:00Z,153.196,153.205,153.214,153.186
2025-10-15 03:59:00Z,153.202,153.201,153.267,153.199
2025-10-15 04:00:00Z,153.201,153.158,153.207,153.145
2025-10-15 04:01:00Z,153.159,153.169,153.197,153.155
2025-10-15 04:02:00Z,153.171,153.164,153.18,153.146
2025-10-15 04:03:00Z,153.166,153.149,153.169,153.119
2025-10-15 04:04:00Z,153.151,153.196,153.198,153.138
2025-10-15 04:05:00Z,153.193,153.128,153.193,153.128
2025-10-15 04:06:00Z,153.126,153.142,153.15,153.11
2025-10-15 04:07:00Z,153.142,153.105,153.142,153.094
2025-10-15 04:08:00Z,153.102,153.09,153.107,153.076
2025-10-15 04:09:00Z,153.09,153.064,153.105,153.064
2025-10-15 04:10:00Z,153.064,153.079,153.108,153.064
2025-10-15 04:11:00Z,153.079,153.035,153.087,153.023
2025-10-15 04:12:00Z,153.035,153.003,153.038,153.003
2025-10-15 04:13:00Z,153.006,152.996,153.03,152.996
2025-10-15 04:14:00Z,152.994,152.99,152.998,152.973
2025-10-15 04:15:00Z,152.989,152.976,153,152.974
2025-10-15 04:16:00Z,152.976,152.958,152.984,152.947
2025-10-15 04:17:00Z,152.958,152.953,152.976,152.931
2025-10-15 04:18:00Z,152.953,152.923,152.961,152.918
2025-10-15 04:19:00Z,152.927,152.913,152.938,152.898
2025-10-15 04:20:00Z,152.913,152.916,152.923,152.902
2025-10-15 04:21:00Z,152.919,152.935,152.958,152.907
2025-10-15 04:22:00Z,152.936,152.925,152.94,152.918
2025-10-15 04:23:00Z,152.926,153.007,153.019,152.926
2025-10-15 04:24:00Z,153.007,153.052,153.052,152.993
2025-10-15 04:25:00Z,153.045,153.001,153.045,152.984
2025-10-15 04:26:00Z,153,153.004,153.043,152.992
2025-10-15 04:27:00Z,153.004,153.018,153.038,153.003
2025-10-15 04:28:00Z,153.018,152.983,153.034,152.98
2025-10-15 04:29:00Z,152.983,152.946,152.987,152.94
2025-10-15 04:30:00Z,152.946,152.926,152.951,152.917
2025-10-15 04:31:00Z,152.926,152.932,152.958,152.912
2025-10-15 04:32:00Z,152.932,152.86,152.934,152.856
2025-10-15 04:33:00Z,152.86,152.853,152.873,152.828
2025-10-15 04:34:00Z,152.853,152.85,152.895,152.845
2025-10-15 04:35:00Z,152.853,152.841,152.875,152.841
2025-10-15 04:36:00Z,152.84,152.868,152.868,152.816
2025-10-15 04:37:00Z,152.864,152.885,152.89,152.86
2025-10-15 04:38:00Z,152.885,152.916,152.924,152.882
2025-10-15 04:39:00Z,152.916,152.954,152.954,152.916
2025-10-15 04:40:00Z,152.954,152.988,153.009,152.954
2025-10-15 04:41:00Z,152.99,153.033,153.039,152.97
2025-10-15 04:42:00Z,153.031,153.053,153.059,153.019
2025-10-15 04:43:00Z,153.051,153.086,153.089,153.051
2025-10-15 04:44:00Z,153.086,153.077,153.099,153.071
2025-10-15 04:45:00Z,153.078,153.099,153.104,153.067
2025-10-15 04:46:00Z,153.097,153.069,153.113,153.061
2025-10-15 04:47:00Z,153.067,153.078,153.085,153.05
2025-10-15 04:48:00Z,153.076,153.099,153.135,153.073
2025-10-15 04:49:00Z,153.1,153.122,153.123,153.1
2025-10-15 04:50:00Z,153.123,153.136,153.147,153.113
2025-10-15 04:51:00Z,153.135,153.127,153.137,153.097
2025-10-15 04:52:00Z,153.131,153.19,153.19,153.128
2025-10-15 04:53:00Z,153.19,153.204,153.21,153.166
2025-10-15 04:54:00Z,153.204,153.189,153.208,153.179
2025-10-15 04:55:00Z,153.189,153.259,153.267,153.189
2025-10-15 04:56:00Z,153.259,153.254,153.284,153.25
2025-10-15 04:57:00Z,153.253,153.234,153.253,153.212
2025-10-15 04:58:00Z,153.234,153.227,153.251,153.217
2025-10-15 04:59:00Z,153.227,153.2,153.227,153.193
2025-10-15 05:00:00Z,153.2,153.182,153.211,153.182
2025-10-15 05:01:00Z,153.182,153.142,153.193,153.135
2025-10-15 05:02:00Z,153.142,153.101,153.155,153.099
2025-10-15 05:03:00Z,153.097,153.052,153.102,153.049
2025-10-15 05:04:00Z,153.052,153.05,153.057,153.025
2025-10-15 05:05:00Z,153.05,153.03,153.066,153.018
2025-10-15 05:06:00Z,153.03,153.026,153.043,153.018
2025-10-15 05:07:00Z,153.027,152.996,153.027,152.988
2025-10-15 05:08:00Z,152.994,152.983,152.998,152.947
2025-10-15 05:09:00Z,152.981,152.962,152.995,152.934
2025-10-15 05:10:00Z,152.961,153.02,153.02,152.944
2025-10-15 05:11:00Z,153.021,153.05,153.072,153.021
2025-10-15 05:12:00Z,153.054,153.023,153.054,153
2025-10-15 05:13:00Z,153.024,153.034,153.046,153.02
2025-10-15 05:14:00Z,153.033,153.011,153.04,153.008
2025-10-15 05:15:00Z,153.018,152.951,153.024,152.951
2025-10-15 05:16:00Z,152.951,152.936,152.965,152.917
2025-10-15 05:17:00Z,152.936,152.889,152.945,152.885
2025-10-15 05:18:00Z,152.889,152.891,152.897,152.88
2025-10-15 05:19:00Z,152.892,152.887,152.896,152.878
"""

# Read data into DataFrame
df = pd.read_csv(io.StringIO(data))
df['timestamp'] = pd.to_datetime(df['timestamp'])

# Calculate EMAs
df['EMA21'] = df['close'].ewm(span=21, adjust=False).mean()
df['EMA50'] = df['close'].ewm(span=50, adjust=False).mean()
df['EMA89'] = df['close'].ewm(span=89, adjust=False).mean()

# Calculate DeMarker (Period = 10)
def calculate_demarker(data, period=10):
    high_diff = data['high'] - data['high'].shift(1)
    low_diff = data['low'].shift(1) - data['low']
    de_max = high_diff.where(high_diff > 0, 0)
    de_min = low_diff.where(low_diff > 0, 0)
    de_marker = de_max.rolling(window=period).sum() / (de_max.rolling(window=period).sum() + de_min.rolling(window=period).sum())
    return de_marker

df['DeMarker'] = calculate_demarker(df)

# Proper STC (Schaff Trend Cycle) Implementation
def calculate_stc(data, fast_period=23, slow_period=50, cycle_period=10, smooth1=3, smooth2=3):
    """
    Calculate Schaff Trend Cycle (STC) - oscillates between 0-100
    STC combines trend-following and momentum oscillator characteristics
    """
    close = data['close']
    
    # Step 1: Calculate MACD
    ema_fast = close.ewm(span=fast_period, adjust=False).mean()
    ema_slow = close.ewm(span=slow_period, adjust=False).mean()
    macd = ema_fast - ema_slow
    
    # Step 2: Apply Stochastic to MACD over cycle period
    def stochastic(series, period):
        lowest_low = series.rolling(window=period).min()
        highest_high = series.rolling(window=period).max()
        k_percent = 100 * ((series - lowest_low) / (highest_high - lowest_low))
        return k_percent.fillna(0)
    
    # First stochastic application
    stoch1 = stochastic(macd, cycle_period)
    
    # Step 3: Smooth the first stochastic
    pf = stoch1.ewm(span=smooth1, adjust=False).mean()
    
    # Step 4: Apply stochastic again to the smoothed result
    stoch2 = stochastic(pf, cycle_period)
    
    # Step 5: Final smoothing to get STC
    stc = stoch2.ewm(span=smooth2, adjust=False).mean()
    
    return stc

df['STC'] = calculate_stc(df)
# STC oscillates 0-100: >75 overbought, <25 oversold, 50 neutral

# Calculate Awesome Oscillator (Short = 5, Long = 12)
df['median'] = (df['high'] + df['low']) / 2
df['AO'] = df['median'].rolling(window=5).mean() - df['median'].rolling(window=12).mean()

# Calculate CCI (Period = 20)
def calculate_cci(data, period=20):
    tp = (data['high'] + data['low'] + data['close']) / 3
    mean_tp = tp.rolling(window=period).mean()
    mean_dev = (tp - mean_tp).abs().rolling(window=period).mean()
    cci = (tp - mean_tp) / (0.015 * mean_dev)
    return cci

df['CCI'] = calculate_cci(df)

# Identify entry points based on confluence
df['prev_EMA21'] = df['EMA21'].shift(1)
df['buy_signal'] = (df['EMA21'] > df['EMA50']) & (df['prev_EMA21'] <= df['EMA50']) & (df['EMA21'] > df['EMA89']) & \
                   (df['DeMarker'] < 0.3) & (df['STC'] < 20) & (df['AO'] > 0) & (df['CCI'] > -100)
df['sell_signal'] = (df['EMA21'] < df['EMA50']) & (df['prev_EMA21'] >= df['EMA50']) & (df['EMA21'] < df['EMA89']) & \
                    (df['DeMarker'] > 0.7) & (df['STC'] > 80) & (df['AO'] < 0) & (df['CCI'] < 100)

# Create candlestick chart with subplots
fig = make_subplots(
    rows=5, cols=1,
    shared_xaxes=True,
    vertical_spacing=0.02,
    subplot_titles=('Price Chart', 'STC', 'DeMarker', 'Awesome Oscillator', 'CCI'),
    row_heights=[0.5, 0.125, 0.125, 0.125, 0.125]
)

# Add candlestick to main chart (row 1)
fig.add_trace(go.Candlestick(
    x=df['timestamp'],
    open=df['open'],
    high=df['high'],
    low=df['low'],
    close=df['close'],
    name='Candlestick'
), row=1, col=1)

# Add EMAs to main chart (row 1)
fig.add_trace(go.Scatter(x=df['timestamp'], y=df['EMA21'], line=dict(color='blue', width=1), name='EMA 21'), row=1, col=1)
fig.add_trace(go.Scatter(x=df['timestamp'], y=df['EMA50'], line=dict(color='white', width=1), name='EMA 50'), row=1, col=1)
fig.add_trace(go.Scatter(x=df['timestamp'], y=df['EMA89'], line=dict(color='red', width=1), name='EMA 89'), row=1, col=1)

# Add buy signals to main chart (row 1)
buy_signals = df[df['buy_signal']]
fig.add_trace(go.Scatter(
    x=buy_signals['timestamp'],
    y=buy_signals['low'] * 0.999,
    mode='markers',
    marker=dict(symbol='triangle-up', size=10, color='green'),
    name='Buy Signal'
), row=1, col=1)

# Add sell signals to main chart (row 1)
sell_signals = df[df['sell_signal']]
fig.add_trace(go.Scatter(
    x=sell_signals['timestamp'],
    y=sell_signals['high'] * 1.001,
    mode='markers',
    marker=dict(symbol='triangle-down', size=10, color='red'),
    name='Sell Signal'
), row=1, col=1)

# Add manual entry point (smaller, precise circle at 03:45) to main chart
fig.add_shape(
    type="circle",
    x0="2025-10-15 03:45:00Z",
    y0=153.18,
    x1="2025-10-15 03:45:00Z",
    y1=153.20,
    line_color="green",
    fillcolor="green",
    opacity=0.5,
    name="Manual Buy",
    row=1, col=1
)

# Add subplots for indicators
# STC with reference lines (0-100 oscillator)
fig.add_trace(go.Scatter(x=df['timestamp'], y=df['STC'], line=dict(color='cyan', width=2), name='STC'), row=2, col=1)

# Add STC reference lines (overbought/oversold levels)
fig.add_hline(y=75, line_dash="dash", line_color="red", opacity=0.7, row=2, col=1)  # Overbought
fig.add_hline(y=25, line_dash="dash", line_color="green", opacity=0.7, row=2, col=1)  # Oversold
fig.add_hline(y=50, line_dash="dot", line_color="gray", opacity=0.5, row=2, col=1)  # Midline
fig.add_trace(go.Scatter(x=df['timestamp'], y=df['DeMarker'], line=dict(color='purple'), name='DeMarker'), row=3, col=1)
fig.add_trace(go.Scatter(x=df['timestamp'], y=df['AO'], line=dict(color='orange'), name='AO'), row=4, col=1)
fig.add_trace(go.Scatter(x=df['timestamp'], y=df['CCI'], line=dict(color='yellow'), name='CCI'), row=5, col=1)

# Update layout
fig.update_layout(
    title='USDJPY 1-Minute Candlestick Chart with All Indicators',
    template='plotly_dark',
    showlegend=True,
    height=1200
)

# Update x-axis labels
fig.update_xaxes(title_text="Time", row=5, col=1)

# Update y-axis labels
fig.update_yaxes(title_text="Price", row=1, col=1)
fig.update_yaxes(title_text="STC", row=2, col=1)
fig.update_yaxes(title_text="DeMarker", row=3, col=1)
fig.update_yaxes(title_text="AO", row=4, col=1)
fig.update_yaxes(title_text="CCI", row=5, col=1)

# Save the chart as an HTML file
fig.write_html('data/Historical_Data/assets_data/Plotly_Chart_Analysis/usdjpycandlestick_with_manual_entry.html')
print("Chart has been saved as 'usdjpycandlestick_with_manual_entry.html'. Open this file in a web browser to view the chart.")