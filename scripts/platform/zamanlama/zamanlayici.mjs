// ZAMANLANMIŞ KOŞULAR — çalıştırıcı. Nöbetçi sunucusu çalışırken ve kasa AÇIKKEN (ya da kullanıcı tercihiyle kilitliyken
// anahtar emanetteyse: bag.arkaPlanIsi, bkz. anahtar-emaneti.mjs) dakikada bir kuralları denetler; vakti gelen
// kural için arayüzdeki "Koşuyu başlat" ile AYNI yoldan (senaryo başına /platform/senaryolar/calistir mantığı: senaryoCalistir)
// koşu başlatır; koşu kimliği "zamanli-<uuid>". Kurallar:
//  - Aynı anda başka bir koşu sürüyorsa (arayüzden ya da başka bir zamanlanmış koşu) tetikleme ATLANIR: "Atlandı: koşu sürüyordu"
//    (varsayılan). Ayarlar > Koşu > Zamanlanmış koşu davranışı "Bitince koş": tetikleme bellekte bekletilir, koşu bitince (sonraki
//    denetimde) bir kez başlatılır; sunucu o arada kapanırsa unutulur.
//  - Kasa kilitliyken / sunucu kapalıyken kaçan zamanlar sonradan toplu koşulmaz (bkz. takvim.mjs > vadesiGelenZaman); "Sonra bir
//    kez koş" seçiliyse kaçanlardan yalnız sonuncusu bir kez koşulur.
//  - Koşu sırasında kasa kilitlenir ya da çalışma alanı değişirse kalan senaryolar başlatılmaz ("yarıda").
//  - Canlı / riskli ortamda kural onaysız ise (ör. ortam sonradan canlı işaretlendi) koşu başlatılmaz.
// Bağımlılıklar (koşucu, senaryo listesi, servis akışı, bildirim) dışarıdan verilir; birim testleri sahte koşucu verir.
// NOT: import.meta KULLANILMAZ. Tipler: zamanlayici.d.mts.
import { randomUUID } from 'node:crypto';
import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import { TOLERANS_MS, vadesiGelenZaman } from './takvim.mjs';
import { ortamRiskliMi, tetiklemeYaz, tumGecmis, tumKurallar, tuketilenYaz } from './kurallar.mjs';
import { izinAcikMi } from '../guvenlik/izinler.mjs';
import { izinKapaliNotu, izinMesaji } from '../guvenlik/izin-tanimlari.mjs';
import { kapaliIzinler } from '../guvenlik/uc-denetimi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./kurallar.d.mts').Kural} Kural */
/** @typedef {import('./kurallar.d.mts').Tetikleme} Tetikleme */
/** @typedef {import('./zamanlayici.d.mts').YurutmeBagimliliklari} YurutmeBagimliliklari */
/** @typedef {import('./zamanlayici.d.mts').YurutmeSonucu} YurutmeSonucu */

export const KONTROL_ARALIGI_MS = 60_000;
export const ATLANDI_MESAJI = 'Atlandı: koşu sürüyordu.';

/** @param {unknown} hata */
const hataMetni = (hata) => String(/** @type {Error} */ (hata)?.message ?? hata).split('\n')[0].slice(0, 300);

/**
 * Kuralın koşusunu yürütür (bekler): senaryolar sırayla, sonra seçili servis akışları; en sonda (seçildiyse) bildirim.
 * @param {Veritabani} vt @param {Kural} kural @param {string} kosuKimligi @param {YurutmeBagimliliklari} bag
 * @returns {Promise<YurutmeSonucu>}
 */
export async function zamanliKosuyuYurut(vt, kural, kosuKimligi, bag) {
  const ortam = ortamGetir(vt, kural.ortamId);
  if (!ortam || ortam.projeId !== kural.projeId) throw new DepoHatasi('Ortam bulunamadı (silinmiş olabilir).');
  // İzinler (Ayarlar > İzinler; tek merkez guvenlik/izinler.mjs + uc-denetimi.mjs): kullanıcı yokken pencere açılamaz — kapalı
  // izne tabi işlem ATLANIR ve geçmişte "izin kapalı: X" olarak görünür.
  if (!izinAcikMi(vt, 'arka-plan')) {
    return { durum: 'atlandi', mesaj: `Atlandı: ${izinKapaliNotu('arka-plan')}. ${izinMesaji('arka-plan')}`, kosuId: null, ozet: null, akisKosulari: [] };
  }
  if (ortamRiskliMi(ortam) && !kural.canliOnay) throw new DepoHatasi('Ortam riskli ama kuralda canlı ortam onayı yok; koşu başlatılmadı.');
  const { senaryolar: kapsam, ekranIdleri, servisAkisIdleri } = kural.kapsam;
  const secilen = kapsam === 'yok' ? [] : bag.senaryolar(vt, kural.projeId, kural.ortamId)
    .filter((s) => s.kosuyaDahil && s.ekranEtkin !== false && (kapsam === 'tum' || (s.ekranId !== null && ekranIdleri.includes(s.ekranId))));
  if (!secilen.length && !servisAkisIdleri.length) throw new DepoHatasi('Kapsama uyan "Koşuda" senaryo yok.');
  const tam = kapsam === 'tum';
  const ozet = { toplam: 0, basarili: 0, basarisiz: 0, atlanan: 0, hata: 0 };
  /** @type {YurutmeSonucu['akisKosulari']} */
  const akisKosulari = [];
  let yarida = false;
  let ilkHata = '';
  const devam = () => (bag.devamMi ? bag.devamMi() : true);
  /** Kapalı izin yüzünden atlanan işlemler ("izin kapalı: X"). @type {Set<string>} */
  const izinNotlari = new Set();
  let izinleAtlananSenaryo = 0;
  let izinleAtlananAkis = 0;
  /** @param {string} yol @param {Record<string, unknown>} govde */
  const kapali = (yol, govde) => kapaliIzinler(vt, yol, govde);

  for (const s of secilen) {
    if (!devam()) { yarida = true; break; }
    ozet.toplam++;
    const eksik = kapali('/platform/senaryolar/calistir', { projeId: kural.projeId, ortamId: kural.ortamId, senaryoId: s.id });
    if (eksik.length) {
      ozet.atlanan++;
      izinleAtlananSenaryo++;
      for (const a of eksik) izinNotlari.add(izinKapaliNotu(a));
      continue;
    }
    try {
      const y = await bag.senaryoCalistir(vt, {
        projeId: kural.projeId, ortamId: kural.ortamId, senaryoId: s.id, kosuId: randomUUID(),
        kosuTuru: tam ? 'tam' : 'tekil', kosuKimligi, ...(tam ? { kosuKapsami: 'Genel' } : {})
      });
      const d = y.govde.durum;
      if (y.govde.basarili === false) { ozet.hata++; ilkHata ||= `${s.baslik}: ${hataMetni(y.govde.mesaj ?? y.govde.hata ?? 'çalıştırılamadı')}`; }
      else if (d === 'passed') ozet.basarili++;
      else if (d === 'skipped' || d === 'iptal') ozet.atlanan++;
      else ozet.basarisiz++;
    } catch (hata) {
      ozet.hata++;
      ilkHata ||= `${s.baslik}: ${hataMetni(hata)}`;
    }
  }

  for (const akisId of servisAkisIdleri) {
    if (yarida || !devam()) { yarida = true; break; }
    if (!bag.servisAkisiCalistir) break;
    const eksik = kapali('/platform/servis-akisi/kos', { projeId: kural.projeId, ortamId: kural.ortamId, akisId });
    if (eksik.length) {
      akisKosulari.push({ akisId, kosuId: null, durum: 'atlandi' });
      izinleAtlananAkis++;
      for (const a of eksik) izinNotlari.add(izinKapaliNotu(a));
      continue;
    }
    try {
      const r = await bag.servisAkisiCalistir(vt, kural.projeId, { akisId, ortamId: kural.ortamId, tur: 'kosu' });
      akisKosulari.push({ akisId, kosuId: r.kosuId ?? null, durum: r.durum });
    } catch (hata) {
      akisKosulari.push({ akisId, kosuId: null, durum: 'hata' });
      ilkHata ||= `Servis akışı: ${hataMetni(hata)}`;
    }
  }

  const senaryoKostu = ozet.toplam > 0;
  const kosanSenaryo = ozet.toplam - izinleAtlananSenaryo > 0;
  if (kural.bildirimBaglantiId && kosanSenaryo && bag.bildir && devam()) {
    // Dış gönderim izni kapalıysa bildirim gönderilmez (kosuBittiBildir de denetler); kayda not düşülür.
    if (!izinAcikMi(vt, 'dis-gonderim')) izinNotlari.add(izinKapaliNotu('dis-gonderim'));
    else { try { await bag.bildir(vt, kosuKimligi, [kural.bildirimBaglantiId]); } catch { /* bildirim hatası koşuyu etkilemez */ } }
  }
  const akisSorunu = akisKosulari.filter((a) => a.durum !== 'basarili').length;
  const hepsiIzinle = izinleAtlananSenaryo + izinleAtlananAkis > 0 && izinleAtlananSenaryo === ozet.toplam && izinleAtlananAkis === akisKosulari.length && !yarida;
  const durum = hepsiIzinle ? 'atlandi' : yarida ? 'yarida' : ozet.basarisiz || ozet.hata || akisSorunu ? 'basarisiz' : 'tamamlandi';
  const parcalar = [
    hepsiIzinle ? 'Atlandı' : null,
    senaryoKostu && !hepsiIzinle ? `${ozet.basarili} başarılı, ${ozet.basarisiz} başarısız${ozet.atlanan ? `, ${ozet.atlanan} atlandı` : ''}${ozet.hata ? `, ${ozet.hata} çalıştırılamadı` : ''}` : null,
    akisKosulari.length && !hepsiIzinle ? `${akisKosulari.length - akisSorunu}/${akisKosulari.length} servis akışı başarılı` : null,
    izinNotlari.size ? `${[...izinNotlari].join(', ')} (Ayarlar > İzinler)` : null,
    yarida ? 'yarıda kaldı (kasa kilitlendi ya da çalışma alanı değişti)' : null,
    ilkHata || null
  ].filter(Boolean);
  return { durum, mesaj: parcalar.join(' · '), kosuId: kosanSenaryo ? kosuKimligi : null, ozet: senaryoKostu && !hepsiIzinle ? ozet : null, akisKosulari };
}

/**
 * Zamanlayıcı: dakikada bir kontrolEt(). bag.veritabani() kasa açıksa veritabanını, değilse null döner.
 * @param {import('./zamanlayici.d.mts').ZamanlayiciBagimliliklari} bag
 */
export function zamanlayiciOlustur(bag) {
  const saat = bag.simdi ?? (() => new Date());
  const log = bag.log ?? (() => {});
  /** @type {{ kuralId: string; tetiklemeId: string; ad: string } | null} */
  let suren = null;
  /** Kasa kilitliyken yazılamayan tetikleme sonuçları (kasa açılınca yazılır). @type {Array<{ kuralId: string; t: Tetikleme }>} */
  const bekleyen = [];
  /** @type {ReturnType<typeof setInterval> | null} */
  let aralik = null;
  /** "Bitince koş": koşu sürerken vakti gelen kurallar (kural kimliği → zaman), sırayla. @type {Map<string, string>} */
  const sonraKosulacak = new Map();
  /** Kullanıcının kararları (Ayarlar > Koşu > Zamanlanmış koşu davranışı); okunamazsa önceki davranış. @param {Veritabani} vt */
  const davranis = (vt) => {
    try { return bag.davranis ? bag.davranis(vt) : { kacan: 'atla', cakisma: 'atla' }; } catch { return { kacan: 'atla', cakisma: 'atla' }; }
  };

  /** @param {Veritabani | null} vt @param {string} kuralId @param {Tetikleme} t */
  const yaz = (vt, kuralId, t) => {
    try { if (!vt) throw new Error('kasa kilitli'); tetiklemeYaz(vt, kuralId, t); } catch { bekleyen.push({ kuralId, t }); }
  };

  /** Önceki süreçten "çalışıyor" kalmış tetiklemeler (sunucu koşu sırasında kapandı) "yarıda" olur. @param {Veritabani} vt */
  const kalintilariKapat = (vt) => {
    for (const [kuralId, liste] of Object.entries(tumGecmis(vt))) {
      for (const t of liste) {
        if (t.durum !== 'calisiyor' || (suren && suren.tetiklemeId === t.id)) continue;
        tetiklemeYaz(vt, kuralId, { ...t, durum: 'yarida', bitis: t.bitis ?? saat().toISOString(), mesaj: t.mesaj || 'Yarıda kaldı: sunucu koşu sırasında kapandı.' });
      }
    }
  };

  /**
   * Vakti gelen kuralları tetikler. Başlatılan koşuların sözlerini döner (testler bekleyebilir; sunucu beklemez).
   * @returns {Promise<Array<Promise<void>>>}
   */
  async function kontrolEt() {
    // Kasa kilitliyken ve kullanıcı "kilitliyken de çalışsın" dediyse (anahtar emanette): anahtar arka plan kipinde (arayüz
    // kilitli) yerleştirilir; denetim ve başlattığı koşular bitince kaldırılır (bkz. anahtar-emaneti.mjs).
    const bitir = bag.arkaPlanIsi ? bag.arkaPlanIsi() : null;
    const vt = bag.veritabani();
    if (!vt) { bitir?.(); return []; }
    const baslatilan = await denetle(vt);
    if (bitir) {
      if (baslatilan.length) void Promise.allSettled(baslatilan).then(() => bitir());
      else bitir();
    }
    return baslatilan;
  }

  /** @param {Veritabani} vt @returns {Promise<Array<Promise<void>>>} */
  async function denetle(vt) {
    while (bekleyen.length) {
      const x = /** @type {{ kuralId: string; t: Tetikleme }} */ (bekleyen[0]);
      try { tetiklemeYaz(vt, x.kuralId, x.t); bekleyen.shift(); } catch { break; }
    }
    /** @type {Kural[]} */
    let kurallar;
    try { kalintilariKapat(vt); kurallar = tumKurallar(vt); } catch { return []; }
    const simdi = saat();
    const d = davranis(vt);
    /** @type {Array<Promise<void>>} */
    const baslatilan = [];
    /** Vakti gelen (kural, zaman) çiftleri: önce "bitince koş" ile bekleyenler (silinmiş / kapatılmış kural atılır), sonra yeniler. */
    /** @type {Array<{ k: Kural; zaman: string; bekleyen: boolean }>} */
    const vadesiGelenler = [];
    for (const [kuralId, zaman] of [...sonraKosulacak]) {
      const k = kurallar.find((x) => x.id === kuralId && x.etkin);
      if (!k || d.cakisma !== 'bitinceKos') { sonraKosulacak.delete(kuralId); continue; }
      vadesiGelenler.push({ k, zaman, bekleyen: true });
    }
    for (const k of kurallar) {
      if (!k.etkin) continue;
      const vakit = vadesiGelenZaman(k.zaman, simdi, k.tuketilen, TOLERANS_MS, { kacanlariKos: d.kacan === 'sonraKos' });
      if (!vakit) continue;
      const zaman = vakit.toISOString();
      try { tuketilenYaz(vt, k.id, zaman); } catch { continue; }
      // Aynı kuralın bekleyen eski zamanı varsa yenisi onun yerini alır (kural bir kez koşulur).
      const eski = vadesiGelenler.findIndex((x) => x.bekleyen && x.k.id === k.id);
      if (eski >= 0) vadesiGelenler.splice(eski, 1);
      vadesiGelenler.push({ k, zaman, bekleyen: false });
    }
    for (const { k, zaman, bekleyen } of vadesiGelenler) {
      const baslangic = saat().toISOString();
      if (suren || bag.mesgulMu()) {
        // "Bitince koş": atlanmaz, bellekte bekler (aynı kuralın yeni zamanı eskisinin yerini alır — yine bir kez koşulur).
        if (d.cakisma === 'bitinceKos') {
          if (!bekleyen) { sonraKosulacak.set(k.id, zaman); log(`[zamanlama] "${k.ad}" bekliyor: koşu sürüyor, bitince başlatılacak.`); }
          continue;
        }
        yaz(vt, k.id, { id: randomUUID(), zaman, baslangic, bitis: baslangic, durum: 'atlandi', mesaj: ATLANDI_MESAJI, kosuId: null, ozet: null, akisKosulari: [] });
        log(`[zamanlama] "${k.ad}" atlandı: koşu sürüyordu.`);
        continue;
      }
      sonraKosulacak.delete(k.id);
      // Arka plan çalışması izni (Ayarlar > İzinler) kapalıysa hiçbir şey başlatılmaz; geçmişte "izin kapalı" görünür.
      if (!izinAcikMi(vt, 'arka-plan')) {
        yaz(vt, k.id, { id: randomUUID(), zaman, baslangic, bitis: baslangic, durum: 'atlandi', mesaj: `Atlandı: ${izinKapaliNotu('arka-plan')}. ${izinMesaji('arka-plan')}`, kosuId: null, ozet: null, akisKosulari: [] });
        log(`[zamanlama] "${k.ad}" atlandı: arka plan çalışması izni kapalı.`);
        continue;
      }
      const kosuKimligi = `zamanli-${randomUUID()}`;
      /** @type {Tetikleme} */
      const t = { id: randomUUID(), zaman, baslangic, bitis: null, durum: 'calisiyor', mesaj: '', kosuId: null, ozet: null, akisKosulari: [] };
      yaz(vt, k.id, t);
      suren = { kuralId: k.id, tetiklemeId: t.id, ad: k.ad };
      log(`[zamanlama] "${k.ad}" başladı (${kosuKimligi}).`);
      const kural = k;
      baslatilan.push((async () => {
        /** @type {Tetikleme} */
        let son;
        try {
          const r = await bag.yurut(vt, kural, kosuKimligi, () => bag.veritabani() === vt);
          son = { ...t, ...r, bitis: saat().toISOString() };
        } catch (hata) {
          son = { ...t, durum: 'hata', mesaj: hataMetni(hata), bitis: saat().toISOString() };
        }
        suren = null;
        yaz(bag.veritabani() === vt ? vt : null, kural.id, son);
        log(`[zamanlama] "${kural.ad}" bitti: ${son.durum}.`);
      })());
    }
    return baslatilan;
  }

  return {
    kontrolEt,
    /** Şu an süren zamanlanmış koşu (arayüzde gösterilir). */
    suren: () => (suren ? { kuralId: suren.kuralId, ad: suren.ad } : null),
    baslat() {
      if (aralik) return;
      aralik = setInterval(() => { void kontrolEt().catch(() => {}); }, KONTROL_ARALIGI_MS);
      aralik.unref?.();
    },
    durdur() { if (aralik) clearInterval(aralik); aralik = null; }
  };
}
