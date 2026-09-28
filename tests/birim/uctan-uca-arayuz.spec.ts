// UÇTAN UCA (yerel) — uçtan uca akış arayüzü ve GERÇEK koşu: akış tasarımda kurulur (servis → ekran → servis; ekran adımında alan
// ${akis:SiparisNo} ile doldurulur, onay numarası ekrandan okunur), koşu penceresi seçilen ortamda eksik adımları (hiçbir istek atmadan)
// ve gereken izinleri gösterir, kapalı izin standart pencereyle ("İzin ver ve devam et") açılır; ekran adımı model koşucusuyla ayrı
// Playwright sürecinde koşar (gerçek raporlayıcı, şifreli medya), okunan değer son servis isteğine taşınır. Sonuçlar > Uçtan uca
// akışlar sekmesi; masaüstü ve 390 px genişlikte yatay taşma yok.
//
// Güvenlik: yalnız 127.0.0.1 — örnek başvuru fikstürü (model-fikstur.ts) ve sahte SOAP sunucusu; ayrı Nöbetçi örneği geçici
// veritabanıyla (gerçek Nöbetçi'ye ve veri/ klasörüne dokunulmaz); yasaklı adres koruması açık.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { SIRKET_DESENI, yerelSunucu } from './giris-fikstur';
import { ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekBasvuruPaketi, ornekGirisTarifi } from './model-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { SAHTE_TC, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';

type Nesne = Record<string, any>;
const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body></s:Envelope>`;
const PAROLA = `Gecici-UctanUI-${randomBytes(6).toString('hex')}`;

test.describe('uçtan uca akış arayüzü ve koşusu', () => {
  test.describe.configure({ mode: 'serial' });
  let nobetci: Nobetci;
  let uygulama: OrnekBasvuruUygulamasi;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let akisId = '';
  let kosuId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true); return y; };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    klasor = mkdtempSync(join(tmpdir(), 'uctan-uca-arayuz-'));
    const yukleme = join(klasor, 'yuklenecek');
    mkdirSync(yukleme);
    writeFileSync(join(yukleme, 'ornek-belge.txt'), 'Sahte belge içeriği.\n');
    uygulama = new OrnekBasvuruUygulamasi({ totp: true });
    fikstur = await yerelSunucu(uygulama.isle);
    soap = await sahteSoapSunucusu();
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_YUKLEME_KLASORU: yukleme });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Uçtan Uca Projesi' })).proje.id);
    const TEST = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    const HAZIRLIK = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'HAZIRLIK', tabanUrl: fikstur.adres, riskli: false })).ortam.id);
    await basarili('/platform/giris-profili/kaydet', {
      projeId, ortamId: TEST, ad: 'Deneme kullanıcısı', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI
    });
    await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId: TEST, tarif: ornekGirisTarifi() });
    for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ornekBasvuruPaketi(), senaryoIndeksleri: [0], ortamIdleri: [TEST] });
    // Servis TEST'te sahte SOAP sunucusunda; HAZIRLIK'ta tanımlı değil (taban adres boş).
    const tabanlar = { [TEST]: soap.adres, [HAZIRLIK]: '' };
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId: TEST, yol: '/Servis/ornek.asmx', tabanlar });
    const servisId = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', tabanlar, erisimKimligi: e.erisimKimligi })).id);
    const senaryo = (baslik: string, govde: string) => basarili('/platform/servis/senaryo/kaydet', {
      projeId, servisId, baslik, icerik: { operasyon: 'Siparis', govde: zarf(govde), kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }] }
    });
    await senaryo('Giriş', '<Giris/>');
    await senaryo('Sipariş kaydı', `<IdentityNumber>${SAHTE_TC}</IdentityNumber><Not>\${akis:OnayNo}</Not>`);
    tarayici = await chromium.launch();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    await soap?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  /** Yatay taşma yok (390 px dahil). */
  const tasmaYok = async (page: Page, ne: string) => {
    const t = await page.evaluate(() => ({ genislik: document.documentElement.scrollWidth, gorunen: document.documentElement.clientWidth }));
    expect(t.genislik, `${ne}: yatay taşma`).toBeLessThanOrEqual(t.gorunen + 1);
  };

  test('tasarım: ekran + servis adımları, akıştan doldurulan alan, ekrandan okuma; değer sırası denetimi; kayıt', async () => {
    test.setTimeout(90_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/akislar');
    await expect(page.getByText('Henüz uçtan uca akış yok.')).toBeVisible();
    // Sol panelde (Senaryolar bölümü) bağlantı.
    await expect(page.locator('.yan-panel').getByRole('link', { name: 'Uçtan uca akışlar' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Uçtan uca akış ekle' }).first().click();
    await expect(page.getByRole('heading', { name: 'Yeni uçtan uca akış' }).first()).toBeVisible();
    await page.getByLabel('Başlık').fill('Sipariş uçtan uca');
    // 1. adım: projedeki ekran senaryosu hazır gelir; alan akıştan doldurulur, onay numarası ekrandan okunur.
    await expect(page.getByLabel('1. adım ekran senaryosu')).toHaveValue(/.+/);
    await page.getByRole('button', { name: 'Alan doldur' }).click();
    await page.getByLabel('1. adım 1. alan', { exact: true }).selectOption({ label: 'Ad Soyad' });
    await page.getByLabel('1. adım 1. alan değeri').fill('Kişi ${akis:SiparisNo}');
    await page.getByRole('button', { name: 'Değer oku' }).click();
    await page.getByLabel('1. adım 1. okuma adı').fill('OnayNo');
    await page.getByLabel('1. adım 1. okuma seçicisi').fill('#onay-sonuc');
    // ${akis:SiparisNo} henüz okunmuyor: diyagram uyarır, kayıt engellenir.
    await expect(page.locator('.not-kutusu.hata')).toContainText('${akis:SiparisNo} hiçbir önceki adımda okunmuyor');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Akış değerlerinde sorun var')).toBeVisible();
    // Başa servis adımı (kayıtlı senaryo "Giriş"): yanıt başlığından SiparisNo okunur.
    await page.getByRole('button', { name: 'Başa yeni adım koy' }).click();
    await page.locator('.servis-ekle-menusu details summary').click();
    await page.getByRole('button', { name: 'Adım olarak koy: Giriş' }).click();
    await page.getByRole('button', { name: 'Değer oku' }).click();
    await page.getByLabel('1. adım 1. okuma adı').fill('SiparisNo');
    await page.getByLabel('1. adım 1. okuma kaynağı').selectOption('baslik');
    await page.getByLabel('1. adım 1. okuma yolu').fill('x-oturum');
    await expect(page.locator('.not-kutusu.hata', { hasText: 'hiçbir önceki adımda okunmuyor' })).toHaveCount(0);
    await expect(page.locator('[data-adim="1"]')).toContainText('${akis:SiparisNo}');
    await expect(page.locator('[data-adim="1"]')).toContainText('${akis:OnayNo}');
    // Sona servis adımı: gövdesinde ${akis:OnayNo} (ekrandan okunan değer).
    await page.getByRole('button', { name: 'Adım ekle' }).click();
    await page.locator('.servis-ekle-menusu details summary').click();
    await page.getByRole('button', { name: 'Adım olarak koy: Sipariş kaydı' }).click();
    await expect(page.locator('[data-adim="2"]')).toContainText('← 2. adım');
    // Tasarımda adım türlerinin gerektirdiği izinler.
    const izinOzeti = page.getByRole('note', { name: 'Adımların gerektirdiği izinler' });
    await expect(izinOzeti).toContainText('Web uygulamasına erişim · 2. ekran');
    await expect(izinOzeti).toContainText('Servis istekleri · 1. servis, 3. servis');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page).toHaveURL(/#\/akislar\/[0-9a-f-]{36}$/);
    akisId = decodeURIComponent(page.url().split('/').pop() ?? '');
    await expect(page.getByRole('heading', { name: 'Uçtan uca akışı düzenle' })).toBeVisible();
    await tasmaYok(page, 'tasarım (masaüstü)');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Uçtan uca akışı düzenle' })).toBeVisible();
    await tasmaYok(page, 'tasarım (390 px)');
    // Liste: akış, adım türleri. Servis akışları listesinde görünmez.
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/#/akislar');
    const satir = page.getByRole('row', { name: /Sipariş uçtan uca/ });
    await expect(satir).toContainText('Servis');
    await expect(satir).toContainText('Ekran');
    const { akislar } = await basarili(`/platform/servis-akislari?projeId=${projeId}`);
    const kayit = akislar.find((a: Nesne) => a.id === akisId);
    expect(kayit, `${akisId} / ${JSON.stringify(akislar.map((a: Nesne) => a.id))}`).toBeTruthy();
    expect(kayit.icerik.uctanUca).toBe(true);
    expect(kayit.icerik.adimlar.map((a: Nesne) => a.tur ?? 'senaryo')).toEqual(['senaryo', 'ekran', 'senaryo']);
    expect(kayit.icerik.adimlar[1]).toMatchObject({ ezmeler: { adSoyad: 'Kişi ${akis:SiparisNo}' }, okumalar: [{ ad: 'OnayNo', kaynak: 'ekran', yol: '#onay-sonuc' }] });
    expect(hatalar).toEqual([]);
    await baglam.close();
  });

  test('koşu: eksik adım uyarısı (istek yok), kapalı izin penceresi, gerçek ekran koşusu; değer taşıma; sonuç kartı ve Sonuçlar sekmesi', async () => {
    test.setTimeout(300_000);
    // Web erişimi izni kapalı: koşu penceresi listeler, koşu başlarken standart izin penceresi sorar.
    await basarili('/platform/izin/degistir', { anahtar: 'web-erisimi', acik: false, onay: true });
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto('/#/akislar');
    await page.getByRole('button', { name: 'Koş: Sipariş uçtan uca' }).click();
    const diyalog = page.getByRole('dialog', { name: 'Uçtan uca akışı koş' });
    await expect(diyalog).toBeVisible();
    const once = { soap: soap.istekler.length, uygulama: uygulama.olaylar.length };
    await diyalog.getByLabel('Ortam', { exact: true }).selectOption({ label: 'HAZIRLIK' });
    await expect(diyalog.locator('.uctan-eksik')).toContainText('Bu ortamda koşamayan adım var (3)');
    await expect(diyalog.locator('.uctan-eksik')).toContainText('"Ornek" servisi "HAZIRLIK" ortamında tanımlı değil (taban adres yok).');
    await expect(diyalog.locator('.uctan-eksik')).toContainText('senaryosu "HAZIRLIK" ortamında tanımlı değil.');
    await expect(diyalog.getByRole('button', { name: 'Koş', exact: true })).toBeDisabled();
    expect([soap.istekler.length, uygulama.olaylar.length]).toEqual([once.soap, once.uygulama]);
    await diyalog.getByLabel('Ortam', { exact: true }).selectOption({ label: 'TEST' });
    const izinler = diyalog.getByRole('list', { name: 'Gereken izinler' });
    await expect(izinler).toContainText('Web uygulamasına erişim');
    await expect(izinler.locator('li.kapali')).toContainText('Web uygulamasına erişim');
    await expect(izinler).toContainText('Servis istekleri');
    await expect(izinler).toContainText('Giriş bilgisi kullanımı');
    await tasmaYok(page, 'koşu penceresi');
    await diyalog.getByRole('button', { name: 'Koş', exact: true }).click();
    const izinPenceresi = page.getByRole('dialog', { name: 'İzin gerekli' });
    await expect(izinPenceresi).toBeVisible();
    await izinPenceresi.getByRole('button', { name: 'İzin ver ve devam et' }).click();
    await expect(diyalog).toBeHidden({ timeout: 240_000 });
    await expect(page).toHaveURL(/#\/sonuclar\/uctan-uca\/[A-Za-z0-9-]+$/);
    kosuId = decodeURIComponent(page.url().split('/').pop() ?? '');
    const kart = page.locator('.uctan-sonucu');
    await expect(kart).toContainText('3 adım başarılı');
    await expect(kart.locator('.uctan-adimlari > li')).toHaveCount(3);
    await expect(kart.locator('.uctan-adimlari > li').nth(1)).toContainText('Ekran');
    await expect(kart.locator('.uctan-adimlari > li').nth(1)).toContainText(/Okunan: OnayNo = Başvuru onaylandı\. No: \d+/);
    await expect(kart.locator('.uctan-adimlari > li').nth(1)).toContainText(/Doldurulan: adSoyad = Kişi oturum-\d+/);
    await expect(kart.locator('.uctan-goruntu img')).toBeVisible();
    await expect(kart.getByRole('link', { name: 'Ekran sonucu (adım adım görüntüler, video)' })).toBeVisible();
    await expect(kart.getByRole('table', { name: 'Taşınan değerler' })).toContainText('${akis:OnayNo}');
    // Değer taşıma: servis yanıtındaki değer ekrana (başvurudaki ad), ekrandan okunan değer son servis isteğine.
    const hesap = uygulama.hesaplamalar.at(-1);
    expect(String(hesap?.adSoyad)).toMatch(/^Kişi oturum-\d+$/);
    const son = soap.istekler.at(-1);
    expect(son?.govde).toMatch(/<Not>Başvuru onaylandı\. No: \d+<\/Not>/);
    expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
    await tasmaYok(page, 'sonuç (masaüstü)');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('.uctan-sonucu')).toContainText('3 adım başarılı');
    await tasmaYok(page, 'sonuç (390 px)');
    // Sonuçlar > Uçtan uca akışlar: koşu listesi.
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/#/sonuclar/uctan-uca');
    await expect(page.getByRole('tab', { name: 'Uçtan uca akışlar' })).toHaveAttribute('aria-selected', 'true');
    const tablo = page.getByRole('table', { name: 'Uçtan uca akış koşuları' });
    await expect(tablo).toContainText('Sipariş uçtan uca');
    await expect(tablo).toContainText('Başarılı');
    await page.setViewportSize({ width: 390, height: 844 });
    await tasmaYok(page, 'Sonuçlar sekmesi (390 px)');
    // Ekran adımının koşusu ekran sonuçlarında da (senaryonun geçmişi) kayıtlı.
    const ayrinti = await basarili(`/platform/uctan-uca/kosu?projeId=${projeId}&id=${kosuId}`);
    const sonucId = ayrinti.kosu.sonuc.adimlar[1].ekran.sonucId;
    expect(typeof sonucId).toBe('string');
    const ekranSonucu = (await basarili(`/platform/sonuclar/sonuc?id=${sonucId}`)).sonuc as Nesne;
    expect(ekranSonucu.durum).toBe('basarili');
    expect((ekranSonucu.medya as Nesne[]).filter((m) => m.tur === 'ekran_goruntusu').length).toBeGreaterThanOrEqual(3);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
