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
//   /pencere/        Arka planda 70 işlem düğmesi ve alan yanındaki yazısız (::before) simgeler; "Pencereyi aç" → örtü + sabit kutu
//                    (rolsüz): href'siz <a> "Dış sistemden devam et", onclick'li span "Kartla tamamla", "Taksit planı" listesi + "Tamamla".
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

export class VeriDuragiUygulamasi {
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
    if (i.yol === '/api/agac-ilce' && i.yontem === 'GET') { const a = AGAC[i.sorgu.get('il') ?? '']; return { tur: 'application/json', govde: JSON.stringify(a ? [a.ilce] : []), gecikmeMs: 150 }; }
    if (i.yol === '/api/agac-bina' && i.yontem === 'GET') { const a = AGAC[i.sorgu.get('il') ?? '']; return { tur: 'application/json', govde: JSON.stringify(a ? a.binalar : []), gecikmeMs: 150 }; }
    return null;
  };
}
