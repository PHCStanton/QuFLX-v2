import redis
import json
from typing import Callable, Any, Optional
import threading
import time
from pydantic import BaseModel

class RedisClient:
    def __init__(self, host='localhost', port=6379, db=0):
        self.client = redis.Redis(host=host, port=port, db=db, decode_responses=True)

    def get_client(self):
        return self.client

class RedisPublisher(RedisClient):
    def publish(self, channel: str, message: BaseModel | dict | str):
        """
        Publishes a message to a Redis channel.
        Handles Pydantic models, dicts, and strings.
        """
        if isinstance(message, BaseModel):
            payload = message.model_dump_json()
        elif isinstance(message, dict):
            payload = json.dumps(message)
        else:
            payload = str(message)
        
        self.client.publish(channel, payload)

class RedisSubscriber(RedisClient):
    def __init__(self, host='localhost', port=6379, db=0):
        super().__init__(host, port, db)
        self.pubsub = self.client.pubsub()
        self.is_listening = False
        self.thread = None

    def subscribe(self, channel: str, callback: Callable[[dict], None]):
        """
        Subscribes to a channel and executes the callback for each message.
        """
        def handler(message):
            if message['type'] == 'message':
                try:
                    data = json.loads(message['data'])
                except json.JSONDecodeError:
                    data = message['data']
                callback(data)

        self.pubsub.subscribe(**{channel: handler})

    def start_listening(self):
        """
        Starts the listener loop in a separate thread.
        """
        if not self.is_listening:
            self.is_listening = True
            self.thread = self.pubsub.run_in_thread(sleep_time=0.001)

    def stop_listening(self):
        """
        Stops the listener thread.
        """
        if self.is_listening and self.thread:
            self.thread.stop()
            self.is_listening = False
