// JetSeyahat senaryosunun spec tarafındaki doğrulaması: TEK doğrulayıcıyı
// (scripts/dogrulama/senaryo-dogrulayici.mjs — platform sunucusu ve Senaryolar formu da aynısını
// kullanır) ekran modeli + ortak veri bağlamıyla çağırır. Kurallar ve Türkçe mesajlar
// yalnızca o dosyadadır; burada kopya kural YOKTUR.
//
// NOT: Playwright'a bağımlı değildir (birim testlerde de kullanılır).
import {
  hatalariMetneCevir,
  ortakBaglaminiOlustur,
  senaryoyuDogrula,
  type DogrulamaSonucu
} from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { jetSeyahatModeliniYukle, type YuklenmisEkranModeli } from './ekran-modeli';
import type { OrtakTestData } from './test-data';

/**
 * Kayıttaki (veritabanındaki jet-seyahat verisi) bir JetSeyahat senaryosunu doğrular; hiçbir şey
 * fırlatmaz. yuklenmis: ekran modeli (varsayılan: platform veritabanındaki JetSeyahat modeli).
 */
export function jetSeyahatSenaryosunuDogrula(
  senaryo: unknown,
  ortakData: OrtakTestData,
  ortam: string,
  simdi: Date = new Date(),
  yuklenmis: YuklenmisEkranModeli = jetSeyahatModeliniYukle()
): DogrulamaSonucu {
  const { model, altModeller } = yuklenmis;
  return senaryoyuDogrula(senaryo, {
    model,
    altModeller,
    ortak: ortakBaglaminiOlustur(ortakData),
    ortam,
    simdi,
    kaynak: 'kayit'
  });
}

/**
 * jetSeyahatSenaryosunuDogrula + hata varsa açıklayıcı Türkçe Error fırlatır (spec, geçersiz
 * senaryoda yalnızca O testi düşürür). Uyarılar (ör. ortak kartın süresi geçmiş) fırlatılmaz;
 * çağırana döner.
 */
export function jetSeyahatSenaryosunuDogrulaVeyaFirlat(
  senaryo: unknown,
  ortakData: OrtakTestData,
  ortam: string,
  senaryoAdi: string,
  simdi: Date = new Date()
): DogrulamaSonucu {
  const sonuc = jetSeyahatSenaryosunuDogrula(senaryo, ortakData, ortam, simdi);
  if (!sonuc.gecerli) throw new Error(`${senaryoAdi}: ${hatalariMetneCevir(sonuc.hatalar)}`);
  return sonuc;
}
