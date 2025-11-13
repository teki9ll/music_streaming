// Optimized Music Streaming Client - Best Practices Implementation
class MusicStreamClient {
    constructor() {
        this.socket = io({
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true,
            timeout: 20000,
            maxRetries: 3
        });

        this.currentRoom = null;
        this.username = null;
        this.player = document.getElementById('player');
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.syncInterval = null;
        this.lastSyncTime = 0;

        // Performance optimizations
        this.updateThrottle = 100; // ms
        this.syncIntervalTime = 5000; // ms
        this.toleranceThreshold = 0.5; // seconds

        // State management
        this.localState = {
            song: null,
            state: 'stopped',
            time: 0,
            isPlaying: false
        };

        // Host management
        this.isHost = false;
        this.hostUsername = null;
        this.pendingHostTransfer = null;

        this.initializeEventListeners();
        this.startPeriodicSync();
    }

    initializeEventListeners() {
        // Socket events
        this.socket.on('connect', () => this.handleConnect());
        this.socket.on('disconnect', () => this.handleDisconnect());
        this.socket.on('connect_error', (error) => this.handleConnectionError(error));

        // Room events
        this.socket.on('room_state', (data) => this.handleRoomState(data));
        this.socket.on('update', (data) => this.handleUpdate(data));
        this.socket.on('sync_response', (data) => this.handleSyncResponse(data));
        this.socket.on('error', (data) => this.handleError(data));

        // User events
        this.socket.on('user_joined', (data) => this.handleUserJoined(data));
        this.socket.on('user_left', (data) => this.handleUserLeft(data));
        this.socket.on('user_count_update', (data) => this.handleUserCountUpdate(data));

        // Room list events
        this.socket.on('rooms_update', (rooms) => this.updateRoomsDisplay(rooms));

        // Host management events
        this.socket.on('host_changed', (data) => this.handleHostChanged(data));
        this.socket.on('host_transfer_request', (data) => this.handleHostTransferRequest(data));
        this.socket.on('host_granted', () => this.handleHostGranted());
        this.socket.on('host_transfer_rejected', (data) => this.handleHostTransferRejected(data));

        // Player events with optimization
        this.setupPlayerEvents();

        // UI events
        this.setupUIEvents();
    }

    setupPlayerEvents() {
        // Throttled event handlers for better performance
        let lastPlayEmit = 0;
        let lastPauseEmit = 0;
        let lastSeekEmit = 0;

        this.player.addEventListener('loadedmetadata', () => {
            this.logDebug(`Audio loaded: ${this.player.duration}s duration`);
        });

        this.player.addEventListener('canplay', () => {
            this.logDebug('Audio can play');
        });

        this.player.addEventListener('waiting', () => {
            this.logDebug('Audio buffering...');
        });

        this.player.addEventListener('stalled', () => {
            this.logDebug('Audio stalled');
        });

        this.player.addEventListener('error', (e) => {
            this.logError(`Audio error: ${e.message || 'Unknown error'}`);
            this.showNotification('Error loading audio file', 'error');
        });

        // Throttled play/pause events
        this.player.addEventListener('play', () => {
            const now = Date.now();
            if (now - lastPlayEmit > this.updateThrottle) {
                this.localState.isPlaying = true;
                this.control('play', {
                    song: this.getCurrentSong(),
                    time: this.player.currentTime
                });
                lastPlayEmit = now;
            }
        });

        this.player.addEventListener('pause', () => {
            const now = Date.now();
            if (now - lastPauseEmit > this.updateThrottle && this.localState.isPlaying) {
                this.localState.isPlaying = false;
                this.control('pause', { time: this.player.currentTime });
                lastPauseEmit = now;
            }
        });

        // Throttled seek events
        this.player.addEventListener('seeked', () => {
            const now = Date.now();
            if (now - lastSeekEmit > this.updateThrottle) {
                this.control('seek', { time: this.player.currentTime });
                lastSeekEmit = now;
            }
        });

        // Time update for sync verification
        this.player.addEventListener('timeupdate', () => {
            if (this.localState.state === 'playing' && this.localState.isPlaying) {
                this.verifySync();
            }
        });
    }

    setupUIEvents() {
        // Room controls
        document.getElementById('joinBtn').addEventListener('click', () => this.joinRoom());
        document.getElementById('username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        document.getElementById('room').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // Player controls
        document.getElementById('playBtn').addEventListener('click', () => this.control('play'));
        document.getElementById('pauseBtn').addEventListener('click', () => this.control('pause'));
        document.getElementById('stopBtn').addEventListener('click', () => this.control('stop'));
        document.getElementById('seekBack').addEventListener('click', () => this.seekBy(-10));
        document.getElementById('seekFwd').addEventListener('click', () => this.seekBy(10));

        // Room list refresh
        setInterval(() => this.loadActiveRooms(), 30000); // Refresh every 30s

        // Host transfer modal buttons
        document.getElementById('acceptHostBtn').addEventListener('click', () => this.acceptHostTransfer());
        document.getElementById('rejectHostBtn').addEventListener('click', () => this.rejectHostTransfer());
    }

    // Connection handling
    handleConnect() {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.logInfo('Connected to server');
        this.hideNotification();
        this.loadActiveRooms();

        // If we were in a room, rejoin it
        if (this.currentRoom && this.username) {
            setTimeout(() => {
                this.socket.emit('join_room', { username: this.username, room: this.currentRoom });
            }, 100);
        }
    }

    handleDisconnect() {
        this.isConnected = false;
        this.logInfo('Disconnected from server');
        this.showNotification('Connection lost. Attempting to reconnect...', 'warning');
        this.attemptReconnect();
    }

    handleConnectionError(error) {
        this.logError(`Connection error: ${error.message}`);
        this.showNotification('Connection error. Please check your internet connection.', 'error');
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.logInfo(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            setTimeout(() => {
                this.socket.connect();
            }, Math.pow(2, this.reconnectAttempts) * 1000); // Exponential backoff
        } else {
            this.showNotification('Unable to reconnect. Please refresh the page.', 'error');
        }
    }

    // Room management
    async joinRoom() {
        const usernameInput = document.getElementById('username').value.trim();
        const roomInput = document.getElementById('room').value.trim();

        if (!usernameInput) {
            this.showNotification('Please enter your name', 'warning');
            document.getElementById('username').focus();
            return;
        }

        this.username = usernameInput;
        this.currentRoom = roomInput || 'lobby';

        // Update UI
        document.getElementById('roomName').innerText = this.currentRoom;
        document.getElementById('joinBox').classList.add('hidden');
        document.getElementById('roomBox').classList.remove('hidden');

        // Join room
        this.socket.emit('join_room', { username: this.username, room: this.currentRoom });

        // Load songs
        await this.loadSongs();

        // Start sync verification
        this.startPeriodicSync();
    }

    leaveRoom() {
        if (this.currentRoom) {
            this.socket.emit('leave_room', { room: this.currentRoom });
            this.currentRoom = null;
            this.localState = { song: null, state: 'stopped', time: 0, isPlaying: false };
            this.isHost = false;
            this.hostUsername = null;
            this.pendingHostTransfer = null;

            // Stop player
            this.player.pause();
            this.player.currentTime = 0;

            // Update UI
            document.getElementById('joinBox').classList.remove('hidden');
            document.getElementById('roomBox').classList.add('hidden');
            document.getElementById('userCount').innerText = '0';

            // Stop sync
            this.stopPeriodicSync();

            // Refresh rooms list
            this.loadActiveRooms();
        }
    }

    // Host Management Functions
    requestHost() {
        if (!this.currentRoom) return;

        this.socket.emit('request_host', { room: this.currentRoom });
        this.logInfo(`Requesting host permissions in room ${this.currentRoom}`);
    }

    acceptHostTransfer() {
        if (!this.pendingHostTransfer) return;

        this.socket.emit('accept_host_transfer', {
            room: this.currentRoom,
            requester_sid: this.pendingHostTransfer.requester_sid
        });

        this.closeModal();
        this.showNotification(`Host transferred to ${this.pendingHostTransfer.requester_username}`, 'info');
        this.logInfo(`Accepted host transfer to ${this.pendingHostTransfer.requester_username}`);

        this.pendingHostTransfer = null;
    }

    rejectHostTransfer() {
        if (!this.pendingHostTransfer) return;

        this.socket.emit('reject_host_transfer', {
            room: this.currentRoom,
            requester_sid: this.pendingHostTransfer.requester_sid
        });

        this.closeModal();
        this.showNotification(`Rejected host transfer from ${this.pendingHostTransfer.requester_username}`, 'info');

        this.pendingHostTransfer = null;
    }

    showHostTransferModal(requester) {
        this.pendingHostTransfer = requester;

        const modal = document.getElementById('hostModal');
        const message = document.getElementById('hostModalMessage');

        message.textContent = `${requester.requester_username} wants to become the host of this room. Do you accept?`;
        modal.classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('hostModal').classList.add('hidden');
        this.pendingHostTransfer = null;
    }

    updateHostUI(isHost, hostUsername) {
        this.isHost = isHost;
        this.hostUsername = hostUsername;

        // Update host name display
        document.getElementById('hostName').textContent = hostUsername || 'None';

        // Update host badge
        const hostBadge = document.getElementById('hostBadge');
        const hostBtn = document.getElementById('hostBtn');

        if (isHost) {
            hostBadge.classList.remove('hidden');
            hostBtn.style.display = 'none';
            this.showNotification('👑 You are now the host!', 'success');
        } else {
            hostBadge.classList.add('hidden');
            hostBtn.style.display = 'block';
            this.showNotification(`Host: ${hostUsername}`, 'info');
        }

        // Update player controls
        this.updatePlayerControls();
    }

    updatePlayerControls() {
        const controls = document.querySelectorAll('.controls button');
        controls.forEach(button => {
            // Don't disable the host button as it's handled separately
            if (button.id === 'hostBtn') return;

            button.disabled = !this.isHost;

            // Add visual indicator for disabled controls
            if (!this.isHost) {
                button.parentElement.classList.add('disabled-controls');
            } else {
                button.parentElement.classList.remove('disabled-controls');
            }
        });
    }

    // Song management
    async loadSongs() {
        try {
            const response = await fetch('/songs');
            if (!response.ok) throw new Error('Failed to load songs');

            const songs = await response.json();
            const songList = document.getElementById('songList');

            if (songs.length === 0) {
                songList.innerHTML = '<li class="no-songs">No MP3 files found in music directory</li>';
                return;
            }

            // Optimize rendering with document fragment
            const fragment = document.createDocumentFragment();
            songs.forEach(song => {
                const li = document.createElement('li');
                const escapedSong = this.escapeHtml(song);

                li.innerHTML = `
                    <span class="song-name">${escapedSong}</span>
                    <div class="song-controls">
                        <button onclick="musicClient.loadSong('${escapedSong}')" class="btn btn-secondary">Load</button>
                        <button onclick="musicClient.playSong('${escapedSong}')" class="btn btn-primary">Play</button>
                    </div>
                `;
                fragment.appendChild(li);
            });

            songList.innerHTML = '';
            songList.appendChild(fragment);

        } catch (error) {
            this.logError('Error loading songs:', error);
            document.getElementById('songList').innerHTML = '<li class="error">Error loading songs. Please refresh.</li>';
        }
    }

    loadSong(song) {
        this.logInfo(`Loading song: ${song}`);

        // Update player source
        const encodedSong = encodeURIComponent(song);
        this.player.src = `/music/${encodedSong}`;
        this.player.currentTime = 0;

        // Update local state
        this.localState.song = song;
        this.localState.state = 'stopped';
        this.localState.isPlaying = false;

        // Sync with room
        this.control('load', { song, time: 0 });
    }

    async playSong(song) {
        this.logInfo(`Playing song: ${song}`);

        // Load and play
        await this.loadSong(song);
        try {
            await this.player.play();
        } catch (error) {
            this.logError('Error playing song:', error);
            this.showNotification('Error playing song. Please try again.', 'error');
        }
    }

    // Control functions
    control(action, extras = {}) {
        if (!this.currentRoom || !this.isConnected) return;

        const payload = {
            room: this.currentRoom,
            action,
            time: this.player.currentTime,
            ...extras
        };

        this.socket.emit('control', payload);
        this.logDebug(`Control: ${action}`, payload);
    }

    seekBy(delta) {
        const newTime = Math.max(0, Math.min(this.player.duration || 0, this.player.currentTime + delta));
        this.player.currentTime = newTime;
    }

    // Synchronization
    startPeriodicSync() {
        this.stopPeriodicSync(); // Clear any existing interval
        this.syncInterval = setInterval(() => {
            if (this.currentRoom && this.localState.state === 'playing') {
                this.requestSync();
            }
        }, this.syncIntervalTime);
    }

    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    requestSync() {
        if (!this.currentRoom) return;

        this.socket.emit('sync_request', { room: this.currentRoom });
        this.lastSyncTime = Date.now();
    }

    verifySync() {
        if (!this.currentRoom || this.localState.state !== 'playing') return;

        const currentTime = this.player.currentTime;
        const serverTime = this.localState.time || 0;
        const timeDiff = Math.abs(currentTime - serverTime);

        // If drift is too large, request sync
        if (timeDiff > this.toleranceThreshold && Date.now() - this.lastSyncTime > 2000) {
            this.logDebug(`Sync drift detected: ${timeDiff.toFixed(2)}s`);
            this.requestSync();
        }
    }

    // Event handlers
    handleRoomState(data) {
        this.logDebug('Received room state:', data);
        this.applyState(data);

        if (data.users) {
            document.getElementById('userCount').innerText = data.users.length;
        }

        // Update host UI if host information is available
        if (data.is_host !== undefined && data.host_username !== undefined) {
            this.updateHostUI(data.is_host, data.host_username);
        }
    }

    handleUpdate(data) {
        this.logDebug('Received update:', data);
        this.applyState(data);
    }

    handleSyncResponse(data) {
        this.logDebug('Received sync response:', data);
        this.applyState(data, true); // Force apply for sync
    }

    applyState(data, forceSync = false) {
        if (!data) return;

        try {
            // Update song if different
            if (data.song && data.song !== this.localState.song) {
                const encodedSong = encodeURIComponent(data.song);
                if (this.player.src.indexOf(encodedSong) === -1) {
                    this.player.src = `/music/${encodedSong}`;
                    this.logInfo(`Changed song to: ${data.song}`);
                }
                this.localState.song = data.song;
            }

            // Apply state changes
            const currentState = data.state || 'stopped';
            const targetTime = parseFloat(data.time || 0);

            // Smooth transitions between states
            switch (currentState) {
                case 'playing':
                    if (this.localState.state !== 'playing' || forceSync) {
                        // Seek if time difference is significant
                        if (Math.abs(this.player.currentTime - targetTime) > this.toleranceThreshold) {
                            this.player.currentTime = targetTime;
                        }

                        // Attempt to play
                        this.player.play().catch(error => {
                            this.logError('Play error:', error);
                        });
                        this.localState.state = 'playing';
                        this.localState.isPlaying = true;
                    }
                    break;

                case 'paused':
                    if (this.localState.state !== 'paused' || forceSync) {
                        this.player.pause();
                        if (Math.abs(this.player.currentTime - targetTime) > this.toleranceThreshold) {
                            this.player.currentTime = targetTime;
                        }
                        this.localState.state = 'paused';
                        this.localState.isPlaying = false;
                    }
                    break;

                case 'stopped':
                    if (this.localState.state !== 'stopped' || forceSync) {
                        this.player.pause();
                        this.player.currentTime = 0;
                        this.localState.state = 'stopped';
                        this.localState.isPlaying = false;
                    }
                    break;
            }

            // Update time reference
            if (data.time !== undefined) {
                this.localState.time = targetTime;
            }

        } catch (error) {
            this.logError('Error applying state:', error);
        }
    }

    // Room management
    async loadActiveRooms() {
        try {
            const response = await fetch('/rooms');
            if (!response.ok) return;

            const rooms = await response.json();
            this.updateRoomsDisplay(rooms);
        } catch (error) {
            this.logError('Error loading active rooms:', error);
        }
    }

    updateRoomsDisplay(rooms) {
        const container = document.getElementById('activeRooms');

        if (!rooms || rooms.length === 0) {
            container.innerHTML = '<p class="no-rooms">No active rooms</p>';
            return;
        }

        // Sort by user count (most active first)
        rooms.sort((a, b) => b.user_count - a.user_count);

        // Optimize rendering
        const fragment = document.createDocumentFragment();
        rooms.forEach(room => {
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';

            const statusIndicator = room.state === 'playing' ? '🎵' : '⏸️';
            const statusText = room.state === 'playing' ? 'Playing' : room.state === 'paused' ? 'Paused' : 'Stopped';

            const hostInfo = room.host_username ? `👑 Host: ${this.escapeHtml(room.host_username)}` : '';
            roomDiv.innerHTML = `
                <div class="room-info">
                    <div class="room-name">${this.escapeHtml(room.name)}</div>
                    <div class="room-details">
                        ${room.user_count} user${room.user_count !== 1 ? 's' : ''}
                        ${statusIndicator} ${statusText}
                        ${room.song ? ` • ${this.escapeHtml(room.song)}` : ''}
                        ${hostInfo ? ` • ${hostInfo}` : ''}
                    </div>
                </div>
                <button onclick="musicClient.joinSpecificRoom('${this.escapeHtml(room.name)}')" class="btn btn-sm">Join</button>
            `;
            fragment.appendChild(roomDiv);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    joinSpecificRoom(roomName) {
        document.getElementById('room').value = roomName;
        const username = document.getElementById('username').value.trim();

        if (username) {
            this.joinRoom();
        } else {
            document.getElementById('username').focus();
            this.showNotification('Please enter your name first', 'warning');
        }
    }

    // User event handlers
    handleUserJoined(data) {
        this.logInfo(`${data.username} joined the room`);
        this.showNotification(`${data.username} joined the room`, 'info');
    }

    handleUserLeft(data) {
        this.logInfo(`${data.username} left the room`);
        this.showNotification(`${data.username} left the room`, 'info');
    }

    handleUserCountUpdate(data) {
        const count = data.count || 0;
        document.getElementById('userCount').innerText = count;
    }

    handleError(data) {
        this.logError('Server error:', data);
        this.showNotification(data.message || 'An error occurred', 'error');
    }

    // Host management event handlers
    handleHostChanged(data) {
        this.logInfo('Host changed:', data);
        this.showNotification(`👑 Host changed to ${data.new_host}`, 'info');

        // Update UI for current user
        const isCurrentHost = data.new_host === this.username;
        this.updateHostUI(isCurrentHost, data.new_host);
    }

    handleHostTransferRequest(data) {
        this.logInfo('Host transfer request:', data);
        this.showHostTransferModal(data);
    }

    handleHostGranted() {
        this.logInfo('Host granted!');
        this.updateHostUI(true, this.username);
        this.showNotification('👑 You are now the host!', 'success');
        this.closeModal();
    }

    handleHostTransferRejected(data) {
        this.logInfo('Host transfer rejected:', data);
        this.closeModal();
        this.showNotification(`Host transfer rejected by ${data.host_username}`, 'warning');
    }

    // Utility functions
    getCurrentSong() {
        try {
            const parts = this.player.src.split('/');
            return decodeURIComponent(parts[parts.length - 1]);
        } catch (e) {
            return null;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'info', duration = 3000) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Add to page
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => notification.classList.add('show'), 10);

        // Remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    hideNotification() {
        const notifications = document.querySelectorAll('.notification');
        notifications.forEach(n => {
            n.classList.remove('show');
            setTimeout(() => {
                if (n.parentNode) {
                    n.parentNode.removeChild(n);
                }
            }, 300);
        });
    }

    // Logging
    logInfo(...args) {
        console.log('[MusicClient]', ...args);
    }

    logDebug(...args) {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.debug('[MusicClient]', ...args);
        }
    }

    logError(...args) {
        console.error('[MusicClient]', ...args);
    }
}

// Initialize the client
let musicClient;

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    musicClient = new MusicStreamClient();

    // Load initial rooms list
    musicClient.loadActiveRooms();

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;

        switch(e.code) {
            case 'Space':
                e.preventDefault();
                if (musicClient.localState.isPlaying) {
                    musicClient.control('pause');
                } else {
                    musicClient.control('play');
                }
                break;
            case 'ArrowLeft':
                musicClient.seekBy(-5);
                break;
            case 'ArrowRight':
                musicClient.seekBy(5);
                break;
            case 'ArrowUp':
                e.preventDefault();
                musicClient.player.volume = Math.min(1, musicClient.player.volume + 0.1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                musicClient.player.volume = Math.max(0, musicClient.player.volume - 0.1);
                break;
        }
    });

    // Optimize for mobile
    if ('serviceWorker' in navigator) {
        // We could add a service worker for caching here if needed
        console.log('Service Worker support detected');
    }
});