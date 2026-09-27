// SERVİS AKIŞI TASARIMI (servis sayfası > Akışlar > bir akış / yeni) — ekranların akış tasarımıyla (akis-tasarimi.js) aynı
// görsel dil ve etkileşim: solda dikey diyagram (Başlangıç → [Oturum] → adımlar → Bitiş), adımlar arasında "+" (kayıtlı
// servis senaryosu seçilerek adım eklenir), kutular sürüklenerek / ↑↓ / Alt+↑↓ ile sıralanır; sağda seçili adımın ayrıntısı
// (servis, senaryo, yanıttan okunacak değerler, "kalırsa devam et") ve Kaydet.
//   · Akış değerleri: adımın "çıktıları" okumalarıdır (${akis:Ad}); "girdileri" senaryonun gövde / başlık / kontrollerinde geçen
//     ${akis:Ad} adlarıdır. Kutular arasındaki okta o noktadan sonraki adımlara taşınan değerler yazar. Girdi önceki adımdan,
//     yoksa adımın servisinin oturum akışından gelir (sunucudaki servisAkisiDenetle ile aynı kural). Değer yalnız SONRAKİ bir
//     adımda okunuyorsa ya da hiç okunmuyorsa kutu, girdisi ve oku kırmızıdır; kaydetme engellenir (sunucu da reddeder).
//   · Oturum akışının değerleri ayrı bir "Oturum (token)" kutusunda görünür; akışın kendisi oturumsa Bitiş kutusu sağladığı
//     değerleri ve ömrünü gösterir.
//   · Renkler: gösterilen koşunun (son koşu, Dene ya da "Son koşular"dan seçilen) adım sonuçları; adım sırası / adı o koşudan
//     sonra değiştiyse o adım renklenmez.
//   · SQL sorgusu adımı ("+ > SQL sorgusu"; tur 'sql'): seçilen veritabanı bağlantısında sorgu, sonuç beklenenle karşılaştırılır;
//     girdileri SQL / beklenen değerlerdeki ${akis:Ad}, çıktıları sonuçtan okunan sütunlar (sql.okumalar).
//   · OPERASYON adımı ("+ > Operasyon"; tur 'operasyon', varsayılan): servisin bir operasyonu; akış yalnız sırayı ve taşınan
//     değerleri tutar (bağlar: alan ← ${akis:Ad}); alan değerleri ve beklenen sonuç akış SENARYOSUNDA (akis-senaryo-formu.js).
//     Girdileri bağlardan, çıktıları yanıttan okumalardan. "Bu akışın senaryoları" sayfanın altında.
// Veri modeli değişmedi (adımlar = { id, ad, servisId, senaryoId, okumalar, hataOlursaDevam? } | { id, ad, tur: 'sql', sql, … }); kayıt var olan
// /platform/servis-akisi/kaydet ucundan (yapısal + anlamsal denetim) geçer. Kullanıcı verisi DOM'a yalnız metin olarak yazılır.
import { alan, api, bildir, degisiklikleriBirak, h, ikon, kayitIzi, kullaniciAyarlari, mesajKutusu, mesgulIken, rozet, tarihMetni, yerlestir } from './ortak.js';
import { onayIste, riskliOrtamMi } from './kosu-paneli.js';
import { gizliAdMi } from './gizli-adlar.mjs';
import { sqlAkisDegerleri, sqlTanimiDogrula } from './sql-adimi.mjs';
import { sqlAdimiFormu, sqlHedefAdi, sqlKaynaklariniAl, sqlOzeti, yeniSqlTanimi } from './sql-adimi-formu.js';
import { bagAdi } from './akis-senaryo-icerigi.mjs';
import { alanSatirlari, semaBirlestir } from './servis-govdesi.mjs';

const q = encodeURIComponent;
const KAYNAK = { xml: 'XML (XPath)', json: 'JSON yolu', baslik: 'Yanıt başlığı' };
const DURUM = { basarili: ['Başarılı', 'basari'], basarisiz: ['Başarısız', 'hata'], hata: ['Hata', 'hata'], atlandi: ['Atlandı', 'durdu'], durduruldu: ['Durduruldu', 'durdu'] };
/** Diyagram renkleri (senaryo-diyagrami.js ile aynı sınıflar). */
const RENK = {
  basarili: { etiket: 'Geçti', sinif: 'basari', ikonAd: 'onay' },
  basarisiz: { etiket: 'Kaldı', sinif: 'hata', ikonAd: 'carpi' },
  hata: { etiket: 'Hata', sinif: 'hata', ikonAd: 'uyari' },
  atlandi: { etiket: 'Atlandı', sinif: 'atlanan', ikonAd: 'eksi' },
  durduruldu: { etiket: 'Durduruldu', sinif: 'durdu', ikonAd: 'eksi' }
};
/** Sunucudaki EN_COK_AKIS_ADIMI ile aynı. */
const EN_COK_ADIM = 30;
const SURUKLEME_TURU = 'application/x-nobetci-servis-adimi';
/** Senaryo metninde ${akis:Ad} (soap-istemcisi.mjs PARAMETRE kalıbının akış kolu). */
const AKIS_KALIBI = /\$\{\s*akis:([A-Za-z_][A-Za-z0-9_-]{0,59})\s*\}/g;
const durumRozeti = (d) => rozet(DURUM[d]?.[0] ?? d, DURUM[d]?.[1] ?? '');
const saniye = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} sn`;
const yeniAdimKimligi = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Senaryonun kullandığı akış değeri adları (gövde, başlık değerleri, kontroller — sunucudaki servisAkisiDenetle ile aynı kaynaklar — ve REST yolu).
 * @param {any} senaryo @returns {string[]}
 */
export function senaryoAkisDegerleri(senaryo) {
  const i = senaryo?.icerik;
  if (!i) return [];
  const metin = [i.govde ?? '', ...Object.values(i.basliklar ?? {}), JSON.stringify(i.kontroller ?? []), i.http?.yol ?? ''].join('\n');
  return [...new Set([...metin.matchAll(AKIS_KALIBI)].map((m) => m[1]))];
}

/**
 * Akış değerlerinin izi: her adımın girdileri (nereden geldiği) ve çıktıları; her bağlantıda (adım n'den önce) taşınan değerler.
 * @param {Array<{ okumalar: Array<{ ad: string; gizli?: boolean }> }>} adimlar
 * @param {(n: number) => string[]} kullanilan adım n'nin senaryosunun kullandığı adlar
 * @param {(n: number) => { akisId: string; baslik: string; adlar: string[] } | null} oturum adım n'nin servisinin oturum akışı
 */
export function degerIzi(adimlar, kullanilan, oturum) {
  /** Ad → okunduğu adım sıraları (0 tabanlı). @type {Map<string, number[]>} */
  const ureten = new Map();
  adimlar.forEach((a, n) => { for (const o of a.okumalar) if (o.ad) ureten.set(o.ad, [...(ureten.get(o.ad) ?? []), n]); });
  const adimBilgisi = adimlar.map((a, n) => {
    const ot = oturum(n);
    const girdiler = kullanilan(n).map((ad) => {
      const once = (ureten.get(ad) ?? []).filter((k) => k < n);
      if (once.length) return { ad, tur: /** @type {const} */ ('adim'), adim: once[once.length - 1] };
      if (ot && ot.adlar.includes(ad)) return { ad, tur: /** @type {const} */ ('oturum'), oturum: ot };
      const sonra = (ureten.get(ad) ?? []).filter((k) => k >= n);
      return sonra.length ? { ad, tur: /** @type {const} */ ('sonra'), adim: sonra[0] } : { ad, tur: /** @type {const} */ ('yok') };
    });
    return { girdiler, ciktilar: a.okumalar.filter((o) => o.ad), hatali: girdiler.some((g) => g.tur === 'sonra' || g.tur === 'yok') };
  });
  // Bağlantı n (adım n'den hemen önce): önceki adımlarda üretilip n ve sonrasında önceki adımdan alınan değerler.
  const tasinan = adimlar.map((_, n) => [...new Set(adimBilgisi.slice(n).flatMap((b) => b.girdiler)
    .filter((g) => g.tur === 'adim' && g.adim < n).map((g) => g.ad))]);
  const eksikler = adimlar.map((_, n) => adimBilgisi[n].girdiler.filter((g) => g.tur === 'sonra' || g.tur === 'yok'));
  return { adimlar: adimBilgisi, tasinan, eksikler };
}

/**
 * Servis akışı tasarımcısı. @param {HTMLElement} kap @param {{ id: string }} proje @param {any} s servis @param {any[]} ortamlar
 * @param {string | null} akisId
 */
export async function servisAkisTasarimi(kap, proje, s, ortamlar, akisId) {
  let ekGizliAdlar = [];
  try { ekGizliAdlar = (await api('/platform/maskeleme')).ekAdlar; } catch { /* çekirdek liste yeter */ }
  const gizliMi = (ad) => gizliAdMi(ad, ekGizliAdlar);
  /** SQL adımlarının seçebileceği veritabanı bağlantıları (Ayarlar > Entegrasyonlar). */
  const sqlKaynaklari = await sqlKaynaklariniAl(proje.id);
  /** Adımın okumaları (SQL adımında sonuçtan okunan sütunlar). */
  const adimOkumalari = (x) => (x.tur === 'sql' ? (x.sql?.okumalar ?? []) : x.okumalar);
  const [{ servisler }, { akislar: tumAkislar }, kayit, akisSenaryolari] = await Promise.all([
    api(`/platform/servisler?projeId=${q(proje.id)}`),
    api(`/platform/servis-akislari?projeId=${q(proje.id)}`).catch(() => ({ akislar: [] })),
    akisId ? api(`/platform/servis-akisi?projeId=${q(proje.id)}&id=${q(akisId)}`) : Promise.resolve(null),
    akisId ? api(`/platform/servis-akisi/senaryolar?projeId=${q(proje.id)}&akisId=${q(akisId)}`).then((y) => y.senaryolar).catch(() => []) : Promise.resolve([])
  ]);
  /** Servis → senaryolar (gerektikçe alınır). @type {Map<string, any[]>} */
  const senaryolar = new Map();
  const senaryolariAl = async (servisId) => {
    if (!servisId) return [];
    if (!senaryolar.has(servisId)) {
      try { senaryolar.set(servisId, (await api(`/platform/servis?projeId=${q(proje.id)}&id=${q(servisId)}`)).senaryolar); } catch { senaryolar.set(servisId, []); }
    }
    return senaryolar.get(servisId);
  };
  /** Servisin operasyon adları (akışın operasyon adımı). */
  const operasyonlari = (servisId) => (servisler.find((x) => x.id === servisId)?.ayarlar?.operasyonlar ?? []).map((o) => o.ad);
  /** Yeni operasyon adımı (servisin ilk operasyonu). */
  const yeniOperasyonAdimi = (servisId, ad) => ({ ad: ad ?? operasyonlari(servisId)[0] ?? 'Operasyon', tur: 'operasyon', servisId, operasyon: operasyonlari(servisId)[0] ?? '', okumalar: [], baglar: {} });
  const a = kayit?.akis ?? { baslik: '', tur: 'akis', kapsam: 'test', icerik: { adimlar: [yeniOperasyonAdimi(s.id)] } };
  /** Düzenleme kopyası (kayıtlı akış aynen açılır; kimliği olmayan adıma kimlik verilir). */
  const is = {
    baslik: a.baslik, tur: a.tur, kapsam: a.kapsam, omur: a.icerik.omurSaniye ?? 3600, yenileme: a.icerik.tokenYenileme ?? 'suresiDolunca',
    adimlar: JSON.parse(JSON.stringify(a.icerik.adimlar)).map((x) => ({ ...x, id: x.id || yeniAdimKimligi(), okumalar: x.okumalar ?? [] }))
  };
  await Promise.all([...new Set(is.adimlar.map((x) => x.servisId))].map(senaryolariAl));
  const adres = `#/servisler/s/${q(s.id)}/akislar`;
  const servisAdi = (id) => servisler.find((x) => x.id === id)?.ad ?? '?';
  const senaryoBul = (x) => (senaryolar.get(x.servisId) || []).find((sn) => sn.id === x.senaryoId);
  const oturumAkislari = new Map(tumAkislar.filter((x) => x.tur === 'oturum').map((x) => [x.id, x]));
  const oturumBul = (servisId) => {
    const id = servisler.find((x) => x.id === servisId)?.ayarlar?.oturumAkisi;
    const o = id ? oturumAkislari.get(id) : undefined;
    return o ? { akisId: o.id, baslik: o.baslik, adlar: (o.icerik?.adimlar ?? []).flatMap((y) => [...(y.okumalar ?? []), ...(y.sql?.okumalar ?? [])].map((k) => k.ad)) } : null;
  };

  let secili = is.adimlar.length ? 0 : -1;
  let acikMenu = -1;
  let menuServisId = s.id;
  /** Diyagramda gösterilen koşu: { adimlar, kaynak } (renkler). */
  let gosterilen = null;
  const mesaj = mesajKutusu();
  const duyuru = h('p', { class: 'gorunmez', 'aria-live': 'polite' });
  const durumSatiri = h('span', { class: 'cok-soluk kucuk', 'aria-live': 'polite' });
  const akisEl = h('ol', { class: 'tasarim-akisi servis-akis-diyagrami', 'aria-label': 'Servis akışı diyagramı' });
  const ustEl = h('div', { class: 'diyagram-ust' });
  const hataKutusu = h('div', {});
  const ayrintiKap = h('div', {});
  const sonucKap = h('div', { 'aria-live': 'polite' });
  const kosuKap = h('div', {});

  const iz = () => degerIzi(is.adimlar.map((x) => ({ okumalar: adimOkumalari(x) })),
    (n) => (is.adimlar[n].tur === 'sql' ? sqlAkisDegerleri(is.adimlar[n].sql)
      : is.adimlar[n].tur === 'operasyon' ? [...new Set(Object.values(is.adimlar[n].baglar ?? {}).map(bagAdi).filter(Boolean))]
        : senaryoAkisDegerleri(senaryoBul(is.adimlar[n]))),
    (n) => (is.adimlar[n].tur === 'sql' ? null : oturumBul(is.adimlar[n].servisId)));
  const degisti = () => { kayitIzi.kirli = true; durumSatiri.textContent = 'Kaydedilmemiş değişiklikler var.'; };

  // ---- Genel ayarlar ----------------------------------------------------------------------------------------------------------
  const baslik = h('input', { type: 'text', value: is.baslik, maxlength: '200', autocomplete: 'off', placeholder: 'ör. Giriş → Sorgu' });
  baslik.addEventListener('input', () => { is.baslik = baslik.value; degisti(); });
  const tur = h('select', {}, h('option', { value: 'akis', selected: is.tur === 'akis' }, 'Akış'), h('option', { value: 'oturum', selected: is.tur === 'oturum' }, 'Oturum (servise atanır; token sağlar)'));
  const omur = h('input', { type: 'number', min: '30', max: '86400', step: '1', value: String(is.omur), 'aria-label': 'Oturum ömrü (saniye)' });
  const omurAlani = alan('Token ömrü (sn)', omur, { yardim: 'Oturum değerleri bu süre boyunca yeniden kullanılır; dolunca yeniden alınır.' });
  omur.addEventListener('input', () => { is.omur = Number(omur.value); ciz(); });
  const yenileme = h('select', {},
    h('option', { value: 'suresiDolunca', selected: is.yenileme === 'suresiDolunca' }, 'Süresi dolunca yeniden al (koşular arasında paylaşılır)'),
    h('option', { value: 'herIstekte', selected: is.yenileme === 'herIstekte' }, 'Her istekte yeniden al'));
  const yenilemeAlani = alan('Token', yenileme, { yardim: 'Sunucu 401 / 403 dönerse token her iki seçenekte de bir kez yenilenir.' });
  const oturumAlanlariniGoster = () => { yenilemeAlani.hidden = is.tur !== 'oturum'; omurAlani.hidden = is.tur !== 'oturum' || is.yenileme === 'herIstekte'; };
  yenileme.addEventListener('change', () => { is.yenileme = yenileme.value; oturumAlanlariniGoster(); ciz(); });
  tur.addEventListener('change', () => { is.tur = tur.value; oturumAlanlariniGoster(); ciz(); });
  oturumAlanlariniGoster();
  const kapsam = h('select', {}, [['test', 'TEST'], ['canli', 'CANLI'], ['ikisi', 'TEST + CANLI']].map(([d, m]) => h('option', { value: d, selected: is.kapsam === d }, m)));
  kapsam.addEventListener('change', () => { is.kapsam = kapsam.value; });

  // ---- Adım işlemleri ---------------------------------------------------------------------------------------------------------
  const odakla = (secici) => { const el = akisEl.querySelector(secici); if (el instanceof HTMLElement) el.focus(); };
  function sec(n, odak = false) {
    secili = n;
    ciz();
    ayrintiCiz();
    if (odak) odakla(`[data-adim="${n}"]`);
  }
  function adimEkle(konum, adim) {
    if (is.adimlar.length >= EN_COK_ADIM) { bildir(`Bir akışta en çok ${EN_COK_ADIM} adım olabilir.`, 'hata'); return; }
    is.adimlar.splice(konum, 0, { id: yeniAdimKimligi(), okumalar: [], ...adim });
    acikMenu = -1;
    degisti();
    duyuru.textContent = `${konum + 1}. adım eklendi.`;
    sec(konum, true);
  }
  function tasi(n, hedef, odakSecici) {
    if (hedef < 0 || hedef >= is.adimlar.length || hedef === n) return;
    const [b] = is.adimlar.splice(n, 1);
    is.adimlar.splice(hedef, 0, b);
    if (secili === n) secili = hedef;
    else if (secili > n && secili <= hedef) secili--;
    else if (secili < n && secili >= hedef) secili++;
    degisti();
    ciz();
    ayrintiCiz();
    const uyari = iz().eksikler[hedef].filter((g) => g.tur === 'sonra');
    duyuru.textContent = `“${b.ad}” ${hedef + 1}. sıraya taşındı.${uyari.length ? ` Uyarı: ${uyari.map((g) => g.ad).join(', ')} bu adımdan sonra okunuyor.` : ''}`;
    // Düğmeyle taşındıysa odak aynı düğmede kalır (uçta devre dışıysa kutuya geçer).
    const dugme = odakSecici ? akisEl.querySelector(`[data-adim="${hedef}"] ${odakSecici}:not(:disabled)`) : null;
    if (dugme instanceof HTMLElement) dugme.focus(); else odakla(`[data-adim="${hedef}"]`);
  }
  async function sil(n) {
    const x = is.adimlar[n];
    const kullananlar = adimOkumalari(x).filter((o) => o.ad && iz().adimlar.some((b, k) => k > n && b.girdiler.some((g) => g.ad === o.ad && g.tur === 'adim' && g.adim === n)));
    if (kullananlar.length && !(await onayIste({
      baslik: `“${x.ad}” adımı silinsin mi?`, metin: `Bu adımın okuduğu ${kullananlar.map((o) => `\${akis:${o.ad}}`).join(', ')} sonraki adımlarda kullanılıyor; silinirse o adımlar değeri bulamaz.`,
      dugme: 'Sil', tehlikeli: true
    }))) return;
    is.adimlar.splice(n, 1);
    secili = Math.min(secili === n ? n : secili > n ? secili - 1 : secili, is.adimlar.length - 1);
    degisti();
    duyuru.textContent = `“${x.ad}” silindi.`;
    ciz();
    ayrintiCiz();
    odakla(`[data-adim="${Math.min(n, is.adimlar.length - 1)}"]`);
  }

  // ---- Çizim --------------------------------------------------------------------------------------------------------------------
  /** Adım n'nin gösterilen koşudaki sonucu (sıra ve ad eşleşirse). */
  const adimSonucu = (n) => {
    const r = gosterilen?.adimlar?.find((y) => y.no === n + 1);
    return r && String(r.ad).trim() === String(is.adimlar[n].ad).trim() ? r : null;
  };
  const degerCipi = (ad, ek = {}) => h('code', { class: `akis-cip ${ek.sinif ?? ''}`.trim(), title: ek.title ?? null }, ek.gizli ? ikon('kilit') : null, `\${akis:${ad}}`, ek.kaynak ? h('span', { class: 'kaynak' }, ek.kaynak) : null);
  const girdiKaynagi = (g) => g.tur === 'adim' ? `← ${g.adim + 1}. adım` : g.tur === 'oturum' ? '← oturum' : g.tur === 'sonra' ? `← ${g.adim + 1}. adım (sonra!)` : '← okunmuyor';
  const girdiAciklamasi = (g) => g.tur === 'adim' ? `${g.adim + 1}. adımın yanıtından okunur.` : g.tur === 'oturum' ? `Servisin oturum akışından (${g.oturum.baslik}) gelir.`
    : g.tur === 'sonra' ? `${g.adim + 1}. adımda okunuyor ama bu adım ondan önce koşuyor: sırayı değiştirin.` : 'Hiçbir önceki adımda okunmuyor; servisin oturum akışında da yok.';

  function ekleNoktasi(konum, t) {
    const acik = acikMenu === konum;
    const tasinan = konum > 0 ? t.tasinan[konum] ?? [] : [];
    const eksik = konum < is.adimlar.length ? t.eksikler[konum].filter((g) => g.tur === 'sonra') : [];
    const doldu = is.adimlar.length >= EN_COK_ADIM;
    const oplar = operasyonlari(menuServisId);
    const menu = acik ? h('div', { class: 'ekle-menusu servis-ekle-menusu', role: 'group', 'aria-label': 'Eklenecek adım' },
      h('label', { class: 'tasarim-etiketi' }, h('span', {}, 'Servis'),
        h('select', { 'aria-label': 'Eklenecek adımın servisi', onchange: async (o) => { menuServisId = o.target.value; await senaryolariAl(menuServisId); ciz(); odakla('.servis-ekle-menusu select'); } },
          servisler.map((sv) => h('option', { value: sv.id, selected: sv.id === menuServisId }, sv.ad)))),
      h('span', { class: 'tasarim-etiketi' }, h('span', {}, 'Operasyon (alan değerleri senaryoda)')),
      oplar.length
        ? h('ul', { class: 'senaryo-secenekleri', 'aria-label': 'Operasyonlar' }, oplar.map((op) => h('li', {}, h('button', {
          type: 'button', 'aria-label': `Operasyon adımı koy: ${op}`,
          onclick: () => adimEkle(konum, { ...yeniOperasyonAdimi(menuServisId, op), operasyon: op })
        }, ikon('artiYalin'), op))))
        : h('p', { class: 'soluk kucuk' }, 'Bu serviste operasyon yok.'),
      h('details', { class: 'kayitli-senaryo-secimi' }, h('summary', { class: 'kucuk' }, 'Kayıtlı senaryo (eski tür: değerler senaryoda sabit)'),
      (senaryolar.get(menuServisId) || []).length
        ? h('ul', { class: 'senaryo-secenekleri', 'aria-label': 'Kayıtlı senaryolar' }, (senaryolar.get(menuServisId) || []).map((sn) => h('li', {}, h('button', {
          type: 'button', 'aria-label': `Adım olarak koy: ${sn.baslik}`,
          onclick: () => adimEkle(konum, { ad: sn.baslik, servisId: menuServisId, senaryoId: sn.id })
        }, ikon('artiYalin'), sn.baslik))))
        : h('p', { class: 'soluk kucuk' }, senaryolar.has(menuServisId) ? 'Bu serviste kayıtlı senaryo yok.' : 'Senaryolar okunuyor…')),
      h('div', { class: 'dugmeler' },
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => adimEkle(konum, { ad: 'SQL sorgusu', tur: 'sql', sql: yeniSqlTanimi(sqlKaynaklari) }) }, ikon('veri'), 'SQL sorgusu'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { acikMenu = -1; ciz(); odakla(`[data-ekle="${konum}"]`); } }, 'Kapat'))) : null;
    if (menu) menu.addEventListener('keydown', (o) => { if (o.key === 'Escape') { o.preventDefault(); acikMenu = -1; ciz(); odakla(`[data-ekle="${konum}"]`); } });
    return h('li', { class: 'tasarim-ekle servis-ekle' },
      h('span', { class: 'cizgi', 'aria-hidden': 'true' }),
      tasinan.length ? h('span', { class: 'akis-oku', title: 'Bu noktadan sonraki adımlara taşınan akış değerleri' },
        ikon('ok'), h('span', { class: 'gorunmez' }, 'Taşınan değerler: '), tasinan.join(' · ')) : null,
      eksik.length ? h('span', { class: 'akis-oku hatali', role: 'note' },
        ikon('uyari'), `${eksik.map((g) => g.ad).join(', ')} henüz okunmadı (${eksik.map((g) => `${g.adim + 1}. adımda`).join(', ')})`) : null,
      h('button', {
        type: 'button', class: `ekle-dugmesi${acik ? ' acik' : ''}`, 'data-ekle': String(konum), disabled: doldu,
        'aria-label': konum === 0 ? 'Başa yeni adım koy' : `${konum}. adımdan sonra yeni adım koy`, 'aria-expanded': acik ? 'true' : 'false',
        title: doldu ? `En çok ${EN_COK_ADIM} adım` : 'Buraya adım koy: bir servisin operasyonu, kayıtlı senaryo ya da SQL sorgusu',
        onclick: async () => { acikMenu = acik ? -1 : konum; if (!acik) await senaryolariAl(menuServisId); ciz(); if (!acik) odakla('.servis-ekle-menusu select'); }
      }, ikon('artiYalin')),
      menu);
  }

  function adimKutusu(x, n, t) {
    const b = t.adimlar[n];
    const sqlMi = x.tur === 'sql';
    const opMi = x.tur === 'operasyon';
    const sn = sqlMi || opMi ? null : senaryoBul(x);
    const sqlO = sqlMi ? sqlOzeti(x.sql) : null;
    const baglantiAdi = sqlMi ? sqlHedefAdi(x.sql, sqlKaynaklari) : '';
    const sonuc = adimSonucu(n);
    const renk = sonuc ? RENK[sonuc.durum] : null;
    const metot = sn ? (sn.icerik?.http ? `${sn.icerik.http.metot} ${sn.icerik.http.yol || '/'}` : sn.icerik?.operasyon ?? '') : '';
    const el = h('li', {
      class: ['diyagram-dugumu', 'tasarim-blogu', 'servis-adimi', n === secili ? 'etkin' : '', renk ? `durum-${renk.sinif}` : '', b.hatali ? 'sira-hatasi' : ''].filter(Boolean).join(' '),
      'data-adim': String(n), tabindex: '0', draggable: 'true', 'aria-current': n === secili ? 'step' : null,
      'aria-label': `${n + 1}. adım: ${x.ad}${sqlMi ? `, SQL sorgusu, ${sqlO.beklenen}` : opMi ? `, ${servisAdi(x.servisId)} · ${x.operasyon || 'operasyon seçilmedi'}` : sn ? `, ${servisAdi(x.servisId)} › ${sn.baslik}` : ', senaryo seçilmedi'}${b.hatali ? ', değer sırası hatalı' : ''}${sonuc ? `, son sonuç ${renk?.etiket ?? sonuc.durum}` : ''}`
    },
    h('div', { class: 'dugum-basligi' },
      h('span', { class: 'dugum-no', 'aria-hidden': 'true' }, String(n + 1)),
      h('h4', {}, x.ad || `${n + 1}. adım`),
      x.hataOlursaDevam ? rozet('kalırsa devam', 'vurgu', { title: 'Bu adım kalırsa da sonraki adımlar koşar.' }) : null,
      b.hatali ? rozet('değer sırası', 'hata', { title: 'Kullandığı bir akış değeri bu adımdan önce okunmuyor.' }) : null,
      renk ? h('span', { class: `diyagram-durum ${renk.sinif}` }, ikon(renk.ikonAd), renk.etiket, sonuc.sureMs ? h('span', { class: 'sure' }, saniye(sonuc.sureMs)) : null) : null,
      h('span', { class: 'tasarim-denetimleri' },
        h('button', { type: 'button', class: 'kucuk-dugme hayalet sira-yukari', 'aria-label': `${n + 1}. adımı yukarı taşı`, disabled: n === 0, onclick: (o) => { o.stopPropagation(); tasi(n, n - 1, '.sira-yukari'); } }, '↑'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet sira-asagi', 'aria-label': `${n + 1}. adımı aşağı taşı`, disabled: n === is.adimlar.length - 1, onclick: (o) => { o.stopPropagation(); tasi(n, n + 1, '.sira-asagi'); } }, '↓'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet tehlike', 'aria-label': `${n + 1}. adımı sil`, disabled: is.adimlar.length === 1, onclick: (o) => { o.stopPropagation(); void sil(n); } }, ikon('cop')))),
    sqlMi ? h('p', { class: 'dugum-aciklamasi servis-adimi-kimligi' },
      h('span', { class: 'servis-adi' }, ikon('veri'), ' SQL'),
      baglantiAdi ? h('span', { class: 'mono metot' }, baglantiAdi) : h('span', { class: 'hata-metni' }, 'Bağlantı seçilmedi'),
      h('span', { class: 'senaryo-adi' }, sqlO.beklenen),
      sqlO.sqlSatiri ? h('code', { class: 'sql-satiri' }, sqlO.sqlSatiri) : h('span', { class: 'hata-metni' }, 'SQL yazılmadı')) :
    opMi ? h('p', { class: 'dugum-aciklamasi servis-adimi-kimligi' },
      h('span', { class: 'servis-adi' }, servisAdi(x.servisId)),
      x.operasyon ? h('span', { class: 'mono metot' }, x.operasyon) : h('span', { class: 'hata-metni' }, 'Operasyon seçilmedi'),
      Object.keys(x.baglar ?? {}).length ? h('span', { class: 'soluk kucuk' }, `${Object.keys(x.baglar).length} alan akıştan`) : null) :
    h('p', { class: 'dugum-aciklamasi servis-adimi-kimligi' },
      h('span', { class: 'servis-adi' }, servisAdi(x.servisId)),
      metot ? h('span', { class: 'mono metot' }, metot) : null,
      sn ? h('span', { class: 'senaryo-adi' }, sn.baslik) : h('span', { class: 'hata-metni' }, x.senaryoId ? 'Senaryo bulunamadı' : 'Senaryo seçilmedi')),
    b.girdiler.length ? h('div', { class: 'akis-degerleri girdiler' }, h('span', { class: 'baslik' }, 'Girdiler'),
      b.girdiler.map((g) => degerCipi(g.ad, { sinif: g.tur === 'sonra' || g.tur === 'yok' ? 'hatali' : g.tur === 'oturum' ? 'oturum' : '', kaynak: girdiKaynagi(g), title: girdiAciklamasi(g) }))) : null,
    b.ciktilar.length ? h('div', { class: 'akis-degerleri ciktilar' }, h('span', { class: 'baslik' }, 'Çıktılar'),
      b.ciktilar.map((o) => degerCipi(o.ad, { sinif: 'cikti', gizli: o.gizli ?? gizliMi(o.ad), title: sqlMi ? `Sütun: ${o.sutun || '(yok)'}` : `${KAYNAK[o.kaynak || 'xml']}: ${o.yol || '(yol yok)'}` }))) : null,
    sonuc?.neden && sonuc.durum !== 'basarili' ? h('p', { class: 'diyagram-hata', title: sonuc.neden }, ikon('uyari'), String(sonuc.neden).split('\n')[0]) : null);
    el.addEventListener('click', () => { if (secili !== n) sec(n); });
    el.addEventListener('keydown', (o) => {
      if (o.target !== el) return;
      if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); sec(n, true); }
      else if (o.altKey && (o.key === 'ArrowUp' || o.key === 'ArrowDown')) { o.preventDefault(); tasi(n, n + (o.key === 'ArrowUp' ? -1 : 1)); }
      else if (o.key === 'ArrowUp' || o.key === 'ArrowDown') { o.preventDefault(); odakla(`[data-adim="${n + (o.key === 'ArrowUp' ? -1 : 1)}"]`); }
      else if (o.key === 'Home' || o.key === 'End') { o.preventDefault(); odakla(`[data-adim="${o.key === 'Home' ? 0 : is.adimlar.length - 1}"]`); }
    });
    // Sürükle-bırak: kutunun üst yarısına bırakılırsa önüne, alt yarısına bırakılırsa arkasına.
    el.addEventListener('dragstart', (o) => { o.dataTransfer?.setData(SURUKLEME_TURU, String(n)); if (o.dataTransfer) o.dataTransfer.effectAllowed = 'move'; el.classList.add('surukleniyor'); });
    el.addEventListener('dragend', () => el.classList.remove('surukleniyor'));
    const yer = (o) => (o.offsetY < el.offsetHeight / 2 ? 'onune' : 'arkasina');
    el.addEventListener('dragover', (o) => {
      if (!o.dataTransfer?.types.includes(SURUKLEME_TURU)) return;
      o.preventDefault();
      const y = yer(o);
      el.classList.toggle('onune-birak', y === 'onune');
      el.classList.toggle('arkasina-birak', y === 'arkasina');
    });
    el.addEventListener('dragleave', () => el.classList.remove('onune-birak', 'arkasina-birak'));
    el.addEventListener('drop', (o) => {
      const veri = o.dataTransfer?.getData(SURUKLEME_TURU) ?? '';
      el.classList.remove('onune-birak', 'arkasina-birak');
      const kaynak = Number(veri);
      if (veri === '' || !Number.isInteger(kaynak)) return;
      o.preventDefault();
      const arkasina = yer(o) === 'arkasina';
      // Hedef sıra: kaynak çıkarıldıktan sonraki dizide.
      let hedef = arkasina ? n + 1 : n;
      if (kaynak < hedef) hedef--;
      tasi(kaynak, hedef);
    });
    return el;
  }

  function ciz() {
    const t = iz();
    // Oturum kutusu: adımların oturumdan aldığı değerler (akış başına).
    /** @type {Map<string, { baslik: string; adlar: Set<string>; servisler: Set<string> }>} */
    const oturumlar = new Map();
    t.adimlar.forEach((b, n) => {
      for (const g of b.girdiler) {
        if (g.tur !== 'oturum') continue;
        const o = oturumlar.get(g.oturum.akisId) ?? { baslik: g.oturum.baslik, adlar: new Set(), servisler: new Set() };
        o.adlar.add(g.ad); o.servisler.add(servisAdi(is.adimlar[n].servisId));
        oturumlar.set(g.oturum.akisId, o);
      }
    });
    const oturumAdlari = [...new Set(t.adimlar.flatMap((b) => b.girdiler.filter((g) => g.tur === 'oturum').map((g) => g.ad)))];
    const ogeler = [h('li', { class: 'diyagram-dugumu uc baslangic' },
      h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-simgesi', 'aria-hidden': 'true' }, ikon(is.tur === 'oturum' ? 'anahtar' : 'oynat')), h('h4', {}, 'Başlangıç')),
      h('p', { class: 'dugum-aciklamasi' }, is.tur === 'oturum'
        ? 'Oturum akışı: servis senaryosu koşmadan önce (değer yoksa ya da süresi dolduysa) koşar.'
        : 'Adımlar sırayla koşar; kalan adımdan sonrakiler atlanır (“kalırsa devam” işaretli değilse).'))];
    if (oturumlar.size) {
      ogeler.push(h('li', { class: 'diyagram-baglantisi', 'aria-hidden': 'true' }, h('span', { class: 'cizgi' })),
        h('li', { class: 'diyagram-dugumu tasarim-blogu tur-oturum', 'aria-label': 'Oturum (token): servislerin oturum akışlarından gelen değerler' },
          h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-simgesi', 'aria-hidden': 'true' }, ikon('anahtar')), h('h4', {}, 'Oturum (token)'), rozet('ayrı akış', 'vurgu')),
          [...oturumlar.entries()].map(([id, o]) => h('div', { class: 'oturum-saglayici' },
            h('a', { href: `${adres}/${q(id)}`, class: 'kucuk' }, o.baslik),
            h('span', { class: 'soluk kucuk' }, ` · ${[...o.servisler].join(', ')}`),
            h('div', { class: 'akis-degerleri ciktilar' }, h('span', { class: 'baslik' }, 'Çıktılar'), [...o.adlar].map((ad) => degerCipi(ad, { sinif: 'oturum', gizli: gizliMi(ad) }))))),
          h('p', { class: 'dugum-aciklamasi soluk' }, 'Değerler koşular arasında süresi dolana kadar paylaşılır; 401 / 403 gelirse bir kez yenilenir.')));
    }
    is.adimlar.forEach((x, n) => {
      const nokta = ekleNoktasi(n, t);
      if (n === 0 && oturumAdlari.length) nokta.insertBefore(h('span', { class: 'akis-oku oturum', title: 'Oturum akışından gelen değerler' }, ikon('ok'), h('span', { class: 'gorunmez' }, 'Oturumdan: '), oturumAdlari.join(' · ')), nokta.querySelector('.ekle-dugmesi'));
      ogeler.push(nokta, adimKutusu(x, n, t));
    });
    ogeler.push(ekleNoktasi(is.adimlar.length, t));
    const oturumCiktilari = is.adimlar.flatMap((x) => adimOkumalari(x).map((o) => o.ad)).filter(Boolean);
    ogeler.push(h('li', { class: 'diyagram-dugumu uc bitis' },
      h('div', { class: 'dugum-basligi' }, h('span', { class: 'dugum-simgesi', 'aria-hidden': 'true' }, ikon('hedef')), h('h4', {}, is.tur === 'oturum' ? 'Bitiş: oturum değerleri' : 'Bitiş')),
      is.tur === 'oturum'
        ? [oturumCiktilari.length ? h('div', { class: 'akis-degerleri ciktilar' }, oturumCiktilari.map((ad) => degerCipi(ad, { sinif: 'oturum', gizli: gizliMi(ad) })))
          : h('p', { class: 'hata-metni kucuk' }, 'Oturum akışı en az bir değer okumalıdır (ör. Token).'),
        h('p', { class: 'dugum-aciklamasi' }, is.yenileme === 'herIstekte' ? 'Her senaryo çalıştırmasında yeniden alınır.' : `Değerler ${is.omur} sn boyunca yeniden kullanılır.`)]
        : h('p', { class: 'dugum-aciklamasi' }, 'Bütün adımlar başarılıysa akış başarılıdır.')));
    yerlestir(akisEl, ...ogeler);

    const sorunlar = t.eksikler.flatMap((l, n) => l.map((g) => `${n + 1}. adım (${is.adimlar[n].ad}): \${akis:${g.ad}} ${g.tur === 'sonra' ? `${g.adim + 1}. adımda okunuyor; bu adımdan önce gelmeli` : 'hiçbir önceki adımda okunmuyor (servisin oturum akışında da yok)'}.`));
    yerlestir(hataKutusu, sorunlar.length ? h('div', { class: 'not-kutusu hata', role: 'alert' },
      h('p', {}, `Akış değerlerinde ${sorunlar.length} sorun var; düzeltilmeden kaydedilemez:`), h('ul', {}, sorunlar.map((m) => h('li', {}, m)))) : null);

    yerlestir(ustEl,
      h('div', { class: 'diyagram-kaynak' }, gosterilen
        ? [h('span', { class: 'soluk' }, `Renkler: ${gosterilen.kaynak}`), gosterilen.durum ? durumRozeti(gosterilen.durum) : null,
          gosterilen.zaman ? h('span', { class: 'mono cok-soluk kucuk' }, tarihMetni(gosterilen.zaman)) : null]
        : h('span', { class: 'soluk' }, akisId ? 'Bu akış henüz koşulmadı; adımlar renklenmez.' : 'Kaydedilmemiş akış: koşu sonucu yok.')),
      h('div', { class: 'diyagram-lejant', 'aria-label': 'Renklerin anlamı' },
        ['basarili', 'basarisiz', 'atlandi'].map((k) => h('span', { class: `lejant ${RENK[k].sinif}` }, RENK[k].etiket)),
        h('span', { class: 'lejant akis-lejanti' }, 'Taşınan değer')));
  }

  // ---- Ayrıntı paneli (seçili adım) -------------------------------------------------------------------------------------------
  /** SQL sorgusu adımının ayrıntısı: ad, ortak SQL formu (bağlantı, sorgu, beklenen, yeniden deneme, okumalar), girdiler. */
  function sqlAyrintisi(n, x) {
    const ad = h('input', { type: 'text', value: x.ad, maxlength: '100', 'aria-label': `${n + 1}. adım adı` });
    ad.addEventListener('input', () => { x.ad = ad.value; ciz(); });
    const devam = h('input', { type: 'checkbox', checked: Boolean(x.hataOlursaDevam) });
    devam.addEventListener('change', () => { if (devam.checked) x.hataOlursaDevam = true; else delete x.hataOlursaDevam; degisti(); ciz(); });
    const girdiKap = h('div', {});
    const girdileriCiz = () => {
      const b = iz().adimlar[n];
      const once = [...new Set(is.adimlar.slice(0, n).flatMap((y) => adimOkumalari(y).map((o) => o.ad)).filter(Boolean))];
      yerlestir(girdiKap,
        h('h4', { class: 'ayrinti-basligi' }, 'Girdiler (sorgunun kullandığı)'),
        b.girdiler.length ? h('ul', { class: 'akis-girdi-listesi' }, b.girdiler.map((g) => h('li', { class: g.tur === 'sonra' || g.tur === 'yok' ? 'hatali' : '' },
          h('code', { class: 'akis-degeri' }, `\${akis:${g.ad}}`), h('span', { class: 'kucuk' }, girdiAciklamasi(g)))))
          : h('p', { class: 'soluk kucuk' }, 'Sorgu akış değeri kullanmıyor.'),
        once.length ? h('p', { class: 'soluk kucuk' }, 'Bu adımda kullanılabilir: ', ...once.map((o) => h('code', { class: 'akis-degeri' }, `\${akis:${o}}`))) : null);
    };
    girdileriCiz();
    const form = sqlAdimiFormu(x.sql, { ...sqlKaynaklari, onek: `${n + 1}. adım `, gizliMi, degisti: () => { degisti(); ciz(); girdileriCiz(); } });
    yerlestir(ayrintiKap, h('section', { class: 'kart form-paneli servis-akis-ayrinti', 'aria-label': `${n + 1}. adım ayrıntısı` },
      h('div', { class: 'kart-basligi' }, h('h3', {}, h('span', { class: 'dugum-no', 'aria-hidden': 'true' }, String(n + 1)), `${n + 1}. adım: SQL sorgusu`)),
      alan('Adım adı', ad), form, girdiKap,
      h('label', { class: 'secenek' }, devam, 'Bu adım kalırsa da sonraki adımlara devam et')));
  }

  /** Operasyon ↔ kayıtlı senaryo adımı geçişi (SQL adımı dışında). */
  function turSecimi(n, x) {
    const sec = h('select', { 'aria-label': `${n + 1}. adım türü` },
      h('option', { value: 'operasyon', selected: x.tur === 'operasyon' }, 'Operasyon (değerler senaryoda)'),
      h('option', { value: 'senaryo', selected: x.tur !== 'operasyon' }, 'Kayıtlı senaryo'));
    sec.addEventListener('change', async () => {
      if (sec.value === 'operasyon') { const y = yeniOperasyonAdimi(x.servisId || s.id); x.tur = 'operasyon'; x.operasyon = y.operasyon; x.baglar = {}; delete x.senaryoId; if (!x.servisId) x.servisId = y.servisId; }
      else { delete x.tur; delete x.operasyon; delete x.baglar; x.senaryoId = ''; await senaryolariAl(x.servisId); }
      degisti(); ciz(); ayrintiCiz(); ayrintiKap.querySelector('select')?.focus();
    });
    return alan('Adım türü', sec, { yardim: 'Operasyon: akış yalnız sırayı ve taşınan değerleri tutar, alan değerleri akış senaryosunda. Kayıtlı senaryo: eski tür.' });
  }

  /** Operasyon adımının ayrıntısı: servis, operasyon, akıştan gelen alanlar (bağlar), yanıttan okumalar. */
  function operasyonAyrintisi(n, x) {
    x.baglar ??= {};
    const ad = h('input', { type: 'text', value: x.ad, maxlength: '100', 'aria-label': `${n + 1}. adım adı` });
    ad.addEventListener('input', () => { x.ad = ad.value; ciz(); });
    const servisSec = h('select', { 'aria-label': `${n + 1}. adım servisi` }, servisler.map((sv) => h('option', { value: sv.id, selected: sv.id === x.servisId }, sv.ad)));
    const opSec = h('select', { 'aria-label': `${n + 1}. adım operasyonu` }, h('option', { value: '' }, '— operasyon —'),
      operasyonlari(x.servisId).map((o) => h('option', { value: o, selected: o === x.operasyon }, o)),
      x.operasyon && !operasyonlari(x.servisId).includes(x.operasyon) ? h('option', { value: x.operasyon, selected: true }, `${x.operasyon} (serviste yok)`) : null);
    servisSec.addEventListener('change', () => { x.servisId = servisSec.value; x.operasyon = operasyonlari(x.servisId)[0] ?? ''; x.baglar = {}; degisti(); ciz(); ayrintiCiz(); ayrintiKap.querySelector(`[aria-label="${n + 1}. adım servisi"]`)?.focus(); });
    opSec.addEventListener('change', () => {
      const eski = x.operasyon;
      x.operasyon = opSec.value; x.baglar = {};
      if (!x.ad || x.ad === eski) { x.ad = x.operasyon; ad.value = x.ad; }
      degisti(); ciz(); ayrintiCiz(); ayrintiKap.querySelector(`[aria-label="${n + 1}. adım operasyonu"]`)?.focus();
    });
    const sv = servisler.find((y) => y.id === x.servisId);
    const sema0 = sv?.tur !== 'rest' ? sv?.ayarlar?.operasyonSemalari?.[x.operasyon] : null;
    const yollar = sema0 ? alanSatirlari(semaBirlestir(sema0, sv.ayarlar.ekAlanlar?.[x.operasyon] ?? []).alanlar).filter((y) => !y.grup).map((y) => y.yol) : null;
    const once = () => [...new Set(is.adimlar.slice(0, n).flatMap((y) => adimOkumalari(y).map((o) => o.ad)).filter(Boolean))];
    const bagKap = h('div', { class: 'okuma-listesi' });
    /** Düzenlenen satırlar (yarım satır da görünür; kayıtta yalnız tamamlananlar). */
    const satirlar = Object.entries(x.baglar).map(([yol, v]) => ({ yol, ad: bagAdi(v) ?? '' }));
    const yaz = () => { x.baglar = Object.fromEntries(satirlar.filter((b) => b.yol && b.ad).map((b) => [b.yol, `\${akis:${b.ad}}`])); degisti(); ciz(); };
    const bagCiz = () => {
      const adlar = once();
      yerlestir(bagKap, satirlar.map((b, k) => {
        const yolG = yollar
          ? h('select', { 'aria-label': `${n + 1}. adım ${k + 1}. bağ alanı` }, h('option', { value: '' }, '— alan —'), yollar.map((y) => h('option', { value: y, selected: y === b.yol }, y)))
          : h('input', { type: 'text', value: b.yol, spellcheck: 'false', class: 'kod-girdisi', placeholder: sv?.tur === 'rest' ? 'kayit/no' : 'Input/OrderNo', 'aria-label': `${n + 1}. adım ${k + 1}. bağ alanı` });
        const adG = h('select', { 'aria-label': `${n + 1}. adım ${k + 1}. bağ değeri` }, h('option', { value: '' }, '— akış değeri —'),
          adlar.map((a2) => h('option', { value: a2, selected: a2 === b.ad }, `\${akis:${a2}}`)),
          b.ad && !adlar.includes(b.ad) ? h('option', { value: b.ad, selected: true }, `\${akis:${b.ad}} (önce okunmuyor)`) : null);
        yolG.addEventListener(yolG.tagName === 'SELECT' ? 'change' : 'input', () => { b.yol = yolG.value.trim(); yaz(); });
        adG.addEventListener('change', () => { b.ad = adG.value; yaz(); });
        return h('div', { class: 'okuma-karti' }, h('div', { class: 'okuma-ust' }, yolG, adG),
          h('div', { class: 'okuma-alt' }, h('span', { class: 'soluk kucuk' }, '← önceki adımdan gelir; senaryoda sorulmaz'),
            h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${n + 1}. adım ${k + 1}. bağı sil`, onclick: () => { satirlar.splice(k, 1); yaz(); bagCiz(); } }, ikon('carpi'))));
      }));
    };
    bagCiz();
    const devam = h('input', { type: 'checkbox', checked: Boolean(x.hataOlursaDevam) });
    devam.addEventListener('change', () => { if (devam.checked) x.hataOlursaDevam = true; else delete x.hataOlursaDevam; degisti(); ciz(); });
    const okumaKap = h('div', { class: 'okuma-listesi' });
    const okumalariCiz = () => {
      yerlestir(okumaKap, x.okumalar.map((o, k) => {
        const oad = h('input', { type: 'text', value: o.ad, maxlength: '60', placeholder: 'OrderNo', autocomplete: 'off', 'aria-label': `${n + 1}. adım ${k + 1}. okuma adı` });
        const kaynak = h('select', { 'aria-label': `${n + 1}. adım ${k + 1}. okuma kaynağı` }, Object.entries(KAYNAK).map(([d, m]) => h('option', { value: d, selected: (o.kaynak || 'xml') === d }, m)));
        const yol = h('input', { type: 'text', value: o.yol, maxlength: '300', spellcheck: 'false', class: 'kod-girdisi', autocomplete: 'off', placeholder: '//OrderNo', 'aria-label': `${n + 1}. adım ${k + 1}. okuma yolu` });
        const gizli = h('input', { type: 'checkbox', checked: o.gizli ?? gizliMi(o.ad), 'aria-label': `${n + 1}. adım ${k + 1}. okuma gizli` });
        oad.addEventListener('input', () => { o.ad = oad.value.trim(); if (o.gizli === undefined) gizli.checked = gizliMi(o.ad); ciz(); });
        kaynak.addEventListener('change', () => { o.kaynak = kaynak.value; ciz(); });
        yol.addEventListener('input', () => { o.yol = yol.value; });
        gizli.addEventListener('change', () => { o.gizli = gizli.checked; ciz(); });
        return h('div', { class: 'okuma-karti' }, h('div', { class: 'okuma-ust' }, oad, kaynak), yol,
          h('div', { class: 'okuma-alt' }, h('label', { class: 'secenek' }, gizli, 'gizli'),
            h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${n + 1}. adım ${k + 1}. okumayı sil`, onclick: () => { x.okumalar.splice(k, 1); degisti(); ciz(); okumalariCiz(); } }, ikon('carpi'))));
      }));
    };
    okumalariCiz();
    const b = iz().adimlar[n];
    yerlestir(ayrintiKap, h('section', { class: 'kart form-paneli servis-akis-ayrinti', 'aria-label': `${n + 1}. adım ayrıntısı` },
      h('div', { class: 'kart-basligi' }, h('h3', {}, h('span', { class: 'dugum-no', 'aria-hidden': 'true' }, String(n + 1)), `${n + 1}. adım: operasyon`)),
      alan('Adım adı', ad), turSecimi(n, x), alan('Servis', servisSec), alan('Operasyon', opSec, { yardim: 'Alan değerleri ve beklenen sonuç bu akışı kullanan senaryoda doldurulur.' }),
      h('fieldset', {}, h('legend', {}, 'Önceki adımlardan gelen alanlar (girdiler)'),
        b.girdiler.some((g) => g.tur === 'sonra' || g.tur === 'yok') ? h('p', { class: 'hata-metni kucuk' }, 'Bağlanan bir değer bu adımdan önce okunmuyor.') : null,
        bagKap,
        h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { satirlar.push({ yol: '', ad: once()[0] ?? '' }); bagCiz(); bagKap.querySelector('.okuma-karti:last-child select, .okuma-karti:last-child input')?.focus(); } },
          ikon('arti'), 'Alan bağla'),
        once().length ? null : h('p', { class: 'soluk kucuk' }, 'Önceki adımlarda okunan değer yok; önce bir adımda “Yanıttan oku” ekleyin.')),
      h('fieldset', {}, h('legend', {}, 'Yanıttan oku (çıktılar)'),
        h('p', { class: 'soluk kucuk' }, 'Okunan değer sonraki adımlarda alanlara bağlanır ya da ', h('code', {}, '${akis:Ad}'), ' ile kullanılır.'),
        okumaKap,
        h('button', { type: 'button', class: 'kucuk-dugme okuma-ekle', onclick: () => { x.okumalar.push({ ad: '', kaynak: 'xml', yol: '' }); degisti(); okumalariCiz(); okumaKap.querySelector('.okuma-karti:last-child input')?.focus(); } },
          ikon('arti'), 'Değer oku')),
      h('label', { class: 'secenek' }, devam, 'Bu adım kalırsa da sonraki adımlara devam et')));
  }

  function ayrintiCiz() {
    const n = secili;
    const x = is.adimlar[n];
    if (!x) { yerlestir(ayrintiKap, h('section', { class: 'kart' }, h('p', { class: 'soluk' }, 'Ayrıntı için diyagramdan bir adım seçin.'))); return; }
    if (x.tur === 'sql') { sqlAyrintisi(n, x); return; }
    if (x.tur === 'operasyon') { operasyonAyrintisi(n, x); return; }
    const servisSec = h('select', { 'aria-label': `${n + 1}. adım servisi` }, h('option', { value: '' }, '— servis —'),
      servisler.map((sv) => h('option', { value: sv.id, selected: sv.id === x.servisId }, sv.ad)));
    const senaryoSec = h('select', { 'aria-label': `${n + 1}. adım senaryosu` }, h('option', { value: '' }, '— senaryo —'),
      (senaryolar.get(x.servisId) || []).map((sn) => h('option', { value: sn.id, selected: sn.id === x.senaryoId }, sn.baslik)));
    servisSec.addEventListener('change', async () => { x.servisId = servisSec.value; x.senaryoId = ''; degisti(); await senaryolariAl(x.servisId); ciz(); ayrintiCiz(); ayrintiKap.querySelector('select')?.focus(); });
    senaryoSec.addEventListener('change', () => {
      const eski = senaryoBul({ ...x, senaryoId: x.senaryoId });
      x.senaryoId = senaryoSec.value;
      // Ad eski senaryonun adıysa (ya da varsayılan "Adım n") yeni senaryonun adı olur.
      const yeni = senaryoBul(x);
      if (yeni && (!x.ad || /^Adım \d+$/.test(x.ad) || (eski && x.ad === eski.baslik))) { x.ad = yeni.baslik; ad.value = x.ad; }
      degisti(); ciz(); girdileriCiz();
    });
    const ad = h('input', { type: 'text', value: x.ad, maxlength: '100', 'aria-label': `${n + 1}. adım adı` });
    ad.addEventListener('input', () => { x.ad = ad.value; ciz(); });
    const devam = h('input', { type: 'checkbox', checked: Boolean(x.hataOlursaDevam) });
    devam.addEventListener('change', () => { if (devam.checked) x.hataOlursaDevam = true; else delete x.hataOlursaDevam; degisti(); ciz(); });
    const girdiKap = h('div', {});
    const girdileriCiz = () => {
      const b = iz().adimlar[n];
      const once = [...new Set(is.adimlar.slice(0, n).flatMap((y) => adimOkumalari(y).map((o) => o.ad)).filter(Boolean))];
      const sn = senaryoBul(x);
      yerlestir(girdiKap,
        h('h4', { class: 'ayrinti-basligi' }, 'Girdiler (senaryonun kullandığı)'),
        b.girdiler.length ? h('ul', { class: 'akis-girdi-listesi' }, b.girdiler.map((g) => h('li', { class: g.tur === 'sonra' || g.tur === 'yok' ? 'hatali' : '' },
          h('code', { class: 'akis-degeri' }, `\${akis:${g.ad}}`), h('span', { class: 'kucuk' }, girdiAciklamasi(g)))))
          : h('p', { class: 'soluk kucuk' }, sn ? 'Bu senaryo akış değeri kullanmıyor.' : 'Senaryo seçilince kullandığı değerler görünür.'),
        once.length ? h('p', { class: 'soluk kucuk' }, 'Bu adımda kullanılabilir: ', ...once.map((o) => h('code', { class: 'akis-degeri' }, `\${akis:${o}}`))) : null,
        sn ? h('p', { class: 'kucuk' }, h('a', { href: `#/servisler/s/${q(x.servisId)}/senaryo/${q(sn.id)}` }, 'Senaryoyu aç'),
          h('span', { class: 'soluk' }, ' — değeri gövdede / başlıkta ', h('code', {}, '${akis:Ad}'), ' ile kullanın.')) : null);
    };
    girdileriCiz();
    const okumaKap = h('div', { class: 'okuma-listesi' });
    const okumalariCiz = () => {
      yerlestir(okumaKap, x.okumalar.map((o, k) => {
        const oad = h('input', { type: 'text', value: o.ad, maxlength: '60', placeholder: 'Token', autocomplete: 'off', 'aria-label': `${n + 1}. adım ${k + 1}. okuma adı` });
        const kaynak = h('select', { 'aria-label': `${n + 1}. adım ${k + 1}. okuma kaynağı` }, Object.entries(KAYNAK).map(([d, m]) => h('option', { value: d, selected: (o.kaynak || 'xml') === d }, m)));
        const yol = h('input', { type: 'text', value: o.yol, maxlength: '300', spellcheck: 'false', class: 'kod-girdisi', autocomplete: 'off',
          placeholder: o.kaynak === 'json' ? 'veri.token' : o.kaynak === 'baslik' ? 'x-auth-token' : '//Sonuc/Token', 'aria-label': `${n + 1}. adım ${k + 1}. okuma yolu` });
        const gizli = h('input', { type: 'checkbox', checked: o.gizli ?? gizliMi(o.ad), 'aria-label': `${n + 1}. adım ${k + 1}. okuma gizli`, title: 'Gizli: raporlarda maskelenir (token, parola…)' });
        oad.addEventListener('input', () => { o.ad = oad.value.trim(); if (o.gizli === undefined) gizli.checked = gizliMi(o.ad); ciz(); });
        kaynak.addEventListener('change', () => { o.kaynak = kaynak.value; yol.placeholder = o.kaynak === 'json' ? 'veri.token' : o.kaynak === 'baslik' ? 'x-auth-token' : '//Sonuc/Token'; ciz(); });
        yol.addEventListener('input', () => { o.yol = yol.value; });
        gizli.addEventListener('change', () => { o.gizli = gizli.checked; ciz(); });
        return h('div', { class: 'okuma-karti' },
          h('div', { class: 'okuma-ust' }, oad, kaynak),
          yol,
          h('div', { class: 'okuma-alt' }, h('label', { class: 'secenek' }, gizli, 'gizli'),
            h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${n + 1}. adım ${k + 1}. okumayı sil`, onclick: () => {
              x.okumalar.splice(k, 1); degisti(); ciz(); okumalariCiz(); ayrintiKap.querySelector('.okuma-ekle')?.focus();
            } }, ikon('carpi'))));
      }));
    };
    okumalariCiz();
    yerlestir(ayrintiKap, h('section', { class: 'kart form-paneli servis-akis-ayrinti', 'aria-label': `${n + 1}. adım ayrıntısı` },
      h('div', { class: 'kart-basligi' }, h('h3', {}, h('span', { class: 'dugum-no', 'aria-hidden': 'true' }, String(n + 1)), `${n + 1}. adım`)),
      alan('Adım adı', ad),
      turSecimi(n, x),
      alan('Servis', servisSec), alan('Senaryo', senaryoSec),
      girdiKap,
      h('fieldset', {}, h('legend', {}, 'Yanıttan oku (çıktılar)'),
        h('p', { class: 'soluk kucuk' }, 'Okunan değer sonraki adımlarda ', h('code', {}, '${akis:Ad}'), ' ile kullanılır.'),
        okumaKap,
        h('button', { type: 'button', class: 'kucuk-dugme okuma-ekle', onclick: () => {
          x.okumalar.push({ ad: '', kaynak: 'xml', yol: '' }); degisti(); okumalariCiz();
          okumaKap.querySelector('.okuma-karti:last-child input')?.focus();
        } }, ikon('arti'), 'Değer oku')),
      h('label', { class: 'secenek' }, devam, 'Bu adım kalırsa da sonraki adımlara devam et')));
  }

  // ---- Kaydet / Dene --------------------------------------------------------------------------------------------------------
  const icerikAl = () => ({
    adimlar: is.adimlar.map((x) => ({ ...x, okumalar: x.okumalar.filter((o) => o.ad || o.yol) })),
    ...(is.tur === 'oturum' ? { omurSaniye: is.omur, tokenYenileme: is.yenileme } : {})
  });
  /** @param {number | undefined} satirSiniri SQL satır sınırı (Ayarlar > Koşu > Gelişmiş; sunucuyla aynı kural) */
  const eksik = (satirSiniri) => {
    if (!is.baslik.trim()) return 'Başlık boş olamaz.';
    const n = is.adimlar.findIndex((x) => x.tur !== 'sql' && (!x.servisId || (x.tur === 'operasyon' ? !x.operasyon : !x.senaryoId)));
    if (n >= 0) { sec(n); return `${n + 1}. adımda servis ve ${is.adimlar[n].tur === 'operasyon' ? 'operasyon' : 'senaryo'} seçin.`; }
    // SQL adımı: bağlantı, sorgu ve beklenen sonuç (sunucuyla aynı kurallar: sql-adimi.mjs).
    for (const [j, x] of is.adimlar.entries()) {
      if (x.tur !== 'sql') continue;
      const d = sqlTanimiDogrula(x.sql, { satirSiniri });
      if (d.hatalar.length) { sec(j); return `${j + 1}. adım (SQL): ${d.hatalar.join(' ')}`; }
    }
    const t = iz();
    const k = t.eksikler.findIndex((l) => l.length);
    if (k >= 0) { sec(k); akisEl.querySelector('.sira-hatasi')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return 'Akış değerlerinde sorun var (diyagramda kırmızı); sırayı ya da okumaları düzeltin.'; }
    return '';
  };
  const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    const e = eksik((await kullaniciAyarlari()).sqlSatirSiniri);
    if (e) { mesaj.goster(e); return; }
    // Etki onayı: kayıtlı oturum akışını kullanan servisler (önbellekteki değerler yenilenir).
    const kullanan = akisId ? (tumAkislar.find((x) => x.id === akisId)?.kullananServisler ?? []) : [];
    if (kullanan.length && !(await onayIste({
      baslik: `“${is.baslik.trim()}” kaydedilsin mi?`,
      metin: `Bu oturum akışını ${kullanan.length} servis kullanıyor; kaydedince önbellekteki değerler bırakılır ve sonraki isteklerde yeni hâliyle alınır.`,
      liste: kullanan.map((x) => x.ad), dugme: 'Kaydet', tehlikeli: false, ikonAd: 'uyari'
    }))) return;
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis-akisi/kaydet', { govde: {
        projeId: proje.id, id: akisId || undefined, baslik: is.baslik.trim(), tur: is.tur, kapsam: is.kapsam, icerik: icerikAl()
      } }));
      degisiklikleriBirak();
      durumSatiri.textContent = '✓ Kaydedildi';
      bildir('Akış kaydedildi.');
      location.hash = `${adres}/${q(r.id)}`;
    } catch (e2) { mesaj.goster(e2.message); }
  });
  const test = ortamlar.find((o) => !riskliOrtamMi(o));
  const dene = h('button', { type: 'button', disabled: !test, title: 'Kaydedilmemiş hâliyle TEST ortamında dener' }, ikon('oynat'), 'Dene (TEST)');
  dene.addEventListener('click', async () => {
    mesaj.temizle();
    const e = eksik((await kullaniciAyarlari()).sqlSatirSiniri);
    if (e) { mesaj.goster(e); return; }
    const liste = is.adimlar.map((x, n) => (x.tur === 'sql'
      ? `${n + 1}. SQL sorgusu › ${sqlHedefAdi(x.sql, sqlKaynaklari, test.id)}`
      : x.tur === 'operasyon' ? `${n + 1}. ${servisAdi(x.servisId)} · ${x.operasyon} (varsayılan değerlerle)`
        : `${n + 1}. ${servisAdi(x.servisId)} › ${senaryoBul(x)?.baslik ?? '?'}`));
    if (!(await onayIste({ baslik: 'TEST ortamına istek atılsın mı?', metin: `Akışın adımları sırayla "${test.ad}" ortamında çalıştırılacak.`, liste, dugme: 'Dene', ikonAd: 'ag' }))) return;
    try {
      const { sonuc } = await mesgulIken(dene, 'Deneniyor…', () => api('/platform/servis-akisi/dene', { govde: {
        projeId: proje.id, ortamId: test.id, akisId: akisId || undefined, baslik: is.baslik.trim() || 'Taslak akış', tur: is.tur, icerik: icerikAl()
      } }));
      yerlestir(sonucKap, sonucKarti(sonuc));
      gosterilen = { adimlar: sonuc.adimlar, kaynak: `Dene (${sonuc.ortam})`, durum: sonuc.durum, zaman: new Date().toISOString() };
      ciz();
      if (akisId) kosulariCiz();
    } catch (e2) { mesaj.goster(e2.message); }
  });

  function sonucKarti(r) {
    return h('div', { class: 'kart akis-sonucu' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, r.baslik), durumRozeti(r.durum), h('span', { class: 'alt' }, `${r.ortam} · ${(r.sureMs / 1000).toFixed(1)} sn`)),
      h('p', { class: 'soluk' }, r.ozet),
      h('ol', { class: 'akis-adim-listesi' }, r.adimlar.map((x) => h('li', { class: x.durum === 'basarili' ? 'basarili' : x.durum === 'atlandi' || x.durum === 'durduruldu' ? 'atlanan' : 'basarisiz' },
        h('span', { class: 'adim-adi' }, `${x.ad} — ${x.servis} › ${x.senaryo}`), durumRozeti(x.durum),
        x.sureMs ? h('span', { class: 'soluk kucuk' }, ` ${x.sureMs} ms`) : null,
        x.neden ? h('div', { class: 'soluk kucuk' }, x.neden) : null,
        x.sql ? sqlSonucTablosu(x.sql) : null,
        x.okunanlar ? h('div', { class: 'kucuk' }, 'Okunan: ', ...Object.entries(x.okunanlar).map(([k, v]) => h('code', { class: 'akis-degeri' }, `${k} = ${v}`))) : null,
        x.kosuId ? h('a', { class: 'kucuk', href: `#/servisler/s/${q(servisler.find((sv) => sv.ad === x.servis)?.id ?? s.id)}/raporlar/${q(x.kosuId)}` }, 'İstek / yanıt') : null))));
  }

  /** SQL adımının sorgu sonucu (sunucudan en çok 20 satır, gizliler maskeli). */
  function sqlSonucTablosu(q2) {
    return h('details', { class: 'sql-sonucu' },
      h('summary', { class: 'kucuk' }, `Sorgu sonucu: ${q2.toplamSatir} satır${q2.kesildi ? ' (ilk 20 gösteriliyor)' : ''}${q2.deneme > 1 ? ` · ${q2.deneme} deneme` : ''}`),
      q2.beklenen ? h('p', { class: 'kucuk' }, h('b', {}, 'Beklenen: '), q2.beklenen, ' — ', h('b', {}, 'Görülen: '), q2.gorulen ?? '') : null,
      q2.sutunlar.length ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'veri-tablosu kucuk' },
        h('thead', {}, h('tr', {}, q2.sutunlar.map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', {}, q2.satirlar.map((row) => h('tr', {}, row.map((v) => h('td', { class: 'mono' }, v))))))) : null);
  }

  /** Kayıtlı koşuyu hem sonuç kartında hem diyagram renklerinde gösterir. */
  async function kosuyuGoster(k, kaynak) {
    const { kosu } = await api(`/platform/servis-akisi/kosu?projeId=${q(proje.id)}&id=${q(k.id)}`);
    if (!kosu?.sonuc?.adimlar) return;
    gosterilen = { adimlar: kosu.sonuc.adimlar, kaynak: `${kaynak} (${kosu.sonuc.ortam ?? ''})`, durum: kosu.durum, zaman: kosu.baslangic ?? k.baslangic };
    ciz();
    return kosu;
  }

  async function kosulariCiz(ilk = false) {
    if (!akisId) return;
    try {
      const { kosular } = await api(`/platform/servis-akisi/kosular?projeId=${q(proje.id)}&akisId=${q(akisId)}&sinir=20`);
      if (ilk && kosular.length) await kosuyuGoster(kosular[0], kosular[0].tur === 'dene' ? 'son Dene' : 'son koşu').catch(() => null);
      yerlestir(kosuKap, kosular.length ? h('div', { class: 'kart' }, h('h3', {}, 'Son koşular'),
        h('ul', { class: 'akis-kosulari' }, kosular.map((k) => h('li', {}, h('button', { type: 'button', class: 'hayalet', onclick: async () => {
          try {
            const kosu = await kosuyuGoster(k, k.tur === 'dene' ? 'Dene' : 'koşu');
            if (kosu) yerlestir(sonucKap, sonucKarti({ ...kosu.sonuc, baslik: kosu.baslik, durum: kosu.durum, sureMs: kosu.sureMs }));
          } catch (e) { bildir(e.message, 'hata'); }
        } }, durumRozeti(k.durum), ` ${tarihMetni(k.baslangic)} · ${k.tur === 'dene' ? 'Dene' : 'Koşu'}${(() => { const o = k.ortamId ? ortamlar.find((x) => x.id === k.ortamId) : null; return o ? ` · ${o.ad}` : ''; })()}`))))) : null);
    } catch { /* liste yoksa gösterilmez */ }
  }

  ciz();
  ayrintiCiz();
  yerlestir(kap,
    h('div', { class: 'kart form-paneli' },
      h('h3', {}, akisId ? 'Akışı düzenle' : 'Yeni akış'), mesaj.kutu,
      kayit?.hatalar?.length ? h('div', { class: 'not-kutusu uyari', role: 'status' }, h('b', {}, 'Akış şu an koşulamaz: '), kayit.hatalar.join(' ')) : null,
      alan('Başlık', baslik, { zorunlu: true }),
      h('div', { class: 'satir-duzen' }, alan('Tür', tur), alan('Kapsam', kapsam, { yardim: 'Koşuda hangi ortam türünde koşacağı. Dene her zaman TEST\'te.' }), yenilemeAlani, omurAlani)),
    h('div', { class: 'form-duzeni tasarim-duzeni servis-akis-duzeni' },
      h('section', { class: 'kart tasarim-karti', 'aria-label': 'Akış diyagramı' },
        h('p', { class: 'soluk kucuk' }, 'Kutuya tıklayın ya da Enter’a basın: ayrıntısı sağda açılır. Sıralamak için sürükleyin, ↑ / ↓ düğmelerini ya da Alt + ↑ / ↓ tuşlarını kullanın. Oklarda sonraki adımlara taşınan ',
          h('code', {}, '${akis:Ad}'), ' değerleri yazar.'),
        ustEl, hataKutusu, akisEl, duyuru,
        h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => adimEkle(is.adimlar.length, yeniOperasyonAdimi(s.id)) }, ikon('arti'), 'Adım ekle'))),
      h('aside', { class: 'ozet-sutunu', 'aria-label': 'Adım ayrıntısı ve kayıt' },
        // Kaydet üstte: yapışkan sütun kaydırılsa da görünür kalır.
        h('section', { class: 'kart form-paneli' },
          h('p', { class: 'soluk kucuk' }, 'Kaydederken akış sunucuda doğrulanır (servis / senaryo projede, her değer kullanılmadan önce okunuyor).'),
          h('div', { class: 'dugmeler' }, kaydet, dene, h('a', { class: 'dugme hayalet', href: adres }, 'Vazgeç')),
          h('p', { class: 'kucuk' }, durumSatiri)),
        ayrintiKap)),
    sonucKap, kosuKap, akisSenaryolariKarti());
  void kosulariCiz(true);

  /** Akış sayfasının altında: bu akışı kullanan senaryolar (+ Senaryo ekle akış seçili açılır). */
  function akisSenaryolariKarti() {
    if (!akisId || is.tur !== 'akis') return null;
    const ilk = is.adimlar.find((x) => x.tur === 'operasyon')?.servisId ?? s.id;
    return h('section', { class: 'kart', 'aria-label': 'Bu akışın senaryoları' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('liste'), 'Bu akışın senaryoları'),
        h('span', { class: 'sag' }, h('a', { class: 'dugme kucuk-dugme', href: `#/servisler/s/${q(ilk)}/senaryo/yeni?akis=${q(akisId)}` }, ikon('arti'), 'Senaryo ekle'))),
      h('p', { class: 'soluk kucuk' }, 'Akış operasyonların sırasını ve taşınan değerleri tanımlar; senaryo her adımın alan değerlerini ve beklenen sonucunu tutar (ekran senaryolarındaki gibi).'),
      akisSenaryolari.length
        ? h('ul', { class: 'akis-kosulari' }, akisSenaryolari.map((x) => h('li', {}, h('a', { href: `#/servisler/s/${q(x.servisId)}/senaryo/${q(x.id)}` }, x.baslik),
          ' ', rozet(x.kapsam === 'ikisi' ? 'TEST + CANLI' : x.kapsam === 'canli' ? 'CANLI' : 'TEST'), x.kosuyaDahil ? null : rozet('hariç', 'atlanan'))))
        : h('p', { class: 'soluk' }, 'Henüz senaryo yok.'));
  }
}
