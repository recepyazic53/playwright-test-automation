// ÜYE OL (brütalist, tek renk) — ÖNCE ONAY: kullanım koşulları + onay kutusu; "Devam" kutu işaretlenene kadar DEVRE DIŞI. Sonra form
// (aynı sayfada belirir): kullanıcı adı alandan ÇIKINCA sunucuda denetlenir (alınmışsa alanın ALTINDA hata), e-posta, parola + tekrar,
// doğum yılı, davet kodu (isteğe bağlı; "HATA500" sunucuda 500 döndürür). "Hesabı oluştur" → 18 yaş altı iş kuralı hatası (422) →
// başarıda BAŞKA SAYFAYA yönlendirme (/uyelik/hosgeldin).
import { belge, govdeJson, json, kaydet, olay } from '../ortak.mjs';

const KOK = '/uyelik';
const ALINMIS = ['deneme', 'yonetici', 'test'];

const stil = `
body{margin:0;font:15px/1.5 "Courier New",monospace;background:#fff;color:#000}
main{max-width:560px;margin:30px auto;border:2px solid #000;padding:20px;box-shadow:8px 8px 0 #000}
.kosullar{height:110px;overflow:auto;border:2px solid #000;padding:8px;font-size:12px}
label{display:block;margin-top:12px;text-transform:uppercase;font-size:12px;font-weight:bold}input{width:100%;box-sizing:border-box;border:2px solid #000;padding:8px;font:inherit}
input[type=checkbox]{width:auto}button{margin-top:14px;background:#000;color:#fff;border:2px solid #000;padding:10px 20px;font:inherit;cursor:pointer}
button:disabled{background:#fff;color:#999;border-color:#999;cursor:not-allowed}.alan-hatasi{color:#d00;font-size:12px;min-height:16px}`;

const govde = String.raw`<main>
<h1>ÜYE OL_</h1>
<section id="onay">
  <div class="kosullar">Bu platformu kullanarak deneme amaçlı oluşturulan kullanım koşullarını kabul etmiş olursunuz. Hesabınızın güvenliğinden siz sorumlusunuz. Kişisel verileriniz yalnız hizmetin sunulması için işlenir. (Uydurma metin.)</div>
  <label style="text-transform:none"><input type="checkbox" id="kabul"> Koşulları okudum ve kabul ediyorum</label>
  <button type="button" id="devam" disabled>Devam</button>
</section>
<form id="form" hidden novalidate>
  <label for="kadi">Kullanıcı adı</label><input id="kadi" autocomplete="off"><div class="alan-hatasi" id="kadiHata" role="alert"></div>
  <label for="eposta">E-posta</label><input id="eposta" type="email">
  <label for="parola">Parola</label><input id="parola" type="password" autocomplete="new-password">
  <label for="parola2">Parola (tekrar)</label><input id="parola2" type="password" autocomplete="new-password"><div class="alan-hatasi" id="parolaHata"></div>
  <label for="yil">Doğum yılı</label><input id="yil" type="number" min="1900" max="2026">
  <label for="davet">Davet kodu (isteğe bağlı)</label><input id="davet">
  <div class="alan-hatasi" id="genelHata" role="alert"></div>
  <button type="submit">Hesabı oluştur</button>
</form>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
var adUygun = false, denetlenen = null, denetim = Promise.resolve();
$('kabul').addEventListener('change', function(){ $('devam').disabled = !this.checked; });
$('devam').onclick = function(){ $('onay').hidden = true; $('form').hidden = false; $('kadi').focus(); };
function adDenetle(){
  var v = $('kadi').value.trim(); if (v === denetlenen) return denetim;
  denetlenen = v; $('kadiHata').textContent = ''; adUygun = false; if (!v) return (denetim = Promise.resolve());
  denetim = fetch('/uyelik/api/kullanici-adi?ad=' + encodeURIComponent(v)).then(function(r){ return r.json(); }).then(function(j){
    adUygun = j.uygun; $('kadiHata').textContent = j.uygun ? '' : 'Bu kullanıcı adı alınmış';
  });
  return denetim;
}
$('kadi').addEventListener('blur', adDenetle);
$('form').onsubmit = function(o){
  o.preventDefault(); $('genelHata').textContent = ''; $('parolaHata').textContent = '';
  if ($('parola').value.length < 8) { $('parolaHata').textContent = 'Parola en az 8 karakter olmalı.'; return; }
  if ($('parola').value !== $('parola2').value) { $('parolaHata').textContent = 'Parolalar eşleşmiyor.'; return; }
  adDenetle().then(function(){
  if (!adUygun) { $('genelHata').textContent = 'Geçerli ve boş bir kullanıcı adı seçin.'; return; }
  fetch('/uyelik/api/kayit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kadi: $('kadi').value, eposta: $('eposta').value, yil: $('yil').value, davet: $('davet').value }) })
    .then(function(r){ return r.text().then(function(t){ return { d: r.status, t: t }; }); }).then(function(y){
      if (y.d === 500) { $('genelHata').textContent = 'Beklenmeyen bir hata oluştu (500). Lütfen daha sonra tekrar deneyin.'; return; }
      var j = JSON.parse(y.t);
      if (y.d !== 200) { $('genelHata').textContent = j.hata; return; }
      location.href = '/uyelik/hosgeldin?no=' + j.no;
    });
  });
};`;

let no = 7000;
export default {
  kok: KOK, ad: 'Üyelik', alan: 'hesap oluşturma',
  teknikler: ['önce onay (devre dışı Devam)', 'blur ile asenkron doğrulama (alan altı hata)', 'parola', 'iş kuralı 422', 'sunucu 500 yolu', 'yönlendirme'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/uyelik/' || i.yol === '/uyelik')) return belge({ kok: KOK, baslik: 'Üye ol', stil, govde, betik });
    if (i.yol === '/uyelik/hosgeldin') return belge({ kok: KOK, baslik: 'Hoş geldiniz', stil, govde: `<main><h1>HOŞ GELDİNİZ_</h1><p>Hesabınız hazır. Üye no: ${String(i.sorgu.get('no') ?? '').replace(/\D/g, '')}</p></main>` });
    if (i.yol === '/uyelik/api/kullanici-adi') { olay(s, 'adDenetimi'); return json({ uygun: !ALINMIS.includes((i.sorgu.get('ad') ?? '').toLocaleLowerCase('tr')) }, 200, 500); }
    if (i.yol === '/uyelik/api/kayit' && i.yontem === 'POST') {
      const g = govdeJson(i);
      kaydet(s, g);
      if (String(g.davet ?? '').toUpperCase() === 'HATA500') return { durum: 500, tur: 'text/plain; charset=utf-8', govde: 'İç sunucu hatası', gecikmeMs: 300 };
      const yil = Number(g.yil);
      if (!yil || new Date().getFullYear() - yil < 18) return json({ hata: '18 yaşından küçükler üye olamaz.' }, 422, 300);
      return json({ no: ++no }, 200, 400);
    }
    return null;
  }
};
