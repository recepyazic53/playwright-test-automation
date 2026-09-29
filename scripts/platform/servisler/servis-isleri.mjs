// SERVİS TESTLERİ — arka planda koşu işleri (canlı panel için). Arayüz işi başlatır, durumunu kısa aralıkla sorar, isterse
// durdurur. Senaryolar sırayla koşar (Ayarlar > Koşu > Servisler > "Aynı anda en çok N servis senaryosu" > 1 ise en çok N'i aynı
// anda; bir senaryonun kendi adımları yine sırayla — eszamanli.mjs); her senaryonun adımları (hazırlık → gönderim → yanıt → kontroller), maskeli istek /
// yanıt ve sonucu işin durumunda tutulur. Sonuçlar her zamanki gibi servis koşuları tablosuna da yazılır (Raporlar).
// İşler bellektedir (Nöbetçi yeniden başlarsa kaybolur); biten iş 30 dakika sonra silinir.
import { randomUUID } from 'node:crypto';
import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import { servisGetir, servisSenaryosuGetir } from './servis-deposu.mjs';
import { akisSenaryoKancasiAl, ortamTuru, ortamdaTanimli, servisCalistirmalari, servisSenaryosuCalistir, tanimsizNedeni } from './servis-islemleri.mjs';
import { servisTekrarPlani } from '../senaryolar/veri-kosusu-plani.mjs';
import { etkinKosuHiziOku, sinirliKos } from './eszamanli.mjs';
import { kosuHiziOzeti } from '../ayarlar/kosu-hizi.mjs';

/** @typedef {import('../veritabani/baglanti.mjs').Veritabani} Veritabani */
/**
 * @typedef {{ adim: string; durum: 'basladi' | 'tamam' | 'hata'; zaman: number; bilgi?: Record<string, unknown> }} IsOlayi
 * @typedef {{ senaryoId: string; baslik: string; durum: 'sirada' | 'calisiyor' | 'basarili' | 'basarisiz' | 'hata' | 'durduruldu' | 'atlandi';
 *   olaylar: IsOlayi[]; istek: string | null; yanit: string | null; baslangic: number | null; bitis: number | null; sonuc: Record<string, unknown> | null; neden?: string;
 *   veriKosusu?: { anahtar: string | null; ad: string | null; sabit?: Record<string, string>; veriler?: Record<string, Record<string, string | null>> } | null }} IsSatiri
 * @typedef {{ id: string; projeId: string; servisId: string; servisAd: string; ortam: string; ortamTuru: string; baslangic: number; bitis: number | null;
 *   bitti: boolean; durdur: boolean; satirlar: IsSatiri[]; eszamanli: number; istekBeklemeMs: number; kosuHizi: string }} ServisIsi
 */

const SAKLAMA_MS = 30 * 60_000;
/** @type {Map<string, ServisIsi & { aktifler: Map<IsSatiri, { senaryoId: string; kontrol: AbortController }> }>} */
const isler = new Map();

function temizle() {
  for (const [id, is] of isler) if (is.bitti && is.bitis && Date.now() - is.bitis > SAKLAMA_MS) isler.delete(id);
}

/**
 * Senaryo bu ortamda neden koşmaz ('' = koşar): servis ortamda tanımlı değil (taban adres boş), kapsam ortam türüne uymuyor,
 * CANLI'da çağrılmayan metot; akış senaryosunda akışın adımlarından (akis-senaryosu.mjs). Servis sayfasındaki Kapsam sütunu,
 * ortam başına "Koşuda" / "Son sonuç" ve koşu diyaloğundaki atlama nedenleri de bu kuralı kullanır.
 * @param {Veritabani} vt @param {import('./servis-deposu.mjs').Servis} servis @param {any} s senaryo @param {any} ortam
 */
export function servisSenaryoAtlamaNedeni(vt, servis, s, ortam) {
  const tur = ortamTuru(ortam);
  if (s.icerik?.tur === 'akis') {
    const kanca = akisSenaryoKancasiAl();
    return kanca ? kanca.atlamaNedeni(vt, s, ortam) : 'Akış senaryoları bu sunucuda koşamaz.';
  }
  if (!ortamdaTanimli(servis.ayarlar, ortam.id)) return tanimsizNedeni(servis.ayarlar, ortam.ad);
  if (s.kapsam !== 'ikisi' && s.kapsam !== tur) return `Senaryo yalnız ${s.kapsam === 'test' ? 'TEST' : 'CANLI'} ortamda koşar.`;
  if (tur === 'canli' && (servis.ayarlar.yalnizTestOperasyonlari ?? []).includes(s.icerik?.operasyon)) return `"${s.icerik.operasyon}" CANLI'da çağrılmaz.`;
  return '';
}

/**
 * İşi başlatır (hemen döner; koşu arka planda sürer). Senaryolar sırayla (ayar N > 1 ise en çok N'i aynı anda; veri koşusu
 * satırları da ayrı çalıştırma olarak aynı sınırla); kapsamı ortama uymayan / servisin bu ortamda
 * tanımlı olmadığı / CANLI'da çağrılmayan metodu kullanan senaryo "atlandi" olur (nedeniyle).
 * Taslak verilirse (düzenleyicideki "Dene"): kaydedilmemiş tek senaryo "dene" olarak koşar (CANLI ortamda onay HTTP ucunda).
 * VERİ KOŞULARI: tablodan çoklu satırla koşan senaryonun her satırı / kombinasyonu ayrı satır ("Senaryo [ad]"); tek senaryodaki üst
 * sınır (Ayarlar > Koşu) aşılırsa iş başlatılmaz; bu ortamda koşulacak satır yoksa senaryo nedeniyle atlanır.
 * TEKRAR: tekrar = { kaynakKosuId: "s-…", veri?: 'guncel' | 'kosudaki' } — yalnız o koşuda başarısız çalıştırmalar, o koşudaki satırlarla
 * (senaryoIdleri yok sayılır); kayıtlar "Tekrar:" bağı taşır. Servis ve ortam o koşununkiyle aynı olmalı.
 * @param {Veritabani} vt @param {string} projeId
 * UYGULAMA SÜRÜMÜ: uygulamaSurumu (koşu başlatılırken girilen; isteğe bağlı) her koşu kaydına etiket olarak yazılır; boşsa ortam
 * ayarındaki sürüm kullanılır (servis-islemleri.mjs; PDF rapor A4).
 * @param {{ servisId: string; ortamId: string; senaryoIdleri?: string[]; taslak?: { baslik: string; icerik: unknown }; tekrar?: { kaynakKosuId: string; veri?: string };
 *   uygulamaSurumu?: string | null }} girdi
 */
export function servisIsiBaslat(vt, projeId, girdi) {
  temizle();
  const servis = servisGetir(vt, girdi.servisId);
  if (!servis || servis.projeId !== projeId) throw new DepoHatasi('Servis bulunamadı.');
  const ortam = ortamGetir(vt, girdi.ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
  const taslak = girdi.taslak ?? null;
  const tekrar = !taslak && girdi.tekrar ? girdi.tekrar : null;
  if (!taslak && !tekrar && (!Array.isArray(girdi.senaryoIdleri) || !girdi.senaryoIdleri.length)) throw new DepoHatasi('En az bir senaryo seçin.');
  const tur = ortamTuru(ortam);
  const tanimli = ortamdaTanimli(servis.ayarlar, ortam.id);
  /** @param {{ senaryoId: string; baslik: string; veriKosusu?: IsSatiri['veriKosusu'] }} x @returns {IsSatiri} */
  const sirada = (x) => ({ senaryoId: x.senaryoId, baslik: x.baslik, durum: 'sirada', olaylar: [], istek: null, yanit: null, baslangic: null, bitis: null, sonuc: null,
    ...(x.veriKosusu ? { veriKosusu: x.veriKosusu } : {}) });
  /** @type {IsSatiri[] | null} */
  let tekrarSatirlari = null;
  if (tekrar) {
    const plan = servisTekrarPlani(vt, projeId, String(tekrar.kaynakKosuId), { veri: tekrar.veri });
    if (plan.kosu.servisId !== servis.id || plan.kosu.ortamId !== ortam.id) throw new DepoHatasi('Başarısızlar yalnız o koşunun servisi ve ortamında tekrar çalıştırılabilir.');
    if (!plan.testler.length) throw new DepoHatasi('Bu koşuda tekrar çalıştırılacak başarısız senaryo yok.');
    tekrarSatirlari = plan.testler.map((t) => sirada({ senaryoId: t.senaryoId, baslik: t.baslik, veriKosusu: t.veriKosusu }));
  }
  const satirlar = tekrarSatirlari ?? (taslak ? [/** @type {IsSatiri} */ ({
    senaryoId: 'taslak', baslik: taslak.baslik || 'Taslak', durum: tanimli ? 'sirada' : 'atlandi', olaylar: [], istek: null, yanit: null,
    baslangic: null, bitis: null, sonuc: null, ...(tanimli ? {} : { neden: tanimsizNedeni(servis.ayarlar, ortam.ad) })
  })] : (girdi.senaryoIdleri ?? []).map((id) => {
    const s = servisSenaryosuGetir(vt, id);
    // Akış senaryosu: akışı bu servisten geçiyorsa (başka serviste kayıtlı olsa da) koşar; atlama nedeni akışın adımlarından.
    const kanca = akisSenaryoKancasiAl();
    const akis = s && /** @type {any} */ (s.icerik).tur === 'akis' && kanca && (s.servisId === servis.id || kanca.gecenler(vt, projeId, servis.id).some((x) => x.id === s.id));
    if (!s || (s.servisId !== servis.id && !akis)) throw new DepoHatasi('Senaryo bulunamadı.');
    const neden = servisSenaryoAtlamaNedeni(vt, servis, s, ortam);
    const atla = (/** @type {string} */ n) => [/** @type {IsSatiri} */ ({
      senaryoId: s.id, baslik: s.baslik, durum: 'atlandi', olaylar: [], istek: null, yanit: null, baslangic: null, bitis: null, sonuc: null, neden: n
    })];
    if (neden) return atla(neden);
    if (akis) return [sirada({ senaryoId: s.id, baslik: s.baslik })];
    // Veri koşuları (tablodan çoklu satır): her satır / kombinasyon ayrı çalıştırma; çoklu değilse tek (bugünkü).
    const c = servisCalistirmalari(vt, projeId, s, ortam.id);
    if (c.sinirAsildi) throw new DepoHatasi(/** @type {string} */ (c.hata));
    if (c.hata) return atla(c.hata);
    return c.calistirmalar.map((k) => sirada({ senaryoId: s.id, baslik: k.baslik, veriKosusu: k.veriKosusu }));
  }).flat());
  // Ayarlar > Koşu > Servisler (ortamın "Koşu hızı" ezmesiyle): eşzamanlılık ve istekler arası bekleme.
  const hiz = etkinKosuHiziOku(vt, ortam.id);
  const is = {
    id: randomUUID(), projeId, servisId: servis.id, servisAd: servis.ad, ortam: ortam.ad, ortamTuru: tur,
    baslangic: Date.now(), bitis: /** @type {number | null} */ (null), bitti: false, durdur: false, satirlar,
    // Ayarlar > Koşu > Servisler > "Aynı anda en çok N servis senaryosu" (1 = sırayla; iş başlarken okunur).
    eszamanli: taslak ? 1 : hiz.degerler.servisEszamanli,
    // Servise giden her istekten sonra beklenen süre (ms; servis-islemleri.mjs uygular) ve etkin değerlerin özeti (panel).
    istekBeklemeMs: hiz.degerler.servisIstekBeklemeMs,
    kosuHizi: kosuHiziOzeti(hiz, 'servis'),
    /** Çalışan satırlar ve durdurma denetleyicileri. @type {Map<IsSatiri, { senaryoId: string; kontrol: AbortController }>} */
    aktifler: new Map()
  };
  isler.set(is.id, is);
  void (async () => {
    await sinirliKos(is.satirlar, is.eszamanli, async (satir) => {
      if (satir.durum !== 'sirada') return;
      if (is.durdur) { satir.durum = 'durduruldu'; return; }
      satir.durum = 'calisiyor';
      satir.baslangic = Date.now();
      const kontrol = new AbortController();
      is.aktifler.set(satir, { senaryoId: satir.senaryoId, kontrol });
      try {
        const r = await servisSenaryosuCalistir(vt, projeId, {
          servisId: servis.id, ortamId: ortam.id, sinyal: kontrol.signal,
          ...(taslak ? { tur: 'dene', taslak: { baslik: taslak.baslik || 'Taslak', icerik: taslak.icerik } } : { tur: 'kosu', senaryoId: satir.senaryoId }),
          ...(satir.veriKosusu ? { veriKosusu: satir.veriKosusu } : {}), ...(tekrar ? { tekrarKaynagi: String(tekrar.kaynakKosuId) } : {}),
          ...(typeof girdi.uygulamaSurumu === 'string' ? { uygulamaSurumu: girdi.uygulamaSurumu } : {}),
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
      is.aktifler.delete(satir);
    }).finally(() => {
      is.bitti = true;
      is.bitis = Date.now();
    });
  })();
  return servisIsiDurumu(projeId, is.id);
}

/** İşin arayüze giden kopyası (durdurma denetleyicisi hariç). @param {string} projeId @param {string} id */
export function servisIsiDurumu(projeId, id) {
  const is = isler.get(id);
  if (!is || is.projeId !== projeId) throw new DepoHatasi('Koşu bulunamadı (Nöbetçi yeniden başlatıldıysa bilgisi kaybolmuştur; sonuçlar Raporlar\'da).');
  const { aktifler, ...gorunum } = is;
  const calisanlar = [...aktifler.values()].map((a) => a.senaryoId);
  // calisanSenaryo: ilk çalışan (panel seçimi); calisanlar: aynı anda çalışanların tümü; eszamanli: en çok kaç tane (ayar).
  return { ...gorunum, satirlar: is.satirlar.map((s) => ({ ...s, olaylar: [...s.olaylar] })), calisanSenaryo: calisanlar[0] ?? null, calisanlar };
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
  // Eşzamanlı koşuda çalışan her senaryonun kendi denetleyicisi var: tüm iş durdurulursa hepsi, senaryo verilirse yalnız onunkiler kesilir.
  for (const a of is.aktifler.values()) if (!senaryoId || a.senaryoId === senaryoId) a.kontrol.abort();
  return { durduruldu: true };
}

/**
 * Servis senaryosu şu an bir işte koşuyor ya da sırada mı (bellekteki işler; ör. tablo değişikliğinde senaryo güncellemesi atlanır).
 * @param {string} senaryoId
 */
export function servisSenaryosuKosuyorMu(senaryoId) {
  for (const is of isler.values()) {
    if (is.bitti) continue;
    if (is.satirlar.some((s) => s.senaryoId === senaryoId && (s.durum === 'sirada' || s.durum === 'calisiyor'))) return true;
  }
  return false;
}
