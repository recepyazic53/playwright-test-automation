// UÇTAN UCA (yerel) — kod bilmeyen kullanıcı için koşulabilir test: otomatik tarama (keşif varsayılan açık: radyo / onay kutusu
// koşulları, İl → İlçe) → "Düğmeyi ve sonucu işaretle" ("Sayfada seç": görünür tarayıcıda tıklayarak; tıklama sayfaya iletilmez,
// seçiciyi Nöbetçi üretir) → paket → kabul → Dene ("Hesapla"ya basar, sonucu doğrular). Akış diyagramında "Sayfada seç".
// Kullanıcının yerini bu test alır: seçim tarayıcısına (alt süreç, başsız) yerel uzaktan hata ayıklama portundan bağlanıp panele basar.
//
// Güvenlik: şirket sitesine HİÇBİR istek gitmez — ortamın adresi 127.0.0.1'deki sahte fiyat formudur (hesap-formu-fikstur.ts),
// tarayıcı yalnızca bu kökene bağlanabilir (NOBETCI_TARAMA_IZINLI_KOKENLER; DNS kapalı). Geçici veritabanı ve ayrı Nöbetçi örneği;
// veri/ klasörüne dokunulmaz. Kayıt oluşturan "Kaydet" düğmesine ne keşifte ne seçimde basılmadığı fikstürün sayaçlarıyla kanıtlanır.
// KU_TARAMA_EKRAN_KLASORU verilirse ekran görüntüleri (sahte veri) oraya yazılır (inceleme için; üründe yok).
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { HESAP_KULLANICI, HESAP_PAROLA, HesapFormuUygulamasi, hesapGirisTarifi } from './hesap-formu-fikstur';
import { bosPort, nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Secim-${randomBytes(6).toString('hex')}`;
const EKRAN_KLASORU = process.env.KU_TARAMA_EKRAN_KLASORU;
async function goruntu(l: { screenshot: (o: { path: string }) => Promise<unknown> }, ad: string): Promise<void> {
  if (!EKRAN_KLASORU) return;
  mkdirSync(EKRAN_KLASORU, { recursive: true });
  await l.screenshot({ path: join(EKRAN_KLASORU, ad) });
}

let nobetci: Nobetci;
let uygulama: HesapFormuUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let cdpPortu = 0;
let projeId = '';
let ortamId = '';
let canliOrtamId = '';
let taramaIsId = '';
let secilenler: Nesne[] = [];
let ekranId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''}`).toBe(true);
  return y;
}
const isDurumu = async (id: string): Promise<Nesne> => (await api(`/platform/tarama/durum?id=${id}`)).is as Nesne;
async function isBitti(id: string, sn = 90): Promise<Nesne> {
  let d = await isDurumu(id);
  for (const son = Date.now() + sn * 1000; d.durum === 'suruyor' && Date.now() < son; d = await isDurumu(id)) await new Promise((c) => setTimeout(c, 250));
  return d;
}
/** Kayıt sayacları: kayıt oluşturan düğmeye basılmadı, form gönderilmedi. */
const kayitYok = (): void => {
  expect(uygulama.kayitBasmalari, 'Kaydet düğmesine basıldı').toBe(0);
  expect(uygulama.kayitGonderimleri, 'Kayıt formu gönderildi').toBe(0);
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'oge-secme-'));
  uygulama = new HesapFormuUygulamasi();
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
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Seçim Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  canliOrtamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Canlı kopya', tabanUrl: fikstur.adres, riskli: true })).ortam as Nesne).id);
  await basarili('/platform/giris-profili/kaydet', { projeId, ad: 'Deneme kullanıcısı', kullaniciAdi: HESAP_KULLANICI, parola: HESAP_PAROLA, ikiAsamaliTur: 'yok' });
  for (const o of [ortamId, canliOrtamId]) await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId: o, tarif: hesapGirisTarifi() });
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

/** Seçim tarayıcısına bağlanır ve panelin açıldığı hedef sayfayı bulur. */
async function secimSayfasi(isId: string): Promise<{ tarayici: Browser; sayfa: Page; panel: Locator }> {
  const son = Date.now() + 60_000;
  let tarayici: Browser | null = null;
  while (!tarayici) {
    try { tarayici = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPortu}`); } catch {
      if (Date.now() > son) throw new Error(`seçim tarayıcısına bağlanılamadı: ${JSON.stringify(await isDurumu(isId))}`);
      await new Promise((c) => setTimeout(c, 250));
    }
  }
  for (;;) {
    const d = await isDurumu(isId);
    const sayfa = tarayici.contexts().flatMap((b) => b.pages()).find((p) => p.url().includes('/hesap/'));
    if (sayfa && d.adimlar.find((a: Nesne) => a.anahtar === 'secim')?.mesaj?.startsWith('Tarayıcıda “Öğe seç” açık')) {
      const panel = sayfa.locator('#nobetci-secim-paneli');
      await expect(panel.getByText('Nöbetçi · Sayfada seç')).toBeVisible();
      return { tarayici, sayfa, panel };
    }
    if (d.durum !== 'suruyor' || Date.now() > son) throw new Error(`seçim sayfası açılmadı: ${JSON.stringify(d)}`);
    await new Promise((c) => setTimeout(c, 250));
  }
}

/** Seçim açıkken öğeye tıklar, türünü seçer ve ekler. */
async function sec(sayfa: Page, panel: Locator, secici: string, tur: string): Promise<void> {
  await sayfa.click(secici);
  await expect(panel.getByText('Bu öğe nedir?')).toBeVisible();
  await panel.getByRole('radio', { name: tur }).check();
  await panel.getByRole('button', { name: 'Ekle', exact: true }).click();
  await expect(panel.getByText('Eklendi.', { exact: false })).toBeVisible();
}

test('CANLI ortamda keşif ayrıca onay ister (tarayıcı açılmadan); öğe seçme de CANLI onayı ister', async () => {
  const once = uygulama.istekler.length;
  const govde = { projeId, ekranAdi: 'Canlı deneme', ortamId: canliOrtamId, hedef: '/hesap/', onay: true, canliOnay: true };
  expect(await api('/platform/tarama/baslat', govde)).toMatchObject({ basarili: false, kod: 'KESIF_CANLI_ONAY' });
  expect(await api('/platform/tarama/baslat', { kip: 'ogeSecme', projeId, ekranAdi: 'X', ortamId: canliOrtamId, hedef: '/hesap/', onay: true }))
    .toMatchObject({ basarili: false, kod: 'CANLI_ONAY_GEREKLI' });
  expect(await api('/platform/tarama/baslat', { kip: 'ogeSecme', projeId, ekranAdi: 'X', ortamId, hedef: '/hesap/' })).toMatchObject({ basarili: false, kod: 'ONAY_GEREKLI' });
  expect(uygulama.istekler.length).toBe(once);
});

test('tarama (keşif varsayılan açık): koşullu alanlar ve bağımlı liste bulunur, onaya sunulur; kayıt düğmesine basılmaz', async () => {
  test.setTimeout(120_000);
  const b = await basarili('/platform/tarama/baslat', { projeId, ekranAdi: 'Fiyat Hesaplama', ortamId, hedef: '/hesap/', onay: true });
  taramaIsId = String(b.isId);
  const d = await isBitti(taramaIsId);
  expect(d, JSON.stringify(d.hata)).toMatchObject({ durum: 'tamam', paketHazir: true, kesif: true, ozet: { kosulSayisi: 3, bagimlilikSayisi: 1 } });
  const v = await api(`/platform/tarama/isaretler?id=${taramaIsId}`);
  expect((v.bulgular as Nesne[]).map((x) => x.anahtar)).toEqual(['gorunurluk:vergiNo', 'gorunurluk:unvan', 'gorunurluk:paketTuru', 'bagimlilik:ilce']);
  expect(v).toMatchObject({ ortam: { id: ortamId, canli: false }, hedefYol: '/hesap/', girissiz: false, ogeler: [] });
  kayitYok();
  expect(uygulama.hesaplamalar).toEqual([]);
});

test('Sayfada seç: düğme, sonuç ve alan tıklanarak seçilir; seçici üretilir; seçim açıkken tıklama sayfaya iletilmez', async () => {
  test.setTimeout(180_000);
  const b = await basarili('/platform/tarama/baslat', { kip: 'ogeSecme', projeId, ekranAdi: 'Fiyat Hesaplama', ortamId, hedef: '/hesap/', onay: true });
  const isId = String(b.isId);
  const { tarayici, sayfa, panel } = await secimSayfasi(isId);
  try {
    // Seçim açık: "Hesapla"ya tıklamak hesaplamaz (istek gitmez), öğe seçilir; türü önerilen "Düğme".
    await sayfa.click('#hesapla');
    await expect(panel.getByText('Bu öğe nedir?')).toBeVisible();
    await expect(panel.getByRole('radio', { name: 'Düğme (aksiyon)' })).toBeChecked();
    await goruntu(panel.locator('.p'), '01-panel-tur-secimi.png');
    await panel.getByRole('button', { name: 'Ekle', exact: true }).click();
    await expect(panel.getByRole('list', { name: 'Seçilen öğeler' })).toContainText('role=button[name="Hesapla"]');
    expect(uygulama.hesaplamalar).toEqual([]);
    // Kayıt düğmesine seçim açıkken tıklamak da sayfaya gitmez (Vazgeç).
    await sayfa.click('#kaydet');
    await panel.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(sayfa.locator('#kaydet')).toBeVisible();
    kayitYok();
    // Seçim kapalı: kullanıcı sonucu görmek için hesaplar (GET gider; kayıt oluşturan istek yok).
    await panel.getByRole('button', { name: 'Öğe seçmeyi durdur' }).click();
    await sayfa.selectOption('#il', '06');
    await sayfa.click('#hesapla');
    await expect(sayfa.locator('#sonuc')).toHaveText('Tutar: 1.234 TL');
    expect(uygulama.hesaplamalar).toHaveLength(1);
    await panel.getByRole('button', { name: 'Öğe seç', exact: true }).click();
    // Sonuç (değişken rakamlı metin → kimlik seçicisi) ve bir alan (etikete tıklanır → bağlı form alanı).
    await sec(sayfa, panel, '#sonuc', 'Sonuç (çıktı)');
    await sayfa.getByText('Ad Soyad').click();
    await expect(panel.getByRole('radio', { name: 'Alan' })).toBeChecked();
    await panel.getByRole('button', { name: 'Ekle', exact: true }).click();
    await expect(panel.getByRole('list', { name: 'Seçilen öğeler' }).locator('li')).toHaveCount(3);
    await goruntu(panel.locator('.p'), '02-panel-secilenler.png');
    // Listeden çıkarma ve yeniden ekleme.
    await panel.getByRole('button', { name: /Ad Soyad: listeden çıkar/ }).click();
    await expect(panel.getByRole('list', { name: 'Seçilen öğeler' }).locator('li')).toHaveCount(2);
    await sayfa.getByText('Ad Soyad').click();
    await panel.getByRole('button', { name: 'Ekle', exact: true }).click();
    await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
  } finally {
    await tarayici.close().catch(() => undefined);
  }
  const d = await isBitti(isId);
  expect(d, JSON.stringify(d.hata)).toMatchObject({ kip: 'ogeSecme', durum: 'tamam' });
  secilenler = d.ogeler as Nesne[];
  expect(secilenler.map((o) => [o.tur, o.secici, o.kirilganlik, o.seciciTuru, o.metin])).toEqual([
    ['dugme', 'role=button[name="Hesapla"]', 'dusuk', 'rol', 'Hesapla'],
    ['sonuc', '#sonuc', 'dusuk', 'kimlik', 'Tutar: 1.234 TL'],
    ['alan', 'role=textbox[name="Ad Soyad"]', 'dusuk', 'rol', 'Ad Soyad']
  ]);
  expect(secilenler[2].alan).toMatchObject({ tur: 'text', etiket: 'Ad Soyad', secici: 'role=textbox[name="Ad Soyad"]', adaySeciciler: expect.arrayContaining(['#adSoyad']) });
  // Seçim açıkken hiçbir düğmeye basılmadı: yalnız kullanıcının seçim kapalıyken yaptığı tek hesaplama gitti.
  expect(uygulama.hesaplamalar).toHaveLength(1);
  kayitYok();
  // Siteye giden yazma istekleri yalnız girişler (tarifle).
  expect(uygulama.istekler.filter((x) => x.startsWith('POST') && x !== 'POST /giris')).toEqual([]);
});

test('işaretleme pakete uygulanır; ekran kabul edilir; Dene "Hesapla"ya basar ve sonucu doğrular (kayıt düğmesine basılmaz)', async () => {
  test.setTimeout(180_000);
  const r = await basarili('/platform/tarama/isaretle', { id: taramaIsId, ogeler: secilenler.slice(0, 2), reddedilenler: [] });
  expect(r.isaretOzeti).toEqual({ dugme: 1, sonuc: 1, alan: 0, basari: 0, hata: 0, reddedilen: 0 });
  // Geçersiz işaret reddedilir; paket değişmez.
  expect(await api('/platform/tarama/isaretle', { id: taramaIsId, ogeler: [{ tur: 'dugme', secici: '' }] })).toMatchObject({ basarili: false, kod: 'ISARET_GECERSIZ' });
  const p = await api(`/platform/tarama/paket?id=${taramaIsId}`);
  const paket = p.paket as Nesne;
  expect(paket.model.semaSurumu).toBe(2);
  expect(paket.model.adimlar[0].kosu).toEqual({
    aksiyonlar: [{ tur: 'tikla', secici: 'role=button[name="Hesapla"]', aciklama: 'Hesapla' }], basariGostergesi: { tur: 'metin', deger: 'Tutar', secici: '#sonuc' }
  });
  expect((await isDurumu(taramaIsId)).isaretOzeti).toMatchObject({ dugme: 1, sonuc: 1 });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
  const ekran = liste.ekranlar.find((e) => e.ad === 'Fiyat Hesaplama') as Nesne;
  ekranId = String(ekran.id);
  expect(ekran).toMatchObject({ modelVar: true, olusturulabilir: true });
  // Dene: kurumsal müşteri (koşullu Vergi No), İl → İlçe (bağımlı liste) ve Hesapla; sonuç metni doğrulanır.
  const y = await api('/platform/senaryo/dene', {
    projeId, ekranId, ortamId, kosuId: `kosu-${randomUUID()}`,
    veri: { musteriTipi: 'kurumsal', adSoyad: 'Deneme Kişi', vergiNo: '1234567890', il: '34', ilce: 'besiktas' }
  });
  expect(y.basarili, `${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 600)}`).toBe(true);
  if (y.sonucId) {
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
  }
  expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ tip: 'kurumsal', il: '34', ilce: 'besiktas' });
  kayitYok();
});

/** Kutunun içindekiler taşmıyor ve sayfa yatay kaymıyor. */
async function tasmaYok(page: Page, kok: string): Promise<void> {
  const r = await page.evaluate((s) => {
    const k = document.querySelector(s);
    if (!k) return { yok: true, yatay: false, tasanlar: [] as string[] };
    const kr = k.getBoundingClientRect();
    const tasanlar = [...k.querySelectorAll('*')].filter((e) => {
      const b = e.getBoundingClientRect();
      return b.width > 0 && (b.right > kr.right + 1 || b.left < kr.left - 1);
    }).map((e) => `${e.tagName.toLowerCase()}.${e.className}`).slice(0, 5);
    return { yok: false, yatay: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, tasanlar };
  }, kok);
  expect(r).toEqual({ yok: false, yatay: false, tasanlar: [] });
}

test('arayüz: tarama sonrası "Düğmeyi ve sonucu işaretle" — keşif bulguları onayı, Sayfada seç (canlı liste), önizleme; 1440 ve 390 px taşma yok', async () => {
  test.setTimeout(240_000);
  const b = await basarili('/platform/tarama/baslat', { projeId, ekranAdi: 'Fiyat Hesaplama İkinci', ekranAnahtari: 'fiyat-hesaplama-2', ortamId, hedef: '/hesap/', onay: true });
  const isId = String(b.isId);
  expect(await isBitti(isId)).toMatchObject({ durum: 'tamam' });
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    await page.goto(`/#/ekranlar/tarama/${isId}`);
    await expect(page.getByRole('heading', { name: 'Düğmeyi ve sonucu işaretle: Fiyat Hesaplama İkinci' })).toBeVisible();
    const kesif = page.getByRole('region', { name: '1. Keşfin buldukları' });
    await expect(kesif.getByRole('checkbox')).toHaveCount(4);
    await expect(kesif).toContainText('Müşteri tipi = Kurumsal seçilince görünür');
    await expect(kesif).toContainText('Seçenekleri "İl" seçimine bağlı');
    // Paket türü koşulu reddedilir (modele yazılmaz).
    await kesif.getByRole('checkbox', { name: /Paket türü/ }).uncheck();
    await expect(page.getByText('3 / 4 keşif bulgusu modele yazılacak')).toBeVisible();
    await expect(page.getByText('Düğme ve sonuç işaretlenmezse test yalnız formu doldurur')).toBeVisible();
    // Sayfada seç → onay → görünür (testte başsız) tarayıcı; kart canlı durumu gösterir.
    const kart = page.getByRole('region', { name: '2. Düğmeyi ve sonucu işaretle' });
    await kart.getByRole('button', { name: 'Sayfada seç' }).click();
    const onay = page.locator('dialog[open]');
    await expect(onay).toContainText('tıklama sayfaya GİTMEZ');
    await onay.getByRole('button', { name: 'Tarayıcıyı aç' }).click();
    const secimIsi = await (async () => {
      for (const son = Date.now() + 30_000; Date.now() < son; await new Promise((c) => setTimeout(c, 250))) {
        const a = (await api('/platform/tarama/aktif')).is as Nesne | null;
        if (a) return String(a.id);
      }
      throw new Error('öğe seçme başlamadı');
    })();
    const { tarayici: secim, sayfa, panel } = await secimSayfasi(secimIsi);
    await expect(kart.locator('.oge-secme-canli')).toContainText('Öğe seç');
    try {
      await sec(sayfa, panel, '#hesapla', 'Düğme (aksiyon)');
      await panel.getByRole('button', { name: 'Öğe seçmeyi durdur' }).click();
      await sayfa.click('#hesapla');
      await expect(sayfa.locator('#sonuc')).toBeVisible();
      await panel.getByRole('button', { name: 'Öğe seç', exact: true }).click();
      await sec(sayfa, panel, '#sonuc', 'Sonuç (çıktı)');
      await expect(kart.locator('.oge-secme-canli')).toContainText('2 öğe seçildi');
      await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
    } finally {
      await secim.close().catch(() => undefined);
    }
    const liste = kart.getByRole('list', { name: 'Seçilen öğeler' });
    await expect(liste.locator('li')).toHaveCount(2);
    await expect(liste).toContainText('“Hesapla”');
    await expect(liste).toContainText('#sonuc');
    await expect(page.getByText('Düğme ve sonuç işaretlenmezse')).toHaveCount(0);
    await tasmaYok(page, '.isaretleme-duzeni');
    await goruntu(page, '03-isaretleme-1440.png');
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page, '.isaretleme-duzeni');
    await goruntu(page, '04-isaretleme-390.png');
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Önizlemeye geç: işaretler pakete uygulanır; önizlemede özet ve "İşaretlemeye dön".
    await page.getByRole('button', { name: 'Önizlemeye geç' }).click();
    await expect(page.getByText(/işaretlenen: 1 düğme, 1 sonuç \/ başarı göstergesi; 1 keşif bulgusu yazılmadı/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'İşaretlemeye dön' })).toBeVisible();
    await goruntu(page, '05-onizleme.png');
    const paket = (await api(`/platform/tarama/paket?id=${isId}`)).paket as Nesne;
    const alanlar = (paket.model.adimlar[0].bolumler as Nesne[]).flatMap((x) => x.alanlar as Nesne[]);
    expect(alanlar.find((a) => a.id === 'paketTuru')?.gorunurluk).toBeUndefined();
    expect(alanlar.find((a) => a.id === 'vergiNo')?.gorunurluk).toEqual({ kosul: 'vergiNoGorunur' });
    expect(paket.model.adimlar[0].kosu.aksiyonlar).toEqual([{ tur: 'tikla', secici: 'role=button[name="Hesapla"]', aciklama: 'Hesapla' }]);
    // Geri dön: işaretlenenler korunur.
    await page.getByRole('button', { name: 'İşaretlemeye dön' }).click();
    await expect(page.getByRole('region', { name: '2. Düğmeyi ve sonucu işaretle' }).getByRole('list', { name: 'Seçilen öğeler' }).locator('li')).toHaveCount(2);
    await expect(page.getByRole('region', { name: '1. Keşfin buldukları' }).getByRole('checkbox', { name: /Paket türü/ })).not.toBeChecked();
  } finally {
    await tarayici.close();
  }
  kayitYok();
});

test('arayüz: tarama diyaloğunda keşif varsayılan açık; CANLI ortama geçince kapanır, açınca onay istenir', async () => {
  test.setTimeout(60_000);
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } })).newPage();
    // Okuyan tarama diyaloğu: Ekran ekle › Ekranı tara (modeli olan ekranda Nöbetçi taraması hızlı test ekranını açar).
    await page.goto('/#/ekranlar/yeni/tara');
    const d = page.locator('dialog[open]');
    const kesif = d.getByRole('checkbox', { name: /Açılır listeleri keşfet/ });
    await expect(kesif).toBeChecked();
    await d.getByLabel('Ortam', { exact: true }).selectOption({ label: 'Canlı kopya' });
    await expect(kesif).not.toBeChecked();
    await kesif.check();
    const onay = page.locator('dialog[open]').last();
    await expect(onay).toContainText('CANLI ortamda seçim keşfi açılsın mı?');
    await onay.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(kesif).not.toBeChecked();
    await d.getByLabel('Ortam', { exact: true }).selectOption({ label: 'Deneme' });
    await expect(kesif).toBeChecked();
  } finally {
    await tarayici.close();
  }
});

test('arayüz: akış diyagramında "Sayfada seç" — seçilen düğme aksiyon bloğu olur (CSS seçici yazılmadan)', async () => {
  test.setTimeout(180_000);
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } })).newPage();
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`);
    await page.getByRole('button', { name: 'Düzenle' }).first().click();
    const palet = page.locator('aside[aria-label="Kayıtta yakalananlar"]');
    await expect(palet.getByText('Listede olmayan alanı elle ekle (ileri düzey: CSS seçici)')).toBeVisible();
    const aksiyonSayisi = await page.getByRole('combobox', { name: 'Basılacak düğme' }).count();
    await palet.getByRole('button', { name: 'Sayfada seç' }).click();
    const d = page.locator('dialog[open]');
    await expect(d.getByLabel('Açılacak sayfa')).toHaveValue('/hesap/');
    await d.getByRole('button', { name: 'Sayfada seç' }).click();
    await page.locator('dialog[open]').last().getByRole('button', { name: 'Tarayıcıyı aç' }).click();
    const secimIsi = await (async () => {
      for (const son = Date.now() + 30_000; Date.now() < son; await new Promise((c) => setTimeout(c, 250))) {
        const a = (await api('/platform/tarama/aktif')).is as Nesne | null;
        if (a) return String(a.id);
      }
      throw new Error('öğe seçme başlamadı');
    })();
    const { tarayici: secim, sayfa, panel } = await secimSayfasi(secimIsi);
    try {
      // Diyagramda yalnız düğme / alan / başarı göstergesi seçilebilir.
      await sayfa.click('#kaydet');
      await expect(panel.getByRole('radio')).toHaveCount(3);
      await expect(panel.getByRole('radio', { name: 'Düğme (aksiyon)' })).toBeChecked();
      await panel.getByRole('button', { name: 'Ekle', exact: true }).click();
      await panel.getByRole('button', { name: 'Bitir ve Nöbetçi’ye gönder' }).click();
    } finally {
      await secim.close().catch(() => undefined);
    }
    await expect(d.getByRole('list', { name: 'Seçilen öğeler' })).toContainText('“Kaydet”');
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page, 'dialog[open] .diyalog-govde');
    await goruntu(page, '06-diyagram-sayfada-sec-390.png');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await d.getByRole('button', { name: 'Diyagrama ekle' }).click();
    await expect(page.getByRole('combobox', { name: 'Basılacak düğme' })).toHaveCount(aksiyonSayisi + 1);
    // Yeni aksiyon bloğu (etkin bloğun ardına eklenir) seçilen düğmeye basar.
    await expect(page.getByRole('combobox', { name: 'Basılacak düğme' }).locator('option:checked').filter({ hasText: 'Kaydet' })).toHaveCount(1);
    await goruntu(page, '07-diyagram-aksiyon.png');
  } finally {
    await tarayici.close();
  }
  // Seçimde "Kaydet"e tıklandı ama sayfaya iletilmedi.
  kayitYok();
});
