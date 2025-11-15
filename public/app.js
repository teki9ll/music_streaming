class RemoteMusicPlayer {
    constructor() {
        this.socket = null;
        this.currentRoom = null;
        this.currentUser = null;
        this.isHost = false;
        this.musicLibraryData = [];
        this.currentTrack = null;
        this.isPlaying = false;
        this.currentTime = 0;
        this.volume = 1.0;
        this.syncInterval = null;

        this.initializeElements();
        this.bindEvents();
        this.loadMusicLibrary();
    }

    initializeElements() {
        console.log('Initializing DOM elements...');
        const elementIds = [
            'landingPage', 'playerPage', 'createRoomBtn', 'joinRoomBtn',
            'createRoomForm', 'joinRoomForm', 'confirmCreateBtn', 'confirmJoinBtn',
            'cancelCreateBtn', 'cancelJoinBtn', 'roomName', 'roomId', 'currentUsername',
            'userRole', 'leaveRoomBtn', 'audioPlayer', 'trackTitle', 'trackName',
            'trackArtist', 'progressBar', 'progressHandle', 'currentTime', 'totalTime',
            'playPauseBtn', 'prevBtn', 'nextBtn', 'volumeSlider', 'volumeValue',
            'musicLibrary', 'queue', 'uploadBtn', 'clearQueueBtn', 'usersList',
            'userCount', 'hostControls', 'syncAllBtn', 'manageCohostsBtn',
            'uploadModal', 'cohostModal', 'closeUploadModal', 'closeCohostModal',
            'uploadArea', 'fileInput', 'uploadProgress', 'progressBarFill',
            'uploadStatus', 'cohostList', 'roomNameInput', 'hostUsernameInput',
            'roomIdInput', 'usernameInput'
        ];

        elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (!element) {
                console.warn(`Element with id '${id}' not found`);
            } else {
                this[id] = element;
                console.log(`Found element: ${id}`);
            }
        });

        console.log('DOM elements initialization complete');

        // Fix some element references that need special handling
        this.currentTimeDisplay = this.currentTime;
        this.totalTimeDisplay = this.totalTime;
        this.musicLibraryElement = this.musicLibrary;
        this.queueElement = this.queue;
    }

    bindEvents() {
        console.log('Binding events...');

        try {
            // Landing page events
            if (this.createRoomBtn) {
                this.createRoomBtn.addEventListener('click', () => this.showCreateRoomForm());
                console.log('Bound createRoomBtn click event');
            }
            if (this.joinRoomBtn) {
                this.joinRoomBtn.addEventListener('click', () => this.showJoinRoomForm());
                console.log('Bound joinRoomBtn click event');
            }
            if (this.confirmCreateBtn) {
                this.confirmCreateBtn.addEventListener('click', () => this.createRoom());
                console.log('Bound confirmCreateBtn click event');
            }
            if (this.confirmJoinBtn) {
                this.confirmJoinBtn.addEventListener('click', () => this.joinRoom());
                console.log('Bound confirmJoinBtn click event');
            }
            if (this.cancelCreateBtn) {
                this.cancelCreateBtn.addEventListener('click', () => this.hideCreateRoomForm());
                console.log('Bound cancelCreateBtn click event');
            }
            if (this.cancelJoinBtn) {
                this.cancelJoinBtn.addEventListener('click', () => this.hideJoinRoomForm());
                console.log('Bound cancelJoinBtn click event');
            }

            // Add Enter key support for forms
            if (this.roomNameInput) {
                this.roomNameInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.createRoom();
                });
                console.log('Bound roomNameInput keypress event');
            }
            if (this.hostUsernameInput) {
                this.hostUsernameInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.createRoom();
                });
                console.log('Bound hostUsernameInput keypress event');
            }
            if (this.roomIdInput) {
                this.roomIdInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.joinRoom();
                });
                console.log('Bound roomIdInput keypress event');
            }
            if (this.usernameInput) {
                this.usernameInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.joinRoom();
                });
                console.log('Bound usernameInput keypress event');
            }

            // Player page events
            if (this.leaveRoomBtn) {
                this.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
                console.log('Bound leaveRoomBtn click event');
            }

            // Music player events
            if (this.playPauseBtn) {
                this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
                console.log('Bound playPauseBtn click event');
            }
            if (this.prevBtn) {
                this.prevBtn.addEventListener('click', () => this.playPrevious());
                console.log('Bound prevBtn click event');
            }
            if (this.nextBtn) {
                this.nextBtn.addEventListener('click', () => this.playNext());
                console.log('Bound nextBtn click event');
            }
            if (this.volumeSlider) {
                this.volumeSlider.addEventListener('input', (e) => this.changeVolume(e.target.value));
                console.log('Bound volumeSlider input event');
            }

            // Progress bar events
            if (this.audioPlayer) {
                this.audioPlayer.addEventListener('timeupdate', () => this.updateProgress());
                this.audioPlayer.addEventListener('loadedmetadata', () => this.updateDuration());
                this.audioPlayer.addEventListener('ended', () => this.onTrackEnded());
                console.log('Bound audio player events');
            }

            // Progress bar click/drag
            const progressBar = document.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.addEventListener('click', (e) => this.seekTo(e));
                console.log('Bound progress bar click event');

                let isDragging = false;
                if (this.progressHandle) {
                    this.progressHandle.addEventListener('mousedown', () => isDragging = true);
                    document.addEventListener('mousemove', (e) => {
                        if (isDragging) this.seekTo(e);
                    });
                    document.addEventListener('mouseup', () => isDragging = false);
                    console.log('Bound progress handle drag events');
                }
            }

            // Upload events
            if (this.uploadBtn) {
                this.uploadBtn.addEventListener('click', () => this.showUploadModal());
                console.log('Bound uploadBtn click event');
            }
            if (this.closeUploadModal) {
                this.closeUploadModal.addEventListener('click', () => this.hideUploadModal());
                console.log('Bound closeUploadModal click event');
            }
            if (this.uploadArea) {
                this.uploadArea.addEventListener('click', () => this.fileInput.click());
                console.log('Bound uploadArea click event');
            }
            if (this.fileInput) {
                this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
                console.log('Bound fileInput change event');
            }

            // Drag and drop
            if (this.uploadArea) {
                this.uploadArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    this.uploadArea.classList.add('drag-over');
                });
                this.uploadArea.addEventListener('dragleave', () => {
                    this.uploadArea.classList.remove('drag-over');
                });
                this.uploadArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    this.uploadArea.classList.remove('drag-over');
                    this.handleFileSelect(e.dataTransfer.files);
                });
                console.log('Bound drag and drop events');
            }

            // Host controls
            if (this.syncAllBtn) {
                this.syncAllBtn.addEventListener('click', () => this.syncAllUsers());
                console.log('Bound syncAllBtn click event');
            }
            if (this.manageCohostsBtn) {
                this.manageCohostsBtn.addEventListener('click', () => this.showCohostModal());
                console.log('Bound manageCohostsBtn click event');
            }
            if (this.closeCohostModal) {
                this.closeCohostModal.addEventListener('click', () => this.hideCohostModal());
                console.log('Bound closeCohostModal click event');
            }
            if (this.clearQueueBtn) {
                this.clearQueueBtn.addEventListener('click', () => this.clearQueue());
                console.log('Bound clearQueueBtn click event');
            }

            console.log('All events bound successfully');
        } catch (error) {
            console.error('Error binding events:', error);
        }
    }

    // Socket.IO connection
    connectSocket() {
        console.log('Connecting to Socket.IO server...');
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('✅ Connected to server with socket ID:', this.socket.id);
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ Socket.IO connection error:', error);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Disconnected from server:', reason);
        });

        this.socket.on('room-state', (data) => {
            console.log('📡 Received room-state:', data);
            this.updateRoomState(data);
        });

        this.socket.on('track-playing', (data) => {
            console.log('🎵 Received track-playing:', data);
            this.handleTrackPlaying(data);
        });

        this.socket.on('track-paused', (data) => {
            console.log('⏸️ Received track-paused:', data);
            this.handleTrackPaused(data);
        });

        this.socket.on('track-seeked', (data) => {
            console.log('⏩ Received track-seeked:', data);
            this.handleTrackSeeked(data);
        });

        this.socket.on('volume-changed', (data) => {
            console.log('🔊 Received volume-changed:', data);
            this.handleVolumeChanged(data);
        });

        this.socket.on('queue-updated', (queue) => {
            console.log('📋 Received queue-updated:', queue);
            this.updateQueue(queue);
        });

        this.socket.on('users-updated', (users) => {
            console.log('👥 Received users-updated:', users);
            this.updateUsersList(users);
        });

        this.socket.on('user-joined', (data) => {
            console.log('👋 Received user-joined:', data);
            this.showToast(`${data.user.username} joined the room`, 'info');
            this.updateUsersList(data.connectedUsers);
        });

        this.socket.on('user-left', (data) => {
            console.log('👋 Received user-left:', data);
            this.showToast(`${data.user.username} left the room`, 'info');
            this.updateUsersList(data.connectedUsers);
        });

        this.socket.on('error', (error) => {
            console.error('❌ Received socket error:', error);
            this.showToast(error.message, 'error');
        });
    }

    // Room management
    showCreateRoomForm() {
        console.log('🏠 Showing create room form...');
        if (this.createRoomForm) {
            this.createRoomForm.classList.remove('hidden');
            console.log('✅ Create room form shown');
        } else {
            console.error('❌ Create room form not found');
        }
        if (this.joinRoomForm) {
            this.joinRoomForm.classList.add('hidden');
        }
    }

    hideCreateRoomForm() {
        console.log('🙈 Hiding create room form...');
        if (this.createRoomForm) {
            this.createRoomForm.classList.add('hidden');
        }
    }

    showJoinRoomForm() {
        console.log('🎧 Showing join room form...');
        if (this.joinRoomForm) {
            this.joinRoomForm.classList.remove('hidden');
            console.log('✅ Join room form shown');
        } else {
            console.error('❌ Join room form not found');
        }
        if (this.createRoomForm) {
            this.createRoomForm.classList.add('hidden');
        }
    }

    hideJoinRoomForm() {
        console.log('🙈 Hiding join room form...');
        if (this.joinRoomForm) {
            this.joinRoomForm.classList.add('hidden');
        }
    }

    async createRoom() {
        console.log('🏠 Creating room...');
        const roomName = this.roomNameInput.value.trim();
        const username = this.hostUsernameInput.value.trim();

        console.log('Room name:', roomName, 'Username:', username);

        if (!roomName) {
            console.log('❌ Room name validation failed');
            this.showToast('Please enter a room name', 'error');
            this.roomNameInput.focus();
            return;
        }

        if (!username) {
            this.showToast('Please enter your username', 'error');
            this.hostUsernameInput.focus();
            return;
        }

        if (username.length < 2) {
            this.showToast('Username must be at least 2 characters', 'error');
            this.hostUsernameInput.focus();
            return;
        }

        try {
            const response = await fetch('/api/rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: roomName, username })
            });

            if (!response.ok) {
                throw new Error('Failed to create room');
            }

            const data = await response.json();

            this.currentRoom = {
                id: data.roomId,
                name: roomName
            };
            this.currentUser = {
                id: data.userId,
                username: username,
                isHost: true
            };
            this.isHost = true;

            console.log('✅ Room created successfully:', data);
            this.connectSocket();
            this.joinRoomSocket();
            this.showPlayerPage();
            this.showToast(`Room "${roomName}" created successfully!`, 'success');
        } catch (error) {
            this.showToast('Failed to create room', 'error');
            console.error('Create room error:', error);
        }
    }

    async joinRoom() {
        const roomId = this.roomIdInput.value.trim().toUpperCase();
        const username = this.usernameInput.value.trim();

        if (!roomId) {
            this.showToast('Please enter a room ID', 'error');
            this.roomIdInput.focus();
            return;
        }

        if (roomId.length < 4) {
            this.showToast('Room ID must be at least 4 characters', 'error');
            this.roomIdInput.focus();
            return;
        }

        if (!username) {
            this.showToast('Please enter your username', 'error');
            this.usernameInput.focus();
            return;
        }

        if (username.length < 2) {
            this.showToast('Username must be at least 2 characters', 'error');
            this.usernameInput.focus();
            return;
        }

        this.currentRoom = {
            id: roomId,
            name: `Room ${roomId}`
        };
        this.currentUser = {
            id: null,
            username: username,
            isHost: false
        };
        this.isHost = false;

        this.connectSocket();
        this.joinRoomSocket();
        this.showPlayerPage();
        this.showToast(`Joined room ${roomId} as ${username}`, 'success');
    }

    joinRoomSocket() {
        console.log('🔌 Joining room via socket...');
        if (this.socket && this.currentRoom) {
            const joinData = {
                roomId: this.currentRoom.id,
                username: this.currentUser.username,
                isHost: this.isHost
            };
            console.log('Emitting join-room with data:', joinData);
            this.socket.emit('join-room', joinData);
        } else {
            console.error('❌ Cannot join room - socket or room data missing');
            console.log('Socket exists:', !!this.socket);
            console.log('Current room exists:', !!this.currentRoom);
        }
    }

    leaveRoom() {
        if (this.socket) {
            this.socket.disconnect();
        }

        this.currentRoom = null;
        this.currentUser = null;
        this.isHost = false;
        this.stopSyncInterval();

        this.audioPlayer.pause();
        this.audioPlayer.src = '';

        this.showLandingPage();
        this.showToast('Left the room', 'info');
    }

    showPlayerPage() {
        this.landingPage.classList.add('hidden');
        this.playerPage.classList.remove('hidden');

        this.roomName.textContent = this.currentRoom.name;
        this.roomId.textContent = `Room ID: ${this.currentRoom.id}`;
        this.currentUsername.textContent = this.currentUser.username;
        this.userRole.textContent = this.isHost ? 'Host' : 'Listener';
        this.userRole.className = this.isHost ? 'user-role' : 'user-role listener';

        if (this.isHost) {
            this.hostControls.classList.remove('hidden');
            this.uploadBtn.classList.remove('hidden');
            this.clearQueueBtn.classList.remove('hidden');
            this.playPauseBtn.disabled = false;
            this.prevBtn.disabled = false;
            this.nextBtn.disabled = false;
        } else {
            this.hostControls.classList.add('hidden');
            this.uploadBtn.classList.add('hidden');
            this.clearQueueBtn.classList.add('hidden');
            this.playPauseBtn.disabled = false; // Allow sync button for listeners
            this.prevBtn.disabled = true;
            this.nextBtn.disabled = true;
        }

        this.startSyncInterval();
    }

    showLandingPage() {
        this.playerPage.classList.add('hidden');
        this.landingPage.classList.remove('hidden');

        // Reset forms
        this.roomNameInput.value = '';
        this.hostUsernameInput.value = '';
        this.roomIdInput.value = '';
        this.usernameInput.value = '';
        this.hideCreateRoomForm();
        this.hideJoinRoomForm();
    }

    // Music library management
    async loadMusicLibrary() {
        try {
            const response = await fetch('/api/music');
            const files = await response.json();
            this.musicLibraryData = files;
            this.updateMusicLibrary();
        } catch (error) {
            console.error('Failed to load music library:', error);
        }
    }

    updateMusicLibrary() {
        this.musicLibraryElement.innerHTML = '';

        this.musicLibraryData.forEach(file => {
            const item = document.createElement('div');
            item.className = 'music-item';
            item.innerHTML = `
                <div class="music-item-info">
                    <div class="music-item-name">${file.originalName}</div>
                    <div class="music-item-size">${this.formatFileSize(file.size)}</div>
                </div>
                <div class="music-item-actions">
                    ${this.isHost ? `<button class="btn btn-sm" onclick="player.addToQueue('${file.filename}', '${file.originalName}')">Add to Queue</button>` : ''}
                </div>
            `;
            this.musicLibraryElement.appendChild(item);
        });
    }

    // File upload
    showUploadModal() {
        this.uploadModal.classList.remove('hidden');
    }

    hideUploadModal() {
        this.uploadModal.classList.add('hidden');
        this.uploadProgress.classList.add('hidden');
        this.fileInput.value = '';
    }

    async handleFileSelect(files) {
        if (files.length === 0) return;

        this.uploadProgress.classList.remove('hidden');
        this.uploadStatus.textContent = 'Uploading files...';

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const formData = new FormData();
            formData.append('music', file);

            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    const result = await response.json();
                    this.showToast(`Uploaded ${result.originalName}`, 'success');

                    // Reload music library
                    await this.loadMusicLibrary();
                } else {
                    this.showToast(`Failed to upload ${file.name}`, 'error');
                }
            } catch (error) {
                console.error('Upload error:', error);
                this.showToast(`Failed to upload ${file.name}`, 'error');
            }
        }

        this.hideUploadModal();
    }

    // Music player controls (hosts only)
    togglePlayPause() {
        if (this.isHost) {
            if (this.isPlaying) {
                this.pauseTrack();
            } else {
                this.playTrack();
            }
        } else {
            // For listeners, just request to sync with host
            if (this.socket && this.currentRoom) {
                this.socket.emit('sync-time', {
                    roomId: this.currentRoom.id,
                    currentTime: this.audioPlayer.currentTime
                });
                this.showToast('Syncing with host...', 'info');
            }
        }
    }

    playTrack() {
        if (!this.currentTrack) return;

        this.isPlaying = true;
        this.playPauseBtn.textContent = '⏸️';
        this.audioPlayer.play();

        if (this.socket && this.currentRoom) {
            this.socket.emit('play-track', {
                roomId: this.currentRoom.id,
                track: this.currentTrack,
                startTime: this.audioPlayer.currentTime
            });
        }
    }

    pauseTrack() {
        this.isPlaying = false;
        this.playPauseBtn.textContent = '▶️';
        this.audioPlayer.pause();

        if (this.socket && this.currentRoom) {
            this.socket.emit('pause-track', {
                roomId: this.currentRoom.id,
                currentTime: this.audioPlayer.currentTime
            });
        }
    }

    seekTo(event) {
        if (!this.isHost) return;

        const progressBar = document.querySelector('.progress-bar');
        const rect = progressBar.getBoundingClientRect();
        const percent = (event.clientX - rect.left) / rect.width;
        const seekTime = percent * this.audioPlayer.duration;

        this.audioPlayer.currentTime = seekTime;

        if (this.socket && this.currentRoom) {
            this.socket.emit('seek-track', {
                roomId: this.currentRoom.id,
                currentTime: seekTime
            });
        }
    }

    changeVolume(value) {
        this.volume = parseFloat(value);
        this.audioPlayer.volume = this.volume;
        this.volumeValue.textContent = `${Math.round(this.volume * 100)}%`;

        if (this.socket && this.currentRoom) {
            this.socket.emit('change-volume', {
                roomId: this.currentRoom.id,
                volume: this.volume
            });
        }
    }

    // Queue management
    addToQueue(filename, originalName) {
        if (!this.isHost) return;

        const track = {
            filename: filename,
            originalName: originalName,
            url: `/music/${filename}`
        };

        if (this.socket && this.currentRoom) {
            this.socket.emit('add-to-queue', {
                roomId: this.currentRoom.id,
                track: track
            });
        }
    }

    removeFromQueue(index) {
        if (!this.isHost) return;

        if (this.socket && this.currentRoom) {
            this.socket.emit('remove-from-queue', {
                roomId: this.currentRoom.id,
                trackIndex: index
            });
        }
    }

    updateQueue(queue) {
        this.queueElement.innerHTML = '';

        if (!queue || queue.length === 0) {
            this.queueElement.innerHTML = '<div class="empty-queue" style="padding: 1rem; text-align: center; color: var(--text-secondary);">No tracks in queue</div>';
            return;
        }

        queue.forEach((track, index) => {
            const item = document.createElement('div');
            item.className = 'queue-item';
            if (this.currentTrack && this.currentTrack.filename === track.filename) {
                item.classList.add('current');
            }
            item.innerHTML = `
                <div class="queue-item-name">${track.originalName}</div>
                ${this.isHost ? `<button class="queue-item-remove" onclick="player.removeFromQueue(${index})">Remove</button>` : ''}
            `;
            this.queueElement.appendChild(item);
        });
    }

    // Socket event handlers
    updateRoomState(data) {
        this.currentTrack = data.currentTrack;
        this.isPlaying = data.isPlaying;
        this.currentTime = data.currentTime;
        this.volume = data.volume;

        if (this.currentTrack) {
            this.audioPlayer.src = this.currentTrack.url;
            this.audioPlayer.currentTime = this.currentTime;
            this.audioPlayer.volume = this.volume;

            this.trackTitle.textContent = this.currentTrack.originalName;
            this.trackName.textContent = this.currentTrack.originalName;
            this.trackArtist.textContent = 'Local File';

            if (this.isPlaying) {
                this.audioPlayer.play();
                this.playPauseBtn.textContent = '⏸️';
            } else {
                this.audioPlayer.pause();
                this.playPauseBtn.textContent = '▶️';
            }
        }

        this.volumeSlider.value = this.volume;
        this.volumeValue.textContent = `${Math.round(this.volume * 100)}%`;

        this.updateQueue(data.musicQueue || []);
    }

    handleTrackPlaying(data) {
        console.log('🎵 Handling track playing event:', data);
        this.currentTrack = data.track;
        this.isPlaying = data.isPlaying;
        this.currentTime = data.currentTime;

        if (this.currentTrack) {
            console.log('🎵 Loading track:', this.currentTrack.originalName);
            this.audioPlayer.src = this.currentTrack.url;
            this.audioPlayer.currentTime = this.currentTime;

            // Update UI
            this.trackTitle.textContent = this.currentTrack.originalName;
            this.trackName.textContent = this.currentTrack.originalName;
            this.trackArtist.textContent = 'Local File';

            if (!this.isHost) {
                this.playPauseBtn.textContent = '⏸️';
                this.playPauseBtn.disabled = false;
            }

            // Try to play, but handle autoplay restrictions
            if (this.isPlaying) {
                const playPromise = this.audioPlayer.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('✅ Audio started playing successfully');
                    }).catch(error => {
                        console.warn('⚠️ Auto-play prevented, user interaction required:', error);
                        this.showToast('Click play to start music', 'info');
                        // Update UI to show paused state even though server says playing
                        this.playPauseBtn.textContent = '▶️';
                        this.isPlaying = false;
                    });
                }
            }
        } else {
            console.warn('⚠️ No track data received');
        }
    }

    handleTrackPaused(data) {
        this.isPlaying = data.isPlaying;
        this.currentTime = data.currentTime;

        this.audioPlayer.pause();
        this.audioPlayer.currentTime = this.currentTime;

        if (!this.isHost) {
            this.playPauseBtn.textContent = '▶️';
        }
    }

    handleTrackSeeked(data) {
        this.currentTime = data.currentTime;
        this.audioPlayer.currentTime = this.currentTime;
    }

    handleVolumeChanged(data) {
        this.volume = data.volume;
        this.audioPlayer.volume = this.volume;
        this.volumeSlider.value = this.volume;
        this.volumeValue.textContent = `${Math.round(this.volume * 100)}%`;
    }

    // User management
    updateUsersList(users) {
        console.log('👥 Updating users list with:', users);
        if (!this.usersList) {
            console.error('❌ usersList element not found');
            return;
        }
        if (!this.userCount) {
            console.error('❌ userCount element not found');
            return;
        }

        this.usersList.innerHTML = '';
        this.userCount.textContent = users.length;

        if (!users || users.length === 0) {
            this.usersList.innerHTML = '<div class="no-users">No users in room</div>';
            console.log('📭 No users to display');
            return;
        }

        users.forEach((user, index) => {
            console.log(`Adding user ${index + 1}:`, user);
            const item = document.createElement('div');
            item.className = 'user-item';
            item.innerHTML = `
                <div class="user-details">
                    <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
                    <div class="user-name">${user.username}</div>
                </div>
                <div class="user-badges">
                    ${user.isHost ? '<span class="user-badge host">HOST</span>' : ''}
                </div>
            `;
            this.usersList.appendChild(item);
        });

        console.log(`✅ Updated users list with ${users.length} users`);
    }

        // Update co-host modal if open
        if (!this.cohostModal.classList.contains('hidden')) {
            this.updateCohostList(users);
        }
    }

    showCohostModal() {
        if (!this.isHost) return;
        this.cohostModal.classList.remove('hidden');
    }

    hideCohostModal() {
        this.cohostModal.classList.add('hidden');
    }

    updateCohostList(users) {
        this.cohostList.innerHTML = '';

        users.forEach(user => {
            if (user.id !== this.currentUser.id && !user.isHost) {
                const item = document.createElement('div');
                item.className = 'cohost-item';
                item.innerHTML = `
                    <div class="cohort-info">
                        <div class="user-name">${user.username}</div>
                    </div>
                    <div class="cohort-actions">
                        <button class="btn btn-sm" onclick="player.addCoHost('${user.id}')">Make Co-Host</button>
                    </div>
                `;
                this.cohostList.appendChild(item);
            }
        });
    }

    addCoHost(userId) {
        if (!this.isHost) return;

        if (this.socket && this.currentRoom) {
            this.socket.emit('add-cohost', {
                roomId: this.currentRoom.id,
                userId: userId
            });
            this.showToast('Co-host added', 'success');
        }
    }

    syncAllUsers() {
        if (!this.isHost) return;

        if (this.socket && this.currentRoom) {
            this.socket.emit('sync-time', {
                roomId: this.currentRoom.id,
                currentTime: this.audioPlayer.currentTime
            });
            this.showToast('Synced all users', 'success');
        }
    }

    clearQueue() {
        if (!this.isHost) return;

        if (this.socket && this.currentRoom) {
            // Clear queue by removing all tracks except current
            const currentQueue = [];
            if (this.currentTrack) {
                currentQueue.push(this.currentTrack);
            }

            this.socket.emit('queue-updated', currentQueue);
            this.showToast('Queue cleared', 'success');
        }
    }

    // Audio player UI updates
    updateProgress() {
        const percent = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
        this.progressBar.style.width = `${percent}%`;
        this.progressHandle.style.left = `${percent}%`;
        this.currentTimeDisplay.textContent = this.formatTime(this.audioPlayer.currentTime);
    }

    updateDuration() {
        this.totalTimeDisplay.textContent = this.formatTime(this.audioPlayer.duration);
    }

    onTrackEnded() {
        if (this.isHost) {
            this.playNext();
        }
    }

    playNext() {
        if (!this.isHost || !this.socket || !this.currentRoom) return;

        // Get current queue from server state
        const queueItems = this.queueElement.querySelectorAll('.queue-item');
        let currentIndex = -1;

        queueItems.forEach((item, index) => {
            if (item.classList.contains('current')) {
                currentIndex = index;
            }
        });

        if (currentIndex >= 0 && currentIndex < queueItems.length - 1) {
            // Play next track in queue
            const nextTrackElement = queueItems[currentIndex + 1];
            const trackName = nextTrackElement.querySelector('.queue-item-name').textContent;

            // Find the track in music library
            const nextTrack = this.musicLibraryData.find(track => track.originalName === trackName);
            if (nextTrack) {
                this.socket.emit('play-track', {
                    roomId: this.currentRoom.id,
                    track: {
                        filename: nextTrack.filename,
                        originalName: nextTrack.originalName,
                        url: nextTrack.url
                    },
                    startTime: 0
                });
            }
        } else {
            this.showToast('No more tracks in queue', 'info');
        }
    }

    playPrevious() {
        if (!this.isHost || !this.socket || !this.currentRoom) return;

        // Restart current track if more than 3 seconds have passed
        if (this.audioPlayer.currentTime > 3) {
            this.audioPlayer.currentTime = 0;
            if (this.socket && this.currentRoom) {
                this.socket.emit('seek-track', {
                    roomId: this.currentRoom.id,
                    currentTime: 0
                });
            }
        } else {
            // Try to go to previous track
            const queueItems = this.queueElement.querySelectorAll('.queue-item');
            let currentIndex = -1;

            queueItems.forEach((item, index) => {
                if (item.classList.contains('current')) {
                    currentIndex = index;
                }
            });

            if (currentIndex > 0) {
                const prevTrackElement = queueItems[currentIndex - 1];
                const trackName = prevTrackElement.querySelector('.queue-item-name').textContent;

                // Find the track in music library
                const prevTrack = this.musicLibraryData.find(track => track.originalName === trackName);
                if (prevTrack) {
                    this.socket.emit('play-track', {
                        roomId: this.currentRoom.id,
                        track: {
                            filename: prevTrack.filename,
                            originalName: prevTrack.originalName,
                            url: prevTrack.url
                        },
                        startTime: 0
                    });
                }
            } else {
                this.showToast('No previous track', 'info');
            }
        }
    }

    // Sync interval
    startSyncInterval() {
        this.stopSyncInterval();
        this.syncInterval = setInterval(() => {
            if (this.isPlaying && this.socket && this.currentRoom) {
                this.socket.emit('sync-time', {
                    roomId: this.currentRoom.id,
                    currentTime: this.audioPlayer.currentTime
                });
            }
        }, 5000); // Sync every 5 seconds
    }

    stopSyncInterval() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    // Utility functions
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';

        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span class="toast-message">${message}</span>
        `;

        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }
}

// Simple initialization
function initApp() {
    console.log('🚀 Initializing RemoteMusicPlayer...');
    try {
        window.player = new RemoteMusicPlayer();
        console.log('✅ RemoteMusicPlayer initialized successfully');

        // Test buttons immediately
        setTimeout(() => {
            console.log('🧪 Testing button functionality...');
            if (window.player.createRoomBtn) {
                console.log('✅ Create Room button found:', window.player.createRoomBtn);
                // Add visual indicator
                window.player.createRoomBtn.style.border = '2px solid green';
            } else {
                console.error('❌ Create Room button NOT found');
            }

            if (window.player.joinRoomBtn) {
                console.log('✅ Join Room button found:', window.player.joinRoomBtn);
                // Add visual indicator
                window.player.joinRoomBtn.style.border = '2px solid green';
            } else {
                console.error('❌ Join Room button NOT found');
            }
        }, 1000);

    } catch (error) {
        console.error('❌ Failed to initialize RemoteMusicPlayer:', error);
    }
}

// Multiple initialization attempts
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Fallback initialization
window.addEventListener('load', () => {
    if (!window.player) {
        console.log('🔄 Fallback initialization...');
        initApp();
    }
});