import os
import asyncio
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import socketio

# Config
MUSIC_DIR = os.path.join(os.path.dirname(__file__), "music")

app = FastAPI()
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
asgi_app = socketio.ASGIApp(sio, app)

# Mount static files (frontend) and music folder
app.mount("/", StaticFiles(directory="static", html=True), name="static")
app.mount("/music", StaticFiles(directory="music"), name="music")

# In-memory rooms structure: { room_name: { song, state, time, users:set() } }
rooms = {}

@app.get("/songs")
async def get_songs():
    """Return list of mp3 filenames in the music folder."""
    files = []
    try:
        files = [f for f in os.listdir(MUSIC_DIR) if f.lower().endswith(".mp3")]
    except FileNotFoundError:
        pass
    files.sort()
    return JSONResponse(files)

@sio.event
async def connect(sid, environ):
    print(f"connect: {sid}")

@sio.event
async def disconnect(sid):
    print(f"disconnect: {sid}")
    # remove from any room user lists
    for room, info in list(rooms.items()):
        users = info.get("users", set())
        # users stored as set of sids; remove if present
        if sid in users:
            users.remove(sid)
        if not users:
            # optionally keep empty rooms; here we keep room but clear users
            info["users"] = set()

@sio.event
async def join_room(sid, data):
    """Client sends: { username, room }"""
    username = data.get("username", "anon")
    room = data.get("room", "default")
    await sio.enter_room(sid, room)
    if room not in rooms:
        rooms[room] = {"song": None, "state": "stopped", "time": 0.0, "users": set()}
    rooms[room]["users"].add(sid)
    # Send current room state to the joining user
    state = rooms[room].copy()
    state["users"] = list(state.get("users", []))
    await sio.emit("room_state", state, to=sid)

    # notify others about user joined (optional)
    await sio.emit("user_joined", {"username": username}, room=room)

@sio.event
async def control(sid, data):
    """Control messages to sync playback among room members.
       data = { room, action: 'play'|'pause'|'seek'|'load', song?:filename, time?:float }
    """
    room = data.get("room")
    if not room:
        return
    action = data.get("action")
    # update in-memory state
    if room not in rooms:
        rooms[room] = {"song": None, "state": "stopped", "time": 0.0, "users": set()}
    if action == "load":
        rooms[room]["song"] = data.get("song")
        rooms[room]["time"] = float(data.get("time", 0.0))
        rooms[room]["state"] = "stopped"
    elif action == "play":
        rooms[room]["state"] = "playing"
        rooms[room]["time"] = float(data.get("time", 0.0))
        rooms[room]["song"] = data.get("song", rooms[room].get("song"))
    elif action == "pause":
        rooms[room]["state"] = "paused"
        rooms[room]["time"] = float(data.get("time", 0.0))
    elif action == "seek":
        rooms[room]["time"] = float(data.get("time", 0.0))
    elif action == "stop":
        rooms[room]["state"] = "stopped"
        rooms[room]["time"] = 0.0
    # broadcast updated state to everyone in room
    await sio.emit("update", {"song": rooms[room]["song"], "state": rooms[room]["state"], "time": rooms[room]["time"]}, room=room)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(asgi_app, host="0.0.0.0", port=8000)
