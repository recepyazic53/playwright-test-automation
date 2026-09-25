// MODEL KOŞUCUSU TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). Hiçbir test gerçek bir siteye bağlanmaz: uygulama
// 127.0.0.1'de geçici bir http sunucusunda (giris-fikstur.ts > yerelSunucu) çalışır; tüm değerler SAHTEDİR.
//
// ÖrnekBaşvuru uygulaması — çok adımlı bir başvuru ekranı:
//   /giris        kullanıcı adı + parola (hatalıysa "Kullanıcı adı veya parola hatalı")
//   /dogrulama    TOTP varyantı: authenticator kodu (giriş profilindeki anahtardan); totp kapalıysa atlanır
//   /panel        "Şube: <kod>" (bağlam) — /sube'den şube değiştirilir (bağlam profili: { subeKodu })
//   /basvuru/     form: ürün (select), ad soyad, başlangıç tarihi, kapsam (ok düğmeli özel seçici; uçlarda
//                 durur), ödeme (radyo), kampanya (onay kutusu), İNDİRİM ORANI (yalnızca "Yetkili" şubede S02
//                 görünür), belge (dosya) · "Hesapla" → prim ya da iş kuralı uyarısı · isteğe bağlı "Onayla"
//   /acik-teklif/ GİRİŞ GEREKTİRMEYEN iki adımlı form (akış kaydı testleri): ad soyad, müşteri tipi (radyo: Bireysel →
//                 TC kimlik no, Kurumsal → Vergi kimlik no görünür) ve "Ek sürücü ekle" düğmesiyle AÇILAN ek sürücü alanı ·
//                 "Devam" → teminat (select; "Geniş" seçilince "Cam kırılması" kutusu görünür) · "Teklifi kaydet" → "Teklif
//                 oluşturuldu. No: TK-<n>"
// Uygulama gelen her hesaplama/onay/teklif isteğini kaydeder (testler alanların gerçekten gönderildiğini doğrular).
import { totpKoduUret } from '../support/totp';
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const ORNEK_KULLANICI = 'ornek.kullanici';
export const ORNEK_PAROLA = 'Ornek-Model-Parolasi-1';
/** RFC 6238 örnek anahtarı (sahte). */
export const ORNEK_TOTP_ANAHTARI = 'JBSWY3DPEHPK3PXP';
/** Uygulamadaki iş kuralı mesajı (kıvrık tırnaklı; senaryo düz tırnak/küçük harfle bekler — toleranslı eşleşme). */
export const IS_KURALI_MESAJI = 'Türkiye kapsamında “Taksitli” ödeme seçilemez.';
export const SUBELER: Record<string, string> = { S01: 'Merkez Şube', S02: 'Yetkili Şube' };
const KAPSAMLAR = ['DÜNYA', 'AVRUPA', 'TÜRKİYE'];

export type Hesaplama = Record<string, unknown> & { sube: string };

const html = (baslik: string, govde: string, basliklar: Record<string, string> = {}): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0}.uyari{color:#b00}#kapsam-kutu{display:flex;gap:8px;align-items:center}</style>
</head><body>${govde}</body></html>`,
  basliklar
});
const json = (veri: unknown, durum = 200): FiksturYaniti => ({ durum, tur: 'application/json', govde: JSON.stringify(veri) });
/** Yönlendirme sayfa içi betikle (3xx yerine; giris-fikstur.ts ile aynı gerekçe). */
const yonlendir = (adres: string, basliklar: Record<string, string> = {}): FiksturYaniti =>
  html('Yönlendiriliyor', `<script>location.replace(${JSON.stringify(adres)});</script>`, basliklar);

export class OrnekBasvuruUygulamasi {
  readonly hesaplamalar: Hesaplama[] = [];
  readonly onaylar: string[] = [];
  /** /acik-teklif/ kayıtları (girişsiz sayfa). */
  readonly acikTeklifler: Array<Record<string, unknown>> = [];
  readonly olaylar: string[] = [];
  private noSayaci = 1000;
  private readonly ayar: { totp: boolean };

  constructor(ayar: { totp: boolean }) {
    this.ayar = ayar;
  }

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    const yol = i.yol;
    this.olaylar.push(`${i.yontem} ${yol}`);
    const oturum = i.cerezler.oturum === 'acik';
    const sube = i.cerezler.sube && SUBELER[i.cerezler.sube] ? i.cerezler.sube : 'S01';
    if (yol === '/' || yol === '/giris') {
      if (i.yontem === 'POST') {
        const f = new URLSearchParams(i.govde);
        if (f.get('kullanici') !== ORNEK_KULLANICI || f.get('parola') !== ORNEK_PAROLA) {
          return html('Giriş', '<p class="uyari" role="alert">Kullanıcı adı veya parola hatalı</p><a href="/giris">Geri</a>');
        }
        if (!this.ayar.totp) return yonlendir('/panel', { 'set-cookie': 'oturum=acik; Path=/; HttpOnly' });
        return yonlendir('/dogrulama', { 'set-cookie': 'onay=bekliyor; Path=/; HttpOnly' });
      }
      if (oturum) return yonlendir('/panel');
      return html('Giriş', `<h1>Örnek Başvuru — Giriş</h1><form method="post" action="/giris">
        <label>Kullanıcı adı <input id="kullanici" name="kullanici" autocomplete="username"></label>
        <label>Parola <input id="parola" name="parola" type="password" autocomplete="current-password"></label>
        <button id="gir" type="submit">Giriş yap</button></form>`);
    }
    if (yol === '/dogrulama') {
      if (i.cerezler.onay !== 'bekliyor') return yonlendir('/giris');
      if (i.yontem === 'POST') {
        const kod = new URLSearchParams(i.govde).get('kod') ?? '';
        const simdi = Date.now();
        const gecerli = [simdi - 30_000, simdi, simdi + 30_000].map((z) => totpKoduUret(ORNEK_TOTP_ANAHTARI, z));
        if (!gecerli.includes(kod)) return html('Doğrulama', '<p class="uyari" role="alert">Doğrulama kodu hatalı</p>');
        return yonlendir('/panel', { 'set-cookie': 'oturum=acik; Path=/; HttpOnly' });
      }
      return html('Doğrulama', `<form method="post" action="/dogrulama"><label>Doğrulama kodu
        <input id="kod" name="kod" inputmode="numeric" autocomplete="one-time-code"></label><button id="dogrula" type="submit">Doğrula</button></form>`);
    }
    // Girişsiz sayfa (oturum gerekmez).
    if (yol === '/acik-teklif' || yol === '/acik-teklif/') return this.acikTeklifSayfasi();
    if (yol === '/acik-teklif/kaydet' && i.yontem === 'POST') {
      this.acikTeklifler.push(JSON.parse(i.govde || '{}') as Record<string, unknown>);
      return json({ no: `TK-${++this.noSayaci}` });
    }
    if (!oturum) return yonlendir('/giris');
    if (yol === '/panel') {
      return html('Panel', `<nav><a href="/sube">Şube değiştir</a> · <a href="/basvuru/">Başvuru</a></nav>
        <h1>Hoş geldiniz</h1><p id="aktif-sube">Şube: ${sube} (${SUBELER[sube]})</p>`);
    }
    if (yol === '/sube') {
      if (i.yontem === 'POST') {
        const kod = new URLSearchParams(i.govde).get('sube') ?? '';
        if (!SUBELER[kod]) return html('Şube', '<p class="uyari">Şube bulunamadı</p>');
        return yonlendir('/panel', { 'set-cookie': `sube=${kod}; Path=/` });
      }
      return html('Şube', `<form method="post" action="/sube"><label>Şube <select id="sube" name="sube">
        ${Object.entries(SUBELER).map(([k, a]) => `<option value="${k}"${k === sube ? ' selected' : ''}>${a}</option>`).join('')}
        </select></label><button id="sube-uygula" type="submit">Uygula</button></form>`);
    }
    if (yol === '/basvuru' || yol === '/basvuru/') return this.basvuruSayfasi(sube);
    if (yol === '/basvuru/hesapla' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as Record<string, unknown>;
      this.hesaplamalar.push({ ...g, sube });
      if (!g.urun || !g.adSoyad) return json({ hata: 'Ürün ve ad soyad zorunludur.' });
      if (g.kapsam === 'TÜRKİYE' && g.odeme === 'taksit') return json({ hata: IS_KURALI_MESAJI });
      const taban = g.urun === 'B' ? 2400 : 1200;
      const indirim = Number(g.indirim || 0);
      return json({ prim: (taban * (1 - indirim / 100) * (g.kampanya ? 0.9 : 1)).toFixed(2) });
    }
    if (yol === '/basvuru/onayla' && i.yontem === 'POST') {
      const no = String(++this.noSayaci);
      this.onaylar.push(no);
      return json({ no });
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  private acikTeklifSayfasi(): FiksturYaniti {
    return html('Açık teklif', `<h1>Açık teklif</h1>
      <section id="adim-musteri">
        <label>Ad Soyad <input id="musteriAd"></label>
        <fieldset><legend>Müşteri tipi</legend>
          <label><input type="radio" name="tip" value="bireysel" checked> Bireysel</label>
          <label><input type="radio" name="tip" value="kurumsal"> Kurumsal</label></fieldset>
        <div id="bireyselAlanlar"><label>TC kimlik no <input id="tcKimlik"></label></div>
        <div id="kurumsalAlanlar" hidden><label>Vergi kimlik no <input id="vergiNo"></label></div>
        <button id="ekSurucuEkle" type="button">Ek sürücü ekle</button>
        <div id="ekSurucu" hidden><label>Ek sürücü adı <input id="ekSurucuAd"></label></div>
        <button id="devam" type="button">Devam</button>
      </section>
      <section id="adim-teminat" hidden>
        <label>Teminat <select id="teminat"><option value="">Seçiniz</option><option value="dar">Dar</option><option value="genis">Geniş</option></select></label>
        <div id="ekTeminatKutu" hidden><label><input type="checkbox" id="ekTeminat"> Cam kırılması</label></div>
        <button id="kaydet" type="button">Teklifi kaydet</button>
        <p id="teklif-sonuc"></p>
      </section>
      <script>
        document.getElementById('ekSurucuEkle').onclick = () => { document.getElementById('ekSurucu').hidden = false; };
        document.querySelectorAll('input[name=tip]').forEach((r) => r.addEventListener('change', () => {
          const kurumsal = document.querySelector('input[name=tip]:checked').value === 'kurumsal';
          document.getElementById('bireyselAlanlar').hidden = kurumsal; document.getElementById('kurumsalAlanlar').hidden = !kurumsal;
        }));
        document.getElementById('teminat').onchange = () => { document.getElementById('ekTeminatKutu').hidden = document.getElementById('teminat').value !== 'genis'; };
        document.getElementById('devam').onclick = () => {
          document.getElementById('adim-musteri').hidden = true; document.getElementById('adim-teminat').hidden = false;
        };
        document.getElementById('kaydet').onclick = async () => {
          const ek = document.getElementById('ekSurucu');
          const gorunurse = (kutu, id, oz) => (document.getElementById(kutu).hidden ? null : document.getElementById(id)[oz]);
          const govde = { musteriAd: document.getElementById('musteriAd').value, tip: document.querySelector('input[name=tip]:checked').value,
            tcKimlik: gorunurse('bireyselAlanlar', 'tcKimlik', 'value'), vergiNo: gorunurse('kurumsalAlanlar', 'vergiNo', 'value'),
            ekSurucuAd: ek.hidden ? null : document.getElementById('ekSurucuAd').value, teminat: document.getElementById('teminat').value,
            ekTeminat: gorunurse('ekTeminatKutu', 'ekTeminat', 'checked') };
          const r = await (await fetch('/acik-teklif/kaydet', { method: 'POST', body: JSON.stringify(govde) })).json();
          document.getElementById('teklif-sonuc').textContent = 'Teklif oluşturuldu. No: ' + r.no;
        };
      </script>`);
  }

  private basvuruSayfasi(sube: string): FiksturYaniti {
    const yetkili = sube === 'S02';
    return html('Başvuru', `<h1>Başvuru</h1><p>Şube: ${sube}</p>
      <section id="adim-bilgiler">
        <label>Ürün <select id="urun"><option value="">Seçiniz</option><option value="A">Temel</option><option value="B">Geniş</option></select></label>
        <label>Ad Soyad <input id="adSoyad"></label>
        <label>Başlangıç tarihi <input id="baslangic" type="date"></label>
        <div id="kapsam-kutu">Kapsam: <button id="kapsam-geri" type="button" aria-label="Önceki kapsam">‹</button>
          <span id="kapsam-deger">AVRUPA</span><button id="kapsam-ileri" type="button" aria-label="Sonraki kapsam">›</button></div>
        <fieldset><legend>Ödeme</legend>
          <label><input type="radio" name="odeme" value="pesin" checked> Peşin</label>
          <label><input type="radio" name="odeme" value="taksit"> Taksitli</label></fieldset>
        <label><input type="checkbox" id="kampanya"> Kampanya</label>
        ${yetkili ? '<label>İndirim oranı (%) <input id="indirim"></label>' : ''}
        <label>Belge <input type="file" id="belge"></label>
        <button id="hesapla" type="button">Hesapla</button>
        <p id="uyari" class="uyari" role="alert" hidden></p>
        <p id="sonuc" hidden></p>
      </section>
      <section id="adim-onay" hidden><button id="onayla" type="button">Onayla</button><p id="onay-sonuc"></p></section>
      <script>
        const K = ${JSON.stringify(KAPSAMLAR)};
        let k = 1;
        const d = document.getElementById('kapsam-deger');
        // Uçlarda durur (halka değil): ileri TÜRKİYE'de, geri DÜNYA'da değişmez.
        document.getElementById('kapsam-ileri').onclick = () => { if (k < K.length - 1) { k++; setTimeout(() => { d.textContent = K[k]; }, 80); } };
        document.getElementById('kapsam-geri').onclick = () => { if (k > 0) { k--; setTimeout(() => { d.textContent = K[k]; }, 80); } };
        document.getElementById('hesapla').onclick = async () => {
          const uyari = document.getElementById('uyari'); const sonuc = document.getElementById('sonuc');
          uyari.hidden = true; sonuc.hidden = true;
          const belge = document.getElementById('belge').files[0];
          const govde = { urun: document.getElementById('urun').value, adSoyad: document.getElementById('adSoyad').value,
            baslangic: document.getElementById('baslangic').value, kapsam: d.textContent,
            odeme: document.querySelector('input[name=odeme]:checked').value, kampanya: document.getElementById('kampanya').checked,
            indirim: document.getElementById('indirim') ? document.getElementById('indirim').value : null,
            belge: belge ? belge.name + ':' + belge.size : null };
          const r = await (await fetch('/basvuru/hesapla', { method: 'POST', body: JSON.stringify(govde) })).json();
          await new Promise((c) => setTimeout(c, 150));
          if (r.hata) { uyari.textContent = r.hata; uyari.hidden = false; return; }
          sonuc.textContent = 'Prim: ' + r.prim + ' TL'; sonuc.hidden = false;
          document.getElementById('adim-onay').hidden = false;
        };
        document.getElementById('onayla').onclick = async () => {
          const r = await (await fetch('/basvuru/onayla', { method: 'POST' })).json();
          document.getElementById('onay-sonuc').textContent = 'Başvuru onaylandı. No: ' + r.no;
        };
      </script>`);
  }
}

/** Uygulamanın giriş tarifi (gizli değer yok; kullanıcı/parola/TOTP giriş profilinde). Bağlam: şube. */
export function ornekGirisTarifi(): Record<string, unknown> {
  return {
    girisAdresi: '/giris', oturumKontrolAdresi: '/panel',
    kullaniciAlani: '#kullanici', parolaAlani: '#parola', gonderDugmesi: '#gir',
    basariGostergesi: { tur: 'metin', deger: 'Hoş geldiniz' },
    hataGostergeleri: [{ tur: 'metin', deger: 'Kullanıcı adı veya parola hatalı' }],
    ikinciAdim: { tur: 'totp', kodAlani: '#kod', gonderDugmesi: '#dogrula', hataGostergeleri: [{ tur: 'metin', deger: 'Doğrulama kodu hatalı' }] },
    zamanAsimiSn: 20,
    baglamDegistirme: {
      baglamTuru: 'Şube',
      adimlar: [
        { islem: 'git', adres: '/sube' },
        { islem: 'sec', hedef: { secici: '#sube' }, deger: '{subeKodu}' },
        { islem: 'tikla', hedef: { secici: '#sube-uygula' }, adresBekle: '/panel' },
        { islem: 'metinBekle', hedef: { secici: '#aktif-sube' }, metin: 'Şube: {subeKodu}' }
      ]
    }
  };
}

const alan = (id: string, tip: string, etiket: string, secici: string, ek: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici, kirilganlik: 'dusuk' }, ...ek
});

/** Ekran modeli (şema sürümü 2: adım koşu tanımları + ok düğmeli kapsam seçicisi). */
export function ornekBasvuruModeli(): Record<string, unknown> {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'ornek-basvuru', ad: 'Örnek Başvuru',
    aciklama: 'Çok adımlı örnek başvuru ekranı (model koşucusu fikstürü; değerler sahte).',
    ekranUrl: '/basvuru/', specDosyasi: 'tests/scenarios/ornek-basvuru/basvuru.spec.ts', pageObject: 'yok (model koşucusu)',
    veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (ornek-basvuru)' },
    kosullar: { onayDahil: { aciklama: 'onay adımı dahil', ifade: { senaryoAyari: 'onayAdimiDahil', esit: true } } },
    adimlar: [
      {
        id: 'bilgiler', sira: 1, baslik: 'Başvuru bilgileri girilir',
        bolumler: [{
          id: 'temel', baslik: 'Temel bilgiler', alanlar: [
            alan('urun', 'secim', 'Ürün', '#urun', { secenekler: [{ deger: 'A', metin: 'Temel' }, { deger: 'B', metin: 'Geniş' }], seceneklerDurumu: 'tam', zorunlu: true }),
            alan('adSoyad', 'metin', 'Ad Soyad', '#adSoyad', { zorunlu: true }),
            alan('baslangic', 'tarih', 'Başlangıç tarihi', '#baslangic', { bicim: 'YYYY-AA-GG' }),
            {
              ...alan('kapsam', 'okluSecim', 'Kapsam', '#kapsam-deger', { zorunlu: true }),
              secenekler: [{ deger: 'DÜNYA', metin: 'DÜNYA' }, { deger: 'AVRUPA', metin: 'AVRUPA' }, { deger: 'TÜRKİYE', metin: 'TÜRKİYE' }],
              seceneklerDurumu: 'tam', doldurucu: 'okluSecim', doldurucuParametreleri: { maksDeneme: 5 },
              konum: { secici: '#kapsam-deger', yardimci: { ileri: '#kapsam-ileri', geri: '#kapsam-geri' }, kirilganlik: 'orta', not: 'Uçlarda durur.' }
            },
            alan('odemeTipi', 'radyo', 'Ödeme', 'input[name="odeme"]', { secenekler: [{ deger: 'pesin', metin: 'Peşin' }, { deger: 'taksit', metin: 'Taksitli' }], seceneklerDurumu: 'tam' }),
            alan('kampanya', 'onayKutusu', 'Kampanya', '#kampanya'),
            alan('indirimOrani', 'metin', 'İndirim oranı', '#indirim', { zorunlu: false }),
            alan('belge', 'dosya', 'Belge', '#belge', { kabul: '.txt' })
          ]
        }]
      },
      {
        id: 'hesaplama', sira: 2, baslik: 'Prim hesaplanır',
        bolumler: [{ id: 'sonuc', baslik: 'Sonuç', alanlar: [{ id: 'prim', tip: 'cikti', yapilandirma: 'cikti', konum: { secici: '#sonuc', kirilganlik: 'dusuk' } }] }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#hesapla', aciklama: 'Hesapla' }],
          basariGostergesi: { tur: 'metin', deger: 'Prim:', secici: '#sonuc' },
          hataGostergesi: { secici: '#uyari' },
          zamanAsimiSn: 15
        }
      },
      {
        id: 'onay', sira: 3, baslik: 'Başvuru onaylanır', gorunurluk: { kosul: 'onayDahil' },
        bolumler: [{ id: 'onaySonucu', baslik: 'Onay', alanlar: [{ id: 'onayNo', tip: 'cikti', yapilandirma: 'cikti', konum: { secici: '#onay-sonuc', kirilganlik: 'dusuk' } }] }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#onayla' }],
          basariGostergesi: { tur: 'metin', deger: 'Başvuru onaylandı', secici: '#onay-sonuc' },
          hataGostergesi: { secici: '#uyari' },
          zamanAsimiSn: 15
        }
      }
    ],
    senaryoDuzeyi: {
      aciklama: 'Ekran alanı olmayan ayarlar.',
      alanlar: [
        { id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } },
        {
          id: 'subeProfili', tip: 'secim', etiket: { ekran: null, form: 'Şube' }, zorunlu: false, yapilandirma: 'senaryo',
          eslesme: { senaryo: 'subeProfili', profilHavuzu: 'Şube' }, varsayilan: { deger: 'Merkez' }
        },
        { id: 'onayAdimiDahil', tip: 'onayKutusu', etiket: { ekran: null, form: 'Onay adımını dahil et' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'onayAdimiDahil' } },
        {
          id: 'beklenenSonuc', tip: 'birlesim', zorunlu: false, yapilandirma: 'senaryo', eslesme: { senaryo: 'beklenenSonuc' },
          varyantlar: [
            { tip: 'basarili', anlam: 'Kapsamdaki son adımın başarı göstergesi görünür.' },
            {
              tip: 'isKuraliHatasi', anlam: 'Belirtilen adımda belirtilen mesaj beklenir.',
              alanlar: {
                adim: { etiket: 'Hatanın Beklendiği Adım', secenekler: [{ deger: 'hesaplama', metin: 'Prim hesaplama' }, { deger: 'onay', metin: 'Onay', kosul: 'onayDahil' }] },
                mesaj: { etiket: 'Beklenen Mesaj', tip: 'metin', zorunlu: true }
              }
            }
          ]
        }
      ]
    },
    urunDuzeyi: {},
    isKurallari: [{
      id: 'turkiyeTaksit', adim: 'hesaplama', kosul: { ve: [{ alan: 'kapsam', esit: 'TÜRKİYE' }, { alan: 'odemeTipi', esit: 'taksit' }] },
      mesaj: IS_KURALI_MESAJI, kaynak: 'fikstür'
    }],
    bilinmeyenler: [],
    baglamGorunurlugu: { profiller: ['Merkez', 'Yetkili'], alanlar: { indirimOrani: { Merkez: false, Yetkili: true } }, kaynak: 'iki profille yalnızca okuma' }
  };
}

const ORTAK_VERI = { urun: 'A', adSoyad: 'Deneme Kişi', baslangic: '2026-10-01', kampanya: true };

/** Sayfa paketi (sürüm 1) — model + beş senaryo önerisi. */
export function ornekBasvuruPaketi(): Record<string, unknown> {
  const oneri = (baslik: string, veri: Record<string, unknown>, adimKapsami: string[], tur: 'basari' | 'hata', gerekce: string): Record<string, unknown> => ({
    baslik, veri: { baslik, ...veri, onayAdimiDahil: adimKapsami.includes('onay') }, adimKapsami, beklenenSonuc: { tur, aciklama: gerekce }, gerekce
  });
  return {
    tur: 'sayfa-paketi', surum: 1,
    meta: {
      proje: 'Örnek', ekran: { anahtar: 'ornek-basvuru', ad: 'Örnek Başvuru', urlYolu: '/basvuru/' }, olusturan: 'Claude Code',
      olusturulma: '2026-09-25T09:00:00Z', baglamProfilleri: ['Merkez', 'Yetkili'], not: 'Fikstür; değerler sahte.'
    },
    model: ornekBasvuruModeli(),
    senaryoOnerileri: [
      oneri('Yetkili / Dünya / peşin / onaylı', { ...ORTAK_VERI, subeProfili: 'Yetkili', kapsam: 'DÜNYA', odemeTipi: 'pesin', indirimOrani: '10', belge: 'ornek-belge.txt' },
        ['onay'], 'basari', 'Ana akış: tüm alanlar, ok düğmeli kapsam, dosya ve isteğe bağlı onay adımı.'),
      oneri('Merkez / Türkiye taksitli → iş kuralı', { ...ORTAK_VERI, subeProfili: 'Merkez', kapsam: 'TÜRKİYE', odemeTipi: 'taksit',
        beklenenSonuc: { tip: 'isKuraliHatasi', adim: 'hesaplama', mesaj: 'türkiye kapsamında "taksitli" ödeme seçilemez' } }, [], 'hata', 'İş kuralı uyarısı beklenir (toleranslı eşleşme).'),
      oneri('Merkez / indirim alanı atlanır', { ...ORTAK_VERI, urun: 'B', subeProfili: 'Merkez', kapsam: 'AVRUPA', odemeTipi: 'taksit', indirimOrani: '15' },
        [], 'basari', 'İndirim alanı Merkez şubesinde görünmez: atlanır ve kaydedilir.'),
      oneri('Merkez / indirim mutlaka görünmeli', { ...ORTAK_VERI, subeProfili: 'Merkez', kapsam: 'AVRUPA', odemeTipi: 'pesin', indirimOrani: '5' },
        [], 'basari', '"Mutlaka görünmeli" işaretlenince görünmeyen alan testi düşürür.'),
      oneri('Yetkili / onay adımı hariç', { ...ORTAK_VERI, subeProfili: 'Yetkili', kapsam: 'AVRUPA', odemeTipi: 'pesin', indirimOrani: '20' },
        [], 'basari', 'İsteğe bağlı onay adımı koşulmaz; prim hesaplanınca biter.')
    ],
    gerekenAyarlar: { girisGerekli: true, ikiAsamaliDogrulama: 'totp', captchaGoruldu: false, testVerisiTurleri: [], baglamTurleri: ['Şube'] },
    bilinmeyenler: []
  };
}
