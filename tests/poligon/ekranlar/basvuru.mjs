// İŞ BAŞVURUSU — 3 adımlı sihirbaz (adım göstergesi, İleri / Geri; adımlar aynı sayfada gizlenip gösterilir — üç "İleri" düğmesi DOM'da).
// Adım 1: kişisel bilgiler. Adım 2: "Pozisyon" SEÇİMİ DEĞİŞİNCE pozisyona özgü alanlar belirir (Yazılım → "Kod deposu adresi"
// (zorunlu); Saha satış → "Ehliyet sınıfı" (zorunlu) + "Bölge"), beceri etiketleri (yaz + Enter ile ekle, × ile sil; en az biri zorunlu),
// özgeçmiş yükleme (dosya; zorunlu). Adım 3: özet + onay kutusu + "Başvuruyu gönder" (multipart).
import { belge, dosyalariOku, json, kaydet } from '../ortak.mjs';

const KOK = '/basvuru';

const stil = `
body{margin:0;font:15px/1.55 "Trebuchet MS",sans-serif;background:#f5f8ff;color:#1a2a4a}
main{max-width:720px;margin:32px auto;background:#fff;border-radius:10px;padding:26px 32px;box-shadow:0 4px 18px #1a2a4a14}
ol.adimlar{display:flex;list-style:none;padding:0;gap:8px;counter-reset:a}ol.adimlar li{flex:1;padding:8px;border-bottom:4px solid #d5def0;color:#8796b5}
ol.adimlar li.aktif{border-color:#2f6fed;color:#1a2a4a;font-weight:bold}
.alan{margin:12px 0}label{display:block;font-size:13px;margin-bottom:3px}input,select{width:100%;box-sizing:border-box;padding:9px;border:1px solid #c6d1e8;border-radius:6px}
.etiketler{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.etiket{background:#e3ecff;border-radius:14px;padding:3px 6px 3px 12px}
.etiket button{border:0;background:none;cursor:pointer;font-weight:bold;color:#2f6fed}
.alt{display:flex;justify-content:space-between;margin-top:18px}.btn{background:#2f6fed;color:#fff;border:0;border-radius:6px;padding:10px 20px;cursor:pointer}
.btn.gri{background:#e8edf7;color:#1a2a4a}.hata{color:#c62828;font-size:13px}dl{display:grid;grid-template-columns:160px 1fr}`;

const govde = String.raw`<main>
<h1>İş başvurusu</h1>
<ol class="adimlar"><li class="aktif">1 · Kişisel</li><li>2 · Deneyim</li><li>3 · Özet</li></ol>
<form id="form" novalidate>
<section data-adim="1">
  <div class="alan"><label for="ad">Ad</label><input id="ad" name="ad"></div>
  <div class="alan"><label for="soyad">Soyad</label><input id="soyad" name="soyad"></div>
  <div class="alan"><label for="eposta">E-posta</label><input id="eposta" name="eposta" type="email"></div>
  <div class="hata" role="alert"></div>
  <div class="alt"><span></span><button type="button" class="btn ileri">İleri</button></div>
</section>
<section data-adim="2" hidden>
  <div class="alan"><label for="pozisyon">Pozisyon</label><select id="pozisyon" name="pozisyon"><option value="">Pozisyon seçin</option><option value="yazilim">Yazılım geliştirici</option><option value="satis">Saha satış uzmanı</option><option value="destek">Müşteri destek uzmanı</option></select></div>
  <div class="alan" data-poz="yazilim" hidden><label for="depo">Kod deposu adresi</label><input id="depo" name="depo" placeholder="https://"></div>
  <div class="alan" data-poz="satis" hidden><label for="ehliyet">Ehliyet sınıfı</label><select id="ehliyet" name="ehliyet"><option value="">Seçiniz</option><option>B</option><option>C</option><option>D</option></select></div>
  <div class="alan" data-poz="satis" hidden><label for="bolge">Tercih edilen bölge</label><input id="bolge" name="bolge"></div>
  <div class="alan"><label for="deneyim">Deneyim (yıl)</label><input id="deneyim" name="deneyim" type="number" min="0" max="50"></div>
  <div class="alan"><label for="beceri">Beceriler (yazıp Enter'a basın)</label><input id="beceri" autocomplete="off"><div class="etiketler" id="etiketler"></div></div>
  <div class="alan"><label for="ozgecmis">Özgeçmiş (PDF ya da metin)</label><input id="ozgecmis" name="ozgecmis" type="file" accept=".pdf,.txt"></div>
  <div class="hata" role="alert"></div>
  <div class="alt"><button type="button" class="btn gri geri">Geri</button><button type="button" class="btn ileri">İleri</button></div>
</section>
<section data-adim="3" hidden>
  <dl id="ozet"></dl>
  <label><input type="checkbox" id="dogruluk" style="width:auto"> Bilgilerimin doğruluğunu onaylıyorum</label>
  <div class="hata" role="alert"></div>
  <div class="alt"><button type="button" class="btn gri geri">Geri</button><button type="submit" class="btn">Başvuruyu gönder</button></div>
</section>
</form>
<div id="sonuc" role="status"></div>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
var adim = 1, beceriler = [];
function goster(n){
  adim = n;
  document.querySelectorAll('section[data-adim]').forEach(function(s){ s.hidden = Number(s.dataset.adim) !== n; s.querySelector('.hata').textContent = ''; });
  document.querySelectorAll('ol.adimlar li').forEach(function(l, i){ l.className = i + 1 === n ? 'aktif' : ''; });
}
function etiketCiz(){
  $('etiketler').innerHTML = '';
  beceriler.forEach(function(b, i){
    var e = document.createElement('span'); e.className = 'etiket'; e.innerHTML = b + ' <button type="button" aria-label="' + b + ' etiketini kaldır">×</button>';
    e.querySelector('button').onclick = function(){ beceriler.splice(i, 1); etiketCiz(); };
    $('etiketler').appendChild(e);
  });
}
$('beceri').addEventListener('keydown', function(o){
  if (o.key !== 'Enter') return; o.preventDefault();
  var v = this.value.trim(); if (v && beceriler.indexOf(v) < 0) { beceriler.push(v); etiketCiz(); } this.value = '';
});
$('pozisyon').addEventListener('change', function(){
  var p = this.value; document.querySelectorAll('[data-poz]').forEach(function(d){ d.hidden = d.dataset.poz !== p; });
});
function hata(m){ document.querySelector('section[data-adim="' + adim + '"] .hata').textContent = m; return false; }
function gecerli(){
  var v = function(id){ return $(id).value.trim(); };
  if (adim === 1) return v('ad') && v('soyad') && /@/.test(v('eposta')) ? true : hata('Ad, soyad ve geçerli bir e-posta zorunludur.');
  if (adim === 2) {
    if (!v('pozisyon')) return hata('Pozisyon seçin.');
    if (v('pozisyon') === 'yazilim' && !v('depo')) return hata('Kod deposu adresi zorunludur.');
    if (v('pozisyon') === 'satis' && !v('ehliyet')) return hata('Ehliyet sınıfı zorunludur.');
    if (!beceriler.length) return hata('En az bir beceri ekleyin.');
    if (!$('ozgecmis').files.length) return hata('Özgeçmiş yükleyin.');
  }
  return true;
}
document.querySelectorAll('.ileri').forEach(function(b){ b.onclick = function(){
  if (!gecerli()) return;
  if (adim === 2) $('ozet').innerHTML = '<dt>Ad soyad</dt><dd>' + $('ad').value + ' ' + $('soyad').value + '</dd><dt>Pozisyon</dt><dd>' + $('pozisyon').selectedOptions[0].text + '</dd><dt>Beceriler</dt><dd>' + beceriler.join(', ') + '</dd><dt>Özgeçmiş</dt><dd>' + $('ozgecmis').files[0].name + '</dd>';
  goster(adim + 1);
}; });
document.querySelectorAll('.geri').forEach(function(b){ b.onclick = function(){ goster(adim - 1); }; });
$('form').onsubmit = function(o){
  o.preventDefault();
  if (!$('dogruluk').checked) return hata('Onay kutusunu işaretleyin.');
  var f = new FormData(this); f.append('beceriler', beceriler.join(','));
  fetch('/basvuru/api/gonder', { method: 'POST', body: f }).then(function(r){ return r.json(); }).then(function(j){
    $('form').hidden = true; document.querySelector('ol.adimlar').hidden = true;
    $('sonuc').innerHTML = '<h2>Teşekkürler</h2><p>Başvurunuz alındı. Başvuru no: ' + j.no + '</p>';
  });
};`;

let no = 5000;
export default {
  kok: KOK, ad: 'İş başvurusu', alan: 'insan kaynakları',
  teknikler: ['sihirbaz (aynı sayfada adımlar, 3 İleri)', 'seçime göre beliren zorunlu alanlar', 'beceri etiketi ekle/sil', 'dosya yükleme', 'onay kutusu'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/basvuru/' || i.yol === '/basvuru')) return belge({ kok: KOK, baslik: 'İş başvurusu', stil, govde, betik });
    if (i.yol === '/basvuru/api/gonder' && i.yontem === 'POST') {
      const { alanlar, dosyalar } = dosyalariOku(i);
      kaydet(s, { ...alanlar, dosyalar });
      return json({ no: `IB-${++no}` }, 200, 800);
    }
    return null;
  }
};
