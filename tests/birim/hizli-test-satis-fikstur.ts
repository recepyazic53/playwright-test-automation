// ÇOK ADIMLI SATIŞ FORMU FİKSTÜRÜ (spec DEĞİL) — hızlı testin canlı denemede takıldığı yapının SAHTE kopyası. 127.0.0.1'de geçici http
// sunucusunda (giris-fikstur.ts > yerelSunucu) çalışır; tüm adlar, metinler ve değerler UYDURMADIR, hiçbir gerçek siteye bağlanılmaz.
//
//   /satis/  üst çubuk (header: menü + oturum açmış kullanıcının adı bir <h5> başlıkta), altbilgi (telif satırı), form:
//     "Başvuru bilgileri" (başlık öğesi olmayan blok): BAŞLANGIÇ / BİTİŞ (metin), ALTERNATİF (<select>, hazır seçili), GİDİLECEK ÜLKE (<select id=cmbCountries>,
//       ilk seçenek value="0" "SEÇİNİZ" + 300 ülke),
//     "Başvuran bilgileri" (fieldset): D.TARİHİ, TELEFON (tuş maskesi), T.C. (keyup'ta 11 hane → GET /api/kimlik → AD SOYAD dolar ve
//       blok yeniden çizilir: GİDİLECEK ÜLKE yeniden "SEÇİNİZ" olur — önce seçilen liste sonradan sıfırlanır),
//     "Tutar Hesapla": <a role="link"> (href yok, dinleyiciyle) → ülke seçilmemişse "Lütfen gidilecek ülkeyi seçiniz"; değilse
//       "Hesaplanıyor..." + GET /api/tutar → "6.78 EUR" + "Onaya gönder" (href'siz <a role="link">) + "Listeden Çıkar",
//     "Onaya gönder" → pencere (role=dialog): "Kapat" hemen; metin ve "KREDİ KARTI İLE ÖDE" bağlantısı 1,8 sn sonra (ağ yok),
//     "KREDİ KARTI İLE ÖDE" → kart alanları: Kart sahibi adı (#isim), Kart sahibi soyadı (#soyisim), Kart numarası (#kartno),
//       CVV (#cvv), Son kullanma ay / yıl (<select> #ay, #yil; ilk seçenek "Ay" / "Yıl" value="") + "Ödemeyi tamamla",
//     "Ödemeyi tamamla" → 0,3 sn sonra ilerleme ekranı ("İşleminiz onaylanırken lütfen bekleyiniz…", "0%", "Onaylanıyor 0 / 1"; ağ yok,
//       4 sn sürer) → POST /api/odeme → "Kaydınız oluşturuldu. Kayıt no: 9001".
//   Sayaçlar: tutarlar (GET /api/tutar; ülke kodu), odemeler (POST /api/odeme gövdesi).
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:0}header,footer{background:#eee;padding:8px 16px}main{padding:16px}.alert-danger{color:#b00}
.satir{display:flex;gap:16px;align-items:flex-end;margin:6px 0}.btn{display:inline-block;padding:4px 10px;border:1px solid #888;cursor:pointer}
.modal{position:fixed;top:80px;left:30%;width:40%;background:#fff;border:1px solid #444;padding:16px}</style></head><body>${govde}</body></html>`
});

/** 300 uydurma ülke adı (ilk ikisi testlerin kullandığı "A.B.D" ve "LIBERYA"). */
export const ULKELER: Array<{ kod: string; ad: string }> = [
  { kod: 'US', ad: 'A.B.D' }, { kod: 'LR', ad: 'LIBERYA' },
  ...Array.from({ length: 298 }, (_, i) => ({ kod: `U${String(i + 1).padStart(3, '0')}`, ad: `ÜLKE ${String(i + 1).padStart(3, '0')}` }))
];

export const SATIS_SAYFASI = String.raw`<header role="banner"><nav><a href="/satis/">Ana sayfa</a> <a href="/satis/?liste=1">Kayıtlarım</a></nav>
<h5 class="kullanici">DENEME KULLANICISI</h5></header>
<main>
<form id="f" onsubmit="return false">
<div class="blok"><div class="blok-baslik">Başvuru bilgileri</div>
  <div class="satir"><div><div>BAŞLANGIÇ</div><input id="baslangic" autocomplete="off"></div><div><div>BİTİŞ</div><input id="bitis" autocomplete="off"></div></div>
  <div class="satir"><div><div>ALTERNATİF</div><select id="alternatif"><option value="1" selected>Standart</option><option value="2">Geniş</option></select></div>
  <div><div>GİDİLECEK ÜLKE</div><select id="cmbCountries"><option value="0">SEÇİNİZ</option>__ULKELER__</select></div></div>
</div>
<fieldset><legend>Başvuran bilgileri</legend>
  <div class="satir"><div><div>D.TARİHİ</div><input id="dogum" autocomplete="off"></div><div><div>TELEFON</div><input id="tel" autocomplete="off"></div>
  <div><div>T.C.</div><input id="tc" autocomplete="off"></div><div><div>AD SOYAD</div><span id="adSoyad"></span></div></div>
</fieldset>
<p><a role="link" id="tutarHesapla" class="btn">Tutar Hesapla</a></p>
<div id="uyari" class="alert alert-danger" role="alert" hidden></div>
<div id="hesaplaniyor" hidden>Hesaplanıyor...</div>
<div id="tutarKutusu" hidden><span id="tutar"></span> <a role="link" id="onayaGonder" class="btn">Onaya gönder</a> <a role="link" id="cikar" class="btn">Listeden Çıkar</a></div>
</form>
<div id="pencere" class="modal" role="dialog" hidden><button type="button" id="kapat">Kapat</button><div id="pencereIcerik"></div></div>
<div id="kart" hidden>
  <fieldset><legend>Kart bilgileri</legend>
  <label for="isim">Kart sahibi adı</label><input id="isim" autocomplete="off">
  <label for="soyisim">Kart sahibi soyadı</label><input id="soyisim" autocomplete="off">
  <label for="kartno">Kart numarası</label><input id="kartno" autocomplete="off">
  <label for="cvv">CVV</label><input id="cvv" autocomplete="off">
  <label for="ay">Son kullanma ay</label><select id="ay"><option value="">Ay</option>__AYLAR__</select>
  <label for="yil">Son kullanma yıl</label><select id="yil"><option value="">Yıl</option>__YILLAR__</select>
  </fieldset>
  <p><button type="button" id="odeme">Ödemeyi tamamla</button></p>
</div>
<div id="ilerleme" hidden><p>İşleminiz onaylanırken lütfen bekleyiniz…</p><p id="yuzde">0%</p><p id="onay">Onaylanıyor 0 / 1</p></div>
<div id="sonuc" role="status"></div>
</main>
<footer>© 2026 Tüm hakları saklıdır.</footer>
<script>
  var $ = function (id) { return document.getElementById(id); };
  function uyar(m) { $('uyari').textContent = m; $('uyari').hidden = false; }
  // Sunucu tarafı yeniden çizim (ör. kimlik sorgusundan sonra blok yenilenir): ülke listesi ilk hâline (SEÇİNİZ) döner.
  var ulkeHtml = $('cmbCountries').outerHTML;
  $('tel').addEventListener('keypress', function (o) {
    o.preventDefault();
    if (!/\d/.test(o.key)) return;
    var r = ($('tel').value.replace(/\D/g, '') + o.key).slice(0, 10);
    $('tel').value = '(' + r.slice(0, 3) + (r.length > 3 ? ') ' + r.slice(3, 6) : '') + (r.length > 6 ? '-' + r.slice(6) : '');
  });
  $('tc').addEventListener('keyup', function () {
    if (!/^\d{11}$/.test($('tc').value) || $('adSoyad').textContent) return;
    fetch('/api/kimlik?tc=' + encodeURIComponent($('tc').value)).then(function (r) { return r.json(); }).then(function (j) { $('adSoyad').textContent = j.ad; $('cmbCountries').outerHTML = ulkeHtml; });
  });
  $('tutarHesapla').addEventListener('click', function () {
    $('uyari').hidden = true;
    if ($('cmbCountries').value === '0') { uyar('Lütfen gidilecek ülkeyi seçiniz'); return; }
    $('hesaplaniyor').hidden = false;
    fetch('/api/tutar?ulke=' + encodeURIComponent($('cmbCountries').value)).then(function (r) { return r.json(); }).then(function (j) {
      $('hesaplaniyor').hidden = true; $('tutar').textContent = j.tutar; $('tutarKutusu').hidden = false;
    });
  });
  $('onayaGonder').addEventListener('click', function () {
    $('pencere').hidden = false;
    setTimeout(function () {
      $('pencereIcerik').innerHTML = '<p>Ödeme yöntemini seçiniz</p><p><a role="link" id="kkIle" class="btn">KREDİ KARTI İLE ÖDE</a></p>';
      $('kkIle').addEventListener('click', function () { $('pencere').hidden = true; $('kart').hidden = false; });
    }, 1800);
  });
  $('kapat').addEventListener('click', function () { $('pencere').hidden = true; });
  $('odeme').addEventListener('click', function () {
    setTimeout(function () {
      $('kart').hidden = true; $('ilerleme').hidden = false;
      var y = 0;
      var t = setInterval(function () {
        y += 10; $('yuzde').textContent = Math.min(y, 90) + '%';
        if (y < 100) return;
        clearInterval(t);
        fetch('/api/odeme', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          ulke: $('cmbCountries').value, dogum: $('dogum').value, tel: $('tel').value, tc: $('tc').value,
          isim: $('isim').value, soyisim: $('soyisim').value, kartno: $('kartno').value, cvv: $('cvv').value, ay: $('ay').value, yil: $('yil').value }) })
          .then(function (r) { return r.json(); }).then(function (j) {
            $('onay').textContent = 'Onaylanıyor 1 / 1'; $('yuzde').textContent = '100%';
            setTimeout(function () { $('ilerleme').hidden = true; $('sonuc').textContent = 'Kaydınız oluşturuldu. Kayıt no: ' + j.no; }, 300);
          });
      }, 400);
    }, 300);
  });
</script>`;

const sayfa = (): string => SATIS_SAYFASI
  .replace('__ULKELER__', ULKELER.map((u) => `<option value="${u.kod}">${u.ad}</option>`).join(''))
  .replace('__AYLAR__', Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}">${String(i + 1).padStart(2, '0')}</option>`).join(''))
  .replace('__YILLAR__', Array.from({ length: 10 }, (_, i) => `<option value="${2026 + i}">${2026 + i}</option>`).join(''));

export class SatisUygulamasi {
  readonly tutarlar: string[] = [];
  readonly odemeler: Array<Record<string, string>> = [];
  private no = 9000;

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    if (i.yol === '/satis/' && i.yontem === 'GET') return html('Satış', sayfa());
    if (i.yol === '/api/kimlik' && i.yontem === 'GET') return { tur: 'application/json', govde: JSON.stringify({ ad: 'D*** K***' }), gecikmeMs: 300 };
    if (i.yol === '/api/tutar' && i.yontem === 'GET') {
      this.tutarlar.push(i.sorgu.get('ulke') ?? '');
      return { tur: 'application/json', govde: JSON.stringify({ tutar: '6.78 EUR' }), gecikmeMs: 1_000 };
    }
    if (i.yol === '/api/odeme' && i.yontem === 'POST') {
      this.odemeler.push(JSON.parse(i.govde) as Record<string, string>);
      return { tur: 'application/json', govde: JSON.stringify({ no: ++this.no }), gecikmeMs: 300 };
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}
