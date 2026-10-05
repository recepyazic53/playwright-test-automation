// KORUMA TESTLERİ — Sonuçlar > Genel > Özet panosu (sunucu): düzen PROJE BAŞINA kasada (şifreli) saklanır ve geri yüklenir; kayıt
// yoksa varsayılan (bugünkü Özet); serbest ızgara modeli (sınırlar, çakışmasızlık, aşağı itme, en küçük boyut, eski sıralı düzenden göç);
// kaldır / geri ekle / taşı / boyutlandır / varsayılana dön (saf düzen modülü); yedekte pano.
// SQL kartı: yalnız okuma (INSERT / DROP / EXEC / çoklu ifade reddedilir, bağlantı açılmaz), bağlantının "Yalnız okuma"sı kapalı olsa
// da salt okunur oturum, zaman aşımı ve satır sınırı, gizli adlı sütun + T.C. / IBAN maskelemesi, "Son veri" saati ve önbellek (kart
// değişince geçersiz), anlaşılır hata (adres / parola yok), izin (Veritabanı okuma) ve CANLI onayı gereksinimi. Nöbetçi verisi
// şablonları. Gerçek veritabanı YOK: sürücü bellek içi sahte SQLite'tır (sahte-sql-surucusu.mjs); adreslere bağlanılmaz.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ayarGetir, ayarYaz, ortamKaydet, projeKaydet, veritabaniniHazirla, ekranKaydet, senaryoKaydet } from '../../scripts/platform/veritabani/depo.mjs';
import { baglantiKaydet } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import { surucuYukleyiciAyarla } from '../../scripts/platform/entegrasyonlar/veritabani-suruculeri.mjs';
import { veritabaniKaydet } from '../../scripts/platform/sql/veritabanlari.mjs';
import { izinDegistir, IzinHatasi } from '../../scripts/platform/guvenlik/izinler.mjs';
import { gerekenIzinler } from '../../scripts/platform/guvenlik/uc-denetimi.mjs';
import {
  EN_COK_DILIM, EN_COK_KART, EN_COK_YUKSEKLIK, IZGARA_SUTUN, LISTE_EN_COK, SATIR_BIRIMI, VARSAYILAN_BICIM, bicimTemizle, cakisiyorMu, degisimHesapla,
  duzenTemizle, eksikYerlesikler, enKucukBoyut, esikRengi, eskiBicimMi, gorunurYerlesim, hucreBicimle, kartAyarla, kartEkle, kartKaldir, kartSiraTasi,
  kartYerlestir, pastaDilimleri, sayiBicimle, tarihBicimle, varsayilanDuzen, varsayilanMi, yuzdeBicimle,
  yuzdeDegeri, gorunenSutunlar, satirlariSirala, sutunGorunurlugu, sutunTasi, sutunTuru, sqlZamanAsimiTemizle, type PanoDuzeni
} from '../../scripts/platform/sonuclar/pano-duzeni.mjs';
import { PANO_AYAR_ANAHTARI, PANO_SONUC_ANAHTARI, panoGetir, panoKaydet } from '../../scripts/platform/sonuclar/ozet-panosu.mjs';
import { MASKE, PANO_SQL_UCU, hataIletisi, kartZamanAsimiMs, panoSqlYenile } from '../../scripts/platform/sonuclar/pano-sql.mjs';
import { PANO_POST_UCLARI } from '../../scripts/platform/sonuclar/pano-uclari.mjs';
import { sablonSonucu } from '../../scripts/platform/sonuclar/pano-sablonlari.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { servisKaydet, servisKosusuKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { YEDEK_DISI_AYARLAR, yedekIceAktar, yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { iceAktarmaHazirla, iceAktarmaUygula } from '../../scripts/platform/ice-aktarma.mjs';
import { anahtarTuret, kasaKdfOku } from '../../scripts/platform/kasa.mjs';
import { TABLOLAR, mevcutSemaSurumu } from '../../scripts/platform/veritabani/gocler.mjs';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';
import { SAHTE_IBAN, SAHTE_TC, istemciZamanAsimlari, yukleyici } from './sahte-sql-surucusu.mjs';

type YedekIcerigi = { tablolar: Record<string, Record<string, unknown>[]> };

/** Biçim 2 yedeğin (tek parça, < 1 MiB) ham JSON içeriği: yedekAc'ın süzgecinden GEÇMEDEN ne yazıldığını gösterir. */
async function yedekIcerigi(veri: Buffer, parola: string): Promise<YedekIcerigi> {
  const baslik = veri.subarray(0, 56);
  expect(baslik.readUInt8(8)).toBe(2);
  const kasaAnahtari = await anahtarTuret(parola, { N: 2 ** baslik.readUInt8(9), r: baslik.readUInt8(10), p: baslik.readUInt8(11) }, Buffer.from(baslik.subarray(12, 28)));
  const anahtar = Buffer.from(hkdfSync('sha256', kasaAnahtari, baslik.subarray(28, 44), Buffer.from('platform-yedek-v2', 'utf8'), 32));
  const govde = veri.subarray(56);
  expect(govde.length).toBeLessThanOrEqual(1024 * 1024 + 16);
  const iv = Buffer.alloc(12);
  baslik.copy(iv, 0, 44, 52);
  const aad = Buffer.alloc(61);
  baslik.copy(aad, 0, 0, 56);
  aad[60] = 1;
  const c = createDecipheriv('aes-256-gcm', anahtar, iv);
  c.setAAD(aad);
  c.setAuthTag(govde.subarray(govde.length - 16));
  const duz = Buffer.concat([c.update(govde.subarray(0, govde.length - 16)), c.final()]);
  return JSON.parse(gunzipSync(duz.subarray(9, 9 + Number(duz.readBigUInt64BE(1)))).toString('utf8')) as YedekIcerigi;
}

/** Eski biçimli (1) yedek: ayarlar tablosu OLDUĞU GİBİ (SQL kartı sonuç önbelleği dahil) girer. */
async function eskiBicimYedek(vt: Veritabani, parola: string): Promise<Buffer> {
  const kdf = kasaKdfOku(vt);
  if (!kdf) throw new Error('kasa yok');
  const tablolar = Object.fromEntries(TABLOLAR.map((t) => [t.ad, vt.tumu(`SELECT * FROM ${t.ad} ORDER BY rowid`)]));
  expect(tablolar.ayarlar.map((s) => s.anahtar)).toContain(PANO_SONUC_ANAHTARI);
  const icerik = {
    manifest: { bicimSurumu: 1, semaSurumu: mevcutSemaSurumu(vt), olusturulma: new Date().toISOString(), makine: { id: 'eski', ad: 'Eski' }, sayimlar: {} },
    kasa: { kdf, dogrulayici: vt.metaOku('kasa_dogrulayici') },
    tablolar
  };
  const kasaTuzu = Buffer.from(kdf.tuz, 'base64url');
  const baslik = Buffer.alloc(56);
  Buffer.from('TAYEDEK\0', 'latin1').copy(baslik, 0);
  baslik.writeUInt8(1, 8);
  baslik.writeUInt8(Math.log2(kdf.N), 9);
  baslik.writeUInt8(kdf.r, 10);
  baslik.writeUInt8(kdf.p, 11);
  kasaTuzu.copy(baslik, 12);
  randomBytes(16).copy(baslik, 28);
  randomBytes(12).copy(baslik, 44);
  const kasaAnahtari = await anahtarTuret(parola, kdf, kasaTuzu);
  const anahtar = Buffer.from(hkdfSync('sha256', kasaAnahtari, baslik.subarray(28, 44), Buffer.from('platform-yedek-v1', 'utf8'), 32));
  const s = createCipheriv('aes-256-gcm', anahtar, baslik.subarray(44, 56));
  s.setAAD(baslik);
  const sifreli = Buffer.concat([s.update(gzipSync(Buffer.from(JSON.stringify(icerik), 'utf8'))), s.final()]);
  return Buffer.concat([baslik, s.getAuthTag(), sifreli]);
}

const PAROLA = 'Gecici-Pano-Kasa-1';
const BAGLANTI_PAROLASI = 'pano-parola-gizli-7f2a';

/** Kartların konumları ("id:x,y,w,h"; okuma sırasıyla). */
const konumlar = (d: { kartlar: ReadonlyArray<{ id: string; x: number; y: number; w: number; h: number }> }) => d.kartlar.map((k) => `${k.id}:${k.x},${k.y},${k.w},${k.h}`);

test('düzen modülü: varsayılan bugünkü Özet (ızgara konumlarıyla); kaldır, geri ekle, sıra taşı; doğrulama', () => {
  const v = varsayilanDuzen();
  expect(v.surum).toBe(2);
  expect(konumlar(v)).toEqual(['baslarken:0,0,12,6', 'ozetKutulari:0,6,12,5', 'dikkat:0,11,4,7', 'bakim:4,11,4,7', 'kapsam:8,11,4,7']);
  expect(varsayilanMi(v)).toBe(true);
  expect(IZGARA_SUTUN).toBe(12);
  expect(SATIR_BIRIMI).toBeGreaterThanOrEqual(40);
  expect(SATIR_BIRIMI).toBeLessThanOrEqual(60);
  let d: PanoDuzeni = kartKaldir(v, 'bakim');
  expect(d.kartlar.map((k) => k.id)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'kapsam']);
  expect(eksikYerlesikler(d).map((k) => k.tur)).toEqual(['bakim', 'kosuTrendi']);
  // Kaldırılan kartın yeri boş kalır (yukarı / sola sıkıştırma yok).
  expect(konumlar(d)).toContain('kapsam:8,11,4,7');
  // Geri ekle: konum verilmezse panonun altına, türün boyutuyla; konum verilirse oraya (çakışan aşağı itilir).
  d = kartEkle(d, { tur: 'bakim' });
  expect(konumlar(d).at(-1)).toBe('bakim:0,18,4,7');
  expect(kartEkle(d, { tur: 'bakim' })).toBe(d);
  d = kartEkle(kartKaldir(d, 'bakim'), { tur: 'bakim' }, { x: 4, y: 11 });
  expect(konumlar(d)).toEqual(konumlar(v));
  // Sıra taşı (okuma sırası; dar ekran ve ↑ ↓): Bakım bir öne → Dikkat ile yer değiştirir.
  d = kartSiraTasi(v, 'bakim', 'yukari');
  expect(d.kartlar.map((k) => k.id)).toEqual(['baslarken', 'ozetKutulari', 'bakim', 'dikkat', 'kapsam']);
  expect(konumlar(d)).toEqual(['baslarken:0,0,12,6', 'ozetKutulari:0,6,12,5', 'bakim:0,11,4,7', 'dikkat:4,11,4,7', 'kapsam:8,11,4,7']);
  expect(kartSiraTasi(v, 'baslarken', 'yukari')).toBe(v);
  expect(kartSiraTasi(v, 'kapsam', 'asagi')).toBe(v);
  // Alt alta kartlarda: Özet kutuları bir sonraya → Dikkat öne geçer, Özet kutuları onun altına iner.
  d = kartSiraTasi(v, 'ozetKutulari', 'asagi');
  expect(d.kartlar.map((k) => k.id)).toEqual(['baslarken', 'dikkat', 'ozetKutulari', 'bakim', 'kapsam']);
  expect(varsayilanMi(d)).toBe(false);
  // Doğrulama: bilinmeyen tür, dış bağlantı, çoğul kimlik, sınır.
  expect(() => duzenTemizle({ kartlar: [{ id: 'x', tur: 'yok' }] })).toThrow('Bilinmeyen kart türü');
  expect(() => duzenTemizle({ kartlar: [{ id: 'k-1', tur: 'metin', ayar: { baslik: 'Not', baglantilar: [{ etiket: 'Dış', adres: 'https://ornek.invalid' }] } }] }))
    .toThrow('yalnız Nöbetçi içindeki');
  expect(() => duzenTemizle({ kartlar: [{ id: 'k-1', tur: 'metin', ayar: { baslik: 'Not', baglantilar: [{ etiket: 'B', adres: 'javascript:alert(1)' }] } }] }))
    .toThrow('yalnız Nöbetçi içindeki');
  expect(() => duzenTemizle({ kartlar: [{ id: 'k-1', tur: 'metin', ayar: { baslik: 'A', not: 'x' } }, { id: 'k-1', tur: 'metin', ayar: { baslik: 'B', not: 'y' } }] }))
    .toThrow('birden çok kez');
  expect(() => duzenTemizle({ kartlar: Array.from({ length: EN_COK_KART + 1 }, (_, i) => ({ id: `k-${i}`, tur: 'metin', ayar: { baslik: 'A', not: 'x' } })) }))
    .toThrow(`en çok ${EN_COK_KART} kart`);
  expect(() => duzenTemizle({ kartlar: [{ id: 'k-1', tur: 'sql', ayar: { baslik: 'S', sorgu: 'SELECT 1' } }] })).toThrow('bağlantısı seçin');
  // Eşik: ilk tutan eşik.
  const esikler = [{ islec: '>', deger: 0, renk: 'kirmizi' }, { islec: '=', deger: 0, renk: 'yesil' }];
  expect([esikRengi(3, esikler), esikRengi(0, esikler), esikRengi(-1, esikler)]).toEqual(['kirmizi', 'yesil', null]);
});

test('ızgara modeli: sınırlar, en küçük boyut (türe / görünüme göre), çakışmasızlık, aşağı itme, boşluk korunur', () => {
  const k = (id: string, x: number, y: number, w: number, h: number) => ({ id, tur: 'metin', x, y, w, h, ayar: { baslik: id, not: 'x' } });
  // Sınırlar: tam sayı, 12 sütuna sığma, yükseklik, dördü birlikte.
  expect(() => duzenTemizle({ surum: 2, kartlar: [k('k-a', 10, 0, 4, 2)] })).toThrow('12 sütununa sığmalıdır');
  expect(() => duzenTemizle({ surum: 2, kartlar: [k('k-a', -1, 0, 4, 2)] })).toThrow('12 sütununa sığmalıdır');
  expect(() => duzenTemizle({ surum: 2, kartlar: [k('k-a', 0, 0, 4, EN_COK_YUKSEKLIK + 1)] })).toThrow(`1–${EN_COK_YUKSEKLIK} satır`);
  expect(() => duzenTemizle({ surum: 2, kartlar: [k('k-a', 0, 1.5, 4, 2)] })).toThrow('tam sayı');
  expect(() => duzenTemizle({ surum: 2, kartlar: [{ ...k('k-a', 0, 0, 4, 2), h: undefined }] })).toThrow('x, y, w, h birlikte');
  // Çakışma: girdi üst üste binerse hata.
  expect(() => duzenTemizle({ surum: 2, kartlar: [k('k-a', 0, 0, 6, 3), k('k-b', 5, 2, 4, 3)] })).toThrow('üst üste biniyor');
  // Yan yana / alt alta değen kartlar geçerli; boş satır korunur (üstte 5 satır boşluk).
  const d = duzenTemizle({ surum: 2, kartlar: [k('k-b', 6, 5, 6, 3), k('k-a', 0, 5, 6, 3), k('k-c', 0, 8, 12, 2)] });
  expect(konumlar(d)).toEqual(['k-a:0,5,6,3', 'k-b:6,5,6,3', 'k-c:0,8,12,2']);
  expect(cakisiyorMu({ x: 0, y: 0, w: 6, h: 3 }, { x: 6, y: 0, w: 6, h: 3 })).toBe(false);
  expect(cakisiyorMu({ x: 0, y: 0, w: 6, h: 3 }, { x: 5, y: 2, w: 2, h: 2 })).toBe(true);
  // En küçük boyut: tek sayı küçük, tablo büyük; daha küçük kayıt büyütülür, büyüme çakışırsa alttaki itilir.
  const sql = (gorunum: string) => ({ tur: 'sql', ayar: { gorunum } });
  expect(enKucukBoyut(sql('sayi')).w).toBeLessThan(enKucukBoyut(sql('tablo')).w);
  expect(enKucukBoyut(sql('sayi')).h).toBeLessThan(enKucukBoyut(sql('tablo')).h);
  const kucuk = duzenTemizle({ surum: 2, kartlar: [
    { id: 'k-t', tur: 'sql', x: 0, y: 0, w: 2, h: 2, ayar: { baslik: 'T', hedef: { baglantiId: 'b1' }, sorgu: 'SELECT 1', gorunum: 'tablo' } }, k('k-alt', 0, 2, 4, 2)] });
  const t = kucuk.kartlar.find((x) => x.id === 'k-t')!;
  expect([t.w, t.h]).toEqual([enKucukBoyut(sql('tablo')).w, enKucukBoyut(sql('tablo')).h]);
  expect(kucuk.kartlar.find((x) => x.id === 'k-alt')!.y).toBe(t.h);
  // Yerleştir: istenen boş yere konur, üstü boş kalır (yukarı sıkıştırma yok); sınırlara oturtulur.
  const v = varsayilanDuzen();
  let y = kartYerlestir(v, 'kapsam', { x: 8, y: 20 });
  expect(konumlar(y)).toEqual(['baslarken:0,0,12,6', 'ozetKutulari:0,6,12,5', 'dikkat:0,11,4,7', 'bakim:4,11,4,7', 'kapsam:8,20,4,7']);
  expect(konumlar(kartYerlestir(v, 'kapsam', { x: 11, y: -3 }))).toContain('kapsam:8,0,4,7');
  expect(kartYerlestir(v, 'kapsam', { x: 8, y: 11 })).toBe(v);
  // Çakışmada aşağı itme: Kapsam en üste (Başlarken'in üstüne) → Başlarken ve altındakiler aşağı iner; boyları değişmez.
  y = kartYerlestir(v, 'kapsam', { x: 8, y: 0 });
  expect(konumlar(y)).toEqual(['kapsam:8,0,4,7', 'baslarken:0,7,12,6', 'ozetKutulari:0,13,12,5', 'dikkat:0,18,4,7', 'bakim:4,18,4,7']);
  // Boyutlandırma: Kapsam aşağı uzar; soldaki Dikkat / Bakım'ın boyu ve yeri değişmez.
  y = kartYerlestir(v, 'kapsam', { h: 14 });
  expect(konumlar(y)).toEqual(['baslarken:0,0,12,6', 'ozetKutulari:0,6,12,5', 'dikkat:0,11,4,7', 'bakim:4,11,4,7', 'kapsam:8,11,4,14']);
  // Kullanıcının isteği: geniş kart sol iki sütunun altına (Kapsam sağda uzarken).
  y = kartEkle(y, { id: 'k-raw', tur: 'metin', ayar: { baslik: 'RAWLOG', not: 'x' }, w: 8, h: 6 }, { x: 0, y: 18 });
  expect(konumlar(y).at(-1)).toBe('k-raw:0,18,8,6');
  expect(konumlar(y)).toContain('kapsam:8,11,4,14');
  expect(() => duzenTemizle(y)).not.toThrow();
  // Genişlik / yükseklik sınırları: en küçük ve en çok.
  expect(konumlar(kartYerlestir(v, 'dikkat', { w: 1, h: 1 }))).toContain('dikkat:0,11,3,3');
  expect(konumlar(kartYerlestir(v, 'dikkat', { w: 40, h: 99 }))[2]).toBe(`dikkat:0,11,12,${EN_COK_YUKSEKLIK}`);
  // Zincirleme itme: itilen kart altındakini de iter; hiçbir zaman üst üste binme yok.
  y = kartYerlestir(v, 'ozetKutulari', { h: 10 });
  for (const a of y.kartlar) for (const b of y.kartlar) if (a !== b) expect(cakisiyorMu(a, b), `${a.id} / ${b.id}`).toBe(false);
  expect(y.kartlar.find((x) => x.id === 'dikkat')!.y).toBe(16);
  // Görünüm değişip en küçük boyut büyürse kart büyür (kartAyarla).
  const s = kartEkle(v, { id: 'k-s', tur: 'sql', ayar: { baslik: 'S', hedef: { baglantiId: 'b1' }, sorgu: 'SELECT 1', gorunum: 'sayi' } });
  const s1 = s.kartlar.find((x) => x.id === 'k-s')!;
  const s2 = kartAyarla(s, 'k-s', { ...s1.ayar, gorunum: 'tablo' }).kartlar.find((x) => x.id === 'k-s')!;
  expect(s2.w).toBeGreaterThanOrEqual(enKucukBoyut(sql('tablo')).w);
  // Görünür yerleşim: gizlenen Başlarken'in satırları daralır, kullanıcının bıraktığı boşluk korunur.
  const g = gorunurYerlesim(kartYerlestir(v, 'kapsam', { y: 20 }).kartlar, new Set(['baslarken']));
  expect(g.map((x) => `${x.id}:${x.y}`)).toEqual(['ozetKutulari:0', 'dikkat:5', 'bakim:5', 'kapsam:14']);
});

test('göç: eski sıralı düzen (sıra, genişlik, yükseklik, eşit yükseklik) ızgaraya çevrilir; kart kaybolmaz', () => {
  const eski = {
    surum: 1, esitYukseklik: true, kartlar: [
      { id: 'baslarken', tur: 'baslarken', boyut: 'tam' }, { id: 'ozetKutulari', tur: 'ozetKutulari', boyut: 'tam' },
      { id: 'dikkat', tur: 'dikkat', boyut: 'kucuk' }, { id: 'bakim', tur: 'bakim', boyut: 'kucuk', yukseklik: 8 }, { id: 'kapsam', tur: 'kapsam', boyut: 'kucuk' },
      { id: 'k-raw', tur: 'metin', boyut: 'genis', ayar: { baslik: 'RAWLOG', not: 'x' } }, { id: 'k-not', tur: 'metin', boyut: 'kucuk', yukseklik: 3, ayar: { baslik: 'Not', not: 'y' } },
      { id: 'k-tam', tur: 'metin', boyut: 'orta', ayar: { baslik: 'Tam', not: 'z' } }
    ]
  };
  expect(eskiBicimMi(eski)).toBe(true);
  const d = duzenTemizle(eski);
  expect(eskiBicimMi(d)).toBe(false);
  expect(d.kartlar.map((k) => k.id).sort()).toEqual(eski.kartlar.map((k) => k.id).sort());
  // Sıra korunur: Başlarken, Özet kutuları, sonra üç küçük kart aynı satırda; 8 eski satır (8 × 102 px) → 13 yeni satır ve eşit yükseklik.
  expect(konumlar(d)).toEqual([
    'baslarken:0,0,12,6', 'ozetKutulari:0,6,12,5', 'dikkat:0,11,4,13', 'bakim:4,11,4,13', 'kapsam:8,11,4,13',
    'k-raw:0,24,8,5', 'k-not:8,24,4,5', 'k-tam:0,29,6,3'
  ]);
  // Eşit yükseklik kapalıysa her kart kendi boyunda (satırın üstü ortak).
  const e = duzenTemizle({ ...eski, esitYukseklik: false });
  expect(konumlar(e).slice(2, 5)).toEqual(['dikkat:0,11,4,7', 'bakim:4,11,4,13', 'kapsam:8,11,4,7']);
  for (const a of e.kartlar) for (const b of e.kartlar) if (a !== b) expect(cakisiyorMu(a, b)).toBe(false);
  // Konumlu ve konumsuz karışık: konumsuz kart konumluların altına.
  const karisik = duzenTemizle({ surum: 2, kartlar: [{ id: 'dikkat', tur: 'dikkat', x: 0, y: 0, w: 4, h: 5 }, { id: 'bakim', tur: 'bakim' }] });
  expect(konumlar(karisik)).toEqual(['dikkat:0,0,4,5', 'bakim:0,5,4,7']);
  // Hiç kaydedilmemiş düzen (varsayılan) zaten ızgarada.
  expect(eskiBicimMi(varsayilanDuzen())).toBe(false);
});

test('biçim: yüzde (0,834 → %83,4; 83,4 → %83,4), binlik, ondalık, ön / son ek, tarih, değişim, pasta "Diğer"; yeni görünümler geçerli', () => {
  expect(yuzdeBicimle(0.834)).toBe('%83,4');
  expect(yuzdeBicimle(83.4)).toBe('%83,4');
  expect(yuzdeBicimle(0.834, { oran: 'yuzde' })).toBe('%0,8');
  expect(yuzdeBicimle(1, { oran: 'yuzde' })).toBe('%1');
  expect(yuzdeBicimle(1, { oran: 'oto' })).toBe('%100');
  expect(yuzdeBicimle(0.5, { ondalik: 2 })).toBe('%50,00');
  expect(yuzdeDegeri(0.834)).toBeCloseTo(83.4, 9);
  expect(sayiBicimle(1245)).toBe('1.245');
  expect(sayiBicimle(1234567.891)).toBe('1.234.567,89');
  expect(sayiBicimle(3.14159)).toBe('3,14');
  expect(sayiBicimle(3.14159, { ondalik: 3 })).toBe('3,142');
  expect(sayiBicimle(2.5, { ondalik: 0 })).toBe('3');
  expect(sayiBicimle(12, { ondalik: 1 })).toBe('12,0');
  expect(sayiBicimle(1245, { onEk: '₺' })).toBe('₺1.245');
  expect(sayiBicimle(4.25, { sonEk: ' sn' })).toBe('4,25 sn');
  expect(sayiBicimle(7, { sonEk: ' adet' })).toBe('7 adet');
  expect(() => bicimTemizle({ ondalik: 4 })).toThrow('Ondalık hane 0–3');
  expect(() => bicimTemizle({ hedef: '-1' })).toThrow('Hedef');
  expect(bicimTemizle({ hedef: '95,5' }).hedef).toBe(95.5);
  expect(tarihBicimle('2026-09-11', 'gun')).toBe('11.09.2026');
  expect(tarihBicimle('2026-09-11 14:05:00', 'dakika')).toBe('11.09.2026 14:05');
  expect(tarihBicimle('2026-09-11', 'yok')).toBeNull();
  expect(hucreBicimle('Kayıt 3', { tarih: 'gun' })).toBe('Kayıt 3');
  expect(hucreBicimle(1500.5)).toBe('1.500,5');
  expect(degisimHesapla(12, 10)).toEqual({ fark: 2, yuzde: 20, yon: 'artis' });
  expect(degisimHesapla(8, 10)).toMatchObject({ fark: -2, yon: 'azalis' });
  expect(degisimHesapla(5, 0)).toMatchObject({ yuzde: null, yon: 'artis' });
  expect(degisimHesapla(5, null)).toBeNull();
  const dilimler = pastaDilimleri(Array.from({ length: 11 }, (_, i) => ({ etiket: `K${i + 1}`, deger: (i + 1) * 3 })));
  expect(dilimler).toHaveLength(EN_COK_DILIM);
  expect(dilimler.map((d) => d.etiket)).toEqual(['K11', 'K10', 'K9', 'K8', 'K7', 'K6', 'K5', 'Diğer']);
  expect(dilimler[7]).toMatchObject({ deger: 30, diger: true });
  expect(dilimler.reduce((t, d) => t + d.yuzde, 0)).toBeCloseTo(100, 9);
  expect(pastaDilimleri([{ etiket: 'A', deger: 1 }, { etiket: 'B', deger: 0 }])).toHaveLength(1);
  expect(LISTE_EN_COK).toBe(50);
  // Yeni görünümler ve biçim kartta saklanır; eski kart (biçimsiz) varsayılan biçimle geçerli.
  for (const gorunum of ['yuzde', 'pasta', 'degisim', 'liste', 'kutucuk']) {
    const k = duzenTemizle({ kartlar: [{ id: 'k-1', tur: 'sql', ayar: { baslik: 'S', hedef: { baglantiId: 'b1' }, sorgu: 'SELECT 1', gorunum, bicim: { ondalik: 1, sonEk: ' sn', hedef: 95 } } }] }).kartlar[0];
    expect(k.ayar).toMatchObject({ gorunum, bicim: { ondalik: 1, sonEk: ' sn', hedef: 95 } });
  }
  expect(duzenTemizle({ kartlar: [{ id: 'k-1', tur: 'sql', ayar: { baslik: 'S', hedef: { baglantiId: 'b1' }, sorgu: 'SELECT 1' } }] }).kartlar[0].ayar?.bicim).toEqual(VARSAYILAN_BICIM);
});

test('tablo: görünen sütunlar, taşı, gizle / göster, sıralama türleri (sayı, tarih, metin tr-TR; boşlar sonda), genişlik doğrulaması', () => {
  expect(gorunenSutunlar([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  expect(gorunenSutunlar(['C', 'a', 'yok'], ['a', 'b', 'c'])).toEqual(['c', 'a']);
  expect(sutunTasi(['a', 'b', 'c'], 'c', 'sol')).toEqual(['a', 'c', 'b']);
  expect(sutunTasi(['a', 'b', 'c'], 'a', 'sol')).toEqual(['a', 'b', 'c']);
  expect(sutunTasi(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  expect(sutunGorunurlugu(['a', 'b', 'c'], ['a', 'b', 'c'], 'b', false)).toEqual(['a', 'c']);
  expect(sutunGorunurlugu(['a'], ['a', 'b'], 'a', false)).toEqual(['a']);
  expect(sutunGorunurlugu(['c', 'a'], ['a', 'b', 'c'], 'b', true)).toEqual(['c', 'a', 'b']);
  const r = [[10, 'Çilek', '2026-09-12', '•••'], [2, 'ceviz', '2026-10-01', '•••'], [null, 'armut', '2025-12-31', null], [1, 'Ihlamur', null, '•••'], [100, 'ıspanak', '2026-01-05', '•••']];
  expect([sutunTuru(r, 0), sutunTuru(r, 1), sutunTuru(r, 2), sutunTuru(r, 3)]).toEqual(['sayi', 'metin', 'tarih', 'metin']);
  expect(satirlariSirala(r, 0, 'artan').map((x) => x[0])).toEqual([1, 2, 10, 100, null]);
  expect(satirlariSirala(r, 0, 'azalan').map((x) => x[0])).toEqual([100, 10, 2, 1, null]);
  expect(satirlariSirala(r, 1, 'artan').map((x) => x[1])).toEqual(['armut', 'ceviz', 'Çilek', 'Ihlamur', 'ıspanak']);
  expect(satirlariSirala(r, 2, 'artan').map((x) => x[2])).toEqual(['2025-12-31', '2026-01-05', '2026-09-12', '2026-10-01', null]);
  expect(satirlariSirala(r, 0, null)).toEqual(r);
  expect(satirlariSirala([['10'], ['9'], ['100']], 0, 'artan').map((x) => x[0])).toEqual(['9', '10', '100']);
  const k = (g: unknown) => duzenTemizle({ kartlar: [{ id: 'k-1', tur: 'sql', ayar: { baslik: 'S', hedef: { baglantiId: 'b1' }, sorgu: 'SELECT 1', gorunum: 'tablo', sutunGenislikleri: g } }] });
  expect(k({ durum: 180.4 }).kartlar[0].ayar?.sutunGenislikleri).toEqual({ durum: 180 });
  expect(() => k({ durum: 10 })).toThrow('Sütun genişliği 40–1200 px');
});

test.describe('pano (kasa) ve SQL kartı', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('ozet-panosu');
  const gunluk = join(klasor.yol, 'sql-gunlugu.txt');
  let vt: Veritabani;
  let projeA = '';
  let projeB = '';
  let TEST = '';
  let CANLI = '';
  let bTest = '';
  let bYazilabilir = '';
  let bKapali = '';
  let bYanlis = '';
  let vKayit = '';
  const onceki = process.env.SAHTE_SQL_GUNLUK;
  const sorgular = (): string[] => { try { return readFileSync(gunluk, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
  const sqlKarti = (id: string, sorgu: string, ek: Record<string, unknown> = {}) => ({
    id, tur: 'sql', boyut: 'orta', ayar: { baslik: `Kart ${id}`, hedef: { baglantiId: bTest }, sorgu, gorunum: 'tablo', ...ek }
  });
  const kaydetUcu = PANO_POST_UCLARI.find(([y]) => y === '/platform/pano/kaydet')?.[1] as (db: Veritabani, g: Record<string, unknown>) => unknown;

  test.beforeAll(async () => {
    process.env.SAHTE_SQL_GUNLUK = gunluk;
    surucuYukleyiciAyarla(yukleyici);
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeA = projeKaydet(vt, { ad: 'Pano A' });
    projeB = projeKaydet(vt, { ad: 'Pano B' });
    TEST = ortamKaydet(vt, { projeId: projeA, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    CANLI = ortamKaydet(vt, { projeId: projeA, ad: 'CANLI', tabanUrl: 'http://127.0.0.1:9', ayarlar: { canli: true } });
    const pg = (ad: string, alanlar: Record<string, unknown>, ortamIdleri: string[] = []) => baglantiKaydet(vt, projeA, {
      tur: 'veritabani', ad, ortamIdleri, alanlar: { surucu: 'postgres', sunucu: '127.0.0.1', port: 5433, veritabani: 'uyg', kullanici: 'okur', parola: BAGLANTI_PAROLASI, ...alanlar }
    }).id;
    bTest = pg('test-db', {}, [TEST]);
    bYazilabilir = pg('yazilabilir-db', { yalnizOkuma: false }, [TEST]);
    bKapali = pg('kapali-db', { port: 9 }, [TEST]);
    bYanlis = pg('yanlis-db', { kullanici: 'yanlis' }, [TEST]);
    const bCanli = pg('canli-db', {}, [CANLI]);
    vKayit = veritabaniKaydet(vt, projeA, { ad: 'Kayıt veritabanı', eslemeler: { [TEST]: bTest, [CANLI]: bCanli } }).veritabani.id;
  });
  test.afterAll(() => {
    surucuYukleyiciAyarla(null);
    if (onceki === undefined) delete process.env.SAHTE_SQL_GUNLUK; else process.env.SAHTE_SQL_GUNLUK = onceki;
    vt?.kapat();
    klasor.temizle();
  });

  test('düzen proje başına kaydedilir ve geri yüklenir; kasada şifreli; varsayılana dönüş; silinen proje temizlenir', () => {
    expect(panoGetir(vt, projeA)).toMatchObject({ varsayilan: true, kayitli: false, sqlSonuclari: {} });
    const a = kartYerlestir(kartYerlestir(kartKaldir(varsayilanDuzen(), 'bakim'), 'kapsam', { x: 8, y: 0 }), 'dikkat', { w: 6 });
    panoKaydet(vt, projeA, kartEkle(a, { id: 'k-not', tur: 'metin', ayar: { baslik: 'Ekip notu', not: 'Salı sürüm', baglantilar: [{ etiket: 'Planlı', adres: '#/planli-kosular' }] } }));
    const geri = panoGetir(vt, projeA);
    expect(geri.kayitli).toBe(true);
    expect(geri.varsayilan).toBe(false);
    expect(geri.goc).toBe(false);
    expect(konumlar(geri.duzen)).toEqual(['kapsam:8,0,4,7', 'baslarken:0,7,12,6', 'ozetKutulari:0,13,12,5', 'dikkat:0,18,6,7', 'k-not:0,25,4,3']);
    // Proje B etkilenmez (proje başına tek pano).
    expect(panoGetir(vt, projeB).varsayilan).toBe(true);
    panoKaydet(vt, projeB, kartKaldir(varsayilanDuzen(), 'baslarken'));
    expect(panoGetir(vt, projeB).duzen.kartlar.map((k) => k.id)).toEqual(['ozetKutulari', 'dikkat', 'bakim', 'kapsam']);
    expect(panoGetir(vt, projeA).duzen.kartlar).toHaveLength(5);
    expect(String(vt.tek('SELECT deger_json FROM ayarlar WHERE anahtar = ?', [PANO_AYAR_ANAHTARI])?.deger_json)).toMatch(/^kasa:v1:/);
    // Varsayılana dön: varsayılan düzen kaydedilir.
    panoKaydet(vt, projeB, varsayilanDuzen());
    expect(panoGetir(vt, projeB).varsayilan).toBe(true);
    expect(() => panoKaydet(vt, 'olmayan-proje', varsayilanDuzen())).toThrow('Proje bulunamadı');
    expect(() => panoKaydet(vt, projeA, { kartlar: [{ id: 'x', tur: 'yok' }] })).toThrow('Bilinmeyen kart türü');
    expect(() => panoKaydet(vt, projeA, { surum: 2, kartlar: [{ id: 'dikkat', tur: 'dikkat', x: 0, y: 0, w: 4, h: 4 }, { id: 'bakim', tur: 'bakim', x: 2, y: 2, w: 4, h: 4 }] }))
      .toThrow('üst üste biniyor');
    // Göç: kasada eski (sıralı) kayıt → ızgara konumlarıyla okunur, "goc" bildirilir; kaydedilince yeni biçimde.
    ayarYaz(vt, PANO_AYAR_ANAHTARI, { ...(ayarGetir(vt, PANO_AYAR_ANAHTARI) as Record<string, unknown>), [projeB]: { surum: 1, esitYukseklik: true, kartlar: [
      { id: 'kapsam', tur: 'kapsam', boyut: 'kucuk', yukseklik: 6 }, { id: 'dikkat', tur: 'dikkat', boyut: 'genis' },
      { id: 'k-not', tur: 'metin', boyut: 'tam', ayar: { baslik: 'Not', not: 'x' } }] } });
    const g = panoGetir(vt, projeB);
    expect(g).toMatchObject({ kayitli: true, goc: true });
    expect(konumlar(g.duzen)).toEqual(['kapsam:0,0,4,10', 'dikkat:4,0,8,10', 'k-not:0,10,12,3']);
    panoKaydet(vt, projeB, g.duzen);
    expect(panoGetir(vt, projeB)).toMatchObject({ kayitli: true, goc: false });
    expect(konumlar(panoGetir(vt, projeB).duzen)).toEqual(konumlar(g.duzen));
  });

  test('SQL kartı: yalnız Yenile ile çalışır; maskeleme (gizli adlı sütun + T.C. / IBAN değerleri); Son veri ve önbellek', async () => {
    writeFileSync(gunluk, '');
    const duzen = kartEkle(varsayilanDuzen(), sqlKarti('k-sql', 'SELECT id, durum, tc_kimlik_no, iban, aciklama, tutar FROM kayitlar ORDER BY id'));
    kaydetUcu(vt, { projeId: projeA, duzen });
    // Kaydetmek ve okumak sorgu çalıştırmaz.
    expect(panoGetir(vt, projeA).sqlSonuclari).toEqual({});
    expect(sorgular()).toEqual([]);
    const zaman = new Date(2026, 9, 2, 14, 35);
    const r = await panoSqlYenile(vt, projeA, 'k-sql', { simdi: () => zaman });
    expect(r.zaman).toBe(zaman.toISOString());
    expect(r.sutunlar).toEqual(['id', 'durum', 'tc_kimlik_no', 'iban', 'aciklama', 'tutar']);
    expect(r.gizliSutunlar).toEqual(['tc_kimlik_no', 'iban']);
    expect(r.satirlar).toHaveLength(12);
    expect(r.satirlar[0]).toEqual([1, expect.any(String), MASKE, MASKE, `Kayıt ${MASKE} kimlik ve ${MASKE} hesap`, 10.5]);
    expect(JSON.stringify(r)).not.toContain(SAHTE_TC);
    expect(JSON.stringify(r)).not.toContain(SAHTE_IBAN);
    expect(r.kesildi).toBe(false);
    // Oturum salt okunur açılır, ardından sorgu.
    expect(sorgular()).toEqual(['SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY', 'SELECT id, durum, tc_kimlik_no, iban, aciklama, tutar FROM kayitlar ORDER BY id']);
    // Önbellek: kasada (şifreli, maskeli); sayfa açılınca son sonuç gelir.
    const p = panoGetir(vt, projeA);
    expect(p.sqlSonuclari['k-sql'].zaman).toBe(zaman.toISOString());
    const ham = String(vt.tek('SELECT deger_json FROM ayarlar WHERE anahtar = ?', [PANO_SONUC_ANAHTARI])?.deger_json);
    expect(ham).toMatch(/^kasa:v1:/);
    // Kartın sorgusu değişince eski sonuç gösterilmez; kart kalkınca önbellekten silinir.
    kaydetUcu(vt, { projeId: projeA, duzen: kartEkle(varsayilanDuzen(), sqlKarti('k-sql', 'SELECT COUNT(*) AS n FROM kayitlar')) });
    expect(panoGetir(vt, projeA).sqlSonuclari).toEqual({});
    await panoSqlYenile(vt, projeA, 'k-sql');
    expect(Object.keys(panoGetir(vt, projeA).sqlSonuclari)).toEqual(['k-sql']);
    kaydetUcu(vt, { projeId: projeA, duzen: varsayilanDuzen() });
    expect(panoGetir(vt, projeA).sqlSonuclari).toEqual({});
    await expect(panoSqlYenile(vt, projeA, 'k-sql')).rejects.toThrow('SQL kartı bulunamadı');
  });

  test('yalnız okuma: INSERT, DROP, EXEC, çoklu ifade reddedilir (kaydederken ve Yenile\'de; bağlantı açılmaz); yazılabilir bağlantıda da salt okunur', async () => {
    const kotu = ['INSERT INTO kayitlar (id) VALUES (99)', 'DROP TABLE kayitlar', 'SELECT 1; DELETE FROM kayitlar', 'EXEC sp_who', 'UPDATE kayitlar SET durum = 1',
      'WITH x AS (DELETE FROM kayitlar RETURNING *) SELECT * FROM x', 'SELECT * INTO yedek FROM kayitlar'];
    for (const sql of kotu) {
      expect(() => kaydetUcu(vt, { projeId: projeA, duzen: kartEkle(varsayilanDuzen(), sqlKarti('k-kotu', sql)) }), sql).toThrow(/Panoda|yalnız okuma/);
    }
    const denetle = PANO_POST_UCLARI.find(([y]) => y === '/platform/pano/sql/denetle')?.[1] as (db: Veritabani, g: Record<string, unknown>) => unknown;
    expect(() => denetle(vt, { projeId: projeA, sorgu: 'DROP TABLE kayitlar' })).toThrow('Pano yalnız okuma sorgusu çalıştırır');
    expect(denetle(vt, { projeId: projeA, sorgu: 'WITH s AS (SELECT 1 AS n) SELECT n FROM s' })).toEqual({ gecerli: true });
    // Denetimi atlayan kayıt (doğrudan depo) bile Yenile'de reddedilir; sürücüye hiç gidilmez.
    writeFileSync(gunluk, '');
    panoKaydet(vt, projeA, kartEkle(varsayilanDuzen(), sqlKarti('k-kotu', 'DELETE FROM kayitlar')));
    await expect(panoSqlYenile(vt, projeA, 'k-kotu')).rejects.toThrow('Pano yalnız okuma sorgusu çalıştırır');
    expect(sorgular()).toEqual([]);
    // Bağlantının "Yalnız okuma"sı kapalı: pano yine salt okunur oturum açar.
    panoKaydet(vt, projeA, kartEkle(varsayilanDuzen(), { ...sqlKarti('k-yaz', 'SELECT COUNT(*) AS n FROM kayitlar'), ayar: { baslik: 'Y', hedef: { baglantiId: bYazilabilir }, sorgu: 'SELECT COUNT(*) AS n FROM kayitlar', gorunum: 'sayi' } }));
    const r = await panoSqlYenile(vt, projeA, 'k-yaz');
    expect(r.satirlar).toEqual([[12]]);
    expect(sorgular()[0]).toBe('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  });

  test('zaman aşımı ve satır sınırı (500); anlaşılır hata iletisi adres, kullanıcı ve parola içermez', async () => {
    panoKaydet(vt, projeA, { kartlar: [
      sqlKarti('k-yavas', '/* bekle:3000 */ SELECT 1'),
      sqlKarti('k-cok', 'WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 600) SELECT n FROM s'),
      { ...sqlKarti('k-kapali', 'SELECT 1'), ayar: { baslik: 'K', hedef: { baglantiId: bKapali }, sorgu: 'SELECT 1', gorunum: 'sayi' } },
      { ...sqlKarti('k-yanlis', 'SELECT 1'), ayar: { baslik: 'G', hedef: { baglantiId: bYanlis }, sorgu: 'SELECT 1', gorunum: 'sayi' } },
      sqlKarti('k-yok', 'SELECT * FROM olmayan_tablo')
    ] });
    const bas = Date.now();
    await expect(panoSqlYenile(vt, projeA, 'k-yavas', { zamanAsimiMs: 400 })).rejects.toThrow('sn içinde bitmedi (zaman aşımı)');
    expect(Date.now() - bas).toBeLessThan(2500);
    const cok = await panoSqlYenile(vt, projeA, 'k-cok');
    expect(cok.satirlar).toHaveLength(500);
    expect(cok).toMatchObject({ kesildi: true, satirSiniri: 500 });
    expect((await panoSqlYenile(vt, projeA, 'k-cok', { satirSiniri: 5 })).satirlar).toHaveLength(5);
    for (const [kart, beklenen] of [['k-kapali', 'Veritabanına bağlanılamadı'], ['k-yanlis', 'Veritabanı girişi reddedildi'], ['k-yok', 'Sorgu çalıştırılamadı: no such table: olmayan_tablo']]) {
      const hata = await panoSqlYenile(vt, projeA, kart).catch((e: Error) => e);
      expect(hata).toBeInstanceOf(Error);
      const m = (hata as Error).message;
      expect(m, kart).toContain(beklenen);
      for (const gizli of ['127.0.0.1', '5433', BAGLANTI_PAROLASI, 'okur', 'yanlis']) expect(m, `${kart}: ${gizli}`).not.toContain(gizli);
    }
    // Sürücünün kendi iletisi adres taşısa da çıkarılır.
    expect(hataIletisi(new Error('Veritabanı hatası (PostgreSQL, db.ornek.local): relation "x" does not exist at db.ornek.local:5432 (tcp://10.1.2.3:5432)'),
      { sunucu: 'db.ornek.local', port: 5432, parola: 'p' }, 15_000)).toBe('Sorgu çalıştırılamadı: relation "x" does not exist at •••:••• (•••)');
  });

  test('kartın zaman aşımı ayarı: kaydedilir / okunur, 1–120 sn sınırı; Yenile sürücüye kartın süresini iletir; hata iletisinde doğru sn', async () => {
    // Doğrulama: boş → ayar yok (varsayılan), 0 → 1, 500 → 120, sayı değil → hata.
    expect(sqlZamanAsimiTemizle(undefined)).toBeUndefined();
    expect(sqlZamanAsimiTemizle('')).toBeUndefined();
    expect(sqlZamanAsimiTemizle(0)).toBe(1);
    expect(sqlZamanAsimiTemizle(500)).toBe(120);
    expect(sqlZamanAsimiTemizle('45')).toBe(45);
    expect(() => sqlZamanAsimiTemizle('çok')).toThrow('Zaman aşımı bir sayı olmalıdır');
    expect([kartZamanAsimiMs(undefined), kartZamanAsimiMs(30), kartZamanAsimiMs(999), kartZamanAsimiMs('x')]).toEqual([15_000, 30_000, 120_000, 15_000]);
    kaydetUcu(vt, { projeId: projeA, duzen: { kartlar: [
      sqlKarti('k-sifir', 'SELECT 1', { zamanAsimiSn: 0 }),
      sqlKarti('k-buyuk', 'SELECT 1', { zamanAsimiSn: 500 }),
      sqlKarti('k-yedi', 'SELECT COUNT(*) AS n FROM kayitlar', { zamanAsimiSn: 7 }),
      sqlKarti('k-eski', 'SELECT COUNT(*) AS n FROM kayitlar'),
      sqlKarti('k-bir', '/* bekle:1500 */ SELECT 1', { zamanAsimiSn: 1 })
    ] } });
    expect(() => kaydetUcu(vt, { projeId: projeA, duzen: { kartlar: [sqlKarti('k-kotu', 'SELECT 1', { zamanAsimiSn: 'çok' })] } })).toThrow('Zaman aşımı bir sayı olmalıdır');
    const ayar = (id: string) => panoGetir(vt, projeA).duzen.kartlar.find((k) => k.id === id)?.ayar as Record<string, unknown>;
    expect(ayar('k-sifir').zamanAsimiSn).toBe(1);
    expect(ayar('k-buyuk').zamanAsimiSn).toBe(120);
    expect(ayar('k-yedi').zamanAsimiSn).toBe(7);
    // Eski kart (ayarı yok): ayar eklenmez, varsayılan 15 sn kullanılır.
    expect(ayar('k-eski')).not.toHaveProperty('zamanAsimiSn');
    // Tablo ayarı kaydı kartın zaman aşımını korur.
    const tabloAyari = PANO_POST_UCLARI.find(([y]) => y === '/platform/pano/tablo-ayari')?.[1] as (db: Veritabani, g: Record<string, unknown>) => unknown;
    tabloAyari(vt, { projeId: projeA, kartId: 'k-yedi', sutunlar: ['n'], sutunGenislikleri: {} });
    expect(ayar('k-yedi').zamanAsimiSn).toBe(7);
    // Yenile (uç üzerinden): sürücüye kartın süresi gider.
    const yenileUcu = PANO_POST_UCLARI.find(([y]) => y === PANO_SQL_UCU)?.[1] as (db: Veritabani, g: Record<string, unknown>) => Promise<{ sonuc: { satirlar: unknown[][] } }>;
    istemciZamanAsimlari.length = 0;
    expect((await yenileUcu(vt, { projeId: projeA, kartId: 'k-yedi' })).sonuc.satirlar).toEqual([[12]]);
    expect(istemciZamanAsimlari).toEqual([{ connectionTimeoutMillis: 7000, query_timeout: 7000, statement_timeout: 7000 }]);
    istemciZamanAsimlari.length = 0;
    await yenileUcu(vt, { projeId: projeA, kartId: 'k-eski' });
    expect(istemciZamanAsimlari.map((z) => z.statement_timeout)).toEqual([15_000]);
    // Ayarı 120'ye çekilmiş kart: sürücüye 120 sn (üst sınır).
    istemciZamanAsimlari.length = 0;
    await yenileUcu(vt, { projeId: projeA, kartId: 'k-buyuk' });
    expect(istemciZamanAsimlari.map((z) => z.statement_timeout)).toEqual([120_000]);
    // Test seçeneği de üst sınırı aşamaz.
    istemciZamanAsimlari.length = 0;
    await panoSqlYenile(vt, projeA, 'k-eski', { zamanAsimiMs: 600_000 });
    expect(istemciZamanAsimlari.map((z) => z.statement_timeout)).toEqual([120_000]);
    // Hata iletisi kartın süresini söyler.
    const bas = Date.now();
    await expect(yenileUcu(vt, { projeId: projeA, kartId: 'k-bir' })).rejects.toThrow('Sorgu 1 sn içinde bitmedi (zaman aşımı)');
    expect(Date.now() - bas).toBeLessThan(1450);
    expect(hataIletisi(Object.assign(new Error('x'), { code: 'PANO_ZAMAN_ASIMI' }), {}, 45_000)).toContain('Sorgu 45 sn içinde bitmedi');
  });

  test('izin: Veritabanı okuma kapalıyken çalışmaz; uç izni ve CANLI ortamda açık onay gerekir', async () => {
    panoKaydet(vt, projeA, { kartlar: [
      sqlKarti('k-test', 'SELECT 1 AS n'),
      { ...sqlKarti('k-canli', 'SELECT 1'), ayar: { baslik: 'C', hedef: { veritabaniId: vKayit, ortamId: CANLI }, sorgu: 'SELECT 1', gorunum: 'sayi' } },
      { ...sqlKarti('k-vtest', 'SELECT 1'), ayar: { baslik: 'T', hedef: { veritabaniId: vKayit, ortamId: TEST }, sorgu: 'SELECT 1', gorunum: 'sayi' } }
    ] });
    expect(gerekenIzinler(vt, PANO_SQL_UCU, { projeId: projeA, kartId: 'k-test' })).toMatchObject({ izinler: ['veritabani-okuma'], canliOnayGerekli: false });
    expect(gerekenIzinler(vt, PANO_SQL_UCU, { projeId: projeA, kartId: 'k-vtest' })).toMatchObject({ canliOnayGerekli: false });
    expect(gerekenIzinler(vt, PANO_SQL_UCU, { projeId: projeA, kartId: 'k-canli' })).toMatchObject({ izinler: ['veritabani-okuma', 'canli-ortam'], canliOnayGerekli: true, ortamAdi: 'CANLI' });
    izinDegistir(vt, 'veritabani-okuma', false);
    await expect(panoSqlYenile(vt, projeA, 'k-test')).rejects.toBeInstanceOf(IzinHatasi);
    izinDegistir(vt, 'veritabani-okuma', true, { onay: true });
    const ilk = await panoSqlYenile(vt, projeA, 'k-vtest');
    expect(ilk).toMatchObject({ satirlar: [[1]], onceki: null });
    // "Sayı + değişim": ikinci yenilemede önceki yenilemenin ilk satırı (maskeli önbellekten) sonuçla gelir.
    const ikinci = await panoSqlYenile(vt, projeA, 'k-vtest');
    expect(ikinci.onceki).toEqual({ zaman: ilk.zaman, sutunlar: ['1'], ilkSatir: [1] });
  });

  test('Nöbetçi verisi şablonları: başarı oranı, bugün başarısız, talep no\'su olmayan, en çok başarısız', () => {
    const ekran = ekranKaydet(vt, { projeId: projeA, anahtar: 'basvuru', ad: 'Başvuru' });
    const s1 = senaryoKaydet(vt, { projeId: projeA, ekranId: ekran, baslik: 'Geçerli başvuru', icerik: { talepler: ['TLP-1'] } });
    const s2 = senaryoKaydet(vt, { projeId: projeA, ekranId: ekran, baslik: 'Eksik alan', icerik: {} });
    const simdi = new Date();
    const kosu = (id: string, gunOnce: number, sonuclar: Array<[string, string, 'basarili' | 'basarisiz']>) => {
      const z = new Date(simdi.getTime() - gunOnce * 86_400_000).toISOString();
      kosuKaydet(vt, { id, projeId: projeA, ortamId: TEST, tur: 'tam', baslangic: z });
      for (const [i, [sid, baslik, durum]] of sonuclar.entries()) sonucKaydet(vt, { kosuId: id, projeId: projeA, senaryoId: sid, senaryoBaslik: baslik, durum, testKimligi: `${id}-${i}`, baslangic: z, bitis: z });
      kosuyuBitir(vt, id, { durum: 'tamamlandi', bitis: z });
    };
    kosu('pk-1', 0, [[s1, 'Geçerli başvuru', 'basarili'], [s2, 'Eksik alan', 'basarisiz']]);
    kosu('pk-2', 3, [[s1, 'Geçerli başvuru', 'basarili'], [s2, 'Eksik alan', 'basarisiz']]);
    kosu('pk-3', 40, [[s1, 'Geçerli başvuru', 'basarisiz'], [s2, 'Eksik alan', 'basarisiz']]);
    const servis = servisKaydet(vt, { projeId: projeA, anahtar: 'kayit', ad: 'Kayıt Servisi', tur: 'rest' });
    const ss = servisSenaryosuKaydet(vt, { projeId: projeA, servisId: servis, baslik: 'Kayıt oluştur', icerik: { operasyon: 'POST /kayit', govde: '{}', kontroller: [] } });
    for (const [durum, gun] of [['basarili', 1], ['hata', 0], ['basarili', 2], ['basarili', 50]] as const) {
      servisKosusuKaydet(vt, { projeId: projeA, servisId: servis, senaryoId: ss, ortamId: TEST, tur: 'kosu', durum, baslangic: new Date(simdi.getTime() - gun * 86_400_000).toISOString(), sureMs: 5, baslik: 'Kayıt oluştur', sonuc: {} });
    }
    expect(sablonSonucu(vt, projeA, 'basariOrani', { hedef: `ekran:${ekran}`, gun: 7 })).toMatchObject({ tur: 'sayi', deger: 50, birim: '%', alt: 'Başvuru · son 7 gün · 4 test · 2 başarısız' });
    expect(sablonSonucu(vt, projeA, 'basariOrani', { hedef: `ekran:${ekran}`, gun: 60 })).toMatchObject({ deger: (2 / 6) * 100 });
    expect(sablonSonucu(vt, projeA, 'basariOrani', { hedef: `servis:${servis}`, gun: 7 })).toMatchObject({ deger: (2 / 3) * 100, alt: 'Kayıt Servisi · son 7 gün · 3 çağrı · 1 başarısız' });
    const bugun = sablonSonucu(vt, projeA, 'bugunBasarisiz', {});
    expect(bugun.tur === 'liste' && bugun.maddeler.map((m) => [m.ad, m.ayrinti])).toEqual([['Eksik alan', 'Ekran · Başvuru'], ['Kayıt oluştur', 'Servis · Kayıt Servisi']]);
    const talepsiz = sablonSonucu(vt, projeA, 'talepsiz', { tur: 'hepsi' });
    expect(talepsiz.tur === 'liste' && talepsiz.maddeler.map((m) => m.ad)).toEqual(['Eksik alan', 'Kayıt oluştur']);
    expect(sablonSonucu(vt, projeA, 'talepsiz', { tur: 'ekran' })).toMatchObject({ toplam: 1 });
    const enCok = sablonSonucu(vt, projeA, 'enCokBasarisiz', { gun: 60, adet: 2 });
    expect(enCok.tur === 'liste' && enCok.maddeler.map((m) => [m.ad, m.ayrinti])).toEqual([['Eksik alan', '3 kez başarısız · Ekran · Başvuru'], ['Geçerli başvuru', '1 kez başarısız · Ekran · Başvuru']]);
    expect(() => sablonSonucu(vt, projeA, 'enCokBasarisiz', { gun: 500 })).toThrow('1–90');
    expect(() => sablonSonucu(vt, projeA, 'yok', {})).toThrow('şablonu geçersiz');
  });

  test('yedekte pano: düzen geri gelir; SQL kartı sonuçları yedeğe girmez (kart boş gelir, Yenile ile dolar)', async () => {
    const duzen = kartEkle(kartKaldir(varsayilanDuzen(), 'kapsam'), sqlKarti('k-yedek', 'SELECT COUNT(*) AS n FROM kayitlar', { gorunum: 'sayi', esikler: [{ islec: '>', deger: 0, renk: 'kirmizi' }] }));
    kaydetUcu(vt, { projeId: projeA, duzen });
    const ilkSonuc = await panoSqlYenile(vt, projeA, 'k-yedek');
    // Tablo ayarı (sütun sırası / genişlik) yalnız kartın ayarını değiştirir: önbellekteki sonuç ve "Son veri" korunur, sorgu çalışmaz.
    writeFileSync(gunluk, '');
    const tabloUcu = PANO_POST_UCLARI.find(([y]) => y === '/platform/pano/tablo-ayari')?.[1] as (db: Veritabani, g: Record<string, unknown>) => any;
    const t = tabloUcu(vt, { projeId: projeA, kartId: 'k-yedek', sutunlar: ['n'], sutunGenislikleri: { n: 140 } });
    expect(t.duzen.kartlar.find((x: { id: string }) => x.id === 'k-yedek').ayar).toMatchObject({ sutunlar: ['n'], sutunGenislikleri: { n: 140 }, sorgu: 'SELECT COUNT(*) AS n FROM kayitlar' });
    expect(t.sqlSonuclari['k-yedek'].zaman).toBe(ilkSonuc.zaman);
    expect(sorgular()).toEqual([]);
    expect(() => tabloUcu(vt, { projeId: projeA, kartId: 'baslarken', sutunlar: [] })).toThrow('SQL kartı bulunamadı');
    const once = panoGetir(vt, projeA);
    expect(once.sqlSonuclari['k-yedek']).toBeTruthy();
    const { veri } = yedekOlustur(vt);
    // Yedek içeriği: pano düzeni var, SQL kartı sonuçları YOK (kaynakta önbellek dolu olsa da).
    expect(vt.tek('SELECT 1 AS var FROM ayarlar WHERE anahtar = ?', [PANO_SONUC_ANAHTARI])).toBeTruthy();
    const anahtarlar = (await yedekIcerigi(veri, PAROLA)).tablolar.ayarlar.map((s) => String(s.anahtar));
    expect(anahtarlar).toContain(PANO_AYAR_ANAHTARI);
    expect(anahtarlar).not.toContain(PANO_SONUC_ANAHTARI);
    expect(YEDEK_DISI_AYARLAR).toEqual([PANO_SONUC_ANAHTARI]);
    const hedef = await veritabaniniHazirla(null);
    try {
      await yedekIceAktar(hedef, veri, PAROLA, { mod: 'tamYukle' });
      const sonra = panoGetir(hedef, projeA);
      expect(sonra.duzen).toEqual(once.duzen);
      expect(sonra.duzen.kartlar.map((k) => k.id)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'bakim', 'k-yedek']);
      // Geri yüklenen panoda SQL kartı boş; "Yenile" ile dolar.
      expect(sonra.sqlSonuclari).toEqual({});
      writeFileSync(gunluk, '');
      const yeni = await panoSqlYenile(hedef, projeA, 'k-yedek');
      expect(sorgular()).toContain('SELECT COUNT(*) AS n FROM kayitlar');
      expect(panoGetir(hedef, projeA).sqlSonuclari['k-yedek']).toEqual(yeni);
      // Seçmeli içe aktarmada pano düzeni alınırsa hedefin sonuç önbelleği temizlenir.
      const hazirlik = await iceAktarmaHazirla(hedef, veri, PAROLA);
      iceAktarmaUygula(hedef, hazirlik, { secimler: { ayarlar: [PANO_AYAR_ANAHTARI] } }, { yapan: 'birim-test' });
      expect(panoGetir(hedef, projeA).sqlSonuclari).toEqual({});
      await panoSqlYenile(hedef, projeA, 'k-yedek');
      // Dolu hedefe yeniden tam yükleme: hedefteki önbellek temizlenir (yedekte olmayan sonuçlar gösterilmez).
      await yedekIceAktar(hedef, veri, PAROLA, { mod: 'tamYukle', onay: true, guvenlikYedegiKlasoru: join(klasor.yol, 'guvenlik') });
      expect(panoGetir(hedef, projeA).sqlSonuclari).toEqual({});
      expect(hedef.tek('SELECT 1 AS var FROM ayarlar WHERE anahtar = ?', [PANO_SONUC_ANAHTARI])).toBeFalsy();
    } finally {
      hedef.kapat();
    }
  });

  test('eski biçimli yedek (SQL kartı sonuçlarıyla) sorunsuz yüklenir; sonuçlar yok sayılır', async () => {
    expect(Object.keys(panoGetir(vt, projeA).sqlSonuclari)).toContain('k-yedek');
    const eski = await eskiBicimYedek(vt, PAROLA);
    const hedef = await veritabaniniHazirla(null);
    try {
      const s = await yedekIceAktar(hedef, eski, PAROLA, { mod: 'tamYukle' });
      expect(s.manifest.bicimSurumu).toBe(1);
      expect(panoGetir(hedef, projeA).duzen).toEqual(panoGetir(vt, projeA).duzen);
      expect(panoGetir(hedef, projeA).sqlSonuclari).toEqual({});
      expect(hedef.tek('SELECT 1 AS var FROM ayarlar WHERE anahtar = ?', [PANO_SONUC_ANAHTARI])).toBeFalsy();
      await panoSqlYenile(hedef, projeA, 'k-yedek');
      expect(Object.keys(panoGetir(hedef, projeA).sqlSonuclari)).toEqual(['k-yedek']);
    } finally {
      hedef.kapat();
    }
  });
});
