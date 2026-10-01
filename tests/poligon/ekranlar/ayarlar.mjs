// HESAP AYARLARI (karanlık tema, sekmeli) — alanlar üç sekmeye dağılmış (role=tab; diğer sekmelerin alanları gizli), anahtarlar
// <button role=switch aria-checked> (form alanı değil), "SMS bildirimleri" açılınca "Cep telefonu" (zorunlu) belirir, kaydırıcı
// (range), görünürlük radyoları; "Değişiklikleri kaydet" YALNIZ son sekmede → toast (2,5 sn sonra kaybolur).
import { belge, govdeJson, json, kaydet } from '../ortak.mjs';

const KOK = '/ayarlar';

const stil = `
:root{color-scheme:dark}body{margin:0;font:14px/1.6 "Inter","Segoe UI",sans-serif;background:#0d1117;color:#c9d1d9}
main{max-width:700px;margin:36px auto;border:1px solid #30363d;border-radius:8px;background:#161b22}
[role=tablist]{display:flex;border-bottom:1px solid #30363d}[role=tab]{background:none;border:0;color:#8b949e;padding:12px 18px;cursor:pointer;border-bottom:2px solid transparent}
[role=tab][aria-selected=true]{color:#f0f6fc;border-color:#f78166}[role=tabpanel]{padding:20px 24px}
label{display:block;margin:10px 0 4px;color:#8b949e}input[type=text],input[type=tel],textarea{width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;padding:8px}
.anahtar{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #21262d}
[role=switch]{width:44px;height:24px;border-radius:12px;border:0;background:#30363d;position:relative;cursor:pointer}
[role=switch]::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#8b949e;transition:left .2s}
[role=switch][aria-checked=true]{background:#238636}[role=switch][aria-checked=true]::after{left:23px;background:#fff}
.yesil{background:#238636;color:#fff;border:1px solid #2ea043;border-radius:6px;padding:8px 16px;cursor:pointer}
.toast{position:fixed;top:20px;right:20px;background:#238636;color:#fff;padding:10px 18px;border-radius:6px}.hata{color:#f85149}`;

const govde = String.raw`<main>
<div role="tablist" aria-label="Ayar bölümleri">
  <button role="tab" id="t1" aria-selected="true" aria-controls="p1">Profil</button>
  <button role="tab" id="t2" aria-selected="false" aria-controls="p2">Bildirimler</button>
  <button role="tab" id="t3" aria-selected="false" aria-controls="p3">Gizlilik</button>
</div>
<form id="form" novalidate>
<div role="tabpanel" id="p1" aria-labelledby="t1">
  <label for="gorunenAd">Görünen ad</label><input type="text" id="gorunenAd" value="deneme_kullanici">
  <label for="biyografi">Hakkımda</label><textarea id="biyografi" rows="3"></textarea>
</div>
<div role="tabpanel" id="p2" aria-labelledby="t2" hidden>
  <div class="anahtar"><span id="eA">E-posta bildirimleri</span><button type="button" role="switch" aria-checked="true" aria-labelledby="eA" data-k="eposta"></button></div>
  <div class="anahtar"><span id="sA">SMS bildirimleri</span><button type="button" role="switch" aria-checked="false" aria-labelledby="sA" data-k="sms"></button></div>
  <div id="telKutusu" hidden><label for="cep">Cep telefonu</label><input type="tel" id="cep" placeholder="05xx xxx xx xx"></div>
  <label for="siklik">Özet e-postası sıklığı (gün): <output id="siklikDeger">7</output></label><input type="range" id="siklik" min="1" max="30" value="7">
</div>
<div role="tabpanel" id="p3" aria-labelledby="t3" hidden>
  <p>Profil görünürlüğü</p>
  <label><input type="radio" name="gorunurluk" value="herkes" checked> Herkese açık</label>
  <label><input type="radio" name="gorunurluk" value="baglantilar"> Yalnız bağlantılarım</label>
  <label><input type="radio" name="gorunurluk" value="gizli"> Gizli</label>
  <label><input type="checkbox" id="aramaMotoru"> Arama motorlarında gösterme</label>
  <p id="hata" class="hata" role="alert"></p>
  <button type="submit" class="yesil">Değişiklikleri kaydet</button>
</div>
</form>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
var anahtarlar = { eposta: true, sms: false };
document.querySelectorAll('[role=tab]').forEach(function(t){ t.onclick = function(){
  document.querySelectorAll('[role=tab]').forEach(function(x){ x.setAttribute('aria-selected', String(x === t)); $(x.getAttribute('aria-controls')).hidden = x !== t; });
}; });
document.querySelectorAll('[role=switch]').forEach(function(s){ s.onclick = function(){
  var a = s.getAttribute('aria-checked') !== 'true'; s.setAttribute('aria-checked', String(a)); anahtarlar[s.dataset.k] = a;
  if (s.dataset.k === 'sms') $('telKutusu').hidden = !a;
}; });
$('siklik').addEventListener('input', function(){ $('siklikDeger').textContent = this.value; });
$('form').onsubmit = function(o){
  o.preventDefault(); $('hata').textContent = '';
  if (!$('gorunenAd').value.trim()) { $('hata').textContent = 'Görünen ad boş olamaz (Profil sekmesi).'; return; }
  if (anahtarlar.sms && !/^05\d{9}$/.test($('cep').value.replace(/\s/g, ''))) { $('hata').textContent = 'SMS için geçerli bir cep telefonu girin (Bildirimler sekmesi).'; return; }
  fetch('/ayarlar/api/kaydet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    gorunenAd: $('gorunenAd').value, biyografi: $('biyografi').value, anahtarlar: anahtarlar, cep: $('cep').value, siklik: $('siklik').value,
    gorunurluk: document.querySelector('input[name=gorunurluk]:checked').value, aramaMotoru: $('aramaMotoru').checked }) })
    .then(function(r){ return r.json(); }).then(function(){
      var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = 'Ayarlar kaydedildi'; document.body.appendChild(t);
      setTimeout(function(){ t.remove(); }, 2500);
    });
};`;

export default {
  kok: KOK, ad: 'Hesap ayarları', alan: 'hesap yönetimi',
  teknikler: ['karanlık tema', 'sekmeler (gizli paneller)', 'role=switch anahtarlar', 'anahtarla beliren zorunlu alan', 'range', 'kaydet yalnız son sekmede', 'kaybolan toast'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/ayarlar/' || i.yol === '/ayarlar')) return belge({ kok: KOK, baslik: 'Hesap ayarları', stil, govde, betik });
    if (i.yol === '/ayarlar/api/kaydet' && i.yontem === 'POST') { kaydet(s, govdeJson(i)); return json({ tamam: true }, 200, 300); }
    return null;
  }
};
