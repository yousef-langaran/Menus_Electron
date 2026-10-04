import axios from 'axios';
import { ipcMain } from 'electron';
import {
  loadCardTerminalSettings,
  saveCardTerminalSettings,
  loadCardTerminalConfig,
  saveCardTerminalConfig,
  type CardTerminalSettings,
} from '../database/preferences';
import { sendAmountViaSamanSerial } from '../services/samanPos';
import { sendPaymentViaAsanPardakht } from '../services/asanPardakht';

export function registerCardTerminalHandlers(deps: {
  getAssetPath: (...parts: string[]) => string;
}): void {
  const { getAssetPath } = deps;
  function pickByPath(source: any, pathExpr: string): any {
    const clean = String(pathExpr || '').trim();
    if (!clean) return undefined;
    return clean.split('.').reduce((acc: any, part) => {
      if (acc == null) return undefined;
      return acc[part];
    }, source);
  }

  function isTruthyApiValue(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      return ['1', 'true', 'ok', 'success', 'successful', 'approved'].includes(v);
    }
    return Boolean(value);
  }

  async function sendAmountUsingCardTerminalSettings(
    settings: CardTerminalSettings,
    payload: { amount?: number; orderId?: number; restaurantId?: number },
  ) {
    const amount = Number(payload?.amount || 0);
    if (!(amount > 0)) {
      return { success: false, error: 'مبلغ معتبر نیست' };
    }
    if (!settings.enabled) {
      return { success: false, error: 'کارتخوان در تنظیمات دسکتاپ غیرفعال است' };
    }

    const amountToSend =
      settings.sendAmountUnit === 'rial' ? Math.round(amount * 10) : Math.round(amount);

    if (settings.connectionType === 'serial-tlv') {
      const result = await sendAmountViaSamanSerial(amountToSend, {
        portName: settings.serialPortName,
        baudRate: settings.serialBaudRate,
        withHandshake: settings.serialWithHandshake,
      });
      return result.success
        ? {
            success: true,
            message: 'مبلغ با موفقیت به کارتخوان ارسال شد',
            refId: result.rrn || result.traceNumber,
          }
        : { success: false, error: result.error || 'ارسال به کارتخوان ناموفق بود' };
    }

    if (settings.connectionType === 'asan-pardakht') {
      const orderId = Number(payload?.orderId || 0);
      const result = await sendPaymentViaAsanPardakht(
        amountToSend,
        {
          mode: settings.asanPardakhtMode,
          ip: settings.asanPardakhtIp,
          port: settings.asanPardakhtPort,
          comPort: settings.asanPardakhtComPort,
          baudRate: settings.asanPardakhtBaudRate,
          bridgeExePath: getAssetPath('pos-bridge', 'PosBridge.exe'),
        },
        {
          invoiceNumber: orderId > 0 ? String(orderId) : undefined,
        },
      );
      return result.success
        ? { success: true, message: 'پرداخت با موفقیت انجام شد', refId: result.rrn || result.stan }
        : { success: false, error: result.error || 'پرداخت توسط کارتخوان ناموفق بود' };
    }

    if (!settings.endpointUrl?.trim()) {
      return { success: false, error: 'آدرس API کارتخوان تنظیم نشده است' };
    }

    const requestBody: Record<string, any> = {
      [settings.amountFieldName || 'amount']: amountToSend,
    };
    const orderId = Number(payload?.orderId || 0);
    const restaurantId = Number(payload?.restaurantId || 0);
    if (orderId > 0 && settings.orderIdFieldName) {
      requestBody[settings.orderIdFieldName] = orderId;
    }
    if (restaurantId > 0 && settings.restaurantIdFieldName) {
      requestBody[settings.restaurantIdFieldName] = restaurantId;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (settings.authToken?.trim()) {
      headers[settings.authHeaderName || 'Authorization'] = settings.authToken.trim();
    }

    const response = await axios.request({
      method: settings.httpMethod || 'POST',
      url: settings.endpointUrl.trim(),
      data: requestBody,
      headers,
      timeout: Number(settings.timeoutMs || 10000),
    });

    const responseData = response?.data;
    const successValue = pickByPath(responseData, settings.successFieldPath || 'success');
    const messageValue = pickByPath(responseData, settings.messageFieldPath || 'message');
    const refValue = pickByPath(responseData, settings.referenceFieldPath || 'refId');
    const ok = successValue === undefined ? true : isTruthyApiValue(successValue);
    if (!ok) {
      return {
        success: false,
        error: String(messageValue || 'پرداخت توسط کارتخوان ناموفق بود'),
        refId: refValue != null ? String(refValue) : undefined,
      };
    }
    return {
      success: true,
      message: String(messageValue || 'درخواست با موفقیت به کارتخوان ارسال شد'),
      refId: refValue != null ? String(refValue) : undefined,
    };
  }

  async function resolveCardTerminalSettingsByProfile(
    profileId?: string,
  ): Promise<CardTerminalSettings> {
    const config = await loadCardTerminalConfig();
    const selected =
      (profileId ? config.profiles.find((p) => p.id === profileId) : undefined) ||
      config.profiles.find((p) => p.id === config.defaultProfileId) ||
      config.profiles[0];
    if (selected) {
      return selected.settings;
    }
    return loadCardTerminalSettings();
  }

  ipcMain.handle('get-card-terminal-settings', async () => {
    try {
      return await loadCardTerminalSettings();
    } catch (error) {
      console.error('get-card-terminal-settings error:', error);
      return {
        enabled: false,
        connectionType: 'http',
        endpointUrl: '',
        httpMethod: 'POST',
        timeoutMs: 10000,
        amountFieldName: 'amount',
        orderIdFieldName: 'orderId',
        restaurantIdFieldName: 'restaurantId',
        sendAmountUnit: 'toman',
        authHeaderName: 'Authorization',
        authToken: '',
        successFieldPath: 'success',
        messageFieldPath: 'message',
        referenceFieldPath: 'refId',
        serialPortName: '',
        serialBaudRate: 19200,
        serialWithHandshake: false,
        asanPardakhtMode: 'lan',
        asanPardakhtIp: '',
        asanPardakhtPort: 17000,
        asanPardakhtComPort: '',
        asanPardakhtBaudRate: 9600,
      };
    }
  });

  ipcMain.handle('get-card-terminal-config', async () => {
    try {
      return await loadCardTerminalConfig();
    } catch (error) {
      console.error('get-card-terminal-config error:', error);
      return { profiles: [], defaultProfileId: null };
    }
  });

  ipcMain.handle(
    'save-card-terminal-settings',
    async (_event, settings: Partial<CardTerminalSettings>) => {
      try {
        const saved = await saveCardTerminalSettings(settings || {});
        return { success: true, settings: saved };
      } catch (error) {
        console.error('save-card-terminal-settings error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    },
  );

  ipcMain.handle('save-card-terminal-config', async (_event, config: any) => {
    try {
      const saved = await saveCardTerminalConfig(config || {});
      return { success: true, config: saved };
    } catch (error) {
      console.error('save-card-terminal-config error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle(
    'test-card-terminal-connection',
    async (
      _event,
      payload: {
        amount?: number;
        orderId?: number;
        restaurantId?: number;
        terminalProfileId?: string;
      },
    ) => {
      try {
        const settings = await resolveCardTerminalSettingsByProfile(payload?.terminalProfileId);
        return await sendAmountUsingCardTerminalSettings(settings, {
          amount: Number(payload?.amount || 1000),
          orderId: payload?.orderId,
          restaurantId: payload?.restaurantId,
        });
      } catch (error: any) {
        const message =
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          'خطا در تست ارتباط کارتخوان';
        return { success: false, error: String(message) };
      }
    },
  );

  ipcMain.handle(
    'send-amount-to-card-terminal',
    async (
      _event,
      payload: {
        amount?: number;
        orderId?: number;
        restaurantId?: number;
        terminalProfileId?: string;
      },
    ) => {
      try {
        const settings = await resolveCardTerminalSettingsByProfile(payload?.terminalProfileId);
        return await sendAmountUsingCardTerminalSettings(settings, payload || {});
      } catch (error: any) {
        const message =
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          'ارسال مبلغ به کارتخوان ناموفق بود';
        return { success: false, error: String(message) };
      }
    },
  );
}
