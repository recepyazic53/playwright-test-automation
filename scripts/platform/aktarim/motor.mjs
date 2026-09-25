// AKTARIM MOTORU (genel) — dış kaynaklardaki (ör. bir projenin eski JSON/.env dosyaları) veriyi
// platform varlıklarına aktarır. Motor HİÇBİR projeyi tanımaz: projeye özgü okuma/eşleme işini
// bir "aktarım adaptörü" yapar ve motora nötr bir PAKET verir (bkz. AktarimPaketi). Adaptörler
// projeye özgü klasörlerde durur (ör. projeler/<proje>/aktarim.mjs) ve projeler/index.mjs'te
// kaydedilir; sunucu adaptörü seçip motora geçirir.
//
// Kurallar:
// - Her paket öğesinin bir KAYNAK ANAHTARI vardır (varlık türü içinde tekil; ör. senaryo için
//   "<spec dosyası>::<test başlığı>"). Varlık kimlikleri bu anahtardan türetilir (kararlı UUID):
//   aynı dosyalardan iki makinede ayrı ayrı yapılan aktarım aynı kimlikleri üretir.
// - kaynak_eslemeleri tablosu anahtar → kimlik eşlemesini ve öğenin ŞİFRELİ özetini tutar.
//   Yeniden aktarımda (birleştirme) yalnızca kaynağı DEĞİŞEN öğeler güncellenir; kaynağı aynı
//   kalan öğelerde veritabanında sonradan yapılan düzenlemeler KORUNUR (atlanır). Kaynaktan
//   kalkan senaryo/profiller silinir; ortam, giriş profili, tür ve ekranlar hiçbir zaman
//   otomatik silinmez (yalnızca raporlanır).
// - Ortama göre değişen içerik JSON'da { "ortamlar": { "<ortam anahtarı>": ... } } biçiminde
//   gelir; motor anahtarları ortam KİMLİKLERİNE çevirir (ekran ayarları ve senaryo içeriği).
// - Senaryo içeriğinde, test verisi türlerinde "hassas" işaretli alan adlarına ait metin
//   değerleri kasa zarfıyla saklanır (senaryo sütunu kilitliyken de okunabilir kalır).
// - Uygulama TEK transaction'dır: hata = hiçbir şey yazılmaz. Önizleme hiçbir şey yazmaz ve
//   gizli değer döndürmez (yalnızca sayılar ve gizli olmayan anahtarlar).
// NOT: import.meta KULLANILMAZ (Playwright birim testleri bu dosyayı CommonJS'e çevirir).

import { createHash } from 'node:crypto';
import {
  baglamProfiliKaydet, baglamProfiliSil, ekranKaydet, ekranModeliEkle, ekranModeliGetir, girisProfiliKaydet,
  kaynakEslemeleriniListele, kaynakEslemesiSil, kaynakEslemesiYaz, kaynakOzetiniCoz, ortamGetir, ortamKaydet, projeGetir, projeKaydet,
  projeleriListele, senaryoKaydet, senaryoSil, testVerisiProfiliKaydet, testVerisiProfiliSil, testVerisiTuruKaydet, yerelMakine
} from '../veritabani/depo.mjs';
import { acikAnahtar, coz, sifrele, zarfMi } from '../kasa.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const PAKET_SURUMU = 1;

/**
 * Varlık türleri (kaynak_eslemeleri.varlik_turu) ve kaynaktan kalktığında davranış.
 * @type {ReadonlyArray<{ tur: string; etiket: string; silinebilir: boolean }>}
 */
export const VARLIK_TURLERI = Object.freeze([
  { tur: 'ortam', etiket: 'Ortamlar', silinebilir: false },
  { tur: 'giris_profili', etiket: 'Giriş profilleri', silinebilir: false },
  { tur: 'baglam_profili', etiket: 'Bağlam profilleri', silinebilir: true },
  { tur: 'test_verisi_turu', etiket: 'Test verisi türleri', silinebilir: false },
  { tur: 'test_verisi_profili', etiket: 'Test verisi profilleri', silinebilir: true },
  { tur: 'ekran', etiket: 'Ekranlar', silinebilir: false },
  { tur: 'ekran_modeli', etiket: 'Ekran modelleri', silinebilir: false },
  { tur: 'senaryo', etiket: 'Senaryolar', silinebilir: true }
]);

/** Ortam ayarlarında kullanıcıya ait (platformda düzenlenen) anahtarlar: yeniden aktarım bunları ezmez. */
export const KULLANICI_ORTAM_AYARLARI = Object.freeze(['girisTarifi']);

export class AktarimHatasi extends Error {
  /** @param {string} mesaj */
  constructor(mesaj) {
    super(mesaj);
    this.name = 'AktarimHatasi';
  }
}

// ---------------------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------------------

/**
 * Parçalardan kararlı (deterministik) bir UUID (v5 biçimi, SHA-1 tabanlı) üretir.
 * @param {...string} parcalar
 */
export function kararliKimlik(...parcalar) {
  const ozet = createHash('sha1').update(['platform-aktarim:v1', ...parcalar].join('\u0000'), 'utf8').digest();
  ozet[6] = (ozet[6] & 0x0f) | 0x50;
  ozet[8] = (ozet[8] & 0x3f) | 0x80;
  const h = ozet.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** @param {unknown} d @returns {unknown} */
export function kanonik(d) {
  if (Array.isArray(d)) return d.map(kanonik);
  if (typeof d === 'object' && d !== null) {
    return Object.fromEntries(Object.keys(d).sort().map((k) => [k, kanonik(/** @type {Record<string, unknown>} */ (d)[k])]));
  }
  return d;
}

/** Paket öğesinin özeti (sıra bağımsız JSON'un SHA-256'sı). Düz özet YAZILMAZ; zarf içinde saklanır. @param {unknown} oge */
export function ogeOzeti(oge) {
  return createHash('sha256').update(`aktarim-oge:v1:${JSON.stringify(kanonik(oge))}`, 'utf8').digest('hex');
}

/** Metin/Buffer içeriğinin SHA-256'sı (dosya ve ortam değişkeni parmak izleri için). @param {string | Buffer} icerik */
export function icerikOzeti(icerik) {
  return createHash('sha256').update(icerik).digest('hex');
}

/**
 * Nesne ağacında adı "adlar" içinde olan anahtarların DOLU metin değerlerini dönüştürür.
 * @param {unknown} deger @param {ReadonlySet<string>} adlar @param {(metin: string) => string} donustur
 * @returns {unknown}
 */
export function adliAlanlariDonustur(deger, adlar, donustur) {
  if (Array.isArray(deger)) return deger.map((d) => adliAlanlariDonustur(d, adlar, donustur));
  if (typeof deger === 'object' && deger !== null) {
    /** @type {Record<string, unknown>} */
    const yeni = {};
    for (const [k, v] of Object.entries(deger)) {
      yeni[k] = adlar.has(k) && typeof v === 'string' && v !== '' ? donustur(v) : adliAlanlariDonustur(v, adlar, donustur);
    }
    return yeni;
  }
  return deger;
}

/**
 * Nesne ağacındaki tüm kasa zarflarını (metin değerleri) çözer. Kasa açık olmalıdır.
 * @param {Veritabani} vt @param {unknown} deger @returns {unknown}
 */
export function zarflariCoz(vt, deger) {
  if (Array.isArray(deger)) return deger.map((d) => zarflariCoz(vt, d));
  if (typeof deger === 'object' && deger !== null) {
    return Object.fromEntries(Object.entries(deger).map(([k, v]) => [k, zarflariCoz(vt, v)]));
  }
  return zarfMi(deger) ? coz(vt, deger) : deger;
}

/**
 * Adaptörün bu proje için daha önce aktardığı projeyi bulur (ayarlar.aktarim.adaptor).
 * Kasa gerektirmez (proje ayarları düz metindir ve gizli değer içermez).
 * @param {Veritabani} vt @param {string} adaptorAdi
 */
export function aktarilmisProjeyiBul(vt, adaptorAdi) {
  return projeleriListele(vt).find((p) => {
    const aktarim = /** @type {Record<string, unknown> | undefined} */ (p.ayarlar?.aktarim);
    return aktarim && aktarim.adaptor === adaptorAdi;
  });
}

/**
 * Ortam anahtarı (ör. "test") → ortam kimliği (kaynak eşlemesinden). Bulunamazsa undefined.
 * @param {Veritabani} vt @param {string} projeId @param {string} ortamAnahtari
 */
export function ortamKimligiBul(vt, projeId, ortamAnahtari) {
  return kaynakEslemeleriniListele(vt, projeId, 'ortam').find((e) => e.kaynakAnahtari === ortamAnahtari)?.varlikId;
}

// ---------------------------------------------------------------------------------------
// Plan (önizleme ve uygulama aynı planı kullanır)
// ---------------------------------------------------------------------------------------

/**
 * @typedef {import('./motor.d.mts').AktarimPaketi} AktarimPaketi
 * @typedef {{ tur: string; anahtar: string; id: string; ozet: string; islem: 'yeni' | 'guncelle' | 'ayni' | 'silinmis'; oge: Record<string, unknown> }} PlanOgesi
 */

/**
 * @param {Veritabani | null} vt
 * @param {AktarimPaketi} paket
 */
function planOlustur(vt, paket) {
  const mevcutProje = vt ? aktarilmisProjeyiBul(vt, paket.adaptor)
    ?? projeleriListele(vt).find((p) => p.ad.toLocaleLowerCase('tr') === paket.proje.ad.toLocaleLowerCase('tr')) : undefined;
  const projeId = mevcutProje?.id ?? kararliKimlik('proje', paket.adaptor);
  /** @type {Map<string, Map<string, import('../veritabani/depo.d.mts').KaynakEslemesi>>} */
  const eslemeler = new Map(VARLIK_TURLERI.map((t) => [t.tur, new Map()]));
  if (vt && mevcutProje) {
    const liste = kaynakEslemeleriniListele(vt, projeId);
    if (liste.length) acikAnahtar(vt); // özetleri karşılaştırmak için kasa açık olmalı
    for (const e of liste) eslemeler.get(e.varlikTuru)?.set(e.kaynakAnahtari, e);
  }
  const tabloVar = (/** @type {string} */ tablo, /** @type {string} */ id) => Boolean(vt?.tek(`SELECT 1 AS v FROM ${tablo} WHERE id = ?`, [id]));
  const TABLO = {
    ortam: 'ortamlar', giris_profili: 'giris_profilleri', baglam_profili: 'baglam_profilleri', test_verisi_turu: 'test_verisi_turleri',
    test_verisi_profili: 'test_verisi_profilleri', ekran: 'ekranlar', ekran_modeli: 'ekranlar', senaryo: 'senaryolar'
  };

  /** @type {PlanOgesi[]} */
  const ogeler = [];
  /** @param {string} tur @param {string} anahtar @param {Record<string, unknown>} oge */
  const ekle = (tur, anahtar, oge) => {
    if (typeof anahtar !== 'string' || !anahtar) throw new AktarimHatasi(`${tur}: kaynak anahtarı boş olamaz.`);
    if (ogeler.some((o) => o.tur === tur && o.anahtar === anahtar)) throw new AktarimHatasi(`${tur}: kaynak anahtarı tekrar ediyor: "${anahtar}".`);
    const ozet = ogeOzeti(oge);
    const esleme = eslemeler.get(tur)?.get(anahtar);
    const id = esleme?.varlikId ?? kararliKimlik(projeId, tur, anahtar);
    /** @type {PlanOgesi['islem']} */
    let islem;
    const tablo = /** @type {Record<string, string>} */ (TABLO)[tur];
    const varlikVar = tabloVar(tablo, tur === 'ekran_modeli' ? String(oge.ekranId ?? '') : id);
    if (!esleme) islem = varlikVar && tur !== 'ekran_modeli' ? 'guncelle' : 'yeni';
    else {
      const eskiOzet = vt ? kaynakOzetiniCoz(vt, esleme.kaynakOzetiZarfi) : null;
      if (eskiOzet === ozet) islem = varlikVar || tur === 'ekran_modeli' ? 'ayni' : 'silinmis';
      else islem = varlikVar ? 'guncelle' : 'yeni';
    }
    ogeler.push({ tur, anahtar, id, ozet, islem, oge });
  };

  for (const o of paket.ortamlar) ekle('ortam', o.anahtar, o);
  for (const g of paket.girisProfilleri) ekle('giris_profili', g.anahtar, g);
  for (const b of paket.baglamProfilleri) ekle('baglam_profili', b.anahtar, b);
  for (const t of paket.testVerisiTurleri) ekle('test_verisi_turu', t.anahtar, t);
  for (const p of paket.testVerisiProfilleri) ekle('test_verisi_profili', p.anahtar, p);
  for (const e of paket.ekranlar) {
    const { model, ...ekran } = e;
    ekle('ekran', e.anahtar, ekran);
    if (model) {
      const ekranId = /** @type {PlanOgesi} */ (ogeler.find((x) => x.tur === 'ekran' && x.anahtar === e.anahtar)).id;
      ekle('ekran_modeli', e.anahtar, { ekranId, model });
    }
  }
  for (const s of paket.senaryolar) ekle('senaryo', s.anahtar, s);

  /** Kaynaktan kalkan eşlemeler. */
  const kalkanlar = [];
  for (const t of VARLIK_TURLERI) {
    const planAnahtarlari = new Set(ogeler.filter((o) => o.tur === t.tur).map((o) => o.anahtar));
    for (const [anahtar, e] of eslemeler.get(t.tur) ?? []) {
      if (!planAnahtarlari.has(anahtar)) kalkanlar.push({ tur: t.tur, anahtar, id: e.varlikId, silinebilir: t.silinebilir });
    }
  }
  return { projeId, projeVar: Boolean(mevcutProje), ogeler, kalkanlar };
}

/** @param {ReturnType<typeof planOlustur>} plan */
function sayimOzeti(plan) {
  /** @type {Record<string, { etiket: string; toplam: number; yeni: number; guncellenecek: number; ayni: number; silinmisAtlanacak: number; kaldirilacak: number; kaynaktaYok: number }>} */
  const sayimlar = {};
  for (const t of VARLIK_TURLERI) {
    const ogeler = plan.ogeler.filter((o) => o.tur === t.tur);
    const kalkan = plan.kalkanlar.filter((k) => k.tur === t.tur);
    sayimlar[t.tur] = {
      etiket: t.etiket,
      toplam: ogeler.length,
      yeni: ogeler.filter((o) => o.islem === 'yeni').length,
      guncellenecek: ogeler.filter((o) => o.islem === 'guncelle').length,
      ayni: ogeler.filter((o) => o.islem === 'ayni').length,
      silinmisAtlanacak: ogeler.filter((o) => o.islem === 'silinmis').length,
      kaldirilacak: kalkan.filter((k) => k.silinebilir).length,
      kaynaktaYok: kalkan.filter((k) => !k.silinebilir).length
    };
  }
  return sayimlar;
}

/**
 * ÖNİZLEME: hiçbir şey yazmaz; yalnızca sayılar, uyarılar ve (gizli olmayan) atlanacak anahtarlar.
 * Veritabanında daha önce aktarılmış kayıt varsa özet karşılaştırması için kasa açık olmalıdır.
 * @param {Veritabani | null} vt
 * @param {AktarimPaketi} paket
 */
export function aktarimiOnizle(vt, paket) {
  paketiDogrula(paket);
  const plan = planOlustur(vt, paket);
  return {
    adaptor: paket.adaptor,
    proje: { ad: paket.proje.ad, mevcut: plan.projeVar },
    sayimlar: sayimOzeti(plan),
    kosudanHaricSenaryo: paket.senaryolar.filter((s) => !s.kosuyaDahil).length,
    uyarilar: [...paket.uyarilar]
  };
}

/** @param {AktarimPaketi} paket */
function paketiDogrula(paket) {
  if (!paket || typeof paket !== 'object' || paket.surum !== PAKET_SURUMU) throw new AktarimHatasi('Aktarım paketi sürümü desteklenmiyor.');
  if (!paket.adaptor || !paket.proje?.ad) throw new AktarimHatasi('Aktarım paketinde adaptör/proje adı eksik.');
}

/**
 * JSON'da üst düzey "ortamlar" haritasının anahtarlarını ortam kimliklerine çevirir.
 * @param {Record<string, unknown>} nesne @param {(anahtar: string) => string | undefined} ortamId @param {string[]} uyarilar @param {string} neresi
 */
function ortamHaritasiniCevir(nesne, ortamId, uyarilar, neresi) {
  const harita = nesne.ortamlar;
  if (typeof harita !== 'object' || harita === null || Array.isArray(harita)) return nesne;
  /** @type {Record<string, unknown>} */
  const yeni = {};
  for (const [anahtar, deger] of Object.entries(harita)) {
    const id = ortamId(anahtar);
    if (!id) { uyarilar.push(`${neresi}: "${anahtar}" ortamı bulunamadı, bu ortamın verisi atlandı.`); continue; }
    yeni[id] = deger;
  }
  return { ...nesne, ortamlar: yeni };
}

/**
 * UYGULAMA: paketi tek transaction içinde veritabanına yazar. Kasa açık olmalıdır.
 * @param {Veritabani} vt
 * @param {AktarimPaketi} paket
 * @param {{ yapan?: string }} [secenekler]
 */
export function aktarimiUygula(vt, paket, secenekler = {}) {
  paketiDogrula(paket);
  acikAnahtar(vt);
  const makine = yerelMakine(vt);
  const yapan = secenekler.yapan ?? `dosya-aktarimi@${makine.id}`;
  const uyarilar = [...paket.uyarilar];
  // Test verisi alanları varsayılan olarak hassastır (depo.mjs ile aynı kural: hassas !== false).
  const hassasAdlar = new Set([
    ...paket.testVerisiTurleri.flatMap((t) => t.alanlar.filter((a) => a.hassas !== false).map((a) => a.ad)),
    ...(paket.ekHassasAlanAdlari ?? [])
  ]);

  return vt.islem(() => {
    const plan = planOlustur(vt, paket);
    const sayimlar = sayimOzeti(plan);
    const { projeId } = plan;
    // Proje (ayarlar.aktarim: adaptör, zaman, açık ve ŞİFRELİ özetler; diğer ayarlar korunur).
    const mevcut = projeGetir(vt, projeId);
    /** @type {Record<string, unknown>} */
    const gizliOzetler = {};
    for (const [ad, deger] of Object.entries(paket.gizliOzetler ?? {})) {
      gizliOzetler[ad] = typeof deger === 'string'
        ? sifrele(vt, deger)
        : Object.fromEntries(Object.entries(deger).map(([k, v]) => [k, sifrele(vt, v)]));
    }
    projeKaydet(vt, {
      id: projeId,
      ad: mevcut?.ad ?? paket.proje.ad,
      aciklama: mevcut?.aciklama ?? paket.proje.aciklama ?? null,
      ayarlar: {
        ...(mevcut?.ayarlar ?? {}),
        aktarim: {
          adaptor: paket.adaptor, paketSurumu: PAKET_SURUMU, sonAktarim: new Date().toISOString(),
          ...(paket.projeAyarlari ?? {}), gizliOzetler
        }
      }
    });

    /** @type {Map<string, string>} */
    const kimlikler = new Map(plan.ogeler.map((o) => [`${o.tur}\u0000${o.anahtar}`, o.id]));
    const kimlik = (/** @type {string} */ tur, /** @type {string} */ anahtar) =>
      kimlikler.get(`${tur}\u0000${anahtar}`) ?? kaynakEslemeleriniListele(vt, projeId, tur).find((e) => e.kaynakAnahtari === anahtar)?.varlikId;
    const ortamId = (/** @type {string | null | undefined} */ anahtar) => (anahtar ? kimlik('ortam', anahtar) : undefined);

    /** @type {Record<string, string[]>} */
    const atlananlar = { ayni: [], silinmis: [], ortamYok: [] };
    // Kullanıcının Ekranlar'dan SİLDİĞİ ekranlar (mezar taşı; bkz. ekranlar/ekran-yonetimi.mjs): kaynak değişmiş olsa da
    // ekran, modeli ve senaryoları yeniden eklenmez/güncellenmez (ekran önce geri yüklenmelidir).
    const silinmisEkranlar = new Set(vt.tumu("SELECT id FROM ekranlar WHERE proje_id = ? AND durum = 'silindi'", [projeId]).map((e) => String(e.id)));
    const silinmisEkranaAit = (/** @type {PlanOgesi} */ o) => {
      if (!silinmisEkranlar.size) return false;
      const g = /** @type {Record<string, unknown>} */ (o.oge);
      if (o.tur === 'ekran') return silinmisEkranlar.has(o.id);
      if (o.tur === 'ekran_modeli') return silinmisEkranlar.has(String(g.ekranId ?? ''));
      if (o.tur === 'senaryo' && typeof g.ekran === 'string') return silinmisEkranlar.has(kimlik('ekran', g.ekran) ?? '');
      return false;
    };
    for (const o of plan.ogeler) {
      if (o.islem === 'ayni') { atlananlar.ayni.push(`${o.tur}:${o.anahtar}`); continue; }
      if (o.islem === 'silinmis' || silinmisEkranaAit(o)) { atlananlar.silinmis.push(`${o.tur}:${o.anahtar}`); continue; }
      const g = /** @type {Record<string, *>} */ (o.oge);
      const ortamGerekli = 'ortam' in g && g.ortam !== null && g.ortam !== undefined;
      const oid = ortamGerekli ? ortamId(g.ortam) : null;
      if (ortamGerekli && !oid) { atlananlar.ortamYok.push(`${o.tur}:${o.anahtar}`); uyarilar.push(`${o.tur} "${o.anahtar}": ortam "${g.ortam}" yok, atlandı.`); continue; }
      switch (o.tur) {
        case 'ortam': {
          // Kullanıcının platformda düzenlediği ortam ayarları (ör. giriş tarifi) kaynak değişse de KORUNUR;
          // paket bunları yalnızca ortamda henüz yoksa ekler.
          const mevcutAyarlar = o.islem === 'guncelle' ? ortamGetir(vt, o.id)?.ayarlar ?? {} : {};
          const korunan = Object.fromEntries(KULLANICI_ORTAM_AYARLARI.filter((k) => k in mevcutAyarlar).map((k) => [k, mevcutAyarlar[k]]));
          ortamKaydet(vt, { id: o.id, projeId, ad: g.ad, tabanUrl: g.tabanUrl, varsayilan: Boolean(g.varsayilan), ayarlar: { ...(g.ayarlar ?? {}), ...korunan } });
          break;
        }
        case 'giris_profili':
          girisProfiliKaydet(vt, {
            id: o.id, projeId, ortamId: oid, ad: g.ad, kullaniciAdi: g.kullaniciAdi, parola: g.parola ?? null,
            ikiAsamaliTur: g.ikiAsamaliTur ?? 'yok', totpGizli: g.totpGizli ?? null, smsAyari: g.smsAyari ?? {}, yapan
          });
          break;
        case 'baglam_profili':
          baglamProfiliKaydet(vt, { id: o.id, projeId, ortamId: oid, tur: g.tur, ad: g.ad, alanlar: g.alanlar ?? {}, yapan });
          break;
        case 'test_verisi_turu':
          testVerisiTuruKaydet(vt, { id: o.id, projeId, ad: g.ad, alanlar: g.alanlar });
          break;
        case 'test_verisi_profili': {
          const turId = kimlik('test_verisi_turu', g.tur);
          if (!turId) throw new AktarimHatasi(`Test verisi profili "${o.anahtar}": tür "${g.tur}" bulunamadı.`);
          testVerisiProfiliKaydet(vt, { id: o.id, projeId, turId, ortamId: oid, ad: g.ad, degerler: g.degerler, yapan });
          break;
        }
        case 'ekran':
          ekranKaydet(vt, {
            id: o.id, projeId, anahtar: g.ekranAnahtari, ad: g.ad, aciklama: g.aciklama ?? null,
            ayarlar: ortamHaritasiniCevir(g.ayarlar ?? {}, ortamId, uyarilar, `Ekran "${g.ad}"`)
          });
          break;
        case 'ekran_modeli': {
          const son = ekranModeliGetir(vt, g.ekranId);
          if (!son || JSON.stringify(kanonik(son.model)) !== JSON.stringify(kanonik(g.model))) {
            ekranModeliEkle(vt, { ekranId: g.ekranId, model: g.model, aciklama: 'Proje dosyalarından aktarıldı' });
          }
          break;
        }
        case 'senaryo': {
          // "kaynak" (eski dosya + başlık işaretçisi) açık kalır; geri kalan içerikte hassas adlı alanlar şifrelenir.
          const { kaynak, ...govde } = ortamHaritasiniCevir(g.icerik ?? {}, ortamId, uyarilar, `Senaryo "${g.baslik}"`);
          const icerik = {
            ...(kaynak === undefined ? {} : { kaynak }),
            .../** @type {Record<string, unknown>} */ (adliAlanlariDonustur(govde, hassasAdlar, (m) => sifrele(vt, m)))
          };
          senaryoKaydet(vt, {
            id: o.id, projeId, ekranId: g.ekran ? kimlik('ekran', g.ekran) ?? null : null, baslik: g.baslik, icerik,
            kosuyaDahil: g.kosuyaDahil !== false, yapan
          });
          break;
        }
        default:
          throw new AktarimHatasi(`Bilinmeyen varlık türü: ${o.tur}`);
      }
      kaynakEslemesiYaz(vt, {
        id: kararliKimlik(projeId, 'esleme', o.tur, o.anahtar), projeId, varlikTuru: o.tur, kaynakAnahtari: o.anahtar,
        varlikId: o.tur === 'ekran_modeli' ? String(g.ekranId) : o.id, kaynakOzeti: o.ozet
      });
    }
    // Kaynağı "aynı" olup yalnızca eşlemesi yazılmamış kalanlar yoktur; silinmiş (kullanıcı
    // veritabanından sildi) olanlarda eşleme korunur ki bir sonraki aktarım yeniden eklemesin.

    /** @type {string[]} */
    const kaldirilanlar = [];
    /** @type {string[]} */
    const kaynaktaYok = [];
    for (const k of plan.kalkanlar) {
      if (!k.silinebilir) { kaynaktaYok.push(`${k.tur}:${k.anahtar}`); continue; }
      if (k.tur === 'senaryo') senaryoSil(vt, k.id, yapan);
      else if (k.tur === 'baglam_profili') baglamProfiliSil(vt, k.id, yapan);
      else if (k.tur === 'test_verisi_profili') testVerisiProfiliSil(vt, k.id, yapan);
      kaynakEslemesiSil(vt, projeId, k.tur, k.anahtar);
      kaldirilanlar.push(`${k.tur}:${k.anahtar}`);
    }
    hassasAlanlariTamamla(vt, projeId, hassasAdlar);
    return { projeId, sayimlar, atlananlar, kaldirilanlar, kaynaktaYok, uyarilar };
  });
}

/**
 * Hassas alan kümesi genişlediğinde (ör. "tüm test verisi alanları hassas" kararı) kaynağı
 * DEĞİŞMEDİĞİ için yeniden yazılmayan senaryolarda kalan düz metin hassas değerleri şifreler —
 * senaryo satırında ve senaryonun değişiklik geçmişi anlık görüntülerinde. Veritabanında yapılmış
 * düzenlemeler korunur (yalnızca değer biçimi değişir); geçmişe yeni kayıt yazılmaz.
 * @param {Veritabani} vt @param {string} projeId @param {ReadonlySet<string>} hassasAdlar
 * @returns {number} şifrelenen değer sayısı
 */
export function hassasAlanlariTamamla(vt, projeId, hassasAdlar) {
  if (!hassasAdlar.size) return 0;
  let sayi = 0;
  const sifreliyse = (/** @type {string} */ m) => {
    if (zarfMi(m)) return m;
    sayi++;
    return sifrele(vt, m);
  };
  /** @param {unknown} icerik @returns {unknown} */
  const tamamla = (icerik) => {
    if (typeof icerik !== 'object' || icerik === null || Array.isArray(icerik)) return icerik;
    const { kaynak, ...govde } = /** @type {Record<string, unknown>} */ (icerik);
    return { ...(kaynak === undefined ? {} : { kaynak }), .../** @type {Record<string, unknown>} */ (adliAlanlariDonustur(govde, hassasAdlar, sifreliyse)) };
  };
  return vt.islem(() => {
    const senaryolar = vt.tumu('SELECT id, icerik_json FROM senaryolar WHERE proje_id = ?', [projeId]);
    for (const s of senaryolar) {
      const once = sayi;
      const yeni = tamamla(JSON.parse(String(s.icerik_json)));
      if (sayi !== once) vt.calistir('UPDATE senaryolar SET icerik_json = ? WHERE id = ?', [JSON.stringify(yeni), s.id]);
    }
    const kimlikler = senaryolar.map((s) => String(s.id));
    for (let i = 0; i < kimlikler.length; i += 500) {
      const parca = kimlikler.slice(i, i + 500);
      for (const g of vt.tumu(
        `SELECT id, onceki_json, sonraki_json FROM degisiklik_gecmisi WHERE varlik_turu = 'senaryo' AND varlik_id IN (${parca.map(() => '?').join(', ')})`, parca
      )) {
        /** @type {Record<string, string>} */
        const guncel = {};
        for (const sutun of ['onceki_json', 'sonraki_json']) {
          if (typeof g[sutun] !== 'string') continue;
          const anlik = JSON.parse(String(g[sutun]));
          if (typeof anlik?.icerik_json !== 'string') continue;
          const once = sayi;
          const yeni = tamamla(JSON.parse(anlik.icerik_json));
          if (sayi !== once) guncel[sutun] = JSON.stringify({ ...anlik, icerik_json: JSON.stringify(yeni) });
        }
        const sutunlar = Object.keys(guncel);
        if (sutunlar.length) vt.calistir(`UPDATE degisiklik_gecmisi SET ${sutunlar.map((x) => `${x} = ?`).join(', ')} WHERE id = ?`, [...sutunlar.map((x) => guncel[x]), g.id]);
      }
    }
    return sayi;
  });
}
