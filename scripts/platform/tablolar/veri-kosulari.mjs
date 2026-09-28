// VERİ KOŞULARI — bir senaryonun tablodan birden çok satırla (her satır / kombinasyon AYRI TEST) koşması. Saf modül (ORTAK: sunucu,
// veri okuyucu ve arayüz; /arayuz/veri-kosulari.mjs olarak sunulur, Node modülü içe aktarmaz).
//
// Senaryo içeriğinde (icerik.veriKosulari; yoksa bugünkü davranış: grup başına TEK satır):
//   { gruplar: { "<tabloId>|<etiket>": { kip: 'secili', satirlar: [satırId…] } | { kip: 'tumu' } },
//     birlesim?: 'kartezyen' | 'eslestir', eslesmeler?: Array<{ "<grup>": satırId }> }
//  · Grup = senaryonun ${Tablo.Sütun} / ${Tablo[etiket].Sütun} başvurularının tablo + etiketi (tabloSecimleri ile aynı anahtar).
//  · kip 'secili': işaretlenen satırların her biri ayrı koşu; 'tumu': senaryonun seçimleriyle (tabloSecimleri) uyan tüm satırlar.
//    Listede olmayan grup "Tek satır"dır (bugünkü kural: seçimlerle uyan ilk satır).
//  · Birden çok grup çoklu ise: 'kartezyen' tüm kombinasyonlar; 'eslestir' kullanıcının satır satır eşlediği çiftler / üçlüler.
//  · Ortama özel satır yalnız kendi ortamında koşar (başka ortamın satırı ve o satırı içeren eşleşme o ortamda atlanır).
// Koşu anı ezmesi (koşu diyaloğu): 'senaryo' (kayıtlı ayar), 'tek' (hepsi tek satır; bugünkü davranış), 'tumu' (kullanılan her grup
// "uyan tüm satırlar", birden çok grupta tüm kombinasyonlar).
// Her veri koşusunun anahtarı satır kimliklerinden ("id1+id2"), adı satır adlarından ("müşteri-1 + ödeme-kart") oluşur; test başlığı
// "Senaryo [ad]" olur. Üst sınır (Ayarlar > Koşu > Tek senaryoda en çok veri koşusu) koşuyu başlatmadan denetlenir.
import { degerBasvurusu, grupAnahtari, tabloBul, uyanSatirlar } from './tablo-secimi.mjs';

export const VERI_KIPLERI = Object.freeze(['secili', 'tumu']);
export const BIRLESIMLER = Object.freeze(['kartezyen', 'eslestir']);
export const KOSU_KIPLERI = Object.freeze(['senaryo', 'tek', 'tumu']);
/** Ayarlar > Koşu > "Tek senaryoda en çok veri koşusu" varsayılanı (kosu-ayarlari.mjs ile aynı). */
export const VARSAYILAN_VERI_KOSUSU_SINIRI = 50;
const EN_COK_SATIR = 1000;
const GRUP = /^([A-Za-z0-9_-]{1,100})\|([\p{L}\p{N} _-]{0,40})$/u;
const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * @typedef {{ id?: string; ad?: string; ortamId: string | null; degerler: Record<string, string | null>; guncellenme?: string }} VkSatir
 * @typedef {{ id: string; ad: string; sutunlar: ReadonlyArray<{ ad: string; gizli?: boolean }>; satirlar: VkSatir[] }} VkTablo
 * @typedef {{ kip: 'secili'; satirlar: string[] } | { kip: 'tumu' }} GrupAyari
 * @typedef {{ gruplar: Record<string, GrupAyari>; birlesim?: 'kartezyen' | 'eslestir'; eslesmeler?: Array<Record<string, string>> }} VeriKosulari
 * @typedef {{ anahtar: string; ad: string; satirlar: Record<string, string> }} VeriKosusu
 */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/**
 * Senaryo verisindeki başvuruların grupları (tablo + etiket; tablo KİMLİĞİYLE anahtar), veri sırasıyla, tekrarsız.
 * @param {Record<string, unknown> | null | undefined} veri @param {ReadonlyArray<VkTablo>} tablolar
 * @returns {Array<{ anahtar: string; tablo: VkTablo; etiket: string }>}
 */
export function basvuruGruplari(veri, tablolar) {
  /** @type {Map<string, { anahtar: string; tablo: VkTablo; etiket: string }>} */
  const gruplar = new Map();
  for (const v of Object.values(nesneMi(veri) ? /** @type {Record<string, unknown>} */ (veri) : {})) {
    const b = degerBasvurusu(v);
    if (!b) continue;
    const t = tabloBul(/** @type {VkTablo[]} */ ([...tablolar]), b.tablo);
    if (!t) continue;
    const anahtar = grupAnahtari(t.id, b.etiket);
    if (!gruplar.has(anahtar)) gruplar.set(anahtar, { anahtar, tablo: t, etiket: b.etiket });
  }
  return [...gruplar.values()];
}

/**
 * Kaydedilecek veri koşusu ayarını doğrular (tablolar projenin tabloları). Boş / yok → undefined (bugünkü davranış).
 * @param {unknown} v @param {ReadonlyArray<VkTablo>} tablolar
 * @returns {{ ayar: VeriKosulari | undefined; hatalar: string[] }}
 */
export function veriKosulariniAyikla(v, tablolar) {
  if (v === undefined || v === null) return { ayar: undefined, hatalar: [] };
  if (!nesneMi(v)) return { ayar: undefined, hatalar: ['"veriKosulari" bir nesne olmalıdır.'] };
  const o = /** @type {Record<string, unknown>} */ (v);
  /** @type {string[]} */
  const hatalar = [];
  /** @type {Record<string, GrupAyari>} */
  const gruplar = {};
  const ham = nesneMi(o.gruplar) ? Object.entries(/** @type {Record<string, unknown>} */ (o.gruplar)) : [];
  if (o.gruplar !== undefined && !nesneMi(o.gruplar)) hatalar.push('"veriKosulari.gruplar" bir nesne olmalıdır.');
  if (ham.length > 20) return { ayar: undefined, hatalar: ['Bir senaryoda en çok 20 tablo grubu çoklu çalıştırılabilir.'] };
  for (const [anahtar, g] of ham) {
    const m = GRUP.exec(anahtar);
    const t = m ? tablolar.find((x) => x.id === m[1]) : undefined;
    if (!m) { hatalar.push(`Geçersiz tablo grubu: "${anahtar}".`); continue; }
    if (!t) { hatalar.push('Çalıştırma biçimindeki tablo bu projede yok (silinmiş olabilir).'); continue; }
    if (!nesneMi(g)) { hatalar.push(`"${t.ad}" çalıştırma biçimi geçersiz.`); continue; }
    const gg = /** @type {Record<string, unknown>} */ (g);
    if (gg.kip === 'tek' || gg.kip === undefined) continue;
    if (gg.kip === 'tumu') { gruplar[anahtar] = { kip: 'tumu' }; continue; }
    if (gg.kip !== 'secili') { hatalar.push(`"${t.ad}" için çalıştırma biçimi "tek", "secili" ya da "tumu" olmalıdır.`); continue; }
    const satirlar = Array.isArray(gg.satirlar) ? [...new Set(gg.satirlar.filter((x) => typeof x === 'string'))] : [];
    if (!satirlar.length) { hatalar.push(`"${t.ad}${m[2] ? ` [${m[2]}]` : ''}" için en az bir satır işaretleyin.`); continue; }
    if (satirlar.length > EN_COK_SATIR) { hatalar.push(`"${t.ad}" için en çok ${EN_COK_SATIR} satır işaretlenebilir.`); continue; }
    const yok = satirlar.filter((id) => !t.satirlar.some((r) => r.id === id));
    if (yok.length) { hatalar.push(`"${t.ad}" tablosunda işaretlenen ${yok.length} satır yok (silinmiş olabilir).`); continue; }
    gruplar[anahtar] = { kip: 'secili', satirlar };
  }
  const coklu = Object.keys(gruplar);
  if (!coklu.length) return { ayar: undefined, hatalar };
  const birlesim = o.birlesim === 'eslestir' ? 'eslestir' : 'kartezyen';
  if (o.birlesim !== undefined && !BIRLESIMLER.includes(/** @type {string} */ (o.birlesim))) hatalar.push('Birleşim "kartezyen" ya da "eslestir" olmalıdır.');
  /** @type {VeriKosulari} */
  const ayar = { gruplar };
  if (coklu.length > 1) {
    ayar.birlesim = birlesim;
    if (birlesim === 'eslestir') {
      const liste = Array.isArray(o.eslesmeler) ? o.eslesmeler : [];
      if (!liste.length) hatalar.push('Eşleştirerek çalıştırmada en az bir eşleşme (her tablodan bir satır) seçin.');
      if (liste.length > EN_COK_SATIR) hatalar.push(`En çok ${EN_COK_SATIR} eşleşme olabilir.`);
      /** @type {Array<Record<string, string>>} */
      const eslesmeler = [];
      const imzalar = new Set();
      liste.slice(0, EN_COK_SATIR).forEach((e, i) => {
        if (!nesneMi(e)) { hatalar.push(`${i + 1}. eşleşme geçersiz.`); return; }
        /** @type {Record<string, string>} */
        const temiz = {};
        for (const g of coklu) {
          const id = /** @type {Record<string, unknown>} */ (e)[g];
          const t = tablolar.find((x) => x.id === g.split('|')[0]);
          if (typeof id !== 'string' || !KIMLIK.test(id) || !t?.satirlar.some((r) => r.id === id)) {
            hatalar.push(`${i + 1}. eşleşmede ${t ? `"${t.ad}"` : 'bir tablo'} satırı eksik ya da yok.`);
            return;
          }
          temiz[g] = id;
        }
        const imza = coklu.map((g) => temiz[g]).join('+');
        if (!imzalar.has(imza)) { imzalar.add(imza); eslesmeler.push(temiz); }
      });
      ayar.eslesmeler = eslesmeler;
    }
  }
  return { ayar, hatalar };
}

/** Satırın görünen adı. @param {VkSatir} r @param {number} i */
const satirAdi = (r, i) => (r.ad && String(r.ad).trim()) || `Satır ${i + 1}`;
/** Satır bu ortamda geçerli mi (ortamı boşsa her ortamda). @param {VkSatir} r @param {string | null | undefined} ortamId */
const ortamdaMi = (r, ortamId) => !r.ortamId || !ortamId || r.ortamId === ortamId;

/**
 * Senaryonun bu ortamdaki veri koşuları. Çoklu grup yoksa (ya da kip 'tek') kosular boş: senaryo bugünkü gibi TEK test koşar.
 * @param {VeriKosulari | null | undefined} ayar senaryonun kayıtlı ayarı
 * @param {{ tablolar: ReadonlyArray<VkTablo>; gruplar: ReadonlyArray<{ anahtar: string; tablo?: VkTablo; etiket?: string }>; ortamId?: string | null;
 *   tabloSecimleri?: Record<string, Record<string, string>> | null; kip?: string | null }} s
 *   gruplar: senaryonun kullandığı gruplar (basvuruGruplari); kip: koşu anı ezmesi ('senaryo' | 'tek' | 'tumu'; yok = 'senaryo')
 * @returns {{ kosular: VeriKosusu[]; hatalar: string[]; cokluGruplar: string[] }}
 */
export function veriKosulariniAc(ayar, s) {
  const kip = s.kip === 'tek' || s.kip === 'tumu' ? s.kip : 'senaryo';
  const kullanilan = new Set(s.gruplar.map((g) => g.anahtar));
  /** @type {Record<string, GrupAyari>} */
  let gruplar = {};
  let birlesim = 'kartezyen';
  if (kip === 'tumu') {
    for (const g of kullanilan) gruplar[g] = { kip: 'tumu' };
  } else if (kip === 'senaryo' && ayar && nesneMi(ayar.gruplar)) {
    gruplar = Object.fromEntries(Object.entries(ayar.gruplar).filter(([g]) => kullanilan.has(g)));
    birlesim = ayar.birlesim === 'eslestir' ? 'eslestir' : 'kartezyen';
  }
  // Grupların sırası senaryodaki alan sırasıdır (başlık "Senaryo [müşteri-1 + ödeme-kart]" formdaki sırayı izler; kararlı).
  const sira = s.gruplar.map((g) => g.anahtar);
  const cokluGruplar = Object.keys(gruplar).sort((a, b) => sira.indexOf(a) - sira.indexOf(b));
  if (!cokluGruplar.length) return { kosular: [], hatalar: [], cokluGruplar };
  /** @type {string[]} */
  const hatalar = [];
  /** @type {Map<string, { tablo: VkTablo; satirlar: Array<{ satir: VkSatir; ad: string }> }>} */
  const adaylar = new Map();
  for (const g of cokluGruplar) {
    const tabloId = g.split('|')[0];
    const etiket = g.slice(tabloId.length + 1);
    const t = s.tablolar.find((x) => x.id === tabloId);
    if (!t) { hatalar.push('Çalıştırma biçimindeki tablo bu projede yok (silinmiş olabilir).'); continue; }
    const ga = gruplar[g];
    const sira = new Map(t.satirlar.map((r, i) => [r, i]));
    const satirlar = ga.kip === 'tumu'
      ? uyanSatirlar(/** @type {any} */ (t), s.tabloSecimleri?.[g] ?? {}, { ortamId: s.ortamId })
      : ga.satirlar.map((id) => t.satirlar.find((r) => r.id === id)).filter((r) => r && ortamdaMi(r, s.ortamId));
    const adli = /** @type {VkSatir[]} */ (satirlar).filter((r) => r.id).map((r) => ({ satir: r, ad: satirAdi(r, sira.get(r) ?? 0) }));
    if (!adli.length) hatalar.push(`"${t.ad}${etiket ? ` [${etiket}]` : ''}" tablosunda bu ortamda koşulacak satır yok.`);
    adaylar.set(g, { tablo: t, satirlar: adli });
  }
  if (hatalar.length) return { kosular: [], hatalar, cokluGruplar };
  /** @type {Array<Array<{ grup: string; satir: VkSatir; ad: string }>>} */
  let demetler = [[]];
  if (cokluGruplar.length > 1 && birlesim === 'eslestir') {
    demetler = [];
    for (const e of ayar?.eslesmeler ?? []) {
      const demet = cokluGruplar.map((g) => {
        const a = adaylar.get(g)?.satirlar.find((x) => x.satir.id === e[g]);
        return a ? { grup: g, satir: a.satir, ad: a.ad } : null;
      });
      // Eşleşmedeki satırlardan biri bu ortamda yoksa (ortama özel satır / silinmiş) eşleşme bu ortamda koşmaz.
      if (demet.every(Boolean)) demetler.push(/** @type {Array<{ grup: string; satir: VkSatir; ad: string }>} */ (demet));
    }
    if (!demetler.length) hatalar.push('Eşleşmelerin hiçbiri bu ortamda koşamıyor (satırları başka ortama özel ya da silinmiş).');
  } else {
    for (const g of cokluGruplar) {
      /** @type {typeof demetler} */
      const yeni = [];
      for (const d of demetler) for (const a of /** @type {{ satirlar: Array<{ satir: VkSatir; ad: string }> }} */ (adaylar.get(g)).satirlar) yeni.push([...d, { grup: g, satir: a.satir, ad: a.ad }]);
      demetler = yeni;
      // Kartezyen patlamasını erken kes (üst sınırın çok üstü hesaplanmaz; sayı yine doğru raporlanır).
      if (demetler.length > 100_000) break;
    }
  }
  /** @type {Map<string, number>} */
  const adSayaci = new Map();
  const kosular = demetler.map((d) => {
    const temel = d.map((x) => x.ad).join(' + ');
    const n = (adSayaci.get(temel) ?? 0) + 1;
    adSayaci.set(temel, n);
    return {
      anahtar: d.map((x) => x.satir.id).join('+'),
      ad: n > 1 ? `${temel} (${n})` : temel,
      satirlar: Object.fromEntries(d.map((x) => [x.grup, String(x.satir.id)]))
    };
  });
  return { kosular, hatalar, cokluGruplar };
}

/**
 * Tahmini veri koşusu sayısı (koşu diyaloğu / formu): çoklu yoksa 1. Kartezyen çarpımı açmadan sayar.
 * @param {VeriKosulari | null | undefined} ayar @param {Parameters<typeof veriKosulariniAc>[1]} s
 * @returns {{ sayi: number; hatalar: string[]; coklu: boolean }}
 */
export function veriKosusuSayisi(ayar, s) {
  const r = veriKosulariniAc(ayar, s);
  if (!r.cokluGruplar.length) return { sayi: 1, hatalar: [], coklu: false };
  return { sayi: r.kosular.length, hatalar: r.hatalar, coklu: true };
}

/**
 * Raporda "hangi satırla koştu": satırın açık sütun değerleri (gizli sütunlar yalnız adıyla; değeri yazılmaz) ve değişiklik
 * denetimi için satırın son güncellenme zamanı.
 * @param {string} grup @param {VkTablo} tablo @param {VkSatir} satir
 */
export function satirOzeti(grup, tablo, satir) {
  const etiket = grup.slice(grup.indexOf('|') + 1);
  const i = tablo.satirlar.indexOf(satir);
  return {
    grup, tablo: tablo.ad, ...(etiket ? { etiket } : {}), satirId: String(satir.id ?? ''), satirAdi: satirAdi(satir, i < 0 ? 0 : i),
    ...(satir.guncellenme ? { guncellenme: satir.guncellenme } : {}),
    degerler: Object.fromEntries(tablo.sutunlar.filter((c) => !c.gizli).map((c) => [c.ad, satir.degerler[c.ad] ?? null])),
    gizliSutunlar: tablo.sutunlar.filter((c) => c.gizli).map((c) => c.ad)
  };
}

/** Veri koşusunun test başlığı: "Senaryo [satır-adı]" (tek satırlı koşuda başlık değişmez). @param {string} baslik @param {string | null | undefined} ad */
export const veriKosusuBasligi = (baslik, ad) => (ad ? `${baslik} [${ad}]` : baslik);

// ---- Koşu sürecine verilen ortam değişkenleri (Nöbetçi → model koşucusu → veri okuyucu) ----
/** Koşu anı ezmesi: 'tek' | 'tumu' (verilmez: senaryodaki ayar). */
export const VERI_KIPI_DEGISKENI = 'NOBETCI_VERI_KIPI';
/** Başarısızları tekrar çalıştırma planı (JSON; tekrarPlaniniAyristir). */
export const TEKRAR_PLANI_DEGISKENI = 'NOBETCI_TEKRAR_PLANI';
/** Tekrar koşusunun kaynağı (önceki koşunun kimliği; raporlayıcı koşuya "Tekrar:" bağı olarak yazar). */
export const TEKRAR_KAYNAGI_DEGISKENI = 'NOBETCI_TEKRAR_KAYNAGI';

/**
 * @typedef {{ anahtar: string | null; ad: string | null; satirlar: Record<string, string>; veriler?: Record<string, Record<string, string | null>> }} TekrarKosusu
 * @typedef {{ modelSurumu: number | null; kosular: TekrarKosusu[] }} TekrarSenaryosu
 */

/**
 * Tekrar planı (senaryo kimliği → { modelSurumu, kosular }) — sunucunun hazırladığı JSON; biçimi bozuksa boş. Yalnız bilinen alanlar
 * ve kimlik biçimindeki değerler alınır.
 * @param {unknown} metin @returns {Record<string, TekrarSenaryosu>}
 */
export function tekrarPlaniniAyristir(metin) {
  let ham;
  try { ham = typeof metin === 'string' && metin ? JSON.parse(metin) : null; } catch { return {}; }
  if (!nesneMi(ham) || !nesneMi(ham.senaryolar)) return {};
  /** @type {Record<string, TekrarSenaryosu>} */
  const sonuc = {};
  for (const [id, s] of Object.entries(/** @type {Record<string, unknown>} */ (ham.senaryolar))) {
    if (!KIMLIK.test(id) || !nesneMi(s)) continue;
    const o = /** @type {Record<string, unknown>} */ (s);
    const surum = typeof o.modelSurumu === 'number' && Number.isInteger(o.modelSurumu) && o.modelSurumu > 0 ? o.modelSurumu : null;
    const kosular = (Array.isArray(o.kosular) ? o.kosular : []).filter(nesneMi).slice(0, 5000).map((k) => {
      const x = /** @type {Record<string, unknown>} */ (k);
      const satirlar = Object.fromEntries(Object.entries(nesneMi(x.satirlar) ? /** @type {Record<string, unknown>} */ (x.satirlar) : {})
        .filter(([g, v]) => GRUP.test(g) && typeof v === 'string' && KIMLIK.test(v)));
      const veriler = nesneMi(x.veriler) ? Object.fromEntries(Object.entries(/** @type {Record<string, unknown>} */ (x.veriler))
        .filter(([g, v]) => GRUP.test(g) && nesneMi(v))
        .map(([g, v]) => [g, Object.fromEntries(Object.entries(/** @type {Record<string, unknown>} */ (v)).map(([a, d]) => [a, d === null || d === undefined ? null : String(d)]))])) : null;
      return {
        anahtar: typeof x.anahtar === 'string' && x.anahtar ? x.anahtar.slice(0, 2000) : null,
        ad: typeof x.ad === 'string' && x.ad ? x.ad.slice(0, 500) : null,
        satirlar, ...(veriler && Object.keys(veriler).length ? { veriler } : {})
      };
    });
    sonuc[id] = { modelSurumu: surum, kosular };
  }
  return sonuc;
}
