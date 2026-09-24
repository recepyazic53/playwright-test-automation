// Senaryoların "beklenen sonuç" tanımı ve bu sonucu doğrularken kullanılan ORTAK,
// saf (Playwright'a bağımlı olmayan) yardımcılar.
//
// Şu an yalnızca JetSeyahat (prim-hesaplama.spec.ts) kullanıyor; ama hiçbir fonksiyon
// JetSeyahat'e özel değildir — başka bir ürün de aynı "odemeAdimiDahil + beklenenSonuc"
// alanlarını senaryo verisine ekleyip beklenenSonucuCoz / adimPlaniniOlustur /
// mesajIceriyorMu yardımcılarını doğrudan kullanabilir.
//
// NOT: Bu dosya bilerek hiçbir modül import etmez (yalnızca tip ve saf fonksiyonlar) —
// böylece Playwright olmadan da (ör. küçük bir Node betiğiyle) birim olarak denenebilir.

/** Bir iş kuralı hatasının beklenebileceği adımlar (pipeline sırasıyla). */
export type BeklenenHataAdimi = 'primHesaplama' | 'policelestirme' | 'odeme';

export const BEKLENEN_HATA_ADIMLARI: readonly BeklenenHataAdimi[] = ['primHesaplama', 'policelestirme', 'odeme'];

/**
 * Senaryonun beklenen sonucu:
 *  - basarili: akış hatasız tamamlanır (ödeme dahilse ürünün "kabul edilen ödeme
 *    sonuçlarından" biri görünür, değilse pozitif bir teklif/prim oluşur).
 *  - isKuraliHatasi: belirtilen adımda, belirtilen mesajı İÇEREN bir uyarı beklenir;
 *    uyarı çıkmaz ve akış devam ederse senaryo BAŞARISIZ sayılır.
 */
export type BeklenenSonuc =
  | { tip: 'basarili' }
  | { tip: 'isKuraliHatasi'; adim: BeklenenHataAdimi; mesaj: string };

/**
 * Senaryo verisinde beklenen sonuçla ilgili alanlar (bkz. tests/ekran-modelleri/
 * jet-seyahat.model.json > senaryoDuzeyi).
 */
export type BeklenenSonucAlanlari = {
  // ZORUNLU: her senaryoda açıkça yazılır (varsayılan yok). Dashboard > "Senaryo Oluştur"
  // her zaman yazar; elle eklenen senaryoda eksikse beklenenSonucuCoz hata fırlatır.
  odemeAdimiDahil: boolean;
  // Yoksa { tip: 'basarili' } kabul edilir.
  beklenenSonuc?: BeklenenSonuc;
};

/**
 * Artık desteklenmeyen eski alanlar (beklenenSonuc'tan önceki biçim). Veride kalmadı;
 * elle yeniden eklenirse sessizce yok sayılmasın diye beklenenSonucuCoz reddeder.
 */
export const ESKI_BEKLENEN_SONUC_ALANLARI = ['beklenenHataMesaji', 'beklenenHataAdimi'] as const;

export type CozulmusBeklenenSonuc = {
  odemeAdimiDahil: boolean;
  beklenenSonuc: BeklenenSonuc;
};

const ADIM_ADLARI: Record<BeklenenHataAdimi, string> = {
  primHesaplama: 'Prim hesaplama',
  policelestirme: 'Poliçeleştirme',
  odeme: 'Ödeme'
};

/** Adımın kullanıcıya gösterilen Türkçe adı (ör. "Poliçeleştirme"). */
export function adimAdi(adim: BeklenenHataAdimi): string {
  return ADIM_ADLARI[adim];
}

/**
 * Senaryodaki beklenen sonuç alanlarını TEK bir biçime çevirir ve kurallara uyduğunu
 * doğrular; uymuyorsa açıklayıcı bir Türkçe hata fırlatır.
 * Kurallar (test-sunucu.mjs > beklenenSonucuDogrula / beklenenSonucuFormaCevir ile AYNI
 * tutulmalı):
 *  - odemeAdimiDahil ZORUNLU ve boolean (varsayılan yok).
 *  - Eski beklenenHataMesaji/beklenenHataAdimi alanları kabul edilmez.
 *  - beklenenSonuc yoksa basarili.
 *  - "policelestirme" / "odeme" adımında hata beklemek, ödeme adımının dahil olmasını gerektirir.
 *  - isKuraliHatasi için mesaj zorunludur (boş olamaz).
 */
export function beklenenSonucuCoz(senaryo: BeklenenSonucAlanlari, senaryoAdi = 'Senaryo'): CozulmusBeklenenSonuc {
  const hata = (mesaj: string): Error => new Error(`${senaryoAdi}: ${mesaj}`);

  const eskiAlanlar = ESKI_BEKLENEN_SONUC_ALANLARI.filter((alan) => alan in senaryo);
  if (eskiAlanlar.length) {
    throw hata(
      `Eski ${eskiAlanlar.map((a) => `"${a}"`).join('/')} alanları artık desteklenmiyor; ` +
        '"beklenenSonuc": { "tip": "isKuraliHatasi", "adim": "...", "mesaj": "..." } kullanın.'
    );
  }
  if (typeof senaryo.odemeAdimiDahil !== 'boolean') {
    throw hata(
      '"odemeAdimiDahil" zorunludur ve true ya da false olmalıdır (ödeme adımının senaryoya dahil olup ' +
        'olmadığı; varsayılan yoktur — senaryo verisine açıkça yazın).'
    );
  }
  const odemeAdimiDahil = senaryo.odemeAdimiDahil;
  const beklenenSonuc: BeklenenSonuc = senaryo.beklenenSonuc ?? { tip: 'basarili' };

  if (!beklenenSonuc || typeof beklenenSonuc !== 'object') {
    throw hata('"beklenenSonuc" bir nesne olmalıdır.');
  }
  if (beklenenSonuc.tip === 'basarili') {
    return { odemeAdimiDahil, beklenenSonuc: { tip: 'basarili' } };
  }
  if (beklenenSonuc.tip !== 'isKuraliHatasi') {
    throw hata('"beklenenSonuc.tip" "basarili" ya da "isKuraliHatasi" olmalıdır.');
  }
  if (!BEKLENEN_HATA_ADIMLARI.includes(beklenenSonuc.adim)) {
    throw hata('"beklenenSonuc.adim" "primHesaplama", "policelestirme" ya da "odeme" olmalıdır.');
  }
  if (typeof beklenenSonuc.mesaj !== 'string' || !beklenenSonuc.mesaj.trim()) {
    throw hata('İş kuralı hatası bekleniyorsa beklenen mesaj boş olamaz.');
  }
  if (beklenenSonuc.adim !== 'primHesaplama' && !odemeAdimiDahil) {
    throw hata(
      `"${adimAdi(beklenenSonuc.adim)}" adımında hata beklemek için ödeme adımının dahil olması ` +
        '(odemeAdimiDahil: true) gerekir.'
    );
  }
  return {
    odemeAdimiDahil,
    beklenenSonuc: { tip: 'isKuraliHatasi', adim: beklenenSonuc.adim, mesaj: beklenenSonuc.mesaj.trim() }
  };
}

/**
 * Senaryonun kısa beklenen sonuç etiketi — hem Playwright annotation'ı (type
 * "beklenenSonuc") hem de dashboard'daki "Senaryolar" tablosu rozeti bunu gösterir.
 */
export function beklenenSonucEtiketi(cozulmus: CozulmusBeklenenSonuc): string {
  const { beklenenSonuc, odemeAdimiDahil } = cozulmus;
  if (beklenenSonuc.tip === 'basarili') return odemeAdimiDahil ? 'Ödeme' : 'Teklif';
  return beklenenSonuc.adim === 'primHesaplama' ? 'Hata: Prim' : `Hata: ${adimAdi(beklenenSonuc.adim)}`;
}

/**
 * Sigortalı/ettiren bilgileri girildikten SONRA koşacak adımların planı. Spec bu listeyi
 * sırayla uygular — hangi kombinasyonda hangi adımların koşacağı böylece Playwright'sız
 * test edilebilir.
 */
export type AkisAdimi =
  | { tip: 'primHesaplaVeHataDogrula'; mesaj: string }
  | { tip: 'primHesapla'; sonAdimMi: boolean }
  | { tip: 'odemeAtlandi' }
  | { tip: 'policelestirVeHataDogrula'; mesaj: string }
  | { tip: 'policelestirVeKartGir' }
  | { tip: 'odemeyiTamamlaVeDogrula'; kabulEdilenMesajlar: readonly string[]; isKuraliHatasiMi: boolean };

export function adimPlaniniOlustur(
  cozulmus: CozulmusBeklenenSonuc,
  kabulEdilenOdemeSonuclari: readonly string[]
): AkisAdimi[] {
  const { beklenenSonuc, odemeAdimiDahil } = cozulmus;
  const hataAdimi = beklenenSonuc.tip === 'isKuraliHatasi' ? beklenenSonuc.adim : undefined;

  if (beklenenSonuc.tip === 'isKuraliHatasi' && hataAdimi === 'primHesaplama') {
    return [{ tip: 'primHesaplaVeHataDogrula', mesaj: beklenenSonuc.mesaj }];
  }
  if (!odemeAdimiDahil) {
    // (beklenenSonucuCoz, ödeme dahil değilken yalnızca prim adımında hataya izin verir;
    // buraya yalnızca "basarili" gelir.)
    return [{ tip: 'primHesapla', sonAdimMi: true }, { tip: 'odemeAtlandi' }];
  }

  const plan: AkisAdimi[] = [{ tip: 'primHesapla', sonAdimMi: false }];
  if (beklenenSonuc.tip === 'isKuraliHatasi' && hataAdimi === 'policelestirme') {
    plan.push({ tip: 'policelestirVeHataDogrula', mesaj: beklenenSonuc.mesaj });
    return plan;
  }
  plan.push({ tip: 'policelestirVeKartGir' });
  plan.push(
    beklenenSonuc.tip === 'isKuraliHatasi'
      ? { tip: 'odemeyiTamamlaVeDogrula', kabulEdilenMesajlar: [beklenenSonuc.mesaj], isKuraliHatasiMi: true }
      : { tip: 'odemeyiTamamlaVeDogrula', kabulEdilenMesajlar: kabulEdilenOdemeSonuclari, isKuraliHatasiMi: false }
  );
  return plan;
}

// ---- Toleranslı mesaj eşleştirme ----

/**
 * Mesaj karşılaştırması için metni sadeleştirir: Türkçe'ye uygun küçük harf (İ→i, I→ı),
 * kıvrık/açılı tırnaklar (“ ” ‘ ’ « » „ ‹ › ′ ″) → düz tırnak, tüm boşluklar (satır
 * sonu, NBSP dahil) tek boşluk, baş/son boşluk kırpılır.
 */
export function mesajiNormallestir(metin: string): string {
  return String(metin ?? '')
    .replace(/[“”„«»″]/g, '"')
    .replace(/[‘’‚‹›′`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR');
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
 * Beklenen sonuç doğrulanamadığında fırlatılan hatanın metni. Biçim sabittir — dashboard
 * (urun-hata-raporu.mjs > senaryoOlusturGorulenMesajiCikar) "Görülen:" kısmını bu
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
  secenekler: { zamanAsimiMs: number; aralikMs?: number }
): Promise<{ eslesen?: string; sonGorulen: string }> {
  const bitis = Date.now() + secenekler.zamanAsimiMs;
  const aralik = secenekler.aralikMs ?? 500;
  let sonGorulen = '';
  for (;;) {
    const metin = await metniOku().catch(() => '');
    if (metin.trim()) sonGorulen = metin;
    const eslesen = eslesenMesajiBul(metin, beklenenler);
    if (eslesen) return { eslesen, sonGorulen: metin };
    if (Date.now() >= bitis) return { sonGorulen };
    await new Promise((coz) => setTimeout(coz, aralik));
  }
}
