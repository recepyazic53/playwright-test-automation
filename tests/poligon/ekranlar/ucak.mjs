// UÇUŞ REZERVASYONU — otomatik tamamlama (yazdıkça öneri; ÖNERİDEN seçilmezse kabul edilmez), "Uçuşları ara" → aynı metinli birden
// çok "Seç" düğmesi, koltuk haritasından tıklayarak seçim (gridcell düğmeler, dolu koltuklar devre dışı), "Yolcu bilgilerini gir" →
// MODAL içinde yolcu formu, iş kuralı (18 yaş altı tek başına uçamaz; 422), başarıda SPA rota değişimi (/ucak/onay).
import { belge, govdeJson, json, kaydet, olay, yas } from '../ortak.mjs';

const KOK = '/ucak';
const HAVALIMANLARI = ['Kuzeykent (KZK)', 'Kuzeyova (KZO)', 'Güneykent (GNK)', 'Doğukent (DGK)', 'Batıkent (BTK)', 'Ortakent (ORT)', 'Yaylakent (YYK)'];

const stil = `
body{margin:0;font:15px/1.5 Verdana,sans-serif;background:linear-gradient(160deg,#0b4f8a,#5fb3f0) fixed;color:#0d2236;min-height:100vh}
main{max-width:900px;margin:40px auto;background:#ffffffee;border-radius:6px;padding:24px}
.arama{display:grid;grid-template-columns:1fr 1fr 1fr 120px;gap:12px;align-items:end}
.oneri{position:relative}.oneri ul{position:absolute;left:0;right:0;top:100%;margin:0;padding:0;list-style:none;background:#fff;border:1px solid #0b4f8a;z-index:3}
.oneri li{padding:6px 10px;cursor:pointer}.oneri li:hover{background:#d8ecfb}
label{font-size:12px;text-transform:uppercase;color:#0b4f8a}input,select{width:100%;box-sizing:border-box;padding:9px;border:1px solid #9cc3e3;border-radius:4px}
.mavi{background:#0b4f8a;color:#fff;border:0;border-radius:4px;padding:10px 16px;cursor:pointer}
.ucus{display:flex;justify-content:space-between;align-items:center;border:1px solid #cfe3f3;padding:10px;margin:8px 0;border-radius:4px}
.harita{display:grid;grid-template-columns:repeat(6,42px);gap:6px;margin:12px 0}.harita button{height:38px;border:1px solid #0b4f8a;background:#fff;border-radius:6px 6px 2px 2px;cursor:pointer}
.harita button:disabled{background:#ccc;border-color:#aaa;cursor:not-allowed}.harita button[aria-pressed=true]{background:#0b4f8a;color:#fff}
.perde{position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center}
.modal{background:#fff;border-radius:8px;padding:20px;width:420px}.hata{color:#b3261e}`;

const govde = String.raw`<main id="kok">
<h1>Uçuş ara</h1>
<div class="arama">
  <div class="oneri"><label for="nereden">Nereden</label><input id="nereden" autocomplete="off" placeholder="Şehir veya havalimanı"><ul id="neredenListe" role="listbox" hidden></ul></div>
  <div class="oneri"><label for="nereye">Nereye</label><input id="nereye" autocomplete="off" placeholder="Şehir veya havalimanı"><ul id="nereyeListe" role="listbox" hidden></ul></div>
  <div><label for="tarih">Gidiş tarihi</label><input id="tarih" type="date"></div>
  <div><label for="yolcu">Yolcu</label><select id="yolcu"><option>1</option><option>2</option><option>3</option></select></div>
</div>
<p id="aramaHata" class="hata" role="alert"></p>
<button type="button" class="mavi" id="ara">Uçuşları ara</button>
<div id="sonuclar"></div>
<section id="koltukBolumu" hidden><h2>Koltuk seçimi</h2><div class="harita" id="harita" role="grid" aria-label="Koltuk haritası"></div>
<p>Seçilen koltuk: <b id="koltuk">—</b></p><button type="button" class="mavi" id="yolcuAc" disabled>Yolcu bilgilerini gir</button></section>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
var secim = { nereden: null, nereye: null, ucus: null, koltuk: null };
function otomatik(alan, liste, anahtar){
  var zaman = null;
  alan.addEventListener('input', function(){
    secim[anahtar] = null; clearTimeout(zaman);
    if (alan.value.trim().length < 2) { liste.hidden = true; return; }
    zaman = setTimeout(function(){
      fetch('/ucak/api/havalimani?q=' + encodeURIComponent(alan.value.trim())).then(function(r){ return r.json(); }).then(function(j){
        liste.innerHTML = '';
        j.sonuclar.forEach(function(s){
          var li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = s;
          li.onmousedown = function(o){ o.preventDefault(); alan.value = s; secim[anahtar] = s; liste.hidden = true; };
          liste.appendChild(li);
        });
        liste.hidden = !j.sonuclar.length;
      });
    }, 300);
  });
  alan.addEventListener('blur', function(){ setTimeout(function(){ liste.hidden = true; }, 150); });
}
otomatik($('nereden'), $('neredenListe'), 'nereden');
otomatik($('nereye'), $('nereyeListe'), 'nereye');
$('ara').onclick = function(){
  $('aramaHata').textContent = '';
  if (!secim.nereden || !secim.nereye) { $('aramaHata').textContent = 'Lütfen kalkış ve varış havalimanını öneri listesinden seçin.'; return; }
  if (!$('tarih').value) { $('aramaHata').textContent = 'Gidiş tarihini seçin.'; return; }
  $('sonuclar').innerHTML = '<p>Uçuşlar aranıyor…</p>';
  fetch('/ucak/api/ucuslar').then(function(r){ return r.json(); }).then(function(j){
    $('sonuclar').innerHTML = '<h2>Uygun uçuşlar</h2>';
    j.ucuslar.forEach(function(u){
      var d = document.createElement('div'); d.className = 'ucus';
      d.innerHTML = '<span><b>' + u.saat + '</b> · ' + u.kod + ' · ' + u.fiyat + '</span><button type="button" class="mavi">Seç</button>';
      d.querySelector('button').onclick = function(){ secim.ucus = u.kod; haritaCiz(); };
      $('sonuclar').appendChild(d);
    });
  });
};
function haritaCiz(){
  $('koltukBolumu').hidden = false; $('harita').innerHTML = '';
  for (var s = 1; s <= 5; s++) 'ABCDEF'.split('').forEach(function(h){
    var b = document.createElement('button'); b.type = 'button'; b.textContent = s + h; b.setAttribute('role', 'gridcell'); b.setAttribute('aria-label', 'Koltuk ' + s + h);
    b.disabled = (s + h === '1A' || s + h === '2C' || s + h === '3D'); b.setAttribute('aria-pressed', 'false');
    b.onclick = function(){ document.querySelectorAll('.harita button').forEach(function(x){ x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); secim.koltuk = b.textContent; $('koltuk').textContent = b.textContent; $('yolcuAc').disabled = false; };
    $('harita').appendChild(b);
  });
}
$('yolcuAc').onclick = function(){
  var p = document.createElement('div'); p.className = 'perde';
  p.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mb"><h2 id="mb">Yolcu bilgileri</h2>'
    + '<label for="yAd">Yolcu adı</label><input id="yAd"><label for="ySoyad">Yolcu soyadı</label><input id="ySoyad">'
    + '<label for="yDogum">Doğum tarihi (gg.aa.yyyy)</label><input id="yDogum" placeholder="gg.aa.yyyy">'
    + '<p id="yHata" class="hata" role="alert"></p><button type="button" class="mavi" id="tamamla">Rezervasyonu tamamla</button></div>';
  document.body.appendChild(p);
  $('tamamla').onclick = function(){
    $('yHata').textContent = '';
    fetch('/ucak/api/rezervasyon', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      nereden: secim.nereden, nereye: secim.nereye, tarih: $('tarih').value, yolcu: $('yolcu').value, ucus: secim.ucus, koltuk: secim.koltuk,
      ad: $('yAd').value, soyad: $('ySoyad').value, dogum: $('yDogum').value }) })
      .then(function(r){ return r.json().then(function(j){ return { durum: r.status, j: j }; }); }).then(function(y){
        if (y.durum !== 200) { $('yHata').textContent = y.j.hata; return; }
        p.remove(); history.pushState({}, '', '/ucak/onay');
        $('kok').innerHTML = '<h1>Rezervasyonunuz onaylandı</h1><p role="status">PNR: ' + y.j.pnr + '</p><p>Koltuk ' + secim.koltuk + '</p>';
      });
  };
};`;

let pnr = 6000;
export default {
  kok: KOK, ad: 'Uçak', alan: 'uçuş rezervasyonu',
  teknikler: ['otomatik tamamlama (öneriden seçim)', 'aynı metinli Seç düğmeleri', 'koltuk haritası', 'modal form', 'iş kuralı 422', 'SPA pushState'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/ucak/' || i.yol === '/ucak' || i.yol === '/ucak/onay')) return belge({ kok: KOK, baslik: 'Uçuş ara', stil, govde, betik });
    if (i.yol === '/ucak/api/havalimani') {
      olay(s, 'oneri');
      const q = (i.sorgu.get('q') ?? '').toLocaleLowerCase('tr');
      return json({ sonuclar: HAVALIMANLARI.filter((h) => h.toLocaleLowerCase('tr').includes(q)) }, 200, 250);
    }
    if (i.yol === '/ucak/api/ucuslar') { olay(s, 'arama'); return json({ ucuslar: [{ saat: '07:40', kod: 'PG 101', fiyat: '1.250 TL' }, { saat: '12:15', kod: 'PG 117', fiyat: '1.480 TL' }, { saat: '19:05', kod: 'PG 131', fiyat: '990 TL' }] }, 200, 900); }
    if (i.yol === '/ucak/api/rezervasyon' && i.yontem === 'POST') {
      const g = govdeJson(i);
      kaydet(s, g);
      const y = yas(g.dogum);
      if (y === null) return json({ hata: 'Doğum tarihi gg.aa.yyyy biçiminde olmalı.' }, 422, 300);
      if (y < 18) return json({ hata: '18 yaşından küçük yolcular tek başına uçamaz.' }, 422, 300);
      return json({ pnr: `UC${++pnr}` }, 200, 500);
    }
    return null;
  }
};
