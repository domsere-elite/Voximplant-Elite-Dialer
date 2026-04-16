import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_DIALER_API_URL || 'http://localhost:5000';

export function createSocket(token: string): Socket {
  return io(API_URL, {
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });
}
