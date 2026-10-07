// TEST VERİSİ TABLOLARI (Veri > Tablolar). Test verisi Excel sayfaları gibidir: sütunlar alan, her satır
// birlikte geçerli bir değer kombinasyonu (ör. Servis girişi: Kanal | Kullanıcı | Parola). Ekran input'ları ve servis
// parametreleri bir sütuna bağlanır; senaryoda seçtikçe aynı tablodaki listeler satırlardan süzülür (koşul tanımı yok).
//   · Sol: tablolar (sütun / satır sayısı) + "Yeni tablo".
//   · Sağ: düzenlenebilir ızgara — sütun adı / gizli / sil / sırası (← / →, sürükle-bırak, Alt + ← / →), satır hücreleri, Ortam (Tümü / ortam), satır sil; arama;
//     Excel / CSV yükle ve yapıştır (ilk satır sütun adlarıyla eşleşirse başlık sayılır, yeni başlıklar sütun olur).
//   · Gizli sütun (parola vb.) değerleri sunucudan hiç gelmez; boş bırakılan gizli hücre kayıtlı değeri korur.
//   · Sütun başlığındaki "Karşılıklar": sütundaki her değerin sayfadaki (seçenek değeri) ve servisteki karşılığı. Ekran koşusu
//     seçeneği sayfa değeriyle seçer, servise servis değeri gider; boşsa tablodaki değer kullanılır.
//   · Kaydet yalnız değişen satırları gönderir. Kaydedilmemiş değişiklik varken başka tabloya geçmek onay ister.
import { api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, yatayKaydirmaIpucu, yerlestir } from './ortak.js';
import { onayIste, secenekIste } from './kosu-paneli.js';
import { tabloOku } from './parametre-tanimi-formu.js';
import { veriSagligiKarti } from './veri-sagligi.js';
import { baslikNormal } from './tablo-benzerligi.mjs';
import { goreliHataMesaji, goreliIfadeHataliMi, goreliOzet, tarihDegeriCoz } from './goreli-tarih.mjs';

/** Tarih hücresinin önizlemesi: "bugün+7 → 05.10.2026" · anlaşılamayan göreli yazımda örnek · diğerlerinde boş. @param {string} v */
function tarihHucreOnizlemesi(v) {
  const o = goreliOzet(v);
  if (o) return `${o} (bugün koşulursa)`;
  return goreliIfadeHataliMi(v) ? goreliHataMesaji(v) : '';
}

const q = encodeURIComponent;
/** Oturum boyunca seçili tablo. */
let seciliId = '';
const GORUNUR_ADIM = 200;
const kucuk = (x) => String(x ?? '').trim().toLocaleLowerCase('tr');
/** "Seçim" türü sütun: değer { deger, metin } JSON'u olarak saklanır; hücrede "34 — İSTANBUL" diye yazılır / okunur. */
const AYRAC = ' — ';
function secimGoster(v) {
  if (!v) return '';
  try {
    const o = JSON.parse(v);
    if (o && typeof o === 'object' && 'deger' in o) return o.metin ? `${o.deger ?? ''}${AYRAC}${o.metin}` : String(o.deger ?? '');
  } catch { /* düz metin */ }
  return String(v);
}
function secimYaz(metin) {
  const m = metin.trim();
  if (!m) return '';
  const i = m.indexOf(AYRAC.trim());
  return JSON.stringify(i < 0 ? { deger: m, metin: '' } : { deger: m.slice(0, i).trim(), metin: m.slice(i + 1).trim() });
}

/** Sunucudaki tablodan düzenleme kopyası. */
function kopya(t) {
  return {
    id: t ? t.id : undefined, ad: t ? t.ad : '',
    // acik: gizli sütun ama "Kişisel verileri maskele" kapalı (Ayarlar > Güvenlik) — değer düz gösterilir, yine şifreli saklanır.
    sutunlar: t ? t.sutunlar.map((s) => ({ ad: s.ad, eskiAd: s.ad, gizli: s.gizli, acik: s.acik === true, tip: s.tip, karsiliklar: { ...(s.karsiliklar || {}) } }))
      : [{ ad: 'Değer', eskiAd: null, gizli: false, tip: 'metin', karsiliklar: {} }],
    satirlar: t ? t.satirlar.map((r) => ({ id: r.id, ad: r.ad || '', ortamId: r.ortamId, degerler: { ...r.degerler }, doluGizli: new Set(r.doluGizli), degisti: false })) : [],
    silinen: new Set(), degisti: !t, baglam: Boolean(t && t.baglam),
    // Kullanıcının seçtiği tablo türü ('kayit' | 'liste' | 'servis'); null: seçilmedi (görünen tür sezgiden / kayıtlı türden).
    tur: null,
    // Liste grubu (kaynak.grup; kullanıcı metni). grupIlk: kayıtlı değer — yalnız değişince gönderilir.
    grup: (t && t.kaynak && t.kaynak.grup) || '', grupIlk: (t && t.kaynak && t.kaynak.grup) || ''
  };
}

/** İçe alınan başlık "Satır adı" mı (SATIR ADI, satir adi, Satır Adı…): o sütun satırın adına gider, veri sütunu olmaz. */
export const satirAdiBasligiMi = (/** @type {unknown} */ x) => /^sat[ıi]r\s*ad[ıi]\s*\*?$/u.test(String(x ?? '').trim().toLocaleLowerCase('tr'));

/** Ekran paketinden içe aktarılan tablonun kaynağı: "Akış kaydı · “Ekran” · 27.09.2026 10:30". */
const KAYNAK_TURU = { paket: 'Ekran paketi', tarama: 'Otomatik tarama', kayit: 'Akış kaydı' };
function kaynakMetni(k) {
  if (!k || !k.tur) return '';
  const z = Date.parse(k.yazilma || k.olusturulma || '');
  return [KAYNAK_TURU[k.tur] || k.tur, k.ekran ? `“${k.ekran}”` : '', Number.isNaN(z) ? '' : new Date(z).toLocaleString('tr-TR')].filter(Boolean).join(' · ');
}

// --- Liste grupları (yalnız görünüm; veri değişmez) ---------------------------------------------------------------------
// Ölçüt önce TABLO TÜRÜdür (kaynak.tabloTuru: paketin testVerisi.tablolar[].tur; tarama / akış kaydı tabloları "liste"):
// "kayit" → "Kişi ve kayıt verileri", "liste" → "Ekran listeleri". Tür yoksa (eski kayıtlar) sezgi: kaynağı olan (ekran paketi /
// tarama / akış kaydı) tablolar ile "<Ekran> — <Alan…>" adlı tablolardan tek sütunlu olanlar, bir ekranın alan bağlarında
// kullanılanlar ya da "<Ekran>" kısmı projedeki bir ekranın adı olanlar (çok sütunlu bağımlı listeler dahil) ekran listesidir;
// diğerleri kişi ve kayıt verisi. Tür gruplarının içinde ALT GRUP kullanıcının tabloya verdiği gruptur (kaynak.grup; alfabetik,
// grubu olmayanlar en sonda "Diğer"); kaynak ekranın adına göre gruplama yapılmaz. Açık / kapalı durumu tarayıcıda (localStorage) hatırlanır.
const GRUP_ANAHTARI = 'platform.tabloGruplari.kapali';
const AD_DESENI = /^(.+?)\s+—\s+(.+)$/;
let grupSayaci = 0;
/** @returns {Set<string>} */
function kapaliGruplar() {
  try { return new Set(JSON.parse(localStorage.getItem(GRUP_ANAHTARI) || '[]')); } catch { return new Set(); }
}
const tabloGrubuKapaliMi = (anahtar) => kapaliGruplar().has(anahtar);
function tabloGrubuDurumuYaz(anahtar, kapali) {
  const k = kapaliGruplar();
  if (kapali) k.add(anahtar); else k.delete(anahtar);
  try { localStorage.setItem(GRUP_ANAHTARI, JSON.stringify([...k].slice(-200))); } catch { /* yok sayılır */ }
}
/**
 * @template {{ ad: string; baglam?: boolean; sutunlar: unknown[]; kaynak?: { tur?: string; ekran?: string; tabloTuru?: string; grup?: string } | null }} T
 * @param {T[]} liste
 * @param {{ ekranAdlari?: string[]; ekranKullanimi?: Record<string, string[]> }} [ek] projedeki ekran adları ve tablo kimliği →
 *   alan bağlarında kullanan ekranlar (sunucu: /platform/tablolar?baglam=1)
 * @returns {{ kayitlar: T[]; listeler: T[]; servisler: T[] }}
 */
export function tablolariGrupla(liste, ek = {}) {
  const ekranAdlari = new Set((ek.ekranAdlari || []).map(kucuk));
  const kullanim = ek.ekranKullanimi || {};
  /** "<Ekran> (akış)" gibi sondaki parantezli ek atılarak da ekran adıyla karşılaştırılır. @param {string} onEk */
  const ekranAdiMi = (onEk) => ekranAdlari.has(kucuk(onEk)) || ekranAdlari.has(kucuk(onEk.replace(/\s*\([^)]*\)\s*$/, '')));
  /** @type {T[]} */
  const kayitlar = [];
  /** @type {T[]} */
  const listeler = [];
  /** @type {T[]} */
  const servisler = [];
  for (const t of liste) {
    const desen = AD_DESENI.exec(String(t.ad || ''));
    const tur = t.kaynak && t.kaynak.tabloTuru;
    // Servis tablosu yalnız kullanıcı seçince olur (sezgi önermez): ayrı "Servis verileri" grubu.
    if (!t.baglam && tur === 'servis') { servisler.push(t); continue; }
    const kaynakli = Boolean(t.kaynak && t.kaynak.tur);
    const bagli = Boolean(/** @type {any} */ (t).id && kullanim[/** @type {any} */ (t).id]?.length);
    const ekranListesi = tur === 'liste' || (tur !== 'kayit' && (kaynakli || Boolean(desen && (t.sutunlar.length === 1 || bagli || ekranAdiMi(desen[1].trim())))));
    (t.baglam || !ekranListesi ? kayitlar : listeler).push(t);
  }
  return { kayitlar, listeler, servisler };
}

/** Grubu olmayan tabloların alt grubunun adı (her tür grubunda en sonda). */
export const DIGER_GRUBU = 'Diğer';
/**
 * Bir tür grubundaki tabloları kullanıcının verdiği gruba (kaynak.grup) göre alt gruplara ayırır: gruplar alfabetik (tr; büyük /
 * küçük harf farkı aynı grup, ilk görülen yazım), grubu olmayanlar en sonda "Diğer" (grup: null). Hiçbir tablonun grubu yoksa
 * tek "Diğer" alt grubu döner (çağıran düz liste olarak gösterir).
 * @template {{ kaynak?: { grup?: string } | null }} T @param {T[]} tablolar
 * @returns {Array<{ grup: string | null; tablolar: T[] }>}
 */
export function altGruplaraAyir(tablolar) {
  /** @type {Map<string, { grup: string; tablolar: T[] }>} */
  const gruplar = new Map();
  /** @type {T[]} */
  const digerleri = [];
  for (const t of tablolar) {
    const g = String(t.kaynak?.grup ?? '').trim();
    if (!g) { digerleri.push(t); continue; }
    const k = kucuk(g);
    if (!gruplar.has(k)) gruplar.set(k, { grup: g, tablolar: [] });
    /** @type {{ tablolar: T[] }} */ (gruplar.get(k)).tablolar.push(t);
  }
  return [...[...gruplar.values()].sort((a, b) => a.grup.localeCompare(b.grup, 'tr')),
    ...(digerleri.length ? [{ grup: null, tablolar: digerleri }] : [])];
}

const KARSILIK_ADIM = 200;
/**
 * Sütunun karşılıkları penceresi: sütundaki farklı değerler; her biri için Sayfa değeri ve Servis değeri. Tamam'da yalnız
 * tablodaki değerlerin dolu karşılıkları döner (vazgeçilirse null).
 * @param {{ ad: string; karsiliklar?: Record<string, { sayfa?: string; servis?: string }> }} s @param {string[]} degerler
 * @returns {Promise<Record<string, { sayfa?: string; servis?: string }> | null>}
 */
function karsilikPenceresi(s, degerler) {
  return new Promise((coz) => {
    const is = Object.fromEntries(degerler.map((d) => [d, { sayfa: s.karsiliklar?.[d]?.sayfa || '', servis: s.karsiliklar?.[d]?.servis || '' }]));
    let ara = '';
    let gorunur = KARSILIK_ADIM;
    const govde = h('tbody', {});
    const alt = h('div', { class: 'kucuk soluk tablo-alt-bilgi' });
    const sayac = h('span', { 'aria-live': 'polite' });
    const aramaG = h('input', { type: 'search', placeholder: 'Değerlerde ara…', 'aria-label': 'Değerlerde ara' });
    aramaG.addEventListener('input', () => { ara = aramaG.value; gorunur = KARSILIK_ADIM; ciz(); });
    function ciz() {
      const a = kucuk(ara);
      const eslesen = degerler.filter((d) => !a || kucuk(d).includes(a) || kucuk(is[d].sayfa).includes(a) || kucuk(is[d].servis).includes(a));
      yerlestir(govde, eslesen.length ? eslesen.slice(0, gorunur).map((d) => {
        const girdi = (ne, etiket) => {
          const g = h('input', { type: 'text', value: is[d][ne], maxlength: '500', placeholder: d, 'aria-label': `${d} ${etiket}` });
          g.addEventListener('input', () => { is[d][ne] = g.value; sayacCiz(); });
          return h('td', {}, g);
        };
        return h('tr', {}, h('th', { scope: 'row' }, d), girdi('sayfa', 'sayfa değeri'), girdi('servis', 'servis değeri'));
      }) : h('tr', {}, h('td', { colspan: '3', class: 'cok-soluk' }, degerler.length ? 'Aramayla eşleşen değer yok.' : 'Bu sütunda henüz değer yok.')));
      yerlestir(alt, sayac, eslesen.length > gorunur
        ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { gorunur += KARSILIK_ADIM * 5; ciz(); } }, `${eslesen.length - gorunur} değer daha göster`) : null);
      sayacCiz();
    }
    function sayacCiz() {
      const dolu = degerler.filter((d) => is[d].sayfa.trim() || is[d].servis.trim()).length;
      sayac.textContent = `${degerler.length} değer · ${dolu} karşılık tanımlı`;
    }
    // Servis kodları sayfa kodlarıyla aynıysa: dolu sayfa değerleri yalnız BOŞ servis değerlerine kopyalanır (dolu servis değeri korunur).
    const kopyalaNotu = h('span', { class: 'kucuk soluk', 'aria-live': 'polite' });
    const kopyala = h('button', { type: 'button', class: 'kucuk-dugme', title: 'Sayfa değeri dolu ve servis değeri boş olan satırlarda sayfa değerini servis değerine yazar; dolu servis değerleri değişmez.' },
      ikon('kopya'), 'Sayfa değerlerini servis değerine kopyala');
    kopyala.addEventListener('click', () => {
      const hedef = degerler.filter((d) => is[d].sayfa.trim() && !is[d].servis.trim());
      for (const d of hedef) is[d].servis = is[d].sayfa.trim();
      const korunan = degerler.filter((d) => is[d].sayfa.trim() && is[d].servis.trim() && is[d].servis.trim() !== is[d].sayfa.trim()).length;
      kopyalaNotu.textContent = hedef.length
        ? `${hedef.length} değer kopyalandı${korunan ? ` · ${korunan} dolu servis değeri korundu` : ''}. Tamam'a basınca kaydedilir.`
        : 'Kopyalanacak değer yok: sayfa değeri dolu ve servis değeri boş satır bulunmuyor.';
      ciz();
    });
    const tamam = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Tamam');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const diyalog = h('dialog', { class: 'onay-diyalogu karsilik-diyalogu', 'aria-labelledby': 'karsilik-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'karsilik-basligi' }, `"${s.ad}" değerlerinin karşılıkları`),
        h('p', { class: 'soluk kucuk' }, 'Senaryoda tablodaki değer seçilir. ', h('b', {}, 'Sayfa değeri'), ': ekranda seçeneğin değeri farklıysa (ör. EKSPRES → 1) koşu seçeneği bununla seçer. ',
          h('b', {}, 'Servis değeri'), ': servis gövdesine yazılacak değer. Boş bırakılırsa tablodaki değer kullanılır.'),
        h('div', { class: 'karsilik-arac-cubugu' }, h('div', { class: 'arama-kutusu' }, ikon('ara'), aramaG), kopyala),
        kopyalaNotu,
        h('div', { class: 'tablo-kaydirma karsilik-tablosu' }, h('table', { class: 'veri-tablosu' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Tablodaki değer'), h('th', { scope: 'col' }, 'Sayfa değeri'), h('th', { scope: 'col' }, 'Servis değeri'))), govde)),
        alt),
      h('div', { class: 'diyalog-alt' }, vazgec, tamam));
    let sonuc = null;
    tamam.addEventListener('click', () => {
      sonuc = Object.fromEntries(degerler.map((d) => [d, { sayfa: is[d].sayfa.trim(), servis: is[d].servis.trim() }]).filter(([, k]) => k.sayfa || k.servis)
        .map(([d, k]) => [d, { ...(k.sayfa ? { sayfa: k.sayfa } : {}), ...(k.servis ? { servis: k.servis } : {}) }]));
      diyalog.close();
    });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    ciz();
    document.body.append(diyalog);
    diyalog.showModal();
    aramaG.focus();
  });
}

const ETKI_DURUMU = { guncellenebilir: 'güncellenebilir', 'silindi-uyari': 'silinen değer', kosuyor: 'koşuyor', belirsiz: 'belirsiz', atlanacak: 'atlanacak' };
const TUR_ADI = { ekran: 'Ekran', servis: 'Servis' };

/**
 * Tablo değişikliğinin senaryolara etkisi → onay penceresi (sunucu: tablo-etkisi.mjs). Güncellenebilen senaryolar işaretlenebilir
 * (varsayılan hepsi işaretli); silinen değeri kullananlar uyarı olarak, güncellenemeyenler nedenleriyle listelenir. Gizli / hassas
 * değerler sunucudan zaten "•••" gelir.
 * Aktarımlarda (SoapUI / Postman / test verisine taşı) "Tabloda değişecek değerler" de listelenir; koru: true ise "Mevcut değerleri
 * koru" düğmesi çıkar (dosyadaki değer dolu hücrenin üzerine yazılmaz).
 * @param {{ etkilenenler: Array<Record<string, any>>; karsiliklar: Array<{ sutun: string; eski: string; yeni: string }>;
 *   degisiklikler?: Array<{ tablo?: string; satir: string; sutun: string; eski: string; yeni: string | null }> }} etki
 * @param {{ baslik?: string; yalniz?: string; guncelle?: string; degisenler?: boolean; koru?: boolean }} [s]
 * @returns {Promise<string[] | 'koru' | null>} seçilen anahtarlar ([] = yalnız tablo / işlem), 'koru' ya da null (vazgeç)
 */
export function etkiOnayi(etki, s = {}) {
  return new Promise((coz) => {
    const liste = etki.etkilenenler;
    const guncel = liste.filter((x) => x.durum === 'guncellenebilir');
    const silinen = liste.filter((x) => x.durum === 'silindi-uyari');
    const diger = liste.filter((x) => x.durum !== 'guncellenebilir' && x.durum !== 'silindi-uyari');
    const secili = new Set(guncel.map((x) => x.anahtar));
    const senaryoSayisi = (xs) => new Set(xs.map((x) => `${x.tur}|${x.senaryoId}`)).size;
    // Özet: her (eski → yeni) için kaç senaryo, hangi ekran / serviste.
    /** @type {Map<string, Array<Record<string, any>>>} */
    const gruplar = new Map();
    for (const x of guncel) {
      const k = JSON.stringify([x.nitelik, x.eski, x.yeni]);
      if (!gruplar.has(k)) gruplar.set(k, []);
      gruplar.get(k).push(x);
    }
    const kaynaklar = (xs) => {
      /** @type {Map<string, Set<string>>} */
      const m = new Map();
      for (const x of xs) { const a = `${TUR_ADI[x.tur] || x.tur} ${x.kaynakAdi}`; if (!m.has(a)) m.set(a, new Set()); m.get(a).add(x.senaryoId); }
      return [...m].map(([a, s]) => `${a}: ${s.size}`).join(', ');
    };
    const ozet = [...gruplar.values()].map((xs) => (xs[0].nitelik === 'secim'
      ? h('li', {}, 'Satır seçimi ', h('b', {}, xs[0].eski), ` ${senaryoSayisi(xs)} senaryoda (${kaynaklar(xs)}) — `, h('b', {}, xs[0].yeni), ' olarak güncelleyeyim mi?')
      : h('li', {}, h('b', {}, `"${xs[0].eski}"`), ` değeri ${senaryoSayisi(xs)} senaryoda kullanılıyor (${kaynaklar(xs)}) — bunları da `, h('b', {}, `"${xs[0].yeni}"`), ' yapayım mı?')));
    const kaydetGuncelle = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), s.guncelle || 'Tabloyu kaydet ve seçili senaryoları güncelle');
    const yalniz = h('button', { type: 'button', class: guncel.length ? '' : 'birincil' }, s.yalniz || 'Yalnız tabloyu kaydet');
    const koru = s.koru ? h('button', { type: 'button' }, 'Mevcut değerleri koru') : null;
    const degisenler = s.degisenler && etki.degisiklikler && etki.degisiklikler.length ? h('div', { class: 'donusum-plani' },
      h('h3', { class: 'kucuk-baslik' }, 'Tabloda değişecek değerler'),
      h('ul', { class: 'etki-ozeti' }, etki.degisiklikler.map((d) => h('li', {}, `${d.tablo ? `${d.tablo} · ` : ''}${d.satir} · ${d.sutun}: `,
        h('b', {}, d.eski), ' → ', d.yeni === null ? h('i', {}, 'silinir') : h('b', {}, d.yeni))))) : null;
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const sayac = h('span', { class: 'soluk', 'aria-live': 'polite' });
    const tumu = h('input', { type: 'checkbox', checked: guncel.length > 0, 'aria-label': 'Güncellenebilen tüm senaryoları seç' });
    /** @type {Array<[HTMLInputElement, string]>} */
    const kutular = [];
    const sayacYaz = () => {
      sayac.textContent = `${secili.size} / ${guncel.length} seçili`;
      tumu.checked = guncel.length > 0 && secili.size === guncel.length;
      kaydetGuncelle.disabled = !secili.size;
    };
    const satir = (x) => {
      const kutu = x.durum === 'guncellenebilir' ? h('input', { type: 'checkbox', checked: true, 'aria-label': `${x.baslik} · ${x.alan}: güncelle` }) : null;
      if (kutu) {
        kutular.push([kutu, x.anahtar]);
        kutu.addEventListener('change', () => { if (kutu.checked) secili.add(x.anahtar); else secili.delete(x.anahtar); sayacYaz(); });
      }
      return h('tr', { class: x.durum === 'guncellenebilir' ? '' : 'atlandi', 'data-anahtar': x.anahtar },
        h('td', {}, kutu),
        h('td', { 'data-baslik': 'Senaryo' }, x.baslik, h('span', { class: 'neden' }, `${TUR_ADI[x.tur] || x.tur}: ${x.kaynakAdi}`)),
        h('td', { 'data-baslik': 'Alan' }, x.alan, x.ortamlar && x.ortamlar.length ? h('span', { class: 'neden' }, x.ortamlar.join(', ')) : null),
        h('td', { 'data-baslik': 'Eski' }, x.gizli ? h('span', { title: 'Gizli / hassas değer gösterilmez' }, '•••') : x.eski),
        h('td', { 'data-baslik': 'Yeni' }, x.yeni === null || x.yeni === undefined ? '—' : x.gizli ? '•••' : x.yeni),
        h('td', { 'data-baslik': 'Durum' }, ETKI_DURUMU[x.durum] || x.durum, x.neden ? h('span', { class: 'neden' }, x.neden) : null));
    };
    const tablo = (baslik, xs, secimli) => h('div', { class: 'donusum-tablosu-kap' }, h('table', { class: 'donusum-tablosu', 'aria-label': baslik },
      h('thead', {}, h('tr', {}, h('th', {}, secimli ? tumu : ''), h('th', {}, 'Senaryo'), h('th', {}, 'Alan'), h('th', {}, 'Eski'), h('th', {}, 'Yeni'), h('th', {}, 'Durum'))),
      h('tbody', {}, xs.map(satir))));
    tumu.addEventListener('change', () => {
      for (const [k, a] of kutular) { k.checked = tumu.checked; if (tumu.checked) secili.add(a); else secili.delete(a); }
      sayacYaz();
    });
    const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay etki-diyalogu', 'aria-labelledby': 'etki-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'etki-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('uyari')), s.baslik || 'Değişen değerler senaryolarda kullanılıyor'),
        degisenler, s.degisenler ? h('h3', { class: 'kucuk-baslik' }, 'Etkilenen senaryolar') : null,
        guncel.length ? h('ul', { class: 'etki-ozeti' }, ozet) : null,
        guncel.length ? h('div', { class: 'donusum-plani' },
          h('div', { class: 'donusum-ozeti' }, h('b', {}, `${senaryoSayisi(guncel)} senaryo güncellenebilir`), sayac),
          tablo('Güncellenebilen senaryolar', [...guncel, ...diger], true)) : null,
        silinen.length ? h('div', { class: 'donusum-plani' },
          h('div', { class: 'not-kutusu uyari kucuk' }, h('b', {}, `${senaryoSayisi(silinen)} senaryo silinen değeri kullanıyor; `), 'koşuda hata verebilir. Bu senaryolar güncellenmez; tabloyu kaydettikten sonra elle düzenleyin.'),
          tablo('Silinen değeri kullanan senaryolar', silinen, false)) : null,
        !guncel.length && diger.length ? tablo('Güncellenemeyen senaryolar', diger, false) : null,
        etki.karsiliklar && etki.karsiliklar.length ? h('p', { class: 'soluk kucuk' }, `Karşılıklar yeni değere taşınır: ${etki.karsiliklar.map((k) => `${k.sutun}: ${k.eski} → ${k.yeni}`).join(', ')}.`) : null,
        h('p', { class: 'soluk kucuk' }, 'Senaryolar düz değer olarak kalır. Tablo ve seçtiğiniz senaryolar birlikte kaydedilir (biri hata verirse hiçbiri); her senaryonun önceki hâli değişiklik geçmişinde kalır.')),
      h('div', { class: 'diyalog-alt' }, vazgec, koru, yalniz, guncel.length ? kaydetGuncelle : null));
    sayacYaz();
    /** @type {string[] | 'koru' | null} */
    let sonuc = null;
    kaydetGuncelle.addEventListener('click', () => { sonuc = [...secili]; diyalog.close(); });
    yalniz.addEventListener('click', () => { sonuc = []; diyalog.close(); });
    if (koru) koru.addEventListener('click', () => { sonuc = 'koru'; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    vazgec.focus();
  });
}

/**
 * Aktarım önizlemesindeki "Tabloda değişecek değerler ve etkilenen senaryolar" bölümü (SoapUI / Postman aktarımı, test verisine
 * taşı). hesapla(koru) sunucuda etkiyi 'onizle' kipiyle hesaplar (hiçbir şey yazılmaz); yenile() kullanıcının önizlemedeki her
 * seçim değişikliğinde çağrılır (gecikmeli, son istek geçerli). Etkilenen senaryolar işaretlenebilir (varsayılan hepsi; kaldırılan
 * işaret yeniden hesaplamada korunur); "Mevcut değerleri koru" dolu hücrenin üzerine yazmaz. Değişen değer yoksa bölüm gizlenir.
 * Gizli değerler sunucudan zaten "•••" gelir.
 * @param {((koru: boolean) => Promise<any>) | null} hesapla null: etki dışarıdan verilir (ayarla)
 * @param {{ koruVar?: boolean }} [s]
 */
export function aktarimEtkisiBolumu(hesapla, s = {}) {
  const koruVar = s.koruVar !== false;
  const kok = h('section', { class: 'kart etki-bolumu', 'aria-label': 'Tabloda değişecek değerler ve etkilenen senaryolar', hidden: true });
  /** @type {any} */
  let etki = null;
  let hata = '';
  let koru = false;
  let hesaplaniyor = false;
  /** Kullanıcının işaretini kaldırdığı senaryolar (yeniden hesaplamada korunur). */
  const kaldirilan = new Set();
  let zaman = null;
  let sira = 0;
  /** @type {Promise<void>} */
  let bekleyen = Promise.resolve();
  const guncelleri = () => (etki ? etki.etkilenenler.filter((x) => x.durum === 'guncellenebilir') : []);
  function ciz() {
    const degisen = etki ? etki.degisiklikler : [];
    kok.hidden = !hata && !degisen.length && !koru;
    if (kok.hidden) { yerlestir(kok); return; }
    const guncel = guncelleri();
    const silinen = etki ? etki.etkilenenler.filter((x) => x.durum === 'silindi-uyari') : [];
    const kutular = [];
    const sayac = h('span', { class: 'soluk', 'aria-live': 'polite' });
    const tumu = h('input', { type: 'checkbox', 'aria-label': 'Güncellenebilen tüm senaryoları seç' });
    const sayacYaz = () => {
      const n = guncel.filter((x) => !kaldirilan.has(x.anahtar)).length;
      sayac.textContent = `${n} / ${guncel.length} seçili`;
      tumu.checked = guncel.length > 0 && n === guncel.length;
    };
    const satir = (x) => {
      const kutu = x.durum === 'guncellenebilir' ? h('input', { type: 'checkbox', checked: !kaldirilan.has(x.anahtar), 'aria-label': `${x.baslik} · ${x.alan}: güncelle` }) : null;
      if (kutu) {
        kutular.push([kutu, x.anahtar]);
        kutu.addEventListener('change', () => { if (kutu.checked) kaldirilan.delete(x.anahtar); else kaldirilan.add(x.anahtar); sayacYaz(); });
      }
      return h('tr', { class: x.durum === 'guncellenebilir' ? '' : 'atlandi' },
        h('td', {}, kutu),
        h('td', { 'data-baslik': 'Senaryo' }, x.baslik, h('span', { class: 'neden' }, `${TUR_ADI[x.tur] || x.tur}: ${x.kaynakAdi}`)),
        h('td', { 'data-baslik': 'Alan' }, x.alan),
        h('td', { 'data-baslik': 'Eski' }, x.eski),
        h('td', { 'data-baslik': 'Yeni' }, x.yeni === null || x.yeni === undefined ? '—' : x.yeni),
        h('td', { 'data-baslik': 'Durum' }, ETKI_DURUMU[x.durum] || x.durum, x.neden ? h('span', { class: 'neden' }, x.neden) : null));
    };
    tumu.addEventListener('change', () => {
      for (const [k, a] of kutular) { k.checked = tumu.checked; if (tumu.checked) kaldirilan.delete(a); else kaldirilan.add(a); }
      sayacYaz();
    });
    const koruKutusu = koruVar ? h('input', { type: 'checkbox', checked: koru, id: `koru-${++grupSayaci}` }) : null;
    if (koruKutusu) koruKutusu.addEventListener('change', () => { koru = koruKutusu.checked; yenile(0); });
    const liste = etki ? etki.etkilenenler : [];
    yerlestir(kok,
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('uyari'), 'Tabloda değişecek değerler ve etkilenen senaryolar'),
        hesaplaniyor ? h('span', { class: 'sag soluk kucuk' }, 'Hesaplanıyor…') : null),
      hata ? h('div', { class: 'not-kutusu hata', role: 'alert' }, `Etki hesaplanamadı: ${hata}`) : null,
      degisen.length ? h('ul', { class: 'etki-ozeti' }, degisen.map((d) => h('li', {}, `${d.tablo ? `${d.tablo} · ` : ''}${d.satir} · ${d.sutun}: `,
        h('b', {}, d.eski), ' → ', d.yeni === null ? h('i', {}, 'silinir') : h('b', {}, d.yeni))))
        : h('p', { class: 'soluk kucuk' }, koru ? 'Mevcut değerler korunuyor: tabloda değişen değer yok.' : 'Tabloda değişen değer yok.'),
      koruKutusu ? h('label', { class: 'secenek', for: koruKutusu.id }, koruKutusu, 'Mevcut değerleri koru (dosyadaki değer dolu hücrenin üzerine yazılmaz; yalnız boş hücreye yazılır)') : null,
      degisen.length && !liste.length ? h('p', { class: 'soluk kucuk' }, 'Etkilenen senaryo yok.') : null,
      guncel.length ? h('div', { class: 'donusum-ozeti' }, h('b', {}, 'Aktarımla birlikte güncellenecek senaryolar'), sayac) : null,
      liste.length ? h('div', { class: 'donusum-tablosu-kap' }, h('table', { class: 'donusum-tablosu', 'aria-label': 'Etkilenen senaryolar' },
        h('thead', {}, h('tr', {}, h('th', {}, guncel.length ? tumu : ''), h('th', {}, 'Senaryo'), h('th', {}, 'Alan'), h('th', {}, 'Eski'), h('th', {}, 'Yeni'), h('th', {}, 'Durum'))),
        h('tbody', {}, liste.map(satir)))) : null,
      silinen.length ? h('div', { class: 'not-kutusu uyari kucuk' }, `${silinen.length} senaryo silinen değeri kullanıyor; koşuda hata verebilir (güncellenmez).`) : null);
    sayacYaz();
  }
  /** @param {any} e */
  function ayarla(e) { etki = e; hata = ''; ciz(); }
  /** Etkiyi yeniden hesaplar (gecikmeli; son istek geçerli). @param {number} [gecikme] */
  function yenile(gecikme = 300) {
    if (!hesapla) return bekleyen;
    clearTimeout(zaman);
    const n = ++sira;
    bekleyen = new Promise((coz) => {
      zaman = setTimeout(async () => {
        hesaplaniyor = true;
        if (!kok.hidden) ciz();
        try { const e = await hesapla(koru); if (n === sira) { etki = e; hata = ''; } } catch (err) { if (n === sira) { etki = null; hata = err.message; } }
        if (n === sira) { hesaplaniyor = false; ciz(); }
        coz();
      }, gecikme);
    });
    return bekleyen;
  }
  return {
    kok, yenile, ayarla,
    /** Bekleyen hesaplama bitince (Aktar'dan önce). */
    bekle: () => bekleyen,
    /** Aktarım gövdesine eklenecek seçimler. */
    secimler: () => ({
      guncellenecekler: guncelleri().filter((x) => !kaldirilan.has(x.anahtar)).map((x) => x.anahtar),
      ...(etki && etki.imza ? { beklenenImza: etki.imza } : {}), ...(koru ? { mevcutDegerleriKoru: true } : {})
    })
  };
}

/**
 * Önizlemedeki seçimlerle aktarır ('uygula'; işaretli senaryolar tek işlemde güncellenir). Önizlemeden sonra veri değiştiyse
 * (sunucu imzayı tutmaz bulur) hiçbir şey yazılmaz: güncel etki pencerede gösterilir ve yeniden onay istenir. Vazgeçilirse null.
 * @param {HTMLButtonElement} dugme @param {string} yol @param {Record<string, unknown>} govde @param {ReturnType<typeof aktarimEtkisiBolumu>} bolum
 * @param {{ baslik?: string; yalniz?: string; guncelle?: string; mesgul?: string }} [s]
 */
export async function onizlemeyleAktar(dugme, yol, govde, bolum, s = {}) {
  const mesgul = s.mesgul || 'Aktarılıyor…';
  await bolum.bekle();
  let secim = bolum.secimler();
  for (let deneme = 0; deneme < 3; deneme++) {
    const r = await mesgulIken(dugme, mesgul, () => api(yol, { govde: { ...govde, etki: 'uygula', ...secim } }));
    if (!r.onayGerekli) return r;
    // Arada tablo / senaryolar değişti: güncel etkiyi göster, yeniden onay iste.
    bolum.ayarla(r.etki);
    const c = await etkiOnayi(r.etki, { degisenler: true, koru: true, baslik: 'Önizlemeden sonra değerler değişti', ...s });
    if (c === null) return null;
    secim = c === 'koru' ? { guncellenecekler: [], mevcutDegerleriKoru: true } : { guncellenecekler: c, ...(r.etki.imza ? { beklenenImza: r.etki.imza } : {}) };
    if (c === 'koru') bolum.yenile(0);
  }
  throw new Error('Veriler aktarım sırasında değişmeye devam ediyor; önizlemeyi yenileyip yeniden deneyin.');
}

/** Senaryo güncellemesi bildirimi ("2 senaryo güncellendi, 1 atlandı (neden)"); güncelleme yoksa boş. @param {{ guncelleme?: any } | null | undefined} r */
export function guncellemeMetni(r) {
  const g = r && r.guncelleme;
  if (!g) return '';
  const atlanan = g.atlananlar.length;
  return [g.guncellenenSenaryo || atlanan ? `${g.guncellenenSenaryo} senaryo güncellendi${atlanan ? `, ${atlanan} atlandı (${[...new Set(g.atlananlar.map((x) => x.neden).filter(Boolean))].join('; ')})` : ''}.` : '',
    g.uyari ? `${g.uyari} senaryo silinen değeri kullanıyor.` : ''].filter(Boolean).join(' ');
}

/**
 * @param {HTMLElement} govde @param {{ id: string }} proje
 * @param {{ ayarlarFormu?: (kaydedildi: () => void) => Promise<HTMLElement> }} [secenek] ayarlarFormu: Veri sağlığı başlığındaki
 *   ayarlar (dişli) düğmesinin açtığı "Test verisi ayarları" formu (ayarlar.js)
 */
export async function tablolarBolumu(govde, proje, secenek = {}) {
  yerlestir(govde, iskelet('liste'));
  const [{ tablolar, ekranAdlari, ekranKullanimi }, { ortamlar }, saglikVerisi] = await Promise.all([
    api(`/platform/tablolar?projeId=${q(proje.id)}&baglam=1`),
    api(`/platform/ortamlar?projeId=${q(proje.id)}`),
    api(`/platform/tablolar/veri-sagligi?projeId=${q(proje.id)}`).catch(() => null)
  ]);
  let liste = tablolar;
  const grupBilgisi = { ekranAdlari: ekranAdlari || [], ekranKullanimi: ekranKullanimi || {} };
  // Satıra doğrudan gelindiyse (ör. "veri bekliyor" senaryosunun "Değerleri doldur"u): o tablo açılır, satır görünür ve boş hücreler vurgulanır.
  const hedef = veriSatiriHedefi();
  if (hedef && liste.some((t) => t.id === hedef.tabloId)) seciliId = hedef.tabloId;
  if (!liste.some((t) => t.id === seciliId)) seciliId = liste[0]?.id || '';
  let is = liste.length ? kopya(liste.find((t) => t.id === seciliId)) : null;
  let ara = '';
  let gorunur = GORUNUR_ADIM;
  const hedefSira = hedef && is && is.id === hedef.tabloId ? is.satirlar.findIndex((r) => r.id === hedef.satirId) : -1;
  if (hedefSira >= 0) gorunur = Math.max(gorunur, hedefSira + 1);
  /** Satır vurgulanacak hedef mi? @param {any} r */
  const hedefSatiriMi = (r) => Boolean(hedef && is && is.id === hedef.tabloId && r.id === hedef.satirId);

  const solKap = h('div', {});
  const sagKap = h('div', {});
  // Veri sağlığı (benzer / kullanılmayan tablolar, boş sütunlar, kırık başvurular; birleştirme ve geri alma): veri-sagligi.js.
  const saglik = veriSagligiKarti(proje, {
    veri: Promise.resolve(saglikVerisi),
    tablolar: () => liste,
    yenile: () => { tablolarBolumu(govde, proje, secenek); },
    ayarlarFormu: secenek.ayarlarFormu,
    secTablo: async (id) => {
      const t = liste.find((x) => x.id === id);
      if (!t || (t.id === seciliId && is?.id)) { sagKap.scrollIntoView({ block: 'start' }); return; }
      if (!(await gecebilirMi())) return;
      seciliId = t.id; is = kopya(t); ara = ''; gorunur = GORUNUR_ADIM; ciz();
      sagKap.scrollIntoView({ block: 'start' });
    }
  });
  // Bu bilginin tamamı sayfa açıklamasında (kısa + "?" ayrıntı); aynı metin burada yinelenmez.
  yerlestir(govde, saglik,
    h('div', { class: 'tablo-duzeni' }, solKap, sagKap));

  const degistiMi = () => Boolean(is && (is.degisti || is.silinen.size || is.satirlar.some((r) => r.degisti)));
  /**
   * Düzenlenen tablonun görünen türü: kullanıcının seçtiği; yoksa var olan tabloda listedeki grubu (kayıtlı tür ya da sezgi —
   * tablolariGrupla), yeni tabloda öneri (tek sütun: liste tablosu; birden çok sütun: kayıt tablosu). Servis tablosu önerilmez;
   * yalnız kullanıcı seçer (ya da kayıtlı türdür).
   * @returns {'kayit' | 'liste' | 'servis'}
   */
  function gorunenTur() {
    if (is.tur) return is.tur;
    const t = is.id ? liste.find((x) => x.id === is.id) : null;
    if (t) { const g = tablolariGrupla([t], grupBilgisi); return g.servisler.length ? 'servis' : g.kayitlar.length ? 'kayit' : 'liste'; }
    if (is.sutunlar.length === 1) return 'liste';
    return tablolariGrupla([{ ad: is.ad, sutunlar: is.sutunlar, kaynak: null }], grupBilgisi).kayitlar.length ? 'kayit' : 'liste';
  }
  const gecebilirMi = async () => !degistiMi() || onayIste({
    baslik: 'Değişiklikleriniz kaydedilmeyecek', metin: 'Bu tabloda kaydedilmemiş değişiklikler var.', dugme: 'Kaydetmeden geç', tehlikeli: false, ikonAd: 'uyari'
  });

  // Liste araması (tüm gruplarda; eşleşen grup kendiliğinden açılır). Arama kutusu yeniden çizilmez (odak korunur).
  let listeArama = '';
  const listeAramaG = h('input', { type: 'search', placeholder: 'Tablolarda ara…', 'aria-label': 'Tablolarda ara' });
  listeAramaG.addEventListener('input', () => { listeArama = listeAramaG.value; solCiz(); });
  const listeKap = h('div', { class: 'tablo-gruplari' });
  const tabloDugmesi = (t) => h('button', {
    type: 'button', class: 'tablo-ogesi', 'aria-current': t.id === seciliId && is?.id ? 'true' : 'false',
    onclick: async () => { if (t.id === seciliId && is?.id) return; if (!(await gecebilirMi())) return; seciliId = t.id; is = kopya(t); ara = ''; gorunur = GORUNUR_ADIM; ciz(); }
  }, h('span', { class: 'tablo-adi', title: t.ad }, h('span', { class: 'tablo-adi-metni' }, t.ad), t.baglam ? h('span', { class: 'rozet kucuk-rozet', title: 'Kullanıcı / şube değiştirme profilleri: senaryoda satır adıyla seçilir' }, 'bağlam') : null),
  h('small', {}, `${t.sutunlar.length} sütun · ${t.satirlar.length} satır`),
  t.kaynak && t.kaynak.tur ? h('small', { class: 'tablo-kaynagi', title: kaynakMetni(t.kaynak) }, `kaynak: ${KAYNAK_TURU[t.kaynak.tur] || t.kaynak.tur}`) : null);
  /** Açılır-kapanır grup (durum tarayıcıda hatırlanır; arama ya da seçili tablo varken açık). */
  const grupCiz = (anahtar, baslik, ogeler, sinif, zorlaAcik) => {
    const kapali = !zorlaAcik && tabloGrubuKapaliMi(anahtar);
    const icerikId = `tablo-grubu-${anahtar.replace(/[^a-z0-9-]/gi, '-')}-${++grupSayaci}`;
    const icerik = h('div', { class: 'tablo-grubu-icerik', id: icerikId, role: 'group', 'aria-label': baslik, hidden: kapali }, ogeler);
    const adet = ogeler.filter((o) => o.classList.contains('tablo-ogesi')).length
      + ogeler.reduce((t, o) => t + (o.classList.contains('tablo-grubu') ? Number(o.dataset.adet || 0) : 0), 0);
    const dugme = h('button', { type: 'button', class: 'tablo-grubu-baslik', 'aria-expanded': String(!kapali), 'aria-controls': icerikId, title: baslik },
      h('span', { class: 'tablo-grubu-ok', 'aria-hidden': 'true' }, ikon('asagi')), h('span', { class: 'tablo-grubu-adi' }, baslik), h('span', { class: 'adet' }, String(adet)));
    const grup = h('div', { class: `tablo-grubu ${sinif}${kapali ? ' kapali' : ''}`, 'data-adet': String(adet) }, dugme, icerik);
    dugme.addEventListener('click', () => {
      const acilacak = icerik.hidden;
      icerik.hidden = !acilacak;
      grup.classList.toggle('kapali', !acilacak);
      dugme.setAttribute('aria-expanded', String(acilacak));
      tabloGrubuDurumuYaz(anahtar, !acilacak);
    });
    return grup;
  };
  function solCiz() {
    const a = kucuk(listeArama);
    // Arama: tablo adı, kaynak ekranı ve kullanıcının verdiği grup adı.
    const uyan = liste.filter((t) => !a || kucuk(t.ad).includes(a) || kucuk(t.kaynak?.ekran).includes(a) || kucuk(t.kaynak?.grup).includes(a));
    const { kayitlar, listeler, servisler } = tablolariGrupla(uyan, grupBilgisi);
    const seciliGrup = (tl) => tl.some((t) => t.id === seciliId);
    /**
     * Tür grubunun içeriği: kullanıcının verdiği gruplar (alfabetik) + en sonda "Diğer". Türde hiç grup yoksa düz liste.
     * @param {string} tur tür grubunun anahtarı (açık / kapalı durumu bununla birlikte hatırlanır) @param {any[]} tl
     */
    const turIcerigi = (tur, tl) => {
      const altlar = altGruplaraAyir(tl);
      if (altlar.length === 1 && altlar[0].grup === null) return tl.map(tabloDugmesi);
      return altlar.map((x) => grupCiz(x.grup === null ? `${tur}:diger` : `${tur}:grup:${kucuk(x.grup)}`, x.grup ?? DIGER_GRUBU,
        x.tablolar.map(tabloDugmesi), `alt-grup${x.grup === null ? ' diger-grubu' : ''}`, Boolean(a) || seciliGrup(x.tablolar)));
    };
    // Boş grup başlığı gösterilmez (grup silinebilir bir öğe değildir); hiç tablo yokken tek boş durum mesajı sağ paneldedir.
    listeAramaG.closest('.tablo-listesi-arama')?.toggleAttribute('hidden', !liste.length);
    yerlestir(listeKap,
      liste.length && !uyan.length ? h('p', { class: 'soluk kucuk tablo-grubu-bos' }, 'Aramayla eşleşen tablo yok.') : null,
      kayitlar.length ? grupCiz('kayit', 'Kişi ve kayıt verileri', turIcerigi('kayit', kayitlar), 'ust-grup', Boolean(a) || seciliGrup(kayitlar)) : null,
      listeler.length ? grupCiz('ekran-listeleri', 'Ekran listeleri', turIcerigi('liste', listeler), 'ust-grup', Boolean(a) || seciliGrup(listeler)) : null,
      servisler.length ? grupCiz('servis-verileri', 'Servis verileri', turIcerigi('servis', servisler), 'ust-grup', Boolean(a) || seciliGrup(servisler)) : null);
    if (!solKap.firstChild) {
      yerlestir(solKap, h('nav', { class: 'kart tablo-listesi', 'aria-label': 'Tablolar' },
        h('div', { class: 'arama-kutusu tablo-listesi-arama', hidden: !liste.length }, ikon('ara'), listeAramaG),
        listeKap,
        h('button', { type: 'button', class: 'kucuk-dugme yeni-tablo', onclick: async () => { if (!(await gecebilirMi())) return; seciliId = ''; is = kopya(null); ciz(); } },
          ikon('arti'), 'Tablo ekle')));
    }
  }

  function ciz() {
    solCiz();
    if (!is) {
      yerlestir(sagKap, h('section', { class: 'kart' }, bosDurum('Henüz tablo yok.', '"Tablo ekle" ile ekleyin ya da Excel / CSV dosyasından yükleyin.', {
        ikon: 'liste', eylem: h('button', { type: 'button', class: 'birincil', onclick: () => { is = kopya(null); ciz(); } }, ikon('arti'), 'Tablo ekle')
      })));
      return;
    }
    sagCiz();
  }

  // --- İçe alma (Excel / CSV / yapıştır) ---------------------------------------------------------------------------------
  /** @param {string[][]} satirlar */
  function iceAl(satirlar) {
    const dolu = satirlar.map((r) => r.map((x) => String(x ?? '').trim())).filter((r) => r.some(Boolean));
    if (!dolu.length) { bildir('İçe alınacak satır yok.', 'hata'); return; }
    const ilk = dolu[0];
    const mevcutAdlar = is.sutunlar.map((s) => kucuk(s.ad));
    const bosTablo = !is.satirlar.length && is.sutunlar.length === 1 && is.sutunlar[0].ad === 'Değer' && !is.id;
    const baslikMi = bosTablo || ilk.some((x) => mevcutAdlar.includes(kucuk(x)) || satirAdiBasligiMi(x));
    /** @type {number[]} dosya sütunu → tablo sütunu (SATIR_ADI: satırın adı) */
    let eslem;
    let veri = dolu;
    const SATIR_ADI = -2;
    if (baslikMi) {
      veri = dolu.slice(1);
      if (bosTablo) is.sutunlar = [];
      eslem = ilk.map((b, i) => {
        // "Satır adı" başlıklı sütun (ilki) satırın adına gider; veri sütunu olmaz.
        if (satirAdiBasligiMi(b) && ilk.findIndex(satirAdiBasligiMi) === i) return SATIR_ADI;
        const ad = b || `Sütun ${i + 1}`;
        let k = is.sutunlar.findIndex((s) => kucuk(s.ad) === kucuk(ad));
        if (k < 0) { is.sutunlar.push({ ad, eskiAd: null, gizli: false }); k = is.sutunlar.length - 1; is.degisti = true; }
        return k;
      });
    } else {
      eslem = ilk.map((_, i) => i);
      while (is.sutunlar.length < ilk.length) { is.sutunlar.push({ ad: `Sütun ${is.sutunlar.length + 1}`, eskiAd: null, gizli: false }); is.degisti = true; }
    }
    for (const r of veri) {
      /** @type {Record<string, string>} */
      const degerler = {};
      let ad = '';
      eslem.forEach((k, i) => { if (k === SATIR_ADI) ad = String(r[i] ?? '').slice(0, 120); else if (k >= 0 && is.sutunlar[k]) degerler[is.sutunlar[k].ad] = r[i] ?? ''; });
      is.satirlar.push({ id: undefined, ad, ortamId: null, degerler, doluGizli: new Set(), degisti: true });
    }
    // Yalnız "Satır adı" başlığı olan boş tabloda veri sütunu kalmazsa varsayılan tek sütun geri gelir (tabloda en az bir sütun olmalı).
    if (!is.sutunlar.length) is.sutunlar = [{ ad: 'Değer', eskiAd: null, gizli: false, tip: 'metin', karsiliklar: {} }];
    bildir(`${veri.length} satır eklendi${baslikMi ? ` (ilk satır sütun adı sayıldı${eslem.includes(SATIR_ADI) ? '; "Satır adı" sütunu satır adlarına alındı' : ''})` : ''}. Kaydetmeyi unutmayın.`);
    ciz();
  }

  // --- Kaydet ---------------------------------------------------------------------------------------------------------------
  async function kaydet(dugme) {
    const adlar = is.sutunlar.map((s) => s.ad.trim());
    if (!is.ad.trim()) { bildir('Tablo adı boş olamaz.', 'hata'); return; }
    if (adlar.some((a) => !a)) { bildir('Sütun adı boş olamaz.', 'hata'); return; }
    const gizliler = new Set(is.sutunlar.filter((s) => s.gizli).map((s) => s.ad));
    const govde = {
      projeId: proje.id, id: is.id, ad: is.ad.trim(),
      sutunlar: is.sutunlar.map((s) => ({ ad: s.ad.trim(), eskiAd: s.eskiAd, gizli: s.gizli, ...(is.baglam || s.gizli ? {} : { karsiliklar: s.karsiliklar || {} }) })),
      satirlar: is.satirlar.filter((r) => r.degisti).map((r) => ({
        id: r.id, ad: r.ad.trim(), ortamId: r.ortamId,
        degerler: Object.fromEntries(is.sutunlar.map((s) => {
          const v = r.degerler[s.eskiAd && s.eskiAd !== s.ad && !(s.ad in r.degerler) ? s.eskiAd : s.ad];
          return [s.ad.trim(), gizliler.has(s.ad) && (v === null || v === undefined || v === '') ? null : (v ?? '')];
        }))
      })),
      silinenSatirlar: [...is.silinen],
      // Tablo türü: yeni tabloda görünen tür (seçilen ya da önerilen) her zaman yazılır; var olan tabloda yalnız kullanıcı değiştirdiyse.
      ...(is.baglam ? {} : is.tur ? { tur: is.tur } : !is.id ? { tur: gorunenTur() } : {}),
      // Grup: yalnız değiştiyse (boş = grubu kaldır).
      ...(is.baglam || is.grup.trim() === is.grupIlk ? {} : { grup: is.grup.trim() || null })
    };
    // Var olan tabloda önce etki denetlenir: değişen değeri düz metin olarak kullanan senaryo varsa sunucu hiçbir şey yazmaz ve
    // onay ister (tablo-etkisi.mjs); yoksa doğrudan kaydeder.
    const denetle = Boolean(is.id) && !is.baglam;
    // Önleme: yeni tablo kaydedilmeden önce başlıkları aynı (esnek) tablo varsa "onu kullan / yine de yeni oluştur" sorulur.
    if (!is.id && !is.baglam) {
      let benzerler = [];
      // Tek sütunlu tabloda başlık az ayırt edicidir: satır değerleri de gönderilir (örtüşme sunucuda bakılır; değer geri dönmez).
      const tekSutun = is.sutunlar.length === 1 ? is.sutunlar[0].ad : null;
      const satirlar = tekSutun === null ? undefined : is.satirlar.slice(0, 500).map((r) => ({ [adlar[0]]: r.degerler[tekSutun] ?? null }));
      try { benzerler = (await api('/platform/tablo/benzer', { govde: { projeId: proje.id, sutunlar: adlar, ad: is.ad.trim(), satirlar } })).benzerler; } catch { benzerler = []; }
      if (benzerler.length) {
        const secim = await secenekIste({
          baslik: 'Benzer tablo var', ikonAd: 'uyari',
          metin: `Sütun başlıkları ${benzerler.map((b) => `“${b.ad}”`).join(', ')} tablosuyla aynı. Aynı veriyi iki tabloda tutmamak için onu kullanabilirsiniz.`,
          secenekler: [
            ...benzerler.slice(0, 3).map((b) => ({ deger: b.id, etiket: `Onu kullan: “${b.ad}”`, aciklama: 'Eklediğiniz satırlar o tabloya taşınır; kaydetmeden önce görürsünüz.', ikonAd: 'esle' })),
            { deger: '', etiket: 'Yine de yeni oluştur', aciklama: `“${is.ad.trim()}” ayrı bir tablo olarak kaydedilir.`, ikonAd: 'arti' }
          ]
        });
        if (secim === null) return;
        if (secim) { benzerTabloyaTasi(secim); return; }
      }
    }
    try {
      let y = await mesgulIken(dugme, 'Kaydediliyor…', () => api('/platform/tablo/kaydet', { govde: denetle ? { ...govde, etki: 'denetle' } : govde }));
      if (y.onayGerekli) {
        const guncellenecekler = await etkiOnayi(y.etki);
        if (!guncellenecekler) return;
        y = await mesgulIken(dugme, 'Kaydediliyor…', () => api('/platform/tablo/kaydet', { govde: { ...govde, etki: 'uygula', guncellenecekler } }));
      }
      const { tablo } = y;
      const i = liste.findIndex((t) => t.id === tablo.id);
      liste = i >= 0 ? liste.map((t) => (t.id === tablo.id ? tablo : t)) : [...liste, tablo].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
      seciliId = tablo.id;
      is = kopya(tablo);
      const g = y.guncelleme;
      const atlanan = g ? g.atlananlar.length : 0;
      const k = y.etki && y.etki.karsiliklar ? y.etki.karsiliklar.length : 0;
      bildir([
        g && (g.guncellenenSenaryo || atlanan) ? `"${tablo.ad}" kaydedildi; ${g.guncellenenSenaryo} senaryo güncellendi${atlanan ? `, ${atlanan} atlandı (${[...new Set(g.atlananlar.map((x) => x.neden).filter(Boolean))].join('; ')})` : ''}.` : `"${tablo.ad}" kaydedildi.`,
        g && g.uyari ? `${g.uyari} senaryo silinen değeri kullanıyor.` : '',
        k ? `${k} karşılık yeni değere taşındı.` : ''
      ].filter(Boolean).join(' '), atlanan ? 'hata' : undefined);
      ciz();
    } catch (e) { bildir(e.message, 'hata'); }
  }

  /**
   * "Onu kullan": kaydedilmemiş yeni tablonun satırları benzer tabloya taşınır (sütunlar esnek başlıkla eşlenir; eşleşmeyen sütun
   * yeni sütun olur). Hiçbir şey kaydedilmez; kullanıcı Kaydet'e basınca yazılır.
   * @param {string} id
   */
  function benzerTabloyaTasi(id) {
    const t = liste.find((x) => x.id === id);
    if (!t) return;
    const yeni = kopya(t);
    const hedef = (ad) => {
      let s = yeni.sutunlar.find((x) => baslikNormal(x.ad) === baslikNormal(ad));
      if (!s) { s = { ad, eskiAd: null, gizli: false, tip: 'metin', karsiliklar: {} }; yeni.sutunlar.push(s); yeni.degisti = true; }
      return s.ad;
    };
    for (const r of is.satirlar) {
      /** @type {Record<string, string | null>} */
      const degerler = {};
      for (const s of is.sutunlar) { const v = r.degerler[s.ad]; if (v !== undefined && v !== null && v !== '') degerler[hedef(s.ad)] = v; }
      yeni.satirlar.push({ id: undefined, ad: r.ad || '', ortamId: r.ortamId, degerler, doluGizli: new Set(), degisti: true });
    }
    seciliId = t.id;
    is = yeni;
    ciz();
    bildir(`Satırlar “${t.ad}” tablosuna taşındı. Kontrol edip Kaydet'e basın.`);
  }

  async function tabloyuSil() {
    const t = liste.find((x) => x.id === is.id);
    if (!t) { is = liste.length ? kopya(liste[0]) : null; seciliId = liste[0]?.id || ''; ciz(); return; }
    const tamam = await onayIste({ baslik: `"${t.ad}" silinsin mi?`, metin: `${t.satirlar.length} satırıyla birlikte silinir. Bu tabloya bağlı alanlar bağlantısız kalır.`, dugme: 'Sil', tehlikeli: true });
    if (!tamam) return;
    try {
      await api('/platform/tablo/sil', { govde: { projeId: proje.id, id: t.id } });
      liste = liste.filter((x) => x.id !== t.id);
      seciliId = liste[0]?.id || '';
      is = liste.length ? kopya(liste[0]) : null;
      bildir(`"${t.ad}" silindi.`);
      ciz();
    } catch (e) { bildir(e.message, 'hata'); }
  }

  // --- Izgara ---------------------------------------------------------------------------------------------------------------
  function sagCiz() {
    const adG = h('input', { type: 'text', value: is.ad, maxlength: '60', placeholder: 'ör. Servis girişi', 'aria-label': 'Tablo adı', class: 'tablo-adi-girdisi' });
    /** @type {HTMLElement | null} */
    let turKutusu = null;
    adG.addEventListener('input', () => {
      is.ad = adG.value; is.degisti = true; durumCiz();
      // Yeni tabloda önerilen tür addan da çıkar ("<Ekran> — <Alan>"): kullanıcı seçmediyse öneri yenilenir.
      if (!is.tur && !is.id && turKutusu) { const y = turSecimi(); if (y) { turKutusu.replaceWith(y); turKutusu = y; } }
    });
    const aramaG = h('input', { type: 'search', placeholder: 'Satırlarda ara…', value: ara, 'aria-label': 'Satırlarda ara' });
    let zaman = null;
    aramaG.addEventListener('input', () => { clearTimeout(zaman); zaman = setTimeout(() => { ara = aramaG.value; gorunur = GORUNUR_ADIM; govdeCiz(); }, 150); });
    const dosya = h('input', { type: 'file', accept: '.xlsx,.csv,.txt', class: 'gorunmez', 'aria-label': 'Excel ya da CSV dosyası' });
    dosya.addEventListener('change', async () => {
      const f = dosya.files && dosya.files[0];
      dosya.value = '';
      if (!f) return;
      try { iceAl(await tabloOku(f)); } catch (e) { bildir(e.message, 'hata'); }
    });
    const yapistirG = h('textarea', { rows: '4', placeholder: 'Excel\'den satırları kopyalayıp buraya yapıştırın. İlk satır sütun adlarıysa başlık sayılır; "Satır adı" başlıklı sütun satır adlarına alınır.', 'aria-label': 'Yapıştırılacak satırlar' });
    const yapistirKutusu = h('details', { class: 'yapistir-kutusu' }, h('summary', {}, 'Excel\'den yapıştır'), yapistirG,
      h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
        iceAl(yapistirG.value.split(/\r?\n/).map((s) => s.split('\t')));
      } }, ikon('arti'), 'Yapıştırılanları ekle')));
    const durum = h('span', { class: 'kucuk', 'aria-live': 'polite' });
    const kaydetD = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Kaydet');
    kaydetD.addEventListener('click', () => kaydet(kaydetD));
    const geriAl = h('button', { type: 'button', class: 'hayalet' }, 'Değişiklikleri geri al');
    geriAl.addEventListener('click', () => { const t = liste.find((x) => x.id === is.id); is = t ? kopya(t) : (liste.length ? kopya(liste[0]) : null); ciz(); });
    function durumCiz() {
      const d = degistiMi();
      yerlestir(durum, d ? h('span', { class: 'rozet uyari' }, 'kaydedilmemiş değişiklik') : is.id ? h('span', { class: 'soluk' }, 'kayıtlı') : null);
      geriAl.hidden = !d;
    }

    /**
     * Tablo türü seçimi (yeni tabloda "bu tablo ne tutuyor?" sorusu; var olanda şu anki sınıflandırma açıkça): kayıt tablosu →
     * "Kişi ve kayıt verileri", liste tablosu → "Ekran listeleri", servis tablosu → "Servis verileri" (kayıt tablosu gibi çalışır;
     * yalnız servis isteklerinde kullanılır, önerilmez). Seçim Kaydet'le yazılır (kaynak.tabloTuru).
     */
    function turSecimi() {
      if (is.baglam) return null;
      const ad = `tablo-turu-${++grupSayaci}`;
      const secili = gorunenTur();
      const secenekler = [
        ['kayit', 'Kayıt tablosu', 'Kişi, müşteri, kart gibi kayıtlar: bir satırın değerleri birlikte kullanılır (ör. Ad | Kimlik no | Telefon). Listede “Kişi ve kayıt verileri” altında.'],
        ['liste', 'Liste tablosu', 'Ekrandaki bir seçim listesinin seçenekleri (ör. İl listesi, İl → İlçe). Listede “Ekran listeleri” altında.'],
        ['servis', 'Servis tablosu', 'Yalnız servis isteklerinde kullanılan, ekranda karşılığı olmayan değerler (ör. yazdırma türü, Channel, kanal / kullanıcı kodları). Listede “Servis verileri” altında.']
      ];
      return h('fieldset', { class: 'tablo-turu-secimi', 'data-tablo-turu': secili },
        h('legend', {}, is.id ? 'Tablo türü' : 'Tablo türü — bu tablo ne tutuyor?'),
        h('div', { class: 'tablo-turu-secenekleri' }, secenekler.map(([d, etiket, aciklama]) => {
          const r = h('input', { type: 'radio', name: ad, value: d, checked: secili === d });
          r.addEventListener('change', () => { if (!r.checked) return; is.tur = /** @type {'kayit' | 'liste' | 'servis'} */ (d); is.degisti = true; durumCiz(); });
          return h('label', { class: 'tablo-turu-secenegi' }, r, h('span', {}, h('b', {}, etiket), h('small', { class: 'soluk' }, aciklama)));
        })),
        is.tur || is.id ? null : h('small', { class: 'soluk' }, 'Sütun sayısına ve tablo adına göre önerildi; değiştirebilirsiniz. Kaydedince tablo bu türle listelenir.'));
    }

    /**
     * Liste grubu (isteğe bağlı, en çok 40 karakter): var olan grup adları öneri olarak gelir, yeni ad da yazılabilir. Kaydet'le
     * yazılır (kaynak.grup); listede tür grubunun içinde bu adla toplanır, boşsa "Diğer" altında.
     */
    function grupSecimi() {
      if (is.baglam) return null;
      const id = `tablo-grubu-girdisi-${++grupSayaci}`;
      // Listedeki alt gruplarla aynı adlar (büyük / küçük harf farkı tek öneri; ilk görülen yazım).
      const adlar = altGruplaraAyir(liste).map((x) => x.grup).filter((x) => x !== null);
      const oneriler = h('datalist', { id: `${id}-oneriler` }, adlar.map((g) => h('option', { value: g })));
      const g = h('input', { type: 'text', id, value: is.grup, maxlength: '40', list: oneriler.id, autocomplete: 'off', placeholder: 'ör. Adres bilgileri', class: 'tablo-grubu-girdisi' });
      g.addEventListener('input', () => { is.grup = g.value; is.degisti = true; durumCiz(); });
      return h('div', { class: 'tablo-grubu-alani' },
        h('label', { for: id }, 'Grup'), g, oneriler,
        h('small', { class: 'soluk' }, 'İsteğe bağlı. Listede tür grubunun içinde bu adla toplanır; boşsa “Diğer” altında durur.'));
    }

    const tablo = h('table', { class: 'veri-tablosu' });
    const altBilgi = h('div', { class: 'kucuk soluk tablo-alt-bilgi' });

    // --- Sütun sırası: ← / → düğmeleri, tutamaktan sürükle-bırak, başlıkta Alt + ← / → ------------------------------------
    // Sıra tablonun sıralı sutunlar dizisidir (yeni alan yok); diğer düzenlemeler gibi Kaydet'le yazılır, "Değişiklikleri geri al"
    // ile döner. Satır değerleri sütun ADIYLA tutulduğundan değerler, gizli işareti ve karşılıklar sütun nesnesiyle birlikte gider;
    // ${Tablo.Sütun} başvuruları, ekran / servis bağları ve süzme sırası (formdaki alan sırası) sütun sırasından etkilenmez.
    // Bağlam tablosunda sıra profillerin alanlarından türer (saklanan sıra yok): orada taşıma denetimi gösterilmez.
    const sutunDuyurusu = h('span', { class: 'gorunmez', role: 'status', 'aria-live': 'polite' });
    const sutunEtiketi = (s) => (s.ad.trim() ? `“${s.ad.trim()}”` : `${is.sutunlar.indexOf(s) + 1}.`);
    /** Sürüklenen sütun (yalnız bu düzenleyicideki sürükleme; dışarıdan bırakılan öğe yok sayılır). */
    let suruklenen = null;
    /**
     * Sütunu kaynak sıradan hedef sıraya taşır, ızgarayı yeniden çizer; odak aynı sütunun aynı denetimine döner (o denetim artık
     * devre dışıysa öbür ok düğmesine, o da yoksa sütun adına). @param {number} kaynak @param {number} hedef @param {string | null} rol
     */
    function sutunuTasi(kaynak, hedef, rol) {
      const n = is.sutunlar.length;
      if (kaynak === hedef || kaynak < 0 || hedef < 0 || kaynak >= n || hedef >= n) return;
      const [s] = is.sutunlar.splice(kaynak, 1);
      is.sutunlar.splice(hedef, 0, s);
      is.degisti = true;
      govdeCiz(); durumCiz();
      sutunDuyurusu.textContent = `${sutunEtiketi(s)} sütunu ${hedef + 1}. sıraya taşındı (${n} sütun).`;
      if (!rol) return;
      const th = tablo.querySelectorAll('thead th.veri-sutunu')[hedef];
      const adaylar = [rol, rol === 'sol' ? 'sag' : rol === 'sag' ? 'sol' : '', 'ad'].filter(Boolean);
      for (const r of adaylar) {
        const el = th?.querySelector(`[data-rol="${r}"]`);
        if (el instanceof HTMLElement && !(/** @type {HTMLButtonElement} */ (el).disabled)) { el.focus(); return; }
      }
    }
    const birakmaIzleriniTemizle = () => { for (const x of tablo.querySelectorAll('.birak-once, .birak-sonra, .surukleniyor')) x.classList.remove('birak-once', 'birak-sonra', 'surukleniyor'); };
    /**
     * Sütun başlığındaki taşıma denetimleri (iki ya da daha çok sütunda; bağlam tablosunda yok). cubuk: başlığa eklenir;
     * bagla(th): sürükle-bırak ve klavye olaylarını başlığa bağlar; adYenile(): ad yazıldıkça düğme adlarını günceller.
     * @param {{ ad: string }} s @param {number} i
     */
    function sutunTasimaDenetimleri(s, i) {
      if (is.baglam || is.sutunlar.length < 2) return null;
      const sol = h('button', { type: 'button', class: 'ikon-dugme hayalet sutun-tasi-dugmesi', 'data-rol': 'sol', disabled: i === 0, title: 'Sola al (Alt + ←)', onclick: () => sutunuTasi(is.sutunlar.indexOf(s), is.sutunlar.indexOf(s) - 1, 'sol') }, ikon('geri'));
      const sag = h('button', { type: 'button', class: 'ikon-dugme hayalet sutun-tasi-dugmesi', 'data-rol': 'sag', disabled: i === is.sutunlar.length - 1, title: 'Sağa al (Alt + →)', onclick: () => sutunuTasi(is.sutunlar.indexOf(s), is.sutunlar.indexOf(s) + 1, 'sag') }, ikon('ok'));
      const tutamak = h('span', { class: 'sutun-tutamagi', draggable: 'true', 'aria-hidden': 'true', title: 'Sürükleyip başka bir sütun başlığının yanına bırakın (klavyeyle: Alt + ← / →)' },
        h('span', { class: 'sutun-tutamagi-isareti' }, '⠿'));
      const adYenile = () => {
        sol.setAttribute('aria-label', `${sutunEtiketi(s)} sütununu sola al`);
        sag.setAttribute('aria-label', `${sutunEtiketi(s)} sütununu sağa al`);
      };
      adYenile();
      /** @param {HTMLElement} th */
      const bagla = (th) => {
        th.addEventListener('keydown', (o) => {
          if (!o.altKey || o.ctrlKey || o.metaKey || o.shiftKey || (o.key !== 'ArrowLeft' && o.key !== 'ArrowRight')) return;
          o.preventDefault();
          const k = is.sutunlar.indexOf(s);
          const rol = o.target instanceof HTMLElement ? o.target.getAttribute('data-rol') || 'ad' : 'ad';
          sutunuTasi(k, o.key === 'ArrowLeft' ? k - 1 : k + 1, rol);
        });
        tutamak.addEventListener('dragstart', (o) => {
          suruklenen = s;
          if (o.dataTransfer) {
            o.dataTransfer.effectAllowed = 'move';
            o.dataTransfer.setData('text/plain', `tablo-sutunu:${s.ad}`);
            try { o.dataTransfer.setDragImage(th, 16, 16); } catch { /* sürükleme görüntüsü isteğe bağlı */ }
          }
          th.classList.add('surukleniyor');
        });
        tutamak.addEventListener('dragend', () => { suruklenen = null; birakmaIzleriniTemizle(); });
        /** Bırakma yeri: başlığın sol yarısı → önüne, sağ yarısı → arkasına. @param {DragEvent} o */
        const yan = (o) => { const r = th.getBoundingClientRect(); return o.clientX < r.left + r.width / 2 ? 'once' : 'sonra'; };
        th.addEventListener('dragover', (o) => {
          if (!suruklenen) return;
          o.preventDefault();
          if (o.dataTransfer) o.dataTransfer.dropEffect = 'move';
          const y = yan(o);
          if (th.classList.contains(`birak-${y}`)) return;
          for (const x of tablo.querySelectorAll('.birak-once, .birak-sonra')) x.classList.remove('birak-once', 'birak-sonra');
          th.classList.add(`birak-${y}`);
        });
        th.addEventListener('dragleave', (o) => { if (!(o.relatedTarget instanceof Node && th.contains(o.relatedTarget))) th.classList.remove('birak-once', 'birak-sonra'); });
        th.addEventListener('drop', (o) => {
          if (!suruklenen) return;
          o.preventDefault();
          const k = is.sutunlar.indexOf(suruklenen);
          const t = is.sutunlar.indexOf(s);
          let hedef = yan(o) === 'once' ? t : t + 1;
          if (k < hedef) hedef--;
          suruklenen = null;
          birakmaIzleriniTemizle();
          sutunuTasi(k, hedef, null);
        });
      };
      return { cubuk: h('div', { class: 'sutun-tasima' }, tutamak, h('span', { class: 'sutun-tasima-dugmeleri' }, sol, sag)), bagla, adYenile };
    }

    function basCiz() {
      return h('thead', {}, h('tr', {},
        h('th', { class: 'sira', scope: 'col' }, '#'),
        h('th', { scope: 'col', class: 'satir-adi-sutunu', title: is.baglam ? 'Senaryoda bu adla seçilir (zorunlu)' : 'Senaryoda satırı adıyla seçmek için (ör. tc1); boşsa değerlerden üretilir' }, is.baglam ? 'Satır adı *' : 'Satır adı'),
        is.sutunlar.map((s, i) => {
          const g = h('input', { type: 'text', value: s.ad, maxlength: '60', 'aria-label': `${i + 1}. sütunun adı`, 'data-rol': 'ad' });
          const gizli = h('input', { type: 'checkbox', checked: s.gizli, 'aria-label': `${i + 1}. sütun gizli`, 'data-rol': 'gizli' });
          gizli.addEventListener('change', () => { s.gizli = gizli.checked; is.degisti = true; ciz(); });
          const tasima = sutunTasimaDenetimleri(s, i);
          g.addEventListener('input', () => { s.ad = g.value; is.degisti = true; durumCiz(); tasima?.adYenile(); });
          const th = h('th', { scope: 'col', class: 'veri-sutunu' }, h('div', { class: 'sutun-basligi' },
            tasima ? tasima.cubuk : null,
            h('div', { class: 'sutun-basligi-ust' }, g,
              is.sutunlar.length > 1 ? h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${i + 1}. sütunu sil`, title: 'Sütunu sil', onclick: () => {
                is.sutunlar.splice(i, 1); is.degisti = true; ciz();
              } }, ikon('carpi')) : null),
            is.baglam ? null : h('div', { class: 'sutun-basligi-alt' },
              h('label', { class: 'gizli-secimi', title: 'Gizli: değer ekranda hiç gösterilmez (parola vb.); koşuda satırdan gelir.' }, gizli, ikon('kilit'), h('span', {}, 'Gizli')),
              s.gizli ? null : karsilikDugmesi(s, i))));
          if (tasima) tasima.bagla(th);
          return th;
        }),
        h('th', { scope: 'col', class: 'ortam-sutunu', title: 'Satırın geçerli olduğu ortam (Tümü: her ortamda)' }, h('span', { class: 'ortam-sutunu-baslik' }, 'Geçerli ortam')),
        h('th', { scope: 'col', class: 'eylem ekle-sutunu' }, h('div', { class: 'ekle-dugmeleri' },
          h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
            is.sutunlar.push({ ad: `Sütun ${is.sutunlar.length + 1}`, eskiAd: null, gizli: false }); is.degisti = true; ciz();
          } }, ikon('arti'), 'Sütun'),
          h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => satirEkle() }, ikon('arti'), 'Satır')))));
    }
    /** Sona boş satır ekler ve ilk hücresine odaklanır (arama temizlenir). */
    function satirEkle() {
      is.satirlar.push({ id: undefined, ad: '', ortamId: null, degerler: {}, doluGizli: new Set(), degisti: true });
      ara = ''; aramaG.value = ''; gorunur = Math.max(gorunur, is.satirlar.length); govdeCiz(); durumCiz();
      tablo.querySelector('tbody tr:last-child input')?.focus();
    }
    /** Sütunun tablodaki farklı değerleri (tablo sırasıyla; ad değişikliği kaydedilmemişse eski anahtardan). */
    function sutunDegerleri(s) {
      const sonuc = [];
      for (const r of is.satirlar) {
        const v = r.degerler[s.eskiAd && s.eskiAd !== s.ad && !(s.ad in r.degerler) ? s.eskiAd : s.ad];
        const d = String(v ?? '').trim();
        if (d && !sonuc.includes(d)) sonuc.push(d);
      }
      return sonuc;
    }
    function karsilikDugmesi(s, i) {
      const n = Object.keys(s.karsiliklar || {}).length;
      return h('button', {
        type: 'button', class: `kucuk-dugme hayalet karsilik-dugmesi${n ? ' dolu' : ''}`, 'data-rol': 'karsilik', 'aria-label': `${i + 1}. sütunun karşılıkları${n ? ` (${n})` : ''}`,
        title: n ? `Karşılıklar: ${n} değerin sayfa / servis değeri tanımlı` : 'Karşılıklar: değerin sayfada ve serviste farklı karşılığı (ör. EKSPRES → 1)',
        onclick: async () => {
          const yeni = await karsilikPenceresi(s, sutunDegerleri(s));
          if (!yeni) return;
          if (JSON.stringify(yeni) === JSON.stringify(s.karsiliklar || {})) return;
          s.karsiliklar = yeni; is.degisti = true; ciz();
        }
      }, ikon('esle'), h('span', { class: 'karsilik-metni' }, 'Karşılıklar'), n ? h('span', { class: 'karsilik-sayisi' }, String(n)) : null);
    }
    /** Sütun tarih olarak anlaşılıyor mu: adı "tarih" / "date" içeriyor ya da dolu hücrelerinden biri tarih / göreli ifade. */
    function tarihSutunuMu(s) {
      if (/tarih|date/i.test(kucuk(s.ad))) return true;
      return is.satirlar.some((r) => { const v = r.degerler[s.ad] ?? r.degerler[s.eskiAd]; return typeof v === 'string' && v.trim() !== '' && tarihDegeriCoz(v) !== null; });
    }
    function satirCiz(r, no) {
      const hedefte = hedefSatiriMi(r);
      const hucreler = is.sutunlar.map((s) => {
        const anahtar = s.eskiAd && s.eskiAd !== s.ad && !(s.ad in r.degerler) ? s.eskiAd : s.ad;
        const secim = s.tip === 'secim';
        // Hedef satırın beklenen boş hücresi vurgulanır (değer girilince vurgu kalkar).
        const bekleyen = hedefte && hedef.sutunlar.includes(s.ad) && !String(r.degerler[anahtar] ?? '').trim() && !(s.gizli && r.doluGizli.has(s.eskiAd || s.ad));
        const g = h('input', {
          type: s.gizli && !s.acik ? 'password' : 'text', value: secim ? secimGoster(r.degerler[anahtar]) : r.degerler[anahtar] ?? '', autocomplete: s.gizli ? 'new-password' : 'off',
          title: secim ? 'Değer — metin (ör. 34 — İSTANBUL)' : null,
          placeholder: s.gizli && !s.acik && r.doluGizli.has(s.eskiAd || s.ad) ? '•••• kayıtlı' : '', 'aria-label': `${no}. satır ${s.ad}`
        });
        g.addEventListener('input', () => { r.degerler[s.ad] = secim ? secimYaz(g.value) : g.value; if (anahtar !== s.ad) delete r.degerler[anahtar]; r.degisti = true; durumCiz(); });
        if (bekleyen) g.addEventListener('input', () => { g.closest('td')?.classList.toggle('veri-bekliyor-hucresi', !g.value.trim()); });
        // Tarih sütunu: hücreye sabit tarih ya da bugüne göre ifade ("bugün", "bugün+7", "ay sonu") yazılır; altında bugünkü karşılığı.
        if (!secim && !s.gizli && tarihSutunuMu(s)) {
          const onizleme = h('small', { class: 'tarih-hucre-onizleme', 'aria-live': 'polite' });
          const guncelle = () => { onizleme.textContent = tarihHucreOnizlemesi(g.value); };
          g.placeholder = g.placeholder || 'gg.aa.yyyy ya da bugün+7';
          g.title = 'Sabit tarih (gg.aa.yyyy) ya da bugüne göre: bugün, bugün+7, bugün-3, ay sonu, ay başı+1 — koşuda o günün tarihi yazılır';
          g.addEventListener('input', guncelle);
          guncelle();
          return h('td', { class: bekleyen ? 'veri-bekliyor-hucresi' : null }, h('div', { class: 'tarih-hucresi' }, g, onizleme));
        }
        return h('td', { class: bekleyen ? 'veri-bekliyor-hucresi' : null }, g);
      });
      const ortam = h('select', { 'aria-label': `${no}. satır ortamı` }, h('option', { value: '' }, 'Tümü'),
        ortamlar.map((o) => h('option', { value: o.id, selected: r.ortamId === o.id }, o.ad)));
      ortam.addEventListener('change', () => { r.ortamId = ortam.value || null; r.degisti = true; durumCiz(); });
      const adG = h('input', { type: 'text', value: r.ad, maxlength: '120', 'aria-label': `${no}. satır adı`, placeholder: is.baglam ? 'zorunlu' : '' });
      adG.addEventListener('input', () => { r.ad = adG.value; r.degisti = true; durumCiz(); });
      return h('tr', { class: [r.degisti ? 'degisti' : '', hedefte ? 'veri-bekliyor-satiri' : ''].join(' ').trim() || null }, h('td', { class: 'sira' }, String(no)), h('td', { class: 'satir-adi-sutunu' }, adG), hucreler, h('td', { class: 'ortam-sutunu' }, ortam),
        h('td', { class: 'eylem' }, h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${no}. satırı sil`, title: 'Satırı sil', onclick: () => {
          const i = is.satirlar.indexOf(r);
          if (i >= 0) is.satirlar.splice(i, 1);
          if (r.id) is.silinen.add(r.id);
          govdeCiz(); durumCiz();
        } }, ikon('carpi'))));
    }
    function govdeCiz() {
      const a = kucuk(ara);
      const eslesen = is.satirlar.map((r, i) => ({ r, no: i + 1 })).filter(({ r }) => !a || is.sutunlar.some((s) => !s.gizli && kucuk(secimGoster(r.degerler[s.ad] ?? r.degerler[s.eskiAd])).includes(a)) || kucuk(r.ad).includes(a));
      const gosterilen = eslesen.slice(0, gorunur);
      yerlestir(tablo, basCiz(), h('tbody', {},
        gosterilen.length ? gosterilen.map(({ r, no }) => satirCiz(r, no))
          : h('tr', {}, h('td', { colspan: String(is.sutunlar.length + 4), class: 'cok-soluk' }, is.satirlar.length ? 'Aramayla eşleşen satır yok.' : 'Satır yok. "+ Satır" ya da Excel / CSV ile ekleyin.'))));
      yerlestir(altBilgi, `${is.satirlar.length} satır${a ? ` · ${eslesen.length} eşleşiyor` : ''}`,
        eslesen.length > gosterilen.length ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { gorunur += GORUNUR_ADIM * 5; govdeCiz(); } },
          `${eslesen.length - gosterilen.length} satır daha göster`) : null);
    }

    yerlestir(sagKap, h('section', { class: 'kart tablo-duzenleyici', 'aria-label': 'Tablo düzenleyici' },
      h('div', { class: 'kart-basligi' }, adG, durum,
        h('span', { class: 'sag' },
          is.id ? h('button', { type: 'button', class: 'kucuk-dugme tehlike', onclick: () => tabloyuSil() }, ikon('cop'), 'Tabloyu sil') : null)),
      (() => { const k = is.id ? liste.find((x) => x.id === is.id)?.kaynak : null; return k && k.tur ? h('p', { class: 'kucuk soluk tablo-kaynagi' }, h('b', {}, 'Kaynak: '), kaynakMetni(k), ' — ekran paketinden içe aktarıldı (seçim alanlarının seçenekleri).') : null; })(),
      (turKutusu = turSecimi()),
      grupSecimi(),
      h('div', { class: 'tablo-arac-cubugu' },
        h('div', { class: 'arama-kutusu' }, ikon('ara'), aramaG),
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => dosya.click() }, ikon('yukle'), 'Excel / CSV yükle'), dosya,
        is.satirlar.length ? h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: async () => {
          if (!(await onayIste({ baslik: 'Tüm satırlar silinsin mi?', metin: `${is.satirlar.length} satır kaldırılır (Kaydet'e basınca kalıcı olur).`, dugme: 'Satırları kaldır', tehlikeli: true }))) return;
          for (const r of is.satirlar) if (r.id) is.silinen.add(r.id);
          is.satirlar = []; ciz();
        } }, 'Tüm satırları kaldır') : null),
      yapistirKutusu,
      yatayKaydirmaIpucu(h('div', { class: 'tablo-kaydirma veri-tablosu-kap', tabindex: '0', 'aria-label': 'Tablo (yana kaydırılabilir)' }, tablo), { sutunSecici: 'thead th.veri-sutunu' }), altBilgi, sutunDuyurusu,
      h('div', { class: 'dugmeler' }, geriAl, kaydetD)));
    govdeCiz();
    durumCiz();
  }

  ciz();
  // Hedef satır: görünür alana kaydırılır, ilk boş (vurgulu) hücreye odaklanılır.
  if (hedefSira >= 0) {
    const satir = sagKap.querySelector('tr.veri-bekliyor-satiri');
    if (satir) {
      // Sayfa başlığı odağı yerleştikten sonra (bir kare sonra) satıra kaydırılır ve ilk boş hücreye odaklanılır.
      requestAnimationFrame(() => setTimeout(() => {
        const s = sagKap.querySelector('tr.veri-bekliyor-satiri');
        if (!s || !s.isConnected) return;
        s.scrollIntoView({ block: 'center' });
        const ilk = s.querySelector('td.veri-bekliyor-hucresi input');
        if (ilk instanceof HTMLElement) ilk.focus({ preventScroll: true });
      }, 0));
      if (hedef.sutunlar.length) bildir(`Vurgulanan boş hücreleri (${hedef.sutunlar.join(', ')}) doldurup Kaydet'e basın; değer üretilmez.`);
    }
  } else if (hedef && is && is.id === hedef.tabloId) bildir('Bu satır tabloda artık yok: satırı ekleyip senaryonun beklediği değerleri girin.', 'uyari');
}

/**
 * Doğrudan satır adresi (#/veri/satir/<tabloId>/<satırId>?sutun=…): açılacak tablo, satır ve vurgulanacak sütunlar; değilse null.
 * @returns {{ tabloId: string; satirId: string; sutunlar: string[] } | null}
 */
function veriSatiriHedefi() {
  const [yol, sorgu = ''] = (location.hash || '').split('?');
  const p = yol.split('/');
  if (p[1] !== 'veri' || p[2] !== 'satir' || !p[3] || !p[4]) return null;
  try {
    return { tabloId: decodeURIComponent(p[3]), satirId: decodeURIComponent(p[4]), sutunlar: new URLSearchParams(sorgu).getAll('sutun') };
  } catch { return null; }
}
