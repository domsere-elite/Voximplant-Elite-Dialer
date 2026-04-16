import type { Server as IOServer } from 'socket.io';

let ioInstance: IOServer | null = null;

export function setIO(server: IOServer): void {
  ioInstance = server;
}

export function getIO(): IOServer {
  if (!ioInstance) {
    throw new Error('Socket.IO server not initialized');
  }
  return ioInstance;
}
