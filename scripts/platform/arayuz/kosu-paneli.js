// Senaryo koşuları (genel): onay penceresi, koşu yöneticisi ve canlı koşu paneli.
// - Koşular senaryo KİMLİĞİYLE (UUID) başlatılır: POST /platform/senaryolar/calistir — sunucu kimliği
//   güncel test dosyası + başlığına çözer ve koşu bitene kadar yanıtı bekletir.
// - Her tekil koşunun kendi kosuId'si vardır: satır bazlı "Durdur" (/durdur) ve canlı ekran görüntüsü
//   (/canli) bununla hedeflenir; aynı başlık başka dosyada olsa bile karışmaz.
// - "Koşuyu başlat" SIRAYLA, "Seçilenleri çalıştır" / tek ▷ AYNI ANDA çalışır; birlikte başlatılanlar
//   ortak bir koşu kimliği taşır (tam koşu → kartlar/trend; kısmi → koşu geçmişinde tek "tekil" satır).
// - Durum modül düzeyindedir: tablolar yeniden çizilse ya da sayfalar arasında gezinilse bile çalışan
//   satırlar spinner/Durdur ile kalır; panel body'ye eklenir ve kalıcıdır.
// - Elle doğrulama kodu (giriş tarifinde SMS "elle" kipi): çalışan satırlar için /kod-istegi yoklanır; kod
//   bekleyen satır seçilir ve izleme alanında kod formu gösterilir, kod /kod-gonder ile koşuya iletilir.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, yerlestir, bildir, h, ikon, rozet, TOKEN } from './ortak.js';
import { riskBelirtilmemisMi, riskliOrtamMi } from './ortam-riski.mjs';

const medyaUrl = (id) => `/platform/medya/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}`;
const kimlikUret = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const CANLI_ARALIK_MS = 1200;
const KOD_YOKLAMA_MS = 1500;

/** Satır durumları → görünüm. */
export const KOSU_DURUMLARI = Object.freeze({
  sirada: { etiket: 'Sırada', sinif: 'sirada', ikon: 'saat' },
  calisiyor: { etiket: 'Çalışıyor', sinif: 'vurgu', ikon: null },
  basarili: { etiket: 'Başarılı', sinif: 'basari', ikon: 'onay' },
  basarisiz: { etiket: 'Başarısız', sinif: 'hata', ikon: 'carpi' },
  atlanan: { etiket: 'Atlandı', sinif: 'atlanan', ikon: 'eksi' },
  durduruldu: { etiket: 'Durduruldu', sinif: 'durdu', ikon: 'eksi' },
  hata: { etiket: 'Çalıştırılamadı', sinif: 'hata', ikon: 'uyari' }
});

const sureMetni = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} sn` : `${Math.floor(ms / 60000)} dk ${Math.round((ms % 60000) / 1000)} sn`);

/** Ortam "gerçek işlem" riski taşıyor mu? TEK TANIM sunucuyla ortak: ortam-riski.mjs (kullanıcı seçimi; belirtilmemiş = riskli). */
export { riskliOrtamMi };

/**
 * "Riskli mi? belirtin" uyarısı: ortamın riskli olup olmadığı seçilmemiş (riskli sayılır) → Ayarlar > Proje ve ortamlar bağlantısı.
 * Koşu diyaloğu, servis sayfası ve ortam listesi kullanır.
 */
export function riskBelirtinNotu() {
  return h('div', { class: 'not-kutusu uyari risk-belirtin', role: 'note' }, h('strong', {}, 'Riskli mi? belirtin. '),
    'Bu ortamın riskli olup olmadığı seçilmemiş; seçilene kadar riskli sayılır (her çalıştırmada onay, canlı ortam izni). ',
    h('a', { href: '#/ayarlar/proje', onclick: () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); } }, 'Ayarlar > Proje ve ortamlar'));
}

/**
 * Riskli ortam onayı: koşu diyaloğunda (kosuOnayi) ya da canliOnayIste ile ONAYLANAN riskli ortamın kimliği. Sunucu riskli ortamda
 * her çalıştırmada istekte açık onay (canliOnay: true) ister; onay yalnız bu diyaloglardan gelir (son onay geçerlidir).
 */
let onayliRiskliOrtam = null;
/** İsteğe eklenecek açık onay (ortam riskli ve diyalogda onaylandıysa). @param {string} ortamId */
export const canliOnayEki = (ortamId) => (ortamId && ortamId === onayliRiskliOrtam ? { canliOnay: true } : {});
/**
 * Riskli ortam için (diyalogsuz akışlarda: Dene, tarama, öneri) açık onay ister; riskli değilse hemen true. Onaylanırsa canliOnayEki
 * o ortam için { canliOnay: true } verir. @param {{ id: string; ad: string; canli?: boolean; varsayilan?: boolean }} ortam @param {string} [ne]
 */
export async function canliOnayIste(ortam, ne = 'Bu işlem') {
  if (!riskliOrtamMi(ortam)) return true;
  const tamam = await onayIste({
    baslik: `${ortam.ad} ortamında çalıştırılsın mı?`, ikonAd: 'uyari', dugme: 'Onayla ve çalıştır',
    metin: `${ne} riskli bir ortamda${riskBelirtilmemisMi(ortam) ? ' (riskli olup olmadığı belirtilmemiş; Ayarlar > Proje ve ortamlar)' : ''} çalışacak; gerçek işlem oluşturabilir.`
  });
  onayliRiskliOrtam = tamam ? ortam.id : null;
  return tamam;
}

// ---------------------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------------------

const durum = {
  /** @type {null | { baslik: string; tur: 'tam' | 'tekil'; kapsam: string; esZamanli: boolean; ortam: { id: string; ad: string }; projeId: string; kosuKimligi: string; satirlar: any[]; iptal: boolean; bitti: boolean; baslangic: number }} */
  oturum: null,
  secili: null,
  kucuk: false
};
const dinleyiciler = new Set();
/** Koşu durumu değişince çağrılır (tablolar satırları günceller). */
export function dinle(fn) { dinleyiciler.add(fn); return () => dinleyiciler.delete(fn); }
function yay(olay = 'degisti') {
  for (const fn of [...dinleyiciler]) { try { fn(olay); } catch { /* dinleyici hatası koşuyu etkilemez */ } }
  paneliCiz();
}

/** Senaryonun şu anki koşu satırı (yalnızca sırada / çalışıyorsa). */
export function kosuDurumu(senaryoId) {
  const s = durum.oturum && durum.oturum.satirlar.find((x) => x.senaryoId === senaryoId && (x.durum === 'sirada' || x.durum === 'calisiyor'));
  return s || null;
}
/** Sürmekte olan bir toplu koşu var mı? */
export const kosuSuruyorMu = () => Boolean(durum.oturum && !durum.oturum.bitti);

// ---------------------------------------------------------------------------------------
// Onay penceresi
// ---------------------------------------------------------------------------------------

/** Koşu diyaloğunda önce seçilecek ortam: varsayılan, yoksa riskli olmayan ilk ortam, yoksa ilki. */
export const onerilenOrtam = (ortamlar) => ortamlar.find((o) => o.varsayilan) || ortamlar.find((o) => !riskliOrtamMi(o)) || ortamlar[0] || null;

/**
 * Sayfa içi onay: kaç senaryo, hangi ortamda, nasıl (sırayla/aynı anda), koşu türü/kapsamı; riskli
 * ortamda uyarı.
 *  - Sabit ortam (s.ortam, s.senaryolar): Promise<boolean>.
 *  - ORTAM SEÇİMLİ (s.ortamlar + s.hesapla): ortam diyalogda seçilir; her seçimde hesapla(ortam) koşacak senaryoları
 *    (ve o ortamda Koşuda kapalı / tanımsız olanların sayısını; istenirse atlananları nedenleriyle) verir. Promise<{ ortam, senaryolar } | null>.
 *  - turEtiketi: "Kapsam" özet kutusunda tam / kısmi yerine gösterilecek metin (ör. servis koşusu).
 * @param {{ baslik: string; senaryolar?: Array<{ baslik: string }>; ortam?: { id?: string; ad: string; varsayilan?: boolean }; tur: 'tam' | 'tekil'; kapsam?: string; esZamanli?: boolean; not?: string; haricSayisi?: number; dugme?: string; uyarilar?: Array<{ baslik: string; neden: string }>;
 *   ortamlar?: Array<{ id: string; ad: string; varsayilan?: boolean }>; turEtiketi?: string;
 *   hesapla?: (ortam: any) => { senaryolar: Array<{ baslik: string }>; haricSayisi?: number; tanimsizSayisi?: number; atlananlar?: Array<{ baslik: string; neden: string }>; uyarilar?: Array<{ baslik: string; neden: string }> } }} s
 */
export function kosuOnayi(s) {
  return new Promise((coz) => {
    const secimli = Array.isArray(s.ortamlar) && s.ortamlar.length > 0 && typeof s.hesapla === 'function';
    let ortam = secimli ? (s.ortam && s.ortamlar.find((o) => o.id === s.ortam.id)) || onerilenOrtam(s.ortamlar) : s.ortam;
    /** @type {{ senaryolar: Array<{ baslik: string }>; haricSayisi?: number; tanimsizSayisi?: number; atlananlar?: Array<{ baslik: string; neden: string }>; uyarilar?: Array<{ baslik: string; neden: string }> }} */
    let hesap = { senaryolar: s.senaryolar || [], haricSayisi: s.haricSayisi, uyarilar: s.uyarilar };
    const baslat = h('button', { type: 'button', class: 'birincil' });
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const turMetni = s.tur === 'tam' ? `Tam koşu · ${s.kapsam || 'Genel'}` : 'Kısmi (tekil)';
    const ortamSecimi = secimli ? h('select', { id: `kosu-ortami-${kimlikUret()}` },
      s.ortamlar.map((o) => h('option', { value: o.id, selected: o.id === ortam.id }, riskliOrtamMi(o) ? `${o.ad} (${riskBelirtilmemisMi(o) ? 'riskli mi? belirtin' : 'riskli'})` : o.ad))) : null;
    const degisken = h('div', {});
    const ciz = () => {
      if (secimli) hesap = s.hesapla(ortam);
      const riskli = riskliOrtamMi(ortam);
      const adet = hesap.senaryolar.length;
      yerlestir(baslat, ikon('oynat'), s.dugme || `${adet} senaryoyu başlat`);
      baslat.disabled = adet === 0;
      yerlestir(degisken,
        h('p', { class: 'soluk' }, adet
          ? `${adet} senaryo ${ortam.ad} ortamında ${s.esZamanli ? 'aynı anda' : 'sırayla'} çalıştırılacak.`
          : `${ortam.ad} ortamında çalıştırılacak senaryo yok.`),
        h('dl', { class: 'onay-ozeti' },
          h('div', {}, h('dt', {}, 'Senaryo'), h('dd', {}, String(adet))),
          h('div', {}, h('dt', {}, 'Ortam'), h('dd', { class: riskli ? 'canli' : null }, ortam.ad)),
          h('div', {}, h('dt', {}, 'Kapsam'), h('dd', { title: s.turEtiketi || turMetni }, s.turEtiketi || (s.tur === 'tam' ? s.kapsam || 'Genel' : 'Kısmi')))),
        adet ? h('ul', { class: 'onay-listesi', 'aria-label': 'Çalıştırılacak senaryolar' },
          hesap.senaryolar.slice(0, 40).map((x) => h('li', {}, x.baslik)),
          adet > 40 ? h('li', {}, `… ve ${adet - 40} senaryo daha`) : null) : null,
        hesap.haricSayisi ? h('p', { class: 'soluk kucuk' }, `${hesap.haricSayisi} senaryo ${secimli ? `${ortam.ad} ortamında ` : ''}koşu listesinde olmadığı (Koşuda kapalı) için dahil edilmedi.`) : null,
        hesap.tanimsizSayisi ? h('p', { class: 'soluk kucuk' }, `${hesap.tanimsizSayisi} senaryo ${ortam.ad} ortamında tanımlı olmadığı için dahil edilmedi.`) : null,
        hesap.atlananlar && hesap.atlananlar.length ? h('details', { class: 'atlananlar-listesi' },
          h('summary', {}, `${hesap.atlananlar.length} senaryo ${ortam.ad} ortamında atlanır`),
          h('ul', { class: 'onay-listesi' }, hesap.atlananlar.slice(0, 40).map((x) => h('li', {}, h('span', { class: 'atlanan-adi' }, x.baslik), h('small', { class: 'soluk' }, x.neden))),
            hesap.atlananlar.length > 40 ? h('li', {}, `… ve ${hesap.atlananlar.length - 40} senaryo daha`) : null)) : null,
        // Uyarılar (koşuyu engellemez): ör. SQL adımının veritabanı bu ortamda eşli değil → senaryo o adımda kalır.
        hesap.uyarilar && hesap.uyarilar.length ? h('details', { class: 'atlananlar-listesi sql-uyarilari', open: true },
          h('summary', {}, `${hesap.uyarilar.length} senaryoda SQL adımı ${ortam.ad} ortamında çalışmaz`),
          h('ul', { class: 'onay-listesi' }, hesap.uyarilar.slice(0, 40).map((x) => h('li', {}, h('span', { class: 'atlanan-adi' }, x.baslik), h('small', { class: 'soluk' }, x.neden))),
            hesap.uyarilar.length > 40 ? h('li', {}, `… ve ${hesap.uyarilar.length - 40} senaryo daha`) : null)) : null,
        h('p', { class: 'soluk kucuk' }, s.not || (s.tur === 'tam'
          ? 'Tam koşu olarak kaydedilir; bitince Sonuçlar kartları ve trendi güncellenir.'
          : 'Kısmi koşu olarak kaydedilir; kartları ve trendi değiştirmez, koşu geçmişinde "tekil" görünür.')),
        riskli ? h('div', { class: 'not-kutusu hata', role: 'alert' }, h('strong', {}, `Dikkat: ${ortam.ad} ortamı. `), 'Bu ortam riskli; testler gerçek işlem oluşturabilir.') : null,
        riskBelirtilmemisMi(ortam) ? riskBelirtinNotu() : null);
    };
    const diyalog = h('dialog', { class: 'onay-diyalogu', 'aria-labelledby': 'kosu-onay-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'kosu-onay-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('oynat')), s.baslik),
        ortamSecimi ? h('div', { class: 'alan kosu-ortam-secimi' }, h('label', { for: ortamSecimi.id }, 'Ortam'), ortamSecimi) : null,
        degisken),
      h('div', { class: 'diyalog-alt' }, vazgec, baslat));
    ortamSecimi?.addEventListener('change', () => { ortam = s.ortamlar.find((o) => o.id === ortamSecimi.value) || ortam; ciz(); });
    ciz();
    let sonuc = false;
    baslat.addEventListener('click', () => { sonuc = true; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => {
      diyalog.remove();
      // Riskli ortamda "Başlat" = açık canlı onayı (sunucuya canliOnay: true gider).
      onayliRiskliOrtam = sonuc && ortam && riskliOrtamMi(ortam) ? ortam.id : null;
      coz(secimli ? (sonuc ? { ortam, senaryolar: hesap.senaryolar } : null) : sonuc);
    });
    document.body.append(diyalog);
    diyalog.showModal();
    (ortamSecimi || baslat).focus();
  });
}

/** Son koşu oturumunun ortam kimliği (kosuDurumu'nun döndürdüğü satırlar bu ortamda koşar; oturum yoksa null). */
export const kosuOrtamiId = () => (durum.oturum ? durum.oturum.ortam.id : null);

/**
 * Genel onay (silme vb.): Promise<boolean>.
 * @param {{ baslik: string; metin: string; liste?: string[]; dugme: string; tehlikeli?: boolean; ikonAd?: string; ek?: Node | null;
 *   hazir?: (() => boolean) | null; baglan?: (guncelle: () => void) => void }} s
 */
export function onayIste(s) {
  return new Promise((coz) => {
    const tamam = h('button', { type: 'button', class: s.tehlikeli ? 'tehlike onay-bekliyor' : 'birincil' }, s.tehlikeli ? ikon('cop') : null, s.dugme);
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    // İsteğe bağlı ek bölüm (ör. test verisi seçimi): s.ek (öğe); s.hazir() false iken onay düğmesi kapalı, s.baglan(fn) ek bölüm
    // değişince çağrılacak yenileyiciyi alır.
    const diyalog = h('dialog', { class: `onay-diyalogu ${s.tehlikeli ? 'tehlikeli' : ''} ${s.ek ? 'genis-onay' : ''}`.trim(), 'aria-labelledby': 'onay-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'onay-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon(s.ikonAd || (s.tehlikeli ? 'cop' : 'uyari'))), s.baslik),
        h('p', { class: 'soluk' }, s.metin),
        s.liste && s.liste.length ? h('ul', { class: 'onay-listesi' }, s.liste.slice(0, 30).map((x) => h('li', {}, x)),
          s.liste.length > 30 ? h('li', {}, `… ve ${s.liste.length - 30} daha`) : null) : null,
        s.ek || null),
      h('div', { class: 'diyalog-alt' }, vazgec, tamam));
    if (typeof s.hazir === 'function') {
      const guncelle = () => { tamam.disabled = !s.hazir(); };
      if (typeof s.baglan === 'function') s.baglan(guncelle);
      guncelle();
    }
    let sonuc = false;
    tamam.addEventListener('click', () => { sonuc = true; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    vazgec.focus();
  });
}

/**
 * Seçenekli soru (ör. "Ne eklemek istiyorsunuz?"): Promise<string | null> (Vazgeç / Esc → null).
 * @param {{ baslik: string; metin?: string; ikonAd?: string; secenekler: Array<{ deger: string; etiket: string; aciklama?: string; ikonAd?: string }> }} s
 */
export function secenekIste(s) {
  return new Promise((coz) => {
    let sonuc = null;
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const kartlar = s.secenekler.map((x) => h('button', {
      type: 'button', class: 'secenek-karti', onclick: () => { sonuc = x.deger; diyalog.close(); }
    }, h('span', { class: 'secenek-karti-ikon', 'aria-hidden': 'true' }, ikon(x.ikonAd || 'arti')), h('b', {}, x.etiket), x.aciklama ? h('small', {}, x.aciklama) : null));
    const diyalog = h('dialog', { class: 'onay-diyalogu secenek-diyalogu', 'aria-labelledby': 'secenek-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'secenek-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon(s.ikonAd || 'soru')), s.baslik),
        s.metin ? h('p', { class: 'soluk' }, s.metin) : null,
        h('div', { class: 'secenek-kartlari' }, kartlar)),
      h('div', { class: 'diyalog-alt' }, vazgec));
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    kartlar[0]?.focus();
  });
}

// ---------------------------------------------------------------------------------------
// Koşu yöneticisi
// ---------------------------------------------------------------------------------------

/**
 * Koşuları başlatır. senaryolar: [{ id, baslik, ekranAdi }]. Zaten çalışan/sıradaki senaryolar atlanır.
 * Sürmekte olan bir toplu koşu varken yeni bir TOPLU koşu başlatılmaz; tek senaryo (▷) ise mevcut
 * panele eklenip hemen çalışır.
 * tekBasina: tek senaryo (▷) çalıştırması (devre dışı ekranın senaryosu yalnızca böyle çalışır).
 * @param {{ projeId: string; ortam: { id: string; ad: string }; senaryolar: Array<{ id: string; baslik: string; ekranAdi?: string | null }>; tur: 'tam' | 'tekil'; kapsam?: string; esZamanli: boolean; baslik: string; tekBasina?: boolean }} s
 */
export function kosuBaslat(s) {
  const yeniler = s.senaryolar.filter((x) => !kosuDurumu(x.id));
  if (!yeniler.length) { bildir('Seçilen senaryolar zaten çalışıyor.', 'hata'); return false; }
  const tekMi = yeniler.length === 1 && s.esZamanli && s.tur === 'tekil';
  if (kosuSuruyorMu()) {
    if (!tekMi || durum.oturum.ortam.id !== s.ortam.id) { bildir('Önce sürmekte olan koşunun bitmesini bekleyin (ya da durdurun).', 'hata'); return false; }
    const satir = satirOlustur(yeniler[0]);
    durum.oturum.satirlar.push(satir);
    durum.oturum.bitti = false;
    durum.secili = satir.senaryoId;
    durum.kucuk = false;
    birTaneCalistir(durum.oturum, satir, { kosuTuru: 'tekil', kosuKimligi: `platform-${kimlikUret()}`, ...(s.tekBasina ? { tekBasina: true } : {}), ...canliOnayEki(s.ortam.id) }).then(() => oturumuBitirGerekirse(durum.oturum));
    yay();
    return true;
  }
  const oturum = {
    canliOnay: canliOnayEki(s.ortam.id),
    baslik: s.baslik, tur: s.tur, kapsam: s.kapsam || 'Genel', esZamanli: s.esZamanli, ortam: s.ortam, projeId: s.projeId,
    kosuKimligi: `platform-${kimlikUret()}`, satirlar: yeniler.map(satirOlustur), iptal: false, bitti: false, baslangic: Date.now()
  };
  durum.oturum = oturum;
  durum.secili = oturum.satirlar[0].senaryoId;
  durum.kucuk = false;
  const ek = { kosuTuru: s.tur, kosuKimligi: oturum.kosuKimligi, ...(s.tur === 'tam' ? { kosuKapsami: oturum.kapsam } : {}), ...(tekMi && s.tekBasina ? { tekBasina: true } : {}) };
  yay('basladi');
  if (s.esZamanli) {
    Promise.all(oturum.satirlar.map((x) => birTaneCalistir(oturum, x, ek))).then(() => oturumuBitirGerekirse(oturum), () => oturumuBitirGerekirse(oturum));
  } else {
    (async () => {
      for (const x of oturum.satirlar) {
        if (oturum.iptal) break;
        if (x.durum !== 'sirada') continue;
        await birTaneCalistir(oturum, x, ek);
      }
      oturumuBitirGerekirse(oturum);
    })();
  }
  return true;
}

function satirOlustur(x) {
  return { senaryoId: x.id, baslik: x.baslik, ekranAdi: x.ekranAdi || '', kosuId: kimlikUret(), durum: 'sirada', sonuc: null, baslangic: null, bitis: null };
}

async function birTaneCalistir(oturum, satir, ek) {
  if (satir.durum !== 'sirada') return;
  satir.durum = 'calisiyor';
  satir.baslangic = Date.now();
  if (durum.secili === null || !oturum.satirlar.some((x) => x.senaryoId === durum.secili && x.durum === 'calisiyor')) durum.secili = satir.senaryoId;
  yay();
  let yanit;
  try {
    yanit = await api('/platform/senaryolar/calistir', {
      govde: { projeId: oturum.projeId, ortamId: oturum.ortam.id, senaryoId: satir.senaryoId, kosuId: satir.kosuId, ...(oturum.canliOnay || {}), ...ek }
    });
  } catch (hata) {
    yanit = { basarili: false, mesaj: hata.message };
  }
  satir.bitis = Date.now();
  satir.sonuc = yanit;
  if (!yanit || yanit.basarili === false) satir.durum = 'hata';
  else if (yanit.durum === 'passed') satir.durum = 'basarili';
  else if (yanit.durum === 'skipped') satir.durum = 'atlanan';
  else if (yanit.durum === 'iptal') satir.durum = 'durduruldu';
  else satir.durum = 'basarisiz';
  yay('satir-bitti');
}

function oturumuBitirGerekirse(oturum) {
  if (oturum !== durum.oturum || oturum.bitti) return;
  if (oturum.satirlar.some((x) => x.durum === 'calisiyor' || (x.durum === 'sirada' && !oturum.iptal))) return;
  for (const x of oturum.satirlar) if (x.durum === 'sirada') { x.durum = 'durduruldu'; x.sonuc = { basarili: true, durum: 'iptal', mesaj: 'Başlamadan durduruldu.' }; }
  oturum.bitti = true;
  const say = sayaclar(oturum);
  bildir(`Koşu bitti: ${say.basarili} başarılı, ${say.basarisiz} başarısız${say.atlanan ? `, ${say.atlanan} atlandı` : ''}${say.durduruldu ? `, ${say.durduruldu} durduruldu` : ''}${say.hata ? `, ${say.hata} çalıştırılamadı` : ''}.`,
    say.basarisiz || say.hata ? 'hata' : 'basari');
  yay('bitti');
}

function sayaclar(oturum) {
  const s = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0, hata: 0, calisiyor: 0, sirada: 0 };
  for (const x of oturum.satirlar) s[x.durum] = (s[x.durum] || 0) + 1;
  return s;
}

/** Tek senaryoyu durdurur (sıradaysa hiç başlatılmaz). */
export async function durdur(senaryoId) {
  const satir = kosuDurumu(senaryoId);
  if (!satir) return;
  if (satir.durum === 'sirada') {
    satir.durum = 'durduruldu';
    satir.sonuc = { basarili: true, durum: 'iptal', mesaj: 'Başlamadan durduruldu.' };
    yay();
    oturumuBitirGerekirse(durum.oturum);
    return;
  }
  satir.durduruluyor = true;
  yay();
  try { await api('/durdur', { govde: { kosuId: satir.kosuId } }); } catch (hata) { bildir(`Durdurulamadı: ${hata.message}`, 'hata'); }
}

/** Toplu koşuyu durdurur: sıradakiler başlamaz, çalışanlara ayrı ayrı durdurma isteği gider. */
export function tumunuDurdur() {
  const oturum = durum.oturum;
  if (!oturum || oturum.bitti) return;
  oturum.iptal = true;
  for (const x of oturum.satirlar) {
    if (x.durum === 'sirada') { x.durum = 'durduruldu'; x.sonuc = { basarili: true, durum: 'iptal', mesaj: 'Başlamadan durduruldu.' }; }
  }
  for (const x of oturum.satirlar) if (x.durum === 'calisiyor') durdur(x.senaryoId);
  yay();
  oturumuBitirGerekirse(oturum);
}

// ---------------------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------------------

let panelEl = null;
let hapEl = null;
let canliZamanlayici = null;
/** Panelde o an görünen canlı görüntüyü yenileyen fonksiyon (her çizimde güncellenir). */
let canliYukle = null;
/** Son alınan canlı kare (yeniden çizimde boş kutu göstermemek için). */
let sonCanliKare = null;

function canliIzlemeyiDurdur() {
  if (canliZamanlayici) clearInterval(canliZamanlayici);
  canliZamanlayici = null;
  canliYukle = null;
}

function durumSimgesi(d) {
  const g = KOSU_DURUMLARI[d] || KOSU_DURUMLARI.hata;
  if (d === 'calisiyor') return h('span', { class: 'donen-halka', role: 'img', 'aria-label': g.etiket });
  return h('span', { class: `durum-simgesi ${g.sinif}`, role: 'img', 'aria-label': g.etiket }, ikon(g.ikon));
}

function paneliCiz() {
  const oturum = durum.oturum;
  if (!oturum) {
    panelEl?.remove(); hapEl?.remove(); panelEl = null; hapEl = null; canliIzlemeyiDurdur();
    return;
  }
  const say = sayaclar(oturum);
  const toplam = oturum.satirlar.length;
  const biten = toplam - say.calisiyor - say.sirada;
  if (durum.kucuk) {
    panelEl?.remove(); panelEl = null; canliIzlemeyiDurdur();
    if (!hapEl) {
      hapEl = h('button', { type: 'button', class: 'kosu-hapi' });
      hapEl.addEventListener('click', () => { durum.kucuk = false; paneliCiz(); });
      document.body.append(hapEl);
    }
    yerlestir(hapEl, oturum.bitti ? ikon('onay') : h('span', { class: 'donen-halka', 'aria-hidden': 'true' }),
      oturum.bitti ? 'Koşu bitti' : 'Koşu sürüyor', h('span', { class: 'sayi' }, `${biten}/${toplam}`));
    hapEl.setAttribute('aria-label', `Koşu paneli: ${biten}/${toplam} tamamlandı — paneli aç`);
    return;
  }
  hapEl?.remove(); hapEl = null;
  if (!panelEl) {
    panelEl = h('section', { class: 'kosu-paneli', role: 'region', 'aria-label': 'Canlı koşu paneli' });
    document.body.append(panelEl);
  }
  const yuzde = toplam ? Math.round((biten / toplam) * 100) : 0;
  const kucult = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Paneli küçült', title: 'Küçült', onclick: () => { durum.kucuk = true; paneliCiz(); } }, ikon('eksi'));
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Paneli kapat', title: 'Kapat', onclick: () => { durum.oturum = null; durum.secili = null; paneliCiz(); } }, ikon('carpi'));
  const tumunuDurdurDugmesi = !oturum.bitti ? h('button', { type: 'button', class: 'kucuk-dugme tehlike', onclick: tumunuDurdur }, h('span', { class: 'kare-simge', 'aria-hidden': 'true' }), 'Tümünü durdur') : null;
  const liste = h('ul', { class: 'kosu-listesi', 'aria-label': 'Koşudaki senaryolar' },
    oturum.satirlar.map((x) => {
      const secili = x.senaryoId === durum.secili;
      const sure = x.baslangic ? sureMetni((x.bitis || Date.now()) - x.baslangic) : '';
      const li = h('li', { class: secili ? 'secili' : null, tabindex: '0', 'aria-current': secili ? 'true' : null, 'data-senaryo': x.senaryoId },
        durumSimgesi(x.durum),
        h('span', { class: 'ad' }, h('span', { title: x.baslik }, x.baslik), h('small', {}, [x.ekranAdi, (KOSU_DURUMLARI[x.durum] || {}).etiket].filter(Boolean).join(' · '),
          x.durum === 'calisiyor' && x.kodIstegi ? [' ', rozet('Kod bekleniyor', 'uyari')] : null)),
        h('span', { class: 'sag' }, x.durum === 'calisiyor' && x.sonuc === null ? sure : x.sonuc && x.sonuc.sureMs != null ? sureMetni(x.sonuc.sureMs) : '',
          x.durum === 'calisiyor' || x.durum === 'sirada'
            ? h('button', { type: 'button', class: 'kucuk-dugme durdur-dugmesi', disabled: Boolean(x.durduruluyor), 'aria-label': `Durdur: ${x.baslik}`, onclick: (o) => { o.stopPropagation(); durdur(x.senaryoId); } }, x.durduruluyor ? 'Durduruluyor…' : 'Durdur')
            : null));
      const sec = () => { durum.secili = x.senaryoId; paneliCiz(); };
      li.addEventListener('click', sec);
      li.addEventListener('keydown', (o) => { if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); sec(); } });
      return li;
    }));
  const cipler = h('div', { class: 'kosu-sayaclari' },
    say.basarili ? rozet(`${say.basarili} başarılı`, 'basari') : null, say.basarisiz ? rozet(`${say.basarisiz} başarısız`, 'hata') : null,
    say.atlanan ? rozet(`${say.atlanan} atlandı`, 'atlanan') : null, say.durduruldu ? rozet(`${say.durduruldu} durduruldu`, 'durdu') : null,
    say.hata ? rozet(`${say.hata} çalıştırılamadı`, 'hata') : null, say.calisiyor ? rozet(`${say.calisiyor} çalışıyor`, 'vurgu') : null,
    say.sirada ? rozet(`${say.sirada} sırada`) : null);
  const ilerleme = h('progress', { max: String(toplam), value: String(biten), 'aria-label': `İlerleme: ${biten} / ${toplam}` });
  yerlestir(panelEl, 
    h('div', { class: 'panel-baslik' },
      h('div', { class: 'satir' },
        h('h2', {}, oturum.bitti ? ikon('onay') : h('span', { class: 'donen-halka', 'aria-hidden': 'true' }), oturum.bitti ? 'Koşu bitti' : 'Koşu sürüyor'),
        h('div', { class: 'dugmeler' }, tumunuDurdurDugmesi, kucult, oturum.bitti ? kapat : null)),
      h('div', { class: 'alt' }, h('span', {}, oturum.baslik), h('span', {}, `${oturum.ortam.ad} · ${oturum.tur === 'tam' ? `tam · ${oturum.kapsam}` : 'kısmi'} · ${oturum.esZamanli ? 'aynı anda' : 'sırayla'}`)),
      h('div', { class: 'ilerleme-satiri' }, ilerleme, h('span', { class: 'yuzde' }, `%${yuzde}`)),
      cipler),
    liste,
    izlemeAlani(oturum));
}

/** Adım durumu → simge ve etiket (canlı ve biten koşu aynı görünüm; bkz. sonuç detayı "Adımlar"). */
const ADIM_DURUMU = {
  calisiyor: { etiket: 'çalışıyor', ikon: null }, basarili: { etiket: 'başarılı', ikon: 'onay' }, basarisiz: { etiket: 'başarısız', ikon: 'carpi' },
  durduruldu: { etiket: 'durduruldu', ikon: 'eksi' }, atlanan: { etiket: 'atlandı', ikon: 'eksi' }
};

/**
 * Adım listesi: "Adımlar N / M başarılı"; çalışan adım sarı (süre canlı akar), biten yeşil, hata veren kırmızı.
 * @param {Array<{ ad: string; durum: string; sureMs?: number | null; baslangic?: number }>} adimlar @param {boolean} canli
 */
function adimListesi(adimlar, canli) {
  const basarili = adimlar.filter((a) => a.durum === 'basarili').length;
  return h('div', { class: 'kosu-adimlari', 'aria-label': 'Adımlar', 'aria-live': canli ? 'polite' : null },
    h('div', { class: 'kosu-adimlari-baslik' }, ikon('liste'), h('b', {}, 'Adımlar'), adimlar.length ? h('span', { class: 'soluk' }, `${basarili} / ${adimlar.length} başarılı`) : null),
    adimlar.length ? h('ol', { class: 'adim-listesi' }, adimlar.map((a) => {
      const g = ADIM_DURUMU[a.durum] || ADIM_DURUMU.atlanan;
      const sure = a.durum === 'calisiyor' && a.baslangic ? Date.now() - a.baslangic : a.sureMs;
      return h('li', { class: `adim ${a.durum}` },
        h('span', { class: 'adim-isareti', 'aria-hidden': 'true' }, g.ikon ? ikon(g.ikon) : h('span', { class: 'donen-halka' })),
        h('span', { class: 'adim-metni' }, h('span', {}, a.ad), h('span', { class: 'gorunmez' }, ` — ${g.etiket}`)),
        h('span', { class: 'adim-suresi' }, sure === null || sure === undefined ? '—' : sureMetni(sure)));
    })) : h('p', { class: 'soluk kucuk' }, canli ? 'İlk adım bekleniyor…' : 'Adım bilgisi yok.'));
}

function izlemeAlani(oturum) {
  const satir = oturum.satirlar.find((x) => x.senaryoId === durum.secili) || oturum.satirlar[0];
  const alan = h('div', { class: 'kosu-izleme' });
  if (!satir) return alan;
  const g = KOSU_DURUMLARI[satir.durum] || KOSU_DURUMLARI.hata;
  alan.append(h('div', { class: 'izleme-basligi' }, h('span', { title: satir.baslik }, satir.baslik),
    satir.durum === 'calisiyor' ? h('span', { class: 'canli-rozeti', title: 'Anlık ekran görüntüsü (koşu sürerken yenilenir)' }, 'ANLIK') : rozet(g.etiket, g.sinif === 'sirada' ? '' : g.sinif)));
  if (satir.durum === 'calisiyor') {
    if (satir.kodIstegi) alan.append(kodFormu(satir));
    const img = h('img', { alt: `Canlı ekran görüntüsü: ${satir.baslik}` });
    const bos = h('div', { class: 'medya-bos' }, h('span', { class: 'donen-halka', 'aria-hidden': 'true' }), 'Canlı görüntü bekleniyor…');
    const kap = h('div', { class: 'goruntuleyici' }, h('div', { class: 'tarayici-cubugu', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {}), h('span', {}, 'anlık görüntü')), bos);
    alan.append(kap);
    // Önceki kare yeni çizimde de gösterilir (yenileme sırasında titreme olmasın).
    if (sonCanliKare && sonCanliKare.kosuId === satir.kosuId) { img.src = sonCanliKare.src; bos.replaceWith(img); }
    const adimKap = h('div', {}, adimListesi(satir.canliAdimlar || [], true));
    alan.append(adimKap);
    const adimlariYukle = async () => {
      try {
        const y = await fetch(`/adim-durumu?token=${encodeURIComponent(TOKEN)}&kosuId=${encodeURIComponent(satir.kosuId)}`, { cache: 'no-store' }).then((r) => r.json());
        if (Array.isArray(y.adimlar)) { satir.canliAdimlar = y.adimlar; if (adimKap.isConnected) yerlestir(adimKap, adimListesi(y.adimlar, true)); }
      } catch { /* bir sonraki tikte yeniden denenir */ }
    };
    canliYukle = () => {
      void adimlariYukle();
      const on = new Image();
      on.onload = () => {
        sonCanliKare = { kosuId: satir.kosuId, src: on.src };
        img.src = on.src;
        if (bos.isConnected) bos.replaceWith(img);
      };
      on.src = `/canli?token=${encodeURIComponent(TOKEN)}&kosuId=${encodeURIComponent(satir.kosuId)}&t=${Date.now()}`;
    };
    canliYukle();
    if (!canliZamanlayici) canliZamanlayici = setInterval(() => { if (canliYukle) canliYukle(); }, CANLI_ARALIK_MS);
    return alan;
  }
  canliIzlemeyiDurdur();
  if (satir.durum === 'sirada') { alan.append(h('p', { class: 'soluk kucuk' }, 'Sırasını bekliyor.')); return alan; }
  const s = satir.sonuc || {};
  const gorselId = s.ekranGoruntusuId || null;
  const videoId = s.videoId || null;
  const govde = h('div', {});
  const onizleme = () => yerlestir(govde, gorselId
    ? h('a', { href: medyaUrl(gorselId), target: '_blank', rel: 'noopener', class: 'onizleme-dugmesi', 'aria-label': 'Son ekran görüntüsünü yeni sekmede aç' }, h('img', { src: medyaUrl(gorselId), alt: 'Son ekran görüntüsü' }))
    : h('div', { class: 'medya-bos' }, ikon('ekran'), satir.durum === 'hata' ? 'Koşu başlatılamadı.' : 'Ekran görüntüsü yok.'));
  onizleme();
  alan.append(h('div', { class: `goruntuleyici ${satir.durum === 'basarisiz' ? 'hata-ani' : ''}` },
    h('div', { class: 'tarayici-cubugu', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {}), h('span', {}, gorselId ? 'son ekran görüntüsü' : satir.ekranAdi || 'sonuç')), govde));
  let oynuyor = false;
  const izle = h('button', { type: 'button', class: 'birincil kucuk-dugme', disabled: !videoId, title: videoId ? null : 'Bu koşuda video yok' }, ikon('oynat'), 'Videoyu izle');
  izle.addEventListener('click', () => {
    if (!videoId) return;
    oynuyor = !oynuyor;
    if (oynuyor) { yerlestir(govde, h('video', { controls: true, autoplay: true, src: medyaUrl(videoId), class: 'sonuc-videosu' })); yerlestir(izle, ikon('gorunum'), 'Görüntüye dön'); }
    else { onizleme(); yerlestir(izle, ikon('oynat'), 'Videoyu izle'); }
  });
  alan.append(h('div', { class: 'panel-eylemleri' }, izle,
    s.sonucId ? h('a', { class: 'dugme kucuk-dugme', href: `#/sonuclar/sonuc/${encodeURIComponent(s.sonucId)}` }, 'Tüm ayrıntılar', ikon('ok')) : null));
  if (s.sonucId) {
    const adimKap = h('div', {}, adimListesi(satir.sonucAdimlari || satir.canliAdimlar || [], false));
    alan.append(adimKap);
    if (!satir.sonucAdimlari) {
      api(`/platform/sonuclar/sonuc?id=${encodeURIComponent(s.sonucId)}`).then((r) => {
        satir.sonucAdimlari = (r.sonuc?.adimlar || r.adimlar || []).map((a) => ({ ad: a.ad, durum: a.durum, sureMs: a.sureMs }));
        if (adimKap.isConnected) yerlestir(adimKap, adimListesi(satir.sonucAdimlari, false));
      }).catch(() => {});
    }
  } else if (satir.canliAdimlar?.length) alan.append(adimListesi(satir.canliAdimlar, false));
  const mesaj = s.hataMesaji || (satir.durum === 'hata' || satir.durum === 'durduruldu' ? s.mesaj : null);
  if (mesaj) alan.append(h('div', { class: `hata-ozeti ${satir.durum === 'durduruldu' ? 'notr' : ''}`.trim() }, h('b', {}, satir.durum === 'durduruldu' ? 'Not: ' : 'Hata: '), String(mesaj).split('\n').find((x) => x.trim()) || String(mesaj)));
  return alan;
}

// ---------------------------------------------------------------------------------------
// Elle doğrulama kodu (SMS "elle" kipi)
// ---------------------------------------------------------------------------------------

/** Kullanıcının yazdığı ama henüz göndermediği kodlar (panel yeniden çizilince kaybolmasın). */
const kodTaslaklari = new Map();

function kodFormu(satir) {
  const istek = satir.kodIstegi;
  const girdi = h('input', {
    type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '12', spellcheck: 'false',
    id: `kod-${satir.kosuId}`, 'aria-describedby': `kod-${satir.kosuId}-aciklama`, value: kodTaslaklari.get(satir.kosuId) || ''
  });
  girdi.addEventListener('input', () => kodTaslaklari.set(satir.kosuId, girdi.value));
  const gonder = h('button', { type: 'submit', class: 'birincil kucuk-dugme' }, 'Kodu gönder');
  const hata = h('div', { class: 'alan-hatasi', role: 'alert' });
  const kalan = h('span', { class: 'kod-kalan sayi', 'data-kosu': satir.kosuId }, `${istek.kalanSn} sn`);
  const form = h('form', { class: 'kod-istemi', 'aria-labelledby': `kod-${satir.kosuId}-baslik` },
    h('div', { class: 'kod-istemi-baslik' }, ikon('kilit'), h('strong', { id: `kod-${satir.kosuId}-baslik` }, 'Doğrulama kodu bekleniyor'), kalan),
    h('p', { class: 'soluk kucuk', id: `kod-${satir.kosuId}-aciklama` }, `${istek.mesaj}. Koşu bu kodu girmeniz için bekliyor; süre dolarsa giriş başarısız sayılır.`),
    h('div', { class: 'kod-istemi-satir' }, h('label', { class: 'gorunmez', for: girdi.id }, 'Doğrulama kodu'), girdi, gonder),
    hata);
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    const kod = girdi.value.trim();
    if (!/^[A-Za-z0-9]{3,12}$/.test(kod)) { hata.textContent = 'Kod yalnızca harf ve rakamdan oluşmalı (3–12 karakter).'; girdi.focus(); return; }
    gonder.disabled = true;
    try {
      await api('/kod-gonder', { govde: { kosuId: satir.kosuId, kod } });
      kodTaslaklari.delete(satir.kosuId);
      satir.kodIstegi = null;
      bildir('Doğrulama kodu koşuya iletildi.');
      paneliCiz();
    } catch (e) {
      hata.textContent = e.message;
      gonder.disabled = false;
    }
  });
  // Yeni açılan formda odak koda gelsin (kullanıcı başka bir alana yazmıyorsa).
  setTimeout(() => { if (girdi.isConnected && (!document.activeElement || document.activeElement === document.body)) girdi.focus(); }, 0);
  return form;
}

let kodYoklamaSuruyor = false;
async function kodIstekleriniYokla() {
  const oturum = durum.oturum;
  if (!oturum || oturum.bitti || kodYoklamaSuruyor) return;
  const calisanlar = oturum.satirlar.filter((x) => x.durum === 'calisiyor');
  if (!calisanlar.length) return;
  kodYoklamaSuruyor = true;
  let degisti = false;
  try {
    for (const x of calisanlar) {
      let yanit = null;
      try {
        yanit = await api(`/kod-istegi?kosuId=${encodeURIComponent(x.kosuId)}&token=${encodeURIComponent(TOKEN)}`);
      } catch { continue; }
      const yeni = yanit && yanit.bekliyor ? { mesaj: yanit.mesaj, kalanSn: yanit.kalanSn } : null;
      if (Boolean(yeni) !== Boolean(x.kodIstegi)) {
        degisti = true;
        if (yeni) { durum.secili = x.senaryoId; durum.kucuk = false; bildir(`"${x.baslik}" doğrulama kodu bekliyor.`, 'hata'); }
      }
      x.kodIstegi = yeni;
    }
  } finally {
    kodYoklamaSuruyor = false;
  }
  if (degisti) paneliCiz();
  else for (const el of document.querySelectorAll('.kod-kalan')) {
    const x = oturum.satirlar.find((y) => y.kosuId === el.dataset.kosu);
    if (x && x.kodIstegi) el.textContent = `${x.kodIstegi.kalanSn} sn`;
  }
}
setInterval(kodIstekleriniYokla, KOD_YOKLAMA_MS);

// Çalışan satırların süre sayacı (panel açıkken saniyede bir).
setInterval(() => { if (durum.oturum && !durum.oturum.bitti && panelEl && !durum.kucuk) {
  for (const li of panelEl.querySelectorAll('.kosu-listesi li')) {
    const x = durum.oturum.satirlar.find((y) => y.senaryoId === li.dataset.senaryo);
    if (x && x.durum === 'calisiyor' && x.baslangic) { const sag = li.querySelector('.sag'); if (sag && sag.firstChild && sag.firstChild.nodeType === 3) sag.firstChild.textContent = sureMetni(Date.now() - x.baslangic); }
  }
} }, 1000);
