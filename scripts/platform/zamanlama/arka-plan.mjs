// ZAMANLANMIŞ KOŞULAR — kilitliyken / açılışta çalışma tercihleri (Planlı koşular; üçü de varsayılan KAPALI):
//   A) kilitliyken  : "Kasa kilitlense de planlı koşular çalışsın (anahtar yalnız bellekte)" — anahtar-emaneti.mjs
//   B) dpapi        : "Windows oturumuna bağlı otomatik açma (DPAPI)" — dpapi.mjs (yalnız Windows)
//   C) oturumAcilisi: "Bilgisayar açılınca Nöbetçi arka planda başlasın" — oturum-gorevi.mjs (yalnız Windows)
// Tercihler kasada şifreli ayar olarak saklanır ('zamanlama_tercihleri'). Kasa KİLİTLİYKEN (sunucu açılışı) okunabilen tek şey
// "DPAPI dosyası var mı"dır: B'nin açılıştaki kaynağı dosyanın varlığıdır; C'nin kaynağı Windows'taki görevin varlığıdır
// (schtasks /Query). A yalnız bellekte anlam taşır: kasa açıkken kilitlenirken okunur. Kasa her açıldığında tercih ile dosya
// uzlaştırılır (kasaAcildi): tercih kapalıysa dosya silinir; dosya yok / eski anahtara aitse tercih kapatılır ve kullanıcı uyarılır.
// Tercihler kapalıyken davranış bugünküyle birebir aynıdır. Parola / anahtar / blob hiçbir yere loglanmaz.
import { randomBytes } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { KasaHatasi, acikAnahtar, arayuzAcikMi, arkaPlanKipindeMi, kasaKdfOku, kasaKilitle, parolayiDogrula } from '../kasa.mjs';
import { DepoHatasi, ayarGetir, ayarYaz } from '../veritabani/depo.mjs';
import { anahtariEmanetEt, arayuzuKilitleEmanetle, arkaPlanIsiSuruyorMu, emanetVarMi, emanetiSil } from './anahtar-emaneti.mjs';
import { dosyayiGuvenliSil, dpapiDosyaBilgisi, dpapiDosyaYolu, dpapiDosyasiOku, dpapiDosyasiYaz, varsayilanDpapiYurutucu } from './dpapi.mjs';
import { gorevHedefi, gorevOlustur, gorevSil, gorevVarMi, gorevXml, varsayilanGorevYurutucu } from './oturum-gorevi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {{ kilitliyken: boolean; dpapi: boolean; oturumAcilisi: boolean }} ArkaPlanTercihleri */

export const TERCIH_AYAR_ANAHTARI = 'zamanlama_tercihleri';
export const TERCIH_ADLARI = /** @type {const} */ (['kilitliyken', 'dpapi', 'oturumAcilisi']);
/** @type {Readonly<ArkaPlanTercihleri>} */
export const VARSAYILAN_TERCIHLER = Object.freeze({ kilitliyken: false, dpapi: false, oturumAcilisi: false });

/** Kasa açık olmalı. @param {Veritabani} db @returns {ArkaPlanTercihleri} */
export function tercihleriOku(db) {
  const kayit = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(db, TERCIH_AYAR_ANAHTARI));
  return { kilitliyken: kayit?.kilitliyken === true, dpapi: kayit?.dpapi === true, oturumAcilisi: kayit?.oturumAcilisi === true };
}

/** @param {Veritabani} db @param {ArkaPlanTercihleri} t */
function tercihleriYaz(db, t) {
  ayarYaz(db, TERCIH_AYAR_ANAHTARI, { kilitliyken: t.kilitliyken, dpapi: t.dpapi, oturumAcilisi: t.oturumAcilisi });
}

/**
 * @param {{
 *   veritabaniYolu: () => string | null;
 *   projeKoku: string;
 *   denemeSiniri: { dene<T>(fn: () => Promise<T>): Promise<T> };
 *   platform?: string;
 *   dpapiYurutucu?: import('./dpapi.mjs').DpapiYurutucu;
 *   gorevYurutucu?: import('./oturum-gorevi.mjs').GorevYurutucu;
 *   nodeYolu?: string;
 *   kullanici?: () => string;
 *   geciciKlasor?: () => string;
 *   log?: (mesaj: string) => void;
 * }} bag
 */
export function arkaPlanYoneticisi(bag) {
  const windows = (bag.platform ?? process.platform) === 'win32';
  const dpapiYurutucu = bag.dpapiYurutucu ?? varsayilanDpapiYurutucu;
  const gorevYurutucu = bag.gorevYurutucu ?? varsayilanGorevYurutucu;
  const log = bag.log ?? ((m) => console.log(m));
  const kullanici = bag.kullanici ?? (() => `${process.env.USERDOMAIN || process.env.COMPUTERNAME || '.'}\\${userInfo().username}`);
  const geciciKlasor = bag.geciciKlasor ?? tmpdir;
  /** Kullanıcıya gösterilecek son uyarı (gizli bilgi içermez). @type {string | null} */
  let uyari = null;
  /** Her tam kilitlemede artar: await süren bir iş (açılışta DPAPI çözme) bitince anahtarı emanete geri koymasın. */
  let tamamenKilitNesli = 0;

  const dosyaYolu = () => { const y = bag.veritabaniYolu(); return y ? dpapiDosyaYolu(y) : null; };
  const dosyaBilgisi = () => { const y = dosyaYolu(); return y ? dpapiDosyaBilgisi(y) : { var: false, gecerli: false, kasaTuzu: null }; };
  const dosyayiSil = () => { const y = dosyaYolu(); return y ? dosyayiGuvenliSil(y) : false; };
  /** @param {Veritabani} db */
  const kasaTuzu = (db) => kasaKdfOku(db)?.tuz ?? null;
  const hedef = () => gorevHedefi({ projeKoku: bag.projeKoku, nodeYolu: bag.nodeYolu ?? process.execPath });

  /**
   * Kasa (parolayla) açıldığında: tercih ile DPAPI dosyasını uzlaştırır (DPAPI çağrısı yapmaz; dosyanın kasa tuzuna bakar).
   * @param {Veritabani} db
   */
  function kasaAcildi(db) {
    let t;
    try { t = tercihleriOku(db); } catch { return; }
    let degisti = false;
    if (!windows && (t.dpapi || t.oturumAcilisi)) { t = { ...t, dpapi: false, oturumAcilisi: false }; degisti = true; }
    const bilgi = dosyaBilgisi();
    if (t.dpapi) {
      if (!bilgi.var) {
        t = { ...t, dpapi: false }; degisti = true;
        uyari = 'Windows oturumuna bağlı otomatik açma bu bilgisayarda kurulu değil (dosya bulunamadı; ör. yedekten yüklendi). Tercih kapatıldı; isterseniz yeniden açın.';
      } else if (!bilgi.gecerli || bilgi.kasaTuzu !== kasaTuzu(db)) {
        dosyayiSil();
        t = { ...t, dpapi: false }; degisti = true;
        uyari = 'Kasa parolası değiştiği ya da kasa yeniden anahtarlandığı için Windows oturumuna bağlı otomatik açma geçersiz oldu; dosya silindi ve tercih kapatıldı. İsterseniz yeniden açın.';
      }
    } else if (bilgi.var) {
      dosyayiSil();
    }
    if (!t.kilitliyken && !t.dpapi) emanetiSil(db);
    if (degisti) tercihleriYaz(db, t);
  }

  /**
   * Kilitleme: tamamen=false ve tercih (A ya da B) açıksa arayüz kilitlenir, anahtar yalnız zamanlayıcının emanetinde kalır;
   * aksi hâlde (ya da "Tamamen kilitle") emanet de açık anahtar da HER KOŞULDA hemen silinir — süren bir arka plan işi olsa
   * bile beklenmez (iş kasa kilitli görünce başarısız adımları atlar; zamanlayici.mjs > devamMi). Süren iş varsa sonuçta
   * surenIs: true döner (arayüz kullanıcıyı açıkça uyarır). Başlamış bir DPAPI açılış yüklemesi bu kilitten sonra
   * anahtarı emanete geri koyamaz (tamamenKilitNesli).
   * @param {Veritabani} db @param {{ tamamen?: boolean }} [secenekler]
   * @returns {{ arkaPlan: boolean; surenIs?: true }}
   */
  function kilitle(db, secenekler = {}) {
    if (!secenekler.tamamen) {
      let arkaPlan = false;
      if (arayuzAcikMi(db)) {
        try { const t = tercihleriOku(db); arkaPlan = t.kilitliyken || t.dpapi; } catch { arkaPlan = false; }
      } else {
        arkaPlan = emanetVarMi(db); // zaten arka plan kipinde / emanette: seçim korunur
      }
      if (arkaPlan) {
        arayuzuKilitleEmanetle(db);
        return { arkaPlan: true };
      }
    }
    const surenIs = arkaPlanIsiSuruyorMu(db);
    tamamenKilitNesli += 1;
    emanetiSil(db);
    kasaKilitle(db);
    return surenIs ? { arkaPlan: false, surenIs: true } : { arkaPlan: false };
  }

  /** Kilit menüsünde iki seçenek gösterilsin mi? (Kasa arayüzde açıkken ve A ya da B açıksa.) @param {Veritabani} db */
  function kilitSecimiVarMi(db) {
    if (!arayuzAcikMi(db)) return false;
    try { const t = tercihleriOku(db); return t.kilitliyken || t.dpapi; } catch { return false; }
  }

  /**
   * Parola değişti (kasa açık, yeni anahtar bellekte): emanet ve DPAPI dosyası yeni anahtarla yenilenir; yenilenemezse dosya
   * silinir, tercih kapatılır ve kullanıcı uyarılır.
   * @param {Veritabani} db
   */
  async function parolaDegisti(db) {
    if (emanetVarMi(db)) anahtariEmanetEt(db, acikAnahtar(db));
    const yol = dosyaYolu();
    if (!yol || !dpapiDosyaBilgisi(yol).var) return;
    let t;
    try { t = tercihleriOku(db); } catch { return; }
    if (!t.dpapi || !windows) { dosyayiGuvenliSil(yol); return; }
    const anahtar = Buffer.from(acikAnahtar(db));
    try {
      await dpapiDosyasiYaz(yol, anahtar, /** @type {string} */ (kasaTuzu(db)), dpapiYurutucu);
      log('[zamanlama] Windows oturumuna bağlı otomatik açma yeni kasa anahtarıyla yenilendi.');
    } catch {
      try { dosyayiGuvenliSil(yol); } catch { /* yok sayılır */ }
      tercihleriYaz(db, { ...t, dpapi: false });
      uyari = 'Kasa parolası değişti; Windows oturumuna bağlı otomatik açma yenilenemedi. Dosya silindi ve tercih kapatıldı; isterseniz yeniden açın.';
    } finally {
      anahtar.fill(0);
    }
  }

  /**
   * Sunucu açılışında (kasa kilitli): DPAPI dosyası varsa çözülür ve anahtar YALNIZ zamanlayıcının emanetine verilir; arayüz
   * kilitli kalır. Dosya eski anahtara aitse / kasaya uymuyorsa silinir ve kullanıcı (kasa açılınca) uyarılır.
   * @param {Veritabani | null} db
   */
  async function acilistaYukle(db) {
    if (!windows || !db) return false;
    const yol = dosyaYolu();
    if (!yol || !dpapiDosyaBilgisi(yol).var) return false;
    /** @type {Buffer | null} */
    let anahtar = null;
    const nesil = tamamenKilitNesli;
    try {
      anahtar = await dpapiDosyasiOku(yol, { kasaTuzu: kasaTuzu(db), yurutucu: dpapiYurutucu });
      // Çözme sürerken kullanıcı "Tamamen kilitle" dediyse anahtar emanete konmaz (silinir).
      if (nesil !== tamamenKilitNesli) {
        log('[zamanlama] Windows oturumuna bağlı otomatik açma yüklenmedi: kasa bu sırada tamamen kilitlendi.');
        return false;
      }
      anahtariEmanetEt(db, anahtar);
      log('[zamanlama] Windows oturumuna bağlı otomatik açma: planlı koşular kasa kilitliyken çalışabilir (anahtar yalnız bellekte, arayüz kilitli).');
      return true;
    } catch (hata) {
      const kod = /** @type {{ kod?: string }} */ (hata).kod;
      if (kod === 'ESKI' || kod === 'BOZUK' || /uymuyor/.test(String(/** @type {Error} */ (hata).message))) {
        try { dosyayiGuvenliSil(yol); } catch { /* yok sayılır */ }
        uyari = 'Windows oturumuna bağlı otomatik açma dosyası bu kasaya artık uymuyordu (parola değişmiş ya da yedek yüklenmiş); silindi. Tercihi yeniden açabilirsiniz.';
      } else {
        uyari = 'Windows oturumuna bağlı otomatik açma dosyası çözülemedi (başka bir Windows kullanıcısı ya da bozuk dosya olabilir); planlı koşular kasa açılana kadar çalışmaz.';
      }
      log('[zamanlama] Windows oturumuna bağlı otomatik açma kullanılamadı; ayrıntı Planlı koşular sayfasında.');
      return false;
    } finally {
      anahtar?.fill(0);
    }
  }

  /** Kasa kilitliyken de gösterilebilecek (gizli olmayan) durum: /platform/durum. @param {Veritabani | null} db */
  function kilitDurumu(db) {
    return {
      anahtarBellekte: Boolean(db && (emanetVarMi(db) || arkaPlanKipindeMi(db))),
      dpapiDosyasi: windows && dosyaBilgisi().var,
      kilitSecimi: Boolean(db && kilitSecimiVarMi(db))
    };
  }

  /** Ayarlar ekranı için tam durum (kasa açık). @param {Veritabani} db */
  async function durum(db) {
    const t = tercihleriOku(db);
    const bilgi = dosyaBilgisi();
    const h = hedef();
    let gorevVar = null;
    if (windows) {
      try { gorevVar = await gorevVarMi(gorevYurutucu); } catch { gorevVar = null; }
    }
    return {
      tercihler: t,
      windows,
      anahtarBellekte: emanetVarMi(db),
      dpapi: { dosyaVar: bilgi.var, gecerli: bilgi.var && bilgi.gecerli && bilgi.kasaTuzu === kasaTuzu(db) },
      gorev: windows ? { var: gorevVar, paket: h.paket, komut: h.komut } : null,
      uyari
    };
  }

  /**
   * Tercih değiştir (kasa açık). A'yı açmak onay; B'yi açmak parola + onay; C'yi açmak / kapatmak onay ister. İzinler (A: arka plan
   * çalışması, B / C açarken: sistem değişikliği) sunucu ucunda denetlenir (guvenlik/uc-denetimi.mjs).
   * @param {Veritabani} db @param {Record<string, unknown>} g { ad, acik, parola?, onay? }
   */
  async function tercihDegistir(db, g) {
    const ad = /** @type {typeof TERCIH_ADLARI[number]} */ (g.ad);
    if (!TERCIH_ADLARI.includes(ad)) throw new DepoHatasi('"ad" geçersiz.');
    if (typeof g.acik !== 'boolean') throw new DepoHatasi('"acik" true ya da false olmalıdır.');
    const acik = g.acik;
    let t = tercihleriOku(db);
    if (ad === 'kilitliyken') {
      // Açmak (diğer iki tercih gibi) riskin onaylanmasını ister: kasa kilitliyken anahtar bellekte kalır. Kapatmak serbest.
      if (acik && g.onay !== true) throw new DepoHatasi('Bu seçeneği açmak için riski onaylamalısınız (kasa kilitliyken anahtar bellekte kalır).');
      t = { ...t, kilitliyken: acik };
      tercihleriYaz(db, t);
      if (!acik && !t.dpapi) emanetiSil(db);
    } else if (ad === 'dpapi') {
      if (!windows) throw new DepoHatasi('Bu seçenek yalnız Windows\'ta kullanılabilir.');
      const yol = dosyaYolu();
      if (!yol) throw new DepoHatasi('Açık bir çalışma alanı yok.');
      if (acik) {
        if (g.onay !== true) throw new DepoHatasi('Bu seçeneği açmak için riski onaylamalısınız.');
        const parola = typeof g.parola === 'string' ? g.parola : '';
        const anahtar = await bag.denemeSiniri.dene(async () => {
          const a = await parolayiDogrula(db, parola);
          if (!a) throw new KasaHatasi('PAROLA_YANLIS', 'Kasa parolası yanlış.');
          return a;
        });
        try {
          await dpapiDosyasiYaz(yol, anahtar, /** @type {string} */ (kasaTuzu(db)), dpapiYurutucu);
        } catch (hata) {
          if (hata instanceof KasaHatasi) throw hata;
          throw new DepoHatasi('Windows DPAPI ile şifrelenemedi; seçenek açılmadı.');
        } finally {
          anahtar.fill(0);
        }
        t = { ...t, dpapi: true };
        log('[zamanlama] Windows oturumuna bağlı otomatik açma açıldı (kullanıcı onayıyla).');
      } else {
        dosyayiGuvenliSil(yol);
        t = { ...t, dpapi: false };
        if (!t.kilitliyken) emanetiSil(db);
        log('[zamanlama] Windows oturumuna bağlı otomatik açma kapatıldı; dosya silindi.');
      }
      tercihleriYaz(db, t);
    } else {
      if (!windows) throw new DepoHatasi('Bu seçenek yalnız Windows\'ta kullanılabilir.');
      if (g.onay !== true) throw new DepoHatasi('Windows Görev Zamanlayıcı\'yı değiştirmek için onay gerekir.');
      if (acik) {
        const h = hedef();
        const xmlYolu = join(geciciKlasor(), `nobetci-gorev-${randomBytes(8).toString('hex')}.xml`);
        try {
          await gorevOlustur({
            xml: gorevXml({ kullanici: kullanici(), komut: h.komut, argumanlar: h.argumanlar, calismaKlasoru: h.calismaKlasoru }),
            xmlYolu, yaz: (y, veri) => writeFileSync(y, veri, { flag: 'wx', mode: 0o600 }), sil: (y) => unlinkSync(y), yurutucu: gorevYurutucu
          });
        } catch (hata) {
          throw new DepoHatasi(/** @type {Error} */ (hata).message);
        }
        log('[zamanlama] Windows oturum açılışı görevi eklendi (kullanıcı onayıyla).');
      } else {
        try { await gorevSil(gorevYurutucu); } catch (hata) { throw new DepoHatasi(/** @type {Error} */ (hata).message); }
        log('[zamanlama] Windows oturum açılışı görevi kaldırıldı (kullanıcı onayıyla).');
      }
      t = { ...t, oturumAcilisi: acik };
      tercihleriYaz(db, t);
    }
    uyari = null;
    return durum(db);
  }

  return {
    tercihleriOku, kasaAcildi, kilitle, kilitSecimiVarMi, parolaDegisti, acilistaYukle, kilitDurumu, durum, tercihDegistir,
    /** Çalışma alanı bu bilgisayardan kaldırılırken DPAPI dosyası da silinir. @param {string} veritabaniYolu */
    alanKaldirildi: (veritabaniYolu) => { try { dosyayiGuvenliSil(dpapiDosyaYolu(veritabaniYolu)); } catch { /* yok sayılır */ } }
  };
}
