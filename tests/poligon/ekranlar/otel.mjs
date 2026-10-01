// OTEL REZERVASYONU — tarih aralığı yalnız TAKVİMDEN tıklanarak seçilir (salt okunur alanlar), kişi sayısı artır/azalt (output, input
// değil), çocuk sayısı > 0 olunca "Çocuk yaşı" listesi belirir (zorunlu), "Müsaitlik sorgula" → BİRDEN ÇOK oda kartı döner, biri
// "Bu odayı seç" ile seçilir → misafir formu aynı sayfada belirir (zorunlu alanlar) → "Rezervasyonu tamamla" → uzun ilerleme (%)
// → başka sayfaya yönlendirme (/otel/onay?no=…).
import { belge, govdeJson, json, kaydet, olay } from '../ortak.mjs';

const KOK = '/otel';

const stil = `
body{margin:0;font:16px/1.6 Georgia,"Times New Roman",serif;background:#f4efe6;color:#3a2f22}
.ust{background:#3a2f22;color:#e8d9b5;text-align:center;padding:22px;font-size:26px;letter-spacing:3px}
main{max-width:860px;margin:30px auto;background:#fffdf8;border:1px solid #d8c9a8;padding:28px 36px}
.satir{display:flex;gap:24px;flex-wrap:wrap}.satir>div{flex:1;min-width:180px}
label{font-variant:small-caps;color:#7b6a4c;display:block}input,select{font:inherit;padding:6px;border:0;border-bottom:1px solid #a8946b;background:transparent;width:100%}
.takvim{position:absolute;background:#fff;border:1px solid #a8946b;padding:10px;display:grid;grid-template-columns:repeat(7,34px);gap:4px;z-index:5}
.takvim button{border:0;background:#f4efe6;cursor:pointer;height:30px}.takvim b{grid-column:1/8;text-align:center}
.sayac{display:flex;align-items:center;gap:10px}.sayac button{border:1px solid #3a2f22;background:#fff;width:32px;height:32px;cursor:pointer}
.odalar{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}.oda{border:1px solid #d8c9a8;padding:12px;background:#fff}
.oda.secili{outline:3px solid #b08d3c}
.ana{background:#3a2f22;color:#e8d9b5;border:0;padding:10px 26px;font:inherit;cursor:pointer;letter-spacing:1px}
.hata{color:#9b1c1c}#ilerleme{position:fixed;inset:0;background:#3a2f22e6;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:22px}`;

const govde = String.raw`<div class="ust">KONAK OTEL</div>
<main>
<h1>Rezervasyon</h1>
<div class="satir" style="position:relative">
  <div><label for="giris">Giriş tarihi</label><input id="giris" readonly placeholder="Takvimden seçin"></div>
  <div><label for="cikis">Çıkış tarihi</label><input id="cikis" readonly placeholder="Takvimden seçin"></div>
</div>
<div class="satir" style="margin-top:18px">
  <div><label>Yetişkin</label><div class="sayac"><button type="button" aria-label="Yetişkin azalt">−</button><output id="yetiskin">2</output><button type="button" aria-label="Yetişkin artır">+</button></div></div>
  <div><label>Çocuk</label><div class="sayac"><button type="button" aria-label="Çocuk azalt">−</button><output id="cocuk">0</output><button type="button" aria-label="Çocuk artır">+</button></div></div>
  <div id="cocukYasiKutusu" hidden><label for="cocukYasi">Çocuk yaşı</label><select id="cocukYasi"><option value="">Seçiniz</option><option>0-2</option><option>3-6</option><option>7-12</option></select></div>
</div>
<p id="uyari" class="hata" role="alert"></p>
<button type="button" class="ana" id="sorgula">Müsaitlik sorgula</button>
<div id="odalar" class="odalar"></div>
<section id="misafir" hidden>
  <h2>Misafir bilgileri</h2>
  <div class="satir"><div><label for="ad">Ad</label><input id="ad"></div><div><label for="soyad">Soyad</label><input id="soyad"></div></div>
  <div class="satir"><div><label for="eposta">E-posta</label><input id="eposta" type="email"></div><div><label for="telefon">Telefon</label><input id="telefon" type="tel"></div></div>
  <p id="misafirHata" class="hata" role="alert"></p>
  <button type="button" class="ana" id="tamamla">Rezervasyonu tamamla</button>
</section>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
var secilenOda = null;
function takvimAc(alan){
  var eski = document.querySelector('.takvim'); if (eski) eski.remove();
  var t = document.createElement('div'); t.className = 'takvim';
  var b = new Date(); b.setDate(1); b.setMonth(b.getMonth() + 1);
  var ay = b.getMonth() + 1, yil = b.getFullYear();
  t.innerHTML = '<b>' + ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][ay - 1] + ' ' + yil + '</b>';
  for (var g = 1; g <= 28; g++) (function(g){
    var d = document.createElement('button'); d.type = 'button'; d.textContent = g;
    d.onclick = function(){ alan.value = (g < 10 ? '0' : '') + g + '.' + (ay < 10 ? '0' : '') + ay + '.' + yil; t.remove(); };
    t.appendChild(d);
  })(g);
  alan.parentNode.appendChild(t);
}
$('giris').onclick = function(){ takvimAc(this); };
$('cikis').onclick = function(){ takvimAc(this); };
document.querySelectorAll('.sayac').forEach(function(s){
  var o = s.querySelector('output'), b = s.querySelectorAll('button');
  b[0].onclick = function(){ o.textContent = Math.max(o.id === 'yetiskin' ? 1 : 0, Number(o.textContent) - 1); degisti(); };
  b[1].onclick = function(){ o.textContent = Math.min(6, Number(o.textContent) + 1); degisti(); };
});
function degisti(){ $('cocukYasiKutusu').hidden = Number($('cocuk').textContent) === 0; }
$('sorgula').onclick = function(){
  $('uyari').textContent = '';
  if (!$('giris').value || !$('cikis').value) { $('uyari').textContent = 'Lütfen giriş ve çıkış tarihlerini takvimden seçin.'; return; }
  if (Number($('cocuk').textContent) > 0 && !$('cocukYasi').value) { $('uyari').textContent = 'Çocuk yaşını seçin.'; return; }
  $('odalar').innerHTML = '<p>Odalar aranıyor…</p>';
  fetch('/otel/api/musaitlik?giris=' + $('giris').value + '&cikis=' + $('cikis').value).then(function(r){ return r.json(); }).then(function(j){
    $('odalar').innerHTML = '';
    j.odalar.forEach(function(o){
      var k = document.createElement('div'); k.className = 'oda';
      k.innerHTML = '<h3>' + o.ad + '</h3><p>' + o.fiyat + ' / gece</p><button type="button" class="ana">Bu odayı seç</button>';
      k.querySelector('button').onclick = function(){
        document.querySelectorAll('.oda').forEach(function(x){ x.classList.remove('secili'); }); k.classList.add('secili');
        secilenOda = o.ad; $('misafir').hidden = false;
      };
      $('odalar').appendChild(k);
    });
  });
};
$('tamamla').onclick = function(){
  var bos = ['ad','soyad','eposta','telefon'].filter(function(id){ return !$(id).value.trim(); });
  if (bos.length) { $('misafirHata').textContent = 'Zorunlu alanlar boş: ' + bos.length; return; }
  var p = document.createElement('div'); p.id = 'ilerleme'; p.innerHTML = '<p>Rezervasyonunuz işleniyor…</p><p id="yuzde">%0</p>'; document.body.appendChild(p);
  var y = 0, t = setInterval(function(){
    y += 10; $('yuzde').textContent = '%' + Math.min(y, 90);
    if (y < 100) return; clearInterval(t);
    fetch('/otel/api/rezervasyon', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      giris: $('giris').value, cikis: $('cikis').value, yetiskin: $('yetiskin').textContent, cocuk: $('cocuk').textContent, cocukYasi: $('cocukYasi').value,
      oda: secilenOda, ad: $('ad').value, soyad: $('soyad').value, eposta: $('eposta').value, telefon: $('telefon').value }) })
      .then(function(r){ return r.json(); }).then(function(j){ location.href = '/otel/onay?no=' + encodeURIComponent(j.no); });
  }, 450);
};`;

let no = 1000;
const onay = (n) => belge({ kok: KOK, baslik: 'Rezervasyon onayı', stil, govde: `<div class="ust">KONAK OTEL</div><main><h1>Rezervasyonunuz onaylandı</h1><p>Rezervasyon no: ${n.replace(/[^A-Z0-9-]/g, '')}</p><p>Konaklamanızdan önce e-posta ile bilgilendirileceksiniz.</p></main>` });

export default {
  kok: KOK, ad: 'Otel', alan: 'rezervasyon',
  teknikler: ['takvimden tarih (salt okunur)', 'artır/azalt (output)', 'değere bağlı beliren liste', 'çok kartlı sonuç + seç', 'uzun ilerleme', 'yönlendirme'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/otel/' || i.yol === '/otel')) return belge({ kok: KOK, baslik: 'Otel rezervasyonu', stil, govde, betik });
    if (i.yol === '/otel/onay') return onay(String(i.sorgu.get('no') ?? ''));
    if (i.yol === '/otel/api/musaitlik') {
      olay(s, 'musaitlik');
      return json({ odalar: [{ ad: 'Standart oda', fiyat: '2.400 TL' }, { ad: 'Bahçe manzaralı oda', fiyat: '3.150 TL' }, { ad: 'Süit', fiyat: '5.900 TL' }] }, 200, 1200);
    }
    if (i.yol === '/otel/api/rezervasyon' && i.yontem === 'POST') { kaydet(s, govdeJson(i)); return json({ no: `OT-${++no}` }, 200, 300); }
    return null;
  }
};
