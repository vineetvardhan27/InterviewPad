import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

export const socket = io(BACKEND_URL, {
  autoConnect: true
});

export const API_BASE_URL = `${BACKEND_URL}/api`;
