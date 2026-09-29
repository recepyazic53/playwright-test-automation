// UÇTAN UCA (yerel) — TÜM EKRANLAR: nötr bir proje (ortam, giriş profili ve tarifi, bağlam kayıtları, ekran paketinden ekran +
// senaryolar, gerçek bir koşu sonucu) kullanıcının yapacağı gibi Nöbetçi'nin uçlarıyla kurulur; ardından arayüzdeki her ekran
// masaüstü ve telefon genişliğinde açılır. Her ekranda:
//   - sayfa hatası (pageerror) ve konsol hatası yok,
//   - yükleniyor iskeleti kaybolur, bir başlık görünür, hata kutusu yok,
//   - temel erişilebilirlik: adı olmayan düğme / bağlantı / form alanı yok, yinelenen kimlik (id) yok,
//   - telefon genişliğinde sayfa yatay taşmaz,
//   - ekranın rehberi "?" ile açılır ve kapanır.
// EKRAN_TURU_KLASORU verilirse her ekranın görüntüsü (koyu / açık, masaüstü / telefon) oraya yazılır (tasarım incelemesi).
// Güvenlik: yalnızca 127.0.0.1 (örnek başvuru fikstürü); ayrı bir Nöbetçi geçici veritabanıyla çalışır.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yerelSunucu } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekBasvuruPaketi, ornekGirisTarifi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, unknown>;
const PAROLA = `Gecici-Tur-${randomBytes(6).toString('hex')}`;
const GORUNTU_KLASORU = process.env.EKRAN_TURU_KLASORU;

let nobetci: Nobetci;
let tarayici: Browser;
let uygulama: OrnekBasvuruUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let projeId = '';
let ortamId = '';
let ekranId = '';
let senaryoId = '';
let kosuId = '';
let sonucId = '';

async function basarili(yol: string, govde?: Nesne): Promise<Nesne> {
  const y = await nobetciApi(nobetci, yol, govde) as Nesne & { basarili?: boolean; mesaj?: string };
  expect(y.basarili ?? true, `${yol}: ${y.mesaj ?? ''}`).not.toBe(false);
  return y;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  klasor = mkdtempSync(join(tmpdir(), 'ekran-turu-'));
  uygulama = new OrnekBasvuruUygulamasi({ totp: true });
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {});
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Örnek Başvuru Projesi', aciklama: 'Tüm ekranların turu için nötr proje.' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  await basarili('/platform/ortam/kaydet', { projeId, ad: 'CANLI', tabanUrl: 'https://canli.ornek.invalid', canli: true });
  await basarili('/platform/giris-profili/kaydet', {
    projeId, ortamId, ad: 'Deneme kullanıcısı', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI
  });
  await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId, tarif: ornekGirisTarifi() });
  for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } });
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ornekBasvuruPaketi(), senaryoIndeksleri: [0, 1], ortamIdleri: [ortamId] });
  const liste = await basarili(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Array<{ id: string }>; senaryolar: Array<{ id: string }> };
  ekranId = liste.ekranlar[0].id;
  senaryoId = liste.senaryolar[0].id;
  // Gerçek bir koşu: Sonuçlar ekranlarının dolu hâli (sonuç, adımlar, ekran görüntüleri).
  const y = await basarili('/platform/senaryolar/calistir', { projeId, ortamId, senaryoId, kosuId: `tur-${randomBytes(4).toString('hex')}`, tekBasina: true }) as Nesne;
  sonucId = String(y.sonucId ?? '');
  const ozet = await basarili(`/platform/sonuclar/ozet?projeId=${projeId}`) as { kosuGecmisi?: Array<{ id: string }>; kosular?: Array<{ id: string }> };
  kosuId = String((ozet.kosuGecmisi ?? ozet.kosular ?? [])[0]?.id ?? '');
  tarayici = await chromium.launch();
});

test.afterAll(async () => {
  await tarayici?.close();
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

/** Ekranın erişilebilirlik ve yerleşim denetimi (sayfada çalışır). */
async function denetle(page: Page): Promise<{ adsiz: string[]; yinelenenId: string[]; tasma: number; tasanlar: string[] }> {
  return page.evaluate(() => {
    const gorunur = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const erisilebilirAd = (el: Element): string => {
      const aria = el.getAttribute('aria-label') || '';
      const etiketli = el.getAttribute('aria-labelledby');
      const etiketMetni = etiketli ? etiketli.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ') : '';
      const id = el.id;
      const label = id ? [...document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)].map((l) => l.textContent || '').join(' ') : '';
      const sarici = el.closest('label')?.textContent || '';
      const baslik = el.getAttribute('title') || '';
      const ph = el.getAttribute('placeholder') || '';
      return `${aria} ${etiketMetni} ${label} ${sarici} ${baslik} ${ph} ${el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' ? '' : el.textContent || ''}`.trim();
    };
    const adsiz: string[] = [];
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=tab]')) {
      if (!gorunur(el) || el.closest('[aria-hidden="true"]')) continue;
      if (!erisilebilirAd(el)) adsiz.push(el.outerHTML.slice(0, 120));
    }
    const sayim = new Map<string, number>();
    for (const el of document.querySelectorAll('[id]')) sayim.set(el.id, (sayim.get(el.id) ?? 0) + 1);
    const yinelenenId = [...sayim].filter(([, n]) => n > 1).map(([id]) => id);
    // Taşan en içteki öğeler (sağ kenarı pencereyi aşan, kendi kaydırma kabı olmayan).
    const tasanlar: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right <= window.innerWidth + 2 || !gorunur(el)) continue;
      let kap = el.parentElement; let kaydirilir = false;
      while (kap) { const s = getComputedStyle(kap); if (/(auto|scroll|hidden)/.test(s.overflowX) && kap.scrollWidth > kap.clientWidth) { kaydirilir = true; break; } kap = kap.parentElement; }
      if (kaydirilir) continue;
      if ([...el.children].some((c) => c.getBoundingClientRect().right > window.innerWidth + 2)) continue;
      tasanlar.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (${Math.round(r.right)}px)`);
      if (tasanlar.length >= 4) break;
    }
    return { adsiz, yinelenenId, tasma: document.documentElement.scrollWidth - window.innerWidth, tasanlar };
  });
}

type EkranTanimi = { ad: string; adres: () => string; bekle?: string };
const EKRANLAR: EkranTanimi[] = [
  { ad: 'sonuclar', adres: () => '#/sonuclar' },
  { ad: 'sonuclar-kosu', adres: () => `#/sonuclar/kosu/${encodeURIComponent(kosuId)}` },
  { ad: 'sonuclar-sonuc', adres: () => `#/sonuclar/sonuc/${encodeURIComponent(sonucId)}` },
  { ad: 'senaryolar', adres: () => '#/senaryolar' },
  { ad: 'senaryolar-ekran', adres: () => `#/senaryolar/u/${encodeURIComponent(ekranId)}` },
  { ad: 'senaryo-yeni', adres: () => `#/senaryolar/yeni/${encodeURIComponent(ekranId)}` },
  { ad: 'senaryo-duzenle', adres: () => `#/senaryolar/duzenle/${encodeURIComponent(senaryoId)}` },
  { ad: 'servisler', adres: () => '#/servisler' },
  { ad: 'servis-ekle', adres: () => '#/servisler/yeni' },
  { ad: 'servis-sonuclari', adres: () => '#/servisler/sonuclar' },
  { ad: 'sonuclar-servisler', adres: () => '#/sonuclar/servisler' },
  { ad: 'ekranlar', adres: () => '#/ekranlar' },
  { ad: 'ekran-ekle', adres: () => '#/ekranlar/yeni' },
  { ad: 'ortak-akis-ekle', adres: () => '#/ekranlar/yeni/ortak-akis' },
  { ad: 'ekran', adres: () => `#/ekranlar/e/${encodeURIComponent(ekranId)}` },
  { ad: 'ekran-akis', adres: () => `#/ekranlar/e/${encodeURIComponent(ekranId)}/akis` },
  { ad: 'ekran-gecmis', adres: () => `#/ekranlar/e/${encodeURIComponent(ekranId)}/gecmis` },
  { ad: 'ayarlar-proje', adres: () => '#/ayarlar/proje' },
  { ad: 'ayarlar-giris', adres: () => '#/ayarlar/giris' },
  { ad: 'veri', adres: () => '#/veri' },
  { ad: 'planli-kosular', adres: () => '#/planli-kosular' },
  { ad: 'ayarlar-kosu', adres: () => '#/ayarlar/kosu' },
  { ad: 'ayarlar-kurtarma', adres: () => '#/ayarlar/kurtarma' },
  { ad: 'ayarlar-yedekleme', adres: () => '#/ayarlar/yedekleme' },
  { ad: 'ayarlar-guvenlik', adres: () => '#/ayarlar/guvenlik' },
  { ad: 'ayarlar-entegrasyonlar', adres: () => '#/ayarlar/entegrasyonlar' },
  { ad: 'ayarlar-arayuz', adres: () => '#/ayarlar/arayuz' }
];

async function baglamAc(genislik: number, yukseklik: number, tema: 'dark' | 'light'): Promise<{ baglam: BrowserContext; page: Page; hatalar: string[] }> {
  const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: yukseklik }, colorScheme: tema });
  const page = await baglam.newPage();
  const hatalar: string[] = [];
  page.on('pageerror', (e) => hatalar.push(`pageerror: ${String(e)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|net::/.test(m.text())) hatalar.push(`console: ${m.text()}`); });
  return { baglam, page, hatalar };
}

async function ekraniAc(page: Page, adres: string): Promise<void> {
  await page.goto(`/${adres}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.iskelet')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('main h1, main h2').first()).toBeAttached();
}

for (const [genislik, yukseklik, cihaz] of [[1440, 960, 'masaustu'], [1100, 800, 'orta'], [390, 844, 'telefon']] as const) {
  test(`tüm ekranlar (${cihaz}): hatasız açılır, erişilebilir adlar, yinelenen kimlik yok, taşma yok`, async () => {
    test.setTimeout(300_000);
    const { baglam, page, hatalar } = await baglamAc(genislik, yukseklik, 'dark');
    /** @type {string[]} */
    const sorunlar: string[] = [];
    for (const e of EKRANLAR) {
      await ekraniAc(page, e.adres());
      await expect(page.locator('main .not-kutusu.hata[role=alert]'), `${e.ad}: hata kutusu`).toHaveCount(0);
      const d = await denetle(page);
      for (const a of d.adsiz) sorunlar.push(`${cihaz}/${e.ad}: adı olmayan öğe ${a}`);
      for (const id of d.yinelenenId) sorunlar.push(`${cihaz}/${e.ad}: yinelenen id "${id}"`);
      if (d.tasma > 2) sorunlar.push(`${cihaz}/${e.ad}: yatay taşma ${d.tasma}px — ${d.tasanlar.join(', ')}`);
      // Ekranın rehberi "?" ile açılır ve kapanır.
      await page.getByRole('button', { name: 'Bu ekranın rehberini aç' }).click();
      const kart = page.getByRole('dialog').filter({ has: page.locator('.rehber-sayac') });
      await expect(kart, `${e.ad}: rehber`).toBeVisible();
      if (GORUNTU_KLASORU && cihaz === 'masaustu') {
        mkdirSync(GORUNTU_KLASORU, { recursive: true });
        await page.screenshot({ path: join(GORUNTU_KLASORU, `${cihaz}-${e.ad}-rehber.png`) });
      }
      await page.keyboard.press('Escape');
      await expect(kart).toHaveCount(0);
      if (GORUNTU_KLASORU) {
        mkdirSync(GORUNTU_KLASORU, { recursive: true });
        await page.screenshot({ path: join(GORUNTU_KLASORU, `${cihaz}-${e.ad}.png`), fullPage: true });
      }
    }
    expect(hatalar, hatalar.join('\n')).toEqual([]);
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);
    await baglam.close();
  });
}

test('açık tema: tüm ekranlar hatasız açılır', async () => {
  test.setTimeout(240_000);
  const { baglam, page, hatalar } = await baglamAc(1440, 960, 'light');
  for (const e of EKRANLAR) {
    await ekraniAc(page, e.adres());
    if (GORUNTU_KLASORU) await page.screenshot({ path: join(GORUNTU_KLASORU, `acik-${e.ad}.png`), fullPage: true });
  }
  expect(hatalar, hatalar.join('\n')).toEqual([]);
  await baglam.close();
});

test('ilk kurulum (kasa yok): karşılama → tanışma → kasa → proje → ortamlar (TEST + Canlı türünde CANLI; tür zorunlu) → proje hazır; hatasız, erişilebilir, telefonda taşmasız', async () => {
  test.setTimeout(180_000);
  for (const [genislik, yukseklik, cihaz] of [[1440, 960, 'masaustu'], [390, 844, 'telefon']] as const) {
    // Her genişlik için ayrı, boş bir Nöbetçi (ilk kurulum baştan).
    const bosKlasor = mkdtempSync(join(tmpdir(), 'ekran-turu-ilk-'));
    const bos = await nobetciBaslat(bosKlasor, join(bosKlasor, 'platform.db'), {});
    try {
      const baglam = await tarayici.newContext({ baseURL: bos.adres, viewport: { width: genislik, height: yukseklik } });
      const page = await baglam.newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      const kontrol = async (ad: string) => {
        const d = await denetle(page);
        expect(d.adsiz, `${cihaz}/${ad}: adsız öğe`).toEqual([]);
        expect(d.yinelenenId, `${cihaz}/${ad}: yinelenen id`).toEqual([]);
        expect(d.tasma, `${cihaz}/${ad}: taşma ${d.tasanlar.join(', ')}`).toBeLessThanOrEqual(2);
        if (GORUNTU_KLASORU) await page.screenshot({ path: join(GORUNTU_KLASORU, `${cihaz}-ilk-${ad}.png`), fullPage: true });
      };
      await page.goto('/');
      await expect(page.locator('.secim-karti')).toHaveCount(2);
      await kontrol('karsilama');
      // Kavram ilişkisi: tek cümle + "Çalışma alanı (kasa) › Proje › Ortam" şeması.
      await expect(page.getByRole('list', { name: 'Çalışma alanı, proje ve ortam ilişkisi' }).getByRole('listitem')).toHaveText([/^Çalışma alanı \(kasa\)/, 'Proje', /^Ortam/]);
      // Ayrıntılar açılınca uzun veri klasörü yolu kutudan / sayfadan taşmaz.
      const ayrinti = page.locator('.veri-klasoru-ayrintilari');
      if (await ayrinti.count()) {
        await ayrinti.locator('summary').click();
        await expect(page.locator('.veri-klasoru-satiri code')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        const tasma = await page.locator('.veri-klasoru-satiri code').evaluate((c) => { const a = c.getBoundingClientRect(); const d = (c.closest('details') as HTMLElement).getBoundingClientRect(); return a.right - d.right; });
        expect(tasma, 'veri klasörü yolu kutudan taşmaz').toBeLessThanOrEqual(1);
      }
      await page.locator('.secim-karti').filter({ hasText: 'Yeni proje başlat' }).click();
      // "Sizi tanıyalım" adımı yok (ortamlar Ortamlar adımında / Ayarlar'da); giriş profili adımı da yok.
      await expect(page.getByRole('heading', { name: 'Kasa parolası belirleyin' })).toBeVisible();
      await expect(page.getByRole('form', { name: 'Tanışma soruları' })).toHaveCount(0);
      await expect(page.locator('.adimlar li')).toHaveText([/^Kasa parolası/, 'Proje', 'Ortamlar', 'İzinler', 'Giriş', 'Tamam']);
      await expect(page.locator('.sihirbaz-baslik .kirinti')).toContainText('Adım 1 / 6');
      await kontrol('kasa');
      await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(PAROLA);
      await page.getByRole('textbox', { name: 'Kasa parolası (tekrar) (zorunlu)', exact: true }).fill(PAROLA);
      await page.getByText('Parolayı unutursam').click();
      await page.getByRole('button', { name: 'Kasayı oluştur ve devam et' }).click();
      await page.getByLabel('Proje adı').fill('İlk kurulum projesi');
      await page.getByRole('button', { name: 'Devam' }).click();
      // Ortamlar: satır = × | Ortam adı | Adres | Ortam türü (Test / Canlı; × yalnız ikon, TEST'te yok). CANLI "Ortam ekle" ile eklenir.
      await expect(page.locator('.sihirbaz-baslik .kirinti')).toContainText('Adım 3 / 6');
      await expect(page.getByLabel('Ortam adı')).toHaveCount(1);
      // "Ortam türü" etiketi diğer alan etiketleriyle aynı biçimde (büyük harf değil); adres alanında hangi adresin yazılacağı ve örnek.
      await expect(page.locator('.ortam-turu-secimi > legend').first()).toHaveCSS('text-transform', 'none');
      await expect(page.getByText(/açılış \(kök\) adresi; giriş sayfasının adresi değil/).first()).toBeVisible();
      await page.getByRole('button', { name: 'Ortam ekle' }).click();
      await page.getByLabel('Ortam adı').nth(1).fill('CANLI');
      // TEST satırının türü sabit Test; eklenen satırda tür önceden seçili gelmez (zorunlu seçim, aşağıda denetlenir).
      await expect(page.locator('.ortam-satiri').first().getByRole('radio', { name: 'Test' })).toBeChecked();
      await expect(page.locator('.ortam-satiri').first().getByRole('radio', { name: 'Canlı' })).toBeDisabled();
      await expect(page.locator('.ortam-satiri').nth(1).getByRole('radio', { name: 'Test' })).not.toBeChecked();
      await expect(page.locator('.ortam-satiri').nth(1).getByRole('radio', { name: 'Canlı' })).not.toBeChecked();
      await expect(page.getByRole('button', { name: 'Ortamı kaldır' })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Ortamı kaldır' })).toHaveText('');
      await page.getByLabel('Adres (link)').first().fill('https://test.ornek.invalid');
      await page.getByLabel('Adres (link)').nth(1).fill('https://canli.ornek.invalid');
      // Satır hizası: × satırın EN SOLUNDA (Ortam adı alanının solunda) ve ad girdisiyle aynı hizada; masaüstünde ortam türü seçimi
      // da girdiyle aynı satırda.
      const satir = page.locator('.ortam-satiri').nth(1);
      const kutu = await satir.locator('.ortam-riski .secenek').first().boundingBox();
      const kaldir = await satir.getByRole('button', { name: 'Ortamı kaldır' }).boundingBox();
      const adGirdisi = await satir.getByLabel('Ortam adı').boundingBox();
      const girdi = await satir.getByLabel('Adres (link)').boundingBox();
      expect(kutu && kaldir && girdi && adGirdisi).toBeTruthy();
      if (kutu && kaldir && girdi && adGirdisi) {
        expect(kaldir.x + kaldir.width, '× ortam adının solunda').toBeLessThanOrEqual(adGirdisi.x + 1);
        expect(Math.abs((kaldir.y + kaldir.height / 2) - (adGirdisi.y + adGirdisi.height / 2)), '× ve ad girdisi aynı hizada').toBeLessThanOrEqual(4);
        if (cihaz === 'masaustu') expect(Math.abs((girdi.y + girdi.height / 2) - (kutu.y + kutu.height / 2)), 'girdi ve ortam türü seçimi aynı satırda').toBeLessThanOrEqual(4);
      }
      await kontrol('ortamlar');
      // Ortam türü zorunlu: seçilmeden kaydedilmez (sunucuya istek gitmez).
      let ortamKaydi = 0;
      const sayac = (r: { url: () => string }) => { if (r.url().includes('/platform/ortam/kaydet')) ortamKaydi += 1; };
      page.on('request', sayac);
      await page.getByRole('button', { name: 'Kaydet ve devam' }).click();
      await expect(page.locator('.ortam-satiri').nth(1).getByRole('group', { name: 'Ortam türü' }).getByRole('alert')).toHaveText('Ortam türünü seçin (Test / Canlı).');
      expect(ortamKaydi).toBe(0);
      page.off('request', sayac);
      await page.locator('.ortam-satiri').nth(1).getByRole('radio', { name: 'Canlı' }).check();
      await page.getByRole('button', { name: 'Kaydet ve devam' }).click();
      // İzinler (ilk kurulum): "Nöbetçi sizin adınıza neleri yapabilsin?" — varsayılan Hiçbiri, canlı kutusu işaretsiz; Atla hiçbir izni açmaz.
      await expect(page.locator('.sihirbaz-baslik .kirinti')).toContainText('Adım 4 / 6');
      await expect(page.getByRole('heading', { name: 'Nöbetçi sizin adınıza neleri yapabilsin?' })).toBeVisible();
      await expect(page.getByRole('radio', { name: /^Hiçbiri/ })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Canlı ortamda da çalıştırabilsin' })).not.toBeChecked();
      await kontrol('izinler');
      await page.getByRole('button', { name: 'Atla' }).click();
      // İsteğe bağlı giriş sorusu (kendi adımı): Hayır → Başlarken'de "Girişe gerek yok" işaretlenir.
      await expect(page.locator('.sihirbaz-baslik .kirinti')).toContainText('Adım 5 / 6');
      await expect(page.getByRole('heading', { name: 'Uygulamanız giriş istiyor mu?' })).toBeVisible();
      await expect(page.getByRole('radio', { name: /^Emin değilim/ })).toBeChecked();
      await kontrol('giris-sorusu');
      await page.getByRole('radio', { name: /^Hayır, giriş gerekmiyor/ }).check();
      await page.getByRole('button', { name: 'Devam' }).click();
      // Proje hazır: kısa özet (kaydedilen ortamlar) + "Ana sayfaya geç"; yapılacaklar / sıradaki kartlar yok.
      await expect(page.getByRole('heading', { name: 'Proje hazır' })).toBeVisible();
      const ozet = page.getByRole('region', { name: 'Proje özeti' });
      await expect(ozet.locator('.ozet-ortamlar li')).toHaveCount(2);
      await expect(ozet.locator('.ozet-ortamlar li').filter({ hasText: 'CANLI' }).locator('.rozet.hata')).toHaveText('Canlı');
      // Test ortamında rozet yok (yalnız Canlıysa "Canlı").
      await expect(ozet.locator('.ozet-ortamlar li').filter({ hasText: 'TEST' }).locator('.rozet.hata, .rozet.uyari')).toHaveCount(0);
      await expect(page.getByText('Sizin için yapılacaklar')).toHaveCount(0);
      await expect(page.getByText('Sırada ne var?')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Ekranı otomatik tara' })).toHaveCount(0);
      await expect(ozet.getByRole('note')).toContainText('Giriş gerekmiyor.');
      await kontrol('tamam');
      // Kayıt doğrulaması: iki ortam da sunucuda, riskli seçimleri doğru.
      const { projeler } = (await nobetciApi(bos, '/platform/projeler')) as unknown as { projeler: Array<{ id: string }> };
      const { ortamlar } = (await nobetciApi(bos, `/platform/ortamlar?projeId=${projeler[0].id}`)) as unknown as { ortamlar: Array<{ ad: string; riskli: boolean | null }> };
      expect(ortamlar.map((o) => `${o.ad}:${String(o.riskli)}`).sort()).toEqual(['CANLI:true', 'TEST:false']);
      const { baslarken } = (await nobetciApi(bos, `/platform/baslarken?projeId=${projeler[0].id}`)) as unknown as { baslarken: { adimlar: Array<{ anahtar: string; atlandi?: boolean }> } };
      expect(baslarken.adimlar.find((a) => a.anahtar === 'giris')?.atlandi).toBe(true);
      await page.getByRole('button', { name: 'Ana sayfaya geç' }).click();
      await expect(page).toHaveURL(/#\/sonuclar/);
      // Ayarlar > Proje ve ortamlar: iki ortam listelenir, "null" metni yok.
      await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) (d as HTMLDialogElement).close(); location.hash = '#/ayarlar/proje'; });
      await expect(page.locator('.bolum-basligi h3').filter({ hasText: 'Ortamlar' })).toContainText('2');
      await expect(page.locator('.kayit-listesi:not(.proje-listesi):not(.kurtarma-listesi) li')).toHaveCount(2);
      await expect(page.locator('.proje-listesi li')).toHaveCount(1);
      expect(await page.locator('#ana').innerText()).not.toMatch(/\bnull\b|\bundefined\b/);
      expect(hatalar).toEqual([]);
      await baglam.close();
    } finally {
      bos.surec.kill('SIGTERM');
      rmSync(bosKlasor, { recursive: true, force: true });
    }
  }
});
