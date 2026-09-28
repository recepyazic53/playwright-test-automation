// GÖRELİ TARİH (genel, saf; tarayıcıda da çalışır — import yok, Node'a / DOM'a özgü API yok). Tarih alanının değeri sabit bir
// tarih yerine koşu gününe göre yazılabilir; böylece tarih geçince senaryo kırılmaz.
//
// İfadeler (büyük-küçük harf, Türkçe / ASCII yazım ve boşluk fark etmez):
//   bugün · bugün+7 · bugün - 3 · bugün+7 gün (ya da 7g)            → koşu günü ± N gün
//   ay başı · ay sonu · ay sonu+2 · ay başı-1                        → koşu ayının ilk / son günü ± N gün
// Gün Europe/Istanbul saatine göre hesaplanır; sonuç alanın biçimiyle (gg.aa.yyyy, yyyy-aa-gg, dd/MM/yyyy …) yazılır.
// Koşucu (model-kosusu.mjs: senaryo değeri, test verisi tablosu hücresi, modeldeki sabit değer), Playwright dışa aktarma,
// senaryo formu, senaryolar listesi (tarihi geçmiş rozeti), test verisi tabloları, öneriler ve paket doğrulayıcı bu tek
// modülü kullanır. Senaryo doğrulayıcısı (import etmez) aynı dilbilgisinin kısa bir kopyasını taşır; birim testi ikisini karşılaştırır.
// Tipler: goreli-tarih.d.mts.

/** Günün hesaplandığı saat dilimi. */
export const GORELI_TARIH_SAAT_DILIMI = 'Europe/Istanbul';
/** Varsayılan tarih biçimi (alanın bicim'i yoksa). */
export const VARSAYILAN_TARIH_BICIMI = 'gg.aa.yyyy';
/** Kullanıcıya gösterilen örnek ifade. */
export const GORELI_ORNEK = 'bugün+7';
/** Gün farkının üst sınırı (± gün). */
export const EN_COK_GUN = 36600;

const TR = /** @type {Record<string, string>} */ ({ ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' });

/** Karşılaştırma biçimi: küçük harf, Türkçe harfler ASCII, boşluk / alt çizgi yok. @param {unknown} m */
function sade(m) {
  return String(m ?? '').toLocaleLowerCase('tr').normalize('NFC').replace(/[çğıöşüâîû]/g, (k) => TR[k] ?? k).replace(/i̇/g, 'i')
    .replace(/[\s_]+/g, '');
}

const DESEN = /^(bugun|aybasi|aysonu)(?:([+-])(\d{1,5})(?:g|gun)?)?$/;
const TABANLAR = /** @type {const} */ ({ bugun: 'bugun', aybasi: 'ayBasi', aysonu: 'aySonu' });

/**
 * @typedef {'bugun' | 'ayBasi' | 'aySonu'} GoreliTaban
 * @typedef {{ taban: GoreliTaban; gun: number }} GoreliIfade
 * @typedef {{ yil: number; ay: number; gun: number }} Gun
 */

/** Metin göreli tarih ifadesi mi? → { taban, gun } | null. @param {unknown} metin @returns {GoreliIfade | null} */
export function goreliIfadeAyristir(metin) {
  if (typeof metin !== 'string') return null;
  const e = DESEN.exec(sade(metin));
  if (!e) return null;
  const gun = e[2] ? (e[2] === '-' ? -1 : 1) * Number(e[3]) : 0;
  if (Math.abs(gun) > EN_COK_GUN) return null;
  return { taban: TABANLAR[/** @type {keyof typeof TABANLAR} */ (e[1])], gun: gun === 0 ? 0 : gun };
}

/**
 * Göreli ifade YAZILMAK İSTENMİŞ ama anlaşılamamış mı? ("bugün+x", "bugün 7", "ay sonu++1"): "bugün" / "ay başı" / "ay sonu"
 * ile başlayıp ifadeye uymayan metin. Doğrulayıcı ve formlar anlaşılır hata verir. @param {unknown} metin
 */
export function goreliIfadeHataliMi(metin) {
  if (typeof metin !== 'string') return false;
  const s = sade(metin);
  return /^(bugun|aybasi|aysonu)/.test(s) && !goreliIfadeAyristir(metin);
}

/** Anlaşılamayan ifadenin mesajı. @param {unknown} metin */
export function goreliHataMesaji(metin) {
  return `'${String(metin ?? '').trim()}' anlaşılamadı; örnek: ${GORELI_ORNEK} (ya da bugün, bugün-3, ay sonu, ay başı+1).`;
}

/** { taban, gun } → saklanan (kanonik) yazım: "bugün", "bugün+7", "ay sonu-2", "ay başı". @param {GoreliIfade} i */
export function goreliIfadeYaz(i) {
  const ad = i.taban === 'aySonu' ? 'ay sonu' : i.taban === 'ayBasi' ? 'ay başı' : 'bugün';
  const g = Math.trunc(Number(i.gun) || 0);
  return g === 0 ? ad : `${ad}${g > 0 ? '+' : '-'}${Math.abs(g)}`;
}

/** Göreli ifadenin kanonik yazımı (değilse null). @param {unknown} metin */
export function goreliIfadeKanonik(metin) {
  const i = goreliIfadeAyristir(metin);
  return i ? goreliIfadeYaz(i) : null;
}

/** Anın Europe/Istanbul'daki günü. @param {Date} [simdi] @returns {Gun} */
export function istanbulGunu(simdi = new Date()) {
  const [yil, ay, gun] = new Intl.DateTimeFormat('en-CA', { timeZone: GORELI_TARIH_SAAT_DILIMI, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(simdi).split('-').map(Number);
  return { yil, ay, gun };
}

/** Gün sırası (1970-01-01'den gün sayısı; karşılaştırma / fark için). @param {Gun} t */
export function gunSirasi(t) {
  return Math.round(Date.UTC(t.yil, t.ay - 1, t.gun) / 86_400_000);
}
/** Gün sırasından gün. @param {number} n @returns {Gun} */
function sirasindanGun(n) {
  const d = new Date(n * 86_400_000);
  return { yil: d.getUTCFullYear(), ay: d.getUTCMonth() + 1, gun: d.getUTCDate() };
}
/** b − a (gün). @param {Gun} a @param {Gun} b */
export function gunFarki(a, b) {
  return gunSirasi(b) - gunSirasi(a);
}

/** İfadenin (ya da ayrıştırılmışının) koşu günündeki karşılığı. @param {unknown | GoreliIfade} ifade @param {Date} [simdi] @returns {Gun | null} */
export function goreliGun(ifade, simdi = new Date()) {
  const i = typeof ifade === 'string' ? goreliIfadeAyristir(ifade) : ifade && typeof ifade === 'object' && 'taban' in ifade ? /** @type {GoreliIfade} */ (ifade) : null;
  if (!i) return null;
  const b = istanbulGunu(simdi);
  const taban = i.taban === 'ayBasi' ? { yil: b.yil, ay: b.ay, gun: 1 }
    : i.taban === 'aySonu' ? { yil: b.yil, ay: b.ay, gun: new Date(Date.UTC(b.yil, b.ay, 0)).getUTCDate() } : b;
  return sirasindanGun(gunSirasi(taban) + i.gun);
}

const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
/** Biçim parçaları (büyük-küçük harf fark etmez: YYYY-AA-GG de olur): yyyy, yy, gg / dd (gün), aa / mm (ay). */
const PARCA = /yyyy|yy|gg|dd|aa|mm/gi;
/** Parçanın türü. @param {string} p @returns {'yyyy' | 'yy' | 'gun' | 'ay'} */
const parcaTuru = (p) => { const k = p.toLowerCase(); return k === 'yyyy' || k === 'yy' ? k : k === 'gg' || k === 'dd' ? 'gun' : 'ay'; };

/** Günü biçimle yazar (gg.aa.yyyy, yyyy-aa-gg, dd/MM/yyyy …). @param {Gun} t @param {string | null} [bicim] */
export function tarihBicimle(t, bicim) {
  const b = typeof bicim === 'string' && bicim.trim() ? bicim.trim() : VARSAYILAN_TARIH_BICIMI;
  return b.replace(PARCA, (p) => { const k = parcaTuru(p); return k === 'yyyy' ? String(t.yil).padStart(4, '0') : k === 'yy' ? iki(t.yil % 100) : k === 'gun' ? iki(t.gun) : iki(t.ay); });
}

/** Geçerli gün mü? @param {number} yil @param {number} ay @param {number} gun */
function gecerliGun(yil, ay, gun) {
  if (!Number.isInteger(yil) || !Number.isInteger(ay) || !Number.isInteger(gun) || yil < 1000 || yil > 9999) return null;
  const d = new Date(Date.UTC(yil, ay - 1, gun));
  return d.getUTCFullYear() === yil && d.getUTCMonth() === ay - 1 && d.getUTCDate() === gun ? { yil, ay, gun } : null;
}

/**
 * Sabit tarih metni → gün (değilse null). Önce alanın biçimi (verildiyse), sonra yaygın biçimler: gg.aa.yyyy, yyyy-aa-gg, gg/aa/yyyy.
 * @param {unknown} metin @param {string | null} [bicim] @returns {Gun | null}
 */
export function sabitTarihAyristir(metin, bicim) {
  if (typeof metin !== 'string') return null;
  const m = metin.trim();
  if (!m) return null;
  if (typeof bicim === 'string' && bicim.trim()) {
    const sira = /** @type {string[]} */ ([]);
    const desen = bicim.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(PARCA, (p) => { const k = parcaTuru(p); sira.push(k); return k === 'yyyy' ? '(\\d{4})' : '(\\d{2})'; });
    const e = new RegExp(`^${desen}$`).exec(m);
    if (e && !sira.includes('yy') && ['yyyy', 'ay', 'gun'].every((k) => sira.includes(k))) {
      const al = (/** @type {string} */ k) => Number(e[sira.indexOf(k) + 1]);
      const t = gecerliGun(al('yyyy'), al('ay'), al('gun'));
      if (t) return t;
    }
  }
  const tr = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(m);
  if (tr) return gecerliGun(Number(tr[3]), Number(tr[2]), Number(tr[1]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(m);
  return iso ? gecerliGun(Number(iso[1]), Number(iso[2]), Number(iso[3])) : null;
}

/**
 * Göreli ifade → alanın biçimiyle tarih metni (göreli değilse null). model-kosusu.mjs > goreliTarih'in yerini alır.
 * @param {unknown} ifade @param {string | null} [bicim] @param {Date} [simdi]
 */
export function goreliTarihCoz(ifade, bicim, simdi = new Date()) {
  const t = goreliGun(ifade, simdi);
  return t ? tarihBicimle(t, bicim) : null;
}

/**
 * Tarih değeri (göreli ya da sabit) → { gun, goreli } | null.
 * @param {unknown} deger @param {string | null} [bicim] @param {Date} [simdi]
 * @returns {{ gun: Gun; goreli: boolean } | null}
 */
export function tarihDegeriCoz(deger, bicim, simdi = new Date()) {
  const g = goreliGun(deger, simdi);
  if (g) return { gun: g, goreli: true };
  const s = sabitTarihAyristir(deger, bicim);
  return s ? { gun: s, goreli: false } : null;
}

/** "bugün+7 → 05.10.2026" (göreli değilse null). @param {unknown} ifade @param {string | null} [bicim] @param {Date} [simdi] */
export function goreliOzet(ifade, bicim, simdi = new Date()) {
  const k = goreliIfadeKanonik(ifade);
  const t = goreliTarihCoz(ifade, bicim, simdi);
  return k && t ? `${k} → ${t}` : null;
}

/**
 * Tarih sınırı denetimi (alanın sinirlar.enAz / enCok — ikisi de göreli olabilir). Sınır dışıysa açıklama, değilse null.
 * @param {Gun} gun @param {{ enAz?: unknown; enCok?: unknown } | null | undefined} sinirlar @param {string | null} [bicim] @param {Date} [simdi]
 * @returns {{ tur: 'erken' | 'gec'; sinir: string; sinirTarihi: string; mesaj: string } | null}
 */
export function tarihSinirDenetimi(gun, sinirlar, bicim, simdi = new Date()) {
  if (!sinirlar || typeof sinirlar !== 'object') return null;
  const n = gunSirasi(gun);
  const alt = sinirlar.enAz !== undefined && sinirlar.enAz !== null ? tarihDegeriCoz(String(sinirlar.enAz), bicim, simdi) : null;
  const ust = sinirlar.enCok !== undefined && sinirlar.enCok !== null ? tarihDegeriCoz(String(sinirlar.enCok), bicim, simdi) : null;
  const yaz = (/** @type {unknown} */ s, /** @type {Gun} */ t) => {
    const k = goreliIfadeKanonik(s);
    return { sinir: k ?? String(s), sinirTarihi: tarihBicimle(t, bicim) };
  };
  if (alt && n < gunSirasi(alt.gun)) {
    const y = yaz(sinirlar.enAz, alt.gun);
    return { tur: 'erken', ...y, mesaj: `En erken ${y.sinir}${y.sinir !== y.sinirTarihi ? ` (${y.sinirTarihi})` : ''} olabilir; bu tarih sınırın dışında.` };
  }
  if (ust && n > gunSirasi(ust.gun)) {
    const y = yaz(sinirlar.enCok, ust.gun);
    return { tur: 'gec', ...y, mesaj: `En geç ${y.sinir}${y.sinir !== y.sinirTarihi ? ` (${y.sinirTarihi})` : ''} olabilir; bu tarih sınırın dışında.` };
  }
  return null;
}

/** Referans anının (Date / ISO metni) günü; yoksa ya da geçersizse null. @param {Date | string | null | undefined} r */
function referansGunu(r) {
  const d = r instanceof Date ? r : typeof r === 'string' && r ? new Date(r) : null;
  return d && !Number.isNaN(d.getTime()) ? istanbulGunu(d) : null;
}

/**
 * Sabit tarih değeri eskidi mi → { neden, mesaj } | null:
 *  · 'gecmis': koşu gününden önce kalmış. referans (senaryonun son kaydedildiği an) verildiyse yalnız KAYDEDİLDİĞİNDE bugün ya da
 *    ilerideyken sonradan geçmişte kalan tarih sayılır (kaydedilirken de geçmişte olan — ör. doğum tarihi — bilerek yazılmıştır).
 *  · 'sinir': bugün koşulursa alanın sınırının (enAz / enCok) dışında.
 * Göreli ifade, tablo başvurusu, boş ya da anlaşılmayan değer eskimez.
 * @param {unknown} deger @param {string | null} [bicim] @param {{ enAz?: unknown; enCok?: unknown } | null} [sinirlar] @param {Date} [simdi]
 * @param {Date | string | null} [referans]
 * @returns {{ neden: 'gecmis' | 'sinir'; mesaj: string } | null}
 */
export function eskiyenTarih(deger, bicim, sinirlar, simdi = new Date(), referans = null) {
  if (goreliIfadeAyristir(deger)) return null;
  const t = sabitTarihAyristir(deger, bicim);
  if (!t) return null;
  const bugun = istanbulGunu(simdi);
  const r = referansGunu(referans);
  if (gunSirasi(t) < gunSirasi(bugun) && (!r || gunSirasi(t) >= gunSirasi(r))) return { neden: 'gecmis', mesaj: `Bu tarih (${String(deger).trim()}) geçmişte kaldı.` };
  const s = tarihSinirDenetimi(t, sinirlar, bicim, simdi);
  return s ? { neden: 'sinir', mesaj: `Bugün koşulursa ${s.mesaj.charAt(0).toLocaleLowerCase('tr')}${s.mesaj.slice(1)}` } : null;
}

/**
 * Sabit tarihin "bugüne göre" karşılığı. referans (senaryonun son kaydedildiği an) verilirse tarihin o güne göre farkı korunur
 * (kaydedildiği gün 5 gün sonrası yazılmışsa "bugün+5"); verilmezse, tarih anlaşılmazsa ya da kayıt gününden önceyse "bugün".
 * Sınır verildiyse ve bulunan ifade bugün koşulursa sınır dışında kalıyorsa sınıra çekilir (erkense en erken, geçse en geç gün).
 * @param {unknown} deger @param {string | null} [bicim] @param {Date | string | null} [referans] @param {{ enAz?: unknown; enCok?: unknown } | null} [sinirlar]
 * @param {Date} [simdi]
 */
export function bugunuGoreliOner(deger, bicim, referans, sinirlar, simdi = new Date()) {
  const t = sabitTarihAyristir(deger, bicim);
  const r = referansGunu(referans);
  let gun = t && r ? Math.max(0, gunFarki(r, t)) : 0;
  const bugun = istanbulGunu(simdi);
  const aday = sirasindanGun(gunSirasi(bugun) + gun);
  const s = tarihSinirDenetimi(aday, sinirlar, bicim, simdi);
  if (s && sinirlar) {
    const sinir = tarihDegeriCoz(String(s.tur === 'erken' ? sinirlar.enAz : sinirlar.enCok), bicim, simdi);
    if (sinir) gun = gunFarki(bugun, sinir.gun);
  }
  return goreliIfadeYaz({ taban: 'bugun', gun });
}

/**
 * Form alanlarından (model-formu.mjs > tumFormAlanlari) değeri eskimiş TARİH alanları. Hassas alan ve tablo başvurusu (${…}) atlanır.
 * referans: senaryonun son kaydedildiği an (bkz. eskiyenTarih).
 * @param {ReadonlyArray<any>} alanlar @param {Record<string, unknown> | null | undefined} veri @param {Date} [simdi] @param {Date | string | null} [referans]
 * @returns {Array<{ anahtar: string; etiket: string; deger: string; mesaj: string; bicim: string | null; sinirlar: Record<string, unknown> | null }>}
 */
export function eskiyenTarihAlanlari(alanlar, veri, simdi = new Date(), referans = null) {
  if (!Array.isArray(alanlar) || !veri || typeof veri !== 'object') return [];
  /** @type {Array<{ anahtar: string; etiket: string; deger: string; mesaj: string; bicim: string | null; sinirlar: Record<string, unknown> | null }>} */
  const sonuc = [];
  for (const a of alanlar) {
    if (!a || a.tip !== 'tarih' || a.hassas || typeof a.anahtar !== 'string') continue;
    const d = veri[a.anahtar];
    if (typeof d !== 'string' || !d.trim() || /^\s*\$\{[^}]+\}\s*$/.test(d)) continue;
    const e = eskiyenTarih(d, a.bicim ?? null, a.sinirlar ?? null, simdi, referans);
    if (e) sonuc.push({ anahtar: a.anahtar, etiket: String(a.etiket ?? a.anahtar), deger: d.trim(), mesaj: e.mesaj, bicim: a.bicim ?? null, sinirlar: a.sinirlar ?? null });
  }
  return sonuc;
}

/**
 * Kayıttan (akış kaydı) gelen tarih: kayıt günü ise "bugün", değilse farkıyla "bugün+N" / "bugün-N". Tarih anlaşılmazsa null.
 * @param {unknown} deger @param {string | null} [bicim] @param {Date} [kayitAni]
 */
export function kayittanGoreliIfade(deger, bicim, kayitAni = new Date()) {
  const t = sabitTarihAyristir(deger, bicim);
  return t ? goreliIfadeYaz({ taban: 'bugun', gun: gunFarki(istanbulGunu(kayitAni), t) }) : null;
}
