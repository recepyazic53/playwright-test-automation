// ENTEGRASYON (yerel) — Ayarlar > Giriş profilleri > Giriş tarifi formu (sade düzen):
//  - zorunlu olanlar önce (adres, kullanıcı adı / parola alanı, giriş düğmesi, başarı göstergesi), her alanın altında örnekli yardım;
//    gerisi kapalı "Gelişmiş ayarlar"; "Oturum kontrol adresi" isteğe bağlı ve sade anlatılmış,
//  - adres alanına TAM adres yapıştırılabilir: ortamın kökeniyle aynıysa taban adres + yol olarak ayrılır; başka kökse "Bu adresi yeni
//    taban adres olarak kaydedeyim mi?" sorulur (Evet: ortamın taban adresleri listesine eklenir; Vazgeç: eklenmez),
//  - oturum kontrol adresi boşsa giriş sonrası açılan sayfa otomatik türetilir.
// Geçici veritabanı, ayrı Nöbetçi (127.0.0.1); ortam adresleri .invalid (hiç istek gitmez).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { adresiAyir, kokenKayitliMi } from '../../scripts/platform/arayuz/adres-ayirma.mjs';
import { ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

const KASA_PAROLASI = `Gecici-Form-${randomBytes(6).toString('hex')}`;
const TABAN = 'https://ornek.invalid';

let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';
let ortamId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'giris-formu-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, KASA_PAROLASI, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  projeId = projeKaydet(vt, { ad: 'Örnek proje' });
  ortamId = ortamKaydet(vt, { projeId, ad: 'DENEME', tabanUrl: TABAN, varsayilan: true, ayarlar: { riskli: false } });
  // "Her girişte çalışacak akış" için seçilebilecek genel senaryo (iki değer ister).
  const kd = ekranKaydet(vt, { projeId, anahtar: 'kullanici-degistir', ad: 'Kullanıcı değiştir' });
  ekranModeliEkle(vt, { ekranId: kd, model: { semaSurumu: 2, tur: 'ortakAkis', id: 'kullanici-degistir', ad: 'Kullanıcı değiştir', kosullar: {}, adimlar: [{ id: 'sec', sira: 1, baslik: 'Seçilir', bolumler: [{ id: 'b', alanlar: [
    { id: 'acenteKodu', tip: 'secim', etiket: { ekran: 'Acente Partajı' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'acenteKodu' }, seceneklerDurumu: 'dinamik', konum: { secici: '#acente' } },
    { id: 'acenteKullanicisi', tip: 'secim', etiket: { ekran: 'Acente Kullanıcısı' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'acenteKullanicisi' }, seceneklerDurumu: 'dinamik', konum: { secici: '#kullanici' } }
  ] }], kosu: { aksiyonlar: [{ tur: 'tikla', secici: 'button', metin: 'DEĞİŞTİR' }] } }] } });
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

async function formuAc(): Promise<{ page: Page; istekler: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 1200 } });
  const istekler: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  const page = await baglam.newPage();
  await page.goto('/#/ayarlar/giris');
  const satir = page.locator('.giris-tarifi-bolumu li[data-ortam]').filter({ hasText: 'DENEME' });
  await satir.getByRole('button', { name: 'Elle tanımla — DENEME giriş tarifi' }).click();
  await expect(page.locator('form.tarif-formu')).toBeVisible();
  return { page, istekler };
}

test('adres ayırma (saf): yol, aynı kökende tam adres, başka kökte tam adres, geçersiz adres', () => {
  expect(adresiAyir('', TABAN)).toMatchObject({ tur: 'yol', yol: '' });
  expect(adresiAyir('giris', TABAN)).toMatchObject({ tur: 'yol', yol: '/giris' });
  expect(adresiAyir(' /giris?a=1 ', TABAN)).toMatchObject({ tur: 'yol', yol: '/giris?a=1' });
  expect(adresiAyir(`${TABAN}/kullanici/giris?x=1#ust`, TABAN)).toEqual({ tur: 'ayni', yol: '/kullanici/giris?x=1', koken: TABAN, adres: '/kullanici/giris?x=1' });
  expect(adresiAyir(TABAN, TABAN)).toMatchObject({ tur: 'ayni', yol: '/' });
  expect(adresiAyir('https://baska.invalid/giris', TABAN)).toEqual({ tur: 'baska', yol: '/giris', koken: 'https://baska.invalid', adres: 'https://baska.invalid/giris' });
  // Farklı port ya da şema başka kökendir.
  expect(adresiAyir(`${TABAN}:8443/giris`, TABAN).tur).toBe('baska');
  expect(adresiAyir('http://ornek.invalid/giris', TABAN).tur).toBe('baska');
  for (const kotu of ['ftp://x.invalid/a', '//x.invalid/a', 'https://kullanici:parola@x.invalid/a', 'javascript:alert(1)']) expect(adresiAyir(kotu, TABAN).tur, kotu).toBe('hata');
  expect(kokenKayitliMi('https://baska.invalid', [TABAN, 'https://baska.invalid/'])).toBe(true);
  expect(kokenKayitliMi('https://baska.invalid', [TABAN])).toBe(false);
});

test('yeni tarif: yalnız zorunlu olanlar görünür, her alanın altında örnekli yardım var; gerisi kapalı "Gelişmiş ayarlar"; oturum kontrolü sade anlatılır', async () => {
  const { page, istekler } = await formuAc();
  const form = page.locator('form.tarif-formu');
  for (const etiket of ['Giriş sayfasının adresi', 'Kullanıcı adı alanı', 'Parola alanı', 'Giriş düğmesi', 'Başarı göstergesi']) {
    await expect(form.getByLabel(etiket, { exact: false }).first(), etiket).toBeVisible();
  }
  await expect(form.getByRole('button', { name: 'Analiz et' })).toBeVisible();
  // Örnekli yardım metinleri etiketin yanındaki "?" içinde: metin sayfada var, "?" ile açılınca görünür.
  const yardimlar = ['Örnek: #kullanici ya da input[name="kullanici"].', 'Örnek: #parola ya da input[type="password"].', 'Örnek: button[type="submit"] ya da #giris.', 'Örnek: Oturumu Kapat.'];
  for (const y of yardimlar) await expect(form.getByText(y), y).toHaveCount(1);
  await expect(form.getByText(yardimlar[0])).toBeHidden();
  await form.locator('.alan').filter({ has: page.getByLabel('Kullanıcı adı alanı', { exact: false }) }).getByRole('button', { name: 'Açıklamayı göster' }).click();
  await expect(form.getByText(yardimlar[0])).toBeVisible();
  // Gelişmiş kapalı: oturum kontrolü, giriş adımları, hata göstergeleri, iki aşamalı doğrulama, bağlam değiştirme.
  const gelismis = form.locator('details.giris-gelismis');
  await expect(gelismis).not.toHaveAttribute('open', /.*/);
  await expect(form.getByLabel('Oturum kontrol adresi')).toBeHidden();
  await expect(form.getByRole('button', { name: 'Hata göstergesi ekle' })).toBeHidden();
  await expect(form.getByRole('radio', { name: /^Authenticator/ })).toBeHidden();
  await gelismis.locator(':scope > summary').click();
  await expect(form.getByLabel('Oturum kontrol adresi')).toBeVisible();
  await expect(gelismis).toContainText('Girişten sonra açılan bir sayfa (ör. /panel): giriş yapılmış mı diye Nöbetçi her testten önce bu sayfaya bakar');
  await expect(gelismis).toContainText('İsteğe bağlı');
  await expect(gelismis).toContainText('Boş bırakırsanız Nöbetçi giriş sonrası açılan sayfayı kendisi bulur.');
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
  await page.context().close();
});

test('tam adres yapıştırılır: ortamın kökeniyle aynıysa taban adres + yol olarak ayrılır (tarife yalnız yol yazılır)', async () => {
  const { page } = await formuAc();
  const form = page.locator('form.tarif-formu');
  const adres = form.getByLabel('Giriş sayfasının adresi');
  await adres.fill(`${TABAN}/kullanici/giris?dil=tr#ust`);
  await adres.blur();
  await expect(adres).toHaveValue('/kullanici/giris?dil=tr');
  await expect(form.getByText(`Tam adres ayrıldı: taban adres ${TABAN} + yol /kullanici/giris?dil=tr.`)).toBeVisible();
  // Geçersiz adres: alan altında açık hata.
  await adres.fill('ftp://x.invalid/a');
  await adres.blur();
  await expect(form.getByText('Yalnızca http(s) adresi ya da yol yazılabilir.')).toBeVisible();
  await page.context().close();
});

test('başka kökte tam adres: "Bu adresi yeni taban adres olarak kaydedeyim mi?" — Vazgeç eklemez, Evet ortamın taban adresleri listesine ekler', async () => {
  const tabanlar = async (): Promise<string[]> => {
    const y = await nobetciApi(nobetci, `/platform/giris-tarifleri?projeId=${projeId}`);
    return ((y.ortamlar as Array<{ ortamId: string; tabanAdresleri: string[] }>).find((o) => o.ortamId === ortamId) as { tabanAdresleri: string[] }).tabanAdresleri;
  };
  expect(await tabanlar()).toEqual([TABAN]);
  const { page } = await formuAc();
  const form = page.locator('form.tarif-formu');
  const adres = form.getByLabel('Giriş sayfasının adresi');
  // Vazgeç: adres tam adres olarak kalır, listeye eklenmez.
  await adres.fill('https://baska.invalid/giris');
  await adres.blur();
  const soru = page.getByRole('dialog', { name: 'Bu adresi yeni taban adres olarak kaydedeyim mi?' });
  await expect(soru).toContainText(`https://baska.invalid adresi bu ortamın taban adresinden (${TABAN}) farklı bir sitede.`);
  await soru.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(adres).toHaveValue('https://baska.invalid/giris');
  await expect(form.getByText('https://baska.invalid taban adres olarak kaydedilmedi; adres tam adres olarak kalır.')).toBeVisible();
  expect(await tabanlar()).toEqual([TABAN]);
  // Evet: ortamın asıl adresi değişmez, kök listeye eklenir.
  await adres.fill('https://baska.invalid/giris-2');
  await adres.blur();
  await page.getByRole('dialog', { name: 'Bu adresi yeni taban adres olarak kaydedeyim mi?' }).getByRole('button', { name: 'Evet, kaydet' }).click();
  await expect(form.getByText('https://baska.invalid taban adres olarak kaydedildi.')).toBeVisible();
  expect(await tabanlar()).toEqual([TABAN, 'https://baska.invalid']);
  // Kayıtlı köken bir daha sorulmaz.
  await adres.fill('https://baska.invalid/baska-yol');
  await adres.blur();
  await expect(form.getByText('https://baska.invalid ortamın kayıtlı taban adreslerinden; tam adres olarak kalır.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Yasaklı adres kalıbına uyan kök eklenmez.
  const yasakli = await nobetciApi(nobetci, '/platform/giris-tarifi/taban-adresi-ekle', { projeId, ortamId, adres: 'https://x.yasak-ornek.invalid/giris' });
  expect(yasakli.basarili).toBe(false);
  expect(String(yasakli.mesaj)).toContain('yasaklı adres kalıbına');
  await page.context().close();
});

test('oturum kontrol adresi boşsa giriş sonrası açılan sayfa otomatik türetilir ve kaydedilir; girilen adres olduğu gibi kalır', async () => {
  const { page } = await formuAc();
  const form = page.locator('form.tarif-formu');
  await form.getByLabel('Giriş sayfasının adresi').fill('/giris');
  await form.getByLabel('Kullanıcı adı alanı').fill('#kullanici');
  await form.getByLabel('Parola alanı').fill('#parola');
  await form.getByLabel('Giriş düğmesi').fill('#giris');
  await form.getByLabel('Başarı göstergesi türü').selectOption('url');
  await form.getByLabel('Başarı göstergesi (zorunlu)', { exact: true }).fill('/panel$');
  // Boş alanın yer tutucusu otomatik değeri gösterir.
  await form.locator('details.giris-gelismis > summary').click();
  await expect(form.getByLabel('Oturum kontrol adresi')).toHaveAttribute('placeholder', 'Boş: otomatik (/panel)');
  await form.getByRole('button', { name: 'Tarifi kaydet' }).click();
  await expect(page.getByText('Giriş tarifi kaydedildi.')).toBeVisible();
  const tarif = ((await nobetciApi(nobetci, `/platform/giris-tarifleri?projeId=${projeId}`)).ortamlar as Array<{ ortamId: string; tarif: Record<string, unknown> }>).find((o) => o.ortamId === ortamId)?.tarif;
  expect(tarif).toMatchObject({ girisAdresi: '/giris', oturumKontrolAdresi: '/panel' });
  await page.context().close();
});

test('her girişte çalışacak akış: akışlardan seçilir, istediği alanlar sorulur (boşsa kaydedilmez), seçim ve değerler tarife yazılır', async () => {
  // Önceki testler bu ortamın tarifini kaydetmiş olabilir: form "Elle tanımla" ile açılsın diye sıfırlanır.
  await nobetciApi(nobetci, '/platform/giris-tarifi/sifirla', { projeId, ortamId });
  const { page } = await formuAc();
  const form = page.locator('form.tarif-formu');
  await form.getByLabel('Giriş sayfasının adresi').fill('/giris');
  await form.getByLabel('Kullanıcı adı alanı').fill('#kullanici');
  await form.getByLabel('Parola alanı').fill('#parola');
  await form.getByLabel('Giriş düğmesi').fill('#giris');
  await form.getByLabel('Başarı göstergesi (zorunlu)', { exact: true }).fill('Çıkış');
  const bolum = form.locator('fieldset.giris-sonrasi-akis');
  await expect(bolum).toBeVisible();
  await bolum.getByLabel('Akış').selectOption({ label: 'Kullanıcı değiştir' });
  await expect(bolum).toContainText('“Kullanıcı değiştir” akışı şu değerleri istiyor:');
  await bolum.getByLabel('Acente Partajı').fill('30447');
  // Bir değer boşsa kaydedilmez.
  await form.getByRole('button', { name: 'Tarifi kaydet' }).click();
  await expect(bolum.getByText('Acente Kullanıcısı: akış bu değeri istiyor.')).toBeVisible();
  await bolum.getByLabel('Acente Kullanıcısı').fill('30447001');
  await form.getByRole('button', { name: 'Tarifi kaydet' }).click();
  await expect(page.getByText('Giriş tarifi kaydedildi.')).toBeVisible();
  const o = ((await nobetciApi(nobetci, `/platform/giris-tarifleri?projeId=${projeId}`)).ortamlar as Array<{ ortamId: string; tarif: Record<string, any> }>).find((x) => x.ortamId === ortamId);
  expect(o?.tarif.girisSonrasiAkis).toEqual({ dosya: 'kullanici-degistir.model.json', degerler: { acenteKodu: '30447', acenteKullanicisi: '30447001' } });
  // Koşucuya giden tarifte akış çözülmüş (adımlar + değerler).
  expect(o?.tarif.girisSonrasi).toMatchObject({ ad: 'Kullanıcı değiştir', degerler: { acenteKodu: '30447' } });
  expect((o?.tarif.girisSonrasi.adimlar as Array<{ islem: string }>).map((a) => a.islem)).toEqual(['sec', 'sec', 'tikla']);
  await page.context().close();
});
