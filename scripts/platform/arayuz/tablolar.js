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
import { onayIste } from './kosu-paneli.js';
import { tabloOku } from './parametre-tanimi-formu.js';

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
// tarama / akış kaydı) ya da tek sütunlu "<Ekran> — <Alan>" adlı tablolar ekran listesidir, diğerleri kişi ve kayıt verisi.
// Ekran listeleri ekran başına alt gruptur. Açık / kapalı durumu tarayıcıda (localStorage) hatırlanır.
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
 * @param {T[]} liste @returns {{ kayitlar: T[]; ekranlar: Map<string, T[]> }}
 */
export function tablolariGrupla(liste) {
  /** @type {T[]} */
  const kayitlar = [];
  /** @type {Map<string, T[]>} */
  const ekranlar = new Map();
  for (const t of liste) {
    const desen = AD_DESENI.exec(String(t.ad || ''));
    const tur = t.kaynak && t.kaynak.tabloTuru;
    const kaynakli = Boolean(t.kaynak && t.kaynak.tur);
    const ekranListesi = tur === 'liste' || (tur !== 'kayit' && (kaynakli || Boolean(desen && t.sutunlar.length === 1)));
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
        h('p', { class: 'soluk kucuk' }, 'Senaryoda tablodaki değer seçilir. ', h('b', {}, 'Sayfa değeri'), ': ekranda seçeneğin değeri farklıysa (ör. DÜNYA → 1) koşu seçeneği bununla seçer. ',
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

/**
 * @param {HTMLElement} govde @param {{ id: string }} proje
 */
export async function tablolarBolumu(govde, proje) {
  yerlestir(govde, iskelet('liste'));
  const [{ tablolar }, { ortamlar }] = await Promise.all([
    api(`/platform/tablolar?projeId=${q(proje.id)}&baglam=1`),
    api(`/platform/ortamlar?projeId=${q(proje.id)}`)
  ]);
  let liste = tablolar;
  if (!liste.some((t) => t.id === seciliId)) seciliId = liste[0]?.id || '';
  let is = liste.length ? kopya(liste.find((t) => t.id === seciliId)) : null;
  let ara = '';
  let gorunur = GORUNUR_ADIM;

  const solKap = h('div', {});
  const sagKap = h('div', {});
  yerlestir(govde,
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
  }, h('span', { class: 'tablo-adi' }, t.ad, t.baglam ? h('span', { class: 'rozet kucuk-rozet', title: 'Kullanıcı / şube değiştirme profilleri: senaryoda satır adıyla seçilir' }, 'bağlam') : null),
  h('small', {}, `${t.sutunlar.length} sütun · ${t.satirlar.length} satır`),
  t.kaynak && t.kaynak.tur ? h('small', { class: 'tablo-kaynagi', title: kaynakMetni(t.kaynak) }, `kaynak: ${KAYNAK_TURU[t.kaynak.tur] || t.kaynak.tur}`) : null);
  /** Açılır-kapanır grup (durum tarayıcıda hatırlanır; arama ya da seçili tablo varken açık). */
  const grupCiz = (anahtar, baslik, ogeler, sinif, zorlaAcik) => {
    const kapali = !zorlaAcik && tabloGrubuKapaliMi(anahtar);
    const icerikId = `tablo-grubu-${anahtar.replace(/[^a-z0-9-]/gi, '-')}-${++grupSayaci}`;
    const icerik = h('div', { class: 'tablo-grubu-icerik', id: icerikId, role: 'group', 'aria-label': baslik, hidden: kapali }, ogeler);
    const adet = ogeler.filter((o) => o.classList.contains('tablo-ogesi')).length
      + ogeler.reduce((t, o) => t + (o.classList.contains('tablo-grubu') ? Number(o.dataset.adet || 0) : 0), 0);
    const dugme = h('button', { type: 'button', class: 'tablo-grubu-baslik', 'aria-expanded': String(!kapali), 'aria-controls': icerikId },
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
    const { kayitlar, ekranlar } = tablolariGrupla(uyan);
    const seciliGrup = (tl) => tl.some((t) => t.id === seciliId);
    const ekranGruplari = [...ekranlar.entries()].map(([ekran, tl]) => grupCiz(`ekran:${ekran}`, ekran, tl.map(tabloDugmesi), 'alt-grup', Boolean(a) || seciliGrup(tl)));
    const ekranToplam = [...ekranlar.values()].flat();
    yerlestir(listeKap,
      !uyan.length ? h('p', { class: 'soluk kucuk tablo-grubu-bos' }, liste.length ? 'Aramayla eşleşen tablo yok.' : 'Henüz tablo yok.') : null,
      kayitlar.length || !a ? grupCiz('kayit', 'Kişi ve kayıt verileri', kayitlar.length ? kayitlar.map(tabloDugmesi) : [h('p', { class: 'soluk kucuk tablo-grubu-bos' }, 'Tablo yok.')], 'ust-grup', Boolean(a) || seciliGrup(kayitlar)) : null,
      ekranToplam.length ? grupCiz('ekran-listeleri', 'Ekran listeleri', ekranGruplari, 'ust-grup', Boolean(a) || seciliGrup(ekranToplam)) : null);
    if (!solKap.firstChild) {
      yerlestir(solKap, h('nav', { class: 'kart tablo-listesi', 'aria-label': 'Tablolar' },
        h('div', { class: 'arama-kutusu tablo-listesi-arama' }, ikon('ara'), listeAramaG),
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
    try {
      const { tablo } = await mesgulIken(dugme, 'Kaydediliyor…', () => api('/platform/tablo/kaydet', { govde }));
      const i = liste.findIndex((t) => t.id === tablo.id);
      liste = i >= 0 ? liste.map((t) => (t.id === tablo.id ? tablo : t)) : [...liste, tablo].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
      seciliId = tablo.id;
      is = kopya(tablo);
      bildir(`"${tablo.ad}" kaydedildi.`);
      ciz();
    } catch (e) { bildir(e.message, 'hata'); }
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
          return h('th', { scope: 'col' }, h('div', { class: 'sutun-basligi' }, g,
            is.baglam ? null : h('label', { class: 'gizli-secimi', title: 'Gizli: değer ekranda hiç gösterilmez (parola vb.); koşuda satırdan gelir.' }, gizli, ikon('kilit')),
            is.baglam || s.gizli ? null : karsilikDugmesi(s, i),
            is.sutunlar.length > 1 ? h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${i + 1}. sütunu sil`, title: 'Sütunu sil', onclick: () => {
              is.sutunlar.splice(i, 1); is.degisti = true; ciz();
            } }, ikon('carpi')) : null));
        }),
        h('th', { scope: 'col', class: 'ortam-sutunu', title: 'Satırın geçerli olduğu ortam (Tümü: her ortamda)' }, 'Ortam'),
        h('th', { scope: 'col', class: 'eylem' }, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
          is.sutunlar.push({ ad: `Sütun ${is.sutunlar.length + 1}`, eskiAd: null, gizli: false }); is.degisti = true; ciz();
        } }, ikon('arti'), 'Sütun'))));
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
        type: 'button', class: `ikon-dugme hayalet karsilik-dugmesi${n ? ' dolu' : ''}`, 'aria-label': `${i + 1}. sütunun karşılıkları${n ? ` (${n})` : ''}`,
        title: n ? `Karşılıklar: ${n} değerin sayfa / servis değeri tanımlı` : 'Karşılıklar: değerin sayfada ve serviste farklı karşılığı (ör. DÜNYA → 1)',
        onclick: async () => {
          const yeni = await karsilikPenceresi(s, sutunDegerleri(s));
          if (!yeni) return;
          if (JSON.stringify(yeni) === JSON.stringify(s.karsiliklar || {})) return;
          s.karsiliklar = yeni; is.degisti = true; ciz();
        }
      }, ikon('ok'), n ? h('span', { class: 'karsilik-sayisi' }, String(n)) : null);
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
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
          is.satirlar.push({ id: undefined, ad: '', ortamId: null, degerler: {}, doluGizli: new Set(), degisti: true });
          ara = ''; aramaG.value = ''; gorunur = Math.max(gorunur, is.satirlar.length); govdeCiz(); durumCiz();
          tablo.querySelector('tbody tr:last-child input')?.focus();
        } }, ikon('arti'), 'Satır'),
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
