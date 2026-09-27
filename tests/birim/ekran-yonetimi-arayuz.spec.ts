// ENTEGRASYON (yerel) — Nöbetçi arayüzü: Ekranlar > ⋯ menüsü (yeniden adlandır, düzenle, taşı, devre dışı bırak /
// etkinleştir, kalıcı sil), Senaryolar'da devre dışı ekranlar ve Sonuçlar'da "silinmiş ekran".
// Geçici bir veritabanı (nötr proje: örnek başvuru modelli ekranlar + model senaryoları, depo fonksiyonlarıyla kurulur) ile
// AYRI bir Nöbetçi sunucusu örneği boş bir portta başlatılır (nobetci-sunucusu.ts; TEST_SUNUCU_KOSU_KAPALI=1: hiçbir test
// koşusu başlatılamaz). Tüm istekler 127.0.0.1'dedir (yasak örnek alan adı yok).
// EKRAN_YONETIMI_EKRAN_KLASORU verilirse koyu/açık tema ekran görüntüleri oraya yazılır.
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { korumaliTarayici, SIRKET_DESENI } from './giris-fikstur';
import { ornekBasvuruModeli } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

const EKRAN_KLASORU = process.env.EKRAN_YONETIMI_EKRAN_KLASORU;

let tarayici: Browser;
let nobetci: Nobetci;
let klasor: ReturnType<typeof geciciKlasor>;
let projeId = '';
let ortamId = '';

const api = (yol: string, govde?: Record<string, unknown>) => nobetciApi(nobetci, yol, govde);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = geciciKlasor('ekran-yonetimi-arayuz');
  const vtYolu = join(klasor.yol, 'platform.db');
  const parola = randomBytes(18).toString('base64url');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
  // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
  izinleriAc(vt);
  projeId = projeKaydet(vt, { ad: 'Örnek Proje' });
  ortamId = ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
  // Nötr ekranlar: hepsi örnek başvuru modelinin kopyası (anahtar + URL yolu farklı), her birinde model senaryoları.
  const ekran = (anahtar: string, ad: string, senaryolar: string[]) => {
    const id = ekranKaydet(vt, { projeId, anahtar, ad });
    ekranModeliEkle(vt, { ekranId: id, model: { ...ornekBasvuruModeli(), id: anahtar, ad, ekranUrl: `/${anahtar}/` } });
    return senaryolar.map((baslik) => senaryoKaydet(vt, { projeId, ekranId: id, baslik, icerik: { kosucu: 'model', ortamlar: { [ortamId]: {} }, veri: { baslik } } }));
  };
  const [basvuruSenaryosu] = ekran('ornek-basvuru', 'Örnek Başvuru', ['Başvuru A', 'Başvuru B']);
  ekran('musteri-kaydi', 'Müşteri Kaydı', ['Yeni müşteri']);
  ekran('kampanya', 'Kampanya', ['Kampanya A', 'Kampanya B']);
  const [subeSenaryosu] = ekran('sube-listesi', 'Şube Listesi', ['Şube arama']);
  // Şube Listesi ve Örnek Başvuru'ya geçmiş sonuç (silinince/devre dışıyken görünür kalsın diye).
  kosuKaydet(vt, { id: 'kosu-ornek-1', projeId, ortamId, tur: 'tam', kapsam: 'Genel' });
  for (const [senaryoId, durum] of [[subeSenaryosu, 'basarili'], [basvuruSenaryosu, 'basarisiz']] as const) {
    sonucKaydet(vt, { kosuId: 'kosu-ornek-1', projeId, senaryoId, senaryoBaslik: 'Örnek senaryo', durum, hataMesaji: durum === 'basarisiz' ? 'sahte hata' : null });
  }
  vt.kapat();
  nobetci = await nobetciBaslat(klasor.yol, vtYolu, { TEST_SUNUCU_KOSU_KAPALI: '1' });
  expect((await api('/platform/kasa/ac', { parola })).basarili).toBe(true);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  klasor?.temizle();
});

async function arayuz(renk: 'dark' | 'light' = 'dark'): Promise<{ page: Page; istekler: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, colorScheme: renk, viewport: { width: 1360, height: 1000 } });
  const istekler: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  page.on('close', () => expect(hatalar, 'sayfa hataları').toEqual([]));
  return { page, istekler };
}

function agKontrol(istekler: string[]): void {
  expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
}

async function ekranGoruntusu(page: Page, ad: string, hedef: Locator = page.locator('main')): Promise<void> {
  if (!EKRAN_KLASORU) return;
  mkdirSync(EKRAN_KLASORU, { recursive: true });
  await page.evaluate(() => { for (const b of document.querySelectorAll('.bildirim')) b.remove(); });
  for (const renk of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: renk });
    await page.waitForTimeout(200);
    await hedef.screenshot({ path: join(EKRAN_KLASORU, `${ad}-${renk === 'dark' ? 'koyu' : 'acik'}.png`), animations: 'disabled' });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
}

/** Birden çok öğeyi kapsayan alanın ekran görüntüsü (ör. kart + açılır menü). */
async function alanGoruntusu(page: Page, ad: string, hedefler: Locator[]): Promise<void> {
  if (!EKRAN_KLASORU) return;
  mkdirSync(EKRAN_KLASORU, { recursive: true });
  const kutular = (await Promise.all(hedefler.map((h) => h.boundingBox()))).filter((k): k is NonNullable<typeof k> => k !== null);
  const x = Math.min(...kutular.map((k) => k.x)) - 12;
  const y = Math.min(...kutular.map((k) => k.y)) - 12;
  const clip = { x, y, width: Math.max(...kutular.map((k) => k.x + k.width)) - x + 12, height: Math.max(...kutular.map((k) => k.y + k.height)) - y + 12 };
  for (const renk of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: renk });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(EKRAN_KLASORU, `${ad}-${renk === 'dark' ? 'koyu' : 'acik'}.png`), clip, animations: 'disabled' });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
}

const kart = (page: Page, ad: string) => page.locator('article.ekran-karti').filter({ has: page.getByRole('heading', { name: ad, exact: true }) });
async function menuAc(page: Page, ad: string): Promise<Locator> {
  await page.getByRole('button', { name: `Ekran işlemleri: ${ad}` }).first().click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

test('⋯ menüsü: yeniden adlandır, düzenle (URL yolu), yukarı taşı', async () => {
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar');
  await expect(kart(page, 'Örnek Başvuru')).toBeVisible();
  await ekranGoruntusu(page, '01-ekran-listesi');
  const menu = await menuAc(page, 'Müşteri Kaydı');
  await expect(menu.getByRole('menuitem')).toHaveText(['Yeniden adlandır', 'Düzenle (URL yolu)', 'Yukarı taşı', 'Aşağı taşı', 'Devre dışı bırak', 'Sil (kalıcı)…']);
  await alanGoruntusu(page, '02-menu', [kart(page, 'Müşteri Kaydı'), menu]);

  // Yeniden adlandır (anahtar aynı kalır).
  await menu.getByRole('menuitem', { name: 'Yeniden adlandır' }).click();
  const ad = page.getByRole('dialog', { name: 'Yeniden adlandır' });
  await ad.getByLabel('Görünen ad').fill('örnek başvuru');
  await ad.getByRole('button', { name: 'Kaydet' }).click();
  await expect(ad.getByRole('alert')).toHaveText(/başka bir ekran var/);
  await ad.getByLabel('Görünen ad').fill('Müşteri Kartı');
  await ad.getByLabel('Açıklama').fill('Müşteri bilgileri ekranı');
  await ekranGoruntusu(page, '03-yeniden-adlandir', ad);
  await ad.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Ekran adı "Müşteri Kartı" olarak kaydedildi.')).toBeVisible();
  await expect(kart(page, 'Müşteri Kartı').locator('code')).toHaveText('musteri-kaydi');

  // Düzenle: URL yolu → yeni model sürümü.
  await (await menuAc(page, 'Müşteri Kartı')).getByRole('menuitem', { name: 'Düzenle (URL yolu)' }).click();
  const duzenle = page.getByRole('dialog', { name: /^Düzenle:/ });
  await duzenle.getByLabel('URL yolu').fill('https://ornek.invalid/x');
  await duzenle.getByRole('button', { name: 'Kaydet' }).click();
  await expect(duzenle.getByRole('alert')).toHaveText(/YOL girin/);
  await duzenle.getByLabel('URL yolu').fill('/yeni/musteri/');
  await ekranGoruntusu(page, '04-duzenle', duzenle);
  await duzenle.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/URL yolu kaydedildi \(model v2\)/)).toBeVisible();
  await expect(kart(page, 'Müşteri Kartı')).toContainText('/yeni/musteri/');

  // Yukarı taşı: kart ve sol liste sırası değişir.
  const once = await page.locator('article.ekran-karti').evaluateAll((l) => l.map((e) => e.getAttribute('data-ekran')));
  const ad2 = await page.locator('article.ekran-karti').nth(1).getByRole('heading').innerText();
  await (await menuAc(page, ad2)).getByRole('menuitem', { name: 'Yukarı taşı' }).click();
  await expect.poll(async () => page.locator('article.ekran-karti').first().getByRole('heading').innerText()).toBe(ad2);
  const sonra = await page.locator('article.ekran-karti').evaluateAll((l) => l.map((e) => e.getAttribute('data-ekran')));
  expect(sonra.slice(0, 2)).toEqual([once[1], once[0]]);
  await expect(page.getByRole('navigation', { name: 'Ekranlar' }).getByRole('group', { name: 'Ekranlar' }).locator('a').first()).toContainText(ad2);
  await page.context().close();
  agKontrol(istekler);
});

test('devre dışı bırak: sol listelerden gizlenir (anahtarla görünür), Senaryolar\'da toplu koşuya girmez (▷ tek başına açık), etkinleştirince geri gelir', async () => {
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar');
  await (await menuAc(page, 'Örnek Başvuru')).getByRole('menuitem', { name: 'Devre dışı bırak' }).click();
  await expect(page.getByText('"Örnek Başvuru" devre dışı bırakıldı; senaryoları koşulara girmez.')).toBeVisible();
  await expect(kart(page, 'Örnek Başvuru').getByText('devre dışı')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Ekranlar' });
  await expect(nav.getByRole('link', { name: /Örnek Başvuru/ })).toHaveCount(0);
  await nav.getByText('Devre dışı ekranları göster').click();
  await expect(nav.getByRole('link', { name: /Örnek Başvuru/ })).toContainText('kapalı');
  await ekranGoruntusu(page, '05-devre-disi-liste');
  await nav.getByText('Devre dışı ekranları göster').click();

  // Ayrıntı: şerit + Etkinleştir, başlıkta ⋯.
  await kart(page, 'Örnek Başvuru').getByRole('link', { name: 'Örnek Başvuru' }).click();
  await expect(page.getByText('Bu ekran devre dışı.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekran işlemleri: Örnek Başvuru' })).toBeVisible();
  await ekranGoruntusu(page, '06-devre-disi-ayrinti', page.locator('.sayfa-basligi').locator('..'));

  // Senaryolar: ekran ve senaryoları gizli; anahtarla görünür, ▷ açık (tek başına), Koşuyu başlat onları saymaz.
  await page.goto('/#/senaryolar');
  const sNav = page.getByRole('navigation', { name: 'Ürünler', exact: true });
  await expect(sNav.getByRole('link', { name: /Örnek Başvuru/ })).toHaveCount(0);
  await expect(page.locator('td.ekran-hucresi', { hasText: 'Örnek Başvuru' })).toHaveCount(0);
  await sNav.getByText('Devre dışı ekranları göster').click();
  await sNav.getByRole('link', { name: /Örnek Başvuru/ }).click();
  const satir = page.locator('tbody tr').first();
  await expect(satir.getByText('ekran devre dışı')).toBeVisible();
  await expect(satir.getByRole('button', { name: /^Çalıştır:/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Koşuyu başlat' })).toBeDisabled();
  await ekranGoruntusu(page, '07-senaryolar-devre-disi');
  await sNav.getByText('Devre dışı ekranları göster').click();

  // Sunucu toplu koşuda (tam) reddeder.
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { senaryolar: Array<{ id: string; ekranAdi: string }> };
  const basvuru = liste.senaryolar.find((s) => s.ekranAdi === 'Örnek Başvuru');
  expect(basvuru).toBeTruthy();
  const red = await api('/platform/senaryolar/calistir', { projeId, ortamId, senaryoId: basvuru?.id, kosuId: 'k1', kosuTuru: 'tam', kosuKimligi: 'toplu-1' });
  expect(String(red.mesaj)).toMatch(/devre dışı/);

  // Sonuçlar: "devre dışı" etiketiyle görünür kalır.
  await page.goto('/#/sonuclar');
  await expect(page.getByRole('navigation', { name: 'Ürünler' }).getByRole('link', { name: /Örnek Başvuru/ })).toContainText('kapalı');

  await page.goto('/#/ekranlar');
  await page.getByRole('navigation', { name: 'Ekranlar' }).getByText('Devre dışı ekranları göster').click();
  await page.getByRole('navigation', { name: 'Ekranlar' }).getByRole('link', { name: /Örnek Başvuru/ }).click();
  await page.getByRole('button', { name: 'Etkinleştir' }).click();
  await expect(page.getByText('"Örnek Başvuru" etkinleştirildi.')).toBeVisible();
  await expect(page.getByText('Bu ekran devre dışı.')).toHaveCount(0);
  await page.context().close();
  agKontrol(istekler);
});

test('kalıcı sil (sonuç yok): onay adı, sayılar; mezar taşı kalmaz', async () => {
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar');
  await (await menuAc(page, 'Kampanya')).getByRole('menuitem', { name: 'Sil (kalıcı)…' }).click();
  const d = page.getByRole('dialog', { name: 'Ekranı kalıcı sil: Kampanya' });
  await expect(d.locator('.onay-ozeti dd')).toHaveText(['1', '2', '0', '0']);
  await expect(d.getByLabel(/Geçmiş sonuçları da sil/)).toBeDisabled();
  await expect(d).toContainText('Bu ekranın koşu sonucu yok.');
  await expect(d).not.toContainText(/test kodu/i);
  const sil = d.getByRole('button', { name: 'Kalıcı olarak sil' });
  await expect(sil).toBeDisabled();
  await d.getByLabel(/Onaylamak için/).fill('kampanya');
  await expect(sil).toBeDisabled();
  await d.getByLabel(/Onaylamak için/).fill('Kampanya');
  await expect(sil).toBeEnabled();
  await ekranGoruntusu(page, '08-sil-sonuc-yok', d);
  await sil.click();
  await expect(page.getByText('"Kampanya" silindi (2 senaryo, 1 model sürümü).')).toBeVisible();
  await expect(kart(page, 'Kampanya')).toHaveCount(0);
  // Sonucu yok → mezar taşı kalmaz.
  const ekranlar = await api(`/platform/ekranlar?projeId=${projeId}`) as { ekranlar: Array<{ anahtar: string }>; silinmisEkranlar: unknown[] };
  expect(ekranlar.silinmisEkranlar).toEqual([]);
  expect(ekranlar.ekranlar.map((e) => e.anahtar)).not.toContain('kampanya');
  await expect(page.locator('details.silinmis-ekranlar')).toHaveCount(0);
  await page.context().close();
  agKontrol(istekler);
});

test('kalıcı sil (sonuçlar korunur): "Silinmiş ekranlar" bölümü, Sonuçlar\'da "silinmiş ekran", geri yükle', async () => {
  const { page, istekler } = await arayuz();
  await page.goto('/#/ekranlar/');
  await (await menuAc(page, 'Şube Listesi')).getByRole('menuitem', { name: 'Sil (kalıcı)…' }).click();
  const d = page.getByRole('dialog', { name: 'Ekranı kalıcı sil: Şube Listesi' });
  await expect(d.locator('.onay-ozeti dd')).toHaveText(['1', '1', '1', '0']);
  await expect(d.getByLabel(/Geçmiş sonuçları da sil/)).toBeEnabled();
  await expect(d.getByLabel(/Geçmiş sonuçları da sil/)).not.toBeChecked();
  await ekranGoruntusu(page, '09-sil-sonuclar-korunur', d);
  await d.getByLabel(/Onaylamak için/).fill('Şube Listesi');
  await d.getByRole('button', { name: 'Kalıcı olarak sil' }).click();
  await expect(page.getByText(/"Şube Listesi" silindi .* 1 geçmiş sonuç korundu\./)).toBeVisible();
  const bolum = page.locator('details.silinmis-ekranlar');
  await bolum.locator('summary').click();
  await expect(bolum.getByText('Şube Listesi', { exact: true })).toBeVisible();
  await expect(bolum).toContainText('1 geçmiş sonuç korunuyor');
  await ekranGoruntusu(page, '10-silinmis-ekranlar', bolum);

  await page.goto('/#/sonuclar');
  const urun = page.getByRole('navigation', { name: 'Ürünler' }).getByRole('link', { name: /Şube Listesi/ });
  await expect(urun).toContainText('silinmiş');
  await urun.click();
  await expect(page.locator('.sayfa-basligi').getByText('silinmiş ekran')).toBeVisible();
  await expect(page.locator('.sayfa-basligi').getByRole('link', { name: 'Koşuyu başlat' })).toHaveCount(0);
  await ekranGoruntusu(page, '11-sonuclar-silinmis-ekran');

  await page.goto('/#/ekranlar');
  await page.locator('details.silinmis-ekranlar summary').click();
  await page.locator('details.silinmis-ekranlar').getByRole('button', { name: 'Geri yükle' }).click();
  await expect(page.getByText(/"Şube Listesi" geri yüklendi/)).toBeVisible();
  await expect(kart(page, 'Şube Listesi')).toBeVisible();
  await expect(page.locator('details.silinmis-ekranlar')).toHaveCount(0);
  await page.context().close();
  agKontrol(istekler);
});

test('API doğrulaması: token, kasa, geçersiz gövde', async () => {
  const r = await fetch(`${nobetci.adres}/platform/ekran/sil`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projeId }) });
  expect(r.status).toBe(401);
  const ekranlar = await api(`/platform/ekranlar?projeId=${projeId}`) as { ekranlar: Array<{ id: string; ad: string; anahtar: string }> };
  const musteri = ekranlar.ekranlar.find((e) => e.anahtar === 'musteri-kaydi');
  expect(musteri).toBeTruthy();
  expect((await api('/platform/ekran/durum', { projeId, ekranId: musteri?.id, etkin: 'evet' })).mesaj).toMatch(/true ya da false/);
  expect((await api('/platform/ekran/sil', { projeId, ekranId: musteri?.id, onayAdi: musteri?.ad, sonuclariSil: 'evet' })).mesaj).toMatch(/true ya da false/);
  expect((await api('/platform/ekran/sil', { projeId, ekranId: musteri?.id, onayAdi: 'yanlış ad' })).mesaj).toMatch(/adını aynen/);
  expect((await api('/platform/ekran/sil', { projeId, ekranId: '../x', onayAdi: 'x' })).mesaj).toMatch(/geçersiz/);
  const sonra = await api(`/platform/ekranlar?projeId=${projeId}`) as { ekranlar: Array<{ id: string }> };
  expect(sonra.ekranlar.some((e) => e.id === musteri?.id)).toBe(true);
  // Video saklama süresi: yeni kayıt 1–365 gün.
  expect((await api('/platform/guvenlik/kaydet', { videoSaklamaGun: 366 })).mesaj).toMatch(/1–365 gün/);
  expect(await api('/platform/guvenlik/kaydet', { videoSaklamaGun: 365 })).toMatchObject({ basarili: true, videoSaklamaGun: 365 });
  await api('/platform/kasa/kilitle', {});
  const kilitli = await fetch(`${nobetci.adres}/platform/ekran/sil/onizle`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projeId, ekranId: musteri?.id, token: nobetci.token }) });
  expect(kilitli.status).toBe(423);
});
