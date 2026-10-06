// SERVİS İSTEĞİ ADIMI FORMU (ekranın akış tasarımı: "+ > Servis isteği" bloğu). Tanım (servisler/servis-adimi.mjs > ServisTanimi):
// servis + şablon senaryo (servisin kayıtlı senaryolarından; istek gövdesi, başlıklar ve kontroller oradan), atamalar (şablondaki bir
// metnin yerine ekranın değeri: ${alanAnahtari} / ${akis:Ad}) ve okumalar (yanıttan değer → sonraki adımlarda ${akis:Ad}). Tanım
// nesnesi yerinde değiştirilir; her değişiklikte degisti() çağrılır. Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok).
import { api, h, ikon, yerlestir } from './ortak.js';
import { SERVIS_ATAMA_EN_COK, SERVIS_OKUMA_EN_COK, servisOzeti } from './servis-adimi.mjs';

/** Proje başına servis listesi (bir kez okunur). @type {Map<string, Promise<Array<{ id: string; ad: string; tur: string }>>>} */
const servisOnbellegi = new Map();
/** Servis başına senaryolar. @type {Map<string, Promise<Array<{ id: string; baslik: string; icerik: any }>>>} */
const senaryoOnbellegi = new Map();

/** Projenin servisleri. @param {string} projeId */
export function servisleriAl(projeId) {
  if (!servisOnbellegi.has(projeId)) {
    servisOnbellegi.set(projeId, api(`/platform/servisler?projeId=${encodeURIComponent(projeId)}`)
      .then((r) => (Array.isArray(r.servisler) ? r.servisler : []).map((/** @type {any} */ s) => ({ id: String(s.id), ad: String(s.ad || s.anahtar || s.id), tur: String(s.tur || '') })))
      .catch(() => { servisOnbellegi.delete(projeId); return []; }));
  }
  return /** @type {Promise<Array<{ id: string; ad: string; tur: string }>>} */ (servisOnbellegi.get(projeId));
}

/** Servisin şablon olabilecek (akış olmayan) senaryoları. @param {string} projeId @param {string} servisId */
function senaryolariAl(projeId, servisId) {
  const k = `${projeId}|${servisId}`;
  if (!senaryoOnbellegi.has(k)) {
    senaryoOnbellegi.set(k, api(`/platform/servis?projeId=${encodeURIComponent(projeId)}&id=${encodeURIComponent(servisId)}`)
      .then((r) => (Array.isArray(r.senaryolar) ? r.senaryolar : []).filter((/** @type {any} */ x) => !(x.icerik && x.icerik.tur === 'akis') && (!x.servisId || x.servisId === servisId))
        .map((/** @type {any} */ x) => ({ id: String(x.id), baslik: String(x.baslik || x.id), icerik: x.icerik || {} })))
      .catch(() => { senaryoOnbellegi.delete(k); return []; }));
  }
  return /** @type {Promise<Array<{ id: string; baslik: string; icerik: any }>>} */ (senaryoOnbellegi.get(k));
}

/** Boş tanım. */
export const yeniServisTanimi = () => ({ servisId: '', senaryoId: '', atamalar: [], okumalar: [] });

/** Bloğun özet rozeti. @param {any} t */
export const servisRozeti = (t) => servisOzeti({ servisId: t.servisId || '', senaryoId: t.senaryoId || '', atamalar: t.atamalar || [], okumalar: t.okumalar || [] });

/** Şablondaki ${…} değişkenleri (gövde, yol, başlıklar): atamada "değiştirilecek metin" önerisi. @param {any} icerik */
function sablonDegiskenleri(icerik) {
  const metin = [icerik && icerik.govde, icerik && icerik.http && icerik.http.yol, ...Object.values((icerik && icerik.basliklar) || {})].filter((x) => typeof x === 'string').join('\n');
  return [...new Set([...metin.matchAll(/\$\{[^{}]+\}/g)].map((m) => m[0]))].slice(0, 30);
}

/**
 * @param {any} t servis tanımı (yerinde değişir)
 * @param {{ projeId: string; degisti: () => void }} s
 */
export function servisAdimiFormu(t, s) {
  if (!Array.isArray(t.atamalar)) t.atamalar = [];
  if (!Array.isArray(t.okumalar)) t.okumalar = [];
  const degisti = () => s.degisti();
  const servis = h('select', { 'aria-label': 'Servis' }, h('option', { value: '' }, 'Yükleniyor…'));
  const senaryo = h('select', { 'aria-label': 'Şablon senaryo' }, h('option', { value: '' }, '— önce servisi seçin —'));
  const onizleme = h('div', { class: 'servis-sablon-onizleme kucuk', 'aria-live': 'polite' });
  const atamaKabi = h('div', { class: 'servis-atamalari' });
  const okumaKabi = h('div', { class: 'servis-okumalari' });
  /** @type {any} */
  let sablon = null;

  const onizlemeCiz = () => {
    if (!sablon) { yerlestir(onizleme); return; }
    const degiskenler = sablonDegiskenleri(sablon.icerik);
    yerlestir(onizleme,
      h('details', {}, h('summary', {}, 'Şablonun isteğini göster'), h('pre', { class: 'servis-sablon-govdesi' }, String(sablon.icerik.govde || '(gövde yok)').slice(0, 4000))),
      degiskenler.length ? h('p', { class: 'soluk' }, 'Şablondaki değişkenler (atamaya eklemek için tıklayın): ',
        degiskenler.map((d) => h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => {
          if (t.atamalar.length >= SERVIS_ATAMA_EN_COK) return;
          t.atamalar.push({ bul: d, deger: '' });
          atamalariCiz(); degisti();
        } }, d))) : null);
  };
  const senaryolariCiz = async () => {
    if (!t.servisId) { yerlestir(senaryo, h('option', { value: '' }, '— önce servisi seçin —')); sablon = null; onizlemeCiz(); return; }
    yerlestir(senaryo, h('option', { value: '' }, 'Yükleniyor…'));
    const liste = await senaryolariAl(s.projeId, t.servisId);
    sablon = liste.find((x) => x.id === t.senaryoId) || null;
    yerlestir(senaryo, h('option', { value: '' }, liste.length ? '— şablon senaryo seçin —' : '— bu serviste senaryo yok —'),
      liste.map((x) => h('option', { value: x.id, selected: x.id === t.senaryoId }, x.baslik)),
      t.senaryoId && !sablon ? h('option', { value: t.senaryoId, selected: true }, 'Kayıtlı senaryo bulunamadı') : null);
    onizlemeCiz();
  };
  void servisleriAl(s.projeId).then((liste) => {
    yerlestir(servis, h('option', { value: '' }, liste.length ? '— servis seçin —' : '— projede servis yok —'),
      liste.map((x) => h('option', { value: x.id, selected: x.id === t.servisId }, `${x.ad}${x.tur ? ` (${x.tur.toUpperCase()})` : ''}`)),
      t.servisId && !liste.some((x) => x.id === t.servisId) ? h('option', { value: t.servisId, selected: true }, 'Kayıtlı servis bulunamadı') : null);
    void senaryolariCiz();
  });
  servis.addEventListener('change', () => { t.servisId = /** @type {HTMLSelectElement} */ (servis).value; t.senaryoId = ''; degisti(); void senaryolariCiz(); });
  senaryo.addEventListener('change', () => { t.senaryoId = /** @type {HTMLSelectElement} */ (senaryo).value; degisti(); void senaryolariCiz(); });

  function atamalariCiz() {
    yerlestir(atamaKabi, t.atamalar.map((/** @type {any} */ a, /** @type {number} */ i) => {
      const bul = h('input', { type: 'text', value: a.bul || '', placeholder: 'ör. ${Kişi.TC kimlik no}', 'aria-label': `${i + 1}. atama: şablondaki metin` });
      const deger = h('input', { type: 'text', value: a.deger || '', placeholder: 'ör. ${identityNo}', 'aria-label': `${i + 1}. atama: yeni değer` });
      bul.addEventListener('input', () => { a.bul = /** @type {HTMLInputElement} */ (bul).value; degisti(); });
      deger.addEventListener('input', () => { a.deger = /** @type {HTMLInputElement} */ (deger).value; degisti(); });
      return h('div', { class: 'servis-satiri' }, bul, h('span', { 'aria-hidden': 'true' }, ' → '), deger,
        h('button', { type: 'button', class: 'kucuk-dugme hayalet tehlike', 'aria-label': `${i + 1}. atamayı sil`, onclick: () => { t.atamalar.splice(i, 1); atamalariCiz(); degisti(); } }, ikon('cop')));
    }), h('button', { type: 'button', class: 'kucuk-dugme', disabled: t.atamalar.length >= SERVIS_ATAMA_EN_COK || null, onclick: () => { t.atamalar.push({ bul: '', deger: '' }); atamalariCiz(); degisti(); } }, '+ Atama'));
  }
  function okumalariCiz() {
    yerlestir(okumaKabi, t.okumalar.map((/** @type {any} */ o, /** @type {number} */ i) => {
      const ad = h('input', { type: 'text', value: o.ad || '', placeholder: 'ör. KayitNo', maxlength: '60', 'aria-label': `${i + 1}. okuma: ad` });
      const yol = h('input', { type: 'text', value: o.yol || '', placeholder: 'ör. RecordNo ya da sonuc.no', 'aria-label': `${i + 1}. okuma: yanıttaki yol` });
      const gizli = h('input', { type: 'checkbox', checked: o.gizli === true || null, 'aria-label': `${i + 1}. okuma: gizli` });
      ad.addEventListener('input', () => { o.ad = /** @type {HTMLInputElement} */ (ad).value.trim(); degisti(); });
      yol.addEventListener('input', () => { o.yol = /** @type {HTMLInputElement} */ (yol).value.trim(); degisti(); });
      gizli.addEventListener('change', () => { if (/** @type {HTMLInputElement} */ (gizli).checked) o.gizli = true; else delete o.gizli; degisti(); });
      return h('div', { class: 'servis-satiri' }, ad, yol, h('label', { class: 'onay-satiri kucuk' }, gizli, 'gizli'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet tehlike', 'aria-label': `${i + 1}. okumayı sil`, onclick: () => { t.okumalar.splice(i, 1); okumalariCiz(); degisti(); } }, ikon('cop')));
    }), h('button', { type: 'button', class: 'kucuk-dugme', disabled: t.okumalar.length >= SERVIS_OKUMA_EN_COK || null, onclick: () => { t.okumalar.push({ ad: '', yol: '' }); okumalariCiz(); degisti(); } }, '+ Okuma'));
  }
  atamalariCiz();
  okumalariCiz();
  return h('div', { class: 'servis-adimi-formu' },
    h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Servis'), servis),
    h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Şablon senaryo'), senaryo),
    h('p', { class: 'soluk kucuk' }, 'İstek gövdesi, başlıklar ve kontroller şablon senaryodan gelir (servisin senaryolar sekmesinde düzenlenir). Kontrollerden biri tutmazsa adım kalır.'),
    onizleme,
    h('div', { class: 'tasarim-etiketi' }, h('span', {}, 'Atamalar'), h('p', { class: 'soluk kucuk' }, 'Şablondaki metnin yerine yazılacak değer: ekranın değeri ${alanAnahtari}, önceki adımda okunan ${akis:Ad} ya da sabit metin.'), atamaKabi),
    h('div', { class: 'tasarim-etiketi' }, h('span', {}, 'Okumalar'), h('p', { class: 'soluk kucuk' }, 'Yanıttan okunan değer sonraki adımlarda ${akis:Ad} olarak kullanılır (SQL, servis, beklenen değerler).'), okumaKabi));
}
