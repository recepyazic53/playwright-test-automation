// BANKA HAVALESİ — IBAN maskesi (TR + 4'lü gruplar, tuşla biçimlenir) + YANINDAKİ "Alıcıyı sorgula" düğmesi → alıcı kartı ve ALTINDA yeni
// ZORUNLU alanlar (Tutar, Açıklama) belirir; "Devam" → aynı sayfada adım değişir (adres aynı, içerik yer değiştirir): özet + onay kodu
// (sayfada "Deneme onay kodu" yazar) → "Onayla" → window.confirm → evet: dekont / hayır: "İşlem iptal edildi".
import { belge, govdeJson, json, kaydet, olay } from '../ortak.mjs';

const KOK = '/havale';

const stil = `
body{margin:0;font:14px/1.5 Tahoma,Arial,sans-serif;background:#eef1f6;color:#13213c}
nav{background:#13213c;color:#fff;padding:14px 24px;display:flex;justify-content:space-between}
main{max-width:620px;margin:28px auto;background:#fff;border-top:4px solid #c9a227;padding:22px 26px;box-shadow:0 1px 3px #0002}
.alan{margin:12px 0}.alan label{display:block;font-weight:bold;margin-bottom:4px}
input,textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid #b8c1d1;font:inherit}
.yan{display:flex;gap:8px}.yan input{flex:1}
.dugme{background:#13213c;color:#fff;border:0;padding:9px 18px;cursor:pointer;font:inherit}.ikincil{background:#fff;color:#13213c;border:1px solid #13213c}
.alici{border:1px solid #c9a227;background:#fffbea;padding:10px;margin:10px 0}.hata{color:#b00020;font-size:13px}
dl{display:grid;grid-template-columns:140px 1fr;gap:6px}dt{color:#5b6782}`;

const govde = String.raw`<nav><b>ÖRNEK KATILIM · İnternet şubesi</b><span>Hesaplarım · Transfer</span></nav>
<main id="kok">
<h1>Para transferi</h1>
<div id="adim1">
  <div class="alan"><label for="iban">Alıcı IBAN</label><div class="yan"><input id="iban" placeholder="TR00 0000 0000 0000 0000 0000 00" autocomplete="off"><button type="button" class="dugme ikincil" id="sorgula">Alıcıyı sorgula</button></div>
  <div id="ibanHata" class="hata" role="alert"></div></div>
  <div id="aliciKutusu"></div>
  <div id="detay" hidden>
    <div class="alan"><label for="tutar">Tutar (TL)</label><input id="tutar" inputmode="decimal" required></div>
    <div class="alan"><label for="aciklama">Açıklama</label><input id="aciklama" required></div>
    <div id="detayHata" class="hata" role="alert"></div>
    <button type="button" class="dugme" id="devam">Devam</button>
  </div>
</div>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
var alici = null;
$('iban').addEventListener('input', function(){
  var r = this.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (r.indexOf('TR') !== 0) r = 'TR' + r.replace(/[A-Z]/g, '');
  r = r.slice(0, 26);
  this.value = r.replace(/(.{4})/g, '$1 ').trim();
});
$('sorgula').onclick = function(){
  $('ibanHata').textContent = '';
  var ham = $('iban').value.replace(/\s/g, '');
  if (ham.length !== 26) { $('ibanHata').textContent = 'IBAN 26 karakter olmalı.'; return; }
  $('aliciKutusu').innerHTML = '<p>Sorgulanıyor…</p>';
  fetch('/havale/api/alici?iban=' + ham).then(function(r){ return r.json(); }).then(function(j){
    if (!j.bulundu) { $('aliciKutusu').innerHTML = ''; $('ibanHata').textContent = 'Bu IBAN için alıcı bulunamadı.'; return; }
    alici = j; $('aliciKutusu').innerHTML = '<div class="alici"><b>Alıcı:</b> ' + j.ad + '<br><b>Banka:</b> ' + j.banka + '</div>';
    $('detay').hidden = false;
  });
};
$('devam').onclick = function(){
  var t = $('tutar').value.trim(), a = $('aciklama').value.trim();
  if (!t || !a) { $('detayHata').textContent = 'Tutar ve açıklama zorunludur.'; return; }
  if (!(Number(t.replace(',', '.')) > 0)) { $('detayHata').textContent = 'Geçerli bir tutar girin.'; return; }
  var iban = $('iban').value;
  $('kok').innerHTML = '<h1>Transferi onayla</h1><dl><dt>Alıcı</dt><dd>' + alici.ad + '</dd><dt>IBAN</dt><dd>' + iban + '</dd><dt>Tutar</dt><dd>' + t + ' TL</dd><dt>Açıklama</dt><dd>' + a + '</dd></dl>'
    + '<p><small>Deneme onay kodu: 246810</small></p><div class="alan"><label for="kod">Onay kodu</label><input id="kod" inputmode="numeric" maxlength="6"></div>'
    + '<div id="kodHata" class="hata" role="alert"></div><button type="button" class="dugme" id="onayla">Onayla</button> <button type="button" class="dugme ikincil" onclick="location.reload()">Vazgeç</button>';
  $('onayla').onclick = function(){
    if (!/^\d{6}$/.test($('kod').value)) { $('kodHata').textContent = 'Onay kodu 6 haneli olmalı.'; return; }
    if (!confirm(t + ' TL gönderilecek. Onaylıyor musunuz?')) { $('kok').insertAdjacentHTML('beforeend', '<p class="hata" role="status">İşlem iptal edildi.</p>'); return; }
    fetch('/havale/api/transfer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ iban: iban, tutar: t, aciklama: a, kod: $('kod').value }) })
      .then(function(r){ return r.json().then(function(j){ return { d: r.status, j: j }; }); }).then(function(y){
        if (y.d !== 200) { $('kodHata').textContent = y.j.hata; return; }
        $('kok').innerHTML = '<h1>Transfer tamamlandı</h1><p role="status">Dekont no: ' + y.j.dekont + '</p>';
      });
  };
};`;

let dekont = 4000;
export default {
  kok: KOK, ad: 'Havale', alan: 'bankacılık',
  teknikler: ['IBAN maskesi', 'yanındaki Sorgula → yeni zorunlu alanlar', 'aynı sayfada adım değişimi', 'onay kodu', 'window.confirm'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/havale/' || i.yol === '/havale')) return belge({ kok: KOK, baslik: 'Para transferi', stil, govde, betik });
    if (i.yol === '/havale/api/alici') {
      olay(s, 'aliciSorgu');
      const iban = i.sorgu.get('iban') ?? '';
      return json(iban.startsWith('TR') && iban.length === 26 ? { bulundu: true, ad: 'D*** Y***', banka: 'Örnek Katılım' } : { bulundu: false }, 200, 700);
    }
    if (i.yol === '/havale/api/transfer' && i.yontem === 'POST') {
      const g = govdeJson(i);
      kaydet(s, g);
      if (g.kod !== '246810') return json({ hata: 'Onay kodu hatalı.' }, 422, 200);
      return json({ dekont: `HV-${++dekont}` }, 200, 600);
    }
    return null;
  }
};
