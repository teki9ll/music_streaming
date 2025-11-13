import os
import asyncio
import logging
import time
from typing import Dict, Set, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import socketio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Config
MUSIC_DIR = os.path.join(os.path.dirname(__file__), "music")

# Data structures with better organization
@dataclass
class RoomState:
    """Optimized room state with timestamps, host management, and password protection."""
    song: Optional[str] = None
    state: str = "stopped"  # playing, paused, stopped
    time: float = 0.0
    last_update: float = 0.0
    users: Set[str] = None
    host_sid: Optional[str] = None  # Session ID of the current host
    host_username: Optional[str] = None  # Username of the current host
    password: Optional[str] = None  # Room password (None for public rooms)
    is_locked: bool = False  # Whether the room is locked with a password

    def __post_init__(self):
        if self.users is None:
            self.users = set()
        self.last_update = time.time()
        self.is_locked = self.password is not None and len(self.password.strip()) > 0

    def is_host(self, sid: str) -> bool:
        """Check if a user is the host."""
        return self.host_sid == sid

    def set_host(self, sid: str, username: str):
        """Set a user as the host."""
        self.host_sid = sid
        self.host_username = username

    def clear_host(self):
        """Clear the host (e.g., when host leaves)."""
        self.host_sid = None
        self.host_username = None

class OptimizedMiddleware(BaseHTTPMiddleware):
    """Optimized middleware for media streaming with performance headers."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)

        # Optimize music file responses
        if request.url.path.startswith("/music/"):
            # Set optimal streaming headers
            response.headers.update({
                # Disable caching for real-time sync
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
                # Enable range requests for seeking
                "Accept-Ranges": "bytes",
                # CORS headers
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                "Access-Control-Allow-Headers": "Range",
                # Security and performance
                "X-Content-Type-Options": "nosniff",
                "Keep-Alive": "timeout=5, max=1000"
            })

        return response

# Initialize FastAPI with optimal configuration
app = FastAPI(
    title="Music Streaming Server",
    description="Optimized real-time collaborative music streaming",
    version="2.0.0"
)
app.add_middleware(OptimizedMiddleware)

# Configure Socket.IO with optimal settings
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,  # Disable socket.io logging for performance
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e8  # 100MB
)
asgi_app = socketio.ASGIApp(sio, app)

# Optimized room storage with better data structures
rooms: Dict[str, RoomState] = {}
user_sessions: Dict[str, Dict[str, Any]] = {}  # Track user metadata

# Cache for songs list to avoid repeated disk I/O
_songs_cache: Optional[list] = None
_songs_cache_time: float = 0
SONGS_CACHE_DURATION = 60  # Cache for 60 seconds

async def broadcast_rooms_update():
    """Efficiently broadcast room updates."""
    try:
        active_rooms = []
        for room_name, room_state in rooms.items():
            if room_state.users:  # Only show rooms with active users
                active_rooms.append({
                    "name": room_name,
                    "user_count": len(room_state.users),
                    "song": room_state.song,
                    "state": room_state.state,
                    "host_username": room_state.host_username,
                    "last_update": room_state.last_update,
                    "is_locked": room_state.is_locked,
                    "has_password": room_state.is_locked
                })

        await sio.emit("rooms_update", active_rooms)
        logger.info(f"Broadcasted {len(active_rooms)} active rooms")
    except Exception as e:
        logger.error(f"Error broadcasting rooms update: {e}")

def get_cached_songs() -> list:
    """Get songs with caching to reduce disk I/O."""
    global _songs_cache, _songs_cache_time

    current_time = time.time()
    if (_songs_cache is None or
        current_time - _songs_cache_time > SONGS_CACHE_DURATION):

        try:
            if not os.path.exists(MUSIC_DIR):
                os.makedirs(MUSIC_DIR, exist_ok=True)
                _songs_cache = []
            else:
                _songs_cache = [
                    f for f in os.listdir(MUSIC_DIR)
                    if f.lower().endswith(".mp3") and os.path.isfile(os.path.join(MUSIC_DIR, f))
                ]
                _songs_cache.sort()
            _songs_cache_time = current_time
            logger.info(f"Updated songs cache with {len(_songs_cache)} files")
        except Exception as e:
            logger.error(f"Error loading songs: {e}")
            _songs_cache = []

    return _songs_cache

@app.get("/songs")
async def get_songs():
    """Return cached list of mp3 files."""
    try:
        songs = get_cached_songs()
        return JSONResponse(songs)
    except Exception as e:
        logger.error(f"Error in /songs endpoint: {e}")
        raise HTTPException(status_code=500, detail="Failed to load songs")

@app.get("/rooms")
async def get_rooms():
    """Return list of active rooms with user count, host information, and password status."""
    try:
        active_rooms = []
        for room_name, room_state in rooms.items():
            if room_state.users:  # Only show rooms with active users
                active_rooms.append({
                    "name": room_name,
                    "user_count": len(room_state.users),
                    "song": room_state.song,
                    "state": room_state.state,
                    "host_username": room_state.host_username,
                    "last_update": room_state.last_update,
                    "is_locked": room_state.is_locked,
                    "has_password": room_state.is_locked
                })
        return JSONResponse(active_rooms)
    except Exception as e:
        logger.error(f"Error in /rooms endpoint: {e}")
        raise HTTPException(status_code=500, detail="Failed to load rooms")

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return JSONResponse({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_rooms": len([r for r in rooms.values() if r.users]),
        "connected_users": len(user_sessions)
    })

@sio.event
async def connect(sid, environ):
    """Handle client connection with enhanced tracking."""
    try:
        user_sessions[sid] = {
            "connected_at": time.time(),
            "user_agent": environ.get("HTTP_USER_AGENT", "unknown"),
            "ip": environ.get("HTTP_X_FORWARDED_FOR", environ.get("REMOTE_ADDR", "unknown"))
        }
        logger.info(f"Client connected: {sid} from {user_sessions[sid]['ip']}")
    except Exception as e:
        logger.error(f"Error handling connect for {sid}: {e}")

@sio.event
async def disconnect(sid):
    """Handle client disconnection with cleanup."""
    try:
        if sid in user_sessions:
            logger.info(f"Client disconnected: {sid} (connected for {time.time() - user_sessions[sid]['connected_at']:.1f}s)")
            del user_sessions[sid]

        # Remove from all rooms
        rooms_to_update = []
        for room_name, room_state in list(rooms.items()):
            if sid in room_state.users:
                room_state.users.remove(sid)
                room_state.last_update = time.time()

                # Notify others in the room
                await sio.emit("user_left", {
                    "username": user_sessions.get(sid, {}).get("username", f"User_{sid[:8]}")
                }, room=room_name)

                # Update user count
                await sio.emit("user_count_update", {
                    "count": len(room_state.users)
                }, room=room_name)

                rooms_to_update.append(room_name)

                # Clean up empty rooms
                if not room_state.users:
                    del rooms[room_name]
                    logger.info(f"Removed empty room: {room_name}")

        # Broadcast rooms update if any changes
        if rooms_to_update:
            await broadcast_rooms_update()

    except Exception as e:
        logger.error(f"Error handling disconnect for {sid}: {e}")

@sio.event
async def join_room(sid, data):
    """Optimized room joining with host management and password validation."""
    try:
        username = data.get("username", "anonymous").strip() or "anonymous"
        room = data.get("room", "default").strip() or "default"
        password = data.get("password", "").strip()

        # Validate inputs
        if len(username) > 50:
            username = username[:50]
        if len(room) > 50:
            room = room[:50]

        # Check if room exists
        if room not in rooms:
            await sio.emit("join_error", {
                "message": "Room not found",
                "code": "room_not_found"
            }, to=sid)
            return

        room_state = rooms[room]

        # Check password protection
        if room_state.is_locked and room_state.password != password:
            await sio.emit("join_error", {
                "message": "Invalid password",
                "code": "invalid_password"
            }, to=sid)
            return

        # Store username for later use
        if sid in user_sessions:
            user_sessions[sid]["username"] = username

        await sio.enter_room(sid, room)

        # Add user to room
        room_state.users.add(sid)
        room_state.last_update = time.time()

        # Assign host if room is empty
        if room_state.host_sid is None:
            room_state.set_host(sid, username)
            logger.info(f"User {username} ({sid}) became host of room {room}")

        # Prepare room state for client
        room_data = asdict(room_state)
        room_data["name"] = room  # Add room name
        room_data["users"] = list(room_state.users)
        room_data["user_count"] = len(room_state.users)
        room_data["is_host"] = room_state.is_host(sid)
        room_data["host_username"] = room_state.host_username
        # Don't send password to clients
        room_data.pop("password", None)

        # Send current state to joining user
        await sio.emit("room_state", room_data, to=sid)

        # Notify others
        await sio.emit("user_joined", {
            "username": username,
            "user_count": len(room_state.users),
            "host_username": room_state.host_username
        }, room=room, skip_sid=sid)

        # Broadcast updates
        await sio.emit("user_count_update", {
            "count": len(rooms[room].users)
        }, room=room)

        await broadcast_rooms_update()

        logger.info(f"User {username} ({sid}) joined room {room} (host: {rooms[room].host_username})")

    except Exception as e:
        logger.error(f"Error in join_room for {sid}: {e}")
        await sio.emit("error", {"message": "Failed to join room"}, to=sid)

@sio.event
async def create_room(sid, data):
    """Create a new room with optional password protection."""
    try:
        username = data.get("username", "anonymous").strip() or "anonymous"
        room = data.get("room", "new_room").strip() or "new_room"
        password = data.get("password", "").strip()

        # Validate inputs
        if len(username) > 50:
            username = username[:50]
        if len(room) > 50:
            room = room[:50]
        if len(password) > 100:
            password = password[:100]

        # Check if room already exists
        if room in rooms:
            await sio.emit("create_error", {
                "message": "Room already exists",
                "code": "room_exists"
            }, to=sid)
            return

        # Create new room
        rooms[room] = RoomState(
            password=password if password else None
        )

        # Store username
        if sid in user_sessions:
            user_sessions[sid]["username"] = username

        # Make creator the host
        rooms[room].set_host(sid, username)

        await sio.enter_room(sid, room)
        rooms[room].users.add(sid)
        rooms[room].last_update = time.time()

        logger.info(f"User {username} ({sid}) created and joined room {room} as host (locked: {rooms[room].is_locked})")

        # Prepare room state for client
        room_data = asdict(rooms[room])
        room_data["name"] = room  # Add room name
        room_data["users"] = list(rooms[room].users)
        room_data["user_count"] = len(rooms[room].users)
        room_data["is_host"] = True
        room_data["host_username"] = rooms[room].host_username
        # Don't send password to clients
        room_data.pop("password", None)

        # Send room state to creator
        await sio.emit("room_created", room_data, to=sid)

        # Broadcast room updates
        await broadcast_rooms_update()

    except Exception as e:
        logger.error(f"Error in create_room for {sid}: {e}")
        await sio.emit("error", {"message": "Failed to create room"}, to=sid)

@sio.event
async def leave_room(sid, data):
    """Handle room leaving with proper cleanup and host transfer."""
    try:
        room = data.get("room")
        if not room or room not in rooms:
            return

        username = user_sessions.get(sid, {}).get("username", f"User_{sid[:8]}")
        was_host = rooms[room].is_host(sid)

        if sid in rooms[room].users:
            rooms[room].users.remove(sid)
            rooms[room].last_update = time.time()

            await sio.leave_room(sid, room)

            # Handle host transfer
            if was_host:
                # Transfer host to next available user
                if rooms[room].users:
                    new_host_sid = next(iter(rooms[room].users))
                    new_host_username = user_sessions.get(new_host_sid, {}).get("username", "Unknown")
                    rooms[room].set_host(new_host_sid, new_host_username)

                    # Notify about host change
                    await sio.emit("host_changed", {
                        "old_host": username,
                        "new_host": new_host_username,
                        "new_host_sid": new_host_sid
                    }, room=room)

                    logger.info(f"Host transferred from {username} to {new_host_username} in room {room}")
                else:
                    # No users left, clear host
                    rooms[room].clear_host()

            # Notify others
            await sio.emit("user_left", {
                "username": username,
                "user_count": len(rooms[room].users),
                "host_username": rooms[room].host_username
            }, room=room)

            # Update user count
            await sio.emit("user_count_update", {
                "count": len(rooms[room].users)
            }, room=room)

            # Clean up empty room
            if not rooms[room].users:
                del rooms[room]
                logger.info(f"Removed empty room: {room}")

            await broadcast_rooms_update()
            logger.info(f"User {username} ({sid}) left room {room}")

    except Exception as e:
        logger.error(f"Error in leave_room for {sid}: {e}")

@sio.event
async def control(sid, data):
    """Optimized control messages with enhanced synchronization and host permissions."""
    try:
        room = data.get("room")
        if not room or room not in rooms:
            await sio.emit("error", {"message": "Invalid room"}, to=sid)
            return

        # Check if user is the host
        if not rooms[room].is_host(sid):
            await sio.emit("error", {"message": "Only the host can control playback"}, to=sid)
            logger.warning(f"Non-host {user_sessions.get(sid, {}).get('username', sid)} attempted to control room {room}")
            return

        action = data.get("action")
        if not action:
            await sio.emit("error", {"message": "Missing action"}, to=sid)
            return

        # Validate and sanitize time
        try:
            time_value = max(0.0, float(data.get("time", 0.0)))
        except (ValueError, TypeError):
            time_value = 0.0

        # Update room state with timestamp
        current_time = time.time()
        rooms[room].last_update = current_time

        # Apply action with validation
        if action == "load":
            song = data.get("song", "")
            if song and any(song == s for s in get_cached_songs()):
                rooms[room].song = song
                rooms[room].time = time_value
                rooms[room].state = "stopped"
            else:
                await sio.emit("error", {"message": "Invalid song"}, to=sid)
                return

        elif action == "play":
            rooms[room].state = "playing"
            rooms[room].time = time_value
            if data.get("song"):
                song = data.get("song")
                if any(song == s for s in get_cached_songs()):
                    rooms[room].song = song

        elif action == "pause":
            rooms[room].state = "paused"
            rooms[room].time = time_value

        elif action == "seek":
            rooms[room].time = time_value

        elif action == "stop":
            rooms[room].state = "stopped"
            rooms[room].time = 0.0

        else:
            await sio.emit("error", {"message": "Invalid action"}, to=sid)
            return

        # Broadcast update with high precision timestamp
        update_data = {
            "song": rooms[room].song,
            "state": rooms[room].state,
            "time": rooms[room].time,
            "timestamp": current_time,
            "user": user_sessions.get(sid, {}).get("username", "unknown")
        }

        await sio.emit("update", update_data, room=room)

        logger.debug(f"Control {action} in room {room} by host {user_sessions.get(sid, {}).get('username', sid)}")

    except Exception as e:
        logger.error(f"Error in control for {sid}: {e}")
        await sio.emit("error", {"message": "Control failed"}, to=sid)

@sio.event
async def sync_request(sid, data):
    """Handle sync requests from clients."""
    try:
        room = data.get("room")
        if not room or room not in rooms:
            return

        # Send current state with server timestamp
        await sio.emit("sync_response", {
            "song": rooms[room].song,
            "state": rooms[room].state,
            "time": rooms[room].time,
            "timestamp": rooms[room].last_update,
            "server_time": time.time()
        }, to=sid)

    except Exception as e:
        logger.error(f"Error in sync_request for {sid}: {e}")

@sio.event
async def request_host(sid, data):
    """Handle host transfer requests."""
    try:
        room = data.get("room")
        if not room or room not in rooms:
            await sio.emit("error", {"message": "Invalid room"}, to=sid)
            return

        # Check if there's already a host
        if rooms[room].host_sid and rooms[room].host_sid != sid:
            # Notify current host about transfer request
            await sio.emit("host_transfer_request", {
                "requester_sid": sid,
                "requester_username": user_sessions.get(sid, {}).get("username", "Unknown")
            }, to=rooms[room].host_sid)

            await sio.emit("info", {"message": "Host transfer request sent to current host"}, to=sid)
            logger.info(f"Host transfer request from {user_sessions.get(sid, {}).get('username', sid)} in room {room}")
        else:
            # No host or requester is already host, assign host
            old_host = rooms[room].host_username
            rooms[room].set_host(sid, user_sessions.get(sid, {}).get("username", "Unknown"))

            # Broadcast host change
            await sio.emit("host_changed", {
                "old_host": old_host,
                "new_host": rooms[room].host_username,
                "new_host_sid": sid
            }, room=room)

            await sio.emit("host_granted", {}, to=sid)
            logger.info(f"Host granted to {rooms[room].host_username} in room {room}")

    except Exception as e:
        logger.error(f"Error in request_host for {sid}: {e}")
        await sio.emit("error", {"message": "Failed to request host"}, to=sid)

@sio.event
async def accept_host_transfer(sid, data):
    """Handle acceptance of host transfer."""
    try:
        room = data.get("room")
        requester_sid = data.get("requester_sid")

        if not room or room not in rooms or not rooms[room].is_host(sid):
            await sio.emit("error", {"message": "Invalid request"}, to=sid)
            return

        # Transfer host to requester
        old_host = rooms[room].host_username
        rooms[room].set_host(requester_sid, user_sessions.get(requester_sid, {}).get("username", "Unknown"))

        # Broadcast host change
        await sio.emit("host_changed", {
            "old_host": old_host,
            "new_host": rooms[room].host_username,
            "new_host_sid": requester_sid
        }, room=room)

        await sio.emit("host_granted", {}, to=requester_sid)
        await sio.emit("info", {"message": "Host transferred successfully"}, to=sid)

        logger.info(f"Host transferred from {old_host} to {rooms[room].host_username} in room {room}")

    except Exception as e:
        logger.error(f"Error in accept_host_transfer for {sid}: {e}")
        await sio.emit("error", {"message": "Failed to transfer host"}, to=sid)

@sio.event
async def reject_host_transfer(sid, data):
    """Handle rejection of host transfer."""
    try:
        room = data.get("room")
        requester_sid = data.get("requester_sid")

        if not room or room not in rooms or not rooms[room].is_host(sid):
            return

        # Notify requester of rejection
        await sio.emit("host_transfer_rejected", {
            "host_username": rooms[room].host_username
        }, to=requester_sid)

        logger.info(f"Host transfer request rejected by {rooms[room].host_username} in room {room}")

    except Exception as e:
        logger.error(f"Error in reject_host_transfer for {sid}: {e}")

# Custom music file handler for streaming
@app.get("/music/{filename}")
async def get_music_file(filename: str):
    """Stream music files with proper headers for streaming."""
    from fastapi.responses import FileResponse
    import os
    from pathlib import Path

    file_path = Path("music") / filename

    # Security check - ensure file is within music directory
    try:
        resolved_path = file_path.resolve()
        music_dir = Path("music").resolve()
        if not str(resolved_path).startswith(str(music_dir)):
            raise HTTPException(status_code=403, detail="Access denied")
    except:
        raise HTTPException(status_code=403, detail="Access denied")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # Return file with streaming headers
    return FileResponse(
        path=str(file_path),
        media_type="audio/mpeg",
        filename=filename,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",  # Prevent caching for real-time sync
            "Content-Disposition": "inline",  # Force inline display, not download
        }
    )

# Mount static files with optimized settings
app.mount("/music", StaticFiles(directory="music"), name="music")
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn

    # Optimize uvicorn settings
    config = uvicorn.Config(
        app=asgi_app,
        host="0.0.0.0",
        port=8000,
        log_level="warning",  # Reduce uvicorn logging
        access_log=False,
        use_colors=False,
        ws_ping_interval=25,
        ws_ping_timeout=60,
        limit_concurrency=1000,
        timeout_keep_alive=5,
        loop="uvloop"  # Use uvloop for better performance
    )

    logger.info("Starting optimized music streaming server...")
    server = uvicorn.Server(config)
    server.run()