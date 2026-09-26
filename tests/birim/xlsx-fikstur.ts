// Testler için tek sayfalık, ortak metinli sahte .xlsx üretici (ZIP, deflate; kütüphane yok).
import { deflateRawSync } from 'node:zlib';

/** Tek sayfalık, ortak metinli sahte .xlsx. */
export function sahteXlsx(satirlar: string[][]): Buffer {
  const metinler: string[] = [];
  const si = (m: string) => { let i = metinler.indexOf(m); if (i < 0) { metinler.push(m); i = metinler.length - 1; } return i; };
  const sutun = (i: number) => String.fromCharCode(65 + i);
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
    satirlar.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => `<c r="${sutun(x)}${y + 1}" t="s"><v>${si(v)}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const dosyalar: Record<string, string> = {
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sayfa1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
    'xl/sharedStrings.xml': `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${metinler.map((m) => `<si><t>${m.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`).join('')}</sst>`
  };
  const yereller: Buffer[] = []; const merkezi: Buffer[] = []; let ofset = 0;
  for (const [ad, icerik] of Object.entries(dosyalar)) {
    const ham = Buffer.from(icerik, 'utf8'); const sik = deflateRawSync(ham); const adB = Buffer.from(ad, 'utf8');
    const y = Buffer.alloc(30); y.writeUInt32LE(0x04034b50, 0); y.writeUInt16LE(20, 4); y.writeUInt16LE(8, 8); y.writeUInt32LE(sik.length, 18); y.writeUInt32LE(ham.length, 22); y.writeUInt16LE(adB.length, 26);
    yereller.push(y, adB, sik);
    const m = Buffer.alloc(46); m.writeUInt32LE(0x02014b50, 0); m.writeUInt16LE(20, 4); m.writeUInt16LE(20, 6); m.writeUInt16LE(8, 10); m.writeUInt32LE(sik.length, 20); m.writeUInt32LE(ham.length, 24); m.writeUInt16LE(adB.length, 28); m.writeUInt32LE(ofset, 42);
    merkezi.push(m, adB);
    ofset += 30 + adB.length + sik.length;
  }
  const md = Buffer.concat(merkezi);
  const son = Buffer.alloc(22); son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(Object.keys(dosyalar).length, 8); son.writeUInt16LE(Object.keys(dosyalar).length, 10); son.writeUInt32LE(md.length, 12); son.writeUInt32LE(ofset, 16);
  return Buffer.concat([...yereller, md, son]);
}
