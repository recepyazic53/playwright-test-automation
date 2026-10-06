// VERİ DURAĞI / ALAN DOĞRULAMA / AÇILAN PENCERE TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). 127.0.0.1'deki sahte sayfalar; tüm adlar ve
// değerler UYDURMADIR, hiçbir gerçek siteye bağlanılmaz.
//
//   /tarihli/        "Doğum Tarihi" sayfada VARSAYILAN değerle (02.10.2026) gelir; tuş maskesi (yalnız rakam, gg.aa.yyyy; Ctrl+A
//                    engelli: önceden dolu alanın üzerine yazma denenir). "Kimlik No" alandan çıkınca GET /api/kimlik-sorgu → "Ad soyad"
//                    dolar ve sorgu DOĞUM TARİHİNİ sorgunun tarihiyle (02.10.2026) EZER. ?kilit=1: sorgudan sonra doğum tarihi her
//                    değişince yeniden sorgunun tarihine döner (yeniden yazmak da tutmaz). "Gönder": POST /api/tarihli → "Kayıt tamam".
//   /kosullu-hazir/  Sayfa sırası: Ad (boş), Başlangıç tarihi (hazır: 02.10.2026), Kanal (hazır liste: Web), Kişi tipi (radyo Özel /
//                    Tüzel; Özel'de "Kimlik no", Tüzel'de "Vergi no"), Ödeyen farklı (radyo Hayır / Evet; Evet'te "Ödeyen tipi" radyosu
//                    ve "Ödeyen doğum tarihi" belirir — sayfa onları o an ÖNDOLDURUR: keşifte "hazır" görünürler ama şu an gizlidir).
//   /basit/          "Ad" + "Gönder": basınca GET /api/selam?ad=… → yalnız metin ("Merhaba <ad>"); yeni alan çıkmaz.
//   /etiketli/       Kişi tipi Özel / Tüzel: Tüzel'de doğum tarihi gizlenir, AYNI kutuların adı (ve en çok karakteri) değişir (Kimlik no 11 →
//                    Vergi no 10, Cep telefonu → İş telefonu); etiketler satırdaki span'da (for yok); süslü gizli radyo ve gizli <select> +
//                    seçili metin kutusu; tuşla yazılamayan takvimli doğum tarihi; salt okunur hesaplanan alanlar; Adres farklı = Evet'te
//                    yeni alan (Adres). "Kaydet": POST /api/etiketli → "Kayıt alındı".
//   /pencere/        Arka planda 70 işlem düğmesi ve alan yanındaki yazısız (::before) simgeler; "Pencereyi aç" → örtü + sabit kutu
//                    (rolsüz): href'siz <a> "Dış sistemden devam et", onclick'li span "Kartla tamamla", "Taksit planı" listesi + "Tamamla".
//   /ic-ice/         İki düzey seçim: "Farklı kişi" Evet → açılışta gizli ikinci kişi bölümü; onun "Kişi tipi (2)" Tüzel olunca bölümün
//                    kutularının adı (ve en çok karakteri) değişir, doğum tarihi gizlenir. "Kaydet": POST /api/ic-ice → "Kayıt alındı".
//   /adimli/         "İleri" → sayfanın en altına açılışta olmayan ikinci adım (Kişi tipi + adı değişen alanlar) + "Kaydet".
//   /kesif-dugmeli/  Gizli bölümü sayfa içinde açan düğme (aria-expanded), yalnız betikle çalışan düğme ("Önizle") ve formu gönderen düğme.
//   /kilitli-secim/  "Süre tipi" Kısa'da iki tarihi sayfa doldurup kilitler (readonly; takvim kapatma + tuş engeli), Uzun'da düzenlenebilir.
import type { FiksturIstegi, FiksturYaniti } from './giris-fikstur';

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0 2px}</style></head><body>${govde}</body></html>`
});

export const TARIHLI_SAYFASI = String.raw`<h1>Kayıt formu</h1>
<div><label for="dogum">Doğum Tarihi</label><input id="dogum" name="dogum" value="02.10.2026" autocomplete="off"></div>
<div><label for="kimlik">Kimlik No</label><input id="kimlik" name="kimlik" autocomplete="off"></div>
<div><label for="adSoyad">Ad soyad</label><input id="adSoyad" name="adSoyad" readonly></div>
<p><button type="button" id="gonder">Gönder</button></p>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var kilit = new URLSearchParams(location.search).get('kilit') === '1';
  var SORGU_TARIHI = '02.10.2026', sorgulandi = false;
  // Tuş maskesi: yalnız rakam, gg.aa.yyyy; Ctrl+A engelli (önceden dolu alanda tümünü seçme kısayolu çalışmaz).
  $('dogum').addEventListener('keydown', function (o) { if ((o.ctrlKey || o.metaKey) && o.key.toLowerCase() === 'a') o.preventDefault(); });
  $('dogum').addEventListener('keypress', function (o) {
    o.preventDefault();
    if (!/\d/.test(o.key)) return;
    var r = ($('dogum').value.replace(/\D/g, '') + o.key).slice(0, 8);
    $('dogum').value = r.slice(0, 2) + (r.length > 2 ? '.' + r.slice(2, 4) : '') + (r.length > 4 ? '.' + r.slice(4) : '');
  });
  $('dogum').addEventListener('blur', function () {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test($('dogum').value)) $('dogum').value = '';
    // Kilitli: sorgudan sonra tarih her değişince sorgunun tarihine döner.
    if (kilit && sorgulandi) setTimeout(function () { $('dogum').value = SORGU_TARIHI; }, 50);
  });
  $('kimlik').addEventListener('change', function () {
    fetch('/api/kimlik-sorgu?no=' + encodeURIComponent($('kimlik').value)).then(function (r) { return r.json(); }).then(function (j) {
      $('adSoyad').value = j.ad; $('dogum').value = j.tarih; sorgulandi = true;
    });
  });
  $('gonder').addEventListener('click', function () {
    fetch('/api/tarihli', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dogum: $('dogum').value, kimlik: $('kimlik').value }) })
      .then(function (r) { return r.json(); }).then(function () { $('sonuc').textContent = 'Kayıt tamam'; });
  });
</script>`;

export const KOSULLU_HAZIR_SAYFASI = String.raw`<h1>Başvuru</h1>
<div><label for="ad">Ad</label><input id="ad" name="ad"></div>
<div><label for="baslangic">Başlangıç tarihi</label><input id="baslangic" name="baslangic" value="02.10.2026"></div>
<div><label for="kanal">Kanal</label><select id="kanal" name="kanal"><option value="">Seçiniz</option><option value="web" selected>Web</option><option value="sube">Şube</option></select></div>
<fieldset><legend>Kişi tipi</legend>
  <label><input type="radio" name="tip" value="O" checked> Özel</label> <label><input type="radio" name="tip" value="T"> Tüzel</label></fieldset>
<div id="ozel"><label for="kimlikNo">Kimlik no</label><input id="kimlikNo" name="kimlikNo"></div>
<div id="tuzel" hidden><label for="vergiNo">Vergi no</label><input id="vergiNo" name="vergiNo"></div>
<fieldset><legend>Ödeyen farklı</legend>
  <label><input type="radio" name="farkli" value="H" checked> Hayır</label> <label><input type="radio" name="farkli" value="E"> Evet</label></fieldset>
<div id="odeyen" hidden>
  <fieldset><legend>Ödeyen tipi</legend>
    <label><input type="radio" name="odeyenTipi" value="A"> Kişi</label> <label><input type="radio" name="odeyenTipi" value="B"> Kurum</label></fieldset>
  <label for="odeyenDogum">Ödeyen doğum tarihi</label><input id="odeyenDogum" name="odeyenDogum">
</div>
<p><button type="button" id="kaydet">Kaydet</button></p>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  function goster() {
    var t = document.querySelector('input[name=tip]:checked').value === 'T';
    $('ozel').hidden = t; $('tuzel').hidden = !t;
    var e = document.querySelector('input[name=farkli]:checked').value === 'E';
    $('odeyen').hidden = !e;
    // Evet seçilince sayfa ödeyenin alanlarını ÖNDOLDURUR; Hayır'da temizler.
    if (e) { document.querySelector('input[name=odeyenTipi][value=A]').checked = true; $('odeyenDogum').value = '02.10.2026'; }
    else { document.querySelectorAll('input[name=odeyenTipi]').forEach(function (r) { r.checked = false; }); $('odeyenDogum').value = ''; }
  }
  document.querySelectorAll('input[name=tip], input[name=farkli]').forEach(function (r) { r.addEventListener('change', goster); });
  $('kaydet').addEventListener('click', function () { $('sonuc').textContent = 'Kayıt alındı'; });
</script>`;

export const BASIT_SAYFASI = String.raw`<h1>Selam</h1>
<div><label for="ad">Ad</label><input id="ad" name="ad"></div>
<p><button type="button" id="gonder">Gönder</button></p>
<div id="sonuc" role="status"></div>
<script>
  document.getElementById('gonder').addEventListener('click', function () {
    fetch('/api/selam?ad=' + encodeURIComponent(document.getElementById('ad').value)).then(function (r) { return r.json(); })
      .then(function (j) { document.getElementById('sonuc').textContent = 'Merhaba ' + j.ad; });
  });
</script>`;

const ISLEMLER = Array.from({ length: 70 }, (_, i) => `<button type="button" class="islem" onclick="this.dataset.b='1'">İşlem ${i + 1}</button>`).join(' ');
export const PENCERE_SAYFASI = String.raw`<style>
  .ikon { display:inline-block; width:14px; height:14px; cursor:pointer; margin-left:4px; vertical-align:middle }
  .ikon::before { content:'\2139'; color:#2a8 }
  .ortu { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:1000 }
  .kutu { position:fixed; top:80px; left:50%; transform:translateX(-50%); width:420px; background:#fff; padding:16px; z-index:1001 }
  .kutu a, .kutu .kart { display:block; margin:6px 0; cursor:pointer; color:#036 }
</style>
<h1>İşlemler</h1>
<div id="TheForm">
  <div class="satir"><div class="etiket">Kişi tipi <span class="ikon" onclick="this.dataset.b='1'"></span></div>
    <div class="deger"><label><input type="radio" name="tip" value="O" checked> Özel</label> <span class="ikon" onclick="this.dataset.b='1'"></span>
    <label><input type="radio" name="tip" value="T"> Tüzel</label></div></div>
  <div class="satir"><div class="etiket"><label for="no">Numara</label></div><div class="deger"><input id="no" name="no"> <span class="ikon" onclick="this.dataset.b='1'"></span></div></div>
</div>
<p><button type="button" id="ac">Pencereyi aç</button></p>
<div class="islemler">${ISLEMLER}</div>
<div id="sonuc" role="status"></div>
<script>
  document.getElementById('ac').addEventListener('click', function () {
    var o = document.createElement('div'); o.className = 'ortu'; document.body.appendChild(o);
    var k = document.createElement('div'); k.className = 'kutu';
    k.innerHTML = '<a class="dis">Dış sistemden devam et</a>'
      + '<label for="plan">Taksit planı</label><select id="plan" name="plan"><option value="">Seçiniz</option><option value="3">3 taksit</option><option value="6">6 taksit</option></select>'
      + ' <button type="button" id="tamamla">Tamamla</button>'
      + '<span class="kart" onclick="document.getElementById(\'sonuc\').textContent=\'Kartla tamamlandı\'">Kartla tamamla</span>';
    document.body.appendChild(k);
    k.querySelector('.dis').addEventListener('click', function () { document.getElementById('sonuc').textContent = 'Dış sistem'; });
  });
</script>`;

/** /dal-agaci/ adres ağacı: il → ilçe → binalar (gecikmeli istekle dolar). */
const AGAC: Record<string, { ad: string; ilce: [string, string]; binalar: Array<[string, string]> }> = {
  '06': { ad: 'Ankara', ilce: ['0602', 'Keçiören'], binalar: [['b1', 'Bina 1'], ['b2', 'Bina 2']] },
  '34': { ad: 'İstanbul', ilce: ['3401', 'Kadıköy'], binalar: [['b3', 'Bina 3']] },
  '01': { ad: 'Adana', ilce: ['0101', 'Seyhan'], binalar: [['b4', 'Bina 4']] }
};

/**
 * /dal-agaci/: iki düzey koşullu radyo (Kişi tipi Özel / Tüzel → Kimlik no / Vergi no; Ödeyen farklı Hayır / Evet → Evet'te İÇ İÇE
 * "Ödeyen tipi" Özel / Tüzel → Ödeyen kimlik no / Ödeyen vergi no), görünürlüğü değiştirmeyen radyo (Konut durumu Kiracı / Ev sahibi) ve
 * İl → İlçe → Bina zinciri; "Kaydet" → "Kayıt alındı".
 */
export const DAL_AGACI_SAYFASI = String.raw`<h1>Başvuru</h1>
<fieldset><legend>Kişi tipi</legend>
  <label><input type="radio" name="tip" value="O" checked> Özel</label> <label><input type="radio" name="tip" value="T"> Tüzel</label></fieldset>
<div id="o"><label for="kimlik">Kimlik no</label><input id="kimlik" name="kimlik"></div>
<div id="t" hidden><label for="vergi">Vergi no</label><input id="vergi" name="vergi"></div>
<fieldset><legend>Ödeyen farklı</legend>
  <label><input type="radio" name="farkli" value="H" checked> Hayır</label> <label><input type="radio" name="farkli" value="E"> Evet</label></fieldset>
<div id="e" hidden>
  <fieldset><legend>Ödeyen tipi</legend>
    <label><input type="radio" name="odeyenTipi" value="O"> Özel</label> <label><input type="radio" name="odeyenTipi" value="T"> Tüzel</label></fieldset>
  <div id="eo" hidden><label for="odeyenKimlik">Ödeyen kimlik no</label><input id="odeyenKimlik" name="odeyenKimlik"></div>
  <div id="et" hidden><label for="odeyenVergi">Ödeyen vergi no</label><input id="odeyenVergi" name="odeyenVergi"></div>
</div>
<fieldset><legend>Konut durumu</legend>
  <label><input type="radio" name="durum" value="K" checked> Kiracı</label> <label><input type="radio" name="durum" value="S"> Ev sahibi</label></fieldset>
<label for="il">İl</label><select id="il" name="il"><option value="">Seçiniz</option>${Object.entries(AGAC).map(([k, v]) => `<option value="${k}">${v.ad}</option>`).join('')}</select>
<label for="ilce">İlçe</label><select id="ilce" name="ilce"><option value="">Seçiniz</option></select>
<label for="bina">Bina</label><select id="bina" name="bina"><option value="">Seçiniz</option></select>
<p><button type="button" id="kaydet">Kaydet</button></p>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var sec = function (ad) { var r = document.querySelector('input[name=' + ad + ']:checked'); return r ? r.value : ''; };
  function goster() {
    $('o').hidden = sec('tip') !== 'O'; $('t').hidden = sec('tip') !== 'T';
    $('e').hidden = sec('farkli') !== 'E';
    $('eo').hidden = sec('farkli') !== 'E' || sec('odeyenTipi') !== 'O'; $('et').hidden = sec('farkli') !== 'E' || sec('odeyenTipi') !== 'T';
  }
  document.querySelectorAll('input[type=radio]').forEach(function (r) { r.addEventListener('change', goster); });
  function doldur(l, liste) { l.innerHTML = '<option value="">Seçiniz</option>' + liste.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join(''); }
  $('il').addEventListener('change', function () {
    doldur($('ilce'), []); doldur($('bina'), []);
    if (!this.value) return;
    fetch('/api/agac-ilce?il=' + this.value).then(function (r) { return r.json(); }).then(function (j) { doldur($('ilce'), j); });
  });
  $('ilce').addEventListener('change', function () {
    doldur($('bina'), []);
    if (!this.value) return;
    fetch('/api/agac-bina?il=' + $('il').value).then(function (r) { return r.json(); }).then(function (j) { doldur($('bina'), j); });
  });
  $('kaydet').addEventListener('click', function () { $('sonuc').textContent = 'Kayıt alındı'; });
</script>`;

/**
 * /etiketli/: seçime göre ETİKETİ değişen alanlar; gerçek bir formun yapısıyla (etiketler "for" ile DEĞİL, satırdaki span ile bağlı; radyo ve
 * açılır liste gizli girdili süsleme bileşenleriyle sarılı). Kişi tipi (Özel / Tüzel): Özel'de "Doğum tarihi" görünür, kutuların adları
 * "Kimlik no" (en çok 11) ve "Cep telefonu"; Tüzel'de doğum tarihi gizlenir, AYNI kutuların adı "Vergi no" (en çok 10) ve "İş telefonu"
 * olur (yeni alan belirmez). Doğum tarihi takvim bileşenli, tuşla yazmayı engeller (onkeypress="return false;"), varsayılan değerli.
 * "Seçenek no": gizli <select> + seçili metni gösteren kutu + gizli liste (değişince salt okunur "Hesaplanan tutar" ve "Ek tutar" sayfa
 * tarafından dolar; başta boş). Adres farklı (Hayır / Evet): Evet'te gerçekten yeni alan ("Adres") açılır. "Kaydet": POST /api/etiketli
 * (görünen alanlar) → "Kayıt alındı".
 */
export const ETIKETLI_SAYFASI = String.raw`<style>
  .satir { margin: 6px 0; } .yLabel { display: inline-block; min-width: 140px; }
  .jqTransformHidden { display: none; }
  .jqTransformRadio, .jqTransformSelectOpen { display: inline-block; width: 14px; height: 14px; border: 1px solid #888; vertical-align: middle; }
  .jqTransformRadio.jqTransformChecked { background: #036; }
  .jqTransformSelectWrapper { display: inline-block; position: relative; } .jqTransformSelectWrapper > div { display: inline-block; min-width: 80px; border: 1px solid #888; padding: 2px 4px; }
  .jqTransformSelectWrapper ul { position: absolute; background: #fff; border: 1px solid #888; list-style: none; margin: 0; padding: 0; z-index: 5; }
</style>
<h1>Başvuru</h1>
<div class="satir"><span class="yLabel">Kişi tipi</span>
  <span class="jqTransformRadioWrapper"><a href="#" class="jqTransformRadio jqTransformChecked" rel="tip"></a><input type="radio" class="jqTransformHidden" id="tipO" name="tip" value="O" checked></span><label for="tipO">Özel</label>
  <span class="jqTransformRadioWrapper"><a href="#" class="jqTransformRadio" rel="tip"></a><input type="radio" class="jqTransformHidden" id="tipT" name="tip" value="T"></span><label for="tipT">Tüzel</label></div>
<div class="satir"><span class="yLabel">Ad</span><input id="ad" name="ad"></div>
<div class="satir" id="dogumKap"><span class="yLabel">Doğum tarihi</span><input id="dogum" name="dogum" class="hasDatepicker" onkeypress="return false;" value="02.10.2026"></div>
<div class="satir"><span class="yLabel" id="kimlikAdi">Kimlik no</span><input id="kimlik" name="kimlik" maxlength="11"></div>
<div class="satir"><span class="yLabel" id="telefonAdi">Cep telefonu</span><input id="telefon" name="telefon"></div>
<div class="satir"><span class="yLabel">Seçenek no</span><div class="jqTransformSelectWrapper"><div><span>1</span><a href="#" class="jqTransformSelectOpen"></a></div>
  <ul style="display:none"><li><a href="#" index="0">Lütfen seçiniz...</a></li><li><a href="#" index="1" class="selected">1</a></li><li><a href="#" index="2">2</a></li></ul>
  <select id="secenekNo" name="secenekNo" class="jqTransformHidden"><option value="-1">Lütfen seçiniz...</option><option value="1" selected>1</option><option value="2">2</option></select></div></div>
<div class="satir"><span class="yLabel">Hesaplanan tutar</span><input id="hesap" name="hesap" readonly></div>
<div class="satir"><span class="yLabel">Ek tutar</span><input id="ekTutar" name="ekTutar" readonly></div>
<fieldset><legend>Adres farklı</legend>
  <label><input type="radio" name="farkli" value="H" checked> Hayır</label> <label><input type="radio" name="farkli" value="E"> Evet</label></fieldset>
<div id="adresKap" hidden><label for="adres">Adres</label><input id="adres" name="adres"></div>
<p><button type="button" id="kaydet">Kaydet</button></p>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var sec = function (ad) { var r = document.querySelector('input[name=' + ad + ']:checked'); return r ? r.value : ''; };
  function goster() {
    var t = sec('tip') === 'T';
    $('dogumKap').hidden = t;
    $('kimlikAdi').textContent = t ? 'Vergi no' : 'Kimlik no';
    $('kimlik').maxLength = t ? 10 : 11;
    $('telefonAdi').textContent = t ? 'İş telefonu' : 'Cep telefonu';
    $('adresKap').hidden = sec('farkli') !== 'E';
    document.querySelectorAll('.jqTransformRadio').forEach(function (a) { a.classList.toggle('jqTransformChecked', a.nextElementSibling.checked); });
  }
  document.querySelectorAll('input[type=radio]').forEach(function (r) { r.addEventListener('change', goster); });
  // Süslü radyo: görünen kutuya tıklanınca gizli radyo seçilir.
  document.querySelectorAll('.jqTransformRadio').forEach(function (a) {
    a.addEventListener('click', function (o) { o.preventDefault(); var r = a.nextElementSibling; r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  });
  // Süslü liste: kutu açılır, listedeki seçeneğe tıklanınca gizli <select> seçilir (change), kutunun yazısı güncellenir.
  var liste = document.querySelector('.jqTransformSelectWrapper ul');
  document.querySelector('.jqTransformSelectOpen').addEventListener('click', function (o) { o.preventDefault(); liste.style.display = liste.style.display === 'none' ? 'block' : 'none'; });
  liste.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function (o) {
      o.preventDefault();
      var s = $('secenekNo'); s.selectedIndex = Number(a.getAttribute('index'));
      document.querySelector('.jqTransformSelectWrapper > div > span').textContent = a.textContent;
      liste.style.display = 'none';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  // Hesaplanan (salt okunur) alanlar: seçenek değişince sayfa doldurur.
  $('secenekNo').addEventListener('change', function () {
    var n = Number(this.value);
    $('hesap').value = n > 0 ? String(n * 100) : ''; $('ekTutar').value = n > 0 ? String(n * 15) : '';
  });
  $('kaydet').addEventListener('click', function () {
    var v = { tip: sec('tip'), ad: $('ad').value, kimlik: $('kimlik').value, telefon: $('telefon').value, secenekNo: $('secenekNo').value };
    if (!$('dogumKap').hidden) v.dogum = $('dogum').value;
    if (!$('adresKap').hidden) v.adres = $('adres').value;
    if ($('hesap').value) v.hesap = $('hesap').value;
    fetch('/api/etiketli', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })
      .then(function (r) { return r.json(); }).then(function () { $('sonuc').textContent = 'Kayıt alındı'; });
  });
</script>`;

/** Süslü gizli radyo (etiket satırdaki span'da; gizli girdi + görünen kutu): /ic-ice/ için. */
const susluRadyo = (ad: string, deger: string, metin: string, secili: boolean): string => `<span class="jqTransformRadioWrapper"><a href="#" class="jqTransformRadio${secili ? ' jqTransformChecked' : ''}" rel="${ad}"></a><input type="radio" class="jqTransformHidden" id="${ad}${deger}" name="${ad}" value="${deger}"${secili ? ' checked' : ''}></span><label for="${ad}${deger}">${metin}</label>`;

/**
 * /ic-ice/: İKİ DÜZEY seçim. "Farklı kişi" (Hayır / Evet; süslü gizli radyo) Evet olunca açılışta GİZLİ ikinci kişi bölümü açılır: kendi
 * "Kişi tipi (2)" radyosu (Özel / Tüzel) ve alanları — "Cep telefonu (2)", "Doğum tarihi (2)", "Kimlik no (2)" (en çok 11). Kişi tipi (2)
 * Tüzel olunca bölümün AYNI kutularının adı değişir ("Vergi no (2)" en çok 10, "İş telefonu (2)") ve doğum tarihi gizlenir. Etiketler
 * satırdaki span'da. "Kaydet": POST /api/ic-ice (görünen alanlar) → "Kayıt alındı". ?gec=1: bölüm Evet'ten sonra gecikmeli bir sorgunun
 * (3,5 sn) yanıtıyla açılır (ilk keşif bekleme süresinde görmez; yerinde keşif görür).
 */
export const IC_ICE_SAYFASI = String.raw`<style>
  .satir { margin: 6px 0; } .yLabel { display: inline-block; min-width: 140px; } .jqTransformHidden { display: none; }
  .jqTransformRadio { display: inline-block; width: 14px; height: 14px; border: 1px solid #888; vertical-align: middle; } .jqTransformRadio.jqTransformChecked { background: #036; }
</style>
<h1>Başvuru</h1>
<div class="satir"><span class="yLabel">Ad</span><input id="ad" name="ad"></div>
<div class="satir"><span class="yLabel">Farklı kişi</span>${susluRadyo('farkli', 'H', 'Hayır', true)} ${susluRadyo('farkli', 'E', 'Evet', false)}</div>
<div id="ikinci" hidden>
  <div class="satir"><span class="yLabel">Kişi tipi (2)</span>${susluRadyo('tip2', 'O', 'Özel', true)} ${susluRadyo('tip2', 'T', 'Tüzel', false)}</div>
  <div class="satir"><span class="yLabel" id="telefon2Adi">Cep telefonu (2)</span><input id="telefon2" name="telefon2"></div>
  <div class="satir" id="dogum2Kap"><span class="yLabel">Doğum tarihi (2)</span><input id="dogum2" name="dogum2"></div>
  <div class="satir"><span class="yLabel" id="kimlik2Adi">Kimlik no (2)</span><input id="kimlik2" name="kimlik2" maxlength="11"></div>
</div>
<p><button type="button" id="kaydet">Kaydet</button></p>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var sec = function (ad) { var r = document.querySelector('input[name=' + ad + ']:checked'); return r ? r.value : ''; };
  function goster() {
    $('ikinci').hidden = sec('farkli') !== 'E';
    var t = sec('tip2') === 'T';
    $('dogum2Kap').hidden = t;
    $('kimlik2Adi').textContent = t ? 'Vergi no (2)' : 'Kimlik no (2)';
    $('kimlik2').maxLength = t ? 10 : 11;
    $('telefon2Adi').textContent = t ? 'İş telefonu (2)' : 'Cep telefonu (2)';
    document.querySelectorAll('.jqTransformRadio').forEach(function (a) { a.classList.toggle('jqTransformChecked', a.nextElementSibling.checked); });
  }
  // ?gec=1: ikinci bölüm Evet'ten sonra gecikmeli bir sorgunun (GET /api/ic-ice-bolum) yanıtıyla açılır.
  var gec = new URLSearchParams(location.search).get('gec') === '1';
  document.querySelectorAll('input[name=farkli]').forEach(function (r) { r.addEventListener('change', function () {
    if (gec && sec('farkli') === 'E') fetch('/api/ic-ice-bolum').then(function () { goster(); }); else goster();
  }); });
  document.querySelectorAll('input[name=tip2]').forEach(function (r) { r.addEventListener('change', goster); });
  document.querySelectorAll('.jqTransformRadio').forEach(function (a) {
    a.addEventListener('click', function (o) { o.preventDefault(); var r = a.nextElementSibling; r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  });
  $('kaydet').addEventListener('click', function () {
    var v = { ad: $('ad').value, farkli: sec('farkli') };
    if (!$('ikinci').hidden) { v.tip2 = sec('tip2'); v.telefon2 = $('telefon2').value; v.kimlik2 = $('kimlik2').value; if (!$('dogum2Kap').hidden) v.dogum2 = $('dogum2').value; }
    fetch('/api/ic-ice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })
      .then(function (r) { return r.json(); }).then(function () { $('sonuc').textContent = 'Kayıt alındı'; });
  });
</script>`;

/**
 * /adimli/: iki adımlı form. Açılışta yalnız "Ad" ve "İleri"; "İleri"ye basınca sayfanın EN ALTINA (açılışta olmayan) ikinci adım
 * eklenir: "Kişi tipi" (Özel / Tüzel), "Doğum tarihi" (Tüzel'de gizli), "Kimlik no" (en çok 11; Tüzel'de "Vergi no", en çok 10) ve
 * "Kaydet" (POST /api/adimli → "Kayıt alındı").
 */
export const ADIMLI_SAYFASI = String.raw`<h1>Başvuru</h1>
<div><label for="ad">Ad</label><input id="ad" name="ad"></div>
<p><button type="button" id="ileri">İleri</button></p>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  $('ileri').addEventListener('click', function () {
    if ($('adim2')) return;
    var d = document.createElement('div'); d.id = 'adim2';
    d.innerHTML = '<h2>İkinci adım</h2><fieldset><legend>Kişi tipi</legend><label><input type="radio" name="tip" value="O" checked> Özel</label> <label><input type="radio" name="tip" value="T"> Tüzel</label></fieldset>'
      + '<div id="dogumKap"><label for="dogum">Doğum tarihi</label><input id="dogum" name="dogum"></div>'
      + '<div><label for="kimlik" id="kimlikAdi">Kimlik no</label><input id="kimlik" name="kimlik" maxlength="11"></div>'
      + '<p><button type="button" id="kaydet">Kaydet</button></p>';
    document.body.appendChild(d);
    d.querySelectorAll('input[name=tip]').forEach(function (r) { r.addEventListener('change', function () {
      var t = document.querySelector('input[name=tip]:checked').value === 'T';
      $('dogumKap').hidden = t; $('kimlikAdi').textContent = t ? 'Vergi no' : 'Kimlik no'; $('kimlik').maxLength = t ? 10 : 11;
    }); });
    $('kaydet').addEventListener('click', function () {
      var v = { ad: $('ad').value, tip: document.querySelector('input[name=tip]:checked').value, kimlik: $('kimlik').value };
      if (!$('dogumKap').hidden) v.dogum = $('dogum').value;
      fetch('/api/adimli', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })
        .then(function (r) { return r.json(); }).then(function () { $('sonuc').textContent = 'Kayıt alındı'; });
    });
  });
</script>`;

/**
 * /kesif-dugmeli/: açılışta GİZLİ bölüm ve onu sayfa içinde açan düğme (type=button, aria-expanded / aria-controls: "Ek bölüm"), bölümde
 * iki alan ("Ek alan 1", "Ek alan 2"); yalnız betikle çalışan "Önizle" (basınca "Ek alan 3" açılır); formu gönderen düğme ("Gönder", form
 * içinde submit: POST /api/kesif-dugmeli → "Kayıt alındı").
 */
export const KESIF_DUGMELI_SAYFASI = String.raw`<h1>Başvuru</h1>
<form id="form">
  <div><label for="ad">Ad</label><input id="ad" name="ad"></div>
  <p><button type="button" id="ekAc" aria-expanded="false" aria-controls="ekBolum">Ek bölüm</button></p>
  <div id="ekBolum" hidden><label for="ek1">Ek alan 1</label><input id="ek1" name="ek1"> <label for="ek2">Ek alan 2</label><input id="ek2" name="ek2"></div>
  <p><button type="button" id="onizle">Önizle</button></p>
  <div id="onizleBolum" hidden><label for="ek3">Ek alan 3</label><input id="ek3" name="ek3"></div>
  <p><button type="submit" id="gonder">Gönder</button></p>
</form>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  // Yalnız betikle çalışan düğme (ne yaptığı sayfadan anlaşılmaz): basınca bir alan açar.
  $('onizle').addEventListener('click', function () { $('onizleBolum').hidden = false; });
  $('ekAc').addEventListener('click', function () { var acik = $('ekBolum').hidden; $('ekBolum').hidden = !acik; this.setAttribute('aria-expanded', String(acik)); });
  $('form').addEventListener('submit', function (o) {
    o.preventDefault();
    fetch('/api/kesif-dugmeli', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ad: $('ad').value }) })
      .then(function (r) { return r.json(); }).then(function () { $('sonuc').textContent = 'Kayıt alındı'; }).catch(function () { $('sonuc').textContent = 'Gönderilemedi'; });
  });
</script>`;

/**
 * /kilitli-secim/: seçime göre DÜZENLENEMEYEN alanlar. "Süre tipi" (Kısa / Uzun; açılışta Kısa). Kısa'da sayfa iki tarihi kendisi doldurur
 * ve kilitler: "Başlangıç tarihi" readonly niteliğiyle, "Bitiş tarihi" yalnız takvim bileşeninin kapatılmasıyla (kilit sınıfı) ve tuş
 * engeliyle (readonly / disabled YOK). Uzun'da ikisi de düzenlenebilir (değerleri kalır). Kısa seçiliyken tarihlere gelen her tuş / girdi /
 * değişiklik olayı sayılır (dokunma). "Kaydet": POST /api/kilitli-secim (değerler + dokunma) → "Kayıt alındı".
 */
export const KILITLI_SECIM_SAYFASI = String.raw`<h1>Başvuru</h1>
<div><label for="ad">Ad</label><input id="ad" name="ad" autocomplete="off"></div>
<fieldset><legend>Süre tipi</legend>
  <label><input type="radio" name="sure" value="K" checked> Kısa</label> <label><input type="radio" name="sure" value="U"> Uzun</label></fieldset>
<div><label for="baslangic">Başlangıç tarihi</label><input id="baslangic" name="baslangic" autocomplete="off"></div>
<div><label for="bitis">Bitiş tarihi</label><input id="bitis" name="bitis" class="hasDatepicker" autocomplete="off"></div>
<p><button type="button" id="kaydet">Kaydet</button></p>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var sec = function (ad) { var r = document.querySelector('input[name=' + ad + ']:checked'); return r ? r.value : ''; };
  var dokunma = 0;
  var engel = function (o) { o.preventDefault(); };
  ['baslangic', 'bitis'].forEach(function (id) {
    ['keydown', 'keypress', 'beforeinput', 'input', 'change', 'paste'].forEach(function (t) { $(id).addEventListener(t, function () { if (sec('sure') === 'K') dokunma++; }); });
  });
  function uygula() {
    var kisa = sec('sure') === 'K';
    if (kisa) { $('baslangic').value = '05.10.2026'; $('bitis').value = '05.11.2026'; }
    $('baslangic').readOnly = kisa;
    $('bitis').classList.toggle('disabled', kisa);
    if (kisa) $('bitis').addEventListener('keydown', engel); else $('bitis').removeEventListener('keydown', engel);
  }
  document.querySelectorAll('input[name=sure]').forEach(function (r) { r.addEventListener('change', uygula); });
  uygula();
  $('kaydet').addEventListener('click', function () {
    var v = { sure: sec('sure'), ad: $('ad').value, baslangic: $('baslangic').value, bitis: $('bitis').value, dokunma: dokunma };
    fetch('/api/kilitli-secim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })
      .then(function (r) { return r.json(); }).then(function () { $('sonuc').textContent = 'Kayıt alındı'; });
  });
</script>`;

/**
 * /arac-sorgu/: veri → düğme → veri. "Kod" yazılıp "Sorgula"ya basılınca sayfa "Marka"yı doldurur ve "Tip"i SİLER (Seçiniz'e döner);
 * Tip aramadan SONRA seçilmelidir. Her sorgunun kodu kaydedilir (GET /api/arac-sorgu?kod=). "Kaydet": POST /api/arac-sorgu → "Kayıt alındı".
 */
export const ARAC_SORGU_SAYFASI = String.raw`<h1>Araç</h1>
<div><label for="kod">Kod</label><input id="kod" name="kod" autocomplete="off"></div>
<div><label for="tip">Tip</label><select id="tip" name="tip"><option value="">Seçiniz</option><option value="1">BİNEK</option><option value="2">TİCARİ</option></select></div>
<div><label for="marka">Marka</label><input id="marka" name="marka" readonly></div>
<p><button type="button" id="sorgula">Sorgula</button> <button type="button" id="kaydet">Kaydet</button></p>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  $('sorgula').addEventListener('click', function () {
    fetch('/api/arac-sorgu?kod=' + encodeURIComponent($('kod').value)).then(function (r) { return r.json(); })
      .then(function (y) { $('marka').value = y.marka; $('tip').selectedIndex = 0; });
  });
  $('kaydet').addEventListener('click', function () {
    fetch('/api/arac-sorgu', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kod: $('kod').value, tip: $('tip').value, marka: $('marka').value }) })
      .then(function (r) { return r.json(); }).then(function () { $('sonuc').textContent = 'Kayıt alındı'; });
  });
</script>`;

export class VeriDuragiUygulamasi {
  /** /arac-sorgu/ sorgu kodları ve gönderimleri. */
  readonly aracSorgulari: string[] = [];
  readonly aracKayitlari: Array<Record<string, string>> = [];
  /** /kilitli-secim/ gönderimleri (değerler + Kısa'dayken tarihlere gelen olay sayısı). */
  readonly kilitliKayitlar: Array<Record<string, string | number>> = [];
  /** /ic-ice/, /adimli/ ve /kesif-dugmeli/ gönderimleri. */
  readonly icIceKayitlar: Array<Record<string, string>> = [];
  readonly adimliKayitlar: Array<Record<string, string>> = [];
  readonly kesifDugmeliKayitlar: Array<Record<string, string>> = [];
  /** /etiketli/ gönderimleri (görünen alanların değerleri). */
  readonly etiketliKayitlar: Array<Record<string, string>> = [];
  readonly istekler: string[] = [];
  /** /tarihli/ gönderimleri. */
  readonly tarihliKayitlar: Array<{ dogum: string; kimlik: string }> = [];
  /** /basit/ selam istekleri (Gönder'e basıldığının ve gönderilen adın kanıtı). */
  readonly selamlar: string[] = [];

  readonly isle = (i: FiksturIstegi): FiksturYaniti | null => {
    this.istekler.push(`${i.yontem} ${i.yol}`);
    if (i.yol === '/tarihli/' && i.yontem === 'GET') return html('Kayıt formu', TARIHLI_SAYFASI);
    if (i.yol === '/api/kimlik-sorgu' && i.yontem === 'GET') return { tur: 'application/json', govde: JSON.stringify({ ad: 'D*** K***', tarih: '02.10.2026' }), gecikmeMs: 300 };
    if (i.yol === '/api/tarihli' && i.yontem === 'POST') { this.tarihliKayitlar.push(JSON.parse(i.govde) as { dogum: string; kimlik: string }); return { tur: 'application/json', govde: '{"tamam":true}' }; }
    if (i.yol === '/kosullu-hazir/' && i.yontem === 'GET') return html('Başvuru', KOSULLU_HAZIR_SAYFASI);
    if (i.yol === '/basit/' && i.yontem === 'GET') return html('Selam', BASIT_SAYFASI);
    if (i.yol === '/api/selam' && i.yontem === 'GET') { const ad = i.sorgu.get('ad') ?? ''; this.selamlar.push(ad); return { tur: 'application/json', govde: JSON.stringify({ ad }), gecikmeMs: 200 }; }
    if (i.yol === '/pencere/' && i.yontem === 'GET') return html('İşlemler', PENCERE_SAYFASI);
    if (i.yol === '/dal-agaci/' && i.yontem === 'GET') return html('Başvuru', DAL_AGACI_SAYFASI);
    if (i.yol === '/etiketli/' && i.yontem === 'GET') return html('Başvuru', ETIKETLI_SAYFASI);
    if (i.yol === '/ic-ice/' && i.yontem === 'GET') return html('Başvuru', IC_ICE_SAYFASI);
    if (i.yol === '/adimli/' && i.yontem === 'GET') return html('Başvuru', ADIMLI_SAYFASI);
    if (i.yol === '/kesif-dugmeli/' && i.yontem === 'GET') return html('Başvuru', KESIF_DUGMELI_SAYFASI);
    if (i.yol === '/kilitli-secim/' && i.yontem === 'GET') return html('Başvuru', KILITLI_SECIM_SAYFASI);
    if (i.yol === '/arac-sorgu/' && i.yontem === 'GET') return html('Araç', ARAC_SORGU_SAYFASI);
    if (i.yol === '/api/arac-sorgu' && i.yontem === 'GET') { const kod = i.sorgu.get('kod') ?? ''; this.aracSorgulari.push(kod); return { tur: 'application/json', govde: JSON.stringify({ marka: `MARKA-${kod}` }), gecikmeMs: 200 }; }
    if (i.yol === '/api/arac-sorgu' && i.yontem === 'POST') { this.aracKayitlari.push(JSON.parse(i.govde) as Record<string, string>); return { tur: 'application/json', govde: '{"tamam":true}' }; }
    if (i.yol === '/api/kilitli-secim' && i.yontem === 'POST') { this.kilitliKayitlar.push(JSON.parse(i.govde) as Record<string, string | number>); return { tur: 'application/json', govde: '{"tamam":true}' }; }
    if (i.yol === '/api/ic-ice-bolum' && i.yontem === 'GET') return { tur: 'application/json', govde: '{"tamam":true}', gecikmeMs: 3500 };
    if (i.yol === '/api/ic-ice' && i.yontem === 'POST') { this.icIceKayitlar.push(JSON.parse(i.govde) as Record<string, string>); return { tur: 'application/json', govde: '{"tamam":true}' }; }
    if (i.yol === '/api/adimli' && i.yontem === 'POST') { this.adimliKayitlar.push(JSON.parse(i.govde) as Record<string, string>); return { tur: 'application/json', govde: '{"tamam":true}' }; }
    if (i.yol === '/api/kesif-dugmeli' && i.yontem === 'POST') { this.kesifDugmeliKayitlar.push(JSON.parse(i.govde) as Record<string, string>); return { tur: 'application/json', govde: '{"tamam":true}' }; }
    if (i.yol === '/api/etiketli' && i.yontem === 'POST') { this.etiketliKayitlar.push(JSON.parse(i.govde) as Record<string, string>); return { tur: 'application/json', govde: '{"tamam":true}' }; }
    if (i.yol === '/api/agac-ilce' && i.yontem === 'GET') { const a = AGAC[i.sorgu.get('il') ?? '']; return { tur: 'application/json', govde: JSON.stringify(a ? [a.ilce] : []), gecikmeMs: 150 }; }
    if (i.yol === '/api/agac-bina' && i.yontem === 'GET') { const a = AGAC[i.sorgu.get('il') ?? '']; return { tur: 'application/json', govde: JSON.stringify(a ? a.binalar : []), gecikmeMs: 150 }; }
    return null;
  };
}
