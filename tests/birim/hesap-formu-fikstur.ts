// "SAYFADA SEÇ" VE GENİŞLETİLMİŞ KEŞİF TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). Uygulama 127.0.0.1'de geçici bir http
// sunucusunda (giris-fikstur.ts > yerelSunucu) çalışır; tüm değerler SAHTEDİR, hiçbir dış siteye bağlanılmaz.
//
//   /giris      kullanıcı adı + parola (POST form, çerez)
//   /panel      "Hoş geldiniz"
//   /hesap/     fiyat hesaplama formu:
//                 Müşteri tipi (radyo: Bireysel varsayılan / Kurumsal) → Kurumsal'da "Vergi No" ve "Unvan" belirir,
//                 "Hediye paketi" (onay kutusu) → işaretliyken "Paket türü" (açılır liste) belirir,
//                 "Bülten" (onay kutusu) → DEĞİŞİNCE SAYFANIN BETİĞİ "Kaydet"e basmaya çalışır (kaydet.click()),
//                 İl (açılır liste) → İlçe (başta devre dışı; seçenekleri GET /ilceler?il= ile gelir: bağımlı liste),
//                 "Hesapla" (GET /hesapla → "Tutar: 1.234 TL" sonuç metni), "Kaydet" (kayıt oluşturan düğme: tıklanınca
//                 GET /kayit-basildi, formu POST /hesap/kaydet'e gönderir).
// Uygulama her isteği kaydeder: testler kayıt düğmesine hiç basılmadığını (ne GET /kayit-basildi ne POST /hesap/kaydet) doğrular.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const HESAP_KULLANICI = 'hesap.kullanici';
export const HESAP_PAROLA = 'Hesap-Sahte-Parola-4';
/** İl → ilçeler (değer, metin). */
export const ILCELER: Record<string, Array<[string, string]>> = {
  '06': [['cankaya', 'Çankaya'], ['kecioren', 'Keçiören']],
  '34': [['kadikoy', 'Kadıköy'], ['besiktas', 'Beşiktaş'], ['uskudar', 'Üsküdar']],
  '35': [['konak', 'Konak'], ['bornova', 'Bornova']]
};

const html = (baslik: string, govde: string, basliklar: Record<string, string> = {}): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0}fieldset{margin:12px 0}#sonuc{font-weight:600}</style></head><body>${govde}</body></html>`,
  basliklar
});
const yonlendir = (adres: string, basliklar: Record<string, string> = {}): FiksturYaniti =>
  html('Yönlendiriliyor', `<script>location.replace(${JSON.stringify(adres)});</script>`, basliklar);

export class HesapFormuUygulamasi {
  /** Gelen istekler: "YÖNTEM /yol". */
  readonly istekler: string[] = [];
  /** GET /hesapla sorguları (Hesapla'ya gerçekten basıldı). */
  readonly hesaplamalar: Array<Record<string, string>> = [];
  /** Kayıt düğmesine basılma sayısı (GET /kayit-basildi) ve kayıt formu gönderimleri (POST /hesap/kaydet). */
  kayitBasmalari = 0;
  kayitGonderimleri = 0;

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.istekler.push(`${i.yontem} ${i.yol}`);
    const oturum = i.cerezler.oturum === 'acik';
    if (i.yol === '/favicon.ico') return { durum: 404, tur: 'text/plain', govde: 'yok' };
    if (i.yol === '/giris') {
      if (i.yontem === 'POST') {
        const f = new URLSearchParams(i.govde);
        if (f.get('kullanici') !== HESAP_KULLANICI || f.get('parola') !== HESAP_PAROLA) return html('Giriş', '<p role="alert">Kullanıcı adı veya parola hatalı</p>');
        return yonlendir('/panel', { 'set-cookie': 'oturum=acik; Path=/; HttpOnly' });
      }
      return html('Giriş', `<h1>Giriş</h1><form method="post" action="/giris">
        <label>Kullanıcı adı <input id="kullanici" name="kullanici" autocomplete="username"></label>
        <label>Parola <input id="parola" name="parola" type="password"></label>
        <button id="gir" type="submit">Giriş yap</button></form>`);
    }
    if (!oturum) return yonlendir('/giris');
    if (i.yol === '/panel') return html('Panel', '<h1>Hoş geldiniz</h1><a href="/hesap/">Fiyat hesaplama</a>');
    if (i.yol === '/ilceler') {
      const l = ILCELER[i.sorgu.get('il') ?? ''] ?? [];
      return { tur: 'application/json', govde: JSON.stringify(l) };
    }
    if (i.yol === '/hesapla') {
      this.hesaplamalar.push(Object.fromEntries(i.sorgu.entries()));
      return { tur: 'application/json', govde: JSON.stringify({ tutar: i.sorgu.get('ek') === '1' ? '1.480' : '1.234' }) };
    }
    if (i.yol === '/kayit-basildi') { this.kayitBasmalari++; return { tur: 'application/json', govde: '{"tamam":true}' }; }
    if (i.yol === '/hesap/kaydet') { this.kayitGonderimleri++; return html('Kaydedildi', '<p>Kayıt oluşturuldu</p>'); }
    if (i.yol === '/hesap/' && i.yontem === 'GET') {
      return html('Fiyat Hesaplama', `<h1>Fiyat hesaplama</h1>
        <form id="hesapFormu" method="post" action="/hesap/kaydet">
          <fieldset><legend>Müşteri</legend>
            <div role="radiogroup" aria-label="Müşteri tipi">
              <label><input type="radio" name="musteriTipi" value="bireysel" id="tipBireysel" checked> Bireysel</label>
              <label><input type="radio" name="musteriTipi" value="kurumsal" id="tipKurumsal"> Kurumsal</label>
            </div>
            <label>Ad Soyad <input id="adSoyad" name="adSoyad"></label>
            <div id="kurumsalKap" hidden>
              <label>Vergi No <input id="vergiNo" name="vergiNo"></label>
              <label>Unvan <input id="unvan" name="unvan"></label>
            </div>
          </fieldset>
          <fieldset><legend>Paketleme</legend>
            <label><input type="checkbox" id="hediyePaketi" name="hediyePaketi"> Hediye paketi</label>
            <div id="paketKap" hidden><label for="paketTuru">Paket türü</label>
              <select id="paketTuru" name="paketTuru"><option value="kutu">Kutu</option><option value="torba">Torba</option></select></div>
            <label><input type="checkbox" id="bulten" name="bulten"> Bülten</label>
          </fieldset>
          <fieldset><legend>Adres</legend>
            <label for="il">İl</label>
            <select id="il" name="il"><option value="">Seçiniz</option><option value="06">Ankara</option><option value="34">İstanbul</option><option value="35">İzmir</option></select>
            <label for="ilce">İlçe</label>
            <select id="ilce" name="ilce" disabled><option value="">Önce il seçin</option></select>
          </fieldset>
          <button type="button" id="hesapla">Hesapla</button>
          <p id="sonuc" role="status" hidden></p>
          <button type="submit" id="kaydet">Kaydet</button>
        </form>
        <script>
          const $ = (id) => document.getElementById(id);
          for (const r of document.querySelectorAll('input[name="musteriTipi"]')) r.addEventListener('change', () => { $('kurumsalKap').hidden = !$('tipKurumsal').checked; });
          $('hediyePaketi').addEventListener('change', () => { $('paketKap').hidden = !$('hediyePaketi').checked; });
          // Kötü örnek: seçim değişince sayfanın kendi betiği kayıt düğmesine basar.
          $('bulten').addEventListener('change', () => { $('kaydet').click(); });
          $('il').addEventListener('change', async () => {
            const il = $('il').value;
            const s = $('ilce');
            if (!il) { s.replaceChildren(new Option('Önce il seçin', '')); s.disabled = true; return; }
            const l = await (await fetch('/ilceler?il=' + encodeURIComponent(il))).json();
            s.replaceChildren(new Option('Seçiniz', ''), ...l.map((x) => new Option(x[1], x[0])));
            s.disabled = false;
          });
          $('hesapla').addEventListener('click', async () => {
            const q = new URLSearchParams({ tip: document.querySelector('input[name="musteriTipi"]:checked').value, il: $('il').value, ilce: $('ilce').value, ek: $('hediyePaketi').checked ? '1' : '0' });
            const j = await (await fetch('/hesapla?' + q)).json();
            $('sonuc').textContent = 'Tutar: ' + j.tutar + ' TL';
            $('sonuc').hidden = false;
          });
          $('kaydet').addEventListener('click', () => { fetch('/kayit-basildi').catch(() => {}); });
        </script>`);
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}

/** Fikstürün giriş tarifi (bağlam değiştirme yok). */
export function hesapGirisTarifi(): Record<string, unknown> {
  return {
    girisAdresi: '/giris', oturumKontrolAdresi: '/panel',
    kullaniciAlani: '#kullanici', parolaAlani: '#parola', gonderDugmesi: '#gir',
    basariGostergesi: { tur: 'metin', deger: 'Hoş geldiniz' },
    hataGostergeleri: [{ tur: 'metin', deger: 'Kullanıcı adı veya parola hatalı' }],
    ikinciAdim: { tur: 'yok' }, zamanAsimiSn: 10
  };
}
