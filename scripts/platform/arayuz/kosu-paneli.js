// Senaryo koşuları (genel): onay penceresi, koşu yöneticisi ve canlı koşu paneli.
// - Koşular senaryo KİMLİĞİYLE (UUID) başlatılır: POST /platform/senaryolar/calistir — sunucu kimliği
//   güncel test dosyası + başlığına çözer ve koşu bitene kadar yanıtı bekletir.
// - Her tekil koşunun kendi kosuId'si vardır: satır bazlı "Durdur" (/durdur) ve canlı ekran görüntüsü
//   (/canli) bununla hedeflenir; aynı başlık başka dosyada olsa bile karışmaz.
// - "Koşuyu başlat" SIRAYLA, "Seçilenleri çalıştır" / tek ▷ AYNI ANDA çalışır; birlikte başlatılanlar
//   ortak bir koşu kimliği taşır (tam koşu → kartlar/trend; kısmi → koşu geçmişinde tek "tekil" satır).
// - Durum modül düzeyindedir: tablolar yeniden çizilse ya da sayfalar arasında gezinilse bile çalışan
//   satırlar spinner/Durdur ile kalır; panel body'ye eklenir ve kalıcıdır.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, yerlestir, bildir, h, ikon, rozet, TOKEN } from './ortak.js';

const medyaUrl = (id) => `/platform/medya/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}`;
const kimlikUret = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const CANLI_ARALIK_MS = 1200;

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

/** Ortam "gerçek işlem" riski taşıyor mu? (varsayılan test ortamı değilse ya da adı canlı/üretim çağrıştırıyorsa) */
export const riskliOrtamMi = (ortam) => Boolean(ortam) && (!ortam.varsayilan || /canl|prod|uretim|üretim/i.test(String(ortam.ad || '')));

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

/**
 * Sayfa içi onay: kaç senaryo, hangi ortamda, nasıl (sırayla/aynı anda), koşu türü/kapsamı; riskli
 * ortamda uyarı. Promise<boolean> döner.
 * @param {{ baslik: string; senaryolar: Array<{ baslik: string }>; ortam: { ad: string; varsayilan?: boolean }; tur: 'tam' | 'tekil'; kapsam?: string; esZamanli?: boolean; not?: string; haricSayisi?: number; dugme?: string }} s
 */
export function kosuOnayi(s) {
  return new Promise((coz) => {
    const riskli = riskliOrtamMi(s.ortam);
    const baslat = h('button', { type: 'button', class: 'birincil' }, ikon('oynat'), s.dugme || `${s.senaryolar.length} senaryoyu başlat`);
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const turMetni = s.tur === 'tam' ? `Tam koşu · ${s.kapsam || 'Genel'}` : 'Kısmi (tekil)';
    const diyalog = h('dialog', { class: 'onay-diyalogu', 'aria-labelledby': 'kosu-onay-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'kosu-onay-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('oynat')), s.baslik),
        h('p', { class: 'soluk' }, `${s.senaryolar.length} senaryo ${s.ortam.ad} ortamında ${s.esZamanli ? 'aynı anda' : 'sırayla'} çalıştırılacak.`),
        h('dl', { class: 'onay-ozeti' },
          h('div', {}, h('dt', {}, 'Senaryo'), h('dd', {}, String(s.senaryolar.length))),
          h('div', {}, h('dt', {}, 'Ortam'), h('dd', { class: riskli ? 'canli' : null }, s.ortam.ad)),
          h('div', {}, h('dt', {}, 'Kapsam'), h('dd', { title: turMetni }, s.tur === 'tam' ? s.kapsam || 'Genel' : 'Kısmi'))),
        h('ul', { class: 'onay-listesi', 'aria-label': 'Çalıştırılacak senaryolar' },
          s.senaryolar.slice(0, 40).map((x) => h('li', {}, x.baslik)),
          s.senaryolar.length > 40 ? h('li', {}, `… ve ${s.senaryolar.length - 40} senaryo daha`) : null),
        s.haricSayisi ? h('p', { class: 'soluk kucuk' }, `${s.haricSayisi} senaryo koşu listesinde olmadığı (Koşuda kapalı) için dahil edilmedi.`) : null,
        h('p', { class: 'soluk kucuk' }, s.not || (s.tur === 'tam'
          ? 'Tam koşu olarak kaydedilir; bitince Sonuçlar kartları ve trendi güncellenir.'
          : 'Kısmi koşu olarak kaydedilir; kartları ve trendi değiştirmez, koşu geçmişinde "tekil" görünür.')),
        riskli ? h('div', { class: 'not-kutusu hata', role: 'alert' }, h('strong', {}, `Dikkat: ${s.ortam.ad} ortamı. `), 'Bu ortam varsayılan test ortamı değil; testler gerçek işlem oluşturabilir.') : null),
      h('div', { class: 'diyalog-alt' }, vazgec, baslat));
    let sonuc = false;
    baslat.addEventListener('click', () => { sonuc = true; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    baslat.focus();
  });
}

/**
 * Genel onay (silme vb.): Promise<boolean>.
 * @param {{ baslik: string; metin: string; liste?: string[]; dugme: string; tehlikeli?: boolean; ikonAd?: string }} s
 */
export function onayIste(s) {
  return new Promise((coz) => {
    const tamam = h('button', { type: 'button', class: s.tehlikeli ? 'tehlike onay-bekliyor' : 'birincil' }, s.tehlikeli ? ikon('cop') : null, s.dugme);
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const diyalog = h('dialog', { class: `onay-diyalogu ${s.tehlikeli ? 'tehlikeli' : ''}`, 'aria-labelledby': 'onay-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'onay-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon(s.ikonAd || (s.tehlikeli ? 'cop' : 'uyari'))), s.baslik),
        h('p', { class: 'soluk' }, s.metin),
        s.liste && s.liste.length ? h('ul', { class: 'onay-listesi' }, s.liste.slice(0, 30).map((x) => h('li', {}, x)),
          s.liste.length > 30 ? h('li', {}, `… ve ${s.liste.length - 30} daha`) : null) : null),
      h('div', { class: 'diyalog-alt' }, vazgec, tamam));
    let sonuc = false;
    tamam.addEventListener('click', () => { sonuc = true; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    vazgec.focus();
  });
}

// ---------------------------------------------------------------------------------------
// Koşu yöneticisi
// ---------------------------------------------------------------------------------------

/**
 * Koşuları başlatır. senaryolar: [{ id, baslik, ekranAdi }]. Zaten çalışan/sıradaki senaryolar atlanır.
 * Sürmekte olan bir toplu koşu varken yeni bir TOPLU koşu başlatılmaz; tek senaryo (▷) ise mevcut
 * panele eklenip hemen çalışır.
 * @param {{ projeId: string; ortam: { id: string; ad: string }; senaryolar: Array<{ id: string; baslik: string; ekranAdi?: string | null }>; tur: 'tam' | 'tekil'; kapsam?: string; esZamanli: boolean; baslik: string }} s
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
    birTaneCalistir(durum.oturum, satir, { kosuTuru: 'tekil', kosuKimligi: `platform-${kimlikUret()}` }).then(() => oturumuBitirGerekirse(durum.oturum));
    yay();
    return true;
  }
  const oturum = {
    baslik: s.baslik, tur: s.tur, kapsam: s.kapsam || 'Genel', esZamanli: s.esZamanli, ortam: s.ortam, projeId: s.projeId,
    kosuKimligi: `platform-${kimlikUret()}`, satirlar: yeniler.map(satirOlustur), iptal: false, bitti: false, baslangic: Date.now()
  };
  durum.oturum = oturum;
  durum.secili = oturum.satirlar[0].senaryoId;
  durum.kucuk = false;
  const ek = { kosuTuru: s.tur, kosuKimligi: oturum.kosuKimligi, ...(s.tur === 'tam' ? { kosuKapsami: oturum.kapsam } : {}) };
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
      govde: { projeId: oturum.projeId, ortamId: oturum.ortam.id, senaryoId: satir.senaryoId, kosuId: satir.kosuId, ...ek }
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
        h('span', { class: 'ad' }, h('span', { title: x.baslik }, x.baslik), h('small', {}, [x.ekranAdi, (KOSU_DURUMLARI[x.durum] || {}).etiket].filter(Boolean).join(' · '))),
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

function izlemeAlani(oturum) {
  const satir = oturum.satirlar.find((x) => x.senaryoId === durum.secili) || oturum.satirlar[0];
  const alan = h('div', { class: 'kosu-izleme' });
  if (!satir) return alan;
  const g = KOSU_DURUMLARI[satir.durum] || KOSU_DURUMLARI.hata;
  alan.append(h('div', { class: 'izleme-basligi' }, h('span', { title: satir.baslik }, satir.baslik),
    satir.durum === 'calisiyor' ? h('span', { class: 'canli-rozeti' }, 'CANLI') : rozet(g.etiket, g.sinif === 'sirada' ? '' : g.sinif)));
  if (satir.durum === 'calisiyor') {
    const img = h('img', { alt: `Canlı ekran görüntüsü: ${satir.baslik}` });
    const bos = h('div', { class: 'medya-bos' }, h('span', { class: 'donen-halka', 'aria-hidden': 'true' }), 'Canlı görüntü bekleniyor…');
    const kap = h('div', { class: 'goruntuleyici' }, h('div', { class: 'tarayici-cubugu', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {}), h('span', {}, 'canlı')), bos);
    alan.append(kap);
    // Önceki kare yeni çizimde de gösterilir (yenileme sırasında titreme olmasın).
    if (sonCanliKare && sonCanliKare.kosuId === satir.kosuId) { img.src = sonCanliKare.src; bos.replaceWith(img); }
    canliYukle = () => {
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
  const mesaj = s.hataMesaji || (satir.durum === 'hata' || satir.durum === 'durduruldu' ? s.mesaj : null);
  if (mesaj) alan.append(h('div', { class: `hata-ozeti ${satir.durum === 'durduruldu' ? 'notr' : ''}`.trim() }, h('b', {}, satir.durum === 'durduruldu' ? 'Not: ' : 'Hata: '), String(mesaj).split('\n').find((x) => x.trim()) || String(mesaj)));
  return alan;
}

// Çalışan satırların süre sayacı (panel açıkken saniyede bir).
setInterval(() => { if (durum.oturum && !durum.oturum.bitti && panelEl && !durum.kucuk) {
  for (const li of panelEl.querySelectorAll('.kosu-listesi li')) {
    const x = durum.oturum.satirlar.find((y) => y.senaryoId === li.dataset.senaryo);
    if (x && x.durum === 'calisiyor' && x.baslangic) { const sag = li.querySelector('.sag'); if (sag && sag.firstChild && sag.firstChild.nodeType === 3) sag.firstChild.textContent = sureMetni(Date.now() - x.baslangic); }
  }
} }, 1000);
