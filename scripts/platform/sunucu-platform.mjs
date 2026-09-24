// Test sunucusunun (scripts/test-sunucu.mjs) /platform/* uç noktaları: platform veritabanı
// durumu, kasa (oluştur/aç/kilitle/parola değiştir) ve yedek (dışa/içe aktar, otomatik yedek).
//
// Güvenlik: test-sunucu.mjs'deki yerel istek (loopback + Host) ve origin kontrolleri bu
// fonksiyon çağrılmadan ÖNCE yapılır. Burada ayrıca her istek aynı token'ı taşımak zorundadır
// (JSON gövdesinde "token", ya da X-Test-Sunucu-Token başlığı / ?token= sorgu parametresi).
// Parolalar yalnızca istek GÖVDESİNDE (JSON) veya ice-aktar için X-Kasa-Parola başlığında
// (encodeURIComponent ile) gelir; URL'de parola kabul edilmez. Parola/anahtar ASLA loglanmaz,
// yanıtlarda dönmez.

import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { veritabaniYolu as veritabaniYoluCoz } from './veritabani/baglanti.mjs';
import { GUNCEL_SEMA_SURUMU, mevcutSemaSurumu } from './veritabani/gocler.mjs';
import { DepoHatasi, sayimlar, veritabaniniHazirla, yerelMakine } from './veritabani/depo.mjs';
import { KasaHatasi, kasaAc, kasaAcikMi, kasaDurumu, kasaKilitle, kasaOlustur, parolaDegistir, parolayiDogrula } from './kasa.mjs';
import { YEDEK_UZANTISI, YedekHatasi, otomatikYedekAl, yedekAc, yedekIceAktar, yedekOlustur } from './yedek.mjs';

export const JSON_GOVDE_SINIRI = 64 * 1024;
export const YEDEK_YUKLEME_SINIRI = 500 * 1024 * 1024;
const IS_SAKLAMA_MS = 60 * 60 * 1000;
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

/** @type {Map<string, { id: string; durum: 'calisiyor' | 'tamamlandi' | 'hata'; asama: string; yuzde: number; mesaj: string | null; kod: string | null; sonuc: unknown; baslangic: number; bitis: number | null }>} */
const iceAktarmaIsleri = new Map();

function eskiIsleriTemizle() {
  const esik = Date.now() - IS_SAKLAMA_MS;
  for (const [id, is] of iceAktarmaIsleri) {
    if (is.bitis && is.bitis < esik) iceAktarmaIsleri.delete(id);
  }
}

/** Hata → HTTP durum kodu + güvenli (gizli bilgi içermeyen) mesaj. @param {unknown} hata */
function hataYaniti(hata) {
  if (hata instanceof KasaHatasi) {
    const kodlar = { PAROLA_KISA: 400, PAROLA_YANLIS: 403, KASA_KILITLI: 423, KASA_YOK: 409, KASA_VAR: 409, ZARF_BOZUK: 400 };
    return { durum: kodlar[hata.kod] ?? 400, govde: { basarili: false, kod: hata.kod, mesaj: hata.message } };
  }
  if (hata instanceof YedekHatasi) {
    return { durum: hata.kod === 'ONAY_GEREKLI' ? 409 : 400, govde: { basarili: false, kod: hata.kod, mesaj: hata.message } };
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
    // --- GET /platform/durum --------------------------------------------------------------
    if (req.method === 'GET' && yol === '/platform/durum') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const db = await platformVeritabani();
      jsonGonder(res, 200, {
        basarili: true,
        veritabaniVar: Boolean(db),
        veritabaniYolu: veritabaniYolu(),
        semaSurumu: db ? mevcutSemaSurumu(db) : 0,
        desteklenenSemaSurumu: GUNCEL_SEMA_SURUMU,
        makine: db ? yerelMakine(db) : { id: null, ad: hostname() },
        kasa: db ? kasaDurumu(db) : { olusturuldu: false, acik: false, minParolaUzunlugu: 8, kdf: null },
        sayimlar: db ? sayimlar(db) : {},
        aktifIceAktarma: [...iceAktarmaIsleri.values()].find((i) => i.durum === 'calisiyor')?.id ?? null
      });
      return true;
    }

    // --- GET /platform/yedek/ice-aktar/<id> ---------------------------------------------------
    const isEslesme = /^\/platform\/yedek\/ice-aktar\/([a-f0-9]{16})$/.exec(yol);
    if (req.method === 'GET' && isEslesme) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const is = iceAktarmaIsleri.get(isEslesme[1]);
      if (!is) { jsonGonder(res, 404, { basarili: false, mesaj: 'İçe aktarma işi bulunamadı (süresi dolmuş olabilir).' }); return true; }
      jsonGonder(res, 200, { basarili: is.durum !== 'hata', is });
      return true;
    }

    // --- POST /platform/yedek/ice-aktar (ham dosya gövdesi) -----------------------------------
    if (req.method === 'POST' && yol === '/platform/yedek/ice-aktar') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const mod = url.searchParams.get('mod') ?? 'birlestir';
      if (mod !== 'tamYukle' && mod !== 'birlestir') {
        jsonGonder(res, 400, { basarili: false, mesaj: 'mod yalnızca "tamYukle" veya "birlestir" olabilir.' });
        return true;
      }
      const onay = url.searchParams.get('onay') === '1' || url.searchParams.get('onay') === 'true';
      const hamParola = req.headers['x-kasa-parola'];
      let parola = '';
      try {
        parola = typeof hamParola === 'string' ? decodeURIComponent(hamParola) : '';
      } catch {
        parola = '';
      }
      if (!parola) {
        jsonGonder(res, 400, { basarili: false, mesaj: 'Yedeğin kasa parolası X-Kasa-Parola başlığında (encodeURIComponent ile) gönderilmelidir.' });
        return true;
      }
      eskiIsleriTemizle();
      if ([...iceAktarmaIsleri.values()].some((i) => i.durum === 'calisiyor')) {
        jsonGonder(res, 409, { basarili: false, mesaj: 'Başka bir içe aktarma sürüyor; bitmesini bekleyin.' });
        return true;
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
      const id = randomBytes(8).toString('hex');
      const is = { id, durum: /** @type {'calisiyor' | 'tamamlandi' | 'hata'} */ ('calisiyor'), asama: 'sırada', yuzde: 0, mesaj: null, kod: null, sonuc: null, baslangic: Date.now(), bitis: null };
      iceAktarmaIsleri.set(id, is);
      jsonGonder(res, 202, { basarili: true, isId: id });
      (async () => {
        try {
          // Veritabanı dosyası henüz yoksa, yanlış parolada boş bir dosya bile oluşmasın diye
          // önce yedek parolayla doğrulanır (hiçbir şey yazmaz).
          if (!(await platformVeritabani())) {
            const onKontrol = await yedekAc(dosya, parola, { ilerleme: (asama, yuzde) => { is.asama = asama; is.yuzde = Math.min(yuzde, 5); } });
            onKontrol.kasaAnahtari.fill(0);
          }
          const db = /** @type {import('./veritabani/baglanti.mjs').Veritabani} */ (await platformVeritabani({ olustur: true }));
          const sonuc = await yedekIceAktar(db, dosya, parola, {
            mod, onay,
            ilerleme: (asama, yuzde) => { is.asama = asama; is.yuzde = yuzde; }
          });
          is.sonuc = {
            ...sonuc,
            cakismaSayisi: sonuc.cakismalar.length,
            cakismalar: sonuc.cakismalar.slice(0, 500)
          };
          is.durum = 'tamamlandi';
          is.yuzde = 100;
          console.log(`[platform] Yedek içe aktarıldı (${mod}), çakışma: ${sonuc.cakismalar.length}.`);
        } catch (hata) {
          const yanit = hataYaniti(hata);
          is.durum = 'hata';
          is.kod = yanit ? String(yanit.govde.kod) : 'SUNUCU';
          is.mesaj = yanit ? yanit.govde.mesaj : `Beklenmeyen hata: ${/** @type {Error} */ (hata)?.message ?? hata}`;
          if (!yanit) console.error(`[platform] İçe aktarma hatası: ${/** @type {Error} */ (hata)?.stack ?? hata}`);
        } finally {
          is.bitis = Date.now();
          parola = '';
        }
      })();
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
        const kasa = await kasaAc(db, metin(govde.parola));
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
        const kasa = await parolaDegistir(db, metin(govde.eskiParola), metin(govde.yeniParola));
        console.log(`[platform] Kasa parolası değiştirildi (${kasa.yenidenSifrelenen} değer yeniden şifrelendi).`);
        jsonGonder(res, 200, { basarili: true, kasa });
        return true;
      }
      case '/platform/yedek/disa-aktar': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        if (!kasaAcikMi(db)) throw new KasaHatasi('KASA_KILITLI', 'Kasa kilitli. Önce kasa parolasıyla kasayı açın.');
        const anahtar = await parolayiDogrula(db, metin(govde.parola));
        if (!anahtar) throw new KasaHatasi('PAROLA_YANLIS', 'Kasa parolası yanlış.');
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
