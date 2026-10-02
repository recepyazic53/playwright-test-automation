// KORUMA TESTLERİ — Ayarlar > Koşu sadeleştirmesi (S1): hazır profiller ("Kanıt düzeyi", "Ortam hızı") + "Gelişmiş" ve tarama /
// koşu çift ayarlarının "Tarama ve akış kaydında koşu ayarlarını kullan" ile birleşmesi.
//   - profil → ayar eşlemesi; "Dengeli" ve "Normal" bugünkü varsayılanlardır (yeni kullanıcının davranışı değişmez)
//   - kayıtlı değerlerden profil türetilir; tek bir ayar elle değişince "Özel"
//   - çift ayarlar: eski kayıtlı değerler korunur, birleşik anahtar okurken türetilir (göç), etkin tarama değerleri
//   - ortam bazında ezilen koşu hızı profillerden etkilenmez
//   - arayüz: profil seçimi alanları doldurur, elle değişiklikte "Özel", Gelişmiş bugünkü alanların tamamı
// Güvenlik: yalnız geçici veritabanı ve 127.0.0.1'deki geçici Nöbetçi; dışarıya istek yok.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  KOSU_AYAR_TANIMLARI, TARAMA_ESLERI, kosuAyarlariniKaydet, kosuAyarlariniOku, kosuOrtamDegiskenleri, taramaEtkinAyarlari, varsayilanKosuAyarlari
} from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { HIZ_ALANLARI, HIZ_PROFILLERI, KANIT_ALANLARI, KANIT_PROFILLERI, hizDegerleri, hizProfili, kanitDegerleri, kanitProfili } from '../../scripts/platform/ayarlar/kosu-profilleri.mjs';
import { KOSU_HIZI_ALANLARI, etkinKosuHizi } from '../../scripts/platform/ayarlar/kosu-hizi.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

type Ayarlar = Record<string, unknown>;
const tanim = (a: string) => KOSU_AYAR_TANIMLARI.find((t) => t.anahtar === a);
const varsayilan = (): Ayarlar => ({ ...varsayilanKosuAyarlari() });

test('profil → ayar eşlemesi: "Dengeli" ve "Normal" bugünkü varsayılanlar; Hafif / Tam kanıt; Hızlı ×0,7 ve Yavaş ×2 (yuvarlama, sınır)', () => {
  const v = varsayilan();
  // Kanıt düzeyi yalnız Kayıt grubundaki 6 ayarı belirler.
  expect([...KANIT_ALANLARI].sort()).toEqual(KOSU_AYAR_TANIMLARI.filter((t) => t.grup === 'Kayıt').map((t) => t.anahtar).sort());
  expect(KANIT_PROFILLERI.map((p) => p.ad)).toEqual(['hafif', 'dengeli', 'tam']);
  for (const p of KANIT_PROFILLERI) {
    expect(Object.keys(p.degerler).sort()).toEqual([...KANIT_ALANLARI].sort());
    // Her değer ayarın geçerli bir seçeneği.
    for (const [a, d] of Object.entries(p.degerler)) expect(tanim(a)?.secenekler?.some(([x]) => x === d), `${p.ad}.${a}`).toBe(true);
  }
  expect(kanitDegerleri('dengeli')).toEqual(Object.fromEntries(KANIT_ALANLARI.map((a) => [a, v[a]])));
  expect(kanitDegerleri('hafif')).toEqual({ video: 'kapali', videoBoyutu: 'kucuk', ekranGoruntusu: 'yalnizHata', adimGoruntusu: 'yalnizKalan', iz: 'yalnizHata', indirilenDosya: 'kapali' });
  expect(kanitDegerleri('tam')).toEqual({ video: 'her', videoBoyutu: 'ekran', ekranGoruntusu: 'her', adimGoruntusu: 'her', iz: 'her', indirilenDosya: 'her' });
  expect(kanitDegerleri('yok')).toBeNull();

  // Ortam hızı: 20 süre ayarından 16'sı (iki "arası bekleme" ve hızlı testin boşta kalma / en uzun süresi hariç — kullanıcının
  // bekleme kararıdır, ortamın hızı değil); hepsi sn / dk birimli sayı.
  expect(HIZ_ALANLARI).toHaveLength(16);
  const sureler = KOSU_AYAR_TANIMLARI.filter((t) => t.tur === 'sayi' && ['sn', 'dk', 'ms'].includes(String(t.birim))).map((t) => t.anahtar);
  expect(sureler).toHaveLength(20);
  expect(sureler.filter((a) => !HIZ_ALANLARI.includes(a)).sort()).toEqual(['ekranBeklemeMs', 'hizliBostaKalmaDk', 'hizliUstSinirDk', 'servisIstekBeklemeMs']);
  expect(HIZ_PROFILLERI.map((p) => [p.ad, p.carpan])).toEqual([['hizli', 0.7], ['normal', 1], ['yavas', 2]]);
  expect(hizDegerleri(KOSU_AYAR_TANIMLARI, 'normal')).toEqual(Object.fromEntries(HIZ_ALANLARI.map((a) => [a, v[a]])));
  expect(hizDegerleri(KOSU_AYAR_TANIMLARI, 'yavas')).toMatchObject({ kosuSureLimitiDk: 20, servisZamanAsimiSn: 120, alanBeklemeSn: 30, gorunmeyenAlanBeklemeSn: 4, adimGostergeSn: 60, taramaZamanAsimiDk: 10 });
  // ×0,7 tam sayıya yuvarlanır ve sınırın altına inmez (2 sn → 1 sn; 15 sn → 11 sn; 5 dk → 4 dk).
  expect(hizDegerleri(KOSU_AYAR_TANIMLARI, 'hizli')).toMatchObject({ kosuSureLimitiDk: 7, gorunmeyenAlanBeklemeSn: 1, oturumKontrolSn: 11, taramaZamanAsimiDk: 4, servisZamanAsimiSn: 42 });
  for (const ad of ['hizli', 'yavas']) {
    for (const [a, d] of Object.entries(hizDegerleri(KOSU_AYAR_TANIMLARI, ad) ?? {})) {
      const t = tanim(a);
      expect(Number.isInteger(d) && d >= Number(t?.enAz) && d <= Number(t?.enCok), `${ad}.${a}=${d}`).toBe(true);
    }
  }
  expect(hizDegerleri(KOSU_AYAR_TANIMLARI, 'yok')).toBeNull();
});

test('kayıtlı değerlerden profil türetilir: varsayılanlar Dengeli + Normal; tek ayar elle değişince "Özel"; kasaya yazılan profil geri okunur', async () => {
  const v = varsayilan();
  expect(kanitProfili(v)).toBe('dengeli');
  expect(hizProfili(v, KOSU_AYAR_TANIMLARI)).toBe('normal');
  expect(kanitProfili({ ...v, ...kanitDegerleri('tam') })).toBe('tam');
  expect(kanitProfili({ ...v, ...kanitDegerleri('tam'), iz: 'yalnizHata' })).toBe('ozel');
  expect(hizProfili({ ...v, ...hizDegerleri(KOSU_AYAR_TANIMLARI, 'yavas') }, KOSU_AYAR_TANIMLARI)).toBe('yavas');
  expect(hizProfili({ ...v, alanBeklemeSn: 16 }, KOSU_AYAR_TANIMLARI)).toBe('ozel');
  // Profile girmeyen ayarlar (ör. arası beklemeler, yeniden deneme) profili değiştirmez.
  expect(hizProfili({ ...v, ekranBeklemeMs: 500, servisIstekBeklemeMs: 200, yenidenDeneme: 2 }, KOSU_AYAR_TANIMLARI)).toBe('normal');

  const klasor = geciciKlasor('kosu-profilleri');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Profil-Kasasi-1', { kdf: HIZLI_KDF });
    kosuAyarlariniKaydet(vt, { ...kanitDegerleri('hafif'), ...hizDegerleri(KOSU_AYAR_TANIMLARI, 'yavas') });
    const a = kosuAyarlariniOku(vt) as unknown as Ayarlar;
    expect([kanitProfili(a), hizProfili(a, KOSU_AYAR_TANIMLARI)]).toEqual(['hafif', 'yavas']);
    // Alt sürece giden değerler profilden gelir (ör. ×2 süre limiti = 20 dk).
    expect(kosuOrtamDegiskenleri(kosuAyarlariniOku(vt))).toMatchObject({ NOBETCI_VIDEO: 'kapali', NOBETCI_ADIM_GORUNTUSU: 'yalnizKalan', NOBETCI_KOSU_SURE_LIMITI_MS: '1200000' });
    kosuAyarlariniKaydet(vt, { adimGostergeSn: 45 });
    const b = kosuAyarlariniOku(vt) as unknown as Ayarlar;
    expect([kanitProfili(b), hizProfili(b, KOSU_AYAR_TANIMLARI)]).toEqual(['hafif', 'ozel']);
  } finally { vt.kapat(); klasor.temizle(); }
});

test('varsayılanlar bugünküyle aynı: tek yeni ayar "Tarama ve akış kaydında koşu ayarlarını kullan" (kapalı); tarama 1366 × 900 / tr-TR / 15 sn', () => {
  const v = varsayilanKosuAyarlari();
  expect(v).toMatchObject({
    taramaEkranGenisligi: 1366, taramaEkranYuksekligi: 900, taramaDili: 'tr-TR', taramaOturumKontrolSn: 15, taramaGirisAlanBeklemeSn: 15,
    kosuEkranGenisligi: 1280, kosuEkranYuksekligi: 720, kosuDili: 'varsayilan', oturumKontrolSn: 15, girisAlanBeklemeSn: 15, taramaKosuAyarlariniKullan: false
  });
  expect(taramaEtkinAyarlari(v)).toEqual({ kaynak: 'ayri', genislik: 1366, yukseklik: 900, dil: 'tr-TR', oturumKontrolSn: 15, girisAlanBeklemeSn: 15 });
  // Çiftler: tarama ↔ koşu (5 ayar = 4 kavram: ekran boyutu, dil, oturum kontrolü, giriş alanı beklemesi).
  expect(TARAMA_ESLERI).toEqual([['taramaEkranGenisligi', 'kosuEkranGenisligi'], ['taramaEkranYuksekligi', 'kosuEkranYuksekligi'], ['taramaDili', 'kosuDili'],
    ['taramaOturumKontrolSn', 'oturumKontrolSn'], ['taramaGirisAlanBeklemeSn', 'girisAlanBeklemeSn']]);
  // Sayfada görünenler (ana): profillerin yanında yeniden deneme, süre limiti ve birleşik onay; diğer Koşu ayarları Gelişmiş'te.
  expect(KOSU_AYAR_TANIMLARI.filter((t) => t.ana).map((t) => t.anahtar)).toEqual(['yenidenDeneme', 'kosuSureLimitiDk', 'taramaKosuAyarlariniKullan']);
  // Yeni ayar alt sürece ortam değişkeni olarak gitmez (koşucu davranışı değişmez).
  expect(tanim('taramaKosuAyarlariniKullan')?.env).toBeUndefined();
});

test('çift ayarlar: eski kayıtlı değerler korunur; birleşik ayar okurken türetilir (eşitse açık, farklıysa kapalı); açıkken tarama koşu değerlerini alır', async () => {
  const klasor = geciciKlasor('kosu-cift-ayar');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Cift-Ayar-Kasasi-1', { kdf: HIZLI_KDF });
    // Kayıt yok → kapalı (varsayılanlar farklı), tarama kendi varsayılanlarıyla.
    expect(kosuAyarlariniOku(vt).taramaKosuAyarlariniKullan).toBe(false);
    // Eski kurulum (birleşik anahtar hiç yazılmamış), tarama değerleri koşudakilerden farklı: kapalı; eski değerler aynen.
    kosuAyarlariniKaydet(vt, { taramaEkranGenisligi: 1600, taramaDili: 'en-GB', taramaOturumKontrolSn: 9, kosuEkranGenisligi: 1920, oturumKontrolSn: 30 });
    let a = kosuAyarlariniOku(vt);
    expect(a).toMatchObject({ taramaKosuAyarlariniKullan: false, taramaEkranGenisligi: 1600, taramaDili: 'en-GB', taramaOturumKontrolSn: 9, kosuEkranGenisligi: 1920, oturumKontrolSn: 30 });
    expect(taramaEtkinAyarlari(a)).toEqual({ kaynak: 'ayri', genislik: 1600, yukseklik: 900, dil: 'en-GB', oturumKontrolSn: 9, girisAlanBeklemeSn: 15 });
    // Eski kurulum, dört çiftin kayıtlı değerleri zaten aynı: açık türetilir; etkin değerler değişmez.
    kosuAyarlariniKaydet(vt, { taramaEkranGenisligi: 1920, taramaEkranYuksekligi: 1080, kosuEkranYuksekligi: 1080, taramaDili: 'de-DE', kosuDili: 'de-DE', taramaOturumKontrolSn: 30, taramaGirisAlanBeklemeSn: 20, girisAlanBeklemeSn: 20 });
    a = kosuAyarlariniOku(vt);
    expect(a.taramaKosuAyarlariniKullan).toBe(true);
    expect(taramaEtkinAyarlari(a)).toEqual({ kaynak: 'kosu', genislik: 1920, yukseklik: 1080, dil: 'de-DE', oturumKontrolSn: 30, girisAlanBeklemeSn: 20 });
    // Kullanıcı kararı kaydedildiyse türetilmez: açıkça kapalı → ayrı değerler (eşit olsalar da).
    kosuAyarlariniKaydet(vt, { taramaKosuAyarlariniKullan: false });
    expect(kosuAyarlariniOku(vt).taramaKosuAyarlariniKullan).toBe(false);
    // Açık + koşuda "Tarayıcı varsayılanı" dili: taramada dil verilmez (null); taramanın ayrı değerleri silinmez.
    kosuAyarlariniKaydet(vt, { taramaKosuAyarlariniKullan: true, kosuDili: 'varsayilan', kosuEkranGenisligi: 1280, taramaEkranGenisligi: 1500 });
    a = kosuAyarlariniOku(vt);
    expect(taramaEtkinAyarlari(a)).toMatchObject({ kaynak: 'kosu', genislik: 1280, dil: null });
    expect(a).toMatchObject({ taramaEkranGenisligi: 1500, taramaDili: 'de-DE' });
    // Kapatınca ayrı değerler geri gelir.
    kosuAyarlariniKaydet(vt, { taramaKosuAyarlariniKullan: false });
    expect(taramaEtkinAyarlari(kosuAyarlariniOku(vt))).toMatchObject({ kaynak: 'ayri', genislik: 1500, dil: 'de-DE' });
    expect(() => kosuAyarlariniKaydet(vt, { taramaKosuAyarlariniKullan: 'evet' })).toThrow('true / false');
  } finally { vt.kapat(); klasor.temizle(); }
});

test('ortam ezmesi: ortam formundaki koşu hızı profillerden etkilenmez ve genel ayarı ezmeye devam eder', async () => {
  // Hız profili eşzamanlılık ve "arası bekleme" alanlarına dokunmaz.
  for (const p of HIZ_PROFILLERI) for (const a of KOSU_HIZI_ALANLARI.map((t) => t.anahtar)) expect(Object.keys(hizDegerleri(KOSU_AYAR_TANIMLARI, p.ad) ?? {})).not.toContain(a);
  const klasor = geciciKlasor('kosu-profil-ortam');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Profil-Ortam-1', { kdf: HIZLI_KDF });
    kosuAyarlariniKaydet(vt, { ...hizDegerleri(KOSU_AYAR_TANIMLARI, 'yavas'), servisEszamanli: 2, ekranBeklemeMs: 250 });
    const genel = kosuAyarlariniOku(vt) as unknown as Record<string, unknown>;
    const ortam = { ad: 'TEST', ayarlar: { kosuHizi: { ekranEszamanli: 3, servisIstekBeklemeMs: 100 } } };
    expect(etkinKosuHizi(genel, ortam)).toEqual({
      degerler: { servisEszamanli: 2, servisIstekBeklemeMs: 100, ekranEszamanli: 3, ekranBeklemeMs: 250 },
      kaynaklar: { servisEszamanli: 'genel', servisIstekBeklemeMs: 'ortam', ekranEszamanli: 'ortam', ekranBeklemeMs: 'genel' }, ortamAd: 'TEST'
    });
    expect(etkinKosuHizi(genel, { ad: 'CANLI' }).degerler).toEqual({ servisEszamanli: 2, servisIstekBeklemeMs: 0, ekranEszamanli: 1, ekranBeklemeMs: 250 });
  } finally { vt.kapat(); klasor.temizle(); }
});

test.describe('Ayarlar > Koşu arayüzü: profiller ve Gelişmiş', () => {
  const PAROLA = `Gecici-Profil-UI-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'kosu-profil-ui-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeKaydet(vt, { ad: 'Profil Projesi' });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0' });
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
    tarayici = await chromium.launch();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('ilk açılışta Dengeli + Normal; profil alanları doldurur, elle değişiklikte "Özel"; birleşik onay taramanın ayrı alanlarını gizler; 390 px taşmasız', async () => {
    test.setTimeout(90_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/ayarlar/kosu');
    const form = page.getByRole('form', { name: 'Koşu ayarları' });
    const kanit = form.getByRole('group', { name: 'Kanıt düzeyi' });
    const hiz = form.getByRole('group', { name: 'Ortam hızı' });
    await expect(kanit.getByRole('radio', { name: /Dengeli/ })).toBeChecked();
    await expect(hiz.getByRole('radio', { name: /Normal/ })).toBeChecked();
    // Sayfada 3 karar + Gelişmiş: Gelişmiş kapalı ve bugünkü alanların tamamını içerir.
    const gelismis = form.locator('details.gelismis-ayarlar');
    await expect(gelismis).not.toHaveAttribute('open', '');
    const kosuTanimlari = KOSU_AYAR_TANIMLARI.filter((t) => (t.bolum ?? 'kosu') === 'kosu');
    await expect(gelismis.locator('summary')).toContainText(`Gelişmiş (${kosuTanimlari.filter((t) => !t.ana).length} ayar)`);
    await expect(gelismis.locator('summary')).toContainText('hepsi varsayılan');
    await expect(form.getByLabel('Yeniden deneme')).toBeVisible();
    await expect(form.getByLabel('Video', { exact: true })).toBeHidden();

    // Tam kanıt → 6 kayıt alanı; Yavaş → süreler ×2. Kaydet.
    await kanit.getByRole('radio', { name: /Tam kanıt/ }).check();
    await hiz.getByRole('radio', { name: /Yavaş/ }).check();
    await expect(form.getByLabel('Koşu süre limiti (dk)')).toHaveValue('20');
    await gelismis.locator('summary').click();
    await expect(form.getByLabel('Video', { exact: true })).toHaveValue('her');
    await expect(form.getByLabel('Video boyutu')).toHaveValue('ekran');
    await expect(form.getByLabel('İz (trace)')).toHaveValue('her');
    await expect(form.getByLabel('Servis isteği zaman aşımı (sn)')).toHaveValue('120');
    await expect(gelismis.locator('summary')).toContainText('değişen:');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('Koşu ayarları kaydedildi')).toBeVisible();
    let y = (await nobetciApi(nobetci, '/platform/kosu-ayarlari')).ayarlar as Ayarlar;
    expect(y).toMatchObject({ ...kanitDegerleri('tam'), ...hizDegerleri(KOSU_AYAR_TANIMLARI, 'yavas') });
    // Profil ayrı bir ayar olarak saklanmaz.
    expect(Object.keys(y).filter((a) => /profil/i.test(a))).toEqual([]);

    // Yeniden açınca kayıtlı değerlerden: Tam kanıt + Yavaş.
    await page.reload();
    await expect(kanit.getByRole('radio', { name: /Tam kanıt/ })).toBeChecked();
    await expect(hiz.getByRole('radio', { name: /Yavaş/ })).toBeChecked();
    // Tek alan elle değişince ilgili profil "Özel"; diğeri yerinde kalır.
    await gelismis.locator('summary').click();
    await form.getByLabel('İz (trace)').selectOption('yalnizHata');
    await expect(kanit.getByRole('radio', { name: /Özel/ })).toBeChecked();
    await expect(hiz.getByRole('radio', { name: /Yavaş/ })).toBeChecked();
    await form.getByLabel('Alan işlemi (sn)').fill('31');
    await expect(hiz.getByRole('radio', { name: /Özel/ })).toBeChecked();
    // Dengeli'ye dönüş bugünkü varsayılanları geri yazar.
    await kanit.getByRole('radio', { name: /Dengeli/ }).check();
    await hiz.getByRole('radio', { name: /Normal/ }).check();
    await expect(form.getByLabel('Alan işlemi (sn)')).toHaveValue('15');
    await expect(gelismis.locator('summary')).toContainText('hepsi varsayılan');

    // Birleşik onay: açıkken taramanın ayrı değerleri gizlenir (silinmez), kaydedilir.
    const birlesik = form.getByLabel('Tarama ve akış kaydında koşu ayarlarını kullan');
    await expect(birlesik).not.toBeChecked();
    await expect(form.getByLabel('Tarayıcı ekran genişliği (px)')).toBeVisible();
    await birlesik.check();
    await expect(form.getByLabel('Tarayıcı ekran genişliği (px)')).toBeHidden();
    await expect(form.getByLabel('Girişte giriş alanı beklemesi (sn)')).toBeHidden();
    await expect(form.locator('.esli-not')).toBeVisible();
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('Koşu ayarları kaydedildi')).toBeVisible();
    y = (await nobetciApi(nobetci, '/platform/kosu-ayarlari')).ayarlar as Ayarlar;
    expect(y).toMatchObject({ ...varsayilan(), taramaKosuAyarlariniKullan: true, taramaEkranGenisligi: 1366 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
