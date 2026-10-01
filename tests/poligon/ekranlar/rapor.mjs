// RAPOR OLUŞTURMA (terminal görünümü) — "Tarih aralığı" listesinde "Özel aralık" seçilince başlangıç / bitiş alanları belirir;
// "Raporu oluştur" → UZUN SÜREN ilerleme (sunucuya 0,5 sn'de bir durum sorgusu, ~6 sn, "işleniyor %"), sonunda "Ayrıntılı" rapor türünde
// sunucu 500 döner → "Sunucu hatası: rapor oluşturulamadı (500)"; "Özet" türünde "Rapor hazır: N satır".
import { belge, govdeJson, json, kaydet, olay } from '../ortak.mjs';

const KOK = '/rapor';
const isler = new Map();

const stil = `
body{margin:0;font:14px/1.6 "Lucida Console",monospace;background:#020617;color:#4ade80}
main{max-width:720px;margin:36px auto;border:1px solid #166534;padding:22px;background:#03140a}
label{display:block;margin-top:10px;color:#86efac}select,input{background:#020617;color:#4ade80;border:1px solid #166534;padding:7px;font:inherit;width:100%;box-sizing:border-box}
button{background:#166534;color:#dcfce7;border:0;padding:9px 18px;font:inherit;cursor:pointer;margin-top:14px}
.cubuk{height:10px;background:#052e16;border:1px solid #166534;margin:8px 0}.cubuk div{height:100%;background:#4ade80;width:0}
.hata{color:#f87171}`;

const govde = String.raw`<main>
<h1>&gt; rapor_olustur</h1>
<label for="tur">Rapor türü</label><select id="tur"><option value="ozet">Özet</option><option value="ayrintili">Ayrıntılı</option></select>
<label for="aralik">Tarih aralığı</label><select id="aralik"><option value="7">Son 7 gün</option><option value="30">Son 30 gün</option><option value="ozel">Özel aralık</option></select>
<div id="ozelAralik" hidden><label for="baslangic">Başlangıç (gg.aa.yyyy)</label><input id="baslangic"><label for="bitis">Bitiş (gg.aa.yyyy)</label><input id="bitis"></div>
<span>Biçim:</span> <label style="display:inline"><input type="radio" name="bicim" value="pdf" checked style="width:auto"> PDF</label> <label style="display:inline"><input type="radio" name="bicim" value="csv" style="width:auto"> CSV</label>
<br><button type="button" id="olustur">Raporu oluştur</button>
<div id="ilerleme" hidden><p id="durumMetni">İşleniyor…</p><div class="cubuk"><div id="cubuk"></div></div><p id="yuzde">%0</p></div>
<p id="sonuc" role="status"></p><p id="hata" class="hata" role="alert"></p>
</main>`;

const betik = String.raw`
function $(id){ return document.getElementById(id); }
$('aralik').addEventListener('change', function(){ $('ozelAralik').hidden = this.value !== 'ozel'; });
$('olustur').onclick = function(){
  $('hata').textContent = ''; $('sonuc').textContent = '';
  if ($('aralik').value === 'ozel' && (!$('baslangic').value || !$('bitis').value)) { $('hata').textContent = 'Özel aralık için başlangıç ve bitiş girin.'; return; }
  this.disabled = true; $('ilerleme').hidden = false;
  fetch('/rapor/api/baslat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tur: $('tur').value, aralik: $('aralik').value, baslangic: $('baslangic').value, bitis: $('bitis').value, bicim: document.querySelector('input[name=bicim]:checked').value }) })
    .then(function(r){ return r.json(); }).then(function(j){
      var t = setInterval(function(){
        fetch('/rapor/api/durum?id=' + j.id).then(function(r){ return r.text().then(function(x){ return { d: r.status, x: x }; }); }).then(function(y){
          if (y.d === 500) { clearInterval(t); $('ilerleme').hidden = true; $('olustur').disabled = false; $('hata').textContent = 'Sunucu hatası: rapor oluşturulamadı (500)'; return; }
          var s = JSON.parse(y.x); $('yuzde').textContent = '%' + s.yuzde; $('cubuk').style.width = s.yuzde + '%'; $('durumMetni').textContent = 'İşleniyor… ' + s.asama;
          if (s.bitti) { clearInterval(t); $('ilerleme').hidden = true; $('olustur').disabled = false; $('sonuc').textContent = 'Rapor hazır: ' + s.satir + ' satır'; }
        });
      }, 500);
    });
};`;

let no = 0;
export default {
  kok: KOK, ad: 'Rapor', alan: 'raporlama',
  teknikler: ['seçimle beliren tarih alanları', 'uzun ilerleme (yoklama)', 'sunucu 500 → olumsuz senaryo'],
  isle(i, s) {
    if (i.yontem === 'GET' && (i.yol === '/rapor/' || i.yol === '/rapor')) return belge({ kok: KOK, baslik: 'Rapor oluştur', stil, govde, betik });
    if (i.yol === '/rapor/api/baslat' && i.yontem === 'POST') {
      const g = govdeJson(i);
      kaydet(s, g);
      const id = String(++no);
      isler.set(id, { tur: g.tur, baslangic: Date.now() });
      return json({ id }, 200, 200);
    }
    if (i.yol === '/rapor/api/durum') {
      olay(s, 'durumSorgusu');
      const is = isler.get(i.sorgu.get('id') ?? '');
      if (!is) return json({ hata: 'yok' }, 404);
      const gecen = Date.now() - is.baslangic;
      const yuzde = Math.min(100, Math.round(gecen / 60));
      if (yuzde < 100) return json({ yuzde, asama: gecen < 3000 ? 'veriler toplanıyor' : 'biçimleniyor', bitti: false });
      if (is.tur === 'ayrintili') return { durum: 500, tur: 'text/plain; charset=utf-8', govde: 'İç sunucu hatası' };
      return json({ yuzde: 100, asama: 'tamam', bitti: true, satir: 128 });
    }
    return null;
  }
};
