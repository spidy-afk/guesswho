import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  update,
  remove,
  onDisconnect,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// === Firebase config ===
const firebaseConfig = {
  apiKey: "AIzaSyBA9FdmxpuaZnpMqG_f1el93ki2W4SJGT0",
  authDomain: "guesswho-67aa1.firebaseapp.com",
  databaseURL:
    "https://guesswho-67aa1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "guesswho-67aa1",
  storageBucket: "guesswho-67aa1.firebasestorage.app",
  messagingSenderId: "697156862877",
  appId: "1:697156862877:web:32571abe5e1cd4e1aba574",
};

// === Init Firebase ===
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// === Elements ===
const nameInput = document.getElementById("playerNameInput");
const joinBtn = document.getElementById("enterLobbyBtn");
const createBtn = document.getElementById("createRoomBtn");
const roomsList = document.getElementById("roomsList");
const onlineList = document.getElementById("onlinePlayers");

let playerName = "";
let playerId = Math.random().toString(36).substring(2, 8);
let currentRoomId = null;

// === Join lobby ===
joinBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name) return alert("Please enter your name");

  playerName = name;
  joinBtn.disabled = true;
  nameInput.disabled = true;
  createBtn.disabled = false;

  await registerPlayer();
  listenPlayers();
  listenRooms();
});

// === Register player ===
async function registerPlayer() {
  const playerRef = ref(db, `onlinePlayers/${playerId}`);
  await set(playerRef, { name: playerName, joinedAt: Date.now() });
  onDisconnect(playerRef).remove();

  window.addEventListener("beforeunload", async () => {
    await leaveRoom(currentRoomId);
    await remove(playerRef);
  });
}

// === Create room ===
createBtn.addEventListener("click", async () => {
  if (!playerName) return;
  if (currentRoomId) return alert("You are already in a room.");

  // Remove old room if exists
  await removePlayerFromAnyRoom();

  const roomsRef = ref(db, "rooms");
  const snap = await get(roomsRef);
  const rooms = snap.exists() ? snap.val() : {};

  // Generate next numeric ID
  let nextId = 100;
  const ids = Object.keys(rooms)
    .map((n) => parseInt(n))
    .filter((x) => !isNaN(x));
  if (ids.length > 0) nextId = Math.max(...ids) + 1;

  const roomId = nextId.toString();
  await set(ref(db, `rooms/${roomId}`), {
    id: roomId,
    host: { id: playerId, name: playerName },
    players: { [playerId]: { name: playerName, ready: false } },
    createdAt: Date.now(),
    status: "waiting",
  });

  currentRoomId = roomId;
  createBtn.disabled = true;
});

// === Remove player from any old room ===
async function removePlayerFromAnyRoom() {
  const roomsSnap = await get(ref(db, "rooms"));
  if (!roomsSnap.exists()) return;

  const rooms = roomsSnap.val();
  for (const id in rooms) {
    if (rooms[id].players && rooms[id].players[playerId]) {
      await remove(ref(db, `rooms/${id}/players/${playerId}`));
      const newSnap = await get(ref(db, `rooms/${id}/players`));
      if (!newSnap.exists()) await remove(ref(db, `rooms/${id}`));
    }
  }
  currentRoomId = null;
}

// === Listen to rooms ===
function listenRooms() {
  const roomsRef = ref(db, "rooms");
  onValue(roomsRef, (snap) => {
    roomsList.innerHTML = "";
    if (!snap.exists()) return;

    const rooms = snap.val();
    Object.keys(rooms)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach((id) => {
        const room = rooms[id];
        // show only waiting/starting rooms
        if (room.status === "waiting" || room.status === "starting") {
          renderRoom(room);
        }
      });

    // Auto-remove empty rooms
    Object.keys(rooms).forEach(async (id) => {
      const room = rooms[id];
      if (!room.players || Object.keys(room.players).length === 0) {
        setTimeout(async () => {
          const snap = await get(ref(db, `rooms/${id}/players`));
          if (!snap.exists()) await remove(ref(db, `rooms/${id}`));
        }, 5000);
      }
    });
  });
}

// === Render Room ===
function renderRoom(room) {
  const div = document.createElement("div");
  div.className = "room";

  const header = document.createElement("div");
  header.className = "room-header";
  header.innerHTML = `<span>Room ${room.id}</span>`;

  const body = document.createElement("div");
  body.className = "room-body";

  const playerSection = document.createElement("div");
  playerSection.className = "player";
  const players = room.players ? Object.values(room.players) : [];
  const playerCount = players.length;

  playerSection.innerHTML = players
    .map(
      (p) => `
      <div class="details">
        <div class="name">${p.name}</div>
        <div class="rating">${p.ready ? "✅ Ready" : "⏳ Waiting"}</div>
      </div>`
    )
    .join("");

  const actionSection = document.createElement("div");
  actionSection.className = "room-info";

  const isInRoom = room.players && room.players[playerId];

  // === JOIN BUTTON ===
  if (!isInRoom && !currentRoomId) {
    const joinButton = document.createElement("button");
    joinButton.className = "join-btn";

    // Prevent join if full
    if (playerCount >= 2) {
      joinButton.textContent = "Room Full";
      joinButton.disabled = true;
    } else {
      joinButton.textContent = "Join";
      joinButton.onclick = async () => {
        await removePlayerFromAnyRoom();
        await update(ref(db, `rooms/${room.id}/players`), {
          [playerId]: { name: playerName, ready: false },
        });
        currentRoomId = room.id;
        createBtn.disabled = true;
      };
    }
    actionSection.appendChild(joinButton);
  }

  // === INSIDE ROOM ===
  if (isInRoom) {
    const readyButton = document.createElement("button");
    readyButton.className = "join-btn";
    readyButton.textContent = room.players[playerId].ready
      ? "Unready"
      : "Ready";

    readyButton.onclick = async () => {
      const newReady = !room.players[playerId].ready;
      await update(ref(db, `rooms/${room.id}/players/${playerId}`), {
        ready: newReady,
      });

      // If both ready → start countdown
      const snap = await get(ref(db, `rooms/${room.id}/players`));
      const playersData = snap.exists() ? snap.val() : {};
      const allReady =
        Object.keys(playersData).length === 2 &&
        Object.values(playersData).every((p) => p.ready);

      if (allReady) {
        await update(ref(db, `rooms/${room.id}`), { status: "starting" });
        startCountdown(room.id);
      }
    };

    const leaveButton = document.createElement("button");
    leaveButton.className = "join-btn";
    leaveButton.style.background = "#dc3545";
    leaveButton.textContent = "Leave";
    leaveButton.onclick = async () => {
      await leaveRoom(room.id);
    };

    actionSection.appendChild(readyButton);
    actionSection.appendChild(leaveButton);
  }

  // === STARTING ===
  if (room.status === "starting") {
    const countdown = document.createElement("div");
    countdown.style.color = "green";
    countdown.style.fontWeight = "bold";
    countdown.textContent = "Game starting...";
    actionSection.appendChild(countdown);

    redirectToGame(room.id, room.players);
  }

  body.appendChild(playerSection);
  body.appendChild(actionSection);
  div.appendChild(header);
  div.appendChild(body);
  roomsList.appendChild(div);
}

// === Countdown ===
async function startCountdown(roomId) {
  let seconds = 5;
  const countdownRef = ref(db, `rooms/${roomId}/countdown`);
  const interval = setInterval(async () => {
    await set(countdownRef, seconds);
    if (seconds === 0) {
      clearInterval(interval);
      await update(ref(db, `rooms/${roomId}`), { status: "inGame" });
    }
    seconds--;
  }, 1000);
}

// === Redirect only the two players ===
function redirectToGame(roomId, players) {
  const statusRef = ref(db, `rooms/${roomId}/status`);
  onValue(statusRef, (snap) => {
    if (snap.exists() && snap.val() === "inGame") {
      if (players[playerId]) {
        window.location.href = `game.html?room=${roomId}&player=${playerId}`;
      }
    }
  });
}

// === Leave Room ===
async function leaveRoom(roomId) {
  if (!roomId) return;
  await remove(ref(db, `rooms/${roomId}/players/${playerId}`));
  currentRoomId = null;
  createBtn.disabled = false;

  const snap = await get(ref(db, `rooms/${roomId}/players`));
  if (!snap.exists()) await remove(ref(db, `rooms/${roomId}`));
}

// === Online Players ===
function listenPlayers() {
  const playersRef = ref(db, "onlinePlayers");
  onValue(playersRef, (snap) => {
    onlineList.innerHTML = "";
    if (!snap.exists()) return;
    Object.values(snap.val()).forEach((p) => {
      const div = document.createElement("div");
      div.className = "user online";
      div.innerHTML = `
        <div class="status green"></div>
        <span>${p.name}</span>
      `;
      onlineList.appendChild(div);
    });
  });
}
