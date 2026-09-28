// ENTEGRASYON (yerel) — Ayarlar > Giriş profilleri > giriş PROFİLİ formu (sade düzen): birincil görünümde ad, ortam,
// kullanıcı adı, parola; ortamın giriş tarifi kod / ek alan istiyorsa onlar da. Tarifin istemediği ayarlar kapalı "Gelişmiş"
// altında; tarif kod istemiyorsa kod alanları hiç görünmez. Gizli değerler (parola, authenticator anahtarı) ekranda ve
// yanıtlarda düz görünmez. Geçici veritabanı, ayrı Nöbetçi (127.0.0.1); ortam adresleri .invalid (hiç istek gitmez).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { girisTarifiKaydet } from '../../scripts/platform/giris/tarif-deposu.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { ORNEK_TOTP_ANAHTARI, ornekGirisTarifi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

const KASA_PAROLASI = `Gecici-Profil-${randomBytes(6).toString('hex')}`;
/** Giriş profilinin SAHTE parolası: ekranda ve hiçbir yanıtta düz görünmemeli. */
const SAHTE_PAROLA = 'Sahte-Profil-Parolasi-9';

/** Parola alanının etiketi (yeni profilde "(zorunlu)" ekli; göster düğmesinin adı eşleşmez). */
const PAROLA_ETIKETI = /^Parola( \(zorunlu\))?$/;

let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'giris-profili-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, KASA_PAROLASI, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
  const kodlu = ortamKaydet(vt, { projeId, ad: 'KODLU', tabanUrl: 'https://kodlu.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
  const kodsuz = ortamKaydet(vt, { projeId, ad: 'KODSUZ', tabanUrl: 'https://kodsuz.ornek.invalid', ayarlar: { riskli: false } });
  ortamKaydet(vt, { projeId, ad: 'TARIFSIZ', tabanUrl: 'https://tarifsiz.ornek.invalid', ayarlar: { riskli: false } });
  // KODLU: authenticator kodu + giriş adımında {firmaKodu} ek alanı. KODSUZ: yalnız kullanıcı adı / parola.
  girisTarifiKaydet(vt, projeId, kodlu, {
    ...ornekGirisTarifi(), baglamDegistirme: null,
    girisAdimlari: [{ islem: 'kullaniciAdi' }, { islem: 'parola' }, { islem: 'doldur', hedef: { secici: '#firma' }, deger: '{firmaKodu}' }, { islem: 'gonder' }]
  });
  girisTarifiKaydet(vt, projeId, kodsuz, { ...ornekGirisTarifi(), ikinciAdim: { tur: 'yok' }, baglamDegistirme: null });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu);
  expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola: KASA_PAROLASI })).basarili).toBe(true);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

type Oturum = { page: Page; istekler: string[]; yanitlar: string[] };

async function arayuz(genislik = 1360): Promise<Oturum> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
  const istekler: string[] = [];
  const yanitlar: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  baglam.on('response', async (r) => {
    if (!r.url().includes('/platform/')) return;
    try { yanitlar.push(await r.text()); } catch { /* gövdesiz yanıt */ }
  });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/giris');
  await expect(page.getByRole('button', { name: 'Giriş profili ekle' })).toBeVisible();
  return { page, istekler, yanitlar };
}

function agKontrol(istekler: string[]): void {
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
}

const profilFormu = (page: Page): Locator => page.locator('form.form-paneli').filter({ has: page.getByLabel('Profil adı') });
const kodBolumu = (form: Locator): Locator => form.locator('fieldset.giris-profili-kod');
const ekBolumu = (form: Locator): Locator => form.locator('fieldset.giris-profili-ek');
const gelismis = (form: Locator): Locator => form.locator('details.giris-profili-gelismis');

test('Kod alanları tarife göre: kod istemeyen ortamda görünmez, isteyende birincil görünümde; Gelişmiş kapalı başlar', async () => {
  const { page, istekler } = await arayuz();
  await page.getByRole('button', { name: 'Giriş profili ekle' }).click();
  const form = profilFormu(page);
  await expect(form.getByRole('heading', { name: 'Yeni giriş profili' })).toBeVisible();
  // Birincil alanlar.
  await expect(form.getByLabel('Profil adı')).toBeVisible();
  await expect(form.getByLabel('Ortam', { exact: true })).toBeVisible();
  await expect(form.getByLabel('Kullanıcı adı')).toBeVisible();
  await expect(form.getByLabel(PAROLA_ETIKETI)).toBeVisible();

  // KODSUZ: tarif kod da ek alan da istemiyor → kod alanları yok, ek alanlar kapalı Gelişmiş'te.
  await form.getByLabel('Ortam', { exact: true }).selectOption({ label: 'KODSUZ' });
  await expect(kodBolumu(form)).toHaveCount(0);
  await expect(form.getByText('Authenticator gizli anahtarı')).toHaveCount(0);
  await expect(gelismis(form)).toBeVisible();
  await expect(gelismis(form)).not.toHaveAttribute('open', /.*/);
  await expect(gelismis(form).locator('fieldset.giris-profili-ek')).toHaveCount(1);
  await expect(ekBolumu(form)).toBeHidden();

  // KODLU: tarif TOTP + {firmaKodu} istiyor → ikisi de birincil; TOTP kendiliğinden seçili; Gelişmiş boş (gizli).
  await form.getByLabel('Ortam', { exact: true }).selectOption({ label: 'KODLU' });
  await expect(kodBolumu(form)).toBeVisible();
  await expect(gelismis(form).locator('fieldset')).toHaveCount(0);
  await expect(gelismis(form)).toBeHidden();
  await expect(form.getByRole('radio', { name: /Authenticator uygulaması/ })).toBeChecked();
  await expect(form.getByLabel('Authenticator gizli anahtarı', { exact: true })).toBeVisible();
  await expect(ekBolumu(form)).toBeVisible();
  await expect(form.getByRole('button', { name: 'Ek alan ekle: firmaKodu' })).toBeVisible();

  // TARIFSIZ: tarif yok → koşullu alanlar kapalı Gelişmiş'te.
  await form.getByLabel('Ortam', { exact: true }).selectOption({ label: 'TARIFSIZ' });
  await expect(gelismis(form)).toBeVisible();
  await expect(gelismis(form)).not.toHaveAttribute('open', /.*/);
  await expect(gelismis(form).locator('fieldset.giris-profili-kod')).toHaveCount(1);
  await expect(kodBolumu(form)).toBeHidden();
  agKontrol(istekler);
  await page.context().close();
});

test('Zorunlu alan eksikken açık hata; eksik alan Gelişmiş\'teyse Gelişmiş kendiliğinden açılır', async () => {
  const { page, istekler } = await arayuz();
  await page.getByRole('button', { name: 'Giriş profili ekle' }).click();
  const form = profilFormu(page);
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await expect(form.getByText('Profil adı boş olamaz.')).toBeVisible();

  await form.getByLabel('Profil adı').fill('Tarifsiz kullanıcı');
  await form.getByLabel('Ortam', { exact: true }).selectOption({ label: 'TARIFSIZ' });
  await form.getByLabel('Kullanıcı adı').fill('tarifsiz.kullanici');
  await form.getByLabel(PAROLA_ETIKETI).fill(SAHTE_PAROLA);
  // Gelişmiş'te authenticator seçilir, anahtar boş bırakılır ve Gelişmiş kapatılır.
  await gelismis(form).locator('summary').click();
  await form.getByRole('radio', { name: /Authenticator uygulaması/ }).check();
  await gelismis(form).locator('summary').click();
  await expect(gelismis(form)).not.toHaveAttribute('open', /.*/);
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await expect(gelismis(form)).toHaveAttribute('open', '');
  await expect(form.getByText('Authenticator gizli anahtarını girin.')).toBeVisible();
  await expect(form.getByLabel('Authenticator gizli anahtarı', { exact: true })).toBeFocused();

  // Gelişmiş'teki geçersiz ek alan adı da Gelişmiş'i açar.
  await form.getByRole('radio', { name: 'Yok', exact: true }).check();
  await form.getByRole('button', { name: 'Ek alan ekle', exact: true }).click();
  await form.getByLabel('Ek alan adı').fill('firma kodu');
  await gelismis(form).locator('summary').click();
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await expect(gelismis(form)).toHaveAttribute('open', '');
  await expect(form.getByText(/Ek alan adı "firma kodu" geçersiz/)).toBeVisible();
  agKontrol(istekler);
  await page.context().close();
});

test('Kaydet → yeniden aç: gizli olmayan değerler korunur; parola ve anahtar ekranda / yanıtlarda düz görünmez; satır sade', async () => {
  const { page, istekler, yanitlar } = await arayuz();
  await page.getByRole('button', { name: 'Giriş profili ekle' }).click();
  let form = profilFormu(page);
  await form.getByLabel('Profil adı').fill('Kodlu kullanıcı');
  await form.getByLabel('Ortam', { exact: true }).selectOption({ label: 'KODLU' });
  await form.getByLabel('Kullanıcı adı').fill('kodlu.kullanici');
  await form.getByLabel(PAROLA_ETIKETI).fill(SAHTE_PAROLA);
  await form.getByLabel('Authenticator gizli anahtarı', { exact: true }).fill(ORNEK_TOTP_ANAHTARI);
  await form.getByRole('button', { name: 'Ek alan ekle: firmaKodu' }).click();
  await expect(form.getByLabel('Ek alan adı')).toHaveValue('firmaKodu');
  await expect(form.getByLabel('Ek alan değeri')).toBeFocused();
  await form.getByLabel('Ek alan değeri').fill('F-100');
  await expect(form.getByRole('button', { name: 'Ek alan ekle: firmaKodu' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Giriş profili kaydedildi.')).toBeVisible();

  // Liste satırı: ad, ortam, kullanıcı adı; parola / kod kaynağı yok.
  const satir = page.locator('ul.kayit-listesi > li').filter({ hasText: 'Kodlu kullanıcı' });
  await expect(satir.locator('.kayit-meta')).toHaveText('KODLU · kodlu.kullanici');
  await expect(satir).not.toContainText('Parola');

  // Yeniden aç: değerler korunur; gizli alanlar boş ve maskeli yer tutuculu.
  await satir.getByRole('button', { name: 'Kodlu kullanıcı: düzenle' }).click();
  form = profilFormu(page);
  await expect(form.getByLabel('Profil adı')).toHaveValue('Kodlu kullanıcı');
  await expect(form.getByLabel('Ortam', { exact: true }).locator('option:checked')).toHaveText('KODLU');
  await expect(form.getByLabel('Kullanıcı adı')).toHaveValue('kodlu.kullanici');
  await expect(form.getByLabel('Ek alan adı')).toHaveValue('firmaKodu');
  await expect(form.getByLabel('Ek alan değeri')).toHaveValue('F-100');
  await expect(form.getByRole('radio', { name: /Authenticator uygulaması/ })).toBeChecked();
  const parola = form.getByLabel(PAROLA_ETIKETI);
  await expect(parola).toHaveValue('');
  await expect(parola).toHaveAttribute('type', 'password');
  await expect(parola).toHaveAttribute('placeholder', /kayıtlı/);
  await expect(form.getByLabel('Authenticator gizli anahtarı', { exact: true })).toHaveValue('');
  await expect(gelismis(form)).toBeHidden();
  // Boş gizli alanlarla yeniden kaydetmek kayıtlı değerleri korur (doğrulama geçer).
  await form.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Giriş profili kaydedildi.').first()).toBeVisible();

  const ekran = await page.locator('main').innerText();
  expect(ekran).not.toContain(SAHTE_PAROLA);
  expect(ekran).not.toContain(ORNEK_TOTP_ANAHTARI);
  expect(yanitlar.length).toBeGreaterThan(0);
  expect(yanitlar.filter((y) => y.includes(SAHTE_PAROLA) || y.includes(ORNEK_TOTP_ANAHTARI))).toEqual([]);
  agKontrol(istekler);
  await page.context().close();
});

test('390 px: profil formu ve liste yatay taşmaz', async () => {
  const { page, istekler } = await arayuz(390);
  await page.getByRole('button', { name: 'Giriş profili ekle' }).click();
  const form = profilFormu(page);
  await form.getByLabel('Ortam', { exact: true }).selectOption({ label: 'KODLU' });
  await form.getByRole('button', { name: 'Ek alan ekle: firmaKodu' }).click();
  await form.getByLabel('Ortam', { exact: true }).selectOption({ label: 'TARIFSIZ' });
  await gelismis(form).locator('summary').click();
  await form.getByRole('radio', { name: 'SMS', exact: true }).check();
  const tasma = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(tasma).toBeLessThanOrEqual(0);
  const formTasmasi = await form.evaluate((f) => f.scrollWidth - f.clientWidth);
  expect(formTasmasi).toBeLessThanOrEqual(0);
  agKontrol(istekler);
  await page.context().close();
});
