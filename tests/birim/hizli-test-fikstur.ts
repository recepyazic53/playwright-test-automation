// HIZLI TEST SİHİRBAZI TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). Çok aşamalı sahte başvuru formu 127.0.0.1'de geçici bir http sunucusunda
// (giris-fikstur.ts > yerelSunucu) çalışır; tüm metinler ve değerler UYDURMADIR, hiçbir gerçek siteye bağlanılmaz.
//
//   /basvuru/        giriş gerektirmez. Alanlar: Ad soyad (zorunlu), Kanal (sayfada hazır: Web seçili, sorulmaz), Müşteri tipi (zorunlu; Kurumsal seçilince zorunlu "Vergi no" belirir).
//                    "Hesapla" (form dışında, type=button): Ad soyad boşsa hata kutusu "Zorunlu alan: Ad soyad"; doluysa "Hesaplanıyor…"
//                    göstergesi + GET /api/hesapla (sunucu gecikmeli) → "Tutar: 1.250,00 TL" + yeni alan "Ödeme şekli" (HTML'de zorunlu işaretsiz; sayfa kendisi denetler) + "Onayla".
//                    "Onayla": Ödeme şekli boşsa "Zorunlu alan: Ödeme şekli"; doluysa "Gönderiliyor…" + POST /api/onayla → "Başvurunuz alındı."
//                    Ayrıca "Temizle" (reset) ve "Geri" düğmeleri (birden çok aday için).
//   kip (testin değiştirdiği): 'normal' | 'hata' (onayla sunucu doğrulaması → "Zorunlu alan: Ödeme şekli (sunucu)") | 'sessiz' (onayla sonuç göstermez).
//   Sayaçlar: hesaplamalar (GET /api/hesapla), onaylar (POST /api/onayla) — düğmeye basıldığının / basılmadığının kanıtı.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0 2px}.gizli{display:none}.alert-danger{color:#b00}.alert-success{color:#060}</style></head><body>${govde}</body></html>`
});

export const HIZLI_BASVURU_SAYFASI = `<h1>Başvuru</h1>
<p>Bilgileri doldurup tutarı hesaplayın.</p>
<div id="form">
  <label for="adSoyad">Ad soyad</label><input id="adSoyad" name="adSoyad" required>
  <label for="musteriTipi">Müşteri tipi</label>
  <select id="musteriTipi" name="musteriTipi" required><option value="">Seçin</option><option value="bireysel">Bireysel</option><option value="kurumsal">Kurumsal</option></select>
  <label for="kanal">Kanal</label>
  <select id="kanal" name="kanal"><option value="web" selected>Web</option><option value="sube">Şube</option></select>
  <div id="vergiKutusu" class="gizli"><label for="vergiNo">Vergi no</label><input id="vergiNo" name="vergiNo" required></div>
</div>
<p><button type="button" id="hesapla">Hesapla</button> <button type="button" id="temizle" onclick="document.getElementById('adSoyad').value=''">Temizle</button>
<button type="button" id="geri" onclick="history.back()">Geri</button></p>
<div id="uyari" class="alert alert-danger" role="alert" hidden></div>
<span id="bekleme" class="spinner-border" hidden>Hesaplanıyor…</span>
<div id="sonuc" hidden>
  <p id="tutar"></p>
  <label for="odemeSekli">Ödeme şekli</label>
  <select id="odemeSekli" name="odemeSekli"><option value="">Seçin</option><option value="kart">Kredi kartı</option><option value="havale">Havale</option></select>
  <p><button type="button" id="onayla">Onayla</button></p>
  <span id="gonderiliyor" class="spinner-border" hidden>Gönderiliyor…</span>
</div>
<div id="tamam" class="alert alert-success" role="status" hidden></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  // Alandan çıkınca gelen sayfa doğrulaması (ör. geçersiz değer): doldurma sırasında hata mesajı belirir.
  $('adSoyad').addEventListener('change', function () { if (this.value === 'HATALI') uyar('Zorunlu alan: Ad soyad geçersiz'); });
  // Sonradan silinen alan: müşteri tipi seçilince (gecikmeli) ad soyad sıfırlanır (sayfa satırı yeniden çizer).
  $('musteriTipi').addEventListener('change', function () { if (this.value === 'bireysel' && $('adSoyad').value === 'SILINIR') setTimeout(function () { $('adSoyad').value = ''; }, 300); });
  $('musteriTipi').addEventListener('change', function () { $('vergiKutusu').className = this.value === 'kurumsal' ? '' : 'gizli'; });
  function uyar(m) { $('uyari').textContent = m; $('uyari').hidden = false; }
  $('hesapla').addEventListener('click', function () {
    $('uyari').hidden = true;
    if (!$('adSoyad').value) { uyar('Zorunlu alan: Ad soyad'); return; }
    $('bekleme').hidden = false;
    fetch('/api/hesapla?tip=' + encodeURIComponent($('musteriTipi').value) + '&vergi=' + encodeURIComponent($('vergiNo').value))
      .then(function (r) { return r.json(); }).then(function (j) {
        $('bekleme').hidden = true;
        $('tutar').textContent = 'Tutar: ' + j.tutar + ' TL';
        $('sonuc').hidden = false;
      });
  });
  $('onayla').addEventListener('click', function () {
    $('uyari').hidden = true;
    if (!$('odemeSekli').value) { uyar('Zorunlu alan: Ödeme şekli'); return; }
    $('gonderiliyor').hidden = false;
    fetch('/api/onayla', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ odeme: $('odemeSekli').value }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        $('gonderiliyor').hidden = true;
        if (j.hata) { uyar(j.hata); return; }
        if (j.sessiz) return;
        $('tamam').textContent = 'Başvurunuz alındı. Başvuru no: ' + j.no;
        $('tamam').hidden = false;
      });
  });
</script>`;

/** /kosullu/: radyo (Ana seçim: X varsayılan, Y) — X'te "Alan A/B", Y'de "Alan C/D" ve onay kutusu "Ek bilgi" (işaretlenince "Alan F"). */
export const HIZLI_KOSULLU_SAYFASI = `<h1>Koşullu</h1>
<fieldset><legend>Ana seçim</legend>
  <label><input type="radio" name="ana" value="x" checked> X</label> <label><input type="radio" name="ana" value="y"> Y</label></fieldset>
<div id="gx"><label for="a">Alan A</label><input id="a" name="a"><label for="b">Alan B</label><input id="b" name="b"></div>
<div id="gy" hidden><label for="c">Alan C</label><input id="c" name="c"><label for="d">Alan D</label><input id="d" name="d">
  <label><input type="checkbox" id="ek" name="ek"> Ek bilgi</label><div id="gf" hidden><label for="f">Alan F</label><input id="f" name="f"></div></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  function goster() {
    var y = document.querySelector('input[name=ana]:checked').value === 'y';
    $('gx').hidden = y; $('gy').hidden = !y; $('gf').hidden = !(y && $('ek').checked);
  }
  document.querySelectorAll('input[name=ana]').forEach(function (r) { r.addEventListener('change', goster); });
  $('ek').addEventListener('change', goster);
</script>`;

/**
 * /kayit/: gerçek bir kayıt ekranının zorlu davranışları (sahte veriler):
 *  - Gidilecek ülke (açılır liste), Ödeyen (radyo; varsayılan Kendisi),
 *  - D.TARİHİ: odaklanınca takvim penceresi açılır, yalnız DIŞARI TIKLAYINCA kapanır (Tab / Escape kapatmaz),
 *  - TELEFON: tuş olayı bekleyen maske (yalnız klavye tuşları biçimler: "(542) 650-2153"); tuş olmadan yazılan ham değer alandan çıkınca SİLİNİR,
 *  - TC KİMLİK NO: alandan çıkınca sorgu (POST /api/sorgu, gecikmeli); yanıtta alan salt okunur olur, ad soyad maskeli görünür ve
 *    satır yeniden çizilir (?sifirla=tc iken telefon SİLİNİR),
 *  - "Hesapla": eksik alan varsa "… zorunludur", tamamsa POST /api/kayit ve "Kayıt alındı".
 * window.__sira: alanların ilk doldurulma sırası.
 */
export const HIZLI_KAYIT_SAYFASI = String.raw`<h1>Kayıt</h1>
<div><label for="ulke">Gidilecek ülke</label><select id="ulke" name="ulke"><option value="">Seçiniz</option><option value="US">A.B.D</option><option value="FR">Fransa</option><option value="DE">Almanya</option></select></div>
<fieldset><legend>Ödeyen</legend><label><input type="radio" name="odeyen" value="kendisi" checked> Kendisi</label> <label><input type="radio" name="odeyen" value="baska"> Farklı kişi</label></fieldset>
<div style="display:flex;gap:16px;margin-top:12px">
  <div><div>D.TARİHİ</div><input id="dogum" name="dogum" autocomplete="off"></div>
  <div><div>TELEFON</div><input id="tel" name="tel" autocomplete="off"></div>
  <div><div>TC KİMLİK NO</div><input id="tc" name="tc" autocomplete="off"></div>
  <div><div>AD SOYAD</div><span id="ad"></span></div>
</div>
<div id="takvim" class="ui-datepicker" style="display:none;position:absolute;top:150px;left:8px;width:220px;height:120px;background:#eee">takvim</div>
<p><button type="button" id="hesapla">Hesapla</button></p>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  // Doldurma sırası: alanın ilk dolu hâli (boşalınca kayıt silinir: keşif geri yüklemesi sırayı bozmaz); sayfa kodu değeri sessizce silerse kayıt kalır.
  var __say = 0, __ilk = {};
  Object.defineProperty(window, '__sira', { get: function () { return Object.keys(__ilk).sort(function (a, b) { return __ilk[a] - __ilk[b]; }); } });
  function izle(id) { if ($(id).value !== '') { if (!(id in __ilk)) __ilk[id] = ++__say; } else delete __ilk[id]; }
  var qs = new URLSearchParams(location.search);
  ['ulke', 'dogum', 'tel', 'tc'].forEach(function (id) {
    $(id).addEventListener('input', function () { izle(id); });
    $(id).addEventListener('change', function () { izle(id); });
  });
  $('dogum').addEventListener('focus', function () { $('takvim').style.display = 'block'; });
  document.addEventListener('mousedown', function (o) { if (!$('takvim').contains(o.target) && o.target !== $('dogum')) $('takvim').style.display = 'none'; });
  // Telefon maskesi: yalnız klavye tuşlarını biçimler; ham değer alandan çıkınca silinir.
  $('tel').addEventListener('keydown', function (o) {
    if (o.key.length !== 1 || !/\d/.test(o.key)) return;
    o.preventDefault();
    var r = ($('tel').value.replace(/\D/g, '') + o.key).slice(0, 10);
    var b = '(' + r.slice(0, 3) + (r.length > 3 ? ') ' + r.slice(3, 6) : '') + (r.length > 6 ? '-' + r.slice(6) : '');
    $('tel').value = b;
    izle('tel');
  });
  $('tel').addEventListener('blur', function () { if (!/^\(\d{3}\) \d{3}-\d{4}$/.test($('tel').value)) $('tel').value = ''; });
  $('tc').addEventListener('change', function () {
    fetch('/api/sorgu', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tc: $('tc').value }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        $('tc').readOnly = true; $('ad').textContent = j.ad;
        if (qs.get('sifirla') === 'tc') $('tel').value = '';
      });
  });
  $('hesapla').addEventListener('click', function () {
    var eksik = [];
    if (!$('ulke').value) eksik.push('Gidilecek ülke seçiniz');
    if (!$('dogum').value) eksik.push('Doğum tarihi zorunludur');
    if (!/^\(\d{3}\) \d{3}-\d{4}$/.test($('tel').value)) eksik.push('Telefon numarası zorunludur. Lütfen 10 hane olarak giriniz.');
    if (!$('tc').value) eksik.push('TC kimlik no zorunludur');
    if (eksik.length) { $('sonuc').textContent = eksik.join(' / '); return; }
    fetch('/api/kayit', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ulke: $('ulke').value, odeyen: document.querySelector('input[name=odeyen]:checked').value, dogum: $('dogum').value, tel: $('tel').value, tc: $('tc').value, sira: window.__sira }) })
      .then(function (r) { return r.json(); }).then(function () { $('sonuc').textContent = 'Kayıt alındı'; });
  });
</script>`;

/**
 * /maskeli/: tuş olayı bekleyen maskeler + keyup sorgusu + sürekli açık uzun yoklama (sahte veriler):
 *  - Doğum tarihi (placeholder "__.__.____") ve Telefon (type=text): yalnız klavye tuşlarını (keypress) biçimler; tuş olmadan yazılan
 *    (fill) ham değer alandan çıkınca SİLİNİR. Değer geçmişi (her değişim; silinince "") window.__gecmis'te.
 *  - T.C. kimlik no: keyup'ta 11 hane olunca (doğum ve telefon doluysa) GET /api/kimlik → "Ad soyad" dolar (sorgu sayacı).
 *  - Sayfa açılınca GET /api/yoklama (sunucu 20 sn bekletir; biter bitmez yeniden) — hiç sakinleşmeyen ağ.
 *  - "Gönder": POST /api/maskeli { dogum, tel, tc, ad, gecmis, sorgular, dolumMs } → "Kayıt tamam". dolumMs: ilk alan girdisinden
 *    Gönder'e kadar geçen süre (alan başı bekleme ölçüsü).
 */
export const HIZLI_MASKELI_SAYFASI = String.raw`<h1>Maskeli form</h1>
<div><label for="dogum">Doğum tarihi</label><input id="dogum" name="dogum" placeholder="__.__.____" autocomplete="off"></div>
<div><label for="tel">Telefon</label><input id="tel" name="tel" type="text" autocomplete="off"></div>
<div><label for="tc">T.C. kimlik no</label><input id="tc" name="tc" type="text" autocomplete="off"></div>
<div><label for="adSoyad">Ad soyad</label><input id="adSoyad" name="adSoyad" readonly></div>
<p><button type="button" id="gonder">Gönder</button></p>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var gecmis = { dogum: [], tel: [], tc: [] }, sorgular = 0, ilk = 0;
  window.__gecmis = gecmis;
  function kaydet(id) { var v = $(id).value; var g = gecmis[id]; if (!g.length || g[g.length - 1] !== v) g.push(v); if (!ilk && v) ilk = Date.now(); }
  function maske(id, bicim, gecerli) {
    $(id).addEventListener('keypress', function (o) {
      o.preventDefault();
      if (!/\d/.test(o.key)) return;
      $(id).value = bicim($(id).value.replace(/\D/g, '') + o.key);
      kaydet(id);
    });
    $(id).addEventListener('input', function () { kaydet(id); });
    $(id).addEventListener('blur', function () { if (!gecerli.test($(id).value)) { $(id).value = ''; kaydet(id); } });
  }
  maske('dogum', function (r) { r = r.slice(0, 8); return r.slice(0, 2) + (r.length > 2 ? '.' + r.slice(2, 4) : '') + (r.length > 4 ? '.' + r.slice(4) : ''); }, /^\d{2}\.\d{2}\.\d{4}$/);
  maske('tel', function (r) { r = r.slice(0, 10); return '(' + r.slice(0, 3) + (r.length > 3 ? ') ' + r.slice(3, 6) : '') + (r.length > 6 ? '-' + r.slice(6) : ''); }, /^\(\d{3}\) \d{3}-\d{4}$/);
  $('tc').addEventListener('input', function () { kaydet('tc'); });
  $('tc').addEventListener('keyup', function () {
    if (!/^\d{11}$/.test($('tc').value) || !$('dogum').value || !$('tel').value || $('adSoyad').value) return;
    sorgular++;
    fetch('/api/kimlik?tc=' + encodeURIComponent($('tc').value)).then(function (r) { return r.json(); }).then(function (j) { $('adSoyad').value = j.ad; });
  });
  function yokla() { fetch('/api/yoklama').then(function (r) { return r.text(); }).then(yokla, function () { setTimeout(yokla, 1000); }); }
  yokla();
  $('gonder').addEventListener('click', function () {
    var dolum = ilk ? Date.now() - ilk : -1;
    fetch('/api/maskeli', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dogum: $('dogum').value, tel: $('tel').value, tc: $('tc').value, ad: $('adSoyad').value, gecmis: gecmis, sorgular: sorgular, dolumMs: dolum }) })
      .then(function (r) { return r.json(); }).then(function () { $('sonuc').textContent = 'Kayıt tamam'; });
  });
</script>`;

export class HizliTestUygulamasi {
  readonly istekler: string[] = [];
  /** /maskeli/ sayfasının gönderimleri (değer geçmişi, sorgu sayısı, doldurma süresi). */
  readonly maskeliKayitlar: Array<Record<string, any>> = [];
  readonly hesaplamalar: Array<{ tip: string; vergi: string }> = [];
  readonly onaylar: string[] = [];
  readonly kayitlar: Array<Record<string, unknown>> = [];
  kip: 'normal' | 'hata' | 'sessiz' = 'normal';
  private no = 4700;

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.istekler.push(`${i.yontem} ${i.yol}`);
    if (i.yol === '/basvuru/' && i.yontem === 'GET') return html('Başvuru', HIZLI_BASVURU_SAYFASI);
    if (i.yol === '/kayit/' && i.yontem === 'GET') return html('Kayıt', HIZLI_KAYIT_SAYFASI);
    if (i.yol === '/api/sorgu' && i.yontem === 'POST') return { tur: 'application/json', govde: JSON.stringify({ ad: 'D*** K***' }), gecikmeMs: 500 };
    if (i.yol === '/api/kayit' && i.yontem === 'POST') { this.kayitlar.push(JSON.parse(i.govde) as Record<string, unknown>); return { tur: 'application/json', govde: JSON.stringify({ tamam: true }), gecikmeMs: 300 }; }
    if (i.yol === '/kosullu/' && i.yontem === 'GET') return html('Koşullu', HIZLI_KOSULLU_SAYFASI);
    if (i.yol === '/maskeli/' && i.yontem === 'GET') return html('Maskeli', HIZLI_MASKELI_SAYFASI);
    if (i.yol === '/api/yoklama' && i.yontem === 'GET') return { tur: 'text/plain', govde: 'bos', gecikmeMs: 20_000 };
    if (i.yol === '/api/kimlik' && i.yontem === 'GET') return { tur: 'application/json', govde: JSON.stringify({ ad: 'D*** K***' }), gecikmeMs: 300 };
    if (i.yol === '/api/maskeli' && i.yontem === 'POST') { this.maskeliKayitlar.push(JSON.parse(i.govde) as Record<string, any>); return { tur: 'application/json', govde: '{"tamam":true}' }; }
    if (i.yol === '/api/hesapla' && i.yontem === 'GET') {
      this.hesaplamalar.push({ tip: i.sorgu.get('tip') ?? '', vergi: i.sorgu.get('vergi') ?? '' });
      return { tur: 'application/json', govde: JSON.stringify({ tutar: i.sorgu.get('tip') === 'kurumsal' ? '2.500,00' : '1.250,00' }), gecikmeMs: 1_200 };
    }
    if (i.yol === '/api/onayla' && i.yontem === 'POST') {
      this.onaylar.push(i.govde);
      if (this.kip === 'hata') return { tur: 'application/json', govde: JSON.stringify({ hata: 'Zorunlu alan: Ödeme şekli (sunucu)' }), gecikmeMs: 400 };
      if (this.kip === 'sessiz') return { tur: 'application/json', govde: JSON.stringify({ sessiz: true }), gecikmeMs: 400 };
      return { tur: 'application/json', govde: JSON.stringify({ no: ++this.no }), gecikmeMs: 800 };
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}
