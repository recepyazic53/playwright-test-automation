// KORUMA TESTLERİ — BASİT MOD (v1.5): kullanım modu çalışma alanının (kasa) ayarıdır; kayıt yoksa Gelişmiş (mevcut kurulumlar
// bugünkü arayüzle açılır). Yeni çalışma alanı sihirbazında ayrı "Kullanım" adımı. Basit üst çubuk: Testlerim · Sonuçlar · Ayarlar,
// "+ Yeni test", Basit / Gelişmiş anahtarı. Testlerim (bir satır = bir ekran; değişken sayısı, son sonuç, "Eksik" + gerekçe,
// Gelişmiş'te oluşturulanların sayısı), Basit Çalıştır penceresi (sayım, "Her gün" → planlı koşu kuralı, CANLI onayı), Basit
// Sonuçlar, mod geçişi onayı (bir kez), yedekte mod ve 1440 / 390 px taşma.
// Güvenlik: yalnız 127.0.0.1'deki geçici Nöbetçi (geçici veritabanı); ortam adresleri 127.0.0.1:9 (hiç istek atılmaz). Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { senaryoKaydet } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { kullanimModunuKaydet, kullanimModunuOku } from '../../scripts/platform/ayarlar/kullanim-modu.mjs';
import { yedekIceAktar, yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF } from './platform-ortak';

type Json = Record<string, any>;

const alan = (id: string, etiket: string): Json => ({
  id, tip: 'metin', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: true
});
/** Tek adımlı ekran modeli (hazırlık fikstürüyle aynı biçim); kosu: gönderme / başarı göstergesi ya da yok. */
function model(anahtar: string, ad: string, kosu: Json | null): Json {
  return {
    semaSurumu: 2, tur: 'ekran', id: anahtar, ad, aciklama: 'Basit mod fikstürü (değerler sahte).', ekranUrl: `/${anahtar}`, girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [{ id: 'bilgiler', sira: 1, baslik: 'Bilgiler', bolumler: [{ id: 'b1', baslik: 'Bilgiler', alanlar: [alan('ad', 'Ad')] }], ...(kosu ? { kosu } : {}) }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}
const TAM = { aksiyonlar: [{ tur: 'tikla', secici: '#gonder', aciklama: 'Gönder' }], basariGostergesi: { tur: 'metin', deger: 'Kaydedildi', secici: '#sonuc' } };
const GOSTERGESIZ = { aksiyonlar: [{ tur: 'tikla', secici: '#gonder', aciklama: 'Gönder' }] };

/** Sayfa yatay taşıyor mu (px)? */
const tasma = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('Basit mod (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Basit-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let testOrtami = '';
  let tamEkran = '';
  let eksikEkran = '';
  let yeniKosu = '';
  let eskiKosu = '';
  let eksikSenaryo = '';
  const api = (yol: string, govde?: Json) => nobetciApi(nobetci, yol, govde) as Promise<Json>;
  const mod = async () => ((await api('/platform/kullanim-modu')).kullanimModu as Json);

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'basit-mod-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Basit Projesi' });
    testOrtami = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
    ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'http://127.0.0.1:9/', ayarlar: { riskli: true } });
    tamEkran = ekranKaydet(vt, { projeId, anahtar: 'tam-form', ad: 'Tam form' });
    ekranModeliEkle(vt, { ekranId: tamEkran, model: model('tam-form', 'Tam form', TAM) });
    eksikEkran = ekranKaydet(vt, { projeId, anahtar: 'gostergesiz-form', ad: 'Göstergesiz form' });
    ekranModeliEkle(vt, { ekranId: eksikEkran, model: model('gostergesiz-form', 'Göstergesiz form', GOSTERGESIZ) });
    const kaydet = (ekranId: string, baslik: string) => senaryoKaydet(vt, { projeId, ekranId, baslik, veri: { baslik, ad: 'Deneme' }, ortamIdleri: [testOrtami] }).id;
    const bireysel = kaydet(tamEkran, 'Bireysel');
    const kurumsal = kaydet(tamEkran, 'Kurumsal');
    eksikSenaryo = kaydet(eksikEkran, 'Tek değişken');
    // Gelişmiş'te oluşturulmuş servis testleri (Basit modda yalnız sayısı görünür).
    const servisId = servisKaydet(vt, { projeId, anahtar: 'sorgu', ad: 'Sorgu servisi', tur: 'rest' });
    for (const b of ['Sorgu 1', 'Sorgu 2']) servisSenaryosuKaydet(vt, { projeId, servisId, baslik: b, icerik: { operasyon: 'sorgu', govde: '', kontroller: [], http: { metot: 'GET', yol: '/sorgu' } } });
    // İki koşu: eski (hepsi başarılı) ve yeni (biri başarısız).
    const simdi = Date.now();
    eskiKosu = kosuKaydet(vt, { id: `platform-eski-${randomBytes(4).toString('hex')}`, projeId, ortamId: testOrtami, tur: 'tam', kapsam: 'Genel', baslangic: new Date(simdi - 2 * 86_400_000).toISOString() });
    sonucKaydet(vt, { kosuId: eskiKosu, projeId, senaryoId: bireysel, senaryoBaslik: 'Bireysel', urunAdi: 'Tam form', durum: 'basarili', sureMs: 4000 });
    kosuyuBitir(vt, eskiKosu, { durum: 'tamamlandi' });
    yeniKosu = kosuKaydet(vt, { id: `platform-yeni-${randomBytes(4).toString('hex')}`, projeId, ortamId: testOrtami, tur: 'tam', kapsam: 'Genel', baslangic: new Date(simdi - 3_600_000).toISOString() });
    sonucKaydet(vt, { kosuId: yeniKosu, projeId, senaryoId: bireysel, senaryoBaslik: 'Bireysel', urunAdi: 'Tam form', durum: 'basarili', sureMs: 5000 });
    sonucKaydet(vt, {
      kosuId: yeniKosu, projeId, senaryoId: kurumsal, senaryoBaslik: 'Kurumsal', urunAdi: 'Tam form', durum: 'basarisiz', sureMs: 61000,
      hataMesaji: '"Kaydedildi" metni 60 sn içinde görünmedi.\nAyrıntı: #sonuc bulunamadı.'
    });
    kosuyuBitir(vt, yeniKosu, { durum: 'tamamlandi' });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0' });
    expect((await api('/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  const sayfaAc = async (adres: string, genislik = 1440) => {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const disari: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith(nobetci.adres) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) disari.push(r.url()); });
    await page.goto(adres);
    return { baglam, page, hatalar, disari };
  };

  test('ayar yoksa Gelişmiş (bugünkü üst çubuk + anahtar); geçersiz mod reddedilir', async () => {
    expect(await mod()).toEqual({ mod: 'gelismis', kayitli: false, gelismisAciklamasiGoruldu: false });
    expect(await api('/platform/kullanim-modu/kaydet', { mod: 'kolay' })).toMatchObject({ basarili: false });
    expect(await api('/platform/kullanim-modu/kaydet', {})).toMatchObject({ basarili: false });
    const { baglam, page, hatalar, disari } = await sayfaAc('/#/sonuclar');
    const menu = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(menu.getByRole('link')).toHaveText(['Sonuçlar', 'Senaryolar', 'Ekranlar', 'Test verisi', 'Planlı koşular', 'Ayarlar']);
    await expect(page.getByRole('button', { name: /Oluştur/ }).first()).toBeVisible();
    // Gelişmiş üst çubuğu değişmez: anahtar Ayarlar'ın yan panelinde.
    await expect(page.locator('.ust-cubuk .mod-anahtari')).toHaveCount(0);
    await expect(page.locator('.gelismis-sayfa-notu')).toHaveCount(0);
    await page.goto('/#/ayarlar/proje');
    const anahtar = page.getByRole('group', { name: 'Kullanım modu' });
    await expect(anahtar.getByRole('button', { name: 'Gelişmiş' })).toHaveAttribute('aria-pressed', 'true');
    await expect(anahtar.getByRole('button', { name: 'Basit' })).toHaveAttribute('aria-pressed', 'false');
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await baglam.close();
  });

  test('mod geçişi: Gelişmiş → Basit sorusuz; Basit üst çubuk; Gelişmiş sayfası notu; Basit → Gelişmiş açıklamalı onay (bir kez)', async () => {
    const { baglam, page, hatalar, disari } = await sayfaAc('/#/ayarlar/proje');
    // Ayarlar her iki modda da menüde: geçişte sayfa yerinde kalır.
    await page.locator('.yan-panel').getByRole('group', { name: 'Kullanım modu' }).getByRole('button', { name: 'Basit' }).click();
    await expect(page.locator('.ust-cubuk .mod-anahtari')).toBeVisible();
    await expect(page).toHaveURL(/#\/ayarlar\/proje$/);
    await page.goto('/#/testlerim');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await mod()).toMatchObject({ mod: 'basit', kayitli: true });
    const menu = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(menu.getByRole('link')).toHaveText(['Testlerim', 'Sonuçlar', 'Ayarlar']);
    await expect(menu.getByRole('link', { name: 'Testlerim' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Yeni test' })).toHaveAttribute('href', '#/hizli-test');
    await expect(page.getByRole('button', { name: /Oluştur/ })).toHaveCount(0);
    // Hızlı arama, tema, kilit yerinde.
    await expect(page.locator('.ust-cubuk .hizli-arama-dugmesi')).toBeVisible();
    await expect(page.locator('.ust-cubuk .tema-dugmesi')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kilitle' })).toBeVisible();
    // Yeniden yüklemede mod korunur (kasada).
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link')).toHaveText(['Testlerim', 'Sonuçlar', 'Ayarlar']);
    // Gelişmiş'e ait adres Basit modda da açılır; üstte not. Ayarlar ortak: not yok.
    const not = page.getByRole('note').filter({ hasText: 'Bu sayfa Gelişmiş moda ait' });
    await page.goto('/#/planli-kosular');
    await expect(page.getByRole('heading', { level: 2, name: 'Planlı koşular' })).toBeVisible();
    await expect(not).toBeVisible();
    await page.goto('/#/ayarlar/arayuz');
    await expect(not).toBeHidden();
    await page.goto('/#/basit-sonuclar');
    await expect(not).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Sonuçlar' })).toHaveAttribute('aria-current', 'page');
    // Basit → Gelişmiş: açıklamalı onay; Vazgeç → mod değişmez.
    await page.goto('/#/senaryolar');
    await expect(not).toBeVisible();
    await not.getByRole('button', { name: 'Gelişmiş\'e geç' }).click();
    const onay = page.getByRole('dialog', { name: 'Gelişmiş moda geç' });
    await expect(onay).toBeVisible();
    await expect(onay).toContainText('Hiçbir veri değişmez.');
    await onay.getByRole('button', { name: 'Vazgeç' }).click();
    expect((await mod()).mod).toBe('basit');
    await not.getByRole('button', { name: 'Gelişmiş\'e geç' }).click();
    await onay.getByRole('button', { name: 'Gelişmiş\'e geç' }).click();
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link')).toHaveText(['Sonuçlar', 'Senaryolar', 'Ekranlar', 'Test verisi', 'Planlı koşular', 'Ayarlar']);
    // Aynı sayfada kalınır (Senaryolar Gelişmiş'e ait), not kalkar.
    await expect(page).toHaveURL(/#\/senaryolar$/);
    await expect(page.locator('.gelismis-sayfa-notu')).toHaveCount(0);
    expect(await mod()).toEqual({ mod: 'gelismis', kayitli: true, gelismisAciklamasiGoruldu: true });
    // Açıklama bir kez: sonraki geçişler sorusuz.
    await page.goto('/#/ayarlar/arayuz');
    await page.locator('.yan-panel').getByRole('group', { name: 'Kullanım modu' }).getByRole('button', { name: 'Basit' }).click();
    await expect(page.locator('.ust-cubuk .mod-anahtari')).toBeVisible();
    await page.goto('/#/testlerim');
    await page.locator('.ust-cubuk').getByRole('group', { name: 'Kullanım modu' }).getByRole('button', { name: 'Gelişmiş' }).click();
    await expect(page).toHaveURL(/#\/senaryolar$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await mod()).mod).toBe('gelismis');
    expect((await api('/platform/kullanim-modu/kaydet', { mod: 'basit' })).basarili).toBe(true);
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await baglam.close();
  });

  test('Testlerim: satır = ekran, değişken sayısı, son sonuç, Eksik + gerekçe + Tamamla, ⋯ menüsü; Gelişmiş notu', async () => {
    test.setTimeout(60_000);
    const { baglam, page, hatalar, disari } = await sayfaAc('/#/testlerim');
    await expect(page.getByRole('heading', { level: 2, name: 'Testlerim' })).toBeVisible();
    const satirlar = page.locator('.test-satiri');
    await expect(satirlar).toHaveCount(2);
    const tam = satirlar.filter({ hasText: 'Tam form' });
    await expect(tam).toContainText('2 değişken');
    await expect(tam.locator('.rozet')).toHaveText(['1 başarısız']);
    const eksik = satirlar.filter({ hasText: 'Göstergesiz form' });
    await expect(eksik.locator('.rozet')).toHaveText(['Eksik']);
    await expect(eksik.locator('.test-gerekcesi')).toHaveText('Bu test çalıştırılamıyor çünkü başarılı sonucun nasıl anlaşılacağı (başarı göstergesi) tanımlı değil.');
    await expect(eksik.getByRole('link', { name: /^Tamamla/ })).toHaveAttribute('href', `#/senaryolar/duzenle/${eksikSenaryo}`);
    // ⋯: Düzenle · Değişken ekle · Sil.
    await tam.getByRole('button', { name: /Test işlemleri/ }).click();
    const menu = page.getByRole('menu', { name: 'Tam form işlemleri' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Düzenle', 'Değişken ekle', 'Sil']);
    await menu.getByRole('menuitem', { name: 'Sil' }).click();
    await expect(page.getByRole('dialog')).toContainText('Ekranı kalıcı sil: Tam form');
    await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click();
    await tam.getByRole('button', { name: /Test işlemleri/ }).click();
    await menu.getByRole('menuitem', { name: 'Değişken ekle' }).click();
    await expect(page).toHaveURL(new RegExp(`#/senaryolar/yeni/${tamEkran}$`));
    await page.goto('/#/testlerim');
    // Düzenle: Hızlı test sihirbazının düzenleme kipi (ekranın adıyla açılır).
    await tam.getByRole('button', { name: /Test işlemleri/ }).click();
    await menu.getByRole('menuitem', { name: 'Düzenle' }).click();
    await expect(page).toHaveURL(new RegExp(`#/hizli-test/duzenle/${tamEkran}$`));
    await expect(page.getByRole('heading', { name: 'Hızlı test: Tam form (düzenle)' })).toBeVisible();
    await page.goto('/#/testlerim');
    // Gelişmiş'te oluşturulanlar: yalnız sayı + "Gelişmiş'te göster".
    const not = page.locator('.gelismis-testler-notu');
    await expect(not).toContainText('2 servis testi');
    await expect(not).toContainText('Basit modda listelenmez');
    await not.getByRole('button', { name: 'Gelişmiş\'te göster' }).click();
    await expect(page).toHaveURL(/#\/servisler$/);
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Senaryolar' })).toBeVisible();
    expect((await mod()).mod).toBe('gelismis');
    expect((await api('/platform/kullanim-modu/kaydet', { mod: 'basit' })).basarili).toBe(true);
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await baglam.close();
  });

  test('Çalıştır: "N testten M\'i" + gerekçe; "Her gün" planlı koşu kuralı kurar; CANLI\'da onay sorulur', async () => {
    const { baglam, page, hatalar, disari } = await sayfaAc('/#/testlerim');
    await page.getByRole('button', { name: 'Hepsini çalıştır' }).click();
    const d = page.getByRole('dialog', { name: 'Çalıştır' });
    await expect(d.locator('.basit-sayim')).toHaveText('2 testten 1\'i çalıştırılacak.');
    await expect(d.locator('.basit-gerekceler li')).toHaveText(['"Göstergesiz form" çalıştırılamıyor çünkü başarılı sonucun nasıl anlaşılacağı (başarı göstergesi) tanımlı değil.']);
    await expect(d.getByRole('button', { name: '1 testi başlat' })).toBeEnabled();
    await expect(d.getByLabel('Saat', { exact: true })).toBeDisabled();
    await d.getByRole('radio', { name: 'Her gün saat' }).check();
    await d.getByLabel('Saat', { exact: true }).fill('06:30');
    await d.getByRole('button', { name: 'Planı kaydet' }).click();
    await expect(d).toHaveCount(0);
    await expect(page.getByText('Planlı koşu kaydedildi: her gün 06:30 (TEST).')).toBeVisible();
    let kurallar = (await api(`/platform/zamanlanmis-kosular?projeId=${projeId}`)).kurallar as Json[];
    expect(kurallar).toHaveLength(1);
    expect(kurallar[0]).toMatchObject({ ad: 'Her gün 06:30 · TEST', ortamId: testOrtami, etkin: true, zaman: { tur: 'gunluk', saat: '06:30' }, kapsam: { senaryolar: 'tum' } });

    // Tek test (▷) + CANLI ortam: bu ortamda değişken yok → çalıştırılamaz; plan CANLI onayı ister, Vazgeç → kural yazılmaz.
    await page.locator('.test-satiri').filter({ hasText: 'Tam form' }).getByRole('button', { name: 'Çalıştır: Tam form' }).click();
    const t = page.getByRole('dialog', { name: 'Çalıştır: Tam form' });
    await expect(t.locator('.basit-sayim')).toHaveText('Test çalıştırılacak.');
    await t.getByLabel('Ortam').selectOption({ label: 'CANLI (Canlı)' });
    await expect(t.locator('.basit-sayim')).toHaveText('Test çalıştırılamıyor.');
    await expect(t.locator('.basit-gerekceler li')).toHaveText(['"Tam form" çalıştırılamıyor çünkü bu ortamda değişkeni yok.']);
    await expect(t.getByText('Canlı ortam: başlatmadan önce onay sorulur.')).toBeVisible();
    await t.getByRole('radio', { name: 'Her gün saat' }).check();
    await t.getByRole('button', { name: 'Planı kaydet' }).click();
    const canli = page.getByRole('dialog', { name: 'CANLI ortam' });
    await expect(canli).toBeVisible();
    await canli.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(t).toBeVisible();
    kurallar = (await api(`/platform/zamanlanmis-kosular?projeId=${projeId}`)).kurallar as Json[];
    expect(kurallar).toHaveLength(1);
    // Onaylanırsa kural o ekranla ve CANLI onayıyla kaydedilir.
    await t.getByRole('button', { name: 'Planı kaydet' }).click();
    await canli.getByRole('button', { name: 'Evet, devam et' }).click();
    await expect(t).toHaveCount(0);
    kurallar = (await api(`/platform/zamanlanmis-kosular?projeId=${projeId}`)).kurallar as Json[];
    expect(kurallar.find((k) => k.ad === 'Her gün 07:00 · Tam form · CANLI')).toMatchObject({ canliOnay: true, kapsam: { senaryolar: 'ekranlar', ekranIdleri: [tamEkran] } });
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await baglam.close();
  });

  test('Basit Sonuçlar: son koşu üstte, başarısızın sade nedeni, Yeniden; önceki koşular; Gelişmiş Sonuçlar ve PDF bağlantıları', async () => {
    const { baglam, page, hatalar, disari } = await sayfaAc('/#/basit-sonuclar');
    const kosu = page.locator('.basit-son-kosu');
    await expect(kosu.locator('h3')).toHaveText(/^(Bugün|Dün) \d{2}:\d{2} · TEST$/);
    await expect(kosu.locator('.basit-kosu-ust .rozet').first()).toHaveText('1 başarılı · 1 başarısız');
    const basarisiz = kosu.locator('.basit-sonuc.basarisiz');
    await expect(basarisiz).toHaveCount(1);
    await expect(basarisiz).toContainText('Tam form · Kurumsal');
    await expect(basarisiz.locator('.basit-neden')).toHaveText('"Kaydedildi" metni 60 sn içinde görünmedi.');
    await expect(basarisiz.getByRole('button', { name: /^Yeniden/ })).toBeEnabled();
    await expect(kosu.locator('.basit-sonuc:not(.basarisiz)')).toContainText('Tam form · 1 değişken');
    await expect(page.getByRole('link', { name: 'Tüm ayrıntılar (Gelişmiş Sonuçlar)' })).toHaveAttribute('href', `#/sonuclar/kosu/${yeniKosu}`);
    await expect(page.getByRole('button', { name: 'Rapor al (PDF)' })).toBeVisible();
    // Önceki koşu seçilince üstte açılır.
    const onceki = page.locator('.basit-onceki-listesi li');
    await expect(onceki).toHaveCount(1);
    await onceki.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`#/basit-sonuclar/kosu/${eskiKosu}$`));
    await expect(kosu.locator('.basit-kosu-ust .rozet').first()).toHaveText('1 başarılı · 0 başarısız');
    await expect(page.getByRole('link', { name: 'Son koşuya dön' })).toBeVisible();
    expect(hatalar).toEqual([]);
    expect(disari).toEqual([]);
    await baglam.close();
  });

  test('1440 / 390 px: Basit sayfalar, Gelişmiş notu ve Çalıştır penceresi taşmaz', async () => {
    const { baglam, page, hatalar } = await sayfaAc('/#/testlerim');
    for (const genislik of [1440, 1200, 1024, 768, 390]) {
      await page.setViewportSize({ width: genislik, height: 844 });
      for (const adres of ['#/testlerim', '#/basit-sonuclar', '#/hizli-test', '#/senaryolar', '#/ayarlar/proje']) {
        await page.goto(`/${adres}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(200);
        expect(await tasma(page), `${genislik}px ${adres}`).toBeLessThanOrEqual(0);
      }
      await page.goto('/#/testlerim');
      await page.getByRole('button', { name: 'Hepsini çalıştır' }).click();
      const d = page.getByRole('dialog', { name: 'Çalıştır' });
      await expect(d.locator('.basit-sayim')).toHaveText(/çalıştırılacak/);
      const kutu = await d.boundingBox();
      expect(kutu && kutu.x >= 0 && kutu.x + kutu.width <= genislik, `${genislik}px pencere`).toBe(true);
      expect(await tasma(page)).toBeLessThanOrEqual(0);
      await d.getByRole('button', { name: 'Vazgeç' }).click();
    }
    // Yeni test: Hızlı test sihirbazı (Başlat durağı).
    await page.goto('/#/hizli-test');
    await expect(page.getByRole('heading', { name: 'Yeni hızlı test' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Nöbetçi sayfadaki düğmelere basabilir mi?' })).toBeVisible();
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});

test('kurulum sihirbazı: "Kullanım" adımı (Basit önce seçili); Basit seçilince ana sayfa Testlerim', async () => {
  test.setTimeout(180_000);
  const klasor = mkdtempSync(join(tmpdir(), 'basit-mod-kurulum-'));
  const n = await nobetciBaslat(klasor, join(klasor, 'platform.db'), { NOBETCI_REHBER_OTOMATIK: '0' });
  const tarayici = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: n.adres, viewport: { width: 1440, height: 900 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const parola = `Gecici-Kurulum-${randomBytes(6).toString('hex')}`;
    await page.goto('/');
    await page.locator('.secim-karti').filter({ hasText: 'Yeni proje başlat' }).click();
    await expect(page.locator('.adimlar li')).toHaveText([/^Kasa parolası/, 'Proje', 'Ortamlar', 'İzinler', 'Kullanım', 'Giriş', 'Tamam']);
    await page.getByRole('textbox', { name: 'Kasa parolası (zorunlu)', exact: true }).fill(parola);
    await page.getByRole('textbox', { name: 'Kasa parolası (tekrar) (zorunlu)', exact: true }).fill(parola);
    await page.getByText('Parolayı unutursam').click();
    await page.getByRole('button', { name: 'Kasayı oluştur ve devam et' }).click();
    await page.getByLabel('Proje adı').fill('İlk proje');
    await page.getByRole('button', { name: 'Devam' }).click();
    await page.getByLabel('Adres (link)').first().fill('http://127.0.0.1:9/');
    await page.getByRole('button', { name: 'Kaydet ve devam' }).click();
    await page.getByRole('button', { name: 'Atla' }).click();
    await expect(page.locator('.adimlar li[aria-current="step"]')).toHaveText('Kullanım');
    await expect(page.locator('.sihirbaz-baslik .kirinti')).toContainText('Adım 5 / 7');
    await expect(page.getByRole('radio', { name: /^Basit — Nöbetçi'yi ilk kez kullanıyorum/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: /^Gelişmiş — tüm özellikler/ })).not.toBeChecked();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Devam' }).click();
    await expect(page.locator('.adimlar li[aria-current="step"]')).toHaveText('Giriş');
    expect(((await nobetciApi(n, '/platform/kullanim-modu')).kullanimModu as Json)).toMatchObject({ mod: 'basit', kayitli: true });
    await page.getByRole('button', { name: 'Devam' }).click();
    await expect(page.getByRole('heading', { name: 'Proje hazır' })).toBeVisible();
    await page.getByRole('button', { name: 'Ana sayfaya geç' }).click();
    await expect(page).toHaveURL(/#\/testlerim$/);
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link')).toHaveText(['Testlerim', 'Sonuçlar', 'Ayarlar']);
    // Boş durum: beş adımlık şerit + "İlk testi oluştur"; rehber kendiliğinden açılmaz.
    await expect(page.getByRole('list', { name: 'Basit test adımları' }).locator('li')).toHaveText(['1Adres gir', '2Keşfet', '3Eksikleri tamamla', '4Çalıştır', '5Sonucu gör']);
    await expect(page.getByRole('link', { name: 'İlk testi oluştur' })).toHaveAttribute('href', '#/hizli-test');
    await expect(page.locator('.rehber-karti')).toHaveCount(0);
    // Aynı kasada yeni proje: "Kullanım" sorulmaz (çalışma alanının ayarı).
    await page.locator('.proje-secici').click();
    await page.getByRole('menuitem', { name: 'Proje ekle' }).click();
    await expect(page.locator('.adimlar li')).toHaveText(['Proje', 'Ortamlar', 'Giriş', 'Tamam']);
    expect(hatalar).toEqual([]);
    await baglam.close();
  } finally {
    await tarayici.close();
    n.surec.kill('SIGTERM');
    rmSync(klasor, { recursive: true, force: true });
  }
});

test('yedekte mod: tam yüklemede yedekteki mod geçerli olur (kayıtsız yedek → Gelişmiş)', async () => {
  const klasor = mkdtempSync(join(tmpdir(), 'basit-mod-yedek-'));
  const PAROLA = `Gecici-Yedek-${randomBytes(6).toString('hex')}`;
  try {
    const kaynak = await veritabaniniHazirla(join(klasor, 'kaynak.db'));
    await kasaOlustur(kaynak, PAROLA, { kdf: HIZLI_KDF });
    projeKaydet(kaynak, { ad: 'Yedek projesi' });
    const kayitsizYedek = yedekOlustur(kaynak).veri;
    expect(kullanimModunuKaydet(kaynak, { mod: 'basit' })).toMatchObject({ mod: 'basit', kayitli: true });
    const basitYedek = yedekOlustur(kaynak).veri;

    const hedef = await veritabaniniHazirla(join(klasor, 'hedef.db'));
    await kasaOlustur(hedef, `Gecici-Hedef-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
    expect(kullanimModunuOku(hedef)).toEqual({ mod: 'gelismis', kayitli: false, gelismisAciklamasiGoruldu: false });
    await yedekIceAktar(hedef, basitYedek, PAROLA, { mod: 'tamYukle', onay: true, medyaKlasoru: null, guvenlikYedegiKlasoru: join(klasor, 'guvenlik') });
    expect(kullanimModunuOku(hedef)).toMatchObject({ mod: 'basit', kayitli: true });
    // Kaydı olmayan (v1.5 öncesi) yedek: yedekteki durum geçerli → Gelişmiş.
    await yedekIceAktar(hedef, kayitsizYedek, PAROLA, { mod: 'tamYukle', onay: true, medyaKlasoru: null, guvenlikYedegiKlasoru: join(klasor, 'guvenlik-2') });
    expect(kullanimModunuOku(hedef)).toEqual({ mod: 'gelismis', kayitli: false, gelismisAciklamasiGoruldu: false });
    // Geçersiz girdi reddedilir.
    expect(() => kullanimModunuKaydet(hedef, { mod: 'kolay' })).toThrow(/basit.*gelismis/);
    expect(() => kullanimModunuKaydet(hedef, null)).toThrow();
    kaynak.kapat();
    hedef.kapat();
  } finally {
    rmSync(klasor, { recursive: true, force: true });
  }
});
