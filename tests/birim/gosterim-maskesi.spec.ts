// KORUMA TESTLERİ — hata metni döndüren TÜM sonuç uçlarında gösterim maskesi (sonuclar/gosterim-maskesi.mjs): geçici veritabanına
// giriş parolası, kart numarası ve adı gizli alan içeren hata / kontrol metinleri yazılır (sahte koşular; gerçek koşu, dış istek
// YOK); ayrı bir Nöbetçi (127.0.0.1) üzerinden her uç çağrılır, hiçbir yanıtta gizli değer düz dönmez. Saklanan veri değişmez.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaAc, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuDetayi, sonucDetayi } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { gosterimMaskesi, sonucDetayiniMaskele } from '../../scripts/platform/sonuclar/gosterim-maskesi.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { GIZLI_PAROLA, karsilastirmaVerisiKur, type KarsilastirmaFiksturu } from './karsilastirma-fikstur';
import { HIZLI_KDF } from './platform-ortak';

const PAROLA = `Gecici-Maske-${randomBytes(6).toString('hex')}`;
const SIZINTILAR = [GIZLI_PAROLA, '4111111111111111'];
let nobetci: Nobetci;
let klasor = '';
let vtYolu = '';
let f: KarsilastirmaFiksturu;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'gosterim-maskesi-'));
  vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  f = await karsilastirmaVerisiKur(vt, vtYolu);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
  expect(y.basarili, y.mesaj).not.toBe(false);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

/** Uç yanıtı başarılı ve gizli değer içermiyor. */
async function temiz(yol: string): Promise<Record<string, any>> {
  const y = await nobetciApi(nobetci, yol) as Record<string, any>;
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''}`).not.toBe(false);
  const metin = JSON.stringify(y);
  for (const s of SIZINTILAR) expect(metin, `${yol} yanıtında "${s}"`).not.toContain(s);
  return y;
}

test('ekran sonuç uçları: koşu, sonuç (sağ panel / test ayrıntısı), hata kalıpları, özet, senaryo son sonucu', async () => {
  const p = encodeURIComponent(f.projeId);
  await temiz(`/platform/sonuclar/ozet?projeId=${p}`);
  const kaliplar = await temiz(`/platform/sonuclar/kaliplar?projeId=${p}`);
  expect(kaliplar.toplam).toBeGreaterThan(0);
  const idler: string[] = [];
  for (const k of [f.kosuA, f.kosuB, f.tekilKosu]) {
    const d = await temiz(`/platform/sonuclar/kosu?id=${encodeURIComponent(k)}`);
    idler.push(...d.sonuclar.map((x: { id: string }) => x.id));
  }
  expect(idler.length).toBeGreaterThanOrEqual(8);
  let hataGoruldu = false;
  for (const id of idler) {
    const { sonuc } = await temiz(`/platform/sonuclar/sonuc?id=${encodeURIComponent(id)}`);
    if (sonuc.hataMesaji && String(sonuc.hataMesaji).includes('kayıt reddedildi')) {
      hataGoruldu = true;
      // Metnin geri kalanı okunur kalır; gizli değer yerine "•••".
      expect(sonuc.hataMesaji).toContain('•••');
      expect(JSON.stringify(sonuc.adimlar)).toContain('kayıt reddedildi');
    }
    if (sonuc.beklenenGorulen) expect(sonuc.beklenenGorulen.beklenen).toBe('"Onaylandı"');
  }
  expect(hataGoruldu).toBe(true);
  const son = await temiz(`/platform/senaryo/son-sonuc?id=${encodeURIComponent(f.senaryoId)}&ortamId=${encodeURIComponent(f.ortamId)}`);
  expect(son.sonuc?.hataMesaji).toContain('kayıt reddedildi');
});

test('servis sonuç uçları: özet (kalıplar, yakalanan mesajlar), koşu (senaryolar, akış adımları), senaryo (hata, kontroller)', async () => {
  const p = encodeURIComponent(f.projeId);
  const ozet = await temiz(`/platform/servis-sonuclari?projeId=${p}`);
  expect(ozet.kaliplar.length).toBeGreaterThan(0);
  for (const kosu of [f.servisKosuA, f.servisKosuB, f.akisKosuA, f.akisKosuB]) {
    const d = await temiz(`/platform/servis-sonuclari/kosu?projeId=${p}&id=${encodeURIComponent(kosu)}`);
    const satirlar = [...d.senaryolar.map((x: { satirId: string }) => x.satirId), ...d.adimlar.map((a: { satirId: string | null }) => a.satirId).filter(Boolean)];
    for (const s of satirlar) {
      const { sonuc } = await temiz(`/platform/servis-sonuclari/senaryo?projeId=${p}&id=${encodeURIComponent(s)}`);
      expect(sonuc.durum).toBeTruthy();
    }
  }
  const a = await temiz(`/platform/servis-sonuclari/kosu?projeId=${p}&id=${encodeURIComponent(f.servisKosuA)}`);
  expect(a.senaryolar.find((x: { hata: string }) => x.hata)?.hata).toContain('beklenen 200, gelen 500');
});

test('saklanan veri değişmez; maskeleyici istek başına kurulur ve sonuç ayrıntısını maskeler', async () => {
  const vt = await veritabaniniHazirla(vtYolu);
  try {
    await kasaAc(vt, PAROLA);
    const kayit = kosuDetayi(vt, f.kosuB)?.sonuclar.find((x) => x.senaryoBaslik === 'Kayıt');
    const ham = sonucDetayi(vt, String(kayit?.id));
    expect(ham?.hataMesaji).toContain(GIZLI_PAROLA); // depo düz metin tutar (kullanıcı kararı); yalnız gösterim maskeli
    const m = gosterimMaskesi(vt, f.projeId);
    const maskeli = sonucDetayiniMaskele(ham as NonNullable<typeof ham>, m);
    for (const s of SIZINTILAR) expect(JSON.stringify(maskeli)).not.toContain(s);
    expect(ham?.hataMesaji).toContain(GIZLI_PAROLA); // girdi nesnesi değişmedi
  } finally {
    vt.kapat();
  }
});
