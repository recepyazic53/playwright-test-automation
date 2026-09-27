// ENTEGRASYON (yerel) — Nöbetçi arayüzü: Ayarlar > Giriş profilleri > "Giriş tarifi" ve koşu panelindeki elle
// SMS kodu formu. Geçici bir veritabanı (depo işlevleriyle kurulan nötr örnek proje) ile AYRI bir Nöbetçi sunucusu
// örneği boş bir portta başlatılır (TEST_SUNUCU_KOSU_KAPALI=1: hiçbir test koşusu başlatamaz; kendi log
// dosyası). TEST ortamının taban adresi 127.0.0.1'deki SAHTE giriş sayfalarıdır (giris-fikstur.ts > girisSayfalari):
// "Varsayılanları öner" yalnızca ona gider. CANLI ortamın adresi .invalid'dir ve hiç istek almaz. Arayüz sayfasının
// ve sunucunun tüm istekleri 127.0.0.1'dedir.
// GIRIS_EKRAN_KLASORU verilirse tarif formunun ve kod formunun koyu/açık tema ekran görüntüleri oraya yazılır.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { girisTarifiKaydet } from '../../scripts/platform/giris/tarif-deposu.mjs';
import {
  baglamProfiliKaydet, ekranKaydet, ekranModeliEkle, girisProfiliKaydet, ortamKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { girisSayfalari, korumaliTarayici, yerelSunucu, SIRKET_DESENI } from './giris-fikstur';
import { ornekBasvuruModeli, ornekGirisTarifi } from './model-fikstur';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const EKRAN_KLASORU = process.env.GIRIS_EKRAN_KLASORU;
/** Giriş profilinin SAHTE parolası (tarif listesinde görünmemeli). */
const SAHTE_PAROLA = 'Ornek-Arayuz-Parolasi-7';
const SENARYO_BASLIGI = 'Elle kodlu başvuru';

function bosPort(): Promise<number> {
  return new Promise((coz, reddet) => {
    const s = createServer();
    s.once('error', reddet);
    s.listen(0, '127.0.0.1', () => {
      const adres = s.address();
      const port = typeof adres === 'object' && adres ? adres.port : 0;
      s.close(() => coz(port));
    });
  });
}

type Nobetci = { adres: string; token: string; surec: ChildProcess; cikti: string[] };

async function nobetciBaslat(klasor: string, vtYolu: string): Promise<Nobetci> {
  const port = await bosPort();
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_)/.test(k)) continue;
    env[k] = v;
  }
  const surec = spawn(process.execPath, [join(KOK, 'scripts', 'test-sunucu.mjs')], {
    cwd: KOK,
    env: {
      ...env, TEST_SUNUCU_PORT: String(port), TEST_SUNUCU_KOSU_KAPALI: '1', PLATFORM_VERITABANI: vtYolu,
      PLATFORM_YEDEK_KLASORU: join(klasor, 'yedekler'), TEST_SUNUCU_LOG_DOSYASI: join(klasor, 'sunucu.log')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const cikti: string[] = [];
  await new Promise<void>((coz, reddet) => {
    const zaman = setTimeout(() => reddet(new Error(`Nöbetçi başlamadı:\n${cikti.join('')}`)), 20_000);
    const dinle = (p: Buffer): void => {
      cikti.push(p.toString('utf8'));
      if (cikti.join('').includes('Nöbetçi hazır')) { clearTimeout(zaman); coz(); }
    };
    surec.stdout?.on('data', dinle);
    surec.stderr?.on('data', dinle);
    surec.once('exit', (kod) => { clearTimeout(zaman); reddet(new Error(`Nöbetçi kapandı (${kod}):\n${cikti.join('')}`)); });
  });
  const adres = `http://127.0.0.1:${port}`;
  const html = await (await fetch(`${adres}/`)).text();
  const token = /name="oturum-tokeni" content="([^"]+)"/.exec(html)?.[1] ?? '';
  expect(token, 'oturum token').not.toBe('');
  return { adres, token, surec, cikti };
}

async function api(n: Nobetci, yol: string, govde?: Record<string, unknown>): Promise<Record<string, unknown> & { basarili?: boolean; mesaj?: string }> {
  const r = await fetch(`${n.adres}${yol}`, govde
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: n.token }) }
    : { headers: { 'x-test-sunucu-token': n.token } });
  return (await r.json()) as Record<string, unknown>;
}

let tarayici: Browser;
let nobetci: Nobetci;
let site: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor: ReturnType<typeof geciciKlasor>;
let projeId = '';

test.describe.configure({ mode: 'serial' });

/**
 * Nötr örnek proje: TEST (sahte giriş sayfaları; tarif: klasik form + SMS elle + şube bağlam adımları), CANLI (.invalid;
 * kayıtlı TOTP tarifi), şube bağlam profili, giriş profili ve ekran modeliyle bir model senaryosu (koşu paneli için).
 */
test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = geciciKlasor('giris-arayuz');
  site = await yerelSunucu(girisSayfalari());
  const vtYolu = join(klasor.yol, 'platform.db');
  const parola = randomBytes(18).toString('base64url');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
  projeId = projeKaydet(vt, { ad: 'Örnek proje' });
  const testId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: site.adres, varsayilan: true });
  const canliId = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'https://canli.ornek.invalid' });
  girisTarifiKaydet(vt, projeId, testId, {
    ...ornekGirisTarifi(), girisAdresi: '/klasik', oturumKontrolAdresi: '/ana',
    kullaniciAlani: '#eski-kullanici', parolaAlani: '#eski-parola', gonderDugmesi: '#eski-gonder',
    ikinciAdim: { tur: 'sms', smsKipi: 'elle', kodAlani: '#kod', gonderDugmesi: '#dogrula' }
  });
  girisTarifiKaydet(vt, projeId, canliId, ornekGirisTarifi());
  baglamProfiliKaydet(vt, { projeId, tur: 'Şube', ad: 'Merkez', alanlar: { subeKodu: 'S01' }, ortamId: null });
  girisProfiliKaydet(vt, { projeId, ortamId: null, ad: 'Ortak giriş', kullaniciAdi: 'kullanici', parola: SAHTE_PAROLA, ikiAsamaliTur: 'sms', smsAyari: { yontem: 'elle' } });
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'ornek-basvuru', ad: 'Örnek Başvuru' });
  ekranModeliEkle(vt, { ekranId, model: ornekBasvuruModeli() });
  senaryoKaydet(vt, { projeId, ekranId, baslik: SENARYO_BASLIGI, icerik: { kosucu: 'model', ortamlar: { [testId]: { veri: { baslik: SENARYO_BASLIGI, urun: 'A' } } } } });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor.yol, vtYolu);
  expect((await api(nobetci, '/platform/kasa/ac', { parola })).basarili).toBe(true);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  await site?.kapat();
  klasor?.temizle();
});

async function arayuz(renk: 'dark' | 'light' = 'dark'): Promise<{ page: Page; istekler: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, colorScheme: renk, viewport: { width: 1360, height: 1000 } });
  const istekler: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  return { page: await baglam.newPage(), istekler };
}

function agKontrol(istekler: string[]): void {
  expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
}

async function ekranGoruntusu(page: Page, ad: string, hedef = page.locator('main')): Promise<void> {
  if (!EKRAN_KLASORU) return;
  mkdirSync(EKRAN_KLASORU, { recursive: true });
  // Uzun öğeler kaydırmadan tek karede: görüntü alanı geçici olarak öğe boyuna uzatılır (yapışkan üst çubuk
  // kaydırılmış görüntülerin ortasına binmesin diye).
  const eski = page.viewportSize() ?? { width: 1360, height: 1000 };
  const kutu = await hedef.boundingBox();
  if (kutu) await page.setViewportSize({ width: eski.width, height: Math.min(8000, Math.max(eski.height, Math.ceil(kutu.height) + 220)) });
  await hedef.scrollIntoViewIfNeeded();
  for (const renk of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: renk });
    await page.waitForTimeout(150);
    await hedef.screenshot({ path: join(EKRAN_KLASORU, `${ad}-${renk === 'dark' ? 'koyu' : 'acik'}.png`), animations: 'disabled' });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize(eski);
}

test('API: tarif listesi, doğrulama hataları, kaydet/sıfırla; elle kod uçları token ister', async () => {
  type Liste = { ortamlar: Array<{ ortamId: string; ortamAd: string; kaynak: string; tarif: { kullaniciAlani: string } | null }>; baglamTurleri: Array<{ tur: string; alanlar: string[] }> };
  const liste = await api(nobetci, `/platform/giris-tarifleri?projeId=${projeId}`) as unknown as Liste;
  expect(liste.ortamlar.map((o) => [o.ortamAd, o.kaynak]).sort()).toEqual([['CANLI', 'kayitli'], ['TEST', 'kayitli']]);
  expect(liste.ortamlar.every((o) => !('varsayilanVar' in o))).toBe(true); // proje varsayılanı kavramı yok
  expect(liste.baglamTurleri.find((t) => t.tur === 'Şube')?.alanlar).toEqual(['subeKodu']);
  expect(JSON.stringify(liste)).not.toContain(SAHTE_PAROLA); // tarifte gizli değer yok
  const dogrula = await api(nobetci, '/platform/giris-tarifi/dogrula', { tarif: { kullaniciAlani: '' } }) as { gecerli: boolean; hatalar: string[] };
  expect(dogrula.gecerli).toBe(false);
  expect(dogrula.hatalar.join(' ')).toMatch(/Kullanıcı adı alanı boş olamaz/);
  const ortamId = liste.ortamlar.find((o) => o.ortamAd === 'CANLI')?.ortamId;
  const hatali = await api(nobetci, '/platform/giris-tarifi/kaydet', { projeId, ortamId, tarif: { kullaniciAlani: '#a' } });
  expect(hatali.basarili).toBe(false);
  expect(hatali.mesaj).toMatch(/Giriş tarifi kaydedilemedi/);
  const sifir = await api(nobetci, '/platform/giris-tarifi/sifirla', { projeId, ortamId }) as { kaldirildi: boolean; tarif: { kaynak: string; tarif: unknown } };
  expect(sifir).toMatchObject({ kaldirildi: true, tarif: { kaynak: 'yok', tarif: null } });
  // Elle kod uçları: token yoksa 401, koşu yoksa bekleyen istek yok / 404.
  expect((await fetch(`${nobetci.adres}/kod-istegi?kosuId=x`)).status).toBe(401);
  expect(await api(nobetci, `/kod-istegi?kosuId=yok&token=${nobetci.token}`)).toMatchObject({ basarili: true, bekliyor: false });
  const gonder = await fetch(`${nobetci.adres}/kod-gonder`, { method: 'POST', body: JSON.stringify({ token: nobetci.token, kosuId: 'yok', kod: '123456' }) });
  expect(gonder.status).toBe(404);
});

test('Ayarlar > Giriş tarifi: "Varsayılanları öner" yalnızca onayla ve yalnızca ortam adresine gider; kayıt adımları korur', async () => {
  test.setTimeout(90_000);
  const { page, istekler } = await arayuz();
  await page.goto('/#/ayarlar/giris');
  const bolum = page.locator('.giris-tarifi-bolumu');
  await expect(bolum.locator('h3')).toContainText('Giriş tarifi');
  await expect(bolum.locator('li[data-ortam]')).toHaveCount(2);
  // CANLI önceki testte sıfırlandı: "Tanımlı değil" (proje varsayılanına dönüş yok).
  await expect(bolum.locator('li[data-ortam]').filter({ hasText: 'CANLI' })).toContainText('Tanımlı değil');
  await expect(bolum.locator('li[data-ortam]').filter({ hasText: 'TEST' })).toContainText('Kaydedilmiş');
  await expect(bolum.getByText(/Proje varsayılanı/)).toHaveCount(0);
  await ekranGoruntusu(page, '01-giris-profilleri-tarif-listesi');

  const onceki = (await api(nobetci, `/platform/giris-tarifleri?projeId=${projeId}`) as { ortamlar: Array<{ ortamAd: string; tarif: Record<string, unknown> }> }).ortamlar.find((o) => o.ortamAd === 'TEST')?.tarif;
  await bolum.getByRole('button', { name: 'TEST: giriş tarifini düzenle' }).click();
  const form = page.locator('form.tarif-formu');
  await expect(form.getByRole('heading', { name: 'Giriş tarifi: TEST' })).toBeVisible();
  await expect(form.getByLabel('Kullanıcı adı alanı')).toHaveValue('#eski-kullanici');
  await expect(form.getByRole('button', { name: /Proje varsayılanına dön/ })).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Kayıtlı tarifi sil' })).toBeVisible();

  // Vazgeç → hiçbir istek gitmez.
  await form.getByRole('button', { name: 'Varsayılanları öner' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click();
  expect(site.istekler).toEqual([]);

  await form.getByRole('button', { name: 'Varsayılanları öner' }).click();
  const diyalog = page.getByRole('dialog');
  await expect(diyalog).toContainText(`${site.adres}/klasik adresini bu bilgisayarda görünmez bir tarayıcıda açıp`);
  await ekranGoruntusu(page, '02-oner-onay-penceresi', diyalog);
  await diyalog.getByRole('button', { name: 'Sayfayı aç ve öner' }).click();
  await expect(form.getByText('Öneriler alanlara yazıldı')).toBeVisible({ timeout: 30_000 });
  await expect(form.getByLabel('Kullanıcı adı alanı')).toHaveValue('#eposta');
  await expect(form.getByLabel('Parola alanı')).toHaveValue('#parola');
  const onerilenGonder = await form.getByLabel('Giriş düğmesi').inputValue();
  expect(onerilenGonder).not.toBe('#eski-gonder');
  // Sahte site yalnızca sayfayı sundu: form doldurulmadı, gönderilmedi.
  expect(site.istekler.filter((i) => i !== 'GET /favicon.ico')).toEqual(['GET /klasik']);

  // İkinci adım (SMS, elle) ve bağlam adımları formda.
  await expect(form.getByRole('radio', { name: /^SMS/ })).toBeChecked();
  await expect(form.getByRole('radio', { name: 'Koşu sırasında elle girilir' })).toBeChecked();
  await expect(form.getByText('Elle kipi:')).toBeVisible();
  await ekranGoruntusu(page, '03-giris-tarifi-formu', form);
  await expect(form.getByText(/^Adımlar \(4\)$/)).toBeVisible(); // 6 ya da daha az adım: kutu açık gelir
  await expect(form.locator('.tarif-adim')).toHaveCount(4);
  await expect(form.locator('.tarif-adim').first()).toBeVisible();
  await expect(form.locator('.yer-tutucu-cipleri code')).toContainText(['{subeKodu}']);
  await ekranGoruntusu(page, '04-baglam-adimlari', form.locator('fieldset').last());

  await form.getByRole('button', { name: 'Tarifi kaydet' }).click();
  await expect(page.getByText('Giriş tarifi kaydedildi.')).toBeVisible();
  const sonraki = (await api(nobetci, `/platform/giris-tarifleri?projeId=${projeId}`) as { ortamlar: Array<{ ortamAd: string; kaynak: string; tarif: Record<string, unknown> }> }).ortamlar.find((o) => o.ortamAd === 'TEST');
  expect(sonraki?.kaynak).toBe('kayitli');
  // Yalnızca önerilen üç seçici değişti; ikinci adım, bağlam adımları ve göstergeler arayüzden gidip gelince aynı kaldı.
  expect(sonraki?.tarif).toEqual({ ...onceki, kullaniciAlani: '#eposta', parolaAlani: '#parola', gonderDugmesi: onerilenGonder });
  agKontrol(istekler);
});

test('Ekranlar > Ortak akışlar: her ortamın girişi okunur adımlarla görünür; Düzenle ilgili tarif formunu açar', async () => {
  test.setTimeout(60_000);
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar');
  const kart = page.locator('.giris-akisi-karti[data-ortam]').filter({ hasText: 'Giriş (TEST)' });
  await expect(kart).toBeVisible();
  await expect(kart.locator('.giris-ozet-adimlari li').first()).toHaveText('Kullanıcı adını yaz');
  await expect(kart).toContainText('SMS kodu gir (koşuda elle)');
  await expect(page.locator('.yan-panel a.giris-akisi-baglantisi').filter({ hasText: 'Giriş (CANLI)' })).toBeVisible();
  await kart.getByRole('link', { name: 'Giriş (TEST): düzenle' }).click();
  const form = page.locator('form.tarif-formu');
  await expect(form.getByRole('heading', { name: 'Giriş tarifi: TEST' })).toBeVisible();
  await expect(form.locator('.giris-ozet li')).toContainText(['Kullanıcı adını yaz', 'Parolayı yaz']);
  // Varsayılan sırada düzenleyici kapalı gelir; açılıp adım eklenince okunur özet hemen güncellenir (kaydetmeden).
  await form.getByText('Adımları düzenle (3)').click();
  await form.getByRole('button', { name: 'Giriş adımı ekle' }).click();
  await expect(form.locator('.giris-adimi')).toHaveCount(4);
  await expect(form.getByText('Adımları düzenle (4)')).toBeVisible();
  agKontrol(istekler);
});

test('Koşu paneli: SMS kodu elle istenince kod formu açılır ve kod koşuya iletilir', async () => {
  test.setTimeout(60_000);
  const { page, istekler } = await arayuz();
  // Koşu başlatılamaz (KOSU_KAPALI); paneli göstermek için yalnızca bu uçlar sayfa içinde taklit edilir.
  let gonderilen: Record<string, unknown> | null = null;
  await page.route('**/platform/senaryolar/calistir', () => { /* yanıt verilmez: satır "çalışıyor" kalır */ });
  await page.route('**/kod-istegi?**', (r) => r.fulfill({ json: { basarili: true, bekliyor: !gonderilen, mesaj: 'SMS ile gelen doğrulama kodunu girin', kalanSn: 174 } }));
  await page.route('**/kod-gonder', (r) => { gonderilen = r.request().postDataJSON() as Record<string, unknown>; return r.fulfill({ json: { basarili: true, mesaj: 'Kod iletildi.' } }); });
  await page.route('**/canli?**', (r) => r.fulfill({ status: 404, json: { basarili: false } }));
  await page.goto('/#/senaryolar');
  await page.getByRole('button', { name: /^Çalıştır: / }).first().click();
  const panel = page.getByRole('region', { name: 'Canlı koşu paneli' });
  const kodFormu = panel.locator('form.kod-istemi');
  await expect(kodFormu).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText('Kod bekleniyor')).toBeVisible();
  await kodFormu.getByLabel('Doğrulama kodu').fill('12 34');
  await kodFormu.getByRole('button', { name: 'Kodu gönder' }).click();
  await expect(kodFormu.getByRole('alert')).toHaveText(/harf ve rakam/);
  await kodFormu.getByLabel('Doğrulama kodu').fill('482913');
  await ekranGoruntusu(page, '05-kosu-paneli-elle-kod', panel);
  await kodFormu.getByRole('button', { name: 'Kodu gönder' }).click();
  await expect(page.getByText('Doğrulama kodu koşuya iletildi.')).toBeVisible();
  await expect(kodFormu).toHaveCount(0);
  expect(gonderilen).toMatchObject({ kod: '482913', kosuId: expect.any(String), token: nobetci.token });
  agKontrol(istekler);
});
