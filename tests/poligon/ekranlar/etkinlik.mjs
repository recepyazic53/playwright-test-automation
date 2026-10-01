// KONFERANS KAYDI — tüm alanlar GÖLGE DOM'lu özel bileşenler (<pg-alan>, <pg-secim>, <pg-onay>), "Kaydol" de gölge DOM içinde bir
// düğme (<pg-dugme>). "Fatura istiyorum" (gölge onay kutusu) işaretlenince gölge "Vergi no" alanı belirir (zorunlu). Kontenjan: dolu
// oturum seçilirse "bekleme listesine alındınız", değilse kayıt no. Sonuç ışık DOM'da.
import { belge, govdeJson, json, kaydet } from '../ortak.mjs';

const KOK = '/etkinlik';

const stil = `
body{margin:0;font:15px/1.5 system-ui,sans-serif;background:radial-gradient(circle at 20% 20%,#14b8a6,#0f172a 70%) fixed;color:#e2fdf9;min-height:100vh}
main{max-width:520px;margin:40px auto;background:#ffffff1a;backdrop-filter:blur(8px);border:1px solid #ffffff33;border-radius:20px;padding:26px}
pg-alan,pg-secim,pg-onay{display:block;margin:12px 0}[hidden]{display:none!important}#sonuc{margin-top:16px;font-weight:600}`;

const govde = String.raw`<main>
<h1>Geliştirici Günleri 2026 · Kayıt</h1>
<pg-alan etiket="Ad soyad" ad="adSoyad"></pg-alan>
<pg-alan etiket="E-posta" ad="eposta" tur="email"></pg-alan>
<pg-secim etiket="Oturum" ad="oturum" secenekler="|Seçiniz;acilis|Açılış konuşması (kontenjan dolu);atolyeA|Atölye A — Test otomasyonu;atolyeB|Atölye B — Erişilebilirlik"></pg-secim>
<pg-onay etiket="Fatura istiyorum" ad="fatura"></pg-onay>
<pg-alan etiket="Vergi no" ad="vergiNo" hidden></pg-alan>
<pg-dugme metin="Kaydol"></pg-dugme>
<p id="hata" role="alert" style="color:#fecaca"></p>
<div id="sonuc" role="status"></div>
</main>`;

const betik = String.raw`
var ORTAK = 'label{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#99f6e4;margin-bottom:4px}'
  + 'input,select{width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid #5eead4;background:#0f172a99;color:#fff;font:inherit}';
customElements.define('pg-alan', class extends HTMLElement {
  connectedCallback(){
    var k = this.attachShadow({ mode: 'open' });
    k.innerHTML = '<style>' + ORTAK + '</style><label for="i">' + this.getAttribute('etiket') + '</label><input id="i" type="' + (this.getAttribute('tur') || 'text') + '" name="' + this.getAttribute('ad') + '">';
  }
  get value(){ return this.shadowRoot.querySelector('input').value; }
});
customElements.define('pg-secim', class extends HTMLElement {
  connectedCallback(){
    var k = this.attachShadow({ mode: 'open' });
    var s = this.getAttribute('secenekler').split(';').map(function(x){ var p = x.split('|'); return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('');
    k.innerHTML = '<style>' + ORTAK + '</style><label for="s">' + this.getAttribute('etiket') + '</label><select id="s" name="' + this.getAttribute('ad') + '">' + s + '</select>';
  }
  get value(){ return this.shadowRoot.querySelector('select').value; }
});
customElements.define('pg-onay', class extends HTMLElement {
  connectedCallback(){
    var k = this.attachShadow({ mode: 'open' }), ben = this;
    k.innerHTML = '<style>label{cursor:pointer}</style><label><input type="checkbox" name="' + this.getAttribute('ad') + '"> ' + this.getAttribute('etiket') + '</label>';
    k.querySelector('input').addEventListener('change', function(){ ben.dispatchEvent(new CustomEvent('degisti', { detail: this.checked })); });
  }
  get checked(){ return this.shadowRoot.querySelector('input').checked; }
});
customElements.define('pg-dugme', class extends HTMLElement {
  connectedCallback(){
    var k = this.attachShadow({ mode: 'open' }), ben = this;
    k.innerHTML = '<style>button{margin-top:10px;width:100%;padding:12px;border:0;border-radius:12px;background:#14b8a6;color:#042f2e;font-weight:700;cursor:pointer}</style><button type="button">' + this.getAttribute('metin') + '</button>';
    k.querySelector('button').addEventListener('click', function(){ ben.dispatchEvent(new CustomEvent('bas')); });
  }
});
var $ = function(s){ return document.querySelector(s); };
$('pg-onay').addEventListener('degisti', function(o){ $('pg-alan[ad=vergiNo]').hidden = !o.detail; });
$('pg-dugme').addEventListener('bas', function(){
  $('#hata').textContent = '';
  var d = { adSoyad: $('pg-alan[ad=adSoyad]').value.trim(), eposta: $('pg-alan[ad=eposta]').value.trim(), oturum: $('pg-secim').value, fatura: $('pg-onay').checked, vergiNo: $('pg-alan[ad=vergiNo]').value.trim() };
  if (!d.adSoyad || !/@/.test(d.eposta) || !d.oturum) { $('#hata').textContent = 'Ad soyad, e-posta ve oturum zorunludur.'; return; }
  if (d.fatura && !/^\d{10}$/.test(d.vergiNo)) { $('#hata').textContent = 'Vergi no 10 haneli olmalı.'; return; }
  fetch('/etkinlik/api/kayit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) }).then(function(r){ return r.json(); }).then(function(j){
    $('#sonuc').textContent = j.bekleme ? 'Kontenjan dolu: bekleme listesine alındınız (sıra ' + j.sira + ').' : 'Kaydınız tamamlandı. Yaka kartı no: ' + j.no;
  });
});`;

let no = 700;
let sira = 3;
export default {
  kok: KOK, ad: 'Etkinlik', alan: 'etkinlik kaydı',
  teknikler: ['gölge DOM alanları', 'gölge DOM düğme', 'onay kutusuyla beliren gölge alan', 'kontenjan / bekleme listesi'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/etkinlik/' || i.yol === '/etkinlik')) return belge({ kok: KOK, baslik: 'Konferans kaydı', stil, govde, betik });
    if (i.yol === '/etkinlik/api/kayit' && i.yontem === 'POST') {
      const g = govdeJson(i);
      kaydet(s, g);
      return json(g.oturum === 'acilis' ? { bekleme: true, sira: ++sira } : { no: `ET-${++no}` }, 200, 500);
    }
    return null;
  }
};
