import QRCode from 'qrcode';
import { qrVerifyUrl } from '../data/repositories/qr';

// QR image rendering (design §6): the PNG is produced SERVER-side from the absolute
// verify URL — the payload the QR encodes. `qrcode` is pure JS (pngjs), no native
// build; the client-side `qrcode-generator` stays untouched (it cannot render PNG
// buffers in Node).

export async function renderQrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(qrVerifyUrl(token), { type: 'png', width: 512, margin: 2 });
}
