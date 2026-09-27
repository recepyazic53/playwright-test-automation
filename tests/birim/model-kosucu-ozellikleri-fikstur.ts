// YEREL FİKSTÜR (spec DEĞİL) — model koşucusunun genel özellikleri için nötr, girişsiz "Başvuru (akış)" uygulaması
// (127.0.0.1) + ekran modeli ve "Onay (ortak)" ortak akış paketi. Tüm değerler SAHTEDİR; şirket/ürün adı yoktur.
//
// /basvuru-akis/ sayfası:
//   kategori (select) değişince ürün listesi AJAX ile gecikmeli gelir (bağımlı liste; değerler kod, senaryo metinle seçer) ·
//   gizli tür (display:none select; betikle değerle seçilir) · başlangıç / bitiş tarihi (modelde "bugün" / "bugün+7") ·
//   plan (select; modelde varsayılan) · sorgu tipi (tekli / çoklu; çoklu → liste dosyası) · başvuran tipi (özel / tüzel
//   radyo; tüzelde doğum tarihi gizlenir) · telefon · kimlik no (Tab → "Aranıyor…" → ad gecikmeli gelir; SORGU TELEFONU
//   SİLER, yeniden yazılmalı) · "Hesapla": kimlik yoksa TARAYICI UYARISI (alert); plan 3 → hata penceresi (#pencere) ile iş
//   kuralı; aksi halde tutar · tutardan sonra onay bölümü (ortak akış): "Onay formunu aç" → kod → "Onayla" (kod 0000 → ret
//   penceresi).
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const AKIS_YOLU = '/basvuru-akis/';
export const KIMLIK_UYARISI = 'Lütfen başvuranın kimlik numarasını giriniz.';
export const PLAN_UYARISI = 'Seçilen plan bu ürün için kullanılamaz.';
export const ONAY_RED = 'Onay reddedildi: kod geçersiz.';
export const ONAY_SONUCU = 'Onay tamamlandı.';
export const ONAY_AKIS_ANAHTARI = 'onay-ortak-akis';
export const HAVUZLAR = { ozel: 'Kişi', tuzel: 'Kurum', onay: 'Onay kodu' } as const;

const URUNLER: Record<string, Array<[string, string]>> = {
  K1: [['U11', 'Ürün A'], ['U12', 'Ürün B']],
  K2: [['U21', 'Ürün C'], ['U22', 'Ürün D']]
};

type Nesne = Record<string, unknown>;

const html = (govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Başvuru (akış)</title></head><body>${govde}</body></html>`
});
const json = (veri: unknown, gecikmeMs = 0): FiksturYaniti => ({ tur: 'application/json', govde: JSON.stringify(veri), gecikmeMs });

export class AkisUygulamasi {
  readonly hesaplamalar: Nesne[] = [];
  readonly onaylar: Nesne[] = [];
  readonly sorgular: string[] = [];
  private no = 1000;

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    if (i.yol === AKIS_YOLU || i.yol === AKIS_YOLU.slice(0, -1)) return this.sayfa();
    if (i.yol === `${AKIS_YOLU}urunler`) {
      const liste = URUNLER[i.sorgu.get('kategori') ?? ''] ?? [];
      return json(liste.map(([deger, metin]) => ({ deger, metin })), 500);
    }
    if (i.yol === `${AKIS_YOLU}sorgu`) {
      const no = i.sorgu.get('no') ?? '';
      this.sorgular.push(no);
      return json({ ad: `${i.sorgu.get('tip') === 'T' ? 'KURUM' : 'KİŞİ'} ${no.slice(-3)}` }, 600);
    }
    if (i.yol === `${AKIS_YOLU}hesapla` && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as Nesne;
      this.hesaplamalar.push(g);
      if (g.plan === '3') return json({ hata: PLAN_UYARISI }, 150);
      return json({ tutar: g.plan === '2' ? '250,00' : '125,50' }, 150);
    }
    if (i.yol === `${AKIS_YOLU}onay` && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as Nesne;
      if (g.kod === '0000') return json({ hata: ONAY_RED }, 100);
      this.onaylar.push(g);
      return json({ no: `ON-${++this.no}` }, 100);
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  private sayfa(): FiksturYaniti {
    return html(`<h1>Başvuru (akış)</h1>
      <label>Kategori <select id="kategori"><option value="">Seçiniz</option><option value="K1">Bireysel</option><option value="K2">Kurumsal</option></select></label>
      <label>Ürün <select id="urun"><option value="">Seçiniz</option></select></label>
      <select id="gizliTur" style="display:none"><option value="">Seçiniz</option><option value="10">Standart</option><option value="20">Öncelikli</option></select>
      <label>Başlangıç <input id="baslangic"></label> <label>Bitiş <input id="bitis"></label>
      <label>Plan <select id="plan"><option value="">Seçiniz</option><option value="1">Plan 1</option><option value="2">Plan 2</option><option value="3">Plan 3</option></select></label>
      <label>Sorgu tipi <select id="sorguTipi"><option value="1">Tekli</option><option value="2">Çoklu</option></select></label>
      <div id="listeKutu" hidden><label>Liste dosyası <input type="file" id="liste"></label></div>
      <fieldset><legend>Başvuran</legend>
        <label><input type="radio" name="tip" id="tip-O" value="O" checked> Özel</label>
        <label><input type="radio" name="tip" id="tip-T" value="T"> Tüzel</label></fieldset>
      <label id="dogumKutu">Doğum tarihi <input id="dogum"></label>
      <label>Telefon <input id="tel"></label>
      <label>Kimlik no <input id="kimlikNo"></label> <span id="kisiAd"></span>
      <button id="hesapla" type="button">Hesapla</button>
      <p>Tutar: <span id="tutar"></span></p>
      <div id="pencere" hidden><p id="pencere-metin"></p><button type="button" onclick="document.getElementById('pencere').hidden = true">Tamam</button></div>
      <section id="onayBolumu" hidden>
        <button id="onayAc" type="button">Onay formunu aç</button>
        <div id="onayForm" hidden><label>Onay kodu <input id="onayKodu"></label><button id="onayGonder" type="button">Onayla</button></div>
        <p id="onaySonuc"></p>
      </section>
      <script>
        const $ = (id) => document.getElementById(id);
        const pencere = (m) => { $('pencere-metin').textContent = m; $('pencere').hidden = false; };
        $('kategori').onchange = async () => {
          const u = $('urun'); u.innerHTML = '<option value="">Seçiniz</option>';
          if (!$('kategori').value) return;
          const l = await (await fetch('${AKIS_YOLU}urunler?kategori=' + $('kategori').value)).json();
          for (const o of l) u.add(new Option(o.metin, o.deger));
        };
        $('sorguTipi').onchange = () => { $('listeKutu').hidden = $('sorguTipi').value !== '2'; };
        for (const r of document.getElementsByName('tip')) r.onchange = () => { $('dogumKutu').hidden = document.querySelector('[name=tip]:checked').value === 'T'; };
        // Kimlik sorgusu: ad gecikmeli gelir; sorgu telefonu siler (sayfa kendi değerini yükler).
        $('kimlikNo').onchange = async () => {
          $('kisiAd').textContent = 'Aranıyor…';
          const tip = document.querySelector('[name=tip]:checked').value;
          const r = await (await fetch('${AKIS_YOLU}sorgu?tip=' + tip + '&no=' + encodeURIComponent($('kimlikNo').value))).json();
          $('tel').value = '';
          $('kisiAd').textContent = r.ad;
        };
        $('hesapla').onclick = async () => {
          $('pencere').hidden = true; $('tutar').textContent = '';
          if (!$('kimlikNo').value) { alert(${JSON.stringify(KIMLIK_UYARISI)}); return; }
          const tip = document.querySelector('[name=tip]:checked').value;
          const g = { kategori: $('kategori').value, urun: $('urun').value, gizliTur: $('gizliTur').value, baslangic: $('baslangic').value,
            bitis: $('bitis').value, plan: $('plan').value, sorguTipi: $('sorguTipi').value, tip,
            dogum: $('dogumKutu').hidden ? null : $('dogum').value, tel: $('tel').value, kimlikNo: $('kimlikNo').value, ad: $('kisiAd').textContent };
          const r = await (await fetch('${AKIS_YOLU}hesapla', { method: 'POST', body: JSON.stringify(g) })).json();
          if (r.hata) { pencere(r.hata); return; }
          $('tutar').textContent = r.tutar; $('onayBolumu').hidden = false;
        };
        $('onayAc').onclick = () => { setTimeout(() => { $('onayForm').hidden = false; }, 200); };
        $('onayGonder').onclick = async () => {
          const r = await (await fetch('${AKIS_YOLU}onay', { method: 'POST', body: JSON.stringify({ kod: $('onayKodu').value }) })).json();
          if (r.hata) { pencere(r.hata); return; }
          $('onaySonuc').textContent = ${JSON.stringify(ONAY_SONUCU)} + ' No: ' + r.no;
        };
      </script>`);
  }
}

const secim = (deger: string, metin: string, ek: Nesne = {}): Nesne => ({ deger, metin, ...ek });
const alan = (id: string, tip: string, etiket: string, secici: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'orta' }, zorunlu: false, ...ek
});

/** Hesaplama adımının kabul edilen uyarıları (tarayıcı uyarısı + hata penceresindeki iş kuralı). */
export const HESAPLAMA_UYARILARI = [{ metin: KIMLIK_UYARISI }, { metin: PLAN_UYARISI, secici: '#pencere' }];

/** "Başvuru (akış)" ekran modeli (şema 2, girişsiz). */
export function akisModeli(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'basvuru-akis', ad: 'Başvuru (akış)', aciklama: 'Model koşucusu özellikleri (nötr fikstür; değerler sahte).',
    ekranUrl: AKIS_YOLU, girisGerekmez: true, specDosyasi: 'tests/scenarios/basvuru-akis/basvuru-akis.spec.ts', pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (basvuru-akis)' },
    kosullar: {
      tekliSorgu: { aciklama: 'Sorgu tipi Tekli', ifade: { alan: 'sorguTipi', esit: 'tekli' } },
      cokluSorgu: { aciklama: 'Sorgu tipi Çoklu', ifade: { alan: 'sorguTipi', esit: 'coklu' } }
    },
    adimlar: [
      {
        id: 'bilgiler', sira: 1, baslik: 'Başvuru bilgileri girilir',
        bolumler: [{ id: 'temel', baslik: 'Temel bilgiler', alanlar: [
          alan('kategori', 'secim', 'Kategori', '#kategori', { zorunlu: true, seceneklerDurumu: 'tam', secenekler: [secim('K1', 'Bireysel'), secim('K2', 'Kurumsal')] }),
          // Bağımlı liste: seçenekler kategoriye göre (değerler sayfada kod; senaryo ürün ADINI yazar).
          alan('urun', 'secim', 'Ürün', '#urun', {
            zorunlu: true, seceneklerDurumu: 'tam', secenekler: null,
            bagimlilik: { alan: 'kategori', secenekHaritasi: { K1: [secim('Ürün A', 'Ürün A'), secim('Ürün B', 'Ürün B')], K2: [secim('Ürün C', 'Ürün C'), secim('Ürün D', 'Ürün D')] } }
          }),
          alan('gizliTur', 'secim', 'Tür', '#gizliTur', { doldurucu: 'degerJs', seceneklerDurumu: 'bilinmiyor', secenekler: null }),
          { ...alan('baslangic', 'tarih', 'Başlangıç', '#baslangic', { doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy' }), yapilandirma: 'turetilmis', sabitDeger: 'bugun', eslesme: {} },
          { ...alan('bitis', 'tarih', 'Bitiş', '#bitis', { doldurucu: 'tarihJs', bicim: 'gg.aa.yyyy' }), yapilandirma: 'turetilmis', sabitDeger: 'bugun+7', eslesme: {} },
          alan('plan', 'secim', 'Plan', '#plan', {
            doldurucu: 'secimGerekirse', seceneklerDurumu: 'tam', secenekler: [secim('1', 'Plan 1'), secim('2', 'Plan 2'), secim('3', 'Plan 3')], varsayilan: { deger: '1' }
          }),
          alan('sorguTipi', 'secim', 'Sorgu tipi', '#sorguTipi', {
            doldurucu: 'secimGerekirse', seceneklerDurumu: 'tam', varsayilan: { deger: 'tekli' },
            secenekler: [secim('1', 'Tekli', { senaryoDegeri: 'tekli', formMetni: 'Tekli' }), secim('2', 'Çoklu', { senaryoDegeri: 'coklu', formMetni: 'Çoklu' })]
          }),
          alan('listeDosyasi', 'dosya', 'Liste dosyası', '#liste', { kabul: '.xlsx', gorunurluk: { kosul: 'cokluSorgu' }, varsayilan: { deger: 'liste.xlsx' } })
        ] }]
      },
      {
        id: 'basvuran', sira: 2, baslik: 'Başvuran bilgileri girilir', gorunurluk: { kosul: 'tekliSorgu' },
        bolumler: [{ id: 'basvuranBolumu', baslik: 'Başvuran', alanlar: [
          alan('musteriTipi', 'radyo', 'Başvuran tipi', '#tip-O', {
            etiket: { ekran: null, form: 'Başvuran tipi' }, varsayilan: { deger: 'ozel' }, seceneklerDurumu: 'tam',
            secenekler: [secim('O', 'Özel', { senaryoDegeri: 'ozel', formMetni: 'Özel', secici: '#tip-O' }), secim('T', 'Tüzel', { senaryoDegeri: 'tuzel', formMetni: 'Tüzel', secici: '#tip-T' })]
          }),
          {
            id: 'basvuranKimlik', tip: 'kimlikProfili', kimlikTuru: { ozel: 'ozel', tuzel: 'tuzel' }, bagimlilik: { alan: 'musteriTipi' },
            etiket: { ekran: null, form: 'Başvuran kimliği' }, zorunlu: false, yapilandirma: 'senaryo', varsayilan: { deger: 'k1' },
            eslesme: { senaryo: ['basvuranOzelKimligi', 'basvuranTuzelKimligi', 'basvuranProfili'], profilHavuzu: { ozel: HAVUZLAR.ozel, tuzel: HAVUZLAR.tuzel } },
            altAlanlar: [
              { id: 'basvuranTelefon', tip: 'telefon', sira: 1, etiket: { ekran: 'Telefon' }, eslesme: { kimlikAlani: 'cepTelefonu' }, konum: { secici: '#tel', kirilganlik: 'orta' }, doldurucu: 'telefonTuslama' },
              // Tüzelde doğum tarihi yok (türde karşılığı olmayan alt alan atlanır).
              { id: 'basvuranDogum', tip: 'tarih', bicim: 'gg.aa.yyyy', sira: 2, etiket: { ekran: 'Doğum tarihi' }, eslesme: { kimlikAlani: { ozel: 'dogumTarihi' } }, konum: { secici: '#dogum', kirilganlik: 'orta' }, doldurucu: 'tarihJs' },
              {
                id: 'basvuranKimlikNo', tip: 'metin', sira: 3, etiket: { ekran: 'Kimlik no' }, eslesme: { kimlikAlani: { ozel: 'kimlikNo', tuzel: 'vergiNo' } },
                konum: { secici: '#kimlikNo', kirilganlik: 'orta' }, doldurucu: 'tuslayarakYaz',
                doldurucuParametreleri: { tus: 'Tab', bekle: { secici: '#kisiAd', durum: 'dolu', zamanAsimiSn: 20, icermez: 'Aranıyor' } }
              },
              // Sorgu telefonu siler: yeniden yazılır.
              { id: 'basvuranTelefonTekrar', tip: 'telefon', sira: 4, etiket: { ekran: 'Telefon (sorgudan sonra)' }, eslesme: { kimlikAlani: 'cepTelefonu' }, konum: { secici: '#tel', kirilganlik: 'orta' }, doldurucu: 'telefonTuslama' }
            ]
          }
        ] }]
      },
      {
        id: 'hesaplama', sira: 3, baslik: 'Tutar hesaplanır',
        bolumler: [{ id: 'islemler', baslik: 'İşlemler', alanlar: [
          { id: 'hesaplaDugmesi', tip: 'buton', etiket: { ekran: 'Hesapla' }, yapilandirma: 'aksiyon', konum: { secici: '#hesapla', kirilganlik: 'orta' } },
          { id: 'tutar', tip: 'cikti', etiket: { ekran: 'Tutar' }, yapilandirma: 'cikti', konum: { secici: '#tutar', kirilganlik: 'orta' } }
        ] }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#hesapla', aciklama: 'Hesapla' }],
          uyarilar: HESAPLAMA_UYARILARI.map((u) => ({ ...u })),
          basariGostergesi: { tur: 'desen', deger: '[1-9]', secici: '#tutar' },
          hataGostergesi: { secici: '#pencere' },
          zamanAsimiSn: 20
        }
      }
    ],
    senaryoDuzeyi: {
      alanlar: [
        { id: 'baslik', tip: 'metin', etiket: { ekran: null, form: 'Başlık' }, zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } },
        {
          id: 'beklenenSonuc', tip: 'birlesim', etiket: { ekran: null, form: 'Beklenen sonuç' }, zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'beklenenSonuc' },
          varyantlar: [
            { tip: 'basarili', anlam: 'Tutar sıfırdan farklı hesaplanır.' },
            {
              tip: 'isKuraliHatasi', anlam: 'Belirtilen adımda belirtilen uyarı beklenir.',
              alanlar: {
                adim: { etiket: 'Hatanın beklendiği adım', secenekler: [{ deger: 'hesaplama', metin: 'Tutar hesaplama' }] },
                mesaj: { etiket: 'Beklenen mesaj', tip: 'metin', zorunlu: true }
              }
            }
          ]
        }
      ]
    },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** Ekran modelinin sayfa paketi (girişsiz). anahtar/ad: aynı modelden ikinci ekran için. */
export function akisPaketi(s: { anahtar?: string; ad?: string } = {}): Nesne & { model: Nesne } {
  const model = akisModeli();
  if (s.anahtar) model.id = s.anahtar;
  if (s.ad) model.ad = s.ad;
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: {
      ekran: { anahtar: s.anahtar ?? 'basvuru-akis', ad: s.ad ?? 'Başvuru (akış)', urlYolu: AKIS_YOLU },
      olusturan: 'test', olusturulma: '2026-09-27T09:00:00Z', baglamProfilleri: [], not: 'Nötr fikstür; değerler sahte.'
    },
    model, senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] },
    bilinmeyenler: []
  };
}

/** "Onay (ortak)" ortak akış paketi: yalnızca test ortamında koşar; kod "Onay kodu" profilinden (varsayılan "ortak"). */
export function onayAkisPaketi(): Nesne & { model: Nesne } {
  const model = {
    semaSurumu: 2, tur: 'ortakAkis', id: ONAY_AKIS_ANAHTARI, ad: 'Onay (ortak)', aciklama: 'Onay formu + onay kodu (nötr fikstür).',
    yalnizTestOrtami: true, kosullar: {},
    adimlar: [
      {
        id: 'onayAc', sira: 1, baslik: 'Onay formu açılır',
        bolumler: [{ id: 'onayAcIslemleri', baslik: 'İşlemler', alanlar: [
          { id: 'onayAcDugmesi', tip: 'buton', etiket: { ekran: 'Onay formunu aç' }, yapilandirma: 'aksiyon', konum: { secici: '#onayAc', kirilganlik: 'orta' } }
        ] }],
        kosu: {
          aksiyonlar: [{ tur: 'bekle', sureSn: 1 }, { tur: 'tikla', secici: '#onayAc', aciklama: 'Onay formunu aç' }],
          basariGostergesi: { tur: 'eleman', deger: '#onayKodu' }, hataGostergesi: { secici: '#pencere' }, zamanAsimiSn: 10
        }
      },
      {
        id: 'onayla', sira: 2, baslik: 'Onay kodu girilir, onaylanır',
        bolumler: [
          { id: 'kod', baslik: 'Onay kodu', alanlar: [{
            id: 'onayKimligi', tip: 'kimlikProfili', kimlikTuru: 'onay', etiket: { ekran: null, form: 'Onay kodu' }, zorunlu: false, yapilandirma: 'senaryo',
            eslesme: { senaryo: ['onayKodu', 'onayKoduProfili'], profilHavuzu: HAVUZLAR.onay }, varsayilan: { deger: 'ortak' },
            altAlanlar: [{ id: 'onayKoduAlani', tip: 'metin', sira: 1, etiket: { ekran: 'Onay kodu' }, eslesme: { kimlikAlani: 'kod' }, konum: { secici: '#onayKodu', kirilganlik: 'dusuk' } }]
          }] },
          { id: 'onayIslemleri', baslik: 'İşlemler', alanlar: [
            { id: 'onayGonderDugmesi', tip: 'buton', etiket: { ekran: 'Onayla' }, yapilandirma: 'aksiyon', konum: { secici: '#onayGonder', kirilganlik: 'orta' } },
            // Başarı mesajının öğesi (diyagram, seçicili metin göstergesini bu çıktı alanıyla tutar).
            { id: 'sonucMesaji', tip: 'cikti', etiket: { ekran: ONAY_SONUCU }, yapilandirma: 'cikti', konum: { secici: '#onaySonuc', kirilganlik: 'orta' } }
          ] }
        ],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#onayGonder', aciklama: 'Onayla' }],
          basariGostergesi: { tur: 'metin', deger: ONAY_SONUCU, secici: '#onaySonuc' }, hataGostergesi: { secici: '#pencere' }, zamanAsimiSn: 60
        }
      }
    ],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar: ONAY_AKIS_ANAHTARI, ad: 'Onay (ortak)' }, olusturan: 'test', olusturulma: '2026-09-27T09:00:00Z', baglamProfilleri: [], not: 'Ortak akış (nötr fikstür).' },
    model, senaryoOnerileri: [],
    gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [HAVUZLAR.onay] },
    bilinmeyenler: []
  };
}
