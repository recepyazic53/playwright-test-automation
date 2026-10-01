// MASRAF BEYANI (tablo / hesap çizelgesi görünümü) — AKORDEON: "1 Çalışan" açık, "2 Harcama kalemleri" ve "3 Onay" KAPALI (başlığa
// basınca açılır). Kalemler dinamik tablo: "Satır ekle" ile satır eklenir (Tarih, Açıklama, Kategori, Tutar), satırda tutar 1000'i
// geçince aynı satırda "Onaylayan yönetici" alanı belirir (zorunlu). Onay bölümünde kutu işaretlenene kadar "Devam" DEVRE DIŞI;
// Devam → özet görünümü (içerik yer değiştirir) → "Beyanı gönder" href'siz <a> → sonuç (değişken toplam tutar içerir).
import { belge, govdeJson, json, kaydet } from '../ortak.mjs';

const KOK = '/gider';

const stil = `
body{margin:0;font:13px/1.4 Calibri,"Segoe UI",sans-serif;background:#e9ecef;color:#212529}
main{max-width:860px;margin:20px auto;background:#fff;border:1px solid #adb5bd}
.baslik{background:#217346;color:#fff;padding:10px 14px;font-size:16px}
.akordeon>h2{margin:0}.akordeon>h2 button{width:100%;text-align:left;background:#f1f3f5;border:0;border-top:1px solid #adb5bd;padding:10px 14px;font:bold 14px Calibri,sans-serif;cursor:pointer}
.akordeon>h2 button[aria-expanded=true]{background:#d3f0de}.panel{padding:12px 14px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ced4da;padding:3px}th{background:#f8f9fa}td input,td select{width:100%;box-sizing:border-box;border:0;padding:4px;font:inherit}
.alan label{display:block;font-weight:bold;margin-top:6px}.alan input,.alan select{padding:5px;border:1px solid #ced4da;width:260px}
.yesil{background:#217346;color:#fff;border:0;padding:7px 14px;cursor:pointer;margin-top:8px}.yesil:disabled{background:#9fb8a8;cursor:not-allowed}
a.gonder{display:inline-block;background:#217346;color:#fff;padding:8px 16px;cursor:pointer;margin-top:10px}.hata{color:#c92a2a}`;

const govde = String.raw`<main>
<div class="baslik">Masraf beyanı · Ekim dönemi</div>
<div id="duzenle">
<div class="akordeon"><h2><button type="button" aria-expanded="true" aria-controls="a1">1 · Çalışan bilgileri</button></h2>
<div class="panel" id="a1"><div class="alan"><label for="sicil">Sicil no</label><input id="sicil"></div>
<div class="alan"><label for="departman">Departman</label><select id="departman"><option value="">Seçiniz</option><option>Satış</option><option>Muhasebe</option><option>Bilgi işlem</option></select></div></div></div>
<div class="akordeon"><h2><button type="button" aria-expanded="false" aria-controls="a2">2 · Harcama kalemleri</button></h2>
<div class="panel" id="a2" hidden><table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Kategori</th><th>Tutar (TL)</th><th>Onaylayan yönetici</th><th></th></tr></thead><tbody id="kalemler"></tbody></table>
<button type="button" class="yesil" id="satirEkle">Satır ekle</button></div></div>
<div class="akordeon"><h2><button type="button" aria-expanded="false" aria-controls="a3">3 · Onay</button></h2>
<div class="panel" id="a3" hidden><label><input type="checkbox" id="onay"> Beyanın doğru ve eksiksiz olduğunu onaylıyorum</label><br>
<p id="hata" class="hata" role="alert"></p><button type="button" class="yesil" id="devam" disabled>Devam</button></div></div>
</div>
<div id="ozet" hidden class="panel"></div>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
document.querySelectorAll('.akordeon>h2 button').forEach(function(b){ b.onclick = function(){
  var a = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(a)); $(b.getAttribute('aria-controls')).hidden = !a;
}; });
var n = 0;
$('satirEkle').onclick = function(){
  n++; var tr = document.createElement('tr');
  tr.innerHTML = '<td><input aria-label="Tarih ' + n + '" placeholder="gg.aa.yyyy"></td><td><input aria-label="Açıklama ' + n + '"></td>'
    + '<td><select aria-label="Kategori ' + n + '"><option value="">Seçiniz</option><option>Yol</option><option>Yemek</option><option>Konaklama</option></select></td>'
    + '<td><input aria-label="Tutar ' + n + '" inputmode="decimal"></td><td><input aria-label="Onaylayan yönetici ' + n + '" hidden></td><td><button type="button" aria-label="Satırı sil">✕</button></td>';
  var tutar = tr.querySelectorAll('input')[2], yonetici = tr.querySelectorAll('input')[3];
  tutar.addEventListener('input', function(){ yonetici.hidden = !(Number(tutar.value.replace(',', '.')) > 1000); });
  tr.querySelector('button').onclick = function(){ tr.remove(); };
  $('kalemler').appendChild(tr);
};
$('onay').addEventListener('change', function(){ $('devam').disabled = !this.checked; });
function kalemler(){
  return Array.prototype.map.call(document.querySelectorAll('#kalemler tr'), function(tr){
    var i = tr.querySelectorAll('input'); return { tarih: i[0].value, aciklama: i[1].value, kategori: tr.querySelector('select').value, tutar: i[2].value, yonetici: i[3].hidden ? null : i[3].value };
  });
}
$('devam').onclick = function(){
  $('hata').textContent = '';
  var k = kalemler();
  if (!$('sicil').value.trim() || !$('departman').value) { $('hata').textContent = 'Çalışan bilgileri eksik.'; return; }
  if (!k.length) { $('hata').textContent = 'En az bir harcama kalemi ekleyin.'; return; }
  if (k.some(function(x){ return !x.tarih || !x.aciklama || !x.kategori || !(Number(x.tutar.replace(',', '.')) > 0) || (x.yonetici !== null && !x.yonetici.trim()); })) { $('hata').textContent = 'Harcama kalemlerinde boş alan var.'; return; }
  var toplam = k.reduce(function(t, x){ return t + Number(x.tutar.replace(',', '.')); }, 0);
  $('duzenle').hidden = true; $('ozet').hidden = false;
  $('ozet').innerHTML = '<h2>Özet</h2><p>Sicil: ' + $('sicil').value + ' · ' + k.length + ' kalem · Toplam ' + toplam.toFixed(2).replace('.', ',') + ' TL</p><a class="gonder" id="gonder">Beyanı gönder</a> <a href="#" id="geri">Düzenle</a>';
  $('geri').onclick = function(o){ o.preventDefault(); $('duzenle').hidden = false; $('ozet').hidden = true; };
  $('gonder').onclick = function(){
    fetch('/gider/api/gonder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sicil: $('sicil').value, departman: $('departman').value, kalemler: k }) })
      .then(function(r){ return r.json(); }).then(function(j){ $('ozet').innerHTML = '<p role="status">Beyanınız iletildi. Toplam: ' + j.toplam + '</p>'; });
  };
};`;

export default {
  kok: KOK, ad: 'Masraf beyanı', alan: 'masraf yönetimi',
  teknikler: ['akordeon (kapalı paneller)', 'Satır ekle dinamik tablo', 'satırda tutara bağlı beliren alan', 'onay kutusuyla etkinleşen Devam', 'özet görünümü', 'href’siz bağlantı'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/gider/' || i.yol === '/gider')) return belge({ kok: KOK, baslik: 'Masraf beyanı', stil, govde, betik });
    if (i.yol === '/gider/api/gonder' && i.yontem === 'POST') {
      const g = govdeJson(i);
      kaydet(s, g);
      const t = (g.kalemler ?? []).reduce((a, x) => a + Number(String(x.tutar).replace(',', '.')), 0);
      return json({ toplam: `${t.toFixed(2).replace('.', ',')} TL` }, 200, 400);
    }
    return null;
  }
};
