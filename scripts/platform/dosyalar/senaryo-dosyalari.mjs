// SENARYO DOSYALARI (genel) — senaryoların ve ekran ayarlarının kullandığı dosyalar (ör. çoklu sorgu Excel'i:
// sigortalı listesi) diskte YALNIZCA ŞİFRELİ durur: şifreli medya deposunda (medya.mjs; tür 'senaryo-dosyasi').
// Düz metin HİÇBİR ZAMAN kalıcı olarak diske yazılmaz: yükleme bellekte şifrelenir; koşu anında test süreci
// dosyayı yalnızca kullanıcının okuyabildiği koşuya özel geçici bir klasöre çözer (gecici-dosyalar.mjs) ve koşu
// bitince silinir.
//
// Senaryo verisinde / ekran ayarlarında dosya bir REFERANS metnidir: "nobetci-dosya://<medya kimliği>/<dosya adı>".
// Metin dosya adıyla bittiği için mevcut doğrulamalar (uzantı kontrolü, "dosya adıyla biter" beklentisi) aynen
// çalışır; koşuda referans, çözülmüş geçici dosyanın mutlak yoluyla değiştirilir (testlerin veri şekli değişmez:
// yine bir dosya yolu metni).
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: senaryo-dosyalari.d.mts.
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { DepoHatasi, ekranAyarlariniGetir, ekranKaydet, ekranlariListele, senaryoKaydet } from '../veritabani/depo.mjs';
import { medyaAnahtariniHazirla, zarfMi } from '../kasa.mjs';
import { medyaDosyaAdiGecerliMi, medyaDosyasiniSil, medyaSifrele, medyaTamamenCoz } from '../medya.mjs';
import { DOSYA_REFERANS_ON_EKI, dosyaReferansi, referansCoz } from './referans.mjs';

export { DOSYA_REFERANS_ON_EKI, dosyaReferansi, referansCoz };

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

export const SENARYO_DOSYASI_TURU = 'senaryo-dosyasi';
/** Tek dosyanın üst sınırı (bayt). */
export const DOSYA_BOYUT_SINIRI = 20 * 1024 * 1024;
/** Alanın "kabul" bilgisi yoksa izin verilen uzantılar. */
export const IZINLI_UZANTILAR = Object.freeze(['.xlsx', '.xls', '.csv', '.txt', '.json', '.xml', '.pdf', '.png', '.jpg', '.jpeg', '.docx', '.zip']);
const ICERIK_TURLERI = Object.freeze({
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv', '.txt': 'text/plain', '.json': 'application/json', '.xml': 'application/xml', '.pdf': 'application/pdf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.zip': 'application/zip'
});
const GUN_MS = 24 * 60 * 60 * 1000;

/** @param {unknown} d @returns {d is Record<string, unknown>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/**
 * Yüklenen dosyanın adını güvenli hale getirir (yalnızca son parça; denetim karakterleri, yol ayırıcıları ve
 * dosya sisteminde sorun çıkaran karakterler "_" olur). Boşsa DepoHatasi.
 * @param {unknown} ham
 */
export function guvenliDosyaAdi(ham) {
  const ad = basename(String(ham ?? '').replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(-150);
  if (!ad || ad === '.' || ad === '..' || !extname(ad)) throw new DepoHatasi('Dosya adı geçersiz (uzantılı bir dosya seçin).');
  return ad;
}

/** "kabul" metni ('.xlsx' ya da '.xlsx,.xls') → küçük harfli uzantılar. @param {unknown} kabul */
export function kabulUzantilari(kabul) {
  const liste = typeof kabul === 'string' ? kabul.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^\.[a-z0-9]{1,10}$/.test(x)) : [];
  return liste.length ? liste : [...IZINLI_UZANTILAR];
}

/** Uzantı kabul listesinde mi? Değilse DepoHatasi. @param {string} ad @param {unknown} [kabul] */
export function uzantiyiDenetle(ad, kabul) {
  const uzanti = extname(ad).toLowerCase();
  const liste = kabulUzantilari(kabul);
  if (!liste.includes(uzanti)) throw new DepoHatasi(`"${ad}" yüklenemez: yalnızca ${liste.join(', ')} uzantılı dosyalar kabul edilir.`);
  return uzanti;
}

/** @param {string} ad */
export function icerikTuruBul(ad) {
  return /** @type {Record<string, string>} */ (ICERIK_TURLERI)[extname(ad).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Dosyayı şifreleyip depoya ekler (düz metin yalnızca bellektedir). Kasa AÇIK olmalı.
 * @param {Veritabani} vt
 * @param {{ klasor: string; icerik: Buffer; ad: unknown; kabul?: unknown; sahipTuru?: 'senaryo' | 'ekran' | null; sahipId?: string | null; kaynak?: string | null }} girdi
 * @returns {Promise<{ id: string; ad: string; boyut: number; referans: string }>}
 */
export async function senaryoDosyasiEkle(vt, girdi) {
  const ad = guvenliDosyaAdi(girdi.ad);
  uzantiyiDenetle(ad, girdi.kabul);
  if (!Buffer.isBuffer(girdi.icerik) || girdi.icerik.length === 0) throw new DepoHatasi('Boş dosya yüklenemez.');
  if (girdi.icerik.length > DOSYA_BOYUT_SINIRI) throw new DepoHatasi(`Dosya en fazla ${DOSYA_BOYUT_SINIRI / 1024 / 1024} MB olabilir.`);
  const anahtar = medyaAnahtariniHazirla(vt);
  let yazilan;
  try {
    yazilan = await medyaSifrele(anahtar, girdi.klasor, girdi.icerik);
  } finally {
    anahtar.fill(0);
  }
  const id = randomUUID();
  try {
    vt.islem(() => vt.calistir(
      `INSERT INTO medya (id, sonuc_id, sira, tur, ad, icerik_turu, boyut, dosya, olusturulma, sahip_turu, sahip_id, kaynak)
       VALUES (?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, SENARYO_DOSYASI_TURU, ad, icerikTuruBul(ad), yazilan.boyut, yazilan.dosya, new Date().toISOString(),
        girdi.sahipTuru ?? null, girdi.sahipId ?? null, girdi.kaynak ?? null]
    ));
  } catch (hata) {
    medyaDosyasiniSil(girdi.klasor, yazilan.dosya);
    throw hata;
  }
  return { id, ad, boyut: yazilan.boyut, referans: dosyaReferansi(id, ad) };
}

/** @param {Record<string, unknown>} s */
const bilgiCevir = (s) => ({
  id: String(s.id), ad: String(s.ad), boyut: Number(s.boyut), icerikTuru: String(s.icerik_turu), olusturulma: String(s.olusturulma),
  sahipTuru: s.sahip_turu == null ? null : String(s.sahip_turu), sahipId: s.sahip_id == null ? null : String(s.sahip_id),
  kaynak: s.kaynak == null ? null : String(s.kaynak), dosya: String(s.dosya)
});

/** Senaryo dosyasının üst bilgisi (yoksa null; kasa gerekmez). @param {Veritabani} vt @param {string} id */
export function senaryoDosyasiBilgisi(vt, id) {
  const s = vt.tek('SELECT * FROM medya WHERE id = ? AND tur = ? AND silinme IS NULL', [id, SENARYO_DOSYASI_TURU]);
  return s ? bilgiCevir(s) : null;
}

/** Eski düz metin yolundan (kaynak) taşınmış dosya. @param {Veritabani} vt @param {string} kaynak */
export function kaynaktanDosyaBul(vt, kaynak) {
  const s = vt.tek('SELECT * FROM medya WHERE tur = ? AND kaynak = ? AND silinme IS NULL ORDER BY olusturulma LIMIT 1', [SENARYO_DOSYASI_TURU, kaynak]);
  return s ? bilgiCevir(s) : null;
}

/**
 * Değerin (iç içe) içindeki dosya referansları (tekrarsız).
 * @param {unknown} deger @returns {Array<{ id: string; ad: string; referans: string }>}
 */
export function referanslariBul(deger) {
  /** @type {Map<string, { id: string; ad: string; referans: string }>} */
  const bulunan = new Map();
  const gez = (/** @type {unknown} */ d) => {
    if (Array.isArray(d)) { d.forEach(gez); return; }
    if (nesneMi(d)) { Object.values(d).forEach(gez); return; }
    const r = referansCoz(d);
    if (r && !bulunan.has(String(d))) bulunan.set(String(d), { ...r, referans: String(d) });
  };
  gez(deger);
  return [...bulunan.values()];
}

/**
 * Metin değerlerini dönüştürür (nesne/dizi ağacında; kasa zarflarına dokunulmaz). Değişiklik yoksa aynı nesne döner.
 * @template T @param {T} deger @param {(metin: string) => string} donustur @returns {{ deger: T; degisti: boolean }}
 */
export function metinleriDonustur(deger, donustur) {
  let degisti = false;
  const gez = (/** @type {unknown} */ d) => {
    if (Array.isArray(d)) return d.map(gez);
    if (nesneMi(d)) return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, gez(v)]));
    if (typeof d === 'string' && !zarfMi(d)) {
      const yeni = donustur(d);
      if (yeni !== d) degisti = true;
      return yeni;
    }
    return d;
  };
  const sonuc = /** @type {T} */ (gez(deger));
  return { deger: degisti ? sonuc : deger, degisti };
}

/**
 * Referansların sahibini (senaryo/ekran) işaretler: yüklenip henüz sahibi olmayan dosyalar kayıtla bağlanır.
 * @param {Veritabani} vt @param {'senaryo' | 'ekran'} sahipTuru @param {string} sahipId @param {unknown} deger
 */
export function dosyaSahipleriniBagla(vt, sahipTuru, sahipId, deger) {
  const idler = referanslariBul(deger).map((r) => r.id);
  if (!idler.length) return 0;
  let sayi = 0;
  vt.islem(() => {
    for (const id of idler) {
      vt.calistir('UPDATE medya SET sahip_turu = ?, sahip_id = ? WHERE id = ? AND tur = ? AND sahip_id IS NULL', [sahipTuru, sahipId, id, SENARYO_DOSYASI_TURU]);
      sayi++;
    }
  });
  return sayi;
}

/**
 * Referansları çözülmüş geçici dosyaların MUTLAK yollarıyla değiştirir (koşu anı). Her dosya bir kez çözülür:
 * <hedefKlasor>/<medya kimliği>/<dosya adı> (klasör 0700, dosya 0600; yazma: geçici ad + rename). Kaydı ya da
 * şifreli dosyası olmayan referans, var olmayan bir "EKSIK-<ad>" yoluna çevrilir (test o dosyayı yüklerken açık
 * "dosya yok" hatasıyla düşer) ve eksikler listesinde döner.
 * @param {Veritabani} vt kasa açık olmalı
 * @param {unknown} deger
 * @param {{ medyaKlasoru: string; hedefKlasor: string }} s
 * @returns {Promise<{ deger: unknown; cozulen: number; eksikler: string[] }>}
 */
export async function referanslariCoz(vt, deger, s) {
  const referanslar = referanslariBul(deger);
  if (!referanslar.length) return { deger, cozulen: 0, eksikler: [] };
  /** @type {Map<string, string>} referans → mutlak yol */
  const yollar = new Map();
  /** @type {string[]} */
  const eksikler = [];
  let anahtar = null;
  try {
    for (const r of referanslar) {
      const bilgi = senaryoDosyasiBilgisi(vt, r.id);
      const klasor = join(s.hedefKlasor, r.id);
      const hedef = join(klasor, guvenliDosyaAdi(r.ad));
      if (!bilgi || !medyaDosyaAdiGecerliMi(bilgi.dosya) || !existsSync(join(s.medyaKlasoru, bilgi.dosya))) {
        eksikler.push(r.ad);
        yollar.set(r.referans, join(s.hedefKlasor, 'eksik', r.id, `EKSIK-${guvenliDosyaAdi(r.ad)}`));
        continue;
      }
      if (!existsSync(hedef)) {
        anahtar ??= medyaAnahtariniHazirla(vt);
        const duz = await medyaTamamenCoz(anahtar, join(s.medyaKlasoru, bilgi.dosya));
        mkdirSync(klasor, { recursive: true, mode: 0o700 });
        chmodSync(klasor, 0o700);
        const gecici = `${hedef}.${process.pid}.gecici`;
        try {
          writeFileSync(gecici, duz, { mode: 0o600, flag: 'wx' });
          renameSync(gecici, hedef);
        } finally {
          duz.fill(0);
        }
      }
      yollar.set(r.referans, hedef);
    }
  } finally {
    if (anahtar) anahtar.fill(0);
  }
  const d = metinleriDonustur(deger, (m) => yollar.get(m) ?? m);
  return { deger: d.deger, cozulen: yollar.size - eksikler.length, eksikler };
}

/**
 * Eski düz metin yollarını (proje köküne göre, ör. "tests/fixtures/a.xlsx") referanslara çevirir: tüm senaryoların
 * içeriği ve tüm ekran ayarları (kasa açık olmalı). Değişen kayıtlar değişiklik geçmişine yazılır.
 * @param {Veritabani} vt @param {string} projeId @param {Map<string, string>} eslesme göreli yol → referans
 * @param {{ yapan?: string }} [secenekler]
 * @returns {{ senaryo: number; ekran: number }}
 */
export function yollariReferansaCevir(vt, projeId, eslesme, secenekler = {}) {
  const sayi = { senaryo: 0, ekran: 0 };
  if (!eslesme.size) return sayi;
  const normal = (/** @type {string} */ m) => m.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const donustur = (/** @type {string} */ m) => eslesme.get(normal(m)) ?? m;
  vt.islem(() => {
    for (const s of vt.tumu('SELECT id, ekran_id, baslik, icerik_json, kosuya_dahil FROM senaryolar WHERE proje_id = ?', [projeId])) {
      const icerik = JSON.parse(String(s.icerik_json));
      const d = metinleriDonustur(icerik, donustur);
      if (!d.degisti) continue;
      senaryoKaydet(vt, {
        id: String(s.id), projeId, ekranId: s.ekran_id == null ? null : String(s.ekran_id), baslik: String(s.baslik),
        icerik: d.deger, kosuyaDahil: s.kosuya_dahil === 1, yapan: secenekler.yapan
      });
      dosyaSahipleriniBagla(vt, 'senaryo', String(s.id), d.deger);
      sayi.senaryo++;
    }
    for (const e of ekranlariListele(vt, projeId)) {
      const ayarlar = ekranAyarlariniGetir(vt, e.id) ?? {};
      const d = metinleriDonustur(ayarlar, donustur);
      if (!d.degisti) continue;
      ekranKaydet(vt, { id: e.id, projeId, anahtar: e.anahtar, ad: e.ad, aciklama: e.aciklama, ayarlar: d.deger });
      dosyaSahipleriniBagla(vt, 'ekran', e.id, d.deger);
      sayi.ekran++;
    }
  });
  return sayi;
}

/**
 * Projedeki tüm dosya referanslarının kullanıldığı yerler (kasa açık olmalı): senaryolar ve ekran ayarları.
 * @param {Veritabani} vt @returns {Set<string>} medya kimlikleri
 */
export function kullanilanDosyaKimlikleri(vt) {
  /** @type {Set<string>} */
  const idler = new Set();
  for (const s of vt.tumu('SELECT icerik_json FROM senaryolar')) {
    for (const r of referanslariBul(JSON.parse(String(s.icerik_json)))) idler.add(r.id);
  }
  for (const e of vt.tumu('SELECT id FROM ekranlar')) {
    for (const r of referanslariBul(ekranAyarlariniGetir(vt, String(e.id)) ?? {})) idler.add(r.id);
  }
  // Değişiklik geçmişindeki eski sürümler de (geri alınabilsin diye) kullanılıyor sayılır.
  for (const g of vt.tumu("SELECT onceki_json, sonraki_json FROM degisiklik_gecmisi WHERE varlik_turu = 'senaryo'")) {
    for (const alan of [g.onceki_json, g.sonraki_json]) {
      if (typeof alan !== 'string' || !alan.includes(DOSYA_REFERANS_ON_EKI)) continue;
      for (const e of alan.matchAll(/nobetci-dosya:\/\/([0-9a-f-]{36})\//g)) idler.add(e[1]);
    }
  }
  return idler;
}

/**
 * SAHİPSİZ DOSYA TEMİZLİĞİ (kasa açık olmalı): hiçbir senaryo/ekran ayarı/geçmiş kaydı tarafından kullanılmayan ve
 * 1 günden eski senaryo dosyaları (ör. yüklenip kaydedilmeden vazgeçilen) şifreli dosyasıyla birlikte silinir.
 * @param {Veritabani} vt @param {string} klasor medya klasörü @param {{ simdi?: number }} [secenekler]
 */
export function sahipsizSenaryoDosyalariniTemizle(vt, klasor, secenekler = {}) {
  const esik = new Date((secenekler.simdi ?? Date.now()) - GUN_MS).toISOString();
  const kullanilan = kullanilanDosyaKimlikleri(vt);
  let silinen = 0;
  for (const s of vt.tumu('SELECT id, dosya FROM medya WHERE tur = ? AND olusturulma < ?', [SENARYO_DOSYASI_TURU, esik])) {
    if (kullanilan.has(String(s.id))) continue;
    vt.islem(() => vt.calistir('DELETE FROM medya WHERE id = ?', [s.id]));
    medyaDosyasiniSil(klasor, String(s.dosya));
    silinen++;
  }
  return { silinen };
}
