import { io } from "socket.io-client";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:4000").replace(/\/+$/, "");

function getToken() {
  return localStorage.getItem("auth_token") || null;
}

export const socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ["websocket"],
  withCredentials: false,
  auth: () => {
    const token = getToken();
    return token ? { token } : {};
  }
});

export const API_BASE_URL = `${BACKEND_URL}/api`;

export function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function reconnectSocket() {
  socket.disconnect();
  socket.connect();
}
