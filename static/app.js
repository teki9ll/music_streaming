const socket = io();
let currentRoom = null;
let username = null;
const player = document.getElementById('player');

document.getElementById('joinBtn').addEventListener('click', joinRoom);
document.getElementById('playBtn').addEventListener('click', () => control('play'));
document.getElementById('pauseBtn').addEventListener('click', () => control('pause'));
document.getElementById('seekBack').addEventListener('click', () => seekBy(-10));
document.getElementById('seekFwd').addEventListener('click', () => seekBy(10));
document.getElementById('stopBtn').addEventListener('click', () => control('stop'));

async function joinRoom() {
  username = document.getElementById('username').value || 'anon';
  currentRoom = document.getElementById('room').value || 'lobby';
  socket.emit('join_room', { username, room: currentRoom });
  document.getElementById('roomName').innerText = currentRoom;
  document.getElementById('joinBox').classList.add('hidden');
  document.getElementById('roomBox').classList.remove('hidden');
  loadSongs();
}

async function loadSongs() {
  const res = await fetch('/songs');
  const songs = await res.json();
  const list = document.getElementById('songList');
  if (songs.length === 0) {
    list.innerHTML = '<li>No mp3 files found in /music — add files and refresh.</li>';
    return;
  }
  list.innerHTML = songs.map(s => `<li><span>${s}</span><div><button onclick="loadSong('${s}')">Load</button><button onclick="playSong('${s}')">Play</button></div></li>`).join('');
}

function loadSong(song) {
  // load (does not autoplay) - notify others to load the same song
  player.src = `/music/${encodeURIComponent(song)}`;
  player.currentTime = 0;
  control('load', { song, time: 0 });
}

function playSong(song) {
  player.src = `/music/${encodeURIComponent(song)}`;
  player.currentTime = 0;
  player.play();
  control('play', { song, time: 0 });
}

function control(action, extras={}) {
  if (!currentRoom) return;
  const payload = { room: currentRoom, action, time: player.currentTime, ...extras };
  socket.emit('control', payload);
}

function seekBy(delta) {
  player.currentTime = Math.max(0, player.currentTime + delta);
  control('seek', { time: player.currentTime });
}

// react to server updates
socket.on('room_state', (data) => {
  // initial room state sent to joining user
  if (data.song) {
    player.src = `/music/${encodeURIComponent(data.song)}`;
  }
  applyState(data);
});

socket.on('update', (data) => {
  applyState(data);
});

function applyState(data) {
  if (!data) return;
  // stop -> unload
  if (data.state === 'stopped') {
    player.pause();
    player.currentTime = 0;
  } else if (data.state === 'playing') {
    // ensure song loaded
    if (data.song && player.src.indexOf(encodeURIComponent(data.song)) === -1) {
      player.src = `/music/${encodeURIComponent(data.song)}`;
    }
    // sync time (allow small tolerance)
    const target = Number(data.time || 0);
    if (Math.abs(player.currentTime - target) > 0.7) {
      player.currentTime = target;
    }
    player.play().catch(()=>{});
  } else if (data.state === 'paused') {
    player.pause();
    const target = Number(data.time || 0);
    if (Math.abs(player.currentTime - target) > 0.7) player.currentTime = target;
  }
}

// when local user interacts with native player (seek/play/pause), notify server
let lastLocalEmit = 0;
player.addEventListener('play', () => {
  const now = Date.now();
  if (now - lastLocalEmit < 300) return;
  control('play', { song: decodeURIComponent(getCurrentSong()) });
  lastLocalEmit = now;
});
player.addEventListener('pause', () => {
  const now = Date.now();
  if (now - lastLocalEmit < 300) return;
  control('pause', {});
  lastLocalEmit = now;
});
player.addEventListener('seeking', () => {
  control('seek', { time: player.currentTime });
});

function getCurrentSong() {
  try {
    const parts = player.src.split('/');
    return decodeURIComponent(parts[parts.length-1]);
  } catch(e){ return ''; }
}
