import * as http from 'http';
import { BrowserWindow } from 'electron';
import { loadCallerIdSettings } from '../database/preferences';

let server: http.Server | null = null;
let currentPort: number | null = null;

function extractPhone(body: any, phoneField: string): string | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body[phoneField];
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const phone = String(raw).trim().replace(/\s+/g, '');
  return phone.length >= 7 ? phone : null;
}

function sendToRenderer(win: BrowserWindow | null, phone: string) {
  const payload = { phone, timestamp: new Date().toISOString() };
  if (win && !win.isDestroyed()) {
    win.webContents.send('caller-id:incoming-call', payload);
  }
}

export async function startCallerIdWebhook(getMainWindow: () => BrowserWindow | null): Promise<void> {
  const settings = await loadCallerIdSettings();
  if (!settings.enabled) {
    await stopCallerIdWebhook();
    return;
  }

  const port = settings.webhookPort;
  if (server && currentPort === port) return;

  await stopCallerIdWebhook();

  server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end('Method Not Allowed');
      return;
    }

    if (settings.webhookSecret) {
      const auth = req.headers['x-secret'] || req.headers['authorization'];
      const token = typeof auth === 'string' ? auth.replace(/^Bearer\s+/i, '') : '';
      if (token !== settings.webhookSecret) {
        res.writeHead(401).end('Unauthorized');
        return;
      }
    }

    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        const body = JSON.parse(raw);
        const phone = extractPhone(body, settings.phoneField);
        if (phone) {
          sendToRenderer(getMainWindow(), phone);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
           .end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400).end('Bad Request');
      }
    });
  });

  server.listen(port, '127.0.0.1', () => {
    currentPort = port;
    console.log(`[CallerID] Webhook listening on 127.0.0.1:${port}`);
  });

  server.on('error', (err) => {
    console.error('[CallerID] Webhook server error:', err);
    server = null;
    currentPort = null;
  });
}

export async function stopCallerIdWebhook(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => {
    server!.close(() => resolve());
  });
  server = null;
  currentPort = null;
}

export function getWebhookStatus(): { running: boolean; port: number | null } {
  return { running: !!server, port: currentPort };
}
