// SORUN MODELİ (saf; yan etki yok): aynı İMZALI başarısızlıkların dönem boyunca izlenen kümesi ("sorun"), durumu ve kararlılık.
// İmza = öğe (ekran kimliği / servis + metot) + ilk başarısız adım (ekran) + hata kategorisi / türü + hata kalıbı (MASKELİ metinden
// siniflandirma.mjs > kalipCikar) — çağıran üretir; burada sha1 ile kısaltılır (dönemler arası aynı sorun aynı imza).
// Maruziyet: imzanın maruziyet anahtarlarında (ekran: sorunun görüldüğü senaryolar; servis: metot) dönemde koşan (geçen + kalan)
// sonuç sayısı; oranlar adet yerine maruziyete göre karşılaştırılır (daha çok koşulan dönem haksız yere "artan" görünmez).
// Durum kuralları (sırayla; ilk eşleşen; eşikler ESIKLER):
//   Çözülen: n = 0, n′ > 0 ve imzanın senaryoları D'de ≥ 3 kez geçti (koşmadıysa "doğrulanamadı" — çözülen sayılmaz)
//   Kararsız: D'deki başarısızlıkların ≥ %50'si kararsız senaryolardan
//   Yeni: n > 0, n′ = 0 ve geriye bakış penceresinde (G) hiç görülmemiş
//   Tekrar eden: n > 0, n′ = 0, G'de görülmüş ve son görülmesinden sonra çözülme koşulu (≥ 3 geçiş) sağlanmış
//   Artan: n′ > 0, r ≥ 1,5 × r′ ve n − n′ ≥ 2 · Azalan: n′ > 0, r ≤ 0,67 × r′ ve n′ − n ≥ 2 · Süregelen: diğerleri
//   (n > 0, n′ = 0, G'de görülmüş ama arada çözülmemiş sorun da süregelendir.)
//   D içinde ≥ 3 ardışık geçişten sonra yeniden kalan imza ayrıca "tekrar eden" rozeti alır.
// Kararlılık (senaryo): aynı senaryo + ortam + gün + model sürümü (uygulama sürümü verisi henüz yok) içindeki geçti↔kaldı değişimi;
//   oran = Σ değişim ÷ Σ (koşu − 1); "koşu" yalnız karşılaştırılabilir koşulardır (grubunda en az iki koşu olan).
//   Kararsız: oran ≥ %20 ve koşu ≥ 5; izlenir: %5–20 ya da ek kanıt (tekrar denemesinde /
//   "Başarısızları tekrar çalıştır" koşusunda geçmiş). Atlanan ve durdurulan sonuçlar diziye girmez.
import { createHash } from 'node:crypto';
import { GUN_MS, donemParcasi, gunAnahtari, kovaIndeksi } from './donem.mjs';
import { KATEGORI } from './siniflandirma.mjs';

export const ESIKLER = Object.freeze({
  artis: 1.5, azalis: 0.67, enAzFark: 2, cozulmeGecis: 3, kararsizPay: 0.5, kararsizOran: 0.2, kararsizKosu: 5, izlenirOran: 0.05
});

/** Durum sırası (rapordaki gruplar) ve etiketleri. */
export const SORUN_DURUMLARI = Object.freeze(['yeni', 'artan', 'tekrar', 'suregelen', 'kararsiz', 'azalan', 'cozulen', 'dogrulanamadi']);
export const SORUN_DURUM_ETIKETLERI = Object.freeze({
  yeni: 'Yeni', artan: 'Artan', tekrar: 'Tekrar eden', suregelen: 'Süregelen', kararsiz: 'Kararsız', azalan: 'Azalan', cozulen: 'Çözülen',
  dogrulanamadi: 'Doğrulanamadı (koşmadı)'
});

/**
 * Tek sonuç gözlemi (ekran sonucu ya da servis çağrısı).
 * surum: model sürümü; uygulamaSurumu: test edilen uygulamanın sürümü (koşuya bağlı etiket; PDF rapor A4 — yoksa null).
 * @typedef {{ zaman: number; durum: string; senaryo: string; maruz: string; ortam: string | null; surum?: string | number | null;
 *   uygulamaSurumu?: string | null; deneme?: number; tekrarKosusu?: boolean; imza?: { parcalar: string[]; bilgi: Record<string, unknown> } }} Gozlem
 * @typedef {{ kosu: number; degisim: number; oran: number; ekKanit: boolean; durum: 'kararsiz' | 'izlenir' | 'kararli' }} Kararlilik
 * @typedef {{ imza: string; bilgi: Record<string, unknown>; durum: string; n: number; nOnceki: number; maruz: number; maruzOnceki: number;
 *   oran: number; oranOnceki: number; senaryolar: string[]; ilk: number; son: number; seri: number[]; oncekiSeri: number[]; acikGun: number;
 *   tekrarRozeti: boolean; kararsizPay: number; gecis: number; ilkSurum: string | null }} Sorun
 *   ilkSurum: sorunun ilk görüldüğü (geriye bakış dahil) sonucun uygulama sürümü — "hangi sürümde başladı" (sürüm yoksa null).
 */

/** İmza parçalarından kısa, kararlı kimlik (sha1, 16 hane). @param {ReadonlyArray<string>} parcalar */
export const imzaKimligi = (parcalar) => createHash('sha1').update(parcalar.map((p) => String(p ?? '')).join('\u0000'), 'utf8').digest('hex').slice(0, 16);

/** @param {string} d */
const kosanMi = (d) => d === 'basarili' || d === 'basarisiz' || d === 'hata';
/** @param {string} d */
const kalanMi = (d) => d === 'basarisiz' || d === 'hata';

/**
 * Senaryo kararlılığı (verilen gözlemlerden; çağıran dönemi süzer).
 * @param {ReadonlyArray<Gozlem>} gozlemler @param {typeof ESIKLER} [e]
 * @returns {Map<string, Kararlilik>}
 */
export function kararlilikHesapla(gozlemler, e = ESIKLER) {
  /** @type {Map<string, Gozlem[]>} */
  const gruplar = new Map();
  /** @type {Map<string, boolean>} */
  const kanit = new Map();
  for (const g of gozlemler) {
    if (!kosanMi(g.durum)) continue;
    // Karşılaştırılabilir koşular: aynı senaryo + ortam + model sürümü ve aynı UYGULAMA SÜRÜMÜ (kayıtlıysa; tasarımın tam tanımı) —
    // sürüm yoksa aynı gün.
    const a = `${g.senaryo}\u0000${g.ortam ?? ''}\u0000${g.uygulamaSurumu ? `s:${g.uygulamaSurumu}` : gunAnahtari(g.zaman)}\u0000${g.surum ?? ''}`;
    (gruplar.get(a) ?? gruplar.set(a, []).get(a))?.push(g);
    if (g.durum === 'basarili' && ((g.deneme ?? 0) > 0 || g.tekrarKosusu)) kanit.set(g.senaryo, true);
  }
  /** @type {Map<string, { kosu: number; degisim: number; payda: number }>} */
  const toplam = new Map();
  for (const liste of gruplar.values()) {
    liste.sort((a, b) => a.zaman - b.zaman);
    const t = toplam.get(liste[0].senaryo) ?? { kosu: 0, degisim: 0, payda: 0 };
    toplam.set(liste[0].senaryo, t);
    // Yalnız karşılaştırılabilir koşular (aynı grupta en az iki koşu) sayılır: farklı günlerdeki tek koşular kararsızlık kanıtı değildir.
    if (liste.length < 2) continue;
    t.kosu += liste.length;
    t.payda += liste.length - 1;
    for (let i = 1; i < liste.length; i++) if (kalanMi(liste[i].durum) !== kalanMi(liste[i - 1].durum)) t.degisim++;
  }
  /** @type {Map<string, Kararlilik>} */
  const sonuc = new Map();
  for (const [senaryo, t] of toplam) {
    const oran = t.payda ? t.degisim / t.payda : 0;
    const ekKanit = kanit.get(senaryo) === true;
    const durum = oran >= e.kararsizOran && t.kosu >= e.kararsizKosu ? 'kararsiz' : oran >= e.izlenirOran || ekKanit ? 'izlenir' : 'kararli';
    sonuc.set(senaryo, { kosu: t.kosu, degisim: t.degisim, oran, ekKanit, durum });
  }
  return sonuc;
}

/**
 * Sorunları hesaplar. gozlemler: G ∪ D′ ∪ D (dışındakiler yok sayılır); kalan gözlemlerde imza zorunlu.
 * @param {ReadonlyArray<Gozlem>} gozlemler @param {import('./donem.mjs').Donem} donem
 * @param {{ esikler?: typeof ESIKLER; kararlilik?: Map<string, Kararlilik>; simdi?: number }} [s]
 * @returns {Sorun[]}
 */
export function sorunlariHesapla(gozlemler, donem, s = {}) {
  const e = s.esikler ?? ESIKLER;
  const sirali = gozlemler.filter((g) => donemParcasi(donem, g.zaman) !== null).slice().sort((a, b) => a.zaman - b.zaman);
  const kararlilik = s.kararlilik ?? kararlilikHesapla(sirali.filter((g) => donemParcasi(donem, g.zaman) === 'D'), e);
  /** @type {Map<string, { bilgi: Record<string, unknown>; kalanlar: Gozlem[]; maruzlar: Set<string> }>} */
  const imzalar = new Map();
  for (const g of sirali) {
    if (!kalanMi(g.durum) || !g.imza) continue;
    const id = imzaKimligi(g.imza.parcalar);
    const x = imzalar.get(id) ?? { bilgi: g.imza.bilgi, kalanlar: [], maruzlar: new Set() };
    imzalar.set(id, x);
    x.kalanlar.push(g);
    x.maruzlar.add(g.maruz);
    x.bilgi = g.imza.bilgi; // en yeni gözlemin bilgisi (ör. son senaryo adı)
  }
  const bitMs = Math.min(donem.bit.getTime(), s.simdi ?? donem.bit.getTime());
  /** @type {Sorun[]} */
  const sorunlar = [];
  for (const [imza, x] of imzalar) {
    const ilgili = sirali.filter((g) => x.maruzlar.has(g.maruz) && kosanMi(g.durum));
    const parca = (/** @type {Gozlem} */ g) => donemParcasi(donem, g.zaman);
    const kalanD = x.kalanlar.filter((g) => parca(g) === 'D');
    const kalanO = x.kalanlar.filter((g) => parca(g) === 'O');
    const kalanG = x.kalanlar.filter((g) => parca(g) === 'G');
    const n = kalanD.length;
    const nOnceki = kalanO.length;
    if (!n && !nOnceki) continue; // yalnız geriye bakışta görülen
    const maruz = ilgili.filter((g) => parca(g) === 'D').length;
    const maruzOnceki = ilgili.filter((g) => parca(g) === 'O').length;
    const oran = maruz ? n / maruz : 0;
    const oranOnceki = maruzOnceki ? nOnceki / maruzOnceki : 0;
    const gecis = ilgili.filter((g) => parca(g) === 'D' && g.durum === 'basarili').length;
    const kararsizPay = n ? kalanD.filter((g) => kararlilik.get(g.senaryo)?.durum === 'kararsiz').length / n : 0;
    /** @type {string} */
    let durum;
    if (!n) durum = gecis >= e.cozulmeGecis ? 'cozulen' : 'dogrulanamadi';
    else if (kararsizPay >= e.kararsizPay) durum = 'kararsiz';
    else if (!nOnceki) {
      if (!kalanG.length) durum = 'yeni';
      else {
        const sonG = kalanG[kalanG.length - 1].zaman;
        const sonraGecis = ilgili.filter((g) => g.zaman > sonG && g.zaman < donem.bas.getTime() && g.durum === 'basarili').length;
        durum = sonraGecis >= e.cozulmeGecis ? 'tekrar' : 'suregelen';
      }
    } else if (oran >= e.artis * oranOnceki && n - nOnceki >= e.enAzFark) durum = 'artan';
    else if (oran <= e.azalis * oranOnceki && nOnceki - n >= e.enAzFark) durum = 'azalan';
    else durum = 'suregelen';
    // D içinde ≥ 3 ardışık geçişten sonra yeniden kalma → "tekrar eden" rozeti.
    let ardisik = 0;
    let kaldiMi = false;
    let tekrarRozeti = durum === 'tekrar';
    for (const g of ilgili.filter((y) => parca(y) === 'D')) {
      if (g.durum === 'basarili') { ardisik++; continue; }
      if (kaldiMi && ardisik >= e.cozulmeGecis && kalanD.includes(g)) tekrarRozeti = true;
      if (kalanD.includes(g)) { kaldiMi = true; ardisik = 0; }
    }
    const acikBas = (nOnceki ? kalanO[0] : kalanD[0])?.zaman ?? bitMs;
    const seri = donem.kovalar.map(() => 0);
    const oncekiSeri = donem.oncekiKovalar.map(() => 0);
    for (const g of kalanD) { const i = kovaIndeksi(donem.kovalar, g.zaman); if (i >= 0) seri[i]++; }
    for (const g of kalanO) { const i = kovaIndeksi(donem.oncekiKovalar, g.zaman); if (i >= 0) oncekiSeri[i]++; }
    sorunlar.push({
      imza, bilgi: x.bilgi, durum, n, nOnceki, maruz, maruzOnceki, oran, oranOnceki,
      senaryolar: [...new Set(kalanD.map((g) => g.senaryo))], ilk: x.kalanlar[0].zaman, son: x.kalanlar[x.kalanlar.length - 1].zaman,
      seri, oncekiSeri, acikGun: n ? Math.max(1, Math.ceil((bitMs - acikBas) / GUN_MS)) : 0, tekrarRozeti, kararsizPay, gecis,
      ilkSurum: x.kalanlar[0].uygulamaSurumu ?? null
    });
  }
  const sira = (/** @type {string} */ d) => SORUN_DURUMLARI.indexOf(d);
  return sorunlar.sort((a, b) => sira(a.durum) - sira(b.durum) || b.n - a.n || b.son - a.son);
}

/** Hata kategorisinin kısa adı (sorun başlığı için). @param {string} kategori */
export function kategoriKisaAdi(kategori) {
  switch (kategori) {
    case KATEGORI.popup: return 'iş kuralı / ekran mesajı';
    case KATEGORI.zamanAsimi: return 'zaman aşımı';
    case KATEGORI.secici: return 'elemana ulaşılamadı';
    case KATEGORI.dogrulama: return 'doğrulama hatası';
    default: return 'hata';
  }
}

/** Servis hata türleri (metot × hata türü). */
export const SERVIS_HATA_TURLERI = Object.freeze([
  ['kontrol', 'Kontrol kaldı (2xx)'], ['h4', 'HTTP 4xx'], ['h5', 'HTTP 5xx'], ['fault', 'SOAP Fault'], ['zaman', 'Zaman aşımı'], ['baglanti', 'Bağlantı']
]);

/**
 * Kök neden sınıfı tahmini (dayanağıyla). Kullanıcının hata sınıflandırma kurallarının kategorileri tanınmazsa "Uygulama".
 * Test verisi sınıfı, tablo satırı kanıtı (tarihi geçmiş değer, kırık başvuru) gerektirir — bu kanıt henüz toplanmadığından verilmez.
 * @param {{ tur: 'ekran' | 'servis'; kategori?: string | null; hataTuru?: string | null; durum?: string }} g
 * @returns {{ sinif: 'uygulama' | 'veri' | 'bakim' | 'ortam' | 'kararsiz'; dayanak: string }}
 */
export function sinifTahmini(g) {
  if (g.durum === 'kararsiz') return { sinif: 'kararsiz', dayanak: 'Aynı senaryo aynı koşullarda hem geçti hem kaldı.' };
  if (g.tur === 'servis') {
    switch (g.hataTuru) {
      case 'zaman': return { sinif: 'ortam', dayanak: 'Zaman aşımı (yanıt gelmedi).' };
      case 'baglanti': return { sinif: 'ortam', dayanak: 'Bağlantı hatası (yanıt gelmedi).' };
      case 'h5': return { sinif: 'ortam', dayanak: 'HTTP 5xx yanıtı.' };
      case 'h4': return { sinif: 'uygulama', dayanak: 'HTTP 4xx yanıtı (test verisi kanıtı yok).' };
      case 'fault': return { sinif: 'uygulama', dayanak: 'SOAP Fault yanıtı.' };
      default: return { sinif: 'uygulama', dayanak: 'Yanıt geldi, senaryodaki kontrol tutmadı.' };
    }
  }
  switch (g.kategori) {
    case KATEGORI.zamanAsimi: return { sinif: 'ortam', dayanak: 'Zaman aşımı.' };
    case KATEGORI.secici: return { sinif: 'bakim', dayanak: 'Seçici / elemana ulaşılamadı.' };
    case KATEGORI.dogrulama: return { sinif: 'uygulama', dayanak: 'Doğrulama: beklenen ≠ görülen.' };
    case KATEGORI.popup: return { sinif: 'uygulama', dayanak: 'İş kuralı / ekran mesajı (test verisi kanıtı yok).' };
    default: return { sinif: 'uygulama', dayanak: 'Sınıflandırılamadı (varsayılan).' };
  }
}

/** Bağlantılı sorun eşikleri: kova (günlük kırılımda gün) kümelerinin Jaccard örtüşmesi ve en az ortak kova. */
export const BAGLANTI_ESIKLERI = Object.freeze({ jaccard: 0.6, enAzOrtak: 2 });

/**
 * Bağlantılı sorunlar (ekran ↔ servis): aynı dönemde bir ekran sorunu ile bir servis sorununun görüldüğü kovaların kesişimi ÷
 * birleşimi (Jaccard) eşik üstündeyse ve en az iki ortak kova varsa çift önerilir. Yalnız bu dönemde görülen (n > 0) sorunlar
 * eşlenir. Öneri niteliğindedir: aynı kök neden OLASI (ör. tek ortam kesintisi iki yerde görünür). En yüksek örtüşme önce.
 * @template {{ imza: string; seri: number[]; n: number }} T
 * @param {ReadonlyArray<T>} ekranSorunlari @param {ReadonlyArray<T>} servisSorunlari @param {typeof BAGLANTI_ESIKLERI} [e]
 * @returns {Array<{ ekran: T; servis: T; ortak: number; birlesim: number; jaccard: number }>}
 */
export function baglantiliSorunlar(ekranSorunlari, servisSorunlari, e = BAGLANTI_ESIKLERI) {
  const kume = (/** @type {number[]} */ seri) => new Set(seri.flatMap((v, i) => (v > 0 ? [i] : [])));
  const servisler = servisSorunlari.filter((s) => s.n > 0).map((s) => ({ s, k: kume(s.seri) }));
  /** @type {Array<{ ekran: T; servis: T; ortak: number; birlesim: number; jaccard: number }>} */
  const ciftler = [];
  for (const ekran of ekranSorunlari) {
    if (!(ekran.n > 0)) continue;
    const a = kume(ekran.seri);
    for (const { s, k } of servisler) {
      let ortak = 0;
      for (const i of a) if (k.has(i)) ortak++;
      const birlesim = a.size + k.size - ortak;
      const jaccard = birlesim ? ortak / birlesim : 0;
      if (ortak >= e.enAzOrtak && jaccard >= e.jaccard) ciftler.push({ ekran, servis: s, ortak, birlesim, jaccard });
    }
  }
  return ciftler.sort((x, y) => y.jaccard - x.jaccard || y.ortak - x.ortak);
}
