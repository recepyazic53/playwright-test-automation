// EYLEM VE DOĞRULAMA KEŞFİ (tarama/eylem-kesfi.mjs + eylem-kesfi-motoru.ts) ve "Düğmeyi ve sonucu işaretle"deki adaylar.
// Tarama hiçbir düğmeye BASMAZ: gönderim düğmesi, başarı mesajı, hata alanları, yönlendirme ve bekleme göstergesi sayfadaki
// izlerden güven düzeyiyle çıkarılır; seçilen aday mevcut model alanlarına (kosu.aksiyonlar, basariGostergesi, hataGostergesi) yazılır.
// Güvenlik: yalnız 127.0.0.1'deki sahte başvuru formu (eylem-kesfi-fikstur.ts); tarayıcı DNS çözümlemez (korumaliTarayici),
// tarama yalnız fikstürün kökenine izin verir; geçici veritabanı, veri/ klasörüne dokunulmaz. Basılmadığı; sayfanın tıklama /
// gönderim sayaçları, fikstürün hesaplama / gönderim sayaçları ve sayfa açıldıktan sonraki istek sayısıyla kanıtlanır.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  adayOgesi, eylemAdaylariniAyikla, eylemAdaylariniDegerlendir, kalipVar, type HamEylemIzi
} from '../../scripts/platform/tarama/eylem-kesfi.mjs';
import { eylemAdaylariniCikar } from '../../scripts/platform/tarama/eylem-kesfi-motoru';
import type { TaramaGirdisi } from '../../scripts/platform/tarama/protokol.mjs';
import { taramayiYurut } from '../../scripts/platform/tarama/tarama-motoru';
import { EylemKesfiUygulamasi } from './eylem-kesfi-fikstur';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const iz = (tur: HamEylemIzi['tur'], secici: string, metin: string | null, ek: Partial<HamEylemIzi> = {}): HamEylemIzi => ({
  tur, secici, seciciTuru: 'css', kirilganlik: 'orta', metin, gizli: false, konum: null, ...ek
});

test.describe.configure({ mode: 'serial' });
let tarayici: Browser;
test.beforeAll(async () => { tarayici = await korumaliTarayici(); });
test.afterAll(async () => { await tarayici?.close(); });

test('saf kurallar: güven düzeyi ve sıralama, olumsuz düğmeler sonda, kayıt ipucu, metinsiz başarı tahmin, yönlendirme yalnız yol', () => {
  // Metin kalıpları Türkçe harf ve büyük harf duyarsız.
  for (const m of ['GÖNDER', 'Hesapla', 'İLERİ', 'Submit', 'Satın al']) expect(kalipVar('eylem', m), m).toBe(true);
  for (const m of ['Temizle', 'İptal', 'Geri', 'Cancel']) expect(kalipVar('olumsuz', m), m).toBe(true);
  expect(kalipVar('basariMetni', 'Başvurunuz ALINDI')).toBe(true);
  const a = eylemAdaylariniDegerlendir({
    sayfaYolu: '/form/',
    izler: [
      iz('dugme', '#temizle', 'Temizle', { formIci: true }),
      iz('dugme', '#bilgi', null, { onclick: true }),
      iz('dugme', '#hesapla', 'Hesapla', { onclick: true }),
      iz('dugme', '#kaydet', 'Kaydet', { formIci: true, submit: true }),
      iz('dugme', '#ode', 'Öde', {}),
      iz('basari', '#bos', null, { rol: 'status', gizli: true }),
      iz('basari', '#tamam', 'İşlem tamamlandı', { sinif: 'alert-success', gizli: true }),
      iz('basari', '#hata-degil', 'Başarısız oldu', { gizli: true }),
      iz('hata', '.text-danger', null, { sinif: 'text-danger' }),
      iz('hata', '.invalid-feedback', 'Zorunlu alan', { sinif: 'invalid-feedback', adet: 3, alanaBagli: true, gizli: true }),
      iz('bekleme', '#yukleniyor', 'Yükleniyor', { sinif: 'spinner', gizli: true }),
      iz('dugme', 'https://x.invalid/a', 'Gönder', {})
    ],
    yonlendirmeler: [
      { adres: '/yardim', kaynak: 'baglanti', metin: 'Yardım' }, { adres: '/devam', kaynak: 'baglanti', metin: 'Devam' },
      { adres: '/tesekkur?no=5', kaynak: 'form', metin: null }, { adres: '/form/', kaynak: 'form', metin: null }
    ]
  });
  // Gönderim: submit (güçlü) → eylem metinli (olası; puana göre) → tahminler; tam adres seçici atılır.
  expect(a.gonderim.map((x) => [x.secici, x.guven])).toEqual([
    ['#kaydet', 'guclu'], ['#hesapla', 'olasi'], ['#ode', 'olasi'], ['#bilgi', 'tahmin'], ['#temizle', 'tahmin']
  ]);
  expect(a.gonderim.map((x) => x.enOlasi)).toEqual([true, false, false, false, false]);
  expect(a.gonderim.find((x) => x.secici === '#kaydet')?.kayitOlusturabilir).toBe(true);
  expect(a.gonderim.find((x) => x.secici === '#ode')?.kayitOlusturabilir).toBe(true);
  expect(a.gonderim.find((x) => x.secici === '#hesapla')?.kayitOlusturabilir).toBe(false);
  expect(a.gonderim[0].oge).toEqual({ tur: 'dugme', secici: '#kaydet', kirilganlik: 'orta', seciciTuru: 'css', metin: 'Kaydet', adaySeciciler: ['#kaydet'] });
  // Başarı: sınıf + metin + gizli güçlü; metinsiz durum bölgesi tahmin; "Başarısız" başarı metni sayılmaz.
  expect(a.basari.map((x) => [x.secici, x.guven])).toEqual([['#tamam', 'guclu'], ['#bos', 'tahmin'], ['#hata-degil', 'tahmin']]);
  // Hata: alan hata kabı (grup) güçlü; yalnız text-danger tahmin; oge metinsiz hata göstergesi.
  expect(a.hata.map((x) => [x.secici, x.guven, x.adet])).toEqual([['.invalid-feedback', 'guclu', 3], ['.text-danger', 'tahmin', undefined]]);
  expect(a.hata[0].oge).toMatchObject({ tur: 'hata', secici: '.invalid-feedback', metin: null });
  expect(a.bekleme.map((x) => [x.secici, x.guven, x.oge])).toEqual([['#yukleniyor', 'guclu', null]]);
  // Yönlendirme: form önce; sorgu atılır; aynı sayfa ve eylem metni olmayan bağlantı atlanır.
  expect(a.yonlendirme).toEqual([
    { adres: '/tesekkur', kaynak: 'form', metin: null, guven: 'tahmin' }, { adres: '/devam', kaynak: 'baglanti', metin: 'Devam', guven: 'tahmin' }
  ]);
  // Ayıklama: bozuk girdi null; geçersiz seçici ve bilinmeyen güven atılır, oge yeniden üretilir.
  expect(eylemAdaylariniAyikla('x')).toBeNull();
  const ayik = eylemAdaylariniAyikla({ ...a, gonderim: [...a.gonderim, { secici: '', guven: 'guclu' }, { secici: '#x', guven: 'kesin' }], basari: [{ ...a.basari[0], oge: { tur: 'dugme' } }] });
  expect(ayik?.gonderim).toHaveLength(5);
  expect(ayik?.basari[0].oge).toEqual(adayOgesi(a.basari[0]));
  expect(ayik?.yonlendirme).toEqual(a.yonlendirme);
});

test('eylemAdaylariniCikar(page): sahte formda adaylar ve güven sıralaması; hiçbir düğmeye basılmaz, istek gitmez', async () => {
  const uygulama = new EylemKesfiUygulamasi();
  const sunucu = await yerelSunucu(uygulama.isle);
  const baglam = await tarayici.newContext();
  try {
    const page = await baglam.newPage();
    await page.goto(`${sunucu.adres}/basvuru/`);
    await expect(page.getByRole('button', { name: 'Gönder' })).toBeVisible();
    const istekler: string[] = [];
    page.on('request', (r) => istekler.push(`${r.method()} ${r.url()}`));
    const a = await eylemAdaylariniCikar(page);

    expect(a.gonderim.map((x) => [x.metin, x.guven, x.secici])).toEqual([
      ['Gönder', 'guclu', 'role=button[name="Gönder"]'],
      ['Hesapla', 'olasi', 'role=button[name="Hesapla"]'],
      ['Devam et', 'olasi', 'role=link[name="Devam et"]'],
      ['Geri', 'tahmin', 'role=button[name="Geri"]'],
      ['Temizle', 'tahmin', 'role=button[name="Temizle"]']
    ]);
    const gonder = a.gonderim[0];
    expect(gonder).toMatchObject({ enOlasi: true, kayitOlusturabilir: true, gizli: false, seciciTuru: 'rol', kirilganlik: 'dusuk' });
    expect(gonder.gerekce).toContain('form içinde gönderim (submit) düğmesi');
    expect(gonder.konum && gonder.konum.genislik > 0 && gonder.konum.yukseklik > 0).toBe(true);
    expect(a.gonderim[1].gerekce).toEqual(expect.arrayContaining(['form dışında', 'eylem metni', 'tıklama betiği (onclick)']));
    // Gizli başarı kutusu: rol seçicisi gizli öğeyi bulmaz → kimlik.
    expect(a.basari.map((x) => [x.metin, x.guven, x.secici, x.gizli])).toEqual([['Başvurunuz alındı.', 'guclu', '#basvuruSonucu', true]]);
    expect(a.basari[0].konum).toBeNull();
    expect(a.hata).toHaveLength(1);
    expect(a.hata[0]).toMatchObject({ secici: '.invalid-feedback', adet: 4, guven: 'guclu', gizli: true, oge: { tur: 'hata', secici: '.invalid-feedback' } });
    expect(a.hata[0].gerekce).toEqual(expect.arrayContaining(['alan hata kabı (.invalid-feedback)', 'alana bağlı (aria-describedby / alanın yanında)', 'sayfada 1 alanda aria-invalid']));
    expect(a.yonlendirme.map((y) => [y.adres, y.kaynak])).toEqual([['/tesekkurler', 'form'], ['/devam/adim-2', 'baglanti']]);
    expect(a.bekleme.map((x) => [x.secici, x.guven, x.metin])).toEqual([['#yukleniyor', 'guclu', 'Hesaplanıyor…']]);

    // BASILMADI: sayfanın sayaçları, fikstürün sayaçları, yeni istek yok; geçici işaretler kaldırıldı.
    expect(await page.evaluate(() => [(window as unknown as Nesne).__tiklamalar, (window as unknown as Nesne).__gonderimler])).toEqual([0, 0]);
    expect(await page.locator('[data-nobetci-secilen]').count()).toBe(0);
    expect(await page.evaluate(() => typeof (window as unknown as Nesne).__nobetciOgeBilgisi)).toBe('undefined');
    expect(istekler).toEqual([]);
    expect([uygulama.hesaplamalar, uygulama.gonderimler]).toEqual([0, 0]);
    expect(uygulama.istekler.filter((x) => x !== 'GET /favicon.ico')).toEqual(['GET /basvuru/']);
    expect(page.url()).toBe(`${sunucu.adres}/basvuru/`);
  } finally {
    await baglam.close();
    await sunucu.kapat();
  }
});

test('otomatik tarama (girişsiz): profil envanterinde eylem adayları; düğmeye basılmaz, form gönderilmez', async () => {
  test.setTimeout(90_000);
  const uygulama = new EylemKesfiUygulamasi();
  const sunucu = await yerelSunucu(uygulama.isle);
  try {
    const g: TaramaGirdisi = {
      tabanUrl: sunucu.adres, hedefAdres: `${sunucu.adres}/basvuru/`, hedefYol: '/basvuru/', tarif: null, kimlik: null,
      profiller: [{ ad: null, degerler: null }], kesif: true, yasakKaliplari: ['*yasak-ornek*'], izinliKokenler: [sunucu.adres], zamanAsimiMs: 60_000
    };
    const envanter = await taramayiYurut(tarayici, g, async () => undefined);
    const a = envanter.profiller[0].eylemAdaylari;
    expect(a?.gonderim[0]).toMatchObject({ metin: 'Gönder', guven: 'guclu', secici: 'role=button[name="Gönder"]' });
    expect(a?.basari[0]).toMatchObject({ secici: '#basvuruSonucu', guven: 'guclu' });
    expect(a?.hata[0]).toMatchObject({ secici: '.invalid-feedback', adet: 4 });
    expect(a?.yonlendirme[0]).toMatchObject({ adres: '/tesekkurler', kaynak: 'form' });
    expect([uygulama.hesaplamalar, uygulama.gonderimler]).toEqual([0, 0]);
    expect(uygulama.istekler.filter((x) => !x.startsWith('GET '))).toEqual([]);
  } finally {
    await sunucu.kapat();
  }
});

test.describe('arayüz: "Düğmeyi ve sonucu işaretle" adımında adaylar', () => {
  const PAROLA = `Gecici-Eylem-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let uygulama: EylemKesfiUygulamasi;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''}`).toBe(true);
    return y;
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'eylem-kesfi-'));
    uygulama = new EylemKesfiUygulamasi();
    fikstur = await yerelSunucu(uygulama.isle);
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('adaylar seçenek olarak sunulur (en olası işaretli), seçilen aday modele yazılır, geri dönüşte seçim korunur', async () => {
    test.setTimeout(180_000);
    const projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Eylem Projesi' })).proje as Nesne).id);
    const ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
    const b = await basarili('/platform/tarama/baslat', { projeId, ekranAdi: 'Başvuru', ortamId, hedef: '/basvuru/', girissiz: true, onay: true });
    const isId = String(b.isId);
    let d = (await api(`/platform/tarama/durum?id=${isId}`)).is as Nesne;
    for (const son = Date.now() + 90_000; d.durum === 'suruyor' && Date.now() < son; d = (await api(`/platform/tarama/durum?id=${isId}`)).is as Nesne) {
      await new Promise((c) => setTimeout(c, 250));
    }
    expect(d, JSON.stringify(d.hata)).toMatchObject({ durum: 'tamam', paketHazir: true });
    // Uçlar: isaretler ve paket adayları döner (pakete / modele yazılmaz).
    const v = await api(`/platform/tarama/isaretler?id=${isId}`);
    expect((v.eylemAdaylari as Nesne).gonderim[0]).toMatchObject({ metin: 'Gönder', enOlasi: true });
    expect(v).toMatchObject({ isaretlendi: false, eylemSecimi: null });
    const p0 = await api(`/platform/tarama/paket?id=${isId}`);
    expect((p0.eylemAdaylari as Nesne).basari[0].secici).toBe('#basvuruSonucu');
    expect(JSON.stringify(p0.paket)).not.toContain('eylemAdaylari');

    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 } });
    try {
      const page = await baglam.newPage();
      await page.goto(`/#/ekranlar/tarama/${isId}`);
      await expect(page.getByRole('heading', { name: 'Düğmeyi ve sonucu işaretle: Başvuru' })).toBeVisible();
      const oneriler = page.getByRole('region', { name: 'Nöbetçi’nin önerileri' });
      const gonderim = oneriler.getByRole('group', { name: 'Gönderim düğmesi' });
      await expect(gonderim.getByRole('radio')).toHaveCount(6);
      await expect(gonderim.getByRole('radio', { name: /“Gönder”/ })).toBeChecked();
      await expect(gonderim.locator('li').first()).toContainText('en olası');
      await expect(gonderim.locator('li').first()).toContainText('kayıt oluşturabilir');
      await expect(oneriler.getByRole('group', { name: 'Başarı mesajı' }).getByRole('radio', { name: /Başvurunuz alındı/ })).toBeChecked();
      await expect(oneriler.getByRole('group', { name: 'Hata alanları' }).getByRole('radio', { name: /invalid-feedback/ })).toBeChecked();
      await expect(oneriler).toContainText('/tesekkurler');
      await expect(oneriler).toContainText('Bekleme göstergeleri');
      await expect(page.getByText('Düğme ve sonuç işaretlenmezse')).toHaveCount(0);
      // "Sayfada seç" yine sunulur.
      await expect(page.getByRole('region', { name: '2. Düğmeyi ve sonucu işaretle' }).getByRole('button', { name: 'Sayfada seç' })).toBeVisible();
      // Kullanıcı başka adayı seçer: Hesapla.
      await gonderim.getByRole('radio', { name: /“Hesapla”/ }).check();
      await page.getByRole('button', { name: 'Önizlemeye geç' }).click();
      await expect(page.getByRole('button', { name: 'İşaretlemeye dön' })).toBeVisible();
      const paket = (await api(`/platform/tarama/paket?id=${isId}`)).paket as Nesne;
      const kosu = paket.model.adimlar[0].kosu as Nesne;
      expect(kosu.aksiyonlar).toEqual([{ tur: 'tikla', secici: 'role=button[name="Hesapla"]', aciklama: 'Hesapla' }]);
      expect(kosu.basariGostergesi).toEqual({ tur: 'metin', deger: 'Başvurunuz alındı', secici: '#basvuruSonucu' });
      expect(kosu.hataGostergesi).toEqual({ secici: '.invalid-feedback' });
      // Geri dönüş: seçim korunur.
      await page.getByRole('button', { name: 'İşaretlemeye dön' }).click();
      await expect(page.getByRole('group', { name: 'Gönderim düğmesi' }).getByRole('radio', { name: /“Hesapla”/ })).toBeChecked();
      // "Hiçbiri": hata göstergesi yazılmaz.
      await page.getByRole('group', { name: 'Hata alanları' }).getByRole('radio', { name: /Hiçbiri/ }).check();
      await page.getByRole('button', { name: 'Önizlemeye geç' }).click();
      await expect(page.getByRole('button', { name: 'İşaretlemeye dön' })).toBeVisible();
      const paket2 = (await api(`/platform/tarama/paket?id=${isId}`)).paket as Nesne;
      expect(paket2.model.adimlar[0].kosu.hataGostergesi).toBeUndefined();
      // 390 px: taşma yok.
      await page.getByRole('button', { name: 'İşaretlemeye dön' }).click();
      await page.setViewportSize({ width: 390, height: 900 });
      await expect(page.getByRole('region', { name: 'Nöbetçi’nin önerileri' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
    } finally {
      await baglam.close();
    }
    // Hiçbir düğmeye basılmadı, form gönderilmedi.
    expect([uygulama.hesaplamalar, uygulama.gonderimler]).toEqual([0, 0]);
    expect(uygulama.istekler.filter((x) => !x.startsWith('GET '))).toEqual([]);
  });
});
