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
import { api, canliOnayPenceresi, kapaliDugmeNedenleri, kullaniciAyarlari, yerlestir, bildir, h, ikon, rozet, TOKEN } from './ortak.js';
import { canliGoruntu, kosuYedekKaresi } from './canli-akis.js';
import { riskBelirtilmemisMi, riskliOrtamMi } from './ortam-riski.mjs';
import { etkinKosuHizi, kosuHiziOzeti } from './kosu-hizi.mjs';
import { HAZIRLIK_BASLIKLARI, kosuSayimMetni, ortamDenetimiMetni } from './hazirlik.mjs';

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

/** Ortam Canlı mı? TEK TANIM sunucuyla ortak: ortam-riski.mjs (Ortam türü seçimi; seçilmemiş = Canlı). */
export { riskliOrtamMi };

/**
 * Ortamın tür rozeti (her yerde aynı): ortam kendi adıyla gösterilir; YALNIZ Canlıysa kırmızı "Canlı" rozeti, türü seçilmemişse
 * "Türünü seçin". Test ortamına rozet eklenmez.
 * @param {{ ad: string } & Record<string, unknown>} o @returns {HTMLElement | null}
 */
export function ortamRiskRozeti(o) {
  if (!riskliOrtamMi(o)) return null;
  return riskBelirtilmemisMi(o)
    ? rozet('Türünü seçin', 'uyari', { title: 'Ortam türü seçilmemiş; seçilene kadar Canlı sayılır (Ayarlar > Proje ve ortamlar)' })
    : rozet('Canlı', 'hata', { title: 'Canlı ortam: istek atan her işlemde onay sorulur' });
}

/** Seçim listelerinde ortam metni: adı; Canlıysa "(Canlı)" / türü seçilmemişse "(türünü seçin)". @param {{ ad: string } & Record<string, unknown>} o */
export const ortamSecenekMetni = (o) => (riskliOrtamMi(o) ? `${o.ad} (${riskBelirtilmemisMi(o) ? 'türünü seçin' : 'Canlı'})` : o.ad);

/**
 * "Ortam türünü seçin" uyarısı: ortamın türü seçilmemiş (Canlı sayılır) → Ayarlar > Proje ve ortamlar bağlantısı.
 * Koşu diyaloğu, servis sayfası ve ortam listesi kullanır.
 */
export function riskBelirtinNotu() {
  return h('div', { class: 'not-kutusu uyari risk-belirtin', role: 'note' }, h('strong', {}, 'Ortam türünü seçin. '),
    'Bu ortamın türü (Test / Canlı) seçilmemiş; seçilene kadar Canlı sayılır (her işlemde onay, canlı ortam izni). ',
    h('a', { href: '#/ayarlar/proje', onclick: () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); } }, 'Ayarlar > Proje ve ortamlar'));
}

/**
 * CANLI ortam onayı — TEK TİP pencere (ortak.js > canliOnayPenceresi): "CANLI ortam" / "Bu işlem <ortam> (CANLI) ortamında
 * yapılacak; istekler gerçek sisteme gider. Emin misiniz?" / "Evet, devam et" · "Vazgeç". Sunucu CANLI ortama istek atan her
 * işlemde istekte canliOnay: true ister (guvenlik/uc-denetimi.mjs). Onay HATIRLANMAZ: canliOnayIste / kosuOnayi'nda verilen onay
 * yalnız o ortam için, TEK işlemde (ilk canliOnayEki çağrısında) kullanılır; sonraki işlem yeniden sorar.
 */
let onayliRiskliOrtam = null;
/** İsteğe eklenecek açık onay (ortam Canlı ve az önce onaylandıysa; tek kullanımlık). @param {string} ortamId */
export const canliOnayEki = (ortamId) => {
  if (!ortamId || ortamId !== onayliRiskliOrtam) return {};
  onayliRiskliOrtam = null;
  return { canliOnay: true };
};
/**
 * CANLI ortam için işlem başlamadan önce tek tip onay penceresini açar; Test ortamında hemen true. Onaylanırsa canliOnayEki o ortam
 * için (bir kez) { canliOnay: true } verir. @param {{ id: string; ad: string; canli?: boolean; riskli?: boolean | null; varsayilan?: boolean }} ortam
 * @param {string} [_ne] eski çağrılarla uyum (metin tek tiptir)
 */
export async function canliOnayIste(ortam, _ne = 'Bu işlem') {
  onayliRiskliOrtam = null;
  if (!riskliOrtamMi(ortam)) return true;
  const tamam = await canliOnayPenceresi(ortam.ad);
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
/** Son koşu oturumu "Tümünü durdur" ile durduruldu mu (talep koşusu sonraki türleri başlatmaz). */
export const kosuDurdurulduMu = () => Boolean(durum.oturum && durum.oturum.iptal);

// ---------------------------------------------------------------------------------------
// Onay penceresi
// ---------------------------------------------------------------------------------------

/**
 * Ekran koşusu diyaloğunun "nasıl" bilgisi — seçili ortamın etkin koşu hızı (Ayarlar > Koşu > Ekran senaryoları; ortamın "Koşu
 * hızı" ezer): kosuOnayi'ye { kosuBicimi, hizOzeti } olarak verilir.
 */
export async function ekranKosuBicimi() {
  const genel = await kullaniciAyarlari();
  const n = (o) => etkinKosuHizi(genel, o).degerler.ekranEszamanli;
  return {
    kosuBicimi: (o) => (n(o) > 1 ? `en çok ${n(o)} tanesi aynı anda` : 'sırayla'),
    hizOzeti: (o) => kosuHiziOzeti(etkinKosuHizi(genel, o), 'ekran')
  };
}

/** Koşu diyaloğunda önce seçilecek ortam: varsayılan, yoksa riskli olmayan ilk ortam, yoksa ilki. */
export const onerilenOrtam = (ortamlar) => ortamlar.find((o) => o.varsayilan) || ortamlar.find((o) => !riskliOrtamMi(o)) || ortamlar[0] || null;

/**
 * Sayfa içi onay: kaç senaryo, hangi ortamda, nasıl (sırayla/aynı anda), koşu türü/kapsamı; riskli
 * ortamda uyarı.
 *  - Sabit ortam (s.ortam, s.senaryolar): Promise<boolean>.
 *  - ORTAM SEÇİMLİ (s.ortamlar + s.hesapla): ortam diyalogda seçilir; her seçimde hesapla(ortam) koşacak senaryoları
 *    (ve o ortamda Koşuda kapalı / tanımsız olanların sayısını; istenirse atlananları nedenleriyle) verir. Promise<{ ortam, senaryolar } | null>.
 *  - turEtiketi: "Kapsam" özet kutusunda tam / kısmi yerine gösterilecek metin (ör. servis koşusu).
 *  - kosuBicimi: "sırayla" / "aynı anda" yerine yazılacak metin ya da seçili ortamdan metni veren işlev (ör. "en çok 3 tanesi aynı anda").
 *  - hizOzeti(ortam): etkin koşu hızı özeti (genel ayar + ortam ezmesi; kosu-hizi.mjs > kosuHiziOzeti).
 *  - veriKosusu: { projeId } — ekran senaryolarında VERİ KOŞULARI (tablodan çoklu satır): senaryolardan biri tablo kullanıyorsa
 *    "Veri koşusu" seçimi (senaryodaki biçim / hepsi tek satır / uyan tüm satırlar; koşu anı ezmesi) ve TAHMİNİ TEST SAYISI
 *    gösterilir; üst sınırı (Ayarlar > Koşu) aşan senaryo varsa Başlat kapalıdır. Sonuç { ortam, senaryolar, veriKipi }.
 *  - surumAlani: true (ortam seçimli diyalogda) — isteğe bağlı "Uygulama sürümü" alanı (ön değer: ortam ayarındaki sürüm); sonuçta
 *    uygulamaSurumu (boş = ortamınki; PDF rapor A4).
 *  - hazirlik: { projeId } — "Hazırlık kontrolü" bölümü (madde özeti + ortam bağlantısı "Denetle"). hesapla(ortam) ayrıca
 *    calistirilamazlar: [{ id, baslik, neden, eksikler }] verebilir: bunlar koşuya girmez, "12 senaryodan 2'si çalıştırılamaz —
 *    10'u başlatılsın mı?" ve nedenleriyle listelenir (senaryolar/hazirlik.mjs).
 * @param {{ baslik: string; senaryolar?: Array<{ baslik: string }>; ortam?: { id?: string; ad: string; varsayilan?: boolean }; tur: 'tam' | 'tekil'; kapsam?: string; esZamanli?: boolean; kosuBicimi?: string | ((ortam: any) => string); hizOzeti?: (ortam: any) => string; not?: string; haricSayisi?: number; dugme?: string; uyarilar?: Array<{ baslik: string; neden: string }>;
 *   ortamlar?: Array<{ id: string; ad: string; varsayilan?: boolean }>; turEtiketi?: string; veriKosusu?: { projeId: string };
 *   hesapla?: (ortam: any) => { senaryolar: Array<{ baslik: string }>; haricSayisi?: number; tanimsizSayisi?: number; atlananlar?: Array<{ baslik: string; neden: string }>; uyarilar?: Array<{ baslik: string; neden: string }> } }} s
 */
export function kosuOnayi(s) {
  return new Promise((coz) => {
    const secimli = Array.isArray(s.ortamlar) && s.ortamlar.length > 0 && typeof s.hesapla === 'function';
    let ortam = secimli ? (s.ortam && s.ortamlar.find((o) => o.id === s.ortam.id)) || onerilenOrtam(s.ortamlar) : s.ortam;
    /** @type {{ senaryolar: Array<{ baslik: string }>; haricSayisi?: number; tanimsizSayisi?: number; atlananlar?: Array<{ baslik: string; neden: string }>; uyarilar?: Array<{ baslik: string; neden: string }> }} */
    let hesap = { senaryolar: s.senaryolar || [], haricSayisi: s.haricSayisi, uyarilar: s.uyarilar };
    const baslat = h('button', { type: 'button', class: 'birincil' });
    const bosNedenId = `kosu-bos-nedeni-${kimlikUret()}`;
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const turMetni = s.tur === 'tam' ? `Tam koşu · ${s.kapsam || 'Genel'}` : 'Kısmi (tekil)';
    const ortamSecimi = secimli ? h('select', { id: `kosu-ortami-${kimlikUret()}` },
      s.ortamlar.map((o) => h('option', { value: o.id, selected: o.id === ortam.id }, ortamSecenekMetni(o)))) : null;
    const degisken = h('div', {});
    // --- Veri koşusu (tablodan çoklu satır): koşu anı ezmesi + tahmini test sayısı (sunucu hesaplar; üst sınır Ayarlar > Koşu) ---
    let veriKipi = 'senaryo';
    /** @type {{ toplam: number; sinir: number; gruplu: boolean; coklu: number; asanlar: Array<{ baslik: string; sayi: number }>; senaryolar: Array<{ hatalar: string[]; baslik: string }> } | null} */
    let tahmin = null;
    let tahminSirasi = 0;
    const veriKipiSecimi = s.veriKosusu ? h('select', { id: `veri-kipi-${kimlikUret()}` },
      h('option', { value: 'senaryo' }, 'Senaryodaki çalıştırma biçimiyle'),
      h('option', { value: 'tek' }, 'Hepsi tek satırla'),
      h('option', { value: 'tumu' }, 'Uyan tüm satırlarla (her satır ayrı test)')) : null;
    const veriBolumu = h('div', { class: 'veri-kosusu-bolumu', hidden: true });
    // --- Uygulama sürümü (isteğe bağlı; PDF rapor A4): koşu kaydına etiket. Ön değer ortam ayarındaki sürüm; boş bırakılırsa ortamınki. ---
    const surumGirdisi = s.surumAlani && secimli ? h('input', {
      type: 'text', id: `kosu-surumu-${kimlikUret()}`, maxlength: '60', autocomplete: 'off', placeholder: 'Ör. 2.4.1', value: (ortam && ortam.uygulamaSurumu) || ''
    }) : null;
    let surumDegisti = false;
    surumGirdisi?.addEventListener('input', () => { surumDegisti = true; });
    const surumBolumu = surumGirdisi ? h('div', { class: 'alan kosu-surum-alani' },
      h('label', { for: surumGirdisi.id }, 'Uygulama sürümü (isteğe bağlı)'), surumGirdisi,
      h('div', { class: 'yardim' }, 'Test edilen uygulamanın sürümü; koşuya etiket olarak yazılır (raporlarda sürüme göre başarı). Boşsa ortam ayarındaki sürüm kullanılır.')) : null;
    // --- "Tarayıcı penceresinde izle (görünür)": seçilirse koşu görünür (headed) tarayıcıda çalışır. Ön değer Ayarlar > Koşu'dan
    // (tarayiciPenceresindeIzle); servis koşularında (tarayıcı yok) gösterilmez. Seçim kosuBaslat'a iletilir (gorunurSeciminiAl). ---
    const gorunurKutusu = s.tarayiciSecimi === false ? null : h('input', { type: 'checkbox', id: `kosu-gorunur-${kimlikUret()}` });
    let gorunurDokunuldu = false;
    gorunurKutusu?.addEventListener('change', () => { gorunurDokunuldu = true; });
    if (gorunurKutusu) void kullaniciAyarlari().then((a) => { if (!gorunurDokunuldu && a && a.tarayiciPenceresindeIzle === true) gorunurKutusu.checked = true; }).catch(() => {});
    const gorunurBolumu = gorunurKutusu ? h('label', { class: 'tarayici-penceresi-secimi', for: gorunurKutusu.id }, gorunurKutusu,
      h('span', {}, 'Tarayıcı penceresinde izle (görünür)',
        h('small', {}, 'Koşu ekranda görünen bir tarayıcı penceresinde çalışır. Seçilmezse görünmez çalışır; paneldeki canlı görüntüden izlersiniz.'))) : null;
    const veriCiz = () => {
      if (!veriKipiSecimi) return;
      veriBolumu.hidden = !tahmin || !tahmin.gruplu;
      if (!tahmin) return;
      const hatali = tahmin.senaryolar.filter((x) => x.hatalar && x.hatalar.length);
      yerlestir(veriBolumu,
        h('div', { class: 'alan' }, h('label', { for: veriKipiSecimi.id }, 'Veri koşusu'), veriKipiSecimi),
        h('p', { class: 'veri-kosusu-tahmini', role: 'status' }, 'Tahmini test sayısı: ', h('strong', {}, String(tahmin.toplam)),
          tahmin.coklu ? ` (${tahmin.coklu} senaryo tablodan birden çok satırla)` : ''),
        hatali.length ? h('p', { class: 'soluk kucuk' }, `${hatali.length} senaryo bu ortamda çoklu koşamıyor: ${hatali[0].baslik} — ${hatali[0].hatalar[0]}`) : null,
        tahmin.asanlar.length ? h('div', { class: 'not-kutusu hata', role: 'alert' },
          h('strong', {}, `Tek senaryoda en çok ${tahmin.sinir} veri koşusu olabilir. `),
          `${tahmin.asanlar.map((x) => `${x.baslik} (${x.sayi})`).slice(0, 5).join(', ')} bu sınırı aşıyor. Senaryonun satır seçimini daraltın, "Hepsi tek satırla" seçin ya da sınırı Ayarlar > Koşu'dan değiştirin.`) : null);
      baslat.disabled = hesap.senaryolar.length === 0 || tahmin.asanlar.length > 0;
    };
    const tahminAl = () => {
      if (!s.veriKosusu || !ortam) return;
      const sira = ++tahminSirasi;
      const idler = hesap.senaryolar.map((x) => x.id).filter(Boolean);
      if (!idler.length) { tahmin = null; veriCiz(); return; }
      api('/platform/senaryolar/veri-kosusu-tahmini', { govde: { projeId: s.veriKosusu.projeId, ortamId: ortam.id, senaryoIdleri: idler, kip: veriKipi } })
        .then((y) => { if (sira === tahminSirasi) { tahmin = y; veriCiz(); } })
        .catch(() => { if (sira === tahminSirasi) { tahmin = null; veriCiz(); } });
    };
    veriKipiSecimi?.addEventListener('change', () => { veriKipi = veriKipiSecimi.value; tahminAl(); });
    // --- Hazırlık (senaryolar/hazirlik.mjs; sunucu listede ortam başına hesaplar): çalıştırılamayan senaryolar tek cümlelik
    // gerekçeleriyle koşuya girmez; madde özeti ve ortam bağlantısı. Ortam bağlantısı KENDİLİĞİNDEN denetlenmez: yalnız "Denetle"
    // seçili ortamın adresine tek istek gönderir (izin ve CANLI onayı sunucuda); saklanan son sonuç (10 dk) istek atmadan okunur.
    /** @type {Record<string, any>} ortam kimliği → son denetim (null: denetlenmedi) */
    const ortamDenetimleri = {};
    const ortamDenetiminiOku = (o) => {
      if (!s.hazirlik || !o || o.id in ortamDenetimleri) return;
      ortamDenetimleri[o.id] = null;
      api(`/platform/ortam/denetim?projeId=${encodeURIComponent(s.hazirlik.projeId)}&ortamId=${encodeURIComponent(o.id)}`)
        .then((y) => { if (y.denetim && !ortamDenetimleri[o.id]) { ortamDenetimleri[o.id] = y.denetim; if (diyalog.isConnected) ciz(); } }).catch(() => {});
    };
    const hazirlikBolumu = () => {
      const liste = hesap.calistirilamazlar || [];
      if (!s.hazirlik && !liste.length) return null;
      const toplam = hesap.senaryolar.length + liste.length;
      // Koşacak senaryoların koşuyu durdurmayan uyarıları (sunucu hazırlığı: ortam kaydında ya da satırda "uyarilar"; ör. zorunlu
      // olmayan alanın tablo hücresi boş — alan doldurulmaz).
      const uyarilari = (x) => {
        const k = ortam && Array.isArray(x.ortamlar) ? x.ortamlar.find((o) => o.ortamId === ortam.id) : null;
        return (k && k.hazirlik ? k.hazirlik.uyarilar : x.hazirlik && x.hazirlik.uyarilar) || [];
      };
      const madde = (anahtar) => {
        const n = liste.filter((x) => (x.eksikler || []).includes(anahtar)).length;
        const u = n ? 0 : (hesap.senaryolar || []).filter((x) => uyarilari(x).includes(anahtar)).length;
        const durum = n ? 'eksik' : u ? 'uyari' : 'tamam';
        return h('li', { class: `hazirlik-maddesi ${durum}`, 'data-madde': anahtar },
          h('span', { class: 'hazirlik-simge', 'aria-hidden': 'true' }, n ? '✕' : u ? '!' : '✓'),
          h('span', { class: 'hazirlik-govde' }, h('span', { class: 'hazirlik-basligi' }, h('span', { class: 'gorunmez' }, n ? 'Eksik: ' : u ? 'Uyarı: ' : 'Hazır: '), HAZIRLIK_BASLIKLARI[anahtar]),
            h('small', { class: 'hazirlik-ayrinti' }, n ? `${n} senaryoda eksik`
              : u ? `${u} senaryoda boş tablo hücresi: zorunlu olmayan alan doldurulmayacak (koşu durmaz)` : 'Koşulacak senaryolarda hazır')));
      };
      let ortamSatiri = null;
      if (s.hazirlik && ortam) {
        ortamDenetiminiOku(ortam);
        const d = ortamDenetimleri[ortam.id] || null;
        const denetle = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `Denetle — ortam bağlantısı (${ortam.ad})` }, ikon('ag'), 'Denetle');
        denetle.addEventListener('click', async () => {
          const o = ortam;
          if (!(await canliOnayIste(o))) return;
          denetle.disabled = true;
          try {
            const y = await api('/platform/ortam/denetle', { govde: { projeId: s.hazirlik.projeId, ortamId: o.id, ...canliOnayEki(o.id) } });
            ortamDenetimleri[o.id] = y.denetim;
          } catch (e) { if (!e || e.durum !== 423) bildir(e.message, 'hata'); }
          if (diyalog.isConnected) ciz();
        });
        ortamSatiri = h('li', { class: `hazirlik-maddesi ortam ${d ? (d.erisilebilir ? 'tamam' : 'eksik') : ''}`.trim(), 'data-madde': 'ortam' },
          h('span', { class: 'hazirlik-simge', 'aria-hidden': 'true' }, '⇄'),
          h('span', { class: 'hazirlik-govde' }, h('span', { class: 'hazirlik-basligi' }, HAZIRLIK_BASLIKLARI.ortam), h('small', { class: 'hazirlik-ayrinti' }, ortamDenetimiMetni(d))),
          denetle);
      }
      const sayim = kosuSayimMetni(toplam, liste.length);
      return h('section', { class: 'hazirlik-paneli kosu-hazirligi', 'aria-label': 'Hazırlık kontrolü' },
        h('h3', {}, 'Hazırlık kontrolü'),
        h('ul', { class: 'hazirlik-listesi' }, ['veri', 'gonderme', 'beklenen'].map(madde), ortamSatiri),
        sayim ? h('div', { class: 'not-kutusu uyari calistirilamazlar', role: 'status' },
          h('p', {}, h('strong', {}, sayim)),
          h('ul', { class: 'onay-listesi' }, liste.slice(0, 20).map((x) => h('li', {},
            h('span', { class: 'atlanan-adi' }, x.baslik), h('small', { class: 'soluk' }, x.neden || ''),
            x.id ? h('a', { class: 'kucuk-dugme dugme hayalet', href: `#/senaryolar/duzenle/${encodeURIComponent(x.id)}`, onclick: () => diyalog.close() }, 'Düzelt') : null)),
          liste.length > 20 ? h('li', {}, `… ve ${liste.length - 20} senaryo daha`) : null)) : null);
    };
    const ciz = () => {
      if (secimli) hesap = s.hesapla(ortam);
      const riskli = riskliOrtamMi(ortam);
      const adet = hesap.senaryolar.length;
      // Senaryo yoksa düğme "0 senaryoyu başlat" demez: kapalıdır ve nedeni hemen altında yazar (aria-describedby).
      yerlestir(baslat, ikon('oynat'), adet ? s.dugme || `${adet} senaryoyu başlat` : 'Başlat');
      baslat.disabled = adet === 0 || Boolean(tahmin && tahmin.asanlar.length);
      const nedenler = [
        hesap.haricSayisi ? `${hesap.haricSayisi} senaryo toplu koşuya dahil değil` : '',
        hesap.tanimsizSayisi ? `${hesap.tanimsizSayisi} senaryo bu ortamda tanımlı değil` : '',
        hesap.atlananlar && hesap.atlananlar.length ? `${hesap.atlananlar.length} senaryo bu ortamda atlanıyor` : ''
      ].filter(Boolean);
      if (adet) { baslat.removeAttribute('aria-describedby'); baslat.removeAttribute('title'); } else {
        baslat.setAttribute('aria-describedby', bosNedenId);
        baslat.title = 'Çalıştırılacak senaryo yok';
      }
      yerlestir(degisken,
        adet
          ? h('p', { class: 'soluk' }, `${adet} senaryo ${ortam.ad} ortamında ${(typeof s.kosuBicimi === 'function' ? s.kosuBicimi(ortam) : s.kosuBicimi) || (s.esZamanli ? 'aynı anda' : 'sırayla')} çalıştırılacak.`)
          : h('div', { class: 'not-kutusu kosu-bos-nedeni', id: bosNedenId, role: 'status' },
            h('strong', {}, 'Başlatılamaz: '), `${ortam.ad} ortamında çalıştırılacak senaryo yok`,
            nedenler.length ? ` (${nedenler.join(', ')}).` : '.',
            ' Önce senaryo ekleyin ya da Senaryolar tablosundaki "Toplu koşuya dahil" anahtarını açın; başka bir ortam da seçebilirsiniz.'),
        // Etkin koşu hızı ve kaynağı ("TEST ortamı: en çok 2 senaryo aynı anda, 500 ms bekleme (ortam ayarı)").
        adet && typeof s.hizOzeti === 'function' ? h('p', { class: 'soluk kucuk kosu-hizi-ozeti' }, s.hizOzeti(ortam)) : null,
        h('dl', { class: 'onay-ozeti' },
          h('div', {}, h('dt', {}, 'Senaryo'), h('dd', {}, String(adet))),
          h('div', {}, h('dt', {}, 'Ortam'), h('dd', { class: riskli ? 'canli' : null }, ortam.ad)),
          h('div', {}, h('dt', {}, 'Kapsam'), h('dd', { title: s.turEtiketi || turMetni }, s.turEtiketi || (s.tur === 'tam' ? s.kapsam || 'Genel' : 'Kısmi')))),
        adet ? h('ul', { class: 'onay-listesi', 'aria-label': 'Çalıştırılacak senaryolar' },
          hesap.senaryolar.slice(0, 40).map((x) => h('li', {}, x.baslik)),
          adet > 40 ? h('li', {}, `… ve ${adet - 40} senaryo daha`) : null) : null,
        hazirlikBolumu(),
        hesap.haricSayisi ? h('p', { class: 'soluk kucuk' }, `${hesap.haricSayisi} senaryo ${secimli ? `${ortam.ad} ortamında ` : ''}koşu listesinde olmadığı (toplu koşuya dahil değil) için dahil edilmedi.`) : null,
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
        riskli ? h('div', { class: 'not-kutusu hata', role: 'alert' }, h('strong', {}, `Dikkat: ${ortam.ad} ortamı. `), 'Bu bir CANLI ortam; başlatınca ayrıca onay sorulur, istekler gerçek sisteme gider.') : null,
        riskBelirtilmemisMi(ortam) ? riskBelirtinNotu() : null);
    };
    const diyalog = h('dialog', { class: 'onay-diyalogu', 'aria-labelledby': 'kosu-onay-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'kosu-onay-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('oynat')), s.baslik),
        ortamSecimi ? h('div', { class: 'alan kosu-ortam-secimi' }, h('label', { for: ortamSecimi.id }, 'Ortam'), ortamSecimi) : null,
        veriKipiSecimi ? veriBolumu : null,
        surumBolumu,
        degisken,
        gorunurBolumu),
      h('div', { class: 'diyalog-alt' }, vazgec, baslat));
    ortamSecimi?.addEventListener('change', () => {
      ortam = s.ortamlar.find((o) => o.id === ortamSecimi.value) || ortam; tahmin = null; ciz(); veriCiz(); tahminAl();
      // Kullanıcı sürümü elle değiştirmediyse seçilen ortamın sürümü ön değer olur.
      if (surumGirdisi && !surumDegisti) surumGirdisi.value = ortam.uygulamaSurumu || '';
    });
    ciz();
    tahminAl();
    let sonuc = false;
    baslat.addEventListener('click', () => { sonuc = true; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', async () => {
      diyalog.remove();
      // CANLI ortamda "Başlat"tan sonra TEK TİP CANLI onay penceresi (onaylanırsa sunucuya bir kez canliOnay: true gider).
      if (sonuc && ortam) sonuc = await canliOnayIste(ortam);
      const gorunur = Boolean(sonuc && gorunurKutusu && gorunurKutusu.checked);
      sonGorunurSecimi = sonuc && gorunurKutusu ? { deger: gorunur, zaman: Date.now() } : null;
      coz(secimli ? (sonuc ? { ortam, senaryolar: hesap.senaryolar, veriKipi, gorunur, ...(surumGirdisi ? { uygulamaSurumu: surumGirdisi.value.trim() } : {}) } : null) : sonuc);
    });
    document.body.append(diyalog);
    diyalog.showModal();
    (ortamSecimi || baslat).focus();
  });
}

/**
 * Son onaylanan koşu penceresindeki "Tarayıcı penceresinde izle" seçimi. kosuOnayi'nın Promise<boolean> biçimini kullanan çağıranlar
 * (sabit ortam) seçimi ayrıca taşımaz: hemen ardından gelen kosuBaslat bunu bir kez alır (30 sn içinde; sonra unutulur).
 * @type {{ deger: boolean; zaman: number } | null}
 */
let sonGorunurSecimi = null;
const gorunurSeciminiAl = () => {
  const s = sonGorunurSecimi;
  sonGorunurSecimi = null;
  return Boolean(s && s.deger && Date.now() - s.zaman < 30_000);
};

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
    // değişince çağrılacak yenileyiciyi alır. s.nedenler() verilirse (s.hazir yerine) düğme neden varken kapalıdır ve nedenler
    // düğmelerin altında "Bölüme git" bağlantılarıyla yazar (ortak.js > kapaliDugmeNedenleri).
    const nedenler = typeof s.nedenler === 'function' ? kapaliDugmeNedenleri(tamam) : null;
    const diyalog = h('dialog', { class: `onay-diyalogu ${s.tehlikeli ? 'tehlikeli' : ''} ${s.ek ? 'genis-onay' : ''}`.trim(), 'aria-labelledby': 'onay-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'onay-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon(s.ikonAd || (s.tehlikeli ? 'cop' : 'uyari'))), s.baslik),
        h('p', { class: 'soluk' }, s.metin),
        s.liste && s.liste.length ? h('ul', { class: 'onay-listesi' }, s.liste.slice(0, 30).map((x) => h('li', {}, x)),
          s.liste.length > 30 ? h('li', {}, `… ve ${s.liste.length - 30} daha`) : null) : null,
        s.ek || null),
      h('div', { class: `diyalog-alt${nedenler ? ' nedenli' : ''}` }, vazgec, tamam, nedenler ? nedenler.alan : null));
    if (nedenler) {
      const guncelle = () => nedenler.guncelle(s.nedenler());
      if (typeof s.baglan === 'function') s.baglan(guncelle);
      guncelle();
    } else if (typeof s.hazir === 'function') {
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
 * veriKipi: koşu anı ezmesi ('tek' | 'tumu'; 'senaryo' / yok = senaryodaki çalıştırma biçimi). tekrar: başarısızları tekrar
 * çalıştırma ({ kaynakKosuId, model: 'kosudaki' | 'guncel', veri: 'guncel' | 'kosudaki' }; sunucu o koşudaki satırları kurar).
 * @param {{ projeId: string; ortam: { id: string; ad: string }; senaryolar: Array<{ id: string; baslik: string; ekranAdi?: string | null }>; tur: 'tam' | 'tekil'; kapsam?: string; esZamanli: boolean; baslik: string; tekBasina?: boolean;
 *   veriKipi?: string; tekrar?: { kaynakKosuId: string; model?: string; veri?: string }; uygulamaSurumu?: string }} s
 *   uygulamaSurumu: koşu diyaloğunda girilen uygulama sürümü (her senaryo isteğine eklenir; boşsa ortamınki).
 */
export function kosuBaslat(s) {
  const yeniler = s.senaryolar.filter((x) => !kosuDurumu(x.id));
  if (!yeniler.length) { bildir('Seçilen senaryolar zaten çalışıyor.', 'hata'); return false; }
  const tekMi = yeniler.length === 1 && s.esZamanli && s.tur === 'tekil';
  // Görünür koşu: açık seçim (s.gorunur) ya da az önce onaylanan koşu penceresindeki seçim (gorunurSeciminiAl; bir kez).
  const gorunur = gorunurSeciminiAl() || s.gorunur === true;
  const veriEki = { ...(gorunur ? { gorunur: true } : {}), ...(s.veriKipi && s.veriKipi !== 'senaryo' ? { veriKipi: s.veriKipi } : {}), ...(s.tekrar ? { tekrar: s.tekrar } : {}),
    // Koşu diyaloğunda girilen uygulama sürümü (boşsa sunucu ortam ayarındakini kullanır; PDF rapor A4).
    ...(s.uygulamaSurumu ? { uygulamaSurumu: s.uygulamaSurumu } : {}) };
  if (kosuSuruyorMu()) {
    if (!tekMi || durum.oturum.ortam.id !== s.ortam.id) { bildir('Önce sürmekte olan koşunun bitmesini bekleyin (ya da durdurun).', 'hata'); return false; }
    const satir = satirOlustur(yeniler[0]);
    durum.oturum.satirlar.push(satir);
    durum.oturum.bitti = false;
    durum.secili = satir.senaryoId;
    durum.kucuk = false;
    birTaneCalistir(durum.oturum, satir, { kosuTuru: 'tekil', kosuKimligi: `platform-${kimlikUret()}`, ...(s.tekBasina ? { tekBasina: true } : {}), ...canliOnayEki(s.ortam.id), ...veriEki }).then(() => oturumuBitirGerekirse(durum.oturum));
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
  const ek = { kosuTuru: s.tur, kosuKimligi: oturum.kosuKimligi, ...(s.tur === 'tam' ? { kosuKapsami: oturum.kapsam } : {}), ...(tekMi && s.tekBasina ? { tekBasina: true } : {}), ...veriEki };
  yay('basladi');
  if (s.esZamanli) {
    Promise.all(oturum.satirlar.map((x) => birTaneCalistir(oturum, x, ek))).then(() => oturumuBitirGerekirse(oturum), () => oturumuBitirGerekirse(oturum));
  } else {
    // Koşu hızı (Ayarlar > Koşu > Ekran senaryoları; ortamın "Koşu hızı" ezer): en çok N senaryo aynı anda (N = 1: sırayla).
    // Sunucu aynı sınırı ve "senaryolar arası bekleme"yi kendisi de uygular (dosya yuvası); burada panel sırası doğru görünsün diye.
    (async () => {
      oturum.hiz = await kullaniciAyarlari().then((g) => etkinKosuHizi(g, s.ortam)).catch(() => null);
      yay();
      const n = oturum.hiz ? oturum.hiz.degerler.ekranEszamanli : 1;
      const kuyruk = [...oturum.satirlar];
      const isci = async () => {
        while (kuyruk.length) {
          if (oturum.iptal) return;
          const x = kuyruk.shift();
          if (x.durum !== 'sirada') continue;
          await birTaneCalistir(oturum, x, ek);
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(n, kuyruk.length)) }, isci));
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
  // Hazırlığı eksik (koşuya alınmadı; senaryolar/hazirlik.mjs): "Çalıştırılamadı" + gerekçe cümlesi.
  else if (yanit.durum === 'calistirilamadi') { satir.durum = 'hata'; satir.sonuc = { ...yanit, mesaj: yanit.hataMesaji || yanit.mesaj }; }
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
/** Seçili çalışan koşunun canlı görüntü kutusu (canli-akis.js; yeniden çizimde korunur). @type {{ kosuId: string; kutu: ReturnType<typeof canliGoruntu> } | null} */
let canliKutu = null;

function canliIzlemeyiDurdur() {
  if (canliZamanlayici) clearInterval(canliZamanlayici);
  canliZamanlayici = null;
  canliYukle = null;
  canliKutu?.kutu.durdur();
  canliKutu = null;
}

function durumSimgesi(d) {
  const g = KOSU_DURUMLARI[d] || KOSU_DURUMLARI.hata;
  if (d === 'calisiyor') return h('span', { class: 'donen-halka', role: 'img', 'aria-label': g.etiket });
  return h('span', { class: `durum-simgesi ${g.sinif}`, role: 'img', 'aria-label': g.etiket }, ikon(g.ikon));
}

/** Veri koşuları (aynı senaryonun her satırı ayrı test): "3 veri koşusu, 1 kalan". @param {any} sonuc */
function veriKosusuOzeti(sonuc) {
  const v = sonuc && Array.isArray(sonuc.veriKosulari) ? sonuc.veriKosulari : null;
  if (!v || v.length < 2) return '';
  const kalan = v.filter((x) => x.durum === 'basarisiz').length;
  return `${v.length} veri koşusu${kalan ? `, ${kalan} başarısız` : ''}`;
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
        h('span', { class: 'ad' }, h('span', { title: x.baslik }, x.baslik), h('small', {}, [x.ekranAdi, (KOSU_DURUMLARI[x.durum] || {}).etiket, veriKosusuOzeti(x.sonuc)].filter(Boolean).join(' · '),
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
  // Koşu sürerken panel yeniden çizilir: senaryo listesinin kaydırma konumu korunur (kullanıcı kaydırabilsin).
  const listeKaydirma = panelEl.querySelector('.kosu-listesi')?.scrollTop ?? 0;
  queueMicrotask(() => { const l = panelEl?.querySelector('.kosu-listesi'); if (l) l.scrollTop = listeKaydirma; });
  yerlestir(panelEl,
    h('div', { class: 'panel-baslik' },
      h('div', { class: 'satir' },
        h('h2', {}, oturum.bitti ? ikon('onay') : h('span', { class: 'donen-halka', 'aria-hidden': 'true' }), oturum.bitti ? 'Koşu bitti' : 'Koşu sürüyor'),
        h('div', { class: 'dugmeler' }, tumunuDurdurDugmesi, kucult, oturum.bitti ? kapat : null)),
      h('div', { class: 'alt' }, h('span', {}, oturum.baslik), h('span', {}, `${oturum.ortam.ad} · ${oturum.tur === 'tam' ? `tam · ${oturum.kapsam}` : 'kısmi'} · ${oturum.esZamanli ? 'aynı anda'
        : oturum.hiz && oturum.hiz.degerler.ekranEszamanli > 1 ? `en çok ${oturum.hiz.degerler.ekranEszamanli} aynı anda` : 'sırayla'}`)),
      // Etkin koşu hızı ve kaynağı ("TEST ortamı: en çok 2 senaryo aynı anda, 300 ms senaryolar arası bekleme (ortam ayarı)").
      oturum.hiz ? h('p', { class: 'soluk kucuk kosu-hizi-ozeti' }, kosuHiziOzeti(oturum.hiz, 'ekran')) : null,
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
    rozet(g.etiket, g.sinif === 'sirada' ? '' : g.sinif)));
  if (satir.durum === 'calisiyor') {
    if (satir.kodIstegi) alan.append(kodFormu(satir));
    // Sürekli kare akışı (canli-akis.js): aynı koşu için kutu yeniden çizimlerde KORUNUR (bağlantı kesilmez, titreme yok); seçili
    // koşu değişince / panel küçülünce ya da kapanınca durdurulur (izleyici kalmazsa test sürecindeki screencast da durur).
    if (!canliKutu || canliKutu.kosuId !== satir.kosuId) {
      canliKutu?.kutu.durdur();
      const kosuId = satir.kosuId;
      canliKutu = {
        kosuId,
        kutu: canliGoruntu({
          akisAdresi: `/canli-akis?kosuId=${encodeURIComponent(kosuId)}`, tamSayfaAdresi: `/canli-tam-sayfa?kosuId=${encodeURIComponent(kosuId)}`, etiket: `Canlı ekran görüntüsü: ${satir.baslik}`,
          yedekKareAl: () => kosuYedekKaresi(kosuId),
          tarayiciyiGoster: async () => {
            const y = await api('/tarayiciyi-goster', { govde: { kosuId } }).catch((e) => ({ basarili: false, mesaj: e.message }));
            return { basarili: Boolean(y.basarili), mesaj: String(y.mesaj || '') };
          }
        })
      };
    }
    alan.append(canliKutu.kutu.el);
    const adimKap = h('div', {}, adimListesi(satir.canliAdimlar || [], true));
    alan.append(adimKap);
    const adimlariYukle = async () => {
      try {
        const y = await fetch(`/adim-durumu?kosuId=${encodeURIComponent(satir.kosuId)}`, { headers: { 'X-Test-Sunucu-Token': TOKEN }, cache: 'no-store' }).then((r) => r.json());
        if (Array.isArray(y.adimlar)) { satir.canliAdimlar = y.adimlar; if (adimKap.isConnected) yerlestir(adimKap, adimListesi(y.adimlar, true)); }
      } catch { /* bir sonraki tikte yeniden denenir */ }
    };
    // Adım listesi aralıkla yoklanır (görüntü akıştan gelir).
    canliYukle = () => { void adimlariYukle(); };
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
