import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// ✅ Firebase config
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

// === Firebase init ===
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// === UI elements ===
const nameInput = document.getElementById("playerNameInput");
const joinBtn = document.getElementById("enterLobbyBtn");
const createBtn = document.getElementById("createRoomBtn");
const roomsList = document.getElementById("roomsList");
const onlineList = document.getElementById("onlinePlayers");

let playerName = "";
let playerId = Math.random().toString(36).substring(2, 8);
let currentRoomId = null;

// === Join Lobby ===
joinBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name) return;
  playerName = name;

  joinBtn.disabled = true;
  nameInput.disabled = true;
  createBtn.disabled = false;

  await registerPlayer();
  listenRooms();
  listenPlayers();
});

// === Register player ===
async function registerPlayer() {
  const playerRef = ref(db, `onlinePlayers/${playerId}`);
  await set(playerRef, { name: playerName, joinedAt: Date.now() });
  window.addEventListener("beforeunload", () => remove(playerRef));
}

// === Create room ===
createBtn.addEventListener("click", async () => {
  if (!playerName) return;
  if (currentRoomId) return;

  const roomsRef = ref(db, "rooms");
  const snap = await get(roomsRef);
  const rooms = snap.exists() ? snap.val() : {};

  let nextId = 100;
  const ids = Object.keys(rooms)
    .map((n) => parseInt(n))
    .filter((x) => !isNaN(x));
  if (ids.length > 0) nextId = Math.max(...ids) + 1;

  const roomId = nextId.toString();
  await set(ref(db, `rooms/${roomId}`), {
    id: roomId,
    host: { id: playerId, name: playerName },
    players: {
      [playerId]: { name: playerName, ready: false },
    },
    createdAt: Date.now(),
    status: "waiting",
  });

  currentRoomId = roomId;
});

// === Listen for rooms ===
function listenRooms() {
  const roomsRef = ref(db, "rooms");
  onValue(roomsRef, (snap) => {
    roomsList.innerHTML = "";
    if (!snap.exists()) return;
    const rooms = snap.val();
    Object.keys(rooms)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach((id) => renderRoom(rooms[id]));
  });
}

// === Render each room ===
function renderRoom(room) {
  const div = document.createElement("div");
  div.className = "room";

  const roomHeader = document.createElement("div");
  roomHeader.className = "room-header";
  roomHeader.innerHTML = `<span>Room ${room.id}</span>`;

  const body = document.createElement("div");
  body.className = "room-body";

  const left = document.createElement("div");
  left.className = "player";

  // show all players
  const playerNames = room.players ? Object.values(room.players) : [];
  left.innerHTML = playerNames
    .map(
      (p) => `
      <div class="details">
        <div class="name">${p.name}</div>
        <div class="rating">${p.ready ? "✅ Ready" : "⏳ Waiting"}</div>
      </div>`
    )
    .join("");

  const joinSection = document.createElement("div");
  joinSection.className = "room-info";

  const isInRoom = room.players && room.players[playerId];
  if (!isInRoom && !currentRoomId) {
    const joinBtn = document.createElement("button");
    joinBtn.className = "join-btn";
    joinBtn.textContent = "Join";
    joinBtn.onclick = async () => {
      await update(ref(db, `rooms/${room.id}/players`), {
        [playerId]: { name: playerName, ready: false },
      });
      currentRoomId = room.id;
    };
    joinSection.appendChild(joinBtn);
  }

  if (isInRoom) {
    const readyBtn = document.createElement("button");
    readyBtn.className = "join-btn";
    readyBtn.textContent = room.players[playerId].ready
      ? "Unready"
      : "Ready";
    readyBtn.onclick = async () => {
      const newReady = !room.players[playerId].ready;
      await update(ref(db, `rooms/${room.id}/players/${playerId}`), {
        ready: newReady,
      });
    };

    const leaveBtn = document.createElement("button");
    leaveBtn.className = "join-btn";
    leaveBtn.style.background = "#dc3545";
    leaveBtn.textContent = "Leave";
    leaveBtn.onclick = async () => {
      await remove(ref(db, `rooms/${room.id}/players/${playerId}`));
      currentRoomId = null;

      const newSnap = await get(ref(db, `rooms/${room.id}/players`));
      if (!newSnap.exists()) await remove(ref(db, `rooms/${room.id}`));
    };

    joinSection.appendChild(readyBtn);
    joinSection.appendChild(leaveBtn);
  }

  body.appendChild(left);
  body.appendChild(joinSection);
  div.appendChild(roomHeader);
  div.appendChild(body);
  roomsList.appendChild(div);
}

// === Listen for online players ===
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
