// E-TİCARET SEPETİ — adet artır/azalt (aynı adlı düğmeler), kupon + YANINDAKİ "Uygula" düğmesi (sonuç kartı, yeni alan yok), kargo
// radyo kartları (role=radio div), "Ödemeye geç" → SPA (pushState /sepet/odeme) ile içerik yer değiştirir: adres formu; "Daha fazla
// seçenek" bağlantısı gizli bölümü açar (teslimat saati + kapıda bırak); "Siparişi onayla" → alert → sonuç.
import { belge, govdeJson, json, kaydet, olay } from '../ortak.mjs';

const KOK = '/sepet';

const stil = `
body{margin:0;font:15px/1.5 "Segoe UI",Arial,sans-serif;background:#fff7f0;color:#2b1d12}
header{background:#ff6a13;color:#fff;padding:12px 28px;font-weight:700;letter-spacing:.5px}
main{max-width:980px;margin:24px auto;display:grid;grid-template-columns:2fr 1fr;gap:24px}
.kart{background:#fff;border-radius:14px;box-shadow:0 2px 10px #0001;padding:18px}
.urun{display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed #f0d5c0;padding:10px 0}
.adet{display:flex;align-items:center;gap:6px}.adet button{width:30px;height:30px;border-radius:50%;border:1px solid #ff6a13;background:#fff;color:#ff6a13;font-size:18px;cursor:pointer}
.kargolar{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.kargo{border:2px solid #f0d5c0;border-radius:12px;padding:10px;cursor:pointer}.kargo[aria-checked=true]{border-color:#ff6a13;background:#fff1e6}
.btn{background:#ff6a13;color:#fff;border:0;border-radius:24px;padding:10px 22px;font-weight:600;cursor:pointer}
.ince{background:none;color:#ff6a13;border:1px solid #ff6a13}
label{display:block;margin-top:10px;font-size:13px;color:#7a5a44}input,select,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #e5c9b3;border-radius:8px}
.hata{color:#c0262d;font-size:13px}.basari{background:#e9fbe9;border:1px solid #9bd59b;padding:10px;border-radius:8px}
#kuponSatiri{display:flex;gap:8px}#kuponSatiri input{flex:1}`;

const govde = String.raw`<header>ÖRNEK PAZAR · Sepetim</header>
<main id="kok"></main>`;

const betik = String.raw`
var urunler = [{ ad: 'Kablosuz kulaklık', fiyat: 899, adet: 1 }, { ad: 'Telefon kılıfı', fiyat: 149, adet: 2 }];
var durum = { kupon: null, kargo: 'standart' };
var kok = document.getElementById('kok');
function para(n){ return n.toFixed(2).replace('.', ',') + ' TL'; }
function toplam(){ var t = 0; urunler.forEach(function(u){ t += u.fiyat * u.adet; }); return durum.kupon ? t * 0.9 : t; }
function sepetCiz(){
  kok.innerHTML = '<section class="kart"><h1>Sepetim</h1><div id="urunler"></div>'
    + '<h2>Kargo seçimi</h2><div class="kargolar" role="radiogroup" aria-label="Kargo seçimi">'
    + '<div class="kargo" role="radio" tabindex="0" data-k="standart">Standart kargo<br><small>3-5 iş günü · Ücretsiz</small></div>'
    + '<div class="kargo" role="radio" tabindex="0" data-k="hizli">Hızlı kargo<br><small>Ertesi gün · 49,90 TL</small></div>'
    + '<div class="kargo" role="radio" tabindex="0" data-k="magaza">Mağazadan al<br><small>Ücretsiz</small></div></div></section>'
    + '<aside class="kart"><h2>Özet</h2><label for="kupon">Kupon kodu</label><div id="kuponSatiri"><input id="kupon" autocomplete="off"><button type="button" class="btn ince" id="uygula">Uygula</button></div>'
    + '<div id="kuponSonucu" aria-live="polite"></div><p>Toplam: <b id="toplam"></b></p><button type="button" class="btn" id="odemeyeGec">Ödemeye geç</button></aside>';
  var l = document.getElementById('urunler');
  urunler.forEach(function(u, i){
    var d = document.createElement('div'); d.className = 'urun';
    d.innerHTML = '<span>' + u.ad + '<br><small>' + para(u.fiyat) + '</small></span><span class="adet"><button type="button" aria-label="Adedi azalt">−</button><output>' + u.adet + '</output><button type="button" aria-label="Adedi artır">+</button></span>';
    d.querySelectorAll('button')[0].onclick = function(){ if (u.adet > 1) { u.adet--; sepetCiz(); } };
    d.querySelectorAll('button')[1].onclick = function(){ if (u.adet < 9) { u.adet++; sepetCiz(); } };
    l.appendChild(d);
  });
  document.querySelectorAll('.kargo').forEach(function(k){
    k.setAttribute('aria-checked', String(k.dataset.k === durum.kargo));
    k.onclick = function(){ durum.kargo = k.dataset.k; document.querySelectorAll('.kargo').forEach(function(x){ x.setAttribute('aria-checked', String(x === k)); }); };
  });
  document.getElementById('toplam').textContent = para(toplam());
  if (durum.kupon) document.getElementById('kuponSonucu').innerHTML = '<p class="basari">' + durum.kupon + ': %10 indirim uygulandı</p>';
  document.getElementById('uygula').onclick = function(){
    var kod = document.getElementById('kupon').value.trim();
    var s = document.getElementById('kuponSonucu'); s.innerHTML = '<small>Kontrol ediliyor…</small>';
    fetch('/sepet/api/kupon?kod=' + encodeURIComponent(kod)).then(function(r){ return r.json(); }).then(function(j){
      if (j.gecerli) { durum.kupon = kod.toUpperCase(); sepetCiz(); }
      else s.innerHTML = '<p class="hata" role="alert">Kupon kodu geçersiz</p>';
    });
  };
  document.getElementById('odemeyeGec').onclick = function(){ history.pushState({}, '', '/sepet/odeme'); odemeCiz(); };
}
function odemeCiz(){
  kok.innerHTML = '<section class="kart" style="grid-column:1/3"><h1>Teslimat ve ödeme</h1><form id="adresFormu" novalidate>'
    + '<label for="adSoyad">Ad soyad</label><input id="adSoyad" required>'
    + '<label for="tel">Cep telefonu</label><input id="tel" inputmode="tel" placeholder="05xx xxx xx xx" required>'
    + '<label for="il">İl</label><select id="il" required><option value="">Seçiniz</option><option>Kuzeykent</option><option>Güneykent</option><option>Ortakent</option></select>'
    + '<label for="adres">Açık adres</label><textarea id="adres" rows="2" required></textarea>'
    + '<p><a href="#" id="dahaFazla">Daha fazla seçenek</a></p><div id="ekSecenekler" hidden>'
    + '<label for="saat">Teslimat saati</label><select id="saat"><option>Fark etmez</option><option>09:00-12:00</option><option>12:00-18:00</option><option>18:00-22:00</option></select>'
    + '<label><input type="checkbox" id="kapida" style="width:auto"> Kapıya bırakılsın</label></div>'
    + '<div id="hata" class="hata" role="alert"></div><p>Ödenecek: <b>' + para(toplam()) + '</b></p>'
    + '<button type="submit" class="btn">Siparişi onayla</button></form></section>';
  document.getElementById('dahaFazla').onclick = function(o){ o.preventDefault(); document.getElementById('ekSecenekler').hidden = false; this.remove(); };
  document.getElementById('adresFormu').onsubmit = function(o){
    o.preventDefault();
    var v = function(id){ return document.getElementById(id).value.trim(); };
    if (!v('adSoyad') || !v('tel') || !v('il') || !v('adres')) { document.getElementById('hata').textContent = 'Lütfen tüm teslimat bilgilerini doldurun.'; return; }
    var b = this.querySelector('button'); b.disabled = true;
    fetch('/sepet/api/siparis', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      urunler: urunler.map(function(u){ return u.ad + ' x' + u.adet; }), kupon: durum.kupon, kargo: durum.kargo, adSoyad: v('adSoyad'), tel: v('tel'), il: v('il'), adres: v('adres'),
      saat: document.getElementById('saat').value, kapida: document.getElementById('kapida').checked }) })
      .then(function(r){ return r.json(); }).then(function(j){
        alert('Siparişiniz alındı!');
        kok.innerHTML = '<section class="kart" style="grid-column:1/3"><h1>Teşekkürler</h1><p role="status">Sipariş numaranız: ' + j.no + '</p></section>';
      });
  };
}
if (location.pathname.indexOf('/sepet/odeme') === 0) odemeCiz(); else sepetCiz();
window.addEventListener('popstate', function(){ if (location.pathname.indexOf('/sepet/odeme') === 0) odemeCiz(); else sepetCiz(); });`;

let no = 3000;
export default {
  kok: KOK, ad: 'Sepet', alan: 'e-ticaret',
  teknikler: ['aynı adlı artır/azalt', 'kupon + yanındaki düğme', 'radyo kartları', 'SPA pushState', 'Daha fazla seçenek', 'alert'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/sepet/' || i.yol === '/sepet' || i.yol === '/sepet/odeme')) return belge({ kok: KOK, baslik: 'Sepetim', stil, govde, betik });
    if (i.yol === '/sepet/api/kupon') { olay(s, 'kupon'); return json({ gecerli: /^indirim10$/i.test(i.sorgu.get('kod') ?? '') }, 200, 500); }
    if (i.yol === '/sepet/api/siparis' && i.yontem === 'POST') { const g = govdeJson(i); kaydet(s, g); return json({ no: `SP-${++no}` }, 200, 400); }
    return null;
  }
};
