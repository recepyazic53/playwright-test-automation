// SENARYO TASARIM YARDIMCISI — sunucu tarafı bağlam (GET /platform/senaryo/oneri-baglami). Önerileri tarayıcıdaki saf fonksiyon
// üretir (senaryo-onerileri.mjs); burada yalnızca okuma var: formun bağlamı (model, alt modeller, tablo bağlantıları) + aynı ekranın
// seçili ortamda tanımlı ve aynı akıştaki senaryoları (veri, satır seçimleri, son sonucun durumu). Hiçbir şey yazılmaz.
import { formBaglami, senaryoDetayi, senaryoSonSonucu } from './senaryo-servisi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */

/**
 * @param {Veritabani} vt @param {string} projeId @param {string} ekranId @param {string} ortamId @param {string | null} [akisId]
 */
export function oneriBaglami(vt, projeId, ekranId, ortamId, akisId = null) {
  const form = formBaglami(vt, projeId, ekranId, ortamId, akisId);
  if (!form.model) return { ...form, senaryolar: [] };
  const akislar = form.akislar || [];
  const varsayilan = akislar[0] ? akislar[0].id : null;
  /** @type {Array<{ id: string; baslik: string; veri: Record<string, unknown>; tabloSecimleri: unknown; sonDurum: string | null }>} */
  const senaryolar = [];
  for (const r of vt.tumu('SELECT id FROM senaryolar WHERE proje_id = ? AND ekran_id = ? ORDER BY rowid', [projeId, ekranId])) {
    const d = senaryoDetayi(vt, String(r.id), ortamId);
    if (!d.ortamlar.includes(ortamId) || !d.veri) continue;
    const akis = d.akis && akislar.some((a) => a.id === d.akis) ? d.akis : varsayilan;
    if (akis !== form.akisId) continue;
    const son = senaryoSonSonucu(vt, d.id, ortamId);
    senaryolar.push({ id: d.id, baslik: d.baslik, veri: d.veri, tabloSecimleri: d.tabloSecimleri, sonDurum: son ? son.durum : null });
  }
  return { ...form, senaryolar };
}
