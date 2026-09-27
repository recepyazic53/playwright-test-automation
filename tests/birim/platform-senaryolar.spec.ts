// KORUMA TESTLERİ — platform "Senaryolar": model tabanlı form (şema, görünürlük, adım kapsamı,
// doğrulama eşlemesi), senaryo servisi (UUID kimlik, kaydet/kopyala/sil/geçmiş, şifreli veri),
// koşu hedefi çözümü (UUID → model spec'i + etiket) ve çalıştırma uçlarının doğrulaması (SAHTE
// koşucuyla — gerçek koşu başlatılmaz; model "Dene" paketi). Model: bu dosyadaki NÖTR "Örnek talep"
// ekran modeli + kart alt modeli (değerler sahte). Tarayıcı açmaz, siteye bağlanmaz; her test kendi
// geçici klasöründe çalışır.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur, zarfMi } from '../../scripts/platform/kasa.mjs';
import {
  baglamProfiliKaydet, ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, senaryoKaydet as depoSenaryoKaydet,
  testVerisiProfiliKaydet, testVerisiTuruKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { gorunurlukleriHesapla, senaryoyuDogrula } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import {
  aramaEslesiyorMu, beklenenHataOnerisi, beklenenSonucEtiketi, formDegerleriniKur, formSemasiOlustur, hataKontrolu, hatalariDagit,
  senaryoNesnesiOlustur, tumFormAlanlari
} from '../../scripts/platform/senaryolar/model-formu.mjs';
import { MODEL_SPEC_DOSYASI, modelEtiketi, modelGrepDeseni } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import {
  SenaryoDogrulamaHatasi, calistirmaHedefiCoz, denemePaketiOlustur, formBaglami, kosuyaDahilAyarla, senaryoDetayi, senaryoGecmisi,
  senaryoKaydet, senaryoKopyala, senaryoListesi, senaryolariSil
} from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { senaryoCalistir, senaryoDene, type KosuIstegi, type Kosucu } from '../../scripts/platform/senaryolar/calistirma.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

type Nesne = Record<string, unknown>;
const PAROLA = 'Senaryolar-Kasa-Parolasi-7';
const SPEC = 'scenarios/ornek/ornek.spec.ts';
const KART_DOSYASI = 'ornek-kart.model.json';
const TC = '10000000146';

// ---------------------------------------------------------------------------------------
// Nötr örnek model
// ---------------------------------------------------------------------------------------

const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket, form: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, ...ek
});
const kimlikParcalari = (onEk: string): Nesne[] => [
  { id: `${onEk}No`, tip: 'metin', etiket: { ekran: 'Kimlik no' }, eslesme: { kimlikAlani: 'tcKimlikNo' } },
  { id: `${onEk}Dogum`, tip: 'tarih', bicim: 'gg.aa.yyyy', etiket: { ekran: 'Doğum' }, eslesme: { kimlikAlani: 'dogumTarihi' } },
  { id: `${onEk}Telefon`, tip: 'metin', etiket: { ekran: 'Telefon' }, eslesme: { kimlikAlani: 'cepTelefonu' } }
];
const kartAlani = (kart: string, etiket: string, tip = 'metin', ek: Nesne = {}): Nesne => ({
  id: `kart_${kart}`, tip, etiket: { ekran: etiket, form: etiket }, yapilandirma: 'senaryo', eslesme: { kart }, ...ek
});

function ornekTalepModeli(): Nesne {
  return {
    semaSurumu: 1, tur: 'ekran', id: 'ornek-talep', ad: 'Örnek talep',
    kosullar: {
      onayDahil: { aciklama: 'onay adımı dahil (onayAdimiDahil: true)', ifade: { senaryoAyari: 'onayAdimiDahil', esit: true } },
      ekHizmetGorunur: { aciklama: 'kapsam DÜNYA', ifade: { alan: 'kapsam', esit: 'DÜNYA' } },
      tekliTalep: { aciklama: 'tekli talep', ifade: { alan: 'talepTipi', esit: 'tekli' } },
      cokluTalep: { aciklama: 'çoklu talep', ifade: { alan: 'talepTipi', esit: 'coklu' } },
      farkliSahip: { aciklama: 'hesap sahibi farklı', ifade: { alan: 'sahip', icinde: ['farkliBireysel', 'farkliKurumsal'] } }
    },
    adimlar: [
      { id: 'giris', sira: 1, baslik: 'Ekran açılır', bolumler: [] },
      {
        id: 'bilgiler', sira: 2, baslik: 'Talep bilgileri girilir',
        bolumler: [
          {
            id: 'temel', baslik: 'Temel', alanlar: [
              alan('kapsam', 'secim', 'Kapsam', { zorunlu: true, secenekler: [{ deger: 'DÜNYA' }, { deger: 'AVRUPA' }] }),
              alan('plan', 'secim', 'Plan', {
                zorunlu: true,
                bagimlilik: { alan: 'kapsam', secenekHaritasi: { 'DÜNYA': [{ deger: 'PLAN A' }, { deger: 'PLAN B' }], AVRUPA: [{ deger: 'PLAN C' }] } }
              }),
              alan('ekHizmet', 'secim', 'Ek hizmet', { zorunlu: true, secenekler: [{ deger: 'E' }, { deger: 'H' }], gorunurluk: { kosul: 'ekHizmetGorunur' } }),
              alan('talepTipi', 'secim', 'Talep tipi', { zorunlu: true, secenekler: [{ deger: 'tekli' }, { deger: 'coklu' }] }),
              alan('talepDosyasi', 'dosya', 'Talep dosyası', { kabul: '.xlsx', gorunurluk: { kosul: 'cokluTalep' } }),
              alan('kisiSayisi', 'sayi', 'Kişi sayısı', { gorunurluk: { kosul: 'cokluTalep' } }),
              alan('bildirim', 'onayKutusu', 'Bildirim', { gorunurluk: { kosul: 'tekliTalep' } }),
              { id: 'hesaplaDugmesi', tip: 'buton', etiket: { ekran: 'Hesapla' }, yapilandirma: 'aksiyon' }
            ]
          },
          {
            id: 'kisi', baslik: 'Kişi', gorunurluk: { kosul: 'tekliTalep' }, alanlar: [{
              ...alan('kisiKimlik', 'kimlikProfili', 'Kişi kimliği', {
                zorunlu: false, kimlikTuru: 'ozel', eslesme: { senaryo: ['kisiProfili', 'kisiKimligi'], profilHavuzu: 'Bireysel müşteri' }
              }),
              altAlanlar: kimlikParcalari('kisi')
            }]
          },
          {
            id: 'sahipBilgileri', baslik: 'Hesap sahibi', alanlar: [
              alan('sahip', 'radyo', 'Hesap sahibi', { zorunlu: true, secenekler: [{ deger: 'ayni' }, { deger: 'farkliBireysel' }, { deger: 'farkliKurumsal' }] }),
              {
                ...alan('sahipKimlik', 'kimlikProfili', 'Hesap sahibi kimliği', {
                  zorunlu: true, gorunurluk: { kosul: 'farkliSahip' }, bagimlilik: { alan: 'sahip' },
                  kimlikTuru: { farkliBireysel: 'ozel', farkliKurumsal: 'tuzel' },
                  eslesme: {
                    senaryo: ['sahipProfili', 'sahipOzelKimligi', 'sahipTuzelKimligi'],
                    profilHavuzu: { farkliBireysel: 'Bireysel müşteri', farkliKurumsal: 'Kurumsal müşteri' }
                  }
                }),
                altAlanlar: [
                  { id: 'sahipNo', tip: 'metin', etiket: { ekran: 'Kimlik no' }, eslesme: { kimlikAlani: { ozel: 'tcKimlikNo', tuzel: 'vergiKimlikNo' } } },
                  {
                    id: 'sahipDogum', tip: 'tarih', bicim: 'gg.aa.yyyy', etiket: { ekran: 'Doğum' }, eslesme: { kimlikAlani: 'dogumTarihi' },
                    gorunurluk: { ifade: { alan: 'sahip', esit: 'farkliBireysel' } }
                  },
                  { id: 'sahipTelefon', tip: 'metin', etiket: { ekran: 'Telefon' }, eslesme: { kimlikAlani: 'cepTelefonu' } }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'hesaplama', sira: 3, baslik: 'Tutar hesaplanır',
        bolumler: [{ id: 'sonuc', baslik: 'Sonuç', alanlar: [{ id: 'tutar', tip: 'cikti', yapilandirma: 'cikti' }] }]
      },
      { id: 'onay', sira: 4, baslik: 'Talep onaylanır', gorunurluk: { kosul: 'onayDahil' }, bolumler: [] },
      { id: 'odeme', sira: 5, baslik: 'Ödeme yapılır', gorunurluk: { kosul: 'onayDahil' }, altModel: { dosya: KART_DOSYASI, bolum: 'kartFormu' } }
    ],
    senaryoDuzeyi: {
      alanlar: [
        alan('baslik', 'metin', 'Senaryo Başlığı', { zorunlu: true }),
        alan('subeProfili', 'secim', 'Şube', { eslesme: { senaryo: 'subeProfili', profilHavuzu: 'Şube' }, varsayilan: { deger: 'Merkez' } }),
        alan('onayAdimiDahil', 'onayKutusu', 'Onay adımını dahil et', { zorunlu: true }),
        alan('odemeKarti', 'altModelGecersizKilma', 'Ödeme kartı', { gorunurluk: { kosul: 'onayDahil' }, altModel: { dosya: KART_DOSYASI, bolum: 'kartFormu' } }),
        {
          ...alan('beklenenSonuc', 'birlesim', 'Beklenen sonuç'),
          varyantlar: [
            { tip: 'basarili' },
            {
              tip: 'isKuraliHatasi',
              alanlar: {
                adim: {
                  etiket: 'Hatanın Beklendiği Adım',
                  secenekler: [
                    { deger: 'hesaplama', metin: 'Tutar hesaplama' }, { deger: 'onay', metin: 'Onay', kosul: 'onayDahil' },
                    { deger: 'odeme', metin: 'Ödeme', kosul: 'onayDahil' }
                  ]
                },
                mesaj: { etiket: 'Beklenen Mesaj', tip: 'metin', zorunlu: true }
              }
            }
          ]
        }
      ]
    },
    urunDuzeyi: { alanlar: [{ id: 'urunKodu', tip: 'metin', yapilandirma: 'urun' }] }
  };
}

function ornekKartModeli(): Nesne {
  return {
    tur: 'altModel', id: 'ornek-kart', ad: 'Ödeme kartı',
    bolumler: [{
      id: 'kartFormu', alanlar: [
        kartAlani('isim', 'Kart üzerindeki ad', 'metin', { zorunlu: true }),
        kartAlani('soyisim', 'Kart üzerindeki soyad'),
        kartAlani('kartNo', 'Kart numarası', 'metin', { zorunlu: true, hassas: true }),
        kartAlani('guvenlikKodu', 'Güvenlik kodu', 'metin', { zorunlu: true, hassas: true }),
        kartAlani('sonKullanmaAyi', 'Son kullanma ayı', 'secim', { zorunlu: true }),
        kartAlani('sonKullanmaYili', 'Son kullanma yılı', 'secim', { zorunlu: true }),
        kartAlani('taksit', 'Taksit', 'secim')
      ]
    }]
  };
}

const MODEL = ornekTalepModeli();
const ALT_MODELLER: Record<string, Nesne> = { [KART_DOSYASI]: ornekKartModeli() };
const sema = formSemasiOlustur(MODEL, ALT_MODELLER);
const dogrulamaBaglami = { model: MODEL, altModeller: ALT_MODELLER } as unknown as Parameters<typeof gorunurlukleriHesapla>[1];
const gorunurlukHesapla = (t: Nesne) => gorunurlukleriHesapla(t, dogrulamaBaglami);
const TEMEL = { kapsam: 'DÜNYA', plan: 'PLAN A', ekHizmet: 'E', talepTipi: 'tekli', sahip: 'ayni', onayAdimiDahil: false };
/** Formdan gidiş-dönüş örnekleri (kart hariç: kart seçimleri formda metin olarak tutulur). */
const ORNEK_SENARYOLAR: Nesne[] = [
  { baslik: 'Temel', ...TEMEL },
  { baslik: 'Kişi kimliği ve şube', ...TEMEL, bildirim: true, kisiKimligi: { tcKimlikNo: TC, dogumTarihi: '01.02.1985', cepTelefonu: '5550000001' }, subeProfili: 'Yetkili' },
  { baslik: 'Kurumsal sahip profili', ...TEMEL, kapsam: 'AVRUPA', plan: 'PLAN C', ekHizmet: undefined, sahip: 'farkliKurumsal', sahipProfili: 't1', onayAdimiDahil: true },
  { baslik: 'Çoklu talep', ...TEMEL, talepTipi: 'coklu', talepDosyasi: 'liste.xlsx', kisiSayisi: 3 },
  { baslik: 'Beklenen hata', ...TEMEL, onayAdimiDahil: true, beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'onay', mesaj: 'Onay reddedildi' } },
  { baslik: 'Bireysel sahip yeni kimlik', ...TEMEL, sahip: 'farkliBireysel', sahipOzelKimligi: { tcKimlikNo: TC, dogumTarihi: '01.02.1985', cepTelefonu: '5550000002' } }
].map((s) => JSON.parse(JSON.stringify(s)) as Nesne);

// ---------------------------------------------------------------------------------------
// Model tabanlı form (saf)
// ---------------------------------------------------------------------------------------

test.describe('Model tabanlı form — şema', () => {
  test('adımlar akış sırasıyla; alan tipleri, zorunluluk, seçenekler ve bağımlılık modelden', () => {
    expect(sema.adimlar.map((a) => a.id)).toEqual(['giris', 'bilgiler', 'hesaplama', 'onay', 'odeme']);
    const f = (id: string) => tumFormAlanlari(sema).find((a) => a.id === id);
    expect(f('kapsam')).toMatchObject({ tip: 'secim', anahtar: 'kapsam', zorunlu: true, adimId: 'bilgiler' });
    const plan = f('plan');
    expect(plan?.tip === 'secim' && plan.bagimlilik?.alan).toBe('kapsam');
    expect(f('bildirim')).toMatchObject({ tip: 'onayKutusu', gorunurlukVar: true });
    expect(f('talepDosyasi')).toMatchObject({ tip: 'dosya', kabul: '.xlsx' });
    expect(f('kisiSayisi')).toMatchObject({ tip: 'sayi' });
    expect(f('sahip')).toMatchObject({ tip: 'secim', gorunum: 'radyo' });
    const sahipKimlik = f('sahipKimlik');
    expect(sahipKimlik).toMatchObject({ tip: 'kimlik', profilAnahtari: 'sahipProfili', bagliAlan: 'sahip', zorunlu: true });
    expect(sahipKimlik?.tip === 'kimlik' && sahipKimlik.kimlikAnahtarlari).toEqual(['sahipOzelKimligi', 'sahipTuzelKimligi']);
    expect(f('subeProfili')).toMatchObject({ tip: 'profil', profilHavuzu: 'Şube', varsayilanProfil: 'Merkez' });
    // Senaryo düzeyindeki alt model ezmesi (kart) akıştaki yerine, ödeme adımına yerleşir.
    expect(f('odemeKarti')).toMatchObject({ tip: 'altModel', adimId: 'odeme' });
    const kart = f('odemeKarti');
    expect(kart?.tip === 'altModel' && kart.alanlar.map((a) => a.anahtar)).toEqual(['isim', 'soyisim', 'kartNo', 'guvenlikKodu', 'sonKullanmaAyi', 'sonKullanmaYili', 'taksit']);
    // Ürün düzeyi / çıktı / aksiyon alanları formda yok.
    for (const yok of ['urunKodu', 'tutar', 'hesaplaDugmesi']) expect(f(yok)).toBeUndefined();
  });

  test('isteğe bağlı adımlar = adım kapsamı; beklenen sonuç varyantları ve adım seçenekleri', () => {
    expect(sema.adimKapsami).toEqual([{ ayar: 'onayAdimiDahil', alanId: 'onayAdimiDahil', etiket: 'Onay adımını dahil et', adimlar: ['onay', 'odeme'], zorunlu: true }]);
    expect(sema.adimlar.filter((a) => a.ayar).map((a) => a.id)).toEqual(['onay', 'odeme']);
    expect(sema.beklenenSonuc).toMatchObject({ anahtar: 'beklenenSonuc', basariTipi: 'basarili', hataTipi: 'isKuraliHatasi', adimAnahtari: 'adim', mesajAnahtari: 'mesaj' });
    expect(sema.beklenenSonuc?.adimlar.map((s) => s.deger)).toEqual(['hesaplama', 'onay', 'odeme']);
  });

  test('görünürlük: koşullar tek doğrulayıcıdan; gizli alanlar ve kapsam dışı adımlar yazılmaz', () => {
    const d = formDegerleriniKur(sema, { ...TEMEL, talepTipi: 'coklu', talepDosyasi: 'x.xlsx', kisiSayisi: 3 });
    d['kisiKimlik#kip'] = 'yeni';
    d['kisiKimlik.tcKimlikNo'] = TC;
    d['odemeKarti#ozel'] = true;
    d['odemeKarti.kartNo'] = '4111111111111111';
    d.bildirim = true;
    d.baslik = 'x';
    const g = gorunurlukHesapla(senaryoNesnesiOlustur(sema, d));
    expect(g.bolumler.kisi).toBe(false); // çoklu talepte kişi bölümü yok
    expect(g.adimlar.odeme).toBe(false); // ödeme adımı kapsam dışı
    expect(g.alanlar.sahipKimlik).toBe(false); // hesap sahibi "ayni"
    expect(g.alanlar.bildirim).toBe(false);
    const s = senaryoNesnesiOlustur(sema, d, { gorunurlukHesapla });
    expect(s).toMatchObject({ talepTipi: 'coklu', talepDosyasi: 'x.xlsx', kisiSayisi: 3, onayAdimiDahil: false });
    for (const yok of ['kisiKimligi', 'odemeKarti', 'bildirim']) expect(s).not.toHaveProperty(yok);
    // Başka bir alanın değerine bağlı görünürlük: ek hizmet yalnızca DÜNYA kapsamında.
    expect(gorunurlukHesapla({ ...TEMEL }).alanlar.ekHizmet).toBe(true);
    expect(gorunurlukHesapla({ ...TEMEL, kapsam: 'AVRUPA' }).alanlar.ekHizmet).toBe(false);
    // Kimlik parçasının kendi görünürlüğü: kurumsal sahipte doğum tarihi yok.
    expect(gorunurlukHesapla({ ...TEMEL, sahip: 'farkliKurumsal' }).altAlanlar['sahipKimlik.sahipDogum']).toBe(false);
    expect(gorunurlukHesapla({ ...TEMEL, sahip: 'farkliBireysel' }).altAlanlar['sahipKimlik.sahipDogum']).toBe(true);
  });

  test('örnek senaryolar formdan geri aynı JSON olarak çıkar (gidiş-dönüş) ve hatasız', () => {
    for (const s of ORNEK_SENARYOLAR) {
      expect(senaryoyuDogrula(s, dogrulamaBaglami).hatalar, String(s.baslik)).toEqual([]);
      const geri = senaryoNesnesiOlustur(sema, formDegerleriniKur(sema, s), { gorunurlukHesapla, onceki: s });
      expect(JSON.stringify(geri), String(s.baslik)).toBe(JSON.stringify(s));
    }
    test.info().annotations.push({ type: 'gidis-donus', description: `${ORNEK_SENARYOLAR.length} senaryo` });
  });

  test('doğrulayıcı hataları form kontrollerine dağılır; rozet ve "beklenen hata" önerisi modelden', () => {
    expect(hataKontrolu('sahipOzelKimligi.tcKimlikNo', sema)).toBe('sahipKimlik.tcKimlikNo');
    expect(hataKontrolu('sahipProfili', sema)).toBe('sahipKimlik#profil');
    expect(hataKontrolu('odemeKarti.sonKullanmaYili', sema)).toBe('odemeKarti.sonKullanmaYili');
    expect(hataKontrolu('odemeKarti', sema)).toBe('odemeKarti#ozel');
    expect(hataKontrolu('beklenenSonuc.mesaj', sema)).toBe('beklenenSonuc.mesaj');
    expect(hataKontrolu('onayAdimiDahil', sema)).toBe('onayAdimiDahil');
    expect(hataKontrolu('olmayan', sema)).toBeNull();
    const sonuc = senaryoyuDogrula({ baslik: '', ...TEMEL, plan: 'YOK', sahip: 'farkliBireysel', sahipOzelKimligi: { tcKimlikNo: '123', dogumTarihi: '01.01.1990', cepTelefonu: '5321234567' } }, dogrulamaBaglami);
    const dagit = hatalariDagit(sonuc.hatalar, sema);
    expect(Object.keys(dagit.alanlar).sort()).toEqual(['baslik', 'plan', 'sahipKimlik.tcKimlikNo'].sort());
    expect(dagit.genel).toEqual([]);
    expect(hatalariDagit([{ alan: 'bilinmeyen', mesaj: 'm' }, { alan: '', mesaj: 'genel' }], sema).genel).toEqual(['bilinmeyen: m', 'genel']);
    expect(beklenenSonucEtiketi(sema, { ...TEMEL, onayAdimiDahil: true })).toMatchObject({ tur: 'basari', metin: 'Ödeme' });
    expect(beklenenSonucEtiketi(sema, TEMEL)).toMatchObject({ tur: 'basari', metin: 'Tutar hesaplama' });
    expect(beklenenSonucEtiketi(sema, { ...TEMEL, beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'onay', mesaj: 'm' } })).toMatchObject({ tur: 'hata', metin: 'Hata: Onay' });
    expect(beklenenHataOnerisi({ hataMesaji: 'Tutar hesaplama adımında beklenen sonuç doğrulanamadı. Beklenen: x — Görülen: "Limit aşıldı"', basarisizAdim: 'Tutar hesaplanır ve sonuç gösterilir' }, sema))
      .toEqual({ mesaj: 'Limit aşıldı', adim: 'hesaplama' });
    expect(beklenenHataOnerisi({ hataMesaji: 'Error: "Onay" adımından sonra beklenmeyen bir hata pop-up\'ı görüntülendi, senaryo burada durduruldu: Kart reddedildi Tamam', basarisizAdim: 'Talep onaylanır ve kart bilgileri girilir' }, sema))
      .toEqual({ mesaj: 'Kart reddedildi', adim: 'onay' });
    expect(beklenenHataOnerisi({ hataMesaji: 'Timeout 30000ms exceeded.' }, sema)).toBeNull();
    expect(aramaEslesiyorMu('ornek BASVURU', 'Örnek Başvuru Ekranı')).toBe(true);
    expect(aramaEslesiyorMu('başvuru talep', 'Örnek Başvuru Ekranı')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// Senaryo servisi + koşu hedefi + çalıştırma uçları (nötr proje, sahte koşucu)
// ---------------------------------------------------------------------------------------

type Ortam = { vt: Veritabani; projeId: string; ortamId: string; digerOrtamId: string; ekranId: string; veriSenaryo: string; kalinti: string; temizle: () => void };

/** Nötr proje: iki ortam, model + kart alt modeli, test verisi türü/profili, şube bağlam profilleri, bir model senaryosu. */
async function ortamKur(): Promise<Ortam> {
  const k = geciciKlasor('senaryolar');
  const vt = await veritabaniniHazirla(join(k.yol, 'platform.db'));
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
  const ortamId = ortamKaydet(vt, { projeId, ad: 'DENEME', tabanUrl: 'http://ornek.invalid', varsayilan: true });
  const digerOrtamId = ortamKaydet(vt, { projeId, ad: 'IKINCI', tabanUrl: 'http://ikinci.invalid' });
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'ornek', ad: 'Örnek ekran' });
  ekranModeliEkle(vt, { ekranId, model: MODEL });
  const altId = ekranKaydet(vt, { projeId, anahtar: 'ornek-kart', ad: 'Ödeme kartı' });
  ekranModeliEkle(vt, { ekranId: altId, model: ALT_MODELLER[KART_DOSYASI] });
  const tur = testVerisiTuruKaydet(vt, { projeId, ad: 'Bireysel müşteri', alanlar: [{ ad: 'tcKimlikNo' }, { ad: 'dogumTarihi' }, { ad: 'cepTelefonu' }] });
  testVerisiProfiliKaydet(vt, { projeId, turId: tur, ad: 'k1', degerler: { tcKimlikNo: TC, dogumTarihi: '01.01.1990', cepTelefonu: '5321234567' } });
  baglamProfiliKaydet(vt, { projeId, tur: 'Şube', ad: 'Merkez', alanlar: { subeKodu: 'S01' } });
  baglamProfiliKaydet(vt, { projeId, tur: 'Şube', ad: 'Yetkili', alanlar: { subeKodu: 'S02' } });
  const veriSenaryo = depoSenaryoKaydet(vt, {
    projeId, ekranId, baslik: 'Mevcut veri senaryosu', kosuyaDahil: true,
    icerik: {
      kosucu: 'model', kaynak: { dosya: SPEC, ad: 'Mevcut veri senaryosu' }, veri: { dosya: 'ornek', yol: 'senaryolar' },
      ortamlar: { [ortamId]: { sira: 0, veri: { baslik: 'Mevcut veri senaryosu', ...TEMEL } } }
    }
  });
  // Kodlu testlerden kalmış (verisiz) eski bir kayıt: düzenlenemez/kopyalanamaz/çalıştırılamaz, silinebilir.
  const kalinti = depoSenaryoKaydet(vt, {
    projeId, ekranId, baslik: 'Eski kayıt', icerik: { kaynak: { dosya: 'scenarios/eski/a.spec.ts', ad: 'Eski kayıt' }, ortamlar: { [ortamId]: {} } }
  });
  return { vt, projeId, ortamId, digerOrtamId, ekranId, veriSenaryo, kalinti, temizle: () => { vt.kapat(); k.temizle(); } };
}

test.describe('Senaryo servisi (nötr proje)', () => {
  test('oluştur (doğrulama + şifreli veri), yeniden adlandır, kopyala, sil, Koşuda, geçmiş ve liste', async () => {
    const o = await ortamKur();
    try {
      const { vt, projeId, ortamId, ekranId } = o;
      // Doğrulama: alan bazında hata (tek doğrulayıcı), hiçbir şey yazılmaz.
      let hata: unknown;
      try { senaryoKaydet(vt, { projeId, ekranId, baslik: 'Yeni', veri: { kapsam: 'DÜNYA' }, ortamIdleri: [ortamId] }); } catch (e) { hata = e; }
      expect(hata).toBeInstanceOf(SenaryoDogrulamaHatasi);
      expect((hata as SenaryoDogrulamaHatasi).hatalar.map((x) => x.alan)).toEqual(expect.arrayContaining(['plan', 'talepTipi', 'sahip', 'onayAdimiDahil']));
      expect(() => senaryoKaydet(vt, { projeId, ekranId, baslik: 'Mevcut veri senaryosu', veri: TEMEL, ortamIdleri: [ortamId] })).toThrow(/zaten var/);
      expect(() => senaryoKaydet(vt, { projeId, ekranId, baslik: 'Yeni', veri: TEMEL, ortamIdleri: [] })).toThrow(/En az bir ortam/);
      expect(() => senaryoKaydet(vt, { projeId, ekranId, baslik: '__senaryo_deneme__ x', veri: TEMEL, ortamIdleri: [ortamId] })).toThrow(/önek/);
      const sayi = () => Number(vt.tek('SELECT COUNT(*) AS n FROM senaryolar')?.n);
      expect(sayi()).toBe(2);

      const { id } = senaryoKaydet(vt, {
        projeId, ekranId, baslik: '  Yeni   senaryo ', ortamIdleri: [ortamId], kosuyaDahil: true, mutlakaGorunmeli: ['ekHizmet'],
        veri: { ...TEMEL, sahip: 'farkliBireysel', sahipOzelKimligi: { tcKimlikNo: TC, dogumTarihi: '01.01.1990', cepTelefonu: '5321234567' }, subeProfili: 'Yetkili' }
      });
      const ham = JSON.parse(String(vt.tek('SELECT icerik_json FROM senaryolar WHERE id = ?', [id])?.icerik_json));
      expect(ham.kosucu).toBe('model');
      expect(ham.kaynak).toEqual({ dosya: SPEC, ad: 'Yeni senaryo' });
      expect(ham.veri).toEqual({ dosya: 'ornek', yol: 'senaryolar' });
      expect(ham.ortamlar[ortamId].sira).toBe(1);
      expect(zarfMi(ham.ortamlar[ortamId].veri.sahipOzelKimligi.tcKimlikNo), 'hassas değer kasa zarfı olmalı').toBe(true);
      expect(readFileSync(join(String(vt.yol))).includes(Buffer.from(TC))).toBe(false);
      expect(senaryoDetayi(vt, id, ortamId)).toMatchObject({ baslik: 'Yeni senaryo', mutlakaGorunmeli: ['ekHizmet'], veri: { baslik: 'Yeni senaryo', sahipOzelKimligi: { tcKimlikNo: TC } } });

      // UUID → model spec'i + etiket; yeniden adlandırınca kaynak ve verideki başlık birlikte değişir.
      expect(calistirmaHedefiCoz(vt, projeId, id, ortamId)).toMatchObject({
        senaryoId: id, baslik: 'Yeni senaryo', dosya: MODEL_SPEC_DOSYASI, ad: null, model: true, etiket: modelEtiketi(id),
        grepDeseni: modelGrepDeseni(id), genel: { projeId, ortamId }
      });
      senaryoKaydet(vt, { id, projeId, baslik: 'Yeni ad' });
      expect(calistirmaHedefiCoz(vt, projeId, id, ortamId).baslik).toBe('Yeni ad');
      expect(senaryoDetayi(vt, id, ortamId)).toMatchObject({ kaynak: { dosya: SPEC, ad: 'Yeni ad' }, veri: { baslik: 'Yeni ad' } });
      expect(() => calistirmaHedefiCoz(vt, projeId, id, o.digerOrtamId)).toThrow(/ortamda tanımlı değil/);
      expect(() => calistirmaHedefiCoz(vt, projeId, 'olmayan-id', ortamId)).toThrow(/bulunamadı/);
      expect(() => calistirmaHedefiCoz(vt, projeId, '../x', ortamId)).toThrow(/Geçersiz/);
      expect(() => calistirmaHedefiCoz(vt, projeId, o.kalinti, ortamId)).toThrow(/kodlu testlerden kalma/);
      // Koşan senaryo düzenlenemez / silinemez.
      const kosuyor = (d: string, a: string) => d === SPEC && a === 'Yeni ad';
      expect(() => senaryoKaydet(vt, { id, projeId, baslik: 'Başka' }, { kosuyorMu: kosuyor })).toThrow(/koşuyor/);
      expect(() => senaryolariSil(vt, projeId, [id], { kosuyorMu: kosuyor })).toThrow(/koşuyor/);

      const kopya = senaryoKopyala(vt, projeId, id);
      expect(kopya.baslik).toBe('Yeni ad (kopya)');
      expect(senaryoKopyala(vt, projeId, id).baslik).toBe('Yeni ad (kopya 2)');
      expect(senaryoDetayi(vt, kopya.id, ortamId)).toMatchObject({ kosuyaDahil: false, veri: { baslik: 'Yeni ad (kopya)', sahipOzelKimligi: { tcKimlikNo: TC } } });
      // Kodlu testlerden kalan kayıt kopyalanamaz / düzenlenemez; Koşuda ve silme çalışır.
      expect(() => senaryoKopyala(vt, projeId, o.kalinti)).toThrow(/kodlu testlerden kalma/);
      expect(() => senaryoKaydet(vt, { id: o.kalinti, projeId, baslik: 'Görünen ad' })).toThrow(/kodlu testlerden kalma/);

      expect(kosuyaDahilAyarla(vt, projeId, [id, o.veriSenaryo], false).degisen).toBe(2);
      expect(kosuyaDahilAyarla(vt, projeId, [id], false).degisen).toBe(0);
      expect(() => kosuyaDahilAyarla(vt, projeId, ['olmayan'], true)).toThrow(/bulunamadı/);
      expect(senaryolariSil(vt, projeId, [kopya.id, o.kalinti]).silinen).toBe(2);
      expect(() => senaryolariSil(vt, projeId, [])).toThrow(/idler/);

      const gecmis = senaryoGecmisi(vt, id);
      expect(gecmis.map((g) => g.islem)).toEqual(['guncelle', 'guncelle', 'olustur']);
      expect(gecmis[0].degisenler).toEqual(['Koşuda: açık → kapalı']);
      expect(gecmis[1].degisenler).toEqual(['Başlık: "Yeni senaryo" → "Yeni ad"']);
      expect(JSON.stringify(gecmis)).not.toContain(TC);

      // Liste: son sonuç (senaryo kimliğine), bağlam profili, beklenen sonuç rozeti, ekranlar.
      kosuKaydet(vt, { id: 'kosu-1', projeId, ortamId, tur: 'tekil' });
      sonucKaydet(vt, { kosuId: 'kosu-1', projeId, senaryoId: id, senaryoBaslik: 'Yeni ad', durum: 'basarisiz', bitis: '2026-09-25T10:00:00.000Z' });
      const liste = senaryoListesi(vt, projeId, ortamId);
      const satir = liste.senaryolar.find((s) => s.id === id);
      expect(satir).toMatchObject({
        baslik: 'Yeni ad', kosuyaDahil: false, veriGudumlu: true, modelVar: true, modelKosusu: true, baglamProfili: { ad: 'Yetkili', varsayilan: false },
        beklenenSonuc: { tur: 'basari', metin: 'Tutar hesaplama' }, sonSonuc: { durum: 'basarisiz' }, mutlakaGorunmeliSayisi: 1
      });
      expect(liste.senaryolar.find((s) => s.id === o.veriSenaryo)?.baglamProfili).toMatchObject({ varsayilan: true, ad: 'Merkez' });
      expect(liste.senaryolar.map((s) => s.baslik)).toEqual(['Mevcut veri senaryosu', 'Yeni ad', 'Yeni ad (kopya 2)']);
      expect(liste.ekranlar.map((e) => e.anahtar)).toEqual(['ornek']);
      expect(liste.ekranlar.find((e) => e.id === ekranId)).toMatchObject({ olusturulabilir: true, modelVar: true, senaryoSayisi: 3 });
      expect(senaryoListesi(vt, projeId, o.digerOrtamId).senaryolar).toEqual([]);

      // Form bağlamı: test verisi profili MASKELİ (değer yok), tarayıcıya yalnızca profil anahtarları; bağlam profilleri.
      const fb = formBaglami(vt, projeId, ekranId, ortamId);
      expect(fb.profiller['Bireysel müşteri']).toEqual([{ ad: 'k1', tur: 'testVerisi', kapsam: 'tum', alanlar: expect.arrayContaining([{ etiket: 'tcKimlikNo', dolu: true }]) }]);
      expect(fb.profiller['Kurumsal müşteri']).toEqual([]);
      expect(fb.profiller['Şube'].map((p) => p.ad)).toEqual(['Merkez', 'Yetkili']);
      expect(fb.profiller['Şube'][1]).toMatchObject({ tur: 'baglam', alanlar: [{ etiket: 'subeKodu', deger: 'S02', dolu: true }] });
      expect(JSON.stringify(fb)).not.toContain(TC);
      expect(fb).toMatchObject({ ortak: null, olusturulabilir: true, veriKaynagi: { spec: SPEC, dosya: 'ornek', yol: 'senaryolar' } });
      expect(() => formBaglami(vt, projeId, ekranId, 'olmayan-ortam')).toThrow(/Ortam bulunamadı/);
    } finally { o.temizle(); }
  });

  test('birleşik liste: tüm ortamlar tek listede; Koşuda ve son sonuç ortam başına (ortamId verilince eski yanıt)', async () => {
    const o = await ortamKur();
    try {
      const { vt, projeId, ortamId, digerOrtamId, ekranId } = o;
      const { id } = senaryoKaydet(vt, { projeId, ekranId, baslik: 'İki ortamlı', veri: TEMEL, ortamIdleri: [ortamId, digerOrtamId], kosuyaDahil: true });
      kosuKaydet(vt, { id: 'k-diger', projeId, ortamId: digerOrtamId, tur: 'tekil' });
      sonucKaydet(vt, { kosuId: 'k-diger', projeId, senaryoId: id, senaryoBaslik: 'İki ortamlı', durum: 'basarili', bitis: '2026-09-27T08:00:00.000Z' });

      // Birleşik: ortamı yalnız biri olan senaryolar da listede; her satırda projedeki her ortam.
      const birlesik = senaryoListesi(vt, projeId, null);
      expect(birlesik.senaryolar.map((s) => s.baslik)).toEqual(['Eski kayıt', 'Mevcut veri senaryosu', 'İki ortamlı']);
      const satir = birlesik.senaryolar.find((s) => s.id === id);
      expect(satir?.ortamlar).toEqual([
        { ortamId, tanimli: true, kosuyaDahil: true, sonSonuc: null },
        { ortamId: digerOrtamId, tanimli: true, kosuyaDahil: true, sonSonuc: expect.objectContaining({ durum: 'basarili', kosuId: 'k-diger' }) }
      ]);
      expect(satir).toMatchObject({ kosuyaDahil: true, sonSonuc: { durum: 'basarili' } });
      expect(birlesik.senaryolar.find((s) => s.id === o.veriSenaryo)?.ortamlar?.map((x) => x.tanimli)).toEqual([true, false]);
      expect(birlesik.ekranlar.find((e) => e.id === ekranId)?.senaryoSayisi).toBe(3);

      // Koşuda yalnız bir ortamda kapatılır; diğeri korunur. Ortamlı eski yanıt o ortamın değerini verir (ortamlar alanı yok).
      expect(kosuyaDahilAyarla(vt, projeId, [id, o.veriSenaryo], false, undefined, digerOrtamId).degisen).toBe(1);
      expect(senaryoListesi(vt, projeId, null).senaryolar.find((s) => s.id === id)?.ortamlar?.map((x) => x.kosuyaDahil)).toEqual([true, false]);
      const eski = senaryoListesi(vt, projeId, digerOrtamId).senaryolar.find((s) => s.id === id);
      expect(eski).toMatchObject({ kosuyaDahil: false, sonSonuc: { durum: 'basarili' } });
      expect(eski && 'ortamlar' in eski).toBe(false);
      expect(senaryoListesi(vt, projeId, ortamId).senaryolar.find((s) => s.id === id)?.kosuyaDahil).toBe(true);
      expect(senaryoDetayi(vt, id, null).kosuyaDahil).toBe(true); // genel: en az bir ortamda koşuda
      expect(senaryoGecmisi(vt, id)[0].degisenler).toEqual(['Koşuda (IKINCI): açık → kapalı']);
      // Başlık değişikliği (Koşuda değişmeden) ortam başına değeri korur; tüm ortamlar için ayar hepsini eşitler.
      senaryoKaydet(vt, { id, projeId, baslik: 'İki ortamlı 2', kosuyaDahil: true });
      expect(senaryoListesi(vt, projeId, digerOrtamId).senaryolar.find((s) => s.id === id)?.kosuyaDahil).toBe(false);
      expect(kosuyaDahilAyarla(vt, projeId, [id], true).degisen).toBe(1);
      expect(senaryoListesi(vt, projeId, null).senaryolar.find((s) => s.id === id)?.ortamlar?.map((x) => x.kosuyaDahil)).toEqual([true, true]);
      expect(() => kosuyaDahilAyarla(vt, projeId, [id], true, undefined, 'olmayan')).toThrow(/Ortam bulunamadı/);
    } finally { o.temizle(); }
  });

  test('çalıştırma ucu: gövde doğrulanır, UUID sunucuda çözülür, SAHTE koşucu çağrılır; Dene veritabanına yazmaz', async () => {
    const o = await ortamKur();
    try {
      const { vt, projeId, ortamId, ekranId } = o;
      const istekler: KosuIstegi[] = [];
      const denemeler: Array<Parameters<Kosucu['modelDene']>[0]> = [];
      const kosucu: Kosucu = {
        calistir: async (i) => { istekler.push(i); return { govde: { basarili: true, durum: 'passed', sureMs: 5 } }; },
        modelDene: async (i) => { denemeler.push(i); return { govde: { basarili: true, durum: 'failed', hataMesaji: 'x' } }; }
      };
      const govde = { projeId, ortamId, senaryoId: o.veriSenaryo, kosuId: 'k1' };
      await expect(senaryoCalistir(vt, { ...govde, kosuId: 'a b' }, kosucu)).rejects.toThrow(/kosuId/);
      await expect(senaryoCalistir(vt, { ...govde, kosuTuru: 'hepsi' }, kosucu)).rejects.toThrow(/kosuTuru/);
      await expect(senaryoCalistir(vt, { ...govde, kosuTuru: 'tam' }, kosucu)).rejects.toThrow(/kosuKimligi/);
      await expect(senaryoCalistir(vt, { ...govde, kosuTuru: 'tam', kosuKimligi: 'g-1', kosuKapsami: 'Olmayan ekran' }, kosucu)).rejects.toThrow(/kosuKapsami/);
      await expect(senaryoCalistir(vt, { ...govde, senaryoId: 'olmayan' }, kosucu)).rejects.toThrow(/bulunamadı/);
      await expect(senaryoCalistir(vt, { ...govde, ortamId: o.digerOrtamId }, kosucu)).rejects.toThrow(/ortamda tanımlı değil/);
      await expect(senaryoCalistir(vt, { ...govde, senaryoId: o.kalinti }, kosucu)).rejects.toThrow(/kodlu testlerden kalma/);
      await expect(senaryoCalistir(vt, govde, null)).rejects.toThrow(/etkin değil/);
      expect(istekler).toEqual([]);

      // İstemcinin gönderdiği dosya/başlık yok sayılır: hedef sunucuda UUID'den çözülür.
      const r = await senaryoCalistir(vt, { ...govde, kosuTuru: 'tam', kosuKimligi: 'g-1', kosuKapsami: 'Örnek ekran', dosya: 'kotu.spec.ts', senaryoAdi: 'kötü' }, kosucu);
      expect(r).toMatchObject({ httpDurum: 200, govde: { basarili: true, durum: 'passed', senaryoId: o.veriSenaryo, baslik: 'Mevcut veri senaryosu' } });
      expect(istekler).toEqual([{
        ortam: 'genel', dosya: MODEL_SPEC_DOSYASI, ad: null, kosuId: 'k1', kosuTuru: 'tam', kosuKimligi: 'g-1', kosuKapsami: 'Örnek ekran',
        senaryoId: o.veriSenaryo, etiket: modelEtiketi(o.veriSenaryo), grepDeseni: modelGrepDeseni(o.veriSenaryo), genel: { projeId, ortamId }
      }]);

      const once = vt.tek('SELECT COUNT(*) AS n, MAX(guncellenme) AS g FROM senaryolar');
      await expect(senaryoDene(vt, { projeId, ekranId, ortamId, kosuId: 'd1', veri: { kapsam: 'DÜNYA' } }, kosucu)).rejects.toThrow(SenaryoDogrulamaHatasi);
      await expect(senaryoDene(vt, { projeId, ekranId, ortamId: o.digerOrtamId + 'x', kosuId: 'd1', veri: TEMEL }, kosucu)).rejects.toThrow(/ortam/);
      const d = await senaryoDene(vt, { projeId, ekranId, ortamId, kosuId: 'd1', veri: { ...TEMEL, sahip: 'farkliBireysel', sahipProfili: 'k1' }, mutlakaGorunmeli: ['ekHizmet'] }, kosucu);
      expect(d.govde).toMatchObject({ basarili: true, durum: 'failed', uyarilar: [] });
      expect(denemeler).toHaveLength(1);
      const deneme = denemeler[0];
      expect(deneme).toMatchObject({ ortam: 'genel', dosya: MODEL_SPEC_DOSYASI, kosuId: 'd1', genel: { projeId, ortamId } });
      expect(deneme.etiket).toMatch(/^@model-deneme-[a-f0-9]{8}$/);
      expect(deneme.denemeSenaryosu).toMatchObject({ ekranId, ortamId, mutlakaGorunmeli: ['ekHizmet'], veri: { sahipProfili: 'k1' } });
      expect(String(deneme.denemeSenaryosu.baslik)).toMatch(/^__senaryo_deneme__ [a-f0-9]{8}$/);
      expect(vt.tek('SELECT COUNT(*) AS n, MAX(guncellenme) AS g FROM senaryolar')).toEqual(once);

      const paket = denemePaketiOlustur(vt, { projeId, ekranId, ortamId, veri: TEMEL }, { geciciEk: 'abcd1234' });
      expect(paket).toMatchObject({
        model: true, spec: MODEL_SPEC_DOSYASI, geciciBaslik: '__senaryo_deneme__ abcd1234', etiket: modelEtiketi('deneme-abcd1234'),
        grepDeseni: modelGrepDeseni('deneme-abcd1234'), genel: { projeId, ortamId }
      });
      expect(paket.denemeSenaryosu.veri).toEqual({ ...TEMEL, baslik: '__senaryo_deneme__ abcd1234' });
      expect(() => denemePaketiOlustur(vt, { projeId, ekranId, ortamId, veri: 'x' }, { geciciEk: 'abcd1234' })).toThrow(/nesne/);
    } finally { o.temizle(); }
  });
});
