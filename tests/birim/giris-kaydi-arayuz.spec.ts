// UÇTAN UCA (yerel) — Ayarlar > Giriş tarifi > "Girişi kaydet": tarif yokken önerilen yol birincil düğmedir; kullanıcı girişi
// kayıt tarayıcısında KENDİSİ yapar (kullanıcı adı, parola, doğrulama kodu), Nöbetçi TEK onay ekranında adımların rolünü
// önerilmiş getirir, yalnız kodun kaynağını sorar, başarı göstergesini giriş sonrası sayfadan çıkarır ve tarifi formu açmadan
// kaydeder. Ardından giriş profili için gerekenler listelenir. Kaydedilen tarifle gerçek giriş (koşucunun giriş motoru) başarılı.
//
// Güvenlik: yalnızca 127.0.0.1'deki örnek uygulama (NOBETCI_TARAMA_IZINLI_KOKENLER; DNS kapalı); geçici veritabanı, ayrı Nöbetçi.
// Gizlilik: kayıtta yazılan değerler (parola, kod) tarife/loga düşmez.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { girisYap } from '../support/giris-motoru';
import { totpKoduUret } from '../support/totp';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi } from './model-fikstur';
import { bosPort, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Giris-${randomBytes(6).toString('hex')}`;

let nobetci: Nobetci;
let uygulama: OrnekBasvuruUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let tarayici: Browser;
let klasor = '';
let cdpPortu = 0;
let projeId = '';
let ortamId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''}`).toBe(true);
  return y;
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'giris-kaydi-'));
  uygulama = new OrnekBasvuruUygulamasi({ totp: true });
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  cdpPortu = await bosPort();
  nobetci = await nobetciBaslat(klasor, vtYolu, {
    NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_KAYIT_CDP_PORTU: String(cdpPortu), NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '240'
  });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Giriş Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

/** Kayıt tarayıcısına bağlanır; panelin açıldığı giriş sayfasını bulur. */
async function kayitSayfasi(): Promise<{ kayit: Browser; sayfa: Page }> {
  const son = Date.now() + 60_000;
  let kayit: Browser | null = null;
  while (!kayit) {
    try { kayit = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPortu}`); } catch {
      if (Date.now() > son) throw new Error('kayıt tarayıcısına bağlanılamadı');
      await new Promise((c) => setTimeout(c, 250));
    }
  }
  for (;;) {
    const sayfa = kayit.contexts().flatMap((b) => b.pages()).find((p) => p.url().startsWith(fikstur.adres));
    if (sayfa && (await sayfa.locator('#nobetci-kayit-paneli').count())) return { kayit, sayfa };
    if (Date.now() > son) throw new Error('kayıt sayfası açılmadı');
    await new Promise((c) => setTimeout(c, 250));
  }
}

test('"Girişi kaydet": tek onay ekranı, yalnız kod kaynağı sorulur, tarif formu açılmadan kaydedilir ve giriş çalışır', async () => {
  test.setTimeout(180_000);
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 1000 } });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/giris');
  const bolum = page.locator('.giris-tarifi-bolumu');
  const satir = bolum.locator('li[data-ortam]').filter({ hasText: 'Deneme' });
  await expect(satir).toContainText('Tanımlı değil');
  // Tarif yokken önerilen yol birincil; elle tanımlama ikincil.
  const kaydetDugmesi = satir.getByRole('button', { name: 'Deneme: girişi kaydet' });
  await expect(kaydetDugmesi).toHaveClass(/birincil/);
  await expect(satir.getByRole('button', { name: 'Deneme: giriş tarifi ekle' })).toHaveText('Elle tanımla');
  await kaydetDugmesi.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tarayıcıyı aç' }).click();

  const { kayit, sayfa } = await kayitSayfasi();
  try {
    await sayfa.fill('#kullanici', ORNEK_KULLANICI);
    await sayfa.fill('#parola', ORNEK_PAROLA);
    await sayfa.click('#gir');
    await sayfa.waitForURL(/\/dogrulama/);
    await sayfa.fill('#kod', totpKoduUret(ORNEK_TOTP_ANAHTARI));
    await sayfa.click('#dogrula');
    await expect(sayfa.getByRole('heading', { name: 'Hoş geldiniz' })).toBeVisible();
    // Giriş sonrası sayfada görünen çıkış bağlantısı başarı göstergesi önerisi olur.
    await sayfa.evaluate(() => document.querySelector('nav')?.insertAdjacentHTML('beforeend', ' · <a href="#">Çıkış</a>'));
    const panel = sayfa.locator('#nobetci-kayit-paneli');
    await panel.getByRole('button', { name: 'Bitir', exact: true }).click();
    await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
  } finally {
    await kayit.close().catch(() => undefined);
  }

  // Onay ekranı: roller önerilmiş, kod kaynağı sorusu görünür, başarı göstergesi kayıttan.
  const kutu = page.getByRole('region', { name: 'Giriş kaydı: Deneme' });
  await expect(kutu.getByText('Nöbetçi girişi böyle anladı')).toBeVisible({ timeout: 60_000 });
  await expect(kutu.getByRole('combobox', { name: 'Kayıt adımı 1: ne?' })).toHaveValue('kullaniciAdi');
  await expect(kutu.getByRole('combobox', { name: 'Kayıt adımı 2: ne?' })).toHaveValue('parola');
  await expect(kutu.getByRole('combobox', { name: 'Kayıt adımı 3: ne?' })).toHaveValue('gonder');
  await expect(kutu.getByRole('combobox', { name: 'Kayıt adımı 4: ne?' })).toHaveValue('kod');
  await expect(kutu.getByRole('combobox', { name: 'Kayıt adımı 5: ne?' })).toHaveValue('kodGonder');
  const kodSorusu = kutu.getByRole('radiogroup', { name: 'Doğrulama kodunun kaynağı' });
  await expect(kodSorusu).toBeVisible();
  await expect(kodSorusu.getByLabel(/Authenticator uygulaması/)).toBeChecked();
  await expect(kutu.getByText('Giriş başarılı sayılacak: ekranda “Çıkış” yazısı görününce.')).toBeVisible();
  await expect(kutu.getByLabel('Girişten sonra ekranda görünen bir yazı')).toBeHidden();
  // Rol değişince önizleme yenilenir: kod "tarife alma" yapılırsa soru kaybolur; geri alınınca döner.
  await kutu.getByRole('combobox', { name: 'Kayıt adımı 4: ne?' }).selectOption('yoksay');
  await expect(kodSorusu).toBeHidden();
  await kutu.getByRole('combobox', { name: 'Kayıt adımı 4: ne?' }).selectOption('kod');
  await expect(kodSorusu).toBeVisible();

  const kaydet = kutu.getByRole('button', { name: 'Doğru, kaydet' });
  await expect(kaydet).toBeEnabled();
  await kaydet.click();
  await expect(kutu.getByText('Deneme girişi kaydedildi.')).toBeVisible();
  await expect(kutu.getByRole('listitem')).toHaveText(['Kullanıcı adı ve parola', 'Authenticator gizli anahtarı']);
  await expect(satir).toContainText('Kaydedilmiş');
  await expect(satir.getByRole('button', { name: 'Deneme: girişi kaydet' })).toHaveText('Yeniden kaydet');
  await expect(page.locator('form.tarif-formu')).toHaveCount(0);

  const tarif = ((await api(`/platform/giris-tarifleri?projeId=${projeId}`)).ortamlar as Nesne[]).find((o) => o.ortamId === ortamId)?.tarif as Nesne;
  expect(tarif).toMatchObject({
    girisAdresi: '/', oturumKontrolAdresi: '/panel', kullaniciAlani: '#kullanici', parolaAlani: '#parola', gonderDugmesi: '#gir',
    basariGostergesi: { tur: 'metin', deger: 'Çıkış' }, ikinciAdim: { tur: 'totp', kodAlani: '#kod', gonderDugmesi: '#dogrula' }
  });
  // Gizlilik: yazılan değerler tarifte ve logda yok.
  const metin = JSON.stringify(tarif) + readFileSync(join(klasor, 'sunucu.log'), 'utf8');
  expect(metin).not.toContain(ORNEK_PAROLA);

  // Kaydedilen tarif gerçek girişte çalışır (başarı göstergesi olarak çıkış bağlantısı yerine adres beklenir: fikstürde bağlantı yok).
  const giris = await tarayici.newContext({ baseURL: fikstur.adres });
  try {
    const p = await giris.newPage();
    await girisYap(p, { ...tarif, basariGostergesi: { tur: 'url', deger: '/panel' } } as never,
      { kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, totpGizli: ORNEK_TOTP_ANAHTARI, sabitKod: null, smsKipi: null });
    await expect(p.getByRole('heading', { name: 'Hoş geldiniz' })).toBeVisible();
  } finally {
    await giris.close();
  }
  await baglam.close();
});
