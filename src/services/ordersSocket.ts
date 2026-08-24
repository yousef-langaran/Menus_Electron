import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from './api';
import { autoPrintNewOrder } from './autoPrintOrder';

const SOCKET_NAMESPACE = '/orders';

let socket: Socket | null = null;
let activeConfigKey: string | null = null;

const resolveSocketBaseUrl = () => {
  try {
    const url = new URL(API_BASE_URL);
    return `${url.protocol}//${url.host}`;
  } catch {
    return API_BASE_URL.replace(/\/api(?:\/v\d+)?$/, '');
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

  if (socket && activeConfigKey === nextConfigKey) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(socketUrl, {
    transports: ['websocket'],
    auth: {
      token: options.token,
      restaurantName: options.restaurantName,
      clientType: 'electron',
    },
    withCredentials: true,
  });

  socket.on('connect', () => {});

  socket.on('connect_error', (error) => {
    console.error('[OrdersSocket] ❌ Connection error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[OrdersSocket] Disconnected:', reason);
  });

  // به‌محض تأیید هر سفارش آنلاین جدید، مستقل از این‌که کدام صفحه سوکت را نگه
  // داشته، دقیقاً یک بار چاپ خودکار تلاش می‌شود (اگر در تنظیمات فعال باشد).
  // اینجا و نه در کامپوننت‌های صفحه‌ها بسته می‌شود تا با سوئیچ بین صفحات
  // چند بار چاپ نشود یا از قلم نیفتد.
  socket.on('orders:new', (order) => void autoPrintNewOrder(order));

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

