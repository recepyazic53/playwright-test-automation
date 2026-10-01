// KİRALIK EV ARAMA — konum + filtreler (onay kutuları, oda sayısı) → "Ara" → çok sayıda ilan kartı (aynı metinli "İncele") → karta
// basınca HASH rota (#/ilan/<no>) ile detay görünümü → "Randevu talep et" → form; "Telefon" alanından ÇIKINCA (blur) "Doğrulama kodu"
// (zorunlu; sayfada deneme kodu yazar) belirir → "Talebi gönder" → sonuç.
import { belge, govdeJson, json, kaydet, olay } from '../ortak.mjs';

const KOK = '/arama';
const ILANLAR = [
  { no: 41, baslik: 'Bahçeli 2+1, Çınarlı', fiyat: '18.500 TL', oda: '2+1', esyali: true, balkon: false },
  { no: 42, baslik: 'Deniz manzaralı 3+1, Yeşiltepe', fiyat: '27.000 TL', oda: '3+1', esyali: true, balkon: true },
  { no: 43, baslik: 'Öğrenciye uygun 1+1, Kavaklı', fiyat: '11.200 TL', oda: '1+1', esyali: false, balkon: true },
  { no: 44, baslik: 'Yeni bina 2+1, Çınarlı', fiyat: '21.750 TL', oda: '2+1', esyali: false, balkon: true }
];

const stil = `
body{margin:0;font:15px/1.5 "Nunito","Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}
.ust{background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 28px;display:flex;gap:12px;align-items:end;flex-wrap:wrap}
.ust input[type=search]{width:280px;padding:10px 14px;border:1px solid #cbd5e1;border-radius:999px}
.ust select{padding:9px;border-radius:999px;border:1px solid #cbd5e1}
.ara{background:#0ea5e9;color:#fff;border:0;border-radius:999px;padding:10px 22px;cursor:pointer}
#liste{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px;padding:24px 28px}
.ilan{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px #0f172a1a}.ilan .resim{height:110px;background:linear-gradient(135deg,#bae6fd,#e0f2fe)}
.ilan div.ic{padding:12px}.ilan button{background:none;border:1px solid #0ea5e9;color:#0284c7;border-radius:999px;padding:6px 14px;cursor:pointer}
#detay{max-width:640px;margin:24px auto;background:#fff;border-radius:16px;padding:22px}label{display:block;margin-top:10px;font-size:13px}
#detay input,#detay select{width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:10px}.hata{color:#dc2626}`;

const govde = String.raw`<div class="ust" id="ust">
  <div><label for="konum">Konum</label><input type="search" id="konum" placeholder="Mahalle ya da semt"></div>
  <div><label for="oda">Oda sayısı</label><select id="oda"><option value="">Tümü</option><option>1+1</option><option>2+1</option><option>3+1</option></select></div>
  <label><input type="checkbox" id="esyali"> Eşyalı</label><label><input type="checkbox" id="balkon"> Balkonlu</label>
  <button type="button" class="ara" id="ara">Ara</button>
</div>
<div id="liste"><p>Aramak için konum yazıp "Ara"ya basın.</p></div>
<section id="detay" hidden></section>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
var ilanlar = [];
$('ara').onclick = function(){
  var q = 'konum=' + encodeURIComponent($('konum').value) + '&oda=' + encodeURIComponent($('oda').value) + '&esyali=' + $('esyali').checked + '&balkon=' + $('balkon').checked;
  $('liste').innerHTML = '<p>Aranıyor…</p>';
  fetch('/arama/api/ilanlar?' + q).then(function(r){ return r.json(); }).then(function(j){
    ilanlar = j.ilanlar; $('liste').innerHTML = j.ilanlar.length ? '' : '<p>Sonuç bulunamadı.</p>';
    j.ilanlar.forEach(function(i){
      var k = document.createElement('article'); k.className = 'ilan';
      k.innerHTML = '<div class="resim"></div><div class="ic"><h3>' + i.baslik + '</h3><p>' + i.fiyat + ' / ay</p><button type="button">İncele</button></div>';
      k.querySelector('button').onclick = function(){ location.hash = '#/ilan/' + i.no; };
      $('liste').appendChild(k);
    });
  });
};
function rota(){
  var m = /^#\/ilan\/(\d+)$/.exec(location.hash);
  $('detay').hidden = !m; $('liste').hidden = !!m; $('ust').hidden = !!m;
  if (!m) return;
  var i = ilanlar.filter(function(x){ return String(x.no) === m[1]; })[0] || { no: m[1], baslik: 'İlan ' + m[1], fiyat: '-' };
  $('detay').innerHTML = '<a href="#/">← Sonuçlara dön</a><h1>' + i.baslik + '</h1><p>Aylık ' + i.fiyat + '</p><button type="button" class="ara" id="randevu">Randevu talep et</button><div id="form"></div>';
  $('randevu').onclick = function(){
    this.remove();
    $('form').innerHTML = '<label for="adSoyad">Ad soyad</label><input id="adSoyad"><label for="telefon">Telefon</label><input id="telefon" type="tel">'
      + '<div id="kodKutusu" hidden><label for="kod">Doğrulama kodu</label><input id="kod" inputmode="numeric" maxlength="4"><small>Deneme kodu: 1234</small></div>'
      + '<label for="gun">Tercih edilen gün</label><select id="gun"><option value="">Seçiniz</option><option>Hafta içi</option><option>Cumartesi</option><option>Pazar</option></select>'
      + '<p id="hata" class="hata" role="alert"></p><button type="button" class="ara" id="gonder">Talebi gönder</button>';
    $('telefon').addEventListener('blur', function(){ if (this.value.replace(/\D/g, '').length >= 10) $('kodKutusu').hidden = false; });
    $('gonder').onclick = function(){
      $('hata').textContent = '';
      if (!$('adSoyad').value.trim() || !$('gun').value) { $('hata').textContent = 'Ad soyad ve gün zorunludur.'; return; }
      if ($('kodKutusu').hidden || $('kod').value !== '1234') { $('hata').textContent = 'Telefonunuzu doğrulayın (doğrulama kodu hatalı).'; return; }
      fetch('/arama/api/randevu', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ilan: i.no, adSoyad: $('adSoyad').value, telefon: $('telefon').value, kod: $('kod').value, gun: $('gun').value }) })
        .then(function(r){ return r.json(); }).then(function(j){ $('form').innerHTML = '<p role="status">Randevu talebiniz iletildi. Talep no: ' + j.no + '</p>'; });
    };
  };
}
window.addEventListener('hashchange', rota); rota();`;

let no = 9000;
export default {
  kok: KOK, ad: 'Ev arama', alan: 'arama + filtre + detay',
  teknikler: ['arama + filtreler', 'çok kartlı sonuç (aynı İncele)', 'hash rota (SPA detay)', 'düğmeyle açılan form', 'blur ile beliren zorunlu alan'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/arama/' || i.yol === '/arama')) return belge({ kok: KOK, baslik: 'Kiralık ev ara', stil, govde, betik });
    if (i.yol === '/arama/api/ilanlar') {
      olay(s, 'arama');
      const k = (i.sorgu.get('konum') ?? '').toLocaleLowerCase('tr');
      const oda = i.sorgu.get('oda') ?? '';
      const l = ILANLAR.filter((x) => (!k || x.baslik.toLocaleLowerCase('tr').includes(k)) && (!oda || x.oda === oda)
        && (i.sorgu.get('esyali') !== 'true' || x.esyali) && (i.sorgu.get('balkon') !== 'true' || x.balkon));
      return json({ ilanlar: l }, 200, 800);
    }
    if (i.yol === '/arama/api/randevu' && i.yontem === 'POST') { kaydet(s, govdeJson(i)); return json({ no: `KE-${++no}` }, 200, 400); }
    return null;
  }
};
