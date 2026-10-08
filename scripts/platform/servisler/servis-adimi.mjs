// SERVİS İSTEĞİ ADIMI (genel, saf; sunucu, model koşucusu ve doğrulayıcı ortak — HİÇBİR modül içe aktarmaz). Ekran akışındaki
// "+ > Servis isteği" adımı: adıma gelindiğinde projedeki bir servisin KAYITLI bir senaryosu şablon olarak çalıştırılır (istek gövdesi,
// başlıklar ve kontroller o senaryodan); atamalarla şablondaki metinler ekranın değerleriyle değiştirilir; yanıttan okunan değerler sonraki
// adımlara ${akis:Ad} olarak geçer. Kontrollerden biri tutmazsa adım kalır.
//
// Tanım (ServisTanimi):
//   { servisId, senaryoId, atamalar?: [{ bul, deger }], okumalar?: [{ ad, yol, kaynak?: 'xml' | 'json' | 'baslik', gizli?, hedefAlanlar? }] }
//   atama: şablonun gövdesinde / yolunda / başlıklarında geçen "bul" metninin (ör. ${Kişi.TC kimlik no} ya da sabit bir değer) her
//   geçtiği yer "deger" ile değiştirilir. deger'de ${alanAnahtari} (senaryonun değeri) ve ${akis:Ad} (önceki adımda okunan) yazılabilir;
//   koşucu bunları çözer, sunucuya çözülmüş metin gider.
// Koşu: koşucu isteği Nöbetçi sunucusuna iletir (POST /platform/sonuc/servis-istegi); sunucu servis motoruyla (token / oturum, tablo
// başvuruları, kontroller) çalıştırır. Servis koşusu "Dene" olarak servisin geçmişine de yazılır.
// NOT: import.meta KULLANILMAZ.

/** Tanımda en çok atama / okuma. */
export const SERVIS_ATAMA_EN_COK = 20;
export const SERVIS_OKUMA_EN_COK = 20;
const KIMLIK = /^[A-Za-z0-9_-]{1,80}$/;
const OKUMA_ADI = /^[\p{L}_][\p{L}\p{N}_.-]{0,59}$/u;

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const metin = (/** @type {unknown} */ d, /** @type {number} */ en) => (typeof d === 'string' ? d.slice(0, en) : '');

/**
 * @typedef {{ bul: string; deger: string }} ServisAtamasi
 * @typedef {{ ad: string; yol: string; kaynak?: 'xml' | 'json' | 'baslik'; gizli?: boolean; hedefAlanlar?: string[] }} ServisOkumasi
 * @typedef {{ servisId: string; senaryoId: string; atamalar?: ServisAtamasi[]; okumalar?: ServisOkumasi[] }} ServisTanimi
 */

/**
 * Tanımı ayıklar ve denetler. @param {unknown} ham @returns {{ tanim: ServisTanimi; hatalar: string[] }}
 */
export function servisTanimiDogrula(ham) {
  const t = nesneMi(ham) ? /** @type {Record<string, unknown>} */ (ham) : {};
  /** @type {string[]} */
  const hatalar = [];
  const servisId = metin(t.servisId, 80).trim();
  const senaryoId = metin(t.senaryoId, 80).trim();
  if (!servisId || !KIMLIK.test(servisId)) hatalar.push('Servisi seçin.');
  if (!senaryoId || !KIMLIK.test(senaryoId)) hatalar.push('Şablon olarak kullanılacak servis senaryosunu seçin.');
  /** @type {ServisAtamasi[]} */
  const atamalar = [];
  for (const a of Array.isArray(t.atamalar) ? t.atamalar : []) {
    if (!nesneMi(a)) continue;
    const bul = metin(a.bul, 400);
    const deger = metin(a.deger, 2000);
    if (!bul && !deger) continue;
    if (!bul) { hatalar.push('Atamada değiştirilecek metni yazın.'); continue; }
    atamalar.push({ bul, deger });
  }
  if (atamalar.length > SERVIS_ATAMA_EN_COK) hatalar.push(`En çok ${SERVIS_ATAMA_EN_COK} atama yapılabilir.`);
  /** @type {ServisOkumasi[]} */
  const okumalar = [];
  const adlar = new Set();
  for (const o of Array.isArray(t.okumalar) ? t.okumalar : []) {
    if (!nesneMi(o)) continue;
    const ad = metin(o.ad, 60).trim();
    const yol = metin(o.yol, 400).trim();
    if (!ad && !yol) continue;
    if (!ad || !OKUMA_ADI.test(ad)) { hatalar.push(`Okuma adı geçersiz: "${ad}" (harfle başlamalı; harf, rakam, _ . -).`); continue; }
    if (!yol) { hatalar.push(`"${ad}" okumasının yanıttaki yolunu yazın.`); continue; }
    if (adlar.has(ad)) { hatalar.push(`"${ad}" okuması birden çok kez yazılmış.`); continue; }
    adlar.add(ad);
    const kaynak = o.kaynak === 'xml' || o.kaynak === 'json' || o.kaynak === 'baslik' ? o.kaynak : undefined;
    // Kullanılacağı alanlar (senaryo formunda öneri): sql-adimi.mjs > okumaHedefleri ile aynı kural (en çok 50, tekil, kırpılmış).
    /** @type {string[]} */
    const hedefler = [];
    for (const x of Array.isArray(o.hedefAlanlar) ? o.hedefAlanlar : []) {
      const a = typeof x === 'string' ? x.trim().slice(0, 200) : '';
      if (a && !hedefler.includes(a) && hedefler.length < 50) hedefler.push(a);
    }
    okumalar.push({ ad, yol, ...(kaynak ? { kaynak } : {}), ...(o.gizli === true ? { gizli: true } : {}), ...(hedefler.length ? { hedefAlanlar: hedefler } : {}) });
  }
  if (okumalar.length > SERVIS_OKUMA_EN_COK) hatalar.push(`En çok ${SERVIS_OKUMA_EN_COK} okuma yapılabilir.`);
  // İstekten sonra bekleme (diyagramda servis bloğundan sonraki "Bekle"): koşucu adım bitince bu kadar bekler.
  let sonraBekleSn;
  if (t.sonraBekleSn !== undefined && t.sonraBekleSn !== null && t.sonraBekleSn !== '') {
    const b = Number(t.sonraBekleSn);
    if (!Number.isInteger(b) || b < 1 || b > 600) hatalar.push('İstekten sonra bekleme 1–600 saniye arasında tam sayı olmalı.');
    else sonraBekleSn = b;
  }
  return {
    tanim: { servisId, senaryoId, ...(sonraBekleSn ? { sonraBekleSn } : {}), ...(atamalar.length ? { atamalar: atamalar.slice(0, SERVIS_ATAMA_EN_COK) } : {}), ...(okumalar.length ? { okumalar: okumalar.slice(0, SERVIS_OKUMA_EN_COK) } : {}) },
    hatalar
  };
}

/**
 * Atamalardaki ${…} yer tutucularını çözer (koşucu): ${akis:Ad} ve ${alanAnahtari}. Çözülemeyen yer tutucu hata olur (istek atılmaz).
 * @param {ServisAtamasi[]} atamalar @param {(ifade: string) => string | undefined} coz
 * @returns {{ atamalar: ServisAtamasi[]; eksik: string[] }}
 */
export function atamalariCoz(atamalar, coz) {
  /** @type {string[]} */
  const eksik = [];
  const cozulmus = atamalar.map((a) => ({
    bul: a.bul,
    deger: a.deger.replace(/\$\{([^{}]+)\}/g, (tum, ham) => {
      const v = coz(String(ham).trim());
      if (v === undefined) { eksik.push(String(ham).trim()); return tum; }
      return v;
    })
  }));
  return { atamalar: cozulmus, eksik: [...new Set(eksik)] };
}

/**
 * Şablon senaryo içeriğine atamaları uygular (sunucu): gövde, HTTP yolu ve başlık değerlerinde "bul" metni "deger" ile değiştirilir.
 * Değişmeyen atama (metin şablonda yok) adlarıyla döner. @param {Record<string, any>} icerik @param {ServisAtamasi[]} atamalar
 * @returns {{ icerik: Record<string, any>; bulunamayan: string[] }}
 */
export function atamalariUygula(icerik, atamalar) {
  const yeni = JSON.parse(JSON.stringify(icerik ?? {}));
  /** @type {string[]} */
  const bulunamayan = [];
  const degistir = (/** @type {unknown} */ s, /** @type {ServisAtamasi} */ a) => (typeof s === 'string' ? s.split(a.bul).join(a.deger) : s);
  for (const a of atamalar) {
    let bulundu = false;
    if (typeof yeni.govde === 'string' && yeni.govde.includes(a.bul)) { yeni.govde = degistir(yeni.govde, a); bulundu = true; }
    if (nesneMi(yeni.http) && typeof yeni.http.yol === 'string' && yeni.http.yol.includes(a.bul)) { yeni.http.yol = degistir(yeni.http.yol, a); bulundu = true; }
    if (nesneMi(yeni.basliklar)) {
      for (const [k, v] of Object.entries(yeni.basliklar)) if (typeof v === 'string' && v.includes(a.bul)) { yeni.basliklar[k] = degistir(v, a); bulundu = true; }
    }
    if (!bulundu) bulunamayan.push(a.bul);
  }
  return { icerik: yeni, bulunamayan };
}

/** Okunur özet (diyagram rozeti / rapor): "<n> atama, <m> okuma". @param {ServisTanimi} t */
export function servisOzeti(t) {
  const p = [t.atamalar?.length ? `${t.atamalar.length} atama` : '', t.okumalar?.length ? `${t.okumalar.length} okuma` : ''].filter(Boolean);
  return p.length ? p.join(', ') : 'şablon aynen';
}
