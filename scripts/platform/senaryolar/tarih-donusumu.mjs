// ESKİYEN TARİHLER → BUGÜNE GÖRE (kullanıcı onayıyla). Ekran senaryosunun tarih alanında SABİT tarih geçmişte kaldıysa (ya da bugün
// koşulursa alanın sınırının dışındaysa) senaryo koşuda kırılır. Senaryolar listesi bunu "tarih eskidi" rozetiyle gösterir; seçili
// senaryolar için toplu dönüşüm önce ÖNİZLEME döner (hangi senaryo, hangi ortam, hangi alan, eski → yeni ifade), onayla yazılır.
//   · Yeni ifade: goreli-tarih.mjs > bugunuGoreliOner — tarihin senaryonun son kaydedildiği güne göre farkı korunur ("bugün+N"),
//     kayıt anı yoksa "bugün"; bugün koşulursa sınır dışında kalacaksa sınıra çekilir.
//   · Yazım senaryo-servisi.mjs senaryoOrtamVerileriniYaz ile: tek doğrulayıcı, kasa zarfı, değişiklik geçmişi (önceki içerik
//     geçmişte kalır). Hassas (kasada şifreli) tarih alanında değer gösterilmez ve dönüştürülmez.
// NOT: import.meta KULLANILMAZ. Tipler: tarih-donusumu.d.mts.
import { DepoHatasi, ortamlariListele } from '../veritabani/depo.mjs';
import { acikAnahtar, zarflariCoz } from '../kasa.mjs';
import { formSemasiOlustur, tumFormAlanlari } from './model-formu.mjs';
import { modelBaglami, senaryoAkisi, senaryoKaynagi, senaryoOrtamVerileriniYaz, veriGudumluMu } from './senaryo-servisi.mjs';
import { modelSenaryosuMu } from './model-kosusu.mjs';
import { bugunuGoreliOner, eskiyenTarihAlanlari, goreliTarihCoz } from './goreli-tarih.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/** @typedef {Record<string, unknown>} Nesne */

/** @param {unknown} d @returns {d is Nesne} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/**
 * Onaysız: { onizleme }. Onaylı: seçili senaryoların eskimiş tarihleri bugüne göre yazılır.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ senaryoIdleri: unknown; onay?: boolean; yapan?: string; simdi?: Date }} girdi
 * @param {{ kosuyorMu?: (dosya: string, ad: string) => boolean }} [secenekler]
 */
export function goreliTarihDonusumu(vt, projeId, girdi, secenekler = {}) {
  acikAnahtar(vt);
  const idler = Array.isArray(girdi.senaryoIdleri) ? [...new Set(girdi.senaryoIdleri.filter((x) => typeof x === 'string' && x))] : [];
  if (!idler.length) throw new DepoHatasi('En az bir senaryo seçin.');
  if (idler.length > 1000) throw new DepoHatasi('En çok 1000 senaryo seçilebilir.');
  const simdi = girdi.simdi instanceof Date ? girdi.simdi : new Date();
  const ortamAdlari = new Map(ortamlariListele(vt, projeId).map((o) => [o.id, o.ad]));
  /** @type {Array<{ senaryoId: string; senaryo: string; ortam: string; alan: string; alanEtiketi: string; eski: string; yeni: string; yeniTarih: string; mesaj: string }>} */
  const satirlar = [];
  /** @type {Array<{ senaryoId: string; senaryo: string; neden: string }>} */
  const atlananlar = [];
  /** @type {Array<{ senaryoId: string; ortamVerileri: Record<string, Nesne>; alanlar: string[] }>} */
  const yazimlar = [];
  /** @type {Map<string, any>} */
  const semalar = new Map();
  for (const id of idler) {
    const s = vt.tek('SELECT id, baslik, ekran_id, icerik_json, guncellenme FROM senaryolar WHERE id = ? AND proje_id = ?', [id, projeId]);
    if (!s) { atlananlar.push({ senaryoId: id, senaryo: id, neden: 'senaryo bulunamadı' }); continue; }
    const baslik = String(s.baslik);
    const icerik = /** @type {Nesne} */ (JSON.parse(String(s.icerik_json)));
    if (!s.ekran_id || !modelSenaryosuMu(icerik) || !veriGudumluMu(icerik) || !nesneMi(icerik.ortamlar)) {
      atlananlar.push({ senaryoId: id, senaryo: baslik, neden: 'bu senaryonun biçimi desteklenmiyor' });
      continue;
    }
    const kaynak = senaryoKaynagi(icerik);
    if (kaynak && secenekler.kosuyorMu?.(kaynak.dosya, kaynak.ad)) { atlananlar.push({ senaryoId: id, senaryo: baslik, neden: 'senaryo şu an koşuyor' }); continue; }
    const akis = senaryoAkisi(icerik);
    const semaAnahtari = `${s.ekran_id}\u0000${akis ?? ''}`;
    if (!semalar.has(semaAnahtari)) {
      const mb = modelBaglami(vt, String(s.ekran_id), akis);
      let sema = null;
      try { sema = mb ? formSemasiOlustur(mb.model, mb.altModeller) : null; } catch { sema = null; }
      semalar.set(semaAnahtari, sema);
    }
    const sema = semalar.get(semaAnahtari);
    if (!sema) { atlananlar.push({ senaryoId: id, senaryo: baslik, neden: 'ekranın modeli yok' }); continue; }
    const ortamlar = /** @type {Record<string, Nesne>} */ (icerik.ortamlar);
    /** @type {Record<string, Nesne>} */
    const ortamVerileri = {};
    const alanlar = new Set();
    for (const [ortamId, o] of Object.entries(ortamlar)) {
      if (!nesneMi(o) || !nesneMi(o.veri)) continue;
      const veri = /** @type {Nesne} */ (zarflariCoz(vt, o.veri));
      const eskiler = eskiyenTarihAlanlari(tumFormAlanlari(sema), veri, simdi, String(s.guncellenme ?? ''));
      if (!eskiler.length) continue;
      const yeniVeri = { ...veri };
      for (const e of eskiler) {
        const yeni = bugunuGoreliOner(e.deger, e.bicim, String(s.guncellenme ?? ''), e.sinirlar, simdi);
        yeniVeri[e.anahtar] = yeni;
        alanlar.add(e.anahtar);
        satirlar.push({
          senaryoId: id, senaryo: baslik, ortam: ortamAdlari.get(ortamId) ?? ortamId, alan: e.anahtar, alanEtiketi: e.etiket, eski: e.deger, yeni,
          yeniTarih: goreliTarihCoz(yeni, e.bicim, simdi) ?? '', mesaj: e.mesaj
        });
      }
      ortamVerileri[ortamId] = yeniVeri;
    }
    if (!alanlar.size) { atlananlar.push({ senaryoId: id, senaryo: baslik, neden: 'eskimiş sabit tarih yok' }); continue; }
    yazimlar.push({ senaryoId: id, ortamVerileri, alanlar: [...alanlar] });
  }
  const onizleme = {
    satirlar, atlananlar,
    ozet: { senaryo: yazimlar.length, alan: satirlar.length },
    aciklama: 'Yeni değer, tarihin senaryonun son kaydedildiği güne göre farkını korur ("bugün+N"); kayıt günü bilinmiyorsa "bugün". Önceki içerik değişiklik geçmişinde kalır.'
  };
  if (girdi.onay !== true) return { onizleme };
  if (!yazimlar.length) throw new DepoHatasi('Seçilen senaryolarda bugüne göre yapılacak eskimiş tarih yok.');
  vt.islem(() => {
    for (const y of yazimlar) {
      senaryoOrtamVerileriniYaz(vt, { projeId, id: y.senaryoId, ortamVerileri: y.ortamVerileri, denetlenecekAlanlar: y.alanlar, yapan: girdi.yapan }, secenekler);
    }
  });
  return { uygulandi: true, guncellenenSenaryo: yazimlar.length, donusturulenAlan: satirlar.length, onizleme };
}
