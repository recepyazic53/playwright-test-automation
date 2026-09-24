// Test sunucusunun (scripts/test-sunucu.mjs) /platform/* uç noktaları: platform veritabanı
// durumu, kasa (oluştur/aç/kilitle/parola değiştir) ve yedek (dışa aktar, otomatik yedek,
// içe aktarma: ÖNİZLEME → SEÇİM → UYGULAMA — bkz. ice-aktarma.mjs).
//
// İçe aktarma uç noktaları:
//   POST /platform/yedek/ice-aktar              ham .tayedek gövdesi + X-Kasa-Parola → { isId } (202)
//   GET  /platform/yedek/ice-aktar/<id>         ilerleme; hazır olunca önizleme (yeni/degisen/yalnizBurada)
//   POST /platform/yedek/ice-aktar/<id>/uygula  { token, tumu: true } veya { token, secimler: { tablo: [id] } }
//   POST /platform/yedek/ice-aktar/<id>/iptal   { token }
// Kasa kilitliyken şifreli sütunlar (ortam adresleri, ayarlar...) okunamaz; /platform/durum
// yalnızca gizli olmayan durum bilgisini döner ve kasa kilitliyken de çalışır.
// Kaba kuvvet koruması: art arda yanlış kasa/yedek parolasında artan bekleme (1,2,4...30 sn).
//
// Güvenlik: test-sunucu.mjs'deki yerel istek (loopback + Host) ve origin kontrolleri bu
// fonksiyon çağrılmadan ÖNCE yapılır. Burada ayrıca her istek aynı token'ı taşımak zorundadır
// (JSON gövdesinde "token", ya da X-Test-Sunucu-Token başlığı / ?token= sorgu parametresi).
// Parolalar yalnızca istek GÖVDESİNDE (JSON) veya ice-aktar için X-Kasa-Parola başlığında
// (encodeURIComponent ile) gelir; URL'de parola kabul edilmez. Parola/anahtar ASLA loglanmaz,
// yanıtlarda dönmez.

import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { veritabaniYolu as veritabaniYoluCoz } from './veritabani/baglanti.mjs';
import { GUNCEL_SEMA_SURUMU } from './veritabani/gocler.mjs';
import { DepoHatasi, platformDurumOzeti, veritabaniniHazirla, yerelMakine } from './veritabani/depo.mjs';
import {
  KasaHatasi, MIN_PAROLA_UZUNLUGU, ParolaDenemeSiniri, kasaAc, kasaAcikMi, kasaDurumu, kasaKilitle, kasaOlustur, parolaDegistir, parolayiDogrula
} from './kasa.mjs';
import { YEDEK_UZANTISI, YedekHatasi, otomatikYedekAl, yedekOlustur } from './yedek.mjs';
import { IceAktarmaYoneticisi } from './ice-aktarma.mjs';

export const JSON_GOVDE_SINIRI = 64 * 1024;
export const YEDEK_YUKLEME_SINIRI = 500 * 1024 * 1024;
const PROJE_KOKU = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** PLATFORM_VERITABANI veya <proje kökü>/veri/platform.db */
const veritabaniYolu = () => veritabaniYoluCoz(PROJE_KOKU);

/** @type {import('./veritabani/baglanti.mjs').Veritabani | null} */
let vt = null;
/** @type {Promise<import('./veritabani/baglanti.mjs').Veritabani> | null} */
let vtSozu = null;

/**
 * Platform veritabanını (tek örnek) döner. Dosya yoksa ve olustur=false ise null döner
 * (durum sorgusu boş bir veritabanı dosyası YARATMAZ).
 * @param {{ olustur?: boolean }} [secenekler]
 */
async function platformVeritabani(secenekler = {}) {
  if (vt) return vt;
  if (!secenekler.olustur && !existsSync(veritabaniYolu())) return null;
  vtSozu ??= veritabaniniHazirla(veritabaniYolu()).then((acilan) => (vt = acilan)).finally(() => { vtSozu = null; });
  return vtSozu;
}

/** Süreç başına tek sayaç: kasa açma, parola değiştirme, dışa aktarma ve yedek parolası. */
const denemeSiniri = new ParolaDenemeSiniri();
const iceAktarma = new IceAktarmaYoneticisi({
  veritabani: (olustur) => platformVeritabani({ olustur }),
  denemeSiniri
});
setInterval(() => iceAktarma.temizle(), 5 * 60 * 1000).unref();

/** Hata → HTTP durum kodu + güvenli (gizli bilgi içermeyen) mesaj. @param {unknown} hata */
function hataYaniti(hata) {
  if (hata instanceof KasaHatasi) {
    const kodlar = { PAROLA_KISA: 400, PAROLA_YANLIS: 403, KASA_KILITLI: 423, KASA_YOK: 409, KASA_VAR: 409, ZARF_BOZUK: 400, COK_DENEME: 429 };
    return {
      durum: kodlar[hata.kod] ?? 400,
      govde: { basarili: false, kod: hata.kod, mesaj: hata.message, ...(hata.bekleSaniye ? { bekleSaniye: hata.bekleSaniye } : {}) }
    };
  }
  if (hata instanceof YedekHatasi) {
    const kodlar = { ONAY_GEREKLI: 409, DEGISTI: 409, MESGUL: 409, BULUNAMADI: 404 };
    return { durum: kodlar[hata.kod] ?? 400, govde: { basarili: false, kod: hata.kod, mesaj: hata.message } };
  }
  if (hata instanceof DepoHatasi) return { durum: 400, govde: { basarili: false, kod: 'VERI', mesaj: hata.message } };
  return null;
}

/** @param {import('node:http').IncomingMessage} req @param {number} sinir */
function ikiliGovdeOku(req, sinir) {
  return new Promise((coz, reddet) => {
    const uzunluk = Number(req.headers['content-length'] ?? NaN);
    if (Number.isFinite(uzunluk) && uzunluk > sinir) {
      reddet(Object.assign(new Error('Yüklenen dosya çok büyük.'), { cokBuyuk: true }));
      return;
    }
    /** @type {Buffer[]} */
    const parcalar = [];
    let toplam = 0;
    let bitti = false;
    req.on('data', (/** @type {Buffer} */ parca) => {
      if (bitti) return;
      toplam += parca.length;
      if (toplam > sinir) {
        bitti = true;
        reddet(Object.assign(new Error('Yüklenen dosya çok büyük.'), { cokBuyuk: true }));
        req.resume();
        return;
      }
      parcalar.push(parca);
    });
    req.on('end', () => { if (!bitti) { bitti = true; coz(Buffer.concat(parcalar)); } });
    req.on('error', (h) => { if (!bitti) { bitti = true; reddet(h); } });
  });
}

/** @param {Date} t */
function dosyaZamani(t) {
  return t.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ token: string; jsonGonder: (res: import('node:http').ServerResponse, durum: number, govde: unknown) => void }} baglam
 * @returns {Promise<boolean>} istek bir /platform uç noktasıyla eşleştiyse true
 */
export async function platformIsteginiIsle(req, res, baglam) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const yol = url.pathname;
  if (!yol.startsWith('/platform/')) return false;
  const { jsonGonder } = baglam;
  const baslikToken = req.headers['x-test-sunucu-token'];
  const disTokenGecerli = (typeof baslikToken === 'string' && baslikToken === baglam.token) || url.searchParams.get('token') === baglam.token;

  /** @returns {Promise<Record<string, unknown> | null>} */
  const jsonGovde = async () => {
    let metin;
    try {
      metin = (await ikiliGovdeOku(req, JSON_GOVDE_SINIRI)).toString('utf8');
    } catch (hata) {
      const cokBuyuk = Boolean(/** @type {{ cokBuyuk?: boolean }} */ (hata).cokBuyuk);
      if (cokBuyuk) res.setHeader('Connection', 'close');
      jsonGonder(res, cokBuyuk ? 413 : 400, {
        basarili: false,
        mesaj: cokBuyuk ? `İstek gövdesi en fazla ${JSON_GOVDE_SINIRI / 1024} KB olabilir.` : 'İstek gövdesi okunamadı.'
      });
      return null;
    }
    try {
      const govde = metin ? JSON.parse(metin) : {};
      if (typeof govde !== 'object' || govde === null || Array.isArray(govde)) throw new Error('nesne değil');
      return govde;
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi (JSON nesnesi bekleniyor).' });
      return null;
    }
  };
  const tokenYok = () => jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });

  try {
    // --- GET /platform/durum (kasa kilitliyken de çalışır; YALNIZCA gizli olmayan bilgi) -----
    if (req.method === 'GET' && yol === '/platform/durum') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const db = await platformVeritabani();
      const ozet = db ? platformDurumOzeti(db) : null;
      jsonGonder(res, 200, {
        basarili: true,
        veritabaniVar: Boolean(db),
        veritabaniYolu: veritabaniYolu(),
        semaSurumu: ozet?.semaSurumu ?? 0,
        desteklenenSemaSurumu: GUNCEL_SEMA_SURUMU,
        makineId: ozet?.makineId ?? null,
        kasa: ozet?.kasa ?? { olusturuldu: false, acik: false, minParolaUzunlugu: MIN_PAROLA_UZUNLUGU, kdf: null },
        sifreliAlanGocu: ozet?.sifreliAlanGocu ?? 'tamam',
        sayimlar: ozet?.sayimlar ?? {},
        parolaBeklemeSaniye: Math.ceil(denemeSiniri.kalanMs() / 1000),
        aktifIceAktarma: iceAktarma.aktifIs()
      });
      return true;
    }

    // --- GET /platform/yedek/ice-aktar/<id> — ilerleme + (hazırsa) önizleme ------------------
    const isEslesme = /^\/platform\/yedek\/ice-aktar\/([a-f0-9]{16})(?:\/(uygula|iptal))?$/.exec(yol);
    if (req.method === 'GET' && isEslesme && !isEslesme[2]) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const is = iceAktarma.durum(isEslesme[1]);
      if (!is) { jsonGonder(res, 404, { basarili: false, kod: 'BULUNAMADI', mesaj: 'İçe aktarma bulunamadı (süresi dolmuş veya iptal edilmiş olabilir).' }); return true; }
      jsonGonder(res, 200, { basarili: is.durum !== 'hata', is });
      return true;
    }

    // --- POST /platform/yedek/ice-aktar (ham dosya gövdesi) → önizleme hazırlığı --------------
    if (req.method === 'POST' && yol === '/platform/yedek/ice-aktar') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const hamParola = req.headers['x-kasa-parola'];
      let parola = '';
      try {
        parola = typeof hamParola === 'string' ? decodeURIComponent(hamParola) : '';
      } catch {
        parola = '';
      }
      if (!parola) {
        res.setHeader('Connection', 'close');
        jsonGonder(res, 400, { basarili: false, mesaj: 'Yedeğin kasa parolası X-Kasa-Parola başlığında (encodeURIComponent ile) gönderilmelidir.' });
        return true;
      }
      // Bekleme süresi / meşgul kontrolü dosya okunmadan önce yapılır.
      try {
        denemeSiniri.kontrolEt();
        if (iceAktarma.aktifIs()) throw new YedekHatasi('MESGUL', 'Başka bir içe aktarma sürüyor; bitmesini bekleyin.');
        const mevcutDb = await platformVeritabani();
        if (mevcutDb && kasaDurumu(mevcutDb).olusturuldu && !kasaAcikMi(mevcutDb)) {
          throw new KasaHatasi('KASA_KILITLI', 'İçe aktarma için önce bu makinedeki kasayı açın.');
        }
      } catch (hata) {
        res.setHeader('Connection', 'close');
        throw hata;
      }
      let dosya;
      try {
        dosya = await ikiliGovdeOku(req, YEDEK_YUKLEME_SINIRI);
      } catch (hata) {
        const cokBuyuk = Boolean(/** @type {{ cokBuyuk?: boolean }} */ (hata).cokBuyuk);
        if (cokBuyuk) res.setHeader('Connection', 'close');
        jsonGonder(res, cokBuyuk ? 413 : 400, {
          basarili: false,
          mesaj: cokBuyuk ? `Yedek dosyası en fazla ${YEDEK_YUKLEME_SINIRI / 1024 / 1024} MB olabilir.` : 'Dosya okunamadı.'
        });
        return true;
      }
      if (!dosya.length) { jsonGonder(res, 400, { basarili: false, mesaj: 'Boş dosya gönderildi.' }); return true; }
      const isId = iceAktarma.baslat(dosya, parola);
      parola = '';
      jsonGonder(res, 202, { basarili: true, isId });
      return true;
    }

    if (req.method !== 'POST') {
      jsonGonder(res, 404, { basarili: false, mesaj: 'Bilinmeyen platform uç noktası.' });
      return true;
    }

    const govde = await jsonGovde();
    if (!govde) return true;
    if (govde.token !== baglam.token && !disTokenGecerli) { tokenYok(); return true; }
    const metin = (/** @type {unknown} */ d) => (typeof d === 'string' ? d : '');

    if (isEslesme && isEslesme[2] === 'uygula') {
      const secim = govde.tumu === true
        ? { tumu: true }
        : { secimler: /** @type {Record<string, string[]>} */ (govde.secimler) };
      const sonuc = await iceAktarma.uygula(isEslesme[1], secim);
      console.log(`[platform] Yedek içe aktarıldı (${sonuc.tamYukleme ? 'tam yükleme' : 'seçmeli'}), üzerine yazılan sürüm geçmişe: ${sonuc.gecmiseYazilan}.`);
      jsonGonder(res, 200, { basarili: true, sonuc });
      return true;
    }
    if (isEslesme && isEslesme[2] === 'iptal') {
      const iptal = iceAktarma.iptal(isEslesme[1]);
      jsonGonder(res, iptal ? 200 : 409, iptal
        ? { basarili: true, mesaj: 'İçe aktarma iptal edildi; hazırlık alanı silindi.' }
        : { basarili: false, mesaj: 'İçe aktarma bulunamadı veya artık iptal edilemez.' });
      return true;
    }

    switch (yol) {
      case '/platform/kasa/olustur': {
        const db = /** @type {import('./veritabani/baglanti.mjs').Veritabani} */ (await platformVeritabani({ olustur: true }));
        const kasa = await kasaOlustur(db, metin(govde.parola));
        console.log('[platform] Kasa oluşturuldu.');
        jsonGonder(res, 200, { basarili: true, kasa });
        return true;
      }
      case '/platform/kasa/ac': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        const kasa = await denemeSiniri.dene(() => kasaAc(db, metin(govde.parola)));
        yerelMakine(db);
        jsonGonder(res, 200, { basarili: true, kasa });
        return true;
      }
      case '/platform/kasa/kilitle': {
        const db = await platformVeritabani();
        jsonGonder(res, 200, { basarili: true, kasa: db ? kasaKilitle(db) : { olusturuldu: false, acik: false } });
        return true;
      }
      case '/platform/kasa/parola-degistir': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        const kasa = await denemeSiniri.dene(() => parolaDegistir(db, metin(govde.eskiParola), metin(govde.yeniParola)));
        console.log(`[platform] Kasa parolası değiştirildi (${kasa.yenidenSifrelenen} değer yeniden şifrelendi).`);
        jsonGonder(res, 200, { basarili: true, kasa });
        return true;
      }
      case '/platform/yedek/disa-aktar': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        if (!kasaAcikMi(db)) throw new KasaHatasi('KASA_KILITLI', 'Kasa kilitli. Önce kasa parolasıyla kasayı açın.');
        const anahtar = await denemeSiniri.dene(async () => {
          const a = await parolayiDogrula(db, metin(govde.parola));
          if (!a) throw new KasaHatasi('PAROLA_YANLIS', 'Kasa parolası yanlış.');
          return a;
        });
        anahtar.fill(0);
        const { veri, manifest } = yedekOlustur(db);
        const makineAdi = hostname().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'makine';
        const dosyaAdi = `platform-yedek-${makineAdi}-${dosyaZamani(new Date())}${YEDEK_UZANTISI}`;
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': veri.length,
          'Content-Disposition': `attachment; filename="${dosyaAdi}"`,
          'Cache-Control': 'no-store',
          'X-Yedek-Sayimlari': encodeURIComponent(JSON.stringify(manifest.sayimlar))
        });
        res.end(veri);
        console.log(`[platform] Yedek dışa aktarıldı (${veri.length} bayt).`);
        return true;
      }
      case '/platform/yedek/otomatik': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        const sonuc = otomatikYedekAl(db);
        console.log(`[platform] Otomatik yedek alındı: ${sonuc.dosya}`);
        jsonGonder(res, 200, { basarili: true, dosya: sonuc.dosya, boyut: sonuc.boyut, silinenler: sonuc.silinenler });
        return true;
      }
      default:
        jsonGonder(res, 404, { basarili: false, mesaj: 'Bilinmeyen platform uç noktası.' });
        return true;
    }
  } catch (hata) {
    const yanit = hataYaniti(hata);
    if (!yanit) throw hata;
    if (!res.headersSent) jsonGonder(res, yanit.durum, yanit.govde);
    return true;
  }
}

/** Sunucu açıkken ve kasa açıkken günde bir yerel otomatik yedek alır. */
export function platformOtomatikYedekZamanla() {
  const zamanlayici = setInterval(() => {
    if (!vt || !kasaAcikMi(vt)) return;
    try {
      const sonuc = otomatikYedekAl(vt);
      console.log(`[platform] Günlük otomatik yedek alındı: ${sonuc.dosya}`);
    } catch (hata) {
      console.error(`[platform] Günlük otomatik yedek alınamadı: ${/** @type {Error} */ (hata)?.message ?? hata}`);
    }
  }, 24 * 60 * 60 * 1000);
  zamanlayici.unref();
}
