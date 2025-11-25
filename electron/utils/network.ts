import { net } from 'electron';

export async function isOnline(): Promise<boolean> {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'HEAD',
      url: 'https://www.google.com',
    });

    request.on('response', () => {
      resolve(true);
    });

    request.on('error', () => {
      resolve(false);
    });

    request.end();
  });
}

