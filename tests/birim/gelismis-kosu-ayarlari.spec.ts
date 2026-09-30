// KORUMA TESTLERİ — Ayarlar > Koşu > "Gelişmiş koşu davranışı" ve kodda sabit duran kararların ayarlara taşınması:
//  - her ayarın VARSAYILANI bugünkü davranıştır (varsayılanla koşu aynı kalır),
//  - ayar değiştirilince davranış değişir (127.0.0.1'deki sahte form, sahte saat, sahte SQL yürütücü, geçici veritabanı),
//  - tutarsızlık düzeltmeleri: test sonu ekran görüntüsü "Kapalı", SQL adımında bağlantının zaman aşımı, test süresi ile koşu süre
//    limiti, terminal / CI koşusunda kasadaki kayıtlı ayarlar, REST "Dene" zaman aşımı.
// Dış siteye istek gitmez: tarayıcı DNS'i kapalıdır, sunucular yalnız 127.0.0.1'dedir.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test, type Browser, type TestInfo } from '@playwright/test';
import { acikAnahtar, kasaAcikMi, kasaKilitle, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ayarYaz, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  KOSU_AYAR_TANIMLARI, kayitliKosuOrtamDegiskenleri, kosuAyarlariniKaydet, kosuAyarlariniOku, kosuOrtamDegiskenleri, varsayilanKosuAyarlari
} from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { basvuruyuCoz, satirSecimiOlustur, secilenSatir, type Tablo } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { SQL_SORGU_SATIR_SINIRI, sqlAdiminiKos, type SqlTanimi } from '../../scripts/platform/sql/sql-adimi.mjs';
import { vadesiGelenZaman, type Zaman } from '../../scripts/platform/zamanlama/takvim.mjs';
import { kuralKaydet, kurallariListele } from '../../scripts/platform/zamanlama/kurallar.mjs';
import { zamanlayiciOlustur } from '../../scripts/platform/zamanlama/zamanlayici.mjs';
import { taramaTarayiciAyarlari } from '../../scripts/platform/tarama/protokol.mjs';
import { EN_COK_GORUNTU_BAYT, htmlRaporuUret, raporGoruntuSiniriBayt } from '../../scripts/platform/sonuclar/html-rapor.mjs';
import { VARSAYILAN_SAGLIK_ESIKLERI, saglikEsikleriniKaydet, saglikEsikleriniOku, saglikSinifi } from '../../scripts/platform/ayarlar/saglik-esikleri.mjs';
import { videoSaklamaGunu } from '../../scripts/platform/raporlayici.mjs';
import { restUcuDene } from '../../scripts/platform/servisler/rest-servisi.mjs';
import {
  KOSU_SURE_PAYI_MS, ekranGoruntusuAyari, kasaKosuAyarlariniYukle, kosuSureLimitiMs, kosuTarayiciAyarlari, modelTestSuresiMs, yenidenDenemeAyari
} from '../support/kosu-ayarlari';
import { gorunmeyenAlanDavranisi, modelSenaryosunuKos, onayPenceresiDavranisi, type ModelKosuOrtami } from '../support/model-kosucu';
import type { PlatformModelSenaryosu } from '../support/platform-veri';
import { testSonuGoruntusuAlinsinMi } from '../support/fixtures';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

type Nesne = Record<string, unknown>;

/** process.env'i test sonunda geri yükler. */
function ortamiKoru(): () => void {
  const onceki = { ...process.env };
  return () => {
    for (const k of Object.keys(process.env)) if (!(k in onceki)) delete process.env[k];
    Object.assign(process.env, onceki);
    kasaKosuAyarlariniYukle(null);
  };
}
const AYAR_DEGISKENLERI = Object.values(kosuOrtamDegiskenleri(varsayilanKosuAyarlari()));

test('varsayılanlar bugünkü değerler; aralıklar doğrulanır; gelişmiş ayarlar ayrı bölümde; yalnız kaydedilenler kasadan koşucuya gider', async () => {
  expect(AYAR_DEGISKENLERI.length).toBeGreaterThan(0);
  expect(varsayilanKosuAyarlari()).toMatchObject({
    // Gelişmiş koşu davranışı: koddaki önceki sabitler.
    gorunmeyenAlanBeklemeSn: 2, gorunmeyenAlan: 'atla', alanSonrasiKosulSn: 20, arkaPlanIstekSn: 8, adimGostergeSn: 30, onayPenceresi: 'iptal',
    oturumKontrolSn: 15, girisAlanBeklemeSn: 15, tabloSatirSecimi: 'ilk', sqlSatirSiniri: SQL_SORGU_SATIR_SINIRI,
    // Koşu tarayıcısı: Playwright "Desktop Chrome" (1280×720), dil ve saat dilimi verilmez; senaryolar sırayla.
    kosuEkranGenisligi: 1280, kosuEkranYuksekligi: 720, kosuDili: 'varsayilan', saatDilimi: 'bilgisayar',
    // Koşu hızı: servis ve ekran senaryoları sırayla, beklemesiz (önceki davranış).
    ekranEszamanli: 1, ekranBeklemeMs: 0, servisEszamanli: 1, servisIstekBeklemeMs: 0,
    // Tarama ve akış kaydı: 1366×900, tr-TR, 30 sn sayfa açılma, 8 seçenekli listeler keşfedilir.
    taramaEkranGenisligi: 1366, taramaEkranYuksekligi: 900, taramaDili: 'tr-TR', taramaSayfaAcilmaSn: 30, kesifSecenekSiniri: 8,
    // Planlı koşular: kaçan zaman ve koşu sürerken gelen zaman atlanır. HTML rapor görüntü sınırı 25 MB.
    zamanliKacan: 'atla', zamanliCakisma: 'atla', raporGoruntuSiniriMb: 25
  });
  expect(SQL_SORGU_SATIR_SINIRI).toBe(1000);
  expect(varsayilanKosuAyarlari().raporGoruntuSiniriMb * 1024 * 1024).toBe(EN_COK_GORUNTU_BAYT);
  const bolumu = (a: string) => KOSU_AYAR_TANIMLARI.find((t) => t.anahtar === a);
  expect(bolumu('onayPenceresi')).toMatchObject({ altBolum: 'gelismis' });
  expect(bolumu('zamanliKacan')).toMatchObject({ bolum: 'zamanlama' });
  expect(bolumu('raporGoruntuSiniriMb')).toMatchObject({ bolum: 'arayuz', grup: 'Raporlar' });
  expect(bolumu('kesifSecenekSiniri')).toMatchObject({ grup: 'Tarama ve akış kaydı' });
  // Paralellik: eski tek seçenekli "Eşzamanlı senaryo" yerine sayısal koşu hızı ayarları (ekran 1–5, servis 1–10).
  expect(bolumu('eszamanliKosu')).toBeUndefined();
  expect(bolumu('ekranEszamanli')).toMatchObject({ grup: 'Ekran senaryoları', tur: 'sayi', enAz: 1, enCok: 5, varsayilan: 1 });
  expect(bolumu('ekranBeklemeMs')).toMatchObject({ grup: 'Ekran senaryoları', tur: 'sayi', enAz: 0, enCok: 60_000, varsayilan: 0 });
  expect(bolumu('servisEszamanli')).toMatchObject({ grup: 'Servis senaryoları' });
  // Her ayarın açıklaması var.
  for (const t of KOSU_AYAR_TANIMLARI) expect(t.aciklama.length, t.anahtar).toBeGreaterThan(10);

  const klasor = geciciKlasor('gelismis-ayar');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Gelismis-1', { kdf: HIZLI_KDF });
    expect(kosuAyarlariniOku(vt)).toEqual(varsayilanKosuAyarlari());
    expect(() => kosuAyarlariniKaydet(vt, { gorunmeyenAlanBeklemeSn: 0 })).toThrow('1–60');
    expect(() => kosuAyarlariniKaydet(vt, { sqlSatirSiniri: 100_001 })).toThrow('1–100000');
    expect(() => kosuAyarlariniKaydet(vt, { ekranEszamanli: 6 })).toThrow('1–5');
    // Eski kayıttaki "eszamanliKosu: sirayla" yok sayılır (ekran eşzamanlılığı 1).
    expect(kosuAyarlariniKaydet(vt, { eszamanliKosu: 'sirayla' }).ekranEszamanli).toBe(1);
    expect(() => kosuAyarlariniKaydet(vt, { onayPenceresi: 'belki' })).toThrow('geçersiz seçim');
    expect(() => kosuAyarlariniKaydet(vt, { kosuEkranGenisligi: 100 })).toThrow('320–3840');
    expect(() => kosuAyarlariniKaydet(vt, { raporGoruntuSiniriMb: 0 })).toThrow('1–200');
    // Kaydedilmemiş ayar kasadan koşucuya gitmez (ör. terminal / CI'da yeniden deneme varsayılanı korunur).
    expect(kayitliKosuOrtamDegiskenleri(vt)).toEqual({});
    kosuAyarlariniKaydet(vt, { yenidenDeneme: 1, onayPenceresi: 'onayla', sqlSatirSiniri: 5000 });
    expect(kayitliKosuOrtamDegiskenleri(vt)).toEqual({ NOBETCI_YENIDEN_DENEME: '1', NOBETCI_ONAY_PENCERESI: 'onayla', NOBETCI_SQL_SATIR_SINIRI: '5000' });
    // Alt sürece giden değişkenler: bekleme süreleri ms, süre limiti ms.
    const env = kosuOrtamDegiskenleri(kosuAyarlariniOku(vt));
    expect(env).toMatchObject({ NOBETCI_KOSU_SURE_LIMITI_MS: '600000', NOBETCI_GORUNURLUK_BEKLEME_MS: '2000', NOBETCI_ADIM_BEKLEME_MS: '30000', NOBETCI_ONAY_PENCERESI: 'onayla' });
  } finally { vt.kapat(); klasor.temizle(); }
});

test('koşucu ayarları: ortam değişkeni > kasadaki kayıtlı ayar > önceki varsayılan; test süresi koşu süre limitine uyar; tarayıcı', () => {
  const geriAl = ortamiKoru();
  try {
    for (const k of [...AYAR_DEGISKENLERI, 'CI', 'NOBETCI_YENIDEN_DENEME', 'NOBETCI_EKRAN_GORUNTUSU']) delete process.env[k];
    // Varsayılanlar (önceki davranış).
    expect(yenidenDenemeAyari()).toBe(0);
    process.env.CI = '1';
    expect(yenidenDenemeAyari()).toBe(2);
    expect(ekranGoruntusuAyari()).toBe('only-on-failure');
    expect(gorunmeyenAlanDavranisi()).toBe('atla');
    expect(onayPenceresiDavranisi()).toBe('iptal');
    expect(kosuTarayiciAyarlari()).toEqual({ viewport: { width: 1280, height: 720 } });
    // Kasadaki kayıtlı ayar (terminal / CI; veri okuyucu kasayı açabildi): ortam değişkeni yoksa kullanılır.
    kasaKosuAyarlariniYukle({ NOBETCI_YENIDEN_DENEME: '1', NOBETCI_EKRAN_GORUNTUSU: 'kapali', NOBETCI_TARAYICI_DILI: 'en-US', NOBETCI_SAAT_DILIMI: 'Europe/Berlin' });
    expect(yenidenDenemeAyari()).toBe(1);
    expect(ekranGoruntusuAyari()).toBe('off');
    expect(kosuTarayiciAyarlari()).toEqual({ viewport: { width: 1280, height: 720 }, locale: 'en-US', timezoneId: 'Europe/Berlin' });
    // Ortam değişkeni (Nöbetçi koşusu) önceliklidir.
    Object.assign(process.env, { NOBETCI_YENIDEN_DENEME: '3', NOBETCI_EKRAN_GENISLIGI: '1600', NOBETCI_EKRAN_YUKSEKLIGI: '900', NOBETCI_TARAYICI_DILI: 'varsayilan' });
    expect(yenidenDenemeAyari()).toBe(3);
    // Test sonu ekran görüntüsü: "Kapalı" iken kalan testte de, ▷ koşusunda da alınmaz; diğerlerinde önceki davranış.
    expect([testSonuGoruntusuAlinsinMi(false, false, 'yalnizHata'), testSonuGoruntusuAlinsinMi(true, true, 'yalnizHata'), testSonuGoruntusuAlinsinMi(true, false, 'her')])
      .toEqual([true, true, false]);
    expect([testSonuGoruntusuAlinsinMi(false, false, 'kapali'), testSonuGoruntusuAlinsinMi(true, true, 'kapali')]).toEqual([false, false]);
    // "Yalnız başarılı testlerde": kalan testte hiç alınmaz; başarılıda ▷ koşusunda (panel) alınır (Playwright'ın kendi 'on' kaydı ayrıca).
    expect([testSonuGoruntusuAlinsinMi(false, true, 'yalnizBasari'), testSonuGoruntusuAlinsinMi(false, false, 'yalnizBasari'), testSonuGoruntusuAlinsinMi(true, true, 'yalnizBasari')])
      .toEqual([false, false, true]);
    process.env.NOBETCI_EKRAN_GORUNTUSU = 'kapali';
    expect(testSonuGoruntusuAlinsinMi(false, true)).toBe(false);
    expect(kosuTarayiciAyarlari()).toEqual({ viewport: { width: 1600, height: 900 }, timezoneId: 'Europe/Berlin' });

    // Test süresi: limit bilinmiyorsa önceki formül; biliniyorsa limitten 30 sn önce (limiti aşmaz, büyük limit kullanılabilir).
    expect(kosuSureLimitiMs()).toBeNull();
    expect(modelTestSuresiMs(3)).toBe(120_000 + 3 * 30_000);
    process.env.NOBETCI_KOSU_SURE_LIMITI_MS = String(60_000);
    expect(modelTestSuresiMs(40)).toBe(60_000 - KOSU_SURE_PAYI_MS); // formül (21 dk) 1 dk limiti aşardı
    process.env.NOBETCI_KOSU_SURE_LIMITI_MS = String(30 * 60_000);
    expect(modelTestSuresiMs(3)).toBe(30 * 60_000 - KOSU_SURE_PAYI_MS); // formül (3,5 dk) 30 dk limiti engellemez
    expect(modelTestSuresiMs(3)).toBeGreaterThan(120_000 + 3 * 30_000);
  } finally { geriAl(); }
});

// ---------------------------------------------------------------------------------------
// Koşucu davranışları (gerçek tarayıcı; 127.0.0.1'de sahte form)
// ---------------------------------------------------------------------------------------

/**
 * Sahte form: "gec" alanı sayfa açıldıktan 3 sn sonra çizilir; "gizli" alan hiç görünmez; "Gönder" onay penceresi (confirm) açar ve
 * sonucu (#sonuc) yazar. /yavas/ sayfasında sonuç 2 sn sonra görünür.
 */
function sahteForm(i: FiksturIstegi): FiksturYaniti {
  const yavas = i.yol.startsWith('/yavas');
  if (!i.yol.startsWith('/form') && !yavas) return { durum: 404, tur: 'text/plain', govde: 'yok' };
  return {
    tur: 'text/html; charset=utf-8',
    govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Form</title></head><body>
<div id="gecikmeli"></div>
<label>Ad <input id="ad"></label>
<input id="gizliAlan" style="display:none">
<button id="gonder" type="button">Gönder</button>
<p id="sonuc" hidden></p>
<script>
setTimeout(() => { document.getElementById('gecikmeli').innerHTML = '<label>Geç <input id="gec"></label>'; }, 3000);
document.getElementById('gonder').addEventListener('click', () => {
  const tamam = confirm('Kaydı göndermek istiyor musunuz?');
  setTimeout(() => { const s = document.getElementById('sonuc'); s.hidden = false; s.textContent = tamam ? 'Onaylandı' : 'İptal edildi'; }, ${yavas ? 2000 : 0});
});
</script></body></html>`
  };
}

const alan = (id: string, secici: string): Nesne => ({ id, tip: 'metin', etiket: { ekran: id }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'dusuk' } });
function formModeli(ekranUrl: string, alanlar: Nesne[]): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'form', ad: 'Form', ekranUrl, girisGerekmez: true,
    adimlar: [
      // Onay penceresinin mesajı adımın uyarısı sayılır; bu yüzden sonuç ayrı adımda (uyarılar adım başında temizlenir) doğrulanır.
      { id: 'gonder', sira: 1, baslik: 'Form gönderilir', bolumler: [{ id: 'b', baslik: 'Bilgiler', alanlar }], kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder' }] } },
      {
        id: 'sonuc', sira: 2, baslik: 'Sonuç görünür',
        bolumler: [{ id: 's', baslik: 'Sonuç', alanlar: [{ id: 'sonucMetni', tip: 'cikti', yapilandirma: 'cikti', konum: { secici: '#sonuc', kirilganlik: 'dusuk' } }] }],
        // Adım süresi verilmez: Ayarlar > Koşu > Gelişmiş > Başarı / hata göstergesi beklemesi kullanılır.
        kosu: { basariGostergesi: { tur: 'eleman', deger: '#sonuc' } }
      }
    ]
  };
}
const senaryo = (model: Nesne, veri: Nesne): PlatformModelSenaryosu => ({
  id: 'deneme-1', baslik: 'Form', kosuyaDahil: true, ekran: { id: 'e1', anahtar: 'form', ad: 'Form' }, model, modelSurumu: 1, altModeller: {}, veri, mutlakaGorunmeli: []
});
const atlananlar = (testInfo: TestInfo): string[] => {
  const a = [...testInfo.annotations].reverse().find((x) => x.type === 'atlananAlanlar');
  return a ? (JSON.parse(String(a.description)) as Array<{ alan: string }>).map((x) => x.alan) : [];
};

test.describe('koşucu davranışları (sahte form)', () => {
  let tarayici: Browser;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  test.beforeAll(async () => {
    fikstur = await yerelSunucu(sahteForm);
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    await fikstur?.kapat();
  });
  const kos = async (testInfo: TestInfo, model: Nesne, veri: Nesne): Promise<{ sonuc: string; hata: string | null }> => {
    const baglam = await tarayici.newContext({ baseURL: fikstur.adres });
    const page = await baglam.newPage();
    const ortam: ModelKosuOrtami = {
      veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: fikstur.adres, senaryolar: [], baglamProfilleri: {} },
      tarif: () => { throw new Error('giriş yok'); }, kimlik: () => { throw new Error('giriş yok'); }, oturumDosyasi: () => ''
    };
    let hata: string | null = null;
    try { await modelSenaryosunuKos(page, testInfo, senaryo(model, veri), ortam); } catch (e) { hata = (e as Error).message; }
    const sonuc = (await page.locator('#sonuc').textContent().catch(() => '')) ?? '';
    await baglam.close();
    return { sonuc, hata };
  };
  const veri = { gec: 'Geç değer', ad: 'Deneme', gizli: 'Görünmez' };
  const model = () => formModeli('/form/', [alan('gec', '#gec'), alan('ad', '#ad'), alan('gizli', '#gizliAlan')]);

  test('varsayılan (bugünkü davranış): görünmeyen alan 2 sn beklenip atlanır ve not düşülür; onay penceresi iptal edilir', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const geriAl = ortamiKoru();
    try {
      for (const k of AYAR_DEGISKENLERI) delete process.env[k];
      const r = await kos(testInfo, model(), veri);
      expect(r.hata).toBeNull();
      expect(r.sonuc).toBe('İptal edildi');
      // "gec" 3 sn sonra çizilir: 2 sn beklemede görünmez → atlanır; "gizli" hiç görünmez.
      expect(atlananlar(testInfo)).toEqual(['gec', 'gizli']);
    } finally { geriAl(); }
  });

  test('değiştirilince: onay penceresi onaylanır, görünme beklemesi uzar, görünmeyen alan testi kaldırır', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const geriAl = ortamiKoru();
    try {
      for (const k of AYAR_DEGISKENLERI) delete process.env[k];
      Object.assign(process.env, { NOBETCI_ONAY_PENCERESI: 'onayla', NOBETCI_GORUNURLUK_BEKLEME_MS: '6000' });
      const r = await kos(testInfo, formModeli('/form/', [alan('gec', '#gec'), alan('ad', '#ad')]), veri);
      expect(r.hata).toBeNull();
      expect(r.sonuc).toBe('Onaylandı');
      // 6 sn beklemede 3 sn sonra çizilen alan doldurulur (atlanmaz).
      expect(atlananlar(testInfo)).not.toContain('gec');

      Object.assign(process.env, { NOBETCI_GORUNMEYEN_ALAN: 'kaldir', NOBETCI_GORUNURLUK_BEKLEME_MS: '1000' });
      const k = await kos(testInfo, formModeli('/form/', [alan('ad', '#ad'), alan('gizli', '#gizliAlan')]), veri);
      expect(k.hata).toContain('gizli alanı ekranda görünmüyor');
      expect(k.sonuc).toBe(''); // gönderilmeden kaldı
    } finally { geriAl(); }
  });

  test('başarı göstergesi beklemesi: adımda süre yoksa ayar kullanılır (varsayılan 30 sn yeter, 1 sn yetmez)', async ({}, testInfo) => {
    test.setTimeout(60_000);
    const geriAl = ortamiKoru();
    try {
      for (const k of AYAR_DEGISKENLERI) delete process.env[k];
      const yavas = formModeli('/yavas/', [alan('ad', '#ad')]);
      expect((await kos(testInfo, yavas, { ad: 'A' })).hata).toBeNull();
      process.env.NOBETCI_ADIM_BEKLEME_MS = '1000';
      expect((await kos(testInfo, yavas, { ad: 'A' })).hata).toContain('1 sn içinde başarı göstergesi görünmedi');
      process.env.NOBETCI_ADIM_BEKLEME_MS = '5000';
      expect((await kos(testInfo, yavas, { ad: 'A' })).hata).toBeNull();
    } finally { geriAl(); }
  });
});

// ---------------------------------------------------------------------------------------
// Test verisi, SQL, zamanlama, tarama, rapor, sağlık noktası, video saklama, REST "Dene"
// ---------------------------------------------------------------------------------------

test('tablodan satır seçimi: varsayılan ilk uyan satır; "rastgele" uyanlardan birini seçer, grubun değerleri aynı satırdan gelir', () => {
  const tablo: Tablo = {
    id: 't1', ad: 'Müşteri', sutunlar: [{ ad: 'Ad', gizli: false }, { ad: 'Soyad', gizli: false }, { ad: 'Tip', gizli: false }],
    satirlar: [
      { ortamId: 'o2', degerler: { Ad: 'Başka ortam', Soyad: 'X', Tip: 'Bireysel' } },
      { ortamId: 'o1', degerler: { Ad: 'Ali', Soyad: 'Kaya', Tip: 'Bireysel' } },
      { ortamId: null, degerler: { Ad: 'Ayşe', Soyad: 'Demir', Tip: 'Bireysel' } }, // ortamı boş: her ortamda geçerli
      { ortamId: 'o1', degerler: { Ad: 'Veli', Soyad: 'Can', Tip: 'Kurumsal' } }
    ]
  };
  const secim = { Tip: 'Bireysel' };
  // Varsayılan: ilk uyan satır (bugünkü davranış); satirSecimi verilmese de aynı.
  expect(secilenSatir(tablo, secim, 'o1')?.degerler.Ad).toBe('Ali');
  expect(secilenSatir(tablo, secim, 'o1', satirSecimiOlustur('ilk'))?.degerler.Ad).toBe('Ali');
  // Rastgele (tohumlu üreteç): uyanlar yalnız bu ortamın ve ortamı boş satırlar; seçim üretece göre değişir.
  const ad = (r: number) => secilenSatir(tablo, secim, 'o1', satirSecimiOlustur('rastgele', () => r))?.degerler.Ad;
  expect(ad(0)).toBe('Ali');
  expect(ad(0.99)).toBe('Ayşe');
  // Dağılım: 200 seçimde ikisi de görülür, başka ortamın / seçime uymayan satır hiç görülmez.
  let tohum = 7;
  const lcg = () => { tohum = (tohum * 1103515245 + 12345) % 2 ** 31; return tohum / 2 ** 31; };
  const gorulen = new Set(Array.from({ length: 200 }, () => secilenSatir(tablo, secim, 'o1', satirSecimiOlustur('rastgele', lcg))?.degerler.Ad));
  expect([...gorulen].sort()).toEqual(['Ali', 'Ayşe']);
  // Aynı koşuda aynı grubun iki başvurusu aynı satırdan (Ad ile Soyad karışmaz); üreteç bir kez çağrılır.
  let cagri = 0;
  const s = satirSecimiOlustur('rastgele', () => { cagri++; return 0.99; });
  const b = (sutun: string) => basvuruyuCoz([tablo], { tablo: 'Müşteri', etiket: '', sutun, bicim: '' }, { 't1|': secim }, 'o1', s);
  expect([b('Ad'), b('Soyad')].map((x) => ('deger' in x ? x.deger : x.hata))).toEqual(['Ayşe', 'Demir']);
  expect(cagri).toBe(1);
});

test('SQL adımı: adımda süre yoksa bağlantının zaman aşımı (sürücüye boş gider); okunan en çok satır ayardan', async () => {
  const gelen: Array<{ zamanAsimiMs: number | undefined; satirSiniri: number }> = [];
  const tanim = (ek: Nesne = {}) => ({ sql: 'SELECT 1 AS SAYI', beklenen: { tur: 'bosDegil' }, ...ek }) as unknown as SqlTanimi;
  const g = { adimAdi: 'Sorgu', coz: () => undefined, yurutucu: async (_s: string, _p: Record<string, string>, o: { zamanAsimiMs: number | undefined; satirSiniri: number }) => {
    gelen.push(o);
    return { sutunlar: ['SAYI'], satirlar: [[1]] };
  } };
  expect((await sqlAdiminiKos(tanim(), g)).durum).toBe('basarili');
  expect((await sqlAdiminiKos(tanim({ zamanAsimiSn: 5 }), { ...g, satirSiniri: 50_000 })).durum).toBe('basarili');
  // Önceden adım boşken 30 sn sabitti ve bağlantının kendi zaman aşımı hiç kullanılmıyordu; artık sürücü bağlantınınkini kullanır
  // (veritabani-suruculeri.mjs: secenekler.zamanAsimiMs || ayar.zamanAsimiSn || 30 sn).
  expect(gelen).toEqual([{ zamanAsimiMs: undefined, satirSiniri: 1000 }, { zamanAsimiMs: 5000, satirSiniri: 50_000 }]);
});

test('planlı koşular: varsayılan kaçanı ve çakışanı atlar; "sonra bir kez koş" ve "bitince koş" (sahte saat, sahte koşucu)', async () => {
  const an = (gun: number, saat: number, dakika = 0) => new Date(2026, 8, gun, saat, dakika);
  const gunluk: Zaman = { tur: 'gunluk', saat: '09:00' };
  // Takvim: tolerans (5 dk) geçmiş zaman varsayılan olarak dönmez; "kaçanları koş" ile yalnız sonuncusu bir kez döner.
  expect(vadesiGelenZaman(gunluk, an(30, 12), an(28, 8).toISOString())).toBeNull();
  expect(vadesiGelenZaman(gunluk, an(30, 12), an(28, 8).toISOString(), undefined, { kacanlariKos: true })?.toISOString()).toBe(an(30, 9).toISOString());
  expect(vadesiGelenZaman(gunluk, an(30, 12), an(30, 9).toISOString(), undefined, { kacanlariKos: true })).toBeNull();

  const klasor = geciciKlasor('zamanli-davranis');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Zamanli-D1', { kdf: HIZLI_KDF });
    izinleriAc(vt);
    const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
    const kural = kuralKaydet(vt, projeId, { ad: 'Sabah', ortamId, kapsam: { senaryolar: 'tum' }, zaman: gunluk }, { simdi: an(28, 8) });
    let saat = an(28, 8);
    let mesgul = false;
    const kosulan: string[] = [];
    const davranis = { kacan: 'atla', cakisma: 'atla' };
    const z = zamanlayiciOlustur({
      veritabani: () => vt, mesgulMu: () => mesgul, simdi: () => saat, davranis: () => davranis,
      yurut: async (_db, _k, kosuKimligi) => { kosulan.push(kosuKimligi); return { durum: 'tamamlandi', mesaj: '', kosuId: kosuKimligi, ozet: null, akisKosulari: [] }; }
    });
    const bekle = async () => { await Promise.all(await z.kontrolEt()); };
    const sonDurum = () => kurallariListele(vt, projeId, { simdi: saat }).find((k) => k.id === kural.id)?.sonTetikleme;

    // Varsayılan: sunucu kapalıyken kaçan 28 Eylül 09:00 sonradan koşulmaz.
    saat = an(28, 11);
    await bekle();
    expect(kosulan).toHaveLength(0);
    // "Sonra bir kez koş": 29 Eylül'de de kaçtı (sunucu kapalıydı); açılınca yalnız sonuncusu (29 Eylül 09:00) bir kez koşulur.
    davranis.kacan = 'sonraKos';
    saat = an(29, 12);
    await bekle();
    expect(kosulan).toHaveLength(1);
    expect(sonDurum()).toMatchObject({ zaman: an(29, 9).toISOString(), durum: 'tamamlandi' });
    await bekle();
    expect(kosulan).toHaveLength(1); // ikinci kez koşulmaz

    // Varsayılan çakışma: koşu sürerken gelen zaman atlanır.
    davranis.kacan = 'atla';
    mesgul = true;
    saat = an(30, 9, 1);
    await bekle();
    expect(sonDurum()).toMatchObject({ zaman: an(30, 9).toISOString(), durum: 'atlandi' });
    // "Bitince koş": atlanmaz, süren koşu bitince (sonraki denetimde; tolerans geçmiş olsa da) bir kez başlatılır.
    davranis.cakisma = 'bitinceKos';
    saat = an(31, 9, 1);
    await bekle();
    expect(kosulan).toHaveLength(1);
    saat = an(31, 9, 20);
    await bekle();
    expect(kosulan).toHaveLength(1); // hâlâ sürüyor
    mesgul = false;
    saat = an(31, 9, 40);
    await bekle();
    expect(kosulan).toHaveLength(2);
    expect(sonDurum()).toMatchObject({ zaman: an(31, 9).toISOString(), durum: 'tamamlandi' });
    await bekle();
    expect(kosulan).toHaveLength(2);
  } finally { vt.kapat(); klasor.temizle(); }
});

test('tarama / akış kaydı tarayıcısı: girdide ayar yoksa önceki sabitler; verilince kullanılır', () => {
  expect(taramaTarayiciAyarlari({})).toEqual({ baglam: { viewport: { width: 1366, height: 900 }, locale: 'tr-TR' }, sayfaAcilmaMs: 30_000, kesifSecenekSiniri: 8, alanIslemMs: 30_000,
    oturumKontrolMs: 15_000, girisAlanBeklemeMs: 15_000 });
  expect(taramaTarayiciAyarlari({ tarayici: { genislik: 1920, yukseklik: 1080, dil: 'en-GB', saatDilimi: 'UTC', sayfaAcilmaMs: 60_000, kesifSecenekSiniri: 20 } }))
    .toEqual({ baglam: { viewport: { width: 1920, height: 1080 }, locale: 'en-GB', timezoneId: 'UTC' }, sayfaAcilmaMs: 60_000, kesifSecenekSiniri: 20, alanIslemMs: 30_000,
      oturumKontrolMs: 15_000, girisAlanBeklemeMs: 15_000 });
});

test('HTML rapor görüntü sınırı, sağlık noktası eşikleri (proje başına) ve video saklama (doğrudan yazan raporlayıcı kasadan okur)', async () => {
  const geriAl = ortamiKoru();
  const klasor = geciciKlasor('rapor-saglik');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Rapor-1', { kdf: HIZLI_KDF });
    // HTML rapor: varsayılan 25 MB; ayar değişince hem sınır hem rapordaki metin değişir.
    expect(raporGoruntuSiniriBayt(vt)).toBe(25 * 1024 * 1024);
    kosuAyarlariniKaydet(vt, { raporGoruntuSiniriMb: 3 });
    expect(raporGoruntuSiniriBayt(vt)).toBe(3 * 1024 * 1024);
    const veri = { tur: 'ekran' as const, baslik: 'Koşu', proje: 'P', ortam: null, ortamAdresi: null, baslangic: null, bitis: null, sureMs: null, kosuDurumu: null,
      sayilar: { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 }, senaryolar: [], atlananGoruntu: 2 };
    expect(htmlRaporuUret(veri, { goruntuler: true })).toContain('Boyut sınırı (25 MB)');
    expect(htmlRaporuUret({ ...veri, goruntuSiniriBayt: raporGoruntuSiniriBayt(vt) }, { goruntuler: true })).toContain('Boyut sınırı (3 MB)');

    // Sağlık noktası: varsayılan 90 / 75; proje başına kaydedilir; doğrulama.
    const p1 = projeKaydet(vt, { ad: 'Birinci' });
    const p2 = projeKaydet(vt, { ad: 'İkinci' });
    expect(saglikEsikleriniOku(vt, p1)).toEqual(VARSAYILAN_SAGLIK_ESIKLERI);
    expect([95, 90, 80, 75, 60].map((o) => saglikSinifi(o))).toEqual(['basari', 'basari', 'uyari', 'uyari', 'hata']);
    expect(() => saglikEsikleriniKaydet(vt, p1, { yesil: 70, sari: 80 })).toThrow('küçük olmalıdır');
    expect(() => saglikEsikleriniKaydet(vt, 'yok', { yesil: 80, sari: 60 })).toThrow('Proje bulunamadı');
    saglikEsikleriniKaydet(vt, p1, { yesil: 80, sari: 60 });
    expect(saglikEsikleriniOku(vt, p1)).toEqual({ yesil: 80, sari: 60 });
    expect(saglikEsikleriniOku(vt, p2)).toEqual(VARSAYILAN_SAGLIK_ESIKLERI);
    expect([85, 70, 55].map((o) => saglikSinifi(o, saglikEsikleriniOku(vt, p1)))).toEqual(['basari', 'uyari', 'hata']);

    // Video saklama (doğrudan yazan raporlayıcı; terminal / CI): kasa açılamıyorsa VIDEO_SAKLAMA_GUN, yoksa 30; kasa anahtarı
    // varsa Ayarlar > Güvenlik değeri okunur ve anahtar bellekten kaldırılır.
    ayarYaz(vt, 'medya', { videoSaklamaGun: 7 });
    const anahtar = Buffer.from(acikAnahtar(vt)).toString('base64url');
    kasaKilitle(vt);
    delete process.env.PLATFORM_KASA_ANAHTARI;
    delete process.env.VIDEO_SAKLAMA_GUN;
    expect(videoSaklamaGunu(vt)).toBe(30);
    process.env.VIDEO_SAKLAMA_GUN = '12';
    expect(videoSaklamaGunu(vt)).toBe(12);
    process.env.PLATFORM_KASA_ANAHTARI = anahtar;
    expect(videoSaklamaGunu(vt)).toBe(7);
    expect(kasaAcikMi(vt)).toBe(false);
  } finally { vt.kapat(); klasor.temizle(); geriAl(); }
});

test('REST "Dene" zaman aşımı Ayarlar > Koşu > Servis isteği zaman aşımını kullanır (önceden 30 sn sabit)', async () => {
  test.setTimeout(60_000);
  const sunucu = createServer((_req, res) => { setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"tamam":true}'); }, 6_500); });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  const adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
  const klasor = geciciKlasor('rest-dene-sure');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Rest-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Rest' });
    const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: adres, varsayilan: true, ayarlar: { riskli: false } });
    const uc = { ad: 'Yavaş', metot: 'GET', yol: '/yavas', sorgu: [], basliklar: [] };
    // Varsayılan (60 sn): 6,5 sn süren yanıt gelir.
    expect(await restUcuDene(vt, projeId, { ortamId, taban: adres, uc })).toMatchObject({ basarili: true, durumKodu: 200 });
    // 5 sn: istek kesilir.
    kosuAyarlariniKaydet(vt, { servisZamanAsimiSn: 5 });
    expect(await restUcuDene(vt, projeId, { ortamId, taban: adres, uc })).toMatchObject({ basarili: false });
  } finally {
    vt.kapat();
    klasor.temizle();
    await new Promise<void>((coz) => { sunucu.closeAllConnections(); sunucu.close(() => coz()); });
  }
});
