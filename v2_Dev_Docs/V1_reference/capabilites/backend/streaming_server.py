import os
import logging
from flask import Flask, jsonify
from flask_socketio import SocketIO, emit
from backend.db_integrations.redis_integration import RedisIntegration
from backend.utils.streaming_state import StreamingState

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Initialize Flask app and SocketIO
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'a_secure_default_secret_key')
socketio = SocketIO(app, cors_allowed_origins="*")

# Initialize Redis and StreamingState
redis_integration = RedisIntegration()
streaming_state = StreamingState()

@socketio.on('connect')
def handle_connect():
    """Handles a new client connection."""
    logging.info("Client connected")
    emit('status', {'message': 'Connected to QuFLX Streaming Server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handles a client disconnection."""
    logging.info("Client disconnected")

@socketio.on('subscribe')
def handle_subscribe(data):
    """
    Subscribes a client to a specific asset stream.
    """
    asset = data.get('asset')
    if not asset:
        emit('error', {'message': 'Asset not provided for subscription'})
        return

    streaming_state.add_client(asset)
    logging.info(f"Client subscribed to asset: {asset}")
    emit('status', {'message': f'Subscribed to {asset}'})

@socketio.on('unsubscribe')
def handle_unsubscribe(data):
    """
    Unsubscribes a client from a specific asset stream.
    """
    asset = data.get('asset')
    if not asset:
        emit('error', {'message': 'Asset not provided for unsubscription'})
        return

    streaming_state.remove_client(asset)
    logging.info(f"Client unsubscribed from asset: {asset}")
    emit('status', {'message': f'Unsubscribed from {asset}'})

def redis_listener():
    """
    Listens to Redis pub/sub channels and broadcasts messages to clients.
    """
    pubsub = redis_integration.get_pubsub()
    if not pubsub:
        logging.error("Failed to get Redis pub/sub instance.")
        return

    for message in pubsub.listen():
        if message['type'] == 'message':
            asset = message['channel'].decode('utf-8').split(':')[-2]
            if streaming_state.is_asset_active(asset):
                tick_data = message['data'].decode('utf-8')
                socketio.emit(asset, tick_data)
                logging.debug(f"Broadcasted tick for {asset}: {tick_data}")

@app.route('/status', methods=['GET'])
def get_status():
    """
    Returns the current status of the streaming server.
    """
    return jsonify({
        'active_assets': streaming_state.get_active_assets(),
        'client_counts': streaming_state.get_client_counts()
    })

if __name__ == '__main__':
    # Start the Redis listener in a background thread
    socketio.start_background_task(target=redis_listener)
    # Start the Flask-SocketIO server
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)