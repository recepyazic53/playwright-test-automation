// KORUMA TESTLERİ — hesaplama kuralları (scripts/platform/servisler/hesap-kurallari.mjs; tarih kuralları dahil): ayrıştırıcı (öncelik,
// parantez, fonksiyonlar), hatalar (sıfıra bölme, sayı olmayan değer, tanımsız ad, döngü), güvenlik (eval yok; "constructor",
// "__proto__" zararsız), tarih zinciri (BEGIN_DATE+1y aynı anı izler), sayı biçimleri, gövde doldurma (satır içi ${hesap: …}, JSON'da
// sayı), kural bağı { kural } ile senaryo üretimi ve koşu. İstekler YALNIZCA 127.0.0.1'deki sahte sunucuya gider.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  hesapKurallariniDenetle, ifadeDegeri, ifadeUygula, kuralParametreleri, kuralUygula, ornekSonuclar, sayiBicimle
} from '../../scripts/platform/servisler/hesap-kurallari.mjs';
import { ServisHatasi, yerTutuculariDoldur } from '../../scripts/platform/servisler/soap-istemcisi.mjs';
import { restServisiKaydet } from '../../scripts/platform/servisler/rest-servisi.mjs';
import { servisGetir, servisSenaryolariniListele } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { servisiKaydet, servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { geciciKlasor, HIZLI_KDF } from './platform-ortak';

const SIMDI = new Date(2026, 0, 31, 23, 59, 59, 900);
const b = (ref: Record<string, string> = {}) => ({ simdi: SIMDI, ref: (x: string) => ref[x] });
const hesap = (ifade: string, ref: Record<string, string> = {}, kurallar: Record<string, string> = {}) => ifadeUygula(ifade, kurallar, b(ref));

test('ayrıştırıcı: öncelik, parantez, tekli eksi, fonksiyonlar, karşılaştırma, metin', () => {
  expect(hesap('2 + 3 * 4')).toBe('14');
  expect(hesap('(2 + 3) * 4')).toBe('20');
  expect(hesap('-2 * -3 + 10 % 4')).toBe('8');
  expect(hesap('0.1 + 0.2')).toBe('0.3');
  expect(hesap('${Tutar} / 100', { Tutar: '1500' })).toBe('15');
  expect(hesap('yuvarla(${Toplam} * 1.18, 2)', { Toplam: '99.99' })).toBe('117.99');
  expect(hesap('asagiYuvarla(2.789, 1) + yukariYuvarla(2.701, 1) + mutlak(-1)')).toBe('6.5');
  expect(hesap('min(3, ${A}, 7) + max(1, 2)', { A: '1' })).toBe('3');
  expect(hesap("eger(${Tip} = 'T', ${VergiNo}, ${TcNo})", { Tip: 'T', VergiNo: '11', TcNo: '22' })).toBe('11');
  expect(hesap("eger(${Tip} != 'T', 'a', 'b')", { Tip: 'T' })).toBe('b');
  expect(hesap("birlestir(${Ad}, ' ', buyukHarf(${Soyad}))", { Ad: 'Ayşe', Soyad: 'ışık' })).toBe('Ayşe IŞIK');
  expect(hesap("'a' + 'b' + uzunluk('çok')")).toBe('ab3');
  expect(hesap("parca('abcdef', 2, 3)")).toBe('bcd');
  expect(hesap('bosIse(${Yok}, 5) + 1', {})).toBe('6');
  expect(hesap("3 <= 3")).toBe('true');
  expect(hesap("'It''s'")).toBe("It's");
});

test('hatalar: sıfıra bölme, sayı olmayan değer, tanımsız ad, bilinmeyen fonksiyon, sözdizimi, döngü', () => {
  expect(() => hesap('1 / (2 - 2)')).toThrow(/Sıfıra bölme/);
  expect(() => hesap('${X} * 2', { X: 'abc' })).toThrow(/\$\{X\} sayı değil \('abc'\)/);
  expect(() => hesap('${X} + 1', {})).toThrow(/\$\{X\} için değer yok/);
  expect(() => hesap('bilinmez(1)')).toThrow(/Bilinmeyen fonksiyon/);
  expect(() => hesap('1 +')).toThrow(/eksik/);
  expect(() => hesap('(1 + 2')).toThrow(/"\)" bekleniyordu/);
  expect(() => hesap("'kapanmadı")).toThrow(/Kapanmamış metin/);
  expect(() => hesap('1 ; 2')).toThrow(/Beklenmeyen karakter/);
  const h = hesapKurallariniDenetle({ A: 'B + 1', B: 'C * 2', C: 'A', D: 'YOK + 1', E: 'bugun', bugun: '1', yuvarla: '2' });
  expect(h.A).toMatch(/döngüye giriyor: A → B → C → A/);
  expect(h.D).toMatch(/Tanımsız ad: YOK/);
  expect(h.E).toBeUndefined();
  expect(h.bugun).toMatch(/ayrılmış/);
  expect(h.yuvarla).toMatch(/ayrılmış/);
});

test('güvenlik: eval yok; constructor / __proto__ / toString zararsız, prototip kirletilmez', () => {
  for (const ifade of ['constructor', '__proto__', 'toString', 'constructor.constructor', 'hasOwnProperty(1)', '__proto__(1)', 'valueOf()']) {
    expect(() => hesap(ifade), ifade).toThrow();
  }
  expect(() => kuralUygula('constructor', { A: '1' }, b())).toThrow(/kural yok/);
  expect(() => hesap("${__proto__}", {})).toThrow(/değer yok/);
  expect(hesap("'constructor' + '__proto__'")).toBe('constructor__proto__');
  expect(({} as Record<string, unknown>).kirli).toBeUndefined();
  expect(hesapKurallariniDenetle({ __proto__: '1' } as unknown as Record<string, string>)).toEqual({});
});

test('tarih: zincir aynı anı izler, ay sonu taşmaz, eski sözdizimi, gunFarki; sayı biçimleri', () => {
  const kurallar = { BEGIN_DATE: "bugun|yyyy-MM-dd'T'HH:mm:ss", END_DATE: 'BEGIN_DATE+1y|yyyy-MM-dd', AY: 'BEGIN_DATE+1a|yyyy-MM-dd', ESKI: 'bugun+60g|yyyy-MM-dd',
    SURE: 'gunFarki(BEGIN_DATE, END_DATE)', SAAT: "bugun+2s|HH:mm" };
  const baglam = b();
  expect(ornekSonuclar(kurallar, {}, SIMDI)).toEqual({
    BEGIN_DATE: { sonuc: '2026-01-31T23:59:59' }, END_DATE: { sonuc: '2027-01-31' }, AY: { sonuc: '2026-02-28' }, ESKI: { sonuc: '2026-04-01' },
    SURE: { sonuc: '365' }, SAAT: { sonuc: '01:59' }
  });
  // Aynı hesap (önbellek): BEGIN_DATE bir kez hesaplanır; END_DATE onun ANINI temel alır.
  const bas = ifadeDegeri('BEGIN_DATE', kurallar, baglam) as Date;
  const bit = ifadeDegeri('END_DATE', kurallar, baglam) as Date;
  expect(bit.getTime() - bas.getTime()).toBe(365 * 864e5);
  expect(hesap("tarih('10.05.2026') + 1g | yyyy-MM-dd")).toBe('2026-05-11');
  expect(hesap("tarih('2026/05/10', 'yyyy/MM/dd') | dd.MM.yyyy")).toBe('10.05.2026');
  expect(sayiBicimle(1234567.891, '#,##0.00')).toBe('1,234,567.89');
  expect(sayiBicimle(1234567.891, '#.##0,00')).toBe('1.234.567,89');
  expect(sayiBicimle(1.005, '0.00')).toBe('1.01');
  expect(sayiBicimle(-2.5, '0')).toBe('-3');
  expect(hesap('${T} / 3 | 0.0000', { T: '10' })).toBe('3.3333');
  expect(kuralParametreleri(['P'], { P: 'yuvarla(${Tutar} * ORAN, 2)', ORAN: '${Katsayi} / 100' })).toEqual({ refler: ['Tutar', 'Katsayi'], akislar: [] });
});

test('gövde doldurma: kural, satır içi ${hesap: …} (XML kaçışlı), JSON sayı, eksik başvuru, gizli değer maskeli hata', () => {
  const kurallar = { TOPLAM: 'yuvarla(${Tutar} * 1.18, 2) | 0.00', BEGIN_DATE: 'bugun|yyyy-MM-dd', END_DATE: 'BEGIN_DATE+1y|yyyy-MM-dd' };
  const xml = '<A>${TOPLAM}</A><B>${hesap: eger(${Tutar} &lt; 100, \'az\', \'çok\')}</B><C>${END_DATE}</C><D>${tarih:BEGIN_DATE-1g|dd.MM.yyyy}</D>';
  expect(yerTutuculariDoldur(xml, { degerler: { Tutar: '1000' }, tarihKurallari: kurallar, simdi: SIMDI }))
    .toBe('<A>1180.00</A><B>çok</B><C>2027-01-31</C><D>30.01.2026</D>');
  expect(yerTutuculariDoldur('{"n": ${hesap: ${Tutar} / 4}, "s": "${hesap: birlestir(\'"\', ${Tutar})}"}', { degerler: { Tutar: '10' }, kacis: 'json', simdi: SIMDI }))
    .toBe('{"n": 2.5, "s": "\\"10"}');
  expect(() => yerTutuculariDoldur('<A>${TOPLAM}</A>', { degerler: {}, tarihKurallari: kurallar, simdi: SIMDI, eksikAciklamasi: () => 'tabloda yok' }))
    .toThrow(/Değeri bulunamayan parametre: Tutar \(tabloda yok\)/);
  let hata: unknown;
  try { yerTutuculariDoldur('<A>${hesap: ${Parola} * 2}</A>', { degerler: { Parola: 'cok-gizli-1' }, simdi: SIMDI, gizliler: ['cok-gizli-1'] }); } catch (e) { hata = e; }
  expect(hata).toBeInstanceOf(ServisHatasi);
  expect(String((hata as Error).message)).not.toContain('cok-gizli-1');
});

test.describe('kural bağı ve koşu (sahte sunucu)', () => {
  const klasor = geciciKlasor('hesap');
  let vt: Veritabani;
  let sunucu: Server;
  const govdeler: string[] = [];
  test.afterAll(async () => { vt?.kapat(); klasor.temizle(); await new Promise((c) => sunucu?.close(c)); });

  test('kural doğrulaması, bağ { kural } → başlangıç senaryosu → koşuda hesaplanan gövde', async () => {
    sunucu = createServer((q, r) => { let g = ''; q.on('data', (p) => { g += p; }); q.on('end', () => { govdeler.push(g); r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{}'); }); });
    await new Promise<void>((c) => sunucu.listen(0, '127.0.0.1', () => c()));
    const adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
    vt = await veritabaniniHazirla(join(klasor.yol, 'p.db'));
    await kasaOlustur(vt, 'Deneme-Parola-123!', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'P' });
    const testO = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: adres, varsayilan: true, ayarlar: { riskli: false } });
    const tablo = tabloKaydet(vt, { projeId, ad: 'Siparis verisi', sutunlar: [{ ad: 'Tutar' }], satirlar: [{ degerler: { Tutar: '1500' } }] });
    const kurallar = { BEGIN_DATE: 'bugun|yyyy-MM-dd', END_DATE: 'BEGIN_DATE+1y|yyyy-MM-dd', ORAN: 'yuvarla(${Siparis verisi.Tutar} / 100, 2)' };
    const uc = { ad: 'siparis', metot: 'POST', yol: '/siparis', icerikTuru: 'application/json', govdeOrnegi: '{"BeginDate":"x","EndDate":"x","Oran":0,"Tutar":"0"}' };
    // Döngü ve tanımsız kural reddedilir; tanımsız kurala bağ reddedilir.
    expect(() => restServisiKaydet(vt, projeId, { anahtar: 'd', ad: 'D', uclar: [uc], tarihKurallari: { A: 'B', B: 'A' } })).toThrow(/döngüye giriyor/);
    expect(() => restServisiKaydet(vt, projeId, { anahtar: 'd', ad: 'D', uclar: [uc], tarihKurallari: { A: 'YOK+1g' } })).toThrow(/Tanımsız ad: YOK/);
    expect(() => restServisiKaydet(vt, projeId, { anahtar: 'd', ad: 'D', uclar: [uc], tarihKurallari: kurallar, alanBaglari: { siparis: { 'govde/Oran': { kural: 'YOK' } } } }))
      .toThrow(/kuralına bağlı ama bu kural tanımlı değil/);
    const r = restServisiKaydet(vt, projeId, {
      anahtar: 'siparis', ad: 'Siparis', tabanlar: { [testO]: adres }, uclar: [uc], tarihKurallari: kurallar, senaryolar: ['siparis'],
      alanBaglari: { siparis: { 'govde/BeginDate': { kural: 'BEGIN_DATE' }, 'govde/EndDate': { kural: 'END_DATE' }, 'govde/Oran': { kural: 'ORAN' }, 'govde/Tutar': { tablo, sutun: 'Tutar' } } }
    });
    const s = servisGetir(vt, r.id);
    expect(s?.ayarlar.alanBaglari?.siparis['govde/BeginDate']).toEqual({ kural: 'BEGIN_DATE' });
    const [sen] = servisSenaryolariniListele(vt, r.id);
    expect(JSON.parse(sen.icerik.govde.replace('${ORAN}', '0'))).toEqual({ BeginDate: '${BEGIN_DATE}', EndDate: '${END_DATE}', Oran: 0, Tutar: '${Siparis verisi.Tutar}' });
    const k = await servisSenaryosuCalistir(vt, projeId, { servisId: r.id, ortamId: testO, tur: 'dene', senaryoId: sen.id, simdi: SIMDI });
    expect(k.durum, String(k.hata)).toBe('basarili');
    expect(JSON.parse(govdeler[govdeler.length - 1])).toEqual({ BeginDate: '2026-01-31', EndDate: '2027-01-31', Oran: 15, Tutar: '1500' });
    // Kural silinirken bağlı alan varsa açık hata (servisiKaydet de denetler).
    expect(() => servisiKaydet(vt, projeId, { id: r.id, anahtar: 'siparis', ad: 'Siparis', yol: '/', tarihKurallari: { BEGIN_DATE: 'bugun' } })).toThrow(/tanımlı değil/);
  });
});
