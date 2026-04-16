import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    socket = io(API_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: { token: token || '' },
    });
  }
  return socket;
}

export function connectSocket(userId: string, role: string): Socket {
  // Recreate socket with current token if it exists without auth
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  socket = io(API_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    auth: { token: token || '' },
  });

  socket.connect();

  // Room joins are now handled server-side based on the authenticated user
  return socket;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}
