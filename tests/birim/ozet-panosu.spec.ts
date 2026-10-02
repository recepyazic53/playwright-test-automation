// KORUMA TESTLERİ — Sonuçlar > Genel > Özet panosu (sunucu): düzen PROJE BAŞINA kasada (şifreli) saklanır ve geri yüklenir; kayıt
// yoksa varsayılan (bugünkü Özet); kaldır / geri ekle / taşı / boyutlandır / varsayılana dön (saf düzen modülü); yedekte pano.
// SQL kartı: yalnız okuma (INSERT / DROP / EXEC / çoklu ifade reddedilir, bağlantı açılmaz), bağlantının "Yalnız okuma"sı kapalı olsa
// da salt okunur oturum, zaman aşımı ve satır sınırı, gizli adlı sütun + T.C. / IBAN maskelemesi, "Son veri" saati ve önbellek (kart
// değişince geçersiz), anlaşılır hata (adres / parola yok), izin (Veritabanı okuma) ve CANLI onayı gereksinimi. Nöbetçi verisi
// şablonları. Gerçek veritabanı YOK: sürücü bellek içi sahte SQLite'tır (sahte-sql-surucusu.mjs); adreslere bağlanılmaz.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla, ekranKaydet, senaryoKaydet } from '../../scripts/platform/veritabani/depo.mjs';
import { baglantiKaydet } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import { surucuYukleyiciAyarla } from '../../scripts/platform/entegrasyonlar/veritabani-suruculeri.mjs';
import { veritabaniKaydet } from '../../scripts/platform/sql/veritabanlari.mjs';
import { izinDegistir, IzinHatasi } from '../../scripts/platform/guvenlik/izinler.mjs';
import { gerekenIzinler } from '../../scripts/platform/guvenlik/uc-denetimi.mjs';
import {
  BOYUTLAR, EN_COK_DILIM, EN_COK_KART, LISTE_EN_COK, VARSAYILAN_BICIM, bicimTemizle, degisimHesapla, duzenTemizle, eksikYerlesikler, esikRengi,
  hucreBicimle, kartBoyutla, kartEkle, kartKaldir, kartTasi, pastaDilimleri, sayiBicimle, tarihBicimle, varsayilanDuzen, varsayilanMi, yuzdeBicimle,
  yuzdeDegeri, YUKSEKLIKLER, kartYukseklikle, gorunenSutunlar, satirlariSirala, sutunGorunurlugu, sutunTasi, sutunTuru, type PanoDuzeni
} from '../../scripts/platform/sonuclar/pano-duzeni.mjs';
import { PANO_AYAR_ANAHTARI, PANO_SONUC_ANAHTARI, panoGetir, panoKaydet } from '../../scripts/platform/sonuclar/ozet-panosu.mjs';
import { MASKE, PANO_SQL_UCU, hataIletisi, panoSqlYenile } from '../../scripts/platform/sonuclar/pano-sql.mjs';
import { PANO_POST_UCLARI } from '../../scripts/platform/sonuclar/pano-uclari.mjs';
import { sablonSonucu } from '../../scripts/platform/sonuclar/pano-sablonlari.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { servisKaydet, servisKosusuKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { yedekIceAktar, yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';
import { SAHTE_IBAN, SAHTE_TC, yukleyici } from './sahte-sql-surucusu.mjs';

const PAROLA = 'Gecici-Pano-Kasa-1';
const BAGLANTI_PAROLASI = 'pano-parola-gizli-7f2a';

test('düzen modülü: varsayılan bugünkü Özet; kaldır, geri ekle, taşı, boyutlandır; doğrulama', () => {
  const v = varsayilanDuzen();
  expect(v.kartlar.map((k) => [k.id, k.boyut])).toEqual([['baslarken', 'tam'], ['ozetKutulari', 'tam'], ['dikkat', 'kucuk'], ['bakim', 'kucuk'], ['kapsam', 'kucuk']]);
  expect(varsayilanMi(v)).toBe(true);
  expect(BOYUTLAR.map((b) => b.sutun)).toEqual([4, 6, 8, 12]);
  let d: PanoDuzeni = kartKaldir(v, 'bakim');
  expect(d.kartlar.map((k) => k.id)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'kapsam']);
  expect(eksikYerlesikler(d).map((k) => k.tur)).toEqual(['bakim', 'kosuTrendi']);
  d = kartEkle(d, { tur: 'bakim' }, 1);
  expect(d.kartlar.map((k) => k.id)).toEqual(['baslarken', 'bakim', 'ozetKutulari', 'dikkat', 'kapsam']);
  // Yerleşik kart iki kez eklenmez.
  expect(kartEkle(d, { tur: 'bakim' })).toBe(d);
  d = kartTasi(d, 'bakim', 'asagi');
  expect(d.kartlar.map((k) => k.id)).toEqual(['baslarken', 'ozetKutulari', 'bakim', 'dikkat', 'kapsam']);
  expect(kartTasi(d, 'baslarken', 'yukari')).toBe(d);
  d = kartTasi(d, 'kapsam', 0);
  expect(d.kartlar[0].id).toBe('kapsam');
  d = kartBoyutla(d, 'dikkat', 'genis');
  expect(d.kartlar.find((k) => k.id === 'dikkat')?.boyut).toBe('genis');
  expect(() => kartBoyutla(d, 'dikkat', 'dev')).toThrow('Kart boyutu geçersiz');
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
  // Yükseklik: eski kayıt (yalnız genişlik) → Otomatik ve eşit yükseklik açık; 2–12 satır; 'oto' alanı kaldırır.
  const eski = duzenTemizle({ kartlar: [{ id: 'dikkat', tur: 'dikkat', boyut: 'kucuk' }] });
  expect(eski).toEqual({ surum: 1, kartlar: [{ id: 'dikkat', tur: 'dikkat', boyut: 'kucuk' }], esitYukseklik: true });
  expect(duzenTemizle({ kartlar: [], esitYukseklik: false }).esitYukseklik).toBe(false);
  let y = kartYukseklikle(varsayilanDuzen(), 'dikkat', 6);
  expect(y.kartlar.find((x) => x.id === 'dikkat')).toEqual({ id: 'dikkat', tur: 'dikkat', boyut: 'kucuk', yukseklik: 6 });
  expect(varsayilanMi(y)).toBe(false);
  expect(duzenTemizle(y).kartlar.find((x) => x.id === 'dikkat')?.yukseklik).toBe(6);
  y = kartYukseklikle(y, 'dikkat', 'oto');
  expect(y.kartlar.find((x) => x.id === 'dikkat')).toEqual({ id: 'dikkat', tur: 'dikkat', boyut: 'kucuk' });
  expect(varsayilanMi(y)).toBe(true);
  expect(varsayilanMi({ ...varsayilanDuzen(), esitYukseklik: false })).toBe(false);
  expect(() => kartYukseklikle(y, 'dikkat', 13)).toThrow('2–12 satır');
  expect(() => duzenTemizle({ kartlar: [{ id: 'dikkat', tur: 'dikkat', yukseklik: 1 }] })).toThrow('2–12 satır');
  expect(YUKSEKLIKLER.map((x) => x.anahtar)).toEqual(['oto', 3, 4, 6, 8]);
  // Eşik: ilk tutan eşik.
  const esikler = [{ islec: '>', deger: 0, renk: 'kirmizi' }, { islec: '=', deger: 0, renk: 'yesil' }];
  expect([esikRengi(3, esikler), esikRengi(0, esikler), esikRengi(-1, esikler)]).toEqual(['kirmizi', 'yesil', null]);
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
    const a = kartBoyutla(kartTasi(kartKaldir(varsayilanDuzen(), 'bakim'), 'kapsam', 0), 'dikkat', 'orta');
    panoKaydet(vt, projeA, kartEkle(a, { id: 'k-not', tur: 'metin', ayar: { baslik: 'Ekip notu', not: 'Salı sürüm', baglantilar: [{ etiket: 'Planlı', adres: '#/planli-kosular' }] } }));
    const geri = panoGetir(vt, projeA);
    expect(geri.kayitli).toBe(true);
    expect(geri.varsayilan).toBe(false);
    expect(geri.duzen.kartlar.map((k) => `${k.id}:${k.boyut}`)).toEqual(['kapsam:kucuk', 'baslarken:tam', 'ozetKutulari:tam', 'dikkat:orta', 'k-not:kucuk']);
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

  test('yedekte pano: tam yüklemede düzen ve SQL sonuç önbelleği geri gelir', async () => {
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
    const { veri } = yedekOlustur(vt);
    const hedef = await veritabaniniHazirla(null);
    try {
      await yedekIceAktar(hedef, veri, PAROLA, { mod: 'tamYukle' });
      const sonra = panoGetir(hedef, projeA);
      expect(sonra.duzen).toEqual(once.duzen);
      expect(sonra.sqlSonuclari['k-yedek']).toEqual(once.sqlSonuclari['k-yedek']);
      expect(sonra.duzen.kartlar.map((k) => k.id)).toEqual(['baslarken', 'ozetKutulari', 'dikkat', 'bakim', 'k-yedek']);
    } finally {
      hedef.kapat();
    }
  });
});
