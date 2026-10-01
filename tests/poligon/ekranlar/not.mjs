// HIZLI NOT (mobil benzeri dar düzen, klavye odaklı) — görünür etiket YOK (yalnız placeholder / aria-label), "Etiket" özel bir liste
// kutusu (role=combobox + role=listbox, ok tuşları / tıklama; form alanı değil), "Hatırlatma" alanına yazıp 1,5 sn BEKLEYİNCE (debounce)
// "Hatırlatma saati" listesi belirir (zorunlu); kaydetme yalnız simgeli düğme (aria-label "Notu kaydet") ya da Ctrl+Enter ile.
import { belge, govdeJson, json, kaydet } from '../ortak.mjs';

const KOK = '/not';

const stil = `
body{margin:0;font:15px/1.5 ui-monospace,Consolas,monospace;background:#e7e5e4;color:#1c1917}
main{max-width:360px;margin:0 auto;min-height:100vh;background:#fafaf9;border-left:1px solid #d6d3d1;border-right:1px solid #d6d3d1;padding:16px;box-sizing:border-box}
input,textarea{width:100%;box-sizing:border-box;border:0;border-bottom:2px solid #a8a29e;background:transparent;padding:10px 2px;font:inherit;margin-bottom:12px}
input:focus,textarea:focus,[role=combobox]:focus{outline:3px solid #f59e0b;outline-offset:2px}
[role=combobox]{border:2px solid #a8a29e;padding:8px;margin-bottom:12px;cursor:pointer}[role=listbox]{border:2px solid #a8a29e;margin:-12px 0 12px;padding:0;list-style:none}
[role=option]{padding:6px 8px}[role=option][aria-selected=true]{background:#fde68a}
select{width:100%;padding:8px;margin-bottom:12px}
.kaydet{position:fixed;bottom:22px;left:50%;margin-left:110px;width:56px;height:56px;border-radius:50%;border:0;background:#f59e0b;cursor:pointer;box-shadow:0 3px 8px #0003}
.kaydet svg{width:26px;height:26px}.hata{color:#b91c1c}`;

const govde = String.raw`<main>
<h1 style="font-size:18px">Yeni not</h1>
<form id="form" novalidate>
<input id="baslik" placeholder="Başlık" aria-label="Başlık" autocomplete="off">
<textarea id="metin" placeholder="Notunuzu yazın…" aria-label="Not" rows="5"></textarea>
<div id="etiket" role="combobox" tabindex="0" aria-expanded="false" aria-controls="etiketListe" aria-label="Etiket">Etiket seçin ▾</div>
<ul id="etiketListe" role="listbox" hidden><li role="option" id="e1" aria-selected="false">İş</li><li role="option" id="e2" aria-selected="false">Kişisel</li><li role="option" id="e3" aria-selected="false">Acil</li></ul>
<input id="hatirlatma" placeholder="Hatırlatma (gg.aa.yyyy)" aria-label="Hatırlatma tarihi" autocomplete="off">
<select id="saat" aria-label="Hatırlatma saati" hidden><option value="">Saat seçin</option><option>09:00</option><option>13:00</option><option>18:00</option></select>
<p id="hata" class="hata" role="alert"></p>
<div id="sonuc" role="status"></div>
</form>
<button type="button" class="kaydet" aria-label="Notu kaydet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7"/></svg></button>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
var etiket = null, aktif = -1, secenekler = Array.prototype.slice.call(document.querySelectorAll('[role=option]'));
function liste(ac){ $('etiketListe').hidden = !ac; $('etiket').setAttribute('aria-expanded', String(ac)); }
function sec(i){ etiket = secenekler[i].textContent; secenekler.forEach(function(o, j){ o.setAttribute('aria-selected', String(j === i)); }); $('etiket').textContent = etiket + ' ▾'; liste(false); }
$('etiket').addEventListener('click', function(){ liste($('etiketListe').hidden); });
$('etiket').addEventListener('keydown', function(o){
  if (o.key === 'ArrowDown') { o.preventDefault(); liste(true); aktif = Math.min(secenekler.length - 1, aktif + 1); this.setAttribute('aria-activedescendant', secenekler[aktif].id); secenekler.forEach(function(x, j){ x.setAttribute('aria-selected', String(j === aktif)); }); }
  if (o.key === 'ArrowUp') { o.preventDefault(); aktif = Math.max(0, aktif - 1); this.setAttribute('aria-activedescendant', secenekler[aktif].id); secenekler.forEach(function(x, j){ x.setAttribute('aria-selected', String(j === aktif)); }); }
  if (o.key === 'Enter' && aktif >= 0) { o.preventDefault(); sec(aktif); }
});
secenekler.forEach(function(s, i){ s.addEventListener('click', function(){ sec(i); }); });
var bekle = null;
$('hatirlatma').addEventListener('input', function(){
  clearTimeout(bekle); var v = this.value;
  bekle = setTimeout(function(){ $('saat').hidden = !/^\d{2}\.\d{2}\.\d{4}$/.test(v); }, 1500);
});
function kaydetNotu(){
  $('hata').textContent = '';
  if (!$('baslik').value.trim() || !$('metin').value.trim()) { $('hata').textContent = 'Başlık ve not boş olamaz.'; return; }
  if (!etiket) { $('hata').textContent = 'Bir etiket seçin.'; return; }
  if ($('hatirlatma').value && !$('saat').value) { $('hata').textContent = 'Hatırlatma saati seçin.'; return; }
  fetch('/not/api/kaydet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baslik: $('baslik').value, metin: $('metin').value, etiket: etiket, hatirlatma: $('hatirlatma').value, saat: $('saat').value }) })
    .then(function(r){ return r.json(); }).then(function(j){ $('sonuc').textContent = 'Not kaydedildi (#' + j.no + ')'; $('form').reset(); etiket = null; $('etiket').textContent = 'Etiket seçin ▾'; });
}
document.querySelector('.kaydet').onclick = kaydetNotu;
document.addEventListener('keydown', function(o){ if (o.key === 'Enter' && (o.ctrlKey || o.metaKey)) { o.preventDefault(); kaydetNotu(); } });`;

let no = 11;
export default {
  kok: KOK, ad: 'Hızlı not', alan: 'not alma (mobil, klavye)',
  teknikler: ['dar mobil düzen', 'yalnız placeholder / aria-label', 'özel combobox (ok tuşları)', 'beklemeyle (debounce) beliren zorunlu liste', 'yalnız simge düğme / Ctrl+Enter'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/not/' || i.yol === '/not')) return belge({ kok: KOK, baslik: 'Hızlı not', stil, govde, betik });
    if (i.yol === '/not/api/kaydet' && i.yontem === 'POST') { kaydet(s, govdeJson(i)); return json({ no: ++no }, 200, 300); }
    return null;
  }
};
