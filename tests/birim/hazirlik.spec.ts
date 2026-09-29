// KORUMA TESTLERİ — SENARYO HAZIRLIK KONTROLÜ ve "NEDEN ÇALIŞMIYOR?" (senaryolar/hazirlik.mjs, hazirlik-servisi.mjs, ortam-denetimi.mjs).
//  1) Saf kurallar: eksik gönderme düğmesi / eksik beklenen sonuç / eksik test verisi için TEK cümlelik gerekçe; koşucunun plan hatası
//     aynı cümleyi yazar; "12 senaryodan 2'si çalıştırılamaz — 10'u başlatılsın mı?" sayımı.
//  2) Sunucu (127.0.0.1): senaryo listesi ortam başına hazırlık taşır; ortam bağlantısı KENDİLİĞİNDEN denetlenmez — sahte uygulamaya
//     yalnız "Denetle" (POST /platform/ortam/denetle) istek atar (sayaç); izin kapalıyken ve CANLI onaysız hiç istek gitmez.
//  3) Arayüz: senaryo formunun sağ panelinde hazırlık listesi + gerekçe; form açılınca istek yok, "Denetle"ye basınca tek istek;
//     senaryo listesinde "Çalıştırılamaz" rozeti; Koşuyu başlat penceresi çalıştırılamayanları sayar ve dışarıda bırakır.
// Ayrı Nöbetçi, geçici veritabanı; hedefler yalnız 127.0.0.1. Değerler SAHTEDİR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  NEDENLER, alanMaddesi, calistirilamazCumlesi, eylemDenetimi, hazirlikOzeti, kosuSayimMetni, sayiIyelikEki, veriMaddesi, zincirNedeni
} from '../../scripts/platform/senaryolar/hazirlik.mjs';
import { modelKosuPlani, planHatasiMetni } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Json = Record<string, any>;

const alan = (id: string, etiket: string): Json => ({
  id, tip: 'metin', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: true
});

/** Tek adımlı ekran modeli; kosu: adımın koşu tanımı (düğme / gösterge) ya da yok. */
function model(anahtar: string, ad: string, kosu: Json | null): Json {
  return {
    semaSurumu: 2, tur: 'ekran', id: anahtar, ad, aciklama: 'Hazırlık fikstürü (değerler sahte).', ekranUrl: `/${anahtar}`, girisGerekmez: true,
    specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, kosullar: {},
    adimlar: [{ id: 'bilgiler', sira: 1, baslik: 'Bilgiler', bolumler: [{ id: 'b1', baslik: 'Bilgiler', alanlar: [alan('ad', 'Ad')] }], ...(kosu ? { kosu } : {}) }],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}
const TAM = { aksiyonlar: [{ tur: 'tikla', secici: '#gonder', aciklama: 'Gönder' }], basariGostergesi: { tur: 'metin', deger: 'Kaydedildi', secici: '#sonuc' } };
const GOSTERGESIZ = { aksiyonlar: [{ tur: 'tikla', secici: '#gonder', aciklama: 'Gönder' }] };

test.describe('hazırlık kuralları (saf)', () => {
  test('eksik gönderme düğmesi: tek cümlelik gerekçe', () => {
    const e = eylemDenetimi(model('d', 'Düğmesiz', null));
    expect(e.gonderme).toMatchObject({ durum: 'eksik', neden: NEDENLER.gondermeYok, hedef: { tur: 'akis', adimId: 'bilgiler' } });
    expect(hazirlikOzeti([e.gonderme, e.beklenen]).neden)
      .toBe('Bu senaryo çalıştırılamıyor çünkü form dolduruluyor ancak gönderilecek düğme tanımlı değil ve başarılı sonucun nasıl anlaşılacağı (başarı göstergesi) tanımlı değil.');
    // Düğmesiz adımda mesaj denetimi (başarı göstergesi) varsa alanlardan çıkınca denetlenir: tanımlı sayılır.
    const d = eylemDenetimi(model('d', 'Düğmesiz', { basariGostergesi: { tur: 'metin', deger: 'Tamam' } }));
    expect(d.gonderme.durum).toBe('tamam');
    expect(d.beklenen.durum).toBe('tamam');
    // Tam model: ikisi de hazır; düğmenin ve adımın adı ayrıntıda.
    const t = eylemDenetimi(model('t', 'Tam', TAM));
    expect(t.gonderme).toMatchObject({ durum: 'tamam', ayrinti: '“Gönder” düğmesine “Bilgiler” adımında basılır.' });
    expect(t.beklenen).toMatchObject({ durum: 'tamam', ayrinti: 'Başarılı: “Bilgiler” adımında “Kaydedildi” metni görünür.' });
    expect(hazirlikOzeti([t.gonderme, t.beklenen])).toMatchObject({ calistirilabilir: true, neden: null, nedenler: [] });
  });

  test('eksik beklenen sonuç: göstergesiz başarı ve mesajsız iş kuralı hatası; koşucu aynı cümleyi yazar', () => {
    const g = eylemDenetimi(model('g', 'Göstergesiz', GOSTERGESIZ));
    expect(g.gonderme.durum).toBe('tamam');
    expect(g.beklenen).toMatchObject({ durum: 'eksik', neden: NEDENLER.beklenenYok });
    expect(hazirlikOzeti([g.gonderme, g.beklenen]).neden).toBe('Bu senaryo çalıştırılamıyor çünkü başarılı sonucun nasıl anlaşılacağı (başarı göstergesi) tanımlı değil.');
    const h = eylemDenetimi(model('t', 'Tam', TAM), { beklenen: { tur: 'hata', adim: 'bilgiler', mesaj: '' } });
    expect(h.beklenen).toMatchObject({ durum: 'eksik', neden: NEDENLER.hataMesajiYok, hedef: { tur: 'beklenen' } });
    // Koşucunun planı (modelKosuPlani) aynı gerekçe parçalarını üretir (ör. eksik ortak akış); hata metni aynı cümledir.
    const m = model('t', 'Tam', TAM);
    (m.adimlar[0] as Json).eksikOrtakAkis = 'Ödeme';
    const plan = modelKosuPlani(m, { baslik: 'X', ad: 'a' }, {});
    expect(plan.hatalar).toEqual([NEDENLER.ortakAkisYok('Bilgiler', 'Ödeme')]);
    expect(eylemDenetimi(m).engeller).toEqual(plan.hatalar);
    expect(planHatasiMetni('Örnek', plan.hatalar)).toBe('"Örnek": Bu senaryo çalıştırılamıyor çünkü “Bilgiler” adımının ortak akışı (“Ödeme”) bu projede bulunamadı. Tarayıcı açılmadı.');
    expect(planHatasiMetni('Örnek', [NEDENLER.hataMesajiYok])).toBe('"Örnek": Bu senaryo çalıştırılamıyor çünkü beklenen iş kuralı hatasının mesajı yazılmamış. Tarayıcı açılmadı.');
  });

  test('eksik test verisi, alanlar ve birden çok neden; zincirleme neden', () => {
    const v = veriMaddesi({ kullaniliyor: true, sorun: '"Kişiler" tablosunda bu ortamda satır yok' });
    expect(v).toMatchObject({ durum: 'eksik', hedef: { tur: 'tablo' } });
    expect(calistirilamazCumlesi([v.neden as string])).toBe('Bu senaryo çalıştırılamıyor çünkü test verisi bulunamadı ("Kişiler" tablosunda bu ortamda satır yok).');
    expect(veriMaddesi({ kullaniliyor: false }).durum).toBe('yok');
    expect(veriMaddesi({ kullaniliyor: true, satirlar: ['Kişiler: Birinci'] })).toMatchObject({ durum: 'tamam', ayrinti: 'Kullanılacak satır: Kişiler: Birinci.' });
    expect(alanMaddesi({ toplam: 9, hatali: 0 })).toMatchObject({ durum: 'tamam', sayi: '9/9' });
    expect(alanMaddesi({ toplam: 9, hatali: 2 })).toMatchObject({ durum: 'eksik', sayi: '7/9', neden: '2 alan düzeltilmeli' });
    expect(calistirilamazCumlesi(['a', 'b', 'c'])).toBe('Bu senaryo çalıştırılamıyor çünkü a, b ve c.');
    expect(calistirilamazCumlesi([])).toBeNull();
    expect(zincirNedeni(2, 'Ekran adımı')).toBe('2. adım (“Ekran adımı”) başarısız olduğu için bu adım çalıştırılmadı.');
    expect(zincirNedeni(1, 'Giriş', 'hata')).toBe('1. adım (“Giriş”) çalıştırılamadığı için bu adım çalıştırılmadı.');
  });

  test('Koşuyu başlat sayımı: "12 senaryodan 2\'si çalıştırılamaz — 10\'u başlatılsın mı?"', () => {
    expect(kosuSayimMetni(12, 2)).toBe('12 senaryodan 2\'si çalıştırılamaz — 10\'u başlatılsın mı?');
    expect(kosuSayimMetni(4, 3)).toBe('4 senaryodan 3\'ü çalıştırılamaz — 1\'i başlatılsın mı?');
    expect(kosuSayimMetni(2, 2)).toBe('2 senaryodan 2\'si çalıştırılamaz; başlatılacak senaryo yok.');
    expect(kosuSayimMetni(5, 0)).toBeNull();
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 1000].map(sayiIyelikEki))
      .toEqual(['i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı', 'ü', 'i']);
  });
});

test.describe('hazırlık: sunucu ve arayüz (127.0.0.1)', () => {
  // Sıralı: istek sayacı ve saklanan denetim sonucu testler arasında paylaşılır.
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Hazirlik-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let tarayici: Browser;
  let sahte: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let canliId = '';
  const senaryo: Record<string, string> = {};
  const api = (yol: string, govde?: Json) => nobetciApi(nobetci, yol, govde) as Promise<Json>;
  const basarili = async (yol: string, govde?: Json) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const paket = (anahtar: string, ad: string, kosu: Json | null) => ({
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar, ad, urlYolu: `/${anahtar}` }, olusturan: 'birim testi', olusturulma: '2026-09-30T09:00:00Z', baglamProfilleri: [] },
    model: model(anahtar, ad, kosu), senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] }, bilinmeyenler: []
  });

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'hazirlik-'));
    // Sahte uygulama: her isteği sayar (sayaç = sahte.istekler).
    sahte = await yerelSunucu(() => ({ durum: 200, govde: 'tamam' }));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Hazırlık Projesi' })).proje as Json).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: sahte.adres, varsayilan: true, riskli: false })).ortam as Json).id);
    canliId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Üretim', tabanUrl: sahte.adres, riskli: true })).ortam as Json).id);
    for (const [anahtar, ad, kosu] of [['tam-form', 'Tam form', TAM], ['dugmesiz-form', 'Düğmesiz form', null], ['gostergesiz-form', 'Göstergesiz form', GOSTERGESIZ]] as const) {
      await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(anahtar, ad, kosu), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    }
    const ekranlar = ((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).ekranlar as Json[]);
    const ekran = (ad: string) => String(ekranlar.find((e) => e.ad === ad)?.id);
    // Test verisi: satırı yalnız CANLI ortamda olan tablo → Deneme ortamında uyan satır yok.
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Kişiler', sutunlar: [{ ad: 'Ad' }], satirlar: [{ ad: 'Birinci', ortamId: canliId, degerler: { Ad: 'Ayşe' } }] });
    const kaydet = async (ad: string, ekranAdi: string, veri: Json) => {
      senaryo[ad] = String((await basarili('/platform/senaryo/kaydet', { projeId, ekranId: ekran(ekranAdi), baslik: ad, ortamIdleri: [ortamId], veri: { baslik: ad, ...veri } })).id);
    };
    await kaydet('Hazır senaryo', 'Tam form', { ad: 'Deneme' });
    await kaydet('Düğmesiz senaryo', 'Düğmesiz form', { ad: 'Deneme' });
    await kaydet('Göstergesiz senaryo', 'Göstergesiz form', { ad: 'Deneme' });
    await kaydet('Verisiz senaryo', 'Tam form', { ad: '${Kişiler.Ad}' });
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await sahte?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('liste ortam başına hazırlık taşır (gerekçe tek cümle); hiçbir istek atılmaz', async () => {
    const liste = await api(`/platform/senaryolar?projeId=${projeId}`);
    const h = (ad: string) => ((liste.senaryolar as Json[]).find((x) => x.baslik === ad)?.ortamlar as Json[]).find((o) => o.ortamId === ortamId)?.hazirlik;
    expect(h('Hazır senaryo')).toMatchObject({ calistirilabilir: true, neden: null });
    expect(h('Düğmesiz senaryo')).toMatchObject({ calistirilabilir: false, eksikler: ['gonderme', 'beklenen'] });
    expect(h('Düğmesiz senaryo').neden).toContain('Bu senaryo çalıştırılamıyor çünkü form dolduruluyor ancak gönderilecek düğme tanımlı değil');
    expect(h('Göstergesiz senaryo')).toMatchObject({ calistirilabilir: false, neden: 'Bu senaryo çalıştırılamıyor çünkü başarılı sonucun nasıl anlaşılacağı (başarı göstergesi) tanımlı değil.' });
    expect(h('Verisiz senaryo')).toMatchObject({ calistirilabilir: false, eksikler: ['veri'] });
    expect(h('Verisiz senaryo').neden).toMatch(/^Bu senaryo çalıştırılamıyor çünkü test verisi bulunamadı \(.*Kişiler.*\)\.$/u);
    // Tek senaryonun maddeleri (koşu diyaloğu).
    const d = (await api(`/platform/senaryo/hazirlik?projeId=${projeId}&id=${senaryo['Hazır senaryo']}&ortamId=${ortamId}`)).hazirlik as Json;
    expect((d.maddeler as Json[]).map((m) => [m.anahtar, m.durum])).toEqual([['veri', 'yok'], ['gonderme', 'tamam'], ['beklenen', 'tamam']]);
    expect(sahte.istekler).toEqual([]);
  });

  test('ortam bağlantısı: yalnız "Denetle" istek atar (tek GET); sonuç saklanır; izin kapalı / CANLI onaysız istek yok', async () => {
    const once = sahte.istekler.length;
    expect((await api(`/platform/ortam/denetim?projeId=${projeId}&ortamId=${ortamId}`)).denetim).toBeNull();
    expect(sahte.istekler.length).toBe(once);
    const y = await basarili('/platform/ortam/denetle', { projeId, ortamId });
    expect(y.denetim).toMatchObject({ erisilebilir: true, durumKodu: 200, oturum: null });
    expect(sahte.istekler.length).toBe(once + 1);
    expect(sahte.istekler.at(-1)).toBe('GET /');
    // Saklanan sonuç yeniden istek atmadan okunur.
    expect((await api(`/platform/ortam/denetim?projeId=${projeId}&ortamId=${ortamId}`)).denetim).toMatchObject({ erisilebilir: true, durumKodu: 200 });
    expect(sahte.istekler.length).toBe(once + 1);
    // İzin kapalı: 403, istek yok.
    await basarili('/platform/izin/degistir', { anahtar: 'web-erisimi', acik: false });
    expect(await api('/platform/ortam/denetle', { projeId, ortamId })).toMatchObject({ basarili: false, kod: 'IZIN_KAPALI' });
    await basarili('/platform/izin/degistir', { anahtar: 'web-erisimi', acik: true, onay: true });
    // CANLI ortam: açık onay yoksa 409, istek yok; onayla tek istek.
    expect(await api('/platform/ortam/denetle', { projeId, ortamId: canliId })).toMatchObject({ basarili: false, kod: 'CANLI_ONAY_GEREKLI' });
    expect(sahte.istekler.length).toBe(once + 1);
    await basarili('/platform/ortam/denetle', { projeId, ortamId: canliId, canliOnay: true });
    expect(sahte.istekler.length).toBe(once + 2);
  });

  test('arayüz: formda hazırlık listesi + gerekçe; açılınca istek yok, "Denetle" tek istek; listede rozet; Koşuyu başlat sayımı', async () => {
    test.setTimeout(120_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    await page.goto(`/#/senaryolar/duzenle/${senaryo['Düğmesiz senaryo']}`);
    const panel = page.getByRole('region', { name: 'Hazırlık kontrolü' });
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel.locator('[data-madde="alanlar"]')).toContainText('Alanlar hazır');
    await expect(panel.locator('[data-madde="alanlar"]')).toHaveClass(/tamam/);
    await expect(panel.locator('[data-madde="gonderme"]')).toHaveClass(/eksik/);
    await expect(panel.locator('[data-madde="gonderme"]').getByRole('link', { name: 'Gönderme eylemi tanımlı: tamamla' })).toHaveAttribute('href', /#\/ekranlar\/e\/.+\/akis/);
    await expect(panel.locator('.hazirlik-nedeni')).toHaveText(/^Bu senaryo çalıştırılamıyor çünkü form dolduruluyor ancak gönderilecek düğme tanımlı değil/);
    // Önceki testte denetlenen sonuç (10 dk saklanır) istek atılmadan gösterilir; form açılınca sahte uygulamaya istek gitmez.
    const once = sahte.istekler.length;
    await expect(panel.locator('[data-madde="ortam"]')).toContainText('Erişildi (200');
    await page.waitForTimeout(800);
    expect(sahte.istekler.length).toBe(once);
    await panel.getByRole('button', { name: /Ortam bağlantısını denetle/ }).click();
    await expect.poll(() => sahte.istekler.length).toBe(once + 1);
    await expect(panel.locator('[data-madde="ortam"]')).toContainText('az önce');
    await page.screenshot({ path: test.info().outputPath('hazirlik-formu.png'), fullPage: false });

    // Senaryo listesi: rozet + gerekçe + Düzelt; Koşuyu başlat çalıştırılamayanları sayar ve dışarıda bırakır.
    await page.goto('/#/senaryolar');
    const satir = page.locator('tr', { hasText: 'Düğmesiz senaryo' });
    await expect(satir.locator('.calistirilamaz-notu')).toContainText('Çalıştırılamaz');
    await expect(satir.locator('.calistirilamaz-nedeni')).toContainText('gönderilecek düğme tanımlı değil');
    await expect(satir.getByRole('link', { name: 'Düzelt: Düğmesiz senaryo' })).toBeVisible();
    await expect(page.locator('tr', { hasText: 'Hazır senaryo' }).locator('.calistirilamaz-notu')).toHaveCount(0);
    await page.getByRole('button', { name: 'Koşuyu başlat' }).click();
    const diyalog = page.getByRole('dialog');
    await expect(diyalog).toContainText('4 senaryodan 3\'ü çalıştırılamaz — 1\'i başlatılsın mı?');
    await expect(diyalog.getByRole('button', { name: '1 senaryoyu başlat' })).toBeVisible();
    await expect(diyalog.locator('.calistirilamazlar li', { hasText: 'Göstergesiz senaryo' })).toContainText('başarı göstergesi');
    await diyalog.screenshot({ path: test.info().outputPath('hazirlik-kosu-diyalogu.png') });
    await diyalog.getByRole('button', { name: 'Vazgeç' }).click();
    expect(sahte.istekler.length).toBe(once + 1);
    expect(hatalar).toEqual([]);
    await baglam.close();
  });
});
