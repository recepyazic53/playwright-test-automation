// SERVİS ANALİZİ — SÜREKLİ ÖĞRENME (saf; sunucu ve arayüzle ORTAK, /arayuz/kosu-ogrenmesi.mjs). Servis koşuları (tekil, toplu,
// planlı, Dene) ve kaydedilen senaryolar çevrimdışı GÖZLEM olur; gözlemlerden öneri üretilir. Ağ isteği YOK; değer ÜRETİLMEZ.
//  - Kaynak: yalnız senaryoda ELLE yazılmış değerler (şablonda yer tutucusuz). Tablodan (${Tablo.Sütun}), hesaplama kuralından ve
//    akıştan (${akis:…}) gelen değerler atlanır. Değer koşunun gerçek (maskeli) istek gövdesinden okunur; maskeli değer yalnız "dolu".
//  - Koşu sonucu: başarılı → değerler sayılır. Başarısız ve hata metni (SOAP fault / yanıt mesajı) bir alanın adını anıyorsa (ad
//    kuralları: servis-analizi.mjs > adEslesmesi) o alan "hataya yol açmış olabilir" (şüpheli; değeri eklenmez), diğer alanların
//    değerleri ZAYIF. Aynı senaryonun önceki başarılı koşusundan yalnız tek alanla ayrılıyorsa o alan şüpheli. Sebep belirsizse
//    hiçbir değer alınmaz (yalnız dolu / boş durumu).
//  - Öneriler: tabloya satır (tablo başına tek kart; koşu başına satır, yalnız o tabloya bağlı alanlar; ≥ 2 başarılı koşuda
//    görülen satır güçlü — servis-analizi.mjs satır bütünlüğü kuralı), bağı
//    olmayan alan için tablo eşleşmesi, başarılı koşuda boş / yok giden zorunlu alan için "isteğe bağlı" (#179 kuralları; koşu =
//    durumu bilinen örnek), şüpheli alan notu. Kanıt: kaç başarılı koşuda görüldü, son görülme, senaryolar.
import { ornekCoz, adEslesmesi, alanAdi, oneriAnahtari, tabloEslesmesi, hucreEsit, satirYonlendir } from './servis-analizi.mjs';
import { alanSatirlari, semaBirlestir } from './servis-govdesi.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';

/** @typedef {import('./kosu-ogrenmesi.d.mts').Gozlem} Gozlem */
/** @typedef {import('./kosu-ogrenmesi.d.mts').KosuOnerisi} KosuOnerisi */
/** @typedef {import('./servis-analizi.d.mts').AnalizTablosu} AnalizTablosu */

/** Metot başına saklanan en çok gözlem (eskiler budanır). */
export const EN_COK_GOZLEM = 200;
/** "Değer ekle" önerisinin güçlü sayılması için en az başarılı koşu. */
export const GUCLU_KOSU_SAYISI = 2;

const YER_TUTUCU = /\$\{[^}]*\}|\{\{[^}]*\}\}/;
const MASKELI = /•|\*{3}/;
const somut = (/** @type {unknown} */ v) => typeof v === 'string' && v !== '' && !YER_TUTUCU.test(v) && !MASKELI.test(v);
const normal = (/** @type {string} */ s) => String(s ?? '').toLocaleLowerCase('tr').replace(/[ıi̇]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, '');
/** @param {string} iso */
const zamanMetni = (iso) => String(iso ?? '').slice(0, 16).replace('T', ' ');

/**
 * Yanıttaki / hatadaki açıklama metni: hata iletisi ve yanıtta mesaj / açıklama / fault adlı öğelerin (JSON anahtarlarının) metni.
 * @param {{ hata?: unknown; yanit?: unknown }} sonuc
 */
export function hataMetni(sonuc) {
  const parcalar = [];
  if (typeof sonuc?.hata === 'string') parcalar.push(sonuc.hata);
  const y = typeof sonuc?.yanit === 'string' ? sonuc.yanit.slice(0, 50_000) : '';
  for (const m of y.matchAll(/<(?:[\w.-]+:)?([\w.-]*(?:fault|message|mesaj|description|aciklama|reason|error|hata|detail)[\w.-]*)\b[^>]*>([^<]{1,500})</gi)) parcalar.push(m[2]);
  for (const m of y.matchAll(/"([\w.-]*(?:message|mesaj|description|aciklama|reason|error|hata|detail)[\w.-]*)"\s*:\s*"([^"]{1,500})"/gi)) parcalar.push(m[2]);
  return parcalar.join(' ').trim();
}

/**
 * Hata metninin andığı alanlar (yol): metindeki sözcükler alan adıyla aynı / eş anlamlıysa (adEslesmesi: birebir, esAnlam) ya da
 * metin alan adını (≥ 4 harf) içeriyorsa. @param {string} metin @param {string[]} yollar
 */
export function hataAlanlari(metin, yollar) {
  if (!metin) return [];
  const duz = normal(metin);
  const sozler = [...new Set(String(metin).replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))];
  return yollar.filter((y) => {
    const ad = alanAdi(y);
    const n = normal(ad);
    if (n.length >= 4 && duz.includes(n)) return true;
    return sozler.some((w) => { const e = adEslesmesi(ad, w); return e === 'birebir' || e === 'esAnlam'; });
  });
}

/**
 * Koşudan (ya da kayıtlı senaryodan) gözlem. Değer yalnız şablonda elle yazılmış ve istekte maskesiz olan alanda saklanır.
 * @param {{ istek: string; sablon: string; tur?: 'soap' | 'rest'; kosuDurumu: 'basarili' | 'basarisiz' | 'hata' | 'bilinmiyor'; sonuc?: { hata?: unknown; yanit?: unknown };
 *   senaryo: string; senaryoId: string | null; kosuId?: string; zaman: string; kaynak: 'kosu' | 'senaryo'; oncekiler?: ReadonlyArray<Gozlem>;
 *   kok?: string; ustAlanlar?: string[]; ekGizliAdlar?: ReadonlyArray<string> }} g
 * @returns {Gozlem | null} istek çözülemezse null
 */
export function gozlemOlustur(g) {
  const s = { tur: g.tur, ...(g.kok ? { kok: g.kok, ustAlanlar: g.ustAlanlar ?? [] } : {}) };
  const c = ornekCoz(g.istek, s);
  if (c.hata) return null;
  const t = ornekCoz(g.sablon, s);
  /** @type {Gozlem['alanlar']} */
  const alanlar = {};
  for (const [yol, v] of c.alanlar) {
    const sablonDegeri = t.hata ? undefined : t.alanlar.get(yol);
    // Adı gizli alanın değeri hiçbir zaman saklanmaz (yalnız "dolu").
    const elle = sablonDegeri?.durum === 'dolu' && somut(sablonDegeri.deger) && !gizliAdMi(alanAdi(yol), g.ekGizliAdlar ?? []);
    alanlar[yol] = v.durum === 'dolu' ? { d: 'dolu', ...(elle && somut(v.deger) ? { v: v.deger.slice(0, 200) } : {}) } : { d: v.durum };
  }
  /** @type {Gozlem} */
  const gz = { kaynak: g.kaynak, senaryo: g.senaryo, senaryoId: g.senaryoId, zaman: g.zaman, ...(g.kosuId ? { kosuId: g.kosuId } : {}), durum: 'bilinmiyor', alanlar };
  if (g.kosuDurumu === 'basarili') return { ...gz, durum: 'basarili' };
  if (g.kosuDurumu === 'bilinmiyor') return gz;
  const yollar = Object.keys(alanlar);
  const anilan = hataAlanlari(hataMetni(g.sonuc ?? {}), yollar);
  if (anilan.length) return { ...gz, durum: 'hata', supheli: anilan, zayif: true };
  const onceki = [...(g.oncekiler ?? [])].reverse().find((x) => x.kaynak === 'kosu' && x.durum === 'basarili' && x.senaryoId && x.senaryoId === g.senaryoId);
  if (onceki) {
    const tum = [...new Set([...yollar, ...Object.keys(onceki.alanlar)])];
    const fark = tum.filter((y) => JSON.stringify(onceki.alanlar[y] ?? null) !== JSON.stringify(alanlar[y] ?? null));
    if (fark.length === 1) return { ...gz, durum: 'hata', supheli: fark, tekFark: true };
  }
  // Sebep belirsiz: değer alınmaz (yalnız dolu / boş).
  return { ...gz, durum: 'hata', belirsiz: true, alanlar: Object.fromEntries(Object.entries(alanlar).map(([y, a]) => [y, { d: a.d }])) };
}

/** Gözlemi listeye ekler (aynı senaryonun eski senaryo-kaynaklı gözlemi değişir; en çok EN_COK_GOZLEM, eskiler budanır). @param {Gozlem[]} l @param {Gozlem} g */
export function gozlemEkle(l, g) {
  const yeni = g.kaynak === 'senaryo' ? l.filter((x) => !(x.kaynak === 'senaryo' && x.senaryoId === g.senaryoId)) : [...l];
  yeni.push(g);
  return yeni.slice(-EN_COK_GOZLEM);
}

/** Kanıt metni: "3 başarılı koşuda görüldü: A, B (son: …)". @param {{ sayi: number; senaryolar: Set<string>; son: string }} k */
const kanitMetni = (k, ne = 'başarılı koşuda görüldü') => `${k.sayi} ${ne}: ${[...k.senaryolar].slice(0, 4).join(', ')}${k.senaryolar.size > 4 ? ` (+${k.senaryolar.size - 4})` : ''} (son: ${zamanMetni(k.son)})`;
/** @param {Map<string, { sayi: number; senaryolar: Set<string>; son: string }>} m @param {string} a @param {Gozlem} g */
const say = (m, a, g) => {
  const k = m.get(a) ?? { sayi: 0, senaryolar: new Set(), son: '' };
  k.sayi++; k.senaryolar.add(g.senaryo); if (g.zaman > k.son) k.son = g.zaman;
  m.set(a, k);
  return k;
};

/**
 * Gözlemlerden öneriler (uygulanmış / yoksayılmış olanlar ve mevcut ayarla aynı olanlar dönmez).
 * @param {{ metot: string; sema?: import('./servis-govdesi.mjs').OperasyonSemasi | null; ekler?: ReadonlyArray<{ yol: string; tip?: string }>;
 *   gozlemler: ReadonlyArray<Gozlem>; tablolar: ReadonlyArray<AnalizTablosu>;
 *   mevcut?: { zorunlu?: ReadonlyArray<string>; baglar?: Record<string, { tablo?: string; sutun?: string; kural?: string }>; varsayilanlar?: Record<string, unknown>; kararlar?: Record<string, string> } }} g
 * @returns {KosuOnerisi[]}
 */
export function kosuOnerileri(g) {
  const m = g.mevcut ?? {};
  const kararlar = m.kararlar ?? {};
  const baglar = m.baglar ?? {};
  const zorunlu = new Set(m.zorunlu ?? []);
  const sema = g.sema ? semaBirlestir(g.sema, (g.ekler ?? []).map((e) => ({ yol: e.yol, tip: /** @type {any} */ (e.tip ?? 'metin') }))) : null;
  const yapraklar = sema ? alanSatirlari(sema.alanlar).filter((x) => !x.grup) : [];
  const wsdlZorunlu = new Map(yapraklar.map((x) => [x.yol, Boolean(x.alan.zorunlu && !x.alan.ek)]));
  const basarili = g.gozlemler.filter((x) => x.kaynak === 'kosu' && x.durum === 'basarili');
  /** @type {KosuOnerisi[]} */
  const sonuc = [];
  /** @param {Omit<KosuOnerisi, 'anahtar'>} o @param {unknown} [anahtarDegeri] karar anahtarının değeri (verilmezse öneri değeri) */
  const ekle = (o, anahtarDegeri) => { const a = oneriAnahtari(o.tur, o.yol, anahtarDegeri === undefined ? o.deger : anahtarDegeri); if (!kararlar[a]) sonuc.push({ ...o, anahtar: a }); };
  /** @type {Map<string, Map<string, { sutun: string; gizli: boolean }>>} tablo → alan yolu → sütun (satır bütünlüğü) */
  const satirEslemleri = new Map();
  /** @param {string} tabloId @param {string} yol @param {string} sutun @param {boolean} gizli */
  const satirEslemi = (tabloId, yol, sutun, gizli) => {
    const e = satirEslemleri.get(tabloId) ?? new Map();
    e.set(yol, { sutun, gizli });
    satirEslemleri.set(tabloId, e);
  };

  // Değerler: başarılı koşulardan (güçlü sayım) ve alanı anan hata koşularının diğer alanlarından (zayıf).
  /** @type {Map<string, { sayi: number; senaryolar: Set<string>; son: string }>} yol\u0001değer → başarılı sayım */
  const bSayim = new Map();
  /** @type {Map<string, { sayi: number; senaryolar: Set<string>; son: string }>} */
  const zSayim = new Map();
  /** Kayıtlı senaryolarda elle yazılmış değerler (sonuç bilinmiyor: yalnız bağı olmayan alanda zayıf tablo eşleşmesi kanıtı). @type {Map<string, { sayi: number; senaryolar: Set<string>; son: string }>} */
  const sSayim = new Map();
  for (const x of g.gozlemler) if (x.kaynak === 'senaryo') for (const [yol, a] of Object.entries(x.alanlar)) if (a.v !== undefined) say(sSayim, `${yol}\u0001${a.v}`, x);
  for (const x of g.gozlemler) {
    if (x.kaynak !== 'kosu' || (x.durum !== 'basarili' && !x.zayif)) continue;
    for (const [yol, a] of Object.entries(x.alanlar)) {
      if (a.v === undefined || (x.supheli ?? []).includes(yol)) continue;
      say(x.durum === 'basarili' ? bSayim : zSayim, `${yol}\u0001${a.v}`, x);
    }
  }
  const degerleri = (/** @type {string} */ yol) => [...new Set([...bSayim.keys(), ...zSayim.keys()].filter((k) => k.startsWith(`${yol}\u0001`)).map((k) => k.slice(yol.length + 1)))];
  const yollar = [...new Set([...bSayim.keys(), ...zSayim.keys(), ...sSayim.keys()].map((k) => k.slice(0, k.indexOf('\u0001'))))];
  for (const yol of yollar) {
    const bag = baglar[yol];
    const t = bag?.tablo ? g.tablolar.find((x) => x.id === bag.tablo) : undefined;
    const c = t?.sutunlar.find((x) => x.ad === bag?.sutun);
    if (bag?.kural || m.varsayilanlar?.[yol]) continue;
    if (t && c) {
      satirEslemi(t.id, yol, c.ad, Boolean(c.gizli));
    } else if (!bag) {
      // Bağı olmayan alan: başarılı koşu değerleriyle mevcut eşleştirme kuralları.
      const bDegerleri = degerleri(yol).filter((v) => bSayim.has(`${yol}\u0001${v}`));
      const e = bDegerleri.length ? tabloEslesmesi(alanAdi(yol), bDegerleri, g.tablolar) : null;
      if (!e) {
        const sDegerleri = [...new Set([...sSayim.keys()].filter((k) => k.startsWith(`${yol}\u0001`)).map((k) => k.slice(yol.length + 1)))];
        const es = sDegerleri.length ? tabloEslesmesi(alanAdi(yol), sDegerleri, g.tablolar) : null;
        if (es) {
          const sn = new Set(sDegerleri.flatMap((v) => [...(sSayim.get(`${yol}\u0001${v}`)?.senaryolar ?? [])]));
          ekle({ tur: 'tabloBagi', yol, deger: { tablo: es.tabloId, sutun: es.sutun }, guc: 'zayif', baslik: `Tablo: ${es.tablo} › ${es.sutun}`,
            kanit: `${es.kanit} · kayıtlı senaryolarda yazılı (sonuç bilinmiyor): ${[...sn].slice(0, 4).join(', ')}`, kosuKaniti: { basarili: 0, sonGorulme: '', senaryolar: [...sn] } });
        }
      }
      if (e) {
        const toplam = bDegerleri.reduce((n, v) => n + (bSayim.get(`${yol}\u0001${v}`)?.sayi ?? 0), 0);
        const senaryolar = new Set(bDegerleri.flatMap((v) => [...(bSayim.get(`${yol}\u0001${v}`)?.senaryolar ?? [])]));
        const son = bDegerleri.map((v) => bSayim.get(`${yol}\u0001${v}`)?.son ?? '').sort().pop() ?? '';
        satirEslemi(e.tabloId, yol, e.sutun, Boolean(g.tablolar.find((x) => x.id === e.tabloId)?.sutunlar.find((x) => x.ad === e.sutun)?.gizli));
        ekle({ tur: 'tabloBagi', yol, deger: { tablo: e.tabloId, sutun: e.sutun }, guc: e.guc, baslik: `Tablo: ${e.tablo} › ${e.sutun}`,
          kanit: `${e.kanit} · ${kanitMetni({ sayi: toplam, senaryolar, son })}`, kosuKaniti: { basarili: toplam, sonGorulme: son, senaryolar: [...senaryolar] } });
      }
    }
  }

  // Satır bütünlüğü (servis-analizi.mjs ile aynı kural): tablo başına tek öneri; koşu başına tek satır, satıra yalnız o tabloya bağlı
  // (ya da önerilen bağdaki) alanların ELLE yazılmış değerleri. Aynı değer kümesi (aynı ya da başka senaryodan) tek satır, kanıt
  // sayacı artar; satır adı ilk senaryonun adı. Başarılı koşu ve "başka alan hatası" (zayıf) koşular girer; şüpheli alanın hücresi
  // boş kalır ve notta yazar (satırın geri kalanı şüpheli sayılmaz). Gizli sütun yazılmaz. Tabloda bağlı sütunların hepsi aynı olan
  // satır varsa önerilmez. Satır ≥ GUCLU_KOSU_SAYISI başarılı koşuda görüldüyse güçlü; kart, satırlarının hepsi güçlüyse güçlü.
  // Satır kararları ayrı hatırlanır (satırın anahtarı); kartın Uygula / Yoksay'ı satırlarına da yazılır.
  // Koşu başına satır yönlendirmesi (grup bütünlüğü; servis-analizi.mjs > satirYonlendir).
  const yonler = new Map(g.gozlemler.map((x) => [x, satirYonlendir(satirEslemleri, g.tablolar, (y) => x.alanlar[y]?.d === 'dolu')]));
  for (const [tabloId, varsayilanEslem] of satirEslemleri) {
    const t = g.tablolar.find((x) => x.id === tabloId);
    if (!t) continue;
    /** @type {Map<string, { ad: string; degerler: Record<string, string>; b: { sayi: number; senaryolar: Set<string>; son: string } | null; z: { sayi: number; senaryolar: Set<string>; son: string } | null; notlar: Set<string> }>} */
    const satirlar = new Map();
    /** @type {Set<string>} */
    const gizliSutunlar = new Set();
    for (const x of g.gozlemler) {
      if (x.kaynak !== 'kosu' || (x.durum !== 'basarili' && !x.zayif)) continue;
      /** @type {Record<string, string>} */
      const deg = {};
      /** @type {string[]} */
      const notlar = [];
      const yon = yonler.get(x);
      const eslem = yon?.eslemler.get(tabloId) ?? varsayilanEslem;
      const gerekce = yon?.gerekceler.get(tabloId);
      if (gerekce) notlar.push(gerekce);
      for (const [yol, e] of eslem) {
        const a = x.alanlar[yol];
        if (!a || a.d !== 'dolu') continue;
        if ((x.supheli ?? []).includes(yol)) { notlar.push(`${e.sutun}: ${alanAdi(yol)} hataya yol açmış olabilir, hücre boş`); continue; }
        if (e.gizli) { gizliSutunlar.add(e.sutun); continue; }
        if (a.v !== undefined) deg[e.sutun] = a.v;
      }
      const anahtarlar = Object.keys(deg).sort();
      if (!anahtarlar.length) continue;
      const ayni = (/** @type {Record<string, unknown>} */ r) => anahtarlar.every((k) => hucreEsit(t.sutunlar.find((s) => s.ad === k), r[k], deg[k]));
      if (t.satirlar.some((r) => ayni(r.degerler))) continue;
      const anahtar = JSON.stringify(anahtarlar.map((k) => [k, deg[k]]));
      const s = satirlar.get(anahtar) ?? { ad: x.senaryo, degerler: deg, b: null, z: null, notlar: new Set() };
      const yeniSayim = () => ({ sayi: 0, senaryolar: new Set(), son: '' });
      const k = x.durum === 'basarili' ? (s.b ??= yeniSayim()) : (s.z ??= yeniSayim());
      k.sayi++; k.senaryolar.add(x.senaryo); if (x.zaman > k.son) k.son = x.zaman;
      for (const n of notlar) s.notlar.add(n);
      satirlar.set(anahtar, s);
    }
    /** @type {Map<string, number>} */
    const adSayisi = new Map();
    const liste_ = [...satirlar.values()].map((s) => {
      const n = (adSayisi.get(s.ad) ?? 0) + 1;
      adSayisi.set(s.ad, n);
      const satirAnahtari = oneriAnahtari('tabloyaSatir', `#${t.id}`, s.degerler);
      return { ad: (n > 1 ? `${s.ad} (${n})` : s.ad).slice(0, 60), degerler: s.degerler, anahtar: satirAnahtari, guclu: (s.b?.sayi ?? 0) >= GUCLU_KOSU_SAYISI,
        kanit: [s.b ? kanitMetni(s.b) : '', s.z ? kanitMetni(s.z, 'başarısız koşuda (başka alan hatası) görüldü') : '', ...s.notlar].filter(Boolean).join(' · '), s };
    }).filter((r) => !kararlar[r.anahtar]);
    if (!liste_.length) continue;
    const toplam = liste_.reduce((n, r) => n + (r.s.b?.sayi ?? 0), 0);
    const senaryolar = [...new Set(liste_.flatMap((r) => [...(r.s.b?.senaryolar ?? []), ...(r.s.z?.senaryolar ?? [])]))];
    const son = liste_.map((r) => [r.s.b?.son ?? '', r.s.z?.son ?? '']).flat().sort().pop() ?? '';
    const guclu = liste_.every((r) => r.guclu);
    const satirlarDegeri = liste_.map(({ s: _s, ...r }) => r);
    ekle({ tur: 'tabloyaSatir', yol: `#${t.id}`, deger: { tablo: t.id, satirlar: satirlarDegeri, ...(gizliSutunlar.size ? { gizliSutunlar: [...gizliSutunlar] } : {}) },
      guc: guclu ? 'guclu' : 'zayif', baslik: `${t.ad} tablosuna ${liste_.length} satır eklensin mi`,
      kanit: ['Her koşu bir satır (yalnız bu tabloya bağlı alanların elle yazılmış değerleri)', `${liste_.filter((r) => r.guclu).length}/${liste_.length} satır ≥ ${GUCLU_KOSU_SAYISI} başarılı koşuda görüldü`,
        gizliSutunlar.size ? `gizli sütunlar yazılmaz: ${[...gizliSutunlar].join(', ')}` : ''].filter(Boolean).join(' · '),
      kosuKaniti: { basarili: toplam, sonGorulme: son, senaryolar } }, { tablo: t.id, satirlar: satirlarDegeri.map((r) => r.anahtar) });
  }

  // Zorunluluk: başarılı koşuda boş / yok giden (şu an zorunlu) alan → isteğe bağlı (güçlü); WSDL zorunluysa çelişki notu.
  for (const yol of [...zorunlu]) {
    /** @type {Map<string, { sayi: number; senaryolar: Set<string>; son: string }>} */
    const k = new Map();
    for (const x of basarili) if (x.alanlar[yol]?.d !== 'dolu') say(k, 'x', x);
    const kanit = k.get('x');
    if (!kanit) continue;
    ekle({ tur: 'zorunlu', yol, deger: false, guc: 'guclu', baslik: 'İsteğe bağlı',
      kanit: `Başarılı koşularda boş / yok → servis bu alan olmadan kabul ediyor · ${kanitMetni(kanit, 'başarılı koşu')}`,
      kosuKaniti: { basarili: kanit.sayi, sonGorulme: kanit.son, senaryolar: [...kanit.senaryolar] } });
    if (wsdlZorunlu.get(yol)) ekle({ tur: 'celiski', yol, deger: 'kosuWsdlZorunlu', guc: 'not', baslik: 'WSDL ile çelişki', kanit: `WSDL'de zorunlu ama ${kanit.sayi} başarılı koşuda boş / yok` });
  }

  // Şüpheli alanlar: hataya yol açmış olabilir (değeri eklenmedi).
  /** @type {Map<string, { sayi: number; senaryolar: Set<string>; son: string; degerler: Set<string>; tek: boolean }>} */
  const supheli = new Map();
  for (const x of g.gozlemler) {
    for (const yol of x.supheli ?? []) {
      const s = supheli.get(yol) ?? { sayi: 0, senaryolar: new Set(), son: '', degerler: new Set(), tek: false };
      s.sayi++; s.senaryolar.add(x.senaryo); if (x.zaman > s.son) s.son = x.zaman;
      if (x.alanlar[yol]?.v !== undefined) s.degerler.add(/** @type {string} */ (x.alanlar[yol].v));
      if (x.tekFark) s.tek = true;
      supheli.set(yol, s);
    }
  }
  for (const [yol, s] of supheli) {
    ekle({ tur: 'supheli', yol, deger: [...s.degerler].sort(), guc: 'not', baslik: 'Hataya yol açmış olabilir',
      kanit: `${s.degerler.size ? `Değer ${[...s.degerler].slice(0, 3).join(', ')} eklenmedi · ` : ''}${s.tek ? 'önceki başarılı koşudan yalnız bu alanla ayrılıyor · ' : 'hata metni bu alanı anıyor · '}${kanitMetni(s, 'başarısız koşu')}`,
      kosuKaniti: { basarili: 0, sonGorulme: s.son, senaryolar: [...s.senaryolar] } });
  }
  return sonuc;
}
