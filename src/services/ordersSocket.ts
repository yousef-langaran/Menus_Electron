import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from './api';

const SOCKET_NAMESPACE = '/orders';

let socket: Socket | null = null;
let activeConfigKey: string | null = null;

const resolveSocketBaseUrl = () => {
  try {
    const url = new URL(API_BASE_URL);
    const result = `${url.protocol}//${url.host}`;
    console.log('[OrdersSocket] Resolved base URL:', { API_BASE_URL, result });
    return result;
  } catch (error) {
    const result = API_BASE_URL.replace(/\/api(?:\/v\d+)?$/, '');
    console.log('[OrdersSocket] Resolved base URL (fallback):', { API_BASE_URL, result, error });
    return result;
  }
};

export interface OrdersSocketOptions {
  token: string;
  restaurantName: string;
}

export const connectOrdersSocket = (options: OrdersSocketOptions): Socket | null => {
  if (!options.token || !options.restaurantName) {
    console.warn('[OrdersSocket] Missing token or restaurantName', {
      hasToken: !!options.token,
      hasRestaurantName: !!options.restaurantName,
    });
    return null;
  }

  const baseUrl = resolveSocketBaseUrl().replace(/\/+$/, '');
  const socketUrl = `${baseUrl}${SOCKET_NAMESPACE}`;
  const nextConfigKey = `${baseUrl}|${options.token}|${options.restaurantName}`.toLowerCase();

  console.log('[OrdersSocket] Connecting...', {
    socketUrl,
    baseUrl,
    restaurantName: options.restaurantName,
    hasToken: !!options.token,
  });

  if (socket && activeConfigKey === nextConfigKey) {
    console.log('[OrdersSocket] Reusing existing socket');
    return socket;
  }

  if (socket) {
    console.log('[OrdersSocket] Disconnecting old socket');
    socket.disconnect();
    socket = null;
  }

  socket = io(socketUrl, {
    transports: ['websocket'],
    auth: {
      token: options.token,
      restaurantName: options.restaurantName,
    },
    withCredentials: true,
  });

  socket.on('connect', () => {
    console.log('[OrdersSocket] ✅ Connected successfully', socket?.id);
  });

  socket.on('connect_error', (error) => {
    console.error('[OrdersSocket] ❌ Connection error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[OrdersSocket] Disconnected:', reason);
  });

  activeConfigKey = nextConfigKey;

  return socket;
};

export const disconnectOrdersSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    activeConfigKey = null;
  }
};

export const getOrdersSocket = () => socket;

