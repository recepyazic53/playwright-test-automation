// KORUMA TESTLERİ — Ayarlar > Koşu > Kayıt ve Yedekleme > Sonuç saklama (kayıt kuralları, "yalnız başarılı" süzgeci, adım ekran
// görüntüsü seçimi, video boyutu, kademeli saklama). AĞ YOK: raporlayıcı denemesi GEÇİCİ klasörde ayrı bir Playwright süreciyle,
// sayfa içeriği setContent ile (hiçbir adrese gidilmez) koşar; veritabanı ve medya klasörü geçicidir.
//  - Kurallar: seçim → Playwright kipi, medya sınıfı, raporlayıcı süzgeci, inceltme kararı; varsayılanlar bugünkü davranış.
//  - Raporlayıcı: her seçenek için (her / yalnız başarılı / yalnız kalan / kapalı) başarılı ve kalan testte hangi medyanın
//    sonuç deposuna girdiği; atılan medyanın düz metin dosyası da kalmaz.
//  - Kademeli saklama: sahte saatle eski sonuçta görüntü / video silinir (satır "silinme" ile kalır), sonuç ve adımlar durur,
//    kalan testte kalan adımın ve test sonunun görüntüsü korunur; yeni sonuçlara dokunulmaz.
//  - Akış tasarımı: "Ekran görüntüsü al" işareti diyagramdan modele (kosu.ekranGoruntusu) ve geri aynen taşınır.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { acikAnahtar, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, kosuyuBitir, sonucDetayi, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { medyaInceltme, medyaSifrele } from '../../scripts/platform/medya.mjs';
import {
  BASARILI_GORUNTU_ADI, HATA_GORUNTU_ADI, KALAN_ADIM_EKI, adimGoruntusuAlinsinMi, ekAtilsinMi, ekranGoruntusuKipi, inceltmedeSilinsinMi,
  medyaSinifi, senaryoAdimGoruntusuAyikla, videoIzKipi
} from '../../scripts/platform/ayarlar/kayit-kurallari.mjs';
import { KOSU_AYAR_TANIMLARI, kosuAyarlariniKaydet, kosuAyarlariniOku, kosuOrtamDegiskenleri, varsayilanKosuAyarlari } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { adimlardanBloklar, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri, bloklariAyikla } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import {
  adimGoruntusuAyari, ekranGoruntusuAyari, izAyari, kasaKosuAyarlariniYukle, kayitSecimleri, videoAyari, videoBoyutuAyari, videoKaydiAyari
} from '../support/kosu-ayarlari';
import { testSonuGoruntusuAlinsinMi } from '../support/fixtures';
import { AKIS_YOLU, akisModeli } from './model-kosucu-ozellikleri-fikstur';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Serbest = Record<string, any>;
const KOK = resolve(__dirname, '..', '..');
const KAYIT_DEGISKENLERI = ['NOBETCI_VIDEO', 'NOBETCI_EKRAN_GORUNTUSU', 'NOBETCI_IZ', 'NOBETCI_ADIM_GORUNTUSU', 'NOBETCI_VIDEO_BOYUTU', 'TEST_SUNUCU_GORUNUR',
  'NOBETCI_EKRAN_GENISLIGI', 'NOBETCI_EKRAN_YUKSEKLIGI'];

/** Ortam değişkenlerini test sonunda geri yükler; kasadaki ayarları boşaltır. */
function ortamiKoru(): () => void {
  const onceki = { ...process.env };
  for (const k of KAYIT_DEGISKENLERI) delete process.env[k];
  kasaKosuAyarlariniYukle({});
  return () => {
    for (const k of Object.keys(process.env)) if (!(k in onceki)) delete process.env[k];
    Object.assign(process.env, onceki);
    kasaKosuAyarlariniYukle({});
  };
}

test('kayıt kuralları: seçim → Playwright kipi; "yalnız başarılı" yalnız kalan testin medyasını atar; medya sınıfı', () => {
  expect(['her', 'yalnizBasari', 'yalnizHata', 'kapali'].map(videoIzKipi)).toEqual(['on', 'on', 'retain-on-failure', 'off']);
  expect(['her', 'yalnizBasari', 'yalnizHata', 'kapali'].map(ekranGoruntusuKipi)).toEqual(['on', 'on', 'only-on-failure', 'off']);
  expect(medyaSinifi({ ad: 'video', icerikTuru: 'video/webm' })).toBe('video');
  expect(medyaSinifi({ ad: 'trace', icerikTuru: 'application/zip' })).toBe('iz');
  for (const ad of ['screenshot', BASARILI_GORUNTU_ADI, HATA_GORUNTU_ADI]) expect(medyaSinifi({ ad, icerikTuru: 'image/png' })).toBe('testSonu');
  expect(medyaSinifi({ ad: `03 - Toplam hesaplanır${KALAN_ADIM_EKI}`, icerikTuru: 'image/png' })).toBe('kalanAdim');
  expect(medyaSinifi({ ad: '01 - Ekran açıldı', icerikTuru: 'image/png' })).toBe('adim');
  expect(medyaSinifi({ ad: '02 - X (ekran görüntüsü alınamadı: 15 sn süre sınırı doldu)', icerikTuru: 'text/plain' })).toBe('diger');
  const kurallar = { video: 'yalnizBasari', ekranGoruntusu: 'yalnizBasari', iz: 'yalnizHata' };
  expect(ekAtilsinMi({ name: 'video', contentType: 'video/webm' }, kurallar, false)).toBe(true);
  expect(ekAtilsinMi({ name: 'video', contentType: 'video/webm' }, kurallar, true)).toBe(false);
  expect(ekAtilsinMi({ name: HATA_GORUNTU_ADI, contentType: 'image/png' }, kurallar, false)).toBe(true);
  // İz "yalnız kalan"da Playwright zaten doğru kaydeder (süzgeç yok); adım görüntüleri test sonu kuralına bağlı değildir.
  expect(ekAtilsinMi({ name: 'trace', contentType: 'application/zip' }, kurallar, false)).toBe(false);
  expect(ekAtilsinMi({ name: '01 - Ekran açıldı', contentType: 'image/png' }, kurallar, false)).toBe(false);
  // Adım görüntüsü seçimi.
  expect(['her', 'yalnizKalan', 'secili', 'kapali'].map((s) => [adimGoruntusuAlinsinMi(s, {}), adimGoruntusuAlinsinMi(s, { isaretli: true })]))
    .toEqual([[true, true], [false, false], [false, true], [false, false]]);
  expect(senaryoAdimGoruntusuAyikla('ayar')).toEqual({ secim: null, hata: null });
  expect(senaryoAdimGoruntusuAyikla(null)).toEqual({ secim: null, hata: null });
  expect(senaryoAdimGoruntusuAyikla('secili')).toEqual({ secim: 'secili', hata: null });
  expect(senaryoAdimGoruntusuAyikla('bazen').hata).toContain('Adım ekran görüntüsü');
  // Kademeli saklama kararı.
  const k = (secim: string, koru: boolean, sonucBasarili: boolean, sinif: ReturnType<typeof medyaSinifi>, korunanAdim = false) =>
    inceltmedeSilinsinMi({ secim, koru }, { sonucBasarili, sinif, korunanAdim });
  expect([k('kapali', true, true, 'video'), k('basarili', true, true, 'video'), k('basarili', true, false, 'video')]).toEqual([false, true, false]);
  expect([k('hatali', true, false, 'video'), k('hatali', true, false, 'testSonu'), k('hatali', true, false, 'kalanAdim'), k('hatali', true, false, 'adim', true), k('hatali', true, false, 'adim')])
    .toEqual([true, false, false, false, true]);
  expect([k('ikisi', false, false, 'testSonu'), k('ikisi', false, true, 'adim'), k('ikisi', true, true, 'iz'), k('ikisi', true, true, 'diger')]).toEqual([true, true, false, false]);
});

test('varsayılanlar bugünkü davranış; tanımlar; açık / kapalı ayar doğrulanır; alt sürece giden değişkenler', async () => {
  expect(varsayilanKosuAyarlari()).toMatchObject({
    video: 'her', videoBoyutu: 'kucuk', ekranGoruntusu: 'yalnizHata', adimGoruntusu: 'her', iz: 'yalnizHata',
    medyaInceltme: 'kapali', medyaInceltmeGun: 30, medyaInceltmeKoru: true
  });
  const secenek = (a: string) => (KOSU_AYAR_TANIMLARI.find((t) => t.anahtar === a)?.secenekler ?? []).map(([d]) => d);
  for (const a of ['video', 'ekranGoruntusu', 'iz']) expect(secenek(a), a).toEqual(['her', 'yalnizBasari', 'yalnizHata', 'kapali']);
  expect(secenek('adimGoruntusu')).toEqual(['her', 'yalnizKalan', 'secili', 'kapali']);
  expect(secenek('videoBoyutu')).toEqual(['kucuk', 'ekran']);
  expect(secenek('medyaInceltme')).toEqual(['kapali', 'basarili', 'hatali', 'ikisi']);
  expect(KOSU_AYAR_TANIMLARI.find((t) => t.anahtar === 'iz')?.aciklama).toContain('ağ istekleri');
  expect(KOSU_AYAR_TANIMLARI.find((t) => t.anahtar === 'iz')?.aciklama).toContain('iz görüntüleyicisi');
  for (const a of ['medyaInceltme', 'medyaInceltmeGun', 'medyaInceltmeKoru']) {
    expect(KOSU_AYAR_TANIMLARI.find((t) => t.anahtar === a), a).toMatchObject({ bolum: 'yedekleme', grup: 'Sonuç saklama' });
  }
  const g = geciciKlasor('kayit-ayar');
  const vt = await veritabaniniHazirla(join(g.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Kayit-Ayari-1', { kdf: HIZLI_KDF });
    expect(kosuAyarlariniOku(vt)).toEqual(varsayilanKosuAyarlari());
    expect(kosuOrtamDegiskenleri(kosuAyarlariniOku(vt))).toMatchObject({
      NOBETCI_VIDEO: 'her', NOBETCI_EKRAN_GORUNTUSU: 'yalnizHata', NOBETCI_IZ: 'yalnizHata', NOBETCI_ADIM_GORUNTUSU: 'her', NOBETCI_VIDEO_BOYUTU: 'kucuk'
    });
    expect(() => kosuAyarlariniKaydet(vt, { medyaInceltmeKoru: 'evet' })).toThrow('açık / kapalı');
    expect(() => kosuAyarlariniKaydet(vt, { medyaInceltme: 'bazen' })).toThrow('geçersiz seçim');
    expect(() => kosuAyarlariniKaydet(vt, { medyaInceltmeGun: 0 })).toThrow('1–3650');
    expect(kosuAyarlariniKaydet(vt, { video: 'yalnizBasari', adimGoruntusu: 'secili', medyaInceltme: 'hatali', medyaInceltmeKoru: false, videoBoyutu: 'ekran' }))
      .toMatchObject({ video: 'yalnizBasari', adimGoruntusu: 'secili', medyaInceltme: 'hatali', medyaInceltmeKoru: false, videoBoyutu: 'ekran' });
    expect(kosuOrtamDegiskenleri(kosuAyarlariniOku(vt))).toMatchObject({ NOBETCI_VIDEO: 'yalnizBasari', NOBETCI_ADIM_GORUNTUSU: 'secili', NOBETCI_VIDEO_BOYUTU: 'ekran' });
  } finally { vt.kapat(); g.temizle(); }
});

test('koşucu (kosu-ayarlari.ts): varsayılanlar bugünkü davranış; ortam değişkeni > kasa; adım görüntüsünde senaryo seçimi önce; video boyutu config\'e', () => {
  const geriAl = ortamiKoru();
  try {
    // Bugünkü davranış: video yalnız kalan (▷ koşusunda her), test sonu ve iz yalnız kalan, adım görüntüsü her adımda, video küçük.
    expect([videoAyari(), ekranGoruntusuAyari(), izAyari(), adimGoruntusuAyari(), videoBoyutuAyari()]).toEqual(['retain-on-failure', 'only-on-failure', 'retain-on-failure', 'her', 'kucuk']);
    expect(videoKaydiAyari()).toEqual({ mode: 'retain-on-failure' });
    process.env.TEST_SUNUCU_GORUNUR = '1';
    expect(videoKaydiAyari()).toEqual({ mode: 'on' });
    expect(kayitSecimleri()).toEqual({ video: 'her', ekranGoruntusu: 'yalnizHata', iz: 'yalnizHata' });
    // "Yalnız başarılı": Playwright kaydı 'on'; raporlayıcı kalan testinkini atar.
    Object.assign(process.env, { NOBETCI_VIDEO: 'yalnizBasari', NOBETCI_EKRAN_GORUNTUSU: 'yalnizBasari', NOBETCI_IZ: 'yalnizBasari' });
    expect([videoAyari(), ekranGoruntusuAyari(), izAyari()]).toEqual(['on', 'on', 'on']);
    expect(kayitSecimleri()).toEqual({ video: 'yalnizBasari', ekranGoruntusu: 'yalnizBasari', iz: 'yalnizBasari' });
    // Video boyutu "Ekranla aynı": koşu ekran boyutu (Gelişmiş > Tarayıcı).
    Object.assign(process.env, { NOBETCI_VIDEO_BOYUTU: 'ekran', NOBETCI_EKRAN_GENISLIGI: '1600', NOBETCI_EKRAN_YUKSEKLIGI: '900' });
    expect(videoKaydiAyari()).toEqual({ mode: 'on', size: { width: 1600, height: 900 } });
    // Adım görüntüsü: kasadaki kayıtlı ayar (terminal / CI) < ortam değişkeni (Nöbetçi) < senaryonun seçimi.
    kasaKosuAyarlariniYukle({ NOBETCI_ADIM_GORUNTUSU: 'kapali' });
    expect(adimGoruntusuAyari()).toBe('kapali');
    process.env.NOBETCI_ADIM_GORUNTUSU = 'yalnizKalan';
    expect(adimGoruntusuAyari()).toBe('yalnizKalan');
    expect(adimGoruntusuAyari('secili')).toBe('secili');
    expect(adimGoruntusuAyari(null)).toBe('yalnizKalan');
    // Test sonu görüntüsü (fikstür): "yalnız başarılı"da kalan testte alınmaz.
    expect(testSonuGoruntusuAlinsinMi(false, true)).toBe(false);
    expect(testSonuGoruntusuAlinsinMi(true, true)).toBe(true);
  } finally { geriAl(); }
  // playwright.config.ts video kaydını ve raporlayıcı seçimlerini aynı kaynaktan alır.
  const yapilandirma = readFileSync(join(KOK, 'playwright.config.ts'), 'utf8');
  expect(yapilandirma).toContain('video: videoKaydiAyari()');
  expect(yapilandirma).toContain('kayit: kayitSecimleri()');
});

/** Ayrı Playwright süreci: bir geçen, bir kalan test; kayıt seçimleri ortam değişkeniyle. */
async function raporlayiciKosusu(kok: string, secim: string, anahtar: string): Promise<{ kod: number | null; metin: string }> {
  const env: NodeJS.ProcessEnv = {};
  for (const [a, d] of Object.entries(process.env)) if (!/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|KOSU_KIMLIGI|NOBETCI_)/.test(a)) env[a] = d;
  return new Promise<{ kod: number | null; metin: string }>((coz) => {
    const alt = spawn(process.execPath, [join(KOK, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--config', join(kok, 'kayit.config.ts')], {
      cwd: KOK,
      env: {
        ...env, PLATFORM_VERITABANI: join(kok, 'platform.db'), NOBETCI_VERI_KOKU: kok, PLATFORM_KASA_ANAHTARI: anahtar,
        NOBETCI_VIDEO: secim, NOBETCI_EKRAN_GORUNTUSU: secim, NOBETCI_IZ: secim, KOSU_KIMLIGI: `kayit-${secim}`
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let metin = '';
    alt.stdout.on('data', (p: Buffer) => { metin += p.toString(); });
    alt.stderr.on('data', (p: Buffer) => { metin += p.toString(); });
    alt.on('close', (kod) => coz({ kod, metin }));
  });
}

test('raporlayıcı: her seçenekte başarılı ve kalan testin doğru medyası kalır; atılan medya depoya girmez, düz dosyası da kalmaz', async () => {
  test.setTimeout(240_000);
  const g = geciciKlasor('kayit-raporlayici');
  try {
    const vt = await veritabaniniHazirla(join(g.yol, 'platform.db'));
    await kasaOlustur(vt, `Gecici-Kayit-${randomBytes(4).toString('hex')}`, { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Kayıt Deneme' });
    // Koşunun kasa anahtarı (Nöbetçi koşusunda sunucu verir): medya bununla şifrelenir.
    const anahtar = acikAnahtar(vt).toString('base64url');
    vt.kapat();
    const yol = (y: string): string => JSON.stringify(y.replace(/\\/g, '/'));
    mkdirSync(join(g.yol, 'testler'));
    // Sayfa içeriği setContent ile: hiçbir adrese gidilmez.
    writeFileSync(join(g.yol, 'testler', 'kayit.spec.ts'),
      `import { test, expect } from ${yol(join(KOK, 'tests', 'support', 'fixtures'))};\n`
      + `test('geçen', async ({ page }) => { await page.setContent('<h1>Geçen</h1>'); await expect(page.locator('h1')).toHaveText('Geçen'); });\n`
      + `test('kalan', async ({ page }) => { await page.setContent('<h1>Kalan</h1>'); await expect(page.locator('h1')).toHaveText('Başka', { timeout: 500 }); });\n`);
    writeFileSync(join(g.yol, 'kayit.config.ts'),
      `import { ekranGoruntusuAyari, izAyari, kayitSecimleri, videoKaydiAyari } from ${yol(join(KOK, 'tests', 'support', 'kosu-ayarlari'))};\n`
      + `export default { testDir: './testler', outputDir: './cikti', workers: 1, reporter: [['line'], [${yol(join(KOK, 'tests', 'support', 'platform-raporlayici.ts'))}, { projeId: ${JSON.stringify(projeId)}, kayit: kayitSecimleri() }]],\n`
      + `  use: { video: videoKaydiAyari(), screenshot: ekranGoruntusuAyari(), trace: izAyari() } };\n`);
    const beklenen: Record<string, { gecen: boolean; kalan: boolean }> = {
      her: { gecen: true, kalan: true }, yalnizBasari: { gecen: true, kalan: false }, yalnizHata: { gecen: false, kalan: true }, kapali: { gecen: false, kalan: false }
    };
    for (const [secim, b] of Object.entries(beklenen)) {
      const r = await raporlayiciKosusu(g.yol, secim, anahtar);
      expect(r.kod, `${secim}: ${r.metin}`).toBe(1); // kalan test → çıkış kodu 1
      const oku = await veritabaniniHazirla(join(g.yol, 'platform.db'));
      try {
        for (const [baslik, kalmali] of [['geçen', b.gecen], ['kalan', b.kalan]] as const) {
          const s = oku.tek('SELECT id, durum FROM kosu_sonuclari WHERE kosu_id = ? AND senaryo_baslik = ?', [`kayit-${secim}`, baslik]);
          expect(s, `${secim}/${baslik}: sonuç yazıldı`).toBeTruthy();
          expect(String(s?.durum)).toBe(baslik === 'geçen' ? 'basarili' : 'basarisiz');
          const siniflar = oku.tumu('SELECT ad, icerik_turu, tur FROM medya WHERE sonuc_id = ?', [String(s?.id)])
            .map((m) => medyaSinifi({ ad: String(m.ad), icerikTuru: String(m.icerik_turu), tur: String(m.tur) }));
          for (const sinif of ['video', 'iz', 'testSonu'] as const) expect(siniflar.includes(sinif), `${secim}/${baslik}: ${sinif} (${siniflar.join(', ')})`).toBe(kalmali);
        }
      } finally { oku.kapat(); }
      // Şifrelenen ve atılan medyanın düz metin dosyaları bu koşunun çıktı klasöründe kalmaz.
      const kalanDosyalar: string[] = [];
      const gez = (d: string): void => { if (!existsSync(d)) return; for (const a of readdirSync(d)) { const y = join(d, a); if (statSync(y).isDirectory()) gez(y); else kalanDosyalar.push(a); } };
      gez(join(g.yol, 'cikti'));
      expect(kalanDosyalar.filter((a) => /\.(webm|zip|png)$/.test(a)), `${secim}: düz metin medya`).toEqual([]);
    }
  } finally { g.temizle(); }
});

test('kademeli saklama: sahte saatle eski sonuçta görüntü / video silinir, sonuç ve adımlar kalır; kalan testin korunan görüntüleri; yeni sonuç etkilenmez', async () => {
  const g = geciciKlasor('medya-inceltme');
  const vt = await veritabaniniHazirla(join(g.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Inceltme-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'İnceltme' });
    const klasor = join(g.yol, 'medya');
    const ana = randomBytes(32);
    const simdi = Date.UTC(2026, 8, 28, 12);
    const gunOnce = (n: number) => new Date(simdi - n * 86_400_000).toISOString();
    const medyaYaz = async (ad: string, tur: string, icerikTuru: string) => ({ tur, ad, icerikTuru, ...(await medyaSifrele(ana, klasor, Buffer.from(ad))) });
    /** Sonuç: iki adım görüntüsü, kalan adım görüntüsü (verilirse), test sonu, video, iz. */
    const sonuc = async (kosuId: string, baslik: string, durum: 'basarili' | 'basarisiz', kalanAdim: boolean) => sonucKaydet(vt, {
      kosuId, projeId, senaryoBaslik: baslik, durum, testKimligi: `${kosuId}-${baslik}`, hataMesaji: durum === 'basarisiz' ? 'Beklenen / Görülen' : null,
      adimlar: [{ ad: 'Ekran açılır', durum: 'basarili', sureMs: 5 }, { ad: 'Toplam hesaplanır', durum: durum === 'basarili' ? 'basarili' : 'basarisiz', sureMs: 7 }],
      medya: [
        await medyaYaz('01 - Ekran açıldı', 'ekran_goruntusu', 'image/png'),
        await medyaYaz('02 - Bilgiler girildi', 'ekran_goruntusu', 'image/png'),
        ...(kalanAdim ? [await medyaYaz(`03 - Toplam hesaplanır${KALAN_ADIM_EKI}`, 'ekran_goruntusu', 'image/png')] : []),
        await medyaYaz(durum === 'basarili' ? BASARILI_GORUNTU_ADI : HATA_GORUNTU_ADI, 'ekran_goruntusu', 'image/png'),
        await medyaYaz('video', 'video', 'video/webm'),
        await medyaYaz('trace', 'iz', 'application/zip')
      ]
    });
    for (const [id, gun] of [['eski', 40], ['yeni', 2]] as const) kosuKaydet(vt, { id, projeId, tur: 'tam', baslangic: gunOnce(gun) });
    const eskiGecen = (await sonuc('eski', 'geçen', 'basarili', false)).id;
    const eskiKalan = (await sonuc('eski', 'kalan', 'basarisiz', true)).id;
    const eskiKalanSon = (await sonuc('eski', 'kalan-son-adim', 'basarisiz', false)).id;
    const yeniGecen = (await sonuc('yeni', 'geçen', 'basarili', false)).id;
    for (const id of ['eski', 'yeni']) kosuyuBitir(vt, id, { durum: 'tamamlandi' });
    const durum = (id: string) => Object.fromEntries((sonucDetayi(vt, id)?.medya ?? []).map((m) => [m.ad, m.silinme ? 'silindi' : 'var']));
    const dosyaVar = (id: string, ad: string) => {
      const d = vt.tek('SELECT dosya FROM medya WHERE sonuc_id = ? AND ad = ?', [id, ad]);
      return existsSync(join(klasor, String(d?.dosya)));
    };

    // Kapalı (varsayılan): hiçbir şey silinmez.
    expect(medyaInceltme(vt, klasor, { secim: 'kapali', gun: 30, koru: true, simdi })).toEqual({ silinenGoruntu: 0, silinenVideo: 0, sonuc: 0 });
    // Başarılı testler: eski başarılının görüntüleri ve videosu; iz kalır; yeni sonuç ve kalan testler etkilenmez.
    expect(medyaInceltme(vt, klasor, { secim: 'basarili', gun: 30, koru: true, simdi })).toEqual({ silinenGoruntu: 3, silinenVideo: 1, sonuc: 1 });
    expect(durum(eskiGecen)).toEqual({ '01 - Ekran açıldı': 'silindi', '02 - Bilgiler girildi': 'silindi', [BASARILI_GORUNTU_ADI]: 'silindi', video: 'silindi', trace: 'var' });
    expect(dosyaVar(eskiGecen, 'video')).toBe(false);
    expect(dosyaVar(eskiGecen, 'trace')).toBe(true);
    expect(Object.values(durum(yeniGecen)).every((d) => d === 'var')).toBe(true);
    // Sonucun kendisi kalır.
    expect(sonucDetayi(vt, eskiGecen)).toMatchObject({ durum: 'basarili', adimlar: [{ ad: 'Ekran açılır' }, { ad: 'Toplam hesaplanır' }] });
    // Kalan testler + koru: kalan adımın görüntüsü (yoksa son adım görüntüsü) ve test sonu kalır; diğerleri ve video silinir.
    expect(medyaInceltme(vt, klasor, { secim: 'hatali', gun: 30, koru: true, simdi })).toMatchObject({ silinenVideo: 2, sonuc: 2 });
    expect(durum(eskiKalan)).toEqual({
      '01 - Ekran açıldı': 'silindi', '02 - Bilgiler girildi': 'silindi', [`03 - Toplam hesaplanır${KALAN_ADIM_EKI}`]: 'var', [HATA_GORUNTU_ADI]: 'var', video: 'silindi', trace: 'var'
    });
    expect(durum(eskiKalanSon)).toEqual({ '01 - Ekran açıldı': 'silindi', '02 - Bilgiler girildi': 'var', [HATA_GORUNTU_ADI]: 'var', video: 'silindi', trace: 'var' });
    expect(sonucDetayi(vt, eskiKalan)).toMatchObject({ durum: 'basarisiz', hataMesaji: 'Beklenen / Görülen' });
    // Koru kapalıyken ikisi de: kalan korunanlar da gider; yeni (2 gün) yine etkilenmez; 1 gün eşiğinde yeni de inceltilir.
    expect(medyaInceltme(vt, klasor, { secim: 'ikisi', gun: 30, koru: false, simdi })).toMatchObject({ silinenGoruntu: 4, silinenVideo: 0 });
    expect(Object.entries(durum(eskiKalan)).filter(([ad]) => ad !== 'trace').every(([, d]) => d === 'silindi')).toBe(true);
    expect(Object.values(durum(yeniGecen)).every((d) => d === 'var')).toBe(true);
    expect(medyaInceltme(vt, klasor, { secim: 'ikisi', gun: 1, koru: false, simdi })).toMatchObject({ silinenGoruntu: 3, silinenVideo: 1, sonuc: 1 });
    // Silinen satırların dosyaları gerçekten yok; iz dosyaları duruyor.
    for (const m of vt.tumu('SELECT dosya, silinme, tur FROM medya')) expect(existsSync(join(klasor, String(m.dosya))), String(m.tur)).toBe(m.silinme == null);
  } finally { vt.kapat(); g.temizle(); }
});

test('akış tasarımı: "Ekran görüntüsü al" işareti bloktan modele (kosu.ekranGoruntusu) ve geri aynen taşınır; paket doğrulamadan geçer', () => {
  const model = akisModeli() as Serbest;
  const hedef = (model.adimlar as Serbest[]).find((a) => a.kosu && Array.isArray(a.kosu.aksiyonlar) && a.kosu.aksiyonlar.some((x: Serbest) => x.tur === 'tikla')) as Serbest;
  expect(hedef).toBeTruthy();
  hedef.kosu.ekranGoruntusu = true;
  const env = modeldenAkisEnvanteri(model);
  const bloklar = adimlardanBloklar(model, model.adimlar, env) as Serbest[];
  const isaretli = bloklar.filter((b) => b.ekranGoruntusu === true);
  expect(isaretli).toHaveLength(1);
  expect(isaretli[0]).toMatchObject({ tur: 'alanlar', ad: hedef.baslik });
  // Biçim: yalnız true taşınır.
  expect(bloklariAyikla([{ tur: 'alanlar', ad: 'A', alanlar: [], zorunlu: [], ekranGoruntusu: 'evet' }]).bloklar[0]).not.toHaveProperty('ekranGoruntusu');
  const ayik = bloklariAyikla(bloklar as Parameters<typeof bloklariAyikla>[0]);
  const c = akistanKayitEnvanteri(env, ayik.bloklar);
  expect([...ayik.hatalar, ...c.hatalar]).toEqual([]);
  const { paket } = kayitPaketiOlustur({
    ekranAnahtari: 'basvuru-akis', ekranAdi: 'Başvuru (akış)', urlYolu: AKIS_YOLU, girisGerekli: false, girissiz: true, ikiAsamali: 'bilinmiyor', baglamTuru: null, mevcutModel: model
  }, c.envanter as NonNullable<typeof c.envanter>);
  expect(sayfaPaketiniDogrula(paket, {})).toMatchObject({ gecerli: true, hatalar: [] });
  const yeni = paket.model as Serbest;
  expect((yeni.adimlar as Serbest[]).filter((a) => a.kosu?.ekranGoruntusu === true).map((a) => a.id)).toEqual([hedef.id]);
  // Aksiyon bloğundaki işaret de adımın sonuna (ilerleme düğmesinin parçası) yazılır.
  const aksiyonlu = bloklar.map((b): Serbest => { const { ekranGoruntusu: _, ...kalan } = b; return b.tur === 'aksiyon' && !b.istegeBagli ? { ...kalan, ekranGoruntusu: true } : kalan; });
  const c2 = akistanKayitEnvanteri(env, bloklariAyikla(aksiyonlu as Parameters<typeof bloklariAyikla>[0]).bloklar);
  expect(c2.hatalar).toEqual([]);
  const yeni2 = kayitPaketiOlustur({
    ekranAnahtari: 'basvuru-akis', ekranAdi: 'Başvuru (akış)', urlYolu: AKIS_YOLU, girisGerekli: false, girissiz: true, ikiAsamali: 'bilinmiyor', baglamTuru: null, mevcutModel: model
  }, c2.envanter as NonNullable<typeof c2.envanter>).paket.model as Serbest;
  expect((yeni2.adimlar as Serbest[]).some((a) => a.kosu?.ekranGoruntusu === true && (a.kosu.aksiyonlar ?? []).some((x: Serbest) => x.tur === 'tikla'))).toBe(true);
  // Model doğrulayıcı: yalnız boolean.
  const bozuk = akisModeli() as Serbest;
  (bozuk.adimlar as Serbest[]).find((a) => a.kosu)!.kosu.ekranGoruntusu = 'evet';
  expect(JSON.stringify(sayfaPaketiniDogrula({ ...paket, model: bozuk }, {}).hatalar)).toContain('ekranGoruntusu');
});
