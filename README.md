# 🎵 Remote Music Player

A real-time music player application that allows hosts to control music playback for multiple listeners, creating a shared radio station experience.

## 🚀 Features

### 🎧 Core Functionality
- **Real-time Synchronization**: All users hear the same music at the same time
- **Host Control**: Only hosts can control playback, volume, and queue
- **Multiple Rooms**: Create and join different music rooms
- **Local Music**: Upload and play music files from your local device
- **Live User List**: See who's currently in the room
- **Multiple Hosts**: Grant co-host permissions to trusted users

### 🎨 User Interface
- **Spotify-like Design**: Modern, dark theme interface
- **Responsive Layout**: Works on desktop and mobile devices
- **Drag & Drop Upload**: Easy music file upload
- **Real-time Updates**: Live updates for users and playback status

### 🎵 Music Features
- **Supports Multiple Formats**: MP3, WAV, FLAC, AAC, OGG, M4A
- **Queue Management**: Add/remove tracks from the queue
- **Volume Control**: Synchronized volume across all users
- **Progress Bar**: Visual progress indication with seek capability
- **Auto-sync**: Periodic synchronization to ensure all users stay in sync

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Installation Steps

1. **Clone or download** the project to your local machine

2. **Navigate to the project directory**:
   ```bash
   cd music_streaming
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Start the server**:
   ```bash
   npm start
   ```

5. **Open the application**:
   - Open your web browser
   - Navigate to `http://localhost:3000`
   - The server will show the music directory path in the console

## 📖 How to Use

### For Hosts (Creating a Room)

1. **Create a Room**:
   - Click "Create Room" on the landing page
   - Enter a room name and your username
   - Click "Create Room"

2. **Upload Music**:
   - Click the "Upload Music" button
   - Drag and drop music files or click to browse
   - Supported formats: MP3, WAV, FLAC, AAC, OGG, M4A (Max 50MB per file)

3. **Control Playback**:
   - Add tracks to the queue from your music library
   - Use play/pause, seek, and volume controls
   - All listeners will hear exactly what you're playing

4. **Manage Users**:
   - View connected users in the right sidebar
   - Grant co-host permissions to trusted users
   - Use the "Sync All" button if users get out of sync

### For Listeners (Joining a Room)

1. **Get Room ID**: Ask the host for the room ID (displayed in their URL bar)

2. **Join a Room**:
   - Click "Join Room" on the landing page
   - Enter the Room ID and your username
   - Click "Join"

3. **Listen Along**:
   - Music will automatically sync with the host
   - View the current track and progress
   - See who else is in the room

### Room Management

- **Room ID**: Each room has a unique 8-character ID
- **Host Controls**: Only hosts can control music playback
- **Co-hosts**: Hosts can grant co-host permissions to other users
- **User Limits**: No hard limit on users per room (limited by server resources)

## 🔧 Technical Details

### Architecture
- **Backend**: Node.js with Express and Socket.IO
- **Frontend**: Vanilla JavaScript with modern CSS
- **Real-time Communication**: WebSockets via Socket.IO
- **File Storage**: Local filesystem storage in the `music/` directory

### API Endpoints
- `GET /` - Main application page
- `GET /api/rooms` - List all active rooms
- `POST /api/rooms` - Create a new room
- `GET /api/music` - List uploaded music files
- `POST /api/upload` - Upload music files
- `GET /music/:filename` - Serve music files

### Socket.IO Events
- `join-room` - Join a music room
- `play-track` - Start playing a track (hosts only)
- `pause-track` - Pause current track (hosts only)
- `seek-track` - Seek to specific time (hosts only)
- `change-volume` - Adjust volume (hosts only)
- `add-to-queue` - Add track to queue (hosts only)
- `remove-from-queue` - Remove track from queue (hosts only)
- `sync-time` - Sync playback time

### File Structure
```
music_streaming/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── README.md             # This file
├── public/               # Frontend files
│   ├── index.html        # Main HTML page
│   ├── style.css         # Styling (Spotify-like theme)
│   └── app.js           # Frontend JavaScript
└── music/               # Uploaded music files directory
```

## 🎯 Use Cases

- **Online Parties**: Host virtual music parties with friends
- **Study Groups**: Create focused study sessions with background music
- **Remote Teams**: Share music during team building activities
- **Radio Shows**: Host your own internet radio show
- **Music Discovery**: Share and discover new music with friends

## 🔒 Security Considerations

- **File Upload**: Limited to audio files with size restrictions
- **Room Privacy**: Room IDs are hard to guess but shareable
- **No Authentication**: Simple, anonymous system - consider adding authentication for production use
- **Local Network**: Works best on local networks; internet access requires port forwarding

## 🐛 Troubleshooting

### Common Issues

1. **Server won't start**:
   - Check if port 3000 is already in use
   - Ensure Node.js is properly installed
   - Run `npm install` to ensure all dependencies are installed

2. **Music not playing**:
   - Check if music files are in the correct format
   - Ensure browser supports the audio format
   - Check browser console for errors

3. **Users out of sync**:
   - Host can click "Sync All" button
   - Users can refresh the page
   - Check internet connection stability

4. **File upload fails**:
   - Ensure file is under 50MB
   - Check file format is supported
   - Check available disk space

### Browser Compatibility
- **Chrome**: Full support
- **Firefox**: Full support
- **Safari**: Full support (may have format limitations)
- **Edge**: Full support
- **Mobile**: Works on modern mobile browsers

## 🚀 Future Enhancements

- **User Authentication**: Login system with user accounts
- **Persistent Rooms**: Rooms that persist after host leaves
- **Playlist Management**: Save and load playlists
- **Music Streaming**: Integration with streaming services
- **Voice Chat**: Add voice communication features
- **File Sharing**: Allow users to share music files
- **Room Categories**: Organize rooms by genre or theme

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues and enhancement requests.

---

**Enjoy your synchronized music experience! 🎵**