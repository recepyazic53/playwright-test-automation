// SERVİS TESTLERİ — arka planda koşu işleri (canlı panel için). Arayüz işi başlatır, durumunu kısa aralıkla sorar, isterse
// durdurur. Senaryolar sırayla koşar; her senaryonun adımları (hazırlık → gönderim → yanıt → kontroller), maskeli istek /
// yanıt ve sonucu işin durumunda tutulur. Sonuçlar her zamanki gibi servis koşuları tablosuna da yazılır (Raporlar).
// İşler bellektedir (Nöbetçi yeniden başlarsa kaybolur); biten iş 30 dakika sonra silinir.
import { randomUUID } from 'node:crypto';
import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import { servisGetir, servisSenaryosuGetir } from './servis-deposu.mjs';
import { akisSenaryoKancasiAl, ortamTuru, ortamdaTanimli, servisSenaryosuCalistir } from './servis-islemleri.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * @typedef {{ adim: string; durum: 'basladi' | 'tamam' | 'hata'; zaman: number; bilgi?: Record<string, unknown> }} IsOlayi
 * @typedef {{ senaryoId: string; baslik: string; durum: 'sirada' | 'calisiyor' | 'basarili' | 'basarisiz' | 'hata' | 'durduruldu' | 'atlandi';
 *   olaylar: IsOlayi[]; istek: string | null; yanit: string | null; baslangic: number | null; bitis: number | null; sonuc: Record<string, unknown> | null; neden?: string }} IsSatiri
 * @typedef {{ id: string; projeId: string; servisId: string; servisAd: string; ortam: string; ortamTuru: string; baslangic: number; bitis: number | null;
 *   bitti: boolean; durdur: boolean; satirlar: IsSatiri[] }} ServisIsi
 */

const SAKLAMA_MS = 30 * 60_000;
/** @type {Map<string, ServisIsi & { aktif: { senaryoId: string; kontrol: AbortController } | null }>} */
const isler = new Map();

function temizle() {
  for (const [id, is] of isler) if (is.bitti && is.bitis && Date.now() - is.bitis > SAKLAMA_MS) isler.delete(id);
}

/**
 * İşi başlatır (hemen döner; koşu arka planda sürer). Senaryolar sırayla; kapsamı ortama uymayan / servisin bu ortamda
 * tanımlı olmadığı / CANLI'da çağrılmayan metodu kullanan senaryo "atlandi" olur (nedeniyle).
 * Taslak verilirse (düzenleyicideki "Dene"): kaydedilmemiş tek senaryo, yalnız TEST ortamında, "dene" olarak koşar.
 * @param {Veritabani} vt @param {string} projeId
 * @param {{ servisId: string; ortamId: string; senaryoIdleri?: string[]; taslak?: { baslik: string; icerik: unknown } }} girdi
 */
export function servisIsiBaslat(vt, projeId, girdi) {
  temizle();
  const servis = servisGetir(vt, girdi.servisId);
  if (!servis || servis.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  const ortam = ortamGetir(vt, girdi.ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  const taslak = girdi.taslak ?? null;
  if (!taslak && (!Array.isArray(girdi.senaryoIdleri) || !girdi.senaryoIdleri.length)) throw new DepoHatasi('En az bir senaryo seçin.');
  const tur = ortamTuru(ortam);
  if (taslak && tur !== 'test') throw new DepoHatasi('Deneme yalnızca test ortamında yapılır.');
  const yalnizTest = new Set(servis.ayarlar.yalnizTestOperasyonlari ?? []);
  const tanimli = ortamdaTanimli(servis.ayarlar, ortam.id);
  const satirlar = taslak ? [/** @type {IsSatiri} */ ({
    senaryoId: 'taslak', baslik: taslak.baslik || 'Taslak', durum: tanimli ? 'sirada' : 'atlandi', olaylar: [], istek: null, yanit: null,
    baslangic: null, bitis: null, sonuc: null, ...(tanimli ? {} : { neden: `Servis "${ortam.ad}" ortamında tanımlı değil.` })
  })] : (girdi.senaryoIdleri ?? []).map((id) => {
    const s = servisSenaryosuGetir(vt, id);
    // Akış senaryosu: akışı bu servisten geçiyorsa (başka serviste kayıtlı olsa da) koşar; atlama nedeni akışın adımlarından.
    const kanca = akisSenaryoKancasiAl();
    const akis = s && /** @type {any} */ (s.icerik).tur === 'akis' && kanca && (s.servisId === servis.id || kanca.gecenler(vt, projeId, servis.id).some((x) => x.id === s.id));
    if (!s || (s.servisId !== servis.id && !akis)) throw new DepoHatasi('Senaryo bulunamadı.');
    const neden = akis ? (kanca?.atlamaNedeni(vt, s, ortam) ?? '') : !tanimli ? `Servis "${ortam.ad}" ortamında tanımlı değil.`
      : s.kapsam !== 'ikisi' && s.kapsam !== tur ? `Senaryo yalnız ${s.kapsam === 'test' ? 'TEST' : 'CANLI'} ortamda koşar.`
        : tur === 'canli' && yalnizTest.has(s.icerik.operasyon) ? `"${s.icerik.operasyon}" CANLI'da çağrılmaz.` : '';
    return /** @type {IsSatiri} */ ({
      senaryoId: s.id, baslik: s.baslik, durum: neden ? 'atlandi' : 'sirada', olaylar: [], istek: null, yanit: null,
      baslangic: null, bitis: null, sonuc: null, ...(neden ? { neden } : {})
    });
  });
  const is = {
    id: randomUUID(), projeId, servisId: servis.id, servisAd: servis.ad, ortam: ortam.ad, ortamTuru: tur,
    baslangic: Date.now(), bitis: /** @type {number | null} */ (null), bitti: false, durdur: false, satirlar,
    aktif: /** @type {{ senaryoId: string; kontrol: AbortController } | null} */ (null)
  };
  isler.set(is.id, is);
  void (async () => {
    for (const satir of is.satirlar) {
      if (satir.durum !== 'sirada') continue;
      if (is.durdur) { satir.durum = 'durduruldu'; continue; }
      satir.durum = 'calisiyor';
      satir.baslangic = Date.now();
      const kontrol = new AbortController();
      is.aktif = { senaryoId: satir.senaryoId, kontrol };
      try {
        const r = await servisSenaryosuCalistir(vt, projeId, {
          servisId: servis.id, ortamId: ortam.id, sinyal: kontrol.signal,
          ...(taslak ? { tur: 'dene', taslak: { baslik: taslak.baslik || 'Taslak', icerik: taslak.icerik } } : { tur: 'kosu', senaryoId: satir.senaryoId }),
          olay: (adim, durum, bilgi) => {
            const kisa = bilgi ? Object.fromEntries(Object.entries(bilgi).filter(([a]) => a !== 'istek' && a !== 'yanit')) : null;
            satir.olaylar.push({ adim, durum, zaman: Date.now(), ...(kisa && Object.keys(kisa).length ? { bilgi: kisa } : {}) });
            if (bilgi && typeof bilgi.istek === 'string') satir.istek = bilgi.istek;
            if (bilgi && typeof bilgi.yanit === 'string') satir.yanit = bilgi.yanit;
          }
        });
        satir.durum = r.durduruldu ? 'durduruldu' : r.durum;
        satir.sonuc = { kosuId: r.kosuId, sureMs: r.sureMs, durumKodu: r.durumKodu ?? null, kontroller: r.kontroller ?? [], ozet: r.ozet ?? '', hata: r.hata ?? null };
      } catch (e) {
        satir.durum = 'hata';
        satir.sonuc = { hata: /** @type {Error} */ (e).message };
        satir.olaylar.push({ adim: 'hazirlik', durum: 'hata', zaman: Date.now(), bilgi: { mesaj: /** @type {Error} */ (e).message } });
      }
      satir.bitis = Date.now();
      is.aktif = null;
    }
    is.bitti = true;
    is.bitis = Date.now();
  })();
  return servisIsiDurumu(projeId, is.id);
}

/** İşin arayüze giden kopyası (durdurma denetleyicisi hariç). @param {string} projeId @param {string} id */
export function servisIsiDurumu(projeId, id) {
  const is = isler.get(id);
  if (!is || is.projeId !== projeId) throw new DepoHatasi('Koşu bulunamadı (Nöbetçi yeniden başlatıldıysa bilgisi kaybolmuştur; sonuçlar Raporlar\'da).');
  const { aktif, ...gorunum } = is;
  return { ...gorunum, satirlar: is.satirlar.map((s) => ({ ...s, olaylar: [...s.olaylar] })), calisanSenaryo: aktif ? aktif.senaryoId : null };
}

/**
 * Durdurur: senaryoId verilirse yalnız o (çalışıyorsa bekleyen istek kesilir, sıradaysa atlanır); yoksa tüm iş.
 * @param {string} projeId @param {string} id @param {string} [senaryoId]
 */
export function servisIsiDurdur(projeId, id, senaryoId) {
  const is = isler.get(id);
  if (!is || is.projeId !== projeId) throw new DepoHatasi('Koşu bulunamadı.');
  if (!senaryoId) is.durdur = true;
  for (const s of is.satirlar) if (s.durum === 'sirada' && (!senaryoId || s.senaryoId === senaryoId)) s.durum = 'durduruldu';
  if (is.aktif && (!senaryoId || is.aktif.senaryoId === senaryoId)) is.aktif.kontrol.abort();
  return { durduruldu: true };
}
