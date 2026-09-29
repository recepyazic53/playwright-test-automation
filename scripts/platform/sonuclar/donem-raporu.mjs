// DÖNEM RAPORU VERİSİ (sunucu; kasa açık olmalı): PDF raporunun bölümlerinin verisi. Kapsamlar: tek ekran, tek servis (A1);
// birden çok ekran, birden çok servis, ekran + servis (A2); genel (A3: projenin tamamı — tüm ekranlar ve ortak akışlar, tüm
// servisler, servis akışları ve uçtan uca akışlar, zamanlanmış koşular, kararsız testler, test verisi sağlığı, kapsam ve açıklar,
// ortamlara göre; toplam ve sorun hesabı çoklu raporunkidir, genele özgü saf hesaplar genel.mjs'de). Çoklu kapsamda her öğe TEK ÖĞE hesabıyla (ekranHesabi / servisHesabi)
// hesaplanır ve coklu.mjs ile toplanır (sayılar toplanır, oran toplamdan; sorunlar birleşir; bağlantılı sorunlar tek aksiyon).
// Kaynaklar: kosular + kosu_sonuclari + adim_sonuclari + yakalanan_mesajlar (ekran), servis_kosulari (+ şifreli sonuç), servis
// senaryoları (metot), servis akışları. Hesaplar saf modüllerdedir: donem.mjs (D / D′ / G, kovalar), sorun-modeli.mjs (imza,
// durum, kararlılık, sınıf), oncelik.mjs (puan, bant, rozet), yuzdelik.mjs (p50 / p95 / p99), hesaplama.mjs (başarı — Sonuçlar
// ekranıyla aynı formül).
// - Ekran başarı oranı yalnız TAM koşulardan; tekil koşular sorunlara girer, orana girmez. Servis: yalnız "koşu" türü ("Dene"
//   hariç), servis akışlarının adım satırları servis koşularına karışmaz (Sonuçlar ekranıyla aynı).
// - MASKELEME: hata metinleri kalıba çevrilmeden ÖNCE maskelenir (html-rapor.mjs > raporMaskeleyici); istek / yanıt gövdesi,
//   başlıklar, okunan değerler ve test verisi değerleri hiç okunmaz. Kontrol kalıbı yalnız kontrol türü + yol (değer yok).
// - RAPOR VERİLERİ (A4; kullanıcı kararı, Ayarlar > Raporlar — ayarlar/rapor-verileri.mjs; hepsi varsayılan olarak boş):
//   · kritik işareti: öncelik puanının kritiklik bileşeni 1 olur; kapsamdaki kritik öğe / akış son koşusunda kaldıysa rozet Kritik;
//     "Kritik akış" kartı (kritik).
//   · ekip eşlemesi: sahip önerisi öğenin ekibidir (yoksa sınıfın varsayılan ekibi).
//   · süre eşiği (ekran: test süresi, servis / metot: çağrı süresi): p95 eşiği aşarsa eşik aşımı listesi (esikAsimlari), sabit puanlı
//     ek aksiyon ve süre grafiğinde eşik çizgisi.
//   · uygulama sürümü (koşu kaydındaki etiket): sürüme göre başarı (surumler), sorunun başladığı sürüm (ilkSurum) ve kararsızlıkta
//     "aynı sürüm" karşılaştırması.
//   Boşken sonuçlar önceki (A1–A3) hesapla aynıdır: kritiklik 0, sahip = sınıfın varsayılanı, eşik ve sürüm bölümleri yok; uydurma
//   değer üretilmez.
import { DepoHatasi, ekranModeliGetir, ortamlariListele, projeGetir } from '../veritabani/depo.mjs';
import { uygulamaSurumuOku, veriKosusuTemizle } from '../veritabani/sonuc-deposu.mjs';
import { ogeAnahtari, raporVerileriniOku } from '../ayarlar/rapor-verileri.mjs';
import { sure as sureMetni } from './pdf-rapor/bilesenler.mjs';
import { servisAkislariniListele, servisGetir, servisKosusuGetir, servisSenaryolariniListele, servisleriListele } from '../servisler/servis-deposu.mjs';
import { saglikEsikleriniOku } from '../ayarlar/saglik-esikleri.mjs';
import { KATEGORI, beklenenGorulenCikar, kalipCikar } from './siniflandirma.mjs';
import { basariYuzdesi, sayilariTopla } from './hesaplama.mjs';
import { donemHesapla, donemParcasi, kovaIndeksi } from './donem.mjs';
import { SORUN_DURUMLARI, SERVIS_HATA_TURLERI, baglantiliSorunlar, kararlilikHesapla, kategoriKisaAdi, sinifTahmini, sorunlariHesapla } from './sorun-modeli.mjs';
import { EK_AKSIYON_PUANI, ESIK_AKSIYON_PUANI, aksiyonListesi, aksiyonOnerisi, bant, durumRozeti, oncelikPuani, sahipOnerisi } from './oncelik.mjs';
import { yavasladiMi, yuzdelik, yuzdelikler } from './yuzdelik.mjs';
import { ilkSatirlar } from './html-rapor.mjs';
import { akisAdimSatirlari } from './servis-sonuclari.mjs';
import { aksiyonlariBirlestir, birlesikOzet, kovalariBirlestir, saglikSiralamasi, sinifDagilimi, sorunSayimi } from './coklu.mjs';
import { kararsizListesi, metotKapsami, ortamOranlari, pencereGuvenilirligi, toplamGuvenilirlik } from './genel.mjs';
import { GECMIS_SINIRI, kurallariListele, ortamRiskliMi } from '../zamanlama/kurallar.mjs';
import { veriSagligi } from '../tablolar/tablo-birlestirme.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * Kapsam: 'ekran' | 'servis' (tek öğe; id) · 'coklu-ekran' | 'coklu-servis' | 'karisik' (ekranIdleri / servisIdleri; tumEkranlar /
 * tumServisler: rapor üretildiği andaki TÜM ekranlar / servisler — "aynı seçimlerle yeniden oluştur" yeni öğeleri de kapsar) ·
 * 'genel' (seçim yok: rapor her üretildiğinde o anki tüm öğeler).
 * @typedef {{ projeId: string; kapsam: 'ekran' | 'servis' | 'coklu-ekran' | 'coklu-servis' | 'karisik' | 'genel'; id: string; ekranIdleri?: string[];
 *   servisIdleri?: string[]; tumEkranlar?: boolean; tumServisler?: boolean; donem: import('./donem.mjs').DonemSecimi; karsilastir: boolean;
 *   ortamId: string | null; secenekler: { hatalar: boolean; adres: boolean; goruntuler: boolean }; aksiyonSayisi?: number }} RaporGirdisi
 * @typedef {{ maskele: (m: unknown) => string; simdi?: Date; goruntuCoz?: (medya: Array<{ id: string; ad: string; icerikTuru: string; boyut: number }>) =>
 *   Promise<Array<{ ad: string; icerikTuru: string; base64: string }>> }} RaporBaglami
 */

/** Rapor bölümlerinde en çok satır. */
const EN_COK_ISI_SATIRI = 12;
const EN_COK_MATRIS_KOSUSU = 12;
const EN_COK_YAKALANAN = 8;
const EN_COK_KALAN_KONTROL = 5;

/** @param {number} a @param {number} b */
const oranYuzde = (a, b) => (b ? (a / b) * 100 : null);
/** @param {string} m */
const buyukBas = (m) => (m ? `${m.charAt(0).toLocaleUpperCase('tr')}${m.slice(1)}` : m);
/** @param {unknown} z */
const ms = (z) => { const t = Date.parse(String(z ?? '')); return Number.isNaN(t) ? null : t; };
/** @param {number | null} t */
const iso = (t) => (t === null ? null : new Date(t).toISOString());
/** @param {ReadonlyArray<number>} d */
const ortalama = (d) => (d.length ? d.reduce((a, b) => a + b, 0) / d.length : null);
/**
 * Ortam başına durum sayıları (genel rapor > Ortamlara göre; ortamı olmayan kayıt sayılmaz).
 * @param {ReadonlyArray<{ ortamId: string | null; durum: string }>} l @returns {Record<string, Record<string, number>>}
 */
function ortamSayilari(l) {
  /** @type {Record<string, Record<string, number>>} */
  const s = {};
  for (const x of l) if (x.ortamId) { const o = (s[x.ortamId] ??= {}); o[x.durum] = (o[x.durum] ?? 0) + 1; }
  return s;
}

/**
 * Sorun → rapor satırı (sınıf, puan, bant, aksiyon, sahip, başlık, "neden şimdi"). rv: rapor verileri (kritik işareti → kritiklik 1;
 * ekip eşlemesi → sahip önerisi; boşsa önceki davranış).
 * @param {import('./sorun-modeli.mjs').Sorun} s @param {'ekran' | 'servis'} tur
 * @param {{ baslik: string; nerede: string; kalip: string; kategori?: string; hataTuru?: string; ogeId: string; ogeAd: string }} m
 * @param {RaporVerileri} rv
 */
function sorunSatiri(s, tur, m, rv) {
  const t = sinifTahmini({ tur, kategori: m.kategori ?? null, hataTuru: m.hataTuru ?? null, durum: s.durum });
  const anahtar = ogeAnahtari(tur, m.ogeId);
  const kritik = rv.kritik.has(anahtar);
  const puan = s.durum === 'cozulen' || s.durum === 'dogrulanamadi' ? 0
    : oncelikPuani({ sinif: t.sinif, durum: s.durum, senaryo: s.senaryolar.length, oran: s.oran, kritiklik: kritik ? 1 : 0, acikGun: s.acikGun });
  const yz = (/** @type {number} */ o) => `%${(o * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
  const ekip = rv.ekip.get(anahtar);
  return {
    imza: s.imza, tur, ogeId: m.ogeId, ogeAd: m.ogeAd, baslik: m.baslik, nerede: m.nerede, kalip: m.kalip, kategori: m.kategori ?? null, hataTuru: m.hataTuru ?? null,
    sinif: t.sinif, dayanak: t.dayanak, durum: s.durum, n: s.n, nOnceki: s.nOnceki, maruz: s.maruz, maruzOnceki: s.maruzOnceki, oran: s.oran,
    oranOnceki: s.oranOnceki, senaryo: s.senaryolar.length, seri: s.seri, oncekiSeri: s.oncekiSeri, ilk: iso(s.ilk), son: iso(s.son),
    acikGun: s.acikGun, tekrarRozeti: s.tekrarRozeti, puan, bant: bant(puan), aksiyon: aksiyonOnerisi({ sinif: t.sinif, tur }), sahip: ekip ?? sahipOnerisi(t.sinif),
    // A4: öğe kritik işaretli mi, sahip ekip eşlemesinden mi, sorunun ilk görüldüğü uygulama sürümü.
    kritik, ekipEslemesi: ekip !== undefined, ilkSurum: s.ilkSurum,
    neden: `${s.nOnceki} → ${s.n} adet · ${s.senaryolar.length} senaryo · hata oranı ${yz(s.oran)}${s.maruzOnceki ? ` (önceki ${yz(s.oranOnceki)})` : ''}${s.n ? ` · ${s.acikGun} gündür açık` : ''}`
  };
}

/** @typedef {ReturnType<typeof sorunSatiri>} RaporSorunu */

/**
 * Ortak son adım: aksiyonlar, sayımlar, rozet, maddeler.
 * @param {RaporSorunu[]} sorunlar @param {Array<Record<string, unknown> & { puan: number; bant: string; durum: string }>} ekAksiyonlar
 * @param {{ basari: number | null; oncekiBasari: number | null; esikler: { yesil: number; sari: number }; aksiyonSayisi: number; karsilastir: boolean; kosuVar: boolean;
 *   birlesme?: { haric: Set<string>; notlar: Map<string, string> }; kritikKalanlar?: string[] }} g birlesme: bağlantılı sorunlar (coklu.mjs > aksiyonlariBirlestir);
 *   kritikKalanlar: kapsamdaki kritik işaretli öğe / akışlardan son koşusunda kalanların adları (A4; boşsa rozet önceki kuralla).
 */
function ortakSonuc(sorunlar, ekAksiyonlar, g) {
  const kritikKalanlar = g.kritikKalanlar ?? [];
  const haric = g.birlesme?.haric ?? new Set();
  for (const s of sorunlar) {
    const not = g.birlesme?.notlar.get(s.imza);
    if (not) Object.assign(s, { baglanti: not }); // şablonda maskelenerek yazılır (adım / metot adı içerir)
  }
  const tumAksiyonlar = aksiyonListesi([...sorunlar.filter((s) => !haric.has(s.imza)), ...ekAksiyonlar], Number.MAX_SAFE_INTEGER);
  const bantSayim = { P1: 0, P2: 0, P3: 0 };
  for (const a of tumAksiyonlar) bantSayim[/** @type {'P1' | 'P2' | 'P3'} */ (a.bant)]++;
  /** @type {Record<string, number>} */
  const durumSayim = Object.fromEntries(SORUN_DURUMLARI.map((d) => [d, 0]));
  for (const s of sorunlar) durumSayim[s.durum]++;
  const rozet = durumRozeti({ basari: g.basari, p1: bantSayim.P1, esikler: g.esikler, kritikKaldi: kritikKalanlar.length > 0 });
  /** @type {Array<['iyi' | 'kotu' | 'oneri', string]>} */
  const maddeler = [];
  // Madde metni şablonda tam maskeyle yazılır (öğe adları içerir).
  if (kritikKalanlar.length) {
    maddeler.push(['kotu', `Kritik işaretli ${kritikKalanlar.length === 1 ? 'öğe' : `${kritikKalanlar.length} öğe`} son koşusunda kaldı: ${kritikKalanlar.slice(0, 5).join(', ')}${kritikKalanlar.length > 5 ? ` ve ${kritikKalanlar.length - 5} diğer` : ''}.`]);
  }
  const iyi = [];
  if (g.karsilastir && g.basari !== null && g.oncekiBasari !== null && g.basari - g.oncekiBasari >= 0.05) {
    iyi.push(`başarı önceki döneme göre ${(g.basari - g.oncekiBasari).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan arttı`);
  }
  if (durumSayim.cozulen) iyi.push(`${durumSayim.cozulen} sorun çözüldü`);
  if (durumSayim.azalan) iyi.push(`${durumSayim.azalan} sorun azaldı`);
  if (iyi.length) maddeler.push(['iyi', `${buyukBas(iyi.join('; '))}.`]);
  const kotu = sorunlar.filter((s) => ['yeni', 'artan', 'tekrar'].includes(s.durum)).sort((a, b) => b.puan - a.puan);
  if (kotu.length) {
    const ilk = kotu[0];
    maddeler.push(['kotu', `${kotu.length} kötüleşen sorun (yeni ${durumSayim.yeni}, artan ${durumSayim.artan}, tekrar eden ${durumSayim.tekrar}). En önemlisi: ${ilk.baslik} — ${ilk.nerede}.`]);
  } else if (g.kosuVar) {
    maddeler.push(['iyi', 'Bu dönemde yeni, artan ya da tekrar eden sorun yok.']);
  }
  if (g.karsilastir && g.basari !== null && g.oncekiBasari !== null && g.oncekiBasari - g.basari >= 0.05) {
    maddeler.push(['kotu', `Başarı önceki döneme göre ${(g.oncekiBasari - g.basari).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan düştü.`]);
  }
  const ilkAksiyon = tumAksiyonlar[0];
  if (ilkAksiyon) maddeler.push(['oneri', `Önce: ${String(ilkAksiyon.baslik)} (${ilkAksiyon.bant}) — ${String(ilkAksiyon.aksiyon)}`]);
  if (!g.kosuVar) maddeler.push(['oneri', 'Bu dönemde koşu yok: dönemi genişletin ya da koşuyu başlatın.']);
  return { aksiyonlar: tumAksiyonlar.slice(0, g.aksiyonSayisi), bantSayim, durumSayim, rozet, maddeler };
}

/**
 * Rapor verisi (tek ekran ya da tek servis).
 * @param {Veritabani} vt @param {RaporGirdisi} g @param {RaporBaglami} b
 */
export async function donemRaporuVerisi(vt, g, b) {
  const proje = projeGetir(vt, g.projeId);
  if (!proje) throw new DepoHatasi('Proje bulunamadı.');
  const donem = donemHesapla(g.donem, b.simdi ?? new Date());
  const ortamlar = ortamlariListele(vt, g.projeId);
  const ortamAdlari = new Map(ortamlar.map((o) => [o.id, o.ad]));
  let ortam = null;
  if (g.ortamId) {
    const o = ortamlar.find((x) => x.id === g.ortamId);
    if (!o) throw new DepoHatasi('Ortam bulunamadı.');
    ortam = { id: o.id, ad: o.ad, adres: o.tabanUrl ?? null };
  }
  const esikler = saglikEsikleriniOku(vt, g.projeId);
  const ortak = {
    olusturma: (b.simdi ?? new Date()).toISOString(), proje: { id: proje.id, ad: proje.ad }, ortam, karsilastir: g.karsilastir, secenekler: g.secenekler, esikler,
    donem: {
      tur: donem.tur, gun: donem.gun, etiket: donem.etiket, oncekiEtiket: donem.oncekiEtiket, kirilim: donem.kirilim,
      bas: donem.bas.toISOString(), bit: donem.bit.toISOString(), kovaEtiketleri: donem.kovalar.map((k) => k.etiket),
      oncekiKovaEtiketleri: donem.oncekiKovalar.map((k) => k.etiket)
    }
  };
  // Rapor verileri (A4; Ayarlar > Raporlar): kritik işareti, ekip eşlemesi, süre eşikleri. Boşken hesap önceki gibidir.
  const rv = raporVerileriniOku(vt, g.projeId);
  const ic = { vt, g, b, donem, ortamAdlari, esikler, aksiyonSayisi: Math.min(20, Math.max(1, g.aksiyonSayisi ?? 8)), rv };
  if (g.kapsam === 'servis') {
    const s = servisHesabi(ic, g.id);
    return { tur: /** @type {const} */ ('servis'), ...ortak, ...s.bolum, ...a4Ekleri(ic, { ekranlar: [], servisler: [s], akislar: s.bolum.servis.akislar, sorunlar: s.bolum.sorunlar }) };
  }
  if (g.kapsam === 'ekran') {
    const e = await ekranHesabi(ic, g.id, true);
    return { tur: /** @type {const} */ ('ekran'), ...ortak, ...e.bolum, ...a4Ekleri(ic, { ekranlar: [e], servisler: [], akislar: [], sorunlar: e.bolum.sorunlar }) };
  }
  return { tur: g.kapsam, ...ortak, ...(await cokluBolumler(ic)) };
}

/** @typedef {import('../ayarlar/rapor-verileri.mjs').RaporVerileri} RaporVerileri */
/**
 * @typedef {{ vt: Veritabani; g: RaporGirdisi; b: RaporBaglami; donem: import('./donem.mjs').Donem; ortamAdlari: Map<string, string>;
 *   esikler: { yesil: number; sari: number }; aksiyonSayisi: number; adimSatirlari?: Set<string>; rv: RaporVerileri }} Ic
 */

// ---------------------------------------------------------------------------------------------------------------------------
// RAPOR VERİLERİ (A4): kritik akış kartı, sürüme göre başarı, süre eşiği aşımları, yöntem notu
// ---------------------------------------------------------------------------------------------------------------------------

/** Sürümde gösterilen en çok satır (en yeni sürümler). */
const EN_COK_SURUM = 8;

/**
 * @typedef {{ ekran: { basarili: number; basarisiz: number; atlanan: number }; servis: { basarili: number; basarisiz: number; hata: number };
 *   ilk: number; son: number }} SurumSayimi
 */

/**
 * Sürüm sayımına bir sonuç ekler (ekran: tam koşu sonucu, durdurulan hariç; servis: "koşu" türü çağrı).
 * @param {Map<string, SurumSayimi>} harita @param {string | null} surum @param {'ekran' | 'servis'} tur @param {string} durum @param {number} zaman
 */
function surumSay(harita, surum, tur, durum, zaman) {
  if (!surum) return;
  const x = harita.get(surum) ?? { ekran: { basarili: 0, basarisiz: 0, atlanan: 0 }, servis: { basarili: 0, basarisiz: 0, hata: 0 }, ilk: zaman, son: zaman };
  harita.set(surum, x);
  const s = /** @type {Record<string, number>} */ (tur === 'ekran' ? x.ekran : x.servis);
  if (durum in s) s[durum]++;
  x.ilk = Math.min(x.ilk, zaman);
  x.son = Math.max(x.son, zaman);
}

/**
 * Süre eşiği bilgisi (p95 > eşik = aştı). Ölçüm yoksa aşım yok.
 * @param {number | null} esik @param {ReadonlyArray<number>} sureler @param {ReadonlyArray<number>} oncekiSureler
 */
function esikBilgisi(esik, sureler, oncekiSureler) {
  if (esik === null) return null;
  const p95 = yuzdelik([...sureler], 95);
  return {
    esik, olculen: sureler.length, asan: sureler.filter((v) => v > esik).length, oncekiAsan: oncekiSureler.filter((v) => v > esik).length,
    p95, asti: p95 !== null && p95 > esik
  };
}

/**
 * Süre eşiği aşımı ek aksiyonu (sabit puan: ESIK_AKSIYON_PUANI → P2).
 * @param {{ ad: string; nerede: string; tur: 'ekran' | 'servis'; bilgi: NonNullable<ReturnType<typeof esikBilgisi>>; sahip: string }} x
 */
function esikAksiyonu(x) {
  const b = x.bilgi;
  return {
    tur: 'ek', baslik: `Süre eşiği aşıldı: ${x.ad}`, nerede: x.nerede, sinif: 'uygulama', durum: 'suregelen', puan: ESIK_AKSIYON_PUANI, bant: bant(ESIK_AKSIYON_PUANI),
    aksiyon: x.tur === 'ekran' ? 'Test süresini inceleyin: yavaşlayan adımı bulun (adım süreleri, bekleme ayarları) ya da uygulama ekibine iletin.'
      : 'Yanıt süresini inceleyin: metodu uygulama / ortam ekibine iletin; süre dağılımı ve p95 raporda.',
    sahip: x.sahip, neden: `p95 ${sureMetni(b.p95)} > eşik ${sureMetni(b.esik)} · ${b.asan} / ${b.olculen} ölçüm eşiğin üstünde`,
    dayanak: 'Kullanıcı tanımlı süre eşiği (Ayarlar > Raporlar).', esikAsimi: true
  };
}

/**
 * Tüm rapor türlerine eklenen A4 bölümleri. Veri yoksa ilgili alan null (şablon bölümü yazmaz).
 * @param {Ic} ic
 * @param {{ ekranlar: Array<Awaited<ReturnType<typeof ekranHesabi>>>; servisler: Array<ReturnType<typeof servisHesabi>>;
 *   akislar: Array<{ id: string; ad: string; tur: string; son: string | null; kritik?: boolean }>; sorunlar: RaporSorunu[] }} x
 */
function a4Ekleri(ic, x) {
  // Kritik akış kartı: kapsamdaki kritik işaretli ekran / servis / akışlar ve son koşuları.
  const kritikOgeler = [
    ...x.ekranlar.filter((e) => e.ham.kritik).map((e) => ({ tur: 'Ekran', ad: e.bolum.oge.ad, son: e.ham.son })),
    ...x.servisler.filter((s) => s.ham.kritik).map((s) => ({ tur: 'Servis', ad: s.bolum.oge.ad, son: s.ham.son })),
    ...x.akislar.filter((a) => a.kritik).map((a) => ({ tur: a.tur, ad: a.ad, son: a.son }))
  ];
  const kritik = kritikOgeler.length ? { toplam: kritikOgeler.length, kalan: kritikOgeler.filter((o) => o.son === 'K').length, ogeler: kritikOgeler } : null;

  // Sürüme göre başarı (dönem içi) ve o sürümde başlayan sorunlar.
  /** @type {Map<string, SurumSayimi>} */
  const harita = new Map();
  for (const h of [...x.ekranlar.map((e) => e.ham.surumlar), ...x.servisler.map((s) => s.ham.surumlar)]) {
    for (const [surum, s] of h) {
      const t = harita.get(surum) ?? { ekran: { basarili: 0, basarisiz: 0, atlanan: 0 }, servis: { basarili: 0, basarisiz: 0, hata: 0 }, ilk: s.ilk, son: s.son };
      harita.set(surum, t);
      for (const k of /** @type {const} */ (['basarili', 'basarisiz', 'atlanan'])) t.ekran[k] += s.ekran[k];
      for (const k of /** @type {const} */ (['basarili', 'basarisiz', 'hata'])) t.servis[k] += s.servis[k];
      t.ilk = Math.min(t.ilk, s.ilk);
      t.son = Math.max(t.son, s.son);
    }
  }
  const acikSorunlar = x.sorunlar.filter((s) => s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi');
  const surumListesi = [...harita.entries()].sort((a, b) => a[1].ilk - b[1].ilk).slice(-EN_COK_SURUM).map(([surum, s]) => {
    const ekranTest = s.ekran.basarili + s.ekran.basarisiz + s.ekran.atlanan;
    const cagri = s.servis.basarili + s.servis.basarisiz + s.servis.hata;
    return {
      surum, ekranTest, ekranBasari: basariYuzdesi(s.ekran), cagri, servisBasari: basariYuzdesi(s.servis), ilk: iso(s.ilk), son: iso(s.son),
      baslayanSorun: acikSorunlar.filter((y) => y.ilkSurum === surum).length
    };
  });
  const surumler = surumListesi.length ? { liste: surumListesi, toplam: harita.size } : null;

  // Süre eşiği aşımları (eşiği tanımlı olanlar; aşanlar önce).
  const esikAsimlari = [
    ...x.ekranlar.filter((e) => e.ham.esik).map((e) => ({ tur: /** @type {const} */ ('ekran'), oge: e.bolum.oge.ad, metot: null, .../** @type {NonNullable<typeof e.ham.esik>} */ (e.ham.esik) })),
    ...x.servisler.flatMap((s) => s.bolum.servis.metotlar.filter((m) => m.esik).map((m) => ({
      tur: /** @type {const} */ ('servis'), oge: s.bolum.oge.ad, metot: m.ad, .../** @type {NonNullable<typeof m.esik>} */ (m.esik)
    })))
  ].sort((a, b) => Number(b.asti) - Number(a.asti) || a.oge.localeCompare(b.oge, 'tr'));

  // Yöntem notu için: hangi rapor verileri tanımlı / kullanıldı.
  const surumluSonuc = [...harita.values()].reduce((t, s) => t + s.ekran.basarili + s.ekran.basarisiz + s.ekran.atlanan + s.servis.basarili + s.servis.basarisiz + s.servis.hata, 0);
  return {
    kritik, surumler, esikAsimlari: esikAsimlari.length ? esikAsimlari : null,
    raporVerileri: { kritik: ic.rv.sayilar.kritik, ekip: ic.rv.sayilar.ekip, esik: ic.rv.sayilar.esik, surumluSonuc }
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// TEK EKRAN
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Tek ekranın rapor bölümleri (bolum) + çoklu raporda toplanacak ham sayılar (ham).
 * ayrinti: false ise yalnız çoklu raporun kullandığı kısım hesaplanır (senaryo matrisi, ısı haritası, son hata / ekran görüntüsü ve
 * yakalanan mesajlar atlanır).
 * @param {Ic} ic @param {string} ekranId @param {boolean} ayrinti
 */
async function ekranHesabi(ic, ekranId, ayrinti) {
  const { vt, g, b, donem, ortamAdlari } = ic;
  const ekran = vt.tek('SELECT id, ad FROM ekranlar WHERE id = ? AND proje_id = ?', [ekranId, g.projeId]);
  if (!ekran) throw new DepoHatasi('Ekran bulunamadı.');
  const ekranAdi = String(ekran.ad);
  const kosullar = ['k.proje_id = ?', 'r.ekran_id = ?', 'COALESCE(r.bitis, k.bitis, k.baslangic) >= ?', 'COALESCE(r.bitis, k.bitis, k.baslangic) < ?'];
  const p = [g.projeId, ekranId, donem.geriBakisBas.toISOString(), donem.bit.toISOString()];
  if (g.ortamId) { kosullar.push('k.ortam_id = ?'); p.push(g.ortamId); }
  const satirlar = vt.tumu(
    `SELECT r.id, r.kosu_id, r.senaryo_id, r.senaryo_anahtari, r.senaryo_baslik, r.durum, r.sure_ms, r.hata_kategorisi, r.deneme, r.ekler_json,
            CASE WHEN r.durum = 'basarisiz' THEN r.hata_mesaji END AS hata_mesaji,
            COALESCE(r.bitis, k.bitis, k.baslangic) AS zaman, k.tur AS kosu_turu, k.ortam_id, k.ozet_json, k.baslangic AS kosu_baslangic,
            (SELECT a.ad FROM adim_sonuclari a WHERE a.sonuc_id = r.id AND a.durum = 'basarisiz' ORDER BY a.sira LIMIT 1) AS adim
       FROM kosu_sonuclari r JOIN kosular k ON k.id = r.kosu_id
      WHERE ${kosullar.join(' AND ')} ORDER BY zaman`, p);
  /** @type {Map<string, string>} */
  const kalipOnbellegi = new Map();
  const kalipBul = (/** @type {string} */ hata) => {
    let k = kalipOnbellegi.get(hata);
    if (k === undefined) { k = kalipCikar(ilkSatirlar(b.maskele(hata))); kalipOnbellegi.set(hata, k); }
    return k;
  };
  /** @type {Map<string, string>} */
  const senaryoAdlari = new Map();
  const kayitlar = satirlar.map((r) => {
    const senaryo = r.senaryo_id != null ? String(r.senaryo_id) : r.senaryo_anahtari != null ? `a:${String(r.senaryo_anahtari)}` : `b:${String(r.senaryo_baslik)}`;
    senaryoAdlari.set(senaryo, String(r.senaryo_baslik));
    let tekrarKosusu = false;
    try { tekrarKosusu = typeof JSON.parse(String(r.ozet_json ?? '{}')).tekrarKaynagi === 'string'; } catch { tekrarKosusu = false; }
    let surum = null;
    try { surum = veriKosusuTemizle(JSON.parse(String(r.ekler_json ?? '{}')).veriKosusu)?.modelSurumu ?? null; } catch { surum = null; }
    const durum = String(r.durum);
    const adim = r.adim != null ? b.maskele(String(r.adim)) : '';
    const kategori = r.hata_kategorisi != null ? String(r.hata_kategorisi) : KATEGORI.diger;
    const kalip = durum === 'basarisiz' ? kalipBul(String(r.hata_mesaji ?? '')) : '';
    return {
      id: String(r.id), kosuId: String(r.kosu_id), kosuTuru: String(r.kosu_turu), kosuBaslangic: ms(r.kosu_baslangic) ?? 0,
      zaman: ms(r.zaman) ?? 0, durum, senaryo, sureMs: r.sure_ms == null ? null : Number(r.sure_ms), ortamId: r.ortam_id == null ? null : String(r.ortam_id),
      hata: r.hata_mesaji == null ? null : String(r.hata_mesaji), adim, kategori, kalip, deneme: Number(r.deneme ?? 0), tekrarKosusu, surum,
      uygulamaSurumu: uygulamaSurumuOku(r.ozet_json)
    };
  });
  const anahtar = ogeAnahtari('ekran', ekranId);
  const parca = (/** @type {{ zaman: number }} */ x) => donemParcasi(donem, x.zaman);
  const D = kayitlar.filter((x) => parca(x) === 'D');
  const O = kayitlar.filter((x) => parca(x) === 'O');
  /** @type {import('./sorun-modeli.mjs').Gozlem[]} */
  const gozlemler = kayitlar.map((x) => ({
    zaman: x.zaman, durum: x.durum, senaryo: x.senaryo, maruz: x.senaryo, ortam: x.ortamId, surum: x.surum, deneme: x.deneme, tekrarKosusu: x.tekrarKosusu,
    uygulamaSurumu: x.uygulamaSurumu,
    ...(x.durum === 'basarisiz' ? { imza: { parcalar: ['ekran', ekranId, x.adim, x.kategori, x.kalip], bilgi: { adim: x.adim, kategori: x.kategori, kalip: x.kalip } } } : {})
  }));
  const kararlilik = kararlilikHesapla(gozlemler.filter((x) => donemParcasi(donem, x.zaman) === 'D'));
  const oncekiKararlilik = kararlilikHesapla(gozlemler.filter((x) => donemParcasi(donem, x.zaman) === 'O'));
  const sorunlar = sorunlariHesapla(gozlemler, donem, { kararlilik, simdi: (b.simdi ?? new Date()).getTime() }).map((s) => {
    const adim = String(s.bilgi.adim ?? '');
    const kategori = String(s.bilgi.kategori ?? '');
    const kisa = kategoriKisaAdi(kategori);
    return sorunSatiri(s, 'ekran', {
      baslik: buyukBas(adim ? `"${adim}" adımında ${kisa}` : `${kisa} (adım bilgisi yok)`), nerede: `${ekranAdi}${adim ? ` › ${adim}` : ''}`,
      kalip: String(s.bilgi.kalip ?? ''), kategori, ogeId: ekranId, ogeAd: ekranAdi
    }, ic.rv);
  });

  // Tam koşu sayıları (başarı oranı yalnız tam koşulardan — Sonuçlar ekranıyla aynı).
  const tamSayilar = (/** @type {typeof kayitlar} */ l) => sayilariTopla(l.filter((x) => x.kosuTuru === 'tam').map((x) => ({ [x.durum]: 1 })));
  const sD = tamSayilar(D);
  const sO = tamSayilar(O);
  const basari = basariYuzdesi(sD);
  const oncekiBasari = basariYuzdesi(sO);
  const tamKosu = (/** @type {typeof kayitlar} */ l) => new Set(l.filter((x) => x.kosuTuru === 'tam').map((x) => x.kosuId)).size;
  const sureler = (/** @type {typeof kayitlar} */ l) => l.filter((x) => x.kosuTuru === 'tam' && (x.durum === 'basarili' || x.durum === 'basarisiz') && x.sureMs !== null)
    .map((x) => /** @type {number} */ (x.sureMs));
  const kararsizSayisi = (/** @type {Map<string, { durum: string }>} */ m) => [...m.values()].filter((x) => x.durum === 'kararsiz').length;
  const acik = sorunlar.filter((s) => s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi');
  const ozet = {
    basari, oncekiBasari, test: sD.basarili + sD.basarisiz + sD.atlanan, oncekiTest: O.length ? sO.basarili + sO.basarisiz + sO.atlanan : null,
    basarisiz: sD.basarisiz, oncekiBasarisiz: O.length ? sO.basarisiz : null, atlanan: sD.atlanan, tamKosu: tamKosu(D), oncekiTamKosu: tamKosu(O),
    ortSure: ortalama(sureler(D)), oncekiOrtSure: ortalama(sureler(O)), kararsizSenaryo: kararsizSayisi(kararlilik),
    oncekiKararsizSenaryo: O.length ? kararsizSayisi(oncekiKararlilik) : null, acikSorun: acik.length,
    tumSonuc: D.length, tekilSonuc: D.filter((x) => x.kosuTuru !== 'tam').length
  };

  // Eğilim (kova başına tam koşu sonuçları).
  const egilimKovalari = donem.kovalar.map((k) => ({ etiket: k.etiket, basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 }));
  for (const x of D) {
    if (x.kosuTuru !== 'tam') continue;
    const i = kovaIndeksi(donem.kovalar, x.zaman);
    if (i >= 0 && x.durum in egilimKovalari[i]) /** @type {any} */ (egilimKovalari[i])[x.durum]++;
  }
  const egilim = {
    kovalar: egilimKovalari.map((k) => ({ etiket: k.etiket, adet: k.basarili + k.basarisiz + k.atlanan, kalan: k.basarisiz, oran: basariYuzdesi(k) })),
    oncekiOrt: oncekiBasari
  };

  // A4: süre eşiği (tam koşu test süresi; p95 > eşik = aştı) ve uygulama sürümüne göre sayım (tam koşu, durdurulan hariç).
  const esikAyari = ic.rv.esik.get(anahtar)?.ms ?? null;
  const esik = esikBilgisi(esikAyari, sureler(D), sureler(O));
  /** @type {Map<string, SurumSayimi>} */
  const surumlar = new Map();
  for (const x of D) if (x.kosuTuru === 'tam' && x.durum !== 'durduruldu') surumSay(surumlar, x.uygulamaSurumu, 'ekran', x.durum, x.zaman);

  // Senaryolar (dönem; tam koşular) + koşuya dahil ama koşmamış senaryolar.
  const tanimli = vt.tumu('SELECT id, baslik, kosuya_dahil FROM senaryolar WHERE ekran_id = ? AND proje_id = ?', [ekranId, g.projeId]);
  for (const t of tanimli) if (!senaryoAdlari.has(String(t.id))) senaryoAdlari.set(String(t.id), String(t.baslik));
  const tamD = D.filter((x) => x.kosuTuru === 'tam');
  const tamO = O.filter((x) => x.kosuTuru === 'tam');
  const senaryoKumesi = new Set([...tamD.map((x) => x.senaryo), ...tanimli.filter((t) => Number(t.kosuya_dahil) === 1).map((t) => String(t.id))]);
  const senaryolar = [...senaryoKumesi].map((sen) => {
    const l = tamD.filter((x) => x.senaryo === sen && x.durum !== 'durduruldu');
    const lo = tamO.filter((x) => x.senaryo === sen && x.durum !== 'durduruldu');
    const s = sayilariTopla(l.map((x) => ({ [x.durum]: 1 })));
    const so = sayilariTopla(lo.map((x) => ({ [x.durum]: 1 })));
    const sure = l.filter((x) => x.durum !== 'atlanan' && x.sureMs !== null).map((x) => /** @type {number} */ (x.sureMs));
    const k = kararlilik.get(sen);
    return {
      anahtar: sen, ad: senaryoAdlari.get(sen) ?? sen, kosu: l.length, basari: basariYuzdesi(s), oncekiBasari: basariYuzdesi(so),
      hepAtlandi: l.length > 0 && s.atlanan === l.length, hicKosmadi: l.length === 0, ortSure: ortalama(sure), p95: yuzdelik(sure, 95),
      kararlilik: k ? { durum: k.durum, oran: k.oran, kosu: k.kosu, degisim: k.degisim } : null,
      // A4: ekranın süre eşiği tanımlıysa senaryonun p95'i eşiği aştı mı (tabloda vurgulanır).
      ...(esikAyari !== null ? { esikAsti: yuzdelik(sure, 95) !== null && Number(yuzdelik(sure, 95)) > esikAyari } : {})
    };
  }).sort((a, c) => (a.basari ?? 101) - (c.basari ?? 101) || a.ad.localeCompare(c.ad, 'tr'));

  // Senaryo matrisi: dönemdeki son 12 tam koşu (eskiden yeniye).
  /** @type {Map<string, number>} */
  const tamKosular = new Map();
  for (const x of tamD) tamKosular.set(x.kosuId, x.kosuBaslangic);
  const siraliKosular = [...tamKosular.entries()].sort((a, c) => a[1] - c[1]);
  const matrisKosulari = ayrinti ? siraliKosular.slice(-EN_COK_MATRIS_KOSUSU) : [];
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const kosuEtiketi = (/** @type {number} */ t) => { const d = new Date(t); return `${iki(d.getDate())}.${iki(d.getMonth() + 1)} ${iki(d.getHours())}:${iki(d.getMinutes())}`; };
  /** Tek tam koşudaki durum: K (en az biri kaldı) · G · A (hepsi atlandı) · "-" (koşmadı). @param {string} kosuId @param {string | null} senaryo */
  const kosuDurumu = (kosuId, senaryo) => {
    const l = tamD.filter((x) => x.kosuId === kosuId && (senaryo === null || x.senaryo === senaryo));
    if (l.some((x) => x.durum === 'basarisiz')) return 'K';
    if (l.some((x) => x.durum === 'basarili')) return 'G';
    if (l.some((x) => x.durum === 'atlanan')) return 'A';
    return '-';
  };
  const matris = {
    etiketler: matrisKosulari.map(([, t]) => kosuEtiketi(t)),
    satirlar: ayrinti ? senaryolar.map((s) => {
      const dizi = matrisKosulari.map(([kosuId]) => kosuDurumu(kosuId, s.anahtar)).join('');
      return { ad: s.ad, dizi, not: matrisNotu(dizi, s) };
    }) : []
  };
  const sonTamKosu = siraliKosular[siraliKosular.length - 1];
  const sonDurum = sonTamKosu ? kosuDurumu(sonTamKosu[0], null) : null;

  // Adım × kova ısı haritası (tüm koşuların kalan sonuçları; her sonuç yalnız ilk başarısız adımına sayılır).
  /** @type {Map<string, number[]>} */
  const isi = new Map();
  for (const x of D) {
    if (!ayrinti || x.durum !== 'basarisiz') continue;
    const ad = x.adim || '(adım bilgisi yok)';
    const seri = isi.get(ad) ?? isi.set(ad, donem.kovalar.map(() => 0)).get(ad);
    const i = kovaIndeksi(donem.kovalar, x.zaman);
    if (seri && i >= 0) seri[i]++;
  }
  const toplam = (/** @type {number[]} */ a) => a.reduce((x, y) => x + y, 0);
  const isiHaritasi = [...isi.entries()].map(([ad, seri]) => ({ ad, seri })).sort((a, c) => toplam(c.seri) - toplam(a.seri)).slice(0, EN_COK_ISI_SATIRI);

  // Son hata (beklenen / görülen) + isteğe bağlı ekran görüntüsü.
  const sonKalan = [...D].reverse().find((x) => x.durum === 'basarisiz') ?? null;
  let sonHata = null;
  if (ayrinti && sonKalan && g.secenekler.hatalar) {
    const maskeli = b.maskele(sonKalan.hata ?? '');
    const bg = beklenenGorulenCikar(maskeli);
    let goruntuler = /** @type {Array<{ ad: string; icerikTuru: string; base64: string }>} */ ([]);
    if (g.secenekler.goruntuler && b.goruntuCoz) {
      const medya = vt.tumu("SELECT id, ad, icerik_turu, boyut FROM medya WHERE sonuc_id = ? AND tur = 'ekran_goruntusu' AND silinme IS NULL AND yedek_disi = 0 ORDER BY sira",
        [sonKalan.id]).map((m) => ({ id: String(m.id), ad: String(m.ad), icerikTuru: String(m.icerik_turu), boyut: Number(m.boyut) }));
      goruntuler = await b.goruntuCoz(medya);
    }
    sonHata = {
      senaryo: senaryoAdlari.get(sonKalan.senaryo) ?? '', adim: sonKalan.adim, zaman: iso(sonKalan.zaman), ortam: sonKalan.ortamId ? ortamAdlari.get(sonKalan.ortamId) ?? null : null,
      beklenen: bg?.beklenen ?? null, gorulen: bg?.gorulen ?? null, metin: ilkSatirlar(maskeli), goruntuler
    };
  }

  // Koşuda yakalanan BEKLENMEYEN mesajlar (dönemdeki sonuçlar; kaynak + kalıp).
  const yakalanan = ayrinti ? yakalananMesajlar(vt, D.map((x) => x.id), new Set(D.filter((x) => x.durum === 'basarisiz').map((x) => x.id)), b.maskele) : [];

  // Kapsam.
  const dSenaryolari = new Set(D.map((x) => x.senaryo));
  const model = vt.tek('SELECT surum, olusturulma FROM ekran_modelleri WHERE ekran_id = ? ORDER BY surum DESC LIMIT 1', [ekranId]);
  const kapsam = {
    senaryo: tanimli.length, kosuyaDahil: tanimli.filter((t) => Number(t.kosuya_dahil) === 1).length,
    hicKosmayan: tanimli.filter((t) => Number(t.kosuya_dahil) === 1 && !dSenaryolari.has(String(t.id))).length,
    hepAtlanan: senaryolar.filter((s) => s.hepAtlandi).length,
    modelSurumu: model ? { surum: Number(model.surum), tarih: String(model.olusturulma) } : null
  };

  // Ek aksiyon: her koşuda atlanan senaryolar (sabit puanlı P3).
  // A4: sahip önerisi ekip eşlemesinden (yoksa sınıfın varsayılanı); süre eşiği aşıldıysa (p95 > eşik) sabit puanlı ek aksiyon.
  const ekip = ic.rv.ekip.get(anahtar);
  const ekAksiyonlar = [
    ...senaryolar.filter((s) => s.hepAtlandi).map((s) => ({
      tur: 'ek', baslik: `"${s.ad}" her koşuda atlandı`, nerede: ekranAdi, sinif: 'veri', durum: 'suregelen', puan: EK_AKSIYON_PUANI, bant: bant(EK_AKSIYON_PUANI),
      aksiyon: 'Senaryonun atlanma nedenini (koşul, eksik test verisi) inceleyin.', sahip: ekip ?? sahipOnerisi('veri'), neden: `${s.kosu} koşunun hepsinde atlandı`,
      dayanak: 'Senaryo dönemde hiç koşmadı (atlandı).'
    })),
    ...(esik?.asti ? [esikAksiyonu({ ad: ekranAdi, nerede: `${ekranAdi} (test süresi)`, tur: 'ekran', bilgi: esik, sahip: ekip ?? sahipOnerisi('uygulama') })] : [])
  ];
  // A4: kritik işaretli ekran son tam koşusunda kaldıysa rozet Kritik.
  const kritik = ic.rv.kritik.has(anahtar);
  const son = ortakSonuc(sorunlar, ekAksiyonlar, {
    basari, oncekiBasari, esikler: ic.esikler, aksiyonSayisi: ic.aksiyonSayisi, karsilastir: g.karsilastir, kosuVar: D.length > 0,
    kritikKalanlar: kritik && sonDurum === 'K' ? [ekranAdi] : []
  });
  return {
    bolum: {
      oge: { id: ekranId, ad: ekranAdi, senaryoSayisi: tanimli.length }, kosuVar: D.length > 0, ozet, sorunlar, ...son, egilim,
      ekran: { senaryolar, matris, isiHaritasi, sonHata, yakalanan, kapsam, ...(esik ? { esik } : {}) }
    },
    // Çoklu rapor için toplanabilir ham değerler (rapora yazılmaz).
    ham: {
      sD, sO, oncekiVar: O.length > 0, kovalar: egilimKovalari, sureD: sureler(D), sureO: sureler(O),
      tamKosuD: new Set(tamD.map((x) => x.kosuId)), tamKosuO: new Set(tamO.map((x) => x.kosuId)), ekAksiyonlar, son: sonDurum,
      ortamSayilari: ortamSayilari(tamD), kritik, esik, surumlar
    }
  };
}

/**
 * Senaryo matrisinin değerlendirme notu.
 * @param {string} dizi @param {{ hepAtlandi: boolean; hicKosmadi: boolean; kararlilik: { durum: string; oran: number } | null }} s
 */
function matrisNotu(dizi, s) {
  if (s.hicKosmadi) return 'Dönemde koşmadı';
  if (s.hepAtlandi) return 'Her koşuda atlandı';
  if (s.kararlilik?.durum === 'kararsiz') return `≈ Kararsız (değişim %${Math.round(s.kararlilik.oran * 100)})`;
  const kosan = [...dizi].filter((c) => c === 'G' || c === 'K');
  if (kosan.length && kosan.every((c) => c === 'K')) return 'Her koşuda kaldı';
  if (kosan.length >= 2 && kosan[kosan.length - 1] === 'K' && kosan[kosan.length - 2] === 'G') return 'Son koşuda kaldı';
  if (kosan.length >= 2 && kosan[kosan.length - 1] === 'G' && kosan.includes('K')) return 'Son koşularda geçiyor';
  return '';
}

/**
 * @param {Veritabani} vt @param {string[]} sonucIdleri @param {Set<string>} kalanlar @param {(m: unknown) => string} maskele
 */
function yakalananMesajlar(vt, sonucIdleri, kalanlar, maskele) {
  /** @type {Map<string, { kaynak: string; kalip: string; ornek: string; sayi: number; testler: Set<string>; kalanTest: Set<string> }>} */
  const gruplar = new Map();
  for (let i = 0; i < sonucIdleri.length; i += 500) {
    const parca = sonucIdleri.slice(i, i + 500);
    for (const m of vt.tumu(`SELECT sonuc_id, kaynak, metin, kalip, sayi FROM yakalanan_mesajlar WHERE beklenen = 0 AND sonuc_id IN (${parca.map(() => '?').join(', ')})`, parca)) {
      const ornek = maskele(String(m.metin));
      const kalip = kalipCikar(ornek);
      const a = `${String(m.kaynak)}\u0000${kalip}`;
      const x = gruplar.get(a) ?? { kaynak: String(m.kaynak), kalip, ornek, sayi: 0, testler: new Set(), kalanTest: new Set() };
      gruplar.set(a, x);
      x.sayi += Math.max(1, Number(m.sayi) || 1);
      x.testler.add(String(m.sonuc_id));
      if (kalanlar.has(String(m.sonuc_id))) x.kalanTest.add(String(m.sonuc_id));
    }
  }
  return [...gruplar.values()].map((x) => ({ kaynak: x.kaynak, kalip: x.kalip, sayi: x.sayi, test: x.testler.size, kalanTest: x.kalanTest.size }))
    .sort((a, c) => c.test - a.test || c.sayi - a.sayi).slice(0, EN_COK_YAKALANAN);
}

// ---------------------------------------------------------------------------------------------------------------------------
// TEK SERVİS
// ---------------------------------------------------------------------------------------------------------------------------

/** Kontrol türlerinin görünen adı (kalıpta DEĞER yok: yalnız tür ve yol). */
export const KONTROL_ETIKETLERI = Object.freeze({
  durumKodu: 'HTTP durum kodu', soapYaniti: 'SOAP zarfı', soapHatasiYok: 'SOAP hatası yok', soapHatasi: 'SOAP hatası döner', icerir: 'Yanıtta geçer',
  icermez: 'Yanıtta geçmez', xpathEsit: 'XPath eşit', jsonEsit: 'JSON eşit', veya: 'VEYA', dosya: 'Dosya', sozlesme: 'Yanıt sözleşmesi',
  yanitAlani: 'Yanıt alanı', altinYanit: 'Altın yanıt', yanitSuresi: 'Yanıt süresi'
});

/**
 * Kontrolün değersiz etiketi: XPath / JSON yolunda "yol = "değer"" adının yalnız yol kısmı; diğerlerinde tür adı.
 * @param {{ tur?: unknown; ad?: unknown }} k
 */
export function kontrolEtiketi(k) {
  const tur = String(k.tur ?? '');
  const etiket = /** @type {Record<string, string>} */ (KONTROL_ETIKETLERI)[tur] ?? 'Kontrol';
  const ad = String(k.ad ?? '');
  if ((tur === 'xpathEsit' || tur === 'jsonEsit') && ad.includes(' = "')) return `${etiket}: ${ad.replace(/^JSON /, '').split(' = "')[0]}`;
  return etiket;
}

/**
 * Servis çağrısının metodu: REST "YÖNTEM yol" (sorgu dizesi olmadan), SOAP operasyon adı.
 * @param {Record<string, any> | undefined} icerik
 */
export function servisMetodu(icerik) {
  if (!icerik || typeof icerik !== 'object') return '(senaryo silinmiş)';
  if (icerik.tur === 'akis') return '(akış senaryosu)';
  if (icerik.http && typeof icerik.http.metot === 'string') return `${icerik.http.metot} ${String(icerik.http.yol ?? '').split('?')[0] || '/'}`;
  return typeof icerik.operasyon === 'string' && icerik.operasyon ? icerik.operasyon : '(bilinmiyor)';
}

/**
 * Başarısız / hata veren çağrının hata türü ve kalıbı (maskeli; değer içermez).
 * @param {string} durum @param {Record<string, any>} sonuc @param {(m: unknown) => string} maskele
 * @returns {{ hataTuru: string; kalip: string }}
 */
export function servisHatasi(durum, sonuc, maskele) {
  const kontroller = Array.isArray(sonuc.kontroller) ? sonuc.kontroller.filter((k) => k && typeof k === 'object') : [];
  if (durum === 'hata') {
    const m = String(sonuc.hata ?? '');
    return { hataTuru: /zaman aşımı|timeout|timed out|süre aşıldı/i.test(m) ? 'zaman' : 'baglanti', kalip: kalipCikar(ilkSatirlar(maskele(m))) };
  }
  const kalanlar = kontroller.filter((k) => !k.gecti);
  const fault = kontroller.some((k) => !k.gecti && (k.tur === 'soapHatasiYok' || (typeof k.aciklama === 'string' && k.aciklama.startsWith('SOAP hatası:'))));
  const kod = Number(sonuc.durumKodu) || 0;
  const hataTuru = fault ? 'fault' : kod >= 500 ? 'h5' : kod >= 400 ? 'h4' : 'kontrol';
  const kalip = kalanlar.length ? kalipCikar(maskele(kontrolEtiketi(kalanlar[0]))) : sonuc.hata ? kalipCikar(ilkSatirlar(maskele(String(sonuc.hata)))) : kod ? `HTTP ${kod}` : 'Mesaj yok / boş hata';
  return { hataTuru, kalip };
}

/**
 * Tek servisin rapor bölümleri (bolum) + çoklu raporda toplanacak ham sayılar (ham).
 * @param {Ic} ic @param {string} servisId
 */
function servisHesabi(ic, servisId) {
  const { vt, g, b, donem } = ic;
  const servis = servisGetir(vt, servisId);
  if (!servis || servis.projeId !== g.projeId) throw new DepoHatasi('Servis bulunamadı.');
  const senaryolar = servisSenaryolariniListele(vt, servisId);
  const senaryoMetotlari = new Map(senaryolar.map((s) => [s.id, servisMetodu(/** @type {any} */ (s.icerik))]));
  const senaryoAdi = new Map(senaryolar.map((s) => [s.id, s.baslik]));
  // Akış adımı satırları proje başınadır: çoklu raporda bir kez okunur.
  const adimSatirlari = ic.adimSatirlari ?? (ic.adimSatirlari = akisAdimSatirlari(vt, g.projeId));
  const kosullar = ['proje_id = ?', 'servis_id = ?', "tur = 'kosu'", 'baslangic >= ?', 'baslangic < ?'];
  const p = [g.projeId, servisId, donem.geriBakisBas.toISOString(), donem.bit.toISOString()];
  if (g.ortamId) { kosullar.push('ortam_id = ?'); p.push(g.ortamId); }
  const satirlar = vt.tumu(`SELECT id, senaryo_id, ortam_id, durum, baslangic, sure_ms, baslik, uygulama_surumu FROM servis_kosulari WHERE ${kosullar.join(' AND ')} ORDER BY baslangic`, p)
    .filter((r) => !adimSatirlari.has(String(r.id)));
  /** @type {Map<string, { toplam: number; gecen: number; etiket: string }>} */
  const kontrolTurleri = new Map();
  /** @type {Map<string, number>} */
  const kalanKontroller = new Map();
  const kayitlar = satirlar.map((r) => {
    const zaman = ms(r.baslangic) ?? 0;
    const parca = donemParcasi(donem, zaman);
    const durum = String(r.durum);
    const senaryoId = r.senaryo_id == null ? null : String(r.senaryo_id);
    const metot = senaryoId ? senaryoMetotlari.get(senaryoId) ?? '(senaryo silinmiş)' : '(senaryo silinmiş)';
    const senaryo = senaryoId ?? `b:${String(r.baslik)}`;
    let hata = null;
    // Şifreli sonuç yalnız gerekince çözülür: dönemdeki her çağrı (kontrol türleri) ve önceki dönemlerin kalan çağrıları (imza).
    if (parca === 'D' || durum !== 'basarili') {
      const kayit = servisKosusuGetir(vt, String(r.id));
      const sonuc = /** @type {Record<string, any>} */ (kayit?.sonuc ?? {});
      if (durum !== 'basarili') hata = servisHatasi(durum, sonuc, b.maskele);
      if (parca === 'D') {
        for (const k of Array.isArray(sonuc.kontroller) ? sonuc.kontroller : []) {
          if (!k || typeof k !== 'object') continue;
          const tur = String(k.tur ?? '');
          const t = kontrolTurleri.get(tur) ?? { toplam: 0, gecen: 0, etiket: /** @type {Record<string, string>} */ (KONTROL_ETIKETLERI)[tur] ?? 'Kontrol' };
          kontrolTurleri.set(tur, t);
          t.toplam++;
          if (k.gecti) t.gecen++;
          else { const e = b.maskele(kontrolEtiketi(k)); kalanKontroller.set(e, (kalanKontroller.get(e) ?? 0) + 1); }
        }
      }
    }
    return {
      id: String(r.id), zaman, parca, durum, senaryo, metot, sureMs: Number(r.sure_ms) || 0, ortamId: r.ortam_id == null ? null : String(r.ortam_id), hata,
      uygulamaSurumu: r.uygulama_surumu == null ? null : String(r.uygulama_surumu)
    };
  });
  const anahtar = ogeAnahtari('servis', servisId);
  const D = kayitlar.filter((x) => x.parca === 'D');
  const O = kayitlar.filter((x) => x.parca === 'O');
  /** @type {import('./sorun-modeli.mjs').Gozlem[]} */
  const gozlemler = kayitlar.map((x) => ({
    zaman: x.zaman, durum: x.durum, senaryo: x.senaryo, maruz: x.metot, ortam: x.ortamId, uygulamaSurumu: x.uygulamaSurumu,
    ...(x.hata ? { imza: { parcalar: ['servis', servisId, x.metot, x.hata.hataTuru, x.hata.kalip], bilgi: { metot: x.metot, hataTuru: x.hata.hataTuru, kalip: x.hata.kalip } } } : {})
  }));
  const hataTuruAdi = Object.fromEntries(SERVIS_HATA_TURLERI);
  const kararlilik = kararlilikHesapla(gozlemler.filter((x) => donemParcasi(donem, x.zaman) === 'D'));
  const sorunlar = sorunlariHesapla(gozlemler, donem, { kararlilik, simdi: (b.simdi ?? new Date()).getTime() }).map((s) => {
    const metot = String(s.bilgi.metot ?? '');
    const hataTuru = String(s.bilgi.hataTuru ?? 'kontrol');
    return sorunSatiri(s, 'servis', {
      baslik: `${metot}: ${String(hataTuruAdi[hataTuru] ?? 'Hata')}`, nerede: `${servis.ad} › ${metot}`, kalip: String(s.bilgi.kalip ?? ''), hataTuru,
      ogeId: servisId, ogeAd: servis.ad
    }, ic.rv);
  });
  const sayi = (/** @type {typeof kayitlar} */ l) => {
    const s = { basarili: 0, basarisiz: 0, atlanan: 0, hata: 0 };
    for (const x of l) if (x.durum in s) /** @type {any} */ (s)[x.durum]++;
    return s;
  };
  const sD = sayi(D);
  const sO = sayi(O);
  const sureListesi = (/** @type {typeof kayitlar} */ l) => l.filter((x) => x.durum !== 'hata').map((x) => x.sureMs);

  // Metotlar. A4: süre eşiği = metodun kendi eşiği, yoksa servisin eşiği (Ayarlar > Raporlar); tanımlıysa "esik" alanı eklenir.
  const esikAyari = ic.rv.esik.get(anahtar) ?? null;
  const metotAdlari = [...new Set([...D.map((x) => x.metot), ...senaryolar.map((s) => /** @type {string} */ (senaryoMetotlari.get(s.id)))])];
  const metotlar = metotAdlari.map((ad) => {
    const l = D.filter((x) => x.metot === ad);
    const lo = O.filter((x) => x.metot === ad);
    const y = yuzdelikler(sureListesi(l));
    const yo = yuzdelikler(sureListesi(lo));
    const s = sayi(l);
    const sonCagri = l[l.length - 1];
    const esik = esikBilgisi(esikAyari ? esikAyari.metotlar[ad] ?? esikAyari.ms : null, sureListesi(l), sureListesi(lo));
    return {
      ad, senaryo: senaryolar.filter((x) => senaryoMetotlari.get(x.id) === ad).length, cagri: l.length, basari: basariYuzdesi(s),
      oncekiBasari: basariYuzdesi(sayi(lo)), p50: y.p50, p95: y.p95, p99: y.p99, n: y.n, oncekiP95: yo.p95, yavas: yavasladiMi(y.p95, yo.p95, y.n),
      son: sonCagri ? (sonCagri.durum === 'basarili' ? 'G' : 'K') : null, kalan: s.basarisiz + s.hata,
      ...(esik ? { esik: { ...esik, kaynak: esikAyari && esikAyari.metotlar[ad] !== undefined ? /** @type {const} */ ('metot') : /** @type {const} */ ('servis') } } : {})
    };
  }).sort((a, c) => c.cagri - a.cagri || a.ad.localeCompare(c.ad, 'tr'));
  /** @type {Map<string, SurumSayimi>} */
  const surumlar = new Map();
  for (const x of D) surumSay(surumlar, x.uygulamaSurumu, 'servis', x.durum, x.zaman);

  // Metot × hata türü.
  const hataMatrisi = metotlar.map((m) => {
    /** @type {Record<string, number>} */
    const sayilar = Object.fromEntries(SERVIS_HATA_TURLERI.map(([t]) => [t, 0]));
    for (const x of D) if (x.metot === m.ad && x.hata) sayilar[x.hata.hataTuru]++;
    return { metot: m.ad, sayilar, toplam: Object.values(sayilar).reduce((a, c) => a + c, 0), onceki: O.filter((x) => x.metot === m.ad && x.hata).length };
  }).filter((x) => x.toplam > 0 || x.onceki > 0);

  // Eğilim ve süre eğilimi (kova başına).
  const kovaListesi = donem.kovalar.map(() => /** @type {typeof kayitlar} */ ([]));
  for (const x of D) { const i = kovaIndeksi(donem.kovalar, x.zaman); if (i >= 0) kovaListesi[i].push(x); }
  const egilim = {
    kovalar: kovaListesi.map((l, i) => { const s = sayi(l); return { etiket: donem.kovalar[i].etiket, adet: l.length, kalan: s.basarisiz + s.hata, oran: basariYuzdesi(s) }; }),
    oncekiOrt: basariYuzdesi(sO)
  };
  const sureEgilimi = {
    p50: kovaListesi.map((l) => yuzdelik(sureListesi(l), 50)), p95: kovaListesi.map((l) => yuzdelik(sureListesi(l), 95)),
    oncekiP95: yuzdelik(sureListesi(O), 95),
    // A4: servisin süre eşiği (grafikte çizgi; metot eşikleri metot tablosunda).
    ...(esikAyari?.ms ? { esik: esikAyari.ms } : {})
  };

  // Bu servisi kullanan servis akışları (koşu türü).
  const akislar = akislariHesapla(ic, new Set([servisId]));

  const basari = basariYuzdesi(sD);
  const oncekiBasari = basariYuzdesi(sO);
  const enYavas = metotlar.filter((m) => m.p95 !== null).sort((a, c) => /** @type {number} */ (c.p95) - /** @type {number} */ (a.p95))[0] ?? null;
  const acik = sorunlar.filter((s) => s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi');
  const ozet = {
    basari, oncekiBasari, cagri: D.length, oncekiCagri: O.length ? O.length : null, kalan: sD.basarisiz + sD.hata, oncekiKalan: O.length ? sO.basarisiz + sO.hata : null,
    enYavas: enYavas ? { metot: enYavas.ad, p95: enYavas.p95, oncekiP95: enYavas.oncekiP95 } : null, yavaslayan: metotlar.filter((m) => m.yavas).length,
    acikSorun: acik.length, kararsizSenaryo: [...kararlilik.values()].filter((x) => x.durum === 'kararsiz').length
  };
  // A4: süre eşiğini aşan metotlar (p95 > eşik) sabit puanlı ek aksiyon; kritik servis / servisi kullanan kritik akış son koşusunda
  // kaldıysa rozet Kritik.
  const ekip = ic.rv.ekip.get(anahtar);
  const ekAksiyonlar = metotlar.filter((m) => m.esik?.asti).map((m) => esikAksiyonu({
    ad: `${servis.ad} › ${m.ad}`, nerede: `${servis.ad} › ${m.ad}`, tur: 'servis', bilgi: /** @type {NonNullable<typeof m.esik>} */ (m.esik), sahip: ekip ?? sahipOnerisi('uygulama')
  }));
  const sonCagri = D[D.length - 1];
  const sonDurum = sonCagri ? (sonCagri.durum === 'basarili' ? 'G' : 'K') : null;
  const kritik = ic.rv.kritik.has(anahtar);
  const son = ortakSonuc(sorunlar, ekAksiyonlar, {
    basari, oncekiBasari, esikler: ic.esikler, aksiyonSayisi: ic.aksiyonSayisi, karsilastir: g.karsilastir, kosuVar: D.length > 0,
    kritikKalanlar: [...(kritik && sonDurum === 'K' ? [servis.ad] : []), ...akislar.filter((a) => a.kritik && a.son === 'K').map((a) => a.ad)]
  });
  const kontrolListesi = [...kontrolTurleri.entries()].map(([tur, x]) => ({ tur, etiket: x.etiket, toplam: x.toplam, gecen: x.gecen }))
    .sort((a, c) => c.toplam - a.toplam);
  return {
    bolum: {
      oge: { id: servisId, ad: servis.ad, servisTuru: servis.tur, senaryoSayisi: senaryolar.length, metotSayisi: metotAdlari.length }, kosuVar: D.length > 0, ozet, sorunlar, ...son, egilim,
      servis: {
        metotlar, hataMatrisi, sureEgilimi, kontrolTurleri: kontrolListesi,
        kalanKontroller: [...kalanKontroller.entries()].map(([etiket, sayi]) => ({ etiket, sayi })).sort((a, c) => c.sayi - a.sayi).slice(0, EN_COK_KALAN_KONTROL),
        akislar
      }
    },
    // Çoklu rapor için toplanabilir ham değerler (rapora yazılmaz).
    ham: {
      sD, sO, oncekiVar: O.length > 0, kovalar: kovaListesi.map((l) => sayi(l)), kovaSureleri: kovaListesi.map((l) => sureListesi(l)),
      sureO: sureListesi(O), son: sonDurum, ortamSayilari: ortamSayilari(D), ekAksiyonlar, kritik, surumlar,
      kararlilik: [...kararlilik.entries()].map(([sen, k]) => ({ ad: senaryoAdi.get(sen) ?? sen.replace(/^b:/, ''), ...k })),
      metotKapsami: metotKapsami(servis.ayarlar?.operasyonlar, senaryolar.map((x) => ({ operasyon: x.icerik?.operasyon, metot: servisMetodu(/** @type {any} */ (x.icerik)) })))
    }
  };
}

/**
 * Seçilen servislerden en az birini kullanan servis akışları (koşu türü; dönem ve önceki dönem). servisIdleri null: projenin tüm
 * servis akışları, oturum akışları ve uçtan uca akışları (genel rapor).
 * @param {Ic} ic @param {Set<string> | null} servisIdleri
 */
function akislariHesapla(ic, servisIdleri) {
  const { vt, g, donem } = ic;
  return servisAkislariniListele(vt, g.projeId)
    .filter((a) => Array.isArray(a.icerik?.adimlar) && (servisIdleri === null || a.icerik.adimlar.some((/** @type {any} */ x) => x && servisIdleri.has(x.servisId))))
    .map((a) => {
      const k = vt.tumu(`SELECT durum, baslangic, sure_ms FROM servis_akis_kosulari WHERE akis_id = ? AND tur = 'kosu' AND baslangic >= ? AND baslangic < ?${g.ortamId ? ' AND ortam_id = ?' : ''} ORDER BY baslangic`,
        [a.id, donem.onceki.bas.toISOString(), donem.bit.toISOString(), ...(g.ortamId ? [g.ortamId] : [])]);
      const d = k.filter((x) => (ms(x.baslangic) ?? 0) >= donem.bas.getTime());
      const o = k.filter((x) => (ms(x.baslangic) ?? 0) < donem.bas.getTime());
      const son = d[d.length - 1];
      return {
        id: a.id, ad: a.baslik, tur: /** @type {any} */ (a.icerik).uctanUca === true ? 'Uçtan uca akış' : a.tur === 'oturum' ? 'Oturum akışı' : 'Servis akışı',
        adim: a.icerik.adimlar.length, kosu: d.length, basarili: d.filter((x) => x.durum === 'basarili').length,
        oncekiKosu: o.length, oncekiBasarili: o.filter((x) => x.durum === 'basarili').length,
        basari: oranYuzde(d.filter((x) => x.durum === 'basarili').length, d.length), oncekiBasari: oranYuzde(o.filter((x) => x.durum === 'basarili').length, o.length),
        ortSure: ortalama(d.map((x) => Number(x.sure_ms) || 0)), son: son ? (son.durum === 'basarili' ? 'G' : 'K') : null,
        // A4: kritik işaretli akış (Ayarlar > Raporlar); son koşusunda kaldıysa rapor rozeti Kritik.
        ...(ic.rv.kritik.has(ogeAnahtari('akis', a.id)) ? { kritik: true } : {})
      };
    });
}

// ---------------------------------------------------------------------------------------------------------------------------
// ÇOKLU EKRAN / ÇOKLU SERVİS / EKRAN + SERVİS (A2)
// ---------------------------------------------------------------------------------------------------------------------------

/** Çoklu raporda en çok öğe (ekran + servis). */
export const EN_COK_OGE = 100;
/** Genel raporda en çok öğe (tüm ekranlar + tüm servisler; seçim yapılmadığından çoklu sınırından geniştir). */
export const EN_COK_GENEL_OGE = 500;
const EN_COK_ADIM = 6;

/**
 * Seçimin öğeleri. "Tümü" seçiliyse rapor anındaki tüm ekranlar (silinmiş hariç) / servisler; değilse verilen kimliklerden bu
 * projede bulunanlar (proje sırasıyla). Sonradan silinen öğe atlanır ve "eksik" sayılır (yeniden oluşturmada rapor yine üretilir).
 * @param {Ic} ic
 */
function secimiCoz(ic) {
  const { vt, g } = ic;
  const genel = g.kapsam === 'genel';
  const ekranGerek = genel || g.kapsam === 'coklu-ekran' || g.kapsam === 'karisik';
  const servisGerek = genel || g.kapsam === 'coklu-servis' || g.kapsam === 'karisik';
  let eksik = 0;
  /** @template {{ id: string }} T @param {T[]} tum @param {boolean | undefined} hepsi @param {string[] | undefined} idler @returns {T[]} */
  const sec = (tum, hepsi, idler) => {
    if (hepsi || genel) return tum;
    const istenen = new Set(idler ?? []);
    const bulunan = tum.filter((x) => istenen.has(x.id));
    eksik += istenen.size - bulunan.length;
    return bulunan;
  };
  const tumEkranlar = ekranGerek
    ? vt.tumu('SELECT id, ad, durum FROM ekranlar WHERE proje_id = ? ORDER BY (sira IS NULL), sira, ad', [g.projeId])
      .filter((e) => !(g.tumEkranlar || genel) || e.durum !== 'silindi').map((e) => ({ id: String(e.id), ad: String(e.ad) }))
    : [];
  const tumServisler = servisGerek ? servisleriListele(vt, g.projeId).map((s) => ({ id: s.id, ad: s.ad, tur: s.tur })) : [];
  const ekranlar = ekranGerek ? sec(tumEkranlar, g.tumEkranlar, g.ekranIdleri) : [];
  const servisler = servisGerek ? sec(tumServisler, g.tumServisler, g.servisIdleri) : [];
  if (genel) {
    // Genel rapor: iki taraftan biri boş olabilir (yalnız ekranları ya da yalnız servisleri olan proje).
    if (!ekranlar.length && !servisler.length) throw new DepoHatasi('Projede ekran ya da servis yok.');
    if (ekranlar.length + servisler.length > EN_COK_GENEL_OGE) throw new DepoHatasi(`Genel rapor en çok ${EN_COK_GENEL_OGE} öğeli projede alınabilir.`);
    return { ekranlar, servisler, eksik };
  }
  if (ekranGerek && !ekranlar.length) throw new DepoHatasi(g.tumEkranlar ? 'Projede ekran yok.' : 'Seçilen ekranlar bulunamadı.');
  if (servisGerek && !servisler.length) throw new DepoHatasi(g.tumServisler ? 'Projede servis yok.' : 'Seçilen servisler bulunamadı.');
  if (ekranlar.length + servisler.length > EN_COK_OGE) throw new DepoHatasi(`Bir raporda en çok ${EN_COK_OGE} öğe olabilir.`);
  return { ekranlar, servisler, eksik };
}

/** Ölçüm dizilerinin birleşimi. @param {ReadonlyArray<ReadonlyArray<number>>} l */
const birlestir = (l) => l.flat();
/** @param {number | null} n */
const yuzdeMetni = (n) => (n === null ? '—' : `%${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`);

/**
 * Ekran tarafı: seçilen ekranların toplamı, karşılaştırma tablosu (sağlık sırasıyla) ve kapsam.
 * @param {Ic} ic @param {Array<Awaited<ReturnType<typeof ekranHesabi>>>} liste
 */
function ekranTarafi(ic, liste) {
  const { donem } = ic;
  const oz = birlesikOzet(liste.map((x) => x.ham.sD), liste.map((x) => x.ham.sO));
  const kovalar = kovalariBirlestir(liste.map((x) => x.ham.kovalar), donem.kovalar.length);
  const birlesim = (/** @type {Array<Set<string>>} */ l) => new Set(l.flatMap((s) => [...s])).size;
  const oncekiVar = liste.some((x) => x.ham.oncekiVar);
  const ogeler = saglikSiralamasi(liste.map(({ bolum: v, ham }) => ({
    id: v.oge.id, ad: v.oge.ad, senaryo: v.oge.senaryoSayisi, test: v.ozet.test, oncekiTest: v.ozet.oncekiTest, basarisiz: v.ozet.basarisiz,
    oncekiBasarisiz: v.ozet.oncekiBasarisiz, atlanan: v.ozet.atlanan, basari: v.ozet.basari, oncekiBasari: v.ozet.oncekiBasari, tamKosu: v.ozet.tamKosu,
    oranSeri: v.egilim.kovalar.map((k) => k.oran), son: ham.son, kapsam: v.ekran.kapsam, ...sorunSayimi(v.sorunlar),
    // A4: kritik işaretli ekran (son tam koşusunda kaldıysa öğe rozeti Kritik) ve süre eşiği.
    ...(ham.kritik ? { kritik: true, kritikKaldi: ham.son === 'K' } : {}), ...(ham.esik ? { esik: ham.esik } : {})
  })), ic.esikler);
  const hatasiz = (/** @type {'simdi' | 'onceki'} */ d) => ogeler.filter((o) => (d === 'simdi' ? o.test > 0 && o.basarisiz === 0 : (o.oncekiTest ?? 0) > 0 && o.oncekiBasarisiz === 0)).length;
  const sorunlar = liste.flatMap((x) => x.bolum.sorunlar);
  const ozet = {
    basari: oz.basari, oncekiBasari: oz.oncekiBasari, test: oz.adet, oncekiTest: oz.oncekiAdet, basarisiz: oz.sayilar.basarisiz,
    oncekiBasarisiz: oncekiVar ? oz.oncekiSayilar.basarisiz : null, atlanan: oz.sayilar.atlanan,
    tamKosu: birlesim(liste.map((x) => x.ham.tamKosuD)), oncekiTamKosu: birlesim(liste.map((x) => x.ham.tamKosuO)),
    ortSure: ortalama(birlestir(liste.map((x) => x.ham.sureD))), oncekiOrtSure: ortalama(birlestir(liste.map((x) => x.ham.sureO))),
    kararsizSenaryo: liste.reduce((a, x) => a + x.bolum.ozet.kararsizSenaryo, 0),
    oncekiKararsizSenaryo: oncekiVar ? liste.reduce((a, x) => a + (x.bolum.ozet.oncekiKararsizSenaryo ?? 0), 0) : null,
    acikSorun: sorunlar.filter((s) => s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi').length,
    ogeSayisi: liste.length, senaryoSayisi: liste.reduce((a, x) => a + x.bolum.oge.senaryoSayisi, 0),
    hatasizOge: hatasiz('simdi'), oncekiHatasizOge: oncekiVar ? hatasiz('onceki') : null,
    tumSonuc: liste.reduce((a, x) => a + x.bolum.ozet.tumSonuc, 0), tekilSonuc: liste.reduce((a, x) => a + x.bolum.ozet.tekilSonuc, 0)
  };
  return {
    ozet, sorunlar, ekAksiyonlar: liste.flatMap((x) => x.ham.ekAksiyonlar), kosuVar: liste.some((x) => x.bolum.kosuVar), ogeler,
    egilim: { kovalar: kovalar.map((k, i) => ({ etiket: donem.kovalar[i].etiket, adet: k.adet, kalan: k.kalan, oran: k.oran })), oncekiOrt: oz.oncekiBasari }
  };
}

/**
 * Servis tarafı: seçilen servislerin toplamı, karşılaştırma tablosu (sağlık sırasıyla), metotlar, süre ve hata türleri, akışlar.
 * @param {Ic} ic @param {Array<ReturnType<typeof servisHesabi>>} liste
 */
function servisTarafi(ic, liste) {
  const { donem } = ic;
  const oz = birlesikOzet(liste.map((x) => x.ham.sD), liste.map((x) => x.ham.sO));
  const kovalar = kovalariBirlestir(liste.map((x) => x.ham.kovalar), donem.kovalar.length);
  const enBuyuk = (/** @type {Array<number | null>} */ l) => { const d = l.filter((v) => v !== null).map(Number); return d.length ? Math.max(...d) : null; };
  const metotlar = liste.flatMap((x) => x.bolum.servis.metotlar.map((m) => ({ ...m, servis: x.bolum.oge.ad, servisId: x.bolum.oge.id })));
  const ogeler = saglikSiralamasi(liste.map(({ bolum: v, ham }) => ({
    id: v.oge.id, ad: v.oge.ad, tur: v.oge.servisTuru, metot: v.oge.metotSayisi, senaryo: v.oge.senaryoSayisi, cagri: v.ozet.cagri, oncekiCagri: v.ozet.oncekiCagri,
    kalan: v.ozet.kalan, oncekiKalan: v.ozet.oncekiKalan, basari: v.ozet.basari, oncekiBasari: v.ozet.oncekiBasari,
    p95: enBuyuk(v.servis.metotlar.map((m) => m.p95)), oncekiP95: enBuyuk(v.servis.metotlar.map((m) => m.oncekiP95)), yavaslayan: v.ozet.yavaslayan,
    oranSeri: v.egilim.kovalar.map((k) => k.oran), son: ham.son, ...sorunSayimi(v.sorunlar),
    // A4: kritik işaretli servis (son çağrısı kaldıysa öğe rozeti Kritik) ve eşiği aşan metot sayısı.
    ...(ham.kritik ? { kritik: true, kritikKaldi: ham.son === 'K' } : {}),
    ...(v.servis.metotlar.some((m) => m.esik) ? { esikAsan: v.servis.metotlar.filter((m) => m.esik?.asti).length } : {})
  })), ic.esikler);
  const akislar = akislariHesapla(ic, new Set(liste.map((x) => x.bolum.oge.id)));
  const akisKosu = akislar.reduce((a, x) => a + x.kosu, 0);
  const enYavas = metotlar.filter((m) => m.p95 !== null).sort((a, c) => Number(c.p95) - Number(a.p95))[0] ?? null;
  const sorunlar = liste.flatMap((x) => x.bolum.sorunlar);
  const oncekiVar = liste.some((x) => x.ham.oncekiVar);
  const ozet = {
    basari: oz.basari, oncekiBasari: oz.oncekiBasari, cagri: oz.adet, oncekiCagri: oz.oncekiAdet, kalan: oz.sayilar.basarisiz + oz.sayilar.hata,
    oncekiKalan: oncekiVar ? oz.oncekiSayilar.basarisiz + oz.oncekiSayilar.hata : null,
    enYavas: enYavas ? { metot: `${enYavas.servis} › ${enYavas.ad}`, p95: enYavas.p95, oncekiP95: enYavas.oncekiP95 } : null,
    yavaslayan: metotlar.filter((m) => m.yavas).length, acikSorun: sorunlar.filter((s) => s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi').length,
    kararsizSenaryo: liste.reduce((a, x) => a + x.bolum.ozet.kararsizSenaryo, 0), ogeSayisi: liste.length,
    metotSayisi: liste.reduce((a, x) => a + Number(x.bolum.oge.metotSayisi ?? 0), 0), senaryoSayisi: liste.reduce((a, x) => a + x.bolum.oge.senaryoSayisi, 0),
    hatasizOge: ogeler.filter((o) => o.cagri > 0 && o.kalan === 0).length,
    akisKosu, akisBasari: oranYuzde(akislar.reduce((a, x) => a + x.basarili, 0), akisKosu)
  };
  const sureler = donem.kovalar.map((_, i) => birlestir(liste.map((x) => x.ham.kovaSureleri[i] ?? [])));
  return {
    ozet, sorunlar, ekAksiyonlar: liste.flatMap((x) => x.ham.ekAksiyonlar), kosuVar: liste.some((x) => x.bolum.kosuVar), ogeler, metotlar, akislar,
    yavaslayanlar: metotlar.filter((m) => m.yavas).map((m) => ({ servis: m.servis, metot: m.ad, oncekiP95: m.oncekiP95, p95: m.p95, n: m.n })),
    hataMatrisi: liste.flatMap((x) => x.bolum.servis.hataMatrisi.map((r) => ({ ...r, servis: x.bolum.oge.ad }))),
    sureEgilimi: { p50: sureler.map((l) => yuzdelik(l, 50)), p95: sureler.map((l) => yuzdelik(l, 95)), oncekiP95: yuzdelik(birlestir(liste.map((x) => x.ham.sureO)), 95) },
    egilim: { kovalar: kovalar.map((k, i) => ({ etiket: donem.kovalar[i].etiket, adet: k.adet, kalan: k.kalan, oran: k.oran })), oncekiOrt: oz.oncekiBasari }
  };
}

/**
 * Çoklu kapsamın rapor verisi.
 * @param {Ic} ic
 */
async function cokluBolumler(ic) {
  const { g } = ic;
  const secim = secimiCoz(ic);
  /** @type {Array<Awaited<ReturnType<typeof ekranHesabi>>>} */
  const ekranListesi = [];
  for (const e of secim.ekranlar) ekranListesi.push(await ekranHesabi(ic, e.id, false));
  const servisListesi = secim.servisler.map((s) => servisHesabi(ic, s.id));
  const et = ekranListesi.length ? ekranTarafi(ic, ekranListesi) : null;
  const st = servisListesi.length ? servisTarafi(ic, servisListesi) : null;
  const sira = (/** @type {string} */ d) => SORUN_DURUMLARI.indexOf(d);
  const sorunlar = [...(et?.sorunlar ?? []), ...(st?.sorunlar ?? [])]
    .sort((a, b) => sira(a.durum) - sira(b.durum) || b.n - a.n || String(b.son ?? '').localeCompare(String(a.son ?? '')));
  // Bağlantılı sorunlar (yalnız ekran + servis): tek aksiyonda birleşir.
  const ciftler = et && st ? baglantiliSorunlar(et.sorunlar, st.sorunlar) : [];
  const birlesme = aksiyonlariBirlestir(ciftler);
  // Rozetin başarısı: tek taraflıysa o tarafın; karmada DAHA DÜŞÜK olan taraf (ikisi toplanmaz: birimleri farklı).
  /** @type {'ekran' | 'servis'} */
  let taraf = et ? 'ekran' : 'servis';
  if (et && st && st.ozet.basari !== null && (et.ozet.basari === null || st.ozet.basari < et.ozet.basari)) taraf = 'servis';
  const esas = taraf === 'ekran' ? /** @type {NonNullable<typeof et>} */ (et).ozet : /** @type {NonNullable<typeof st>} */ (st).ozet;
  const kosuVar = Boolean(et?.kosuVar || st?.kosuVar);
  const genel = g.kapsam === 'genel';
  // Genel rapor: projenin tüm akışları (servis + oturum + uçtan uca); diğerleri: seçilen servisleri kullanan akışlar.
  const akislar = genel ? akislariHesapla(ic, null) : st?.akislar ?? [];
  // A4: kapsamdaki kritik işaretli öğe / akışlardan son koşusunda kalanlar → rozet Kritik.
  const kritikKalanlar = [
    ...ekranListesi.filter((e) => e.ham.kritik && e.ham.son === 'K').map((e) => e.bolum.oge.ad),
    ...servisListesi.filter((s) => s.ham.kritik && s.ham.son === 'K').map((s) => s.bolum.oge.ad),
    ...akislar.filter((a) => a.kritik && a.son === 'K').map((a) => a.ad)
  ];
  const son = ortakSonuc(sorunlar, [...(et?.ekAksiyonlar ?? []), ...(st?.ekAksiyonlar ?? [])], {
    basari: esas.basari, oncekiBasari: esas.oncekiBasari, esikler: ic.esikler, aksiyonSayisi: ic.aksiyonSayisi, karsilastir: g.karsilastir, kosuVar, birlesme,
    kritikKalanlar
  });
  if (et && st) {
    son.rozet = { ...son.rozet, gerekce: son.rozet.gerekce.replace('Dönem başarısı', `${taraf === 'ekran' ? 'Ekran' : 'Servis'} başarısı`) };
    son.maddeler = son.maddeler.map(([t, m]) => /** @type {['iyi' | 'kotu' | 'oneri', string]} */ ([t, m.replace(/^Başarı önceki/, `${taraf === 'ekran' ? 'Ekran' : 'Servis'} başarısı önceki`)]));
  }
  // Sağlık sıralamasından madde: en çok ilgi isteyen ve en sağlıklı öğe.
  const tumOgeler = [...(et?.ogeler.map((o) => ({ ...o, tur: 'ekran' })) ?? []), ...(st?.ogeler.map((o) => ({ ...o, tur: 'servis' })) ?? [])];
  if (tumOgeler.length > 1) {
    const olculen = tumOgeler.filter((o) => o.basari !== null);
    const zayif = olculen.filter((o) => o.rozet.durum !== 'saglikli').sort((a, b) => (a.basari ?? 0) - (b.basari ?? 0))[0];
    const saglam = olculen.filter((o) => o.rozet.durum === 'saglikli').sort((a, b) => (b.basari ?? 0) - (a.basari ?? 0))[0];
    const oneriIndeksi = son.maddeler.findIndex(([t]) => t === 'oneri');
    /** @type {Array<['iyi' | 'kotu' | 'oneri', string]>} */
    const ek = [];
    if (zayif) ek.push(['kotu', `En çok ilgi isteyen ${zayif.tur}: ${zayif.ad} (${yuzdeMetni(zayif.basari)}${zayif.kotulesen ? `, ${zayif.kotulesen} kötüleşen sorun` : ''}).`]);
    if (saglam) ek.push(['iyi', `En sağlıklı ${saglam.tur}: ${saglam.ad} (${yuzdeMetni(saglam.basari)}).`]);
    son.maddeler.splice(oneriIndeksi < 0 ? son.maddeler.length : oneriIndeksi, 0, ...ek);
  }
  const acik = sorunlar.filter((s) => s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi');
  const ekranAdi = g.tumEkranlar ? 'Tüm ekranlar' : `Seçilen ${secim.ekranlar.length} ekran`;
  const servisAdi = g.tumServisler ? 'Tüm servisler' : `Seçilen ${secim.servisler.length} servis`;
  const ad = genel ? 'Tüm proje' : g.kapsam === 'coklu-ekran' ? ekranAdi : g.kapsam === 'coklu-servis' ? servisAdi : `${ekranAdi} + ${servisAdi.toLocaleLowerCase('tr')}`;
  const ozet = g.kapsam === 'karisik' || genel
    ? { basari: esas.basari, oncekiBasari: esas.oncekiBasari, taraf, ekran: et?.ozet ?? null, servis: st?.ozet ?? null, acikSorun: acik.length, baglantili: ciftler.length }
    : esas;
  const kisa = (/** @type {RaporSorunu} */ s) => ({ imza: s.imza, baslik: s.baslik, nerede: s.nerede, durum: s.durum, n: s.n, puan: s.puan, bant: s.bant });
  // Genel rapor: genele özgü bölümler (genelBolumler).
  const gb = genel ? genelBolumler(ic, { ekranListesi, servisListesi, et, sorunlar, akislar }) : null;
  if (gb && et) for (const o of et.ogeler) Object.assign(o, { ortakAkis: gb.ortakAkislar.has(o.id) });
  return {
    oge: {
      id: '', ad, senaryoSayisi: (et?.ozet.senaryoSayisi ?? 0) + (st?.ozet.senaryoSayisi ?? 0), ...(st ? { metotSayisi: st.ozet.metotSayisi } : {})
    },
    secilenler: {
      ekranlar: secim.ekranlar, servisler: secim.servisler, tumEkranlar: genel || g.tumEkranlar === true, tumServisler: genel || g.tumServisler === true, eksik: secim.eksik
    },
    kosuVar, ozet, sorunlar, ...son, egilim: (et ?? /** @type {NonNullable<typeof st>} */ (st)).egilim,
    ...(gb ? { genel: gb.bolum } : {}),
    ...a4Ekleri(ic, { ekranlar: ekranListesi, servisler: servisListesi, akislar, sorunlar }),
    coklu: {
      ekranTarafi: et ? { ozet: et.ozet, egilim: et.egilim, ogeler: et.ogeler } : null,
      servisTarafi: st ? {
        ozet: st.ozet, egilim: st.egilim, ogeler: st.ogeler, metotlar: st.metotlar, yavaslayanlar: st.yavaslayanlar, hataMatrisi: st.hataMatrisi, sureEgilimi: st.sureEgilimi
      } : null,
      akislar,
      sinifDagilimi: sinifDagilimi(sorunlar, tumOgeler.map((o) => ({ id: o.id, ad: o.ad, tur: /** @type {'ekran' | 'servis'} */ (o.tur) }))).filter((x) => x.toplam > 0),
      enCokAdim: (et?.sorunlar ?? []).filter((s) => s.n > 0 && s.durum !== 'cozulen').sort((a, b) => b.n - a.n).slice(0, EN_COK_ADIM).map(kisa),
      baglantili: ciftler.map((c) => ({ ekran: kisa(c.ekran), servis: kisa(c.servis), ortak: c.ortak, birlesim: c.birlesim, jaccard: c.jaccard, birlesti: birlesme.haric.has(c.ekran.imza) || birlesme.haric.has(c.servis.imza) }))
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// GENEL RAPOR (A3): çoklu raporun toplamına ek bölümler
// ---------------------------------------------------------------------------------------------------------------------------

const EN_COK_KARARSIZ = 12;
const EN_COK_ACIK = 12;
const EN_COK_KIRIK = 5;

/**
 * Genel rapora özgü bölümler: akış özeti, zamanlanmış koşular, kararsız testler, test verisi sağlığı, kapsam ve açıklar,
 * ortamlara göre. Kritik akış, uygulama sürümü, ekip eşlemesi ve süre eşiği A4'te tüm rapor türlerine eklenir (a4Ekleri); kalıcı
 * tetikleme kaydı henüz yoktur (yöntem bölümünde not düşülür).
 * @param {Ic} ic
 * @param {{ ekranListesi: Array<Awaited<ReturnType<typeof ekranHesabi>>>; servisListesi: Array<ReturnType<typeof servisHesabi>>;
 *   et: ReturnType<typeof ekranTarafi> | null; sorunlar: RaporSorunu[]; akislar: ReturnType<typeof akislariHesapla> }} x
 */
function genelBolumler(ic, x) {
  const { vt, g, b, donem } = ic;
  const simdi = (b.simdi ?? new Date()).getTime();

  // Ortak akışlar (model türü "ortakAkis"): ekran tablosunda ayrı işaretlenir, senaryosuz ekran sayılmaz.
  /** @type {Set<string>} */
  const ortakAkislar = new Set();
  for (const e of x.ekranListesi) {
    try { if (ekranModeliGetir(vt, e.bolum.oge.id)?.model?.tur === 'ortakAkis') ortakAkislar.add(e.bolum.oge.id); } catch { /* model okunamadı: normal ekran */ }
  }

  // Akışlar (servis + oturum + uçtan uca): koşu türü.
  const topla = (/** @type {(a: ReturnType<typeof akislariHesapla>[number]) => number} */ f) => x.akislar.reduce((t, a) => t + f(a), 0);
  const akis = {
    sayi: x.akislar.length, uctanUca: x.akislar.filter((a) => a.tur === 'Uçtan uca akış').length, kosu: topla((a) => a.kosu),
    basari: oranYuzde(topla((a) => a.basarili), topla((a) => a.kosu)), oncekiKosu: topla((a) => a.oncekiKosu),
    oncekiBasari: oranYuzde(topla((a) => a.oncekiBasarili), topla((a) => a.oncekiKosu))
  };

  // Zamanlanmış koşular (kural başına; seçili ortam varsa yalnız o ortamın kuralları).
  /** @type {ReturnType<typeof kurallariListele>} */
  let kurallar = [];
  try { kurallar = kurallariListele(vt, g.projeId, { simdi: new Date(simdi) }); } catch { kurallar = []; }
  if (g.ortamId) kurallar = kurallar.filter((k) => k.ortamId === g.ortamId);
  const pencere = (/** @type {{ bas: Date; bit: Date }} */ p) => ({ bas: p.bas.getTime(), bit: p.bit.getTime(), simdi, gecmisSiniri: GECMIS_SINIRI });
  const kurallarSatiri = kurallar.map((k) => {
    const d = pencereGuvenilirligi(k, k.gecmis, pencere(donem));
    const o = pencereGuvenilirligi(k, k.gecmis, pencere(donem.onceki));
    const kapsam = [
      k.kapsam.senaryolar === 'tum' ? 'tüm ekranlar' : k.kapsam.senaryolar === 'ekranlar' ? `${k.kapsam.ekranIdleri.length} ekran` : '',
      k.kapsam.servisAkisIdleri.length ? `${k.kapsam.servisAkisIdleri.length} servis akışı` : '',
      (k.kapsam.uctanUcaAkisIdleri ?? []).length ? `${(k.kapsam.uctanUcaAkisIdleri ?? []).length} uçtan uca akış` : ''
    ].filter(Boolean).join(' + ');
    return {
      ad: k.ad, zaman: k.zamanMetni, ortam: k.ortamAdi, riskli: k.riskli, etkin: k.etkin, kapsam, ...d,
      oncekiGuvenilirlik: o.guvenilirlik, oncekiBeklenen: o.beklenen, oncekiTamamlandi: o.tamamlandi
    };
  });
  const zt = toplamGuvenilirlik(kurallarSatiri);
  const zo = toplamGuvenilirlik(kurallarSatiri.map((k) => ({ beklenen: k.oncekiBeklenen, tamamlandi: k.oncekiTamamlandi })));
  const zamanlanmis = {
    kurallar: kurallarSatiri, ...zt, oncekiGuvenilirlik: zo.guvenilirlik, kisitli: kurallarSatiri.some((k) => k.kisitli),
    atlandi: kurallarSatiri.reduce((t, k) => t + k.atlandi, 0), yarida: kurallarSatiri.reduce((t, k) => t + k.yarida, 0)
  };

  // Kararsız testler (ekran + servis senaryoları; dönem içi).
  const adaylar = [
    ...x.ekranListesi.flatMap((e) => e.bolum.ekran.senaryolar.filter((s) => s.kararlilik).map((s) => {
      const k = /** @type {NonNullable<typeof s.kararlilik>} */ (s.kararlilik);
      return { tur: /** @type {const} */ ('ekran'), ad: s.ad, oge: e.bolum.oge.ad, kosu: k.kosu, degisim: k.degisim, oran: k.oran, durum: k.durum };
    })),
    ...x.servisListesi.flatMap((s) => s.ham.kararlilik.map((k) => ({
      tur: /** @type {const} */ ('servis'), ad: k.ad, oge: s.bolum.oge.ad, kosu: k.kosu, degisim: k.degisim, oran: k.oran, durum: k.durum
    })))
  ];
  const kararsiz = {
    liste: kararsizListesi(adaylar, EN_COK_KARARSIZ), kararsiz: adaylar.filter((a) => a.durum === 'kararsiz').length,
    izlenir: adaylar.filter((a) => a.durum === 'izlenir').length
  };

  // Test verisi sağlığı (Test verisi ekranındaki denetimler; değer yok) + test verisi sınıflı başarısız sonuçlar.
  let saglik = null;
  try { saglik = veriSagligi(vt, g.projeId); } catch { saglik = null; }
  const veriSorunlari = x.sorunlar.filter((s) => s.sinif === 'veri');
  const testVerisi = {
    hesaplandi: saglik !== null, kirik: saglik?.kirikBasvurular.length ?? 0,
    kirikOrnekler: (saglik?.kirikBasvurular ?? []).slice(0, EN_COK_KIRIK).map((k) => ({ yer: k.yer, basvuru: k.basvuru, neden: k.neden })),
    kullanilmayan: saglik?.kullanilmayan.length ?? 0, benzer: saglik ? saglik.benzer.filter((o) => o.puan >= saglik.benzerlikEsigi).length : 0,
    bosSutun: saglik?.bosSutunlar.length ?? 0, kaynakliSonuc: veriSorunlari.reduce((t, s) => t + s.n, 0),
    oncekiKaynakliSonuc: veriSorunlari.reduce((t, s) => t + s.nOnceki, 0)
  };
  const bulgu = testVerisi.kirik + testVerisi.kullanilmayan + testVerisi.benzer + testVerisi.bosSutun;

  // Kapsam ve açıklar.
  const ekranKapsami = x.ekranListesi.map((e) => e.bolum.ekran.kapsam);
  const kosuyaDahil = ekranKapsami.reduce((t, k) => t + k.kosuyaDahil, 0);
  const hicKosmayan = ekranKapsami.reduce((t, k) => t + k.hicKosmayan, 0);
  const metotlar = x.servisListesi.map((s) => ({ servis: s.bolum.oge.ad, k: s.ham.metotKapsami })).filter((m) => m.k !== null);
  const etkinKurallar = kurallar.filter((k) => k.etkin);
  const tumEkranKurali = etkinKurallar.some((k) => k.kapsam.senaryolar === 'tum');
  const kuralliEkran = new Set(etkinKurallar.filter((k) => k.kapsam.senaryolar === 'ekranlar').flatMap((k) => k.kapsam.ekranIdleri));
  const kosulanEkranlar = x.ekranListesi.filter((e) => e.bolum.ekran.kapsam.kosuyaDahil > 0);
  const kuralliAkis = new Set(etkinKurallar.flatMap((k) => [...k.kapsam.servisAkisIdleri, ...(k.kapsam.uctanUcaAkisIdleri ?? [])]));
  const zamanlanabilirAkislar = x.akislar.filter((a) => a.tur !== 'Oturum akışı');
  /** @type {Array<{ tur: string; yer: string; oneri: string }>} */
  const aciklar = [
    ...metotlar.flatMap((m) => (m.k?.eksik ?? []).map((ad) => ({ tur: 'Senaryosu olmayan metot', yer: `${m.servis} › ${ad}`, oneri: 'Sihirbazdan senaryo oluşturun.' }))),
    ...x.ekranListesi.flatMap((e) => e.bolum.ekran.senaryolar.filter((s) => s.hicKosmadi).map((s) => ({
      tur: 'Dönemde koşmayan senaryo', yer: `${e.bolum.oge.ad} › ${s.ad}`, oneri: 'Koşuya dahil ama dönemde hiç koşmadı: zamanlanmış kurala ya da koşuya ekleyin.'
    }))),
    ...x.ekranListesi.flatMap((e) => e.bolum.ekran.senaryolar.filter((s) => s.hepAtlandi).map((s) => ({
      tur: 'Her koşuda atlanan senaryo', yer: `${e.bolum.oge.ad} › ${s.ad}`, oneri: 'Atlanma nedenini (koşul, eksik test verisi) inceleyin.'
    }))),
    ...x.ekranListesi.filter((e) => e.bolum.oge.senaryoSayisi === 0 && !ortakAkislar.has(e.bolum.oge.id)).map((e) => ({
      tur: 'Senaryosu olmayan ekran', yer: e.bolum.oge.ad, oneri: 'Senaryo önerileri ekranından senaryo ekleyin.'
    }))
  ];
  const kapsam = {
    kosuyaDahil, donemdeKosan: kosuyaDahil - hicKosmayan, hepAtlanan: ekranKapsami.reduce((t, k) => t + k.hepAtlanan, 0),
    metot: metotlar.length ? { toplam: metotlar.reduce((t, m) => t + Number(m.k?.toplam), 0), senaryolu: metotlar.reduce((t, m) => t + Number(m.k?.senaryolu), 0), servis: metotlar.length } : null,
    olculmeyenServis: x.servisListesi.length - metotlar.length,
    kuralliEkran: tumEkranKurali ? kosulanEkranlar.length : kosulanEkranlar.filter((e) => kuralliEkran.has(e.bolum.oge.id)).length, kosulanEkran: kosulanEkranlar.length,
    kuralliAkis: zamanlanabilirAkislar.filter((a) => kuralliAkis.has(a.id)).length, akis: zamanlanabilirAkislar.length,
    aciklar: aciklar.slice(0, EN_COK_ACIK), acikSayisi: aciklar.length
  };

  // Ortamlara göre (yalnız "Tüm ortamlar" seçiliyse ve projede birden çok ortam varsa).
  const projeOrtamlari = g.ortamId ? [] : ortamlariListele(vt, g.projeId);
  const ortamlar = projeOrtamlari.length >= 2
    ? ortamOranlari(projeOrtamlari.map((o) => ({ id: o.id, ad: o.ad, riskli: ortamRiskliMi(o) })),
      x.ekranListesi.map((e) => e.ham.ortamSayilari), x.servisListesi.map((s) => s.ham.ortamSayilari))
    : null;

  return {
    ortakAkislar,
    bolum: {
      ozet: {
        ekranSayisi: x.ekranListesi.length - ortakAkislar.size, ortakAkisSayisi: ortakAkislar.size, servisSayisi: x.servisListesi.length,
        akisSayisi: akis.sayi - akis.uctanUca, uctanUcaSayisi: akis.uctanUca, kuralSayisi: kurallar.length
      },
      akis, zamanlanmis, kararsiz, testVerisi: { ...testVerisi, bulgu }, kapsam, ortamlar
    }
  };
}

/** @typedef {Awaited<ReturnType<typeof donemRaporuVerisi>>} DonemRaporuVerisi */
