// Platform arayüzü — ortak yardımcılar: API istemcisi, DOM oluşturucu, form bileşenleri.
// Kullanıcı verisi DOM'a YALNIZCA metin düğümü/özellik olarak yazılır (innerHTML kullanılmaz).
import { IZIN_TANIMLARI, izinAdresi, izinTanimi } from './izin-tanimlari.mjs';
import { ESKI_STIL_ADLARI, STILLER, VARSAYILAN_STIL, stilAdiniCoz } from './tema-stilleri.mjs';

/** İzin penceresinden art arda yeniden deneme sınırı (en çok izin sayısı kadar farklı izin). */
const IZIN_ANAHTAR_SAYISI = IZIN_TANIMLARI.length;

const tokenMeta = document.querySelector('meta[name="oturum-tokeni"]');
/** Sunucunun bu yanıta enjekte ettiği oturum token'ı (yalnızca bellekte tutulur). */
export const TOKEN = tokenMeta ? tokenMeta.getAttribute('content') || '' : '';

/**
 * Çalışan koşunun canlı ekran karesi. Token BAŞLIKTA gider (img src'de sorgu dizesi olsaydı adres geçmişine / günlüklere düşerdi);
 * kare henüz yoksa sunucu 204 döner (konsolda hata yok) ve null döner. Dönen blob: adresini çağıran, yenisini koyunca
 * URL.revokeObjectURL ile bırakır.
 * @param {string} kosuId @returns {Promise<string | null>}
 */
export async function canliKareAl(kosuId) {
  try {
    const r = await fetch(`/canli?kosuId=${encodeURIComponent(kosuId)}`, { headers: { 'X-Test-Sunucu-Token': TOKEN }, cache: 'no-store' });
    if (r.status !== 200) return null;
    const b = await r.blob();
    return b.size ? URL.createObjectURL(b) : null;
  } catch {
    return null;
  }
}
if (tokenMeta) tokenMeta.remove();

// ---------------------------------------------------------------------------------------
// Marka (TEK YER): ürün adını değiştirmek için yalnızca burayı düzenleyin.
//   ad: üst çubuk ve sekme başlığı · altBaslik: marka altındaki kısa tanım
//   yonelme: hoş geldiniz başlığındaki "…'ye hoş geldiniz" biçimi (Türkçe ek ada göre değişir)
// ---------------------------------------------------------------------------------------
export const MARKA = Object.freeze({ ad: 'Nöbetçi', altBaslik: 'test komuta merkezi', yonelme: "Nöbetçi'ye" });

// ---------------------------------------------------------------------------------------
// Tema: <html data-tema="koyu|acik">. Seçim yapılmamışsa (localStorage boş) işletim sisteminin
// açık/koyu ayarı geçerlidir (CSS prefers-color-scheme). Seçim 'platform.tema' anahtarında durur.
// ---------------------------------------------------------------------------------------
const TEMA_ANAHTARI = 'platform.tema';
const sistemAcikMi = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
export function kayitliTema() {
  try { const t = localStorage.getItem(TEMA_ANAHTARI); return t === 'koyu' || t === 'acik' ? t : null; } catch { return null; }
}
/** Etkin tema ('koyu' | 'acik'). */
export const etkinTema = () => document.documentElement.dataset.tema || (sistemAcikMi() ? 'acik' : 'koyu');
export function temaUygula(tema) {
  if (tema === 'koyu' || tema === 'acik') document.documentElement.dataset.tema = tema;
  else delete document.documentElement.dataset.tema;
  window.dispatchEvent(new CustomEvent('tema-degisti', { detail: etkinTema() }));
}
temaUygula(kayitliTema());

// ---------------------------------------------------------------------------------------
// Görünüm teması (renk ailesi + biçim): <html data-stil="kurumsal|parlak">; "komuta" varsayılandır (özellik yok).
// Açık / koyu seçiminden bağımsızdır. Kullanıcı kararı: Ayarlar > Arayüz > Tema; seçim 'platform.stil' anahtarında durur
// (kilit ekranında da geçerli olsun diye tarayıcıda; gizli bilgi değildir). Tema listesi ve eski anahtar eşlemesi
// (ör. "canli" → "parlak") tema-stilleri.mjs'te.
// ---------------------------------------------------------------------------------------
export { STILLER };
const STIL_ANAHTARI = 'platform.stil';
export function kayitliStil() {
  try {
    const kayit = localStorage.getItem(STIL_ANAHTARI);
    const s = stilAdiniCoz(kayit);
    // Eski anahtar (ör. "canli") yenisiyle yeniden yazılır: seçim korunur.
    if (kayit !== null && kayit !== s && Object.hasOwn(ESKI_STIL_ADLARI, kayit)) localStorage.setItem(STIL_ANAHTARI, s);
    return s;
  } catch { return VARSAYILAN_STIL; }
}
/** @param {string} stil */
export function stilUygula(stil) {
  const gecerli = stilAdiniCoz(stil);
  if (gecerli === 'komuta') delete document.documentElement.dataset.stil;
  else document.documentElement.dataset.stil = gecerli;
  try { localStorage.setItem(STIL_ANAHTARI, gecerli); } catch { /* yok sayılır */ }
  window.dispatchEvent(new CustomEvent('tema-degisti', { detail: etkinTema() }));
}
{
  const s = kayitliStil();
  if (s !== 'komuta') document.documentElement.dataset.stil = s;
}

/** Başlık çubuklarındaki tema düğmesi (güneş/ay). Seçim hatırlanır. */
export function temaDugmesi() {
  const dugme = h('button', { type: 'button', class: 'ikon-dugme tema-dugmesi' });
  const guncelle = () => {
    const koyu = etkinTema() === 'koyu';
    dugme.replaceChildren(ikon(koyu ? 'gunes' : 'ay'));
    dugme.setAttribute('aria-label', koyu ? 'Açık temaya geç' : 'Koyu temaya geç');
    dugme.title = koyu ? 'Açık temaya geç' : 'Koyu temaya geç';
  };
  dugme.addEventListener('click', () => {
    const yeni = etkinTema() === 'koyu' ? 'acik' : 'koyu';
    try { localStorage.setItem(TEMA_ANAHTARI, yeni); } catch { /* yok sayılır */ }
    temaUygula(yeni);
  });
  window.addEventListener('tema-degisti', guncelle);
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (!kayitliTema()) temaUygula(null); });
  guncelle();
  return dugme;
}

// ---------------------------------------------------------------------------------------
// İkonlar (24×24, çizgi). 'c:x,y,r' daire, 'r:x,y,g,y,rx' dikdörtgen, diğerleri path.
// ---------------------------------------------------------------------------------------
const IKONLAR = {
  grafik: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  liste: ['M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01'],
  ekran: ['r:3,4,18,13,2', 'M8 21h8M12 17v4'],
  ayar: ['c:12,12,3', 'M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z'],
  kilit: ['r:4,11,16,10,2', 'M8 11V7a4 4 0 018 0v4'],
  ara: ['c:11,11,7', 'M20 20l-3.5-3.5'],
  gunes: ['c:12,12,4', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  ay: ['M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z'],
  oynat: ['M7 4.5v15l12-7.5z'],
  onay: ['M5 12.5l4.5 4.5L19 7.5'],
  carpi: ['M6 6l12 12M18 6L6 18'],
  eksi: ['M6 12h12'],
  indir: ['M12 4v11M7 10l5 5 5-5M5 20h14'],
  saat: ['c:12,12,9', 'M12 7v5l3 2'],
  takvim: ['r:3,5,18,16,2', 'M3 10h18M8 3v4M16 3v4'],
  cpu: ['r:6,6,12,12,2', 'M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4'],
  uyari: ['M12 3l9.5 17h-19z', 'M12 10v4M12 17.5h.01'],
  zamanlayici: ['c:12,13,8', 'M12 9v4M9 2h6'],
  ag: ['c:12,12,9', 'M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18'],
  hedef: ['c:12,12,8', 'c:12,12,3'],
  izgara: ['r:3,3,7,7,1.5', 'r:14,3,7,7,1.5', 'r:3,14,7,7,1.5', 'r:14,14,7,7,1.5'],
  asagi: ['M8 10l4 4 4-4'],
  solCentik: ['M14 8l-4 4 4 4'],
  sagCentik: ['M10 8l4 4-4 4'],
  esle: ['M4 8h14', 'M15 5l3 3-3 3', 'M20 16H6', 'M9 13l-3 3 3 3'],
  video: ['r:2.5,6,13,12,2', 'M15.5 10.5L21 7.5v9l-5.5-3'],
  genislet: ['M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'],
  yukle: ['M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4', 'M12 15V3M7 8l5-5 5 5'],
  arti: ['r:3,3,18,18,4', 'M12 8v8M8 12h8'],
  artiYalin: ['M12 5v14M5 12h14'],
  klasor: ['M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M9 13h7M13 10l3 3-3 3'],
  dosya: ['M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z', 'M14 3v5h5'],
  kalkan: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  bilgisayar: ['r:3,4,18,13,2', 'M8 21h8M12 17v4'],
  ok: ['M5 12h14M13 6l6 6-6 6'],
  geri: ['M19 12H5M11 6l-6 6 6 6'],
  yenile: ['M20 11a8 8 0 10-2.3 5.7', 'M20 4v7h-7'],
  anahtar: ['c:8,15,4', 'M10.8 12.2L20 3M16 7l3 3M14 9l2 2'],
  kullanici: ['c:12,8,4', 'M4 21a8 8 0 0116 0'],
  katman: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  veri: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  arsiv: ['r:3,4,18,5,1.5', 'M5 9v10a2 2 0 002 2h10a2 2 0 002-2V9', 'M10 13h4'],
  gorunum: ['r:3,3,18,18,2', 'M3 9h18M9 21V9'],
  tarih: ['c:12,12,9', 'M12 7v5l3 2', 'M3 4v4h4'],
  kopya: ['r:8,8,12,12,2', 'M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2'],
  goz: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'c:12,12,3'],
  duzenle: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  cop: ['M4 7h16M10 11v6M14 11v6', 'M6 7l1 13h10l1-13M9 7V4h6v3'],
  isaret: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'c:12,12,2.4'],
  pusula: ['c:12,12,9', 'M15.5 8.5l-2 5-5 2 2-5z'],
  simsek: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  cikis: ['M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3', 'M10 17l5-5-5-5M15 12H3'],
  yildiz: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  cekmece: ['M3 13l3-8h12l3 8v6a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M3 13h5l1 3h6l1-3h5'],
  soru: ['c:12,12,9', 'M9.5 9.2a2.6 2.6 0 015 .8c0 1.8-2.5 2.2-2.5 4', 'M12 17.2v.3']
};
const SVG_NS = 'http://www.w3.org/2000/svg';
/** SVG öğesi oluşturur (özellikler setAttribute ile). */
export function s(etiket, ozellikler, ...cocuklar) {
  const el = document.createElementNS(SVG_NS, etiket);
  for (const [ad, deger] of Object.entries(ozellikler || {})) {
    if (deger === undefined || deger === null || deger === false) continue;
    if (ad.startsWith('on') && typeof deger === 'function') el.addEventListener(ad.slice(2), deger);
    else el.setAttribute(ad, String(deger));
  }
  for (const c of cocuklar.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
/** Dekoratif ikon (aria-hidden). ad: IKONLAR anahtarı. */
export function ikon(ad, sinif = '') {
  const parcalar = IKONLAR[ad] || IKONLAR.isaret;
  const svg = s('svg', { viewBox: '0 0 24 24', class: `ikon ${ad === 'oynat' ? 'dolu ' : ''}${sinif}`.trim(), 'aria-hidden': 'true', focusable: 'false' });
  for (const p of parcalar) {
    if (p.startsWith('c:')) { const [cx, cy, r] = p.slice(2).split(','); svg.append(s('circle', { cx, cy, r })); }
    else if (p.startsWith('r:')) { const [x, y, w, hh, rx] = p.slice(2).split(','); svg.append(s('rect', { x, y, width: w, height: hh, rx })); }
    else svg.append(s('path', { d: p }));
  }
  return svg;
}
/** Marka logosu (altıgen işaret). */
export const logo = (sinif = 'logo') => h('span', { class: sinif, 'aria-hidden': 'true' },
  s('svg', { viewBox: '0 0 24 24' }, s('path', { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z' }), s('circle', { cx: 12, cy: 12, r: 2.4 })));

export class ApiHatasi extends Error {
  constructor(mesaj, durum, govde) {
    super(mesaj);
    this.durum = durum;
    this.govde = govde || {};
    this.kod = this.govde.kod || null;
    this.bekleSaniye = this.govde.bekleSaniye || null;
  }
}

/** Kaydedilmemiş değişiklik izi (cikis-korumasi.js kurar ve işaretler). */
export const kayitIzi = { kirli: false };
/** Kaydedildi / bilerek vazgeçildi: sayfadan çıkarken uyarı sorulmaz. */
export const degisiklikleriBirak = () => { kayitIzi.kirli = false; };
/**
 * Başarılı olunca veriyi saklayan uçlar (önizleme, deneme, denetim gibi uçlar izi temizlemez). "yukle": tekrar analizde paketin
 * bulguları ve test verisi seçimleri sunucuda saklanır (ekran/analiz/yukle), ardından Bulgular'a geçilir.
 */
const KAYIT_UCU = /(?:\/|-)(kaydet|sil|uygula|ekle|olustur|degistir|duzenle|tasi|aktar|kosuya-dahil|varsayilan|yeniden-adlandir|sirala|toplu-ata|tasarim|yukle|kopyala|modellerden|sifirla|unut|kaldir|test-verisine-tasi)(?:$|[/?])/;

/**
 * JSON API çağrısı (aynı köken). govde verilirse POST. 423 (kasa kilitli) olursa
 * "kasa-kilitli" olayı yayınlanır; kabuk kilit ekranına döner.
 */
export async function api(yol, secenekler = {}) {
  const istek = { method: secenekler.govde ? 'POST' : 'GET', headers: { 'X-Test-Sunucu-Token': TOKEN }, cache: 'no-store' };
  if (secenekler.govde) {
    istek.headers['Content-Type'] = 'application/json';
    istek.body = JSON.stringify(Object.assign({}, secenekler.govde, { token: TOKEN }));
  }
  let yanit;
  try {
    yanit = await fetch(yol, istek);
  } catch {
    throw new ApiHatasi('Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun (npm run baslat).', 0, {});
  }
  let veri = null;
  try { veri = await yanit.json(); } catch { veri = null; }
  if (!yanit.ok || (veri && veri.basarili === false)) {
    const hata = new ApiHatasi((veri && veri.mesaj) || `İstek başarısız oldu (${yanit.status}).`, yanit.status, veri);
    if (yanit.status === 423 && !secenekler.kilitOlayiYok) window.dispatchEvent(new CustomEvent('kasa-kilitli', { detail: hata.message }));
    // Kapalı izin (Ayarlar > İzinler): sunucu izin denetimini uçta HER yan etkiden önce yapar (guvenlik/uc-denetimi.mjs, izinler.mjs:
    // reddedilen istekte hiçbir şey yapılmamıştır). Her ekranda aynı standart pencere: "İzin ver ve devam et" izni Ayarlar > İzinler'deki
    // açmayla aynı uçtan açar ve AYNI isteği bir kez yeniden gönderir (çağıran başarılı yanıtı alır); "Kapat" / "İzinlere git" hatayı
    // olduğu gibi döndürür. Yeniden denemede başka bir izin kapalıysa pencere o izin için açılır (en çok izin sayısı kadar).
    if (hata.kod === 'IZIN_KAPALI' && veri && typeof veri.izin === 'string') {
      const deneme = secenekler.izinDenemesi || 0;
      if (deneme < IZIN_ANAHTAR_SAYISI && await izinUyarisiGoster(veri.izin, hata.message)) {
        return api(yol, { ...secenekler, izinDenemesi: deneme + 1 });
      }
    }
    // CANLI ortam onayı (TEK KAYNAK sunucuda: guvenlik/uc-denetimi.mjs): CANLI ortama istek atacak işlem istekte canliOnay: true
    // taşımıyorsa sunucu hiçbir şey yapmadan 409 döner. Ekranlar çoğunlukla onayı işlem başlamadan sorar (kosu-paneli.js >
    // canliOnayIste); sormayan bir yol kalmışsa burada AYNI standart pencere açılır — "Evet, devam et" → aynı istek canliOnay: true
    // ile bir kez yeniden gönderilir; "Vazgeç" → hata olduğu gibi döner (CANLI'ya istek gitmez).
    if (hata.kod === 'CANLI_ONAY_GEREKLI' && secenekler.govde && secenekler.govde.canliOnay !== true && !secenekler.canliDenemesi) {
      if (await canliOnayPenceresi(typeof veri.ortamAdi === 'string' ? veri.ortamAdi : '')) {
        return api(yol, { ...secenekler, govde: { ...secenekler.govde, canliOnay: true }, canliDenemesi: true });
      }
    }
    // Taban adresine bağlı servisin adresi farklılaşıyor (sunucu hiçbir şey yazmadı): karar penceresi (taban-adresler.js > tabanKarariSor);
    // seçilen karar (tabanKararlari[servisId]) ile AYNI istek yeniden gönderilir. Pencere kapatılırsa hata olduğu gibi döner.
    if (hata.kod === 'TABAN_KARARI' && veri && veri.karar && secenekler.govde) {
      const deneme = secenekler.tabanDenemesi || 0;
      if (deneme < 20) {
        const { tabanKarariSor } = await import('./taban-adresler.js');
        const karar = await tabanKarariSor(veri.karar);
        if (karar) {
          const govde = { ...secenekler.govde, tabanKararlari: { ...(secenekler.govde.tabanKararlari || {}), [veri.karar.servisId]: karar } };
          return api(yol, { ...secenekler, govde, tabanDenemesi: deneme + 1 });
        }
      }
    }
    // 401: sayfanın oturum token'ı sunucuyu tutmuyor → Nöbetçi yeniden başlatılmış (her başlatmada token değişir).
    if (yanit.status === 401) window.dispatchEvent(new CustomEvent('sunucu-yenilendi'));
    throw hata;
  }
  if (secenekler.govde && KAYIT_UCU.test(yol)) degisiklikleriBirak();
  return veri || {};
}

/**
 * CANLI ortam onayı — TEK TİP pencere (her işlemde sorulur, hatırlanmaz). Başlık "CANLI ortam"; düğmeler "Evet, devam et" /
 * "Vazgeç" (Esc = Vazgeç). Evet → true.
 * @param {string} ortamAdi @returns {Promise<boolean>}
 */
export function canliOnayPenceresi(ortamAdi) {
  return new Promise((coz) => {
    const evet = h('button', { type: 'button', class: 'tehlike canli-onay-evet' }, 'Evet, devam et');
    const vazgec = h('button', { type: 'button', class: 'hayalet canli-onay-vazgec' }, 'Vazgeç');
    const diyalog = h('dialog', { class: 'onay-diyalogu tehlikeli canli-onay-penceresi', 'data-pencere': 'karar', 'aria-labelledby': 'canli-onay-basligi', 'aria-describedby': 'canli-onay-metni' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'canli-onay-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('uyari')), 'CANLI ortam'),
        h('p', { id: 'canli-onay-metni' }, 'Bu işlem ', h('strong', {}, ortamAdi || 'seçilen'), ' (CANLI) ortamında yapılacak; istekler gerçek sisteme gider. Emin misiniz?')),
      h('div', { class: 'diyalog-alt' }, vazgec, evet));
    let sonuc = false;
    evet.addEventListener('click', () => { sonuc = true; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    vazgec.focus();
  });
}

/** Pencerede bekleyen izin kararları (aynı izin için aynı anda gelen 403'ler tek pencereyi bekler). @type {Map<string, Promise<boolean>>} */
const bekleyenIzinKararlari = new Map();

/**
 * Kapalı izin penceresi (izin başına tek pencere). Metin sunucudan gelir (izin-tanimlari.mjs > izinMesaji); iznin ne yaptığı, riski
 * ve kapalıyken ne olduğu tek kaynaktan (izin-tanimlari.mjs) eklenir. Düğmeler: "Kapat", "İzinlere git" (Ayarlar > İzinler, izin
 * satırına odak) ve — kasa açıkken — birincil "İzin ver ve devam et": izni Ayarlar > İzinler'deki açmayla AYNI uçtan
 * (/platform/izin/degistir, onay: true; değişiklik geçmişine "açıldı (izin penceresinden)") açar. Pencerenin kendisi bilinçli onaydır:
 * ek onay penceresi açılmaz. Riskli ortam izninde, izin açılsa da işlem başına canlı onayı ayrıca istenir (atlanmaz).
 * @param {string} anahtar @param {string} mesaj
 * @returns {Promise<boolean>} izin verildiyse true (çağıran isteği yeniden dener)
 */
export function izinUyarisiGoster(anahtar, mesaj) {
  const bekleyen = bekleyenIzinKararlari.get(anahtar);
  if (bekleyen) return bekleyen;
  const karar = izinPenceresi(anahtar, mesaj).finally(() => bekleyenIzinKararlari.delete(anahtar));
  bekleyenIzinKararlari.set(anahtar, karar);
  return karar;
}

/** @param {string} anahtar @param {string} mesaj @returns {Promise<boolean>} */
async function izinPenceresi(anahtar, mesaj) {
  // Başka bir izin penceresi açıksa önce o kapanır (pencereler üst üste binmez).
  while (document.querySelector('dialog.izin-uyarisi[open]')) await new Promise((c) => setTimeout(c, 150));
  /** Kasa kilitliyken izin açılamaz: düğme gösterilmez (Kapat + kilidi açma yönlendirmesi). */
  let kasaAcik = false;
  try {
    const r = await fetch('/platform/durum', { headers: { 'X-Test-Sunucu-Token': TOKEN }, cache: 'no-store' });
    const d = await r.json();
    kasaAcik = Boolean(d && d.kasa && d.kasa.acik);
  } catch { kasaAcik = false; }
  const t = izinTanimi(anahtar);
  return new Promise((coz) => {
    const git = h('button', { type: 'button', class: kasaAcik ? '' : 'birincil' }, ikon('kalkan'), 'İzinlere git');
    const kapat = h('button', { type: 'button', class: 'hayalet' }, 'Kapat');
    const ver = kasaAcik ? h('button', { type: 'button', class: 'birincil izin-ver' }, ikon('onay'), 'İzin ver ve devam et') : null;
    const hataKutusu = h('p', { class: 'alan-hatasi', role: 'alert' });
    const diyalog = h('dialog', { class: 'onay-diyalogu izin-uyarisi', 'data-pencere': 'karar', 'aria-labelledby': 'izin-uyarisi-basligi', 'aria-describedby': 'izin-uyarisi-metni' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'izin-uyarisi-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('kilit')), 'İzin gerekli'),
        h('p', { id: 'izin-uyarisi-metni' }, mesaj),
        t ? h('div', { class: 'izin-ozeti' },
          h('p', {}, h('b', {}, `${t.etiket}: `), t.aciklama),
          h('p', { class: 'kucuk' }, h('b', {}, 'Risk: '), t.risk),
          h('p', { class: 'soluk kucuk' }, t.kapaliyken)) : null,
        anahtar === 'canli-ortam' ? h('p', { class: 'soluk kucuk' }, 'İzin açılsa da CANLI ortama istek atan her işlem ayrıca onay ister.') : null,
        kasaAcik ? null : h('p', { class: 'soluk kucuk' }, 'Kasa kilitli: izni açmak için önce kasanın kilidini açın.'),
        hataKutusu),
      h('div', { class: 'diyalog-alt' }, kapat, git, ver));
    let sonuc = false;
    let gidilecek = false;
    git.addEventListener('click', () => { gidilecek = true; diyalog.close(); });
    kapat.addEventListener('click', () => diyalog.close());
    if (ver) {
      ver.addEventListener('click', async () => {
        hataKutusu.textContent = '';
        ver.disabled = true;
        try {
          await api('/platform/izin/degistir', { govde: { anahtar, acik: true, onay: true, kaynak: 'izin-penceresi' } });
          sonuc = true;
          diyalog.close();
          bildir(`"${t ? t.etiket : anahtar}" izni açıldı; işlem sürdürülüyor.`);
        } catch (e) {
          hataKutusu.textContent = e && e.message ? e.message : String(e);
          ver.disabled = false;
        }
      });
    }
    diyalog.addEventListener('close', () => {
      diyalog.remove();
      if (gidilecek) location.hash = izinAdresi(anahtar);
      coz(sonuc);
    });
    document.body.append(diyalog);
    diyalog.showModal();
    (ver || git).focus();
  });
}

/**
 * DOM oluşturucu: h('button', { class: 'x', onclick: fn, disabled: true }, 'Metin', altOge)
 * Metinler her zaman metin düğümü olarak eklenir.
 */
export function h(etiket, ozellikler, ...cocuklar) {
  const el = document.createElement(etiket);
  for (const [ad, deger] of Object.entries(ozellikler || {})) {
    if (deger === undefined || deger === null || deger === false) continue;
    if (ad.startsWith('on') && typeof deger === 'function') el.addEventListener(ad.slice(2), deger);
    else if (ad === 'class') el.className = deger;
    else if (ad === 'style' && typeof deger === 'object') { for (const [k, v] of Object.entries(deger)) el.style.setProperty(k, String(v)); }
    else if (['value', 'checked', 'disabled', 'hidden', 'selected', 'indeterminate', 'required', 'multiple', 'readOnly'].includes(ad)) el[ad] = deger;
    else if (deger === true) el.setAttribute(ad, '');
    else el.setAttribute(ad, String(deger));
  }
  ekle(el, cocuklar);
  if (ozellikler && ozellikler['aria-label']) adiGorunenMetinleUyumla(el);
  return el;
}

// ---- Erişilebilir ad = görünen metinle başlar (WCAG 2.5.3 "Label in Name") ----
// Görünen metni olan düğme / bağlantı / sekme / menü öğesinin aria-label'ı bağlam için daha uzun olabilir (ör. hangi ortamın
// düğmesi), ama GÖRÜNEN METİNLE BAŞLAMALIDIR: sesli komut kullanıcısı ekranda gördüğünü söyler ("Elle tanımla"), ekran okuyucu
// da önce onu okur. h() ile kurulan her öğede kendiliğinden uygulanır: "TEST: giriş tarifi ekle" + görünen "Elle tanımla" →
// "Elle tanımla — TEST: giriş tarifi ekle" (bağlam korunur). Yalnız simge / sayı olan metin (×, ⋯, 3) ve uzun kart metinleri
// (40+ karakter; kartın adı içeriğidir) dokunulmaz.
const AD_UYUMLU_ETIKETLER = new Set(['BUTTON', 'A', 'SUMMARY']);
const AD_UYUMLU_ROLLER = new Set(['button', 'tab', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'link', 'switch', 'option']);
const duzAd = (m) => String(m).replace(/\s+/g, ' ').trim();
/** Öğenin görünen metni (aria-hidden ve görsel olarak gizli .gorunmez parçalar hariç). @param {Node} dugum */
function gorunenMetin(dugum) {
  let m = '';
  for (const c of dugum.childNodes) {
    if (c.nodeType === 3) m += c.textContent || '';
    else if (c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true' && !c.classList.contains('gorunmez') && !c.hidden) m += ` ${gorunenMetin(c)} `;
  }
  return m;
}
/**
 * aria-label görünen metinle başlamıyorsa başına görünen metni ekler. h() kendiliğinden çağırır; aria-label'ı sonradan
 * (setAttribute) ya da metni değişen (Göster ↔ Gizle) öğede çağıran yeniden çağırır. @param {Element} el @param {string} [taban] asıl bağlam
 */
export function adiGorunenMetinleUyumla(el, taban) {
  if (!AD_UYUMLU_ETIKETLER.has(el.tagName) && !AD_UYUMLU_ROLLER.has(el.getAttribute('role') || '')) return;
  const etiket = duzAd(taban ?? el.getAttribute('aria-label') ?? '');
  const gorunen = duzAd(gorunenMetin(el));
  if (!etiket || !gorunen || gorunen.length > 40 || !/\p{L}{2}/u.test(gorunen)) return;
  if (etiket.toLocaleLowerCase('tr').startsWith(gorunen.toLocaleLowerCase('tr'))) { if (taban !== undefined) el.setAttribute('aria-label', etiket); return; }
  el.setAttribute('aria-label', `${gorunen} — ${etiket}`);
}

/**
 * Parola / gizli değer kutusunun "Göster" düğmesi: metin Göster ↔ Gizle, aria-pressed; erişilebilir ad görünen metinle başlar
 * ("Göster — Parola: göster veya gizle"). @param {HTMLInputElement} girdi @param {string} etiket alanın adı
 */
export function gosterGizleDugmesi(girdi, etiket) {
  const taban = `${etiket}: göster veya gizle`;
  const dugme = h('button', { type: 'button', class: 'kucuk-dugme goster-dugmesi', 'aria-pressed': 'false', 'aria-label': taban }, 'Göster');
  dugme.addEventListener('click', () => {
    const acik = girdi.type === 'password';
    girdi.type = acik ? 'text' : 'password';
    dugme.textContent = acik ? 'Gizle' : 'Göster';
    dugme.setAttribute('aria-pressed', acik ? 'true' : 'false');
    adiGorunenMetinleUyumla(dugme, taban);
  });
  return dugme;
}

/** @typedef {{ metin: string; satir?: HTMLElement | null; odak?: () => HTMLElement | null }} KapatmaNedeni */

/**
 * Kapalı düğmenin nedenleri (ekran paketi önizlemesi, akış kaydı onay penceresi): düğme kapalıyken nedenler listesi ve her
 * nedende ilgili bölüme götüren "Bölüme git"; düğmenin title / aria-describedby'ı nedenlere bağlanır, neden kalmayınca kalkar.
 * guncelle(nedenler): düğmeyi nedenler boşsa açar, değilse kapatır.
 * @param {HTMLButtonElement} dugme
 * @returns {{ alan: HTMLElement; guncelle: (nedenler: KapatmaNedeni[]) => void }}
 */
export function kapaliDugmeNedenleri(dugme) {
  const alan = h('div', { id: `kabul-nedeni-${Math.random().toString(36).slice(2, 9)}`, class: 'kabul-nedenleri', 'aria-live': 'polite', hidden: true });
  const guncelle = (/** @type {KapatmaNedeni[]} */ nedenler) => {
    dugme.disabled = nedenler.length > 0;
    yerlestir(alan, nedenler.length ? h('ul', {}, nedenler.map((n) => h('li', {},
      h('span', {}, n.metin),
      n.satir ? h('button', { type: 'button', class: 'baglanti-dugmesi', onclick: () => bolumeGit(n) }, 'Bölüme git') : null))) : null);
    alan.hidden = !nedenler.length;
    if (nedenler.length) {
      dugme.title = `Kapalı: ${nedenler.map((n) => n.metin).join('; ')}`;
      dugme.setAttribute('aria-describedby', alan.id);
    } else {
      dugme.removeAttribute('title');
      dugme.removeAttribute('aria-describedby');
    }
  };
  return { alan, guncelle };
}

/** Nedenin bölümüne kaydırır, ilgili denetimi odaklar ve bölümü kısa süre vurgular. @param {KapatmaNedeni} n */
export function bolumeGit(n) {
  const hedef = n.satir;
  if (!hedef || !hedef.isConnected) return;
  hedef.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const odak = n.odak ? n.odak() : null;
  if (odak) odak.focus({ preventScroll: true });
  hedef.classList.remove('dikkat-vurgusu');
  void hedef.offsetWidth;
  hedef.classList.add('dikkat-vurgusu');
  setTimeout(() => hedef.classList.remove('dikkat-vurgusu'), 2400);
}

/** replaceChildren'ın null/false/dizi güvenli karşılığı (h() ile aynı kurallar). */
export function yerlestir(el, ...cocuklar) {
  el.replaceChildren();
  ekle(el, cocuklar);
  return el;
}

function ekle(el, cocuklar) {
  for (const c of cocuklar) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) ekle(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

let kimlikSayaci = 0;
export const yeniKimlik = (onEk = 'k') => `${onEk}-${++kimlikSayaci}`;

/**
 * Temaya uygun öneri listesi (tarayıcının beyaz datalist'i yerine): odaklanınca / tıklayınca tümü, yazdıkça süzülür
 * (Türkçe, içerir); ↑ / ↓ gezer, Enter seçer, Esc kapatır (diyaloğu kapatmaz). Seçim girdiye yazılır, input + change
 * olayları yayınlanır. Liste diyalog içindeyse diyaloğa, değilse gövdeye eklenir ve girdinin altına sabitlenir
 * (kaydırılan kaplarda kırpılmaz).
 * @param {HTMLInputElement} girdi @param {() => string[]} secenekler
 */
export function oneriListesi(girdi, secenekler) {
  const liste = h('div', { class: 'secim-onerileri', role: 'listbox', id: yeniKimlik('oneri'), hidden: true });
  girdi.setAttribute('role', 'combobox');
  girdi.setAttribute('aria-autocomplete', 'list');
  girdi.setAttribute('aria-controls', liste.id);
  girdi.setAttribute('aria-expanded', 'false');
  girdi.setAttribute('autocomplete', 'off');
  /** @type {string[]} */
  let gorunen = [];
  let aktif = -1;
  let seciliyor = false;
  const kucuk = (/** @type {string} */ x) => x.toLocaleLowerCase('tr');
  const konumla = () => {
    const r = girdi.getBoundingClientRect();
    Object.assign(liste.style, { left: `${r.left}px`, top: `${r.bottom + 4}px`, width: `${Math.max(r.width, 180)}px` });
  };
  const kaydirinca = () => { if (!girdi.isConnected) kapat(); else konumla(); };
  function kapat() {
    liste.hidden = true;
    aktif = -1;
    girdi.setAttribute('aria-expanded', 'false');
    girdi.removeAttribute('aria-activedescendant');
    window.removeEventListener('scroll', kaydirinca, true);
    window.removeEventListener('resize', kaydirinca);
  }
  const sec = (/** @type {string} */ x) => {
    girdi.value = x;
    kapat();
    seciliyor = true;
    girdi.dispatchEvent(new Event('input', { bubbles: true }));
    girdi.dispatchEvent(new Event('change', { bubbles: true }));
    seciliyor = false;
    secilenDeger = x;
  };
  const ciz = (/** @type {boolean} */ tumu) => {
    const ara = kucuk(girdi.value.trim());
    const hepsi = secenekler();
    gorunen = (tumu || !ara ? hepsi : hepsi.filter((x) => kucuk(x).includes(ara))).slice(0, 300);
    if (!gorunen.length) { kapat(); return; }
    if (aktif >= gorunen.length) aktif = gorunen.length - 1;
    const kap = girdi.closest('dialog') || document.body;
    if (liste.parentElement !== kap) kap.append(liste);
    yerlestir(liste, gorunen.map((x, i) => h('div', {
      class: `secim-onerisi${i === aktif ? ' aktif' : ''}${x === girdi.value ? ' secili' : ''}`, role: 'option', id: `${liste.id}-${i}`,
      'aria-selected': i === aktif ? 'true' : 'false', onmousedown: (/** @type {MouseEvent} */ o) => { o.preventDefault(); sec(x); }
    }, x)));
    if (aktif >= 0) { girdi.setAttribute('aria-activedescendant', `${liste.id}-${aktif}`); liste.children[aktif]?.scrollIntoView({ block: 'nearest' }); }
    if (liste.hidden) {
      liste.hidden = false;
      girdi.setAttribute('aria-expanded', 'true');
      window.addEventListener('scroll', kaydirinca, true);
      window.addEventListener('resize', kaydirinca);
    }
    konumla();
  };
  let tumuAcik = false;
  // Seçimden sonra tarayıcı, alan odağı kaybedince (yazılmış metin değiştiği için) bir change daha yayınlar; değer aynıysa
  // yutulur. Yutulmazsa dinleyen form yeniden çizilir ve tıklanan düğme (ör. "Koşul ekle") tıklamayı kaçırır.
  let secilenDeger = /** @type {string | null} */ (null);
  girdi.addEventListener('change', (o) => {
    if (seciliyor) return;
    if (secilenDeger !== null && girdi.value === secilenDeger) o.stopImmediatePropagation();
    secilenDeger = null;
  }, true);
  girdi.addEventListener('input', () => { if (!seciliyor) { aktif = -1; tumuAcik = false; ciz(false); } });
  girdi.addEventListener('focus', () => { tumuAcik = true; ciz(true); });
  girdi.addEventListener('click', () => { if (liste.hidden) { tumuAcik = true; ciz(true); } });
  girdi.addEventListener('blur', () => kapat());
  girdi.addEventListener('keydown', (o) => {
    if (o.key === 'ArrowDown' || o.key === 'ArrowUp') {
      o.preventDefault();
      if (liste.hidden) { tumuAcik = true; ciz(true); return; }
      aktif = o.key === 'ArrowDown' ? Math.min(aktif + 1, gorunen.length - 1) : Math.max(aktif - 1, 0);
      ciz(tumuAcik);
    } else if (o.key === 'Enter' && !liste.hidden && aktif >= 0) {
      o.preventDefault();
      sec(gorunen[aktif]);
    } else if (o.key === 'Escape' && !liste.hidden) {
      o.preventDefault();
      o.stopPropagation();
      kapat();
    }
  });
  return girdi;
}

/** Kısa bildirim (ekran okuyucu için role=status bölgesinde). */
export function bildir(mesaj, tur = 'basari') {
  const kutu = document.getElementById('bildirimler');
  if (!kutu) return;
  const oge = h('div', { class: `bildirim ${tur === 'hata' ? 'hata' : ''}` }, ikon(tur === 'hata' ? 'uyari' : 'onay'), h('span', {}, mesaj));
  kutu.append(oge);
  setTimeout(() => oge.remove(), tur === 'hata' ? 8000 : 4000);
}

/** Etiketli form alanı. input'a id verilir, yardım metni aria-describedby ile bağlanır. */
/**
 * Uzun açıklamayı kısa (en çok 1–2 cümle) + ayrıntıya ayırır: ilk cümle (kısaysa ilk iki) kısa kalır, gerisi ayrıntıdır.
 * @param {string} metin @returns {{ kisa: string; ayrinti: string }}
 */
export function aciklamayiBol(metin) {
  const parcalar = String(metin || '').split(/(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ"“'(0-9])/u);
  // Kısaltmadan ("ör.", "vb.", "bkz.") ya da açık parantezin içinden bölünmez: "…kombinasyonudur (ör." diye yarıda kesilmesin.
  /** @type {string[]} */
  const cumleler = [];
  for (const p of parcalar) {
    const onceki = cumleler[cumleler.length - 1];
    const acik = onceki !== undefined && (onceki.match(/\(/g)?.length ?? 0) > (onceki.match(/\)/g)?.length ?? 0);
    if (onceki !== undefined && (acik || /(?:^|[\s(])(?:ör|örn|vb|vs|bkz|yak|yb|Dr|No|sn|dk)\.$/iu.test(onceki))) cumleler[cumleler.length - 1] = `${onceki} ${p}`;
    else cumleler.push(p);
  }
  if (cumleler.length <= 2 && String(metin || '').length <= 220) return { kisa: String(metin || ''), ayrinti: '' };
  const n = cumleler[0].length < 70 && cumleler.length > 2 ? 2 : 1;
  return { kisa: cumleler.slice(0, n).join(' '), ayrinti: cumleler.slice(n).join(' ') };
}

/**
 * Kısa açıklama + "?" ipucu: ayrıntı (bilgi kaybolmaz) "?" düğmesiyle açılır / kapanır (Esc kapatır). Kısa metinse yalnız metin.
 * @param {string} metin @param {string} [konu] "?" düğmesinin erişilebilir adı için (ör. alan etiketi)
 */
export function kisaAciklama(metin, konu = '') {
  const { kisa, ayrinti } = aciklamayiBol(metin);
  if (!ayrinti) return h('span', { class: 'kisa-aciklama' }, kisa);
  const panelId = yeniKimlik('ayrinti');
  const panel = h('span', { id: panelId, class: 'ayrinti-ipucu', hidden: true }, ayrinti);
  const soru = h('button', {
    type: 'button', class: 'ikon-dugme hayalet ayrinti-dugmesi', 'aria-expanded': 'false', 'aria-controls': panelId,
    // Ad alanın etiketini içermez (etiketle arama alanın kendisini bulsun); konu ipucunda.
    'aria-label': 'Ayrıntıyı göster', title: konu ? `Ayrıntı: ${konu}` : 'Ayrıntı'
  }, ikon('soru'));
  const ac = (/** @type {boolean} */ goster) => { panel.hidden = !goster; soru.setAttribute('aria-expanded', String(goster)); };
  soru.addEventListener('click', () => ac(panel.hidden));
  const esc = (/** @type {KeyboardEvent} */ o) => { if (o.key === 'Escape' && !panel.hidden) { o.preventDefault(); o.stopPropagation(); ac(false); soru.focus(); } };
  soru.addEventListener('keydown', esc);
  panel.addEventListener('keydown', esc);
  return h('span', { class: 'kisa-aciklama' }, kisa, ' ', soru, panel);
}

/**
 * Başlık yanı "?" ipucu: uzun açıklama ekranda sürekli yer kaplamaz; "?" düğmesiyle açılır / kapanır (Esc kapatır). Bilgi kaybolmaz.
 * Düğme başlığın yanına, panel başlığın altına konur.
 * @param {Node | Array<Node | string>} govde @param {string} konu düğmenin erişilebilir adı için (ör. bölüm başlığı)
 * @returns {{ dugme: HTMLButtonElement; panel: HTMLElement }}
 */
export function yardimIpucu(govde, konu) {
  const panelId = yeniKimlik('yardim-paneli');
  const panel = h('div', { id: panelId, class: 'yardim-paneli soluk kucuk', hidden: true }, ...(Array.isArray(govde) ? govde : [govde]));
  const dugme = /** @type {HTMLButtonElement} */ (h('button', {
    type: 'button', class: 'ikon-dugme hayalet ayrinti-dugmesi', 'aria-expanded': 'false', 'aria-controls': panelId,
    'aria-label': `${konu}: açıklamayı göster`, title: 'Açıklama'
  }, ikon('soru')));
  const ac = (/** @type {boolean} */ goster) => { panel.hidden = !goster; dugme.setAttribute('aria-expanded', String(goster)); };
  dugme.addEventListener('click', () => ac(panel.hidden));
  const esc = (/** @type {KeyboardEvent} */ o) => { if (o.key === 'Escape' && !panel.hidden) { o.preventDefault(); o.stopPropagation(); ac(false); dugme.focus(); } };
  dugme.addEventListener('keydown', esc);
  panel.addEventListener('keydown', esc);
  return { dugme, panel };
}

/**
 * Sayfa içeriğindeki BÖLÜM AÇIKLAMALARI ("Başlık" + altında düz açıklama paragrafı) ekranı doldurmasın: paragraf gizlenir, başlığın yanına
 * "?" düğmesi konur; düğme paragrafı açar / kapatır (Esc kapatır). Bilgi kaybolmaz (paragraf DOM'da kalır). Sonradan (eşzamansız) çizilen
 * bölümler de yakalanır; kap sayfadan kalkınca gözlem biter. Alınmaz: iletişim kutuları, uyarı / durum kutuları, kısa (< 40 karakter) metinler.
 * @param {HTMLElement} kap
 */
export function bolumAciklamalariniSimgeye(kap) {
  // Düğme adı başlığın METNİNDEN: sayaç rozeti, simge ve düğmeler ada katılmaz ("Planlı koşular3" değil "Planlı koşular").
  const baslikAdi = (/** @type {Element} */ b) => {
    const kopya = /** @type {Element} */ (b.cloneNode(true));
    for (const x of kopya.querySelectorAll('.rozet, button, svg, .ikon, [aria-hidden="true"]')) x.remove();
    return (kopya.textContent || '').replace(/\s+/g, ' ').trim();
  };
  const AC_ESIGI = 40;
  const uygula = () => {
    for (const para of kap.querySelectorAll('p.soluk, p.yardim, p.bolum-aciklamasi')) {
      if (para.dataset.simgede || para.hidden) continue;
      if (para.closest('dialog, .not-kutusu, [role="alert"], [role="status"], .kayit-meta, .kisa-aciklama, .ayrinti-ipucu, .yardim-paneli, .alan, .sayfa-basligi, .bos-durum, label, fieldset, .izin-satiri, table, li')) continue;
      if ((para.textContent || '').trim().length < AC_ESIGI) continue;
      let onceki = para.previousElementSibling;
      if (onceki && onceki.matches('.bolum-basligi, .kart-basligi, .baslik-satiri, .ara-baslik-satiri')) onceki = onceki.querySelector('h2, h3, h4') || onceki;
      if (!onceki || !onceki.matches('h2, h3, h4')) continue;
      if (onceki.querySelector('.ayrinti-dugmesi')) continue;
      const baslik = onceki;
      const panelId = yeniKimlik('bolum-aciklamasi');
      para.id = para.id || panelId;
      para.dataset.simgede = '1';
      para.hidden = true;
      const dugme = /** @type {HTMLButtonElement} */ (h('button', {
        type: 'button', class: 'ikon-dugme hayalet ayrinti-dugmesi', 'aria-expanded': 'false', 'aria-controls': para.id,
        'aria-label': `${baslikAdi(baslik)}: açıklamayı göster`, title: 'Açıklama'
      }, ikon('soru')));
      const ac = (/** @type {boolean} */ goster) => { para.hidden = !goster; dugme.setAttribute('aria-expanded', String(goster)); };
      dugme.addEventListener('click', () => ac(para.hidden));
      const esc = (/** @type {KeyboardEvent} */ o) => { if (o.key === 'Escape' && !para.hidden) { o.preventDefault(); o.stopPropagation(); ac(false); dugme.focus(); } };
      dugme.addEventListener('keydown', esc);
      para.addEventListener('keydown', esc);
      baslik.append(' ', dugme);
    }
  };
  let bekleyen = 0;
  const gozlemci = new MutationObserver(() => {
    if (!kap.isConnected) { gozlemci.disconnect(); return; }
    cancelAnimationFrame(bekleyen);
    bekleyen = requestAnimationFrame(uygula);
  });
  gozlemci.observe(kap, { childList: true, subtree: true });
  uygula();
}

/**
 * Yana kaydırılan kap (geniş tablo) için ipucu: taşan kenarda gölge (sol / sağ; kaydırdıkça güncellenir) ve altta "N sütundan M'si
 * görünüyor · yana kaydırın" satırı. Kap bir sarmalın içine alınır; sarmal döner. Taşma yoksa ipucu görünmez.
 * @param {HTMLElement} kap overflow-x: auto olan kap @param {{ sutunSecici?: string }} [secenek] sayılacak sütun başlıkları
 * @returns {HTMLElement}
 */
export function yatayKaydirmaIpucu(kap, secenek = {}) {
  const bilgi = h('div', { class: 'kaydirma-bilgisi kucuk soluk', role: 'status', hidden: true });
  const sarmal = h('div', { class: 'yatay-kaydirma-sarmali' }, kap, bilgi);
  let bekleyen = 0;
  const guncelle = () => {
    const fazla = kap.scrollWidth - kap.clientWidth;
    const tasiyor = fazla > 2;
    sarmal.classList.toggle('sol-tasma', tasiyor && kap.scrollLeft > 2);
    sarmal.classList.toggle('sag-tasma', tasiyor && kap.scrollLeft < fazla - 2);
    if (!tasiyor) { bilgi.hidden = true; return; }
    const k = kap.getBoundingClientRect();
    const sutunlar = secenek.sutunSecici ? [...kap.querySelectorAll(secenek.sutunSecici)] : [];
    const gorunen = sutunlar.filter((s) => { const r = s.getBoundingClientRect(); return r.left >= k.left - 1 && r.right <= k.right + 1; }).length;
    bilgi.hidden = false;
    bilgi.textContent = sutunlar.length ? `${sutunlar.length} sütundan ${gorunen} tanesi tam görünüyor · diğerleri için yana kaydırın` : 'Tablo yana kaydırılabilir';
  };
  const planla = () => { cancelAnimationFrame(bekleyen); bekleyen = requestAnimationFrame(guncelle); };
  kap.addEventListener('scroll', planla, { passive: true });
  if (typeof ResizeObserver === 'function') {
    const g = new ResizeObserver(() => { if (!sarmal.isConnected && !document.contains(kap)) return; planla(); });
    g.observe(kap);
    if (kap.firstElementChild) g.observe(kap.firstElementChild);
  }
  new MutationObserver(planla).observe(kap, { childList: true, subtree: true });
  planla();
  return sarmal;
}

/** Bu uzunluktan uzun alan açıklamaları ? düğmesinin içinde durur. */
const YARDIM_ESIGI = 60;

export function alan(etiket, girdi, secenekler = {}) {
  const id = girdi.id || yeniKimlik('alan');
  girdi.id = id;
  const yardimId = secenekler.yardim ? `${id}-yardim` : null;
  const hataId = `${id}-hata`;
  const aciklamalar = [yardimId, hataId].filter(Boolean).join(' ');
  girdi.setAttribute('aria-describedby', aciklamalar);
  const etiketi = h('label', { for: id }, etiket, secenekler.zorunlu ? h('span', { class: 'soluk' }, ' (zorunlu)') : null);
  // Uzun açıklama ekranı doldurmasın: etiketin yanındaki "?" düğmesiyle açılır (kısa olanlar altta yazılı kalır).
  if (yardimId && typeof secenekler.yardim === 'string' && secenekler.yardim.length > YARDIM_ESIGI) {
    const { dugme, panel } = yardimIpucu(secenekler.yardim, String(etiket));
    panel.id = yardimId;
    dugme.setAttribute('aria-controls', yardimId);
    // Ad alanın etiketini içermez (etiketle arama alanın kendisini bulsun).
    dugme.setAttribute('aria-label', 'Açıklamayı göster');
    dugme.title = `Açıklama: ${etiket}`;
    return h('div', { class: 'alan' },
      h('div', { class: 'alan-etiket-satiri' }, etiketi, dugme),
      panel,
      secenekler.icerik || girdi,
      h('div', { class: 'alan-hatasi', id: hataId, role: 'alert' }));
  }
  return h('div', { class: 'alan' },
    etiketi,
    secenekler.icerik || girdi,
    yardimId ? h('div', { class: 'yardim', id: yardimId }, secenekler.yardim) : null,
    h('div', { class: 'alan-hatasi', id: hataId, role: 'alert' }));
}

/** Alanın altına hata yazar (boş mesaj = temizle). */
export function alanHatasi(girdi, mesaj) {
  const kutu = document.getElementById(`${girdi.id}-hata`);
  if (kutu) kutu.textContent = mesaj || '';
  if (mesaj) girdi.setAttribute('aria-invalid', 'true');
  else girdi.removeAttribute('aria-invalid');
}

/**
 * Dosya seçme girdisi: her seçimden sonra girdi SIFIRLANIR (value = ''), böylece aynı adlı dosya yeniden seçilince "change" yeniden
 * gelir ve dosya yeniden okunur (düzeltilmiş dosya eski sonucun yerine geçer). Seçilen dosyalar saklanır; "not" öğesi girdinin
 * yanında son seçilen dosyanın adını ve seçim saatini gösterir. secildi: her seçimde (dosyalarla) çağrılır.
 * TÜRKÇE DÜĞME: kutu = görünmez girdi + "Dosya seç" düğmesi (tıklayınca girdinin dosya penceresi açılır) + not.
 * Tarayıcının kendi (dile göre "Choose File") düğmesi görünmez; girdi klavyeyle odaklanır, odak halkası düğmede görünür, ekran
 * okuyucu girdiyi alanın etiketiyle okur. Çağıran kutuyu girdinin yerine yerleştirir (alan(..., { icerik: secim.kutu })).
 * @param {HTMLInputElement} girdi @param {(dosyalar: File[]) => void} [secildi] @param {{ dugme?: string }} [secenekler]
 * @returns {{ dosyalar: () => File[]; not: HTMLElement; kutu: HTMLElement; temizle: () => void }}
 */
export function dosyaSecimi(girdi, secildi, secenekler = {}) {
  /** @type {File[]} */
  let secilen = [];
  const not = h('span', { class: 'dosya-secimi-notu kucuk soluk', 'aria-live': 'polite' });
  girdi.addEventListener('change', () => {
    const yeni = [...(girdi.files || [])];
    girdi.value = '';
    if (!yeni.length) return;
    secilen = yeni;
    not.textContent = `Seçilen: ${yeni.map((f) => f.name).join(', ')} · ${new Date().toLocaleTimeString('tr-TR')}`;
    if (secildi) secildi(yeni);
  });
  if (!girdi.id) girdi.id = yeniKimlik('dosya');
  /** @type {HTMLElement | null} */
  let kutu = null;
  return {
    dosyalar: () => secilen, not, temizle: () => { secilen = []; not.textContent = ''; },
    // İlk istendiğinde kurulur: kutuyu kullanmayan (kendi seçme alanı olan) çağıranın girdisi yerinden oynamaz.
    get kutu() {
      if (!kutu) {
        girdi.classList.add('gorunmez-dosya');
        // Görsel düğme: fareyle tıklanır (girdiyi açar); klavye ve ekran okuyucu girdinin kendisini kullanır (odak halkası düğmede
        // görünür, CSS). Düğme erişilebilir ağaçta yok: girdinin adı alanın etiketi olarak kalır.
        const dugme = h('button', { type: 'button', class: 'kucuk-dugme dosya-sec-dugmesi', tabindex: '-1', 'aria-hidden': 'true', onclick: () => girdi.click() },
          ikon('klasor'), secenekler.dugme || (girdi.multiple ? 'Dosyaları seç' : 'Dosya seç'));
        kutu = h('span', { class: 'dosya-secimi' }, girdi, dugme, not);
      }
      return kutu;
    }
  };
}

/**
 * Parola/gizli değer alanı: type=password + "Göster" anahtarı. kayitli.dolu ise alan boş
 * bırakılırsa mevcut değer korunur; "Kayıtlı değeri göster" (gosterFn) açıkça istenince
 * sunucudan tek değeri alır.
 */
export function parolaAlani(etiket, secenekler = {}) {
  const girdi = h('input', {
    type: 'password', autocomplete: secenekler.otomatik || 'off', required: secenekler.zorunlu,
    name: secenekler.ad, spellcheck: 'false'
  });
  if (secenekler.kayitli && secenekler.kayitli.dolu) girdi.placeholder = `${secenekler.kayitli.maske} kayıtlı — değiştirmek için yazın`;
  const goster = gosterGizleDugmesi(girdi, etiket);
  const satir = h('div', { class: 'parola-satiri' }, h('div', { class: 'parola-kutusu' }, girdi, goster));
  if (secenekler.kayitli && secenekler.kayitli.dolu && secenekler.gosterFn) {
    const kayitliGoster = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('goz'), 'Kayıtlı değeri göster');
    kayitliGoster.addEventListener('click', async () => {
      kayitliGoster.disabled = true;
      try {
        girdi.value = await secenekler.gosterFn();
        girdi.type = 'text';
        goster.textContent = 'Gizle';
        goster.setAttribute('aria-pressed', 'true');
        adiGorunenMetinleUyumla(goster, `${etiket}: göster veya gizle`);
        girdi.focus();
      } catch (hata) {
        alanHatasi(girdi, hata.message);
      } finally {
        kayitliGoster.disabled = false;
      }
    });
    satir.append(kayitliGoster);
  }
  const yardim = secenekler.yardim || (secenekler.kayitli && secenekler.kayitli.dolu ? 'Boş bırakırsanız kayıtlı değer korunur.' : null);
  return { kapsayici: alan(etiket, girdi, { yardim, zorunlu: secenekler.zorunlu, icerik: satir }), girdi };
}

/** İki adımlı onay: ilk tıklama düğmeyi "…onayla" durumuna getirir, 5 sn içinde ikinci tıklama çalıştırır. */
export function onayliDugme(metin, onayMetni, fn, secenekler = {}) {
  // Silme düğmeleri tek stil: çöp ikonu + metin (tehlike). Onay beklerken yalnız metin değişir.
  const yazi = h('span', {}, metin);
  const dugme = h('button', { type: 'button', class: `tehlike ${secenekler.kucuk ? 'kucuk-dugme' : ''}`, 'aria-label': secenekler.etiket || metin }, ikon('cop'), yazi);
  let zamanlayici = null;
  dugme.addEventListener('click', async () => {
    if (!dugme.classList.contains('onay-bekliyor')) {
      dugme.classList.add('onay-bekliyor');
      yazi.textContent = onayMetni;
      zamanlayici = setTimeout(() => { dugme.classList.remove('onay-bekliyor'); yazi.textContent = metin; }, 5000);
      return;
    }
    clearTimeout(zamanlayici);
    dugme.disabled = true;
    try { await fn(); } finally { dugme.disabled = false; dugme.classList.remove('onay-bekliyor'); yazi.textContent = metin; }
  });
  return dugme;
}

/** Form içi genel hata/bilgi kutusu. */
export function mesajKutusu() {
  const kutu = h('div', { role: 'alert', hidden: true });
  return {
    kutu,
    goster(mesaj, tur = 'hata') { kutu.className = `not-kutusu ${tur}`; kutu.textContent = mesaj; kutu.hidden = !mesaj; },
    temizle() { kutu.hidden = true; kutu.textContent = ''; }
  };
}

/** İşlem sürerken düğmeyi kilitler ve metnini değiştirir. */
export async function mesgulIken(dugme, metin, fn) {
  const eski = [...dugme.childNodes]; // ikonlu düğmeler de aynen geri gelsin
  dugme.disabled = true;
  dugme.replaceChildren(h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), metin);
  dugme.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally {
    dugme.disabled = false;
    dugme.replaceChildren(...eski);
    dugme.removeAttribute('aria-busy');
  }
}

/** Geri sayım: her saniye cb(kalan) çağrılır, 0'da biter. Durdurma fonksiyonu döner. */
export function geriSayim(saniye, cb) {
  let kalan = Math.max(0, Math.ceil(saniye));
  cb(kalan);
  if (kalan <= 0) return () => {};
  const z = setInterval(() => {
    kalan -= 1;
    cb(kalan);
    if (kalan <= 0) clearInterval(z);
  }, 1000);
  return () => clearInterval(z);
}

export const tarihMetni = (iso) => {
  if (!iso) return '—';
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? String(iso) : t.toLocaleString('tr-TR');
};

export const boyutMetni = (bayt) => {
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${(bayt / 1024).toFixed(1)} KB`;
  if (bayt < 1024 * 1024 * 1024) return `${(bayt / 1024 / 1024).toFixed(1)} MB`;
  return `${(bayt / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/** Ortam adresi açıklaması (kurulum sihirbazı ve Ayarlar > Proje ve ortamlar): hangi adres yazılır. */
export const ADRES_YARDIMI = 'Uygulamanın bu ortamdaki açılış (kök) adresi; giriş sayfasının adresi değil. Ör. https://test.uygulamaniz.example/ — ekran ve giriş adresleri buna göre yazılır.';

/** http(s) adres kontrolü. */
export function adresGecerliMi(metin) {
  try {
    const u = new URL(metin);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Boş durum kutusu: ikon + başlık + açıklama (+ isteğe bağlı eylem). */
export function bosDurum(baslik, aciklama, secenekler = {}) {
  return h('div', { class: 'bos-durum', role: secenekler.rol || null },
    h('span', { class: 'bos-ikon' }, ikon(secenekler.ikon || 'pusula')),
    h('strong', {}, baslik), aciklama ? h('p', {}, aciklama) : null, secenekler.eylem || null);
}

/** İskelet yükleyici (ekran okuyucuya "Yükleniyor…" der). tur: 'liste' | 'kartlar' | 'sayfa' */
export function iskelet(tur = 'liste') {
  const cizgiler = tur === 'kartlar'
    ? [h('div', { class: 'iskelet-kartlar' }, h('i', {}), h('i', {}), h('i', {}), h('i', {}), h('i', {}))]
    : tur === 'sayfa'
      ? [h('i', { class: 'yarim' }), h('i', { class: 'uzun' }), h('i', {}), h('i', {}), h('i', { class: 'yarim' })]
      : [h('i', {}), h('i', {}), h('i', { class: 'yarim' })];
  return h('div', { class: 'iskelet', 'aria-busy': 'true' }, h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), ...cizgiler);
}

/** Rozet (etiket). tur: vurgu | basari | hata | atlanan | durdu | '' */
/**
 * Rozet. ek.kisalt: kullanıcı adı taşıyan rozetlerde (ekran, servis, ortam, tablo adı) genel kısaltma — en çok genişlik (true:
 * varsayılan 16em; metin: CSS genişliği) + "…" ve tam metin ipucu (title). Diğer ek özellikler öğeye geçer.
 * @param {any} metin @param {string} [tur] @param {Record<string, any> & { kisalt?: boolean | string }} [ek]
 */
export const rozet = (metin, tur = '', ek = {}) => {
  const { kisalt, ...diger } = ek;
  if (!kisalt) return h('span', { class: `rozet ${tur}`.trim(), ...diger }, metin);
  const tamMetin = typeof metin === 'string' ? metin : Array.isArray(metin) ? metin.filter((x) => typeof x === 'string').join('') : null;
  return h('span', {
    class: `rozet rozet-kisalt ${tur}`.trim(), title: tamMetin, ...(typeof kisalt === 'string' ? { style: { 'max-width': kisalt } } : {}), ...diger
  }, h('span', { class: 'rozet-metni' }, metin));
};

/** Kullanıcının koşu / arayüz ayarları (Ayarlar > Koşu, Arayüz; oturum boyunca önbellekte, kaydedince tazelenir). */
let ayarSozu = null;
/** Kasa açık mı (kabuk /platform/durum'dan bildirir). Kasa yokken / kilitliyken ayar istenmez: sunucu 409 / 423 döner, konsol kirlenir. */
/** @type {boolean | null} null: kabuk durumu henüz okumadı (ilk istek bildirimi bekler). */
let kasaAcik = null;
/** @type {Array<() => void>} */
let kasaBekleyenleri = [];
export function kasaDurumunuBildir(/** @type {boolean} */ acik) {
  kasaAcik = acik;
  if (!acik) ayarSozu = null;
  const b = kasaBekleyenleri; kasaBekleyenleri = []; for (const f of b) f();
}
export function kullaniciAyarlari() {
  if (kasaAcik === null) return new Promise((coz) => { kasaBekleyenleri.push(() => { coz(kullaniciAyarlari()); }); });
  if (!kasaAcik) return Promise.resolve({});
  ayarSozu ??= api('/platform/kosu-ayarlari').then((y) => y.ayarlar || {}).catch(() => { ayarSozu = null; return {}; });
  return ayarSozu;
}
export function kullaniciAyarlariniTazele() { ayarSozu = null; }

// Satır "⋯" menüleri (.satir-menusu-kap > .acilir-menu; düğmenin sağına hizalı): dar ekranda ya da sol kenardaki düğmede menü
// pencerenin dışına taşmasın diye açıldığında yatayda pencere içine kaydırılır (davranış aynı; yalnız konum).
if (typeof document !== 'undefined') {
  document.addEventListener('click', (o) => {
    const dugme = o.target instanceof Element ? o.target.closest('.satir-menusu-kap > [aria-haspopup="menu"]') : null;
    if (!dugme) return;
    requestAnimationFrame(() => {
      const menu = dugme.parentElement && dugme.parentElement.querySelector(':scope > .acilir-menu');
      if (!menu || menu.hidden) return;
      menu.style.removeProperty('transform');
      const r = menu.getBoundingClientRect();
      const pay = 8;
      const kaydir = r.left < pay ? pay - r.left : r.right > innerWidth - pay ? Math.max(pay - r.left, innerWidth - pay - r.right) : 0;
      if (kaydir) menu.style.transform = `translateX(${Math.round(kaydir)}px)`;
    });
  }, true); // yakalama evresi: bazı menü düğmeleri tıklamanın yayılmasını durdurur
}
