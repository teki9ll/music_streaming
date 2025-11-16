const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const { exec } = require('child_process');

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

  addUser(socket, username, isHost = false, isSuperHost = false) {
    const joinTime = new Date();
    this.users.set(socket.id, {
      username,
      isHost,
      isSuperHost,
      socket,
      joinedAt: joinTime,
      duration: 0
    });
    return this.users.get(socket.id);
  }

  removeUser(socketId) {
    return this.users.delete(socketId);
  }

  isUserHost(socketId) {
    const user = this.users.get(socketId);
    return user && (user.isHost || user.isSuperHost);
  }

  isUserSuperHost(socketId) {
    const user = this.users.get(socketId);
    return user && user.isSuperHost;
  }

  makeHost(socketId) {
    const user = this.users.get(socketId);
    if (user && !user.isSuperHost) {
      user.isHost = true;
      return true;
    }
    return false;
  }

  removeHost(socketId) {
    const user = this.users.get(socketId);
    if (user && !user.isSuperHost) {
      user.isHost = false;
      return true;
    }
    return false;
  }

  getConnectedUsers() {
    return Array.from(this.users.entries()).map(([socketId, user]) => ({
      id: socketId,
      username: user.username,
      isHost: user.isHost,
      isSuperHost: user.isSuperHost,
      joinedAt: user.joinedAt
    }));
  }

  getConnectedUsersDetailed() {
    const now = new Date();
    return Array.from(this.users.entries()).map(([socketId, user]) => {
      const duration = Math.floor((now - user.joinedAt) / 1000 / 60); // Duration in minutes
      return {
        id: socketId,
        username: user.username,
        isHost: user.isHost,
        isSuperHost: user.isSuperHost,
        joinedAt: user.joinedAt,
        duration: duration,
        status: this.isPlaying ? 'Playing' : 'Idle'
      };
    });
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

// Delete music file
app.delete('/api/music/:filename', (req, res) => {
  try {
    const { filename } = req.params;

    // Decode the URL-encoded filename
    const decodedFilename = decodeURIComponent(filename);
    const filePath = path.join(__dirname, 'music', decodedFilename);

    console.log('Delete request - Original filename:', filename);
    console.log('Delete request - Decoded filename:', decodedFilename);
    console.log('Delete request - File path:', filePath);

    // Validate filename to prevent directory traversal (allow Unicode but block path traversal)
    if (decodedFilename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename: path traversal not allowed' });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete the file
    fs.unlinkSync(filePath);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file: ' + error.message });
  }
});

// YouTube search endpoint
app.get('/api/youtube/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Use yt-dlp to search YouTube
    const searchCommand = `yt-dlp "ytsearch10:${q}" --flat-playlist --print-json --no-warnings`;

    exec(searchCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error('YouTube search error:', error);
        return res.status(500).json({ error: 'Failed to search YouTube' });
      }

      try {
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        const results = lines.map(line => {
          try {
            const video = JSON.parse(line);
            return {
              videoId: video.id,
              title: video.title,
              channel: video.uploader || video.channel || 'Unknown',
              duration: video.duration,
              url: video.webpage_url,
              thumbnail: video.thumbnail
            };
          } catch (parseError) {
            console.error('Parse error:', parseError);
            return null;
          }
        }).filter(Boolean);

        res.json({ results });
      } catch (parseError) {
        console.error('Parse error:', parseError);
        res.status(500).json({ error: 'Failed to parse search results' });
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search YouTube' });
  }
});

// YouTube download endpoint
app.post('/api/youtube/download', async (req, res) => {
  try {
    const { videoId, title } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const filename = `${Date.now()}-${sanitizeFilename(title)}.mp3`;
    const outputPath = path.join(__dirname, 'music', filename);

    console.log(`Starting download: ${videoUrl} -> ${filename}`);

    // Download and convert to MP3 using yt-dlp
    const downloadCommand = `yt-dlp "${videoUrl}" --extract-audio --audio-format mp3 --audio-quality 0 -o "${outputPath.replace('.mp3', '.%(ext)s')}" --no-warnings`;

    exec(downloadCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error('YouTube download error:', error);
        return res.status(500).json({ error: 'Failed to download and convert video' });
      }

      // Find the actual filename (yt-dlp might modify it)
      try {
        const musicDir = path.join(__dirname, 'music');
        const files = fs.readdirSync(musicDir);

        // Look for files that start with our timestamp (within the last minute)
        const timestamp = Date.now();
        const recentFiles = files.filter(file => {
          const fileTimestamp = parseInt(file.split('-')[0]);
          return fileTimestamp && (timestamp - fileTimestamp) < 60000; // Files from last 60 seconds
        });

        // Sort by timestamp and get the most recent one
        recentFiles.sort((a, b) => {
          const timeA = parseInt(a.split('-')[0]) || 0;
          const timeB = parseInt(b.split('-')[0]) || 0;
          return timeB - timeA; // Descending order
        });

        const downloadedFile = recentFiles.find(file => file.endsWith('.mp3'));
        console.log('Looking for downloaded file, found recent files:', recentFiles);

        if (downloadedFile) {
          const stats = fs.statSync(path.join(musicDir, downloadedFile));
          res.json({
            filename: downloadedFile,
            originalName: title,
            url: `/music/${downloadedFile}`,
            size: stats.size
          });
        } else {
          console.error('No recent MP3 file found. All files:', files);
          res.status(500).json({ error: 'Downloaded file not found' });
        }
      } catch (findError) {
        console.error('Find downloaded file error:', findError);
        res.status(500).json({ error: 'Failed to locate downloaded file' });
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download video' });
  }
});

// Helper function to sanitize filenames
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100); // Limit length
}

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

    // Make first user the super host and host
    const userCount = room.users.size;
    const isHost = userCount === 0;
    const isSuperHost = userCount === 0;

    const user = room.addUser(socket, username, isHost, isSuperHost);

    // If this is the super host, set room properties
    if (isSuperHost) {
      room.hostId = socket.id;
    }

    // Send current room state to new user
    socket.emit('room-state', {
      currentTrack: room.currentTrack,
      isPlaying: room.isPlaying,
      currentTime: room.currentTime,
      volume: room.volume,
      musicQueue: room.musicQueue,
      isHost: isHost,
      isSuperHost: isSuperHost,
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
        isHost: isHost,
        isSuperHost: isSuperHost
      },
      connectedUsers: room.getConnectedUsers()
    });

    // Send updated user list to everyone
    const connectedUsers = room.getConnectedUsers();
    console.log('👥 Sending users-updated event:', {
      roomId: DEFAULT_ROOM_ID,
      username,
      userCount: connectedUsers.length,
      users: connectedUsers.map(u => ({ id: u.id, username: u.username, isHost: u.isHost, isSuperHost: u.isSuperHost }))
    });
    io.to(DEFAULT_ROOM_ID).emit('users-updated', connectedUsers);

    // Broadcast join activity to everyone
    let roleText = 'as listener 🎧';
    if (isSuperHost) {
      roleText = 'as SUPER HOST 👑';
    } else if (isHost) {
      roleText = 'as HOST 🎤';
    }
    broadcastActivity(`${username} joined the Global Music Room ${roleText}`, 'join', username);
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

  // Handle make host requests (only super hosts can promote others)
  socket.on('make-host', (data) => {
    const { userId } = data;
    const room = rooms[DEFAULT_ROOM_ID];
    const requester = room?.users.get(socket.id);

    // Check if requester is a super host
    if (!requester || !requester.isSuperHost) {
      socket.emit('error', { message: 'Only super hosts can promote other users' });
      return;
    }

    // Find target user
    const targetUser = room?.users.get(userId);
    if (!targetUser) {
      socket.emit('error', { message: 'User not found' });
      return;
    }

    // Cannot promote another super host
    if (targetUser.isSuperHost) {
      socket.emit('error', { message: 'Cannot promote a super host' });
      return;
    }

    // Promote to host
    if (room.makeHost(userId)) {
      // Notify all users
      io.to(DEFAULT_ROOM_ID).emit('made-host', {
        userId: userId,
        username: targetUser.username,
        promotedBy: requester.username
      });

      // Send updated user list
      io.to(DEFAULT_ROOM_ID).emit('users-updated', room.getConnectedUsers());

      // Broadcast activity
      broadcastActivity(`${requester.username} promoted ${targetUser.username} to Host`, 'system');
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

  // Get detailed users list
  socket.on('get-users', () => {
    const room = rooms[DEFAULT_ROOM_ID];

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const detailedUsers = room.getConnectedUsersDetailed();
    socket.emit('users-detailed', detailedUsers);
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