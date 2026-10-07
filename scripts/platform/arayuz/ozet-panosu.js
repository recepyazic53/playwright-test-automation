// ÖZET PANOSU (Sonuçlar > Genel > Özet). SERBEST IZGARA: her kartın 12 sütunlu ızgarada konumu ve boyutu vardır ({ x, y, w, h };
// satır birimi SATIR_BIRIMI px). Düzen PROJE BAŞINA kasada saklanır (GET /platform/pano, POST /platform/pano/kaydet;
// sonuclar/ozet-panosu.mjs). Varsayılan düzen bugünkü Özet'tir. Düzen kuralları (konum, en küçük boyut, çakışmasızlık, aşağı itme,
// göç, kart türleri) sunucuyla ORTAK saf modüldedir (pano-duzeni.mjs); bu dosya yalnız çizer ve kullanıcı etkileşimini modele çevirir.
//   "Panoyu düzenle" → düzenleme kipi: her kartın üstünde tutamak (⠿; sürükle-bırak — bırakılacak hücre gölgeyle gösterilir, kart
//   istenen boş yere bırakılabilir, üstünde / yanında boşluk kalabilir; değdiği kartlar aşağı itilir), sağ alt köşede boyut tutamağı
//   (genişlik + yükseklik birim birim; komşu kartların boyu değişmez), ↑ / ↓ düğmeleri (okuma sırasında bir öne / sonraya), Düzenle
//   (kullanıcı kartı) ve Kaldır (×). Klavye: tutamak odaktayken oklar konumu, Shift + oklar boyutu değiştirir; köşe tutamağında oklar
//   boyutu. Dar ekranda (≤ 860 px) kartlar okuma sırasıyla (y, sonra x) tek sütunda dizilir; düzenleme sıra (↑ ↓) ve yükseklikle sınırlı.
//   Üstte "Kart ekle", "Varsayılana dön", "Vazgeç", "Bitti". Değişiklikler "Bitti"ye basınca kaydedilir; "Vazgeç" kayıtlı düzene döner.
//   Eski (sıralı) düzen ilk açılışta ızgaraya çevrilip bir kez kaydedilir (sunucu "goc" bildirir).
//   Kart türleri: yerleşik (sonuc-ozeti.js üretir), SQL sorgusu, Nöbetçi verisi (hazır şablonlar), metin ve bağlantılar.
// SQL KARTI: sorgu YALNIZ "Yenile"ye basınca çalışır (sayfa açılınca ya da aralıklı çalışmaz); kartın üstünde "Son veri: gg.aa.yyyy
//   ss:dd" (hiç alınmadıysa "Henüz yenilenmedi"). Son (maskeli) sonuç sunucuda önbellektedir. CANLI ortama ait bağlantıda ilk "Yenile"
//   standart CANLI penceresini açar (ortak.js > api); onay bu oturumda o kart için hatırlanır.
//   Görünümler: tek sayı, yüzde / oran (hedef çubuğu ya da ibre), sayı + değişim (önceki YENİLEMEYE göre; önbellekteki maskeli ilk
//   satırdan), tablo, liste, durum kutucukları, çubuk, çizgi, pasta / halka (en çok 8 dilim + "Diğer"). Biçim (ondalık, ön / son ek,
//   tarih, oran) ve eşik kuralı pano-duzeni.mjs'de (saf). Grafikler SVG özniteliğiyle çizilir (satır içi stil yok).
// DOM'a yalnız metin yazılır (h(); innerHTML yok); bağlantılar yalnız Nöbetçi içi adreslere (#/…) gider.
import { api, bildir, canliOnayPenceresi, degisiklikleriBirak, alan, h, ikon, kayitIzi, mesgulIken, rozet, s, yatayKaydirmaIpucu, yeniKimlik, yerlestir } from './ortak.js';
import {
  ESIK_ISLECLERI, ESIK_RENKLERI, EN_COK_BAGLANTI, EN_COK_ESIK, GOSTERGE_SECENEKLERI, IC_SAYFALAR, LISTE_EN_COK, ONDALIK_SECENEKLERI,
  ORAN_SECENEKLERI, OZEL_KART_TURLERI, SQL_GORUNUMLERI, TARIH_BICIMLERI, VERI_SABLONLARI, IZGARA_BOSLUK, IZGARA_SUTUN, SATIR_BIRIMI,
  gorunurYerlesim, kartSiraTasi, kartYerlestir, okumaSirasinaDiz, satirPikseli,
  bicimTemizle, degisimHesapla, eksikYerlesikler, esikRengi, hucreBicimle, kartAdi, kartAyarla, kartEkle, kartKaldir, kartTemizle,
  SUTUN_GENISLIGI, gorunenSutunlar, satirlariSirala, sutunGorunurlugu, sutunTasi, pastaDilimleri, sayiBicimle, sayiyaCevir, turAdi, varsayilanDuzen, varsayilanMi, yerlesikMi, yuzdeBicimle, yuzdeDegeri,
  donemMetni, donemTemizle, kartDonemle, kartDonemliMi, SQL_ZAMAN_ASIMI_SN, sqlZamanAsimiTemizle,
  EN_COK_KART_PARAMETRESI, kartParametreDegeri, kartParametrele, kartParametreleri,
  EN_COK_SUTUN_BICIMI, ROZET_RENKLERI, SUTUN_BICIM_TURLERI, esikleriOku, hucreSunumu, rozetKurallariniOku, KART_SIMGELERI, ikinciDeger,
  OTOMATIK_YENILEME_DK, etkinHedef, parametreyleDegisenler
} from './pano-duzeni.mjs';
import { SONUC_ARALIGI, tarihAraligiSecici } from './tarih-araligi.js';
import { durumOner, govdeGibiMi, govdeKokAdi, KESILDI_EKI, metinKisalt, metniBicimle, metotOner, satirZamani, uzunMetinMi } from './buyuk-metin.mjs';
import { oranSaglikSinifi } from './sonuclar.js';

const SQL_UCU = '/platform/pano/sql/yenile';
const INCELE_UCU = '/platform/pano/sql/incele';
/** Dar ekran (tek sütun; stil-ozet-panosu.css ile aynı eşik). */
const DAR_EKRAN = '(max-width: 860px)';
const darEkran = () => window.matchMedia(DAR_EKRAN).matches;
/** Liste kartında görünen en çok madde. */
const LISTE_ILK = 10;
/** Tablo uzun metin hücresinin önizlemesinde en çok karakter (sütun genişliğinde "…" ile kesilir; tamamı "Görüntüle"de). */
const ONIZLEME_EN_COK = 1000;
/** Tablonun "İşlem" (İncele) sütununun genişliği (px). */
const ISLEM_SUTUNU_PX = 100;
/** CANLI onayı verilmiş SQL kartları (bu sayfa oturumunda; kart hedefi / sorgusu değişince yeniden sorulur). @type {Set<string>} */
const canliOnaylari = new Set();

/** @param {unknown} v */
const kopya = (v) => JSON.parse(JSON.stringify(v));

/**
 * Sayfanın kaydırma konumunu korur: fn içinde yeniden çizim / ölçüm sayfayı bir an kısaltıp tarayıcının konumu yukarı çekmesine
 * yol açarsa konum geri yüklenir.
 * @template T @param {() => T} fn @returns {T}
 */
function kaydirmayiKoru(fn) {
  const x = window.scrollX; const y = window.scrollY;
  try { return fn(); } finally { if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y); }
}

/**
 * Yeniden çizimden sonra odağı geri verir: öğe görünüyorsa sayfa kaydırılmaz; görünmüyorsa (ör. kart klavyeyle başka sıraya taşındı)
 * tarayıcının odak davranışı gibi ortalanır. @param {HTMLElement} el
 */
function odakla(el) {
  el.focus({ preventScroll: true });
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', inline: 'nearest' });
}

/**
 * Kart öğesinin imzası: tür, ayar, dönem ve seçili parametreler; tıklaması başka karta bağlı kutucuk kartında hedefin seçili değeri
 * (seçili kutucuk işareti). Değişince kart yeniden kurulur. @param {any} k @param {{ kartlar: any[] } | null} [duzen]
 */
const kartImzasi = (k, duzen = null) => {
  const t = k.ayar?.tiklama;
  const hedef = t && duzen ? duzen.kartlar.find((x) => x.id === t.kartId) : null;
  return `${k.tur}:${JSON.stringify(k.ayar ?? null)}:${JSON.stringify(k.donem ?? null)}:${JSON.stringify(k.parametreDegerleri ?? null)}`
    + (hedef ? `:${kartParametreDegeri(hedef, t.parametre) ?? ''}` : '')
    // Panonun ortamı: mantıksal veritabanına bağlı kartın hedef rozeti ve sonucu ortama göre.
    + (k.ayar?.hedef?.veritabaniId ? `:o=${duzen?.ortamId ?? ''}` : '');
};

/**
 * Eski düzenden göç: dönem seçimi olmayan döneme bağlı kartın başlangıç dönemi, eski GENEL seçimdir (oturumda seçilmişse); seçilmemişse
 * eski varsayılan "Tümü" (Özet'te son 30 gün). @returns {object}
 */
function gocDonemi() {
  let ham = null;
  try { ham = JSON.parse(sessionStorage.getItem(SONUC_ARALIGI) || 'null'); } catch { ham = null; }
  if (ham && typeof ham === 'object' && !ham.hizli && (ham.baslangic || ham.bitis)) {
    ham = { baslangic: ham.baslangic || new Date(0).toISOString(), bitis: ham.bitis || new Date().toISOString() };
  }
  return donemTemizle(ham) ?? { hizli: 'tumu' };
}

/** Kaydırma kutularının (tablo, liste) konumları; ölçüm / yeniden çizimden sonra geri yüklenir. @param {ParentNode} kok */
function icKaydirmalar(kok) {
  const l = /** @type {HTMLElement[]} */ ([...kok.querySelectorAll('.tablo-kaydirma, .pano-liste, .pano-icerik > .kart')])
    .filter((e) => e.scrollLeft || e.scrollTop).map((e) => /** @type {[HTMLElement, number, number]} */ ([e, e.scrollLeft, e.scrollTop]));
  return () => { for (const [e, sl, st] of l) { if (e.scrollLeft !== sl) e.scrollLeft = sl; if (e.scrollTop !== st) e.scrollTop = st; } };
}

/**
 * Kabın çocuklarını verilen sıraya getirir; zaten yerinde olan öğe yerinden oynatılmaz (DOM'dan çıkan kaydırma kutusu konumunu
 * kaybeder ve kart yeniden çizilmiş gibi görünür). @param {HTMLElement} kap @param {HTMLElement[]} liste
 */
function cocuklariEsitle(kap, liste) {
  const istenen = new Set(liste);
  for (const c of [...kap.children]) if (!istenen.has(/** @type {HTMLElement} */ (c))) c.remove();
  liste.forEach((el, i) => { const yer = kap.children[i] ?? null; if (yer !== el) kap.insertBefore(el, yer); });
}
/** @param {number} n */
const iki = (n) => String(n).padStart(2, '0');
/** "02.10.2026 14:35" (yerel saat). @param {string} iso */
export function sonVeriMetni(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  return `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()} ${iki(t.getHours())}:${iki(t.getMinutes())}`;
}

/**
 * Panoyu kurar.
 * @param {HTMLElement} kap
 * @param {{ proje: { id: string; ad: string }; yerlesik: Record<string, () => HTMLElement>; eylemler: HTMLElement; altAdres: string }} s0
 */
export function ozetPanosu(kap, s0) {
  const { proje, yerlesik, eylemler } = s0;
  /** @type {{ duzen: any; sqlSonuclari: Record<string, any> }} */
  let kayitli = { duzen: varsayilanDuzen(), sqlSonuclari: {} };
  /** @type {any} */
  let calisan = null;
  let duzenleniyor = false;
  /** @type {Map<string, { sar: HTMLElement; icerik: HTMLElement; imza: string }>} */
  const ogeler = new Map();
  /** @type {Promise<any> | null} */
  let secenekSozu = null;
  const secenekler = () => {
    secenekSozu ??= api(`/platform/pano/secenekler?projeId=${encodeURIComponent(proje.id)}`).catch((e) => { secenekSozu = null; throw e; });
    return secenekSozu;
  };

  const duyuru = h('div', { class: 'gorunmez', 'aria-live': 'polite', role: 'status' });
  const duyur = (m) => { duyuru.textContent = ''; requestAnimationFrame(() => { duyuru.textContent = m; }); };
  const pano = h('div', { class: 'ozet-panosu', role: 'list', 'aria-label': 'Özet panosu' });
  const yardimId = yeniKimlik('pano-yardim');
  const cubuk = h('div', { class: 'pano-duzen-cubugu', hidden: true, role: 'region', 'aria-label': 'Pano düzenleme' });
  const bosNot = h('div', { class: 'pano-bos', hidden: true });
  // ---- Üst şerit: başlık / açıklama, ortam, tüm kartların dönemi, otomatik yenileme, Tümünü yenile, son güncelleme ----------------
  /** Kart kimliği → kartı yenileyen işlev (sqlKarti kaydeder). @type {Map<string, () => Promise<void>>} */
  const yenileyiciler = new Map();
  /** CANLI onayının anahtarı: kart + etkin hedef (pano ortamı dahil) + sorgu; bu oturumda hatırlanır. @param {any} k */
  const onayAnahtari = (k) => `${proje.id}:${k.id}:${JSON.stringify([etkinHedef(k, kayitli.duzen), k.ayar.sorgu])}`;
  const serit = h('div', { class: 'pano-serit', role: 'region', 'aria-label': 'Pano denetimleri' });
  const seritBaslik = h('div', { class: 'pano-serit-baslik' });
  const ortamSec = h('select', { class: 'pano-serit-secim', 'aria-label': 'Pano ortamı' });
  const ortamKap = h('label', { class: 'pano-serit-alan', hidden: true, title: 'Mantıksal veritabanına bağlı SQL kartları bu ortamın eşlemesiyle sorgulanır' }, ikon('ag'), ortamSec);
  // Tüm kartların dönemi: seçilen dönem döneme bağlı kartların hepsine yazılır ve kartlar yenilenir.
  const donemKap = h('span', { class: 'pano-serit-alan pano-serit-donem', hidden: true, title: 'Tüm kartların dönemi: seçince döneme bağlı kartların hepsine yazılır ve kartlar yenilenir' });
  const otoSec = h('select', { class: 'pano-serit-secim', 'aria-label': 'Otomatik yenileme' },
    OTOMATIK_YENILEME_DK.map((dk) => h('option', { value: String(dk) }, !dk ? 'Otomatik yenileme kapalı' : dk % 60 === 0 ? `Her ${dk / 60} saatte yenile` : `Her ${dk} dk yenile`)));
  const otoDurum = h('button', { type: 'button', class: 'kucuk-dugme hayalet pano-oto-durum', hidden: true }, ikon('oynat'), 'Başlat');
  const tumunuYenileDugmesi = h('button', { type: 'button', class: 'pano-tumunu-yenile' }, ikon('yenile'), 'Tümünü yenile');
  const sonGuncelleme = h('span', { class: 'soluk kucuk pano-son-guncelleme' });
  const seritAraclari = h('div', { class: 'pano-serit-araclar' }, ortamKap, donemKap, h('label', { class: 'pano-serit-alan' }, ikon('saat'), otoSec), otoDurum, tumunuYenileDugmesi, sonGuncelleme);
  serit.append(seritBaslik, seritAraclari);
  yerlestir(kap, serit, cubuk, duyuru, bosNot, pano);

  const duzenleDugmesi = h('button', { type: 'button', class: 'pano-duzenle-dugmesi', title: 'Kartları ekleyin, kaldırın, taşıyın ya da boyutlandırın (proje için saklanır)' },
    ikon('izgara'), 'Panoyu düzenle');
  duzenleDugmesi.addEventListener('click', () => duzenlemeyiAc());
  yerlestir(eylemler, duzenleDugmesi);

  const etkinDuzen = () => (duzenleniyor ? calisan : kayitli.duzen);
  const degisti = () => { kayitIzi.kirli = true; };

  // ---- Düzenleme çubuğu -------------------------------------------------------------------------------------------------
  const kartEkleDugmesi = h('button', { type: 'button', class: 'pano-kart-ekle' }, ikon('arti'), 'Kart ekle');
  const varsayilanDugmesi = h('button', { type: 'button', class: 'hayalet pano-varsayilan' }, ikon('geri'), 'Varsayılana dön');
  const vazgecDugmesi = h('button', { type: 'button', class: 'hayalet pano-vazgec' }, 'Vazgeç');
  const bittiDugmesi = h('button', { type: 'button', class: 'birincil pano-bitti' }, ikon('onay'), 'Bitti');
  cubuk.append(
    h('div', { class: 'pano-duzen-metni' }, h('strong', {}, 'Pano düzenleniyor'),
      h('span', { id: yardimId, class: 'soluk kucuk' }, 'Kartı tutamaktan (⠿) sürükleyip istediğiniz boş yere bırakın; üstünde boşluk kalabilir, değdiği kartlar aşağı iner. Tutamak seçiliyken oklar kartı bir hücre taşır, Shift + oklar boyutunu değiştirir. Sağ alt köşedeki tutamakla genişlik ve yükseklik birim birim değişir (odaktayken oklar). Değişiklikler "Bitti"ye basınca kaydedilir.')),
    h('div', { class: 'dugmeler' }, kartEkleDugmesi, varsayilanDugmesi, vazgecDugmesi, bittiDugmesi));
  kartEkleDugmesi.addEventListener('click', () => kartEklePenceresi());
  varsayilanDugmesi.addEventListener('click', () => {
    calisan = varsayilanDuzen();
    degisti();
    ciz();
    duyur('Varsayılan düzen yüklendi. Kaydetmek için "Bitti"ye basın.');
    bildir('Varsayılan düzen yüklendi; kaydetmek için "Bitti"ye basın.');
  });
  vazgecDugmesi.addEventListener('click', () => { degisiklikleriBirak(); duzenlemeyiKapat(); duyur('Değişiklikler geri alındı.'); });
  bittiDugmesi.addEventListener('click', async () => {
    if (JSON.stringify(calisan) === JSON.stringify(kayitli.duzen)) { degisiklikleriBirak(); duzenlemeyiKapat(); return; }
    try {
      const y = await mesgulIken(bittiDugmesi, 'Kaydediliyor…', () => api('/platform/pano/kaydet', { govde: { projeId: proje.id, duzen: calisan } }));
      kayitli = { duzen: y.duzen, sqlSonuclari: y.sqlSonuclari || {} };
      degisiklikleriBirak();
      duzenlemeyiKapat();
      bildir('Pano kaydedildi.');
    } catch (e) {
      if (!(e && e.durum === 423)) bildir(e && e.message ? e.message : String(e), 'hata');
    }
  });

  function duzenlemeyiAc() {
    if (duzenleniyor) return;
    calisan = kopya(kayitli.duzen);
    duzenleniyor = true;
    ciz();
    kartEkleDugmesi.focus();
    duyur('Düzenleme kipi açıldı.');
  }
  function duzenlemeyiKapat() {
    duzenleniyor = false;
    calisan = null;
    if (/^#\/sonuclar\/ozet\/(duzenle|kart-ekle)$/.test(location.hash)) history.replaceState(null, '', '#/sonuclar/ozet');
    ciz();
    duzenleDugmesi.focus();
  }

  // ---- Üst şerit işlevleri ----------------------------------------------------------------------------------------------
  const sqlKartlari = () => kayitli.duzen.kartlar.filter((/** @type {any} */ k) => k.tur === 'sql' && k.ayar);
  /** Kartın etkin hedefi CANLI ortamda mı (seçeneklerden: veritabanı × ortam ya da bağlantının CANLI işareti). @param {any} k @param {any} se */
  const kartCanliMi = (k, se) => {
    const hd = etkinHedef(k, kayitli.duzen);
    if (hd.veritabaniId) return Boolean(se.veritabanlari.find((/** @type {any} */ v) => v.id === hd.veritabaniId)?.ortamlar.find((/** @type {any} */ o) => o.id === hd.ortamId)?.canli);
    return Boolean(se.baglantilar.find((/** @type {any} */ b) => b.id === hd.baglantiId)?.canli);
  };
  let tumuCalisiyor = false;
  /** Otomatik yenileme bu oturumda başlatıldı mı (CANLI kart varsa kullanıcı bir kez onaylar; sayfa yeniden açılınca yine sorulur). */
  let otomatikOnayli = false;
  /** @type {ReturnType<typeof setInterval> | null} */
  let otomatikZamanlayici = null;

  /**
   * SQL kartlarını yeniler (en çok 2 eşzamanlı). CANLI ortama sorgu atacak, bu oturumda onaylanmamış kart varsa TEK onay sorulur.
   * sessiz (otomatik yenileme): onay gerekiyorsa sormaz, otomatik yenileme "Başlat"a döner.
   * @param {{ idler?: string[]; sessiz?: boolean }} [s]
   */
  async function tumunuYenile(s = {}) {
    if (tumuCalisiyor || duzenleniyor) return;
    const kartlar = sqlKartlari().filter((/** @type {any} */ k) => !s.idler || s.idler.includes(k.id));
    if (!kartlar.length) return;
    let se = null;
    try { se = await secenekler(); } catch { se = null; }
    const onaysiz = se ? kartlar.filter((/** @type {any} */ k) => kartCanliMi(k, se) && !canliOnaylari.has(onayAnahtari(k))) : [];
    if (onaysiz.length) {
      if (s.sessiz) { otomatikOnayli = false; seritGuncelle(); return; }
      const ortamlar = [...new Set(onaysiz.map((/** @type {any} */ k) => {
        const hd = etkinHedef(k, kayitli.duzen);
        return hd.veritabaniId ? se.veritabanlari.find((/** @type {any} */ v) => v.id === hd.veritabaniId)?.ortamlar.find((/** @type {any} */ o) => o.id === hd.ortamId)?.ad : se.baglantilar.find((/** @type {any} */ b) => b.id === hd.baglantiId)?.ad;
      }).filter(Boolean))];
      if (!(await canliOnayPenceresi(ortamlar.join(', ') || 'CANLI ortam'))) return;
      for (const k of onaysiz) canliOnaylari.add(onayAnahtari(k));
    }
    tumuCalisiyor = true;
    const kuyruk = [...kartlar];
    const isci = async () => { for (let k = kuyruk.shift(); k; k = kuyruk.shift()) await yenileyiciler.get(k.id)?.(); };
    try {
      await mesgulIken(tumunuYenileDugmesi, 'Yenileniyor…', () => Promise.all([isci(), isci()]));
    } finally {
      tumuCalisiyor = false;
      seritGuncelle();
    }
  }

  /** Şeridi düzene göre çizer (başlık; düzenlemede başlık / açıklama girdileri; ortam ve dönem seçimleri; otomatik yenileme). */
  function seritGuncelle() {
    const d = etkinDuzen();
    if (duzenleniyor) {
      const baslik = h('input', { type: 'text', maxlength: 80, value: d.baslik || '', placeholder: 'ör. Canlı servis durumu', 'aria-label': 'Pano başlığı' });
      const aciklama = h('input', { type: 'text', maxlength: 200, value: d.aciklama || '', placeholder: 'ör. Anlık servis sağlığı ve artan hatalar', 'aria-label': 'Pano açıklaması' });
      baslik.addEventListener('input', () => { calisan = { ...calisan, baslik: baslik.value }; degisti(); });
      aciklama.addEventListener('input', () => { calisan = { ...calisan, aciklama: aciklama.value }; degisti(); });
      if (!seritBaslik.querySelector('input')) yerlestir(seritBaslik, baslik, aciklama);
    } else {
      yerlestir(seritBaslik, d.baslik ? h('h2', { class: 'pano-serit-adi' }, d.baslik) : null, d.aciklama ? h('p', { class: 'soluk kucuk pano-serit-aciklama' }, d.aciklama) : null);
    }
    seritAraclari.hidden = duzenleniyor;
    const sql = sqlKartlari();
    // Ortam: mantıksal veritabanına bağlı kart varsa; seçenekler bu veritabanlarının eşlemesi olan ortamlar.
    const vtIdler = new Set(sql.map((/** @type {any} */ k) => k.ayar.hedef?.veritabaniId).filter(Boolean));
    ortamKap.hidden = !vtIdler.size;
    if (vtIdler.size) {
      secenekler().then((se) => {
        /** @type {Map<string, { ad: string; canli: boolean }>} */
        const ortamlar = new Map();
        for (const v of se.veritabanlari) if (vtIdler.has(v.id)) for (const o of v.ortamlar) ortamlar.set(o.id, { ad: o.ad, canli: Boolean(o.canli) });
        yerlestir(ortamSec, h('option', { value: '' }, 'Ortam: kartların kendi seçimi'),
          [...ortamlar].map(([id, o]) => h('option', { value: id, selected: id === kayitli.duzen.ortamId }, `Ortam: ${o.ad}${o.canli ? ' (CANLI ortam)' : ''}`)));
        ortamSec.value = kayitli.duzen.ortamId || '';
        ortamKap.classList.toggle('canli', Boolean(kayitli.duzen.ortamId && ortamlar.get(kayitli.duzen.ortamId)?.canli));
      }).catch(() => { ortamKap.hidden = true; });
    }
    // Tüm kartların dönemi (döneme bağlı kart varsa): seçilen dönem hepsine yazılır ve yenilenir.
    const donemliler = sql.filter((/** @type {any} */ k) => kartDonemliMi(k));
    if (donemliler.length) {
      const ortak = donemliler.every((/** @type {any} */ k) => JSON.stringify(k.donem) === JSON.stringify(donemliler[0].donem)) ? donemliler[0].donem : null;
      const secici = tarihAraligiSecici({
        deger: ortak || gocDonemi(), anahtar: null, kisa: true, etiket: 'Dönem: tüm kartlar',
        degisti: (dg) => {
          const x = /** @type {any} */ (dg);
          tumDonemSec(x.hizli ? { hizli: x.hizli } : { baslangic: x.baslangic || new Date(0).toISOString(), bitis: x.bitis || new Date().toISOString() });
        }
      });
      secici.classList.add('pano-donem');
      yerlestir(donemKap, h('span', { class: 'soluk kucuk' }, 'Tüm kartlar:'), secici);
      donemKap.hidden = false;
    } else { yerlestir(donemKap); donemKap.hidden = true; }
    otoSec.value = String(kayitli.duzen.otomatikYenileDk || 0);
    otoDurum.hidden = !(kayitli.duzen.otomatikYenileDk && !otomatikOnayli);
    const zamanlar = sql.map((/** @type {any} */ k) => kayitli.sqlSonuclari[k.id]?.zaman).filter(Boolean).sort();
    sonGuncelleme.textContent = zamanlar.length ? `Son güncelleme: ${sonVeriMetni(zamanlar[zamanlar.length - 1])}` : '';
    otomatikKur();
  }

  /** Otomatik yenileme zamanlayıcısı: aralık seçili ve onaylıysa; sayfa gizliyken ya da düzenlemede atlanır. */
  function otomatikKur() {
    const dk = kayitli.duzen.otomatikYenileDk || 0;
    const anahtar = otomatikOnayli && dk && !duzenleniyor ? dk : 0;
    if (/** @type {any} */ (otomatikKur).aralik === anahtar) return;
    /** @type {any} */ (otomatikKur).aralik = anahtar;
    if (otomatikZamanlayici) clearInterval(otomatikZamanlayici);
    otomatikZamanlayici = anahtar ? setInterval(() => {
      if (!pano.isConnected) { if (otomatikZamanlayici) clearInterval(otomatikZamanlayici); return; }
      if (document.hidden || duzenleniyor) return;
      tumunuYenile({ sessiz: true });
    }, anahtar * 60_000) : null;
  }

  /** Panonun ortak ayarını kaydeder (ortam, otomatik yenileme). @param {Record<string, unknown>} ayar */
  async function panoAyariKaydet(ayar) {
    const y = await api('/platform/pano/ayar', { govde: { projeId: proje.id, ayar } });
    kayitli = { duzen: y.duzen, sqlSonuclari: y.sqlSonuclari || kayitli.sqlSonuclari };
  }

  ortamSec.addEventListener('change', async () => {
    try { await panoAyariKaydet({ ortamId: ortamSec.value }); } catch (e) { if (!(e && e.durum === 423)) bildir(e && e.message ? e.message : String(e), 'hata'); return; }
    ciz();
    duyur(`Ortam: ${ortamSec.selectedOptions[0]?.textContent || ''}`);
    // Ortamdan etkilenen kartlar (mantıksal veritabanına bağlı) yenilenir.
    tumunuYenile({ idler: sqlKartlari().filter((/** @type {any} */ k) => k.ayar.hedef?.veritabaniId).map((/** @type {any} */ k) => k.id) });
  });
  /** @param {object} donem */
  async function tumDonemSec(donem) {
    const idler = sqlKartlari().filter((/** @type {any} */ k) => kartDonemliMi(k)).map((/** @type {any} */ k) => k.id);
    try {
      const y = await api('/platform/pano/donem', { govde: { projeId: proje.id, donemler: Object.fromEntries(idler.map((id) => [id, donem])) } });
      kayitli = { duzen: y.duzen, sqlSonuclari: y.sqlSonuclari || kayitli.sqlSonuclari };
    } catch (e) { if (!(e && e.durum === 423)) bildir(e && e.message ? e.message : String(e), 'hata'); return; }
    ciz();
    duyur(`Tüm kartların dönemi: ${donemMetni(donem)}.`);
    tumunuYenile({ idler });
  }
  otoSec.addEventListener('change', async () => {
    const dk = Number(otoSec.value);
    try { await panoAyariKaydet({ otomatikYenileDk: dk }); } catch (e) { if (!(e && e.durum === 423)) bildir(e && e.message ? e.message : String(e), 'hata'); return; }
    // Açılınca hemen bir kez yenilenir (CANLI kart varsa onay burada sorulur); onay verilmezse "Başlat" bekler.
    otomatikOnayli = false;
    if (dk) { await tumunuYenile(); otomatikOnayli = !sqlKartlari().some((/** @type {any} */ k) => !canliOnaylari.has(onayAnahtari(k))) || await canliKartYok(); }
    seritGuncelle();
  });
  otoDurum.addEventListener('click', async () => { await tumunuYenile(); otomatikOnayli = await canliKartYok() || sqlKartlari().every((/** @type {any} */ k) => canliOnaylari.has(onayAnahtari(k))); seritGuncelle(); });
  /** Onay gerektiren (CANLI, bu oturumda onaylanmamış) kart yok mu. */
  async function canliKartYok() {
    try { const se = await secenekler(); return !sqlKartlari().some((/** @type {any} */ k) => kartCanliMi(k, se) && !canliOnaylari.has(onayAnahtari(k))); } catch { return false; }
  }
  tumunuYenileDugmesi.addEventListener('click', () => tumunuYenile());

  // ---- Çizim ------------------------------------------------------------------------------------------------------------
  // Bırakılacak hücrenin gölgesi (sürükleme / boyutlandırma sırasında; ekran okuyucudan gizli).
  const golge = h('div', { class: 'pano-golge', 'aria-hidden': 'true', hidden: true });

  /** @param {{ id: string; rol: string } | null} [odak] */
  function ciz(odak = null) { kaydirmayiKoru(cizIc); odakVer(odak); }
  function cizIc() {
    const duzen = etkinDuzen();
    const geriYukle = icKaydirmalar(pano);
    pano.classList.toggle('duzenleniyor', duzenleniyor);
    cubuk.hidden = !duzenleniyor;
    duzenleDugmesi.hidden = duzenleniyor;
    // DOM sırası = okuma sırası (y, sonra x): ekran okuyucu ve dar ekrandaki tek sütun bu sırayı izler.
    const sirali = okumaSirasinaDiz(duzen.kartlar);
    const n = sirali.length;
    // Kartlar yerinde güncellenir: değişmeyen kart DOM'da kalır (kaydırma konumu, odak ve tablo durumu korunur).
    cocuklariEsitle(pano, [...sirali.map((k, i) => ogeHazirla(k, i, n)), golge]);
    bosNot.hidden = n > 0;
    yerlestir(bosNot, ...(n ? [] : [h('p', { class: 'soluk' }, ikon('izgara'), duzenleniyor
      ? 'Panoda kart yok. "Kart ekle" ile kart ekleyin ya da "Varsayılana dön"e basın.'
      : 'Panoda kart yok. "Panoyu düzenle" ile kart ekleyebilirsiniz.')]));
    varsayilanDugmesi.disabled = duzenleniyor && varsayilanMi(calisan);
    seritGuncelle();
    yerlesimiGuncelle();
    geriYukle();
  }
  /** Odak (kaydırma korumasının DIŞINDA: görünmeyen denetime odak verilirken sayfa gerektiği kadar kayabilir). @param {{ id: string; rol: string } | null} odak */
  function odakVer(odak) {
    if (odak) {
      const el = /** @type {HTMLElement | null} */ (pano.querySelector(`[data-kart-id="${CSS.escape(odak.id)}"] [data-rol="${odak.rol}"]`));
      const hedef = el && !(/** @type {HTMLButtonElement} */ (el).disabled) ? el
        : /** @type {HTMLElement | null} */ (pano.querySelector(`[data-kart-id="${CSS.escape(odak.id)}"] [data-rol="tutamak"]`));
      if (hedef) odakla(hedef);
    }
  }

  /** Kartın sarmalayıcısı (içerik ve dönem değişmediyse önceki öğe yeniden kullanılır; veri yeniden istenmez). */
  function ogeHazirla(k, i, n) {
    const imza = kartImzasi(k, etkinDuzen());
    let o = ogeler.get(k.id);
    if (!o || o.imza !== imza) {
      const icerik = h('div', { class: 'pano-icerik' }, ...kartIcerigi(k));
      o = { sar: h('div', { class: 'pano-ogesi', role: 'listitem', 'data-kart-id': k.id, 'data-kart-tur': k.tur }, icerik), icerik, imza };
      ogeler.set(k.id, o);
    }
    // Modeldeki konum (testler ve hata ayıklama için; çizim CSS değişkenleriyle yerlesimiGuncelle'de).
    for (const a of /** @type {const} */ (['x', 'y', 'w', 'h'])) if (o.sar.dataset[a] !== String(k[a])) o.sar.dataset[a] = String(k[a]);
    o.sar.querySelector(':scope > .pano-arac-cubugu')?.remove();
    o.sar.querySelector(':scope > .pano-kose-tutamagi')?.remove();
    if (duzenleniyor) { o.sar.prepend(aracCubugu(k, i, n)); o.sar.append(koseTutamagi(k)); }
    return o.sar;
  }

  // ---- Yerleşim: serbest ızgara ------------------------------------------------------------------------------------------
  // Her kart ızgarada kendi hücresindedir: CSS değişkenleri (CSSOM; satır içi stil özniteliği yazılmaz) --pano-kolon "x+1 / span w",
  // --pano-satir "y+1 / span h" ve --pano-yukseklik (h satırın pikseli; dar ekranda en küçük yükseklik). Yükseklik içerikten bağımsızdır:
  // ölçüm yoktur, sığmayan içerik kartın içinde kaydırılır, grafik / tablo kartın boyutunda yeniden çizilir. Izgara kartları
  // yerleştirdiği ve model çakışmasız olduğu için kartlar üst üste binmez. Düzenleme dışında gizlenen kart (tamamlanan Başlarken) ekranda
  // yer kaplamaz: yalnız onun kullandığı satırlar daralır (gorunurYerlesim; kullanıcının bıraktığı boşluklar korunur).
  function yerlesimiGuncelle() { kaydirmayiKoru(yerlesimiGuncelleIc); }
  /** @param {Array<{ id: string; x: number; y: number; w: number; h: number }>} [kartlar] önizleme (sürükleme / boyutlandırma) */
  function yerlesimiGuncelleIc(kartlar) {
    const duzen = kartlar ?? etkinDuzen().kartlar;
    /** @type {Set<string>} */
    const gizli = new Set();
    if (!duzenleniyor) {
      for (const k of duzen) {
        const sar = ogeler.get(k.id)?.sar;
        if (k.tur === 'baslarken' && sar && !sar.querySelector('.baslarken-kap:not([hidden])')) gizli.add(k.id);
      }
    }
    for (const k of gorunurYerlesim(duzen, gizli)) {
      const sar = ogeler.get(k.id)?.sar;
      if (sar) hucreyeKoy(sar, k);
    }
  }
  /** @param {HTMLElement} el @param {{ x: number; y: number; w: number; h: number }} k */
  function hucreyeKoy(el, k) {
    const deger = (/** @type {string} */ ad, /** @type {string} */ v) => { if (el.style.getPropertyValue(ad) !== v) el.style.setProperty(ad, v); };
    deger('--pano-kolon', `${k.x + 1} / span ${k.w}`);
    deger('--pano-satir', `${k.y + 1} / span ${k.h}`);
    deger('--pano-yukseklik', `${satirPikseli(k.h)}px`);
  }
  // Başlarken tamamlanınca / gizlenince ya da görünür olunca yer yeniden hesaplanır (yalnız "hidden" değişimleri).
  new MutationObserver((kayitlar) => {
    if (kayitlar.some((k) => k.target instanceof Element && k.target.classList.contains('baslarken-kap'))) yerlesimiGuncelle();
  }).observe(pano, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

  /** Izgara ölçüsü (px): sütun adımı (sütun + boşluk) ve satır adımı (satır + boşluk). */
  function izgara() {
    const r = pano.getBoundingClientRect();
    return { r, sutun: (r.width + IZGARA_BOSLUK) / IZGARA_SUTUN, satir: SATIR_BIRIMI + IZGARA_BOSLUK };
  }

  /**
   * Sürükleme / boyutlandırma oturumu: pano yüksekliği sabitlenir (sayfa kısalıp kaydırma yukarı çekilmez; kaydırma çapası kapalı),
   * önizleme modele göre çizilir, gölge bırakılacak hücreyi gösterir. Bırakınca önizleme çalışan düzene yazılır.
   * @param {string} id taşınan / boyutlanan kart
   */
  function etkilesim(id) {
    const bas = calisan;
    let onizleme = bas;
    const sar = /** @type {HTMLElement} */ (ogeler.get(id)?.sar);
    pano.style.setProperty('--pano-olcu-yukseklik', `${Math.ceil(pano.getBoundingClientRect().height)}px`);
    pano.classList.add('etkilesimde');
    golge.hidden = false;
    return {
      bas,
      /** @param {any} d */
      goster(d) {
        onizleme = d;
        kaydirmayiKoru(() => {
          yerlesimiGuncelleIc(d.kartlar);
          const k = d.kartlar.find((x) => x.id === id);
          if (k) hucreyeKoy(golge, k);
        });
        return d.kartlar.find((x) => x.id === id);
      },
      /** @param {boolean} uygula */
      bitir(uygula) {
        golge.hidden = true;
        sar.style.removeProperty('transform');
        sar.classList.remove('surukleniyor', 'boyutlaniyor');
        pano.classList.remove('etkilesimde');
        pano.style.removeProperty('--pano-olcu-yukseklik');
        const degisti_ = uygula && onizleme !== bas;
        if (degisti_) { calisan = onizleme; degisti(); }
        return degisti_;
      }
    };
  }

  /** Konum / boyut duyurusu. @param {any} k */
  const konumMetni = (k) => `${kartAdi(k)}: sütun ${k.x + 1}, satır ${k.y + 1}; ${k.w} sütun × ${k.h} satır.`;

  /** Kartı model işlemiyle değiştirir, yeniden çizer ve duyurur. @param {string} id @param {any} yeni @param {string} rol */
  function uygula(id, yeni, rol) {
    if (yeni === calisan) return;
    calisan = yeni;
    degisti();
    ciz({ id, rol });
    const k = calisan.kartlar.find((x) => x.id === id);
    if (k) duyur(konumMetni(k));
  }

  /** Sağ alt köşe tutamağı (düzenleme kipi): sürükle → genişlik ve yükseklik birim birim; klavye: ← → genişlik, ↑ ↓ yükseklik. */
  function koseTutamagi(k) {
    const ad = kartAdi(k);
    const dugme = h('button', { type: 'button', class: 'pano-kose-tutamagi', 'data-rol': 'kose', 'aria-label': `Boyutlandır: ${ad}`, 'aria-describedby': yardimId,
      title: `Sürükleyin: genişlik ve yükseklik (${k.w} sütun × ${k.h} satır)` },
    h('span', { 'aria-hidden': 'true' }, '◢'));
    dugme.addEventListener('keydown', (o) => {
      const m = calisan.kartlar.find((x) => x.id === k.id);
      if (!m) return;
      const adim = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[o.key];
      if (!adim) return;
      o.preventDefault();
      if (darEkran() && adim[0]) return;
      uygula(k.id, kartYerlestir(calisan, k.id, { w: m.w + adim[0], h: m.h + adim[1] }), 'kose');
    });
    // Fare / dokunma: sürüklerken canlı önizleme (komşular yalnız çakışırsa aşağı iner), bırakınca çalışan düzene yazılır.
    dugme.addEventListener('pointerdown', (o) => {
      if (o.button !== 0) return;
      o.preventDefault();
      o.stopPropagation();
      const sar = ogeler.get(k.id)?.sar;
      const m = calisan.kartlar.find((x) => x.id === k.id);
      if (!sar || !m) return;
      dugme.focus({ preventScroll: true });
      const { sutun, satir } = izgara();
      const dar = darEkran();
      const basX = o.clientX; const basY = o.clientY;
      const e0 = etkilesim(k.id);
      sar.classList.add('boyutlaniyor');
      dugme.setPointerCapture?.(o.pointerId);
      const hareket = (/** @type {PointerEvent} */ e) => {
        e0.goster(kartYerlestir(e0.bas, k.id, { w: dar ? m.w : m.w + Math.round((e.clientX - basX) / sutun), h: m.h + Math.round((e.clientY - basY) / satir) }));
      };
      const birak = (/** @type {PointerEvent} */ e) => {
        dugme.removeEventListener('pointermove', hareket);
        dugme.removeEventListener('pointerup', birak);
        dugme.removeEventListener('pointercancel', birak);
        const oldu = e0.bitir(e.type === 'pointerup');
        ciz({ id: k.id, rol: 'kose' });
        if (oldu) { const y = calisan.kartlar.find((x) => x.id === k.id); if (y) duyur(konumMetni(y)); }
      };
      dugme.addEventListener('pointermove', hareket);
      dugme.addEventListener('pointerup', birak);
      dugme.addEventListener('pointercancel', birak);
    });
    return dugme;
  }

  /** @returns {Node[]} */
  function kartIcerigi(k) {
    if (yerlesikMi(k.tur)) {
      const donemli = kartDonemliMi(k);
      const el = yerlesik[k.tur] ? yerlesik[k.tur](donemli ? k.donem || gocDonemi() : null) : h('p', { class: 'soluk' }, turAdi(k.tur));
      // Başlarken tamamlanınca / gizlenince kaybolur; düzenleme kipinde yerini gösteren not.
      if (k.tur === 'baslarken') return [el, h('p', { class: 'pano-gizli-not soluk kucuk' }, ikon('gorunum'), 'Başlarken listesi bu projede şu an görünmüyor (tamamlandı ya da gizlendi).')];
      // Döneme bağlı yerleşik kart: üstte ince dönem satırı (kartın adı + kısa dönem seçimi).
      return donemli ? [h('div', { class: 'pano-donem-satiri' }, h('span', { class: 'pano-donem-adi' }, kartAdi(k)), donemSecici(k)), el] : [el];
    }
    if (k.tur === 'sql') return [sqlKarti(k)];
    if (k.tur === 'veri') return [veriKarti(k)];
    return [metinKarti(k)];
  }

  /**
   * Kartın kısa dönem seçimi (kart başlığında; açılır panelde hızlı seçimler ve özel aralık). Seçim hemen kaydedilir (düzenleme kipi
   * gerekmez; POST /platform/pano/donem) ve kart yeni dönemle yeniden kurulur. SQL kartında sorgu çalışmaz (Yenile'yi bekler).
   * @param {any} k
   */
  function donemSecici(k) {
    const kok = tarihAraligiSecici({
      deger: k.donem || gocDonemi(), anahtar: null, kisa: true, etiket: `Dönem: ${kartAdi(k)}`,
      ...(k.tur === 'ozetKutulari' ? { tumuMetni: 'Özet: son 30 gün' } : {}),
      degisti: (d) => {
        // Yalnız başlangıç ya da yalnız bitiş girildiyse eksik uç tamamlanır (kart dönemi iki ucu da saklar).
        const x = /** @type {any} */ (d);
        const donem = x.hizli ? { hizli: x.hizli } : { baslangic: x.baslangic || new Date(0).toISOString(), bitis: x.bitis || new Date().toISOString() };
        donemSec(k.id, donem);
      }
    });
    kok.classList.add('pano-donem');
    return kok;
  }

  /** @param {string} id @param {object} donem */
  async function donemSec(id, donem) {
    const onceki = kayitli;
    const uygula = (/** @type {any} */ d) => (d ? kartDonemle(d, id, donem) : d);
    kayitli = { ...kayitli, duzen: uygula(kayitli.duzen) };
    if (calisan) calisan = uygula(calisan);
    ciz();
    const k = etkinDuzen().kartlar.find((x) => x.id === id);
    duyur(`${k ? kartAdi(k) : 'Kart'}: dönem ${donemMetni(donem)}.`);
    /** @type {HTMLElement | null} */ (pano.querySelector(`[data-kart-id="${CSS.escape(id)}"] .pano-donem .tarih-tetik`))?.focus({ preventScroll: true });
    try {
      const y = await api('/platform/pano/donem', { govde: { projeId: proje.id, donemler: { [id]: donem } } });
      kayitli = { duzen: y.duzen, sqlSonuclari: y.sqlSonuclari || kayitli.sqlSonuclari };
    } catch (e) {
      kayitli = onceki;
      if (calisan) calisan = kartDonemle(calisan, id, onceki.duzen.kartlar.find((x) => x.id === id)?.donem || gocDonemi());
      ciz();
      if (!(e && e.durum === 423)) bildir(e && e.message ? e.message : String(e), 'hata');
    }
  }

  /**
   * Kart parametresinin seçimi (SQL kartının başlığındaki seçim ya da başka bir kartın kutucuğuna tıklama). Hemen kaydedilir
   * (POST /platform/pano/parametre) ve kart yenilenir (sorgu çalışır; CANLI ortamda ilk seferde onay). Düzenleme kipinde yalnız
   * çalışan düzene yazılır (kaydedilince saklanır; sorgu çalışmaz). kaydir: kart görünür alana getirilir.
   * @param {string} id @param {string} ad @param {string} deger @param {{ kaydir?: boolean }} [s]
   */
  async function parametreSec(id, ad, deger, s = {}) {
    if (duzenleniyor && calisan) {
      calisan = kartParametrele(calisan, id, ad, deger);
      ciz();
      return;
    }
    try {
      const y = await api('/platform/pano/parametre', { govde: { projeId: proje.id, kartId: id, ad, deger } });
      kayitli = { duzen: y.duzen, sqlSonuclari: y.sqlSonuclari || kayitli.sqlSonuclari };
    } catch (e) {
      if (!(e && e.durum === 423)) bildir(e && e.message ? e.message : String(e), 'hata');
      return;
    }
    ciz();
    const kartEl = /** @type {HTMLElement | null} */ (pano.querySelector(`[data-kart-id="${CSS.escape(id)}"]`));
    const k = etkinDuzen().kartlar.find((x) => x.id === id);
    if (k) duyur(`${kartAdi(k)}: ${deger} seçildi.`);
    if (kartEl && s.kaydir) kartEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // Seçilen kart ve aynı adlı parametreyle bağlı kartlar yenilenir (CANLI'da tek onay).
    await tumunuYenile({ idler: parametreyleDegisenler(kayitli.duzen, id, ad, deger) });
  }

  /** Düzenleme kipinde kartın üstündeki araçlar. i / n: okuma sırasındaki yeri. */
  function aracCubugu(k, i, n) {
    const ad = kartAdi(k);
    const tutamak = h('button', { type: 'button', class: 'pano-tutamak hayalet kucuk-dugme', 'data-rol': 'tutamak', 'aria-label': `Taşı: ${ad}`,
      'aria-describedby': yardimId, title: 'Sürükleyin ya da oklarla taşıyın (Shift + oklar: boyut)' }, h('span', { 'aria-hidden': 'true' }, '⠿'));
    tutamak.addEventListener('keydown', (o) => {
      const adim = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[o.key];
      const m = calisan.kartlar.find((x) => x.id === k.id);
      if (!adim || !m) return;
      o.preventDefault();
      if (o.shiftKey) {
        if (darEkran() && adim[0]) return;
        uygula(k.id, kartYerlestir(calisan, k.id, { w: m.w + adim[0], h: m.h + adim[1] }), 'tutamak');
      } else if (darEkran()) {
        // Dar ekranda tek sütun: ↑ ↓ okuma sırasını değiştirir.
        if (adim[1]) tasi(k.id, adim[1] < 0 ? 'yukari' : 'asagi', 'tutamak');
      } else {
        uygula(k.id, kartYerlestir(calisan, k.id, { x: m.x + adim[0], y: m.y + adim[1] }), 'tutamak');
      }
    });
    tutamak.addEventListener('pointerdown', (o) => suruklemeBaslat(o, k.id, tutamak));
    const yukari = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'data-rol': 'yukari', 'aria-label': `Yukarı taşı: ${ad}`, title: 'Sırada bir öne al', disabled: i === 0 },
      h('span', { 'aria-hidden': 'true' }, '↑'));
    const asagi = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'data-rol': 'asagi', 'aria-label': `Aşağı taşı: ${ad}`, title: 'Sırada bir sonraya al', disabled: i === n - 1 },
      h('span', { 'aria-hidden': 'true' }, '↓'));
    yukari.addEventListener('click', () => tasi(k.id, 'yukari', 'yukari'));
    asagi.addEventListener('click', () => tasi(k.id, 'asagi', 'asagi'));
    const kaldir = h('button', { type: 'button', class: 'hayalet kucuk-dugme pano-kaldir', 'data-rol': 'kaldir', 'aria-label': `Kaldır: ${ad}`, title: 'Panodan kaldır ("Kart ekle"den geri eklenebilir)' },
      ikon('carpi'));
    kaldir.addEventListener('click', () => {
      calisan = kartKaldir(calisan, k.id);
      degisti();
      const sonraki = okumaSirasinaDiz(calisan.kartlar)[Math.min(i, calisan.kartlar.length - 1)];
      ciz(sonraki ? { id: sonraki.id, rol: 'kaldir' } : null);
      if (!sonraki) kartEkleDugmesi.focus();
      duyur(`${ad} panodan kaldırıldı. "Kart ekle"den geri ekleyebilirsiniz.`);
    });
    const duzenle = yerlesikMi(k.tur) ? null : h('button', { type: 'button', class: 'hayalet kucuk-dugme pano-kart-duzenle', 'data-rol': 'duzenle', 'aria-label': `Düzenle: ${ad}` },
      ikon('duzenle'), 'Düzenle');
    duzenle?.addEventListener('click', () => kartPenceresi(k));
    return h('div', { class: 'pano-arac-cubugu' }, tutamak, h('span', { class: 'pano-kart-adi', title: ad }, ad),
      h('span', { class: 'pano-boyut-bilgisi soluk', 'aria-hidden': 'true', title: 'Genişlik × yükseklik (sütun × satır)' }, `${k.w}×${k.h}`),
      h('span', { class: 'pano-araclar' }, yukari, asagi, duzenle, kaldir));
  }

  /** Okuma sırasında bir öne / sonraya (↑ ↓ düğmeleri; dar ekranda tutamağın okları). @param {string} id @param {'yukari' | 'asagi'} yon @param {string} rol */
  function tasi(id, yon, rol) {
    const yeni = kartSiraTasi(calisan, id, yon);
    if (yeni === calisan) return;
    calisan = yeni;
    degisti();
    ciz({ id, rol });
    const sirali = okumaSirasinaDiz(calisan.kartlar);
    const j = sirali.findIndex((k) => k.id === id);
    duyur(`${kartAdi(sirali[j])} ${j + 1}. sıraya taşındı (${sirali.length} kart).`);
  }

  /**
   * Sürükle-bırak (yalnız düzenleme kipinde, geniş ekranda; tutamaktan başlar). Kart imleci izler; bırakılacak hücre gölgeyle,
   * itilecek kartlar yeni yerleriyle canlı gösterilir. Sürüklerken sayfa (tekerlekle) kaydırılırsa hedef yeniden hesaplanır.
   * @param {PointerEvent} o @param {string} id @param {HTMLElement} tutamak
   */
  function suruklemeBaslat(o, id, tutamak) {
    if (!duzenleniyor || o.button !== 0 || darEkran()) return;
    const sar = ogeler.get(id)?.sar;
    const m = calisan.kartlar.find((x) => x.id === id);
    if (!sar || !m) return;
    o.preventDefault();
    tutamak.focus({ preventScroll: true });
    const s0 = sar.getBoundingClientRect();
    const ofX = o.clientX - s0.left; const ofY = o.clientY - s0.top;
    let sonX = o.clientX; let sonY = o.clientY;
    let basladi = false;
    /** @type {ReturnType<typeof etkilesim> | null} */
    let e0 = null;
    const guncelle = () => {
      if (!e0) return;
      const { r, sutun, satir } = izgara();
      const k = e0.goster(kartYerlestir(e0.bas, id, { x: Math.round((sonX - ofX - r.left) / sutun), y: Math.round((sonY - ofY - r.top) / satir) }));
      // Kart imleci izler (önizleme hücresine göre kaydırma; CSSOM).
      if (k) sar.style.setProperty('transform', `translate(${Math.round(sonX - ofX - (r.left + k.x * sutun))}px, ${Math.round(sonY - ofY - (r.top + k.y * satir))}px)`);
    };
    const hareket = (/** @type {PointerEvent} */ e) => {
      sonX = e.clientX; sonY = e.clientY;
      if (!basladi) {
        if (Math.abs(sonX - o.clientX) < 4 && Math.abs(sonY - o.clientY) < 4) return;
        basladi = true;
        e0 = etkilesim(id);
        sar.classList.add('surukleniyor');
      }
      guncelle();
    };
    const kaydirma = () => guncelle();
    const birak = (/** @type {PointerEvent} */ e) => {
      tutamak.removeEventListener('pointermove', hareket);
      tutamak.removeEventListener('pointerup', birak);
      tutamak.removeEventListener('pointercancel', birak);
      window.removeEventListener('scroll', kaydirma);
      if (!e0) return;
      const oldu = e0.bitir(e.type === 'pointerup');
      ciz({ id, rol: 'tutamak' });
      if (oldu) { const y = calisan.kartlar.find((x) => x.id === id); if (y) duyur(konumMetni(y)); }
    };
    tutamak.setPointerCapture?.(o.pointerId);
    tutamak.addEventListener('pointermove', hareket);
    tutamak.addEventListener('pointerup', birak);
    tutamak.addEventListener('pointercancel', birak);
    window.addEventListener('scroll', kaydirma, { passive: true });
  }

  // ---- Kart ekle / düzenle penceresi -----------------------------------------------------------------------------------
  function kartEklePenceresi() { kartPenceresi(null); }

  /** @param {any} mevcut düzenlenen kullanıcı kartı (null: yeni kart) */
  function kartPenceresi(mevcut) {
    const baslikId = yeniKimlik('pano-pencere');
    const hataKutusu = h('div', { class: 'not-kutusu hata', role: 'alert', hidden: true });
    const hataGoster = (m) => { hataKutusu.textContent = m || ''; hataKutusu.hidden = !m; };
    const alanKap = h('div', { class: 'pano-form' });
    const tamam = h('button', { type: 'submit', class: 'birincil' }, ikon(mevcut ? 'onay' : 'arti'), mevcut ? 'Uygula' : 'Panoya ekle');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    /** @type {() => Promise<any>} */
    let topla = async () => null;
    let tur = mevcut ? mevcut.tur : 'yerlesik';
    const turlar = [['yerlesik', 'Yerleşik kartlar'], ...OZEL_KART_TURLERI.map((t) => [t.tur, t.ad])];
    const turSecimi = mevcut ? null : h('fieldset', { class: 'pano-tur-secimi' }, h('legend', {}, 'Kart türü'),
      ...turlar.map(([a, etiket]) => {
        const r = h('input', { type: 'radio', name: `${baslikId}-tur`, value: a, checked: a === tur });
        r.addEventListener('change', () => { if (r.checked) { tur = a; turuCiz(); } });
        return h('label', { class: 'pano-tur' }, r, etiket);
      }));
    const form = h('form', { method: 'dialog', novalidate: true },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: baslikId }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon(mevcut ? 'duzenle' : 'arti')),
          mevcut ? `Kartı düzenle: ${kartAdi(mevcut)}` : 'Kart ekle'),
        turSecimi, alanKap, hataKutusu),
      h('div', { class: 'diyalog-alt' }, vazgec, tamam));
    const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay pano-penceresi', 'aria-labelledby': baslikId }, form);

    const ekleVeKapat = (kart) => {
      const ad = kartAdi(kart);
      calisan = mevcut ? kartAyarla(calisan, mevcut.id, kart.ayar) : kartEkle(calisan, kart);
      degisti();
      diyalog.close();
      ciz({ id: mevcut ? mevcut.id : kart.id || kart.tur, rol: mevcut ? 'duzenle' : 'tutamak' });
      duyur(mevcut ? `${ad} güncellendi.` : `${ad} panoya eklendi.`);
    };

    function turuCiz() {
      hataGoster('');
      tamam.hidden = tur === 'yerlesik';
      if (tur === 'yerlesik') {
        const eksik = eksikYerlesikler(calisan);
        yerlestir(alanKap, eksik.length
          ? h('ul', { class: 'pano-yerlesik-listesi' }, eksik.map((y) => {
            const ekle = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `Ekle: ${y.ad}` }, ikon('arti'), 'Ekle');
            ekle.addEventListener('click', () => ekleVeKapat({ tur: y.tur }));
            return h('li', {}, h('div', {}, h('strong', {}, y.ad), h('p', { class: 'soluk kucuk' }, y.aciklama)), ekle);
          }))
          : h('p', { class: 'soluk' }, 'Bütün yerleşik kartlar panoda. Kaldırdığınız kartlar burada listelenir.'));
        topla = async () => null;
        return;
      }
      yerlestir(alanKap, h('div', { class: 'iskelet', 'aria-busy': 'true' }, h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), h('i', {}), h('i', { class: 'yarim' })));
      const ayar = mevcut ? mevcut.ayar : null;
      const sec = tur === 'metin' ? Promise.resolve(null) : secenekler();
      sec.then((se) => {
        if (tur === 'sql') topla = sqlFormu(alanKap, ayar, se, mevcut);
        else if (tur === 'veri') topla = veriFormu(alanKap, ayar, se);
        else topla = metinFormu(alanKap, ayar);
      }).catch((e) => { if (!(e && e.durum === 423)) yerlestir(alanKap, h('div', { class: 'not-kutusu hata', role: 'alert' }, e && e.message ? e.message : String(e))); });
    }

    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      if (tur === 'yerlesik' || tamam.disabled) return;
      hataGoster('');
      try {
        const ayar = await mesgulIken(tamam, 'Denetleniyor…', () => topla());
        if (!ayar) return;
        // Konum düzenden gelir: yeni kart panonun altına türün boyutuyla eklenir; düzenlenen kart yerinde kalır.
        const kart = kartTemizle({ id: mevcut ? mevcut.id : `k-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, tur, ayar });
        ekleVeKapat(kart);
      } catch (e) {
        if (e && e.durum === 423) { diyalog.close(); return; }
        hataGoster(e && e.message ? e.message : String(e));
      }
    });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => diyalog.remove());
    document.body.append(diyalog);
    turuCiz();
    diyalog.showModal();
    (/** @type {HTMLElement | null} */ (diyalog.querySelector('input[type="radio"]:checked, input, select, textarea')))?.focus();
  }

  // ---- Kullanıcı kartı formları (dönen işlev ayarı toplar; hatalıysa Error fırlatır) -------------------------------------
  /** @returns {() => Promise<any>} */
  function sqlFormu(kapsayici, ayar, se, mevcut) {
    const a = ayar || {};
    const baslik = h('input', { type: 'text', maxlength: 80, value: a.baslik || '', autocomplete: 'off' });
    const hedefDegeri = a.hedef ? (a.hedef.veritabaniId ? `v:${a.hedef.veritabaniId}:${a.hedef.ortamId}` : `b:${a.hedef.baglantiId}`) : '';
    const hedef = h('select', {},
      h('option', { value: '' }, 'Bağlantı seçin'),
      se.veritabanlari.length ? h('optgroup', { label: 'Veritabanları (ortama göre)' }, se.veritabanlari.flatMap((v) => v.ortamlar.map((o) => h('option', {
        value: `v:${v.id}:${o.id}`, selected: hedefDegeri === `v:${v.id}:${o.id}` }, `${v.ad} · ${o.ad}${o.canli ? ' (CANLI ortam)' : ''}`)))) : null,
      se.baglantilar.length ? h('optgroup', { label: 'Veritabanı bağlantıları' }, se.baglantilar.map((b) => h('option', {
        value: `b:${b.id}`, selected: hedefDegeri === `b:${b.id}` }, `${b.ad} (${b.surucu})${b.canli ? ' · CANLI ortam' : ''}${b.etkin ? '' : ' · kapalı'}`))) : null);
    const sorgu = h('textarea', { rows: 6, class: 'mono pano-sorgu', spellcheck: 'false', maxlength: 20000 });
    sorgu.value = a.sorgu || '';
    const gorunum = h('select', {}, SQL_GORUNUMLERI.map((g) => h('option', { value: g.anahtar, selected: g.anahtar === (a.gorunum || 'sayi') }, g.ad)));
    const zs = SQL_ZAMAN_ASIMI_SN;
    const zamanAsimi = h('input', { type: 'number', min: zs.en, max: se.sinirlar?.enCokZamanAsimiSn ?? zs.enCok, step: 1, inputmode: 'numeric',
      value: String(sqlZamanAsimiTemizle(a.zamanAsimiSn) ?? se.sinirlar?.zamanAsimiSn ?? zs.varsayilan), class: 'pano-zaman-asimi' });
    const sutunlar = h('input', { type: 'text', value: (a.sutunlar || []).join(', '), autocomplete: 'off' });
    const bilinen = mevcut && kayitli.sqlSonuclari[mevcut.id] ? kayitli.sqlSonuclari[mevcut.id].sutunlar : null;
    // Renk eşikleri (yalnız "Tek sayı"): ilk eşleşen uygulanır.
    const esikListesi = h('div', { class: 'pano-esikler' });
    const esikEkle = h('button', { type: 'button', class: 'kucuk-dugme hayalet' }, ikon('arti'), 'Eşik ekle');
    const esikSatiri = (e = { islec: '>', deger: '', renk: 'kirmizi' }) => {
      const islec = h('select', { 'aria-label': 'Eşik işleci' }, ESIK_ISLECLERI.map((x) => h('option', { value: x, selected: x === e.islec }, x)));
      const deger = h('input', { type: 'text', inputmode: 'decimal', value: String(e.deger ?? ''), 'aria-label': 'Eşik değeri', size: 8 });
      const renk = h('select', { 'aria-label': 'Eşik rengi' }, ESIK_RENKLERI.map((r) => h('option', { value: r.anahtar, selected: r.anahtar === e.renk }, r.ad)));
      const sil = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'aria-label': 'Eşiği kaldır' }, ikon('carpi'));
      const satir = h('div', { class: 'pano-esik-satiri' }, h('span', { class: 'soluk kucuk' }, 'Değer'), islec, deger, h('span', { class: 'soluk kucuk' }, 'ise'), renk, sil);
      sil.addEventListener('click', () => { satir.remove(); esikEkle.disabled = esikListesi.children.length >= EN_COK_ESIK; });
      esikListesi.append(satir);
      esikEkle.disabled = esikListesi.children.length >= EN_COK_ESIK;
    };
    for (const e of a.esikler || []) esikSatiri(e);
    esikEkle.addEventListener('click', () => esikSatiri());
    const esikSutunu = h('input', { type: 'text', value: a.esikSutunu || '', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Eşiğin uygulanacağı sütun', placeholder: 'Boşsa gösterilen değer (ör. FARK)' });
    const esikAlani = h('fieldset', { class: 'pano-esik-alani' }, h('legend', {}, 'Renk eşikleri'),
      h('p', { class: 'soluk kucuk' }, 'İlk tutan eşiğin rengi uygulanır (ör. değer > 0 ise kırmızı). Eşik biçimlenmemiş değere bakar; "Yüzde / oran"da yüzde değerine (0,834 → 83,4).'),
      esikListesi, esikEkle, alan('Eşiğin uygulanacağı sütun (Tek sayı / kutucuk)', esikSutunu, { yardim: 'Ör. düne göre farkı veren sütun: renk farka göre, gösterilen sayı yine değer.' }));
    // Biçim: ondalık, ön / son ek, tarih; yüzde görünümünde oran, hedef ve gösterim.
    const b0 = bicimTemizle(a.bicim);
    const ondalik = h('select', {}, ONDALIK_SECENEKLERI.map((o) => h('option', { value: String(o), selected: String(o) === String(b0.ondalik) }, o === 'oto' ? 'Otomatik' : String(o))));
    const onEk = h('input', { type: 'text', maxlength: 8, value: b0.onEk, autocomplete: 'off', placeholder: 'ör. ₺' });
    const sonEk = h('input', { type: 'text', maxlength: 12, value: b0.sonEk, autocomplete: 'off', placeholder: 'ör. " sn", " adet"' });
    const tarih = h('select', {}, TARIH_BICIMLERI.map(([d, e]) => h('option', { value: d, selected: d === b0.tarih }, e)));
    const oran = h('select', {}, ORAN_SECENEKLERI.map(([d, e]) => h('option', { value: d, selected: d === b0.oran }, e)));
    const hedefDeger = h('input', { type: 'text', inputmode: 'decimal', value: b0.hedef === null ? '' : String(b0.hedef).replace('.', ','), autocomplete: 'off', placeholder: 'ör. 95' });
    const gosterge = h('select', {}, GOSTERGE_SECENEKLERI.map(([d, e]) => h('option', { value: d, selected: d === b0.gosterge }, e)));
    const yuzdeAlanlari = h('div', { class: 'pano-bicim-izgara' }, alan('Değer', oran), alan('Hedef (yüzde, isteğe bağlı)', hedefDeger), alan('Gösterim', gosterge));
    const bicimAlani = h('fieldset', { class: 'pano-bicim-alani' }, h('legend', {}, 'Biçim'),
      h('div', { class: 'pano-bicim-izgara' }, alan('Ondalık hane', ondalik), alan('Ön ek', onEk), alan('Son ek', sonEk), alan('Tarih sütunları', tarih)), yuzdeAlanlari);
    const ESIKLI = ['sayi', 'yuzde', 'degisim', 'kutucuk'];
    const YARDIM = {
      sayi: 'Değerin sütunu (boşsa ilk sütun).', yuzde: 'Değerin sütunu (boşsa ilk sütun).', degisim: 'Değerin sütunu (boşsa ilk sütun); önceki yenilemedeki değerle karşılaştırılır.',
      tablo: 'Gösterilecek sütunlar, virgülle (boşsa tümü).', liste: 'Listelenecek sütun (boşsa ilk sütun); en çok 50 madde.',
      kutucuk: 'Önce etiket, sonra değer sütunu, virgülle (boşsa ilk sütun ve ilk sayısal sütun).', pasta: 'Önce etiket, sonra değer sütunu, virgülle; her satır bir dilim.'
    };
    const sutunYardimi = () => YARDIM[gorunum.value] || 'Önce etiket, sonra değer sütunu, virgülle (boşsa ilk iki sütun).';
    const sutunAlani = alan('Sütunlar', sutunlar, { yardim: `${sutunYardimi()}${bilinen && bilinen.length ? ` Son sonuçtaki sütunlar: ${bilinen.join(', ')}.` : ''}` });
    const yardimYaz = () => {
      const y = sutunAlani.querySelector('.yardim');
      if (y) y.textContent = `${sutunYardimi()}${bilinen && bilinen.length ? ` Son sonuçtaki sütunlar: ${bilinen.join(', ')}.` : ''}`;
      esikAlani.hidden = !ESIKLI.includes(gorunum.value);
      yuzdeAlanlari.hidden = gorunum.value !== 'yuzde';
    };
    // Kart parametreleri: sorgudaki :ad için kart başlığında seçim kutusu (seçenekler her satırda bir değer).
    const parametreListesi = h('div', { class: 'pano-parametre-listesi' });
    const parametreEkle = h('button', { type: 'button', class: 'kucuk-dugme hayalet' }, ikon('arti'), 'Parametre ekle');
    const parametreSatiri = (p = { ad: '', etiket: '', secenekler: [] }) => {
      const ad = h('input', { type: 'text', value: p.ad ? `:${p.ad}` : '', placeholder: ':servis', autocomplete: 'off', spellcheck: 'false', class: 'mono', 'aria-label': 'Parametre adı (sorguda)' });
      const etiket = h('input', { type: 'text', maxlength: 40, value: p.etiket || '', placeholder: 'Servis', autocomplete: 'off', 'aria-label': 'Parametre etiketi (kartta)' });
      const secenekler = h('textarea', { rows: 2, spellcheck: 'false', 'aria-label': 'Parametre seçenekleri (her satırda bir değer)', placeholder: 'Her satırda bir değer' });
      secenekler.value = (p.secenekler || []).join('\n');
      const sil = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'aria-label': 'Parametreyi kaldır' }, ikon('carpi'));
      const satir = h('div', { class: 'pano-parametre-satiri' }, ad, etiket, secenekler, sil);
      sil.addEventListener('click', () => { satir.remove(); parametreEkle.disabled = parametreListesi.children.length >= EN_COK_KART_PARAMETRESI; });
      parametreListesi.append(satir);
      parametreEkle.disabled = parametreListesi.children.length >= EN_COK_KART_PARAMETRESI;
    };
    for (const p of a.parametreler || []) parametreSatiri(p);
    parametreEkle.addEventListener('click', () => parametreSatiri());
    const parametreAlani = h('fieldset', { class: 'pano-parametre-alani' }, h('legend', {}, 'Kart parametreleri'),
      h('p', { class: 'soluk kucuk' }, 'Sorguda :ad yazın (ör. WHERE SERVICENAME = :servis). Kartın başlığında seçim kutusu olur; seçilen değer parametre olarak bağlanır ve kart yenilenir.'),
      parametreListesi, parametreEkle);
    // Kutucuğa tıklayınca: başka bir SQL kartının parametresi (yalnız "Durum kutucukları").
    const hedefler = etkinDuzen().kartlar.filter((x) => x.tur === 'sql' && (!mevcut || x.id !== mevcut.id))
      .flatMap((x) => (x.ayar.parametreler || []).map((/** @type {{ ad: string; etiket: string }} */ p) => ({ deger: `${x.id}|${p.ad}`, ad: `${x.ayar.baslik} › ${p.etiket}` })));
    const tiklamaDegeri = a.tiklama ? `${a.tiklama.kartId}|${a.tiklama.parametre}` : '';
    const tiklama = h('select', {}, h('option', { value: '' }, 'Hiçbir şey yapma'),
      hedefler.map((x) => h('option', { value: x.deger, selected: x.deger === tiklamaDegeri }, `${x.ad} seçilsin`)),
      tiklamaDegeri && !hedefler.some((x) => x.deger === tiklamaDegeri) ? h('option', { value: tiklamaDegeri, selected: true }, 'Kaldırılmış kart') : null);
    const tiklamaAlani = alan('Tıklayınca', tiklama, { yardim: hedefler.length
      ? 'Kutucukta etiket, tabloda aşağıdaki sütunun değeri seçilen kartın parametresine yazılır ve o kart yenilenir. Değer o parametrenin seçeneklerinde olmalı.'
      : 'Parametreli başka bir SQL kartı yok: önce bir karta "Kart parametreleri" ekleyin.' });
    // Tablo: tıklanan satırdan hangi sütunun değeri seçilsin; satırlarda "İncele" (satırın tamamı).
    const tiklamaSutunu = h('input', { type: 'text', value: a.tiklama?.sutun || '', autocomplete: 'off', spellcheck: 'false', placeholder: 'ör. SERVIS' });
    const tiklamaSutunAlani = alan('Seçilecek değerin sütunu (tablo)', tiklamaSutunu);
    const satirIncele = h('input', { type: 'checkbox', checked: a.satirIncele === true });
    // İncele sorgusu (isteğe bağlı): İncele penceresinde satırın altında ayrıntı tablosu (ör. o hataya ait son 10 kayıt).
    const inceleSorgusu = h('textarea', { rows: 5, class: 'mono pano-incele-sorgusu', spellcheck: 'false', maxlength: 20000,
      placeholder: 'ör. SELECT … FROM … WHERE METOT = :METOT AND HATA = :HATA FETCH FIRST 10 ROWS ONLY' });
    inceleSorgusu.value = a.inceleSorgusu || '';
    const inceleSorguAlani = alan('İncele\'de çalışacak sorgu (isteğe bağlı)', inceleSorgusu, { yardim: 'İncele\'ye basınca bu sorgu çalışır ve sonucu satırın altında '
      + 'tablo olarak gösterilir. Tıklanan satırın sütunlarını :SUTUN_ADI (ör. :METOT), kartın parametrelerini :ad, dönemi :baslangic / :bitis olarak '
      + 'kullanın; değerler parametre olarak bağlanır. Yalnız okuma; sonuç maskelenir. Boşsa İncele yalnız satırı gösterir.' });
    const satirInceleAlani = h('div', {}, h('label', { class: 'secenek' }, satirIncele, 'Satırlarda "İncele" düğmesi (satırın tüm sütunları)'), inceleSorguAlani);
    const inceleGoster = () => { inceleSorguAlani.hidden = !satirIncele.checked; };
    satirIncele.addEventListener('change', inceleGoster);
    inceleGoster();
    // Sütun biçimleri (yalnız "Tablo"): sütun + biçim türü + türüne göre ayar (kurallar / eşikler metni, artış iyi, alttaki sütun).
    const bicimListesi = h('div', { class: 'pano-sutun-bicimleri' });
    const bicimEkle = h('button', { type: 'button', class: 'kucuk-dugme hayalet' }, ikon('arti'), 'Sütun biçimi ekle');
    const sutunOnerileri = h('datalist', { id: yeniKimlik('pano-sutunlar') }, (bilinen || []).map((x) => h('option', { value: x })));
    tiklamaSutunu.setAttribute('list', sutunOnerileri.id);
    esikSutunu.setAttribute('list', sutunOnerileri.id);
    const kuralMetni = (/** @type {any} */ x) => (x.tur === 'rozet' ? (x.kurallar || []).map((k) => `${k.deger} = ${ROZET_RENKLERI.find((r) => r.anahtar === k.renk)?.ad.toLocaleLowerCase('tr-TR') ?? k.renk}`)
      : (x.esikler || []).map((e) => `${e.islec} ${String(e.deger).replace('.', ',')} = ${ROZET_RENKLERI.find((r) => r.anahtar === e.renk)?.ad.toLocaleLowerCase('tr-TR') ?? e.renk}`)).join('\n');
    const bicimSatiri = (x = { sutun: '', tur: 'rozet' }) => {
      const sutun = h('input', { type: 'text', value: x.sutun || '', list: sutunOnerileri.id, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Biçimlenen sütun', placeholder: 'ör. DURUM' });
      const tur = h('select', { 'aria-label': 'Biçim türü' }, SUTUN_BICIM_TURLERI.map((t) => h('option', { value: t.anahtar, selected: t.anahtar === x.tur }, t.ad)));
      const kurallar = h('textarea', { rows: 3, spellcheck: 'false', 'aria-label': 'Kurallar (her satırda bir kural)' });
      kurallar.value = x.tur === 'rozet' || x.tur === 'renk' ? kuralMetni(x) : '';
      const artis = h('input', { type: 'checkbox', checked: x.artisIyi === true });
      const artisEtiketi = h('label', { class: 'secenek' }, artis, 'Artış iyi (yeşil)');
      const alt = h('input', { type: 'text', value: x.altSutun || '', list: sutunOnerileri.id, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Alttaki sütun', placeholder: 'ör. ACIKLAMA' });
      const ayarKap = h('div', {});
      const ayarCiz = () => {
        kurallar.placeholder = tur.value === 'rozet' ? 'Kritik = kırmızı\nUyarı = sarı\nSağlıklı = yeşil' : '> 3 = kırmızı\n>= 1 = sarı';
        yerlestir(ayarKap, tur.value === 'rozet' || tur.value === 'renk' ? kurallar : tur.value === 'degisim' ? artisEtiketi
          : tur.value === 'altSatir' ? alt : h('span', { class: 'soluk kucuk' }, tur.value === 'cubuk' ? 'Değer 0–100 (yüzde) yatay çubuk olarak.' : tur.value === 'etiket' ? 'Her değer renkli etiket olarak.' : '0 dışı değer kırmızı rozet.'));
      };
      tur.addEventListener('change', ayarCiz);
      ayarCiz();
      const sil = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'aria-label': 'Sütun biçimini kaldır' }, ikon('carpi'));
      const satir = h('div', { class: 'pano-sutun-bicimi' }, sutun, tur, ayarKap, sil);
      /** @type {any} */ (satir).oku = () => {
        const ad = sutun.value.trim();
        if (!ad) return null;
        const t = tur.value;
        if (t === 'rozet') { const o = rozetKurallariniOku(kurallar.value); if (o.hatalar.length) throw new Error(`${ad}: ${o.hatalar[0]}`); return { sutun: ad, tur: t, kurallar: o.kurallar }; }
        if (t === 'renk') { const o = esikleriOku(kurallar.value); if (o.hatalar.length) throw new Error(`${ad}: ${o.hatalar[0]}`); return { sutun: ad, tur: t, esikler: o.esikler }; }
        if (t === 'degisim') return { sutun: ad, tur: t, ...(artis.checked ? { artisIyi: true } : {}) };
        if (t === 'altSatir') return { sutun: ad, tur: t, altSutun: alt.value.trim() };
        return { sutun: ad, tur: t };
      };
      sil.addEventListener('click', () => { satir.remove(); bicimEkle.disabled = bicimListesi.children.length >= EN_COK_SUTUN_BICIMI; });
      bicimListesi.append(satir);
      bicimEkle.disabled = bicimListesi.children.length >= EN_COK_SUTUN_BICIMI;
    };
    for (const x of a.sutunBicimleri || []) bicimSatiri(x);
    bicimEkle.addEventListener('click', () => bicimSatiri());
    const bicimlerAlani = h('fieldset', { class: 'pano-sutun-bicim-alani' }, h('legend', {}, 'Sütun biçimleri'),
      h('p', { class: 'soluk kucuk' }, 'Hücreyi değerine göre rozet, renkli sayı, değişim oku (▲ / ▼) ya da sayaç rozeti olarak gösterir; "Altına başka sütun" iki sütunu alt alta yazar (ör. hata kodu ve açıklaması).'),
      sutunOnerileri, bicimListesi, bicimEkle);
    // Görünüm ayrıntıları: simge (tüm görünümler), "Tek sayı" / "Sayı + değişim"de alt metin, ikinci sütun ve kart tonu.
    const simge = h('select', {}, h('option', { value: '' }, 'Varsayılan'), KART_SIMGELERI.map((x) => h('option', { value: x.anahtar, selected: x.anahtar === a.simge }, x.ad)));
    const altMetin = h('input', { type: 'text', maxlength: 80, value: a.altMetin || '', autocomplete: 'off', placeholder: 'Boşsa değer sütununun adı' });
    const ikinciTur = h('select', { 'aria-label': 'İkinci sütunun türü' }, [['yok', 'Yok'], ['toplam', 'Toplam ("8 / 10" + çubuk)'], ['karsilastir', 'Karşılaştır (▲ / ▼ yüzde; ör. dün)']]
      .map(([d, e]) => h('option', { value: d, selected: d === (a.ikinci?.tur || 'yok') }, e)));
    const ikinciSutun = h('input', { type: 'text', value: a.ikinci?.sutun || '', list: sutunOnerileri.id, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'İkinci sütun', placeholder: 'ör. DUN' });
    const ikinciArtis = h('input', { type: 'checkbox', checked: a.ikinci?.artisIyi === true });
    const kartTonu = h('input', { type: 'checkbox', checked: a.kartTonu === true });
    const seriSutunu = h('input', { type: 'text', value: a.seriSutunu || '', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Mini trend sütunu', placeholder: 'ör. SERI (1,0,2,3)' });
    seriSutunu.setAttribute('list', sutunOnerileri.id);
    const seriAlani = alan('Mini trend sütunu (kutucuk; virgülle sayılar)', seriSutunu);
    const sayiAyrintilari = h('div', { class: 'pano-bicim-izgara' }, alan('Alt metin', altMetin),
      alan('İkinci sütun', h('div', { class: 'pano-ikinci' }, ikinciTur, ikinciSutun, h('label', { class: 'secenek' }, ikinciArtis, 'Artış iyi'))),
      h('label', { class: 'secenek' }, kartTonu, 'Kartı eşik rengiyle tonla'));
    const ayrintiAlani = h('fieldset', { class: 'pano-ayrinti-alani' }, h('legend', {}, 'Görünüm ayrıntıları'), alan('Simge', simge), sayiAyrintilari, seriAlani);
    const tiklamaGoster = () => {
      tiklamaAlani.hidden = !['kutucuk', 'tablo'].includes(gorunum.value);
      tiklamaSutunAlani.hidden = gorunum.value !== 'tablo';
      satirInceleAlani.hidden = gorunum.value !== 'tablo';
      bicimlerAlani.hidden = gorunum.value !== 'tablo';
      sayiAyrintilari.hidden = !['sayi', 'degisim', 'kutucuk', 'cizgi'].includes(gorunum.value);
      seriAlani.hidden = gorunum.value !== 'kutucuk';
    };
    gorunum.addEventListener('change', tiklamaGoster);
    tiklamaGoster();
    gorunum.addEventListener('change', yardimYaz);
    const bos = !se.veritabanlari.length && !se.baglantilar.length;
    yerlestir(kapsayici, 
      bos ? h('div', { class: 'not-kutusu uyari' }, 'Bu projede henüz veritabanı bağlantısı yok. ', h('a', { href: '#/ayarlar/entegrasyonlar' }, 'Ayarlar > Entegrasyonlar'),
        '\'dan "Veritabanı bağlantısı" ekleyin.') : null,
      alan('Kart başlığı', baslik, { zorunlu: true }),
      alan('Veritabanı bağlantısı', hedef, { zorunlu: true, yardim: 'Nöbetçi\'de tanımlı bağlantılar (Ayarlar > Entegrasyonlar). CANLI ortama ait bağlantıda ilk "Yenile" onay ister.' }),
      alan('Sorgu', sorgu, { zorunlu: true, yardim: `Yalnız okuma: tek SELECT ya da WITH … SELECT (INSERT, UPDATE, DELETE, DROP, EXEC ve ";" ile birden çok ifade reddedilir). Sorgu yalnız "Yenile"ye basınca çalışır; en çok ${se.sinirlar?.satirSiniri ?? 500} satır. Gizli adlı sütunlar (T.C. kimlik, kart, IBAN, parola…) maskelenir.` }),
      h('p', { class: 'soluk kucuk pano-donem-yardimi' }, ikon('takvim'), 'Sorguda :baslangic ve :bitis kullanırsanız kartta dönem seçebilirsiniz (ör. WHERE tarih BETWEEN :baslangic AND :bitis); değerler parametre olarak bağlanır.'),
      alan('Zaman aşımı (sn)', zamanAsimi, { yardim: 'Sorgu bu süre içinde bitmezse kart hata gösterir; yavaş sorgularda artırın.' }),
      alan('Görünüm', gorunum),
      sutunAlani,
      tiklamaAlani,
      tiklamaSutunAlani,
      satirInceleAlani,
      ayrintiAlani,
      bicimlerAlani,
      bicimAlani,
      esikAlani,
      parametreAlani);
    yardimYaz();
    return async () => {
      const [t, x, y] = hedef.value.split(':');
      // Boşsa varsayılan (kaydedilmez); 1–120 dışı sınıra çekilir (sunucu da sınırlar).
      const zaman = sqlZamanAsimiTemizle(zamanAsimi.value);
      const ayarYeni = {
        baslik: baslik.value.trim(), sorgu: sorgu.value, gorunum: gorunum.value,
        ...(zaman === undefined ? {} : { zamanAsimiSn: zaman }),
        hedef: t === 'v' ? { veritabaniId: x, ortamId: y } : t === 'b' ? { baglantiId: x } : null,
        sutunlar: sutunlar.value.split(',').map((m) => m.trim()).filter(Boolean),
        esikler: ESIKLI.includes(gorunum.value) ? [...esikListesi.children].map((satir) => {
          const [islec, renk] = [...satir.querySelectorAll('select')].map((x2) => /** @type {HTMLSelectElement} */ (x2).value);
          return { islec, deger: /** @type {HTMLInputElement} */ (satir.querySelector('input')).value.trim(), renk };
        }) : [],
        bicim: bicimTemizle({ ondalik: ondalik.value, onEk: onEk.value, sonEk: sonEk.value, tarih: tarih.value, oran: oran.value,
          hedef: gorunum.value === 'yuzde' ? hedefDeger.value : '', gosterge: gosterge.value }),
        parametreler: [...parametreListesi.children].map((satir) => {
          const [ad, etiket] = [...satir.querySelectorAll('input')].map((x2) => /** @type {HTMLInputElement} */ (x2).value.trim());
          const secenekler = /** @type {HTMLTextAreaElement} */ (satir.querySelector('textarea')).value.split('\n').map((m) => m.trim()).filter(Boolean);
          return { ad: ad.replace(/^:/, ''), etiket, secenekler };
        }).filter((p) => p.ad || p.etiket || p.secenekler.length),
        ...(simge.value ? { simge: simge.value } : {}),
        ...(gorunum.value === 'kutucuk' && seriSutunu.value.trim() ? { seriSutunu: seriSutunu.value.trim() } : {}),
        ...(['sayi', 'kutucuk'].includes(gorunum.value) && esikSutunu.value.trim() ? { esikSutunu: esikSutunu.value.trim() } : {}),
        ...(['sayi', 'degisim', 'kutucuk', 'cizgi'].includes(gorunum.value) ? {
          ...(altMetin.value.trim() ? { altMetin: altMetin.value.trim() } : {}),
          ...(ikinciTur.value !== 'yok' ? { ikinci: { tur: ikinciTur.value, sutun: ikinciSutun.value.trim(), ...(ikinciArtis.checked ? { artisIyi: true } : {}) } } : {}),
          ...(kartTonu.checked ? { kartTonu: true } : {})
        } : {}),
        sutunBicimleri: gorunum.value === 'tablo' ? [...bicimListesi.children].map((x2) => /** @type {any} */ (x2).oku()).filter(Boolean) : (a.sutunBicimleri || []),
        ...(['kutucuk', 'tablo'].includes(gorunum.value) && tiklama.value ? { tiklama: { kartId: tiklama.value.split('|')[0], parametre: tiklama.value.split('|')[1],
          ...(gorunum.value === 'tablo' && tiklamaSutunu.value.trim() ? { sutun: tiklamaSutunu.value.trim() } : {}) } } : {}),
        ...(gorunum.value === 'tablo' && satirIncele.checked ? { satirIncele: true, ...(inceleSorgusu.value.trim() ? { inceleSorgusu: inceleSorgusu.value } : {}) } : {})
      };
      if (!ayarYeni.baslik) throw new Error('Kart başlığı boş olamaz.');
      if (!ayarYeni.hedef) throw new Error('SQL kartı için bir veritabanı bağlantısı seçin.');
      // Yalnız okuma kuralı sunucuda denetlenir (bağlantı açılmaz): kaydetmeden önce uyarı.
      await api('/platform/pano/sql/denetle', { govde: { projeId: proje.id, sorgu: ayarYeni.sorgu } });
      if (ayarYeni.inceleSorgusu) {
        try { await api('/platform/pano/sql/denetle', { govde: { projeId: proje.id, sorgu: ayarYeni.inceleSorgusu } }); } catch (e) {
          throw new Error(`İncele sorgusu: ${e && e.message ? e.message : String(e)}`);
        }
      }
      return ayarYeni;
    };
  }

  /** @returns {() => Promise<any>} */
  function veriFormu(kapsayici, ayar, se) {
    const a = ayar || {};
    const sablon = h('select', {}, VERI_SABLONLARI.map((t) => h('option', { value: t.anahtar, selected: t.anahtar === (a.sablon || VERI_SABLONLARI[0].anahtar) }, t.ad)));
    const baslik = h('input', { type: 'text', maxlength: 80, value: a.baslik || '', autocomplete: 'off', placeholder: 'Boşsa şablonun adı' });
    const aciklama = h('p', { class: 'soluk kucuk' });
    const parametreKap = h('div', { class: 'pano-parametreler' });
    /** @type {Map<string, HTMLInputElement | HTMLSelectElement>} */
    let girdiler = new Map();
    const parametreleriCiz = () => {
      const t = VERI_SABLONLARI.find((x) => x.anahtar === sablon.value) || VERI_SABLONLARI[0];
      aciklama.textContent = t.aciklama;
      const eski = a.sablon === t.anahtar ? a.parametreler || {} : {};
      girdiler = new Map();
      yerlestir(parametreKap, ...t.parametreler.map((p) => {
        let g;
        if (p.tur === 'hedef') {
          g = h('select', {}, h('option', { value: '' }, 'Seçin'), se.hedefler.map((x) => h('option', { value: x.deger, selected: x.deger === eski[p.ad] }, x.ad)));
        } else if (p.tur === 'sayi') {
          g = h('input', { type: 'number', min: p.en, max: p.enCok, step: 1, value: String(eski[p.ad] ?? p.varsayilan) });
        } else {
          g = h('select', {}, (p.secenekler || []).map(([d, e]) => h('option', { value: d, selected: d === (eski[p.ad] ?? p.varsayilan) }, e)));
        }
        girdiler.set(p.ad, g);
        return alan(p.etiket, g, { zorunlu: p.tur === 'hedef' });
      }));
    };
    sablon.addEventListener('change', parametreleriCiz);
    yerlestir(kapsayici, alan('Şablon', sablon, { zorunlu: true }), aciklama, parametreKap, alan('Kart başlığı', baslik));
    parametreleriCiz();
    return async () => ({
      sablon: sablon.value, baslik: baslik.value.trim(),
      parametreler: Object.fromEntries([...girdiler].map(([ad, g]) => [ad, g.value]))
    });
  }

  /** @returns {() => Promise<any>} */
  function metinFormu(kapsayici, ayar) {
    const a = ayar || {};
    const baslik = h('input', { type: 'text', maxlength: 80, value: a.baslik || '', autocomplete: 'off' });
    const not = h('textarea', { rows: 4, maxlength: 1000 });
    not.value = a.not || '';
    const liste = h('div', { class: 'pano-baglanti-listesi' });
    const ekle = h('button', { type: 'button', class: 'kucuk-dugme hayalet' }, ikon('arti'), 'Bağlantı ekle');
    const satirEkle = (b = { etiket: '', adres: IC_SAYFALAR[0][1] }) => {
      const adres = h('select', { 'aria-label': 'Bağlantının sayfası' }, IC_SAYFALAR.map(([e, d]) => h('option', { value: d, selected: d === b.adres }, e)),
        IC_SAYFALAR.some(([, d]) => d === b.adres) ? null : h('option', { value: b.adres, selected: true }, b.adres));
      const etiket = h('input', { type: 'text', maxlength: 60, value: b.etiket, 'aria-label': 'Bağlantı metni', placeholder: 'Bağlantı metni' });
      const sil = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'aria-label': 'Bağlantıyı kaldır' }, ikon('carpi'));
      const satir = h('div', { class: 'pano-baglanti-satiri' }, adres, etiket, sil);
      adres.addEventListener('change', () => { if (!etiket.value.trim()) etiket.value = adres.selectedOptions[0]?.textContent || ''; });
      sil.addEventListener('click', () => { satir.remove(); ekle.disabled = liste.children.length >= EN_COK_BAGLANTI; });
      liste.append(satir);
      ekle.disabled = liste.children.length >= EN_COK_BAGLANTI;
    };
    for (const b of a.baglantilar || []) satirEkle(b);
    ekle.addEventListener('click', () => satirEkle());
    yerlestir(kapsayici, alan('Kart başlığı', baslik, { zorunlu: true }), alan('Not', not, { yardim: 'En çok 1000 karakter.' }),
      h('fieldset', { class: 'pano-baglanti-alani' }, h('legend', {}, 'Bağlantılar (Nöbetçi içindeki sayfalar)'), liste, ekle));
    return async () => ({
      baslik: baslik.value.trim(), not: not.value,
      baglantilar: [...liste.children].map((satir) => ({
        adres: /** @type {HTMLSelectElement} */ (satir.querySelector('select')).value,
        etiket: /** @type {HTMLInputElement} */ (satir.querySelector('input')).value.trim() || /** @type {HTMLSelectElement} */ (satir.querySelector('select')).selectedOptions[0]?.textContent || ''
      }))
    });
  }

  // ---- Kullanıcı kartları -----------------------------------------------------------------------------------------------
  /** SQL kartı: yalnız "Yenile"ye basınca çalışır; son sonuç ve alındığı saat üstte. */
  /** SQL kartının başlığındaki parametre seçimleri (ayar.parametreler; seçim hemen kaydedilir ve kart yenilenir). @param {any} k */
  function parametreSecimleri(k) {
    return (k.ayar.parametreler || []).map((/** @type {{ ad: string; etiket: string; secenekler: string[] }} */ p) => {
      const deger = kartParametreDegeri(k, p.ad);
      const sec = h('select', { class: 'pano-parametre-secimi', 'aria-label': `${p.etiket}: ${k.ayar.baslik}` },
        p.secenekler.map((x) => h('option', { value: x, selected: x === deger }, x)));
      sec.addEventListener('change', () => parametreSec(k.id, p.ad, sec.value));
      return h('label', { class: 'pano-parametre' }, h('span', { class: 'soluk kucuk' }, p.etiket), sec);
    });
  }

  /**
   * Kutucuk görünümünde tıklama: kartın ayarındaki hedef (tiklama: { kartId, parametre }) panoda varsa, kutucuğun etiketi o kartın
   * parametresine seçilir. Hedefin seçili değeri kutucukta işaretlenir. @param {any} a
   */
  function kutucukTiklamasi(a) {
    const t = a.tiklama;
    const hedef = t && etkinDuzen().kartlar.find((x) => x.id === t.kartId && x.tur === 'sql');
    const p = hedef && (hedef.ayar.parametreler || []).find((/** @type {{ ad: string }} */ x) => x.ad === t.parametre);
    if (!hedef || !p) return {};
    return {
      secili: kartParametreDegeri(hedef, p.ad),
      hedefAdi: `${hedef.ayar.baslik} › ${p.etiket}`,
      tikla: (/** @type {string} */ etiket) => {
        if (!p.secenekler.includes(etiket)) { bildir(`"${etiket}", ${hedef.ayar.baslik} kartının ${p.etiket} seçeneklerinde yok (kartın ayarından ekleyin).`, 'hata'); return; }
        parametreSec(hedef.id, p.ad, etiket, { kaydir: true });
      }
    };
  }

  function sqlKarti(k) {
    let a = k.ayar;
    const basId = yeniKimlik('pano-sql');
    const sonVeri = h('p', { class: 'pano-son-veri' });
    const govde = h('div', { class: 'pano-sql-govde' });
    const durum = h('div', { class: 'pano-durum soluk kucuk', role: 'status' });
    const hata = h('div', { class: 'not-kutusu hata', role: 'alert', hidden: true });
    const hedefRozeti = h('span', { class: 'pano-hedef' });
    const yenile = h('button', { type: 'button', class: 'kucuk-dugme pano-yenile', 'aria-label': `Yenile: ${a.baslik}`, title: 'Sorguyu şimdi çalıştır' }, ikon('yenile'), 'Yenile');
    // Sorguda :baslangic / :bitis varsa kart başlığında dönem seçimi (değerler sunucuda sürücü parametresi olarak bağlanır).
    const donemli = kartDonemliMi(k);
    const sonucCiz = (sonuc) => {
      if (!sonuc) {
        yerlestir(sonVeri, ikon('saat'), 'Henüz yenilenmedi');
        yerlestir(govde, h('p', { class: 'soluk kucuk pano-bos-sonuc' }, 'Henüz veri yok — Yenile\'ye basın.'));
        return;
      }
      // Dönemli sonuç: hangi dönemle alındığı; kartın dönemi sonradan değiştiyse Yenile gerektiği söylenir (sorgu kendiliğinden çalışmaz).
      const farkli = donemli && sonuc.donem && JSON.stringify(sonuc.donem.secim) !== JSON.stringify(k.donem || gocDonemi());
      yerlestir(sonVeri, ikon('saat'), `Son veri: ${sonVeriMetni(sonuc.zaman)}`,
        sonuc.donem ? h('span', { class: 'pano-sonuc-donemi' }, ` · ${donemMetni(sonuc.donem.secim)}`) : null,
        sonuc.kesildi ? h('span', { class: 'pano-kesildi' }, ` · ilk ${Number(sonuc.satirSiniri || sonuc.satirlar.length).toLocaleString('tr-TR')} satır`) : null,
        farkli ? h('span', { class: 'pano-donem-farki' }, ` · Seçili dönem (${donemMetni(k.donem || gocDonemi())}) için Yenile'ye basın.`) : null,
        // Kart parametresi: sonuç hangi değerle alındı; seçim sonradan değiştiyse (ör. yenileme başarısız) Yenile gerektiği söylenir.
        sonuc.parametreler ? h('span', { class: 'pano-sonuc-parametresi' }, ` · ${Object.values(sonuc.parametreler).join(' · ')}`) : null,
        sonuc.parametreler && JSON.stringify(sonuc.parametreler) !== JSON.stringify(kartParametreleri(k))
          ? h('span', { class: 'pano-donem-farki' }, ` · Seçili ${Object.values(kartParametreleri(k)).join(' · ')} için Yenile'ye basın.`) : null,
        // Pano ortamı değiştiyse sonuç eski ortamın: Yenile gerektiği söylenir.
        sonuc.ortamId && etkinHedef(k, kayitli.duzen).ortamId !== sonuc.ortamId
          ? h('span', { class: 'pano-donem-farki' }, ' · Sonuç başka bir ortamın; seçili ortam için Yenile\'ye basın.') : null);
      // Sayı / yüzde / değişim: sabit ya da eşitlenmiş yükseklikte dikeyde ortalanır.
      govde.classList.toggle('dikey-orta', ['sayi', 'yuzde', 'degisim'].includes(a.gorunum));
      // Tablo yeniden kurulurken (sıralama, sütun taşıma / gizleme / genişlik) eski tablonun yüksekliği bir anlık sabitlenir ve
      // tablonun yatay / dikey kaydırması ile sayfanın kaydırma konumu korunur.
      kaydirmayiKoru(() => {
        const eski = /** @type {HTMLElement | null} */ (govde.querySelector('.pano-tablo'));
        const konum = eski ? [eski.scrollLeft, eski.scrollTop] : null;
        if (eski) govde.style.setProperty('--pano-govde-yukseklik', `${Math.ceil(govde.getBoundingClientRect().height)}px`);
        yerlestir(govde, a.gorunum === 'tablo'
          ? tabloGorunumu(a, sonuc, { siralama, odak: tabloOdak, sirala: tabloSirala, kaydet: tabloKaydet,
            goster: (g) => metinPenceresi({ ...g, proje, kartBaslik: a.baslik, zaman: sonuc.zaman }),
            incele: (g) => satirPenceresi({ ...g, sutunlar: sonuc.sutunlar, gizliSutunlar: sonuc.gizliSutunlar || [], kartBaslik: a.baslik, bicim: a.bicim,
              goster: (x) => metinPenceresi({ ...x, proje, kartBaslik: a.baslik, zaman: sonuc.zaman }),
              // İncele sorgusu: önbellekteki sonucun satırı sunucuda bulunur (satır gönderilmez). CANLI ortamda kartın bu oturumdaki
              // onayı geçerlidir; onay yoksa standart CANLI penceresi bir kez açılır (api) ve sonra kart için hatırlanır.
              ...(a.inceleSorgusu ? { ayrinti: async () => {
                const y = await api(INCELE_UCU, { govde: { projeId: proje.id, kartId: k.id, satirIndeksi: sonuc.satirlar.indexOf(g.satir), zaman: sonuc.zaman,
                  ...(canliOnaylari.has(onayAnahtari(k)) ? { canliOnay: true } : {}) } });
                canliOnaylari.add(onayAnahtari(k));
                return y.sonuc;
              }, gosterAyrinti: (x) => metinPenceresi({ ...x, proje, kartBaslik: a.baslik, zaman: sonuc.zaman }) } : {}) }),
            ...(() => { const kt = kutucukTiklamasi(a); return kt.tikla ? { satirSec: kt.tikla, secili: kt.secili, hedefAdi: kt.hedefAdi } : {}; })() })
          : sonucGorunumu(a, sonuc, kutucukTiklamasi(a)));
        const yeni = /** @type {HTMLElement | null} */ (govde.querySelector('.pano-tablo'));
        if (yeni && konum) { yeni.scrollLeft = konum[0]; yeni.scrollTop = konum[1]; }
        govde.style.removeProperty('--pano-govde-yukseklik');
      });
      tabloOdak = null;
      tonla();
    };
    /** Kart tonu (ayarda açıksa): sonucun eşik rengi kartın zeminine / kenarına yansır. */
    const tonla = () => {
      const bolum = govde.closest('section');
      if (!bolum) return;
      const esik = a.kartTonu ? /** @type {HTMLElement | null} */ (govde.querySelector('[data-esik]'))?.dataset.esik || '' : '';
      for (const r of ['kirmizi', 'sari', 'yesil']) bolum.classList.toggle(`pano-kart-ton-${r}`, esik === r);
    };
    // Tablo: sıralama yalnız ekranda; sütun sırası / görünürlük / genişlik kartın ayarına hemen kaydedilir (düzenleme kipi gerekmez;
    // hedef ve sorgu değişmediğinden önbellekteki sonuç ve "Son veri" korunur, sorgu çalışmaz).
    const siralama = { ad: '', yon: '' };
    /** @type {{ ad: string; rol: string } | null} */
    let tabloOdak = null;
    const tabloSirala = (/** @type {string} */ ad, odak) => {
      siralama.yon = siralama.ad === ad ? SIRA_SONRAKI[siralama.yon] : 'artan';
      siralama.ad = siralama.yon ? ad : '';
      tabloOdak = odak;
      sonucCiz(kayitli.sqlSonuclari[k.id]);
      duyur(siralama.yon ? `${ad} sütununa göre ${siralama.yon} sıralandı.` : 'Sıralama kaldırıldı.');
    };
    const tabloKaydet = async (/** @type {string[]} */ sutunlar, /** @type {Record<string, number>} */ genislikler, odak) => {
      const onceki = a;
      a = { ...a, sutunlar, sutunGenislikleri: genislikler };
      tabloOdak = odak;
      sonucCiz(kayitli.sqlSonuclari[k.id]);
      try {
        const y = await api('/platform/pano/tablo-ayari', { govde: { projeId: proje.id, kartId: k.id, sutunlar, sutunGenislikleri: genislikler } });
        kayitli = { duzen: y.duzen, sqlSonuclari: y.sqlSonuclari || kayitli.sqlSonuclari };
        if (calisan) {
          const c = calisan.kartlar.find((x) => x.id === k.id);
          if (c) calisan = kartAyarla(calisan, k.id, { ...c.ayar, sutunlar, sutunGenislikleri: genislikler });
        }
        // Kart yeniden kurulmasın (odak ve sıralama korunur): öğenin imzası güncel ayarla eşitlenir.
        const guncel = etkinDuzen().kartlar.find((x) => x.id === k.id);
        if (guncel) { a = guncel.ayar; const o = ogeler.get(k.id); if (o) o.imza = kartImzasi(guncel, etkinDuzen()); }
      } catch (e) {
        a = onceki;
        sonucCiz(kayitli.sqlSonuclari[k.id]);
        if (!(e && e.durum === 423)) bildir(e && e.message ? e.message : String(e), 'hata');
      }
    };
    sonucCiz(kayitli.sqlSonuclari[k.id]);
    secenekler().then((se) => {
      const h0 = etkinHedef(k, kayitli.duzen);
      if (h0.veritabaniId) {
        const v = se.veritabanlari.find((x) => x.id === h0.veritabaniId);
        const o = v && v.ortamlar.find((x) => x.id === h0.ortamId);
        // Panonun ortamı seçiliyse ortam üst şeritte yazılı: kart ayrıca veritabanı / ortam / CANLI rozeti göstermez.
        if (kayitli.duzen.ortamId && v && o) { yerlestir(hedefRozeti); return; }
        yerlestir(hedefRozeti,rozet(v ? `${v.ad}${o ? ` · ${o.ad}` : ''}` : 'bağlantı bulunamadı', v ? '' : 'hata', { kisalt: true }), o && o.canli ? rozet('CANLI ortam', 'hata') : null);
      } else {
        const b = se.baglantilar.find((x) => x.id === h0.baglantiId);
        yerlestir(hedefRozeti, rozet(b ? b.ad : 'bağlantı bulunamadı', b ? '' : 'hata', { kisalt: true }), b && b.canli ? rozet('CANLI ortam', 'hata') : null);
      }
    }).catch(() => { /* rozet olmadan da kart çalışır */ });
    // Kartı yenileyen işlev (Yenile düğmesi, parametre seçimi, Tümünü yenile ve otomatik yenileme aynısını çağırır).
    const calistir = async () => {
      hata.hidden = true;
      govde.classList.add('yenileniyor');
      // Yükleniyor durumu yanıt gelene dek (en çok kartın zaman aşımı kadar) kalır; diğer kartlar bağımsızdır.
      let zs;
      try { zs = sqlZamanAsimiTemizle(a.zamanAsimiSn); } catch { zs = undefined; }
      yerlestir(durum, h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), `Sorgu çalışıyor… (en çok ${zs ?? SQL_ZAMAN_ASIMI_SN.varsayilan} sn)`);
      try {
        const y = await mesgulIken(yenile, 'Yenileniyor…', () => api(SQL_UCU, {
          govde: { projeId: proje.id, kartId: k.id, ...(canliOnaylari.has(onayAnahtari(k)) ? { canliOnay: true } : {}) }
        }));
        // Onay (CANLI ortamda) bu oturumda bu kart için hatırlanır; CANLI değilse zararsızdır.
        canliOnaylari.add(onayAnahtari(k));
        kayitli.sqlSonuclari[k.id] = y.sonuc;
        sonucCiz(y.sonuc);
        yerlestir(durum, `Güncellendi (${y.sonuc.satirlar.length.toLocaleString('tr-TR')} satır).`);
      } catch (e) {
        yerlestir(durum);
        if (e && e.durum === 423) return;
        hata.textContent = e && e.message ? e.message : String(e);
        hata.hidden = false;
      } finally {
        govde.classList.remove('yenileniyor');
      }
    };
    yenile.addEventListener('click', calistir);
    yenileyiciler.set(k.id, calistir);
    const bolum = h('section', { class: 'kart pano-karti pano-sql-karti', 'aria-labelledby': basId },
      h('div', { class: 'kart-basligi' }, h('h3', { id: basId }, h('span', { class: `pano-baslik-simgesi${a.simge ? ' secili' : ''}` }, ikon(a.simge || 'veri')), a.baslik),
        h('span', { class: 'sag pano-kart-sag' }, hedefRozeti, parametreSecimleri(k), donemli ? donemSecici(k) : null, yenile)),
      sonVeri, durum, hata, govde);
    tonla();
    return bolum;
  }

  /** Nöbetçi verisi kartı: sayfa açılınca Nöbetçi'nin kendi verisinden hesaplanır (dış istek yok). */
  function veriKarti(k) {
    const a = k.ayar;
    const basId = yeniKimlik('pano-veri');
    const govde = h('div', { class: 'pano-veri-govde' }, h('div', { class: 'iskelet', 'aria-busy': 'true' },
      h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), h('i', {}), h('i', { class: 'yarim' })));
    const sorgu = new URLSearchParams({ projeId: proje.id, sablon: a.sablon, p: JSON.stringify(a.parametreler || {}) });
    api(`/platform/pano/veri?${sorgu}`).then(({ sonuc }) => {
      if (sonuc.tur === 'sayi') {
        govde.classList.add('dikey-orta');
        const sinif = sonuc.deger === null ? '' : `saglik-${oranSaglikSinifi(sonuc.deger)}`;
        const deger = h('strong', { class: 'pano-sayi-deger' }, sonuc.deger === null ? '—'
          : sonuc.birim === '%' ? yuzdeBicimle(sonuc.deger, { oran: 'yuzde' }) : sayiBicimle(sonuc.deger));
        yerlestir(govde, sonuc.adres
          ? h('a', { class: `pano-sayi ${sinif}`, href: sonuc.adres }, deger, h('span', { class: 'pano-sayi-alt' }, sonuc.alt))
          : h('div', { class: `pano-sayi ${sinif}` }, deger, h('span', { class: 'pano-sayi-alt' }, sonuc.alt)));
        return;
      }
      if (!sonuc.toplam) { yerlestir(govde, h('p', { class: 'farkindalik-temiz', role: 'status' }, ikon('onay'), sonuc.bos)); return; }
      yerlestir(govde, 
        h('ul', { class: 'farkindalik-listesi' }, sonuc.maddeler.slice(0, LISTE_ILK).map((m) => h('li', {}, h('a', { href: m.adres, class: 'farkindalik-maddesi' },
          h('span', { class: 'farkindalik-adi' }, m.ad), h('span', { class: 'farkindalik-ayrintisi' }, m.ayrinti))))),
        sonuc.toplam > LISTE_ILK ? h('p', { class: 'soluk kucuk' }, `İlk ${LISTE_ILK} gösteriliyor (toplam ${sonuc.toplam.toLocaleString('tr-TR')}).`) : null);
    }).catch((e) => {
      if (e && e.durum === 423) return;
      yerlestir(govde, h('div', { class: 'not-kutusu hata', role: 'alert' }, e && e.message ? e.message : String(e)));
    });
    return h('section', { class: 'kart pano-karti pano-veri-karti', 'aria-labelledby': basId },
      h('div', { class: 'kart-basligi' }, h('h3', { id: basId }, ikon('grafik'), a.baslik)), govde);
  }

  /** Metin / bağlantı kartı. */
  function metinKarti(k) {
    const a = k.ayar;
    const basId = yeniKimlik('pano-metin');
    return h('section', { class: 'kart pano-karti pano-metin-karti', 'aria-labelledby': basId },
      h('div', { class: 'kart-basligi' }, h('h3', { id: basId }, ikon('dosya'), a.baslik)),
      a.not ? h('p', { class: 'pano-not' }, a.not) : null,
      a.baglantilar && a.baglantilar.length ? h('ul', { class: 'pano-baglantilar' }, a.baglantilar.map((b) => h('li', {}, h('a', { href: b.adres }, ikon('ok'), b.etiket)))) : null);
  }

  // ---- Yükleme ----------------------------------------------------------------------------------------------------------
  pano.append(h('div', { class: 'iskelet pano-iskelet', 'aria-busy': 'true' }, h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), h('i', {}), h('i', { class: 'yarim' })));
  api(`/platform/pano?projeId=${encodeURIComponent(proje.id)}`).then(async (y) => {
    kayitli = { duzen: y.duzen, sqlSonuclari: y.sqlSonuclari || {} };
    // Göç: dönem seçimi olmayan döneme bağlı kartlar eski genel seçimi (yoksa "Tümü") alır ve kayıtlı düzene bir kez yazılır.
    // Hiç kaydedilmemiş (varsayılan) düzen açılışta kaydedilmez: değer yalnız ekranda kullanılır; kullanıcı dönemi seçince yazılır.
    // Izgara göçü: eski (sıralı) düzen sunucuda ızgara konumlarına çevrilmiş gelir ("goc"); bir kez kaydedilir (dönem göçüyle birlikte).
    const eksik = kayitli.duzen.kartlar.filter((k) => kartDonemliMi(k) && !k.donem);
    if (!eksik.length && !y.goc) return;
    const donem = gocDonemi();
    for (const k of eksik) kayitli = { ...kayitli, duzen: kartDonemle(kayitli.duzen, k.id, donem) };
    if (!y.kayitli) return;
    if (y.goc) {
      try {
        const g = await api('/platform/pano/kaydet', { govde: { projeId: proje.id, duzen: kayitli.duzen } });
        kayitli = { duzen: g.duzen, sqlSonuclari: g.sqlSonuclari || kayitli.sqlSonuclari };
      } catch { /* yazılamadıysa bu oturumda çevrilmiş düzen kullanılır; sonraki açılışta yeniden denenir */ }
      return;
    }
    try {
      const g = await api('/platform/pano/donem', { govde: { projeId: proje.id, donemler: Object.fromEntries(eksik.map((k) => [k.id, donem])) } });
      kayitli = { duzen: g.duzen, sqlSonuclari: g.sqlSonuclari || kayitli.sqlSonuclari };
    } catch { /* yazılamadıysa bu oturumda yerel değer kullanılır; sonraki açılışta yeniden denenir */ }
  }).catch((e) => {
    if (e && e.durum === 423) return;
    bildir(`Pano düzeni okunamadı; varsayılan düzen gösteriliyor (${e && e.message ? e.message : String(e)}).`, 'hata');
  }).finally(() => {
    ciz();
    if (s0.altAdres === 'duzenle' || s0.altAdres === 'kart-ekle') {
      duzenlemeyiAc();
      if (s0.altAdres === 'kart-ekle') kartEklePenceresi();
    }
  });
}

// ---- SQL sonucu görünümleri ----------------------------------------------------------------------------------------------
/** Seçilen sütunların sıraları (adı bulunamayan atlanır; hiçbiri yoksa boş). @param {string[]} secili @param {string[]} sutunlar */
function sutunSiralari(secili, sutunlar) {
  return (secili || []).map((ad) => sutunlar.findIndex((x) => x.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))).filter((i) => i >= 0);
}

/** Hücre metni; uzun metin (ör. CLOB) tek satır kısaltılır (tablo dışındaki görünümler). @param {unknown} v @param {any} b */
const kisaBicim = (v, b) => { const m = hucreBicimle(v, b); return uzunMetinMi(m) ? metinKisalt(m) : m; };

/** Eşik renginin ekran okuyucu notu. @param {string | null} renk */
const esikNotu = (renk) => (renk ? h('span', { class: 'gorunmez' }, ` (eşik: ${ESIK_RENKLERI.find((r) => r.anahtar === renk)?.ad ?? renk})`) : null);

/** Değer sütunu: seçilen ilk sütun ya da ilk sütun. @param {number[]} secili */
const degerSirasi = (secili) => (secili.length ? secili[0] : 0);

/** Etiket + değer sütunları (seçilmediyse ilk sütun etiket, ilk sayısal diğer sütun değer). @param {number[]} secili @param {string[]} sutunlar @param {unknown[][]} satirlar */
function etiketDeger(secili, sutunlar, satirlar) {
  const etiketI = secili.length ? secili[0] : 0;
  const degerI = secili.length > 1 ? secili[1] : sutunlar.findIndex((_, i) => i !== etiketI && satirlar.some((r) => sayiyaCevir(r[i]) !== null));
  return { etiketI, degerI };
}

/**
 * Sütun biçimli hücre (hucreSunumu): rozet (renkli, ▲ / ▼ ile), eşik renginde metin, soluk metin ya da alt satırlı hücre.
 * @param {NonNullable<ReturnType<typeof hucreSunumu>>} su @param {boolean} sayi
 */
function bicimliHucre(su, sayi) {
  const renkAdi = (/** @type {string | null | undefined} */ k) => ROZET_RENKLERI.find((x) => x.anahtar === k)?.ad ?? '';
  if (su.tur === 'rozet') {
    // Etiket (her değer): noktasız sade rozet.
    const isaret = su.ok ? h('span', { class: 'pano-rozet-ok', 'aria-hidden': 'true' }, su.ok) : su.renk === 'etiket' ? null : h('span', { class: 'pano-rozet-nokta', 'aria-hidden': 'true' });
    return h('td', { class: sayi ? 'sayi' : null }, h('span', { class: `pano-rozet renk-${su.renk}`, title: renkAdi(su.renk) || null }, isaret, su.metin.trim()));
  }
  if (su.tur === 'cubuk') {
    // Pay çubuğu: değer 0–100 (yüzde); dolu kısım CSSOM ile (satır içi stil özniteliği yok).
    const dolu = h('span', { class: 'pano-pay-dolu' });
    dolu.style.width = `${Math.round((su.oran ?? 0) * 1000) / 10}%`;
    return h('td', { class: 'pano-pay-hucre' }, h('span', { class: 'pano-pay' }, h('span', { class: 'pano-pay-iz', role: 'img', 'aria-label': `%${su.metin}` }, dolu),
      h('span', { class: 'pano-pay-metin' }, `%${su.metin}`)));
  }
  if (su.tur === 'renk') return h('td', { class: `${sayi ? 'sayi ' : ''}pano-renkli renk-${su.renk}` }, su.metin, h('span', { class: 'gorunmez' }, ` (${renkAdi(su.renk)})`));
  if (su.tur === 'soluk') return h('td', { class: `${sayi ? 'sayi ' : ''}soluk` }, su.metin);
  return h('td', { class: 'pano-alt-satirli' }, h('span', { class: 'pano-hucre-ana' }, su.metin), su.alt ? h('span', { class: 'pano-hucre-alt' }, su.alt) : null);
}

/**
 * SQL sonucunun görünümü. Biçim (ondalık, ön / son ek, tarih) sayı içeren her görünümde uygulanır; renk eşikleri biçimden önceki ham
 * değere (yüzde görünümünde yüzde değerine) bakar (pano-duzeni.mjs > Biçim).
 * @param {any} a kart ayarı @param {any} sonuc
 * @param {{ tikla?: (etiket: string) => void; secili?: string | null; hedefAdi?: string }} [t] kutucuğa tıklama (kutucuk görünümü)
 */
function sonucGorunumu(a, sonuc, t = {}) {
  const { sutunlar, satirlar } = sonuc;
  const b = bicimTemizle(a.bicim);
  const gizli = new Set(sonuc.gizliSutunlar || []);
  const secili = sutunSiralari(a.sutunlar, sutunlar);
  if (!sutunlar.length) return h('p', { class: 'soluk kucuk' }, 'Sorgu sütun döndürmedi.');
  if (a.gorunum === 'sayi' || a.gorunum === 'yuzde' || a.gorunum === 'degisim') {
    const i = degerSirasi(secili);
    const ham = satirlar.length ? satirlar[0][i] : null;
    const n = gizli.has(sutunlar[i]) ? null : sayiyaCevir(ham);
    if (a.gorunum === 'yuzde') return yuzdeGorunumu(a, b, n, ham, satirlar.length ? sutunlar[i] : 'Sorgu satır döndürmedi');
    // Renk eşiği başka bir sütuna uygulanabilir (esikSutunu; ör. düne göre fark).
    const esikI = a.esikSutunu ? sutunSiralari([a.esikSutunu], sutunlar)[0] ?? -1 : -1;
    const esikDegeri = esikI >= 0 ? (satirlar.length && !gizli.has(sutunlar[esikI]) ? sayiyaCevir(satirlar[0][esikI]) : null) : n;
    const renk = esikDegeri === null ? null : esikRengi(esikDegeri, a.esikler || []);
    // İkinci sütun: toplam ("8 / 10" + çubuk) ya da karşılaştırma (▲ %67 rozeti; ör. dünkü değer).
    const ikinciI = a.ikinci ? sutunSiralari([a.ikinci.sutun], sutunlar)[0] ?? -1 : -1;
    const diger = ikinciI >= 0 && satirlar.length && !gizli.has(sutunlar[ikinciI]) ? sayiyaCevir(satirlar[0][ikinciI]) : null;
    const ik = ikinciDeger(a.ikinci, n, diger);
    const kutu = h('div', { class: `pano-sayi${renk ? ` esik-${renk}` : ''}`, 'data-esik': renk || '' },
      h('strong', { class: 'pano-sayi-deger' }, satirlar.length ? (n !== null ? sayiBicimle(n, b) : kisaBicim(ham, b)) : '—',
        ik && ik.tur === 'toplam' && diger !== null ? h('span', { class: 'pano-sayi-toplam' }, ` / ${sayiBicimle(diger, b)}`) : null),
      h('span', { class: 'pano-sayi-alt' }, satirlar.length ? (a.altMetin || sutunlar[i]) : 'Sorgu satır döndürmedi'), esikNotu(renk));
    if (ik && ik.tur === 'toplam') {
      kutu.append(h('span', { class: 'pano-sayi-cubuk', role: 'img', 'aria-label': `%${Math.round(ik.oran * 100)}` }, h('span', { class: `pano-sayi-cubuk-dolu${renk ? ` esik-${renk}` : ''}`, 'data-oran': String(ik.oran) })));
    } else if (ik && ik.tur === 'karsilastir') {
      const metin = ik.yuzde === null ? sayiBicimle(Math.abs(ik.fark), b) : `%${Math.abs(ik.yuzde).toLocaleString('tr-TR', { maximumFractionDigits: Math.abs(ik.yuzde) < 10 ? 1 : 0 })}`;
      kutu.append(h('span', { class: 'pano-sayi-karsilastirma' }, h('span', { class: `pano-rozet renk-${ik.renk}` }, h('span', { class: 'pano-rozet-ok', 'aria-hidden': 'true' }, ik.ok), metin),
        h('span', { class: 'soluk kucuk' }, ` ${a.ikinci.sutun}: ${diger === null ? '—' : sayiBicimle(diger, b)}`)));
    }
    if (a.gorunum === 'degisim') kutu.append(degisimSatiri(sonuc, sutunlar[i], n, b));
    // Çubuğun dolu kısmı: oran CSSOM ile (satır içi stil özniteliği yok).
    for (const d of kutu.querySelectorAll('.pano-sayi-cubuk-dolu')) /** @type {HTMLElement} */ (d).style.width = `${Number(/** @type {HTMLElement} */ (d).dataset.oran) * 100}%`;
    if (!a.simge) return kutu;
    return h('div', { class: 'pano-sayi-yan', 'data-esik': renk || '' }, h('span', { class: `pano-sayi-simge${renk ? ` esik-${renk}` : ''}`, 'aria-hidden': 'true' }, ikon(a.simge)), kutu);
  }
  if (!satirlar.length) return h('p', { class: 'soluk kucuk' }, 'Sorgu satır döndürmedi.');
  // Tablo: tabloGorunumu (sqlKarti çağırır; sütun taşıma / gizleme / genişlik / sıralama).
  if (a.gorunum === 'liste') {
    const i = degerSirasi(secili);
    const degerler = satirlar.map((r) => kisaBicim(r[i], b)).filter((m) => m !== '');
    return h('div', { class: 'pano-liste-kap' },
      h('ul', { class: 'pano-liste', 'aria-label': `${a.baslik}: ${sutunlar[i]}` }, degerler.slice(0, LISTE_EN_COK).map((m) => h('li', {}, m))),
      degerler.length > LISTE_EN_COK ? h('p', { class: 'soluk kucuk pano-liste-fazla' }, `+${(degerler.length - LISTE_EN_COK).toLocaleString('tr-TR')} daha`) : null);
  }
  const { etiketI, degerI } = etiketDeger(secili, sutunlar, satirlar);
  if (degerI < 0) return h('p', { class: 'soluk kucuk' }, 'Sayısal bir değer sütunu bulunamadı ("Sütunlar"da etiket ve değer sütununu yazın).');
  if (a.gorunum === 'kutucuk') {
    // Kutucuk süsleri: simge + eşik renginde nokta, ikinci sütunla karşılaştırma (fark), seri sütunundan mini trend ("1,0,2,3").
    const ikinciI = a.ikinci ? sutunSiralari([a.ikinci.sutun], sutunlar)[0] ?? -1 : -1;
    const seriI = a.seriSutunu ? sutunSiralari([a.seriSutunu], sutunlar)[0] ?? -1 : -1;
    const esikI = a.esikSutunu ? sutunSiralari([a.esikSutunu], sutunlar)[0] ?? -1 : -1;
    return h('ul', { class: `pano-kutucuklar${a.simge || seriI >= 0 ? ' zengin' : ''}`, 'aria-label': `${a.baslik}: ${sutunlar[degerI]}` }, satirlar.slice(0, 60).map((r) => {
      const n = gizli.has(sutunlar[degerI]) ? null : sayiyaCevir(r[degerI]);
      const esikDegeri = esikI >= 0 ? (gizli.has(sutunlar[esikI]) ? null : sayiyaCevir(r[esikI])) : n;
      const renk = esikDegeri === null ? null : esikRengi(esikDegeri, a.esikler || []);
      const diger = ikinciI >= 0 ? sayiyaCevir(r[ikinciI]) : null;
      const ik = ikinciI >= 0 ? ikinciDeger(a.ikinci, n, diger) : null;
      // Fark ön / son eksiz (ör. "▲ 3,8"; "%-1,1" gibi yapışık yazım yok); karşılaştırılan değer ipucunda.
      const yalin = { ...b, onEk: '', sonEk: '' };
      const fark = ik && ik.tur === 'karsilastir'
        ? h('span', { class: `pano-kutucuk-fark renk-${ik.renk}`, title: `${a.ikinci.sutun}: ${diger === null ? '—' : sayiBicimle(diger, b)}` },
          h('span', { 'aria-hidden': 'true' }, ik.ok), ` ${sayiBicimle(Math.abs(ik.fark), yalin)}`,
          h('span', { class: 'gorunmez' }, ` (${a.ikinci.sutun}: ${diger === null ? '—' : sayiBicimle(diger, b)})`)) : null;
      const seri = seriI >= 0 ? kucukTrend(String(r[seriI] ?? ''), renk) : null;
      const icerik = [h('span', { class: 'pano-kutucuk-etiket' },
        a.simge ? h('span', { class: `pano-kutucuk-simge${renk ? ` esik-${renk}` : ''}`, 'aria-hidden': 'true' }, ikon(a.simge)) : null,
        h('span', { class: 'pano-kutucuk-ad' }, kisaBicim(r[etiketI], b)),
        a.simge || seriI >= 0 ? h('span', { class: `pano-kutucuk-nokta${renk ? ` esik-${renk}` : ''}`, 'aria-hidden': 'true' }) : null),
        h('span', { class: 'pano-kutucuk-satir' }, h('strong', { class: 'pano-kutucuk-deger' }, n !== null ? sayiBicimle(n, b) : kisaBicim(r[degerI], b)), fark),
        seri, esikNotu(renk)];
      const sinif = `pano-kutucuk${renk ? ` esik-${renk}` : ''}`;
      if (!t.tikla) return h('li', { class: sinif }, ...icerik);
      // Tıklanabilir kutucuk: hedef kartın parametresine bu kutucuğun etiketi seçilir; seçili olan işaretlenir.
      const etiket = String(r[etiketI] ?? '');
      const dugme = h('button', { type: 'button', class: `${sinif} pano-kutucuk-dugme`, 'aria-pressed': String(etiket === t.secili),
        title: `${t.hedefAdi}: ${etiket}` }, ...icerik);
      dugme.addEventListener('click', () => t.tikla?.(etiket));
      return h('li', { class: 'pano-kutucuk-oge' }, dugme);
    }));
  }
  const noktalar = satirlar.slice(0, a.gorunum === 'pasta' ? 500 : 60).map((r) => ({ etiket: kisaBicim(r[etiketI], b), deger: sayiyaCevir(r[degerI]) ?? 0 }));
  if (a.gorunum === 'pasta') return pasta(a, b, noktalar, sutunlar[degerI]);
  // Çizgi grafikte ikinci seri (ör. dün): ikinci sütun (karşılaştır) kesikli çizgi olarak.
  const ikinciCizgiI = a.gorunum === 'cizgi' && a.ikinci?.tur === 'karsilastir' ? sutunSiralari([a.ikinci.sutun], sutunlar)[0] ?? -1 : -1;
  if (ikinciCizgiI >= 0) satirlar.slice(0, 60).forEach((r, i) => { /** @type {any} */ (noktalar[i]).ikinci = sayiyaCevir(r[ikinciCizgiI]); });
  return grafik(a, b, noktalar, sutunlar[degerI], ikinciCizgiI >= 0 ? sutunlar[ikinciCizgiI] : null);
}

/**
 * Kutucuktaki mini trend: "1,0,2,3" (virgül ya da noktalı virgülle sayılar; en çok 96) → dolgulu küçük çizgi (eşik renginde).
 * @param {string} metin @param {string | null} renk
 */
function kucukTrend(metin, renk) {
  const d = metin.split(/[;,]\s*/).map((x) => Number(x.trim().replace(',', '.'))).filter((x) => Number.isFinite(x)).slice(-96);
  if (d.length < 2) return null;
  const enCok = Math.max(...d, 0);
  const enAz = Math.min(...d, 0);
  const aralik = enCok - enAz || 1;
  const nokta = d.map((v, i) => `${((i / (d.length - 1)) * 100).toFixed(1)},${(22 - ((v - enAz) / aralik) * 20).toFixed(1)}`).join(' ');
  return s('svg', { class: `pano-kutucuk-trend${renk ? ` esik-${renk}` : ''}`, viewBox: '0 0 100 24', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    s('polygon', { class: 'alan', points: `0,24 ${nokta} 100,24` }), s('polyline', { class: 'cizgi', points: nokta }));
}

/** "Sayı + değişim": önceki yenilemedeki değere göre ▲ / ▼ (mutlak ve %). */
function degisimSatiri(sonuc, sutun, n, b) {
  const o = sonuc.onceki;
  const j = o && Array.isArray(o.sutunlar) ? o.sutunlar.indexOf(sutun) : -1;
  const onceki = o && o.ilkSatir && j >= 0 ? sayiyaCevir(o.ilkSatir[j]) : null;
  const d = n === null ? null : degisimHesapla(n, onceki);
  if (!d) return h('span', { class: 'pano-degisim notr' }, 'önceki yok');
  const ok = d.yon === 'artis' ? '▲' : d.yon === 'azalis' ? '▼' : '=';
  const yuzde = d.yuzde === null ? '' : ` (%${Math.abs(d.yuzde).toLocaleString('tr-TR', { maximumFractionDigits: 1 })})`;
  return h('span', { class: `pano-degisim ${d.yon}`, title: `Önceki yenileme: ${sonVeriMetni(o.zaman)}` },
    h('span', { 'aria-hidden': 'true' }, `${ok} `), h('span', { class: 'gorunmez' }, d.yon === 'artis' ? 'Arttı: ' : d.yon === 'azalis' ? 'Azaldı: ' : 'Değişmedi: '),
    `${sayiBicimle(Math.abs(d.fark), b)}${yuzde}`, h('span', { class: 'pano-degisim-onceki' }, ` · önceki ${sonVeriMetni(o.zaman)}`));
}

/** "Yüzde / oran": %83,4; hedef verilmişse hedefe göre dolan çubuk ya da ibre (SVG öznitelikleri; satır içi stil yok). */
function yuzdeGorunumu(a, b, n, ham, alt) {
  if (n === null) {
    return h('div', { class: 'pano-sayi' }, h('strong', { class: 'pano-sayi-deger' }, ham === null || ham === undefined ? '—' : kisaBicim(ham, b)), h('span', { class: 'pano-sayi-alt' }, alt));
  }
  const p = yuzdeDegeri(n, b);
  const renk = esikRengi(p, a.esikler || []);
  const ust = b.hedef || 100;
  const doluluk = Math.max(0, Math.min(1, p / ust));
  const etiket = b.hedef ? `${yuzdeBicimle(n, b)} · hedef %${b.hedef.toLocaleString('tr-TR')} · hedefe ulaşma %${Math.round((p / b.hedef) * 100).toLocaleString('tr-TR')}` : yuzdeBicimle(n, b);
  const kap = h('div', { class: `pano-sayi pano-yuzde${renk ? ` esik-${renk}` : ''}` },
    h('strong', { class: 'pano-sayi-deger' }, yuzdeBicimle(n, b)), h('span', { class: 'pano-sayi-alt' }, alt), esikNotu(renk));
  if (b.gosterge === 'ibre') {
    // Yarım daire gösterge: yay pathLength=100 ile dash dizisi; ibre açısı doluluktan.
    const aci = Math.PI * (1 - doluluk);
    const x = 60 + 44 * Math.cos(aci); const y = 60 - 44 * Math.sin(aci);
    kap.prepend(s('svg', { viewBox: '0 0 120 68', class: 'pano-ibre', role: 'img', 'aria-label': `${a.baslik}: ${etiket}` },
      s('path', { d: 'M10 60 A50 50 0 0 1 110 60', class: 'ibre-zemin', pathLength: 100 }),
      s('path', { d: 'M10 60 A50 50 0 0 1 110 60', class: 'ibre-dolu', pathLength: 100, 'stroke-dasharray': `${(doluluk * 100).toFixed(2)} 100` }),
      s('line', { x1: 60, y1: 60, x2: x.toFixed(2), y2: y.toFixed(2), class: 'ibre-kol' }), s('circle', { cx: 60, cy: 60, r: 4, class: 'ibre-merkez' })));
  } else if (b.hedef) {
    kap.append(s('svg', { viewBox: '0 0 100 8', preserveAspectRatio: 'none', class: 'pano-ilerleme', role: 'img', 'aria-label': `${a.baslik}: ${etiket}` },
      s('rect', { x: 0, y: 0, width: 100, height: 8, rx: 4, class: 'ilerleme-zemin' }),
      s('rect', { x: 0, y: 0, width: (doluluk * 100).toFixed(2), height: 8, rx: 4, class: 'ilerleme-dolu' })));
  }
  if (b.hedef) kap.append(h('span', { class: 'pano-sayi-alt pano-hedef-notu' }, `Hedef %${b.hedef.toLocaleString('tr-TR')} · hedefe ulaşma %${Math.round((p / b.hedef) * 100).toLocaleString('tr-TR')}`));
  return kap;
}

/** Halka grafik: en çok 8 dilim (kalanı "Diğer"); yüzdeler açıklamada. Dilimler circle + pathLength=100 dash dizisiyle (öznitelik). */
function pasta(a, b, noktalar, degerAdi) {
  const dilimler = pastaDilimleri(noktalar);
  if (!dilimler.length) return h('p', { class: 'soluk kucuk' }, 'Grafik için sıfırdan büyük değer yok.');
  const yuzde = (/** @type {number} */ x) => `%${x.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
  const svg = s('svg', { viewBox: '0 0 120 120', class: 'pano-pasta', role: 'img', 'aria-label': `${a.baslik}: ${degerAdi}, ${dilimler.length} dilim` });
  // İlk 8 dilim temanın renkleri (dilim-0…7); sonrası altın açıyla dağıtılan tonlar (komşu dilimler birbirinden ayrışır).
  const renk = (/** @type {Element} */ el, /** @type {number} */ i) => {
    if (i >= 8) /** @type {HTMLElement} */ (el).style.setProperty('--dilim', `oklch(70% 0.13 ${Math.round((i * 137.508) % 360)})`);
    return el;
  };
  let birikim = 0;
  for (const [i, d] of dilimler.entries()) {
    svg.append(renk(s('circle', { cx: 60, cy: 60, r: 42, pathLength: 100, class: `dilim dilim-${d.diger ? 'diger' : i}`, transform: 'rotate(-90 60 60)',
      'stroke-dasharray': `${d.yuzde.toFixed(3)} ${(100 - d.yuzde).toFixed(3)}`, 'stroke-dashoffset': (-birikim).toFixed(3) },
    s('title', {}, `${d.etiket}: ${sayiBicimle(d.deger, b)} (${yuzde(d.yuzde)})`)), d.diger ? -1 : i));
    birikim += d.yuzde;
  }
  return h('figure', { class: 'pano-pasta-kap' }, svg,
    h('figcaption', {}, h('ul', { class: 'pano-pasta-aciklama' }, dilimler.map((d, i) => h('li', {},
      renk(h('span', { class: `pano-renk dilim-${d.diger ? 'diger' : i}`, 'aria-hidden': 'true' }), d.diger ? -1 : i),
      h('span', { class: 'pano-pasta-etiket' }, d.etiket), h('span', { class: 'pano-pasta-deger' }, `${yuzde(d.yuzde)} · ${sayiBicimle(d.deger, b)}`))))));
}

/**
 * SVG çubuk / çizgi grafik (etiketler altta). Grafik GERMEZ: viewBox her zaman SVG'nin ekrandaki gerçek boyutuna eşittir ve boyut
 * değişince (kart yüksekliği / genişliği, pencere) ResizeObserver ile yeniden çizilir; yazılar doğal oranda kalır. Yalnız tam piksel
 * boyutu değişince çizilir (aynı boyutta yeniden çizim yok).
 * @param {any} a @param {any} b @param {Array<{ etiket: string; deger: number }>} noktalar @param {string} degerAdi
 */
function grafik(a, b, noktalar, degerAdi, ikinciAdi = null) {
  const svg = s('svg', { class: `pano-grafik ${a.gorunum}`, role: 'img', 'aria-label': `${a.baslik}: ${degerAdi}, ${noktalar.length} değer` });
  let son = '';
  const ciz = (/** @type {number} */ G, /** @type {number} */ Y) => {
    const anahtar = `${G}x${Y}`;
    if (anahtar === son) return;
    son = anahtar;
    const sol = 40; const alt = 34; const ust = 10;
    const tumu = noktalar.flatMap((n) => [n.deger, ...(typeof (/** @type {any} */ (n)).ikinci === 'number' ? [/** @type {any} */ (n).ikinci] : [])]);
    const enCok = Math.max(0, ...tumu);
    const enAz = Math.min(0, ...tumu);
    const aralik = enCok - enAz || 1;
    const y = (v) => ust + (Y - ust - alt) * (1 - (v - enAz) / aralik);
    const adim = (G - sol - 8) / Math.max(1, noktalar.length);
    const x = (i) => sol + adim * i + adim / 2;
    svg.setAttribute('viewBox', `0 0 ${G} ${Y}`);
    svg.replaceChildren(
      s('line', { x1: sol, y1: y(0), x2: G - 4, y2: y(0), class: 'eksen' }),
      s('text', { x: sol - 6, y: ust + 8, class: 'eksen-yazi', 'text-anchor': 'end' }, sayiBicimle(enCok, { ...b, onEk: '', sonEk: '' })),
      s('text', { x: sol - 6, y: y(0), class: 'eksen-yazi', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, '0'));
    if (a.gorunum === 'cubuk') {
      for (const [i, n] of noktalar.entries()) {
        const g = Math.max(2, Math.min(80, adim * 0.66));
        svg.append(s('rect', { x: x(i) - g / 2, y: Math.min(y(n.deger), y(0)), width: g, height: Math.max(1, Math.abs(y(0) - y(n.deger))), class: 'cubuk', rx: 2 },
          s('title', {}, `${n.etiket}: ${sayiBicimle(n.deger, b)}`)));
      }
    } else {
      // Dolgulu alan + çizgi; ikinci seri kesikli; son nokta vurgulu.
      const yol = noktalar.map((n, i) => `${x(i)},${y(n.deger)}`).join(' ');
      if (noktalar.length > 1) svg.append(s('polygon', { points: `${x(0)},${y(0)} ${yol} ${x(noktalar.length - 1)},${y(0)}`, class: 'alan' }));
      const ikinciler = noktalar.map((n, i) => [i, /** @type {any} */ (n).ikinci]).filter(([, v]) => typeof v === 'number');
      if (ikinciler.length > 1) svg.append(s('polyline', { points: ikinciler.map(([i, v]) => `${x(i)},${y(v)}`).join(' '), class: 'cizgi-ikinci', fill: 'none' }));
      svg.append(s('polyline', { points: yol, class: 'cizgi', fill: 'none' }));
      for (const [i, n] of noktalar.entries()) {
        const ik = /** @type {any} */ (n).ikinci;
        svg.append(s('circle', { cx: x(i), cy: y(n.deger), r: i === noktalar.length - 1 ? 4.5 : 3, class: `nokta${i === noktalar.length - 1 ? ' son' : ''}` },
          s('title', {}, `${n.etiket}: ${sayiBicimle(n.deger, b)}${typeof ik === 'number' && ikinciAdi ? ` · ${ikinciAdi}: ${sayiBicimle(ik, b)}` : ''}`)));
      }
    }
    // Etiket sayısı genişliğe göre (yaklaşık 56 px'te bir).
    const etiketAdimi = Math.max(1, Math.ceil(noktalar.length / Math.max(1, Math.floor((G - sol) / 56))));
    for (const [i, n] of noktalar.entries()) {
      if (i % etiketAdimi) continue;
      svg.append(s('text', { x: x(i), y: Y - alt + 16, class: 'eksen-yazi', 'text-anchor': 'middle' }, n.etiket.length > 10 ? `${n.etiket.slice(0, 9)}…` : n.etiket));
    }
  };
  ciz(600, 200);
  const olc = () => {
    if (!svg.isConnected) return;
    const r = svg.getBoundingClientRect();
    if (r.width >= 40 && r.height >= 40) ciz(Math.round(r.width), Math.round(r.height));
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(olc).observe(svg);
  requestAnimationFrame(olc);
  // Ekran okuyucu için değerler (görsel olarak gizli metin özeti).
  return h('figure', { class: 'pano-grafik-kap' },
    ikinciAdi ? h('div', { class: 'pano-grafik-aciklama', 'aria-hidden': 'true' }, h('span', { class: 'seri' }, degerAdi), h('span', { class: 'seri ikinci' }, ikinciAdi)) : null,
    svg, h('figcaption', { class: 'gorunmez' }, noktalar.map((n) => `${n.etiket}: ${sayiBicimle(n.deger, b)}${typeof (/** @type {any} */ (n)).ikinci === 'number' && ikinciAdi ? ` (${ikinciAdi}: ${sayiBicimle(/** @type {any} */ (n).ikinci, b)})` : ''}`).join('; ')));
}

// ---- Tablo görünümü: sütun taşıma (sürükle-bırak / menü), gizle / göster, genişlik (kenar tutamağı), sıralama -------------------
const SIRA_SONRAKI = { '': 'artan', artan: 'azalan', azalan: '' };
const ARIA_SORT = { artan: 'ascending', azalan: 'descending' };
/** Genişlik tutamağında klavye adımı (px). */
const GENISLIK_ADIMI = 16;

/**
 * Tablo görünümü. Sütun sırası / görünürlüğü (kartın "sutunlar" ayarı) ve genişlikleri ("sutunGenislikleri") t.kaydet ile kalıcı;
 * sıralama yalnız ekranda (t.siralama). Maskeli sütunlar maskeli kalır (değerler sunucudan maskeli gelir; gizlemek maskeyi kaldırmaz).
 * @param {any} a kart ayarı @param {any} sonuc
 * @param {{ siralama: { ad: string; yon: string }; kaydet: (sutunlar: string[], genislikler: Record<string, number>, odak: { ad: string; rol: string } | null) => void;
 *   sirala: (ad: string, odak: { ad: string; rol: string }) => void; odak: { ad: string; rol: string } | null;
 *   goster: (g: { sutun: string; satirNo: number; metin: string; sutunlar: string[]; satir: unknown[]; donus: HTMLElement }) => void }} t
 */
function tabloGorunumu(a, sonuc, t) {
  const b = bicimTemizle(a.bicim);
  const tum = /** @type {string[]} */ (sonuc.sutunlar);
  const gizli = new Set(sonuc.gizliSutunlar || []);
  // Sütun biçimleri (rozet, renk, değişim, sayaç, alt satır); "altına" yazılan sütun tabloda ayrıca görünmez.
  const bicimler = new Map((a.sutunBicimleri || []).map((/** @type {any} */ x) => [x.sutun, x]));
  const altSutunlar = new Set((a.sutunBicimleri || []).filter((/** @type {any} */ x) => x.tur === 'altSatir').map((/** @type {any} */ x) => x.altSutun));
  const gorunen = gorunenSutunlar(a.sutunlar || [], tum).filter((ad) => !altSutunlar.has(ad));
  const genislikler = { ...(a.sutunGenislikleri || {}) };
  const sirali = t.siralama.ad && gorunen.includes(t.siralama.ad) && t.siralama.yon
    ? satirlariSirala(sonuc.satirlar, tum.indexOf(t.siralama.ad), /** @type {any} */ (t.siralama.yon)) : sonuc.satirlar;
  const kaydet = (/** @type {string[]} */ sutunlar, odak) => t.kaydet(sutunlar, genislikler, odak);
  // Sayı sütunu (boş olmayan tüm değerleri sayı): başlık da değerler gibi sağa yaslanır.
  const sayiSutunlari = new Set(gorunen.filter((ad) => {
    const i = tum.indexOf(ad);
    const dolu = sonuc.satirlar.map((r) => r[i]).filter((v) => v !== null && v !== undefined && v !== '');
    return dolu.length > 0 && dolu.every((v) => typeof v === 'number');
  }));

  // Sütun menüsü / Sütunlar menüsü: tablonun üstündeki satırda açılır (konumlama için satır içi stil gerekmez).
  const menuYeri = h('div', { class: 'pano-menu-yeri' });
  /** @type {HTMLElement | null} */
  let acikDugme = null;
  const menuKapat = (odakla = true) => {
    yerlestir(menuYeri);
    if (acikDugme) { acikDugme.setAttribute('aria-expanded', 'false'); if (odakla) acikDugme.focus(); }
    acikDugme = null;
  };
  /** @param {HTMLElement} dugme @param {string} baslik @param {Array<{ etiket: string; eylem: () => void; devreDisi?: boolean; secili?: boolean }>} ogeler */
  const menuAc = (dugme, baslik, ogeler) => {
    if (acikDugme === dugme) { menuKapat(); return; }
    menuKapat(false);
    acikDugme = dugme;
    dugme.setAttribute('aria-expanded', 'true');
    const dugmeler = ogeler.map((o) => h('button', {
      type: 'button', class: `kucuk-dugme hayalet${o.secili === undefined ? '' : ' pano-menu-secim'}`, role: o.secili === undefined ? 'menuitem' : 'menuitemcheckbox',
      'aria-checked': o.secili === undefined ? null : String(o.secili), disabled: o.devreDisi, tabindex: '-1'
    }, o.secili === undefined ? null : h('span', { class: 'pano-menu-isaret', 'aria-hidden': 'true' }, o.secili ? '✓' : ''), o.etiket));
    dugmeler.forEach((d, i) => d.addEventListener('click', () => { menuKapat(false); ogeler[i].eylem(); }));
    const menu = h('div', { class: 'pano-menu', role: 'menu', 'aria-label': baslik }, h('span', { class: 'pano-menu-baslik', 'aria-hidden': 'true' }, baslik), ...dugmeler,
      h('button', { type: 'button', class: 'kucuk-dugme hayalet pano-menu-kapat', role: 'menuitem', tabindex: '-1', 'aria-label': 'Menüyü kapat' }, ikon('carpi')));
    menu.lastElementChild?.addEventListener('click', () => menuKapat());
    menu.addEventListener('keydown', (o) => {
      const odaklanabilir = [...menu.querySelectorAll('button:not(:disabled)')];
      const i = odaklanabilir.indexOf(/** @type {any} */ (document.activeElement));
      if (o.key === 'Escape') { o.preventDefault(); menuKapat(); }
      else if (['ArrowRight', 'ArrowDown'].includes(o.key)) { o.preventDefault(); /** @type {HTMLElement} */ (odaklanabilir[(i + 1) % odaklanabilir.length]).focus(); }
      else if (['ArrowLeft', 'ArrowUp'].includes(o.key)) { o.preventDefault(); /** @type {HTMLElement} */ (odaklanabilir[(i - 1 + odaklanabilir.length) % odaklanabilir.length]).focus(); }
      else if (o.key === 'Tab') menuKapat(false);
    });
    yerlestir(menuYeri, menu);
    /** @type {HTMLElement | null} */ (menu.querySelector('button:not(:disabled)'))?.focus();
  };

  const gizliSayisi = tum.length - gorunen.length;
  const sutunlarDugmesi = h('button', { type: 'button', class: 'kucuk-dugme hayalet pano-sutunlar-dugmesi', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-rol': 'sutunlar' },
    ikon('liste'), gizliSayisi ? `Sütunlar (${gizliSayisi} gizli)` : 'Sütunlar');
  sutunlarDugmesi.addEventListener('click', () => menuAc(sutunlarDugmesi, 'Görünen sütunlar', tum.map((ad) => ({
    etiket: ad, secili: gorunen.includes(ad), devreDisi: gorunen.length === 1 && gorunen.includes(ad),
    eylem: () => kaydet(sutunGorunurlugu(gorunen, tum, ad, !gorunen.includes(ad)), { ad: '', rol: 'sutunlar' })
  }))));

  // Sabit genişlik: görünen tüm sütunların genişliği verilmişse tablo bu genişliklerin toplamı kadardır (kartı doldurmaz; sütunlar
  // birbirinin yanında durur, biri daralınca sağdakiler sola kayar). Biri "sığdır"la kaldırılınca tablo yine kartı doldurur.
  const sabit = gorunen.every((ad) => genislikler[ad]);
  // Satır eylemleri: "İncele" (satırın tüm sütunları) ve satıra tıklayınca başka kartın parametresi (tiklama.sutun'un değeri).
  const incele = a.satirIncele === true && typeof t.incele === 'function';
  const tiklamaI = a.tiklama?.sutun && t.satirSec ? sutunSiralari([a.tiklama.sutun], tum)[0] ?? -1 : -1;
  /** @param {unknown[]} r @param {number} satirI @param {HTMLElement[]} hucreler */
  const satirKur = (r, satirI, hucreler) => {
    const tr = h('tr', {}, ...hucreler);
    if (incele) {
      const d = h('button', { type: 'button', class: 'kucuk-dugme pano-incele', 'aria-label': `İncele: ${satirI + 1}. satır` }, ikon('goz'), 'İncele');
      d.addEventListener('click', (o) => { o.stopPropagation(); t.incele?.({ satirNo: satirI + 1, satir: r, donus: d }); });
      tr.append(h('td', { class: 'pano-td-islem' }, d));
    }
    if (tiklamaI >= 0) {
      const deger = String(r[tiklamaI] ?? '');
      tr.classList.add('pano-satir-tiklanir');
      tr.classList.toggle('secili', deger === t.secili);
      tr.tabIndex = 0;
      tr.title = `${t.hedefAdi}: ${deger}`;
      const sec = () => t.satirSec?.(deger);
      tr.addEventListener('click', (o) => {
        const hedef = /** @type {HTMLElement} */ (o.target);
        if (hedef.closest('button, .pano-uzun-hucre') || String(getSelection()?.toString() ?? '')) return;
        sec();
      });
      tr.addEventListener('keydown', (o) => { if (o.key === 'Enter' && o.target === tr) { o.preventDefault(); sec(); } });
    }
    return tr;
  };
  const tablo = h('table', { class: `ozet-tablosu pano-tablo-tablosu${sabit ? ' sabit-genislik' : ''}` },
    h('colgroup', {}, gorunen.map((ad) => h('col', { width: genislikler[ad] ? String(genislikler[ad]) : null, 'data-sutun': ad })), incele ? h('col', { width: String(ISLEM_SUTUNU_PX), 'data-islem': '' }) : null),
    h('thead', {}, h('tr', {}, gorunen.map((ad, j) => basHucresi(ad, j)), incele ? h('th', { scope: 'col', class: 'pano-th-islem' }, 'İşlem') : null)),
    h('tbody', {}, sirali.map((r, satirI) => satirKur(r, satirI, gorunen.map((ad) => {
      const v = r[tum.indexOf(ad)];
      const metin = hucreBicimle(v, b);
      const sb = bicimler.get(ad);
      const sunum = sb ? hucreSunumu(sb, v, b, sb.altSutun ? r[tum.indexOf(sb.altSutun)] : undefined) : null;
      if (sunum) return bicimliHucre(sunum, typeof v === 'number');
      if (!uzunMetinMi(metin)) return h('td', { class: typeof v === 'number' ? 'sayi' : null }, metin);
      // Uzun metin (ör. CLOB'daki servis isteği): sütun genişliğinde tek satır önizleme; "Görüntüle" yalnız metin kesildiğinde ya da
      // birden çok satırlıysa görünür (kesikleriIsaretle). Hücreye tıklamak her zaman tam metni açar.
      const ac = () => t.goster({ sutun: ad, satirNo: satirI + 1, metin, sutunlar: tum, satir: r, donus: dugme });
      const dugme = h('button', { type: 'button', class: 'kucuk-dugme hayalet pano-hucre-goruntule', 'aria-label': `Görüntüle: ${ad}, ${satirI + 1}. satır`,
        title: 'Metnin tamamını aç', hidden: true }, 'Görüntüle');
      dugme.addEventListener('click', (o) => { o.stopPropagation(); ac(); });
      const onizleme = metinKisalt(metin, ONIZLEME_EN_COK);
      // Tek satırlı ve önizlemeye tamamı sığan metin: "Görüntüle" yalnız sütuna sığmazsa görünür.
      const tam = !/\n/.test(metin.trim()) && metin.replace(/\s+/g, ' ').trim().length <= ONIZLEME_EN_COK;
      const td = h('td', { class: 'pano-uzun-hucre', title: 'Tamamını görmek için tıklayın', 'data-tam': tam ? '1' : null },
        h('span', { class: 'pano-hucre-ic' }, h('span', { class: 'pano-hucre-onizleme' }, onizleme), dugme));
      td.addEventListener('click', (o) => { if (!(/** @type {HTMLElement} */ (o.target).closest('button')) && !String(getSelection()?.toString() ?? '')) ac(); });
      return td;
    })))));

  if (sabit) tablo.style.width = `${gorunen.reduce((t, ad) => t + genislikler[ad], 0) + (incele ? ISLEM_SUTUNU_PX : 0)}px`;

  /** Başlık hücresi: sıralama düğmesi, sütun menüsü (⋯), genişlik tutamağı; başlık sürüklenerek taşınır. @param {string} ad @param {number} j */
  function basHucresi(ad, j) {
    const yon = t.siralama.ad === ad ? t.siralama.yon : '';
    const sirala = h('button', { type: 'button', class: 'pano-th-sirala', 'data-rol': 'sirala', title: 'Sırala (artan / azalan / kapalı; yalnız ekranda)' },
      h('span', { class: 'pano-th-ad' }, ad), gizli.has(ad) ? [' ', ikon('kilit'), h('span', { class: 'gorunmez' }, '(maskeli)')] : null,
      h('span', { class: `pano-th-sira ${yon}`, 'aria-hidden': 'true' }, yon === 'artan' ? '▲' : yon === 'azalan' ? '▼' : '↕'));
    sirala.addEventListener('click', () => t.sirala(ad, { ad, rol: 'sirala' }));
    const menu = h('button', { type: 'button', class: 'pano-th-menu', 'data-rol': 'menu', 'aria-label': `Sütun menüsü: ${ad}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Taşı, gizle' },
      h('span', { 'aria-hidden': 'true' }, '⋯'));
    menu.addEventListener('click', () => menuAc(menu, `Sütun menüsü: ${ad}`, [
      { etiket: 'Sola taşı', devreDisi: j === 0, eylem: () => kaydet(sutunTasi(gorunen, ad, 'sol'), { ad, rol: 'menu' }) },
      { etiket: 'Sağa taşı', devreDisi: j === gorunen.length - 1, eylem: () => kaydet(sutunTasi(gorunen, ad, 'sag'), { ad, rol: 'menu' }) },
      { etiket: 'Gizle', devreDisi: gorunen.length === 1, eylem: () => kaydet(sutunGorunurlugu(gorunen, tum, ad, false), { ad: '', rol: 'sutunlar' }) }
    ]));
    const genislik = genislikler[ad] || 0;
    const tutamak = h('span', {
      class: 'pano-th-genislik', role: 'separator', tabindex: '0', 'aria-orientation': 'vertical', 'aria-label': `Sütun genişliği: ${ad}`, 'data-rol': 'genislik',
      'aria-valuemin': String(SUTUN_GENISLIGI.en), 'aria-valuemax': String(SUTUN_GENISLIGI.enCok), 'aria-valuenow': genislik ? String(genislik) : null,
      'aria-valuetext': genislik ? `${genislik} piksel` : 'otomatik', title: 'Sürükleyerek genişliği ayarlayın; çift tıklayınca içeriğe sığdırılır'
    });
    const th = h('th', { scope: 'col', class: sayiSutunlari.has(ad) ? 'sayi' : null, 'data-sutun': ad, 'aria-sort': yon ? ARIA_SORT[yon] : null, draggable: 'true' }, h('div', { class: 'pano-th' }, sirala, menu), tutamak);
    const sinirla = (/** @type {number} */ n) => Math.max(SUTUN_GENISLIGI.en, Math.min(SUTUN_GENISLIGI.enCok, Math.round(n)));
    // odakla: klavyeyle değişince odak tutamağa döner; fareyle sürükleyip / çift tıklayınca dönmez (odak çerçevesi kalmasın).
    const genislikKaydet = (/** @type {number | null} */ n, odakla = true) => {
      if (n === null) delete genislikler[ad];
      else {
        // İlk elle genişlikte diğer sütunlar o anki genişliklerinde sabitlenir (tablo sabit genişliğe geçer).
        for (const x of gorunen) {
          if (x === ad || genislikler[x]) continue;
          const b = tablo.querySelector(`th[data-sutun="${CSS.escape(x)}"]`);
          if (b) genislikler[x] = sinirla(b.getBoundingClientRect().width);
        }
        genislikler[ad] = sinirla(n);
      }
      t.kaydet(gorunen, genislikler, odakla ? { ad, rol: 'genislik' } : null);
    };
    // Fare / dokunma: kenar tutamağından sürükle (canlı önizleme: <col width>), bırakınca kaydet. Çift tıkla: sığdır (genişlik kaldırılır).
    tutamak.addEventListener('pointerdown', (o) => {
      o.preventDefault();
      o.stopPropagation();
      th.draggable = false;
      const col = /** @type {HTMLElement | null} */ (tablo.querySelector(`col[data-sutun="${CSS.escape(ad)}"]`));
      const bas = o.clientX;
      const ilk = th.getBoundingClientRect().width;
      let son = ilk;
      tutamak.setPointerCapture?.(o.pointerId);
      // Sürüklerken diğer sütunlar o anki genişliklerinde kalsın (yalnız bu sürüklemede; kaydedilmez).
      /** @type {Element[]} */
      const gecici = [];
      for (const c of tablo.querySelectorAll('col')) {
        if (c.getAttribute('width')) continue;
        const baslik = tablo.querySelector(`th[data-sutun="${CSS.escape(c.getAttribute('data-sutun') || '')}"]`);
        c.setAttribute('width', String(Math.round(baslik ? baslik.getBoundingClientRect().width : 100)));
        gecici.push(c);
      }
      const oncekiSinif = tablo.classList.contains('sabit-genislik');
      const oncekiGenislik = tablo.style.width;
      const tabloGenisligi = () => { tablo.style.width = `${[...tablo.querySelectorAll('col')].reduce((t, c) => t + Number(c.getAttribute('width') || 0), 0)}px`; };
      const hareket = (/** @type {PointerEvent} */ e) => {
        son = sinirla(ilk + e.clientX - bas);
        col?.setAttribute('width', String(son));
        // Canlı önizleme: kaydedilince olacağı gibi sabit genişlik (sağdaki sütunlar kayar).
        tablo.classList.add('sabit-genislik');
        tabloGenisligi();
      };
      const birak = () => {
        tutamak.removeEventListener('pointermove', hareket);
        tutamak.removeEventListener('pointerup', birak);
        tutamak.removeEventListener('pointercancel', birak);
        th.draggable = true;
        if (Math.abs(son - ilk) >= 2) { genislikKaydet(son, false); return; }
        // Hareket yoksa (tıklama / çift tıklamanın ilki) geçici genişlikler geri alınır; hiçbir şey kaydedilmez.
        for (const c of gecici) c.removeAttribute('width');
        tablo.classList.toggle('sabit-genislik', oncekiSinif);
        tablo.style.width = oncekiGenislik;
      };
      tutamak.addEventListener('pointermove', hareket);
      tutamak.addEventListener('pointerup', birak);
      tutamak.addEventListener('pointercancel', birak);
    });
    tutamak.addEventListener('dblclick', () => genislikKaydet(null, false));
    tutamak.addEventListener('keydown', (o) => {
      if (o.key === 'ArrowLeft' || o.key === 'ArrowRight') {
        o.preventDefault();
        genislikKaydet((genislik || th.getBoundingClientRect().width) + (o.key === 'ArrowRight' ? GENISLIK_ADIMI : -GENISLIK_ADIMI));
      } else if (o.key === 'Enter' || o.key === 'Delete') { o.preventDefault(); genislikKaydet(null); }
    });
    // Başlığı sürükleyip başka başlığın üstüne bırak: o sıraya taşınır.
    th.addEventListener('dragstart', (o) => {
      o.dataTransfer?.setData('text/plain', `pano-sutun:${ad}`);
      if (o.dataTransfer) o.dataTransfer.effectAllowed = 'move';
      th.classList.add('surukleniyor');
      o.stopPropagation();
    });
    th.addEventListener('dragend', () => { th.classList.remove('surukleniyor'); for (const x of tablo.querySelectorAll('.birakma-hedefi')) x.classList.remove('birakma-hedefi'); });
    th.addEventListener('dragover', (o) => { if (tablo.querySelector('th.surukleniyor')) { o.preventDefault(); o.stopPropagation(); th.classList.add('birakma-hedefi'); } });
    th.addEventListener('dragleave', () => th.classList.remove('birakma-hedefi'));
    th.addEventListener('drop', (o) => {
      const veri = o.dataTransfer?.getData('text/plain') || '';
      const kaynak = veri.startsWith('pano-sutun:') ? veri.slice(11) : tablo.querySelector('th.surukleniyor')?.getAttribute('data-sutun') || '';
      if (!kaynak || kaynak === ad) return;
      o.preventDefault();
      o.stopPropagation();
      kaydet(sutunTasi(gorunen, kaynak, gorunen.indexOf(ad)), { ad: kaynak, rol: 'sirala' });
    });
    return th;
  }

  const kaydirma = h('div', { class: 'tablo-kaydirma pano-tablo', tabindex: '0', role: 'region', 'aria-label': `${a.baslik} sonucu` }, tablo);
  // "Görüntüle": önizleme sütuna sığmıyorsa (ya da metin çok satırlı / önizlemeden uzunsa) görünür; kart ya da sütun genişliği
  // değişince yeniden değerlendirilir.
  const kesikleriIsaretle = () => {
    for (const td of tablo.querySelectorAll('td.pano-uzun-hucre')) {
      const o = /** @type {HTMLElement} */ (td.querySelector('.pano-hucre-onizleme'));
      const d = /** @type {HTMLElement} */ (td.querySelector('.pano-hucre-goruntule'));
      const kesik = /** @type {HTMLElement} */ (td).dataset.tam !== '1' || o.scrollWidth > o.clientWidth + 1;
      if (d.hidden === kesik) d.hidden = !kesik;
    }
  };
  if (typeof ResizeObserver === 'function') {
    let bekleyen = 0;
    new ResizeObserver(() => { cancelAnimationFrame(bekleyen); bekleyen = requestAnimationFrame(kesikleriIsaretle); }).observe(kaydirma);
  } else requestAnimationFrame(kesikleriIsaretle);
  // Home / End: tablo dikeyde kaymıyorsa tarayıcı bu tuşları sayfaya geçirir (sayfa başa / sona atlar). Tablo odaktayken yatayda
  // başa / sona gider; sayfanın dikey konumu değişmez.
  kaydirma.addEventListener('keydown', (o) => {
    if ((o.key !== 'Home' && o.key !== 'End') || o.target !== kaydirma || o.ctrlKey || o.metaKey || o.altKey) return;
    if (kaydirma.scrollHeight > kaydirma.clientHeight + 1) return;
    o.preventDefault();
    kaydirma.scrollLeft = o.key === 'Home' ? 0 : kaydirma.scrollWidth;
  });
  const kap = h('div', { class: 'pano-tablo-kap' },
    h('div', { class: 'pano-tablo-araclari' }, sutunlarDugmesi,
      t.siralama.ad && t.siralama.yon ? h('span', { class: 'soluk kucuk' }, `Sıralı: ${t.siralama.ad} (${t.siralama.yon}; yalnız ekranda)`) : null),
    menuYeri, yatayKaydirmaIpucu(kaydirma, { sutunSecici: 'thead th' }));
  // Taşıma / gizleme / genişlik / sıralama sonrası odak aynı denetime döner.
  if (t.odak) {
    requestAnimationFrame(() => {
      // Kullanıcı bu arada başka bir denetime geçtiyse odak alınmaz (yalnız yeniden çizimle kaybolan odak geri verilir).
      if (document.activeElement && document.activeElement !== document.body) return;
      const hedef = t.odak && t.odak.ad
        ? kap.querySelector(`th[data-sutun="${CSS.escape(t.odak.ad)}"] [data-rol="${t.odak.rol}"]`)
        : kap.querySelector('[data-rol="sutunlar"]');
      if (hedef) odakla(/** @type {HTMLElement} */ (hedef));
    });
  }
  return kap;
}

// ---- Uzun metin penceresi: tam metin (XML / JSON girintili), arama, kopyala, servis analizine örnek ekle -----------------------
/** Aramada işaretlenen en çok eşleşme. */
const EN_COK_ISARET = 500;
const DURUMLAR = [['basarili', 'Başarılı'], ['hata', 'Hata verdi'], ['', 'Bilinmiyor']];

/**
 * Satırın tamamı ("İncele"): tüm sütunlar ad — değer olarak; uzun metin önizlenir, "Görüntüle" tam metin penceresini açar.
 * Gizli (maskeli) sütun maskeli kalır. Kapanınca odak İncele düğmesine döner.
 * @param {{ kartBaslik: string; satirNo: number; sutunlar: string[]; satir: unknown[]; gizliSutunlar: string[]; bicim: unknown; donus: HTMLElement;
 *   goster: (g: { sutun: string; satirNo: number; metin: string; sutunlar: string[]; satir: unknown[]; donus: HTMLElement }) => void }} g
 */
function satirPenceresi(g) {
  const baslikId = yeniKimlik('pano-satir');
  const kapat = h('button', { type: 'button', class: 'hayalet' }, 'Kapat');
  const satirlar = g.sutunlar.map((ad, i) => {
    const metin = hucreBicimle(g.satir[i], g.bicim);
    let deger;
    if (uzunMetinMi(metin)) {
      const d = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `Görüntüle: ${ad}` }, 'Görüntüle');
      d.addEventListener('click', () => g.goster({ sutun: ad, satirNo: g.satirNo, metin, sutunlar: g.sutunlar, satir: g.satir, donus: d }));
      deger = h('dd', {}, h('span', { class: 'pano-satir-onizleme' }, metinKisalt(metin, 300)), ' ', d);
    } else deger = h('dd', { class: typeof g.satir[i] === 'number' ? 'sayi' : null }, metin === '' ? h('span', { class: 'soluk' }, '—') : metin);
    return [h('dt', {}, ad, g.gizliSutunlar.includes(ad) ? [' ', ikon('kilit')] : null), deger];
  });
  // İncele sorgusu varsa satırın altında ayrıntı tablosu: pencere açılınca çalışır (onay penceresi gerekirse api açar).
  const ayrinti = g.ayrinti ? h('section', { class: 'pano-ayrinti', 'aria-label': 'Ayrıntı kayıtları', 'aria-busy': 'true' },
    h('p', { class: 'soluk kucuk' }, h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), ' Ayrıntı sorgusu çalışıyor…')) : null;
  const diyalog = h('dialog', { class: `onay-diyalogu genis-onay pano-satir-penceresi${ayrinti ? ' ayrintili' : ''}`, 'aria-labelledby': baslikId },
    h('div', { class: 'diyalog-govde' },
      h('h2', { id: baslikId }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('goz')), `${g.kartBaslik} · ${g.satirNo}. satır`),
      h('dl', { class: 'pano-satir-listesi' }, satirlar.flat()), ayrinti),
    h('div', { class: 'diyalog-alt' }, kapat));
  if (ayrinti && g.ayrinti) {
    g.ayrinti().then((r) => {
      if (!diyalog.isConnected) return;
      ayrinti.setAttribute('aria-busy', 'false');
      yerlestir(ayrinti, ayrintiTablosu(r, g));
    }).catch((e) => {
      if (!diyalog.isConnected) return;
      ayrinti.setAttribute('aria-busy', 'false');
      yerlestir(ayrinti, e && e.durum === 423 ? h('p', { class: 'soluk kucuk' }, 'Ayrıntı sorgusu çalıştırılmadı.')
        : h('p', { class: 'hata-metni', role: 'alert' }, e && e.message ? e.message : String(e)));
    });
  }
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => { diyalog.remove(); if (g.donus.isConnected) g.donus.focus({ preventScroll: true }); });
  document.body.append(diyalog);
  diyalog.showModal();
  kapat.focus();
}

/** Ayrıntı hücresindeki tarih-saat (ISO) yerel saatle "gg.aa.yyyy ss:dd:sn"; diğerleri hucreBicimle. @param {unknown} v */
function ayrintiMetni(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v.trim())) {
    const t = new Date(v.trim());
    if (!Number.isNaN(t.getTime())) {
      const iki = (/** @type {number} */ x) => String(x).padStart(2, '0');
      return `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()} ${iki(t.getHours())}:${iki(t.getMinutes())}:${iki(t.getSeconds())}`;
    }
  }
  return hucreBicimle(v, { tarih: 'yok' });
}

/**
 * İncele sorgusunun sonucu: başlıklı tablo; uzun metin (ör. istek / yanıt) kısaltılır, "Görüntüle" tam metin penceresini açar.
 * @param {{ sutunlar: string[]; satirlar: unknown[][]; gizliSutunlar?: string[]; kesildi?: boolean; satirSiniri?: number }} r
 * @param {{ gosterAyrinti?: (x: { sutun: string; satirNo: number; metin: string; sutunlar: string[]; satir: unknown[]; donus: HTMLElement }) => void }} g
 */
function ayrintiTablosu(r, g) {
  if (!r.satirlar.length) return h('p', { class: 'soluk kucuk' }, 'Ayrıntı sorgusu kayıt döndürmedi.');
  const gizli = new Set(r.gizliSutunlar || []);
  const govde = r.satirlar.map((satir, i) => h('tr', {}, r.sutunlar.map((ad, j) => {
    const metin = ayrintiMetni(satir[j]);
    if (!uzunMetinMi(metin)) return h('td', { class: typeof satir[j] === 'number' ? 'sayi' : null }, metin);
    const d = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `Görüntüle: ${ad}, ${i + 1}. kayıt` }, 'Görüntüle');
    d.addEventListener('click', () => g.gosterAyrinti?.({ sutun: ad, satirNo: i + 1, metin, sutunlar: r.sutunlar, satir, donus: d }));
    return h('td', { class: 'pano-ayrinti-uzun' }, h('span', { class: 'pano-satir-onizleme' }, metinKisalt(metin, 160)), ' ', d);
  })));
  return h('div', {},
    h('p', { class: 'soluk kucuk' }, `${r.satirlar.length.toLocaleString('tr-TR')} kayıt`, r.kesildi ? ` (ilk ${r.satirSiniri ?? r.satirlar.length} gösteriliyor)` : ''),
    h('div', { class: 'pano-ayrinti-tablo', tabindex: '0', role: 'region', 'aria-label': 'Ayrıntı tablosu' },
      h('table', { class: 'ozet-tablosu' },
        h('thead', {}, h('tr', {}, r.sutunlar.map((ad) => h('th', { scope: 'col' }, ad, gizli.has(ad) ? [' ', ikon('kilit')] : null)))),
        h('tbody', {}, govde))));
}

/**
 * Hücrenin tam metni penceresi. Kapanınca odak açan düğmeye döner (Esc ya da "Kapat").
 * @param {{ proje: { id: string; ad: string }; kartBaslik: string; zaman: string; sutun: string; satirNo: number; metin: string;
 *   sutunlar: string[]; satir: unknown[]; donus: HTMLElement }} g
 */
function metinPenceresi(g) {
  const baslikId = yeniKimlik('pano-metin');
  const bicim = metniBicimle(g.metin);
  const kesik = g.metin.endsWith(KESILDI_EKI);
  let bicimli = bicim.bicimlendi;
  const pre = h('pre', { class: 'pano-metin-icerik', tabindex: '0', role: 'region', 'aria-label': `${g.sutun} metni` });
  const ara = h('input', { type: 'search', class: 'pano-metin-ara', placeholder: 'Metinde ara', 'aria-label': 'Metinde ara', autocomplete: 'off', spellcheck: 'false' });
  const sayac = h('span', { class: 'soluk kucuk pano-metin-sayac', role: 'status', 'aria-live': 'polite' });
  const onceki = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': 'Önceki eşleşme', title: 'Önceki eşleşme (Shift + Enter)', disabled: true }, h('span', { 'aria-hidden': 'true' }, '↑'));
  const sonraki = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': 'Sonraki eşleşme', title: 'Sonraki eşleşme (Enter)', disabled: true }, h('span', { 'aria-hidden': 'true' }, '↓'));
  const kopyala = h('button', { type: 'button', class: 'kucuk-dugme pano-metin-kopyala' }, ikon('kopya'), 'Kopyala');
  const bicimKutusu = h('input', { type: 'checkbox', checked: bicimli });
  const bicimSecimi = bicim.bicimlendi ? h('label', { class: 'secenek kucuk pano-metin-bicim' }, bicimKutusu, `Girintili göster (${bicim.tur.toUpperCase()})`) : null;
  const duyuru = h('span', { class: 'gorunmez', role: 'status', 'aria-live': 'polite' });
  const ekleDugmesi = govdeGibiMi(g.metin)
    ? h('button', { type: 'button', class: 'kucuk-dugme pano-ornek-ekle-dugmesi', 'aria-expanded': 'false' }, ikon('arti'), 'Bu isteği servis analizine örnek olarak ekle')
    : null;
  const ornekAlani = h('div', { class: 'pano-ornek-alani', hidden: true });
  const kapat = h('button', { type: 'button', class: 'hayalet' }, 'Kapat');
  const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay pano-metin-penceresi', 'aria-labelledby': baslikId },
    h('div', { class: 'diyalog-govde' },
      h('h2', { id: baslikId }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('dosya')), `${g.sutun} · ${g.satirNo}. satır`),
      h('p', { class: 'soluk kucuk pano-metin-bilgi' }, `${g.kartBaslik} · ${g.metin.length.toLocaleString('tr-TR')} karakter`,
        bicim.bicimlendi ? ` · ${bicim.tur.toUpperCase()}` : '', kesik ? ' · metin 100 KB\'ta kesildi' : ''),
      h('div', { class: 'pano-metin-araclari' }, h('span', { class: 'pano-metin-arama' }, ikon('ara'), ara, onceki, sonraki, sayac), bicimSecimi, kopyala, ekleDugmesi),
      ornekAlani, pre, duyuru),
    h('div', { class: 'diyalog-alt' }, kapat));

  /** @type {HTMLElement[]} */
  let isaretler = [];
  let etkin = -1;
  const gosterilen = () => (bicimli ? bicim.metin : g.metin);
  const etkinYap = (/** @type {number} */ i) => {
    if (!isaretler.length) return;
    isaretler[etkin]?.classList.remove('etkin');
    etkin = (i + isaretler.length) % isaretler.length;
    const m = isaretler[etkin];
    m.classList.add('etkin');
    // Yalnız metin kutusu kaydırılır (sayfa ve pencere yerinde kalır).
    pre.scrollTop = Math.max(0, m.offsetTop - pre.clientHeight / 3);
    sayac.textContent = `${etkin + 1} / ${isaretler.length}${isaretler.length >= EN_COK_ISARET ? '+' : ''}`;
  };
  const ciz = () => {
    const metin = gosterilen();
    const q = ara.value.trim();
    isaretler = [];
    etkin = -1;
    if (!q) { pre.replaceChildren(document.createTextNode(metin)); sayac.textContent = ''; onceki.disabled = sonraki.disabled = true; return; }
    const kucuk = metin.toLocaleLowerCase('tr');
    const aranan = q.toLocaleLowerCase('tr');
    const parcalar = /** @type {Node[]} */ ([]);
    let i = 0;
    while (isaretler.length < EN_COK_ISARET) {
      const j = kucuk.indexOf(aranan, i);
      if (j < 0) break;
      if (j > i) parcalar.push(document.createTextNode(metin.slice(i, j)));
      const m = h('mark', { class: 'pano-metin-eslesme' }, metin.slice(j, j + aranan.length));
      isaretler.push(m);
      parcalar.push(m);
      i = j + aranan.length;
    }
    parcalar.push(document.createTextNode(metin.slice(i)));
    pre.replaceChildren(...parcalar);
    onceki.disabled = sonraki.disabled = !isaretler.length;
    if (isaretler.length) etkinYap(0); else sayac.textContent = 'Eşleşme yok';
  };
  let bekleyen = 0;
  ara.addEventListener('input', () => { clearTimeout(bekleyen); bekleyen = window.setTimeout(ciz, 120); });
  ara.addEventListener('keydown', (o) => {
    if (o.key === 'Enter') { o.preventDefault(); clearTimeout(bekleyen); if (etkin < 0) ciz(); else etkinYap(etkin + (o.shiftKey ? -1 : 1)); }
  });
  onceki.addEventListener('click', () => etkinYap(etkin - 1));
  sonraki.addEventListener('click', () => etkinYap(etkin + 1));
  bicimKutusu.addEventListener('change', () => { bicimli = bicimKutusu.checked; ciz(); });
  // Kopyala: veritabanındaki metnin kendisi (biçimlenmemiş).
  kopyala.addEventListener('click', async () => {
    let tamam = false;
    try { await navigator.clipboard.writeText(g.metin); tamam = true; } catch {
      const alanMetin = h('textarea', { class: 'gorunmez', readonly: true, 'aria-hidden': 'true', tabindex: '-1' });
      alanMetin.value = g.metin;
      diyalog.append(alanMetin);
      alanMetin.select();
      try { tamam = document.execCommand('copy'); } catch { tamam = false; }
      alanMetin.remove();
      kopyala.focus();
    }
    duyuru.textContent = tamam ? 'Metin panoya kopyalandı.' : 'Kopyalanamadı; metni seçip Ctrl + C ile kopyalayın.';
    bildir(duyuru.textContent, tamam ? 'basari' : 'hata');
  });
  ekleDugmesi?.addEventListener('click', () => {
    const acik = ornekAlani.hidden;
    ornekAlani.hidden = !acik;
    ekleDugmesi.setAttribute('aria-expanded', String(acik));
    if (acik && !ornekAlani.childElementCount) ornekFormu(ornekAlani, g, () => diyalog.close());
    if (acik) /** @type {HTMLElement | null} */ (ornekAlani.querySelector('select, input'))?.focus();
  });
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => {
    diyalog.remove();
    if (g.donus.isConnected) g.donus.focus({ preventScroll: true });
  });
  ciz();
  document.body.append(diyalog);
  diyalog.showModal();
  ara.focus();
}

/**
 * "Bu isteği servis analizine örnek olarak ekle": servis + metot (gövdenin kök / işlem adına göre önerilir), örnek adı ve durumu.
 * Örnek metodun örnek istekler listesine mevcut kayıt ucuyla eklenir (POST /platform/servis/kaydet; servise istek atılmaz).
 * @param {HTMLElement} kap @param {Parameters<typeof metinPenceresi>[0]} g @param {() => void} kapat
 */
function ornekFormu(kap, g, kapat) {
  const q = encodeURIComponent;
  yerlestir(kap, h('div', { class: 'iskelet', 'aria-busy': 'true' }, h('span', { class: 'gorunmez', role: 'status' }, 'Servisler yükleniyor…'), h('i', {})));
  api(`/platform/servisler?projeId=${q(g.proje.id)}`).then(({ servisler }) => {
    const liste = (servisler || []).filter((s) => (s.ayarlar?.operasyonlar || []).length);
    if (!liste.length) {
      yerlestir(kap, h('p', { class: 'not-kutusu uyari' }, 'Bu projede metodu olan servis yok. Önce ', h('a', { href: '#/servisler' }, 'Servisler'), '\'den servis ekleyin.'));
      return;
    }
    const kok = govdeKokAdi(g.metin);
    let oneri = '';
    for (const s of liste) {
      const m = metotOner(kok, s.ayarlar.operasyonlar.map((o) => o.ad));
      if (m) { oneri = `${s.id}|${m}`; break; }
    }
    const metot = h('select', {}, h('option', { value: '' }, 'Servis ve metot seçin'),
      liste.map((s) => h('optgroup', { label: s.ad }, s.ayarlar.operasyonlar.map((o) => h('option', { value: `${s.id}|${o.ad}`, selected: `${s.id}|${o.ad}` === oneri }, `${s.ad} › ${o.ad}`)))));
    const zaman = satirZamani(g.sutunlar, g.satir) ?? sonVeriMetni(g.zaman);
    const ad = h('input', { type: 'text', maxlength: 80, autocomplete: 'off', value: `${g.kartBaslik} · ${zaman}`.slice(0, 80) });
    const durumOnerisi = durumOner(g.sutunlar, g.satir);
    const grup = yeniKimlik('pano-ornek-durum');
    const durum = h('fieldset', { class: 'pano-ornek-durum' }, h('legend', {}, 'Durum'),
      DURUMLAR.map(([d, e]) => h('label', { class: 'secenek' }, h('input', { type: 'radio', name: grup, value: d, checked: d === (durumOnerisi?.durum ?? '') }), e)),
      durumOnerisi ? h('p', { class: 'soluk kucuk' }, `Satırdaki ${durumOnerisi.sutun} = ${durumOnerisi.deger} değerine göre önerildi; doğruysa olduğu gibi bırakın.`) : null);
    const sonuc = h('div', { class: 'pano-ornek-sonuc', role: 'status', 'aria-live': 'polite' });
    const ekle = h('button', { type: 'submit', class: 'birincil' }, ikon('arti'), 'Örneği ekle');
    const form = h('form', { class: 'pano-ornek-formu', novalidate: true, 'aria-label': 'Servis analizine örnek ekle' },
      h('p', { class: 'soluk kucuk' }, kok ? `Gövdenin işlemi: ${kok}.` : 'Gövdenin işlem adı bulunamadı; metodu seçin.',
        ' Örnek yalnız kaydedilir; servise istek atılmaz.'),
      alan('Servis ve metot', metot, { zorunlu: true }), alan('Örneğin adı', ad), durum, h('div', { class: 'dugmeler' }, ekle), sonuc);
    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      const ayrac = metot.value.indexOf('|');
      const servisId = ayrac > 0 ? metot.value.slice(0, ayrac) : '';
      const op = ayrac > 0 ? metot.value.slice(ayrac + 1) : '';
      if (!servisId || !op) { yerlestir(sonuc, h('p', { class: 'alan-uyarisi' }, 'Servis ve metodu seçin.')); metot.focus(); return; }
      const secili = /** @type {HTMLInputElement | null} */ (durum.querySelector('input:checked'));
      try {
        const y = await mesgulIken(ekle, 'Ekleniyor…', async () => {
          const { servis: s } = await api(`/platform/servis?projeId=${q(g.proje.id)}&id=${q(servisId)}`);
          const a = s.ayarlar || {};
          const mevcut = (a.ornekIstekler || {})[op] || [];
          if (mevcut.some((x) => String(x.govde).trim() === g.metin.trim())) throw new Error(`Bu gövde ${op} metodunda zaten örnek olarak var.`);
          const yeni = { ad: ad.value.trim() || `${g.kartBaslik} · ${zaman}`, govde: g.metin, kaynak: 'elle', ...(secili && secili.value ? { durum: secili.value } : {}) };
          // Mevcut örnekler maskeli gelir; sunucu aynı kimlikli örneklerin gizli değerlerini saklanan asıllarıyla geri yazar.
          await api('/platform/servis/kaydet', { govde: { projeId: g.proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: a.yol,
            ornekIstekler: { ...(a.ornekIstekler || {}), [op]: [...mevcut, yeni] } } });
          return { s, yeni };
        });
        const adres = `#/servisler/s/${q(y.s.id)}/analiz`;
        const git = h('a', { class: 'dugme birincil kucuk-dugme', href: adres }, ikon('ara'), 'Servisi analiz et');
        git.addEventListener('click', () => kapat());
        yerlestir(sonuc, h('div', { class: 'not-kutusu basari' }, ikon('onay'), `"${y.yeni.ad}" ${y.s.ad} › ${op} örneklerine eklendi. `, git));
        ekle.disabled = true;
        git.focus();
      } catch (e) {
        if (e && e.durum === 423) return;
        yerlestir(sonuc, h('p', { class: 'alan-uyarisi', role: 'alert' }, e && e.message ? e.message : String(e)));
      }
    });
    yerlestir(kap, form);
    metot.focus();
  }).catch((e) => {
    if (e && e.durum === 423) return;
    yerlestir(kap, h('div', { class: 'not-kutusu hata', role: 'alert' }, e && e.message ? e.message : String(e)));
  });
}
