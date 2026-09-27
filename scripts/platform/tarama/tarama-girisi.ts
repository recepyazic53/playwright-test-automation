// TARAMA / AKIŞ KAYDI GİRİŞİ (genel) — tarama-motoru.ts ve kayit-motoru.ts'nin ortak giriş adımı. Kullanıcının seçimi
// (Ayarlar > Koşu > Tarama ve akış kaydı > "Tarama ve akış kaydında giriş"):
//   Her seferinde baştan giriş yap (varsayılan): boş bağlamda tarife göre giriş; oturum saklanmaz.
//   Koşunun saklanan oturumunu kullan: sunucu girdiye koşunun bu ortam + giriş profili için saklanan oturumunu (ortamın
//     kökenlerine sınırlanmış) koyar; bağlam onunla açılır. Oturum "Girişte oturum kontrolü" süresiyle denetlenir (form
//     doldurulmaz): geçerliyse giriş atlanır; değilse çerezler temizlenip baştan giriş yapılır ve başarılı girişin oturumu
//     sunucuya verilir (sunucu koşunun şifreli dosyasına atomik yazar). Oturum yoksa da baştan giriş + güncelleme.
// Giriş bilgisi yalnız ortamın taban adresinin / tarifteki giriş adresinin kökenine yazılır. Bu adım yalnız "giris" aşamasında
// çalışır; tarama aşamasının yazma isteği engeli bundan etkilenmez.
import type { BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { girisYap, oturumGecerliMi, oturumuKapat } from '../../../tests/support/giris-motoru';
import { girisKokenleri } from '../giris/tarif.mjs';
import { taramaTarayiciAyarlari, type TaramaGirdisi, type TaramaGirisYontemi, type TaramaOlayi } from './protokol.mjs';

/** Başarılı girişin oturumunu sunucuya verir (yalnız saklanan oturum kipinde çağrılır). */
export type OturumGonderici = (durum: Awaited<ReturnType<BrowserContext['storageState']>>) => Promise<void>;

/** Saklanan oturum kipi mi (girdi sunucudan "oturum" alanıyla geldiyse)? */
export const saklananOturumKipi = (g: TaramaGirdisi): boolean => Boolean(g.tarif && g.oturum);

/** Bağlam seçeneği: saklanan oturum varsa storageState (yalnız ortamın kökenleri; sunucu sınırladı). */
export function oturumBaglamSecenegi(g: TaramaGirdisi): Pick<BrowserContextOptions, 'storageState'> {
  const durum = saklananOturumKipi(g) ? g.oturum?.durum : null;
  return durum ? { storageState: durum as BrowserContextOptions['storageState'] } : {};
}

/**
 * Giriş (tarif güdümlü). Tarif yoksa çağrılmaz. Hata GirisHatasi olarak fırlar (çağıran "giris" adımını hata işaretler).
 * @returns girişin nasıl yapıldığı
 */
export async function taramaGirisiYap(islem: Page, g: TaramaGirdisi, bildir: (o: TaramaOlayi) => void, oturumGonder?: OturumGonderici): Promise<TaramaGirisYontemi> {
  if (!g.tarif || !g.kimlik) throw new Error('Giriş tarifi ve giriş profili gerekli.');
  const ayar = taramaTarayiciAyarlari(g);
  const saklanan = saklananOturumKipi(g);
  if (saklanan && g.oturum?.durum) {
    // Ayarlar > Koşu > Tarama ve akış kaydı > Girişte oturum kontrolü (yalnız bu kipte kullanılır).
    if (await oturumGecerliMi(islem, g.tarif, ayar.oturumKontrolMs)) {
      bildir({ tur: 'bilgi', mesaj: 'Koşunun saklanan oturumu geçerli; giriş atlandı.' });
      return 'saklananOturum';
    }
    bildir({ tur: 'bilgi', mesaj: 'Saklanan oturum geçersiz; baştan giriş yapılıyor.' });
    await oturumuKapat(islem);
  } else if (saklanan) {
    bildir({ tur: 'bilgi', mesaj: 'Saklanan oturum yok; baştan giriş yapılıyor.' });
  }
  await girisYap(islem, g.tarif, g.kimlik, {
    log: (mesaj) => bildir({ tur: 'bilgi', mesaj }), izinliKokenler: girisKokenleri(g.tabanUrl, g.tarif),
    // Ayarlar > Koşu > Tarama ve akış kaydı > Girişte giriş alanı beklemesi.
    alanBeklemeMs: ayar.girisAlanBeklemeMs
  });
  // Başarılı girişin oturumu koşunun şifreli dosyasına (sunucu yazar); gönderilemezse iş sürer (yalnız bilgi).
  if (saklanan && oturumGonder) {
    try {
      await oturumGonder(await islem.context().storageState());
    } catch {
      bildir({ tur: 'bilgi', mesaj: 'Oturum saklanamadı; iş sürüyor.' });
    }
  }
  return 'bastanGiris';
}

/** "giris" adımının tamam mesajı (iş durumunda görünür). */
export function girisYontemiMesaji(y: TaramaGirisYontemi): string {
  return y === 'saklananOturum' ? 'Saklanan oturum kullanıldı (giriş atlandı).' : 'Baştan giriş yapıldı.';
}
