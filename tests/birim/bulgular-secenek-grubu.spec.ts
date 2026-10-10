// KORUMA TESTLERİ — Değişiklikler (bulgular.js): aynı alanın çok sayıda yeni / kaldırılan seçenek bulgusu alan başlığı altında
// toplanır (alan · N yeni seçenek · yol), "Hepsini kabul et (N)" / "Hepsini reddet (N)" onay sorar ve YALNIZ o alanın bulgularına
// satırdaki Kabul et / Reddet ile aynı taslak kararı verir; liste ilk 5 satır + "Tümünü göster (N)". Tablo notu tablo ve sütunu adıyla
// yazar; "eklendi" yalnız uygulanmış analizin tablo sonucu söylüyorsa görünür. Analiz yanıtı ve "Uygula" isteği sayfada taklit edilir
// (gerçek Nöbetçi sunucusu 127.0.0.1'de; dış istek yok).
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type Browser, type Page, type Route } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { ornekBasvuruModeli } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

type Nesne = Record<string, unknown>;
let tarayici: Browser;
let nobetci: Nobetci;
let klasor: ReturnType<typeof geciciKlasor>;
let ekranId = '';

const ULKELER = ['ARJANTİN', 'BREZİLYA', 'ŞİLİ', 'KOLOMBİYA', 'PERU', 'URUGUAY', 'PARAGUAY', 'BOLİVYA', 'EKVADOR', 'VENEZUELA', 'GUYANA', 'SURİNAM'];
const ULKE_KONUMU = '2. Kişi bilgileri › Kişi › Ülke';

/** Taklit analiz: Ülke alanında 12 yeni seçenek (tabloya eklenebilir), Şehir alanında 2 (tablo çok sütunlu), tek kaldırılan seçenek, bir yeni alan. */
function bulgular(): Nesne[] {
  const ulke = ULKELER.map((m, i) => ({
    id: `u${i}`, tur: 'yeniSecenek', alanId: 'ulke', baslik: `Yeni seçenek: ${m}`, konum: ULKE_KONUMU, secenek: { deger: m, metin: m },
    tabloOnerisi: { bulguId: `u${i}`, tabloId: 't1', tabloAd: 'Kişi listesi', sutun: 'Ülke', islem: 'ekle', deger: m, metin: m, uygulanabilir: true }
  }));
  const sehir = ['ANKARA', 'İZMİR'].map((m, i) => ({
    id: `s${i}`, tur: 'yeniSecenek', alanId: 'sehir', baslik: `Yeni seçenek: ${m}`, konum: '2. Kişi bilgileri › Adres › Şehir', secenek: { deger: m, metin: m },
    tabloOnerisi: { bulguId: `s${i}`, tabloId: 't2', tabloAd: 'Adres', sutun: 'Şehir', islem: 'ekle', deger: m, metin: m, uygulanabilir: false, nedenKodu: 'cokSutun', neden: 'tabloda birden çok sütun var' }
  }));
  return [
    ...ulke, ...sehir,
    { id: 'k0', tur: 'kaldirilanSecenek', alanId: 'tur', baslik: 'Kaldırılan seçenek: ESKİ', konum: '1. Başlangıç › Genel › Tür', secenek: { deger: 'ESKI', metin: 'ESKİ' } },
    { id: 'y0', tur: 'yeniAlan', alanId: 'not', baslik: 'Yeni alan: Not', konum: '1. Başlangıç › Genel' }
  ];
}

function analizYaniti(uygulandi: boolean, kararlar: Record<string, string> = {}): Nesne {
  const zaman = new Date().toISOString();
  return {
    basarili: true, ekran: { id: ekranId, ad: 'Örnek Başvuru', anahtar: 'ornek-basvuru' }, guncelSurum: uygulandi ? 2 : 1, reddedilenSayisi: 0,
    analiz: {
      id: 'analiz-1', durum: uygulandi ? 'uygulandi' : 'bekliyor', zaman, uygulanma: uygulandi ? zaman : null, tabanSurum: 1, sonucSurum: uygulandi ? 2 : null,
      meta: { olusturan: 'test', olusturulma: zaman, baglamProfilleri: [] }, gizlenenSayisi: 0, gizlenenler: [], gerekenAyarlar: [], bilinmeyenler: [],
      senaryoOneriSayisi: 0, kanitlar: [], profiller: [], tabloSonucuKayitli: uygulandi,
      bulgular: bulgular().map((b) => ({
        ...b, karar: uygulandi ? kararlar[String(b.id)] ?? null : null,
        ...(uygulandi && b.tabloOnerisi ? { tabloSonucu: kararlar[String(b.id)] === 'kabul' && (b.tabloOnerisi as Nesne).uygulanabilir ? { durum: 'eklendi' } : null } : {})
      })),
      ozet: { turler: { yeniSecenek: 14, kaldirilanSecenek: 1, yeniAlan: 1 } }, etki: [], senaryoSayisi: 0, atlananlar: []
    }
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = geciciKlasor('bulgular-secenek-grubu');
  const vtYolu = join(klasor.yol, 'platform.db');
  const parola = randomBytes(18).toString('base64url');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  const projeId = projeKaydet(vt, { ad: 'Örnek Proje' });
  ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
  ekranId = ekranKaydet(vt, { projeId, anahtar: 'ornek-basvuru', ad: 'Örnek Başvuru' });
  ekranModeliEkle(vt, { ekranId, model: ornekBasvuruModeli() });
  vt.kapat();
  nobetci = await nobetciBaslat(klasor.yol, vtYolu, { TEST_SUNUCU_KOSU_KAPALI: '1' });
  expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola })).basarili).toBe(true);
  tarayici = await korumaliTarayici();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  klasor?.temizle();
});

async function sayfa(): Promise<{ page: Page; istekler: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1360, height: 1000 } });
  const istekler: string[] = [];
  baglam.on('request', (r) => { istekler.push(r.url()); });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(String(e)));
  page.on('close', () => expect(hatalar, 'sayfa hataları').toEqual([]));
  return { page, istekler };
}

test('seçenek grubu: alan başlığı, ilk 5 + "Tümünü göster", tablo notu adıyla; onaylı "Hepsini kabul et" yalnız o alana; Uygula gövdesi ve sonrası "eklendi"', async () => {
  test.setTimeout(90_000);
  const { page, istekler } = await sayfa();
  let uygulanan: Nesne | null = null;
  await page.route(/\/platform\/ekran\/analiz\?/, (r: Route) => r.fulfill({
    json: uygulanan ? analizYaniti(true, Object.fromEntries([...(uygulanan.kabul as string[]).map((id) => [id, 'kabul']), ...(uygulanan.red as string[]).map((id) => [id, 'red'])])) : analizYaniti(false)
  }));
  await page.route(/\/platform\/ekran\/analiz\/uygula$/, async (r: Route) => {
    uygulanan = JSON.parse(r.request().postData() || '{}') as Nesne;
    await r.fulfill({ json: { basarili: true, surum: 2, yeniSurum: true, kabul: 11, red: 1, kararsiz: 4, baglanan: 0, tabloyaEklenen: 11, tablodanSilinen: 0 } });
  });
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/bulgular`);
  await expect(page.getByRole('heading', { name: 'Değişiklikler', level: 2 })).toBeVisible();

  // Alan başlığı: "Ülke · 12 yeni seçenek · yol"; ilk 5 satır görünür, "Tümünü göster (12)" hepsini açar, "Daha az göster" kapatır.
  const ulke = page.getByRole('group', { name: 'Ülke · 12 yeni seçenek' });
  await expect(ulke.locator('.secenek-grup-basligi .grup-metni')).toHaveText('Ülke · 12 yeni seçenek · 2. Kişi bilgileri › Kişi');
  await expect(ulke.locator('.bulgu-satiri')).toHaveCount(5);
  await ulke.getByRole('button', { name: 'Tümünü göster (12)' }).click();
  await expect(ulke.locator('.bulgu-satiri')).toHaveCount(12);
  await expect(ulke.getByRole('button', { name: 'Daha az göster' })).toBeFocused();
  await ulke.getByRole('button', { name: 'Daha az göster' }).click();
  await expect(ulke.locator('.bulgu-satiri')).toHaveCount(5);
  // Grup içindeki satırlarda konum ve tablo notu tekrar edilmez (başlıkta bir kez).
  await expect(ulke.locator('.bulgu-satiri small')).toHaveCount(0);
  await expect(ulke.locator('.bulgu-satiri .bulgu-tablo')).toHaveCount(0);
  // Tablo seçimi grup başına bir kez: tablo ve sütun adıyla; işaret kaldırılınca not değişir.
  const tabloKutusu = ulke.getByRole('checkbox', { name: /Tabloya da ekle \(12\)/ });
  await expect(tabloKutusu).toBeChecked();
  await expect(ulke.locator('.secenek-grup-basligi .bulgu-tablo')).toContainText('Kabul ederseniz 12 değer "Kişi listesi" tablosunun "Ülke" sütununa satır olarak eklenecek.');
  await tabloKutusu.uncheck();
  await expect(ulke.locator('.secenek-grup-basligi .bulgu-tablo')).toContainText('Tabloya eklenmeyecek (işaret kaldırıldı); kabul ederseniz yalnız ekran modeli güncellenir.');
  await tabloKutusu.check();

  // Uygulanamaz tablo: neden + ne yapılacağı, tablo / sütun adıyla; "Test verisi" bağlantı. İki bulgulu alanda "Tümünü göster" yok.
  const sehir = page.getByRole('group', { name: 'Şehir · 2 yeni seçenek' });
  await expect(sehir.locator('.bulgu-satiri')).toHaveCount(2);
  await expect(sehir.getByRole('button', { name: /Tümünü göster/ })).toHaveCount(0);
  await expect(sehir.locator('.secenek-grup-basligi .bulgu-tablo')).toHaveText(' Tabloya eklenmeyecek: "Adres" tablosunda birden çok sütun var. Kabul ederseniz yalnız ekran modeli güncellenir. '
    + 'Bu değerlerle test etmek isterseniz satırları Test verisi > "Adres" tablosuna ekleyin ("Şehir" sütunu).');
  await expect(sehir.getByRole('link', { name: 'Test verisi' })).toHaveAttribute('href', '#/veri');
  // Tek bulgulu alan grup olmaz (düz satır, konumuyla).
  const tek = page.locator('.bulgu-satiri[data-bulgu="k0"]');
  await expect(tek.locator('small').first()).toHaveText('1. Başlangıç › Genel › Tür');
  await expect(page.getByRole('group', { name: /Tür ·/ })).toHaveCount(0);

  // "Hepsini kabul et (12)": önce onay; Vazgeç hiçbir karar vermez.
  const hepsiniKabul = ulke.getByRole('button', { name: 'Ülke: Hepsini kabul et (12)' });
  await hepsiniKabul.click();
  const onay = page.getByRole('dialog', { name: 'Ülke: 12 yeni seçenek kabul edilsin mi?' });
  await expect(onay).toBeVisible();
  await expect(onay).toContainText('12 seçenek ekran modeline eklenmek üzere işaretlenir; kalıcı olması için alttaki "Uygula"ya basın.');
  await expect(onay).toContainText('Kabul ederseniz 12 değer "Kişi listesi" tablosunun "Ülke" sütununa satır olarak eklenecek.');
  await expect(onay.locator('.onay-listesi li')).toHaveCount(12);
  await onay.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(onay).toHaveCount(0);
  await expect(page.locator('.bulgu-satiri.karar-kabul')).toHaveCount(0);
  await hepsiniKabul.click();
  await onay.getByRole('button', { name: 'Hepsini kabul et (12)' }).click();
  await expect(page.locator('#bildirimler')).toContainText('12 seçenek kabul edildi');
  // Yalnız Ülke alanının 12 bulgusu (gizli satırlar dahil) kabul; diğer alanlar karar bekliyor.
  await ulke.getByRole('button', { name: 'Tümünü göster (12)' }).click();
  await expect(ulke.locator('.bulgu-satiri.karar-kabul')).toHaveCount(12);
  await expect(page.locator('.bulgu-satiri.karar-kabul')).toHaveCount(12);
  await expect(sehir.locator('.bulgu-satiri[class*="karar-"]')).toHaveCount(0);
  await expect(page.locator('.secim-sayaci')).toHaveText('12 kabul · 0 red · 4 karar bekliyor');
  // Tek tek karar hâlâ mümkün: bir satır reddedilir.
  await ulke.locator('.bulgu-satiri[data-bulgu="u0"]').getByRole('button', { name: 'Reddet' }).click();
  await expect(page.locator('.secim-sayaci')).toHaveText('11 kabul · 1 red · 4 karar bekliyor');
  await expect(ulke.locator('.grup-metni')).toContainText('· 0 karar bekliyor');

  // Uygula: tek istek; kabul / red / tablo listeleri tek satırdaki kararlarla aynı biçimde.
  await page.getByRole('button', { name: 'Uygula', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kararları uygula' }).click();
  await expect(page.locator('#bildirimler')).toContainText('Tabloya 11 seçenek eklendi.');
  const govde = uygulanan as unknown as { kabul: string[]; red: string[]; tablo: string[] };
  expect(govde.kabul.sort()).toEqual(ULKELER.map((_, i) => `u${i}`).filter((id) => id !== 'u0').sort());
  expect(govde.red).toEqual(['u0']);
  expect(govde.tablo.sort()).toEqual(govde.kabul.sort());

  // Uygulandıktan sonra: toplu düğme yok; not gerçekte ne olduğunu yazar.
  await expect(page.locator('.secenek-grup-basligi .grup-dugmeleri')).toHaveCount(0);
  await expect(page.locator('.bulgu-satiri[data-bulgu="u1"] .bulgu-tablo')).toHaveText(' "Kişi listesi" tablosunun "Ülke" sütununa satır olarak eklendi.');
  await expect(page.locator('.bulgu-satiri[data-bulgu="u0"] .bulgu-tablo')).toHaveText(' Kabul edilmediği için "Kişi listesi" tablosu değişmedi.');
  await expect(page.locator('.bulgu-satiri[data-bulgu="s0"] .bulgu-tablo')).toHaveText(' Kabul edilmediği için "Adres" tablosu değişmedi.');
  expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
  await page.close();
});

test('"Hepsini reddet (N)" de onay sorar ve yalnız o alanın bulgularını reddeder', async () => {
  const { page } = await sayfa();
  await page.route(/\/platform\/ekran\/analiz\?/, (r: Route) => r.fulfill({ json: analizYaniti(false) }));
  await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/bulgular`);
  const sehir = page.getByRole('group', { name: 'Şehir · 2 yeni seçenek' });
  await sehir.getByRole('button', { name: 'Şehir: Hepsini reddet (2)' }).click();
  const onay = page.getByRole('dialog', { name: 'Şehir: 2 yeni seçenek reddedilsin mi?' });
  await expect(onay).toContainText('2 değişiklik reddedilmek üzere işaretlenir');
  await onay.getByRole('button', { name: 'Hepsini reddet (2)' }).click();
  await expect(sehir.locator('.bulgu-satiri.karar-red')).toHaveCount(2);
  await expect(page.locator('.bulgu-satiri.karar-red')).toHaveCount(2);
  await expect(page.locator('.bulgu-satiri.karar-kabul')).toHaveCount(0);
  await expect(page.locator('#bildirimler')).toContainText('2 seçenek reddedildi');
  // 390px: başlık ve düğmeler taşmaz.
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.close();
});
