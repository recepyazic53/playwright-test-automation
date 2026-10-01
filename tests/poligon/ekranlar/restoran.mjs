// RESTORAN SİPARİŞİ (karanlık, ızgara menü) — menü kartlarında yalnız simgeli "+" düğmeleri (aria-label "<yemek> ekle"), sepette adet,
// sipariş notu; "Adres ekle" bir <a role=button> → MODAL (fade, işleyiciler 0,7 sn GECİKMELİ bağlanır), modaldaki form FORM DIŞI submit
// düğmesiyle gönderilir (<button form=…>); ödeme radyosu "Kartla öde" → kart alanları belirir (kart no maskesi, AA/YY maskesi, CVV),
// "Kapıda nakit" → kart alanları kaybolur. "Siparişi ver" href'siz <a> → sonuç.
import { belge, govdeJson, json, kaydet } from '../ortak.mjs';

const KOK = '/restoran';
const MENU = [['Mercimek çorbası', 65], ['Izgara köfte', 210], ['Sebzeli makarna', 145], ['Mevsim salatası', 95], ['Fırın sütlaç', 80], ['Ayran', 30]];

const stil = `
body{margin:0;font:15px/1.5 "Segoe UI",sans-serif;background:#141414;color:#f3e9dc}
header{padding:18px 28px;border-bottom:1px solid #333;font-size:22px;color:#ffb347}
.duzen{display:grid;grid-template-columns:1fr 340px;gap:24px;padding:24px 28px}
.menu{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.yemek{background:#1f1f1f;border-radius:14px;padding:14px;position:relative}
.yemek .ekle{position:absolute;right:10px;bottom:10px;width:36px;height:36px;border-radius:50%;border:0;background:#ffb347;cursor:pointer}
.yemek .ekle svg{width:18px;height:18px}
aside{background:#1f1f1f;border-radius:14px;padding:16px}textarea,input,select{width:100%;box-sizing:border-box;background:#2a2a2a;color:#f3e9dc;border:1px solid #444;border-radius:8px;padding:8px}
a.btn{display:inline-block;background:#ffb347;color:#141414;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:600;text-decoration:none}
a.baglanti{color:#ffb347;cursor:pointer}
.perde{position:fixed;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .4s}
.perde.acik{opacity:1}.modal{background:#222;border-radius:14px;padding:20px;width:400px}.modal footer{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
.modal footer button{background:#ffb347;border:0;border-radius:8px;padding:8px 14px;cursor:pointer}.hata{color:#ff6b6b}`;

const arti = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4h2v16h-2zM4 11h16v2H4z"/></svg>';
const govde = String.raw`<header>Lokanta · Paket servis</header>
<div class="duzen">
<section><h1>Menü</h1><div class="menu">${MENU.map(([ad, f]) => `<div class="yemek"><h3>${ad}</h3><p>${f} TL</p><button type="button" class="ekle" aria-label="${ad} ekle" data-ad="${ad}" data-fiyat="${f}">${arti}</button></div>`).join('')}</div></section>
<aside>
  <h2>Sepet</h2><ul id="sepet"><li>Sepetiniz boş</li></ul>
  <label for="not">Sipariş notu</label><textarea id="not" rows="2" placeholder="Ör. zil çalışmıyor"></textarea>
  <h3>Teslimat adresi</h3><p id="adresMetni">Adres eklenmedi.</p><a role="button" href="#" class="baglanti" id="adresAc">Adres ekle</a>
  <h3>Ödeme</h3>
  <label><input type="radio" name="odeme" value="kapida" checked style="width:auto"> Kapıda nakit</label>
  <label><input type="radio" name="odeme" value="kart" style="width:auto"> Kartla öde</label>
  <div id="kartAlanlari" hidden>
    <label for="kartNo">Kart numarası</label><input id="kartNo" inputmode="numeric" autocomplete="off" placeholder="0000 0000 0000 0000">
    <label for="skt">Son kullanma (AA/YY)</label><input id="skt" inputmode="numeric" placeholder="AA/YY">
    <label for="cvv">CVV</label><input id="cvv" inputmode="numeric" maxlength="3">
  </div>
  <p id="hata" class="hata" role="alert"></p>
  <p>Toplam: <b id="toplam">0 TL</b></p>
  <a class="btn" id="siparisVer">Siparişi ver</a>
</aside></div>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
var sepet = {}, adres = null;
function sepetCiz(){
  var l = $('sepet'), t = 0, adlar = Object.keys(sepet); l.innerHTML = adlar.length ? '' : '<li>Sepetiniz boş</li>';
  adlar.forEach(function(a){ t += sepet[a].fiyat * sepet[a].adet; var li = document.createElement('li'); li.textContent = a + ' × ' + sepet[a].adet; l.appendChild(li); });
  $('toplam').textContent = t + ' TL';
}
document.querySelectorAll('.ekle').forEach(function(b){ b.onclick = function(){ var a = b.dataset.ad; sepet[a] = sepet[a] || { fiyat: Number(b.dataset.fiyat), adet: 0 }; sepet[a].adet++; sepetCiz(); }; });
document.querySelectorAll('input[name=odeme]').forEach(function(r){ r.addEventListener('change', function(){ $('kartAlanlari').hidden = this.value !== 'kart'; }); });
$('kartNo').addEventListener('input', function(){ this.value = this.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); });
$('skt').addEventListener('input', function(){ var r = this.value.replace(/\D/g, '').slice(0, 4); this.value = r.length > 2 ? r.slice(0, 2) + '/' + r.slice(2) : r; });
$('adresAc').onclick = function(o){
  o.preventDefault();
  var p = document.createElement('div'); p.className = 'perde';
  p.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mb"><h2 id="mb">Yeni adres</h2><form id="adresFormu">'
    + '<label for="baslik">Adres başlığı</label><input id="baslik" placeholder="Ev, İş…">'
    + '<label for="mahalle">Mahalle</label><select id="mahalle"><option value="">Seçiniz</option><option>Çınarlı</option><option>Yeşiltepe</option><option>Kavaklı</option></select>'
    + '<label for="acikAdres">Açık adres</label><textarea id="acikAdres" rows="2"></textarea></form>'
    + '<p id="mHata" class="hata"></p><footer><button type="button" id="vazgec">Vazgeç</button><button type="submit" form="adresFormu">Adresi kaydet</button></footer></div>';
  document.body.appendChild(p);
  requestAnimationFrame(function(){ p.classList.add('acik'); });
  setTimeout(function(){
    $('vazgec').onclick = function(){ p.remove(); };
    $('adresFormu').onsubmit = function(o){
      o.preventDefault();
      if (!$('baslik').value.trim() || !$('mahalle').value || !$('acikAdres').value.trim()) { $('mHata').textContent = 'Tüm adres alanları zorunludur.'; return; }
      adres = { baslik: $('baslik').value, mahalle: $('mahalle').value, acik: $('acikAdres').value };
      p.classList.remove('acik'); setTimeout(function(){ p.remove(); }, 400);
      $('adresMetni').textContent = adres.baslik + ' — ' + adres.mahalle + ', ' + adres.acik; $('adresAc').textContent = 'Adresi değiştir';
    };
  }, 700);
  $('adresFormu').onsubmit = function(o){ o.preventDefault(); };
};
$('siparisVer').onclick = function(){
  $('hata').textContent = '';
  if (!Object.keys(sepet).length) { $('hata').textContent = 'Sepetiniz boş.'; return; }
  if (!adres) { $('hata').textContent = 'Teslimat adresi ekleyin.'; return; }
  var odeme = document.querySelector('input[name=odeme]:checked').value;
  if (odeme === 'kart' && ($('kartNo').value.replace(/\s/g, '').length !== 16 || !/^\d{2}\/\d{2}$/.test($('skt').value) || $('cvv').value.length !== 3)) { $('hata').textContent = 'Kart bilgilerini eksiksiz girin.'; return; }
  fetch('/restoran/api/siparis', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sepet: sepet, not: $('not').value, adres: adres, odeme: odeme, kartSon4: odeme === 'kart' ? $('kartNo').value.slice(-4) : null, skt: odeme === 'kart' ? $('skt').value : null }) })
    .then(function(r){ return r.json(); }).then(function(j){ document.querySelector('aside').innerHTML = '<h2>Afiyet olsun!</h2><p role="status">Siparişiniz alındı. Tahmini teslimat: ' + j.dakika + ' dk</p>'; });
};`;

export default {
  kok: KOK, ad: 'Restoran', alan: 'yemek siparişi',
  teknikler: ['karanlık tema', 'yalnız aria-label simge düğmeler', 'fade modal + gecikmeli işleyici', 'form dışı submit', 'seçime göre beliren/kaybolan kart alanları', 'maske', 'href’siz bağlantı'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/restoran/' || i.yol === '/restoran')) return belge({ kok: KOK, baslik: 'Paket servis', stil, govde, betik });
    if (i.yol === '/restoran/api/siparis' && i.yontem === 'POST') { kaydet(s, govdeJson(i)); return json({ dakika: 35 }, 200, 500); }
    return null;
  }
};
