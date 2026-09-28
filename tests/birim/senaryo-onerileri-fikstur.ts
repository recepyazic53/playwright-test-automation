// Senaryo tasarım yardımcısı testlerinin ortak fikstürü (spec DEĞİL): nötr bir sipariş ekranı modeli (değerler sahte).
//  - Ürün adımı (hata göstergesi var): ürün adı (metin, 3–10 karakter), adet (sayı 1–10, varsayılan 1; iş kuralı mesajı var),
//    kategori (seçim), beden (yalnız "giyim"de görünür, zorunlu), renk (kategoriye bağlı liste), not (kuralsız metin).
//  - Teslimat adımı (hata göstergesi yok): teslimat tarihi (bugün+1 … bugün+30), telefon (hassas; değer üretilmez),
//    kupon kodu (yalnız desen), hediye paketi (onay kutusu) → hediye notu (işaretliyken görünür, zorunlu).
type Nesne = Record<string, any>;

export const EKRAN_ADI = 'Sipariş formu';
export const TELEFON = '5550001122';

const secim = (deger: string, metin: string): Nesne => ({ deger, metin });
const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false, ...ek
});

export function siparisModeli(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'siparis-formu', ad: EKRAN_ADI, aciklama: 'Senaryo önerileri fikstürü (değerler sahte).',
    ekranUrl: '/siparis/', specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' }, girisGerekmez: true,
    kosullar: { giyimSecili: { ifade: { alan: 'kategori', esit: 'giyim' }, aciklama: 'Kategori giyim' } },
    adimlar: [
      {
        id: 'urun', sira: 1, baslik: 'Ürün seçimi',
        bolumler: [{ id: 'urunBolumu', baslik: 'Ürün', alanlar: [
          alan('urunAdi', 'metin', 'Ürün adı', { zorunlu: true, sinirlar: { enAzUzunluk: 3, enCokUzunluk: 10 } }),
          alan('adet', 'sayi', 'Adet', { zorunlu: true, varsayilan: { deger: 1 }, sinirlar: { enAz: 1, enCok: 10 } }),
          alan('kategori', 'secim', 'Kategori', { zorunlu: true, seceneklerDurumu: 'tam', secenekler: [secim('kitap', 'Kitap'), secim('giyim', 'Giyim'), secim('elektronik', 'Elektronik')] }),
          alan('beden', 'secim', 'Beden', { zorunlu: true, gorunurluk: { kosul: 'giyimSecili' }, seceneklerDurumu: 'tam', secenekler: [secim('S', 'S'), secim('M', 'M'), secim('L', 'L')] }),
          alan('renk', 'secim', 'Renk', {
            seceneklerDurumu: 'tam', secenekler: null,
            bagimlilik: { alan: 'kategori', secenekHaritasi: { kitap: [secim('standart', 'Standart')], giyim: [secim('kirmizi', 'Kırmızı'), secim('mavi', 'Mavi')], elektronik: [secim('siyah', 'Siyah'), secim('beyaz', 'Beyaz')] } }
          }),
          alan('siparisNotu', 'metin', 'Sipariş notu')
        ] }],
        kosu: { basariGostergesi: { tur: 'eleman', deger: '#teslimat' }, hataGostergesi: { secici: '.uyari' } }
      },
      {
        id: 'teslimat', sira: 2, baslik: 'Teslimat bilgileri',
        bolumler: [{ id: 'teslimatBolumu', baslik: 'Teslimat', alanlar: [
          alan('teslimatTarihi', 'tarih', 'Teslimat tarihi', { zorunlu: true, bicim: 'gg.aa.yyyy', sinirlar: { enAz: 'bugun+1', enCok: 'bugun+30' } }),
          alan('telefon', 'telefon', 'Telefon', { zorunlu: true, hassas: true, sinirlar: { enAzUzunluk: 10, enCokUzunluk: 10 } }),
          alan('kuponKodu', 'metin', 'Kupon kodu', { sinirlar: { desen: '[A-Z]{4}' } }),
          alan('hediyePaketi', 'onayKutusu', 'Hediye paketi'),
          alan('hediyeNotu', 'metin', 'Hediye notu', { zorunlu: true, gorunurluk: { ifade: { alan: 'hediyePaketi', esit: true } } })
        ] }],
        kosu: { basariGostergesi: { tur: 'metin', deger: 'Siparişiniz alındı' } }
      }
    ],
    senaryoDuzeyi: {
      aciklama: 'Ekran alanı olmayan ayarlar.',
      alanlar: [
        { id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } },
        {
          id: 'beklenenSonuc', tip: 'birlesim', etiket: { ekran: null, form: 'Beklenen sonuç' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'beklenenSonuc' },
          varyantlar: [
            { tip: 'basarili', anlam: 'Sipariş alınır.' },
            {
              tip: 'isKuraliHatasi', anlam: 'Belirtilen adımda uyarı beklenir.',
              alanlar: {
                adim: { etiket: 'Hatanın beklendiği adım', secenekler: [secim('urun', 'Ürün seçimi'), secim('teslimat', 'Teslimat bilgileri')] },
                mesaj: { etiket: 'Beklenen mesaj', tip: 'metin', zorunlu: true }
              }
            }
          ]
        }
      ]
    },
    urunDuzeyi: {},
    isKurallari: [{ id: 'adetGerekli', adim: 'urun', kosul: { alan: 'adet', esit: '' }, mesaj: 'Lütfen adet giriniz.', kaynak: 'fikstür' }],
    bilinmeyenler: []
  };
}

/** Başarılı taban senaryonun verisi (kitap, 2 adet, teslimat bugün+5 yerine sabit metin). */
export function tabanVerisi(tarih: string): Nesne {
  return { baslik: 'Kitap siparişi', urunAdi: 'Roman', adet: 2, kategori: 'kitap', renk: 'standart', teslimatTarihi: tarih, telefon: TELEFON };
}

/**
 * Akış tasarımcısında düzenlenebilen sürüm (onay kutusuna bağlı koşul diyagramda gösterilemez: hediye alanları yok). Adet alanı
 * sınırın yanında modelin başka anahtarlarını da taşır (birim, notlar, dogrulama) — yeniden kaydetmede korunmalı.
 */
export function akisSiparisModeli(): Nesne {
  const m = siparisModeli();
  m.id = 'siparis-akisi';
  m.ad = 'Sipariş akışı';
  const teslimat = m.adimlar[1].bolumler[0];
  teslimat.alanlar = teslimat.alanlar.filter((a: Nesne) => !a.id.startsWith('hediye'));
  Object.assign(m.adimlar[0].bolumler[0].alanlar[1], { birim: 'adet', notlar: ['fikstür notu'], dogrulama: { istemci: 'min=1 max=10' } });
  return m;
}

/** Modelin sayfa paketi (girişsiz). */
export function siparisPaketi(model: Nesne = siparisModeli()): Nesne {
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: String(model.id), ad: String(model.ad), urlYolu: '/siparis/' }, olusturan: 'birim testi', olusturulma: '2026-09-28T09:00:00Z', baglamProfilleri: [] },
    model, senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: [] },
    bilinmeyenler: []
  };
}
