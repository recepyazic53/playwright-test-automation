// ÖZET PANOSU — NÖBETÇİ VERİSİ KARTLARI (sunucu). Hazır sorgu şablonları Nöbetçi'nin kendi verisini (koşu sonuçları, senaryolar)
// okur; dış istek yoktur. Şablonlar ve parametreleri pano-duzeni.mjs > VERI_SABLONLARI'ndadır (arayüzle ortak):
//   basariOrani     seçilen ekranın (tam / tekil koşu sonuçları) ya da servisin (servis koşuları) son N gündeki başarı oranı
//   bugunBasarisiz  bugünkü koşularda başarısız olan ekran ve servis senaryoları (senaryo başına bir madde)
//   talepsiz        hiçbir talep numarası olmayan ekran / servis senaryoları
//   enCokBasarisiz  son N günde en çok başarısız olan senaryolar (ilk "adet")
// "Dene" çalıştırmaları sayılmaz. Maddelerde yalnız ad ve sayı vardır; adlar gösterim maskesinden geçer (bilinen gizli değerler).
// Gün sınırı yerel saatle hesaplanır (bugün = yerel gece yarısından beri). Kasa açık olmalıdır.
// NOT: import.meta KULLANILMAZ.
import { DepoHatasi, ekranlariListele, projeGetir } from '../veritabani/depo.mjs';
import { kosulariHesapIcinOku } from '../veritabani/sonuc-deposu.mjs';
import { servisleriListele, servisSenaryolariniListele } from '../servisler/servis-deposu.mjs';
import { icerikTalepleri } from '../senaryolar/talepler.mjs';
import { PanoHatasi, VERI_SABLONLARI, sablonParametreleri } from './pano-duzeni.mjs';
import { gosterimMaskesi } from './gosterim-maskesi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * @typedef {{ ad: string; ayrinti: string; adres: string }} Madde
 * @typedef {{ tur: 'sayi'; deger: number | null; birim: string; alt: string; adres: string | null }
 *   | { tur: 'liste'; maddeler: Madde[]; toplam: number; bos: string }} SablonSonucu
 */

const GUN_MS = 86_400_000;
const EN_COK_MADDE = 50;
const q = encodeURIComponent;

/** Yerel günün başlangıcı (ISO). @param {Date} simdi */
const bugunBaslangici = (simdi) => new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate()).toISOString();
/** @param {number} n */
const sayi = (n) => n.toLocaleString('tr-TR');

/** @param {Veritabani} vt @param {string} projeId @param {Set<string>} kosuIdleri @param {string} [baslangic] */
function ekranSonuclari(vt, projeId, kosuIdleri, baslangic) {
  if (!kosuIdleri.size) return [];
  const idler = [...kosuIdleri];
  /** @type {Array<{ id: string; senaryoId: string | null; baslik: string; ekranId: string | null; urun: string; durum: string }>} */
  const satirlar = [];
  for (let i = 0; i < idler.length; i += 400) {
    const parca = idler.slice(i, i + 400);
    const tarih = baslangic ? ' AND COALESCE(r.bitis, r.baslangic, k.bitis, k.baslangic) >= ?' : '';
    for (const s of vt.tumu(`SELECT r.id, r.senaryo_id, r.senaryo_baslik, r.ekran_id, r.urun_adi, e.ad AS ekran_adi, r.durum FROM kosu_sonuclari r
        JOIN kosular k ON k.id = r.kosu_id LEFT JOIN ekranlar e ON e.id = r.ekran_id
        WHERE k.proje_id = ? AND r.kosu_id IN (${parca.map(() => '?').join(',')})${tarih}`, [projeId, ...parca, ...(baslangic ? [baslangic] : [])])) {
      satirlar.push({
        id: String(s.id), senaryoId: s.senaryo_id == null ? null : String(s.senaryo_id), baslik: String(s.senaryo_baslik),
        ekranId: s.ekran_id == null ? null : String(s.ekran_id), urun: s.ekran_adi != null ? String(s.ekran_adi) : s.urun_adi != null ? String(s.urun_adi) : 'Diğer',
        durum: String(s.durum)
      });
    }
  }
  return satirlar;
}

/** Dönemdeki (Dene hariç) koşu kimlikleri. @param {Veritabani} vt @param {string} projeId @param {number} basMs */
function kosuKimlikleri(vt, projeId, basMs) {
  return new Set(kosulariHesapIcinOku(vt, projeId).filter((k) => !k.denemeKosusu && k.z >= basMs).map((k) => k.id));
}

/** Servis koşu satırları (Dene hariç). @param {Veritabani} vt @param {string} projeId @param {string} baslangic @param {string} [servisId] */
function servisSatirlari(vt, projeId, baslangic, servisId) {
  return vt.tumu(`SELECT s.id, s.servis_id, s.senaryo_id, s.durum, s.baslik, v.ad AS servis_adi FROM servis_kosulari s JOIN servisler v ON v.id = s.servis_id
      WHERE s.proje_id = ? AND s.tur = 'kosu' AND s.baslangic >= ?${servisId ? ' AND s.servis_id = ?' : ''} ORDER BY s.baslangic DESC LIMIT 20000`,
  [projeId, baslangic, ...(servisId ? [servisId] : [])]).map((s) => ({
    id: String(s.id), servisId: String(s.servis_id), senaryoId: s.senaryo_id == null ? null : String(s.senaryo_id), durum: String(s.durum),
    baslik: String(s.baslik), servisAdi: String(s.servis_adi)
  }));
}

/** @param {{ senaryoId: string | null; baslik: string; ekranId: string | null }} r */
const ekranSenaryoAdresi = (r) => (r.senaryoId ? `#/senaryolar/duzenle/${q(r.senaryoId)}` : r.ekranId ? `#/sonuclar/u/${q(r.ekranId)}` : '#/sonuclar/ekranlar');
/** @param {{ servisId: string; senaryoId: string | null }} r */
const servisSenaryoAdresi = (r) => (r.senaryoId ? `#/servisler/s/${q(r.servisId)}/senaryo/${q(r.senaryoId)}` : `#/sonuclar/s/${q(r.servisId)}`);

/**
 * Şablonun sonucu. @param {Veritabani} vt @param {string} projeId @param {string} sablon @param {unknown} hamParametreler
 * @param {{ simdi?: Date }} [s] @returns {SablonSonucu}
 */
export function sablonSonucu(vt, projeId, sablon, hamParametreler, s = {}) {
  if (!projeGetir(vt, projeId)) throw new DepoHatasi('Proje bulunamadı.');
  /** @type {Record<string, string | number>} */
  let p;
  try { p = sablonParametreleri(sablon, hamParametreler); } catch (e) {
    if (e instanceof PanoHatasi) throw new DepoHatasi(e.message);
    throw e;
  }
  const simdi = s.simdi ?? new Date();
  const ad = gosterimMaskesi(vt, projeId).ad;

  if (sablon === 'basariOrani') {
    const [tur, id] = String(p.hedef).split(/:(.+)/);
    const gun = Number(p.gun);
    const basMs = simdi.getTime() - gun * GUN_MS;
    if (tur === 'ekran') {
      const e = ekranlariListele(vt, projeId, { silinenlerDahil: true }).find((x) => x.id === id);
      if (!e) throw new DepoHatasi('Seçilen ekran bulunamadı.');
      const r = ekranSonuclari(vt, projeId, kosuKimlikleri(vt, projeId, basMs)).filter((x) => x.ekranId === id && x.durum !== 'atlanan');
      const gecen = r.filter((x) => x.durum === 'basarili').length;
      return { tur: 'sayi', deger: r.length ? (gecen / r.length) * 100 : null, birim: '%',
        alt: r.length ? `${ad(e.ad)} · son ${gun} gün · ${sayi(r.length)} test · ${sayi(r.length - gecen)} başarısız` : `${ad(e.ad)} · son ${gun} günde koşu yok`,
        adres: `#/sonuclar/u/${q(id)}` };
    }
    const sv = servisleriListele(vt, projeId).find((x) => x.id === id);
    if (!sv) throw new DepoHatasi('Seçilen servis bulunamadı.');
    const r = servisSatirlari(vt, projeId, new Date(basMs).toISOString(), id);
    const gecen = r.filter((x) => x.durum === 'basarili').length;
    return { tur: 'sayi', deger: r.length ? (gecen / r.length) * 100 : null, birim: '%',
      alt: r.length ? `${ad(sv.ad)} · son ${gun} gün · ${sayi(r.length)} çağrı · ${sayi(r.length - gecen)} başarısız` : `${ad(sv.ad)} · son ${gun} günde koşu yok`,
      adres: `#/sonuclar/s/${q(id)}` };
  }

  if (sablon === 'bugunBasarisiz') {
    const bas = bugunBaslangici(simdi);
    /** @type {Map<string, Madde & { n: number }>} */
    const m = new Map();
    for (const r of ekranSonuclari(vt, projeId, kosuKimlikleri(vt, projeId, Date.parse(bas)), bas)) {
      if (r.durum !== 'basarisiz') continue;
      const k = `e:${r.senaryoId ?? `${r.urun}::${r.baslik}`}`;
      const x = m.get(k) ?? { ad: ad(r.baslik), ayrinti: `Ekran · ${ad(r.urun)}`, adres: `#/sonuclar/sonuc/${q(r.id)}`, n: 0 };
      x.n++;
      m.set(k, x);
    }
    for (const r of servisSatirlari(vt, projeId, bas)) {
      if (r.durum === 'basarili') continue;
      const k = `s:${r.senaryoId ?? `${r.servisId}::${r.baslik}`}`;
      const x = m.get(k) ?? { ad: ad(r.baslik), ayrinti: `Servis · ${ad(r.servisAdi)}`, adres: servisSenaryoAdresi(r), n: 0 };
      x.n++;
      m.set(k, x);
    }
    const liste = [...m.values()].map((x) => ({ ad: x.ad, ayrinti: x.n > 1 ? `${x.ayrinti} · ${x.n} kez` : x.ayrinti, adres: x.adres }));
    return { tur: 'liste', maddeler: liste.slice(0, EN_COK_MADDE), toplam: liste.length, bos: 'Bugün başarısız senaryo yok.' };
  }

  if (sablon === 'talepsiz') {
    /** @type {Madde[]} */
    const liste = [];
    if (p.tur !== 'servis') {
      const ekranlar = new Map(ekranlariListele(vt, projeId).map((e) => [e.id, e]));
      for (const sen of vt.tumu('SELECT id, baslik, ekran_id, icerik_json FROM senaryolar WHERE proje_id = ? ORDER BY baslik', [projeId])) {
        const e = sen.ekran_id == null ? undefined : ekranlar.get(String(sen.ekran_id));
        if (!e) continue;
        let icerik = {};
        try { icerik = JSON.parse(String(sen.icerik_json)); } catch { icerik = {}; }
        if (icerikTalepleri(icerik).length) continue;
        liste.push({ ad: ad(String(sen.baslik)), ayrinti: `Ekran · ${ad(e.ad)}`, adres: `#/senaryolar/duzenle/${q(String(sen.id))}` });
      }
    }
    if (p.tur !== 'ekran') {
      for (const sv of servisleriListele(vt, projeId)) {
        for (const sen of servisSenaryolariniListele(vt, sv.id)) {
          if (icerikTalepleri(sen.icerik).length) continue;
          liste.push({ ad: ad(sen.baslik), ayrinti: `Servis · ${ad(sv.ad)}`, adres: `#/servisler/s/${q(sv.id)}/senaryo/${q(sen.id)}` });
        }
      }
    }
    return { tur: 'liste', maddeler: liste.slice(0, EN_COK_MADDE), toplam: liste.length, bos: 'Talep no\'su olmayan senaryo yok.' };
  }

  if (sablon === 'enCokBasarisiz') {
    const gun = Number(p.gun);
    const basMs = simdi.getTime() - gun * GUN_MS;
    /** @type {Map<string, Madde & { n: number }>} */
    const m = new Map();
    for (const r of ekranSonuclari(vt, projeId, kosuKimlikleri(vt, projeId, basMs))) {
      if (r.durum !== 'basarisiz') continue;
      const k = `e:${r.senaryoId ?? `${r.urun}::${r.baslik}`}`;
      const x = m.get(k) ?? { ad: ad(r.baslik), ayrinti: `Ekran · ${ad(r.urun)}`, adres: ekranSenaryoAdresi(r), n: 0 };
      x.n++;
      m.set(k, x);
    }
    for (const r of servisSatirlari(vt, projeId, new Date(basMs).toISOString())) {
      if (r.durum === 'basarili') continue;
      const k = `s:${r.senaryoId ?? `${r.servisId}::${r.baslik}`}`;
      const x = m.get(k) ?? { ad: ad(r.baslik), ayrinti: `Servis · ${ad(r.servisAdi)}`, adres: servisSenaryoAdresi(r), n: 0 };
      x.n++;
      m.set(k, x);
    }
    const sirali = [...m.values()].sort((a, b) => b.n - a.n || a.ad.localeCompare(b.ad, 'tr')).slice(0, Number(p.adet));
    return {
      tur: 'liste', maddeler: sirali.map((x) => ({ ad: x.ad, ayrinti: `${sayi(x.n)} kez başarısız · ${x.ayrinti}`, adres: x.adres })),
      toplam: sirali.length, bos: `Son ${gun} günde başarısız senaryo yok.`
    };
  }
  throw new DepoHatasi('Nöbetçi verisi şablonu geçersiz.');
}

/** Şablon parametre seçenekleri: ekranlar ve servisler (ad maskeli). @param {Veritabani} vt @param {string} projeId */
export function sablonSecenekleri(vt, projeId) {
  const ad = gosterimMaskesi(vt, projeId).ad;
  return {
    sablonlar: VERI_SABLONLARI,
    hedefler: [
      ...ekranlariListele(vt, projeId).map((e) => ({ deger: `ekran:${e.id}`, ad: `Ekran · ${ad(e.ad)}` })),
      ...servisleriListele(vt, projeId).map((s) => ({ deger: `servis:${s.id}`, ad: `Servis · ${ad(s.ad)}` }))
    ]
  };
}
