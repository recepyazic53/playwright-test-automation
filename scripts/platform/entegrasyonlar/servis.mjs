// ENTEGRASYON SERVİSİ — bağlantı denemesi, koşu bitti bildirimi, hata kaydı açma, veritabanı sorgusu ve DBeaver içe aktarma.
// Kurallar: dış istekler yalnız kullanıcı eylemiyle (deneme, hata kaydı) ya da kullanıcının seçtiği olayla (koşu bitti) gider;
// yasak adresler (Ayarlar > Güvenlik) her istekte uygulanır; zaman aşımı kullanıcının "Servis isteği zaman aşımı" ayarıdır;
// hata / durum mesajlarında gizli değer bulunmaz. Koşu bildirimi hatası koşuyu ETKİLEMEZ, yalnız bağlantının durumuna yazılır.
// NOT: import.meta KULLANILMAZ.
import { join } from 'node:path';
import { kasaAcikMi, medyaAnahtariniHazirla } from '../kasa.mjs';
import { medyaTamamenCoz } from '../medya.mjs';
import { ortamGetir, projeGetir } from '../veritabani/depo.mjs';
import { medyaGetir, sonucDetayi } from '../veritabani/sonuc-deposu.mjs';
import { kosuAyarlariniOku } from '../ayarlar/kosu-ayarlari.mjs';
import { etkinYasakDesenleri } from '../guvenlik/yasak-adresler.mjs';
import { EntegrasyonHatasi, gizlileriMaskele } from './istek.mjs';
import { gizliDegerler, turBul, veritabaniAyari } from './katalog.mjs';
import { alanlariHazirla, baglantiGetir, baglantiKaydet, durumYaz, tumBaglantilar } from './depo.mjs';
import { veritabaniSorgusu } from './veritabani-suruculeri.mjs';
import { dbeaverBaglantilariniOku } from './dbeaver.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

/** Ek dosyaların (ekran görüntüsü / video) toplam üst sınırı. */
export const EK_TOPLAM_SINIRI = 50 * 1024 * 1024;

/** İstek ortamı: yasak adres kalıpları + kullanıcının servis zaman aşımı. @param {Veritabani} vt */
export function istekOrtami(vt) {
  let zamanAsimiMs = 60_000;
  try { zamanAsimiMs = kosuAyarlariniOku(vt).servisZamanAsimiSn * 1000; } catch { /* varsayılan */ }
  return { yasakDesenleri: etkinYasakDesenleri(vt), zamanAsimiMs };
}

/** @param {unknown} hata @param {string[]} gizliler */
const hataMesaji = (hata, gizliler) => gizlileriMaskele(
  hata instanceof EntegrasyonHatasi ? hata.message : `Beklenmeyen hata: ${String(/** @type {Error} */ (hata)?.message ?? hata).slice(0, 200)}`, gizliler);

/**
 * Deneme/önizleme için alanlar: taslak (form) alanları, düzenlemede kayıtlı gizli değerlerle tamamlanır. alanlar verilmezse kayıtlı alanlar.
 * @param {Veritabani} vt @param {string} projeId @param {Record<string, unknown>} g
 */
function denenecekAlanlar(vt, projeId, g) {
  const mevcut = g.id ? baglantiGetir(vt, String(g.id), projeId) : null;
  const tur = mevcut ? mevcut.tur : String(g.tur ?? '');
  const t = turBul(tur);
  if (!t) throw new EntegrasyonHatasi('Bilinmeyen entegrasyon türü.');
  const kayitli = g.alanlar === undefined;
  if (kayitli && !mevcut) throw new EntegrasyonHatasi('Denenecek alanlar yok.');
  const alanlar = kayitli ? /** @type {NonNullable<typeof mevcut>} */ (mevcut).alanlar : alanlariHazirla(tur, g.alanlar, mevcut?.alanlar);
  return { t, alanlar, mevcut, kayitli };
}

/**
 * Onay diyaloğunda gösterilecek hedef (gizli yol / sorgu yazılmaz). g: { id?, tur, alanlar? }
 * @param {Veritabani} vt @param {string} projeId @param {Record<string, unknown>} g
 */
export function denemeHedefi(vt, projeId, g) {
  const { t, alanlar } = denenecekAlanlar(vt, projeId, g);
  return t.denemeHedefi(alanlar);
}

/**
 * Bağlantıyı dener — YALNIZ kullanıcı onaylayınca (g.onay === true). Kayıtlı bağlantı (alanlar verilmeden) denenirse sonuç
 * bağlantının durumuna yazılır; taslak (sihirbaz) denemesinin sonucu döner, kaydederken "sonDeneme" olarak gelir.
 * @param {Veritabani} vt @param {string} projeId @param {Record<string, unknown>} g
 */
export async function baglantiDene(vt, projeId, g) {
  if (g.onay !== true) throw new EntegrasyonHatasi('Bağlantı denemesi için onay gerekir.');
  const { t, alanlar, mevcut, kayitli } = denenecekAlanlar(vt, projeId, g);
  const gizliler = gizliDegerler(t, alanlar);
  /** @type {{ basarili: boolean; mesaj: string }} */
  let s;
  try { s = await t.dene(alanlar, istekOrtami(vt)); } catch (hata) { s = { basarili: false, mesaj: hataMesaji(hata, gizliler) }; }
  s = { basarili: s.basarili, mesaj: gizlileriMaskele(s.mesaj, gizliler) };
  if (kayitli && mevcut) return { sonuc: durumYaz(vt, mevcut.id, s) };
  return { sonuc: { sonuc: s.basarili ? 'bagli' : 'hata', zaman: new Date().toISOString(), mesaj: s.mesaj } };
}

// ---------------------------------------------------------------------------------------
// Olay: koşu bitti
// ---------------------------------------------------------------------------------------

/**
 * Koşu bitince (raporlayıcının "bitir" çağrısından sonra) "koşu bitti" olayına bağlı etkin bağlantılara bildirim gönderir.
 * Kasa kilitliyse bağlantılar okunamaz → hiçbir şey gönderilmez. Hiçbir durumda hata FIRLATMAZ.
 * s.baglantiIdleri verilirse (zamanlanmış koşunun "sonuçları bildir" seçimi) olay aboneliğine bakılmadan YALNIZ bu etkin
 * bağlantılara gönderilir.
 * @param {Veritabani} vt @param {string} kosuId @param {{ baglantiIdleri?: string[] }} [s]
 * @returns {Promise<Array<{ baglantiId: string; basarili: boolean; mesaj: string }>>}
 */
export async function kosuBittiBildir(vt, kosuId, s = {}) {
  /** @type {Array<{ baglantiId: string; basarili: boolean; mesaj: string }>} */
  const sonuclar = [];
  try {
    if (!kasaAcikMi(vt)) return sonuclar;
    const k = vt.tek('SELECT proje_id, ortam_id, durum, tur, bitis, ozet_json FROM kosular WHERE id = ?', [kosuId]);
    if (!k || !k.proje_id) return sonuclar;
    const projeId = String(k.proje_id);
    const ortamId = k.ortam_id == null ? null : String(k.ortam_id);
    const secili = s.baglantiIdleri;
    const hedefler = tumBaglantilar(vt).filter((b) => b.projeId === projeId && b.etkin && (secili ? secili.includes(b.id)
      : b.olaylar.includes('kosu-bitti') && (!b.ortamIdleri.length || (ortamId !== null && b.ortamIdleri.includes(ortamId)))));
    if (!hedefler.length) return sonuclar;
    /** @type {Record<string, number>} */
    let ozet = {};
    try { ozet = JSON.parse(String(k.ozet_json ?? '{}')); } catch { ozet = {}; }
    const basarili = Number(ozet.basarili) || 0;
    const kalan = Number(ozet.basarisiz) || 0;
    const atlanan = (Number(ozet.atlanan) || 0) + (Number(ozet.durduruldu) || 0);
    let ortamAdi = null;
    try { ortamAdi = ortamId ? ortamGetir(vt, ortamId)?.ad ?? null : null; } catch { ortamAdi = null; }
    /** @type {import('./katalog.mjs').KosuOzeti} */
    const veri = {
      proje: projeGetir(vt, projeId)?.ad ?? '—', ortam: ortamAdi, kosuTuru: String(k.tur), durum: String(k.durum),
      toplam: basarili + kalan + atlanan, basarili, kalan, atlanan,
      basariOrani: basarili + kalan > 0 ? Math.round((basarili / (basarili + kalan)) * 1000) / 10 : null, bitis: k.bitis == null ? null : String(k.bitis)
    };
    const ortam = istekOrtami(vt);
    for (const b of hedefler) {
      const t = turBul(b.tur);
      if (!t?.olayGonder) continue;
      const gizliler = gizliDegerler(t, b.alanlar);
      /** @type {{ basarili: boolean; mesaj: string } | null} */
      let s;
      try { s = await t.olayGonder(b.alanlar, 'kosu-bitti', veri, ortam); } catch (hata) { s = { basarili: false, mesaj: hataMesaji(hata, gizliler) }; }
      if (!s) continue;
      const mesaj = `Koşu bildirimi: ${s.mesaj}`;
      try { durumYaz(vt, b.id, { basarili: s.basarili, mesaj }); } catch { /* kasa bu arada kilitlendiyse yazılamaz */ }
      sonuclar.push({ baglantiId: b.id, basarili: s.basarili, mesaj: gizlileriMaskele(mesaj, gizliler) });
    }
  } catch { /* koşuyu etkilemez */ }
  return sonuclar;
}

// ---------------------------------------------------------------------------------------
// Hata kaydı açma (Sonuçlar > test ayrıntısı)
// ---------------------------------------------------------------------------------------

/** @param {Veritabani} vt @param {string} projeId @param {string} baglantiId */
function takipBaglantisi(vt, projeId, baglantiId) {
  const b = baglantiGetir(vt, baglantiId, projeId);
  const t = turBul(b.tur);
  if (!t?.kayitAc) throw new EntegrasyonHatasi('Bu bağlantı hata kaydı açamaz.');
  if (!b.etkin) throw new EntegrasyonHatasi('Bağlantı devre dışı. Ayarlar > Entegrasyonlar\'dan etkinleştirin.');
  return { b, t };
}

/** @param {Veritabani} vt @param {string} projeId @param {string} sonucId */
function sonucAl(vt, projeId, sonucId) {
  const s = sonucDetayi(vt, sonucId);
  if (!s || s.projeId !== projeId) throw new EntegrasyonHatasi('Test sonucu bulunamadı.');
  return s;
}

const DURUM_METNI = /** @type {Record<string, string>} */ ({ basarili: 'Geçti', basarisiz: 'Kaldı', atlanan: 'Atlandı', durduruldu: 'Durduruldu' });

/**
 * Gönderilecek başlık / açıklamanın önizlemesi (kullanıcı düzenleyip onaylar) + eklenebilecek medya.
 * @param {Veritabani} vt @param {string} projeId @param {string} sonucId @param {string} baglantiId
 */
export function hataKaydiOnizle(vt, projeId, sonucId, baglantiId) {
  const { b, t } = takipBaglantisi(vt, projeId, baglantiId);
  const s = sonucAl(vt, projeId, sonucId);
  const k = vt.tek('SELECT ortam_id FROM kosular WHERE id = ?', [s.kosuId]);
  let ortam = null;
  try { ortam = k?.ortam_id ? ortamGetir(vt, String(k.ortam_id))?.ad ?? null : null; } catch { ortam = null; }
  const adim = s.adimlar.find((a) => a.durum === 'basarisiz');
  const satirlar = [
    `Senaryo: ${s.senaryoBaslik}`, `Ürün / ekran: ${s.urun}`, `Ortam: ${ortam ?? '—'}`, `Durum: ${DURUM_METNI[s.durum] ?? s.durum}`,
    `Zaman: ${s.bitis ?? s.baslangic ?? '—'}`, `Koşu kimliği: ${s.kosuId}`,
    s.hataKategorisi ? `Hata kategorisi: ${s.hataKategorisi}` : null,
    adim ? `Başarısız adım: ${adim.ad}` : null,
    s.beklenenSonuc ? `Beklenen sonuç: ${s.beklenenSonuc}` : null,
    s.beklenenGorulen ? `Beklenen: ${s.beklenenGorulen.beklenen}\nGörülen: ${s.beklenenGorulen.gorulen}` : null,
    s.hataMesaji ? `\nHata:\n${s.hataMesaji.slice(0, 4000)}` : null,
    '\n— Nöbetçi test sonucundan açıldı.'
  ].filter((x) => x !== null);
  const gizliler = gizliDegerler(t, b.alanlar);
  const medya = s.medya.filter((m) => !m.yedekDisi && !m.silinme && (m.tur === 'ekran_goruntusu' || m.tur === 'video'))
    .map((m) => ({ id: m.id, tur: m.tur, ad: m.ad, boyut: m.boyut }));
  return {
    baglanti: { id: b.id, ad: b.ad }, hedef: t.denemeHedefi(b.alanlar).adres,
    baslik: gizlileriMaskele(`${s.senaryoBaslik} — ${DURUM_METNI[s.durum] ?? s.durum}${s.hataKategorisi ? ` (${s.hataKategorisi})` : ''}`.slice(0, 250), gizliler),
    aciklama: gizlileriMaskele(satirlar.join('\n'), gizliler),
    medya
  };
}

/**
 * Hata kaydını açar (kullanıcı önizlemeyi onaylayınca). g: { sonucId, baglantiId, baslik, aciklama, ekranGoruntuleri?, video?, onay: true }.
 * Ekran görüntüsü / video yalnız istenirse (varsayılan kapalı) şifreli depodan bellekte çözülüp eklenir.
 * @param {Veritabani} vt @param {string} projeId @param {Record<string, unknown>} g @param {{ medyaKlasoru: string }} secenekler
 */
export async function hataKaydiAc(vt, projeId, g, secenekler) {
  if (g.onay !== true) throw new EntegrasyonHatasi('Hata kaydı açmak için onay gerekir.');
  const { b, t } = takipBaglantisi(vt, projeId, String(g.baglantiId ?? ''));
  const s = sonucAl(vt, projeId, String(g.sonucId ?? ''));
  const baslik = typeof g.baslik === 'string' ? g.baslik.replace(/[\u0000-\u001f]/g, ' ').trim() : '';
  const aciklama = typeof g.aciklama === 'string' ? g.aciklama.replace(/\r\n/g, '\n').trim() : '';
  if (!baslik || baslik.length > 250) throw new EntegrasyonHatasi('Başlık 1–250 karakter olmalıdır.');
  if (aciklama.length > 30_000) throw new EntegrasyonHatasi('Açıklama en çok 30.000 karakter olabilir.');
  const gizliler = gizliDegerler(t, b.alanlar);
  /** @type {import('./katalog.mjs').Ek[]} */
  const ekler = [];
  /** @type {string[]} */
  const uyarilar = [];
  const turler = [g.ekranGoruntuleri === true ? 'ekran_goruntusu' : null, g.video === true ? 'video' : null].filter(Boolean);
  if (turler.length) {
    const anahtar = medyaAnahtariniHazirla(vt);
    try {
      let toplam = 0;
      for (const m of s.medya.filter((x) => turler.includes(x.tur) && !x.yedekDisi && !x.silinme)) {
        if (toplam + m.boyut > EK_TOPLAM_SINIRI) { uyarilar.push(`${m.ad} eklenmedi (ekler toplamı ${EK_TOPLAM_SINIRI / 1024 / 1024} MB'ı aşıyor).`); continue; }
        const kayit = medyaGetir(vt, m.id);
        if (!kayit) continue;
        try {
          ekler.push({ ad: m.ad, tur: m.tur, icerikTuru: m.icerikTuru || 'application/octet-stream', veri: await medyaTamamenCoz(anahtar, join(secenekler.medyaKlasoru, kayit.dosya)) });
          toplam += m.boyut;
        } catch { uyarilar.push(`${m.ad} okunamadı; eklenmedi.`); }
      }
    } finally { anahtar.fill(0); }
  }
  try {
    const r = await /** @type {NonNullable<typeof t.kayitAc>} */ (t.kayitAc)(b.alanlar, { baslik, aciklama, ekler }, istekOrtami(vt));
    durumYaz(vt, b.id, { basarili: true, mesaj: `Hata kaydı açıldı${r.anahtar ? `: ${r.anahtar}` : ''}.` });
    return { anahtar: r.anahtar, adres: r.adres, uyarilar: [...uyarilar, ...r.ekUyarilari].map((u) => gizlileriMaskele(u, gizliler)) };
  } catch (hata) {
    const mesaj = hataMesaji(hata, gizliler);
    durumYaz(vt, b.id, { basarili: false, mesaj });
    throw new EntegrasyonHatasi(mesaj);
  }
}

// ---------------------------------------------------------------------------------------
// Veritabanı sorgusu (ekran / servis akışlarındaki SQL adımı için dışa açık)
// ---------------------------------------------------------------------------------------

/**
 * Kayıtlı bir "Veritabanı bağlantısı" ile sorgu çalıştırır. Kasa açık olmalı; bağlantı etkin olmalı. Bağlantıda "Yalnız okuma"
 * açıksa (varsayılan) yalnız SELECT / WITH ile başlayan tek ifade çalışır. Parametreler SQL'de ":ad" ile yazılır ve sürücüye
 * bağlanır (SQL'e metin olarak eklenmez). Sunucu yasak adres kalıbına uyuyorsa bağlanılmaz. Hatalar EntegrasyonHatasi'dır ve
 * gizli değer (parola) içermez.
 * @param {Veritabani} vt @param {string} baglantiId @param {string} sql @param {Record<string, unknown> | null | undefined} parametreler
 * @param {{ zamanAsimiMs?: number; satirSiniri?: number }} [secenekler] zamanAsimiMs yoksa bağlantının zaman aşımı; satirSiniri yoksa 1000
 * @returns {Promise<{ sutunlar: string[]; satirlar: unknown[][]; kesildi: boolean }>}
 */
export async function sorguCalistir(vt, baglantiId, sql, parametreler, secenekler = {}) {
  const b = baglantiGetir(vt, baglantiId);
  if (b.tur !== 'veritabani') throw new EntegrasyonHatasi('Bu bağlantı bir veritabanı bağlantısı değil.');
  if (!b.etkin) throw new EntegrasyonHatasi(`"${b.ad}" bağlantısı devre dışı (Ayarlar > Entegrasyonlar).`);
  return veritabaniSorgusu(veritabaniAyari(b.alanlar), sql, parametreler, { ...secenekler, yasakDesenleri: etkinYasakDesenleri(vt) });
}

// ---------------------------------------------------------------------------------------
// DBeaver içe aktarma
// ---------------------------------------------------------------------------------------

/** Önizleme: kullanıcının seçtiği dosyanın içeriği → bağlantı listesi (parola yok). @param {unknown} icerik */
export const dbeaverOnizle = (icerik) => ({ baglantilar: dbeaverBaglantilariniOku(icerik) });

/**
 * Onaylanan DBeaver bağlantılarını "Veritabanı bağlantısı" olarak ekler (parola boş, yalnız okuma açık, durum: denenmedi).
 * Aynı ad varsa sonuna " (2)" … eklenir. @param {Veritabani} vt @param {string} projeId @param {unknown} icerik @param {unknown} kaynakIdleri
 */
export function dbeaverEkle(vt, projeId, icerik, kaynakIdleri) {
  if (!Array.isArray(kaynakIdleri) || !kaynakIdleri.length) throw new EntegrasyonHatasi('Eklenecek bağlantı seçilmedi.');
  const secilen = new Set(kaynakIdleri.filter((x) => typeof x === 'string'));
  const adaylar = dbeaverBaglantilariniOku(icerik).filter((x) => secilen.has(x.kaynakId) && x.destekleniyor);
  const adlar = new Set(tumBaglantilar(vt).filter((x) => x.projeId === projeId).map((x) => x.ad.toLocaleLowerCase('tr')));
  const eklenen = [];
  for (const d of adaylar) {
    let ad = d.ad.slice(0, 110);
    for (let i = 2; adlar.has(ad.toLocaleLowerCase('tr')); i++) ad = `${d.ad.slice(0, 110)} (${i})`;
    adlar.add(ad.toLocaleLowerCase('tr'));
    eklenen.push(baglantiKaydet(vt, projeId, {
      tur: 'veritabani', ad, etkin: true, olaylar: [],
      alanlar: { surucu: d.surucu, sunucu: d.sunucu, port: d.port, veritabani: d.veritabani, kullanici: d.kullanici, yalnizOkuma: true }
    }));
  }
  return { eklenen };
}
