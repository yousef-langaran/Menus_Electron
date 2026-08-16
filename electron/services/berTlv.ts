/**
 * کدک عمومی BER-TLV (ISO/IEC 8825) — بدون منطق مخصوص هیچ دستگاهی، فقط encode/decode
 * تگ‌های تک‌بایتی + طول به‌شکل definite-length (کوتاه یا بلند). این بخش استاندارد است
 * و به مستندات خاص دستگاه وابسته نیست؛ منطق پروتکل کارتخوان سامان در samanPos.ts است.
 */

export function encodeLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = n >>> 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function encodeTLV(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag & 0xff]), encodeLength(value.length), value]);
}

export function encodeConstructedTLV(tag: number, children: Buffer[]): Buffer {
  return encodeTLV(tag, Buffer.concat(children));
}

export function decodeLength(buf: Buffer, offset: number): { length: number; bytesConsumed: number } {
  const first = buf[offset];
  if (first < 0x80) return { length: first, bytesConsumed: 1 };
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) length = (length << 8) | buf[offset + 1 + i];
  return { length, bytesConsumed: 1 + numBytes };
}

export interface DecodedTLV {
  tag: number;
  value: Buffer;
  nextOffset: number;
}

export function decodeTLV(buf: Buffer, offset: number): DecodedTLV {
  const tag = buf[offset];
  const { length, bytesConsumed } = decodeLength(buf, offset + 1);
  const valueStart = offset + 1 + bytesConsumed;
  const value = buf.subarray(valueStart, valueStart + length);
  return { tag, value, nextOffset: valueStart + length };
}

/** لیست فلَت تمام TLVهای پشت‌سرهم بین start و end (بدون فرورفتن در تگ‌های تودرتو) */
export function decodeAllTLV(buf: Buffer, start = 0, end = buf.length): DecodedTLV[] {
  const result: DecodedTLV[] = [];
  let offset = start;
  while (offset < end) {
    const item = decodeTLV(buf, offset);
    result.push(item);
    offset = item.nextOffset;
  }
  return result;
}
