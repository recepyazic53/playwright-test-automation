// AKIŞ DİYAGRAMI — BÖLÜM VE ALAN ÖZELLİKLERİNİN KORUNMASI: diyagramdan kaydetmek, diyagramın düzenlemediği bölüm özelliklerini
// (görünürlük koşulu, kod yöntemi… — id / baslik / alanlar dışındaki HER anahtar) ve alan özelliklerini (görünürlük, bağımlılık,
// doldurucu parametreleri…) aynen korur. Kök neden (eski davranış): bölüm özellikleri ADIMIN korunan parçasına ("ek") bağlıydı;
// gruplar birleştirilince (alanlar başka gruba taşınıp eski grup silinince) bölüm yeni adımda koşulsuz kalıyor, koşul modelde
// bağsız kalıyordu; bölüm başlığı normalize edilince (fazla boşluk, uzun başlık) hiçbir şey değiştirilmeden kayıt reddediliyordu.
// Bağsız koşullar ekran sayfasında ve paket önizlemesinde uyarıdır (model kendiliğinden değişmez). Nötr fikstür ("Sorgu": sorgu
// tipine göre açılan liste bölümü); veritabanı geçicidir, arayüz testi 127.0.0.1'deki Nöbetçi'yle — dışarıya istek yok.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranModeliEkle, ekranModeliGetir, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { EkranDogrulamaHatasi, ekranDetayi, sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { adimlardanBloklar, akisKaydet, akisTasarimi, korunanParcalari, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri, bloklariAyikla, type AkisBlogu } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { bagsizKosulUyarilari, ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { korumaliTarayici } from './giris-fikstur';
import { nobetciApi, nobetciBaslat } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;
type AlanGrubu = Extract<AkisBlogu, { tur: 'alanlar' }>;
const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;
const alan = (id: string, tip: string, etiket: string, secici: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, zorunlu: false, ...ek
});
const buton = (id: string, etiket: string, secici: string): Nesne => ({ id, tip: 'buton', etiket: { ekran: etiket }, yapilandirma: 'aksiyon', konum: { secici, kirilganlik: 'orta' } });
const tikla = (secici: string, aciklama: string): Nesne => ({ tur: 'tikla', secici, aciklama });
const TEKLI = 'Tekli Sorgulama';
const COKLU = 'Çoklu Sorgulama';
/** Koşullu bölüm (gorunurluk + kod yöntemi): diyagramda düzenlenmez, bölümle korunur. */
const KOSULLU_BOLUM = { id: 'cokluListe', baslik: 'Çoklu sorgulama (liste dosyasıyla)', gorunurluk: { kosul: 'cokluSorgu' }, pomMetodu: 'listeyiDoldur' };

/**
 * "Sorgu": Ön bilgi (müşteri no) → İleri; Sorgu (sorgu tipi Tekli / Çoklu; Çoklu seçilince açılan liste bölümü, zorunlu
 * dosya) → Sorgula → "Sorgu tamam".
 */
function sorguModeli(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'sorgu', ad: 'Sorgu', aciklama: 'Bölüm korunması (nötr fikstür; değerler sahte).', ekranUrl: '/sorgu',
    girisGerekmez: true, specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (sorgu)' },
    kosullar: { cokluSorgu: { aciklama: 'Çoklu sorgulama seçiliyken', ifade: { alan: 'sorguTipi', esit: COKLU } } },
    adimlar: [
      {
        id: 'on', sira: 1, baslik: 'Ön bilgi',
        bolumler: [
          { id: 'onBilgi', baslik: 'Ön bilgi', alanlar: [alan('musteriNo', 'metin', 'Müşteri no', '#musteriNo')] },
          { id: 'onIslemler', baslik: 'İşlemler', alanlar: [buton('ileriDugmesi', 'İleri', '#ileri')] }
        ],
        kosu: { aksiyonlar: [tikla('#ileri', 'İleri')], basariGostergesi: { tur: 'eleman', deger: '#sorguTipi' } }
      },
      {
        id: 'sorgu', sira: 2, baslik: 'Sorgu',
        bolumler: [
          { id: 'sorguGenel', baslik: 'Sorgu', alanlar: [alan('sorguTipi', 'secim', 'Sorgu tipi', '#sorguTipi', { zorunlu: true, seceneklerDurumu: 'tam', secenekler: [{ deger: TEKLI, metin: TEKLI }, { deger: COKLU, metin: COKLU }] })] },
          { ...KOSULLU_BOLUM, alanlar: [alan('listeDosyasi', 'dosya', 'Liste dosyası', '#listeDosyasi', { zorunlu: true, kabul: '.xlsx' })] },
          { id: 'sorguIslemler', baslik: 'İşlemler', alanlar: [buton('sorgulaDugmesi', 'Sorgula', '#sorgula')] }
        ],
        kosu: { aksiyonlar: [tikla('#sorgula', 'Sorgula')], basariGostergesi: { tur: 'metin', deger: 'Sorgu tamam', secici: '#sonuc' } }
      }
    ],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}
const paket = (model: Nesne): Nesne => ({
  tur: 'sayfa-paketi', surum: 1,
  meta: { ekran: { anahtar: model.id, ad: model.ad, urlYolu: model.ekranUrl }, olusturan: 'test', olusturulma: '2026-09-29T09:00:00Z', baglamProfilleri: [], not: 'Nötr fikstür.' },
  model, senaryoOnerileri: [],
  gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] },
  bilinmeyenler: []
});
const bolumler = (m: Nesne): Nesne[] => (m.adimlar as Nesne[]).flatMap((a) => (a.bolumler ?? []) as Nesne[]);
/** Alanı içeren bölüm. */
const alaninBolumu = (m: Nesne, alanId: string): Nesne | undefined => bolumler(m).find((b) => (b.alanlar as Nesne[]).some((a) => a.id === alanId));
const alanBul = (m: Nesne, alanId: string): Nesne => (alaninBolumu(m, alanId)?.alanlar as Nesne[]).find((a) => a.id === alanId) as Nesne;
const bolumOzellikleri = (b: Nesne | undefined): Nesne => Object.fromEntries(Object.entries(b ?? {}).filter(([k]) => !['baslik', 'alanlar'].includes(k)));
const grup = (b: AkisBlogu[], ad: string): AlanGrubu => b.find((x) => x.tur === 'alanlar' && x.ad === ad) as AlanGrubu;
/** Gruplar birleştirilir: "Sorgu" grubunun alanları "Ön bilgi" grubuna taşınır, boş kalan "Sorgu" grubu silinir. */
const birlestir = (b: AkisBlogu[]): AkisBlogu[] => {
  const on = grup(b, 'Ön bilgi');
  const sorgu = grup(b, 'Sorgu');
  return b.filter((x) => x !== sorgu).map((x) => (x === on ? { ...on, alanlar: [...on.alanlar, ...sorgu.alanlar], zorunlu: [...on.zorunlu, ...sorgu.zorunlu], kosullar: { ...on.kosullar, ...sorgu.kosullar } } : x));
};
const META = { ekranAnahtari: 'sorgu', ekranAdi: 'Sorgu', urlYolu: '/sorgu', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
/** Saf gidiş-dönüş: modelden diyagram → (JSON) → ayıklama → kayıt envanteri (korunan parçalarla) → model. */
function gidisDonus(m: Nesne, degistir: (b: AkisBlogu[]) => AkisBlogu[] = (b) => b): { model: Nesne; bloklar: AkisBlogu[] } {
  const env = modeldenAkisEnvanteri(m);
  const bloklar = kopya(adimlardanBloklar(m, m.adimlar, env));
  const ayik = bloklariAyikla(degistir(kopya(bloklar)));
  expect(ayik.hatalar).toEqual([]);
  const c = akistanKayitEnvanteri(env, ayik.bloklar, { korunanlar: korunanParcalari(m).parcalar });
  expect(c.hatalar).toEqual([]);
  return { model: kayitPaketiOlustur({ ...META, mevcutModel: m }, c.envanter as NonNullable<typeof c.envanter>).paket.model as Nesne, bloklar };
}
const gecerli = (m: Nesne): void => { expect(() => ekranModeliniDogrula('sorgu.model.json', m, () => { throw new Error('alt model yok'); })).not.toThrow(); };

test.describe('saf: bölüm özellikleri bölümle birlikte korunur', () => {
  test('değiştirmeden gidiş-dönüş: bölümün görünürlüğü ve kod yöntemi (tanınmayan her anahtar) aynen; alanın yanında salt okunur not', () => {
    const m = sorguModeli();
    const { model, bloklar } = gidisDonus(m);
    expect(bolumOzellikleri(alaninBolumu(model, 'listeDosyasi'))).toEqual(bolumOzellikleri(alaninBolumu(m, 'listeDosyasi')));
    // Bölüm özellikleri adımın korunan parçası değildir (rozet yok); alanın yanında "koşullu bölüm" notu.
    const sorgu = grup(bloklar, 'Sorgu');
    expect(sorgu.korunan).toBeUndefined();
    expect(sorgu.bolumNotlari).toEqual({ listeDosyasi: { kosullu: true, ozet: '“Çoklu sorgulama (liste dosyasıyla)” bölümü — görünürlük koşulu: Çoklu sorgulama seçiliyken; kod yöntemi (listeyiDoldur)' } });
    expect(Object.keys(korunanParcalari(m).parcalar)).toEqual([]);
    expect(gidisDonus(model).model.adimlar).toEqual(model.adimlar);
    gecerli(model);
  });

  test('kök neden 1: gruplar birleştirilince (alanlar başka gruba taşınıp eski grup silinince) bölüm koşulu ve kimliği korunur', () => {
    const m = sorguModeli();
    const { model } = gidisDonus(m, birlestir);
    const b = alaninBolumu(model, 'listeDosyasi') as Nesne;
    // Bölüm artık "Ön bilgi" adımında; özellikleri ve kimliği aynı (eskiden: yeni kimlik, görünürlük ve kod yöntemi yok).
    expect((model.adimlar as Nesne[]).find((a) => (a.bolumler as Nesne[]).includes(b))?.id).toBe('on');
    expect(bolumOzellikleri(b)).toEqual({ id: 'cokluListe', gorunurluk: { kosul: 'cokluSorgu' }, pomMetodu: 'listeyiDoldur' });
    expect(bagsizKosulUyarilari(model)).toEqual([]);
    gecerli(model);
  });

  test('kök neden 2: başlık farklı yazılsa da (fazla boşluk, uzun ya da boş başlık) bölüm özellikleri ve kimliği korunur', () => {
    for (const baslik of ['Çoklu  sorgulama\n (liste dosyasıyla) ', 'Ç'.repeat(130), '']) {
      const m = sorguModeli();
      m.adimlar[1].bolumler[1].baslik = baslik;
      const b = alaninBolumu(gidisDonus(m).model, 'listeDosyasi');
      expect(bolumOzellikleri(b), JSON.stringify(baslik)).toEqual({ id: 'cokluListe', gorunurluk: { kosul: 'cokluSorgu' }, pomMetodu: 'listeyiDoldur' });
    }
  });

  test('bölüm silinirse doğal davranış: alanı akıştan çıkarılan bölüm kalkar, koşul bağsız kalır (uyarı)', () => {
    const m = sorguModeli();
    const { model } = gidisDonus(m, (b) => b.map((x) => (x.tur === 'alanlar' && x.ad === 'Sorgu' ? { ...x, alanlar: ['sorguTipi'], zorunlu: ['sorguTipi'] } : x)));
    expect(alaninBolumu(model, 'listeDosyasi')).toBeUndefined();
    expect(bolumler(model).some((b) => b.id === 'cokluListe')).toBe(false);
    expect(bagsizKosulUyarilari(model).map((u) => u.yer)).toEqual(['kosullar.cokluSorgu']);
  });

  test('alan düzeyi: görünürlük (adlı / satır içi / gösterilemeyen), bağımlılık, doldurucu parametreleri ve diğer özellikler gidiş-dönüşte aynen', () => {
    const m = sorguModeli();
    const genel = m.adimlar[1].bolumler[0].alanlar as Nesne[];
    genel.push(
      alan('aciklama', 'metin', 'Açıklama', '#aciklama', {
        gorunurluk: { kosul: 'cokluSorgu' }, doldurucuParametreleri: { tus: 'Tab', gecikmeMs: 50 }, notlar: 'ekran notu', sinirlar: { enCokUzunluk: 40 }
      }),
      alan('donem', 'secim', 'Dönem', '#donem', {
        gorunurluk: { ifade: { alan: 'sorguTipi', esit: TEKLI } }, seceneklerDurumu: 'tam', secenekler: [{ deger: 'a', metin: 'A' }],
        bagimlilik: { alan: 'sorguTipi', secenekHaritasi: { [COKLU]: [{ deger: 'b', metin: 'B' }] } }
      }),
      alan('kontrol', 'metin', 'Kontrol', '#kontrol', { gorunurluk: { ifade: { calismaZamani: 'gorunurse' } }, dogrulama: { desen: '^[0-9]+$' } })
    );
    gecerli(m);
    const { model } = gidisDonus(m);
    for (const id of ['aciklama', 'kontrol']) expect(alanBul(model, id), id).toEqual(alanBul(m, id));
    // Satır içi seçim koşulu anlamca aynı adlı koşula çevrilir (aynı ifade); diğer özellikleri aynen.
    const { gorunurluk, ...donem } = alanBul(model, 'donem');
    const { gorunurluk: _g, ...donemOnce } = alanBul(m, 'donem');
    expect(donem).toEqual(donemOnce);
    expect(model.kosullar[gorunurluk.kosul].ifade).toEqual({ alan: 'sorguTipi', esit: TEKLI });
    gecerli(model);
  });
});

test('bağsız koşul uyarısı: yalnız hiçbir yerde adıyla kullanılmayan koşullar; ekran sayfası ve paket önizlemesi', async () => {
  const m = sorguModeli();
  m.kosullar.kullanilmayan = { aciklama: 'Eski koşul', ifade: { alan: 'sorguTipi', esit: TEKLI } };
  m.kosullar.adimda = { ifade: { alan: 'sorguTipi', esit: TEKLI } };
  m.kosullar.kuralda = { ifade: { alan: 'sorguTipi', esit: TEKLI } };
  m.adimlar[0].gorunurluk = { kosul: 'adimda' };
  m.isKurallari = [{ id: 'k1', adim: 'sorgu', kosul: { alan: 'sorguTipi', esit: COKLU }, gecerlilik: { kosul: 'kuralda' }, mesaj: 'Uyarı' }];
  gecerli(m);
  const uyarilar = bagsizKosulUyarilari(m);
  expect(uyarilar.map((u) => u.yer)).toEqual(['kosullar.kullanilmayan']);
  expect(uyarilar[0].mesaj).toContain('“kullanilmayan” koşulu (Eski koşul): Bu koşul hiçbir yere bağlı değil');
  // Bölümün görünürlüğü kaybolunca koşulu bağsız kalır.
  delete m.adimlar[1].bolumler[1].gorunurluk;
  expect(bagsizKosulUyarilari(m).map((u) => u.yer)).toEqual(['kosullar.cokluSorgu', 'kosullar.kullanilmayan']);
  // Paket önizlemesi: uyarı (yüklemeyi engellemez).
  const d = sayfaPaketiniDogrula(paket(m));
  expect(d.gecerli).toBe(true);
  expect(d.uyarilar.filter((u) => u.yer.startsWith('model.kosullar')).map((u) => u.yer)).toEqual(['model.kosullar.cokluSorgu', 'model.kosullar.kullanilmayan']);
  // Ekran sayfası (Model sekmesi): uyarılar; model değişmez.
  const klasor = geciciKlasor('bagsiz-kosul');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Bagsiz-Kosul-Kasa-Parolasi-5', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    const { ekranId } = await sayfaEkle(vt, projeId, paket(m), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor.yol, 'medya') });
    const detay = ekranDetayi(vt, projeId, ekranId);
    expect(detay.uyarilar.map((u) => u.yer)).toEqual(['kosullar.cokluSorgu', 'kosullar.kullanilmayan']);
    expect((ekranModeliGetir(vt, ekranId) as { model: Nesne }).model.kosullar).toEqual(m.kosullar);
  } finally { vt.kapat(); klasor.temizle(); }
});

test.describe('veritabanı: akış diyagramından kaydet → yeniden oku', () => {
  let vt: Veritabani;
  let klasor: { yol: string; temizle: () => void };
  let projeId: string;
  let ekranId: string;
  test.beforeEach(async () => {
    klasor = geciciKlasor('akis-bolum');
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Akis-Bolum-Kasa-Parolasi-5', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    ekranId = (await sayfaEkle(vt, projeId, paket(sorguModeli()), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor.yol, 'medya') })).ekranId;
  });
  test.afterEach(() => { vt.kapat(); klasor.temizle(); });
  const model = (): Nesne => (ekranModeliGetir(vt, ekranId) as { model: Nesne }).model;
  const tasarim = (): AkisBlogu[] => akisTasarimi(vt, projeId, ekranId, { akisId: 'ana' }).bloklar;
  const kaydet = (bloklar: AkisBlogu[], onay = true): Nesne => akisKaydet(vt, projeId, ekranId, { akisId: 'ana', ad: 'Ana akış', bloklar: kopya(bloklar), onay }) as Nesne;
  const hatalari = (bloklar: AkisBlogu[]): Array<{ blok: number | null; mesaj: string }> => {
    try { kaydet(bloklar, false); } catch (e) { if (e instanceof EkranDogrulamaHatasi) return e.hatalar as unknown as Array<{ blok: number | null; mesaj: string }>; throw e; }
    return [];
  };

  test('gruplar birleştirilip kaydedilir: bölüm koşulu, kod yöntemi ve kimliği kalır; onayda silinecek korunan parça yok; bağsız koşul yok', () => {
    const duzen = birlestir(tasarim());
    expect(kaydet(duzen, false)).toEqual({ etki: { yeni: false, senaryolar: [] }, akisId: 'ana' });
    expect(kaydet(duzen)).toMatchObject({ akisId: 'ana', surum: 2 });
    const son = model();
    expect(bolumOzellikleri(alaninBolumu(son, 'listeDosyasi'))).toEqual({ id: 'cokluListe', gorunurluk: { kosul: 'cokluSorgu' }, pomMetodu: 'listeyiDoldur' });
    expect(ekranDetayi(vt, projeId, ekranId).uyarilar).toEqual([]);
    // Yeniden açılan diyagramda alan yine "koşullu bölüm" notuyla.
    expect(grup(tasarim(), 'Ön bilgi').bolumNotlari?.listeDosyasi?.kosullu).toBe(true);
  });

  test('bölüm başlığı normalize edilse de değiştirmeden kaydetmek geçerli ve modeli değiştirmez', () => {
    const m = sorguModeli();
    m.adimlar[1].bolumler[1].baslik = 'Çoklu  sorgulama (liste dosyasıyla)';
    ekranModeliEkle(vt, { ekranId, model: m, aciklama: 'test' });
    expect(hatalari(tasarim())).toEqual([]);
    kaydet(tasarim());
    expect(bolumOzellikleri(alaninBolumu(model(), 'listeDosyasi'))).toEqual(bolumOzellikleri(alaninBolumu(m, 'listeDosyasi')));
  });

  test('dayanak silinirse ret: bölüm koşulunun dayandığı seçim alanı akıştan çıkarılınca anlaşılır hata, model değişmez', () => {
    const once = model();
    const bloklar = tasarim();
    const i = bloklar.findIndex((b) => b.tur === 'alanlar' && b.ad === 'Sorgu');
    const hatalar = hatalari(bloklar.map((b, j) => (j === i ? { ...(b as AlanGrubu), alanlar: ['listeDosyasi'], zorunlu: ['listeDosyasi'] } : b)));
    expect(hatalar).toEqual([{ blok: i, mesaj: '“Çoklu sorgulama (liste dosyasıyla)” bölümü — görünürlük koşulu: Çoklu sorgulama seçiliyken; kod yöntemi (listeyiDoldur): diyagramda düzenlenemeyen bu bölüm özellikleri korunamaz: dayandığı “Sorgu tipi” alanı akışta yok (alanı geri ekleyin ya da bu parçayı taşıyan bloğu silin).' }]);
    expect(model()).toEqual(once);
  });
});

test('arayüz: koşullu bölümlü ekran diyagramda düzenlenip kaydedilir; senaryo formunda bölüm koşulu çalışır; bağsız koşul uyarısı görünür', async () => {
  test.setTimeout(180_000);
  const klasor = mkdtempSync(join(tmpdir(), 'akis-bolum-arayuz-'));
  const PAROLA = 'Akis-Bolum-Arayuz-Parolasi-9';
  const vtYolu = join(klasor, 'platform.db');
  let ekran = '';
  let bozukEkran = '';
  let projeId = '';
  {
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Sorgu projesi' });
    ekran = (await sayfaEkle(vt, projeId, paket(sorguModeli()), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor, 'medya') })).ekranId;
    // Eski hatanın bıraktığı model: bölüm koşulu kaybolmuş, koşul bağsız.
    const bozuk = { ...sorguModeli(), id: 'sorgu-eski', ad: 'Sorgu (eski)' };
    delete alaninBolumu(bozuk, 'listeDosyasi')?.gorunurluk;
    bozukEkran = (await sayfaEkle(vt, projeId, paket(bozuk), { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor, 'medya') })).ekranId;
    vt.kapat();
  }
  const nobetci = await nobetciBaslat(klasor, vtYolu, {});
  const tarayici = await korumaliTarayici();
  try {
    expect((await nobetciApi(nobetci, '/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    // Senaryo formu için ortam (adresine istek atılmaz; senaryo koşulmaz).
    expect((await nobetciApi(nobetci, '/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, riskli: false })).basarili).toBe(true);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1400 } });
    const page = await baglam.newPage();
    const sayfaHatalari: string[] = [];
    page.on('pageerror', (e) => sayfaHatalari.push(String(e)));
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekran)}/akis`);
    await page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
    const diyagram = page.getByRole('list', { name: 'Akış diyagramı' });
    const sorgu = diyagram.getByRole('listitem', { name: /blok: Alan grubu \(Sorgu\)$/ });
    const on = diyagram.getByRole('listitem', { name: /blok: Alan grubu \(Ön bilgi\)$/ });
    // Bölüm koşulu: alanın yanında salt okunur "koşullu bölüm" notu (diyagramda düzenlenmez, korunur).
    const not = sorgu.getByRole('note', { name: 'Liste dosyası: bölüm (diyagramda düzenlenemez)' });
    await expect(not).toHaveText('koşullu bölüm');
    await expect(not).toHaveAttribute('title', /görünürlük koşulu: Çoklu sorgulama seçiliyken.*bölümle birlikte aynen korunur/);
    // Grupları birleştir: "Ön bilgi"yi etkin yap, iki alanı ona ekle (taşı), boş kalan "Sorgu" grubunu sil.
    await on.getByRole('textbox', { name: 'Adım adı' }).click();
    // Başka gruptaki alan eklenince "Taşı / İkinci kez yaz" sorulur: Taşı (varsayılan).
    const tekrar = page.locator('dialog.onay-diyalogu');
    await page.getByRole('button', { name: 'Sorgu tipi: etkin gruba ekle' }).click();
    await tekrar.getByRole('button', { name: 'Ekle' }).click();
    await page.getByRole('button', { name: 'Liste dosyası: etkin gruba ekle' }).click();
    await tekrar.getByRole('button', { name: 'Ekle' }).click();
    await expect(on.getByRole('note', { name: 'Liste dosyası: bölüm (diyagramda düzenlenemez)' })).toHaveText('koşullu bölüm');
    await sorgu.getByRole('button', { name: 'Bloğu sil' }).click();
    await expect(sorgu).toHaveCount(0);
    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    const onay = page.locator('dialog.onay-diyalogu');
    await expect(onay.getByRole('heading', { name: '“Ana akış” akışı kaydedilsin mi?' })).toBeVisible();
    await expect(onay).not.toContainText('korunan parça');
    await onay.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeHidden();
    const detay = await nobetciApi(nobetci, `/platform/ekran?projeId=${projeId}&id=${ekran}`);
    expect((detay.gecmis as Nesne[])[0].aciklama).toBe('Akış düzenlendi: Ana akış');
    expect(bolumOzellikleri(alaninBolumu(detay.model as Nesne, 'listeDosyasi'))).toEqual({ id: 'cokluListe', gorunurluk: { kosul: 'cokluSorgu' }, pomMetodu: 'listeyiDoldur' });
    expect(detay.uyarilar).toEqual([]);

    // Senaryo formu: Tekli → liste bölümü gizli; Çoklu → görünür (zorunlu dosya yalnız Çoklu'da).
    await page.goto(`/#/senaryolar/yeni/${ekran}`);
    const tip = page.locator('[data-alan="sorguTipi"] select');
    await expect(tip).toBeVisible({ timeout: 20_000 });
    const liste = page.locator('[data-bolum="cokluListe"]');
    await tip.selectOption(TEKLI);
    await expect(liste).toBeHidden();
    await tip.selectOption(COKLU);
    await expect(liste).toBeVisible();
    await expect(page.locator('[data-alan="listeDosyasi"]')).toBeVisible();
    await tip.selectOption(TEKLI);
    await expect(liste).toBeHidden();

    // Düzgün ekranın Model sekmesinde uyarı yok; eski hatanın bıraktığı modelde (bölüm koşulu kaybolmuş) bağsız koşul uyarısı.
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekran)}`);
    await expect(page.getByRole('tab', { name: 'Model', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Liste dosyası').first()).toBeVisible();
    await expect(page.getByRole('note', { name: 'Model uyarıları' })).toHaveCount(0);
    await page.goto(`/#/ekranlar/e/${encodeURIComponent(bozukEkran)}`);
    const uyari = page.getByRole('note', { name: 'Model uyarıları' });
    await expect(uyari).toContainText('“cokluSorgu” koşulu (Çoklu sorgulama seçiliyken): Bu koşul hiçbir yere bağlı değil');
    await page.screenshot({ path: test.info().outputPath('bagsiz-kosul-uyarisi.png') });
    expect(sayfaHatalari).toEqual([]);
  } finally {
    await tarayici.close();
    nobetci.surec.kill('SIGTERM');
    rmSync(klasor, { recursive: true, force: true });
  }
});
