// Model koşucusunun beklenen sonucu doğrularken kullandığı ORTAK, saf (Playwright'a bağımlı olmayan) yardımcılar:
// toleranslı mesaj eşleştirme, "Beklenen / Görülen" hata metni ve beklenen mesajı bekleme. Beklenen sonuç KURALLARI
// modeldedir (bkz. scripts/platform/senaryolar/model-kosusu.mjs); burada ürün bilgisi yoktur.

import { metniNormallestir } from '../../scripts/platform/dosyalar/dosya-icerigi.mjs';

// ---- Toleranslı mesaj eşleştirme ----

/**
 * Mesaj karşılaştırması için metni sadeleştirir: Türkçe'ye uygun küçük harf (İ→i, I→ı), ardından ı→i
 * (büyük harfli Latin sözcükler: ekrandaki "KDV" ile yazılan "kdv" eşleşir), kıvrık/açılı tırnaklar (“ ” ‘ ’ « » „ ‹ › ′ ″) → düz tırnak, tüm boşluklar (satır
 * sonu, NBSP dahil) tek boşluk, baş/son boşluk kırpılır. Kural tek yerdedir (indirilen dosyanın doğrulaması da kullanır):
 * scripts/platform/dosyalar/dosya-icerigi.mjs > metniNormallestir.
 */
export function mesajiNormallestir(metin: string): string {
  return metniNormallestir(metin);
}

/** Görülen metin, beklenen mesajı (iki taraf da normalleştirilerek) İÇERİYOR mu? */
export function mesajIceriyorMu(gorulen: string, beklenen: string): boolean {
  const beklenenNormal = mesajiNormallestir(beklenen);
  if (!beklenenNormal) return false;
  return mesajiNormallestir(gorulen).includes(beklenenNormal);
}

/** Görülen metin, beklenen mesajlardan herhangi birini içeriyorsa o mesajı döner. */
export function eslesenMesajiBul(gorulen: string, beklenenler: readonly string[]): string | undefined {
  return beklenenler.find((beklenen) => mesajIceriyorMu(gorulen, beklenen));
}

// ---- "Beklenen / Görülen" hata metni ----

/** Beklenen bir uyarı hiç çıkmadığında "Görülen" kısmına yazılan sabit metin. */
export const UYARI_CIKMADI_METNI = 'uyarı çıkmadı, akış devam etti';

/**
 * Beklenen sonuç doğrulanamadığında fırlatılan hatanın metni. Biçim sabittir — Nöbetçi
 * (scripts/platform/senaryolar/model-formu.mjs > beklenen hata önerisi) "Görülen:" kısmını bu
 * biçimden ayrıştırır; değiştirilirse orası da güncellenmelidir:
 *   <adım> adımında beklenen sonuç doğrulanamadı.
 *   Beklenen: "<...>" — Görülen: "<...>"
 */
export function beklenenGorulenMetni(
  adimAciklamasi: string,
  beklenen: string | readonly string[],
  gorulen: string
): string {
  const beklenenler = typeof beklenen === 'string' ? [beklenen] : beklenen;
  const beklenenMetni = beklenenler.map((m) => `"${m}"`).join(' veya ');
  const gorulenMetni = gorulen.replace(/\s+/g, ' ').trim() || UYARI_CIKMADI_METNI;
  return `${adimAciklamasi} adımında beklenen sonuç doğrulanamadı.\nBeklenen: ${beklenenMetni} — Görülen: "${gorulenMetni}"`;
}

/**
 * metniOku'yu belirli aralıklarla çağırır; okunan metin beklenen mesajlardan birini
 * içerince (toleranslı eşleşme) durur. Süre dolarsa eslesen undefined döner; her
 * durumda en son okunan (boş olmayan) metin sonGorulen'de verilir. Okuma sırasında
 * oluşan hatalar (ör. eleman o an DOM'da yok) boş metin sayılır.
 */
export async function beklenenMesajiBekle(
  metniOku: () => Promise<string>,
  beklenenler: readonly string[],
  secenekler: { zamanAsimiMs: number; aralikMs?: number; durdur?: () => Promise<string | null> }
): Promise<{ eslesen?: string; sonGorulen: string }> {
  const bitis = Date.now() + secenekler.zamanAsimiMs;
  const aralik = secenekler.aralikMs ?? 500;
  let sonGorulen = '';
  for (;;) {
    const metin = await metniOku().catch(() => '');
    if (metin.trim()) sonGorulen = metin;
    const eslesen = eslesenMesajiBul(metin, beklenenler);
    if (eslesen) return { eslesen, sonGorulen: metin };
    // durdur: beklenen mesaj gelmeden başka bir hata görünürse (ör. proje hata penceresi) süre dolmadan bitirilir; görülen metin döner.
    const durdu = secenekler.durdur ? await secenekler.durdur().catch(() => null) : null;
    if (durdu !== null) return { sonGorulen: durdu };
    if (Date.now() >= bitis) return { sonGorulen };
    await new Promise((coz) => setTimeout(coz, aralik));
  }
}
