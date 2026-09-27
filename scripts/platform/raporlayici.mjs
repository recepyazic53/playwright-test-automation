// PLATFORM PLAYWRIGHT RAPORLAYICISI (genel) — koşu sonuçlarını DOĞRUDAN platform veritabanına,
// ekran görüntüsü/video/iz dosyalarını ŞİFRELİ medya deposuna (medya.mjs) yazar.
// playwright.config.ts: reporter: [['./tests/support/platform-raporlayici.ts', { projeId: '<id>', ortamId: '<id>' }]]
//
// Etkinlik: platform veritabanı var VE proje veritabanında ise etkindir; aksi halde HİÇBİR ŞEY yapmaz. "--list" koşularında da hiçbir şey yazmaz
// (koşu kaydı ilk test sonucu geldiğinde oluşturulur).
//
// Yazma yolu (veritabanı dosyasının TEK sahibi kuralı — bkz. veritabani/baglanti.mjs):
//   1) Sunucu bu koşuyu başlattıysa (PLATFORM_SONUC_ADRESI + PLATFORM_SONUC_TOKENI) ya da aynı
//      veritabanını kullanan bir Nöbetçi sunucusu çalışıyorsa (veritabanının yanındaki
//      .sunucu-baglantisi.json — bkz. sunucu-baglantisi.mjs) sonuçlar sunucuya gönderilir
//      (/platform/sonuc/*); sunucu yazar.
//   2) Aksi halde veritabanı dosyası bu süreçte açılıp doğrudan yazılır.
// Medya dosyalarını her iki durumda da bu süreç şifreler ve medya klasörüne yazar.
//
// Kasa anahtarı: PLATFORM_KASA_ANAHTARI (Nöbetçi koşularında sunucu verir). Anahtar yoksa sonuçlar yine yazılır ama medya
// ŞİFRELENEMEDİĞİ için kayda alınmaz ve düz metin dosyalara dokunulmaz (açık uyarı yazılır).
//
// Düz metin silme: şifrelenen her ek dosyası, YALNIZCA bu koşunun çıktı klasörü (projelerin
// outputDir'i) içindeyse ve bu koşu başladıktan sonra oluşturulduysa silinir; boşalan test
// klasörleri de kaldırılır. Daha eski dosyalara ve çıktı klasörü dışındaki dosyalara dokunulmaz.
// stdout'a HİÇ yazılmaz (--list --reporter=json çıktısı bozulmasın); uyarılar stderr'e gider.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { veritabaniAc, veritabaniYolu } from './veritabani/baglanti.mjs';
import { sunucuBaglantisiniOku } from './sunucu-baglantisi.mjs';
import { gocleriUygula } from './veritabani/gocler.mjs';
import { veritabaniniHazirla } from './veritabani/depo.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from './veritabani/sonuc-deposu.mjs';
import { MEDYA_ANAHTARI_META, medyaAnahtariniAc, yeniMedyaAnahtari } from './kasa.mjs';
import { medyaDosyasiniSil, medyaKlasoru, medyaSaklamaTemizligi, medyaSifrele } from './medya.mjs';
import { adimGurultuMu, ansiTemizle, playwrightDurumuEsle } from './sonuclar/siniflandirma.mjs';
import { yakalananMesajlariAyristir } from './sonuclar/yakalanan-mesajlar.mjs';

const KIMLIK = /^[A-Za-z0-9_-]{1,100}$/;
const VARSAYILAN_VIDEO_SAKLAMA_GUN = 30;

/** @param {string} mesaj */
function uyar(mesaj) {
  process.stderr.write(`[platform-raporlayici] ${mesaj}\n`);
}

/** Saklama süresi (gün): VIDEO_SAKLAMA_GUN, yoksa 30. */
export function videoSaklamaGunu() {
  const d = Number(process.env.VIDEO_SAKLAMA_GUN);
  return Number.isFinite(d) && d > 0 ? d : VARSAYILAN_VIDEO_SAKLAMA_GUN;
}

/** Ek türü → medya türü. @param {{ name: string; contentType: string }} ek */
export function medyaTuru(ek) {
  const tur = (ek.contentType || '').toLowerCase();
  if (tur.startsWith('image/')) return 'ekran_goruntusu';
  if (tur.startsWith('video/')) return 'video';
  if (ek.name === 'trace' || tur === 'application/zip' || tur.includes('trace')) return 'iz';
  return 'diger';
}

/**
 * "atlananAlanlar" annotation/ek içeriği → [{ alan, neden? }]. JSON dizisi (metin ya da
 * { alan, neden } nesneleri) veya satır/virgülle ayrılmış metin kabul edilir.
 * @param {string} metin
 */
export function atlananAlanlariAyristir(metin) {
  const temiz = String(metin ?? '').trim();
  if (!temiz) return [];
  try {
    const veri = JSON.parse(temiz);
    const liste = Array.isArray(veri) ? veri : [veri];
    return liste.flatMap((x) => {
      if (typeof x === 'string' && x.trim()) return [{ alan: x.trim() }];
      if (x && typeof x === 'object' && typeof x.alan === 'string') return [{ alan: x.alan, ...(typeof x.neden === 'string' ? { neden: x.neden } : {}) }];
      return [];
    });
  } catch {
    return temiz.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean).map((alan) => ({ alan }));
  }
}

// ---------------------------------------------------------------------------------------
// Yazıcılar
// ---------------------------------------------------------------------------------------

/** Sunucu üzerinden yazma (veritabanının sahibi sunucudur). */
class SunucuYazici {
  /**
   * @param {string} adres @param {string} token
   * @param {string} [veritabaniYolu] koşunun veritabanı: sunucu başka bir çalışma alanı açmışsa yazmayı reddeder
   */
  constructor(adres, token, veritabaniYolu) {
    this.adres = adres.replace(/\/+$/, '');
    this.token = token;
    this.veritabaniYolu = veritabaniYolu;
  }

  /** @param {string} yol @param {Record<string, unknown>} govde @param {number} [zamanAsimi] */
  async istek(yol, govde, zamanAsimi = 60_000) {
    const yanit = await fetch(`${this.adres}${yol}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-Sunucu-Token': this.token },
      body: JSON.stringify({ ...govde, token: this.token, ...(this.veritabaniYolu ? { veritabaniYolu: this.veritabaniYolu } : {}) }),
      signal: AbortSignal.timeout(zamanAsimi)
    });
    const veri = /** @type {Record<string, unknown>} */ (await yanit.json().catch(() => ({})));
    if (!yanit.ok || veri.basarili === false) throw new Error(`sunucu ${yanit.status}: ${String(veri.mesaj ?? 'bilinmeyen hata')}`);
    return veri;
  }

  /** @param {{ projeId: string | null; ortamId: string | null }} secim @param {number} [zamanAsimi] */
  durum(secim, zamanAsimi) {
    return this.istek('/platform/sonuc/durum', secim, zamanAsimi);
  }

  /** @param {string} zarf */
  async medyaZarfiniKaydet(zarf) {
    return String((await this.istek('/platform/sonuc/medya-anahtari', { zarf })).zarf);
  }

  /** @param {Parameters<typeof kosuKaydet>[1]} kosu */
  async kosuKaydet(kosu) {
    await this.istek('/platform/sonuc/kosu', { kosu });
  }

  /** @param {import('./veritabani/sonuc-deposu.mjs').SonucGirdisi} sonuc */
  async sonucKaydet(sonuc) {
    await this.istek('/platform/sonuc/kaydet', { sonuc });
  }

  /** @param {string} kosuId @param {{ durum: string; bitis?: string }} girdi */
  async kosuyuBitir(kosuId, girdi) {
    await this.istek('/platform/sonuc/bitir', { kosuId, ...girdi });
  }

  async kapat() {}
}

/** Doğrudan veritabanı dosyasına yazma (sunucu yokken; bu süreç dosyanın tek sahibidir). */
class DogrudanYazici {
  /** @param {import('./veritabani/baglanti.mjs').Veritabani} vt @param {string} klasor */
  constructor(vt, klasor) {
    this.vt = vt;
    this.klasor = klasor;
  }

  /** @param {string} zarf */
  async medyaZarfiniKaydet(zarf) {
    const mevcut = this.vt.metaOku(MEDYA_ANAHTARI_META);
    if (mevcut) return mevcut;
    this.vt.islem(() => this.vt.metaYaz(MEDYA_ANAHTARI_META, zarf));
    return zarf;
  }

  /** @param {Parameters<typeof kosuKaydet>[1]} kosu */
  async kosuKaydet(kosu) {
    kosuKaydet(this.vt, kosu);
  }

  /** @param {import('./veritabani/sonuc-deposu.mjs').SonucGirdisi} sonuc */
  async sonucKaydet(sonuc) {
    const { silinecekMedyaDosyalari } = sonucKaydet(this.vt, sonuc);
    for (const d of silinecekMedyaDosyalari) medyaDosyasiniSil(this.klasor, d);
  }

  /** @param {string} kosuId @param {{ durum: string; bitis?: string }} girdi */
  async kosuyuBitir(kosuId, girdi) {
    kosuyuBitir(this.vt, kosuId, girdi);
    try {
      const s = medyaSaklamaTemizligi(this.vt, this.klasor, { videoGun: videoSaklamaGunu() });
      if (s.silinenVideo) uyar(`${videoSaklamaGunu()} günden eski ${s.silinenVideo} şifreli video silindi.`);
    } catch (hata) {
      uyar(`Medya saklama temizliği yapılamadı: ${/** @type {Error} */ (hata).message}`);
    }
  }

  async kapat() {
    this.vt.kapat();
  }
}

/**
 * @typedef {{ yazici: SunucuYazici | DogrudanYazici; projeId: string; ortamId: string | null; medyaKlasoru: string; medyaZarfi: string | null }} Baglam
 */

// ---------------------------------------------------------------------------------------
// Raporlayıcı
// ---------------------------------------------------------------------------------------

export default class PlatformRaporlayici {
  /**
   * Koşunun proje ve ortam kimlikleri (playwright.config.ts verir).
   * @param {{ projeId?: string; ortamId?: string; projeKoku?: string }} [secenekler]
   */
  constructor(secenekler = {}) {
    this.projeIdSecimi = secenekler.projeId ?? null;
    this.ortamIdSecimi = secenekler.ortamId ?? null;
    this.projeKoku = secenekler.projeKoku ? resolve(secenekler.projeKoku) : process.cwd();
    /** @type {Promise<void>} */
    this.sira = Promise.resolve();
    /** @type {Promise<Baglam | null> | null} */
    this.hazirlik = null;
    /** @type {Promise<string | null> | null} */
    this.kosuSozu = null;
    /** @type {Promise<Buffer | null> | null} */
    this.medyaAnahtariSozu = null;
    this.baslangicMs = Date.now();
    this.yedekKosuKimligi = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    /** @type {string[]} */
    this.ciktiKlasorleri = [];
    this.sayac = { sonuc: 0, medya: 0, silinen: 0 };
    /** @type {Set<string>} */
    this.uyarilar = new Set();
  }

  printsToStdio() {
    return false;
  }

  /** @param {string} mesaj */
  birKezUyar(mesaj) {
    if (this.uyarilar.has(mesaj)) return;
    this.uyarilar.add(mesaj);
    uyar(mesaj);
  }

  /**
   * Canlı adım listesi (Nöbetçi koşusu; TEST_SUNUCU_ADIM_YOLU verilmişse): üst düzey test.step başladıkça / bittikçe adımlar
   * (ad, durum, süre) bu dosyaya yazılır; panel /adim-durumu ucundan okur. Yazma hatası koşuyu etkilemez.
   */
  canliAdimlariYaz() {
    const yol = process.env.TEST_SUNUCU_ADIM_YOLU;
    if (!yol) return;
    try {
      writeFileSync(`${yol}.tmp`, JSON.stringify({ adimlar: this.canliAdimlar ?? [] }));
      renameSync(`${yol}.tmp`, yol);
    } catch { /* canlı gösterim en iyi çabayla */ }
  }

  /** @param {import('@playwright/test/reporter').TestCase} _test @param {import('@playwright/test/reporter').TestResult} _result */
  onTestBegin(_test, _result) {
    /** @type {Array<{ ad: string; durum: 'calisiyor' | 'basarili' | 'basarisiz'; baslangic: number; sureMs?: number }>} */
    this.canliAdimlar = [];
    this.canliAdimlariYaz();
  }

  /** @param {import('@playwright/test/reporter').TestCase} _test @param {import('@playwright/test/reporter').TestResult} _result @param {import('@playwright/test/reporter').TestStep} adim */
  onStepBegin(_test, _result, adim) {
    if (adim.category !== 'test.step' || adim.parent || adimGurultuMu(adim.title)) return;
    (this.canliAdimlar ??= []).push({ ad: adim.title, durum: 'calisiyor', baslangic: Date.now() });
    this.canliAdimlariYaz();
  }

  /** @param {import('@playwright/test/reporter').TestCase} _test @param {import('@playwright/test/reporter').TestResult} _result @param {import('@playwright/test/reporter').TestStep} adim */
  onStepEnd(_test, _result, adim) {
    if (adim.category !== 'test.step' || adim.parent || adimGurultuMu(adim.title)) return;
    const a = [...(this.canliAdimlar ?? [])].reverse().find((x) => x.ad === adim.title && x.durum === 'calisiyor');
    if (a) { a.durum = adim.error ? 'basarisiz' : 'basarili'; a.sureMs = adim.duration; }
    this.canliAdimlariYaz();
  }

  /** @param {import('@playwright/test/reporter').FullConfig} config */
  onBegin(config) {
    this.baslangicMs = Date.now();
    this.ciktiKlasorleri = config.projects.map((p) => resolve(p.outputDir));
    this.hazirlik = this.hazirla().catch((hata) => {
      this.birKezUyar(`Platform sonuç kaydı başlatılamadı; sonuçlar veritabanına yazılmayacak: ${/** @type {Error} */ (hata).message}`);
      return null;
    });
  }

  /** @returns {Promise<Baglam | null>} */
  async hazirla() {
    const dbYolu = veritabaniYolu(this.projeKoku);
    const secim = { projeId: this.projeIdSecimi, ortamId: this.ortamIdSecimi };
    // 1) Sunucu (verildiyse ya da aynı veritabanıyla çalışıyorsa).
    const verilenAdres = process.env.PLATFORM_SONUC_ADRESI;
    const verilenToken = process.env.PLATFORM_SONUC_TOKENI;
    /** @type {SunucuYazici | null} */
    let sunucu = null;
    /** @type {Record<string, unknown> | null} */
    let durum = null;
    if (verilenAdres && verilenToken) {
      sunucu = new SunucuYazici(verilenAdres, verilenToken, dbYolu);
      durum = await sunucu.durum(secim);
    } else {
      const baglanti = existsSync(dbYolu) ? sunucuBaglantisiniOku(dbYolu) : null;
      if (baglanti) {
        const aday = new SunucuYazici(baglanti.adres, baglanti.token, dbYolu);
        try {
          const d = await aday.durum(secim, 1500);
          if (typeof d.veritabaniYolu === 'string' && resolve(d.veritabaniYolu) === dbYolu) { sunucu = aday; durum = d; }
        } catch { /* sunucu yok ya da eski sürüm: doğrudan yazılır */ }
      }
    }
    if (sunucu && durum) {
      if (!durum.etkin) return null;
      return {
        yazici: sunucu, projeId: String(durum.projeId), ortamId: typeof durum.ortamId === 'string' ? durum.ortamId : null,
        medyaKlasoru: String(durum.medyaKlasoru), medyaZarfi: typeof durum.medyaZarfi === 'string' ? durum.medyaZarfi : null
      };
    }
    // 2) Doğrudan: önce salt okunur bakılır (etkin değilse dosyaya HİÇ yazılmaz).
    if (!existsSync(dbYolu)) return null;
    const bakis = await veritabaniAc(dbYolu, { saltOkunur: true });
    let projeVar = false;
    try {
      gocleriUygula(bakis);
      projeVar = Boolean(this.projeyiBul(bakis));
    } finally {
      bakis.kapat();
    }
    if (!projeVar) return null;
    const vt = await veritabaniniHazirla(dbYolu);
    const proje = this.projeyiBul(vt);
    if (!proje) { vt.kapat(); return null; }
    return {
      yazici: new DogrudanYazici(vt, medyaKlasoru(dbYolu)), projeId: proje.id,
      ortamId: this.ortamIdSecimi && vt.tek('SELECT id FROM ortamlar WHERE id = ? AND proje_id = ?', [this.ortamIdSecimi, proje.id]) ? this.ortamIdSecimi : null,
      medyaKlasoru: medyaKlasoru(dbYolu),
      medyaZarfi: vt.metaOku(MEDYA_ANAHTARI_META) ?? null
    };
  }

  /** @param {import('./veritabani/baglanti.mjs').Veritabani} vt */
  projeyiBul(vt) {
    if (!this.projeIdSecimi) return undefined;
    const s = vt.tek('SELECT id FROM projeler WHERE id = ?', [this.projeIdSecimi]);
    return s ? { id: String(s.id) } : undefined;
  }

  /** @param {Baglam} baglam @returns {Promise<Buffer | null>} */
  async medyaAnahtari(baglam) {
    const ham = process.env.PLATFORM_KASA_ANAHTARI;
    if (!ham) {
      this.birKezUyar('UYARI: PLATFORM_KASA_ANAHTARI yok — sonuçlar veritabanına yazılıyor ama ekran görüntüsü/video/iz '
        + 'ŞİFRELENEMEDİĞİ için kayda alınmadı; düz metin dosyalar test-results/ altında bırakıldı. Koşuyu platformdan '
        + 'başlatın ya da terminalde kasa parolasını girin.');
      return null;
    }
    const kasaAnahtari = Buffer.from(ham, 'base64url');
    try {
      const zarf = baglam.medyaZarfi ?? await baglam.yazici.medyaZarfiniKaydet(yeniMedyaAnahtari(kasaAnahtari).zarf);
      return medyaAnahtariniAc(zarf, kasaAnahtari);
    } catch (hata) {
      this.birKezUyar(`UYARI: medya anahtarı açılamadı (${/** @type {Error} */ (hata).message}); medya kayda alınmadı, düz metin dosyalara dokunulmadı.`);
      return null;
    } finally {
      kasaAnahtari.fill(0);
    }
  }

  /** @param {import('@playwright/test/reporter').TestCase} test @param {import('@playwright/test/reporter').TestResult} result */
  onTestEnd(test, result) {
    this.sira = this.sira
      .then(() => this.testiIsle(test, result))
      .catch((hata) => this.birKezUyar(`Sonuç kaydedilemedi: ${/** @type {Error} */ (hata).message}`));
  }

  /** @param {import('@playwright/test/reporter').TestCase} test @param {import('@playwright/test/reporter').TestResult} result */
  static aciklamalar(test, result) {
    /** @type {Map<string, string>} */
    const harita = new Map();
    for (const a of [...(test.annotations ?? []), ...(result.annotations ?? [])]) {
      if (a && typeof a.type === 'string' && typeof a.description === 'string') harita.set(a.type, a.description);
    }
    return harita;
  }

  /** @param {Baglam} baglam @param {Map<string, string>} aciklama */
  async kosuyuHazirla(baglam, aciklama) {
    const aday = aciklama.get('kosuKimligi') ?? process.env.KOSU_KIMLIGI ?? this.yedekKosuKimligi;
    const kosuId = KIMLIK.test(aday) ? aday : this.yedekKosuKimligi;
    const dashboardKosusu = process.env.TEST_SUNUCU_GORUNUR === '1';
    const envTuru = !dashboardKosusu || process.env.TEST_SUNUCU_KOSU_TURU === 'tam' ? 'tam' : 'tekil';
    const tur = aciklama.get('kosuTuru') === 'tekil' || aciklama.get('kosuTuru') === 'tam' ? aciklama.get('kosuTuru') : envTuru;
    const kapsam = aciklama.get('kosuKapsami') ?? (dashboardKosusu ? process.env.TEST_SUNUCU_KOSU_KAPSAMI : undefined) ?? 'Genel';
    await baglam.yazici.kosuKaydet({
      id: kosuId, projeId: baglam.projeId, ortamId: baglam.ortamId, tur: tur === 'tekil' ? 'tekil' : 'tam', kapsam,
      baslangic: new Date(this.baslangicMs).toISOString()
    });
    return kosuId;
  }

  /** @param {import('@playwright/test/reporter').TestCase} test @param {import('@playwright/test/reporter').TestResult} result */
  async testiIsle(test, result) {
    const baglam = await this.hazirlik;
    if (!baglam) return;
    const aciklama = PlatformRaporlayici.aciklamalar(test, result);
    this.kosuSozu ??= this.kosuyuHazirla(baglam, aciklama).catch((hata) => {
      this.birKezUyar(`Koşu kaydı oluşturulamadı: ${/** @type {Error} */ (hata).message}`);
      return null;
    });
    const kosuId = await this.kosuSozu;
    if (!kosuId) return;
    this.medyaAnahtariSozu ??= this.medyaAnahtari(baglam);
    const anaAnahtar = await this.medyaAnahtariSozu;

    const hataMesaji = ansiTemizle(result.error?.message
      ?? (result.errors ?? []).map((e) => e.message ?? e.value ?? '').filter(Boolean).join('\n\n')) || null;
    const durum = playwrightDurumuEsle(result.status, hataMesaji, test.expectedStatus);
    const adimlar = (result.steps ?? [])
      .filter((a) => a.category === 'test.step' && !adimGurultuMu(a.title))
      .map((a) => ({
        ad: a.title,
        durum: a.error ? (durum === 'durduruldu' ? 'durduruldu' : 'basarisiz') : 'basarili',
        sureMs: a.duration,
        hataMesaji: a.error?.message ? ansiTemizle(a.error.message) : null
      }));

    /** @type {Array<{ alan: string; neden?: string }>} */
    const atlanan = aciklama.has('atlananAlanlar') ? atlananAlanlariAyristir(String(aciklama.get('atlananAlanlar'))) : [];
    /** @type {import('./veritabani/sonuc-deposu.mjs').SonucGirdisi['medya']} */
    const medya = [];
    /** @type {string[]} */
    const silinecekler = [];
    for (const ek of result.attachments ?? []) {
      if (ek.name === 'atlananAlanlar') {
        const icerik = ek.body ? ek.body.toString('utf8') : ek.path && existsSync(ek.path) ? readFileSync(ek.path, 'utf8') : '';
        atlanan.push(...atlananAlanlariAyristir(icerik));
        if (ek.path) silinecekler.push(ek.path);
        continue;
      }
      if (!ek.body && !(ek.path && existsSync(ek.path))) continue;
      if (!anaAnahtar) continue;
      const { dosya, boyut } = await medyaSifrele(anaAnahtar, baglam.medyaKlasoru, ek.body ?? /** @type {string} */ (ek.path));
      medya.push({ tur: medyaTuru(ek), ad: ek.name, icerikTuru: ek.contentType || 'application/octet-stream', boyut, dosya, olusturulma: new Date().toISOString() });
      if (ek.path) silinecekler.push(ek.path);
    }

    const projeDizini = test.parent.project()?.testDir ?? this.projeKoku;
    const dosya = relative(projeDizini, test.location.file).split(sep).join('/');
    const baslangic = result.startTime instanceof Date ? result.startTime : new Date(result.startTime);
    try {
      await baglam.yazici.sonucKaydet({
        kosuId, projeId: baglam.projeId, testKimligi: test.id, senaryoAnahtari: `${dosya}::${test.title}`,
        senaryoId: aciklama.get('senaryoId') ?? null, senaryoBaslik: test.title, urunAdi: aciklama.get('urun') ?? null,
        durum, hamDurum: result.status, sureMs: result.duration, hataMesaji, beklenenSonuc: aciklama.get('beklenenSonuc') ?? null,
        atlananAlanlar: atlanan, deneme: result.retry,
        // Koşuda yakalanan mesajlar (tests/support/mesaj-yakalayici.ts; maskeli): geçen testlerde de.
        yakalananMesajlar: yakalananMesajlariAyristir(aciklama.get('yakalananMesajlar') ?? '[]'),
        baslangic: baslangic.toISOString(), bitis: new Date(baslangic.getTime() + Math.max(0, result.duration)).toISOString(), adimlar, medya
      });
    } catch (hata) {
      // Satır yazılamadıysa şifreli kopyalar sahipsiz kalmasın; düz metin dosyalara dokunulmaz.
      for (const m of medya ?? []) medyaDosyasiniSil(baglam.medyaKlasoru, m.dosya);
      throw hata;
    }
    this.sayac.sonuc++;
    this.sayac.medya += medya?.length ?? 0;
    if (anaAnahtar) for (const yol of silinecekler) if (this.duzMetniSil(yol)) this.sayac.silinen++;
  }

  /** Yalnızca bu koşunun çıktı klasöründeki ve bu koşuda oluşturulmuş dosyayı siler. @param {string} yol */
  duzMetniSil(yol) {
    const tam = resolve(yol);
    const kok = this.ciktiKlasorleri.find((k) => {
      const g = relative(k, tam);
      return g !== '' && !g.startsWith('..') && !isAbsolute(g);
    });
    if (!kok) return false;
    try {
      if (statSync(tam).mtimeMs < this.baslangicMs - 5000) return false;
      unlinkSync(tam);
    } catch {
      return false;
    }
    // Boşalan klasörleri (çıktı kökü hariç) yukarı doğru kaldır.
    for (let d = dirname(tam); d !== kok && relative(kok, d) && !relative(kok, d).startsWith('..'); d = dirname(d)) {
      try {
        if (readdirSync(d).length) break;
        rmdirSync(d);
      } catch {
        break;
      }
    }
    return true;
  }

  /** @param {import('@playwright/test/reporter').FullResult} sonuc */
  async onEnd(sonuc) {
    await this.sira;
    const baglam = this.hazirlik ? await this.hazirlik : null;
    if (!baglam) return;
    try {
      const kosuId = this.kosuSozu ? await this.kosuSozu : null;
      if (kosuId) {
        const durum = sonuc.status === 'interrupted' ? 'durduruldu' : sonuc.status === 'timedout' ? 'zaman_asimi' : 'tamamlandi';
        await baglam.yazici.kosuyuBitir(kosuId, { durum, bitis: new Date().toISOString() });
        uyar(`${this.sayac.sonuc} sonuç platform veritabanına yazıldı (koşu ${kosuId}); ${this.sayac.medya} medya şifrelendi, ${this.sayac.silinen} düz metin dosya silindi.`);
      }
    } catch (hata) {
      this.birKezUyar(`Koşu kapatılamadı: ${/** @type {Error} */ (hata).message}`);
    } finally {
      await baglam.yazici.kapat();
    }
  }
}
