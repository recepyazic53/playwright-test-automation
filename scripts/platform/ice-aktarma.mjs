// YEDEK İÇE AKTARMA — ÖNİZLEME → SEÇİM → UYGULAMA.
//
// 1) Hazırlık (iceAktarmaHazirla): yedek parolayla açılır (yanlış parola = HİÇBİR şey
//    hazırlanmaz), satırlardaki zarflar yerel kasa anahtarıyla yeniden şifrelenir ve BELLEKTE
//    bir hazırlık alanı (staging) oluşur. Varlık türü başına üç grup üretilir:
//      yeni         — yalnızca dosyada olan kayıtlar
//      degisen      — aynı kimlik, farklı içerik (iki sürüm + alan bazında fark)
//      yalnizBurada — yalnızca bu makinede olan kayıtlar (bilgi amaçlı; ASLA silinmez)
//    'gizli' sütunlar (parola, TOTP) ve hassas test verisi alanları önizlemede MASKELİdir;
//    düz metinleri hiçbir yanıtta yer almaz. Koşular/sonuçlar, geçmiş ve makine kayıtları
//    önizlemeye girmez: her zaman kimlik üzerinden eklenir (varsa atlanır) ve yalnızca sayılır.
// 2) Uygulama (iceAktarmaUygula): yalnızca SEÇİLEN kayıtlar tek transaction'da yazılır.
//    Üzerine yazılan yerel sürüm degisiklik_gecmisi'ne 'ice_aktarma_uzerine_yazildi' olarak
//    kaydedilir (anlık görüntüde şifreli sütunlar şifreli kalır). Seçilen bir kaydın ihtiyaç
//    duyduğu üst kayıt (ör. yeni senaryonun yeni projesi) yerelde yoksa otomatik eklenir ve
//    raporlanır. Boş veritabanına "tümü" uygulanırsa tam yükleme (kasa dahil) yapılır.
//    HEDEF PROJE: önizleme yedekteki projeleri ve önerilen hedefleri (projeEslemesi) taşır; kullanıcı bir projeyi mevcut
//    bir projeye (ortamlarını o projenin ortamlarına) eşlerse eslemeOnizlemesi önizlemeyi yeniden üretir ve uygulama aynı
//    eşlemeyle (secim.esleme) yapılır — kurallar: ice-aktarma-esleme.mjs. Eşleme verilmezse bugünkü davranış.
//    Başka projeye aktarılan yedek projesi ASLA "üst kayıt" olarak eklenmez; transaction sonunda o proje kimliğiyle yeni kayıt
//    yazılmadığı / proje kaydı oluşmadığı denetlenir (aksi halde her şey geri alınır). Silinmiş bir projeden kalan öksüz koşu
//    kayıtları eşlenmiş sürümleriyle hedef projeye taşınır; seçilmediği için kalanlar sonuçta "kalintilar" olarak bildirilir.
// 3) Hazırlık alanı uygulamadan sonra, iptalde veya 1 saat sonra atılır (anahtar sıfırlanır).
// MEDYA: biçim 2 yedekteki (şifreli) medya dosyaları hazırlıkta medya klasörünün içindeki
//    .hazirlik-<kimlik>/ klasörüne OLDUĞU GİBİ çıkarılır (düz metin yazılmaz); önizleme tür
//    başına eklenecek medya sayısı/boyutunu gösterir. Uygulamada (iceAktarmaMedyasiniYaz) yalnızca
//    veritabanına YAZILAN medya satırlarının dosyaları yerleştirilir (sonucu içe aktarılmayan
//    medya atlanır; kimlik üzerinden tekilleştirilir). Kaynak medya anahtarı yerelden farklıysa
//    dosyalar yerel anahtarla yeniden şifrelenir (bkz. yedek.mjs > medyalariYerlestir).
//
// Bu modül import.meta KULLANMAZ (birim testleri CommonJS'e çevirerek yükler).

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { veritabaniAc } from './veritabani/baglanti.mjs';
import { SIFRELI_ALANLAR, TABLOLAR, gocleriUygula } from './veritabani/gocler.mjs';
import { gecmisYapaniniNormallestir, gecmisYaz, sayimlar, yerelMakine } from './veritabani/depo.mjs';
import {
  KasaHatasi, acikAnahtar, gecmisAnligiSifrele, kasaDurumu, kasayiAnahtarlaAc, metindekiZarflariDonustur,
  satirSifreliAlanlariniTamamla, sifreliAlanlariTamamla, zarfCoz, zarfMi, zarfSifrele
} from './kasa.mjs';
import {
  YedekHatasi, hazirlikKlasoruYolu, hazirlikKlasorunuSil, medyaAnahtariniBenimse, medyalariYerlestir,
  satirEkle, sutunlariDogrula, tamYukleYaz, veritabaniBosMu, yedekAc
} from './yedek.mjs';
import { medyaDosyaAdiGecerliMi, medyaKlasoru as medyaKlasoruBul } from './medya.mjs';
import { IZIN_AYAR_ANAHTARI } from './guvenlik/izinler.mjs';
import { yedekUyarisiniKur } from './guvenlik/yedek-uyarisi.mjs';
import { eslemeyiUygula, projeEslemesiBilgisi } from './ice-aktarma-esleme.mjs';
import { projeKalintilari } from './proje-yonetimi.mjs';

/** @typedef {import('./veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {(asama: string, yuzde: number, bayt?: { islenen: number; toplam: number }) => void} IlerlemeFn */
/** @typedef {Record<string, unknown>} Satir */

/** Önizlemede gösterilen ve seçilebilen varlık türleri (tablo adı → Türkçe etiket). */
export const ONIZLEME_TABLOLARI = Object.freeze({
  projeler: 'Projeler',
  ortamlar: 'Ortamlar',
  giris_profilleri: 'Giriş profilleri',
  baglam_profilleri: 'Bağlam profilleri',
  test_verisi_turleri: 'Test verisi türleri',
  test_verisi_profilleri: 'Test verisi profilleri',
  ekranlar: 'Ekranlar',
  ekran_modelleri: 'Ekran modeli sürümleri',
  senaryolar: 'Senaryolar',
  servisler: 'Servisler',
  servis_senaryolari: 'Servis senaryoları',
  servis_kimlikleri: 'Servis giriş bilgileri',
  servis_parametre_tanimlari: 'Servis parametre tanımları',
  servis_akislari: 'Servis akışları',
  ekipler: 'Ekipler',
  rapor_isaretleri: 'Rapor işaretleri (kritik, ekip, süre eşiği)',
  kurtarma_kurallari: 'Kurtarma kuralları',
  ayarlar: 'Ayarlar'
});
/** Her zaman eklenen (kimlik üzerinden tekilleştirilen) ve yalnızca sayılan tablolar. */
// medya: üst bilgi satırı; dosyası yedekte varsa uygulamada ayrıca yerleştirilir. Sonucu bu
// makinede olmayan (içe aktarılmayan) medya satırı ATLANIR (bağlantısı kaldırılarak eklenmez).
export const EKLEME_TABLOLARI = Object.freeze(['makineler', 'degisiklik_gecmisi', 'kosular', 'kosu_sonuclari', 'adim_sonuclari', 'yakalanan_mesajlar', 'medya', 'servis_kosulari', 'servis_akis_kosulari', 'raporlar']);
export const MASKE = '••••••';
export const HAZIRLIK_SAKLAMA_MS = 60 * 60 * 1000;
const ZAMAN_SUTUNLARI = new Set(['olusturulma', 'guncellenme']);

for (const t of TABLOLAR) {
  if (!(t.ad in ONIZLEME_TABLOLARI) && !EKLEME_TABLOLARI.includes(t.ad)) {
    throw new Error(`İçe aktarma: "${t.ad}" tablosu için davranış tanımlı değil (ONIZLEME_TABLOLARI / EKLEME_TABLOLARI).`);
  }
}
const TABLO_BILGISI = new Map(TABLOLAR.map((t) => [t.ad, t]));

/** @param {string} tablo */
function bilgi(tablo) {
  return /** @type {(typeof TABLOLAR)[number]} */ (TABLO_BILGISI.get(tablo));
}

/** @param {unknown} d @returns {unknown} */
function kanonikSirala(d) {
  if (Array.isArray(d)) return d.map(kanonikSirala);
  if (typeof d === 'object' && d !== null) {
    return Object.fromEntries(Object.keys(d).sort().map((k) => [k, kanonikSirala(/** @type {Satir} */ (d)[k])]));
  }
  return d;
}

/**
 * Sütun değerini iki biçimde üretir:
 *  - gorunum: kullanıcıya gösterilecek (gizli → MASKE, JSON içindeki zarflar → MASKE, 'ozel' çözülür)
 *  - karsilastirma: fark hesaplamak için tamamen çözülmüş hali (YANITA KONMAZ)
 * @param {string} tablo @param {string} sutun @param {unknown} deger @param {Buffer} anahtar
 */
function sutunDegeri(tablo, sutun, deger, anahtar) {
  const jsonMu = bilgi(tablo).json.includes(sutun);
  const tur = SIFRELI_ALANLAR[tablo]?.[sutun];
  const jsonCoz = (/** @type {string} */ metin) => {
    try { return JSON.parse(metin); } catch { return metin; }
  };
  if (typeof deger !== 'string') return { gorunum: deger ?? null, karsilastirma: deger ?? null, maskeli: false };
  if (zarfMi(deger)) {
    const acik = zarfCoz(anahtar, deger);
    const karsilastirma = jsonMu ? jsonCoz(acik) : acik;
    if (tur === 'gizli') return { gorunum: MASKE, karsilastirma, maskeli: true };
    return { gorunum: karsilastirma, karsilastirma, maskeli: false };
  }
  if (jsonMu) {
    let maskeli = false;
    const gorunumMetni = metindekiZarflariDonustur(deger, () => { maskeli = true; return MASKE; });
    const karsilastirmaMetni = metindekiZarflariDonustur(deger, (z) => JSON.stringify(zarfCoz(anahtar, z)).slice(1, -1));
    return { gorunum: jsonCoz(gorunumMetni), karsilastirma: jsonCoz(karsilastirmaMetni), maskeli };
  }
  return { gorunum: deger, karsilastirma: deger, maskeli: false };
}

/** @param {string} tablo @param {Satir} satir @param {Buffer} anahtar */
function satirGorunumu(tablo, satir, anahtar) {
  /** @type {Satir} */
  const gorunum = {};
  /** @type {Satir} */
  const karsilastirma = {};
  /** @type {Set<string>} */
  const maskeli = new Set();
  for (const [sutun, deger] of Object.entries(satir)) {
    const d = sutunDegeri(tablo, sutun, deger, anahtar);
    gorunum[sutun] = d.gorunum;
    karsilastirma[sutun] = d.karsilastirma;
    if (d.maskeli) maskeli.add(sutun);
  }
  return { gorunum, karsilastirma, maskeli };
}

/** @param {string} tablo @param {Satir} gorunum @param {string} id */
function baslikUret(tablo, gorunum, id) {
  const alan = bilgi(tablo).baslikAlani;
  if (tablo === 'ekran_modelleri') return `${String(gorunum.ekran_id ?? '')} · sürüm ${String(gorunum.surum ?? '?')}`;
  const deger = alan ? gorunum[alan] : null;
  return deger === null || deger === undefined || deger === MASKE ? id : String(deger);
}

/**
 * Alan bazında fark: zaman damgaları hariç; JSON nesne sütunlarında bir seviye iç anahtar.
 * @param {ReturnType<typeof satirGorunumu>} yerel @param {ReturnType<typeof satirGorunumu>} dosya
 * @returns {Array<{ alan: string; yerel: unknown; dosya: unknown; maskeli?: true }>}
 */
function farkHesapla(yerel, dosya) {
  /** @type {Array<{ alan: string; yerel: unknown; dosya: unknown; maskeli?: true }>} */
  const farklar = [];
  const ayni = (/** @type {unknown} */ a, /** @type {unknown} */ b) => JSON.stringify(kanonikSirala(a ?? null)) === JSON.stringify(kanonikSirala(b ?? null));
  const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
  const sutunlar = [...new Set([...Object.keys(yerel.karsilastirma), ...Object.keys(dosya.karsilastirma)])].sort();
  for (const sutun of sutunlar) {
    if (ZAMAN_SUTUNLARI.has(sutun)) continue;
    const yk = yerel.karsilastirma[sutun];
    const dk = dosya.karsilastirma[sutun];
    if (ayni(yk, dk)) continue;
    const yg = yerel.gorunum[sutun];
    const dg = dosya.gorunum[sutun];
    if (nesneMi(yk) && nesneMi(dk) && nesneMi(yg) && nesneMi(dg)) {
      const ykN = /** @type {Satir} */ (yk);
      const dkN = /** @type {Satir} */ (dk);
      for (const anahtar of [...new Set([...Object.keys(ykN), ...Object.keys(dkN)])].sort()) {
        if (ayni(ykN[anahtar], dkN[anahtar])) continue;
        const yDeger = /** @type {Satir} */ (yg)[anahtar] ?? null;
        const dDeger = /** @type {Satir} */ (dg)[anahtar] ?? null;
        const maskeli = JSON.stringify(yDeger).includes(MASKE) || JSON.stringify(dDeger).includes(MASKE);
        farklar.push({ alan: `${sutun}.${anahtar}`, yerel: yDeger, dosya: dDeger, ...(maskeli ? { maskeli: /** @type {true} */ (true) } : {}) });
      }
      continue;
    }
    const maskeli = yerel.maskeli.has(sutun) || dosya.maskeli.has(sutun);
    farklar.push({ alan: sutun, yerel: yg ?? null, dosya: dg ?? null, ...(maskeli ? { maskeli: /** @type {true} */ (true) } : {}) });
  }
  return farklar;
}

/** @param {Satir} satir */
function zamanlariAt(satir) {
  return Object.fromEntries(Object.entries(satir).filter(([k]) => !ZAMAN_SUTUNLARI.has(k)));
}

/** @param {Buffer} a @param {Buffer} b */
function anahtarlarAyni(a, b) {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** @param {Veritabani} vt @param {string} tablo @returns {Map<string, Satir>} */
function yerelHarita(vt, tablo) {
  const pk = bilgi(tablo).birincilAnahtar;
  return new Map(vt.tumu(`SELECT * FROM ${tablo}`).map((s) => [String(s[pk]), s]));
}

/**
 * @typedef {{
 *   manifest: { bicimSurumu: number; olusturulma: string; semaSurumu: number; makine: { id: string; ad: string }; medya?: { secim?: Record<string, boolean> } };
 *   hedefAnahtar: Buffer;
 *   benimsenecekKasa: { kdf: object; dogrulayici: string; medyaAnahtari?: string } | null;
 *   tablolar: Record<string, Satir[]>;
 *   onizleme: Onizleme;
 *   medyaKlasoru: string | null;
 *   hazirlikKlasoru: string | null;
 *   kaynakMedyaAnahtari: Buffer | null;
 *   medyaDosyalari: Map<string, { yol: string | null; boyut: number }>;
 * }} Hazirlik
 * @typedef {{
 *   yedek: { olusturulma: string; makine: string | null; semaSurumu: number };
 *   yerelBos: boolean;
 *   kasaBenimsenecek: boolean;
 *   varliklar: Record<string, VarlikOnizlemesi>;
 *   eklenecekler: Record<string, { dosyada: number; yeni: number }>;
 *   medya: MedyaOnizlemesi;
 *   toplam: { yeni: number; degisen: number; yalnizBurada: number; ayni: number };
 *   projeEslemesi?: ProjeEslemesiOnizlemesi;
 * }} Onizleme
 * @typedef {ReturnType<typeof projeEslemesiBilgisi> & {
 *   uygulanan: import('./ice-aktarma-esleme.mjs').Esleme | null;
 *   ozet: ReturnType<typeof eslemeyiUygula>['ozet'] | null;
 *   kimlikDegisimleri: ReturnType<typeof eslemeyiUygula>['kimlikDegisimleri'];
 * }} ProjeEslemesiOnizlemesi
 * @typedef {{
 *   bicimSurumu: number;
 *   secim: Record<string, boolean> | null;
 *   turler: Record<string, { dosyada: number; dosyasiYedekte: number; eklenecek: number; eklenecekBayt: number; dahilDegil: number; zatenVar: number }>;
 *   toplam: { eklenecek: number; eklenecekBayt: number; dahilDegil: number };
 * }} MedyaOnizlemesi
 * @typedef {{
 *   etiket: string;
 *   yeni: Array<{ id: string; baslik: string; dosya: Satir; uygulanamaz?: string }>;
 *   degisen: Array<{ id: string; baslik: string; yerel: Satir; dosya: Satir; farklar: Array<{ alan: string; yerel: unknown; dosya: unknown; maskeli?: true }> }>;
 *   yalnizBurada: Array<{ id: string; baslik: string }>;
 *   ayniSayisi: number;
 * }} VarlikOnizlemesi
 */

/**
 * Tür başına medya önizlemesi: dosyada kaç satır var, kaçının dosyası yedekte, kaçı eklenecek
 * (satır bu makinede yok ya da var ama dosyası yok) ve ne kadar yer tutacak.
 * @param {Veritabani} vt @param {Satir[]} satirlar
 * @param {Map<string, { yol: string | null; boyut: number }>} dosyalar @param {string | null} klasor
 * @param {{ bicimSurumu: number; medya?: { secim?: Record<string, boolean> } }} manifest
 * @returns {MedyaOnizlemesi}
 */
function medyaOnizlemesi(vt, satirlar, dosyalar, klasor, manifest) {
  /** @type {MedyaOnizlemesi['turler']} */
  const turler = {};
  const toplam = { eklenecek: 0, eklenecekBayt: 0, dahilDegil: 0 };
  for (const satir of satirlar) {
    if (satir.silinme != null) continue;
    const tur = String(satir.tur);
    const t = (turler[tur] ??= { dosyada: 0, dosyasiYedekte: 0, eklenecek: 0, eklenecekBayt: 0, dahilDegil: 0, zatenVar: 0 });
    t.dosyada++;
    const dosya = dosyalar.get(String(satir.id));
    if (dosya) t.dosyasiYedekte++;
    const yerel = vt.tek('SELECT dosya FROM medya WHERE id = ?', [satir.id]);
    const yerelDosyaVar = Boolean(yerel && klasor && medyaDosyaAdiGecerliMi(yerel.dosya) && existsSync(join(klasor, String(yerel.dosya))));
    if (yerelDosyaVar) { t.zatenVar++; continue; }
    if (dosya) {
      t.eklenecek++;
      // Kullanıcıya gösterilen boyut: düz metin boyutu (dışa aktarma tahminiyle aynı ölçü).
      t.eklenecekBayt += Number.isFinite(Number(satir.boyut)) ? Number(satir.boyut) : dosya.boyut;
    } else {
      t.dahilDegil++;
    }
  }
  for (const t of Object.values(turler)) {
    toplam.eklenecek += t.eklenecek;
    toplam.eklenecekBayt += t.eklenecekBayt;
    toplam.dahilDegil += t.dahilDegil;
  }
  return { bicimSurumu: manifest.bicimSurumu, secim: manifest.medya?.secim ?? null, turler, toplam };
}

/**
 * @param {Veritabani} vt @param {Record<string, Satir[]>} tablolar @param {Buffer} anahtar
 * @param {Hazirlik['manifest']} manifest @param {boolean} kasaBenimsenecek @param {MedyaOnizlemesi} medya
 * @returns {Onizleme}
 */
function onizlemeOlustur(vt, tablolar, anahtar, manifest, kasaBenimsenecek, medya) {
  /** @type {Record<string, VarlikOnizlemesi>} */
  const varliklar = {};
  const toplam = { yeni: 0, degisen: 0, yalnizBurada: 0, ayni: 0 };
  // Yerelde okunamayan zarf (başka anahtar) olursa önizleme yine üretilsin: çözülemeyen değer maskelenir.
  const guvenliGorunum = (/** @type {string} */ tablo, /** @type {Satir} */ satir) => {
    try {
      return satirGorunumu(tablo, satir, anahtar);
    } catch {
      const maskeliSatir = Object.fromEntries(Object.entries(satir).map(([k, d]) => [k, typeof d === 'string' && d.includes('kasa:v1:') ? MASKE : d]));
      return { gorunum: maskeliSatir, karsilastirma: maskeliSatir, maskeli: new Set(Object.keys(satir)) };
    }
  };
  for (const [tablo, etiket] of Object.entries(ONIZLEME_TABLOLARI)) {
    const pk = bilgi(tablo).birincilAnahtar;
    const yerel = yerelHarita(vt, tablo);
    const dosyaIdleri = new Set();
    /** @type {VarlikOnizlemesi} */
    const v = { etiket, yeni: [], degisen: [], yalnizBurada: [], ayniSayisi: 0 };
    for (const satir of tablolar[tablo] ?? []) {
      const id = String(satir[pk]);
      dosyaIdleri.add(id);
      const d = guvenliGorunum(tablo, satir);
      const y = yerel.get(id);
      if (!y) {
        /** @type {VarlikOnizlemesi['yeni'][number]} */
        const oge = { id, baslik: baslikUret(tablo, d.gorunum, id), dosya: d.gorunum };
        if (tablo === 'ekran_modelleri'
          && vt.tek('SELECT id FROM ekran_modelleri WHERE ekran_id = ? AND surum = ?', [satir.ekran_id, satir.surum])) {
          oge.uygulanamaz = 'Bu ekranın aynı sürüm numarası bu makinede başka bir kayıtla var; uygulanırsa atlanır.';
        }
        v.yeni.push(oge);
        continue;
      }
      const yg = guvenliGorunum(tablo, y);
      const farklar = farkHesapla(yg, d);
      if (!farklar.length) {
        v.ayniSayisi++;
        continue;
      }
      v.degisen.push({ id, baslik: baslikUret(tablo, d.gorunum, id), yerel: yg.gorunum, dosya: d.gorunum, farklar });
    }
    for (const [id, y] of yerel) {
      if (!dosyaIdleri.has(id)) v.yalnizBurada.push({ id, baslik: baslikUret(tablo, guvenliGorunum(tablo, y).gorunum, id) });
    }
    toplam.yeni += v.yeni.length;
    toplam.degisen += v.degisen.length;
    toplam.yalnizBurada += v.yalnizBurada.length;
    toplam.ayni += v.ayniSayisi;
    varliklar[tablo] = v;
  }
  /** @type {Onizleme['eklenecekler']} */
  const eklenecekler = {};
  for (const tablo of EKLEME_TABLOLARI) {
    const pk = bilgi(tablo).birincilAnahtar;
    const satirlar = tablolar[tablo] ?? [];
    const yeni = satirlar.filter((s) => !vt.tek(`SELECT 1 AS var FROM ${tablo} WHERE ${pk} = ?`, [s[pk]])).length;
    eklenecekler[tablo] = { dosyada: satirlar.length, yeni };
  }
  const makineAdi = manifest.makine?.ad ?? null;
  return {
    yedek: { olusturulma: manifest.olusturulma, makine: makineAdi, semaSurumu: manifest.semaSurumu },
    yerelBos: veritabaniBosMu(vt),
    kasaBenimsenecek,
    varliklar,
    eklenecekler,
    medya,
    toplam
  };
}

/**
 * Yedeği açar ve BELLEKTE bir hazırlık alanı + önizleme üretir. Hiçbir şey YAZMAZ.
 * - vt null ise (veritabanı dosyası henüz yok) boş bir bellek veritabanıyla karşılaştırılır.
 * - Yerelde kasa varsa AÇIK olmalıdır (KASA_KILITLI); yoksa yedeğin kasası benimsenecektir.
 * - Parola yanlışsa KasaHatasi(PAROLA_YANLIS) — hiçbir şey hazırlanmaz.
 * - Yedekteki medya dosyaları medyaKlasoru içindeki bir hazırlık klasörüne (şifreli) çıkarılır;
 *   medyaKlasoru verilmez ve vt'nin dosya yolu da yoksa medya dosyaları okunup atılır.
 * @param {Veritabani | null} vt
 * @param {Buffer | string} dosya Buffer ya da dosya yolu (büyük yedekler akışla okunur)
 * @param {string} parola
 * @param {{ ilerleme?: IlerlemeFn; medyaKlasoru?: string | null }} [secenekler]
 * @returns {Promise<Hazirlik>}
 */
export async function iceAktarmaHazirla(vt, dosya, parola, secenekler = {}) {
  const ilerleme = secenekler.ilerleme ?? (() => {});
  if (vt) {
    const k = kasaDurumu(vt);
    if (k.olusturuldu && !k.acik) throw new KasaHatasi('KASA_KILITLI', 'İçe aktarma için önce bu makinedeki kasayı açın.');
  }
  const klasor = secenekler.medyaKlasoru !== undefined ? secenekler.medyaKlasoru : (vt?.yol ? medyaKlasoruBul(vt.yol) : null);
  const hazirlikKlasoru = klasor ? hazirlikKlasoruYolu(klasor) : null;
  /** @type {Awaited<ReturnType<typeof yedekAc>>} */
  let yedek;
  try {
    yedek = await yedekAc(dosya, parola, { ilerleme, hazirlikKlasoru });
  } catch (hata) {
    hazirlikKlasorunuSil(hazirlikKlasoru);
    throw hata;
  }
  /** @type {Veritabani | null} */
  let geciciVt = null;
  let basarili = false;
  try {
    let yerel = vt;
    if (!yerel) {
      geciciVt = await veritabaniAc(null);
      gocleriUygula(geciciVt);
      yerel = geciciVt;
    }
    sutunlariDogrula(yerel, yedek.tablolar);
    const kasaVar = kasaDurumu(yerel).olusturuldu;
    const hedefAnahtar = Buffer.from(kasaVar ? acikAnahtar(yerel) : yedek.kasaAnahtari);
    const ayniAnahtar = anahtarlarAyni(hedefAnahtar, yedek.kasaAnahtari);
    ilerleme('yeniden şifreleniyor', 50);
    const eskiYapanBicimi = Number(yedek.manifest.semaSurumu) < 3;
    /** @type {Record<string, Satir[]>} */
    const tablolar = {};
    for (const t of TABLOLAR) {
      tablolar[t.ad] = (yedek.tablolar[t.ad] ?? []).map((ham) => {
        /** @type {Satir} */
        let satir = ham;
        if (!ayniAnahtar) {
          satir = Object.fromEntries(Object.entries(ham).map(([k, d]) => [k,
            typeof d === 'string' ? metindekiZarflariDonustur(d, (z) => zarfSifrele(hedefAnahtar, zarfCoz(yedek.kasaAnahtari, z))) : d]));
        }
        // Eski (v1) yedekten gelen düz metin şifreli sütunlar hazırlık alanında da şifrelenir.
        satir = satirSifreliAlanlariniTamamla(t.ad, satir, hedefAnahtar);
        if (t.ad === 'degisiklik_gecmisi') {
          // Şema < 3 yedeği: "yapan" düz metin makine adı taşıyabilir → "kullanici@<makineId>".
          if (eskiYapanBicimi) satir = gecmisYapaniniNormallestir(satir);
          const tur = String(satir.varlik_turu);
          const onceki = gecmisAnligiSifrele(tur, satir.onceki_json, hedefAnahtar);
          const sonraki = gecmisAnligiSifrele(tur, satir.sonraki_json, hedefAnahtar);
          if (onceki !== satir.onceki_json || sonraki !== satir.sonraki_json) satir = { ...satir, onceki_json: onceki, sonraki_json: sonraki };
        }
        return satir;
      });
    }
    ilerleme('önizleme hazırlanıyor', 75);
    const medya = medyaOnizlemesi(yerel, tablolar.medya ?? [], yedek.medyaDosyalari, klasor, yedek.manifest);
    const onizleme = onizlemeOlustur(yerel, tablolar, hedefAnahtar, yedek.manifest, !kasaVar, medya);
    // Hedef proje / ortam eşlemesi bilgisi (öneri). Kullanıcı eşleme seçince önizleme eslemeOnizlemesi ile yeniden üretilir.
    onizleme.projeEslemesi = { ...projeEslemesiBilgisi(kasaVar ? yerel : null, tablolar, hedefAnahtar), uygulanan: null, ozet: null, kimlikDegisimleri: [] };
    ilerleme('önizleme hazır', 100);
    basarili = true;
    return {
      manifest: yedek.manifest, hedefAnahtar, benimsenecekKasa: kasaVar ? null : yedek.kasa, tablolar, onizleme,
      medyaKlasoru: klasor, hazirlikKlasoru, kaynakMedyaAnahtari: yedek.medyaAnahtari, medyaDosyalari: yedek.medyaDosyalari
    };
  } finally {
    yedek.kasaAnahtari.fill(0);
    geciciVt?.kapat();
    if (!basarili) {
      yedek.medyaAnahtari?.fill(0);
      hazirlikKlasorunuSil(hazirlikKlasoru);
    }
  }
}

/** Hazırlık alanını atar (anahtarlar sıfırlanır, hazırlık klasörü silinir). @param {Hazirlik} hazirlik */
export function hazirligiAt(hazirlik) {
  hazirlik.hedefAnahtar.fill(0);
  hazirlik.kaynakMedyaAnahtari?.fill(0);
  hazirlik.tablolar = {};
  hazirlik.medyaDosyalari = new Map();
  hazirlikKlasorunuSil(hazirlik.hazirlikKlasoru);
}

/**
 * Uygulamadan SONRA: veritabanına yazılmış medya satırlarının dosyalarını yerel depoya yerleştirir
 * (yeniden şifreleme gerekiyorsa akışla). Kasa açık olmalı.
 * @param {Veritabani} vt @param {Hazirlik} hazirlik @param {{ ilerleme?: IlerlemeFn }} [secenekler]
 */
export async function iceAktarmaMedyasiniYaz(vt, hazirlik, secenekler = {}) {
  const idler = (hazirlik.tablolar.medya ?? []).map((m) => String(m.id));
  if (!hazirlik.medyaKlasoru) {
    return { eklenen: 0, bayt: 0, zatenVardi: 0, atlanan: 0, dahilDegil: idler.length, yenidenSifrelenen: 0 };
  }
  return medyalariYerlestir(vt, {
    klasor: hazirlik.medyaKlasoru, kaynakAnahtar: hazirlik.kaynakMedyaAnahtari, dosyalar: hazirlik.medyaDosyalari, idler,
    ilerleme: secenekler.ilerleme
  });
}

/** @type {Map<string, Array<{ ust: string; sutun: string; ustSutun: string; bosOlabilir: boolean }>>} */
const yabanciAnahtarOnbellegi = new Map();
/** @param {Veritabani} vt @param {string} tablo */
function yabanciAnahtarlar(vt, tablo) {
  let liste = yabanciAnahtarOnbellegi.get(tablo);
  if (!liste) {
    const notNull = new Map(vt.tumu(`PRAGMA table_info(${tablo})`).map((s) => [String(s.name), Number(s.notnull) === 1]));
    liste = vt.tumu(`PRAGMA foreign_key_list(${tablo})`).map((s) => ({
      ust: String(s.table), sutun: String(s.from), ustSutun: String(s.to ?? 'id'), bosOlabilir: !notNull.get(String(s.from))
    }));
    yabanciAnahtarOnbellegi.set(tablo, liste);
  }
  return liste;
}

/**
 * @typedef {{ tumu?: boolean; secimler?: Record<string, readonly string[]>; esleme?: unknown }} Secim  esleme: hedef proje / ortam eşlemesi (ice-aktarma-esleme.mjs)
 * @typedef {{
 *   tamYukleme: boolean;
 *   varliklar: Record<string, { eklenen: number; uzerineYazilan: number; ayni: number; atlanan: number }>;
 *   eklenenler: Record<string, { eklenen: number; mevcut: number; atlanan: number; baglantisiKaldirilan: number }>;
 *   otomatikEklenenUstKayitlar: Array<{ tablo: string; id: string }>;
 *   atlananlar: Array<{ tablo: string; id: string; neden: string }>;
 *   gecmiseYazilan: number;
 *   sayimlar: Record<string, number>;
 *   medya?: import('./yedek.mjs').MedyaYerlestirmeSonucu;
 *   medyaHatasi?: string;
 *   projeEslemesi?: { ozet: ReturnType<typeof eslemeyiUygula>['ozet']; kimlikDegisimleri: ReturnType<typeof eslemeyiUygula>['kimlikDegisimleri'] };
 *   kalintilar?: Record<string, Record<string, number>>;
 *   kalintiTasinan?: number;
 * }} UygulamaSonucu
 */

/**
 * Seçilen kayıtları tek transaction'da uygular. Hata = hiçbir şey yazılmaz.
 * @param {Veritabani} vt
 * @param {Hazirlik} hazirlik
 * @param {Secim} secim  tumu: dosyadaki tüm kayıtlar; secimler: { tablo: [id, ...] }
 * @param {{ yapan?: string }} [secenekler]
 * @returns {UygulamaSonucu}
 */
export function iceAktarmaUygula(vt, hazirlik, secim, secenekler = {}) {
  if (!hazirlik.tablolar || !Object.keys(hazirlik.tablolar).length) {
    throw new YedekHatasi('BULUNAMADI', 'Hazırlık alanı atılmış; içe aktarmayı yeniden başlatın.');
  }
  const { hedefAnahtar } = hazirlik;
  // Kasa önizlemeden sonra değişmemiş olmalı (zarflar hedef anahtarla hazırlandı).
  if (hazirlik.benimsenecekKasa) {
    if (kasaDurumu(vt).olusturuldu) {
      throw new YedekHatasi('DEGISTI', 'Önizlemeden sonra bu makinede kasa oluşturulmuş; içe aktarmayı yeniden başlatın.');
    }
  } else if (!anahtarlarAyni(acikAnahtar(vt), hedefAnahtar)) {
    throw new YedekHatasi('DEGISTI', 'Kasa parolası önizlemeden sonra değişmiş; içe aktarmayı yeniden başlatın.');
  }
  // Hedef proje / ortam eşlemesi verildiyse kayıtlar eşlenmiş kopyadan yazılır (önizlemeyle aynı kararlı kimlikler).
  // Verilmezse bugünkü davranış: kayıtlar yedekteki kimlikleriyle yazılır.
  const eslenmis = secim.esleme != null ? eslemeyiUygula(vt, hazirlik.tablolar, hedefAnahtar, secim.esleme) : null;
  const tablolar = eslenmis ? eslenmis.tablolar : hazirlik.tablolar;
  const eslemeSonucu = eslenmis ? { projeEslemesi: { ozet: eslenmis.ozet, kimlikDegisimleri: eslenmis.kimlikDegisimleri } } : {};
  // Kimliği değişen yedek projeleri: bu kimlikle HİÇBİR kayıt yazılmamalı / proje kaydı oluşmamalı (uygulama sonu denetimi).
  const kaynakProjeler = new Set(eslenmis?.kaynakProjeler ?? []);
  // Mevcut projeye aktarılan ama bu bilgisayarda proje kaydı olmayan kaynaklar: onlara bağlı öksüz kayıtlar hedefe taşınabilir.
  const kalintiProjeler = new Set(eslenmis?.kalintiProjeler ?? []);
  const kaynakAdi = (/** @type {string} */ p) => eslenmis?.ozet.find((o) => o.kaynak.id === p)?.kaynak.ad ?? p;

  // --- seçim kümesi ---
  /** @type {Map<string, Set<string>>} */
  const secilen = new Map(Object.keys(ONIZLEME_TABLOLARI).map((t) => [t, new Set()]));
  /** @type {Map<string, Map<string, Satir>>} */
  const dosyaHaritasi = new Map(Object.keys(ONIZLEME_TABLOLARI).map((t) => {
    const pk = bilgi(t).birincilAnahtar;
    return [t, new Map((tablolar[t] ?? []).map((s) => [String(s[pk]), s]))];
  }));
  if (secim.tumu) {
    for (const [t, harita] of dosyaHaritasi) for (const id of harita.keys()) secilen.get(t)?.add(id);
  } else {
    if (typeof secim.secimler !== 'object' || secim.secimler === null) {
      throw new YedekHatasi('VERI', 'Seçim gönderilmedi: "secimler" ({ tablo: [kimlik, ...] }) veya "tumu": true bekleniyor.');
    }
    for (const [t, idler] of Object.entries(secim.secimler)) {
      const harita = dosyaHaritasi.get(t);
      if (!harita) throw new YedekHatasi('VERI', `Seçimde bilinmeyen varlık türü: "${t}".`);
      if (!Array.isArray(idler)) throw new YedekHatasi('VERI', `"${t}" seçimi bir kimlik dizisi olmalıdır.`);
      for (const id of idler) {
        if (typeof id !== 'string' || !harita.has(id)) throw new YedekHatasi('VERI', `"${t}" içinde dosyada olmayan kimlik seçildi.`);
        secilen.get(t)?.add(id);
      }
    }
  }

  // --- gerekli üst kayıtları otomatik ekle (yerelde yoksa ve dosyada varsa) ---
  /** @type {Array<{ tablo: string; id: string }>} */
  const otomatik = [];
  let degisti = true;
  while (degisti) {
    degisti = false;
    for (const [t, idler] of secilen) {
      for (const id of [...idler]) {
        const satir = /** @type {Satir} */ (dosyaHaritasi.get(t)?.get(id));
        for (const fk of yabanciAnahtarlar(vt, t)) {
          const deger = satir[fk.sutun];
          if (deger === null || deger === undefined) continue;
          const ustSecim = secilen.get(fk.ust);
          const ustDosya = dosyaHaritasi.get(fk.ust);
          if (fk.ust === 'projeler' && kaynakProjeler.has(String(deger))) {
            throw new YedekHatasi('VERI', `"${kaynakAdi(String(deger))}" projesi başka projeye aktarılıyor ama bir kayıt (${t}) hâlâ ona başvuruyor; proje yeniden oluşturulmadı, hiçbir şey yazılmadı.`);
          }
          if (!ustSecim || !ustDosya || ustSecim.has(String(deger))) continue;
          if (vt.tek(`SELECT 1 AS var FROM ${fk.ust} WHERE ${fk.ustSutun} = ?`, [deger])) continue;
          if (!ustDosya.has(String(deger))) continue;
          ustSecim.add(String(deger));
          otomatik.push({ tablo: fk.ust, id: String(deger) });
          degisti = true;
        }
      }
    }
  }

  const tumuSecili = [...secilen].every(([t, idler]) => idler.size === (dosyaHaritasi.get(t)?.size ?? 0));
  const sutunlar = sutunlariDogrula(vt, tablolar);

  // --- hızlı yol: boş veritabanı + tümü seçili = tam yükleme (kasa dahil) ---
  if (hazirlik.benimsenecekKasa && veritabaniBosMu(vt) && tumuSecili) {
    tamYukleYaz(vt, tablolar, hazirlik.benimsenecekKasa, hedefAnahtar);
    /** @type {UygulamaSonucu['varliklar']} */
    const varliklar = {};
    for (const t of Object.keys(ONIZLEME_TABLOLARI)) varliklar[t] = { eklenen: tablolar[t]?.length ?? 0, uzerineYazilan: 0, ayni: 0, atlanan: 0 };
    /** @type {UygulamaSonucu['eklenenler']} */
    const eklenenler = {};
    for (const t of EKLEME_TABLOLARI) eklenenler[t] = { eklenen: tablolar[t]?.length ?? 0, mevcut: 0, atlanan: 0, baglantisiKaldirilan: 0 };
    return { tamYukleme: true, varliklar, eklenenler, otomatikEklenenUstKayitlar: otomatik, atlananlar: [], gecmiseYazilan: 0, sayimlar: sayimlar(vt), ...eslemeSonucu };
  }

  /** @type {UygulamaSonucu['varliklar']} */
  const varliklar = {};
  /** @type {UygulamaSonucu['eklenenler']} */
  const eklenenler = {};
  /** @type {UygulamaSonucu['atlananlar']} */
  const atlananlar = [];
  let gecmiseYazilan = 0;
  // Seçmeli içe aktarma izinleri yalnız Ayarlar'daki "izinler" kaydı eklenir / üzerine yazılırsa değiştirir (uyarı o zaman).
  let izinlerYazildi = false;
  const izinKaydiMi = (/** @type {string} */ tablo, /** @type {string} */ id) => tablo === 'ayarlar' && id === IZIN_AYAR_ANAHTARI;
  const yapan = secenekler.yapan ?? `ice-aktarma:${hazirlik.manifest.makine?.id ?? 'bilinmeyen'}`;

  /**
   * Yerelde olmayan üst kayda işaret eden yabancı anahtarları düzeltir.
   * @param {string} t @param {Satir} satir
   * @returns {{ satir: Satir; atla: string | null; kaldirilan: number }}
   */
  const ustKayitlariDuzelt = (t, satir) => {
    let sonuc = satir;
    let kaldirilan = 0;
    for (const fk of yabanciAnahtarlar(vt, t)) {
      const deger = sonuc[fk.sutun];
      if (deger === null || deger === undefined) continue;
      if (vt.tek(`SELECT 1 AS var FROM ${fk.ust} WHERE ${fk.ustSutun} = ?`, [deger])) continue;
      if (!fk.bosOlabilir) return { satir: sonuc, atla: `Bağlı "${fk.ust}" kaydı bu makinede yok.`, kaldirilan };
      sonuc = { ...sonuc, [fk.sutun]: null };
      kaldirilan++;
    }
    return { satir: sonuc, atla: null, kaldirilan };
  };

  let kalintiTasinan = 0;
  vt.islem(() => {
    /** @type {Map<string, Record<string, number>>} kaynak proje → uygulamadan önceki bağlı kayıtlar (kalıntılar) */
    const onceki = new Map([...kaynakProjeler].map((p) => [p, projeKalintilari(vt, p)]));
    if (hazirlik.benimsenecekKasa) {
      medyaAnahtariniBenimse(vt, hazirlik.benimsenecekKasa.medyaAnahtari, [hedefAnahtar]);
      vt.metaYaz('kasa_surum', '1');
      vt.metaYaz('kasa_kdf', JSON.stringify(hazirlik.benimsenecekKasa.kdf));
      vt.metaYaz('kasa_dogrulayici', hazirlik.benimsenecekKasa.dogrulayici);
    }
    for (const t of TABLOLAR) {
      const tSutun = /** @type {string[]} */ (sutunlar.get(t.ad));
      const pk = t.birincilAnahtar;
      if (t.ad in ONIZLEME_TABLOLARI) {
        const o = (varliklar[t.ad] = { eklenen: 0, uzerineYazilan: 0, ayni: 0, atlanan: 0 });
        const idler = /** @type {Set<string>} */ (secilen.get(t.ad));
        for (const gelenHam of tablolar[t.ad] ?? []) {
          const id = String(gelenHam[pk]);
          if (!idler.has(id)) continue;
          const yerel = vt.tek(`SELECT * FROM ${t.ad} WHERE ${pk} = ?`, [id]);
          const { satir: gelen, atla } = ustKayitlariDuzelt(t.ad, gelenHam);
          if (atla) {
            o.atlanan++;
            atlananlar.push({ tablo: t.ad, id, neden: atla });
            continue;
          }
          if (!yerel) {
            if (t.ad === 'ekran_modelleri'
              && vt.tek('SELECT id FROM ekran_modelleri WHERE ekran_id = ? AND surum = ?', [gelen.ekran_id, gelen.surum])) {
              o.atlanan++;
              atlananlar.push({ tablo: t.ad, id, neden: 'Aynı ekranın aynı sürüm numarası bu makinede başka bir kayıtla var.' });
              continue;
            }
            satirEkle(vt, t.ad, gelen, tSutun);
            o.eklenen++;
            if (izinKaydiMi(t.ad, id)) izinlerYazildi = true;
            continue;
          }
          const yerelK = satirGorunumu(t.ad, zamanlariAt(yerel), hedefAnahtar);
          const gelenK = satirGorunumu(t.ad, zamanlariAt(gelen), hedefAnahtar);
          if (!farkHesapla(yerelK, gelenK).length) {
            o.ayni++;
            continue;
          }
          const guncel = tSutun.filter((s) => s in gelen && s !== pk);
          vt.calistir(
            `UPDATE ${t.ad} SET ${guncel.map((s) => `${s} = ?`).join(', ')} WHERE ${pk} = ?`,
            [...guncel.map((s) => gelen[s]), id]
          );
          gecmisYaz(vt, {
            varlikTuru: t.gecmisTuru ?? t.ad, varlikId: id, islem: 'ice_aktarma_uzerine_yazildi', yapan,
            onceki: yerel, sonraki: vt.tek(`SELECT * FROM ${t.ad} WHERE ${pk} = ?`, [id]),
            aciklama: 'Yedekten içe aktarmada seçilen dosya sürümü yerel sürümün üzerine yazıldı; yerel sürüm bu kayıtta saklıdır.'
          });
          gecmiseYazilan++;
          o.uzerineYazilan++;
          if (izinKaydiMi(t.ad, id)) izinlerYazildi = true;
        }
      } else {
        const o = (eklenenler[t.ad] = { eklenen: 0, mevcut: 0, atlanan: 0, baglantisiKaldirilan: 0 });
        for (const gelenHam of tablolar[t.ad] ?? []) {
          const id = String(gelenHam[pk]);
          const mevcut = vt.tek(`SELECT * FROM ${t.ad} WHERE ${pk} = ?`, [id]);
          if (mevcut) {
            // Silinmiş kaynak projeden kalan öksüz kayıt (ör. servis koşusu) → eşlenmiş sürümüyle hedef projeye taşınır.
            if (mevcut.proje_id != null && kalintiProjeler.has(String(mevcut.proje_id)) && gelenHam.proje_id !== mevcut.proje_id) {
              const { satir, atla } = ustKayitlariDuzelt(t.ad, gelenHam);
              if (!atla) {
                const guncel = tSutun.filter((s) => s in satir && s !== pk);
                vt.calistir(`UPDATE ${t.ad} SET ${guncel.map((s) => `${s} = ?`).join(', ')} WHERE ${pk} = ?`, [...guncel.map((s) => satir[s]), id]);
                kalintiTasinan++;
              }
            }
            o.mevcut++;
            continue;
          }
          // Sonucu bu makinede olmayan (içe aktarılmayan) medya eklenmez; dosyası da yazılmaz.
          if (t.ad === 'medya' && gelenHam.sonuc_id != null
            && !vt.tek('SELECT 1 AS var FROM kosu_sonuclari WHERE id = ?', [gelenHam.sonuc_id])) {
            o.atlanan++;
            continue;
          }
          const { satir, atla, kaldirilan } = ustKayitlariDuzelt(t.ad, gelenHam);
          if (atla) {
            o.atlanan++;
            continue;
          }
          satirEkle(vt, t.ad, satir, tSutun);
          o.eklenen++;
          o.baglantisiKaldirilan += kaldirilan;
        }
      }
    }
    // DENETİM (aynı transaction): kimliği değişen yedek projesinin kimliğiyle yeni kayıt yazılmadı, proje kaydı oluşmadı.
    // Aksi halde her şey geri alınır (hata transaction'ı ROLLBACK eder).
    for (const [p, once] of onceki) {
      const sonra = projeKalintilari(vt, p);
      const artan = Object.entries(sonra).filter(([tablo, n]) => n > (once[tablo] ?? 0));
      if (artan.length) {
        throw new YedekHatasi('VERI', `İçe aktarma geri alındı: "${kaynakAdi(p)}" projesi başka projeye aktarılırken kimliği şu kayıtlarda kaldı — ${artan.map(([tablo, n]) => `${tablo}: ${n - (once[tablo] ?? 0)}`).join(', ')}. Hiçbir şey yazılmadı.`);
      }
    }
  });
  /** @type {Record<string, Record<string, number>>} uygulamadan sonra hâlâ kalan (önceden var olan) kalıntılar */
  const kalintilar = {};
  for (const p of kalintiProjeler) {
    const k = projeKalintilari(vt, p);
    if (Object.keys(k).length) kalintilar[p] = k;
  }
  if (hazirlik.benimsenecekKasa) kasayiAnahtarlaAc(vt, hedefAnahtar);
  else sifreliAlanlariTamamla(vt);
  yerelMakine(vt);
  if (izinlerYazildi) yedekUyarisiniKur(vt, { tur: 'secmeli' });
  return {
    tamYukleme: false, varliklar, eklenenler, otomatikEklenenUstKayitlar: otomatik, atlananlar, gecmiseYazilan, sayimlar: sayimlar(vt), ...eslemeSonucu,
    ...(eslenmis ? { kalintilar, kalintiTasinan } : {})
  };
}

/**
 * Hedef proje / ortam eşlemesiyle önizlemeyi yeniden üretir (hiçbir şey YAZMAZ). esleme null ise hazırlıktaki (eşlemesiz)
 * önizleme döner. Hatalı eşleme → YedekHatasi('VERI').
 * @param {Veritabani | null} vt @param {Hazirlik} hazirlik @param {unknown} esleme
 * @returns {Promise<Onizleme>}
 */
export async function eslemeOnizlemesi(vt, hazirlik, esleme) {
  if (!hazirlik.tablolar || !Object.keys(hazirlik.tablolar).length) {
    throw new YedekHatasi('BULUNAMADI', 'Hazırlık alanı atılmış; içe aktarmayı yeniden başlatın.');
  }
  const temel = hazirlik.onizleme;
  if (esleme == null) return temel;
  /** @type {Veritabani | null} */
  let geciciVt = null;
  let yerel = vt;
  if (!yerel) {
    geciciVt = await veritabaniAc(null);
    gocleriUygula(geciciVt);
    yerel = geciciVt;
  }
  try {
    const kasaVar = kasaDurumu(yerel).olusturuldu;
    if (kasaVar && !anahtarlarAyni(acikAnahtar(yerel), hazirlik.hedefAnahtar)) {
      throw new YedekHatasi('DEGISTI', 'Kasa önizlemeden sonra değişmiş; içe aktarmayı yeniden başlatın.');
    }
    const e = eslemeyiUygula(kasaVar ? yerel : null, hazirlik.tablolar, hazirlik.hedefAnahtar, esleme);
    const o = onizlemeOlustur(yerel, e.tablolar, hazirlik.hedefAnahtar, hazirlik.manifest, temel.kasaBenimsenecek, temel.medya);
    o.projeEslemesi = {
      ...(temel.projeEslemesi ?? projeEslemesiBilgisi(kasaVar ? yerel : null, hazirlik.tablolar, hazirlik.hedefAnahtar)),
      uygulanan: e.esleme, ozet: e.ozet, kimlikDegisimleri: e.kimlikDegisimleri
    };
    return o;
  } finally {
    geciciVt?.kapat();
  }
}

// ---------------------------------------------------------------------------------------
// İş yöneticisi (sunucu ve testler): hazırlık alanlarını bellekte tutar, 1 saat sonra atar.
// ---------------------------------------------------------------------------------------

/**
 * @typedef {'hazirlaniyor' | 'hazir' | 'uygulaniyor' | 'uygulandi' | 'hata' | 'iptal'} IsDurumu
 * @typedef {{
 *   id: string; durum: IsDurumu; asama: string; yuzde: number; mesaj: string | null; kod: string | null;
 *   bekleSaniye: number | null; baslangic: number; sonKullanma: number;
 *   onizleme: Onizleme | null; sonuc: UygulamaSonucu | null;
 * }} IsGorunumu
 */

export class IceAktarmaYoneticisi {
  /**
   * @param {{
   *   veritabani: (olustur: boolean) => Promise<Veritabani | null>;
   *   medyaKlasoru?: () => string | null;
   *   denemeSiniri?: import('./kasa.mjs').ParolaDenemeSiniri;
   *   saklamaMs?: number;
   *   simdi?: () => number;
   * }} secenekler
   */
  constructor(secenekler) {
    this.veritabani = secenekler.veritabani;
    this.medyaKlasoru = secenekler.medyaKlasoru ?? null;
    this.denemeSiniri = secenekler.denemeSiniri ?? null;
    this.saklamaMs = secenekler.saklamaMs ?? HAZIRLIK_SAKLAMA_MS;
    this.simdi = secenekler.simdi ?? (() => Date.now());
    /** @type {Map<string, { gorunum: IsGorunumu; hazirlik: Hazirlik | null; soz: Promise<void> }>} */
    this.isler = new Map();
  }

  /** Süresi dolan işleri ve hazırlık alanlarını atar. */
  temizle() {
    const simdi = this.simdi();
    for (const [id, is] of this.isler) {
      if (is.gorunum.durum === 'hazirlaniyor' || is.gorunum.durum === 'uygulaniyor') continue;
      if (is.gorunum.sonKullanma <= simdi) {
        if (is.hazirlik) hazirligiAt(is.hazirlik);
        this.isler.delete(id);
      }
    }
  }

  /** @returns {string | null} sürmekte olan (hazırlanan/uygulanan) iş */
  aktifIs() {
    for (const is of this.isler.values()) {
      if (is.gorunum.durum === 'hazirlaniyor' || is.gorunum.durum === 'uygulaniyor') return is.gorunum.id;
    }
    return null;
  }

  /**
   * Yüklenen dosya için hazırlığı başlatır (arka planda). Kaba kuvvet beklemesi sürüyorsa
   * COK_DENEME; başka iş sürüyorsa MESGUL. Bekleyen (hazır) eski önizlemeler atılır.
   * dosya bir yol ve geciciDosya: true ise hazırlık bitince (başarılı/başarısız) dosya silinir.
   * @param {Buffer | string} dosya @param {string} parola @param {{ geciciDosya?: boolean }} [secenekler]
   * @returns {string} iş kimliği
   */
  baslat(dosya, parola, secenekler = {}) {
    const geciciSil = () => {
      if (secenekler.geciciDosya && typeof dosya === 'string') {
        try { unlinkSync(dosya); } catch { /* zaten yok */ }
      }
    };
    this.temizle();
    try {
      this.denemeSiniri?.kontrolEt();
      if (this.aktifIs()) throw new YedekHatasi('MESGUL', 'Başka bir içe aktarma sürüyor; bitmesini bekleyin.');
    } catch (hata) {
      geciciSil();
      throw hata;
    }
    for (const [eskiId, is] of this.isler) if (is.gorunum.durum === 'hazir') this.iptal(eskiId);
    const id = randomBytes(8).toString('hex');
    const baslangic = this.simdi();
    /** @type {IsGorunumu} */
    const gorunum = {
      id, durum: 'hazirlaniyor', asama: 'sırada', yuzde: 0, mesaj: null, kod: null, bekleSaniye: null,
      baslangic, sonKullanma: baslangic + this.saklamaMs, onizleme: null, sonuc: null
    };
    const kayit = { gorunum, hazirlik: /** @type {Hazirlik | null} */ (null), soz: Promise.resolve() };
    this.isler.set(id, kayit);
    kayit.soz = (async () => {
      try {
        const vt = await this.veritabani(false);
        const hazirlik = await iceAktarmaHazirla(vt, dosya, parola, {
          ilerleme: (asama, yuzde) => { gorunum.asama = asama; gorunum.yuzde = yuzde; },
          ...(this.medyaKlasoru ? { medyaKlasoru: this.medyaKlasoru() } : {})
        });
        this.denemeSiniri?.basarili();
        if (gorunum.durum === 'iptal') {
          hazirligiAt(hazirlik);
          return;
        }
        kayit.hazirlik = hazirlik;
        gorunum.onizleme = hazirlik.onizleme;
        gorunum.durum = 'hazir';
        gorunum.asama = 'önizleme hazır';
        gorunum.yuzde = 100;
        gorunum.sonKullanma = this.simdi() + this.saklamaMs;
      } catch (hata) {
        if (hata instanceof KasaHatasi && hata.kod === 'PAROLA_YANLIS') this.denemeSiniri?.basarisiz();
        this.hataYaz(gorunum, hata);
      } finally {
        geciciSil();
      }
    })();
    return id;
  }

  /** @param {IsGorunumu} gorunum @param {unknown} hata */
  hataYaz(gorunum, hata) {
    gorunum.durum = 'hata';
    if (hata instanceof KasaHatasi || hata instanceof YedekHatasi) {
      gorunum.kod = hata.kod;
      gorunum.mesaj = hata.message;
    } else {
      gorunum.kod = 'SUNUCU';
      gorunum.mesaj = `Beklenmeyen hata: ${/** @type {Error} */ (hata)?.message ?? String(hata)}`;
    }
  }

  /** Testler için: hazırlığın bitmesini bekler. @param {string} id */
  async bekle(id) {
    await this.isler.get(id)?.soz;
    return this.durum(id);
  }

  /** @param {string} id @returns {IsGorunumu | undefined} */
  durum(id) {
    this.temizle();
    const is = this.isler.get(id);
    return is ? { ...is.gorunum } : undefined;
  }

  /**
   * @param {string} id @param {Secim} secim @param {{ yapan?: string }} [secenekler]
   * @returns {Promise<UygulamaSonucu>}
   */
  async uygula(id, secim, secenekler = {}) {
    this.temizle();
    const is = this.isler.get(id);
    if (!is) throw new YedekHatasi('BULUNAMADI', 'İçe aktarma bulunamadı (süresi dolmuş veya iptal edilmiş olabilir).');
    if (is.gorunum.durum !== 'hazir' || !is.hazirlik) {
      throw new YedekHatasi('DEGISTI', `İçe aktarma uygulanabilir durumda değil (durum: ${is.gorunum.durum}).`);
    }
    is.gorunum.durum = 'uygulaniyor';
    is.gorunum.asama = 'uygulanıyor';
    try {
      const vt = /** @type {Veritabani} */ (await this.veritabani(true));
      const hazirlik = is.hazirlik;
      const sonuc = iceAktarmaUygula(vt, hazirlik, secim, secenekler);
      // Satırlar yazıldı (geri alınamaz): medya hatası artık önizlemeye döndürmez, sonuçta raporlanır
      // (dosyası yazılamayan medya "dosya yok" olarak kalır; aynı yedek yeniden içe aktarılarak tamamlanabilir).
      is.gorunum.asama = 'medya yazılıyor';
      try {
        sonuc.medya = await iceAktarmaMedyasiniYaz(vt, hazirlik, {
          ilerleme: (asama, yuzde) => { is.gorunum.asama = asama; is.gorunum.yuzde = yuzde; }
        });
      } catch (hata) {
        sonuc.medyaHatasi = `Veriler içe aktarıldı ancak medya dosyaları yazılamadı: ${/** @type {Error} */ (hata)?.message ?? String(hata)}`;
      }
      is.gorunum.durum = 'uygulandi';
      is.gorunum.asama = 'tamamlandı';
      is.gorunum.sonuc = sonuc;
      is.gorunum.onizleme = null;
      hazirligiAt(is.hazirlik);
      is.hazirlik = null;
      return sonuc;
    } catch (hata) {
      // Seçim hatası / kasa kilitli gibi durumlarda önizleme korunur (düzeltip tekrar denenebilir).
      is.gorunum.durum = 'hazir';
      is.gorunum.asama = 'önizleme hazır';
      throw hata;
    }
  }

  /**
   * Hedef proje / ortam eşlemesiyle önizlemeyi yeniler (hiçbir şey yazmaz); iş görünümündeki önizleme de değişir.
   * @param {string} id @param {unknown} esleme @returns {Promise<Onizleme>}
   */
  async esleme(id, esleme) {
    this.temizle();
    const is = this.isler.get(id);
    if (!is) throw new YedekHatasi('BULUNAMADI', 'İçe aktarma bulunamadı (süresi dolmuş veya iptal edilmiş olabilir).');
    if (is.gorunum.durum !== 'hazir' || !is.hazirlik) {
      throw new YedekHatasi('DEGISTI', `İçe aktarma önizlenebilir durumda değil (durum: ${is.gorunum.durum}).`);
    }
    const onizleme = await eslemeOnizlemesi(await this.veritabani(false), is.hazirlik, esleme);
    is.gorunum.onizleme = onizleme;
    return onizleme;
  }

  /** @param {string} id @returns {boolean} */
  iptal(id) {
    const is = this.isler.get(id);
    if (!is || is.gorunum.durum === 'uygulaniyor' || is.gorunum.durum === 'uygulandi') return false;
    if (is.hazirlik) hazirligiAt(is.hazirlik);
    is.hazirlik = null;
    is.gorunum.durum = 'iptal';
    is.gorunum.onizleme = null;
    is.gorunum.asama = 'iptal edildi';
    return true;
  }

  /** Tüm hazırlık alanlarını atar (sunucu kapanırken). */
  hepsiniAt() {
    for (const is of this.isler.values()) if (is.hazirlik) hazirligiAt(is.hazirlik);
    this.isler.clear();
  }
}
