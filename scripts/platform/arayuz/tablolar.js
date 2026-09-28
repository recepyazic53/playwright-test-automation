// TEST VERİSİ TABLOLARI (Ayarlar > Test verisi > Tablolar). Test verisi Excel sayfaları gibidir: sütunlar alan, her satır
// birlikte geçerli bir değer kombinasyonu (ör. Servis girişi: Kanal | Kullanıcı | Parola). Ekran input'ları ve servis
// parametreleri bir sütuna bağlanır; senaryoda seçtikçe aynı tablodaki listeler satırlardan süzülür (koşul tanımı yok).
//   · Sol: tablolar (sütun / satır sayısı) + "Yeni tablo".
//   · Sağ: düzenlenebilir ızgara — sütun adı / gizli / sil, satır hücreleri, Ortam (Tümü / ortam), satır sil; arama;
//     Excel / CSV yükle ve yapıştır (ilk satır sütun adlarıyla eşleşirse başlık sayılır, yeni başlıklar sütun olur).
//   · Gizli sütun (parola vb.) değerleri sunucudan hiç gelmez; boş bırakılan gizli hücre kayıtlı değeri korur.
//   · Sütun başlığındaki "Karşılıklar": sütundaki her değerin sayfadaki (seçenek değeri) ve servisteki karşılığı. Ekran koşusu
//     seçeneği sayfa değeriyle seçer, servise servis değeri gider; boşsa tablodaki değer kullanılır.
//   · Kaydet yalnız değişen satırları gönderir. Kaydedilmemiş değişiklik varken başka tabloya geçmek onay ister.
import { api, bildir, bosDurum, h, ikon, iskelet, mesgulIken, yerlestir } from './ortak.js';
import { onayIste, secenekIste } from './kosu-paneli.js';
import { tabloOku } from './parametre-tanimi-formu.js';
import { veriSagligiKarti } from './veri-sagligi.js';
import { baslikNormal } from './tablo-benzerligi.mjs';

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
    sutunlar: t ? t.sutunlar.map((s) => ({ ad: s.ad, eskiAd: s.ad, gizli: s.gizli, tip: s.tip, karsiliklar: { ...(s.karsiliklar || {}) } }))
      : [{ ad: 'Değer', eskiAd: null, gizli: false, tip: 'metin', karsiliklar: {} }],
    satirlar: t ? t.satirlar.map((r) => ({ id: r.id, ad: r.ad || '', ortamId: r.ortamId, degerler: { ...r.degerler }, doluGizli: new Set(r.doluGizli), degisti: false })) : [],
    silinen: new Set(), degisti: !t, baglam: Boolean(t && t.baglam)
  };
}

/** Sayfa paketinden içe aktarılan tablonun kaynağı: "Akış kaydı · “Ekran” · 27.09.2026 10:30". */
const KAYNAK_TURU = { paket: 'Sayfa paketi', tarama: 'Otomatik tarama', kayit: 'Akış kaydı' };
function kaynakMetni(k) {
  if (!k || !k.tur) return '';
  const z = Date.parse(k.yazilma || k.olusturulma || '');
  return [KAYNAK_TURU[k.tur] || k.tur, k.ekran ? `“${k.ekran}”` : '', Number.isNaN(z) ? '' : new Date(z).toLocaleString('tr-TR')].filter(Boolean).join(' · ');
}

// --- Liste grupları (yalnız görünüm; veri değişmez) ---------------------------------------------------------------------
// Ölçüt önce TABLO TÜRÜdür (kaynak.tabloTuru: paketin testVerisi.tablolar[].tur; tarama / akış kaydı tabloları "liste"):
// "kayit" → "Kişi ve kayıt verileri", "liste" → "Ekran listeleri". Tür yoksa (eski kayıtlar) sezgi: kaynağı olan (sayfa paketi /
// tarama / akış kaydı) tablolar ile "<Ekran> — <Alan…>" adlı tablolardan tek sütunlu olanlar, bir ekranın alan bağlarında
// kullanılanlar ya da "<Ekran>" kısmı projedeki bir ekranın adı olanlar (çok sütunlu bağımlı listeler dahil) ekran listesidir;
// diğerleri kişi ve kayıt verisi. Ekran listeleri ekran başına alt gruptur. Açık / kapalı durumu tarayıcıda (localStorage) hatırlanır.
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
 * @template {{ ad: string; baglam?: boolean; sutunlar: unknown[]; kaynak?: { tur?: string; ekran?: string; tabloTuru?: string } | null }} T
 * @param {T[]} liste
 * @param {{ ekranAdlari?: string[]; ekranKullanimi?: Record<string, string[]> }} [ek] projedeki ekran adları ve tablo kimliği →
 *   alan bağlarında kullanan ekranlar (sunucu: /platform/tablolar?baglam=1)
 * @returns {{ kayitlar: T[]; ekranlar: Map<string, T[]> }}
 */
export function tablolariGrupla(liste, ek = {}) {
  const ekranAdlari = new Set((ek.ekranAdlari || []).map(kucuk));
  const kullanim = ek.ekranKullanimi || {};
  /** "<Ekran> (akış)" gibi sondaki parantezli ek atılarak da ekran adıyla karşılaştırılır. @param {string} onEk */
  const ekranAdiMi = (onEk) => ekranAdlari.has(kucuk(onEk)) || ekranAdlari.has(kucuk(onEk.replace(/\s*\([^)]*\)\s*$/, '')));
  /** @type {T[]} */
  const kayitlar = [];
  /** @type {Map<string, T[]>} */
  const ekranlar = new Map();
  for (const t of liste) {
    const desen = AD_DESENI.exec(String(t.ad || ''));
    const tur = t.kaynak && t.kaynak.tabloTuru;
    const kaynakli = Boolean(t.kaynak && t.kaynak.tur);
    const bagli = Boolean(/** @type {any} */ (t).id && kullanim[/** @type {any} */ (t).id]?.length);
    const ekranListesi = tur === 'liste' || (tur !== 'kayit' && (kaynakli || Boolean(desen && (t.sutunlar.length === 1 || bagli || ekranAdiMi(desen[1].trim())))));
    if (t.baglam || !ekranListesi) { kayitlar.push(t); continue; }
    const ekran = (t.kaynak && t.kaynak.ekran) || (desen ? desen[1].trim() : '') || 'Diğer ekranlar';
    if (!ekranlar.has(ekran)) ekranlar.set(ekran, []);
    /** @type {T[]} */ (ekranlar.get(ekran)).push(t);
  }
  return { kayitlar, ekranlar: new Map([...ekranlar.entries()].sort(([a], [b]) => a.localeCompare(b, 'tr'))) };
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
    const tamam = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Tamam');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const diyalog = h('dialog', { class: 'onay-diyalogu karsilik-diyalogu', 'aria-labelledby': 'karsilik-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'karsilik-basligi' }, `"${s.ad}" değerlerinin karşılıkları`),
        h('p', { class: 'soluk kucuk' }, 'Senaryoda tablodaki değer seçilir. ', h('b', {}, 'Sayfa değeri'), ': ekranda seçeneğin değeri farklıysa (ör. EKSPRES → 1) koşu seçeneği bununla seçer. ',
          h('b', {}, 'Servis değeri'), ': servis gövdesine yazılacak değer. Boş bırakılırsa tablodaki değer kullanılır.'),
        h('div', { class: 'arama-kutusu' }, ikon('ara'), aramaG),
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
 */
export async function tablolarBolumu(govde, proje) {
  yerlestir(govde, iskelet('liste'));
  const [{ tablolar, ekranAdlari, ekranKullanimi }, { ortamlar }, saglikVerisi] = await Promise.all([
    api(`/platform/tablolar?projeId=${q(proje.id)}&baglam=1`),
    api(`/platform/ortamlar?projeId=${q(proje.id)}`),
    api(`/platform/tablolar/veri-sagligi?projeId=${q(proje.id)}`).catch(() => null)
  ]);
  let liste = tablolar;
  const grupBilgisi = { ekranAdlari: ekranAdlari || [], ekranKullanimi: ekranKullanimi || {} };
  if (!liste.some((t) => t.id === seciliId)) seciliId = liste[0]?.id || '';
  let is = liste.length ? kopya(liste.find((t) => t.id === seciliId)) : null;
  let ara = '';
  let gorunur = GORUNUR_ADIM;

  const solKap = h('div', {});
  const sagKap = h('div', {});
  // Veri sağlığı (benzer / kullanılmayan tablolar, boş sütunlar, kırık başvurular; birleştirme ve geri alma): veri-sagligi.js.
  const saglik = veriSagligiKarti(proje, {
    veri: Promise.resolve(saglikVerisi),
    tablolar: () => liste,
    yenile: () => { tablolarBolumu(govde, proje); },
    secTablo: async (id) => {
      const t = liste.find((x) => x.id === id);
      if (!t || (t.id === seciliId && is?.id)) { sagKap.scrollIntoView({ block: 'start' }); return; }
      if (!(await gecebilirMi())) return;
      seciliId = t.id; is = kopya(t); ara = ''; gorunur = GORUNUR_ADIM; ciz();
      sagKap.scrollIntoView({ block: 'start' });
    }
  });
  yerlestir(govde, saglik,
    h('p', { class: 'not-kutusu bilgi kucuk' }, h('b', {}, 'Her tablo bir Excel sayfası gibidir. '),
      'Sütunlar alanlardır; her satır birlikte geçerli bir değer kombinasyonudur (ör. Kanal | Kullanıcı | Parola). Ekran input\'larını ve servis parametrelerini sütunlara bağladığınızda senaryoda seçtikçe diğer listeler satırlardan süzülür; koşul tanımlamazsınız. Tek sütunlu tablo düz bir değer listesidir.'),
    h('div', { class: 'tablo-duzeni' }, solKap, sagKap));

  const degistiMi = () => Boolean(is && (is.degisti || is.silinen.size || is.satirlar.some((r) => r.degisti)));
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
    const uyan = liste.filter((t) => !a || kucuk(t.ad).includes(a) || kucuk(t.kaynak?.ekran).includes(a));
    const { kayitlar, ekranlar } = tablolariGrupla(uyan, grupBilgisi);
    const seciliGrup = (tl) => tl.some((t) => t.id === seciliId);
    const ekranGruplari = [...ekranlar.entries()].map(([ekran, tl]) => grupCiz(`ekran:${ekran}`, ekran, tl.map(tabloDugmesi), 'alt-grup', Boolean(a) || seciliGrup(tl)));
    const ekranToplam = [...ekranlar.values()].flat();
    // Boş grup başlığı gösterilmez (grup silinebilir bir öğe değildir); hiç tablo yokken tek boş durum mesajı sağ paneldedir.
    listeAramaG.closest('.tablo-listesi-arama')?.toggleAttribute('hidden', !liste.length);
    yerlestir(listeKap,
      liste.length && !uyan.length ? h('p', { class: 'soluk kucuk tablo-grubu-bos' }, 'Aramayla eşleşen tablo yok.') : null,
      kayitlar.length ? grupCiz('kayit', 'Kişi ve kayıt verileri', kayitlar.map(tabloDugmesi), 'ust-grup', Boolean(a) || seciliGrup(kayitlar)) : null,
      ekranToplam.length ? grupCiz('ekran-listeleri', 'Ekran listeleri', ekranGruplari, 'ust-grup', Boolean(a) || seciliGrup(ekranToplam)) : null);
    if (!solKap.firstChild) {
      yerlestir(solKap, h('nav', { class: 'kart tablo-listesi', 'aria-label': 'Tablolar' },
        h('div', { class: 'arama-kutusu tablo-listesi-arama', hidden: !liste.length }, ikon('ara'), listeAramaG),
        listeKap,
        h('button', { type: 'button', class: 'kucuk-dugme yeni-tablo', onclick: async () => { if (!(await gecebilirMi())) return; seciliId = ''; is = kopya(null); ciz(); } },
          ikon('arti'), 'Yeni tablo')));
    }
  }

  function ciz() {
    solCiz();
    if (!is) {
      yerlestir(sagKap, h('section', { class: 'kart' }, bosDurum('Henüz tablo yok.', 'Yeni tablo ekleyin ya da Excel / CSV dosyasından yükleyin.', {
        ikon: 'liste', eylem: h('button', { type: 'button', class: 'birincil', onclick: () => { is = kopya(null); ciz(); } }, ikon('arti'), 'Yeni tablo')
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
    const baslikMi = bosTablo || ilk.some((x) => mevcutAdlar.includes(kucuk(x)));
    /** @type {number[]} dosya sütunu → tablo sütunu */
    let eslem;
    let veri = dolu;
    if (baslikMi) {
      veri = dolu.slice(1);
      if (bosTablo) is.sutunlar = [];
      eslem = ilk.map((b, i) => {
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
      eslem.forEach((k, i) => { if (k >= 0 && is.sutunlar[k]) degerler[is.sutunlar[k].ad] = r[i] ?? ''; });
      is.satirlar.push({ id: undefined, ad: '', ortamId: null, degerler, doluGizli: new Set(), degisti: true });
    }
    bildir(`${veri.length} satır eklendi${baslikMi ? ' (ilk satır sütun adı sayıldı)' : ''}. Kaydetmeyi unutmayın.`);
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
      silinenSatirlar: [...is.silinen]
    };
    // Var olan tabloda önce etki denetlenir: değişen değeri düz metin olarak kullanan senaryo varsa sunucu hiçbir şey yazmaz ve
    // onay ister (tablo-etkisi.mjs); yoksa doğrudan kaydeder.
    const denetle = Boolean(is.id) && !is.baglam;
    // Önleme: yeni tablo kaydedilmeden önce başlıkları aynı (esnek) tablo varsa "onu kullan / yine de yeni oluştur" sorulur.
    if (!is.id && !is.baglam) {
      let benzerler = [];
      try { benzerler = (await api('/platform/tablo/benzer', { govde: { projeId: proje.id, sutunlar: adlar, ad: is.ad.trim() } })).benzerler; } catch { benzerler = []; }
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
    adG.addEventListener('input', () => { is.ad = adG.value; is.degisti = true; durumCiz(); });
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
    const yapistirG = h('textarea', { rows: '4', placeholder: 'Excel\'den satırları kopyalayıp buraya yapıştırın. İlk satır sütun adlarıysa başlık sayılır.', 'aria-label': 'Yapıştırılacak satırlar' });
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

    const tablo = h('table', { class: 'veri-tablosu' });
    const altBilgi = h('div', { class: 'kucuk soluk tablo-alt-bilgi' });
    function basCiz() {
      return h('thead', {}, h('tr', {},
        h('th', { class: 'sira', scope: 'col' }, '#'),
        h('th', { scope: 'col', class: 'satir-adi-sutunu', title: is.baglam ? 'Senaryoda bu adla seçilir (zorunlu)' : 'Senaryoda satırı adıyla seçmek için (ör. tc1); boşsa değerlerden üretilir' }, is.baglam ? 'Satır adı *' : 'Satır adı'),
        is.sutunlar.map((s, i) => {
          const g = h('input', { type: 'text', value: s.ad, maxlength: '60', 'aria-label': `${i + 1}. sütunun adı` });
          g.addEventListener('input', () => { s.ad = g.value; is.degisti = true; durumCiz(); });
          const gizli = h('input', { type: 'checkbox', checked: s.gizli, 'aria-label': `${i + 1}. sütun gizli` });
          gizli.addEventListener('change', () => { s.gizli = gizli.checked; is.degisti = true; ciz(); });
          return h('th', { scope: 'col', class: 'veri-sutunu' }, h('div', { class: 'sutun-basligi' },
            h('div', { class: 'sutun-basligi-ust' }, g,
              is.sutunlar.length > 1 ? h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${i + 1}. sütunu sil`, title: 'Sütunu sil', onclick: () => {
                is.sutunlar.splice(i, 1); is.degisti = true; ciz();
              } }, ikon('carpi')) : null),
            is.baglam ? null : h('div', { class: 'sutun-basligi-alt' },
              h('label', { class: 'gizli-secimi', title: 'Gizli: değer ekranda hiç gösterilmez (parola vb.); koşuda satırdan gelir.' }, gizli, ikon('kilit'), h('span', {}, 'Gizli')),
              s.gizli ? null : karsilikDugmesi(s, i))));
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
        type: 'button', class: `kucuk-dugme hayalet karsilik-dugmesi${n ? ' dolu' : ''}`, 'aria-label': `${i + 1}. sütunun karşılıkları${n ? ` (${n})` : ''}`,
        title: n ? `Karşılıklar: ${n} değerin sayfa / servis değeri tanımlı` : 'Karşılıklar: değerin sayfada ve serviste farklı karşılığı (ör. EKSPRES → 1)',
        onclick: async () => {
          const yeni = await karsilikPenceresi(s, sutunDegerleri(s));
          if (!yeni) return;
          if (JSON.stringify(yeni) === JSON.stringify(s.karsiliklar || {})) return;
          s.karsiliklar = yeni; is.degisti = true; ciz();
        }
      }, ikon('esle'), h('span', { class: 'karsilik-metni' }, 'Karşılıklar'), n ? h('span', { class: 'karsilik-sayisi' }, String(n)) : null);
    }
    function satirCiz(r, no) {
      const hucreler = is.sutunlar.map((s) => {
        const anahtar = s.eskiAd && s.eskiAd !== s.ad && !(s.ad in r.degerler) ? s.eskiAd : s.ad;
        const secim = s.tip === 'secim';
        const g = h('input', {
          type: s.gizli ? 'password' : 'text', value: secim ? secimGoster(r.degerler[anahtar]) : r.degerler[anahtar] ?? '', autocomplete: s.gizli ? 'new-password' : 'off',
          title: secim ? 'Değer — metin (ör. 34 — İSTANBUL)' : null,
          placeholder: s.gizli && r.doluGizli.has(s.eskiAd || s.ad) ? '•••• kayıtlı' : '', 'aria-label': `${no}. satır ${s.ad}`
        });
        g.addEventListener('input', () => { r.degerler[s.ad] = secim ? secimYaz(g.value) : g.value; if (anahtar !== s.ad) delete r.degerler[anahtar]; r.degisti = true; durumCiz(); });
        return h('td', {}, g);
      });
      const ortam = h('select', { 'aria-label': `${no}. satır ortamı` }, h('option', { value: '' }, 'Tümü'),
        ortamlar.map((o) => h('option', { value: o.id, selected: r.ortamId === o.id }, o.ad)));
      ortam.addEventListener('change', () => { r.ortamId = ortam.value || null; r.degisti = true; durumCiz(); });
      const adG = h('input', { type: 'text', value: r.ad, maxlength: '120', 'aria-label': `${no}. satır adı`, placeholder: is.baglam ? 'zorunlu' : '' });
      adG.addEventListener('input', () => { r.ad = adG.value; r.degisti = true; durumCiz(); });
      return h('tr', { class: r.degisti ? 'degisti' : null }, h('td', { class: 'sira' }, String(no)), h('td', { class: 'satir-adi-sutunu' }, adG), hucreler, h('td', { class: 'ortam-sutunu' }, ortam),
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
      (() => { const k = is.id ? liste.find((x) => x.id === is.id)?.kaynak : null; return k && k.tur ? h('p', { class: 'kucuk soluk tablo-kaynagi' }, h('b', {}, 'Kaynak: '), kaynakMetni(k), ' — sayfa paketinden içe aktarıldı (seçim alanlarının seçenekleri).') : null; })(),
      h('div', { class: 'tablo-arac-cubugu' },
        h('div', { class: 'arama-kutusu' }, ikon('ara'), aramaG),
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => dosya.click() }, ikon('yukle'), 'Excel / CSV yükle'), dosya,
        is.satirlar.length ? h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: async () => {
          if (!(await onayIste({ baslik: 'Tüm satırlar silinsin mi?', metin: `${is.satirlar.length} satır kaldırılır (Kaydet'e basınca kalıcı olur).`, dugme: 'Satırları kaldır', tehlikeli: true }))) return;
          for (const r of is.satirlar) if (r.id) is.silinen.add(r.id);
          is.satirlar = []; ciz();
        } }, 'Tüm satırları kaldır') : null),
      yapistirKutusu,
      h('div', { class: 'tablo-kaydirma veri-tablosu-kap' }, tablo), altBilgi,
      h('div', { class: 'dugmeler' }, geriAl, kaydetD)));
    govdeCiz();
    durumCiz();
  }

  ciz();
}
