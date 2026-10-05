// DEĞER SONRASI YENİDEN OKUMA TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). 127.0.0.1'deki sahte sayfa; tüm adlar ve değerler UYDURMADIR,
// hiçbir gerçek siteye bağlanılmaz.
//
//   /sorgu-formu/          "Plaka" + "Sorgula" (type=button). Sorgula: GET /api/sorgu-formu/sorgu → sayfanın sonuna ikinci bölüm EKLENİR:
//                          "Kod" (metin), "Marka" (liste), "Model" (liste; seçenekleri Marka'ya bağlı: GET /api/sorgu-formu/modeller) ve
//                          "Kaydet". Sayfa sorgunun sonucuyla Marka = Kuzey, Model = K-2 DOLDURUR (kullanıcı seçmez).
//   /sorgu-formu/?kip=kod  Aynı; ancak ikinci bölümde Marka ve Model BOŞ gelir. "Kod" yazılıp alandan çıkılınca GET /api/sorgu-formu/kod →
//                          sayfa kodGecikmeMs (700 ms) SONRA (zamanlayıcıyla; ağ sakinliği yetmez) Marka listesini doldurur, Kuzey'i seçer, Model'i
//                          yükler ve K-2'yi seçer.
//   "Kaydet": POST /api/sorgu-formu/kayit { plaka, kod, marka, model } → "Kayıt alındı".
import type { FiksturIstegi, FiksturYaniti } from './giris-fikstur';

/** Markalar (değer → görünen metin) ve markaya göre modeller. */
export const MARKALAR: ReadonlyArray<[string, string]> = [['KZ', 'Kuzey'], ['GN', 'Güney'], ['DG', 'Doğu'], ['BT', 'Batı']];
export const MODELLER: Readonly<Record<string, ReadonlyArray<[string, string]>>> = {
  KZ: [['K1', 'K-1'], ['K2', 'K-2'], ['K3', 'K-3']], GN: [['G1', 'G-1'], ['G2', 'G-2']], DG: [['D1', 'D-1'], ['D2', 'D-2'], ['D3', 'D-3']], BT: [['B1', 'B-1']]
};

export const SORGU_FORMU_SAYFASI = String.raw`<h1>Sorgu</h1>
<div><label for="plaka">Plaka</label><input id="plaka" name="plaka" autocomplete="off"></div>
<p><button type="button" id="sorgula">Sorgula</button></p>
<div id="ikinci"></div>
<div id="sonuc" role="status"></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var kodKipi = new URLSearchParams(location.search).get('kip') === 'kod';
  var MARKALAR = ${JSON.stringify(MARKALAR)};
  function secenekler(l) { return '<option value="">Seçiniz</option>' + l.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join(''); }
  function modelleriYukle(marka, secilecek) {
    $('model').innerHTML = secenekler([]);
    if (!marka) return Promise.resolve();
    return fetch('/api/sorgu-formu/modeller?marka=' + encodeURIComponent(marka)).then(function (r) { return r.json(); }).then(function (l) {
      if ($('marka').value !== marka) return;
      $('model').innerHTML = secenekler(l);
      if (secilecek) $('model').value = secilecek;
    });
  }
  function doldur(j) {
    $('marka').innerHTML = secenekler(MARKALAR);
    $('marka').value = j.marka;
    return modelleriYukle(j.marka, j.model);
  }
  $('sorgula').addEventListener('click', function () {
    fetch('/api/sorgu-formu/sorgu?plaka=' + encodeURIComponent($('plaka').value)).then(function (r) { return r.json(); }).then(function (j) {
      $('ikinci').innerHTML = '<h2>Araç</h2>'
        + '<div><label for="kod">Kod</label><input id="kod" name="kod" autocomplete="off"></div>'
        + '<div><label for="marka">Marka</label><select id="marka" name="marka">' + secenekler([]) + '</select></div>'
        + '<div><label for="model">Model</label><select id="model" name="model">' + secenekler([]) + '</select></div>'
        + '<p><button type="button" id="kaydet">Kaydet</button></p>';
      $('marka').addEventListener('change', function () { modelleriYukle($('marka').value, null); });
      $('kod').addEventListener('change', function () {
        if (!kodKipi || !$('kod').value) return;
        fetch('/api/sorgu-formu/kod?kod=' + encodeURIComponent($('kod').value)).then(function (r) { return r.json(); }).then(function (k) {
          setTimeout(function () { doldur(k); }, k.gecikme);
        });
      });
      $('kaydet').addEventListener('click', function () {
        var v = { plaka: $('plaka').value, kod: $('kod').value, marka: $('marka').value, model: $('model').value };
        fetch('/api/sorgu-formu/kayit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) })
          .then(function () { $('sonuc').textContent = 'Kayıt alındı'; });
      });
      if (!kodKipi) doldur(j);
    });
  });
</script>`;

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0 2px}</style></head><body>${govde}</body></html>`
});
const json = (v: unknown): FiksturYaniti => ({ tur: 'application/json', govde: JSON.stringify(v) });

export class YenidenOkumaUygulamasi {
  /** Kaydet gönderimleri. */
  readonly kayitlar: Array<Record<string, string>> = [];
  /** Kod girilince sayfanın listeleri doldurmadan önce beklediği süre (ms; zamanlayıcı — ağ sakinliği yetmez). */
  kodGecikmeMs = 700;
  /** Sayfanın yaptığı istekler ("YÖNTEM /yol"). */
  readonly istekler: string[] = [];

  isle(i: FiksturIstegi): FiksturYaniti | null {
    this.istekler.push(`${i.yontem} ${i.yol}`);
    if (i.yol === '/sorgu-formu/' && i.yontem === 'GET') return html('Sorgu', SORGU_FORMU_SAYFASI);
    if (i.yol === '/api/sorgu-formu/sorgu' || i.yol === '/api/sorgu-formu/kod') return json({ marka: 'KZ', model: 'K2', gecikme: this.kodGecikmeMs });
    if (i.yol === '/api/sorgu-formu/modeller') return json(MODELLER[i.sorgu.get('marka') ?? ''] ?? []);
    if (i.yol === '/api/sorgu-formu/kayit' && i.yontem === 'POST') { this.kayitlar.push(JSON.parse(i.govde) as Record<string, string>); return json({ tamam: true }); }
    return null;
  }
}
