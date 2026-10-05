// UÇTAN UCA (yerel) — Ayarlar > Test verisi > Tablolar listesinin GRUPLARI (yalnız görünüm; veri değişmez): "Kişi ve kayıt
// verileri" ve "Ekran listeleri" (ölçüt önce tablo türü; yoksa kaynaklı tablolar + tek sütunlu "<Ekran> — <Alan>" adları), içlerinde
// kullanıcının verdiği GRUP (kaynak.grup; alfabetik, grubu olmayanlar en sonda "Diğer"; ekran adına göre gruplama YOK), grup sayıları,
// tüm gruplarda arama (grup adıyla da), açık / kapalı durumunun tarayıcıda hatırlanması, düzenleyicide Grup alanı (öneriler),
// grup kaydı / doğrulaması / toplu atama, 1440 / 1024 / 390'da taşma yok. Ayrı Nöbetçi (127.0.0.1), geçici DB.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

const PAROLA = `Gecici-Tablo-${randomBytes(6).toString('hex')}`;
const EKRAN_KLASORU = process.env.TABLO_GRUPLARI_EKRAN_KLASORU;
const UZUN_AD = 'Kurumsal müşteri bilgileri ve iletişim tercihleri (tümü)';
let nobetci: Nobetci;
let tarayici: Browser;
let klasor = '';
let projeId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'tablo-gruplari-'));
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  projeId = projeKaydet(vt, { ad: 'Tablo Projesi' });
  // Grup (kaynak.grup): kullanıcının verdiği alt grup; büyük / küçük harf farkı aynı grup sayılır.
  tabloKaydet(vt, { projeId, ad: 'Test kişileri', grup: 'Müşteri verileri', sutunlar: [{ ad: 'Ad' }, { ad: 'Soyad' }], satirlar: [{ degerler: { Ad: 'Deneme', Soyad: 'Kişi' } }] });
  tabloKaydet(vt, { projeId, ad: 'Başvuru — İl', grup: 'adres bilgileri', sutunlar: [{ ad: 'Değer' }], satirlar: [{ degerler: { Değer: 'Ankara' } }] });
  tabloKaydet(vt, { projeId, ad: 'Başvuru — Kanal', grup: 'Kanallar', sutunlar: [{ ad: 'Değer' }] });
  tabloKaydet(vt, { projeId, ad: 'Liste A', sutunlar: [{ ad: 'Değer' }], kaynak: { tur: 'paket', ekran: 'Fatura' } });
  // Tablo türü sezgiden önce gelir: paketten gelen kişi / kayıt tablosu (adı ve kaynağı ekran listesine benzese de) kayıt grubunda;
  // çok sütunlu ama türü "liste" olan tablo ekran listesidir.
  tabloKaydet(vt, { projeId, ad: 'Başvuru — Müşteri kayıtları', sutunlar: [{ ad: 'Ad' }], kaynak: { tur: 'paket', ekran: 'Başvuru', tabloTuru: 'kayit' } });
  tabloKaydet(vt, { projeId, ad: 'Adres kodları', grup: 'Adres bilgileri', sutunlar: [{ ad: 'İl' }, { ad: 'Kod' }], kaynak: { tur: 'kayit', ekran: 'Adres', tabloTuru: 'liste' } });
  // Eski veri (tür ve kaynak yok): çok sütunlu "<Ekran> — <…>" bağımlı listesi bir ekranın alan bağlarında kullanılıyorsa ya da
  // "<Ekran>" kısmı bir ekranın adıysa ekran listesidir; ikisi de değilse kayıt verisi kalır.
  const bagimli = tabloKaydet(vt, { projeId, ad: 'Rezervasyon (akış) — Kapsam, Alternatif, Ülke', sutunlar: [{ ad: 'Kapsam' }, { ad: 'Alternatif' }, { ad: 'Ülke' }],
    satirlar: Array.from({ length: 1192 }, (_, i) => ({ degerler: { Kapsam: `K${i % 9}`, Alternatif: `A${i % 5}`, Ülke: `Ü${i % 40}` } })) });
  ekranKaydet(vt, { projeId, anahtar: 'odeme', ad: 'Ödeme', ayarlar: { alanBaglari: { kapsam: { tablo: bagimli, sutun: 'Kapsam' } } } });
  ekranKaydet(vt, { projeId, anahtar: 'siparis-ekrani', ad: 'Sipariş ekranı' });
  tabloKaydet(vt, { projeId, ad: 'Sipariş ekranı (akış) — Tür, Alt tür', sutunlar: [{ ad: 'Tür' }, { ad: 'Alt tür' }] });
  tabloKaydet(vt, { projeId, ad: 'Rapor — Dönem, Tür', sutunlar: [{ ad: 'Dönem' }, { ad: 'Tür' }] });
  // Uzun adlar (liste paneli taşmamalı; ad "…" ile kısalır, tam ad ipucunda).
  tabloKaydet(vt, { projeId, ad: UZUN_AD, sutunlar: [{ ad: 'Ad' }, { ad: 'Kanal' }] });
  for (let i = 0; i < 40; i++) tabloKaydet(vt, { projeId, ad: `Abonelik yenileme ve güncelleme ekranı — Uzun alan adı ${i + 1}`.slice(0, 60), sutunlar: [{ ad: 'Değer' }] });
  projeKaydet(vt, { ad: 'Yeni boş proje' });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  const y = await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA });
  expect(y.basarili, y.mesaj).not.toBe(false);
  tarayici = await chromium.launch();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('gruplar, sayılar, arama ve hatırlanan açık / kapalı durumu; telefonda taşma yok', async () => {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  await page.goto('/#/veri');
  const liste = page.getByRole('navigation', { name: 'Tablolar' });
  const kayit = liste.getByRole('button', { name: /Kişi ve kayıt verileri/ });
  const ekran = liste.getByRole('button', { name: /^Ekran listeleri/ });
  await expect(kayit).toContainText('4');
  await expect(ekran).toContainText('46');
  const kayitGrubu = liste.getByRole('group', { name: 'Kişi ve kayıt verileri' });
  const ekranGrubu = liste.getByRole('group', { name: 'Ekran listeleri' });
  await expect(kayitGrubu.getByRole('group', { name: 'Müşteri verileri' })).toContainText('Test kişileri');
  await expect(kayitGrubu.getByRole('group', { name: 'Diğer' })).toContainText('Rapor — Dönem, Tür');
  await expect(kayitGrubu.getByRole('group', { name: 'Diğer' })).toContainText('Başvuru — Müşteri kayıtları');
  // Alt gruplar alfabetik, "Diğer" en sonda; büyük / küçük harf farkı aynı grup (ilk görülen yazım).
  const altAdlar = (kap: typeof ekranGrubu) => kap.locator(':scope > .tablo-grubu > .tablo-grubu-baslik .tablo-grubu-adi').allTextContents();
  expect(await altAdlar(ekranGrubu)).toEqual(['Adres bilgileri', 'Kanallar', 'Diğer']);
  expect(await altAdlar(kayitGrubu)).toEqual(['Müşteri verileri', 'Diğer']);
  await expect(ekranGrubu.getByRole('button', { name: /^Adres bilgileri\s*2$/ })).toBeVisible();
  await expect(ekranGrubu.getByRole('group', { name: 'Adres bilgileri' })).toContainText('Adres kodları');
  await expect(ekranGrubu.getByRole('group', { name: 'Diğer' })).toContainText('Rezervasyon (akış) — Kapsam, Alternatif, Ülke');
  await expect(ekranGrubu.getByRole('group', { name: 'Diğer' })).toContainText('Liste A');
  // Ekran adına göre alt grup YOK (kaynak ekranı ya da "<Ekran> — <Alan>" adı grup olmaz).
  for (const ad of ['Fatura', 'Başvuru', 'Adres', 'Rezervasyon (akış)', 'Sipariş ekranı (akış)', 'Abonelik yenileme ve güncelleme ekranı', 'Diğer ekranlar']) {
    await expect(liste.getByRole('group', { name: ad, exact: true })).toHaveCount(0);
  }
  // Kapat → yeniden yükleyince kapalı kalır (seçili tablonun grubu ise hep açık gelir).
  const kanallar = ekranGrubu.getByRole('button', { name: /^Kanallar\s*1$/ });
  await kanallar.click();
  await expect(kanallar).toHaveAttribute('aria-expanded', 'false');
  await expect(ekranGrubu.getByRole('group', { name: 'Kanallar' })).toBeHidden();
  await page.reload();
  await expect(ekranGrubu.getByRole('button', { name: /^Kanallar\s*1$/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(ekranGrubu.getByRole('button', { name: /^Adres bilgileri\s*2$/ })).toHaveAttribute('aria-expanded', 'true');
  // Arama tüm gruplarda çalışır (grup adıyla da); eşleşen grup açılır.
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('kanallar');
  await expect(ekranGrubu.getByRole('group', { name: 'Kanallar' })).toBeVisible(); // kapalı grup aramada açılır
  await expect(liste.locator('.tablo-ogesi:visible')).toHaveCount(1);
  await expect(liste.locator('.tablo-ogesi')).toContainText('Başvuru — Kanal');
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('liste a');
  await expect(ekranGrubu).toContainText('Liste A'); // yalnız grupsuz tablo kalınca alt grup başlığı olmadan düz liste
  await expect(liste.locator('.tablo-ogesi:visible')).toHaveCount(1);
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('yok-boyle-tablo');
  await expect(liste).toContainText('Aramayla eşleşen tablo yok.');
  await liste.getByRole('searchbox', { name: 'Tablolarda ara' }).fill('');
  expect(hatalar).toEqual([]);
  await baglam.close();
});

test('düzenleyicide Grup alanı: var olan gruplar öneri, yeni ad yazılır, kaydedince liste o grupta gösterir; boşaltınca "Diğer"', async () => {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  await page.goto('/#/veri');
  const liste = page.getByRole('navigation', { name: 'Tablolar' });
  const ekranGrubu = liste.getByRole('group', { name: 'Ekran listeleri' });
  await liste.locator('.tablo-ogesi').filter({ hasText: 'Liste A' }).click();
  const duz = page.getByRole('region', { name: 'Tablo düzenleyici' });
  const grup = duz.getByRole('combobox', { name: 'Grup' });
  await expect(grup).toHaveValue('');
  await expect(grup).toHaveAttribute('maxlength', '40');
  // Öneriler: var olan grup adları (tekrarsız, alfabetik).
  const oneriler = await grup.evaluate((g) => [...((g as HTMLInputElement).list?.options ?? [])].map((o) => o.value));
  expect(oneriler).toEqual(['Adres bilgileri', 'Kanallar', 'Müşteri verileri']);
  // Kaynak ekran bilgisi ayrıntıda kalır.
  await expect(duz.locator('.tablo-kaynagi')).toContainText('Fatura');
  await grup.fill('Faturalar');
  await duz.getByRole('button', { name: 'Kaydet' }).click();
  await expect(ekranGrubu.getByRole('group', { name: 'Faturalar' })).toContainText('Liste A');
  const t = ((await nobetciApi(nobetci, `/platform/tablolar?projeId=${projeId}`)).tablolar as Array<Record<string, any>>).find((x) => x.ad === 'Liste A');
  expect(t?.kaynak).toMatchObject({ tur: 'paket', ekran: 'Fatura', grup: 'Faturalar' });
  // Boşaltınca grup kalkar: "Diğer" altına döner; kaynağın diğer bilgileri korunur.
  await grup.fill('');
  await duz.getByRole('button', { name: 'Kaydet' }).click();
  await expect(ekranGrubu.getByRole('group', { name: 'Faturalar' })).toHaveCount(0);
  await expect(ekranGrubu.getByRole('group', { name: 'Diğer' })).toContainText('Liste A');
  const t2 = ((await nobetciApi(nobetci, `/platform/tablolar?projeId=${projeId}`)).tablolar as Array<Record<string, any>>).find((x) => x.ad === 'Liste A');
  expect(t2?.kaynak).toMatchObject({ tur: 'paket', ekran: 'Fatura' });
  expect(t2?.kaynak?.grup).toBeUndefined();
  expect(hatalar).toEqual([]);
  await baglam.close();
});

test('API: grup kaydı / okuma, uzunluk doğrulaması, toplu atama (/platform/tablo/grup-ata)', async () => {
  const tablolar = async () => (await nobetciApi(nobetci, `/platform/tablolar?projeId=${projeId}`)).tablolar as Array<Record<string, any>>;
  const rapor = (await tablolar()).find((x) => x.ad === 'Rapor — Dönem, Tür') as Record<string, any>;
  const govde = { projeId, id: rapor.id, ad: rapor.ad, sutunlar: rapor.sutunlar.map((s: Record<string, any>) => ({ ad: s.ad, eskiAd: s.ad, gizli: s.gizli })) };
  // 40 karakter olur (boşluklar kırpılır); 41 karakter reddedilir, hiçbir şey yazılmaz.
  const kirk = 'Ç'.repeat(40);
  let y = await nobetciApi(nobetci, '/platform/tablo/kaydet', { ...govde, grup: `  ${kirk}  ` });
  expect(y.mesaj).toBeUndefined();
  expect((y.tablo as Record<string, any>).kaynak?.grup).toBe(kirk);
  y = await nobetciApi(nobetci, '/platform/tablo/kaydet', { ...govde, grup: `${kirk}x` });
  expect(String(y.mesaj)).toContain('en çok 40');
  y = await nobetciApi(nobetci, '/platform/tablo/kaydet', { ...govde, grup: 42 });
  expect(String(y.mesaj)).toContain('metin');
  expect((await tablolar()).find((x) => x.id === rapor.id)?.kaynak?.grup).toBe(kirk);
  // Grup verilmeyen kayıt grubu değiştirmez; tür değişikliği grubu korur.
  y = await nobetciApi(nobetci, '/platform/tablo/kaydet', { ...govde, tur: 'kayit' });
  expect((y.tablo as Record<string, any>).kaynak).toMatchObject({ tabloTuru: 'kayit', grup: kirk });
  // Toplu atama: birden çok tabloya tek istekte; null grubu kaldırır; bilinmeyen tablo reddedilir (hiçbir şey yazılmaz).
  const kodlar = (await tablolar()).find((x) => x.ad === 'Adres kodları') as Record<string, any>;
  y = await nobetciApi(nobetci, '/platform/tablo/grup-ata', { projeId, tabloIdler: [rapor.id, kodlar.id], grup: 'Ortak' });
  expect(y).toMatchObject({ guncellenen: 2, grup: 'Ortak' });
  const sonra = await tablolar();
  expect(sonra.find((x) => x.id === rapor.id)?.kaynak).toMatchObject({ tabloTuru: 'kayit', grup: 'Ortak' });
  expect(sonra.find((x) => x.id === kodlar.id)?.kaynak).toMatchObject({ tur: 'kayit', ekran: 'Adres', tabloTuru: 'liste', grup: 'Ortak' });
  y = await nobetciApi(nobetci, '/platform/tablo/grup-ata', { projeId, tabloIdler: [rapor.id, 'yok-boyle-tablo'], grup: 'Başka' });
  expect(String(y.mesaj)).toContain('bulunamadı');
  expect((await tablolar()).find((x) => x.id === rapor.id)?.kaynak?.grup).toBe('Ortak');
  y = await nobetciApi(nobetci, '/platform/tablo/grup-ata', { projeId, tabloIdler: [rapor.id, kodlar.id], grup: 'x'.repeat(41) });
  expect(String(y.mesaj)).toContain('en çok 40');
  y = await nobetciApi(nobetci, '/platform/tablo/grup-ata', { projeId, tabloIdler: [rapor.id], grup: null });
  expect(y).toMatchObject({ guncellenen: 1, grup: null });
  expect((await tablolar()).find((x) => x.id === rapor.id)?.kaynak).toEqual({ tabloTuru: 'kayit' });
  // Önceki duruma dön (sonraki testler Adres kodları'nı "Adres bilgileri"nde bekler).
  await nobetciApi(nobetci, '/platform/tablo/grup-ata', { projeId, tabloIdler: [kodlar.id], grup: 'Adres bilgileri' });
});

test('uzun adlar ve büyük tablo: liste paneli taşmaz (ad "…" + tam ad ipucu), sayfa yatay kaymaz; 1440 / 1024 / 390', async () => {
  test.setTimeout(90_000);
  for (const [genislik, yukseklik] of [[1440, 900], [1024, 800], [390, 844]] as const) {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik } });
    const page = await baglam.newPage();
    await page.goto('/#/veri');
    const liste = page.getByRole('navigation', { name: 'Tablolar' });
    const uzun = liste.locator('.tablo-ogesi').filter({ hasText: UZUN_AD });
    await expect(uzun.locator('.tablo-adi')).toHaveAttribute('title', UZUN_AD);
    await liste.locator('.tablo-ogesi').filter({ hasText: 'Rezervasyon (akış) — Kapsam' }).click();
    await expect(page.getByRole('region', { name: 'Tablo düzenleyici' }).getByLabel('1. satır Kapsam', { exact: true })).toHaveValue('K0');
    const olcum = await page.evaluate(() => {
      const panel = document.querySelector('.tablo-listesi') as HTMLElement;
      const p = panel.getBoundingClientRect();
      const tasan = [...panel.querySelectorAll('.tablo-ogesi, .tablo-adi, .tablo-grubu-baslik, .adet')].filter((e) => e.getBoundingClientRect().right > p.right + 1).length;
      const kisalan = [...panel.querySelectorAll('.tablo-adi-metni')].some((e) => e.scrollWidth > e.clientWidth);
      const duz = document.querySelector('.tablo-duzenleyici') as HTMLElement;
      const grupAlani = (document.querySelector('.tablo-grubu-alani') as HTMLElement).getBoundingClientRect();
      const d = duz.getBoundingClientRect();
      return {
        sayfa: document.documentElement.scrollWidth - innerWidth, tasan, kisalan, duzSag: Math.round(duz.getBoundingClientRect().right - innerWidth),
        grupTasar: grupAlani.right > d.right + 1 || grupAlani.width < 100
      };
    });
    expect(olcum, `${genislik}px`).toMatchObject({ tasan: 0, kisalan: true, grupTasar: false });
    expect(olcum.sayfa, `${genislik}px sayfa taşması`).toBeLessThanOrEqual(2);
    expect(olcum.duzSag, `${genislik}px düzenleyici sağdan kesilmez`).toBeLessThanOrEqual(0);
    if (EKRAN_KLASORU) {
      for (const renk of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: renk });
        await page.screenshot({ path: join(EKRAN_KLASORU, `test-verisi-${genislik}-${renk === 'dark' ? 'koyu' : 'acik'}.png`) });
      }
    }
    await baglam.close();
  }
});

test('hiç tablo yokken: boş grup başlığı yok, tek boş durum mesajı', async () => {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } });
  const page = await baglam.newPage();
  await page.goto('/#/veri');
  await page.locator('.proje-secici').click();
  await page.locator('.proje-menusu').getByRole('menuitemradio', { name: 'Yeni boş proje' }).click();
  await expect(page.locator('#proje-rozeti')).toHaveText('Yeni boş proje');
  await page.evaluate(() => { location.hash = '#/veri'; });
  const liste = page.getByRole('navigation', { name: 'Tablolar' });
  await expect(liste.getByRole('button', { name: 'Tablo ekle' })).toBeVisible();
  await expect(liste.locator('.tablo-grubu')).toHaveCount(0);
  await expect(liste.getByRole('searchbox')).toBeHidden();
  await expect(page.getByText('Henüz tablo yok.')).toHaveCount(1);
  await expect(page.getByText('Tablo yok.', { exact: true })).toHaveCount(0);
  await baglam.close();
});
