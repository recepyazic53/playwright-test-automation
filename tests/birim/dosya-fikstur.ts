// Dosya içeriği doğrulama testleri için SAHTE dosya üreticileri (kütüphane yok): CSV kodlamaları, küçük XLSX (ZIP + CRC-32),
// PDF (düz / Flate içerik akışı, ToUnicode eşlemeli yazı tipi, şifreli, metinsiz). Veriler genel e-ticaret örnekleridir.
import { crc32, deflateRawSync, deflateSync } from 'node:zlib';

/** Metni Windows-1254 baytlarına çevirir (ASCII, Latin-1 ve Türkçe harfler). */
export function windows1254(metin: string): Buffer {
  const ozel: Record<string, number> = { 'Ğ': 0xd0, 'İ': 0xdd, 'Ş': 0xde, 'ğ': 0xf0, 'ı': 0xfd, 'ş': 0xfe };
  return Buffer.from([...metin].map((c) => ozel[c] ?? (c.charCodeAt(0) <= 0xff ? c.charCodeAt(0) : 0x3f)));
}

/** Basit ZIP (deflate, CRC-32 doğru). */
export function zipUret(dosyalar: Record<string, string | Buffer>): Buffer {
  const yereller: Buffer[] = [];
  const merkezi: Buffer[] = [];
  let ofset = 0;
  for (const [ad, icerik] of Object.entries(dosyalar)) {
    const ham = Buffer.isBuffer(icerik) ? icerik : Buffer.from(icerik, 'utf8');
    const sik = deflateRawSync(ham);
    const adB = Buffer.from(ad, 'utf8');
    const crc = crc32(ham);
    const y = Buffer.alloc(30);
    y.writeUInt32LE(0x04034b50, 0); y.writeUInt16LE(20, 4); y.writeUInt16LE(8, 8); y.writeUInt32LE(crc, 14);
    y.writeUInt32LE(sik.length, 18); y.writeUInt32LE(ham.length, 22); y.writeUInt16LE(adB.length, 26);
    yereller.push(y, adB, sik);
    const m = Buffer.alloc(46);
    m.writeUInt32LE(0x02014b50, 0); m.writeUInt16LE(20, 4); m.writeUInt16LE(20, 6); m.writeUInt16LE(8, 10); m.writeUInt32LE(crc, 16);
    m.writeUInt32LE(sik.length, 20); m.writeUInt32LE(ham.length, 24); m.writeUInt16LE(adB.length, 28); m.writeUInt32LE(ofset, 42);
    merkezi.push(m, adB);
    ofset += 30 + adB.length + sik.length;
  }
  const md = Buffer.concat(merkezi);
  const n = Object.keys(dosyalar).length;
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(n, 8); son.writeUInt16LE(n, 10); son.writeUInt32LE(md.length, 12); son.writeUInt32LE(ofset, 16);
  return Buffer.concat([...yereller, md, son]);
}

type Hucre = string | number | boolean | null;
const xml = (m: string): string => m.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const harf = (i: number): string => { let n = i + 1; let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

/**
 * Küçük XLSX: metinler ortak metin (ilk sayfa) ya da satır içi (diğer sayfalar), sayı ve mantıksal hücreler; null hücre yazılmaz
 * (boşluk bırakır).
 */
export function xlsxUret(sayfalar: Array<{ ad: string; satirlar: Hucre[][] }>): Buffer {
  const ortak: string[] = [];
  const si = (m: string): number => { let i = ortak.indexOf(m); if (i < 0) { ortak.push(m); i = ortak.length - 1; } return i; };
  const dosyalar: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
      sayfalar.map((s, i) => `<sheet name="${xml(s.ad)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
      sayfalar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`
  };
  sayfalar.forEach((s, n) => {
    const satirlar = s.satirlar.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => {
      const ref = `${harf(x)}${y + 1}`;
      if (v === null) return '';
      if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
      if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
      return n === 0 ? `<c r="${ref}" t="s"><v>${si(v)}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    dosyalar[`xl/worksheets/sheet${n + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${satirlar}</sheetData></worksheet>`;
  });
  dosyalar['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${ortak.length}">${
    ortak.map((m) => `<si><t xml:space="preserve">${xml(m)}</t></si>`).join('')}</sst>`;
  return zipUret(dosyalar);
}

/** PDF literal metni kaçışı. */
const pdfMetin = (m: string): string => m.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/**
 * Sahte PDF. sayfalar: her sayfanın satırları. sikistir: içerik akışları FlateDecode. cmap: yazı tipi ToUnicode eşlemeli (Identity-H,
 * 2 baytlık kodlar; Türkçe harfler). sifreli: /Encrypt sözlüğü (içerik yine yazılır). metinsiz: sayfalarda metin işleci yok.
 */
export function pdfUret(sayfalar: string[][], s: { sikistir?: boolean; cmap?: boolean; sifreli?: boolean; metinsiz?: boolean } = {}): Buffer {
  const nesneler: string[] = [];
  const ikili: Map<number, Buffer> = new Map();
  const ekle = (govde: string): number => { nesneler.push(govde); return nesneler.length; };
  const akisEkle = (sozluk: string, veri: Buffer): number => {
    const no = ekle('');
    ikili.set(no, veri);
    nesneler[no - 1] = sozluk;
    return no;
  };
  // Karakter kodları (cmap): her benzersiz karaktere 2 baytlık kod.
  const karakterler = [...new Set(sayfalar.flat().join(''))];
  const kod = (c: string): string => (karakterler.indexOf(c) + 1).toString(16).padStart(4, '0');
  const katalog = ekle('');
  const sayfaAgaci = ekle('');
  let yaziTipi: number;
  if (s.cmap) {
    const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /Adobe-Identity-UCS def 1 begincodespacerange <0000> <FFFF> endcodespacerange
${karakterler.length} beginbfchar
${karakterler.map((c) => `<${kod(c)}> <${c.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n')}
endbfchar endcmap CMapName currentdict /CMap defineresource pop end end`;
    const veri = deflateSync(Buffer.from(cmap, 'latin1'));
    const tu = akisEkle(`<< /Length ${veri.length} /Filter /FlateDecode >>`, veri);
    yaziTipi = ekle(`<< /Type /Font /Subtype /Type0 /BaseFont /Ornek /Encoding /Identity-H /ToUnicode ${tu} 0 R >>`);
  } else {
    yaziTipi = ekle('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  }
  const sayfaNolari: number[] = [];
  for (const satirlar of sayfalar) {
    let icerik = s.metinsiz ? 'q 100 0 0 100 50 50 cm Q\n' : 'BT /F1 12 Tf 50 750 Td 14 TL\n';
    if (!s.metinsiz) {
      satirlar.forEach((satir, i) => {
        const parca = s.cmap ? `<${[...satir].map(kod).join('')}>` : `(${pdfMetin(satir)})`;
        // İkinci satır TJ dizisiyle (aralık düzeltmeli) yazılır; diğerleri Tj / '.
        if (i === 0) icerik += `${parca} Tj\n`;
        else if (i === 1 && !s.cmap) {
          const orta = Math.ceil(satir.length / 2);
          icerik += `0 -14 Td [(${pdfMetin(satir.slice(0, orta))}) -20 (${pdfMetin(satir.slice(orta))})] TJ\n`;
        } else icerik += `T* ${parca} Tj\n`;
      });
      icerik += 'ET\n';
    }
    const ham = Buffer.from(icerik, 'latin1');
    const veri = s.sikistir ? deflateSync(ham) : ham;
    const ic = akisEkle(`<< /Length ${veri.length}${s.sikistir ? ' /Filter /FlateDecode' : ''} >>`, veri);
    sayfaNolari.push(ekle(`<< /Type /Page /Parent ${sayfaAgaci} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${yaziTipi} 0 R >> >> /Contents ${ic} 0 R >>`));
  }
  nesneler[katalog - 1] = '<< /Type /Catalog /Pages 2 0 R >>';
  nesneler[sayfaAgaci - 1] = `<< /Type /Pages /Kids [${sayfaNolari.map((n) => `${n} 0 R`).join(' ')}] /Count ${sayfaNolari.length} >>`;
  const sifre = s.sifreli ? ekle('<< /Filter /Standard /V 2 /R 3 /Length 128 /P -44 /O <00> /U <00> >>') : 0;
  const parcalar: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let konum = parcalar[0].length;
  const konumlar: number[] = [];
  nesneler.forEach((govde, i) => {
    konumlar.push(konum);
    const akis = ikili.get(i + 1);
    const b = akis
      ? Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${govde}\nstream\n`, 'latin1'), akis, Buffer.from('\nendstream\nendobj\n', 'latin1')])
      : Buffer.from(`${i + 1} 0 obj\n${govde}\nendobj\n`, 'latin1');
    parcalar.push(b);
    konum += b.length;
  });
  const xref = `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n${konumlar.map((k) => `${String(k).padStart(10, '0')} 00000 n \n`).join('')}`;
  const trailer = `trailer\n<< /Size ${nesneler.length + 1} /Root ${katalog} 0 R${sifre ? ` /Encrypt ${sifre} 0 R` : ''} >>\nstartxref\n${konum}\n%%EOF\n`;
  parcalar.push(Buffer.from(xref + trailer, 'latin1'));
  return Buffer.concat(parcalar);
}
