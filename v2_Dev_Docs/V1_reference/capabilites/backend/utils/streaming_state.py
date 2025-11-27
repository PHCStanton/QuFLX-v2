import threading
from collections import defaultdict

class StreamingState:
    """
    Manages the state of active streams and client subscriptions in a thread-safe manner.
    """
    def __init__(self):
        self.client_counts = defaultdict(int)
        self.lock = threading.Lock()

    def add_client(self, asset):
        """Increments the client count for a given asset."""
        with self.lock:
            self.client_counts[asset] += 1

    def remove_client(self, asset):
        """Decrements the client count for a given asset."""
        with self.lock:
            if self.client_counts[asset] > 0:
                self.client_counts[asset] -= 1

    def is_asset_active(self, asset):
        """Checks if an asset has any active clients."""
        with self.lock:
            return self.client_counts.get(asset, 0) > 0

    def get_active_assets(self):
        """Returns a list of all assets with active clients."""
        with self.lock:
            return [asset for asset, count in self.client_counts.items() if count > 0]

    def get_client_counts(self):
        """Returns a dictionary of assets and their client counts."""
        with self.lock:
            return dict(self.client_counts)