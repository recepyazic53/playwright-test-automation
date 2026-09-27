// SERVİS TESTLERİ — SoapUI aktarımı (YENİ BAĞLAMA MODELİ) ve eski parametre eşlemesinden dönüşüm.
// Yeni model: senaryo gövdesi değeri tablodan ${Tablo.Sütun} (etiketli: ${Tablo[etiket].Sütun}) ile alır; servisin metot alan bağları
// (ayarlar.alanBaglari: operasyon → alan yolu → { tablo, sutun, etiket?, bicim? } | { kural }) yeni senaryoların varsayılanıdır;
// hesaplama kuralları (ayarlar.tarihKurallari) ${KURAL} ile gövdede.
// SoapUI dosyasındaki özellikler (proje / ortam / takım / test durumu / Groovy) ve gövdedeki başvurular kullanıcının önizlemede
// seçtiği hedefe gider (karar kullanıcının; önizlemede varsayılanlar önerilir):
//   · 'tablo': yeni / var olan test verisi tablosunun sütunu (değer tek satıra; gizli adlılar gizli sütun, DEĞERİ yalnız kullanıcı
//     "şifreli kaydet" dediyse yazılır, yoksa boş kalır);
//   · 'bag': var olan bir tablo sütunu (servisin o alandaki bağı, başka serviste aynı adlı alanın bağı ya da adı alanla aynı sütun);
//     dosyadaki değer senaryonun tablo seçimi olur (gizli sütun hariç); istenirse (girisEkle) tabloda yoksa satır olarak eklenir;
//   · 'kural': hesaplama kuralı (Groovy tarih betiğinden önerilen ya da serviste aynı adlı kural); gövdede ${AD} kalır;
//   · 'birak': gövdede ${AD} olarak kalır (eski eşleme varsa geriye uyum için koşuda o çözer).
// Eski yapı (test verisi türü alanlarının "servis parametreleri" + servisin veriProfilleri) bu aktarımda YAZILMAZ; koşuda yalnız
// okunur (servis-islemleri.mjs parametreDegerleri). Eski kayıtlı servisler "Yeni bağlama modeline geçir" ile (önizleme + onay)
// dönüştürülür: eskiParametreleriDonustur.
// Ağ isteği yoktur (yeni servis için erişim kontrolü ayrı uçtadır). Gizli değerler hiçbir önizleme yanıtında dönmez.
import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import { servisGetir, servisKaydet, servisleriListele, servisSenaryolariniListele, servisSenaryosuKaydet } from './servis-deposu.mjs';
import { servisTaslaklari, soapuiCozumle, soapuiOzeti } from './soapui-ice-aktarma.mjs';
import { alanBaglariniDogrula, kuralBaglariniDenetle, parametreEslemeleri, servisiKaydet } from './servis-islemleri.mjs';
import { kullanilanParametreler } from './soap-istemcisi.mjs';
import { govdeCoz, semaBirlestir } from './servis-govdesi.mjs';
import { tablolariListele } from '../tablolar/tablo-deposu.mjs';
import { etkiDenetimiyle } from '../tablolar/tablo-etkisi.mjs';
import { basvuru, basvuruCoz, grupAnahtari, secilenSatir } from '../tablolar/tablo-secimi.mjs';
import { gizliAdMi } from '../ayarlar/gizli-adlar.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {import('./servis-deposu.mjs').Servis} Servis */
/** @typedef {import('../tablolar/tablo-deposu.mjs').Tablo} Tablo */
/** @typedef {'tablo' | 'bag' | 'kural' | 'birak'} OzellikHedefi */
/**
 * @typedef {{ tablo: string; tabloAd: string; sutun: string; etiket?: string; bicim?: string; gizli: boolean; kaynak: 'servis' | 'baska-servis' | 'sutun' }} BagOnerisi
 * @typedef {{ ad: string; kaynak: string | null; gizli: boolean; tanimli: boolean; deger: string | null; tarih: string | null; mevcutKural: string | null;
 *   bag: BagOnerisi | null; eskiEsleme: { turAd: string; alan: string; rol: string } | null; senaryoSayisi: number; varsayilan: OzellikHedefi }} OzellikPlani
 * @typedef {{ operasyon: string; yol: string; ozellik: string; mevcut: string | null }} AlanPlani
 */

export const OZELLIK_HEDEFLERI = /** @type {const} */ (['tablo', 'bag', 'kural', 'birak']);
const PARAMETRE = /\$\{([A-Za-z_][\w.-]*)\}/g;
/** @param {unknown} x */
const kucuk = (x) => String(x ?? '').toLocaleLowerCase('tr');
/** @param {unknown} v */
const dolu = (v) => v !== null && v !== undefined && v !== '';
/** Tablo / sütun adında kullanılamayan karakterler → "_". @param {string} ad */
const adTemizle = (ad) => ad.replace(/[.[\]{}$<>&|\u0000-\u001f]/g, '_').trim().slice(0, 60);
/** Rolün etiketi (eski eşlemede "giris" / "varsayilan" rolü etiketsiz). @param {string | undefined} rol */
const rolEtiketi = (rol) => (!rol || rol === 'giris' || rol === 'varsayilan' ? '' : rol);

/**
 * Var olan bağın okunur özeti ("Giriş.Channel" / "kural: BEGIN_DATE"). @param {any} b @param {Tablo[]} tablolar
 */
function bagMetni(b, tablolar) {
  if (!b) return null;
  if (b.kural) return `kural: ${b.kural}`;
  const t = tablolar.find((x) => x.id === b.tablo);
  return t ? basvuru(t.ad, b.sutun, b.etiket || '', b.bicim || '') : `(silinmiş tablo).${b.sutun}`;
}

/**
 * Aktarım planı (önizleme ve aktarım aynı planı kullanır; hiçbir şey yazılmaz).
 * @param {Veritabani} vt @param {string} projeId @param {ReturnType<typeof servisTaslaklari>} t
 * @param {import('./soapui-ice-aktarma.mjs').ServisTaslagi} taslak @param {Servis | null} servis mevcut servis (yoksa null) @param {Tablo[]} tablolar
 */
function aktarimPlani(vt, projeId, t, taslak, servis, tablolar) {
  const ekler = ekGizliAdlar(vt);
  const eslemeler = parametreEslemeleri(vt, projeId);
  const kurallar = servis?.ayarlar.tarihKurallari ?? {};
  const baglar = servis?.ayarlar.alanBaglari ?? {};
  // Başka servislerde aynı adlı alanın tablo bağı (tablo hâlâ varsa).
  /** @type {Record<string, any>} */
  const ogrenilen = {};
  for (const s of servisleriListele(vt, projeId)) {
    if (servis && s.id === servis.id) continue;
    for (const alanlar of Object.values(s.ayarlar.alanBaglari ?? {})) {
      for (const [yol, b] of Object.entries(alanlar)) if (b?.tablo && tablolar.some((x) => x.id === b.tablo)) ogrenilen[kucuk(yol.split('/').pop())] ??= b;
    }
  }
  /** @type {AlanPlani[]} */
  const alanlar = [];
  for (const x of taslak.senaryolar) {
    for (const a of x.alanlar ?? []) {
      if (alanlar.some((y) => y.operasyon === x.operasyon && y.yol === a.yol)) continue;
      alanlar.push({ operasyon: x.operasyon, yol: a.yol, ozellik: a.ad, mevcut: bagMetni(baglar[x.operasyon]?.[a.yol], tablolar) });
    }
  }
  /** @param {any} b @param {BagOnerisi['kaynak']} kaynak @returns {BagOnerisi | null} */
  const oneri = (b, kaynak) => {
    const tb = b?.tablo ? tablolar.find((x) => x.id === b.tablo) : undefined;
    const c = tb?.sutunlar.find((x) => x.ad === b.sutun);
    return tb && c ? { tablo: tb.id, tabloAd: tb.ad, sutun: c.ad, ...(b.etiket ? { etiket: b.etiket } : {}), ...(b.bicim ? { bicim: b.bicim } : {}), gizli: c.gizli, kaynak } : null;
  };
  /** @type {Map<string, number>} */
  const kullanim = new Map();
  for (const x of taslak.senaryolar) for (const ad of new Set([...x.govde.matchAll(PARAMETRE)].map((m) => m[1]))) kullanim.set(ad, (kullanim.get(ad) ?? 0) + 1);
  /** Sunucu içinde kalan değerler (önizleme yanıtına gizli değer girmez). @type {Map<string, string>} */
  const degerler = new Map();
  /** @type {OzellikPlani[]} */
  const ozellikler = [...kullanim].map(([ad, senaryoSayisi]) => {
    const k = t.ozellikler.find((o) => o.ad === ad) ?? { ad, kaynak: null };
    if (k.deger !== undefined) degerler.set(ad, k.deger);
    const gizli = gizliAdMi(ad, ekler);
    /** @type {BagOnerisi | null} */
    let bag = null;
    for (const a of alanlar.filter((y) => y.ozellik === ad)) {
      const alanAdi = kucuk(a.yol.split('/').pop());
      bag = oneri(baglar[a.operasyon]?.[a.yol], 'servis') ?? oneri(ogrenilen[alanAdi], 'baska-servis');
      if (!bag) {
        for (const tb of tablolar) {
          const c = tb.sutunlar.find((x) => kucuk(x.ad) === alanAdi);
          if (c) { bag = oneri({ tablo: tb.id, sutun: c.ad }, 'sutun'); break; }
        }
      }
      if (bag) break;
    }
    const mevcutKural = Object.hasOwn(kurallar, ad) ? kurallar[ad] : null;
    const e = eslemeler.get(ad);
    return {
      ad, kaynak: k.kaynak, gizli, tanimli: Boolean(k.tarih) || (k.deger !== undefined && k.deger !== ''),
      deger: gizli || k.deger === undefined ? null : k.deger, tarih: k.tarih ?? null, mevcutKural, bag,
      eskiEsleme: e ? { turAd: e.turAd, alan: e.alan, rol: e.rol } : null, senaryoSayisi,
      varsayilan: k.tarih || mevcutKural ? 'kural' : bag ? 'bag' : 'tablo'
    };
  });
  return { ozellikler, alanlar, degerler, tabloAdi: adTemizle(`SoapUI ${t.durum.takim}`) || 'SoapUI' };
}

/** Önizleme yanıtındaki plan (değerler Map'i yanıta girmez). @param {ReturnType<typeof aktarimPlani>} p */
const planGorunumu = (p) => ({ ozellikler: p.ozellikler, alanlar: p.alanlar, tabloAdi: p.tabloAdi });

/**
 * Önizleme: durum verilmezse dosyadaki test durumlarının özeti; verilirse o durumun servis / senaryo taslakları ve her servis için
 * aktarım planı (özellikler → nereye yazılacağı, kurulacak alan bağları, hesaplama kuralı önerileri). Gizli DEĞERLER dönmez.
 * @param {Veritabani} vt @param {string} projeId @param {string} xml @param {{ takim?: string; durum?: string }} [secim]
 */
export function soapuiOnizle(vt, projeId, xml, secim = {}) {
  const cozum = soapuiCozumle(xml);
  if (!secim.takim || !secim.durum) return { proje: cozum.proje, durumlar: soapuiOzeti(cozum) };
  const t = servisTaslaklari(cozum, { takim: secim.takim, durum: secim.durum });
  const eslemeler = parametreEslemeleri(vt, projeId);
  const tablolar = tablolariListele(vt, projeId);
  const mevcut = new Map(servisleriListele(vt, projeId).map((s) => [s.anahtar, s]));
  return {
    proje: cozum.proje, durum: t.durum, kimlikParametreleri: t.kimlikParametreleri, tarihKurallari: t.tarihKurallari,
    veriParametreleri: t.veriParametreleri.map((ad) => {
      const e = eslemeler.get(ad);
      return { ad, esleme: e ? { turAd: e.turAd, alan: e.alan, rol: e.rol } : null };
    }),
    tablolar: tablolar.map((x) => x.ad),
    servisler: t.servisler.map((s) => {
      const m = mevcut.get(s.anahtar) ?? null;
      return {
        ...s, mevcutServis: m ? { id: m.id, ad: m.ad, tur: m.tur } : null, plan: planGorunumu(aktarimPlani(vt, projeId, t, s, m, tablolar)),
        senaryolar: s.senaryolar.map(({ govde, ...x }) => ({ ...x, govdeUzunlugu: govde.length }))
      };
    })
  };
}

/**
 * Aktarım (kullanıcının önizlemedeki seçimleriyle): seçilen test durumunun bir servisini ve senaryolarını yazar. Aynı anahtarlı servis
 * varsa senaryolar ona eklenir (aynı başlıklı senaryo atlanır); yoksa servis erisimKimligi ile (erişim kontrolünden sonra) oluşturulur.
 * - ozellikler: özellik adı → hedef ('tablo' | 'bag' | 'kural' | 'birak'); verilmeyen özellik planın varsayılanını alır.
 * - tabloAdi / degerOrtami: 'tablo' hedefli özelliklerin tablosu (varsa eksik sütunlar eklenir) ve değer satırının ortamı (boş = tüm ortamlar).
 * - gizliler: gizli sütun olacak özellikler (verilmezse adı gizli sayılanlar); sifreliKaydet: gizli olup DEĞERİ şifreli yazılacaklar
 *   (kullanıcı onayı; verilmeyen gizli değer yazılmaz, boş kalır).
 * - baglar: kurulacak alan bağları ("operasyon|alan yolu"; verilmezse plandaki tümü). Servisin var olan bağı hiç değişmez.
 * - girisEkle: 'bag' hedefli özelliklerin dosyadaki değerleri bağlı tabloda yoksa satır olarak eklenir (gizli olan yalnız sifreliKaydet'teyse).
 * Hesaplama kuralı önerileri 'kural' hedefiyle servise eklenir (aynı adlı mevcut kural korunur).
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ xml: string; takim: string; durum: string; servis: string; erisimKimligi?: string; kapsam?: 'test' | 'canli' | 'ikisi';
 *   ozellikler?: Record<string, string>; tabloAdi?: string; degerOrtami?: string | null; gizliler?: string[]; sifreliKaydet?: string[];
 *   baglar?: string[]; girisEkle?: boolean; mevcutDegerleriKoru?: boolean; etki?: unknown; guncellenecekler?: unknown; beklenenImza?: unknown; yapan?: string }} girdi
 * - etki: 'onizle' → aktarım denenir ve geri alınır, yalnız etki döner (önizleme ekranı; yeni servis erişim kontrolü olmadan geçici
 *   yazılır). 'uygula' + beklenenImza: önizlemedeki etki değiştiyse yazılmaz, { onayGerekli, farkli, etki } döner.
 * - Tablo değer değişikliği (tablolar/tablo-etkisi.mjs): var olan satırın değeri değişiyorsa etki: 'denetle' iken etkilenen senaryo
 *   varsa HİÇBİR ŞEY yazılmaz, { onayGerekli, etki } döner; 'uygula' + guncellenecekler ile aktarım ve seçili senaryo güncellemeleri
 *   tek işlemde yazılır. mevcutDegerleriKoru: var olan satırda dolu hücrenin üzerine yazılmaz (dosyadaki değer yalnız boş hücreye).
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean; servisKosuyorMu?: (senaryoId: string) => boolean }} [secenekler]
 */
export function soapuiAktar(vt, projeId, girdi, secenekler = {}) {
  const r = etkiDenetimiyle(vt, { ...secenekler, etki: girdi.etki, guncellenecekler: girdi.guncellenecekler, beklenenImza: girdi.beklenenImza, yapan: girdi.yapan },
    (y) => soapuiAktarimi(vt, projeId, girdi, y));
  // Önizleme: aktarım geri alınır, yalnız tablo değişikliği etkisi döner. Onay / fark: hiçbir şey yazılmadı.
  if (girdi.etki === 'onizle') return { onizleme: true, etki: r.etki };
  if (r.onayGerekli) return { onayGerekli: true, ...(r.farkli ? { farkli: true } : {}), etki: r.etki };
  return { .../** @type {ReturnType<typeof soapuiAktarimi>} */ (r.sonuc), etki: r.etki, ...(r.guncelleme ? { guncelleme: r.guncelleme } : {}) };
}

/**
 * @param {Veritabani} vt @param {string} projeId @param {Parameters<typeof soapuiAktar>[2]} girdi
 * @param {import('../tablolar/tablo-etkisi.mjs').EtkiliYazici} yazici
 */
function soapuiAktarimi(vt, projeId, girdi, yazici) {
  const t = servisTaslaklari(soapuiCozumle(girdi.xml), { takim: girdi.takim, durum: girdi.durum });
  const taslak = t.servisler.find((s) => s.anahtar === girdi.servis);
  if (!taslak) throw new DepoHatasi(`Test durumunda "${girdi.servis}" servisi yok.`);
  if (girdi.degerOrtami) {
    const o = ortamGetir(vt, girdi.degerOrtami);
    if (!o || o.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  }
  return vt.islem(() => {
    const mevcut = vt.tek('SELECT id FROM servisler WHERE proje_id = ? AND anahtar = ?', [projeId, taslak.anahtar]);
    const servisId = mevcut ? String(mevcut.id) : girdi.etki === 'onizle'
      ? servisKaydet(vt, { projeId, anahtar: taslak.anahtar, ad: taslak.ad, ayarlar: { yol: taslak.yol, soapSurumu: taslak.soapSurumu } })
      : servisiKaydet(vt, projeId, {
      anahtar: taslak.anahtar, ad: taslak.ad, yol: taslak.yol, soapSurumu: taslak.soapSurumu, erisimKimligi: girdi.erisimKimligi, yapan: girdi.yapan
    });
    let s = /** @type {Servis} */ (servisGetir(vt, servisId));
    let tablolar = tablolariListele(vt, projeId);
    // Yalnız eklenecek senaryolar (aynı başlıklı olan atlanır) planlanır: atlananlar için tablo / kural / bağ yazılmaz.
    const mevcutBasliklar = new Set(servisSenaryolariniListele(vt, servisId).map((x) => x.baslik));
    const atlanan = taslak.senaryolar.filter((x) => mevcutBasliklar.has(x.baslik)).map((x) => x.baslik);
    const eklenecek = { ...taslak, senaryolar: taslak.senaryolar.filter((x) => !mevcutBasliklar.has(x.baslik)) };
    const plan = aktarimPlani(vt, projeId, t, eklenecek, s, tablolar);
    /** @type {Map<string, OzellikHedefi>} */
    const hedef = new Map();
    for (const o of plan.ozellikler) {
      const h = girdi.ozellikler?.[o.ad] ?? o.varsayilan;
      if (!OZELLIK_HEDEFLERI.includes(/** @type {any} */ (h))) throw new DepoHatasi(`"${o.ad}" için hedef geçersiz.`);
      if (h === 'bag' && !o.bag) throw new DepoHatasi(`"${o.ad}" için bağlanacak tablo sütunu bulunamadı.`);
      if (h === 'kural' && !o.tarih && !o.mevcutKural) throw new DepoHatasi(`"${o.ad}" için hesaplama kuralı önerisi yok (Groovy tarih betiği ya da servisteki aynı adlı kural).`);
      hedef.set(o.ad, /** @type {OzellikHedefi} */ (h));
    }
    const gizliler = new Set(girdi.gizliler ?? plan.ozellikler.filter((o) => o.gizli).map((o) => o.ad));
    const sifreli = new Set(girdi.sifreliKaydet ?? []);

    // --- 1) Test verisine yazılacaklar: 'tablo' hedefli özellikler (değer tek satıra) ---
    const tabloya = plan.ozellikler.filter((o) => hedef.get(o.ad) === 'tablo').map((o) => o.ad);
    const tabloAdi = adTemizle(girdi.tabloAdi || plan.tabloAdi);
    if (tabloya.length && !tabloAdi) throw new DepoHatasi('Tablo adı boş olamaz.');
    /** @type {Map<string, string>} */
    const sutunAdi = new Map();
    /** @type {{ ad: string; id: string; yeni: boolean; sutunSayisi: number; sifreliYazilan: string[]; bosBirakilan: string[] } | null} */
    let tabloOzeti = null;
    if (tabloya.length) {
      const var_ = tablolar.find((x) => kucuk(x.ad) === kucuk(tabloAdi));
      for (const ad of tabloya) {
        const temel = adTemizle(ad) || 'deger';
        let c = temel;
        for (let n = 2; [...sutunAdi.values()].some((x) => kucuk(x) === kucuk(c)); n++) c = `${temel.slice(0, 56)}_${n}`;
        sutunAdi.set(ad, var_?.sutunlar.find((x) => kucuk(x.ad) === kucuk(c))?.ad ?? c);
      }
      const eskiSutunlar = var_ ? var_.sutunlar.map((x) => ({ ad: x.ad, eskiAd: x.ad, gizli: x.gizli })) : [];
      const yeniSutunlar = tabloya.filter((ad) => !eskiSutunlar.some((x) => kucuk(x.ad) === kucuk(/** @type {string} */ (sutunAdi.get(ad)))))
        .map((ad) => ({ ad: /** @type {string} */ (sutunAdi.get(ad)), gizli: gizliler.has(ad) }));
      const ortamId = girdi.degerOrtami || null;
      const satir = var_?.satirlar.find((r) => (r.ortamId ?? null) === ortamId);
      /** @type {Record<string, string | null>} */
      const yeniDegerler = Object.fromEntries(Object.entries(satir?.degerler ?? {}).filter(([k]) => !var_?.sutunlar.find((x) => x.ad === k)?.gizli));
      /** @type {string[]} */
      const sifreliYazilan = [];
      /** @type {string[]} */
      const bosBirakilan = [];
      for (const ad of tabloya) {
        const c = /** @type {string} */ (sutunAdi.get(ad));
        const d = plan.degerler.get(ad) ?? '';
        const gizliSutun = var_?.sutunlar.find((x) => x.ad === c)?.gizli ?? gizliler.has(ad);
        // Mevcut değeri koru: satırdaki dolu hücre (gizli: kayıtlı değer) aynen kalır.
        if (girdi.mevcutDegerleriKoru && satir && (dolu(satir.degerler[c]) || satir.doluGizli.includes(c))) continue;
        if (gizliSutun) {
          // Gizli değer yalnız kullanıcı onayladıysa (şifreli sütuna); onay yoksa hiç yazılmaz (boş kalır / mevcut korunur).
          if (sifreli.has(ad) && d) { yeniDegerler[c] = d; sifreliYazilan.push(ad); } else bosBirakilan.push(ad);
        } else yeniDegerler[c] = d;
      }
      const id = yazici.tabloKaydet({
        projeId, ...(var_ ? { id: var_.id } : {}), ad: var_?.ad ?? tabloAdi, sutunlar: [...eskiSutunlar, ...yeniSutunlar],
        satirlar: [{ ...(satir ? { id: satir.id } : {}), ortamId, degerler: yeniDegerler }], ortamVar: (x) => Boolean(ortamGetir(vt, x))
      });
      tabloOzeti = { ad: var_?.ad ?? tabloAdi, id, yeni: !var_, sutunSayisi: tabloya.length, sifreliYazilan, bosBirakilan };
      tablolar = tablolariListele(vt, projeId);
    }

    // --- 2) Hesaplama kuralı önerileri ('kural' hedefi; mevcut kural korunur) ---
    /** @type {Record<string, string>} */
    const yeniKurallar = {};
    for (const o of plan.ozellikler) if (hedef.get(o.ad) === 'kural' && o.tarih && !o.mevcutKural) yeniKurallar[o.ad] = o.tarih;

    // --- 3) Kurulacak bağlar (servisin var olan bağı değişmez) ---
    const secilenBaglar = girdi.baglar ? new Set(girdi.baglar) : null;
    const baglar = /** @type {Record<string, Record<string, any>>} */ (JSON.parse(JSON.stringify(s.ayarlar.alanBaglari ?? {})));
    /** @type {string[]} */
    const kurulanBaglar = [];
    for (const a of plan.alanlar) {
      if (a.mevcut || baglar[a.operasyon]?.[a.yol]) continue;
      if (secilenBaglar && !secilenBaglar.has(`${a.operasyon}|${a.yol}`)) continue;
      const o = plan.ozellikler.find((x) => x.ad === a.ozellik);
      const h = hedef.get(a.ozellik);
      const b = !o ? null : h === 'tablo' && tabloOzeti ? { tablo: tabloOzeti.id, sutun: sutunAdi.get(o.ad) }
        : h === 'bag' && o.bag ? { tablo: o.bag.tablo, sutun: o.bag.sutun, ...(o.bag.etiket ? { etiket: o.bag.etiket } : {}), ...(o.bag.bicim ? { bicim: o.bag.bicim } : {}) }
          : h === 'kural' ? { kural: o.ad } : null;
      if (!b) continue;
      (baglar[a.operasyon] ??= {})[a.yol] = b;
      kurulanBaglar.push(`${a.operasyon} · ${a.yol}`);
    }
    const ayarlar = {
      ...s.ayarlar,
      tarihKurallari: { ...yeniKurallar, ...(s.ayarlar.tarihKurallari ?? {}) },
      ...(!s.ayarlar.operasyonlar?.length ? { operasyonlar: taslak.operasyonlar } : {}),
      alanBaglari: alanBaglariniDogrula(baglar)
    };
    kuralBaglariniDenetle(ayarlar);
    servisKaydet(vt, { id: servisId, projeId, anahtar: s.anahtar, ad: s.ad, ayarlar, yapan: girdi.yapan });
    s = /** @type {Servis} */ (servisGetir(vt, servisId));

    // --- 4) Senaryolar: gövdedeki başvurular hedefe göre çevrilir ---
    /** Bağlı tabloya eklenecek dosya değerleri (grup başına). @type {Map<string, { t: Tablo; degerler: Record<string, string> }>} */
    const girisler = new Map();
    /** @param {string} govde */
    const cevir = (govde) => {
      /** @type {Record<string, Record<string, string>>} */
      const secimler = {};
      const yeni = govde.replace(PARAMETRE, (m, ad) => {
        const o = plan.ozellikler.find((x) => x.ad === ad);
        const h = hedef.get(ad);
        if (!o || !h) return m;
        if (h === 'tablo' && tabloOzeti) return `\${${basvuru(tabloOzeti.ad, /** @type {string} */ (sutunAdi.get(ad)))}}`;
        if (h === 'bag' && o.bag) {
          const d = plan.degerler.get(ad);
          const tb = tablolar.find((x) => x.id === o.bag?.tablo);
          if (d && tb) {
            const grup = grupAnahtari(tb.id, o.bag.etiket || '');
            if (!o.bag.gizli) (secimler[grup] ??= {})[o.bag.sutun] = d;
            if (!o.bag.gizli || sifreli.has(ad)) {
              if (!girisler.has(grup)) girisler.set(grup, { t: tb, degerler: {} });
              /** @type {{ degerler: Record<string, string> }} */ (girisler.get(grup)).degerler[o.bag.sutun] = d;
            }
          }
          return `\${${basvuru(o.bag.tabloAd, o.bag.sutun, o.bag.etiket || '', o.bag.bicim || '')}}`;
        }
        return m;
      });
      return { govde: yeni, secimler };
    };
    const cevrilen = eklenecek.senaryolar.map((x) => ({ x, ...cevir(x.govde) }));
    // Dosyadaki değerler bağlı tabloda yoksa satır olarak (istenirse).
    let girisSatiriEklendi = false;
    if (girdi.girisEkle) {
      for (const { t: tablo, degerler } of girisler.values()) {
        const acik = tablo.sutunlar.filter((c) => !c.gizli && degerler[c.ad] !== undefined);
        if (!acik.length || tablo.satirlar.some((r) => acik.every((c) => r.degerler[c.ad] === degerler[c.ad]))) continue;
        yazici.tabloKaydet({ projeId, id: tablo.id, ad: tablo.ad, sutunlar: tablo.sutunlar.map((c) => ({ ad: c.ad, eskiAd: c.ad, gizli: c.gizli })), satirlar: [{ ortamId: null, degerler }] });
        girisSatiriEklendi = true;
      }
      if (girisSatiriEklendi) tablolar = tablolariListele(vt, projeId);
    }
    let eklenen = 0;
    /** Tabloda satırı bulunmayan seçimler (senaryo koşmaz; tabloya satır eklenmeli). @type {Set<string>} */
    const eksikSatirlar = new Set();
    for (const { x, govde, secimler } of cevrilen) {
      if (mevcutBasliklar.has(x.baslik)) { atlanan.push(x.baslik); continue; } // dosyada aynı başlık iki kez
      for (const [grup, secim] of Object.entries(secimler)) {
        const tablo = tablolar.find((y) => y.id === grup.split('|')[0]);
        if (tablo && !secilenSatir(tablo, secim)) eksikSatirlar.add(`${tablo.ad}: ${Object.entries(secim).map(([k, v]) => `${k} = ${v}`).join(', ')}`);
      }
      servisSenaryosuKaydet(vt, {
        projeId, servisId, baslik: x.baslik, kapsam: girdi.kapsam ?? 'test', kosuyaDahil: x.kosuyaDahil,
        icerik: {
          operasyon: x.operasyon, govde, kontroller: x.kontroller.length ? x.kontroller : [{ tur: 'soapYaniti' }], kaynak: x.kaynak,
          ...(Object.keys(secimler).length ? { tabloSecimleri: secimler } : {}), ...(x.uyarilar.length ? { aciklama: x.uyarilar.join(' ') } : {})
        },
        yapan: girdi.yapan
      });
      mevcutBasliklar.add(x.baslik);
      eklenen++;
    }
    // Gövdede kalan, hiçbir kaynağa bağlanmamış parametreler (kural değil, tablo başvurusu değil, eski eşlemesi de yok).
    const eslemeler = parametreEslemeleri(vt, projeId);
    const kalanParametreler = [...new Set(servisSenaryolariniListele(vt, servisId).flatMap((y) => kullanilanParametreler(y.icerik.govde ?? '')))]
      .filter((ad) => !(s.ayarlar.tarihKurallari ?? {})[ad] && !basvuruCoz(ad) && !eslemeler.has(ad));
    return {
      servisId, yeniServis: !mevcut, eklenen, atlanan, baglananAlan: kurulanBaglar.length, kurulanBaglar, eklenenKurallar: Object.keys(yeniKurallar),
      tablo: tabloOzeti ? { ad: tabloOzeti.ad, yeni: tabloOzeti.yeni, sutunSayisi: tabloOzeti.sutunSayisi, sifreliYazilan: tabloOzeti.sifreliYazilan, bosBirakilan: tabloOzeti.bosBirakilan } : null,
      girisSatiriEklendi, eksikSatirlar: [...eksikSatirlar], eslenmemisParametreler: kalanParametreler
    };
  });
}

// ---------------------------------------------------------------------------------------
// Eski parametre eşlemesinden yeni bağlama modeline dönüşüm (kullanıcı onayıyla)
// ---------------------------------------------------------------------------------------

/**
 * Eski kayıtlı servis: gövdede ${PARAMETRE} olup test verisi türü alanının "servis parametreleri" eşlemesiyle (ve servisin
 * veriProfilleri seçimiyle) dolan değerler. Dönüşüm: ${PARAMETRE} → ${Tablo[etiket].Sütun} (tür = tablo, rol = etiket; "giris" /
 * "varsayilan" etiketsiz), servisin seçtiği profil (= satır) senaryonun tablo seçimi olur (açık sütun değerleriyle), alan formu
 * varsa alan bağları kurulur (servisin var olan bağı değişmez). Hesaplama kuralları ve giriş profili parametreleri dönüşmez
 * (giriş profili için "Test verisine taşı" ayrıdır). onay verilmezse yalnız plan döner; hiçbir şey kendiliğinden dönüştürülmez.
 * Eski ayarlar (veriProfilleri, tür alanı eşlemeleri) silinmez; dönüşmeyen parametreler koşuda eskisi gibi çözülür.
 * @param {Veritabani} vt @param {string} projeId @param {{ servisId: string; onay?: boolean; yapan?: string }} girdi
 */
export function eskiParametreleriDonustur(vt, projeId, girdi) {
  const servis = servisGetir(vt, girdi.servisId);
  if (!servis || servis.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  const eslemeler = parametreEslemeleri(vt, projeId);
  const tablolar = tablolariListele(vt, projeId);
  const kurallar = servis.ayarlar.tarihKurallari ?? {};
  const secimler = servis.ayarlar.veriProfilleri ?? {};
  const senaryolar = servisSenaryolariniListele(vt, servis.id).filter((x) => /** @type {any} */ (x.icerik).tur !== 'akis');
  /** @type {string[]} */
  const uyarilar = [];
  /** @type {Map<string, { ad: string; t: Tablo; sutun: string; etiket: string; rol: string; turId: string; hedef: string; senaryolar: Set<string> }>} */
  const parametreler = new Map();
  /** @param {any} x */
  const metinleri = (x) => [x.icerik.govde ?? '', x.icerik.http?.yol ?? ''];
  for (const x of senaryolar) {
    for (const ad of new Set(metinleri(x).flatMap((m) => kullanilanParametreler(m)))) {
      if (basvuruCoz(ad) || Object.hasOwn(kurallar, ad)) continue;
      const e = eslemeler.get(ad);
      if (!e) continue;
      if (!parametreler.has(ad)) {
        const t = tablolar.find((y) => y.id === e.turId);
        if (!t || !t.sutunlar.some((c) => c.ad === e.alan)) { uyarilar.push(`${ad}: eşlendiği "${e.turAd}.${e.alan}" tabloda bulunamadı; dönüştürülmez.`); continue; }
        const etiket = rolEtiketi(e.rol);
        parametreler.set(ad, { ad, t, sutun: e.alan, etiket, rol: e.rol, turId: e.turId, hedef: basvuru(t.ad, e.alan, etiket), senaryolar: new Set() });
      }
      parametreler.get(ad)?.senaryolar.add(x.id);
    }
  }
  /** Senaryonun seçtiği satır (profil): senaryo ezmesi, yoksa servisin seçimi. @param {any} x @param {{ turId: string; rol: string; t: Tablo }} p */
  const satiri = (x, p) => {
    const id = x.icerik.veriProfilleri?.[`${p.turId}:${p.rol}`] ?? secimler[`${p.turId}:${p.rol}`];
    return id ? p.t.satirlar.find((r) => r.id === id) ?? null : null;
  };
  /** Satırı seçen açık sütun değerleri (gizli sütun seçimde kullanılmaz). @param {Tablo} t @param {import('../tablolar/tablo-deposu.mjs').TabloSatiri} r */
  const satirSecimi = (t, r) => Object.fromEntries(t.sutunlar.filter((c) => !c.gizli && r.degerler[c.ad] !== null && r.degerler[c.ad] !== undefined && r.degerler[c.ad] !== '')
    .map((c) => [c.ad, String(r.degerler[c.ad])]));
  for (const p of parametreler.values()) {
    const ortamaOzel = Object.keys(secimler).filter((k) => k.startsWith(`${p.turId}:${p.rol}@`));
    if (ortamaOzel.length) uyarilar.push(`${p.ad}: ortama özel profil seçimi var (${ortamaOzel.length}); dönüşümde genel seçim kullanılır — ortama özel satırları tabloda o ortamla işaretleyin.`);
    if (!secimler[`${p.turId}:${p.rol}`]) uyarilar.push(`${p.ad}: servis için "${p.t.ad}" (${p.rol}) satırı seçilmemiş; koşuda tablonun ortama uyan ilk satırı kullanılır.`);
  }
  // Alan bağları (alan formu olan metotlarda): gövdede parametre olarak duran alan → tablo sütunu.
  /** @type {Array<{ operasyon: string; yol: string; ozellik: string; hedef: string }>} */
  const baglar = [];
  /** @type {Set<string>} */
  const cakisan = new Set();
  for (const x of senaryolar) {
    const sm = servis.ayarlar.operasyonSemalari?.[x.icerik.operasyon];
    if (!sm) continue;
    let c;
    try { c = govdeCoz(x.icerik.govde, semaBirlestir(sm, servis.ayarlar.ekAlanlar?.[x.icerik.operasyon] ?? [])); } catch { continue; }
    for (const [yol, v] of Object.entries(c.degerler)) {
      if (v.kaynak !== 'parametre' || !v.deger || !parametreler.has(v.deger)) continue;
      if (servis.ayarlar.alanBaglari?.[x.icerik.operasyon]?.[yol]) continue;
      const var_ = baglar.find((b) => b.operasyon === x.icerik.operasyon && b.yol === yol);
      if (var_ && var_.ozellik !== v.deger) cakisan.add(`${x.icerik.operasyon} · ${yol}`);
      else if (!var_) baglar.push({ operasyon: x.icerik.operasyon, yol, ozellik: v.deger, hedef: /** @type {any} */ (parametreler.get(v.deger)).hedef });
    }
  }
  for (const k of cakisan) uyarilar.push(`${k}: senaryolar farklı parametreler kullanıyor; bu alana bağ kurulmaz.`);
  const kurulacak = baglar.filter((b) => !cakisan.has(`${b.operasyon} · ${b.yol}`));
  const plan = {
    parametreler: [...parametreler.values()].map((p) => {
      const r = satiri({ icerik: {} }, p);
      return { ad: p.ad, hedef: p.hedef, tablo: p.t.ad, sutun: p.sutun, etiket: p.etiket, rol: p.rol, satir: r ? r.ad : null, senaryoSayisi: p.senaryolar.size };
    }),
    senaryolar: senaryolar.map((x) => ({ id: x.id, baslik: x.baslik, parametreler: [...parametreler.values()].filter((p) => p.senaryolar.has(x.id)).map((p) => p.ad) }))
      .filter((x) => x.parametreler.length),
    baglar: kurulacak.map((b) => ({ operasyon: b.operasyon, yol: b.yol, hedef: b.hedef })),
    uyarilar
  };
  if (!girdi.onay) return { onizleme: plan };
  if (!plan.parametreler.length) throw new DepoHatasi('Dönüştürülecek eski parametre yok.');
  return vt.islem(() => {
    for (const x of senaryolar) {
      const ilgili = [...parametreler.values()].filter((p) => p.senaryolar.has(x.id));
      if (!ilgili.length) continue;
      /** @param {string} m */
      const cevir = (m) => m.replace(/\$\{\s*([A-Za-z_][A-Za-z0-9_.-]{0,79})\s*\}/g, (tam, ad) => {
        const p = parametreler.get(ad);
        return p && p.senaryolar.has(x.id) ? `\${${p.hedef}}` : tam;
      });
      const tabloSecimleri = { ...(x.icerik.tabloSecimleri ?? {}) };
      for (const p of ilgili) {
        const grup = grupAnahtari(p.t.id, p.etiket);
        const r = satiri(x, p);
        if (r && !tabloSecimleri[grup]) {
          const secim = satirSecimi(p.t, r);
          if (Object.keys(secim).length) tabloSecimleri[grup] = secim;
        }
      }
      const icerik = /** @type {any} */ ({ ...x.icerik, govde: cevir(x.icerik.govde ?? ''), ...(x.icerik.http ? { http: { ...x.icerik.http, yol: cevir(x.icerik.http.yol ?? '') } } : {}),
        ...(Object.keys(tabloSecimleri).length ? { tabloSecimleri } : {}) });
      servisSenaryosuKaydet(vt, { id: x.id, projeId, servisId: x.servisId, baslik: x.baslik, kapsam: x.kapsam, icerik, yapan: girdi.yapan });
    }
    if (kurulacak.length) {
      const yeni = /** @type {Record<string, Record<string, any>>} */ (JSON.parse(JSON.stringify(servis.ayarlar.alanBaglari ?? {})));
      for (const b of kurulacak) {
        const p = /** @type {NonNullable<ReturnType<typeof parametreler.get>>} */ (parametreler.get(b.ozellik));
        (yeni[b.operasyon] ??= {})[b.yol] = { tablo: p.t.id, sutun: p.sutun, ...(p.etiket ? { etiket: p.etiket } : {}) };
      }
      servisKaydet(vt, { id: servis.id, projeId, anahtar: servis.anahtar, ad: servis.ad, ayarlar: { ...servis.ayarlar, alanBaglari: alanBaglariniDogrula(yeni) }, yapan: girdi.yapan });
    }
    return { donusturuldu: true, ...plan };
  });
}
