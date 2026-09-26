// KORUMA TESTLERİ — Ayarlar > Koşu: kullanıcının koşu kararları (video / ekran görüntüsü / iz, yeniden deneme, süre limiti,
// bekleme süreleri, servis zaman aşımı, varsayılan tarih biçimi) kasada saklanır, doğrulanır, alt sürece ortam değişkeni
// olarak geçer; Playwright yapılandırması ve servis koşusu bunları kullanır. Arayüzde formdan kaydedilir.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { eskiSonuclariSil, kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { kosuAyarlariniKaydet, kosuAyarlariniOku, kosuOrtamDegiskenleri, varsayilanKosuAyarlari } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { yerTutuculariDoldur } from '../../scripts/platform/servisler/soap-istemcisi.mjs';
import { ekranGoruntusuAyari, izAyari, sureAyari, videoAyari, yenidenDenemeAyari } from '../support/kosu-ayarlari';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test('varsayılanlar, doğrulama, kasada saklama ve alt sürece giden ortam değişkenleri', async () => {
  const klasor = geciciKlasor('kosu-ayarlari');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Kosu-Ayari-1', { kdf: HIZLI_KDF });
    expect(kosuAyarlariniOku(vt)).toEqual(varsayilanKosuAyarlari());
    expect(varsayilanKosuAyarlari()).toMatchObject({ video: 'her', ekranGoruntusu: 'yalnizHata', iz: 'yalnizHata', yenidenDeneme: 0, kosuSureLimitiDk: 10,
      alanBeklemeSn: 15, zorlaIsaretlemeSn: 15, servisZamanAsimiSn: 60, tarihBicimi: "yyyy-MM-dd'T'HH:mm:ss" });
    expect(() => kosuAyarlariniKaydet(vt, { yenidenDeneme: 9 })).toThrow('0–3');
    expect(() => kosuAyarlariniKaydet(vt, { video: 'bazen' })).toThrow('geçersiz seçim');
    expect(() => kosuAyarlariniKaydet(vt, { tarihBicimi: 'abc' })).toThrow('geçersiz');
    const a = kosuAyarlariniKaydet(vt, { video: 'kapali', iz: 'her', yenidenDeneme: 2, alanBeklemeSn: 40, tarihBicimi: 'dd.MM.yyyy' });
    expect(a).toMatchObject({ video: 'kapali', iz: 'her', yenidenDeneme: 2, alanBeklemeSn: 40, zorlaIsaretlemeSn: 15, tarihBicimi: 'dd.MM.yyyy' });
    // Verilmeyen ayar korunur.
    expect(kosuAyarlariniKaydet(vt, { zorlaIsaretlemeSn: 5 })).toMatchObject({ video: 'kapali', zorlaIsaretlemeSn: 5 });
    // Diskte şifreli.
    expect(String(vt.tek("SELECT deger_json FROM ayarlar WHERE anahtar = 'kosu'")?.deger_json)).toMatch(/^kasa:v1:/);
    expect(kosuOrtamDegiskenleri(kosuAyarlariniOku(vt))).toEqual({
      NOBETCI_VIDEO: 'kapali', NOBETCI_EKRAN_GORUNTUSU: 'yalnizHata', NOBETCI_IZ: 'her', NOBETCI_YENIDEN_DENEME: '2', NOBETCI_ALAN_BEKLEME_MS: '40000', NOBETCI_ZORLA_BEKLEME_MS: '5000'
    });
    // Servis: biçimsiz tarih ifadesi kullanıcının biçimini kullanır.
    expect(yerTutuculariDoldur('${tarih:bugun}', { degerler: {}, simdi: new Date(2026, 8, 27), varsayilanTarihBicimi: 'dd.MM.yyyy' })).toBe('27.09.2026');
    expect(yerTutuculariDoldur('${tarih:bugun}', { degerler: {}, simdi: new Date(2026, 8, 27, 1, 2, 3) })).toBe('2026-09-27T01:02:03');
  } finally { vt.kapat(); klasor.temizle(); }
});

test('Playwright yapılandırması ortam değişkenlerinden okur; yoksa önceki varsayılanlar', () => {
  const onceki = { ...process.env };
  try {
    for (const k of ['NOBETCI_VIDEO', 'NOBETCI_EKRAN_GORUNTUSU', 'NOBETCI_IZ', 'NOBETCI_YENIDEN_DENEME', 'TEST_SUNUCU_GORUNUR', 'CI', 'NOBETCI_ALAN_BEKLEME_MS']) delete process.env[k];
    expect([videoAyari(), ekranGoruntusuAyari(), izAyari(), yenidenDenemeAyari(), sureAyari('NOBETCI_ALAN_BEKLEME_MS', 15_000)]).toEqual(['retain-on-failure', 'only-on-failure', 'retain-on-failure', 0, 15_000]);
    process.env.TEST_SUNUCU_GORUNUR = '1';
    expect(videoAyari()).toBe('on');
    Object.assign(process.env, { NOBETCI_VIDEO: 'kapali', NOBETCI_EKRAN_GORUNTUSU: 'her', NOBETCI_IZ: 'kapali', NOBETCI_YENIDEN_DENEME: '2', NOBETCI_ALAN_BEKLEME_MS: '40000' });
    expect([videoAyari(), ekranGoruntusuAyari(), izAyari(), yenidenDenemeAyari(), sureAyari('NOBETCI_ALAN_BEKLEME_MS', 15_000)]).toEqual(['off', 'on', 'off', 2, 40_000]);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in onceki)) delete process.env[k];
    Object.assign(process.env, onceki);
  }
});

test.describe('Ayarlar > Koşu arayüzü', () => {
  const PAROLA = `Gecici-KosuUI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kosu-ayar-ui-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Koşu Ayarı Projesi' });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('menüde "Koşu"; form varsayılanlarla gelir, geçersiz değer reddedilir, kaydedilince kasaya yazılır', async () => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/proje');
    await page.getByRole('link', { name: 'Koşu' }).click();
    const form = page.getByRole('form', { name: 'Koşu ayarları' });
    await expect(form.getByLabel('Video')).toHaveValue('her');
    await expect(form.getByLabel('Koşu süre limiti (dk)')).toHaveValue('10');
    await form.getByLabel('Yeniden deneme').fill('7');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('0 ile 3 arasında bir tam sayı girin.')).toBeVisible();
    await form.getByLabel('Yeniden deneme').fill('1');
    await form.getByLabel('Video').selectOption('yalnizHata');
    await form.getByLabel('Servis isteği zaman aşımı (sn)').fill('90');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('Koşu ayarları kaydedildi')).toBeVisible();
    const y = await nobetciApi(nobetci, '/platform/kosu-ayarlari') as { ayarlar: Record<string, unknown> };
    expect(y.ayarlar).toMatchObject({ yenidenDeneme: 1, video: 'yalnizHata', servisZamanAsimiSn: 90 });
    const red = await nobetciApi(nobetci, '/platform/kosu-ayarlari/kaydet', { ayarlar: { kosuSureLimitiDk: 0 } }) as { mesaj?: string };
    expect(String(red.mesaj)).toContain('1–120');
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});

test('sonuç saklama: süresiz varsayılan hiçbir şey silmez; süre verilince eski koşular (sonuç, adım, medya satırı) ve servis koşuları silinir', async () => {
  const klasor = geciciKlasor('sonuc-saklama');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Saklama-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Saklama' });
    const gunOnce = (g: number) => new Date(Date.now() - g * 86_400_000).toISOString();
    for (const [id, g] of [['eski', 40], ['yeni', 2]] as const) {
      kosuKaydet(vt, { id, projeId, tur: 'tekil', baslangic: gunOnce(g) });
      sonucKaydet(vt, { kosuId: id, projeId, senaryoBaslik: id, durum: 'basarili', testKimligi: id, bitis: gunOnce(g), adimlar: [{ ad: 'a', durum: 'basarili', sureMs: 1 }] });
      kosuyuBitir(vt, id, { durum: 'tamamlandi', bitis: gunOnce(g) });
    }
    expect(eskiSonuclariSil(vt, 0)).toEqual({ kosu: 0, sonuc: 0, servisKosusu: 0, akisKosusu: 0 });
    expect(varsayilanKosuAyarlari().sonucSaklamaGun).toBe(0);
    expect(eskiSonuclariSil(vt, 30)).toMatchObject({ kosu: 1, sonuc: 1 });
    expect(vt.tumu('SELECT id FROM kosular').map((r) => r.id)).toEqual(['yeni']);
    expect(Number(vt.tek('SELECT COUNT(*) AS n FROM adim_sonuclari')?.n)).toBe(1);
    expect(kosuAyarlariniKaydet(vt, { sonucSaklamaGun: 90, otomatikYedekSayisi: 7 })).toMatchObject({ sonucSaklamaGun: 90, otomatikYedekSayisi: 7 });
    expect(() => kosuAyarlariniKaydet(vt, { otomatikYedekSayisi: 0 })).toThrow('1–365');
  } finally { vt.kapat(); klasor.temizle(); }
});
