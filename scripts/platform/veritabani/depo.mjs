// PLATFORM VERİ ERİŞİM KATMANI (depo) — sonraki adımların (dashboard, koşucu, veri taşıma)
// kullanacağı tipli CRUD fonksiyonları. Tipler: depo.d.mts.
//
// Kurallar:
// - Tüm yazmalar tek bir transaction içinde yapılır (vt.islem); hata = hiçbir şey yazılmaz.
// - JSON sütunları burada doğrulanır (nesne/dizi beklenir; bozuk JSON reddedilir).
// - ŞİFRELİ sütunlar (gocler.mjs > SIFRELI_ALANLAR: ortam adı/adresi, kullanıcı adı, SMS
//   ayarı, bağlam alanları, ayarlar, makine adı, giriş parolası, TOTP) ve türünde "hassas"
//   işaretli test verisi alanları YALNIZCA kasa zarfı olarak yazılır. Bu sütunlara yazmak ve
//   onları okumak kasa AÇIK olmayı gerektirir (kilitliyse KASA_KILITLI, kasa yoksa KASA_YOK).
//   'gizli' sütunlar (parola, TOTP) ve hassas test verisi alanları ise okumada da "coz: true"
//   istenmedikçe düz metin dönmez.
// - Senaryo ve profil değişiklikleri degisiklik_gecmisi'ne (önce/sonra) yazılır; önce/sonra
//   satırın veritabanındaki halidir (hassas alanlar şifreli kalır).

import { randomUUID } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { veritabaniAc, veritabaniYolu } from './baglanti.mjs';
import { GUNCEL_SEMA_SURUMU, TABLOLAR, gocleriUygula, mevcutSemaSurumu } from './gocler.mjs';
import { acikAnahtar, coz, kasaAcikMi, kasaDurumu, sifrele, zarfMi } from '../kasa.mjs';

/** @typedef {import('./baglanti.mjs').Veritabani} Veritabani */

const simdi = () => new Date().toISOString();

export class DepoHatasi extends Error {
  /** @param {string} mesaj */
  constructor(mesaj) {
    super(mesaj);
    this.name = 'DepoHatasi';
  }
}

/**
 * Değişiklik geçmişindeki varsayılan "yapan": "kullanici@<makineId>". Makine ADI (hostname)
 * düz metin olarak YAZILMAZ — makineler.ad şifrelidir; arayüz kasa açıkken kimliği ada çevirir.
 * @param {Veritabani} vt
 */
function varsayilanYapan(vt) {
  const makine = vt.metaOku('yerel_makine_id') ?? 'bilinmeyen-makine';
  let kullanici = 'kullanici';
  try {
    kullanici = userInfo().username || kullanici;
  } catch {
    // kullanıcı adı okunamazsa genel ad kullanılır
  }
  return `${kullanici}@${makine}`;
}

/**
 * Eski (şema < 3) geçmiş kaydındaki "kullanici@makine-adi" değerini "kullanici@<makineId>"
 * biçimine çevirir (göç 3 ile aynı kural; eski yedeklerin içe aktarılmasında kullanılır).
 * Değişiklik yoksa AYNI nesne döner.
 * @param {Record<string, unknown>} satir degisiklik_gecmisi satırı
 * @returns {Record<string, unknown>}
 */
export function gecmisYapaniniNormallestir(satir) {
  const yapan = satir.yapan;
  if (typeof yapan !== 'string' || yapan.startsWith('ice-aktarma:')) return satir;
  const at = yapan.indexOf('@');
  if (at < 0) return satir;
  const makine = typeof satir.makine_id === 'string' && satir.makine_id ? satir.makine_id : 'bilinmeyen-makine';
  if (yapan.slice(at + 1) === makine) return satir;
  return { ...satir, yapan: `${yapan.slice(0, at + 1)}${makine}` };
}

/** @param {unknown} deger @param {string} alan */
function zorunluMetin(deger, alan) {
  if (typeof deger !== 'string' || !deger.trim()) throw new DepoHatasi(`"${alan}" boş olamaz.`);
  return deger.trim();
}

/** @param {unknown} deger @param {string} alan */
function kimlikKontrol(deger, alan = 'id') {
  if (typeof deger !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(deger)) {
    throw new DepoHatasi(`"${alan}" geçersiz (yalnızca harf, rakam, "-" ve "_"; en fazla 100 karakter).`);
  }
  return deger;
}

/**
 * JSON sütunu için değeri doğrulayıp metne çevirir.
 * @param {unknown} deger
 * @param {string} alan
 * @param {'nesne' | 'dizi' | 'herhangi'} beklenen
 */
export function jsonMetni(deger, alan, beklenen = 'nesne') {
  let nesne = deger;
  if (typeof deger === 'string') {
    try {
      nesne = JSON.parse(deger);
    } catch {
      throw new DepoHatasi(`"${alan}" geçerli bir JSON değil.`);
    }
  }
  const diziMi = Array.isArray(nesne);
  const nesneMi = typeof nesne === 'object' && nesne !== null && !diziMi;
  if (beklenen === 'nesne' && !nesneMi) throw new DepoHatasi(`"${alan}" bir JSON nesnesi olmalıdır.`);
  if (beklenen === 'dizi' && !diziMi) throw new DepoHatasi(`"${alan}" bir JSON dizisi olmalıdır.`);
  if (nesne === undefined) throw new DepoHatasi(`"${alan}" boş olamaz.`);
  return JSON.stringify(nesne);
}

/** @param {unknown} metin */
function jsonOku(metin) {
  if (typeof metin !== 'string') return null;
  return JSON.parse(metin);
}

/**
 * Şifreli sütuna yazılacak değer: null/undefined → null, metin → zarf (kasa açık olmalı).
 * @param {Veritabani} vt @param {string | null | undefined} deger
 */
function sifreliYaz(vt, deger) {
  if (deger === null || deger === undefined) return null;
  return sifrele(vt, String(deger));
}

/**
 * Şifreli sütunu okur. Kasa kilitliyse/yoksa KasaHatasi (açık mesaj). v1'den kalmış ve henüz
 * şifrelenmemiş değer (normalde kasa açılınca şifrelenir) olduğu gibi döner.
 * @param {Veritabani} vt @param {unknown} deger @returns {string | null}
 */
function sifreliOku(vt, deger) {
  acikAnahtar(vt);
  if (deger === null || deger === undefined) return null;
  return zarfMi(deger) ? coz(vt, deger) : String(deger);
}

/**
 * @param {Veritabani} vt
 * @param {{ varlikTuru: string; varlikId: string; islem: 'olustur' | 'guncelle' | 'sil' | 'birlestirme_cakismasi' | 'ice_aktarma_uzerine_yazildi'; yapan?: string; onceki?: unknown; sonraki?: unknown; aciklama?: string }} kayit
 */
export function gecmisYaz(vt, kayit) {
  vt.calistir(
    `INSERT INTO degisiklik_gecmisi (id, varlik_turu, varlik_id, islem, yapan, makine_id, zaman, onceki_json, sonraki_json, aciklama)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(), kayit.varlikTuru, kayit.varlikId, kayit.islem, kayit.yapan || varsayilanYapan(vt),
      vt.metaOku('yerel_makine_id') ?? null, simdi(),
      kayit.onceki === undefined || kayit.onceki === null ? null : JSON.stringify(kayit.onceki),
      kayit.sonraki === undefined || kayit.sonraki === null ? null : JSON.stringify(kayit.sonraki),
      kayit.aciklama ?? null
    ]
  );
}

/** @param {Veritabani} vt @param {string} tablo @param {string} id */
function hamSatir(vt, tablo, id) {
  return vt.tek(`SELECT * FROM ${tablo} WHERE id = ?`, [id]);
}

/**
 * Genel ekle/güncelle: id varsa ve satır mevcutsa günceller, yoksa ekler.
 * @param {Veritabani} vt
 * @param {string} tablo
 * @param {Record<string, unknown>} degerler  (id, olusturulma, guncellenme HARİÇ sütunlar)
 * @param {{ id?: string; gecmisTuru?: string; yapan?: string }} secenekler
 * @returns {string} kayıt id'si
 */
function kaydetGenel(vt, tablo, degerler, secenekler) {
  return vt.islem(() => {
    const zaman = simdi();
    const id = secenekler.id ? kimlikKontrol(secenekler.id) : randomUUID();
    const onceki = hamSatir(vt, tablo, id);
    const sutunlar = Object.keys(degerler);
    if (onceki) {
      vt.calistir(
        `UPDATE ${tablo} SET ${sutunlar.map((s) => `${s} = ?`).join(', ')}, guncellenme = ? WHERE id = ?`,
        [...sutunlar.map((s) => degerler[s]), zaman, id]
      );
    } else {
      vt.calistir(
        `INSERT INTO ${tablo} (id, ${sutunlar.join(', ')}, olusturulma, guncellenme) VALUES (?, ${sutunlar.map(() => '?').join(', ')}, ?, ?)`,
        [id, ...sutunlar.map((s) => degerler[s]), zaman, zaman]
      );
    }
    if (secenekler.gecmisTuru) {
      gecmisYaz(vt, {
        varlikTuru: secenekler.gecmisTuru, varlikId: id, islem: onceki ? 'guncelle' : 'olustur',
        yapan: secenekler.yapan, onceki, sonraki: hamSatir(vt, tablo, id)
      });
    }
    return id;
  });
}

/**
 * @param {Veritabani} vt @param {string} tablo @param {string} id
 * @param {{ gecmisTuru?: string; yapan?: string }} [secenekler]
 */
function silGenel(vt, tablo, id, secenekler = {}) {
  return vt.islem(() => {
    const onceki = hamSatir(vt, tablo, id);
    if (!onceki) return false;
    vt.calistir(`DELETE FROM ${tablo} WHERE id = ?`, [id]);
    if (secenekler.gecmisTuru) {
      gecmisYaz(vt, { varlikTuru: secenekler.gecmisTuru, varlikId: id, islem: 'sil', yapan: secenekler.yapan, onceki });
    }
    return true;
  });
}

// ---------------------------------------------------------------------------------------
// Açılış
// ---------------------------------------------------------------------------------------

/**
 * Veritabanını açar, göçleri uygular ve bu makinenin kimliğini (yerel_makine_id) garanti eder.
 * Yerel makine kimliği YEDEKLE TAŞINMAZ: yedeği geri yükleyen her makine kendi kimliğini
 * korur; böylece birleştirilen koşular hangi makineden geldiğini kaybetmez.
 * @param {string | null} [yol] varsayılan: PLATFORM_VERITABANI veya veri/platform.db
 */
export async function veritabaniniHazirla(yol = veritabaniYolu()) {
  const vt = await veritabaniAc(yol);
  gocleriUygula(vt);
  yerelMakine(vt);
  return vt;
}

/**
 * Bu makinenin kimliği. makineler.ad şifreli bir sütundur: kasa kilitliyken/yokken satır
 * ad = '' (yer tutucu, gizli bilgi değil) ile oluşturulur; kasa açıkken çağrılınca şifreli
 * makine adıyla güncellenir. Dönen "ad" diskten değil, işletim sisteminden okunur.
 * @param {Veritabani} vt
 */
export function yerelMakine(vt) {
  let id = vt.metaOku('yerel_makine_id');
  if (!id) {
    id = randomUUID();
    const kimlik = id;
    vt.sayacsizIslem(() => vt.metaYaz('yerel_makine_id', kimlik));
  }
  const ad = hostname();
  const acik = kasaAcikMi(vt);
  const satir = vt.tek('SELECT id, ad, olusturulma FROM makineler WHERE id = ?', [id]);
  // Makine kaydı kullanıcı değişikliği sayılmaz (değişiklik sayacı artmaz — "son dışa aktarımdan beri değişti mi?").
  if (!satir) {
    vt.sayacsizIslem(() => vt.calistir('INSERT INTO makineler (id, ad, olusturulma) VALUES (?, ?, ?)', [id, acik ? sifrele(vt, ad) : '', simdi()]));
  } else if (acik) {
    const mevcut = satir.ad === '' ? '' : sifreliOku(vt, satir.ad);
    if (mevcut !== ad || !zarfMi(satir.ad)) vt.sayacsizIslem(() => vt.calistir('UPDATE makineler SET ad = ? WHERE id = ?', [sifrele(vt, ad), id]));
  }
  return { id, ad };
}

/** Kasa açık olmalıdır (makine adları şifreli). @param {Veritabani} vt */
export function makineleriListele(vt) {
  acikAnahtar(vt);
  return vt.tumu('SELECT id, ad, olusturulma FROM makineler ORDER BY olusturulma').map((s) => ({
    id: String(s.id), ad: s.ad === '' ? '' : String(sifreliOku(vt, s.ad)), olusturulma: String(s.olusturulma)
  }));
}

/**
 * Kasa kilitliyken de güvenle döndürülebilecek durum özeti: YALNIZCA gizli olmayan bilgi
 * (şema sürümü, kasa durumu, satır sayıları, makine kimliği). Şifreli sütunlara dokunmaz.
 * @param {Veritabani} vt
 */
export function platformDurumOzeti(vt) {
  const gocDurumu = vt.metaOku('sifreli_alan_gocu');
  return {
    semaSurumu: mevcutSemaSurumu(vt),
    desteklenenSemaSurumu: GUNCEL_SEMA_SURUMU,
    makineId: vt.metaOku('yerel_makine_id') ?? null,
    kasa: kasaDurumu(vt),
    /** 'bekliyor': v1'den kalan düz metin değerler kasa ilk açıldığında şifrelenecek. */
    sifreliAlanGocu: gocDurumu === 'tamam' ? 'tamam' : 'bekliyor',
    sayimlar: sayimlar(vt)
  };
}

/** Tablo başına satır sayıları (gizli bilgi içermez). @param {Veritabani} vt */
export function sayimlar(vt) {
  /** @type {Record<string, number>} */
  const sonuc = {};
  const mevcut = new Set(vt.tumu("SELECT name FROM sqlite_master WHERE type = 'table'").map((s) => String(s.name)));
  for (const tablo of TABLOLAR) {
    sonuc[tablo.ad] = mevcut.has(tablo.ad) ? Number(vt.tek(`SELECT COUNT(*) AS sayi FROM ${tablo.ad}`)?.sayi ?? 0) : 0;
  }
  return sonuc;
}

// ---------------------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------------------

/** Ayar değerleri şifrelidir: kasa açık olmalıdır. @param {Veritabani} vt @param {string} anahtar */
export function ayarGetir(vt, anahtar) {
  acikAnahtar(vt);
  const satir = vt.tek('SELECT deger_json FROM ayarlar WHERE anahtar = ?', [anahtar]);
  return satir ? jsonOku(sifreliOku(vt, satir.deger_json)) : undefined;
}

/** Kasa açık olmalıdır. @param {Veritabani} vt @param {string} anahtar @param {unknown} deger */
export function ayarYaz(vt, anahtar, deger) {
  zorunluMetin(anahtar, 'anahtar');
  vt.calistir(
    `INSERT INTO ayarlar (anahtar, deger_json, guncellenme) VALUES (?, ?, ?)
     ON CONFLICT(anahtar) DO UPDATE SET deger_json = excluded.deger_json, guncellenme = excluded.guncellenme`,
    [anahtar, sifreliYaz(vt, jsonMetni(JSON.stringify(deger ?? null), 'deger', 'herhangi')), simdi()]
  );
}

// ---------------------------------------------------------------------------------------
// Projeler ve ortamlar
// ---------------------------------------------------------------------------------------

/** @param {Record<string, unknown>} s */
const projeCevir = (s) => ({
  id: String(s.id), ad: String(s.ad), aciklama: s.aciklama == null ? null : String(s.aciklama),
  ayarlar: jsonOku(s.ayarlar_json), olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
});

/** @param {Veritabani} vt @param {{ id?: string; ad: string; aciklama?: string | null; ayarlar?: Record<string, unknown> }} girdi */
export function projeKaydet(vt, girdi) {
  const mevcut = girdi.id ? hamSatir(vt, 'projeler', girdi.id) : undefined;
  return kaydetGenel(vt, 'projeler', {
    ad: zorunluMetin(girdi.ad, 'ad'),
    aciklama: girdi.aciklama ?? null,
    ayarlar_json: jsonMetni(girdi.ayarlar ?? jsonOku(mevcut?.ayarlar_json) ?? {}, 'ayarlar')
  }, { id: girdi.id });
}

/** @param {Veritabani} vt @param {string} id */
export function projeGetir(vt, id) {
  const s = hamSatir(vt, 'projeler', id);
  return s ? projeCevir(s) : undefined;
}

/** @param {Veritabani} vt */
export function projeleriListele(vt) {
  return vt.tumu('SELECT * FROM projeler ORDER BY ad').map(projeCevir);
}

/** @param {Veritabani} vt @param {string} id */
export function projeSil(vt, id) {
  return silGenel(vt, 'projeler', id);
}

/** @param {Veritabani} vt @param {Record<string, unknown>} s */
const ortamCevir = (vt, s) => ({
  id: String(s.id), projeId: String(s.proje_id), ad: String(sifreliOku(vt, s.ad)), tabanUrl: String(sifreliOku(vt, s.taban_url)),
  varsayilan: s.varsayilan === 1,
  ayarlar: /** @type {Record<string, unknown>} */ (jsonOku(sifreliOku(vt, s.ayarlar_json ?? '{}')) ?? {}),
  olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
});

/**
 * Ortam adı, adresi ve ayarları şifrelidir: kasa açık olmalıdır. ayarlar verilmezse mevcut korunur.
 * @param {Veritabani} vt @param {{ id?: string; projeId: string; ad: string; tabanUrl: string; varsayilan?: boolean; ayarlar?: Record<string, unknown> }} girdi
 */
export function ortamKaydet(vt, girdi) {
  const tabanUrl = zorunluMetin(girdi.tabanUrl, 'tabanUrl');
  try {
    const url = new URL(tabanUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protokol');
  } catch {
    throw new DepoHatasi('"tabanUrl" geçerli bir http(s) adresi olmalıdır.');
  }
  return vt.islem(() => {
    if (girdi.varsayilan) {
      vt.calistir('UPDATE ortamlar SET varsayilan = 0 WHERE proje_id = ? AND id <> ?', [girdi.projeId, girdi.id ?? '']);
    }
    return kaydetGenel(vt, 'ortamlar', {
      proje_id: kimlikKontrol(girdi.projeId, 'projeId'), ad: sifreliYaz(vt, zorunluMetin(girdi.ad, 'ad')),
      taban_url: sifreliYaz(vt, tabanUrl), varsayilan: girdi.varsayilan ? 1 : 0,
      ayarlar_json: sifreliAyarMetni(vt, 'ortamlar', girdi.id, girdi.ayarlar)
    }, { id: girdi.id });
  });
}

/**
 * Şifreli "ayarlar_json" sütununa yazılacak değer: ayarlar verildiyse şifrelenir (kasa açık
 * olmalı); verilmediyse mevcut değer korunur; yeni kayıtta '{}' (kasa açıksa şifreli, değilse
 * düz — kasa ilk açılışta sifreliAlanlariTamamla ile şifreler).
 * @param {Veritabani} vt @param {string} tablo @param {string | undefined} id @param {Record<string, unknown> | undefined} ayarlar
 */
function sifreliAyarMetni(vt, tablo, id, ayarlar) {
  if (ayarlar !== undefined) return sifreliYaz(vt, jsonMetni(ayarlar, 'ayarlar'));
  const mevcut = id ? vt.tek(`SELECT ayarlar_json FROM ${tablo} WHERE id = ?`, [id]) : undefined;
  if (mevcut) return mevcut.ayarlar_json;
  return kasaAcikMi(vt) ? sifrele(vt, '{}') : '{}';
}

/** Kasa açık olmalıdır; sıralama çözülmüş ada göre yapılır. @param {Veritabani} vt @param {string} projeId */
export function ortamlariListele(vt, projeId) {
  acikAnahtar(vt);
  return vt.tumu('SELECT * FROM ortamlar WHERE proje_id = ?', [projeId])
    .map((s) => ortamCevir(vt, s))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

/** Kasa açık olmalıdır. @param {Veritabani} vt @param {string} id */
export function ortamGetir(vt, id) {
  acikAnahtar(vt);
  const s = hamSatir(vt, 'ortamlar', id);
  return s ? ortamCevir(vt, s) : undefined;
}

/** @param {Veritabani} vt @param {string} id */
export function ortamSil(vt, id) {
  return silGenel(vt, 'ortamlar', id);
}

// ---------------------------------------------------------------------------------------
// Giriş profilleri (şifreli: kullanici_adi, sms_ayari_json; gizli: parola, totp_gizli)
// ---------------------------------------------------------------------------------------

/**
 * @param {Veritabani} vt
 * @param {Record<string, unknown>} s
 * @param {boolean} cozulsun
 */
function girisProfiliCevir(vt, s, cozulsun) {
  const parolaZarfi = typeof s.parola === 'string' ? s.parola : null;
  const totpZarfi = typeof s.totp_gizli === 'string' ? s.totp_gizli : null;
  return {
    id: String(s.id), projeId: String(s.proje_id), ortamId: s.ortam_id == null ? null : String(s.ortam_id),
    ad: String(s.ad), kullaniciAdi: String(sifreliOku(vt, s.kullanici_adi)),
    ikiAsamaliTur: /** @type {'yok' | 'totp' | 'sms'} */ (String(s.iki_asamali_tur)),
    smsAyari: jsonOku(sifreliOku(vt, s.sms_ayari_json)),
    parolaVar: parolaZarfi !== null, totpGizliVar: totpZarfi !== null,
    parola: cozulsun && parolaZarfi ? coz(vt, parolaZarfi) : null,
    totpGizli: cozulsun && totpZarfi ? coz(vt, totpZarfi) : null,
    olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
  };
}

/**
 * Hassas girdi: undefined = mevcut değeri koru, null = sil, metin = şifreleyip yaz.
 * @param {Veritabani} vt @param {string | null | undefined} deger @param {unknown} mevcut
 */
function hassasDeger(vt, deger, mevcut) {
  if (deger === undefined) return mevcut ?? null;
  if (deger === null || deger === '') return null;
  if (typeof deger !== 'string') throw new DepoHatasi('Hassas alan değeri metin olmalıdır.');
  return sifrele(vt, deger);
}

/**
 * Kasa açık olmalıdır (kullanıcı adı ve SMS ayarı da şifreli yazılır).
 * @param {Veritabani} vt
 * @param {{ id?: string; projeId: string; ortamId?: string | null; ad: string; kullaniciAdi: string; parola?: string | null; ikiAsamaliTur?: 'yok' | 'totp' | 'sms'; totpGizli?: string | null; smsAyari?: Record<string, unknown>; yapan?: string }} girdi
 */
export function girisProfiliKaydet(vt, girdi) {
  return vt.islem(() => {
    const mevcut = girdi.id ? hamSatir(vt, 'giris_profilleri', girdi.id) : undefined;
    // Verilmezse mevcut 2FA türü korunur (yalnızca adı değiştiren güncelleme TOTP'yi silmesin).
    const tur = girdi.ikiAsamaliTur ?? (mevcut ? String(mevcut.iki_asamali_tur) : 'yok');
    if (!['yok', 'totp', 'sms'].includes(tur)) throw new DepoHatasi('"ikiAsamaliTur" yalnızca yok, totp veya sms olabilir.');
    const totp = hassasDeger(vt, girdi.totpGizli, mevcut?.totp_gizli);
    if (tur === 'totp' && !totp) throw new DepoHatasi('TOTP seçildiğinde "totpGizli" zorunludur.');
    return kaydetGenel(vt, 'giris_profilleri', {
      proje_id: kimlikKontrol(girdi.projeId, 'projeId'),
      ortam_id: girdi.ortamId ?? null,
      ad: zorunluMetin(girdi.ad, 'ad'),
      kullanici_adi: sifreliYaz(vt, zorunluMetin(girdi.kullaniciAdi, 'kullaniciAdi')),
      parola: hassasDeger(vt, girdi.parola, mevcut?.parola),
      iki_asamali_tur: tur,
      totp_gizli: tur === 'totp' ? totp : null,
      sms_ayari_json: sifreliYaz(vt, jsonMetni(girdi.smsAyari ?? jsonOku(sifreliOku(vt, mevcut?.sms_ayari_json)) ?? {}, 'smsAyari'))
    }, { id: girdi.id, gecmisTuru: 'giris_profili', yapan: girdi.yapan });
  });
}

/** @param {Veritabani} vt @param {string} id @param {{ coz?: boolean }} [secenekler] */
export function girisProfiliGetir(vt, id, secenekler = {}) {
  const s = hamSatir(vt, 'giris_profilleri', id);
  return s ? girisProfiliCevir(vt, s, Boolean(secenekler.coz)) : undefined;
}

/** Kasa açık olmalıdır. @param {Veritabani} vt @param {string} projeId */
export function girisProfilleriniListele(vt, projeId) {
  acikAnahtar(vt);
  return vt.tumu('SELECT * FROM giris_profilleri WHERE proje_id = ? ORDER BY ad', [projeId])
    .map((s) => girisProfiliCevir(vt, s, false));
}

/** @param {Veritabani} vt @param {string} id @param {string} [yapan] */
export function girisProfiliSil(vt, id, yapan) {
  return silGenel(vt, 'giris_profilleri', id, { gecmisTuru: 'giris_profili', yapan });
}

// ---------------------------------------------------------------------------------------
// Bağlam profilleri (rol/şirket/şube... — tür adını proje belirler)
// ---------------------------------------------------------------------------------------

// tur ve ad bilinçli olarak AÇIK tutulur (kasa kilitliyken de listede görünen ad); alanlar_json
// (kodlar/değerler) şifrelidir.

/** @param {Veritabani} vt @param {Record<string, unknown>} s @param {boolean} alanlarDahil */
const baglamCevir = (vt, s, alanlarDahil) => ({
  id: String(s.id), projeId: String(s.proje_id), ortamId: s.ortam_id == null ? null : String(s.ortam_id), tur: String(s.tur), ad: String(s.ad),
  alanlar: alanlarDahil ? /** @type {Record<string, unknown>} */ (jsonOku(sifreliOku(vt, s.alanlar_json))) : null,
  olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
});

/**
 * Kasa açık olmalıdır. ortamId: undefined = mevcut kapsamı koru (yeni kayıtta tüm ortamlar),
 * null = tüm ortamlar, kimlik = yalnızca o ortam.
 * @param {Veritabani} vt @param {{ id?: string; projeId: string; ortamId?: string | null; tur: string; ad: string; alanlar?: Record<string, unknown>; yapan?: string }} girdi
 */
export function baglamProfiliKaydet(vt, girdi) {
  return kaydetGenel(vt, 'baglam_profilleri', {
    proje_id: kimlikKontrol(girdi.projeId, 'projeId'), tur: zorunluMetin(girdi.tur, 'tur'),
    ad: zorunluMetin(girdi.ad, 'ad'), alanlar_json: sifreliYaz(vt, jsonMetni(girdi.alanlar ?? {}, 'alanlar')),
    ...ortamKapsami(vt, girdi.projeId, girdi.ortamId)
  }, { id: girdi.id, gecmisTuru: 'baglam_profili', yapan: girdi.yapan });
}

/**
 * Profil kapsamı sütunu: undefined → sütun yazılmaz (mevcut korunur), null → tüm ortamlar.
 * @param {Veritabani} vt @param {string} projeId @param {string | null | undefined} ortamId
 * @returns {Record<string, unknown>}
 */
function ortamKapsami(vt, projeId, ortamId) {
  if (ortamId === undefined) return {};
  if (ortamId === null || ortamId === '') return { ortam_id: null };
  const ortam = vt.tek('SELECT proje_id FROM ortamlar WHERE id = ?', [kimlikKontrol(ortamId, 'ortamId')]);
  if (!ortam || ortam.proje_id !== projeId) throw new DepoHatasi('Seçilen ortam bu projede bulunamadı.');
  return { ortam_id: ortamId };
}

/** Kasa açık olmalıdır. @param {Veritabani} vt @param {string} id */
export function baglamProfiliGetir(vt, id) {
  acikAnahtar(vt);
  const s = hamSatir(vt, 'baglam_profilleri', id);
  return s ? baglamCevir(vt, s, true) : undefined;
}

/**
 * Varsayılan: kasa açık olmalıdır (alanlar çözülür). { yalnizAd: true } ile kasa kilitliyken de
 * yalnızca tür/ad listelenir (alanlar: null).
 * @param {Veritabani} vt @param {string} projeId @param {string} [tur] @param {{ yalnizAd?: boolean }} [secenekler]
 */
export function baglamProfilleriniListele(vt, projeId, tur, secenekler = {}) {
  const alanlarDahil = !secenekler.yalnizAd;
  if (alanlarDahil) acikAnahtar(vt);
  const satirlar = tur
    ? vt.tumu('SELECT * FROM baglam_profilleri WHERE proje_id = ? AND tur = ? ORDER BY ad', [projeId, tur])
    : vt.tumu('SELECT * FROM baglam_profilleri WHERE proje_id = ? ORDER BY tur, ad', [projeId]);
  return satirlar.map((s) => baglamCevir(vt, s, alanlarDahil));
}

/** @param {Veritabani} vt @param {string} id @param {string} [yapan] */
export function baglamProfiliSil(vt, id, yapan) {
  return silGenel(vt, 'baglam_profilleri', id, { gecmisTuru: 'baglam_profili', yapan });
}

// ---------------------------------------------------------------------------------------
// Test verisi türleri ve profilleri (hassas alanlar türde işaretlenir)
// ---------------------------------------------------------------------------------------

/** @param {unknown} alanlar */
function turAlanlariniDogrula(alanlar) {
  if (!Array.isArray(alanlar)) throw new DepoHatasi('"alanlar" bir dizi olmalıdır.');
  const adlar = new Set();
  return alanlar.map((a, i) => {
    if (typeof a !== 'object' || a === null) throw new DepoHatasi(`alanlar[${i}] bir nesne olmalıdır.`);
    const alan = /** @type {Record<string, unknown>} */ (a);
    const ad = zorunluMetin(alan.ad, `alanlar[${i}].ad`);
    if (adlar.has(ad)) throw new DepoHatasi(`Alan adı tekrar ediyor: "${ad}".`);
    adlar.add(ad);
    return {
      ad,
      etiket: typeof alan.etiket === 'string' ? alan.etiket : ad,
      tip: typeof alan.tip === 'string' ? alan.tip : 'metin',
      // Kullanıcı kararı: test verisindeki TÜM alanlar varsayılan olarak hassastır (şifreli);
      // yalnızca açıkça hassas: false verilen alan düz metin saklanır.
      // gizli: tablo sütunu ekranda hiç gösterilmez (parola vb.); gizli olan her zaman hassastır (şifreli).
      hassas: alan.hassas !== false || alan.gizli === true,
      ...(alan.gizli === true ? { gizli: true } : {}),
      // Tablo sütununun değer karşılıkları (sayfa / servis değeri; tablo-deposu.mjs): anahtarlar değer olduğu için kasa zarfı.
      ...(zarfMi(alan.karsiliklar) ? { karsiliklar: alan.karsiliklar } : {}),
      // Verilmezse (undefined) kayıtta mevcut eşleme korunur (bkz. testVerisiTuruKaydet).
      ...(alan.servisParametreleri !== undefined ? { servisParametreleri: servisParametreleriniDogrula(alan.servisParametreleri, ad) } : {})
    };
  });
}

/** Servis parametresi adı (servis gövdesinde ${AD}): harf ya da "_" ile başlar. */
export const SERVIS_PARAMETRESI_ADI = /^[A-Za-z_][A-Za-z0-9_.-]{0,79}$/;
/** Rol: aynı türün farklı kişileri (ör. sigortalı / sigorta ettiren) için ayrı profil seçilebilsin diye. */
const ROL_ADI = /^[\p{L}\p{N}_-]{1,40}$/u;

/**
 * Test verisi alanının servislerde karşılık geldiği parametreler: [{ ad, rol? }]. rol boşsa "varsayilan".
 * @param {unknown} liste @param {string} alanAdi @returns {Array<{ ad: string; rol: string }>}
 */
function servisParametreleriniDogrula(liste, alanAdi) {
  if (!Array.isArray(liste)) throw new DepoHatasi(`"${alanAdi}" alanının servis parametreleri bir dizi olmalıdır.`);
  return liste.map((x) => {
    const o = /** @type {Record<string, unknown>} */ (typeof x === 'object' && x !== null ? x : {});
    const ad = typeof o.ad === 'string' ? o.ad.trim() : '';
    if (!SERVIS_PARAMETRESI_ADI.test(ad)) throw new DepoHatasi(`"${alanAdi}" alanında geçersiz servis parametresi adı: "${ad}" (harf ya da "_" ile başlar; harf, rakam, "_", ".", "-").`);
    const rol = typeof o.rol === 'string' && o.rol.trim() ? o.rol.trim() : 'varsayilan';
    if (!ROL_ADI.test(rol)) throw new DepoHatasi(`"${ad}" parametresinin rolü geçersiz: "${rol}" (harf, rakam, "_", "-").`);
    return { ad, rol };
  });
}

/** @param {Record<string, unknown>} s */
const turCevir = (s) => ({
  id: String(s.id), projeId: String(s.proje_id), ad: String(s.ad),
  alanlar: /** @type {Array<{ ad: string; etiket: string; tip: string; hassas: boolean; servisParametreleri?: Array<{ ad: string; rol: string }> }>} */ (jsonOku(s.alanlar_json)),
  olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
});

/** @param {Veritabani} vt @param {{ id?: string; projeId: string; ad: string; alanlar: ReadonlyArray<{ ad: string; etiket?: string; tip?: string; hassas?: boolean; gizli?: boolean }> }} girdi */
export function testVerisiTuruKaydet(vt, girdi) {
  const alanlar = turAlanlariniDogrula(girdi.alanlar);
  return vt.islem(() => {
    const mevcutTur = girdi.id ? hamSatir(vt, 'test_verisi_turleri', girdi.id) : undefined;
    // Servis parametresi eşlemesi verilmeyen alan (ör. koddan aktarım) mevcut eşlemesini korur.
    if (mevcutTur) {
      const eskiEsleme = new Map(turCevir(mevcutTur).alanlar.map((a) => [a.ad, a.servisParametreleri]));
      for (const a of alanlar) {
        const eski = eskiEsleme.get(a.ad);
        if (a.servisParametreleri === undefined && eski?.length) a.servisParametreleri = eski;
      }
    }
    // Bir servis parametresi projede tek bir türün tek bir alanına karşılık gelir.
    /** @type {Map<string, string>} */
    const sahipler = new Map();
    for (const s of vt.tumu('SELECT id, ad, alanlar_json FROM test_verisi_turleri WHERE proje_id = ?', [girdi.projeId])) {
      if (s.id === girdi.id) continue;
      for (const a of turCevir(s).alanlar) for (const sp of a.servisParametreleri ?? []) sahipler.set(sp.ad, `"${s.ad}" türünün "${a.ad}" alanı`);
    }
    for (const a of alanlar) {
      for (const sp of a.servisParametreleri ?? []) {
        const sahip = sahipler.get(sp.ad);
        if (sahip) throw new DepoHatasi(`"${sp.ad}" servis parametresi zaten ${sahip} ile eşli.`);
        sahipler.set(sp.ad, `bu türün "${a.ad}" alanı`);
      }
    }
    if (girdi.id) {
      const mevcut = mevcutTur;
      if (mevcut) {
        // Hassaslığı değişen alanların mevcut profillerdeki değerleri AYNI işlemde dönüştürülür
        // (hassas olan şifrelenir, hassaslığı kaldırılan çözülür; kasa açık olmalı).
        const eski = new Map(turCevir(mevcut).alanlar.map((a) => [a.ad, a.hassas]));
        const degisenler = alanlar.filter((a) => eski.has(a.ad) && eski.get(a.ad) !== a.hassas);
        if (degisenler.length) profilHassasliginiDonustur(vt, girdi.id, new Map(degisenler.map((a) => [a.ad, a.hassas])));
      }
    }
    return kaydetGenel(vt, 'test_verisi_turleri', {
      proje_id: kimlikKontrol(girdi.projeId, 'projeId'), ad: zorunluMetin(girdi.ad, 'ad'),
      alanlar_json: JSON.stringify(alanlar)
    }, { id: girdi.id });
  });
}

/**
 * Bir türün profillerinde verilen alanların saklama biçimini değiştirir: hassas=true → düz değer
 * kasa zarfına çevrilir; hassas=false → zarf çözülür. Profillerin değişiklik geçmişindeki anlık
 * görüntüler de (onceki/sonraki degerler_json) aynı biçime getirilir; böylece hassas yapılan bir
 * alanın eski düz metin değeri geçmişte de kalmaz (secure_delete eski sayfaları sıfırlar).
 * Kasa açık olmalıdır (acikAnahtar). Profillerin kendisi için geçmiş kaydı yazılmaz (içerik değişmedi).
 * @param {Veritabani} vt @param {string} turId @param {Map<string, boolean>} yeniHassaslik alan adı → yeni hassas değeri
 * @returns {number} dönüştürülen değer sayısı
 */
export function profilHassasliginiDonustur(vt, turId, yeniHassaslik) {
  acikAnahtar(vt);
  let sayi = 0;
  /** @param {Record<string, unknown>} degerler */
  const donustur = (degerler) => {
    let degisti = false;
    /** @type {Record<string, unknown>} */
    const yeni = { ...degerler };
    for (const [ad, hassas] of yeniHassaslik) {
      const v = yeni[ad];
      if (v === undefined || v === null || v === '') continue;
      if (hassas && !zarfMi(v)) { yeni[ad] = sifrele(vt, String(v)); degisti = true; sayi++; }
      else if (!hassas && zarfMi(v)) { yeni[ad] = coz(vt, v); degisti = true; sayi++; }
    }
    return degisti ? yeni : null;
  };
  return vt.islem(() => {
    const profiller = vt.tumu('SELECT id, degerler_json FROM test_verisi_profilleri WHERE tur_id = ?', [turId]);
    for (const p of profiller) {
      const yeni = donustur(/** @type {Record<string, unknown>} */ (jsonOku(p.degerler_json) ?? {}));
      if (yeni) vt.calistir('UPDATE test_verisi_profilleri SET degerler_json = ? WHERE id = ?', [JSON.stringify(yeni), p.id]);
    }
    const kimlikler = profiller.map((p) => String(p.id));
    for (const g of kimlikler.length ? vt.tumu(
      `SELECT id, onceki_json, sonraki_json FROM degisiklik_gecmisi WHERE varlik_turu = 'test_verisi_profili' AND varlik_id IN (${kimlikler.map(() => '?').join(', ')})`,
      kimlikler
    ) : []) {
      /** @type {Record<string, unknown>} */
      const guncel = {};
      for (const sutun of ['onceki_json', 'sonraki_json']) {
        const anlik = /** @type {Record<string, unknown> | null} */ (jsonOku(g[sutun]));
        if (!anlik || typeof anlik.degerler_json !== 'string') continue;
        const yeni = donustur(/** @type {Record<string, unknown>} */ (JSON.parse(anlik.degerler_json)));
        if (yeni) guncel[sutun] = JSON.stringify({ ...anlik, degerler_json: JSON.stringify(yeni) });
      }
      const sutunlar = Object.keys(guncel);
      if (sutunlar.length) {
        vt.calistir(`UPDATE degisiklik_gecmisi SET ${sutunlar.map((x) => `${x} = ?`).join(', ')} WHERE id = ?`, [...sutunlar.map((x) => guncel[x]), g.id]);
      }
    }
    return sayi;
  });
}

/** @param {Veritabani} vt @param {string} projeId */
export function testVerisiTurleriniListele(vt, projeId) {
  return vt.tumu('SELECT * FROM test_verisi_turleri WHERE proje_id = ? ORDER BY ad', [projeId]).map(turCevir);
}

/** Türü ve (ON DELETE CASCADE ile) o türün tüm profillerini siler. @param {Veritabani} vt @param {string} id */
export function testVerisiTuruSil(vt, id) {
  return silGenel(vt, 'test_verisi_turleri', id);
}

/** @param {Veritabani} vt @param {string} turId */
function turGetir(vt, turId) {
  const s = hamSatir(vt, 'test_verisi_turleri', turId);
  if (!s) throw new DepoHatasi('Test verisi türü bulunamadı.');
  return turCevir(s);
}

/**
 * @param {Veritabani} vt @param {Record<string, unknown>} s @param {boolean} cozulsun
 */
function testVerisiProfiliCevir(vt, s, cozulsun) {
  const tur = turGetir(vt, String(s.tur_id));
  const hassasAlanlar = tur.alanlar.filter((a) => a.hassas).map((a) => a.ad);
  const hamDegerler = /** @type {Record<string, unknown>} */ (jsonOku(s.degerler_json) ?? {});
  /** @type {Record<string, unknown>} */
  const degerler = {};
  for (const [ad, deger] of Object.entries(hamDegerler)) {
    if (hassasAlanlar.includes(ad)) degerler[ad] = cozulsun && zarfMi(deger) ? coz(vt, deger) : null;
    else degerler[ad] = deger;
  }
  // Değeri kayıtlı (boş olmayan) hassas alanlar — arayüz "kayıtlı" maskesini buna göre gösterir.
  const doluHassasAlanlar = hassasAlanlar.filter((ad) => hamDegerler[ad] !== undefined && hamDegerler[ad] !== null && hamDegerler[ad] !== '');
  return {
    id: String(s.id), projeId: String(s.proje_id), turId: String(s.tur_id), ortamId: s.ortam_id == null ? null : String(s.ortam_id), ad: String(s.ad), degerler,
    hassasAlanlar, doluHassasAlanlar, olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
  };
}

/**
 * degerler: hassas alanda undefined (anahtar yok) = mevcut şifreli değeri koru.
 * @param {Veritabani} vt
 * ortamId: baglamProfiliKaydet ile aynı kural (undefined = koru, null = tüm ortamlar).
 * @param {{ id?: string; projeId: string; turId: string; ortamId?: string | null; ad: string; degerler: Record<string, string | number | boolean | null>; yapan?: string }} girdi
 */
export function testVerisiProfiliKaydet(vt, girdi) {
  return vt.islem(() => {
    const tur = turGetir(vt, kimlikKontrol(girdi.turId, 'turId'));
    if (tur.projeId !== girdi.projeId) throw new DepoHatasi('Test verisi türü bu projeye ait değil.');
    const tanimli = new Map(tur.alanlar.map((a) => [a.ad, a]));
    const mevcut = girdi.id ? hamSatir(vt, 'test_verisi_profilleri', girdi.id) : undefined;
    const mevcutDegerler = /** @type {Record<string, unknown>} */ (jsonOku(mevcut?.degerler_json) ?? {});
    if (typeof girdi.degerler !== 'object' || girdi.degerler === null) throw new DepoHatasi('"degerler" bir nesne olmalıdır.');
    /** @type {Record<string, unknown>} */
    const yazilacak = {};
    for (const [ad, deger] of Object.entries(girdi.degerler)) {
      const alan = tanimli.get(ad);
      if (!alan) throw new DepoHatasi(`"${ad}" alanı "${tur.ad}" türünde tanımlı değil.`);
      if (deger !== null && !['string', 'number', 'boolean'].includes(typeof deger)) {
        throw new DepoHatasi(`"${ad}" alanının değeri metin, sayı veya mantıksal olmalıdır.`);
      }
      yazilacak[ad] = alan.hassas && deger !== null && deger !== '' ? sifrele(vt, String(deger)) : deger;
    }
    for (const alan of tur.alanlar) {
      if (alan.hassas && !(alan.ad in girdi.degerler) && alan.ad in mevcutDegerler) yazilacak[alan.ad] = mevcutDegerler[alan.ad];
    }
    return kaydetGenel(vt, 'test_verisi_profilleri', {
      proje_id: kimlikKontrol(girdi.projeId, 'projeId'), tur_id: girdi.turId, ad: zorunluMetin(girdi.ad, 'ad'),
      degerler_json: JSON.stringify(yazilacak), ...ortamKapsami(vt, girdi.projeId, girdi.ortamId)
    }, { id: girdi.id, gecmisTuru: 'test_verisi_profili', yapan: girdi.yapan });
  });
}

/** @param {Veritabani} vt @param {string} id @param {{ coz?: boolean }} [secenekler] */
export function testVerisiProfiliGetir(vt, id, secenekler = {}) {
  const s = hamSatir(vt, 'test_verisi_profilleri', id);
  return s ? testVerisiProfiliCevir(vt, s, Boolean(secenekler.coz)) : undefined;
}

/** @param {Veritabani} vt @param {string} projeId @param {string} [turId] */
export function testVerisiProfilleriniListele(vt, projeId, turId) {
  const satirlar = turId
    ? vt.tumu('SELECT * FROM test_verisi_profilleri WHERE proje_id = ? AND tur_id = ? ORDER BY ad', [projeId, turId])
    : vt.tumu('SELECT * FROM test_verisi_profilleri WHERE proje_id = ? ORDER BY ad', [projeId]);
  return satirlar.map((s) => testVerisiProfiliCevir(vt, s, false));
}

/** @param {Veritabani} vt @param {string} id @param {string} [yapan] */
export function testVerisiProfiliSil(vt, id, yapan) {
  return silGenel(vt, 'test_verisi_profilleri', id, { gecmisTuru: 'test_verisi_profili', yapan });
}

// ---------------------------------------------------------------------------------------
// Ekranlar ve ekran modelleri (sürümlü)
// ---------------------------------------------------------------------------------------

/** @param {Record<string, unknown>} s */
const ekranCevir = (s) => ({
  id: String(s.id), projeId: String(s.proje_id), anahtar: String(s.anahtar), ad: String(s.ad),
  aciklama: s.aciklama == null ? null : String(s.aciklama), olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme),
  durum: /** @type {'etkin' | 'devre_disi' | 'silindi'} */ (s.durum === 'devre_disi' || s.durum === 'silindi' ? s.durum : 'etkin'),
  sira: s.sira == null ? null : Number(s.sira)
});

/**
 * ayarlar (şifreli) verilirse kasa açık olmalıdır; verilmezse mevcut ayarlar korunur.
 * @param {Veritabani} vt @param {{ id?: string; projeId: string; anahtar: string; ad: string; aciklama?: string | null; ayarlar?: Record<string, unknown> }} girdi
 */
export function ekranKaydet(vt, girdi) {
  return kaydetGenel(vt, 'ekranlar', {
    proje_id: kimlikKontrol(girdi.projeId, 'projeId'), anahtar: zorunluMetin(girdi.anahtar, 'anahtar'),
    ad: zorunluMetin(girdi.ad, 'ad'), aciklama: girdi.aciklama ?? null,
    ayarlar_json: sifreliAyarMetni(vt, 'ekranlar', girdi.id, girdi.ayarlar)
  }, { id: girdi.id });
}

/**
 * Ekranlar (ayarlar HARİÇ; kasa kilitliyken de çalışır). Sıra: elle verilen sıra (ekranlar.sira), sonra ad.
 * SİLİNMİŞ ekranlar (mezar taşı; durum 'silindi') yalnızca silinenlerDahil ile döner.
 * @param {Veritabani} vt @param {string} projeId @param {{ silinenlerDahil?: boolean }} [secenekler]
 */
export function ekranlariListele(vt, projeId, secenekler = {}) {
  const kosul = secenekler.silinenlerDahil ? '' : " AND durum <> 'silindi'";
  return vt.tumu(`SELECT * FROM ekranlar WHERE proje_id = ?${kosul} ORDER BY (sira IS NULL), sira, ad`, [projeId]).map(ekranCevir);
}

/** Ekran ayarları şifrelidir: kasa açık olmalıdır. @param {Veritabani} vt @param {string} ekranId */
export function ekranAyarlariniGetir(vt, ekranId) {
  acikAnahtar(vt);
  const s = vt.tek('SELECT ayarlar_json FROM ekranlar WHERE id = ?', [ekranId]);
  if (!s) return undefined;
  return /** @type {Record<string, unknown>} */ (jsonOku(sifreliOku(vt, s.ayarlar_json ?? '{}')) ?? {});
}

/** @param {Record<string, unknown>} s */
const ekranModeliCevir = (s) => ({
  id: String(s.id), ekranId: String(s.ekran_id), surum: Number(s.surum), model: jsonOku(s.model_json),
  aciklama: s.aciklama == null ? null : String(s.aciklama), olusturulma: String(s.olusturulma)
});

/**
 * Yeni bir model sürümü ekler (sürümler değişmez). @returns eklenen sürüm
 * @param {Veritabani} vt @param {{ ekranId: string; model: Record<string, unknown>; aciklama?: string | null }} girdi
 */
export function ekranModeliEkle(vt, girdi) {
  // Çoklu akış: varsayılan akışın kopyası her zaman model.adimlar ile aynı yazılır (bkz. model-formu.mjs > akislariEsitle).
  const m = girdi.model;
  if (m && Array.isArray(m.akislar)) m.akislar = m.akislar.map((a) => (a && typeof a === 'object' && a.varsayilan === true ? { ...a, adimlar: m.adimlar } : a));
  return vt.islem(() => {
    if (!hamSatir(vt, 'ekranlar', girdi.ekranId)) throw new DepoHatasi('Ekran bulunamadı.');
    const surum = Number(vt.tek('SELECT COALESCE(MAX(surum), 0) AS s FROM ekran_modelleri WHERE ekran_id = ?', [girdi.ekranId])?.s ?? 0) + 1;
    const id = randomUUID();
    vt.calistir(
      'INSERT INTO ekran_modelleri (id, ekran_id, surum, model_json, aciklama, olusturulma) VALUES (?, ?, ?, ?, ?, ?)',
      [id, girdi.ekranId, surum, jsonMetni(girdi.model, 'model'), girdi.aciklama ?? null, simdi()]
    );
    return { id, surum };
  });
}

/** @param {Veritabani} vt @param {string} ekranId @param {number} [surum] verilmezse en son sürüm */
export function ekranModeliGetir(vt, ekranId, surum) {
  const s = surum === undefined
    ? vt.tek('SELECT * FROM ekran_modelleri WHERE ekran_id = ? ORDER BY surum DESC LIMIT 1', [ekranId])
    : vt.tek('SELECT * FROM ekran_modelleri WHERE ekran_id = ? AND surum = ?', [ekranId, surum]);
  return s ? ekranModeliCevir(s) : undefined;
}

// ---------------------------------------------------------------------------------------
// Senaryolar (+ değişiklik geçmişi)
// ---------------------------------------------------------------------------------------

/** @param {Record<string, unknown>} s */
const senaryoCevir = (s) => ({
  id: String(s.id), projeId: String(s.proje_id), ekranId: s.ekran_id == null ? null : String(s.ekran_id),
  baslik: String(s.baslik), icerik: /** @type {Record<string, unknown>} */ (jsonOku(s.icerik_json)),
  kosuyaDahil: s.kosuya_dahil === 1, olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
});

/**
 * id verilir ve kayıt yoksa o id ile oluşturulur (dosyadan taşımada kararlı kimlik için).
 * @param {Veritabani} vt
 * @param {{ id?: string; projeId: string; ekranId?: string | null; baslik: string; icerik: Record<string, unknown>; kosuyaDahil?: boolean; yapan?: string }} girdi
 */
export function senaryoKaydet(vt, girdi) {
  const mevcut = girdi.id ? hamSatir(vt, 'senaryolar', girdi.id) : undefined;
  return kaydetGenel(vt, 'senaryolar', {
    proje_id: kimlikKontrol(girdi.projeId, 'projeId'), ekran_id: girdi.ekranId ?? null,
    baslik: zorunluMetin(girdi.baslik, 'baslik'), icerik_json: jsonMetni(girdi.icerik, 'icerik'),
    kosuya_dahil: girdi.kosuyaDahil === undefined ? (mevcut ? mevcut.kosuya_dahil : 1) : girdi.kosuyaDahil ? 1 : 0
  }, { id: girdi.id, gecmisTuru: 'senaryo', yapan: girdi.yapan });
}

/** @param {Veritabani} vt @param {string} id */
export function senaryoGetir(vt, id) {
  const s = hamSatir(vt, 'senaryolar', id);
  return s ? senaryoCevir(s) : undefined;
}

/** @param {Veritabani} vt @param {{ projeId: string; ekranId?: string; kosuyaDahil?: boolean }} filtre */
export function senaryolariListele(vt, filtre) {
  const kosullar = ['proje_id = ?'];
  /** @type {unknown[]} */
  const parametreler = [filtre.projeId];
  if (filtre.ekranId) { kosullar.push('ekran_id = ?'); parametreler.push(filtre.ekranId); }
  if (filtre.kosuyaDahil !== undefined) { kosullar.push('kosuya_dahil = ?'); parametreler.push(filtre.kosuyaDahil ? 1 : 0); }
  return vt.tumu(`SELECT * FROM senaryolar WHERE ${kosullar.join(' AND ')} ORDER BY baslik`, parametreler).map(senaryoCevir);
}

/** @param {Veritabani} vt @param {string} id @param {boolean} dahil @param {string} [yapan] */
export function senaryoKosuyaDahilAyarla(vt, id, dahil, yapan) {
  const mevcut = senaryoGetir(vt, id);
  if (!mevcut) throw new DepoHatasi('Senaryo bulunamadı.');
  if (mevcut.kosuyaDahil === dahil) return id;
  return senaryoKaydet(vt, { ...mevcut, kosuyaDahil: dahil, yapan });
}

/** @param {Veritabani} vt @param {string} id @param {string} [yapan] */
export function senaryoSil(vt, id, yapan) {
  return silGenel(vt, 'senaryolar', id, { gecmisTuru: 'senaryo', yapan });
}

/** @param {Veritabani} vt @param {string} varlikTuru @param {string} varlikId */
export function degisiklikGecmisiListele(vt, varlikTuru, varlikId) {
  return vt.tumu(
    'SELECT * FROM degisiklik_gecmisi WHERE varlik_turu = ? AND varlik_id = ? ORDER BY zaman, rowid',
    [varlikTuru, varlikId]
  ).map((s) => ({
    id: String(s.id), varlikTuru: String(s.varlik_turu), varlikId: String(s.varlik_id),
    islem: /** @type {'olustur' | 'guncelle' | 'sil' | 'birlestirme_cakismasi' | 'ice_aktarma_uzerine_yazildi'} */ (String(s.islem)),
    yapan: String(s.yapan), makineId: s.makine_id == null ? null : String(s.makine_id), zaman: String(s.zaman),
    onceki: /** @type {Record<string, unknown> | null} */ (jsonOku(s.onceki_json)),
    sonraki: /** @type {Record<string, unknown> | null} */ (jsonOku(s.sonraki_json)),
    aciklama: s.aciklama == null ? null : String(s.aciklama)
  }));
}

// ---------------------------------------------------------------------------------------
// Koşular ve sonuçlar
// ---------------------------------------------------------------------------------------

/** @param {Record<string, unknown>} s */
const kosuCevir = (s) => ({
  id: String(s.id), projeId: s.proje_id == null ? null : String(s.proje_id),
  ortamId: s.ortam_id == null ? null : String(s.ortam_id), makineId: String(s.makine_id), tur: String(s.tur),
  durum: String(s.durum), baslangic: String(s.baslangic), bitis: s.bitis == null ? null : String(s.bitis),
  ozet: /** @type {Record<string, unknown>} */ (jsonOku(s.ozet_json))
});

/** @param {Veritabani} vt @param {{ id?: string; projeId?: string | null; ortamId?: string | null; tur?: string }} girdi */
export function kosuOlustur(vt, girdi) {
  const id = girdi.id ? kimlikKontrol(girdi.id) : randomUUID();
  const makine = yerelMakine(vt);
  vt.calistir(
    'INSERT INTO kosular (id, proje_id, ortam_id, makine_id, tur, durum, baslangic, ozet_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, girdi.projeId ?? null, girdi.ortamId ?? null, makine.id, girdi.tur ?? 'tekil', 'calisiyor', simdi(), '{}']
  );
  return id;
}

/** @param {Veritabani} vt @param {string} id @param {{ durum: string; ozet?: Record<string, unknown> }} girdi */
export function kosuBitir(vt, id, girdi) {
  vt.calistir('UPDATE kosular SET durum = ?, bitis = ?, ozet_json = ? WHERE id = ?', [
    zorunluMetin(girdi.durum, 'durum'), simdi(), jsonMetni(girdi.ozet ?? {}, 'ozet'), id
  ]);
}

/**
 * @param {Veritabani} vt
 * @param {{ kosuId: string; senaryoId?: string | null; senaryoBaslik: string; durum: string; sureMs?: number | null; hataMesaji?: string | null; ekler?: Record<string, unknown>; baslangic?: string | null; bitis?: string | null }} girdi
 */
export function kosuSonucuEkle(vt, girdi) {
  const id = randomUUID();
  vt.calistir(
    `INSERT INTO kosu_sonuclari (id, kosu_id, senaryo_id, senaryo_baslik, durum, sure_ms, hata_mesaji, ekler_json, baslangic, bitis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, girdi.kosuId, girdi.senaryoId ?? null, zorunluMetin(girdi.senaryoBaslik, 'senaryoBaslik'), zorunluMetin(girdi.durum, 'durum'),
      girdi.sureMs ?? null, girdi.hataMesaji ?? null, jsonMetni(girdi.ekler ?? {}, 'ekler'), girdi.baslangic ?? null, girdi.bitis ?? null]
  );
  return id;
}

/** @param {Veritabani} vt @param {{ projeId?: string; limit?: number }} [filtre] */
export function kosulariListele(vt, filtre = {}) {
  const limit = Math.max(1, Math.min(Number(filtre.limit) || 100, 10000));
  const satirlar = filtre.projeId
    ? vt.tumu('SELECT * FROM kosular WHERE proje_id = ? ORDER BY baslangic DESC LIMIT ?', [filtre.projeId, limit])
    : vt.tumu('SELECT * FROM kosular ORDER BY baslangic DESC LIMIT ?', [limit]);
  return satirlar.map(kosuCevir);
}

/** @param {Veritabani} vt @param {string} kosuId */
export function kosuSonuclariniListele(vt, kosuId) {
  return vt.tumu('SELECT * FROM kosu_sonuclari WHERE kosu_id = ? ORDER BY rowid', [kosuId]).map((s) => ({
    id: String(s.id), kosuId: String(s.kosu_id), senaryoId: s.senaryo_id == null ? null : String(s.senaryo_id),
    senaryoBaslik: String(s.senaryo_baslik), durum: String(s.durum), sureMs: s.sure_ms == null ? null : Number(s.sure_ms),
    hataMesaji: s.hata_mesaji == null ? null : String(s.hata_mesaji),
    ekler: /** @type {Record<string, unknown>} */ (jsonOku(s.ekler_json)),
    baslangic: s.baslangic == null ? null : String(s.baslangic), bitis: s.bitis == null ? null : String(s.bitis)
  }));
}

// ---------------------------------------------------------------------------------------
// Kaynak eşlemeleri (dış kaynaktan aktarılan kayıtlar: kaynak anahtarı → varlık kimliği)
// ---------------------------------------------------------------------------------------
// kaynak_anahtari ve varlik_id AÇIKTIR (ör. senaryo için "<dosya>::<başlık>"; koşu listesi kasa
// kilitliyken de çözülebilsin diye). kaynak_ozeti şifrelidir (kaynağın içeriğinden türetilen özet;
// düz özet, düşük entropili değerlerde tahmin edilebilirdi).

/** @param {Record<string, unknown>} s */
const eslemeCevir = (s) => ({
  id: String(s.id), projeId: String(s.proje_id), varlikTuru: String(s.varlik_turu), kaynakAnahtari: String(s.kaynak_anahtari),
  varlikId: String(s.varlik_id), kaynakOzetiZarfi: s.kaynak_ozeti == null ? null : String(s.kaynak_ozeti),
  olusturulma: String(s.olusturulma), guncellenme: String(s.guncellenme)
});

/** Kasa gerektirmez (özet zarfı çözülmeden döner). @param {Veritabani} vt @param {string} projeId @param {string} [varlikTuru] */
export function kaynakEslemeleriniListele(vt, projeId, varlikTuru) {
  const satirlar = varlikTuru
    ? vt.tumu('SELECT * FROM kaynak_eslemeleri WHERE proje_id = ? AND varlik_turu = ? ORDER BY rowid', [projeId, varlikTuru])
    : vt.tumu('SELECT * FROM kaynak_eslemeleri WHERE proje_id = ? ORDER BY rowid', [projeId]);
  return satirlar.map(eslemeCevir);
}

/**
 * Eşlemeyi ekler/günceller (kasa açık olmalı: özet şifrelenir).
 * @param {Veritabani} vt
 * @param {{ id: string; projeId: string; varlikTuru: string; kaynakAnahtari: string; varlikId: string; kaynakOzeti: string | null }} girdi
 */
export function kaynakEslemesiYaz(vt, girdi) {
  const zaman = simdi();
  vt.calistir(
    `INSERT INTO kaynak_eslemeleri (id, proje_id, varlik_turu, kaynak_anahtari, varlik_id, kaynak_ozeti, olusturulma, guncellenme)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(proje_id, varlik_turu, kaynak_anahtari) DO UPDATE SET
       varlik_id = excluded.varlik_id, kaynak_ozeti = excluded.kaynak_ozeti, guncellenme = excluded.guncellenme`,
    [kimlikKontrol(girdi.id), kimlikKontrol(girdi.projeId, 'projeId'), zorunluMetin(girdi.varlikTuru, 'varlikTuru'),
      zorunluMetin(girdi.kaynakAnahtari, 'kaynakAnahtari'), kimlikKontrol(girdi.varlikId, 'varlikId'),
      girdi.kaynakOzeti === null ? null : sifrele(vt, girdi.kaynakOzeti), zaman, zaman]
  );
}

/** @param {Veritabani} vt @param {string} projeId @param {string} varlikTuru @param {string} kaynakAnahtari */
export function kaynakEslemesiSil(vt, projeId, varlikTuru, kaynakAnahtari) {
  vt.calistir('DELETE FROM kaynak_eslemeleri WHERE proje_id = ? AND varlik_turu = ? AND kaynak_anahtari = ?', [projeId, varlikTuru, kaynakAnahtari]);
}

/** Şifreli özet zarfını çözer (kasa açık olmalı). @param {Veritabani} vt @param {string | null} zarf */
export function kaynakOzetiniCoz(vt, zarf) {
  if (!zarf) return null;
  return zarfMi(zarf) ? coz(vt, zarf) : zarf;
}
