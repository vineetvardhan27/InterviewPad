import { io } from "socket.io-client";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:4000")
  .replace(/\/+$/, "");

const KEY = "__interviewpad_socket__";

let socket = globalThis[KEY];

if (!socket) {
  socket = io(BACKEND_URL, {
    autoConnect: true,
    transports: ["websocket", "polling"],
    withCredentials: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: (cb) => {
      cb({ token: localStorage.getItem("auth_token") });
    }
  });
  globalThis[KEY] = socket;
}

// Surface connection errors for debugging
socket.on("connect_error", (err) => {
  console.warn("[socket] connect_error:", err.message);
});

export const API_BASE_URL = `${BACKEND_URL}/api`;

export function getAuthHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function reconnectSocket() {
  socket.disconnect();
  socket.connect();
}

export { socket };
