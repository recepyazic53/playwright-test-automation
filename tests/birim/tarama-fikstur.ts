// OTOMATİK TARAMA TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). Hiçbir test gerçek bir siteye bağlanmaz: uygulama
// 127.0.0.1'de geçici bir http sunucusunda (giris-fikstur.ts > yerelSunucu) çalışır; tüm değerler SAHTEDİR.
//
// Çok profilli başvuru uygulaması:
//   /giris        kullanıcı adı + parola (POST form). captcha: true → sayfada reCAPTCHA izi. sms: true → /dogrulama (kod 123456)
//   /panel        "Hoş geldiniz" + "Profil: <kod>" (bağlam) — /profil'den profil değiştirilir (POST, çerez)
//   /basvuru/     hedef form: fieldset/legend + başlıklar; ürün seçimi (B → "Ek teslimat", C → "Vergi numarası" belirir;
//                 her değişiklikte OTOMATİK KAYDET XHR POST'u); dil seçimi (sayfayı ?dil= ile yeniden yükler);
//                 radyo grubu, onay kutusu, onay kutusu grubu, dosya (.xlsx), tarih, e-posta, salt okunur ve devre dışı
//                 alanlar; YALNIZCA "Yetkili" (P2) profilde "İndirim oranı"; gönder düğmesi (POST /basvuru/kaydet) ve
//                 tıklanırsa POST atan "Başvuruyu sil" bağlantısı; yasaklı host'tan bir görsel.
// Uygulama her isteği (yöntem + yol + oturum/profil) kaydeder: testler yalnızca giriş ve profil değiştirme
// POST'larının sunucuya ulaştığını doğrular.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const TARAMA_KULLANICI = 'tarama.kullanici';
export const TARAMA_PAROLA = 'Tarama-Sahte-Parola-7';
export const TARAMA_SMS_KODU = '123456';
/** Salt okunur alanın DEĞERİ: pakette asla görünmemeli. */
export const SALT_OKUNUR_DEGER = 'MUSTERI-DEGERI-9931';
export const PROFILLER: Record<string, string> = { P1: 'Standart', P2: 'Yetkili' };
/** Fikstür sayfasındaki yasaklı host (hiç çözülmez; .invalid). */
export const YASAKLI_GORSEL_HOST = 'cdn.yasak-ornek.invalid';

export type FiksturKaydi = { yontem: string; yol: string; oturum: boolean; profil: string | null };

const html = (baslik: string, govde: string, basliklar: Record<string, string> = {}): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0}fieldset{margin:12px 0}</style></head><body>${govde}</body></html>`,
  basliklar
});
/** Yönlendirme sayfa içi betikle (3xx yerine; giris-fikstur.ts ile aynı gerekçe). */
const yonlendir = (adres: string, basliklar: Record<string, string> = {}): FiksturYaniti =>
  html('Yönlendiriliyor', `<script>location.replace(${JSON.stringify(adres)});</script>`, basliklar);

export class TaramaFiksturu {
  readonly kayitlar: FiksturKaydi[] = [];
  /** true → formda yeni bir "Referans kodu" alanı (tekrar analizde "Yeni alan" bulgusu). */
  ekAlan = false;
  constructor(private readonly ayar: { captcha?: boolean; sms?: boolean } = {}) {}

  /** Sunucuya ulaşan POST'lar (yöntem + yol). */
  postlar(): string[] {
    return this.kayitlar.filter((k) => k.yontem === 'POST').map((k) => `POST ${k.yol}`);
  }

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    const oturum = i.cerezler.oturum === 'acik';
    const profil = i.cerezler.profil && PROFILLER[i.cerezler.profil] ? i.cerezler.profil : 'P1';
    this.kayitlar.push({ yontem: i.yontem, yol: i.yol, oturum, profil: oturum ? profil : null });
    const yol = i.yol;
    if (yol === '/favicon.ico') return { durum: 404, tur: 'text/plain', govde: 'yok' };
    if (yol === '/giris') {
      if (i.yontem === 'POST') {
        const f = new URLSearchParams(i.govde);
        if (f.get('kullanici') !== TARAMA_KULLANICI || f.get('parola') !== TARAMA_PAROLA) {
          return html('Giriş', '<p role="alert">Kullanıcı adı veya parola hatalı</p><a href="/giris">Geri</a>');
        }
        if (this.ayar.sms) return yonlendir('/dogrulama', { 'set-cookie': 'onay=bekliyor; Path=/; HttpOnly' });
        return yonlendir('/panel', { 'set-cookie': 'oturum=acik; Path=/; HttpOnly' });
      }
      return html('Giriş', `<h1>Giriş</h1><form method="post" action="/giris">
        <label>Kullanıcı adı <input id="kullanici" name="kullanici" autocomplete="username"></label>
        <label>Parola <input id="parola" name="parola" type="password"></label>
        ${this.ayar.captcha ? '<div class="g-recaptcha" data-sitekey="ornek-anahtar" style="width:304px;height:78px;border:1px solid #ccc"></div>' : ''}
        <button id="gir" type="submit">Giriş yap</button></form>`);
    }
    if (yol === '/dogrulama') {
      if (i.cerezler.onay !== 'bekliyor') return yonlendir('/giris');
      if (i.yontem === 'POST') {
        if (new URLSearchParams(i.govde).get('kod') !== TARAMA_SMS_KODU) return html('Doğrulama', '<p role="alert">Doğrulama kodu hatalı</p>');
        return yonlendir('/panel', { 'set-cookie': 'oturum=acik; Path=/; HttpOnly' });
      }
      return html('Doğrulama', `<form method="post" action="/dogrulama"><label>SMS kodu <input id="kod" name="kod" autocomplete="one-time-code"></label>
        <button id="dogrula" type="submit">Doğrula</button></form>`);
    }
    if (!oturum) return yonlendir('/giris');
    if (yol === '/panel') {
      return html('Panel', `<h1>Hoş geldiniz</h1><p id="aktif-profil">Profil: ${profil}</p><a href="/profil">Profil değiştir</a>`);
    }
    if (yol === '/profil') {
      if (i.yontem === 'POST') {
        const p = new URLSearchParams(i.govde).get('profil') ?? '';
        if (!PROFILLER[p]) return html('Profil', '<p role="alert">Geçersiz profil</p>');
        return yonlendir('/panel', { 'set-cookie': `profil=${p}; Path=/` });
      }
      return html('Profil', `<form method="post" action="/profil"><label>Profil <select id="profil" name="profil">
        ${Object.entries(PROFILLER).map(([k, ad]) => `<option value="${k}">${ad}</option>`).join('')}</select></label>
        <button id="profil-uygula" type="submit">Uygula</button></form>`);
    }
    if (yol === '/basvuru/' && i.yontem === 'GET') {
      const dil = i.sorgu.get('dil') === 'en' ? 'en' : 'tr';
      return html('Örnek Başvuru', `<h1>Başvuru formu</h1>
        <img src="http://${YASAKLI_GORSEL_HOST}/logo.png" alt="" width="1" height="1">
        <form id="basvuru" method="post" action="/basvuru/kaydet">
          <input type="hidden" name="csrf" value="gizli-token-degeri">
          <fieldset><legend>Temel bilgiler</legend>
            <label for="urun">Ürün *</label>
            <select id="urun" name="urun" required onchange="urunDegisti()">
              <option value="">Seçiniz</option><option value="A">Temel</option><option value="B">Geniş</option><option value="C">Kurumsal</option>
            </select>
            <div id="genisKap" hidden><label for="ekTeslimat">Ek teslimat</label>
              <select id="ekTeslimat" name="ekTeslimat"><option value="yok">Yok</option><option value="not">Not</option></select></div>
            <div id="kurumKap" hidden><label>Vergi numarası <input id="vergiNo" name="vergiNo" type="text"></label></div>
            <label>Ad Soyad <input id="adSoyad" name="adSoyad" required></label>
            ${this.ekAlan ? '<label for="referans">Referans kodu</label><input id="referans" name="referans">' : ''}
            <label for="dogum">Doğum tarihi</label><input id="dogum" name="dogum" type="date">
            <label for="eposta">E-posta</label><input id="eposta" name="eposta" type="email">
            <label for="dil">Dil</label>
            <select id="dil" name="dil" onchange="location.href='/basvuru/?dil=' + this.value">
              <option value="tr"${dil === 'tr' ? ' selected' : ''}>Türkçe</option><option value="en"${dil === 'en' ? ' selected' : ''}>English</option>
            </select>
          </fieldset>
          <h2>Ödeme</h2>
          <div role="radiogroup" aria-label="Ödeme şekli">
            <label><input type="radio" name="odeme" value="pesin" id="odemePesin" required> Peşin</label>
            <label><input type="radio" name="odeme" value="taksit" id="odemeTaksit"> Taksitli</label>
          </div>
          <label><input type="checkbox" id="kampanya" name="kampanya"> Kampanya onayı</label>
          ${profil === 'P2' ? '<label for="indirim">İndirim oranı</label><input id="indirim" name="indirim" type="number">' : ''}
          <table><tr><td>Müşteri no</td><td><input id="musteriNo" name="musteriNo" readonly value="${SALT_OKUNUR_DEGER}"></td></tr></table>
          <label for="kanal">Kanal</label><input id="kanal" name="kanal" disabled value="web">
          <h2>Belgeler</h2>
          <label for="belge">Belge</label><input type="file" id="belge" name="belge" accept=".xlsx">
          <label><input type="checkbox" name="ilgi" value="spor"> Spor</label>
          <label><input type="checkbox" name="ilgi" value="muzik"> Müzik</label>
          <button type="submit" id="gonder">Başvuruyu gönder</button>
          <a href="/basvuru/sil" id="sil" onclick="fetch('/basvuru/sil', { method: 'POST' }); return false;">Başvuruyu sil</a>
        </form>
        <script>
          function urunDegisti() {
            const v = document.getElementById('urun').value;
            document.getElementById('genisKap').hidden = v !== 'B';
            document.getElementById('kurumKap').hidden = v !== 'C';
            fetch('/basvuru/otomatik-kaydet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urun: v }) }).catch(() => {});
            if (v === 'C') document.getElementById('basvuru').requestSubmit();
          }
        </script>`);
    }
    if (yol.startsWith('/basvuru/')) return { durum: 200, tur: 'application/json', govde: '{"tamam":true}' };
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}

/** Fikstürün giriş tarifi (bağlam türü "Profil"; profil kodu bağlam profilinin "profilKodu" alanından). */
export function taramaGirisTarifi(ayar: { sms?: boolean } = {}): Record<string, unknown> {
  return {
    girisAdresi: '/giris', oturumKontrolAdresi: '/panel',
    kullaniciAlani: '#kullanici', parolaAlani: '#parola', gonderDugmesi: '#gir',
    basariGostergesi: { tur: 'metin', deger: 'Hoş geldiniz' },
    hataGostergeleri: [{ tur: 'metin', deger: 'Kullanıcı adı veya parola hatalı' }],
    ikinciAdim: ayar.sms
      ? { tur: 'sms', kodAlani: '#kod', gonderDugmesi: '#dogrula', smsKipi: 'elle', elleBeklemeSn: 60, hataGostergeleri: [{ tur: 'metin', deger: 'Doğrulama kodu hatalı' }] }
      : { tur: 'yok' },
    zamanAsimiSn: 10,
    baglamDegistirme: {
      baglamTuru: 'Profil',
      adimlar: [
        { islem: 'git', adres: '/profil' },
        { islem: 'sec', hedef: { secici: '#profil' }, deger: '{profilKodu}' },
        { islem: 'tikla', hedef: { secici: '#profil-uygula' }, adresBekle: '/panel' },
        { islem: 'metinBekle', hedef: { secici: '#aktif-profil' }, metin: 'Profil: {profilKodu}' }
      ]
    }
  };
}
