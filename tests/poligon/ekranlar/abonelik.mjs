// FİBER İNTERNET ABONELİĞİ — BEKLEMEYLE ZİNCİRLENEN alanlar (düğmeye basılmaz): "T.C. kimlik no" 11 hane yazılıp 0,8 sn beklenince
// sorgu → "Ad soyad" (salt okunur) dolar ve "Doğum tarihi" (zorunlu) belirir → doğum tarihi yazılıp 1 sn beklenince "Adres bilgileri"
// bölümü belirir: İl → İlçe → Mahalle (bağlı listeler, seçenekler sunucudan, gecikmeli). "Başvuru türü" Kurumsal seçilince kimlik / ad /
// doğum tarihi KAYBOLUR, "Vergi no" + "Şirket unvanı" belirir (vergi no 10 hane + bekleme → adres bölümü). "Fatura adresi farklı"
// işaretlenince fatura adresi açılır. Tarife hazır seçili. Gönder: <input type=submit value="Başvur">.
import { belge, govdeJson, json, kaydet, olay } from '../ortak.mjs';

const KOK = '/abonelik';
const ILLER = { kuzey: ['Merkez', 'Sahil', 'Yayla'], guney: ['Ova', 'Liman'] };
const MAHALLELER = { Merkez: ['Çınarlı', 'Yeşiltepe'], Sahil: ['Kumsal', 'Fener'], Yayla: ['Pınarbaşı'], Ova: ['Bereket', 'Değirmen'], Liman: ['Rıhtım'] };

const stil = `
body{margin:0;font:15px/1.5 Arial Black,Arial,sans-serif;background:#ffd400;color:#111}
main{max-width:620px;margin:0 auto;background:#fff;border:6px solid #111;margin-top:30px;padding:24px}
h1{text-transform:uppercase;letter-spacing:-1px;border-bottom:6px solid #111;padding-bottom:6px}
fieldset{border:3px solid #111;margin:14px 0;padding:12px}legend{background:#111;color:#ffd400;padding:2px 8px}
label{display:block;font:bold 13px Arial,sans-serif;margin-top:8px}input[type=text],select,textarea{width:100%;box-sizing:border-box;border:3px solid #111;padding:8px;font:15px Arial,sans-serif}
input[readonly]{background:#eee}input[type=submit]{background:#111;color:#ffd400;border:0;padding:14px 30px;font:inherit;text-transform:uppercase;cursor:pointer}
.radyo label{display:inline-block;margin-right:16px}.hata{color:#c00;font-family:Arial}`;

const govde = String.raw`<main>
<h1>Fiber internet başvurusu</h1>
<form id="form" novalidate>
<div class="radyo"><span>Başvuru türü</span><br><label><input type="radio" name="tur" value="bireysel" checked> Bireysel</label><label><input type="radio" name="tur" value="kurumsal"> Kurumsal</label></div>
<fieldset id="bireysel"><legend>Kimlik</legend>
  <label for="tc">T.C. kimlik no</label><input type="text" id="tc" inputmode="numeric" maxlength="11" autocomplete="off">
  <label for="adSoyad">Ad soyad</label><input type="text" id="adSoyad" readonly>
  <div id="dogumKutusu" hidden><label for="dogum">Doğum tarihi (gg.aa.yyyy)</label><input type="text" id="dogum" autocomplete="off"></div>
</fieldset>
<fieldset id="kurumsal" hidden><legend>Şirket</legend>
  <label for="vergiNo">Vergi no</label><input type="text" id="vergiNo" inputmode="numeric" maxlength="10" autocomplete="off">
  <label for="unvan">Şirket unvanı</label><input type="text" id="unvan">
</fieldset>
<fieldset id="adres" hidden><legend>Adres bilgileri</legend>
  <label for="bolge">Bölge</label><select id="bolge"><option value="">Seçiniz</option><option value="kuzey">Kuzey bölgesi</option><option value="guney">Güney bölgesi</option></select>
  <label for="ilce">İlçe</label><select id="ilce" disabled><option value="">Önce bölge seçin</option></select>
  <label for="mahalle">Mahalle</label><select id="mahalle" disabled><option value="">Önce ilçe seçin</option></select>
  <label for="acikAdres">Açık adres</label><textarea id="acikAdres" rows="2"></textarea>
  <label><input type="checkbox" id="faturaFarkli"> Fatura adresi farklı</label>
  <div id="faturaKutusu" hidden><label for="faturaAdresi">Fatura adresi</label><textarea id="faturaAdresi" rows="2"></textarea></div>
</fieldset>
<label for="tarife">Tarife</label><select id="tarife"><option value="50">Ekonomik 50 Mbps</option><option value="100" selected>Standart 100 Mbps</option><option value="1000">Süper 1000 Mbps</option></select>
<p id="hata" class="hata" role="alert"></p>
<p><input type="submit" value="Başvur"></p>
</form>
<div id="sonuc" role="status"></div>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
function bekleyen(alan, ms, is){ var z = null; alan.addEventListener('input', function(){ clearTimeout(z); var v = alan.value; z = setTimeout(function(){ is(v); }, ms); }); }
function tur(){ return document.querySelector('input[name=tur]:checked').value; }
document.querySelectorAll('input[name=tur]').forEach(function(r){ r.addEventListener('change', function(){
  var k = tur() === 'kurumsal'; $('bireysel').hidden = k; $('kurumsal').hidden = !k; $('adres').hidden = true;
}); });
bekleyen($('tc'), 800, function(v){
  if (!/^\d{11}$/.test(v)) return;
  fetch('/abonelik/api/kimlik?no=' + v).then(function(r){ return r.json(); }).then(function(j){ $('adSoyad').value = j.ad; $('dogumKutusu').hidden = false; });
});
bekleyen($('dogum'), 1000, function(v){ if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) $('adres').hidden = false; });
bekleyen($('vergiNo'), 800, function(v){ if (/^\d{10}$/.test(v)) $('adres').hidden = false; });
function doldur(liste, adres, bos){
  liste.disabled = true; liste.innerHTML = '<option value="">Yükleniyor…</option>';
  fetch(adres).then(function(r){ return r.json(); }).then(function(j){ liste.innerHTML = '<option value="">' + bos + '</option>' + j.liste.map(function(x){ return '<option>' + x + '</option>'; }).join(''); liste.disabled = false; });
}
$('bolge').addEventListener('change', function(){ $('mahalle').disabled = true; $('mahalle').innerHTML = '<option value="">Önce ilçe seçin</option>'; if (this.value) doldur($('ilce'), '/abonelik/api/ilceler?b=' + this.value, 'İlçe seçin'); });
$('ilce').addEventListener('change', function(){ if (this.value) doldur($('mahalle'), '/abonelik/api/mahalleler?i=' + encodeURIComponent(this.value), 'Mahalle seçin'); });
$('faturaFarkli').addEventListener('change', function(){ $('faturaKutusu').hidden = !this.checked; });
$('form').onsubmit = function(o){
  o.preventDefault(); $('hata').textContent = '';
  var k = tur() === 'kurumsal';
  if (!k && (!$('adSoyad').value || !/^\d{2}\.\d{2}\.\d{4}$/.test($('dogum').value))) { $('hata').textContent = 'Kimlik no ve doğum tarihini girin.'; return; }
  if (k && (!/^\d{10}$/.test($('vergiNo').value) || !$('unvan').value.trim())) { $('hata').textContent = 'Vergi no ve şirket unvanını girin.'; return; }
  if ($('adres').hidden || !$('mahalle').value || !$('acikAdres').value.trim()) { $('hata').textContent = 'Adres bilgilerini tamamlayın.'; return; }
  if ($('faturaFarkli').checked && !$('faturaAdresi').value.trim()) { $('hata').textContent = 'Fatura adresini yazın.'; return; }
  fetch('/abonelik/api/basvur', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    tur: tur(), tc: $('tc').value, dogum: $('dogum').value, vergiNo: $('vergiNo').value, unvan: $('unvan').value, bolge: $('bolge').value, ilce: $('ilce').value,
    mahalle: $('mahalle').value, acikAdres: $('acikAdres').value, faturaAdresi: $('faturaFarkli').checked ? $('faturaAdresi').value : null, tarife: $('tarife').value }) })
    .then(function(r){ return r.json(); }).then(function(j){ $('form').hidden = true; $('sonuc').innerHTML = '<h2>Başvurunuz alındı</h2><p>Başvuru no: ' + j.no + '</p>'; });
};`;

let no = 5000;
export default {
  kok: KOK, ad: 'Abonelik', alan: 'abonelik başvurusu',
  teknikler: ['beklemeyle zincirlenen alanlar (A→B→C)', 'kimlik sorgusuyla dolan alan', 'değere göre kaybolan / beliren bölüm', 'üç düzeyli bağlı liste', 'onay kutusuyla açılan alan', 'hazır seçili liste', 'input type=submit'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/abonelik/' || i.yol === '/abonelik')) return belge({ kok: KOK, baslik: 'Fiber internet başvurusu', stil, govde, betik });
    if (i.yol === '/abonelik/api/kimlik') { olay(s, 'kimlik'); return json({ ad: 'A*** Y***' }, 200, 400); }
    if (i.yol === '/abonelik/api/ilceler') { olay(s, 'ilce'); return json({ liste: ILLER[i.sorgu.get('b') ?? ''] ?? [] }, 200, 600); }
    if (i.yol === '/abonelik/api/mahalleler') { olay(s, 'mahalle'); return json({ liste: MAHALLELER[i.sorgu.get('i') ?? ''] ?? [] }, 200, 500); }
    if (i.yol === '/abonelik/api/basvur' && i.yontem === 'POST') { kaydet(s, govdeJson(i)); return json({ no: `AB-${++no}` }, 200, 500); }
    return null;
  }
};
