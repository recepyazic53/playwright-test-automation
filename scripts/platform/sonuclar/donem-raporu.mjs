// DÖNEM RAPORU VERİSİ (sunucu; kasa açık olmalı): TEK EKRAN ve TEK SERVİS kapsamı için PDF raporunun bölümlerinin verisi.
// Kaynaklar: kosular + kosu_sonuclari + adim_sonuclari + yakalanan_mesajlar (ekran), servis_kosulari (+ şifreli sonuç), servis
// senaryoları (metot), servis akışları. Hesaplar saf modüllerdedir: donem.mjs (D / D′ / G, kovalar), sorun-modeli.mjs (imza,
// durum, kararlılık, sınıf), oncelik.mjs (puan, bant, rozet), yuzdelik.mjs (p50 / p95 / p99), hesaplama.mjs (başarı — Sonuçlar
// ekranıyla aynı formül).
// - Ekran başarı oranı yalnız TAM koşulardan; tekil koşular sorunlara girer, orana girmez. Servis: yalnız "koşu" türü ("Dene"
//   hariç), servis akışlarının adım satırları servis koşularına karışmaz (Sonuçlar ekranıyla aynı).
// - MASKELEME: hata metinleri kalıba çevrilmeden ÖNCE maskelenir (html-rapor.mjs > raporMaskeleyici); istek / yanıt gövdesi,
//   başlıklar, okunan değerler ve test verisi değerleri hiç okunmaz. Kontrol kalıbı yalnız kontrol türü + yol (değer yok).
// - Tasarımın "yeni veri gerekir" dediği metrikler (uygulama sürümü, kritik akış işareti, ekip eşlemesi, süre eşiği) yoktur:
//   kritiklik 0, sahip = sınıfın varsayılanı; uydurma değer üretilmez.
import { DepoHatasi, ortamlariListele, projeGetir } from '../veritabani/depo.mjs';
import { veriKosusuTemizle } from '../veritabani/sonuc-deposu.mjs';
import { servisAkislariniListele, servisGetir, servisKosusuGetir, servisSenaryolariniListele } from '../servisler/servis-deposu.mjs';
import { saglikEsikleriniOku } from '../ayarlar/saglik-esikleri.mjs';
import { KATEGORI, beklenenGorulenCikar, kalipCikar } from './siniflandirma.mjs';
import { basariYuzdesi, sayilariTopla } from './hesaplama.mjs';
import { donemHesapla, donemParcasi, kovaIndeksi } from './donem.mjs';
import { SORUN_DURUMLARI, SERVIS_HATA_TURLERI, kararlilikHesapla, kategoriKisaAdi, sinifTahmini, sorunlariHesapla } from './sorun-modeli.mjs';
import { EK_AKSIYON_PUANI, aksiyonListesi, aksiyonOnerisi, bant, durumRozeti, oncelikPuani, sahipOnerisi } from './oncelik.mjs';
import { yavasladiMi, yuzdelik, yuzdelikler } from './yuzdelik.mjs';
import { ilkSatirlar } from './html-rapor.mjs';
import { akisAdimSatirlari } from './servis-sonuclari.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * @typedef {{ projeId: string; kapsam: 'ekran' | 'servis'; id: string; donem: import('./donem.mjs').DonemSecimi; karsilastir: boolean;
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
 * Sorun → rapor satırı (sınıf, puan, bant, aksiyon, sahip, başlık, "neden şimdi").
 * @param {import('./sorun-modeli.mjs').Sorun} s @param {'ekran' | 'servis'} tur @param {{ baslik: string; nerede: string; kalip: string; kategori?: string; hataTuru?: string }} m
 */
function sorunSatiri(s, tur, m) {
  const t = sinifTahmini({ tur, kategori: m.kategori ?? null, hataTuru: m.hataTuru ?? null, durum: s.durum });
  const puan = s.durum === 'cozulen' || s.durum === 'dogrulanamadi' ? 0
    : oncelikPuani({ sinif: t.sinif, durum: s.durum, senaryo: s.senaryolar.length, oran: s.oran, kritiklik: 0, acikGun: s.acikGun });
  const yz = (/** @type {number} */ o) => `%${(o * 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
  return {
    imza: s.imza, tur, baslik: m.baslik, nerede: m.nerede, kalip: m.kalip, kategori: m.kategori ?? null, hataTuru: m.hataTuru ?? null,
    sinif: t.sinif, dayanak: t.dayanak, durum: s.durum, n: s.n, nOnceki: s.nOnceki, maruz: s.maruz, maruzOnceki: s.maruzOnceki, oran: s.oran,
    oranOnceki: s.oranOnceki, senaryo: s.senaryolar.length, seri: s.seri, oncekiSeri: s.oncekiSeri, ilk: iso(s.ilk), son: iso(s.son),
    acikGun: s.acikGun, tekrarRozeti: s.tekrarRozeti, puan, bant: bant(puan), aksiyon: aksiyonOnerisi({ sinif: t.sinif, tur }), sahip: sahipOnerisi(t.sinif),
    neden: `${s.nOnceki} → ${s.n} adet · ${s.senaryolar.length} senaryo · hata oranı ${yz(s.oran)}${s.maruzOnceki ? ` (önceki ${yz(s.oranOnceki)})` : ''}${s.n ? ` · ${s.acikGun} gündür açık` : ''}`
  };
}

/** @typedef {ReturnType<typeof sorunSatiri>} RaporSorunu */

/**
 * Ortak son adım: aksiyonlar, sayımlar, rozet, maddeler.
 * @param {RaporSorunu[]} sorunlar @param {Array<Record<string, unknown> & { puan: number; bant: string; durum: string }>} ekAksiyonlar
 * @param {{ basari: number | null; oncekiBasari: number | null; esikler: { yesil: number; sari: number }; aksiyonSayisi: number; karsilastir: boolean; kosuVar: boolean }} g
 */
function ortakSonuc(sorunlar, ekAksiyonlar, g) {
  const tumAksiyonlar = aksiyonListesi([...sorunlar, ...ekAksiyonlar], Number.MAX_SAFE_INTEGER);
  const bantSayim = { P1: 0, P2: 0, P3: 0 };
  for (const a of tumAksiyonlar) bantSayim[/** @type {'P1' | 'P2' | 'P3'} */ (a.bant)]++;
  /** @type {Record<string, number>} */
  const durumSayim = Object.fromEntries(SORUN_DURUMLARI.map((d) => [d, 0]));
  for (const s of sorunlar) durumSayim[s.durum]++;
  const rozet = durumRozeti({ basari: g.basari, p1: bantSayim.P1, esikler: g.esikler, kritikKaldi: false });
  /** @type {Array<['iyi' | 'kotu' | 'oneri', string]>} */
  const maddeler = [];
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
  const ic = { vt, g, b, donem, ortamAdlari, esikler, aksiyonSayisi: Math.min(20, Math.max(1, g.aksiyonSayisi ?? 8)) };
  return g.kapsam === 'servis' ? { tur: /** @type {const} */ ('servis'), ...ortak, ...servisBolumleri(ic) } : { tur: /** @type {const} */ ('ekran'), ...ortak, ...(await ekranBolumleri(ic)) };
}

/**
 * @typedef {{ vt: Veritabani; g: RaporGirdisi; b: RaporBaglami; donem: import('./donem.mjs').Donem; ortamAdlari: Map<string, string>;
 *   esikler: { yesil: number; sari: number }; aksiyonSayisi: number }} Ic
 */

// ---------------------------------------------------------------------------------------------------------------------------
// TEK EKRAN
// ---------------------------------------------------------------------------------------------------------------------------

/** @param {Ic} ic */
async function ekranBolumleri(ic) {
  const { vt, g, b, donem, ortamAdlari } = ic;
  const ekran = vt.tek('SELECT id, ad FROM ekranlar WHERE id = ? AND proje_id = ?', [g.id, g.projeId]);
  if (!ekran) throw new DepoHatasi('Ekran bulunamadı.');
  const ekranAdi = String(ekran.ad);
  const kosullar = ['k.proje_id = ?', 'r.ekran_id = ?', 'COALESCE(r.bitis, k.bitis, k.baslangic) >= ?', 'COALESCE(r.bitis, k.bitis, k.baslangic) < ?'];
  const p = [g.projeId, g.id, donem.geriBakisBas.toISOString(), donem.bit.toISOString()];
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
      hata: r.hata_mesaji == null ? null : String(r.hata_mesaji), adim, kategori, kalip, deneme: Number(r.deneme ?? 0), tekrarKosusu, surum
    };
  });
  const parca = (/** @type {{ zaman: number }} */ x) => donemParcasi(donem, x.zaman);
  const D = kayitlar.filter((x) => parca(x) === 'D');
  const O = kayitlar.filter((x) => parca(x) === 'O');
  /** @type {import('./sorun-modeli.mjs').Gozlem[]} */
  const gozlemler = kayitlar.map((x) => ({
    zaman: x.zaman, durum: x.durum, senaryo: x.senaryo, maruz: x.senaryo, ortam: x.ortamId, surum: x.surum, deneme: x.deneme, tekrarKosusu: x.tekrarKosusu,
    ...(x.durum === 'basarisiz' ? { imza: { parcalar: ['ekran', g.id, x.adim, x.kategori, x.kalip], bilgi: { adim: x.adim, kategori: x.kategori, kalip: x.kalip } } } : {})
  }));
  const kararlilik = kararlilikHesapla(gozlemler.filter((x) => donemParcasi(donem, x.zaman) === 'D'));
  const oncekiKararlilik = kararlilikHesapla(gozlemler.filter((x) => donemParcasi(donem, x.zaman) === 'O'));
  const sorunlar = sorunlariHesapla(gozlemler, donem, { kararlilik, simdi: (b.simdi ?? new Date()).getTime() }).map((s) => {
    const adim = String(s.bilgi.adim ?? '');
    const kategori = String(s.bilgi.kategori ?? '');
    const kisa = kategoriKisaAdi(kategori);
    return sorunSatiri(s, 'ekran', {
      baslik: buyukBas(adim ? `"${adim}" adımında ${kisa}` : `${kisa} (adım bilgisi yok)`), nerede: `${ekranAdi}${adim ? ` › ${adim}` : ''}`,
      kalip: String(s.bilgi.kalip ?? ''), kategori
    });
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

  // Senaryolar (dönem; tam koşular) + koşuya dahil ama koşmamış senaryolar.
  const tanimli = vt.tumu('SELECT id, baslik, kosuya_dahil FROM senaryolar WHERE ekran_id = ? AND proje_id = ?', [g.id, g.projeId]);
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
      kararlilik: k ? { durum: k.durum, oran: k.oran, kosu: k.kosu } : null
    };
  }).sort((a, c) => (a.basari ?? 101) - (c.basari ?? 101) || a.ad.localeCompare(c.ad, 'tr'));

  // Senaryo matrisi: dönemdeki son 12 tam koşu (eskiden yeniye).
  /** @type {Map<string, number>} */
  const tamKosular = new Map();
  for (const x of tamD) tamKosular.set(x.kosuId, x.kosuBaslangic);
  const matrisKosulari = [...tamKosular.entries()].sort((a, c) => a[1] - c[1]).slice(-EN_COK_MATRIS_KOSUSU);
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const kosuEtiketi = (/** @type {number} */ t) => { const d = new Date(t); return `${iki(d.getDate())}.${iki(d.getMonth() + 1)} ${iki(d.getHours())}:${iki(d.getMinutes())}`; };
  const matris = {
    etiketler: matrisKosulari.map(([, t]) => kosuEtiketi(t)),
    satirlar: senaryolar.map((s) => {
      const dizi = matrisKosulari.map(([kosuId]) => {
        const l = tamD.filter((x) => x.kosuId === kosuId && x.senaryo === s.anahtar);
        if (l.some((x) => x.durum === 'basarisiz')) return 'K';
        if (l.some((x) => x.durum === 'basarili')) return 'G';
        if (l.some((x) => x.durum === 'atlanan')) return 'A';
        return '-';
      }).join('');
      return { ad: s.ad, dizi, not: matrisNotu(dizi, s) };
    })
  };

  // Adım × kova ısı haritası (tüm koşuların kalan sonuçları; her sonuç yalnız ilk başarısız adımına sayılır).
  /** @type {Map<string, number[]>} */
  const isi = new Map();
  for (const x of D) {
    if (x.durum !== 'basarisiz') continue;
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
  if (sonKalan && g.secenekler.hatalar) {
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
  const yakalanan = yakalananMesajlar(vt, D.map((x) => x.id), new Set(D.filter((x) => x.durum === 'basarisiz').map((x) => x.id)), b.maskele);

  // Kapsam.
  const dSenaryolari = new Set(D.map((x) => x.senaryo));
  const model = vt.tek('SELECT surum, olusturulma FROM ekran_modelleri WHERE ekran_id = ? ORDER BY surum DESC LIMIT 1', [g.id]);
  const kapsam = {
    senaryo: tanimli.length, kosuyaDahil: tanimli.filter((t) => Number(t.kosuya_dahil) === 1).length,
    hicKosmayan: tanimli.filter((t) => Number(t.kosuya_dahil) === 1 && !dSenaryolari.has(String(t.id))).length,
    hepAtlanan: senaryolar.filter((s) => s.hepAtlandi).length,
    modelSurumu: model ? { surum: Number(model.surum), tarih: String(model.olusturulma) } : null
  };

  // Ek aksiyon: her koşuda atlanan senaryolar (sabit puanlı P3).
  const ekAksiyonlar = senaryolar.filter((s) => s.hepAtlandi).map((s) => ({
    tur: 'ek', baslik: `"${s.ad}" her koşuda atlandı`, nerede: ekranAdi, sinif: 'veri', durum: 'suregelen', puan: EK_AKSIYON_PUANI, bant: bant(EK_AKSIYON_PUANI),
    aksiyon: 'Senaryonun atlanma nedenini (koşul, eksik test verisi) inceleyin.', sahip: sahipOnerisi('veri'), neden: `${s.kosu} koşunun hepsinde atlandı`,
    dayanak: 'Senaryo dönemde hiç koşmadı (atlandı).'
  }));
  const son = ortakSonuc(sorunlar, ekAksiyonlar, { basari, oncekiBasari, esikler: ic.esikler, aksiyonSayisi: ic.aksiyonSayisi, karsilastir: g.karsilastir, kosuVar: D.length > 0 });
  return {
    oge: { id: g.id, ad: ekranAdi, senaryoSayisi: tanimli.length }, kosuVar: D.length > 0, ozet, sorunlar, ...son, egilim,
    ekran: { senaryolar, matris, isiHaritasi, sonHata, yakalanan, kapsam }
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
  icermez: 'Yanıtta geçmez', xpathEsit: 'XPath eşit', jsonEsit: 'JSON eşit', veya: 'VEYA', dosya: 'Dosya', sozlesme: 'Yanıt sözleşmesi'
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

/** @param {Ic} ic */
function servisBolumleri(ic) {
  const { vt, g, b, donem } = ic;
  const servis = servisGetir(vt, g.id);
  if (!servis || servis.projeId !== g.projeId) throw new DepoHatasi('Servis bulunamadı.');
  const senaryolar = servisSenaryolariniListele(vt, g.id);
  const senaryoMetotlari = new Map(senaryolar.map((s) => [s.id, servisMetodu(/** @type {any} */ (s.icerik))]));
  const adimSatirlari = akisAdimSatirlari(vt, g.projeId);
  const kosullar = ['proje_id = ?', 'servis_id = ?', "tur = 'kosu'", 'baslangic >= ?', 'baslangic < ?'];
  const p = [g.projeId, g.id, donem.geriBakisBas.toISOString(), donem.bit.toISOString()];
  if (g.ortamId) { kosullar.push('ortam_id = ?'); p.push(g.ortamId); }
  const satirlar = vt.tumu(`SELECT id, senaryo_id, ortam_id, durum, baslangic, sure_ms, baslik FROM servis_kosulari WHERE ${kosullar.join(' AND ')} ORDER BY baslangic`, p)
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
    return { id: String(r.id), zaman, parca, durum, senaryo, metot, sureMs: Number(r.sure_ms) || 0, ortamId: r.ortam_id == null ? null : String(r.ortam_id), hata };
  });
  const D = kayitlar.filter((x) => x.parca === 'D');
  const O = kayitlar.filter((x) => x.parca === 'O');
  /** @type {import('./sorun-modeli.mjs').Gozlem[]} */
  const gozlemler = kayitlar.map((x) => ({
    zaman: x.zaman, durum: x.durum, senaryo: x.senaryo, maruz: x.metot, ortam: x.ortamId,
    ...(x.hata ? { imza: { parcalar: ['servis', g.id, x.metot, x.hata.hataTuru, x.hata.kalip], bilgi: { metot: x.metot, hataTuru: x.hata.hataTuru, kalip: x.hata.kalip } } } : {})
  }));
  const hataTuruAdi = Object.fromEntries(SERVIS_HATA_TURLERI);
  const kararlilik = kararlilikHesapla(gozlemler.filter((x) => donemParcasi(donem, x.zaman) === 'D'));
  const sorunlar = sorunlariHesapla(gozlemler, donem, { kararlilik, simdi: (b.simdi ?? new Date()).getTime() }).map((s) => {
    const metot = String(s.bilgi.metot ?? '');
    const hataTuru = String(s.bilgi.hataTuru ?? 'kontrol');
    return sorunSatiri(s, 'servis', {
      baslik: `${metot}: ${String(hataTuruAdi[hataTuru] ?? 'Hata')}`, nerede: `${servis.ad} › ${metot}`, kalip: String(s.bilgi.kalip ?? ''), hataTuru
    });
  });
  const sayi = (/** @type {typeof kayitlar} */ l) => {
    const s = { basarili: 0, basarisiz: 0, atlanan: 0, hata: 0 };
    for (const x of l) if (x.durum in s) /** @type {any} */ (s)[x.durum]++;
    return s;
  };
  const sD = sayi(D);
  const sO = sayi(O);
  const sureListesi = (/** @type {typeof kayitlar} */ l) => l.filter((x) => x.durum !== 'hata').map((x) => x.sureMs);

  // Metotlar.
  const metotAdlari = [...new Set([...D.map((x) => x.metot), ...senaryolar.map((s) => /** @type {string} */ (senaryoMetotlari.get(s.id)))])];
  const metotlar = metotAdlari.map((ad) => {
    const l = D.filter((x) => x.metot === ad);
    const lo = O.filter((x) => x.metot === ad);
    const y = yuzdelikler(sureListesi(l));
    const yo = yuzdelikler(sureListesi(lo));
    const s = sayi(l);
    const sonCagri = l[l.length - 1];
    return {
      ad, senaryo: senaryolar.filter((x) => senaryoMetotlari.get(x.id) === ad).length, cagri: l.length, basari: basariYuzdesi(s),
      oncekiBasari: basariYuzdesi(sayi(lo)), p50: y.p50, p95: y.p95, p99: y.p99, n: y.n, oncekiP95: yo.p95, yavas: yavasladiMi(y.p95, yo.p95, y.n),
      son: sonCagri ? (sonCagri.durum === 'basarili' ? 'G' : 'K') : null, kalan: s.basarisiz + s.hata
    };
  }).sort((a, c) => c.cagri - a.cagri || a.ad.localeCompare(c.ad, 'tr'));

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
    oncekiP95: yuzdelik(sureListesi(O), 95)
  };

  // Bu servisi kullanan servis akışları (koşu türü).
  const akislar = servisAkislariniListele(vt, g.projeId).filter((a) => Array.isArray(a.icerik?.adimlar) && a.icerik.adimlar.some((/** @type {any} */ x) => x && x.servisId === g.id))
    .map((a) => {
      const k = vt.tumu(`SELECT durum, baslangic, sure_ms FROM servis_akis_kosulari WHERE akis_id = ? AND tur = 'kosu' AND baslangic >= ? AND baslangic < ?${g.ortamId ? ' AND ortam_id = ?' : ''} ORDER BY baslangic`,
        [a.id, donem.onceki.bas.toISOString(), donem.bit.toISOString(), ...(g.ortamId ? [g.ortamId] : [])]);
      const d = k.filter((x) => (ms(x.baslangic) ?? 0) >= donem.bas.getTime());
      const o = k.filter((x) => (ms(x.baslangic) ?? 0) < donem.bas.getTime());
      const son = d[d.length - 1];
      return {
        ad: a.baslik, tur: a.tur === 'oturum' ? 'Oturum akışı' : 'Servis akışı', adim: a.icerik.adimlar.length, kosu: d.length,
        basari: oranYuzde(d.filter((x) => x.durum === 'basarili').length, d.length), oncekiBasari: oranYuzde(o.filter((x) => x.durum === 'basarili').length, o.length),
        ortSure: ortalama(d.map((x) => Number(x.sure_ms) || 0)), son: son ? (son.durum === 'basarili' ? 'G' : 'K') : null
      };
    });

  const basari = basariYuzdesi(sD);
  const oncekiBasari = basariYuzdesi(sO);
  const enYavas = metotlar.filter((m) => m.p95 !== null).sort((a, c) => /** @type {number} */ (c.p95) - /** @type {number} */ (a.p95))[0] ?? null;
  const acik = sorunlar.filter((s) => s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi');
  const ozet = {
    basari, oncekiBasari, cagri: D.length, oncekiCagri: O.length ? O.length : null, kalan: sD.basarisiz + sD.hata, oncekiKalan: O.length ? sO.basarisiz + sO.hata : null,
    enYavas: enYavas ? { metot: enYavas.ad, p95: enYavas.p95, oncekiP95: enYavas.oncekiP95 } : null, yavaslayan: metotlar.filter((m) => m.yavas).length,
    acikSorun: acik.length, kararsizSenaryo: [...kararlilik.values()].filter((x) => x.durum === 'kararsiz').length
  };
  const son = ortakSonuc(sorunlar, [], { basari, oncekiBasari, esikler: ic.esikler, aksiyonSayisi: ic.aksiyonSayisi, karsilastir: g.karsilastir, kosuVar: D.length > 0 });
  const kontrolListesi = [...kontrolTurleri.entries()].map(([tur, x]) => ({ tur, etiket: x.etiket, toplam: x.toplam, gecen: x.gecen }))
    .sort((a, c) => c.toplam - a.toplam);
  return {
    oge: { id: g.id, ad: servis.ad, servisTuru: servis.tur, senaryoSayisi: senaryolar.length, metotSayisi: metotAdlari.length }, kosuVar: D.length > 0, ozet, sorunlar, ...son, egilim,
    servis: {
      metotlar, hataMatrisi, sureEgilimi, kontrolTurleri: kontrolListesi,
      kalanKontroller: [...kalanKontroller.entries()].map(([etiket, sayi]) => ({ etiket, sayi })).sort((a, c) => c.sayi - a.sayi).slice(0, EN_COK_KALAN_KONTROL),
      akislar
    }
  };
}

/** @typedef {Awaited<ReturnType<typeof donemRaporuVerisi>>} DonemRaporuVerisi */
