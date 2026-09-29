// "BU TALEBİN SENARYOLARINI KOŞ" — seçilen talebe bağlı ekran senaryolarını, servis senaryolarını ve uçtan uca akışları MEVCUT koşu
// yollarıyla koşar (yeni koşu yolu yoktur):
//  1. Plan sunucudan (POST /platform/talepler/kosu-plani; istek atmaz): her ortam için koşacaklar ve atlananlar (nedeniyle).
//  2. Koşu diyaloğu (kosu-paneli.js > kosuOnayi): ortam seçimi, liste, atlananlar; CANLI ortamda "Başlat"tan sonra tek tip CANLI onayı.
//  3. Türlere göre SIRAYLA: önce ekran senaryoları (ekran koşu paneli; kosuBaslat — koşu hızı ayarıyla), bitince servis senaryoları
//     (servis başına bir servis işi; servis koşu paneli), sonra uçtan uca akışlar (tek tek; POST /platform/uctan-uca/kos).
//     CANLI onayı işlem başına tek kullanımlıktır: ilk işlem diyalogdaki onayı kullanır, sonraki her işlemden önce yeniden sorulur.
//     Kapalı izinler her istekte sunucuda denetlenir; standart izin penceresi (ortak.js > api) sorar. Kullanıcı bir türü durdurursa
//     (Tümünü durdur) sonraki türler başlamaz.
// Listelerdeki "Talep" süzgeci (talepSecenekleri / talepSuzgeci) ekran, servis ve uçtan uca listelerinde aynı kuralı kullanır.
import { api, bildir, h, ikon } from './ortak.js';
import { canliOnayEki, canliOnayIste, dinle, kosuBaslat, kosuDurdurulduMu, kosuOnayi, kosuSuruyorMu, riskliOrtamMi } from './kosu-paneli.js';
import { servisKosusuBaslat, servisKosusuSuruyorMu } from './servis-kosu-paneli.js';
import { talepEslesir, talepKucuk, talepSirala } from './talepler.mjs';

const TUR_ETIKETI = { ekran: 'Ekran', servis: 'Servis', uctanUca: 'Uçtan uca' };

/**
 * Listedeki öğelerin talepleri (harf duyarsız tekil; ilk görülen yazım), süzgeç seçenekleri için sıralı.
 * @param {Array<{ talepler?: string[] }>} ogeler @returns {string[]}
 */
export function talepSecenekleri(ogeler) {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const o of ogeler) for (const t of o.talepler || []) if (!m.has(talepKucuk(t))) m.set(talepKucuk(t), t);
  return [...m.values()].sort(talepSirala);
}

/** Öğe süzgeçteki talebe uyuyor mu (boş süzgeç: hepsi). @param {{ talepler?: string[] }} x @param {string} talep */
export const talebeUyar = (x, talep) => !talep || talepEslesir(x.talepler || [], talep);

/**
 * "Bu talebin senaryolarını koş" düğmesi (süzgeçte talep seçiliyken görünür).
 * @param {{ id: string }} proje @param {() => string} talep
 */
export function talepKosuDugmesi(proje, talep) {
  const d = h('button', { type: 'button', class: 'kucuk-dugme talep-kosu-dugmesi', title: 'Bu talebe bağlı ekran, servis ve uçtan uca senaryolarını birlikte koşar (ortam sorulur)' },
    ikon('oynat'), 'Bu talebin senaryolarını koş');
  d.addEventListener('click', () => { const t = talep(); if (t) void talebinSenaryolariniKos(proje, t); });
  return d;
}

/** Ekran koşu oturumu bitince çözülür. */
const ekranKosusuBitince = () => new Promise((coz) => {
  const birak = dinle((olay) => { if (olay === 'bitti') { birak(); coz(undefined); } });
});

/**
 * Talebin senaryolarını koşar (mevcut diyalog ve onay akışıyla). Vazgeçilirse ya da koşu başlatılamazsa false.
 * @param {{ id: string }} proje @param {string} talep
 */
export async function talebinSenaryolariniKos(proje, talep) {
  if (kosuSuruyorMu() || servisKosusuSuruyorMu()) { bildir('Sürmekte olan bir koşu var; bitmesini bekleyin ya da durdurun.', 'hata'); return false; }
  let plan;
  let ortamlar;
  try {
    [plan, { ortamlar }] = await Promise.all([
      api('/platform/talepler/kosu-plani', { govde: { projeId: proje.id, talep } }),
      api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`)
    ]);
  } catch (e) { bildir(e.message, 'hata'); return false; }
  if (!ortamlar.length) { bildir('Projede ortam yok.', 'hata'); return false; }
  const planOf = (o) => plan.planlar.find((p) => p.ortamId === o.id) || { ekran: [], servis: [], uctanUca: [], atlananlar: [] };
  const liste = (p) => [
    ...p.ekran.map((x) => ({ id: x.id, baslik: `${TUR_ETIKETI.ekran} · ${x.baslik}` })),
    ...p.servis.flatMap((g) => g.senaryolar.map((x) => ({ id: x.id, baslik: `${TUR_ETIKETI.servis} (${g.servisAdi}) · ${x.baslik}` }))),
    ...p.uctanUca.map((x) => ({ id: x.id, baslik: `${TUR_ETIKETI.uctanUca} · ${x.baslik}` }))
  ];
  const y = await kosuOnayi({
    baslik: `"${plan.talep}" talebinin senaryolarını koş?`, ortamlar, tur: 'tekil', esZamanli: false,
    turEtiketi: `Talep ${plan.talep}`,
    kosuBicimi: 'türlere göre sırayla (önce ekran, sonra servis, sonra uçtan uca)',
    hesapla: (o) => {
      const p = planOf(o);
      return { senaryolar: liste(p), atlananlar: p.atlananlar.map((a) => ({ baslik: `${TUR_ETIKETI[a.tur] || a.tur} · ${a.baslik}`, neden: a.neden })) };
    },
    not: 'Ekran senaryoları ekran koşu panelinde, servis senaryoları servis koşu panelinde, uçtan uca akışlar tek tek koşar; sonuçlar her türün kendi sonuçlarına ve Kapsam matrisine yazılır. Kısmi (tekil) koşu olarak kaydedilir.'
  });
  if (!y) return false;
  const ortam = y.ortam;
  const p = planOf(ortam);
  // CANLI onayı işlem başına tek kullanımlık: ilk işlem diyalogdaki onayı kullanır, sonrakilerden önce yeniden sorulur.
  let onayKullanildi = false;
  const onayli = async () => {
    if (!onayKullanildi) { onayKullanildi = true; return true; }
    return riskliOrtamMi(ortam) ? canliOnayIste(ortam) : true;
  };
  const sayac = { ekran: 0, servis: 0, uctanUca: 0, basarisiz: 0 };
  // 1) Ekran senaryoları: ekran koşu paneli (sırayla / koşu hızı ayarıyla), bitene kadar beklenir.
  if (p.ekran.length) {
    await onayli();
    const bitti = ekranKosusuBitince();
    if (!kosuBaslat({ projeId: proje.id, ortam, senaryolar: p.ekran, tur: 'tekil', esZamanli: false, baslik: `Talep ${plan.talep} · ekran senaryoları` })) return false;
    await bitti;
    sayac.ekran = p.ekran.length;
    if (kosuDurdurulduMu()) { bildir(`"${plan.talep}" koşusu durduruldu; servis ve uçtan uca senaryoları başlatılmadı.`, 'hata'); return true; }
  }
  // 2) Servis senaryoları: servis başına bir servis işi (servis koşu paneli), sırayla.
  for (const g of p.servis) {
    if (!(await onayli())) { bildir('CANLI onayı verilmedi; kalan senaryolar koşmadı.', 'hata'); return true; }
    try {
      const is = await new Promise((coz, ret) => {
        servisKosusuBaslat({ proje, servisId: g.servisId, ortamId: ortam.id, senaryoIdleri: g.senaryolar.map((x) => x.id), bitti: coz }).catch(ret);
      });
      sayac.servis += g.senaryolar.length;
      if (is && Array.isArray(is.satirlar) && is.satirlar.some((x) => x.durum === 'durduruldu')) {
        bildir(`"${plan.talep}" koşusu durduruldu; kalan senaryolar başlatılmadı.`, 'hata');
        return true;
      }
    } catch (e) { bildir(`${g.servisAdi}: ${e.message}`, 'hata'); return true; }
  }
  // 3) Uçtan uca akışlar: tek tek (koşu penceresinin koşusuyla aynı uç; izinler ve CANLI onayı sunucuda denetlenir).
  for (const [i, x] of p.uctanUca.entries()) {
    if (!(await onayli())) { bildir('CANLI onayı verilmedi; kalan akışlar koşmadı.', 'hata'); return true; }
    bildir(`Uçtan uca akış koşuyor (${i + 1}/${p.uctanUca.length}): ${x.baslik}`);
    try {
      const r = await api('/platform/uctan-uca/kos', { govde: { projeId: proje.id, ortamId: ortam.id, akisId: x.id, ...canliOnayEki(ortam.id) } });
      sayac.uctanUca++;
      if (r.sonuc && r.sonuc.durum !== 'basarili') sayac.basarisiz++;
    } catch (e) { bildir(`${x.baslik}: ${e.message}`, 'hata'); return true; }
  }
  bildir(`"${plan.talep}" talebinin koşusu bitti: ${sayac.ekran} ekran, ${sayac.servis} servis, ${sayac.uctanUca} uçtan uca senaryosu koştu. Sonuçlar: Sonuçlar > Raporlar > Kapsam matrisi.`);
  return true;
}
