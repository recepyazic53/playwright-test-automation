// BAĞLI LİSTE ZİNCİRİ TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). 127.0.0.1'deki sahte sayfa; tüm adlar ve değerler UYDURMADIR.
//
//   /adres/   İl → İlçe → Mahalle → Sokak (her alt liste üst seçilince GECİKMELİ istekle dolar; üst değişince alttakiler boşalır),
//             Marka seçilince BELİREN Model listesi, bağımsız "Yapı tarzı" listesi ve "Hesapla" düğmesi (hepsi seçiliyse "Sonuç hazır").
//   Kasıtlı sayfa hataları (bulgu olmalı): "Boşil" ilinde ilçe listesi BOŞ gelir; "Çukurova"nın mahalle listesinde "Toros" İKİ KEZ var;
//   "Kurtuluş" mahallesinin sokak listesi BOŞ gelir.
//   /zincirsiz/  bağlı listesi olmayan küçük form (veri durağının eski davranışı için).
//   Sayaçlar: hesaplamalar (GET /api/hesapla) — düğmeye basıldığının kanıtı; istekler (seçenek istekleri dahil).
import type { FiksturIstegi, FiksturYaniti } from './giris-fikstur';

/** İl kodu → { ad, ilçeler: ilçe kodu → { ad, mahalleler: ad → sokaklar } }. */
export const ADRES_AGACI: Record<string, { ad: string; ilceler: Record<string, { ad: string; mahalleler: Array<[string, string[]]> }> }> = {
  '01': { ad: 'Adana', ilceler: {
    '0101': { ad: 'Seyhan', mahalleler: [['Reşatbey', ['1. Sokak', '2. Sokak']], ['Kurtuluş', []]] },
    '0102': { ad: 'Çukurova', mahalleler: [['Toros', ['Lale Sokak']], ['Belediye Evleri', ['Gül Sokak']], ['Toros', ['Lale Sokak']]] }
  } },
  '06': { ad: 'Ankara', ilceler: { '0601': { ad: 'Çankaya', mahalleler: [['Kızılay', ['Meşrutiyet Sokak']]] }, '0602': { ad: 'Keçiören', mahalleler: [['Etlik', ['Ilgaz Sokak']]] } } },
  '99': { ad: 'Boşil', ilceler: {} },
  '34': { ad: 'İstanbul', ilceler: { '3401': { ad: 'Kadıköy', mahalleler: [['Moda', ['Bahariye Sokak', 'Moda Sokak']]] } } }
};
/** İllerin sayfadaki sırası (nesne anahtarlarının sırası "34", "99" gibi sayısal anahtarlarda değişir; açıkça verilir). */
export const IL_SIRASI = ['01', '06', '99', '34'];
export const MODELLER: Record<string, string[]> = { m1: ['Alfa Bir', 'Alfa İki'], m2: ['Beta Bir'] };

export const BAGLI_LISTE_SAYFASI = `<h1>Adres ve araç</h1>
<label for="il">İl</label>
<select id="il" name="il"><option value="">Seçiniz</option>${IL_SIRASI.map((k) => `<option value="${k}">${ADRES_AGACI[k].ad}</option>`).join('')}</select>
<label for="ilce">İlçe</label><select id="ilce" name="ilce"><option value="">Seçiniz</option></select>
<label for="mahalle">Mahalle</label><select id="mahalle" name="mahalle"><option value="">Seçiniz</option></select>
<label for="sokak">Sokak</label><select id="sokak" name="sokak"><option value="">Seçiniz</option></select>
<label for="marka">Marka</label>
<select id="marka" name="marka"><option value="">Seçiniz</option><option value="m1">Alfa</option><option value="m2">Beta</option></select>
<div id="modelKutusu" hidden><label for="model">Model</label><select id="model" name="model"><option value="">Seçiniz</option></select></div>
<label for="yapi">Yapı tarzı</label>
<select id="yapi" name="yapi"><option value="">Seçiniz</option><option value="b">Betonarme</option><option value="k">Kagir</option></select>
<p><button type="button" id="hesapla">Hesapla</button></p>
<div id="uyari" class="alert alert-danger" role="alert" hidden></div>
<div id="sonuc" class="alert alert-success" role="status" hidden></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  function bosalt(id) { $(id).innerHTML = '<option value="">Seçiniz</option>'; }
  function doldur(id, liste) { bosalt(id); liste.forEach(function (x) { var o = document.createElement('option'); o.value = x[0]; o.textContent = x[1]; $(id).appendChild(o); }); }
  function getir(tur, ust, hedef) { fetch('/api/secenek?tur=' + tur + '&ust=' + encodeURIComponent(ust)).then(function (r) { return r.json(); }).then(function (l) { doldur(hedef, l); }); }
  $('il').addEventListener('change', function () { bosalt('ilce'); bosalt('mahalle'); bosalt('sokak'); if (this.value) getir('ilce', this.value, 'ilce'); });
  $('ilce').addEventListener('change', function () { bosalt('mahalle'); bosalt('sokak'); if (this.value) getir('mahalle', this.value, 'mahalle'); });
  $('mahalle').addEventListener('change', function () { bosalt('sokak'); if (this.value) getir('sokak', $('ilce').value + '|' + this.value, 'sokak'); });
  $('marka').addEventListener('change', function () { bosalt('model'); $('modelKutusu').hidden = !this.value; if (this.value) getir('model', this.value, 'model'); });
  $('hesapla').addEventListener('click', function () {
    $('uyari').hidden = true;
    var eksik = ['il', 'ilce', 'mahalle', 'sokak', 'marka', 'model'].filter(function (k) { return !$(k).value; });
    if (eksik.length) { $('uyari').textContent = 'Eksik alan: ' + eksik.join(', '); $('uyari').hidden = false; return; }
    fetch('/api/hesapla?il=' + $('il').value + '&ilce=' + $('ilce').value + '&mahalle=' + encodeURIComponent($('mahalle').value) + '&sokak=' + encodeURIComponent($('sokak').value) + '&model=' + encodeURIComponent($('model').value))
      .then(function (r) { return r.json(); }).then(function (j) { $('sonuc').textContent = 'Sonuç hazır: Tutar ' + j.tutar + ' TL'; $('sonuc').hidden = false; });
  });
</script>`;

/** /zincirsiz/: bağlı listesi olmayan sayfa (veri durağı eski davranışı: "Devam et" hep etkin, zincir göstergesi yok). */
export const ZINCIRSIZ_SAYFA = `<h1>Basit form</h1>
<label for="ad">Ad</label><input id="ad" name="ad">
<label for="yapi">Yapı tarzı</label>
<select id="yapi" name="yapi"><option value="">Seçiniz</option><option value="b">Betonarme</option><option value="k">Kagir</option></select>
<p><button type="button" id="hesapla">Hesapla</button></p>`;

/**
 * Süslü açılır liste kipi (?suslu=1): gerçek <select>'ler gizlidir; her birinin yanında aramalı liste bileşenlerinin kalıbında GÖRÜNÜR bir kutu
 * (role=combobox, "select2-<id>-container") durur. Koşucu bu listeleri "özel seçim" yoluyla doldurur (bağlı listede seçeneğin gelmesini
 * beklemesi gereken yol).
 */
function suslu(govde: string): string {
  return govde.replace(/<select id="([^"]+)" name="[^"]+">/g, (m, id: string) =>
    `<span class="select2 select2-container" style="display:inline-block;min-width:160px;border:1px solid #999"><span class="select2-selection" role="combobox" aria-haspopup="true" tabindex="0"><span id="select2-${id}-container">Seçiniz</span></span></span>${m.replace('>', ' style="display:none">')}`);
}

const html = (govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Adres</title><style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0 2px}</style></head><body>${govde}</body></html>`
});

/** Seçenek isteği: üst değere göre alt listenin seçenekleri ([değer, metin]); gecikmeli (yavaş yüklenen liste). */
function secenekler(tur: string, ust: string): Array<[string, string]> {
  if (tur === 'ilce') return Object.entries(ADRES_AGACI[ust]?.ilceler ?? {}).map(([k, v]) => [k, v.ad]);
  if (tur === 'mahalle') {
    for (const il of Object.values(ADRES_AGACI)) { const i = il.ilceler[ust]; if (i) return i.mahalleler.map(([m]) => [m, m]); }
    return [];
  }
  if (tur === 'sokak') {
    const [ilce, mahalle] = ust.split('|');
    for (const il of Object.values(ADRES_AGACI)) { const m = il.ilceler[ilce]?.mahalleler.find(([x]) => x === mahalle); if (m) return m[1].map((s) => [s, s]); }
    return [];
  }
  if (tur === 'model') return (MODELLER[ust] ?? []).map((m) => [m, m]);
  return [];
}

export class BagliListeUygulamasi {
  readonly istekler: string[] = [];
  readonly hesaplamalar: Array<Record<string, string>> = [];
  /** Seçenek isteklerinin gecikmesi (ms): yavaş yüklenen listeyi taklit etmek için testler değiştirir. */
  gecikmeMs = 400;

  /** Bu fikstürün yollarını işler; başka yolsa null (çağıran kendi yollarına bakar). */
  isle(i: FiksturIstegi): FiksturYaniti | null {
    if (i.yol === '/zincirsiz/' && i.yontem === 'GET') { this.istekler.push('GET /zincirsiz/'); return html(ZINCIRSIZ_SAYFA); }
    if (i.yol === '/adres/' && i.yontem === 'GET') { this.istekler.push('GET /adres/'); return html(i.sorgu.get('suslu') ? suslu(BAGLI_LISTE_SAYFASI) : BAGLI_LISTE_SAYFASI); }
    if (i.yol === '/api/secenek' && i.yontem === 'GET') {
      const tur = i.sorgu.get('tur') ?? '';
      this.istekler.push(`GET secenek ${tur}`);
      return { tur: 'application/json', govde: JSON.stringify(secenekler(tur, i.sorgu.get('ust') ?? '')), gecikmeMs: this.gecikmeMs };
    }
    if (i.yol === '/api/hesapla' && i.yontem === 'GET') {
      this.hesaplamalar.push(Object.fromEntries(i.sorgu.entries()));
      return { tur: 'application/json', govde: JSON.stringify({ tutar: '1.234,00' }), gecikmeMs: 500 };
    }
    return null;
  }
}
