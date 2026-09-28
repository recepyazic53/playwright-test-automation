// KORUMA TESTLERİ — EKRAN SENARYOSUNDA ${Tablo.Sütun} / ${Tablo[etiket].Sütun}: ayrıştırma (doğrulayıcı ↔ tablo-secimi aynı
// sonuç), koşu çözümü (seçilen satır, ortam, bağlı alanların seçimleri, etiket, sayfa karşılığı, eksik satır hatası, gizli
// değer maskesi, düz metin geriye uyum), doğrulama (tablo / sütun varlığı, alan tipi, seçim alanında gizli sütun), ekran paketi
// önerisinde başvuru; paket istek metinlerinin tek kaynağı ve kullanıcı metinlerinde eski terim yok; 127.0.0.1'deki sahte
// "Başvuru (akış)" uygulamasında uçtan uca koşu (ayrı Nöbetçi, geçici veritabanı; dış siteye istek yok). Değerler SAHTEDİR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { basvuruyuCoz, degerBasvurusu, degerBasvurusuYaz, type Tablo } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { ekranBasvurulariniCoz, modelAlanBilgisi } from '../../scripts/platform/tablolar/ekran-basvurulari.mjs';
import { MESAJLAR, senaryoyuDogrula, tabloBasvurusuCoz } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { gizliDegerleriMaskele, veriHatalariMetni } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { BICIM_ATFI, BICIM_DOSYASI_ADI, INCELEME_KURALLARI, MEVCUT_TABLO_KURALI, PAKET_OZU, paketIstekCumlesi } from '../../scripts/platform/ekranlar/paket-istekleri.mjs';
import { paketBicimiBelgesi } from '../../scripts/platform/ekranlar/paket-bicimi.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { AkisUygulamasi, HAVUZLAR, akisModeli, akisPaketi } from './model-kosucu-ozellikleri-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const KOK = resolve(__dirname, '..', '..');

/** Kişi tablosu: ortam o2'ye özel satır önde; ortamsız ve o1 satırları; gizli Parola sütunu; Şehir'in sayfa karşılığı. */
function kisiTablosu(): Tablo {
  return {
    id: 'k', ad: 'Kişi',
    sutunlar: [{ ad: 'Ad', gizli: false }, { ad: 'Şehir', gizli: false, karsiliklar: { İstanbul: { sayfa: '34' }, Ankara: { sayfa: '06' } } }, { ad: 'Parola', gizli: true }],
    satirlar: [
      { ortamId: 'o2', degerler: { Ad: 'Başka ortam', Şehir: 'İzmir', Parola: null } },
      { ortamId: null, degerler: { Ad: 'Ali', Şehir: 'İstanbul', Parola: 'gizli-deger-1' } },
      { ortamId: 'o1', degerler: { Ad: 'Veli', Şehir: 'Ankara', Parola: null } }
    ]
  };
}
const bosTablo: Tablo = { id: 'b', ad: 'Boş', sutunlar: [{ ad: 'Değer', gizli: false }], satirlar: [{ ortamId: 'o1', degerler: { Değer: 'x' } }] };

test.describe('ayrıştırma ve çözüm (saf)', () => {
  test('${…} ayrıştırma: doğrulayıcının kopyası tablo-secimi ile aynı sonucu verir; düz metin başvuru değildir', () => {
    const ornekler = ['${Kişi.Ad}', ' ${Kişi[kefil].Ad} ', '${Kişi.Doğum tarihi|yyyy-MM-dd}', '${Rota seçenekleri.Kapsam}', '${Başvuru — İl - İlçe.İlçe}',
      'Kişi.Ad', '${Kişi}', '${.Ad}', '${Kişi.Ad', 'düz metin', '${a.b.c}', '${K{i}.Ad}', '', '${Kişi[x!].Ad}'];
    for (const o of ornekler) expect(tabloBasvurusuCoz(o), o).toEqual(degerBasvurusu(o));
    expect(degerBasvurusu('${Kişi[kefil].Ad}')).toEqual({ tablo: 'Kişi', etiket: 'kefil', sutun: 'Ad', bicim: '' });
    expect(degerBasvurusu(12)).toBeNull();
    expect(degerBasvurusuYaz('Kişi', 'Ad', 'kefil')).toBe('${Kişi[kefil].Ad}');
    expect(degerBasvurusu(degerBasvurusuYaz('Rota seçenekleri', 'Kapsam'))).toMatchObject({ tablo: 'Rota seçenekleri', sutun: 'Kapsam' });
  });

  test('çözüm: ortamla uyan ilk satır; bağlı alanların seçimleri ve etiketli seçim satırı daraltır; sayfa karşılığı; düz metin aynen', () => {
    const tablolar = [kisiTablosu(), bosTablo];
    const veri = { baslik: 'x', ad: '${Kişi.Ad}', sehirKodu: '${Kişi.Şehir}', sehirSecimi: '${Kişi.Şehir}', kefil: '${Kişi[kefil].Ad}', duz: 'Sabit değer', sayi: 5 };
    const r = ekranBasvurulariniCoz(veri, {
      tablolar, ortamId: 'o1', secenekDegerleri: { sehirSecimi: ['İstanbul', 'Ankara'] }, tabloSecimleri: { 'k|kefil': { Ad: 'Veli' } }
    });
    expect(r.hatalar).toEqual([]);
    expect(r.cozulen).toBe(4);
    // o2 satırı bu ortamda geçmez; ortamsız "Ali" ilk uyan satır. Metin alanına sayfa karşılığı (34), seçenekleri tablodaki değeri
    // tanıyan seçim alanına tablodaki değer yazılır.
    expect(r.veri).toEqual({ baslik: 'x', ad: 'Ali', sehirKodu: '34', sehirSecimi: 'İstanbul', kefil: 'Veli', duz: 'Sabit değer', sayi: 5 });
    expect(veri.ad).toBe('${Kişi.Ad}'); // girdi değişmez
    // Tabloya bağlı alanın düz değeri aynı grubun seçimidir: Şehir = Ankara → Ad = Veli.
    const bagli = ekranBasvurulariniCoz({ sehir: 'Ankara', ad: '${Kişi.Ad}' }, {
      tablolar, ortamId: 'o1', baglar: { sehirAlani: { tablo: 'k', sutun: 'Şehir' } }, alanAnahtarlari: { sehirAlani: 'sehir' }
    });
    expect(bagli.veri).toEqual({ sehir: 'Ankara', ad: 'Veli' });
    // Başvuru yoksa hiçbir şey değişmez (tablo bile okunmaz).
    expect(ekranBasvurulariniCoz({ a: 'b' }, { tablolar: [], ortamId: 'o1' })).toEqual({ veri: { a: 'b' }, gizliDegerler: [], hatalar: [], cozulen: 0 });
  });

  test('çözülemeyen başvuru anlaşılır hata; gizli sütun değeri maskelenecekler listesinde', () => {
    const tablolar = [kisiTablosu(), bosTablo];
    const r = ekranBasvurulariniCoz({ a: '${Boş.Değer}', b: '${Yok.X}', c: '${Kişi.Soyad}', d: '${Kişi.Parola}' }, { tablolar, ortamId: 'o3' });
    expect(r.hatalar.map((h) => h.alan)).toEqual(['a', 'b', 'c']);
    expect(r.hatalar[0].mesaj).toContain('"Boş" tablosunda bu ortamda satır yok');
    expect(r.hatalar[1].mesaj).toContain('"Yok" adında tablo yok');
    expect(r.hatalar[2].mesaj).toContain('"Kişi" tablosunda "Soyad" sütunu yok');
    expect(r.veri.d).toBe('gizli-deger-1');
    expect(r.gizliDegerler).toEqual(['gizli-deger-1']);
    // Seçimle uyan satır yok / seçilen satırda boş.
    expect(basvuruyuCoz(tablolar, { tablo: 'Kişi', etiket: '', sutun: 'Ad', bicim: '' }, { 'k|': { Şehir: 'Bursa' } }, 'o1')).toEqual({ hata: '"Kişi" tablosunda seçimlerle uyan satır yok' });
    expect(basvuruyuCoz(tablolar, { tablo: 'Kişi', etiket: '', sutun: 'Parola', bicim: '' }, { 'k|': { Ad: 'Veli' } }, 'o1')).toEqual({ hata: '"Kişi" tablosunun seçilen satırında "Parola" boş' });
    // Koşucunun hata metni ve maskesi.
    const metin = veriHatalariMetni('Senaryo 1', r.hatalar);
    expect(metin).toContain('"Senaryo 1": senaryonun test verisi başvurusu çözülemedi');
    expect(metin).toContain('Tarayıcı açılmadı');
    expect(gizliDegerleriMaskele('Seçenek bulunamadı: gizli-deger-1 (ab)', ['gizli-deger-1', 'ab'])).toBe('Seçenek bulunamadı: ••• (ab)');
  });

  test('model bilgisi: alan → senaryo anahtarı ve seçeneklerin senaryo değerleri (bağımlı liste dahil)', () => {
    const b = modelAlanBilgisi(akisModeli());
    expect(b.alanAnahtarlari).toMatchObject({ kategori: 'kategori', plan: 'plan', sorguTipi: 'sorguTipi' });
    expect(b.secenekDegerleri.sorguTipi).toEqual(['tekli', 'coklu']);
    expect(b.secenekDegerleri.urun).toEqual(['Ürün A', 'Ürün B', 'Ürün C', 'Ürün D']);
  });

  test('doğrulayıcı: başvuru alan tipine ve (verilirse) tablolara göre denetlenir; seçim alanı gizli sütundan değer alamaz', () => {
    const model = akisModeli();
    const tablolar = [{ ad: 'Kişi', sutunlar: [{ ad: 'Ad' }, { ad: 'Parola', gizli: true }] }];
    const dogrula = (veri: Nesne, t?: typeof tablolar) => senaryoyuDogrula({ baslik: 'x', kategori: 'K1', urun: 'Ürün A', ...veri }, { model: model as never, kaynak: 'kayit', ...(t ? { tablolar: t } : {}) });
    expect(dogrula({ plan: '${Kişi.Ad}' }, tablolar).hatalar).toEqual([]);
    expect(dogrula({ plan: '${Yok.Ad}' }, tablolar).hatalar).toEqual([{ alan: 'plan', mesaj: MESAJLAR.tabloYok('Plan', 'Yok') }]);
    expect(dogrula({ plan: '${Kişi.Soyad}' }, tablolar).hatalar).toEqual([{ alan: 'plan', mesaj: MESAJLAR.tabloSutunuYok('Plan', 'Kişi', 'Soyad') }]);
    expect(dogrula({ plan: '${Kişi.Parola}' }, tablolar).hatalar).toEqual([{ alan: 'plan', mesaj: MESAJLAR.gizliSutunSecimde('Plan', 'Parola') }]);
    // Tablolar verilmezse (tarayıcı) yalnız alan tipi denetlenir.
    expect(dogrula({ plan: '${Yok.Ad}' }).hatalar).toEqual([]);
    // Bağımlı listenin üst alanı başvuruysa alt alanın seçenekleri koşuda belli olur: hata yok.
    expect(dogrula({ kategori: '${Kişi.Ad}', urun: 'Ürün C' }, tablolar).hatalar).toEqual([]);
    // Düz metin eskisi gibi denetlenir.
    expect(dogrula({ plan: '9' }).hatalar.map((h) => h.alan)).toEqual(['plan']);
  });

  test('ekran paketi önerisi: ${…} gizli adlı alanda değer sayılmaz; tablo / sütun paket + proje tablolarına göre denetlenir', () => {
    const paket = akisPaketi() as Nesne;
    paket.testVerisi = { tablolar: [{ ad: 'Başvuru (akış) — Plan', tur: 'liste', sutunlar: [{ ad: 'Plan' }], satirlar: [['Plan 1']] }] };
    paket.senaryoOnerileri = [
      { baslik: 'Tablodan plan', veri: { kategori: 'K1', urun: 'Ürün A', plan: '${Başvuru (akış) — Plan.Plan}', parola: '${Kişi.Parola}' }, beklenenSonuc: { tur: 'basari', aciklama: 'x' }, gerekce: 'y' },
      { baslik: 'Projedeki tablo', veri: { kategori: 'K1', urun: 'Ürün A', plan: '${Kişi.Ad}' }, beklenenSonuc: { tur: 'basari', aciklama: 'x' }, gerekce: 'y' },
      { baslik: 'Olmayan tablo', veri: { kategori: 'K1', urun: 'Ürün A', plan: '${Yok.Ad}' }, beklenenSonuc: { tur: 'basari', aciklama: 'x' }, gerekce: 'y' }
    ];
    const d = sayfaPaketiniDogrula(paket, { tablolar: [{ ad: 'Kişi', sutunlar: [{ ad: 'Ad' }, { ad: 'Parola', gizli: true }] }] });
    expect(d.hatalar).toEqual([]); // "parola" anahtarındaki başvuru gizli değer değildir
    expect(d.senaryoSorunlari[0]).toEqual([]);
    expect(d.senaryoSorunlari[1]).toEqual([]);
    expect(d.senaryoSorunlari[2]).toEqual([{ alan: 'plan', mesaj: MESAJLAR.tabloYok('Plan', 'Yok') }]);
    // Düz değer gizli adlı alanda hâlâ reddedilir.
    const k = akisPaketi() as Nesne;
    k.senaryoOnerileri = [{ baslik: 'z', veri: { parola: 'duz-deger-9' }, beklenenSonuc: { tur: 'basari', aciklama: 'x' }, gerekce: 'y' }];
    expect(sayfaPaketiniDogrula(k).hatalar.map((h) => h.yer)).toContain('senaryoOnerileri[0].veri.parola');
  });
});

test.describe('paket istek metinleri', () => {
  test('tek kaynak: arayüz ve sunucu paket-istekleri.mjs\'i kullanır, kopya yok; sunucu dosyayı arayüze sunar', () => {
    const oku = (y: string) => readFileSync(join(KOK, y), 'utf8');
    const ayirici = 'Sayfayı benimle birlikte, adım adım incele';
    expect(oku('scripts/platform/ekranlar/paket-istekleri.mjs')).toContain(ayirici);
    for (const y of ['scripts/platform/arayuz/sayfa-paketi.js', 'scripts/platform/arayuz/ekranlar.js', 'scripts/platform/ekranlar/ekran-servisi.mjs']) {
      expect(oku(y), y).not.toContain(ayirici);
      expect(oku(y), y).toMatch(/paket-istekleri\.mjs/);
    }
    expect(oku('scripts/test-sunucu.mjs')).toContain("['/arayuz/paket-istekleri.mjs'");
    // İçerik: ekran listeleri, kişi / kayıt tabloları, başvuru biçimi, gereken tablolar.
    for (const parca of ['"<Ekran adı> — <Alan>"', '"tur": "liste"', '"tur": "kayit"', '${Tablo.Sütun}', '${Tablo[etiket].Sütun}', 'gerekenAyarlar.testVerisiTurleri', '"gizli": true']) {
      expect(INCELEME_KURALLARI, parca).toContain(parca);
    }
    expect(paketIstekCumlesi('https://ornek.invalid/sayfa')).toBe(`https://ornek.invalid/sayfa sayfasını incele ve ${BICIM_ATFI} bir ekran paketi JSON dosyası üret. ${PAKET_OZU} ${INCELEME_KURALLARI}`);
    // Metin depo dosyasına değil, istekle verilen biçim dosyasına atıf yapar; zarfın zorunlu anahtarları metnin içindedir.
    expect(BICIM_ATFI).toContain(BICIM_DOSYASI_ADI);
    for (const anahtar of ['"tur": "sayfa-paketi"', '"surum": 1', 'meta', 'model', 'senaryoOnerileri', 'gerekenAyarlar', 'bilinmeyenler']) expect(PAKET_OZU, anahtar).toContain(anahtar);
    // Sunucunun tekrar analiz istek dosyası aynı atfı ve kuralları kullanır (kopya yok); biçim dosyası yerel uçtan tek dosya olarak verilir.
    const servis = oku('scripts/platform/ekranlar/ekran-servisi.mjs');
    expect(servis).toContain('${BICIM_ATFI}');
    expect(servis).not.toContain('docs/sayfa-paketi.md');
    expect(oku('scripts/test-sunucu.mjs')).toMatch(/yol === BICIM_ADRESI[\s\S]{0,400}paketBicimiBelgesi\(/);
    const bicim = paketBicimiBelgesi(KOK);
    expect(bicim).toContain(oku('docs/sayfa-paketi.md').replace(/\r\n/g, '\n').trimEnd());
    expect(bicim).toContain('"$id": "nobetci:sayfa-paketi:1"');
    expect(bicim).toContain('## Ek B — Ekran modelinin tip tanımı');
    expect(MEVCUT_TABLO_KURALI).toContain('AYNEN');
  });

  test('kullanıcıya görünen metinlerde eski test verisi terimleri (profil / tür / değer listesi / olmayan menü) yok', () => {
    const ESKI = /test verisi (profil|tür)|Test verisi > Kayıtlar|Test verisi profilleri|Kayıtlar \(profiller\)|değer listesi|toplam hesapla/i;
    const dosyalar = ['scripts/platform/ekranlar/paket-istekleri.mjs', 'scripts/platform/arayuz/rehber-icerikleri.js', 'scripts/platform/arayuz/olustur-menusu.js',
      'scripts/platform/arayuz/tarama.js', 'scripts/platform/arayuz/ekran-ortak.js', 'scripts/platform/arayuz/sayfa-paketi.js', 'scripts/platform/arayuz/akis-tasarimi.js',
      'docs/sayfa-paketi.md'];
    for (const y of dosyalar) {
      const satirlar = readFileSync(join(KOK, y), 'utf8').split(/\r?\n/).filter((s) => ESKI.test(s));
      expect(satirlar, y).toEqual([]);
    }
    // Sunucu mesajları (koşu / paket / tarama): eski menü adı yok.
    for (const y of ['scripts/platform/senaryolar/model-kosusu.mjs', 'scripts/platform/ekranlar/sayfa-paketi.mjs', 'scripts/platform/ekranlar/ekran-servisi.mjs',
      'scripts/platform/tablolar/paket-tablolari.mjs', 'scripts/platform/tarama/yonetici.mjs']) {
      const m = readFileSync(join(KOK, y), 'utf8');
      expect(m, y).not.toMatch(/Test verisi profilleri|Test verisi > Kayıtlar|'Test verisi türü'|test verisi profilinden|test verisi türlerinin ADLARI/);
    }
  });
});

test.describe('uçtan uca: ${Tablo.Sütun} ile ekran senaryosu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Basvuru-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let uygulama: AkisUygulamasi;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let digerOrtam = '';
  let ekranId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const kos = async (senaryoId: string) => {
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId, ortamId });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
  };
  const kaydet = (baslik: string, veri: Nesne) => api('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamId], veri: { baslik, kategori: 'K1', urun: 'Ürün A', ...veri } });

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'ekran-basvuru-'));
    uygulama = new AkisUygulamasi();
    fikstur = await yerelSunucu(uygulama.isle);
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Başvuru Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
    digerOrtam = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Diğer', tabanUrl: fikstur.adres, riskli: false })).ortam as Nesne).id);
    // Başvuranın hazır kimliği (kimlik alanı; havuz = aynı adlı tablo).
    const tur = String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad: HAVUZLAR.ozel, alanlar: ['kimlikNo', 'dogumTarihi', 'cepTelefonu'].map((ad) => ({ ad, hassas: true })) })).id);
    await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: tur, ad: 'k1', degerler: { kimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' } });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: akisPaketi(), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
    ekranId = String(liste.ekranlar.find((e) => e.ad === 'Başvuru (akış)')?.id);
    // "Plan seçimi": Diğer ortamın satırı önde (bu ortamda kullanılmaz), ortamsız satırın sayfa karşılığı "2".
    await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Plan seçimi', sutunlar: [{ ad: 'Plan', karsiliklar: { 'Plan iki': { sayfa: '2' }, 'Plan üç': { sayfa: '3' } } }],
      satirlar: [{ ortamId: digerOrtam, degerler: { Plan: 'Plan üç' } }, { degerler: { Plan: 'Plan iki' } }]
    });
    // "Boş tablo": yalnız Diğer ortamda satırı var.
    await basarili('/platform/tablo/kaydet', { projeId, ad: 'Boş tablo', sutunlar: [{ ad: 'Plan' }], satirlar: [{ ortamId: digerOrtam, degerler: { Plan: 'Plan iki' } }] });
  });

  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('koşu: değer bu ortamın satırından, sayfa karşılığıyla seçilir; düz metin senaryo aynen koşar', async () => {
    test.setTimeout(180_000);
    const s = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik: 'Tablodan plan', ortamIdleri: [ortamId], veri: { baslik: 'Tablodan plan', kategori: 'K1', urun: 'Ürün A', plan: '${Plan seçimi.Plan}' } });
    // Kayıtta başvuru olduğu gibi saklanır (koşuda çözülür).
    expect(((await api(`/platform/senaryo?id=${String(s.id)}&ortamId=${ortamId}`)).senaryo as Nesne).veri.plan).toBe('${Plan seçimi.Plan}');
    const d = await kos(String(s.id));
    expect(d.durum, JSON.stringify(d.hataMesaji)).toBe('basarili');
    expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ kategori: 'K1', urun: 'U11', plan: '2' });
    // Düz metin (geriye uyum).
    const duz = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik: 'Düz plan', ortamIdleri: [ortamId], veri: { baslik: 'Düz plan', kategori: 'K1', urun: 'Ürün B', plan: '1' } });
    expect((await kos(String(duz.id))).durum).toBe('basarili');
    expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ urun: 'U12', plan: '1' });
  });

  test('bu ortamda satırı olmayan tablo: koşu tarayıcı açılmadan anlaşılır hatayla durur; olmayan tablo kaydedilmez', async () => {
    test.setTimeout(120_000);
    const once = uygulama.hesaplamalar.length;
    const s = await kaydet('Boş tablodan plan', { plan: '${Boş tablo.Plan}' });
    expect(s.basarili, String(s.mesaj ?? '')).toBe(true);
    const d = await kos(String(s.id));
    expect(d.durum).toBe('basarisiz');
    expect(String(d.hataMesaji)).toContain('"Boş tablo" tablosunda bu ortamda satır yok');
    expect(String(d.hataMesaji)).toContain('Tarayıcı açılmadı');
    expect(uygulama.hesaplamalar.length).toBe(once);
    const yok = await kaydet('Olmayan tablodan', { plan: '${Olmayan.Plan}' });
    expect(yok.basarili).toBe(false);
    expect((yok.hatalar as Nesne[]).map((h) => h.mesaj)).toEqual([MESAJLAR.tabloYok('Plan', 'Olmayan')]);
  });

  test('senaryo formu: bağlı alanda "Tablodan" seçilir, kaydedilir ve koşar; telefonda taşma yok', async () => {
    test.setTimeout(180_000);
    const tablolar = (await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];
    const planTablosu = tablolar.find((t) => t.ad === 'Plan seçimi') as Nesne;
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { plan: { tablo: planTablosu.id, sutun: 'Plan' } } });
    const tarayici = await korumaliTarayici();
    try {
      const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
      const page = await baglam.newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/senaryolar/yeni/${ekranId}`);
      const plan = page.locator('[data-alan="plan"] select');
      await expect(plan).toBeVisible({ timeout: 15_000 });
      await expect(plan.locator('optgroup[label="Test verisi tablosundan"] option')).toHaveText('Tablodan: Plan seçimi → Plan (koşuda seçilen satır)');
      await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Formdan tablo planı');
      await page.locator('[data-alan="kategori"] select').selectOption('K1');
      await page.locator('[data-alan="urun"] select').selectOption('Ürün A');
      await plan.selectOption('${Plan seçimi.Plan}');
      await page.screenshot({ path: test.info().outputPath('senaryo-formu-tablodan.png'), fullPage: false });
      // Telefon genişliği: yatay taşma yok.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(plan).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
      await page.screenshot({ path: test.info().outputPath('senaryo-formu-tablodan-telefon.png'), fullPage: false });
      await page.setViewportSize({ width: 1400, height: 1000 });
      await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
      await expect.poll(async () => ((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[]).some((x) => x.baslik === 'Formdan tablo planı'), { timeout: 15_000 }).toBe(true);
      expect(hatalar).toEqual([]);
      await baglam.close();
    } finally {
      await tarayici.close();
    }
    const satir = ((await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[]).find((x) => x.baslik === 'Formdan tablo planı') as Nesne;
    expect(((await api(`/platform/senaryo?id=${String(satir.id)}&ortamId=${ortamId}`)).senaryo as Nesne).veri.plan).toBe('${Plan seçimi.Plan}');
    const d = await kos(String(satir.id));
    expect(d.durum, JSON.stringify(d.hataMesaji)).toBe('basarili');
    expect(uygulama.hesaplamalar.at(-1)).toMatchObject({ urun: 'U11', plan: '2' });
  });

  test('akış kaydının onay penceresinde test verisi bölümü: geniş pencere, telefonda taşma yok; aynı adlı tabloda seçim beklenir; kapalı düğmenin nedeni + "Bölüme git"', async () => {
    const tarayici = await chromium.launch();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1280, height: 900 } })).newPage();
      await page.route((u) => !u.href.startsWith(nobetci.adres), (r) => r.abort());
      await page.goto('/#/ekranlar');
      await expect(page.getByRole('heading', { name: 'Ekranlar', level: 2 })).toBeVisible({ timeout: 15_000 });
      // Önizleme sunucudakiyle aynı biçimde (paketTestVerisiOnizle); "Plan seçimi" projede var → seçim beklenir.
      await page.evaluate(async () => {
        const { onayIste } = await import('/arayuz/kosu-paneli.js' as string);
        const { testVerisiSecimi } = await import('/arayuz/sayfa-paketi.js' as string);
        const onizleme = {
          kaynak: 'kayit',
          tablolar: [
            { ad: 'Başvuru (akış) — Kategori', tur: 'liste', aciklama: null, sutunlar: [{ ad: 'Kategori', gizli: false, karsilikSayisi: 2 }], satirSayisi: 2, tekrarSayisi: 0, ornek: [['Bireysel'], ['Kurumsal']], bagliAlanlar: ['Kategori'], mevcut: null },
            { ad: 'Plan seçimi', tur: 'liste', aciklama: null, sutunlar: [{ ad: 'Plan', gizli: false, karsilikSayisi: 3 }], satirSayisi: 3, tekrarSayisi: 0, ornek: [['Plan 1'], ['Plan 2'], ['Plan 3']], bagliAlanlar: ['Plan'],
              mevcut: { id: 'x', ad: 'Plan seçimi', sutunSayisi: 1, satirSayisi: 2, yeniSutunlar: [], eklenecekSatir: 3 } }
          ],
          baglantilar: [{ alanId: 'kategori', alanEtiketi: 'Kategori', tablo: 'Başvuru (akış) — Kategori', sutun: 'Kategori', modeldeVar: true, mevcut: null },
            { alanId: 'plan', alanEtiketi: 'Plan', tablo: 'Plan seçimi', sutun: 'Plan', modeldeVar: true, mevcut: null }]
        };
        let yenile = () => {};
        const tv = testVerisiSecimi(onizleme, () => yenile());
        // akis-tasarimi.js ile aynı çağrı: kapalı düğmenin nedenleri testVerisiSecimi().bekleyenler()'den.
        void onayIste({
          baslik: '“Kayıttan akış” akışı eklensin mi?', metin: 'Kaydedince ekranın yeni model sürümü açılır.', dugme: 'Ekle', ikonAd: 'uyari',
          ek: tv.bolum, nedenler: () => (tv.hazir() ? [] : tv.bekleyenler()), baglan: (fn: () => void) => { yenile = fn; }
        });
      });
      const pencere = page.locator('dialog[open]');
      const ekle = pencere.getByRole('button', { name: 'Ekle' });
      await expect(pencere.getByRole('region', { name: 'Test verisine yazılacaklar' })).toBeVisible();
      await expect(ekle).toBeDisabled();
      // Kapalı düğmenin nedeni düğmenin altında; düğme nedene bağlı (title + aria-describedby).
      const nedenler = pencere.locator('.diyalog-alt .kabul-nedenleri');
      await expect(nedenler).toBeVisible();
      await expect(nedenler).toContainText('1 tablo için karar bekleniyor');
      await expect(ekle).toHaveAttribute('title', /^Kapalı: Test verisi: 1 tablo için karar bekleniyor/);
      await expect(ekle).toHaveAttribute('aria-describedby', String(await nedenler.getAttribute('id')));
      // 390 px: pencere ve sayfa taşmaz; "Bölüme git" kararsız tabloya kaydırır, ilk seçeneği odaklar ve vurgular.
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await pencere.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(2);
      expect(await nedenler.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
      await page.screenshot({ path: test.info().outputPath('akis-onay-neden-telefon.png') });
      await nedenler.getByRole('button', { name: 'Bölüme git' }).click();
      const planGrubu = pencere.getByRole('radiogroup', { name: 'Plan seçimi: aynı adlı tablo' });
      await expect(planGrubu.getByRole('radio').first()).toBeFocused();
      await expect(pencere.locator('.tv-tablo.dikkat-vurgusu')).toContainText('Plan seçimi');
      await expect(planGrubu).toBeInViewport();
      // Karar: düğme açılır, neden ve bağlar kalkar.
      await pencere.getByText('Atla (yazma)').click();
      await expect(ekle).toBeEnabled();
      await expect(nedenler).toBeHidden();
      await expect(ekle).not.toHaveAttribute('title', /.*/);
      await expect(ekle).not.toHaveAttribute('aria-describedby', /.*/);
      expect(await pencere.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
      await page.screenshot({ path: test.info().outputPath('akis-onay-test-verisi-telefon.png') });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({ path: test.info().outputPath('akis-onay-test-verisi.png') });
    } finally {
      await tarayici.close();
    }
  });
});
