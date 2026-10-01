// MEMNUNİYET ANKETİ — yıldız puanlama (svg yıldızlar, form alanı değil; gizli input), puan 1-2 verilince "Neden memnun kalmadınız?"
// ZORUNLU metin alanı belirir, sürükle-bırak sıralama (HTML5 DnD; düğme yok), matris radyo (her satır bir grup; radyoların görünen
// etiketi yalnız SÜTUN başlığı), "Anketi gönder" bir DIV (onclick; role yok) → toast (3 sn sonra kaybolur).
import { belge, govdeJson, json, kaydet } from '../ortak.mjs';

const KOK = '/anket';

const stil = `
body{margin:0;font:16px/1.6 "Comic Sans MS","Segoe Print",cursive;background:#fdf2f8;color:#4a1d3a}
main{max-width:640px;margin:30px auto;background:#fff;border:3px dashed #f472b6;border-radius:24px;padding:24px}
.yildizlar svg{width:38px;height:38px;cursor:pointer;fill:#e5d0dc}.yildizlar svg.dolu{fill:#f59e0b}
ul.sira{list-style:none;padding:0}ul.sira li{background:#fce7f3;margin:6px 0;padding:8px 12px;border-radius:12px;cursor:grab}
table{border-collapse:collapse;width:100%}th,td{padding:6px;text-align:center;border-bottom:1px solid #fbcfe8}th:first-child,td:first-child{text-align:left}
textarea{width:100%;box-sizing:border-box;border:2px solid #f9a8d4;border-radius:12px;padding:8px;font:inherit}
.gonder{display:inline-block;background:#db2777;color:#fff;padding:10px 24px;border-radius:30px;cursor:pointer;margin-top:14px}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#4a1d3a;color:#fff;padding:12px 22px;border-radius:30px;transition:opacity .5s}
.hata{color:#be123c}`;

const yildiz = (n) => `<svg viewBox="0 0 24 24" data-puan="${n}" aria-hidden="true"><path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 17l-6.5 4 2-7.5L2 9h7z"/></svg>`;
const matrisSatiri = (ad, k) => `<tr><td>${ad}</td>${['Kötü', 'Orta', 'İyi', 'Çok iyi'].map((x) => `<td><input type="radio" name="${k}" value="${x}"></td>`).join('')}</tr>`;

const govde = String.raw`<main>
<h1>Bizi nasıl buldunuz?</h1>
<p>Genel puanınız</p>
<div class="yildizlar" id="yildizlar">${[1, 2, 3, 4, 5].map(yildiz).join('')}</div><input type="hidden" id="puan" name="puan" value="0">
<div id="nedenKutusu" hidden><label for="neden">Neden memnun kalmadınız?</label><textarea id="neden" rows="3"></textarea></div>
<h2>Sizin için en önemliden en önemsize sıralayın</h2>
<ul class="sira" id="sira"><li draggable="true">Fiyat</li><li draggable="true">Teslimat hızı</li><li draggable="true">Ürün kalitesi</li><li draggable="true">Destek</li></ul>
<h2>Değerlendirme</h2>
<table><thead><tr><th></th><th>Kötü</th><th>Orta</th><th>İyi</th><th>Çok iyi</th></tr></thead><tbody>
${matrisSatiri('Teslimat', 'teslimat')}${matrisSatiri('Paketleme', 'paketleme')}${matrisSatiri('İletişim', 'iletisim')}</tbody></table>
<h2>Eklemek istedikleriniz</h2><textarea id="yorum" rows="3" placeholder="İsteğe bağlı"></textarea>
<p id="hata" class="hata"></p>
<div class="gonder" id="gonder">Anketi gönder</div>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
document.querySelectorAll('#yildizlar svg').forEach(function(s){
  s.addEventListener('click', function(){
    var p = Number(s.dataset.puan); $('puan').value = p;
    document.querySelectorAll('#yildizlar svg').forEach(function(x){ x.classList.toggle('dolu', Number(x.dataset.puan) <= p); });
    $('nedenKutusu').hidden = p > 2;
  });
});
var surukle = null;
document.querySelectorAll('#sira li').forEach(function(li){
  li.addEventListener('dragstart', function(){ surukle = li; });
  li.addEventListener('dragover', function(o){ o.preventDefault(); });
  li.addEventListener('drop', function(o){ o.preventDefault(); if (surukle && surukle !== li) li.parentNode.insertBefore(surukle, li); });
});
$('gonder').addEventListener('click', function(){
  $('hata').textContent = '';
  var p = Number($('puan').value);
  if (!p) { $('hata').textContent = 'Lütfen yıldızlarla puan verin.'; return; }
  if (p <= 2 && !$('neden').value.trim()) { $('hata').textContent = 'Memnun kalmama nedeninizi yazın.'; return; }
  var m = {}; ['teslimat','paketleme','iletisim'].forEach(function(k){ var r = document.querySelector('input[name=' + k + ']:checked'); m[k] = r ? r.value : null; });
  if (!m.teslimat || !m.paketleme || !m.iletisim) { $('hata').textContent = 'Değerlendirme tablosundaki tüm satırları işaretleyin.'; return; }
  fetch('/anket/api/yanit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    puan: p, neden: $('neden').value, sira: Array.prototype.map.call(document.querySelectorAll('#sira li'), function(l){ return l.textContent; }), matris: m, yorum: $('yorum').value }) })
    .then(function(r){ return r.json(); }).then(function(){
      var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = 'Teşekkürler, yanıtınız kaydedildi'; document.body.appendChild(t);
      setTimeout(function(){ t.style.opacity = 0; setTimeout(function(){ t.remove(); }, 600); }, 3000);
    });
});`;

export default {
  kok: KOK, ad: 'Anket', alan: 'anket',
  teknikler: ['yıldız puanlama (svg)', 'düşük puanda beliren zorunlu alan', 'sürükle-bırak sıralama', 'matris radyo', 'div onclick düğme', 'kaybolan toast'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/anket/' || i.yol === '/anket')) return belge({ kok: KOK, baslik: 'Memnuniyet anketi', stil, govde, betik });
    if (i.yol === '/anket/api/yanit' && i.yontem === 'POST') { kaydet(s, govdeJson(i)); return json({ tamam: true }, 200, 400); }
    return null;
  }
};
