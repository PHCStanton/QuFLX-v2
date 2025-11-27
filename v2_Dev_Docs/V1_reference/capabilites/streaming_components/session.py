class SessionManager:
    def __init__(self):
        self.SESSION_ID = None
        self.USER_ID = None
        self.SESSION_AUTHENTICATED = False
        self.SESSION_TIMEFRAME_DETECTED = False
        self.CURRENT_ASSET = None
        self.PERIOD = None
        self.FAVORITES = []

    def process_chart_settings(self, payload):
        if not isinstance(payload, dict):
            return

        charts = payload.get('charts', {})
        for chart_id, chart_data in charts.items():
            if isinstance(chart_data, dict):
                self.PERIOD = chart_data.get('period')
                self.CURRENT_ASSET = chart_data.get('asset')
                if self.PERIOD and self.CURRENT_ASSET:
                    self.SESSION_TIMEFRAME_DETECTED = True
                    break
    
    def extract_favorites_from_payload(self, payload):
        if isinstance(payload, dict) and 'user' in payload and 'favorites' in payload['user']:
            self.FAVORITES = payload['user']['favorites']

    def process_historical_data(self, payload):
        if isinstance(payload, dict) and 'history' in payload:
            asset = payload.get('asset')
            if asset:
                self.CURRENT_ASSET = asset