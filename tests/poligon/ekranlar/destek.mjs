// DESTEK BİLETİ — form AYNI KÖKENLİ bir iframe içinde (/destek/form). İçeride: Kategori → Alt kategori (bağlı liste; seçenekler sunucudan,
// gecikmeli), öncelik radyoları, zengin metin alanı (contenteditable + kalın / italik araç çubuğu; form alanı değil), "Ek dosya eklemek
// istiyorum" onay kutusu işaretlenince dosya alanı açılır. "Bileti oluştur" → sonuç iframe'in içinde.
import { belge, dosyalariOku, json, kaydet, olay } from '../ortak.mjs';

const KOK = '/destek';
const ALT = {
  fatura: ['Hatalı tutar', 'Fatura gelmedi', 'İade talebi'],
  teknik: ['Bağlantı sorunu', 'Uygulama hatası', 'Yavaşlık'],
  hesap: ['Parola sıfırlama', 'Bilgi güncelleme']
};

const disStil = `body{margin:0;font:15px/1.5 "Helvetica Neue",Arial,sans-serif;background:#2e1065;color:#ede9fe}
.kap{max-width:900px;margin:0 auto;padding:24px}iframe{width:100%;height:640px;border:0;border-radius:12px;background:#fff}`;
const icStil = `body{margin:0;font:14px/1.5 "Helvetica Neue",Arial,sans-serif;color:#2e1065;padding:20px}
.alan{margin:10px 0}label{display:block;font-weight:600;font-size:13px}select,input[type=text]{width:100%;padding:8px;border:1px solid #c4b5fd;border-radius:8px;box-sizing:border-box}
.zengin{border:1px solid #c4b5fd;border-radius:8px}.arac{background:#f5f3ff;padding:4px;border-bottom:1px solid #c4b5fd}.arac button{border:0;background:none;cursor:pointer;font-weight:bold;width:28px}
[contenteditable]{min-height:90px;padding:8px;outline:none}.mor{background:#6d28d9;color:#fff;border:0;border-radius:8px;padding:10px 18px;cursor:pointer}.hata{color:#be123c}`;

const dis = String.raw`<div class="kap"><h1>Yardım merkezi</h1><p>Sorununuzu aşağıdaki formla iletin; ekibimiz en kısa sürede dönüş yapar.</p>
<iframe src="/destek/form" title="Destek bileti formu"></iframe></div>`;

const ic = String.raw`<form id="form" novalidate>
<div class="alan"><label for="kategori">Kategori</label><select id="kategori" name="kategori"><option value="">Seçiniz</option><option value="fatura">Fatura</option><option value="teknik">Teknik</option><option value="hesap">Hesap</option></select></div>
<div class="alan"><label for="altKategori">Alt kategori</label><select id="altKategori" name="altKategori" disabled><option value="">Önce kategori seçin</option></select></div>
<div class="alan"><span>Öncelik</span> <label style="display:inline"><input type="radio" name="oncelik" value="dusuk"> Düşük</label> <label style="display:inline"><input type="radio" name="oncelik" value="normal" checked> Normal</label> <label style="display:inline"><input type="radio" name="oncelik" value="acil"> Acil</label></div>
<div class="alan"><label for="konu">Konu</label><input type="text" id="konu" name="konu"></div>
<div class="alan"><label id="aciklamaEtiket">Açıklama</label><div class="zengin"><div class="arac"><button type="button" aria-label="Kalın" onclick="document.execCommand('bold')">B</button><button type="button" aria-label="İtalik" onclick="document.execCommand('italic')"><i>I</i></button></div>
<div id="aciklama" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="aciklamaEtiket"></div></div></div>
<div class="alan"><label style="display:inline"><input type="checkbox" id="ekVar"> Ek dosya eklemek istiyorum</label></div>
<div class="alan" id="ekKutusu" hidden><label for="ek">Ek dosya</label><input type="file" id="ek" name="ek"></div>
<p id="hata" class="hata" role="alert"></p>
<button type="submit" class="mor">Bileti oluştur</button>
</form><div id="sonuc" role="status"></div>`;

const icBetik = String.raw`
function $(id){ return document.getElementById(id); }
$('kategori').addEventListener('change', function(){
  var a = $('altKategori'); a.disabled = true; a.innerHTML = '<option value="">Yükleniyor…</option>';
  if (!this.value) { a.innerHTML = '<option value="">Önce kategori seçin</option>'; return; }
  fetch('/destek/api/alt?k=' + this.value).then(function(r){ return r.json(); }).then(function(j){
    a.innerHTML = '<option value="">Seçiniz</option>' + j.liste.map(function(x){ return '<option>' + x + '</option>'; }).join(''); a.disabled = false;
  });
});
$('ekVar').addEventListener('change', function(){ $('ekKutusu').hidden = !this.checked; });
$('form').onsubmit = function(o){
  o.preventDefault(); $('hata').textContent = '';
  if (!$('kategori').value || !$('altKategori').value || !$('konu').value.trim()) { $('hata').textContent = 'Kategori, alt kategori ve konu zorunludur.'; return; }
  if ($('aciklama').innerText.trim().length < 10) { $('hata').textContent = 'Açıklama en az 10 karakter olmalı.'; return; }
  var f = new FormData(this); f.append('aciklama', $('aciklama').innerHTML);
  fetch('/destek/api/bilet', { method: 'POST', body: f }).then(function(r){ return r.json(); }).then(function(j){
    $('form').hidden = true; $('sonuc').innerHTML = '<h2>Teşekkürler</h2><p>Biletiniz oluşturuldu. Bilet no: ' + j.no + '</p>';
  });
};`;

let no = 2000;
export default {
  kok: KOK, ad: 'Destek bileti', alan: 'müşteri desteği',
  teknikler: ['aynı kökenli iframe', 'kategori → alt kategori', 'zengin metin (contenteditable)', 'onay kutusuyla açılan dosya alanı'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/destek/' || i.yol === '/destek')) return belge({ kok: KOK, baslik: 'Yardım merkezi', stil: disStil, govde: dis });
    if (i.yontem === 'GET' && i.yol === '/destek/form') return belge({ kok: KOK, baslik: 'Destek bileti formu', stil: icStil, govde: ic, betik: icBetik });
    if (i.yol === '/destek/api/alt') { olay(s, 'altKategori'); return json({ liste: ALT[i.sorgu.get('k') ?? ''] ?? [] }, 200, 700); }
    if (i.yol === '/destek/api/bilet' && i.yontem === 'POST') { const { alanlar, dosyalar } = dosyalariOku(i); kaydet(s, { ...alanlar, dosyalar }); return json({ no: `DB-${++no}` }, 200, 500); }
    return null;
  }
};
