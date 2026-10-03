// BAĞLI LİSTE ZİNCİRİ TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). 127.0.0.1'deki sahte sayfa; tüm adlar ve değerler UYDURMADIR.
//
//   /adres/   İl → İlçe → Mahalle → Sokak (her alt liste üst seçilince GECİKMELİ istekle dolar; üst değişince alttakiler boşalır),
//             Marka seçilince BELİREN Model listesi, bağımsız "Yapı tarzı" listesi ve "Hesapla" düğmesi (hepsi seçiliyse "Sonuç hazır").
//   Kasıtlı sayfa hataları (bulgu olmalı): "Boşil" ilinde ilçe listesi BOŞ gelir; "Çukurova"nın mahalle listesinde "Toros" İKİ KEZ var;
//   "Kurtuluş" mahallesinin sokak listesi BOŞ gelir.
//   ?kismi=1: "Hesapla" yalnız İl'i ister (zincirin kalanı boş kalabilir); ?zorunlu=1 ile İlçe listesi sayfada `required` işaretlidir ve
//             "Hesapla" onu da ister (sayfanın kendi zorunluluğu).
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
  var KISMI = /[?&]kismi=1/.test(location.search);
  function bosalt(id) { $(id).innerHTML = '<option value="">Seçiniz</option>'; }
  function doldur(id, liste) { bosalt(id); liste.forEach(function (x) { var o = document.createElement('option'); o.value = x[0]; o.textContent = x[1]; $(id).appendChild(o); }); }
  function getir(tur, ust, hedef) { fetch('/api/secenek?tur=' + tur + '&ust=' + encodeURIComponent(ust)).then(function (r) { return r.json(); }).then(function (l) { doldur(hedef, l); }); }
  $('il').addEventListener('change', function () { bosalt('ilce'); bosalt('mahalle'); bosalt('sokak'); if (this.value) getir('ilce', this.value, 'ilce'); });
  $('ilce').addEventListener('change', function () { bosalt('mahalle'); bosalt('sokak'); if (this.value) getir('mahalle', this.value, 'mahalle'); });
  $('mahalle').addEventListener('change', function () { bosalt('sokak'); if (this.value) getir('sokak', $('ilce').value + '|' + this.value, 'sokak'); });
  $('marka').addEventListener('change', function () { bosalt('model'); $('modelKutusu').hidden = !this.value; if (this.value) getir('model', this.value, 'model'); });
  $('hesapla').addEventListener('click', function () {
    $('uyari').hidden = true;
    var eksik = (KISMI ? ['il'].concat($('ilce').required ? ['ilce'] : []) : ['il', 'ilce', 'mahalle', 'sokak', 'marka', 'model']).filter(function (k) { return !$(k).value; });
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

// ---- /yangin/: iki sütunlu, 7 halkalı adres zinciri + görünürlüğü belirleyen seçim (UYDURMA veri) ----
//   Zincir: İl → İlçe → Belde/Köy → Mahalle → Cadde/Sokak → Bina No → Daire/Kapı No; sağ sütunda "Adres Kodu" + yanında sorgu simgesi.
//   Düzen: CSS ızgarası iki sütun, DOM sırası satır satır (İl, Cadde, İlçe, Bina, Belde, Daire, Mahalle, Adres Kodu): görsel sıra ≠ DOM sırası.
//   Daire listesi başta görünür ve yalnız "Seçiniz..." içerir; seçenekleri istek bittikten SONRA zamanlayıcıyla (gecikmeli) gelir.
//   "C1" caddesinin binalarından ilk, orta ve sonuncunun (denenen örnek değerler) dairesi YOKTUR; diğerlerinin vardır.
//   ?dairesiz=1: C1'in hiçbir binasının dairesi yok (keşif bağı kesinleştiremez → belirsiz bağ); C2'nin "No 20" binasının dairesi var.
//   Başvuran tipi radyosu: Özel (sayfa açılınca seçili: Doğum tarihi, T.C. Kimlik No) / Tüzel (Vergi No, Unvan).
const YANGIN_ILLER: Array<[string, string]> = [['55', 'DENİZKENT'], ['06', 'BOZKIR']];
const yanginBinalari = (cadde: string, dairesiz: boolean): Array<[string, string, string[]]> => {
  if (cadde.endsWith('C2')) return [['B20', 'No 20', ['D1', 'D2']], ['B21', 'No 21', []]];
  // 9 bina: örnek değerler (ilk / orta / son = No 1, No 5, No 9) dairesiz.
  return Array.from({ length: 9 }, (_, i) => {
    const no = i + 1;
    const daireli = !dairesiz && ![1, 5, 9].includes(no);
    return [`B${no}`, `No ${no}`, daireli ? [`D${no}1`, `D${no}2`] : []] as [string, string, string[]];
  });
};
/** Zincirin seçenekleri: tur → üst değer → [değer, metin]. Üst değer, kökten bu yana seçilenlerin "|" ile birleşimidir (benzersiz yol). */
function yanginSecenekleri(tur: string, ust: string, dairesiz: boolean): Array<[string, string]> {
  const yol = ust.split('|');
  const son = yol[yol.length - 1];
  switch (tur) {
    case 'ilce': return son === '55' ? [['5501', 'ATAKUM'], ['5502', 'İLKADIM']] : [['0601', 'ÇANKAYA'], ['0602', 'ETİMESGUT']];
    case 'belde': return [[`${son}-M`, 'MERKEZ'], [`${son}-K`, 'KÖY']];
    case 'mahalle': return [[`${son}-1`, 'CUMHURİYET MH.'], [`${son}-2`, 'YENİ MH.']];
    case 'cadde': return [[`${son}-C1`, 'LALE CD.'], [`${son}-C2`, 'GÜL SK.']];
    case 'bina': return yanginBinalari(son, dairesiz).map(([d, m]) => [`${son}|${d}`, m]);
    case 'daire': {
      const [cadde, bina] = [yol[yol.length - 2] ?? '', son.split('|').pop() ?? ''];
      const b = yanginBinalari(cadde, dairesiz).find(([d]) => d === bina);
      return (b?.[2] ?? []).map((d) => [d, `Daire ${d.slice(1)}`]);
    }
    default: return [];
  }
}

export const YANGIN_SAYFASI = `<h1>Yangın başvurusu talebi</h1>
<style>.izgara{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;max-width:900px}.izgara label{display:block}.kod{display:flex;gap:6px;align-items:center}.kod img{cursor:pointer;width:20px;height:20px;background:#2a2}
/* Özel çizimli radyo: girdi gizli, seçim etiketle (gerçek sitelerdeki gibi; hızlı test ve normal koşu zorla işaretler). */
input[name="basvuranTipi"]{display:none}input[name="basvuranTipi"]+span::before{content:"○ "}input[name="basvuranTipi"]:checked+span::before{content:"● "}</style>
<fieldset><legend>Başvuran Tipi</legend>
<label><input type="radio" name="basvuranTipi" value="O" checked><span>Özel</span></label>
<label><input type="radio" name="basvuranTipi" value="T"><span>Tüzel</span></label></fieldset>
<div id="ozel"><label for="dogum">Doğum Tarihi</label><input id="dogum" name="dogum"><label for="tc">T.C. Kimlik No</label><input id="tc" name="tc"></div>
<div id="tuzel" hidden><label for="vergi">Vergi No</label><input id="vergi" name="vergi"><label for="unvan">Unvan</label><input id="unvan" name="unvan"></div>
<h2>Risk adresi</h2>
<div class="izgara">
  <div><label for="il">İl</label><select id="il" name="il"><option value="">Seçiniz...</option>${YANGIN_ILLER.map(([k, m]) => `<option value="${k}">${m}</option>`).join('')}</select></div>
  <div><label for="cadde">Cadde/Sokak</label><select id="cadde" name="cadde"><option value="">Seçiniz...</option></select></div>
  <div><label for="ilce">İlçe</label><select id="ilce" name="ilce"><option value="">Seçiniz...</option></select></div>
  <div><label for="bina">Bina No</label><select id="bina" name="bina"><option value="">Seçiniz...</option></select></div>
  <div><label for="belde">Belde/Köy</label><select id="belde" name="belde"><option value="">Seçiniz...</option></select></div>
  <div><label for="daire">Daire/Kapı No</label><select id="daire" name="daire"><option value="">Seçiniz...</option></select></div>
  <div><label for="mahalle">Mahalle</label><select id="mahalle" name="mahalle"><option value="">Seçiniz...</option></select></div>
  <div><label for="adresKodu">Adres Kodu</label><span class="kod"><input id="adresKodu" name="adresKodu"><img id="kodSorgu" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" title="Adres kodunu sorgula"></span></div>
</div>
<p><button type="button" id="talep">Talep al</button></p>
<div id="uyari" class="alert alert-danger" role="alert" hidden></div>
<div id="sonuc" class="alert alert-success" role="status" hidden></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  var ZINCIR = ['il', 'ilce', 'belde', 'mahalle', 'cadde', 'bina', 'daire'];
  var DAIRE_GECIKME = 1200;
  var OZEL = /[?&]ozel=1/.test(location.search);
  function bosalt(id) { $(id).innerHTML = '<option value="">Seçiniz...</option>'; }
  function doldur(id, liste) { bosalt(id); liste.forEach(function (x) { var o = document.createElement('option'); o.value = x[0]; o.textContent = x[1]; $(id).appendChild(o); }); }
  function yol(i) { return ZINCIR.slice(0, i + 1).map(function (k) { return $(k).value; }).join('|'); }
  var istekNo = {};
  ZINCIR.forEach(function (k, i) {
    $(k).addEventListener('change', function () {
      ZINCIR.slice(i + 1).forEach(bosalt);
      $('adresKodu').value = '';
      var alt = ZINCIR[i + 1];
      if (!alt || !this.value) return;
      var no = istekNo[alt] = (istekNo[alt] || 0) + 1;
      fetch('/api/yangin/secenek?tur=' + alt + '&ust=' + encodeURIComponent(yol(i)) + location.search.replace('?', '&'))
        .then(function (r) { return r.json(); })
        .then(function (l) {
          // Son halka: seçenekler istek bittikten sonra zamanlayıcıyla gelir (ağ sakinliği yetmez).
          var uygula = function () {
            if (istekNo[alt] !== no) return;
            doldur(alt, l);
            // ?ozel=1: Bina listesi seçenekler geldikten sonra 1 sn daha kilitli kalır (gerçek sitedeki "seçilemedi" durumu).
            if (alt === 'bina' && OZEL) { $('bina').disabled = true; setTimeout(function () { if (istekNo[alt] === no) $('bina').disabled = false; }, 1000); }
          };
          if (alt === 'daire') setTimeout(uygula, DAIRE_GECIKME); else uygula();
        });
    });
  });
  document.querySelectorAll('input[name=basvuranTipi]').forEach(function (r) {
    r.addEventListener('change', function () { var t = document.querySelector('input[name=basvuranTipi]:checked').value === 'T'; $('tuzel').hidden = !t; $('ozel').hidden = t; });
  });
  $('kodSorgu').addEventListener('click', function () {
    fetch('/api/yangin/adreskodu?daire=' + encodeURIComponent($('daire').value || $('bina').value)).then(function (r) { return r.json(); }).then(function (j) { $('adresKodu').value = j.kod; });
  });
  $('talep').addEventListener('click', function () {
    $('uyari').hidden = true;
    var tip = document.querySelector('input[name=basvuranTipi]:checked').value;
    var gerekli = ZINCIR.slice(0, 6).concat(tip === 'T' ? ['vergi', 'unvan'] : ['dogum', 'tc']);
    if ($('daire').options.length > 1) gerekli.push('daire');
    var eksik = gerekli.filter(function (k) { return !$(k).value; });
    if (eksik.length) { $('uyari').textContent = 'Eksik alan: ' + eksik.join(', '); $('uyari').hidden = false; return; }
    var q = ['tip=' + tip].concat(gerekli.map(function (k) { return k + '=' + encodeURIComponent($(k).value); })).join('&');
    fetch('/api/yangin/talep?' + q).then(function (r) { return r.json(); }).then(function (j) { $('sonuc').textContent = 'Talep hazır: Tutar ' + j.tutar + ' TL'; $('sonuc').hidden = false; });
  });
</script>`;

/** /yangin/ sahte sayfası (iki sütunlu 7 halkalı zincir + Özel / Tüzel). Sayaç: talepler (GET /api/yangin/talep) — düğmeye basıldığının kanıtı. */
export class YanginUygulamasi {
  readonly talepler: Array<Record<string, string>> = [];
  readonly istekler: string[] = [];
  /** Zincir seçenek isteklerinin gecikmesi (ms). */
  gecikmeMs = 250;
  isle(i: FiksturIstegi): FiksturYaniti | null {
    if (i.yol === '/yangin/' && i.yontem === 'GET') {
      this.istekler.push('GET /yangin/');
      // ?ozel=1: Bina listesi gizli <select> + görünür süslü kutu (select2 kalıbı).
      return html(i.sorgu.get('ozel') === '1' ? YANGIN_SAYFASI.replace(/<select id="bina" name="bina">/, (m) => suslu(m)) : YANGIN_SAYFASI);
    }
    if (i.yol === '/api/yangin/secenek' && i.yontem === 'GET') {
      const tur = i.sorgu.get('tur') ?? '';
      this.istekler.push(`secenek ${tur} ${i.sorgu.get('ust') ?? ''}`);
      return { tur: 'application/json', govde: JSON.stringify(yanginSecenekleri(tur, i.sorgu.get('ust') ?? '', i.sorgu.get('dairesiz') === '1')), gecikmeMs: this.gecikmeMs };
    }
    if (i.yol === '/api/yangin/adreskodu' && i.yontem === 'GET') return { tur: 'application/json', govde: JSON.stringify({ kod: `AK-${(i.sorgu.get('daire') ?? '').replace(/\W/g, '').slice(-6)}` }) };
    if (i.yol === '/api/yangin/talep' && i.yontem === 'GET') {
      this.talepler.push(Object.fromEntries(i.sorgu.entries()));
      return { tur: 'application/json', govde: JSON.stringify({ tutar: '300,00' }), gecikmeMs: 300 };
    }
    return null;
  }
}

export class BagliListeUygulamasi {
  readonly istekler: string[] = [];
  readonly hesaplamalar: Array<Record<string, string>> = [];
  /** Seçenek isteklerinin gecikmesi (ms): yavaş yüklenen listeyi taklit etmek için testler değiştirir. */
  gecikmeMs = 400;

  /** Bu fikstürün yollarını işler; başka yolsa null (çağıran kendi yollarına bakar). */
  isle(i: FiksturIstegi): FiksturYaniti | null {
    if (i.yol === '/zincirsiz/' && i.yontem === 'GET') { this.istekler.push('GET /zincirsiz/'); return html(ZINCIRSIZ_SAYFA); }
    if (i.yol === '/adres/' && i.yontem === 'GET') {
      this.istekler.push('GET /adres/');
      // ?zorunlu=1: İlçe listesi sayfada zorunlu işaretli (required).
      const sayfa = i.sorgu.get('zorunlu') === '1' ? BAGLI_LISTE_SAYFASI.replace('<select id="ilce" name="ilce">', '<select id="ilce" name="ilce" required>') : BAGLI_LISTE_SAYFASI;
      return html(i.sorgu.get('suslu') ? suslu(sayfa) : sayfa);
    }
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
