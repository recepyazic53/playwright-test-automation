// POLİGON ortak yardımcıları (bağımlılık yok). Tüm metinler ve değerler UYDURMADIR.
//
// Ekran modülü biçimi (ekranlar/*.mjs):
//   export default { kok: '/sepet', ad: 'Sepet', alan: 'e-ticaret', teknikler: [...], isle(istek, sayac) → yanıt | null }
//   istek: { yontem, yol, sorgu: URLSearchParams, govde: string (latin1 ham gövde), basliklar }
//   sayac: { gonderim, gonderimler: [], olaylar: {} } — ekranın sunucu tarafı sayaçları (kaç gönderim, hangi değerler)

/**
 * Doldurma izleyicisi: kullanıcı (ya da otomasyon) bir alanı değiştirdiğinde alanın adı ve zamanı sunucuya bildirilir (GET görüntü
 * isteği; sayfanın ağ sakinliğini etkilemez). Doldurma SIRASI sunucuda karşılaştırılır. Gölge DOM'daki alanlar composedPath ile bulunur.
 */
const izleyici = (kok) => String.raw`(function(){
  var son = {};
  function ad(a){
    if (!a || !a.tagName) return null;
    var e = a.getAttribute('aria-label') || (a.labels && a.labels[0] && a.labels[0].textContent) || a.getAttribute('placeholder') || a.name || a.id || a.tagName;
    return String(e).replace(/\s+/g,' ').trim().slice(0,60);
  }
  function bildir(o){
    var a = (o.composedPath && o.composedPath()[0]) || o.target;
    if (!a || !/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && !a.isContentEditable) return;
    var n = ad(a); var t = Date.now();
    if (son[n] && t - son[n] < 400) return;
    son[n] = t;
    new Image().src = '/__poligon/doldurma?ekran=' + encodeURIComponent('${kok}') + '&alan=' + encodeURIComponent(n) + '&t=' + t;
  }
  document.addEventListener('input', bildir, true);
  document.addEventListener('change', bildir, true);
})();`;

/** Tam HTML belgesi (doldurma izleyicisiyle). Betikler şablon dizgisi (backtick) ve ${} kullanmaz. */
export function belge({ kok, baslik, stil, govde, betik = '' }) {
  return {
    durum: 200,
    tur: 'text/html; charset=utf-8',
    govde: '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + `<title>${baslik}</title><style>${stil}</style></head><body>${govde}<script>${kok ? izleyici(kok) : ''}\n${betik}</script></body></html>`
  };
}

/** JSON yanıtı (isteğe bağlı gecikme ve durum kodu). */
export const json = (veri, durum = 200, gecikmeMs = 0) => ({ durum, tur: 'application/json; charset=utf-8', govde: JSON.stringify(veri), gecikmeMs });

/** Gövdeyi JSON olarak çözer (bozuksa boş nesne). */
export function govdeJson(i) {
  try { return JSON.parse(Buffer.from(i.govde, 'latin1').toString('utf8')); } catch { return {}; }
}

/** Gönderimi sayaca yazar (çift gönderim denetimi için her gönderim ayrı kayıt). */
export function kaydet(sayac, deger) {
  sayac.gonderim += 1;
  sayac.gonderimler.push({ zaman: new Date().toISOString(), ...deger });
}

/** Yardımcı istek sayacı (kimlik sorgusu, kupon denetimi…). */
export function olay(sayac, ad) {
  sayac.olaylar[ad] = (sayac.olaylar[ad] ?? 0) + 1;
}

/** Doğum tarihinden (gg.aa.yyyy) yaş; çözülemezse null. */
export function yas(metin, bugun = new Date()) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(metin ?? '').trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  let y = bugun.getFullYear() - d.getFullYear();
  if (bugun.getMonth() < d.getMonth() || (bugun.getMonth() === d.getMonth() && bugun.getDate() < d.getDate())) y -= 1;
  return y;
}

/** Çok parçalı (multipart) gövdeden dosya adları ve boyutları (yalnız sayaç için; kaba ayrıştırma). */
export function dosyalariOku(i) {
  const tur = String(i.basliklar?.['content-type'] ?? '');
  const sinir = /boundary=([^;]+)/.exec(tur)?.[1];
  if (!sinir) return { alanlar: {}, dosyalar: [] };
  const alanlar = {};
  const dosyalar = [];
  for (const parca of i.govde.split(`--${sinir}`)) {
    const bas = parca.indexOf('\r\n\r\n');
    if (bas < 0) continue;
    const ust = parca.slice(0, bas);
    const icerik = parca.slice(bas + 4).replace(/\r\n$/, '');
    const ad = /name="([^"]*)"/.exec(ust)?.[1];
    const dosya = /filename="([^"]*)"/.exec(ust)?.[1];
    if (!ad) continue;
    if (dosya !== undefined) dosyalar.push({ alan: ad, ad: Buffer.from(dosya, 'latin1').toString('utf8'), boyut: Buffer.byteLength(icerik, 'latin1') });
    else alanlar[ad] = Buffer.from(icerik, 'latin1').toString('utf8');
  }
  return { alanlar, dosyalar };
}
