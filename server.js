const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/music', express.static('music'));

// Ensure music directory exists
if (!fs.existsSync('music')) {
  fs.mkdirSync('music');
}

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'music/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  },
  limit: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Room management
const rooms = {};

// Create default room
const DEFAULT_ROOM_ID = 'global-room';
const DEFAULT_ROOM_NAME = 'Global Music Room';

class Room {
  constructor(id, name, hostId) {
    this.id = id;
    this.name = name;
    this.hostId = hostId;
    this.users = new Map();
    this.musicQueue = [];
    this.currentTrack = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.volume = 1.0;
    this.createdAt = new Date();
  }

  addUser(socket, username, isHost = false) {
    this.users.set(socket.id, {
      username,
      isHost,
      socket,
      joinedAt: new Date()
    });
    return this.users.get(socket.id);
  }

  removeUser(socketId) {
    return this.users.delete(socketId);
  }

  isUserHost(socketId) {
    const user = this.users.get(socketId);
    return user && user.isHost;
  }

  addCoHost(socketId) {
    const user = this.users.get(socketId);
    if (user) {
      user.isHost = true;
    }
  }

  removeCoHost(socketId) {
    const user = this.users.get(socketId);
    if (user && socketId !== this.hostId) {
      user.isHost = false;
    }
  }

  getConnectedUsers() {
    return Array.from(this.users.entries()).map(([socketId, user]) => ({
      id: socketId,
      username: user.username,
      isHost: user.isHost,
      joinedAt: user.joinedAt
    }));
  }
}

// Initialize default room
rooms[DEFAULT_ROOM_ID] = new Room(DEFAULT_ROOM_ID, DEFAULT_ROOM_NAME, null);
console.log(`🏠 Created default room: ${DEFAULT_ROOM_NAME} (${DEFAULT_ROOM_ID})`);

// Add system startup activity
setTimeout(() => {
  broadcastActivity('🚀 Global Music Room system started! All activities are now shared.', 'system');
}, 1000);

// Global activity log
const activityLog = [];

// Function to broadcast activity to all users
function broadcastActivity(message, type = 'system', username = null) {
  const activity = {
    message,
    type,
    username,
    timestamp: new Date().toISOString(),
    id: activityLog.length + 1
  };

  activityLog.push(activity);

  // Keep only last 100 activities
  if (activityLog.length > 100) {
    activityLog.shift();
  }

  // Broadcast to all users in default room
  io.to(DEFAULT_ROOM_ID).emit('activity-log', activity);

  console.log(`[ACTIVITY] ${type.toUpperCase()}: ${message}`);
}

// API Routes
app.get('/api/rooms', (req, res) => {
  const roomList = Object.values(rooms).map(room => ({
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    userCount: room.users.size,
    isPlaying: room.isPlaying,
    currentTrack: room.currentTrack
  }));
  res.json(roomList);
});

app.post('/api/rooms', (req, res) => {
  const { name, username } = req.body;
  const roomId = uuidv4();
  const userId = uuidv4();

  const room = new Room(roomId, name, userId);
  rooms[roomId] = room;

  res.json({ roomId, userId });
});

app.post('/api/upload', upload.single('music'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    url: `/music/${req.file.filename}`
  });
});

app.get('/api/music', (req, res) => {
  try {
    const musicDir = path.join(__dirname, 'music');
    const files = fs.readdirSync(musicDir)
      .filter(file => /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(file))
      .map(file => {
        const stats = fs.statSync(path.join(musicDir, file));
        // Use filename as originalName if it's not an uploaded file (doesn't have timestamp pattern)
        const isUploadedFile = /^\d{13}-/.test(file);
        return {
          filename: file,
          originalName: isUploadedFile ? file.replace(/^\d{13}-/, '') : file,
          url: `/music/${file}`,
          size: stats.size,
          addedAt: stats.birthtime
        };
      });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read music directory' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Auto-join to default room with username
  socket.on('join-default-room', (data) => {
    const { username } = data;
    const room = rooms[DEFAULT_ROOM_ID];

    if (!room) {
      socket.emit('error', { message: 'Default room not found' });
      return;
    }

    socket.join(DEFAULT_ROOM_ID);

    // Make first user the host
    const userCount = room.users.size;
    const isHost = userCount === 0;

    const user = room.addUser(socket, username, isHost);

    // Send current room state to new user
    socket.emit('room-state', {
      currentTrack: room.currentTrack,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime,
      volume: room.volume,
      musicQueue: room.musicQueue,
      isHost: isHost,
      room: {
        id: DEFAULT_ROOM_ID,
        name: DEFAULT_ROOM_NAME
      }
    });

    // Send recent activity log to new user
    socket.emit('activity-history', activityLog.slice(-20)); // Send last 20 activities

    // Notify everyone in the room
    io.to(DEFAULT_ROOM_ID).emit('user-joined', {
      user: {
        id: socket.id,
        username: username,
        isHost: isHost
      },
      connectedUsers: room.getConnectedUsers()
    });

    // Send updated user list to everyone
    const connectedUsers = room.getConnectedUsers();
    console.log('👥 Sending users-updated event:', {
      roomId: DEFAULT_ROOM_ID,
      username,
      userCount: connectedUsers.length,
      users: connectedUsers.map(u => ({ id: u.id, username: u.username, isHost: u.isHost }))
    });
    io.to(DEFAULT_ROOM_ID).emit('users-updated', connectedUsers);

    // Broadcast join activity to everyone
    broadcastActivity(`${username} joined the Global Music Room ${isHost ? 'as HOST 👑' : 'as listener 🎧'}`, 'join', username);
  });

  // Handle client activities (like track selection)
  socket.on('client-activity', (data) => {
    const { message, type } = data;
    const room = rooms[DEFAULT_ROOM_ID];
    const user = room?.users.get(socket.id);

    if (user) {
      broadcastActivity(message, type, user.username);
    }
  });

  // Music control events (hosts only)
  socket.on('play-track', (data) => {
    const { track, startTime } = data;
    const room = rooms[DEFAULT_ROOM_ID];

    if (!room || !room.isUserHost(socket.id)) {
      socket.emit('error', { message: 'Only hosts can control music' });
      return;
    }

    room.currentTrack = track;
    room.isPlaying = true;
    room.currentTime = startTime || 0;

    console.log('🎵 Playing track:', {
      track: room.currentTrack,
      trackName: room.currentTrack?.originalName,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime
    });

    io.to(DEFAULT_ROOM_ID).emit('track-playing', {
      track: room.currentTrack,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime
    });

    // Broadcast music activity to everyone
    const username = room.users.get(socket.id)?.username || 'Host';
    broadcastActivity(`🎵 Now playing: ${room.currentTrack?.originalName || 'Unknown track'}`, 'music', username);
  });

  socket.on('pause-track', (data) => {
    const { currentTime } = data;
    const room = rooms[DEFAULT_ROOM_ID];

    if (!room || !room.isUserHost(socket.id)) {
      socket.emit('error', { message: 'Only hosts can control music' });
      return;
    }

    room.isPlaying = false;
    room.currentTime = currentTime;

    io.to(DEFAULT_ROOM_ID).emit('track-paused', {
      isPlaying: room.isPlaying,
      currentTime: room.currentTime
    });

    // Broadcast pause activity to everyone
    const username = room.users.get(socket.id)?.username || 'Host';
    broadcastActivity(`⏸️ Music paused`, 'music', username);
  });

  socket.on('seek-track', (data) => {
    const { currentTime } = data;
    const room = rooms[DEFAULT_ROOM_ID];

    if (!room || !room.isUserHost(socket.id)) {
      socket.emit('error', { message: 'Only hosts can control music' });
      return;
    }

    room.currentTime = currentTime;

    io.to(DEFAULT_ROOM_ID).emit('track-seeked', { currentTime });
  });

  socket.on('change-volume', (data) => {
    const { volume } = data;
    const room = rooms[DEFAULT_ROOM_ID];

    if (!room || !room.isUserHost(socket.id)) {
      socket.emit('error', { message: 'Only hosts can control music' });
      return;
    }

    room.volume = volume;

    io.to(DEFAULT_ROOM_ID).emit('volume-changed', { volume });
  });

  socket.on('add-to-queue', (data) => {
    const { track } = data;
    const room = rooms[DEFAULT_ROOM_ID];

    if (!room || !room.isUserHost(socket.id)) {
      socket.emit('error', { message: 'Only hosts can control music' });
      return;
    }

    room.musicQueue.push(track);
    io.to(DEFAULT_ROOM_ID).emit('queue-updated', room.musicQueue);
  });

  socket.on('remove-from-queue', (data) => {
    const { trackIndex } = data;
    const room = rooms[DEFAULT_ROOM_ID];

    if (!room || !room.isUserHost(socket.id)) {
      socket.emit('error', { message: 'Only hosts can control music' });
      return;
    }

    room.musicQueue.splice(trackIndex, 1);
    io.to(DEFAULT_ROOM_ID).emit('queue-updated', room.musicQueue);
  });

  // Host management
  socket.on('add-cohost', (data) => {
    const { roomId, userId } = data;
    const room = rooms[roomId];

    if (!room || !room.isUserHost(socket.id)) {
      socket.emit('error', { message: 'Only hosts can add co-hosts' });
      return;
    }

    room.addCoHost(userId);
    io.to(roomId).emit('users-updated', room.getConnectedUsers());
  });

  socket.on('remove-cohost', (data) => {
    const { roomId, userId } = data;
    const room = rooms[roomId];

    if (!room || !room.isUserHost(socket.id)) {
      socket.emit('error', { message: 'Only hosts can remove co-hosts' });
      return;
    }

    room.removeCoHost(userId);
    io.to(roomId).emit('users-updated', room.getConnectedUsers());
  });

  // Sync time
  socket.on('sync-time', (data) => {
    const { roomId, currentTime } = data;
    const room = rooms[roomId];

    if (room && room.isPlaying) {
      room.currentTime = currentTime;
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    // Find and remove user from all rooms
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.users.has(socket.id)) {
        const user = room.users.get(socket.id);
        room.removeUser(socket.id);

        // Notify others in the room
        socket.to(roomId).emit('user-left', {
          user: {
            id: socket.id,
            username: user.username
          },
          connectedUsers: room.getConnectedUsers()
        });

        // Send updated user list
        io.to(roomId).emit('users-updated', room.getConnectedUsers());

        // Broadcast leave activity to everyone
        broadcastActivity(`${user.username} left the Global Music Room`, 'leave', user.username);

        // Clean up empty rooms (but never delete the default room)
        if (room.users.size === 0 && roomId !== DEFAULT_ROOM_ID) {
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted (no users)`);
        }
      }
    }
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`🎵 Remote Music Player server running on http://localhost:${PORT}`);
  console.log(`📁 Music files directory: ${path.join(__dirname, 'music')}`);
});