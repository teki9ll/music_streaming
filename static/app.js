/**
 * Spotify-Style Music Room Client
 * Enhanced UI with room creation, password protection, and modern interface
 */

class MusicRoomClient {
    constructor() {
        // Core properties
        this.socket = null;
        this.player = document.getElementById('player');
        this.notificationArea = document.getElementById('notificationArea');

        // User state
        this.username = '';
        this.currentRoom = '';
        this.isHost = false;
        this.hostUsername = '';
        this.currentSong = null;

        // UI State
        this.currentScreen = 'welcome'; // welcome, room
        this.activeRooms = [];

        // Audio player state
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;

        // Socket connection management
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.connectSocket();
        this.loadActiveRooms();
    }

    setupEventListeners() {
        // Navigation and modals
        this.setupModalEventListeners();

        // Room creation
        document.getElementById('createRoomBtn').addEventListener('click', () => this.showCreateRoomModal());
        document.getElementById('showJoinRoomBtn').addEventListener('click', () => this.showJoinRoomModal());
        document.getElementById('createRoomFromListBtn').addEventListener('click', () => this.showCreateRoomModal());

        // Player controls
        this.setupPlayerControls();

        // Audio player events
        this.setupAudioPlayer();
    }

    setupModalEventListeners() {
        // Create Room Modal
        const createModal = document.getElementById('createRoomModal');
        document.getElementById('closeCreateModal').addEventListener('click', () => this.hideModal('createRoom'));
        document.getElementById('cancelCreateRoom').addEventListener('click', () => this.hideModal('createRoom'));
        document.getElementById('confirmCreateRoom').addEventListener('click', () => this.handleCreateRoom());

        // Join Room Modal
        const joinModal = document.getElementById('joinRoomModal');
        document.getElementById('closeJoinModal').addEventListener('click', () => this.hideModal('joinRoom'));
        document.getElementById('cancelJoinRoom').addEventListener('click', () => this.hideModal('joinRoom'));
        document.getElementById('confirmJoinRoom').addEventListener('click', () => this.handleJoinRoom());

        // Host Transfer Modal
        const hostModal = document.getElementById('hostModal');
        document.getElementById('acceptHostBtn').addEventListener('click', () => this.handleAcceptHostTransfer());
        document.getElementById('rejectHostBtn').addEventListener('click', () => this.handleRejectHostTransfer());

        // Password toggles
        document.getElementById('toggleCreatePassword').addEventListener('click', () => this.togglePasswordVisibility('createRoomPassword'));
        document.getElementById('toggleJoinPassword').addEventListener('click', () => this.togglePasswordVisibility('joinRoomPassword'));

        // Room navigation
        document.getElementById('backToHome').addEventListener('click', () => this.leaveRoom());

        // Close modals on backdrop click
        [createModal, joinModal, hostModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    // Handle different ID patterns
                    let modalId = modal.id;
                    if (modalId.includes('Modal')) {
                        modalId = modalId.replace('Modal', '');
                    }
                    this.hideModal(modalId);
                }
            });
        });
    }

    setupPlayerControls() {
        const controls = {
            playPauseBtn: document.getElementById('playPauseBtn'),
            seekBackBtn: document.getElementById('seekBackBtn'),
            seekFwdBtn: document.getElementById('seekFwdBtn'),
            repeatBtn: document.getElementById('repeatBtn'),
            shuffleBtn: document.getElementById('shuffleBtn')
        };

        controls.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        controls.seekBackBtn.addEventListener('click', () => this.seek(-10));
        controls.seekFwdBtn.addEventListener('click', () => this.seek(10));
        controls.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        controls.shuffleBtn.addEventListener('click', () => this.toggleShuffle());

        // Progress bar
        const progressContainer = document.querySelector('.progress-container');
        progressContainer.addEventListener('click', (e) => this.handleSeek(e));
    }

    setupAudioPlayer() {
        this.player.addEventListener('timeupdate', () => this.updateProgress());
        this.player.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
        this.player.addEventListener('ended', () => this.onSongEnd());
        this.player.addEventListener('error', (e) => this.onPlayerError(e));
    }

    // Modal Management
    showModal(modalId) {
        const modal = document.getElementById(modalId + 'Modal');
        if (modal) {
            modal.classList.remove('hidden');
            // Clear previous input values
            if (modalId === 'createRoom') {
                document.getElementById('createUsername').value = '';
                document.getElementById('createRoomName').value = '';
                document.getElementById('createRoomPassword').value = '';
            } else if (modalId === 'joinRoom') {
                document.getElementById('joinUsername').value = '';
                document.getElementById('joinRoomName').value = '';
                document.getElementById('joinRoomPassword').value = '';
                document.getElementById('joinPasswordGroup').style.display = 'none';
            }
            // Focus first input
            const firstInput = modal.querySelector('input[type="text"]');
            if (firstInput) {
                firstInput.focus();
            }
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId + 'Modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        if (input.type === 'password') {
            input.type = 'text';
        } else {
            input.type = 'password';
        }
    }

    // Room Creation and Joining
    showCreateRoomModal() {
        this.showModal('createRoom');
    }

    showJoinRoomModal() {
        this.showModal('joinRoom');
    }

    async handleCreateRoom() {
        const username = document.getElementById('createUsername').value.trim();
        const roomName = document.getElementById('createRoomName').value.trim();
        const password = document.getElementById('createRoomPassword').value;

        if (!username) {
            this.showNotification('Please enter your name', 'warning');
            return;
        }

        if (!roomName) {
            this.showNotification('Please enter a room name', 'warning');
            return;
        }

        if (this.socket && this.socket.connected) {
            this.socket.emit('create_room', {
                username,
                room: roomName,
                password
            });
        } else {
            this.showNotification('Not connected to server', 'error');
        }

        this.hideModal('createRoom');
    }

    async handleJoinRoom() {
        const username = document.getElementById('joinUsername').value.trim();
        const roomName = document.getElementById('joinRoomName').value.trim();
        const password = document.getElementById('joinRoomPassword').value;

        if (!username) {
            this.showNotification('Please enter your name', 'warning');
            return;
        }

        if (!roomName) {
            this.showNotification('Please enter a room name', 'warning');
            return;
        }

        // Check if room is locked and password is required
        const roomInfo = this.activeRooms.find(room => room.name === roomName);
        if (roomInfo && roomInfo.is_locked && !password) {
            document.getElementById('joinPasswordGroup').style.display = 'block';
            this.showNotification('This room requires a password', 'warning');
            return;
        }

        if (this.socket && this.socket.connected) {
            // Set username locally
            this.username = username;

            this.socket.emit('join_room', {
                username,
                room: roomName,
                password
            });
        } else {
            this.showNotification('Not connected to server', 'error');
        }

        // Don't hide modal yet - wait for server response
    }

    // Socket.io Connection and Events
    connectSocket() {
        try {
            this.socket = io({
                timeout: 10000,
                transports: ['websocket', 'polling']
            });

            this.setupSocketEvents();

        } catch (error) {
            console.error('Failed to connect to server:', error);
            this.showNotification('Failed to connect to server', 'error');
            this.scheduleReconnect();
        }
    }

    setupSocketEvents() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.reconnectAttempts = 0;
            this.showNotification('Connected to server', 'info');
            this.loadActiveRooms();
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showNotification('Disconnected from server', 'warning');
            this.scheduleReconnect();
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.showNotification('Failed to connect to server', 'error');
            this.scheduleReconnect();
        });

        // Room events
        this.socket.on('room_created', (roomData) => {
            console.log('Room created:', roomData);
            this.handleRoomCreated(roomData);
        });

        this.socket.on('room_state', (roomData) => {
            console.log('Room state:', roomData);
            this.handleRoomState(roomData);
        });

        this.socket.on('rooms_update', (rooms) => {
            console.log('Active rooms update:', rooms);
            this.handleRoomsUpdate(rooms);
        });

        // Error events
        this.socket.on('create_error', (data) => {
            console.error('Create room error:', data);
            this.showNotification(data.message, 'error');
        });

        this.socket.on('join_error', (data) => {
            console.error('Join room error:', data);
            this.showNotification(data.message, 'error');
        });

        this.socket.on('error', (data) => {
            console.error('Socket error:', data);
            this.showNotification(data.message, 'error');
        });

        // User events
        this.socket.on('user_joined', (data) => {
            console.log('User joined:', data);
            this.showNotification(`${data.username} joined the room`, 'info');
        });

        this.socket.on('user_left', (data) => {
            console.log('User left:', data);
            this.showNotification(`${data.username} left the room`, 'info');
        });

        // Music control events
        this.setupMusicControlEvents();
    }

    setupMusicControlEvents() {
        // Control events from other users
        this.socket.on('control', (data) => {
            this.handleRemoteControl(data);
        });

        // Host transfer events
        this.socket.on('host_transfer_request', (data) => {
            this.showHostTransferModal(data);
        });

        this.socket.on('host_transfer_accepted', () => {
            this.isHost = false;
            this.updateUI();
            this.showNotification('Host transfer completed', 'info');
        });

        this.socket.on('host_transfer_rejected', (data) => {
            this.showNotification(`Host transfer rejected by ${data.host_username}`, 'warning');
        });

        // Room sync
        this.socket.on('sync_request', () => {
            if (this.isPlaying && this.currentSong) {
                this.sendSync();
            }
        });
    }

    // Room Management
    handleRoomCreated(roomData) {
        this.username = roomData.host_username;
        this.currentRoom = roomData.name || 'Unknown Room'; // Use room name from data
        this.isHost = roomData.is_host;
        this.hostUsername = roomData.host_username;

        this.switchToRoomScreen();
        this.loadSongs();
        this.showNotification(`Room "${this.currentRoom}" created successfully!`, 'success');
    }

    handleRoomState(roomData) {
        this.currentRoom = roomData.name || this.currentRoom;
        this.isHost = roomData.is_host;
        this.hostUsername = roomData.host_username;

        // Close join modal if it's open
        this.hideModal('joinRoom');

        // Switch to room screen
        this.switchToRoomScreen();

        // Update UI with room state
        this.updateRoomInfo();
        this.updateHostUI();

        // Load songs if not already loaded
        if (document.getElementById('songList').children.length === 1 &&
            document.getElementById('songList').children[0].classList.contains('loading-placeholder')) {
            this.loadSongs();
        }

        // Show success notification
        this.showNotification(`Successfully joined room: ${this.currentRoom}`, 'success');
    }

    handleRoomsUpdate(rooms) {
        this.activeRooms = rooms;
        this.renderActiveRooms();
    }

    renderActiveRooms() {
        const container = document.getElementById('activeRooms');

        if (this.activeRooms.length === 0) {
            container.innerHTML = `
                <div class="loading-placeholder">
                    <div style="text-align: center; padding: 40px 20px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">🎵</div>
                        <p style="font-size: 18px; color: #b3b3b3; margin-bottom: 8px;">No active rooms</p>
                        <p style="font-size: 14px; color: #666;">Be the first to create a room and start listening together!</p>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.activeRooms.map(room => `
            <div class="room-item" data-room="${room.name}">
                <div class="room-info">
                    <h3>${room.name}</h3>
                    <div class="room-meta">
                        <span class="user-count">${room.user_count} users</span>
                        ${room.is_locked ? '<span class="room-locked">🔒 Locked</span>' : ''}
                    </div>
                </div>
                <button class="spotify-btn spotify-btn-secondary" onclick="musicRoom.quickJoinRoom('${room.name}')">
                    Join
                </button>
            </div>
        `).join('');
    }

    quickJoinRoom(roomName) {
        document.getElementById('joinRoomName').value = roomName;

        // Check if room requires password
        const roomInfo = this.activeRooms.find(room => room.name === roomName);
        if (roomInfo && roomInfo.is_locked) {
            document.getElementById('joinPasswordGroup').style.display = 'block';
        }

        this.showModal('joinRoom');
    }

    // Screen Management
    switchToRoomScreen() {
        document.getElementById('welcomeScreen').classList.add('hidden');
        document.getElementById('roomScreen').classList.remove('hidden');
        this.currentScreen = 'room';

        // Update room info in header
        this.updateRoomInfo();
        this.updateHostUI();
    }

    switchToWelcomeScreen() {
        document.getElementById('roomScreen').classList.add('hidden');
        document.getElementById('welcomeScreen').classList.remove('hidden');
        this.currentScreen = 'welcome';

        // Reset state
        this.currentRoom = '';
        this.isHost = false;
        this.hostUsername = '';
        this.currentSong = null;
        this.stopPlayback();
    }

    // UI Updates
    updateRoomInfo() {
        document.getElementById('currentRoomName').textContent = this.currentRoom || 'Room';
        document.getElementById('userCount').textContent = `${this.activeRooms.find(r => r.name === this.currentRoom)?.user_count || 0} users`;
    }

    updateHostUI() {
        const hostBadge = document.getElementById('hostBadge');
        const makeHostBtn = document.getElementById('makeMeHostBtn');

        if (this.isHost) {
            hostBadge.classList.remove('hidden');
            hostBadge.textContent = '👑 HOST';

            if (makeHostBtn) {
                makeHostBtn.classList.add('hidden');
            }

            this.enableControls();
        } else {
            hostBadge.classList.add('hidden');

            if (makeHostBtn) {
                makeHostBtn.classList.remove('hidden');
            }

            this.disableControls();
        }
    }

    enableControls() {
        const controls = ['playPauseBtn', 'seekBackBtn', 'seekFwdBtn', 'stopBtn', 'repeatBtn', 'shuffleBtn'];
        controls.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('disabled-controls');
            }
        });
    }

    disableControls() {
        const controls = ['playPauseBtn', 'seekBackBtn', 'seekFwdBtn', 'stopBtn', 'repeatBtn', 'shuffleBtn'];
        controls.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = true;
                btn.classList.add('disabled-controls');
            }
        });
    }

    // Music Player Functions
    async loadSongs() {
        try {
            const response = await fetch('/songs');
            const songs = await response.json();
            this.renderSongs(songs);
        } catch (error) {
            console.error('Failed to load songs:', error);
            this.showNotification('Failed to load songs', 'error');
            document.getElementById('songList').innerHTML = `
                <div class="loading-placeholder">
                    <p>Failed to load songs</p>
                </div>
            `;
        }
    }

    async loadActiveRooms() {
        try {
            const response = await fetch('/rooms');
            const rooms = await response.json();
            this.activeRooms = rooms;
            this.renderActiveRooms();
        } catch (error) {
            console.error('Failed to load active rooms:', error);
        }
    }

    renderSongs(songs) {
        const container = document.getElementById('songList');

        if (songs.length === 0) {
            container.innerHTML = `
                <div class="loading-placeholder">
                    <p>No songs available</p>
                </div>
            `;
            return;
        }

        container.innerHTML = songs.map(song => `
            <div class="song-item" data-song="${song}" onclick="musicRoom.selectSong('${song}')">
                <div class="song-info">
                    <div class="song-name">${this.getSongDisplayName(song)}</div>
                    <div class="song-artist">${this.getSongArtist(song)}</div>
                </div>
                <div class="song-duration">
                    <button class="spotify-btn spotify-btn-primary play-btn" onclick="event.stopPropagation(); musicRoom.playSong('${song}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        Play
                    </button>
                </div>
            </div>
        `).join('');
    }

    getSongDisplayName(song) {
        // Extract song name from filename
        return song.replace(/\.mp3$/i, '').replace(/_/g, ' ');
    }

    getSongArtist(song) {
        // Try to extract artist from filename (common patterns)
        const parts = song.replace(/\.mp3$/i, '').split(' - ');
        if (parts.length > 1) {
            return parts.slice(1).join(' - ');
        }
        return 'Unknown Artist';
    }

    selectSong(song) {
        if (!this.isHost) {
            this.showNotification('Only the host can select songs', 'warning');
            return;
        }

        this.playSong(song);
    }

    playSong(song) {
        if (!this.isHost) {
            this.showNotification('Only the host can control playback', 'warning');
            return;
        }

        if (!this.currentRoom) {
            this.showNotification('You need to join a room first', 'warning');
            return;
        }

        this.currentSong = song;
        this.loadSong(song);

        // Send control event to server with proper structure
        if (this.socket && this.socket.connected) {
            this.socket.emit('control', {
                room: this.currentRoom,
                action: 'load',
                song: song,
                time: 0
            });

            // Auto-start playing
            this.socket.emit('control', {
                room: this.currentRoom,
                action: 'play',
                song: song,
                time: 0
            });
        }

        this.updateNowPlaying(song);
        this.highlightCurrentSong(song);
        this.showNotification(`Now playing: ${this.getSongDisplayName(song)}`, 'success');
    }

    loadSong(song) {
        // Configure for streaming instead of downloading
        this.player.src = `/music/${encodeURIComponent(song)}`;
        this.player.preload = 'none'; // Don't preload, stream on demand
        this.player.crossOrigin = 'anonymous'; // Enable streaming
        this.player.load();
    }

    updateNowPlaying(song) {
        document.getElementById('currentSongName').textContent = this.getSongDisplayName(song);
        document.getElementById('currentArtist').textContent = this.getSongArtist(song);
    }

    highlightCurrentSong(song) {
        // Remove previous highlight
        document.querySelectorAll('.song-item').forEach(item => {
            item.classList.remove('playing');
        });

        // Add highlight to current song
        const currentSongItem = document.querySelector(`[data-song="${song}"]`);
        if (currentSongItem) {
            currentSongItem.classList.add('playing');
        }
    }

    // Player Controls
    togglePlayPause() {
        if (!this.isHost) {
            this.showNotification('Only the host can control playback', 'warning');
            return;
        }

        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() {
        if (!this.currentRoom) {
            this.showNotification('You need to join a room first', 'warning');
            return;
        }

        if (this.player.src && this.player.readyState >= 2) {
            this.player.play();
            this.isPlaying = true;
            this.updatePlayPauseButton();

            if (this.socket && this.socket.connected) {
                this.socket.emit('control', {
                    room: this.currentRoom,
                    action: 'play',
                    song: this.currentSong,
                    time: this.currentTime
                });
            }
        } else {
            this.showNotification('No song loaded', 'warning');
        }
    }

    pause() {
        if (!this.currentRoom) {
            this.showNotification('You need to join a room first', 'warning');
            return;
        }

        this.player.pause();
        this.isPlaying = false;
        this.updatePlayPauseButton();

        if (this.socket && this.socket.connected) {
            this.socket.emit('control', {
                room: this.currentRoom,
                action: 'pause',
                song: this.currentSong,
                time: this.currentTime
            });
        }
    }

    stop() {
        if (!this.isHost) return;
        if (!this.currentRoom) {
            this.showNotification('You need to join a room first', 'warning');
            return;
        }

        this.player.pause();
        this.player.currentTime = 0;
        this.isPlaying = false;
        this.currentTime = 0;
        this.updatePlayPauseButton();
        this.updateProgress();

        if (this.socket && this.socket.connected) {
            this.socket.emit('control', {
                room: this.currentRoom,
                action: 'stop',
                song: this.currentSong,
                time: 0
            });
        }
    }

    seek(seconds) {
        if (!this.isHost) return;
        if (!this.currentRoom) {
            this.showNotification('You need to join a room first', 'warning');
            return;
        }

        const newTime = Math.max(0, Math.min(this.duration, this.currentTime + seconds));
        this.player.currentTime = newTime;

        if (this.socket && this.socket.connected) {
            this.socket.emit('control', {
                room: this.currentRoom,
                action: 'seek',
                song: this.currentSong,
                time: newTime
            });
        }
    }

    handleSeek(e) {
        if (!this.isHost) return;
        if (!this.currentRoom) {
            this.showNotification('You need to join a room first', 'warning');
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newTime = percent * this.duration;

        this.player.currentTime = newTime;

        if (this.socket && this.socket.connected) {
            this.socket.emit('control', {
                room: this.currentRoom,
                action: 'seek',
                song: this.currentSong,
                time: newTime
            });
        }
    }

    toggleRepeat() {
        // Implementation for repeat functionality
        this.showNotification('Repeat functionality not implemented yet', 'info');
    }

    toggleShuffle() {
        // Implementation for shuffle functionality
        this.showNotification('Shuffle functionality not implemented yet', 'info');
    }

    updatePlayPauseButton() {
        const playIcon = document.querySelector('.play-icon');
        const pauseIcon = document.querySelector('.pause-icon');
        const playPauseBtn = document.getElementById('playPauseBtn');

        if (this.isPlaying) {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
            playPauseBtn.innerHTML = pauseIcon.outerHTML;
        } else {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            playPauseBtn.innerHTML = playIcon.outerHTML;
        }
    }

    // Progress Updates
    updateProgress() {
        this.currentTime = this.player.currentTime;
        this.duration = this.player.duration || 0;

        const progressPercent = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;

        document.getElementById('progressFill').style.width = `${progressPercent}%`;
        document.getElementById('currentTime').textContent = this.formatTime(this.currentTime);
        document.getElementById('totalTime').textContent = this.formatTime(this.duration);
    }

    formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    onLoadedMetadata() {
        this.duration = this.player.duration;
        this.updateProgress();
    }

    onSongEnd() {
        this.isPlaying = false;
        this.updatePlayPauseButton();

        // Auto-play next song or stop
        if (this.socket && this.socket.connected) {
            this.socket.emit('control', {
                type: 'stop',
                data: null
            });
        }
    }

    onPlayerError(error) {
        console.error('Player error:', error);
        this.showNotification('Audio player error', 'error');
    }

    // Remote Control Handling
    handleRemoteControl(data) {
        switch (data.type) {
            case 'play':
                if (data.data && this.player.src) {
                    this.player.currentTime = data.data.time || 0;
                    this.player.play();
                    this.isPlaying = true;
                    this.updatePlayPauseButton();
                }
                break;

            case 'pause':
                this.player.pause();
                this.isPlaying = false;
                this.updatePlayPauseButton();
                break;

            case 'stop':
                this.stop();
                break;

            case 'seek':
                if (data.data && this.player.src) {
                    this.player.currentTime = data.data.time;
                }
                break;

            case 'song':
                if (data.data) {
                    this.currentSong = data.data;
                    this.loadSong(data.data);
                    this.updateNowPlaying(data.data);
                    this.highlightCurrentSong(data.data);
                }
                break;
        }
    }

    // Synchronization
    sendSync() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('sync', {
                song: this.currentSong,
                state: this.isPlaying ? 'playing' : 'paused',
                time: this.currentTime
            });
        }
    }

    // Host Transfer
    showHostTransferModal(data) {
        const modal = document.getElementById('hostModal');
        const message = document.getElementById('hostModalMessage');

        message.textContent = `${data.requester_username} wants to become the host. Do you accept?`;
        modal.classList.remove('hidden');

        // Store the request data for use in button handlers
        this.currentHostRequest = data;
    }

    handleAcceptHostTransfer() {
        if (!this.currentHostRequest || !this.socket) return;

        this.socket.emit('accept_host_transfer', {
            requester_sid: this.currentHostRequest.requester_sid,
            room: this.currentHostRequest.room
        });

        this.hideModal('host');
        this.currentHostRequest = null;
        this.showNotification('Host transfer accepted', 'info');
    }

    handleRejectHostTransfer() {
        if (!this.currentHostRequest || !this.socket) return;

        this.socket.emit('reject_host_transfer', {
            requester_sid: this.currentHostRequest.requester_sid,
            room: this.currentHostRequest.room
        });

        this.hideModal('host');
        this.currentHostRequest = null;
        this.showNotification('Host transfer rejected', 'warning');
    }

    requestHost() {
        if (!this.currentRoom) return;

        if (this.socket && this.socket.connected) {
            this.socket.emit('request_host', { room: this.currentRoom });
        }
    }

    // Room Management
    leaveRoom() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('leave_room', { room: this.currentRoom });
        }

        this.stopPlayback();
        this.switchToWelcomeScreen();
    }

    stopPlayback() {
        this.player.pause();
        this.player.src = '';
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        this.currentSong = null;

        this.updatePlayPauseButton();
        this.updateProgress();
        this.updateNowPlaying('No song playing');

        // Clear song highlighting
        document.querySelectorAll('.song-item').forEach(item => {
            item.classList.remove('playing');
        });
    }

    // Reconnection Logic
    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectDelay *= 2; // Exponential backoff
            setTimeout(() => {
                this.reconnectAttempts++;
                console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                this.connectSocket();
            }, this.reconnectDelay);
        } else {
            this.showNotification('Unable to reconnect to server', 'error');
        }
    }

    // Notifications
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        this.notificationArea.appendChild(notification);

        // Trigger animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
}

// Initialize the music room client when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.musicRoom = new MusicRoomClient();
    console.log('Spotify-Style Music Room Client initialized');
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.musicRoom) {
        // Page is hidden, pause playback
        if (window.musicRoom.isPlaying) {
            window.musicRoom.pause();
        }
    }
});

// Handle beforeunload to ensure proper cleanup
window.addEventListener('beforeunload', () => {
    if (window.musicRoom && window.musicRoom.socket) {
        window.musicRoom.socket.disconnect();
    }
});