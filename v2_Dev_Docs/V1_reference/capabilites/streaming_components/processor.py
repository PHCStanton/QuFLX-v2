from datetime import datetime, timezone

class DataProcessor:
    def __init__(self, period):
        self.CANDLES = {}
        self.realtime_asset_data = {}
        self.current_asset_prices = {}
        self.PERIOD = period

    def _form_candle_from_realtime(self, asset, current_price, timestamp):
        if asset not in self.CANDLES:
            self.CANDLES[asset] = []

        if not self.CANDLES[asset]:
            new_candle = [timestamp, current_price, current_price, current_price, current_price, 1]
            self.CANDLES[asset].append(new_candle)
        else:
            last_candle = self.CANDLES[asset][-1]
            last_candle_timestamp = last_candle[0]

            if timestamp >= last_candle_timestamp + self.PERIOD:
                new_candle = [last_candle_timestamp + self.PERIOD, current_price, current_price, current_price, current_price, 1]
                self.CANDLES[asset].append(new_candle)
            else:
                last_candle[2] = current_price
                if current_price > last_candle[3]:
                    last_candle[3] = current_price
                if current_price < last_candle[4]:
                    last_candle[4] = current_price

    def process_realtime_update(self, payload):
        if not isinstance(payload, list) or len(payload) < 2:
            return

        asset_id, price_data = payload[0], payload[1]
        if not isinstance(price_data, list) or not price_data:
            return

        asset_name = str(asset_id) # Simplified asset name
        current_price = price_data[0][0]
        timestamp = int(datetime.now(timezone.utc).timestamp())

        self.current_asset_prices[asset_name] = current_price
        self._form_candle_from_realtime(asset_name, current_price, timestamp)

        if asset_name not in self.realtime_asset_data:
            self.realtime_asset_data[asset_name] = []
        self.realtime_asset_data[asset_name].append((timestamp, current_price))