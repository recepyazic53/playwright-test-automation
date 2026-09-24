// JetSeyahat prim hesaplama ve ödeme senaryoları.
// jet-seyahat.json > senaryolar altında tanımlanan her senaryo için: ekran açılır,
// kapsam/alternatif/COVID/kayak teminatı gibi poliçe bilgileri girilir, sigortalı ve
// sigorta ettiren (kendisi / farklı özel-T.C. / farklı tüzel-VKN) bilgileri girilir,
// ardından senaryonun BEKLENEN SONUCUNA göre (bkz. tests/support/beklenen-sonuc.ts >
// beklenenSonucuCoz / adimPlaniniOlustur) şu akışlardan biri koşar:
//  - İş kuralı hatası @ prim hesaplama (örn. COVID Hayır + SEYAHAT PAKET): prim hesaplanır,
//    beklenen uyarı doğrulanır ve test biter.
//  - Başarılı + ödeme adımı dahil DEĞİL: prim hesaplanır, pozitif teklif doğrulanır ve
//    test biter (ödeme bilinçli olarak atlanır).
//  - Ödeme adımı dahil (belirtilmemişse varsayılan — eski senaryolar): prim hesaplanır;
//    poliçeleştirmede hata bekleniyorsa orada doğrulanıp biter, değilse kart bilgileri
//    girilip ödeme tamamlanır. Başarılı akışta "Hiçbir poliçe onaylanamadı." (ürünün
//    kabulEdilenOdemeSonuclari listesi) başarı sayılır — test kartıyla gerçek poliçe
//    kesilmemesi beklenen davranıştır; ödemede iş kuralı hatası bekleniyorsa senaryonun
//    kendi mesajı aranır.
// Mesaj eşleşmeleri toleranslıdır (harf büyüklüğü, kıvrık/düz tırnak, boşluk farkları yok
// sayılır; görülen metnin beklenen mesajı içermesi yeterlidir). Her testin beklenen sonucu
// "beklenenSonuc" annotation'ı olarak da eklenir (dashboard > Senaryolar tablosu gösterir).
// Bazı senaryolar farklı bir acente profiliyle (örn. 30856) çalışır; bu acentede COVID
// teminatı, kayak teminatı, Plan Kodu ve Seyahat İptal Bedeli alanları hiç gösterilmez.
import { test } from '../../support/fixtures';
import { getEnvironmentName, hasCredentials } from '../../support/environments';
import { testBaslangiciniHazirla } from '../../support/flows/test-baslangici';
import { JetSeyahatPage } from '../../support/pages/jet-seyahat.page';
import { KrediKartiOdemePage } from '../../support/pages/kredi-karti-odeme.page';
import { attachStepScreenshot } from '../../support/screenshots';
import {
  adimPlaniniOlustur,
  beklenenSonucEtiketi,
  beklenenSonucuCoz,
  type AkisAdimi
} from '../../support/beklenen-sonuc';
import { senaryoKrediKartiniDogrula } from '../../support/senaryo-kredi-karti';
import { loadJetSeyahatData, loadOrtakData } from '../../support/test-data';

const environment = getEnvironmentName();
const ortakData = loadOrtakData(environment);
const urunData = loadJetSeyahatData(environment).jetSeyahat;

test.skip(!hasCredentials(environment), `${environment.toUpperCase()} kullanıcı bilgileri eksik.`);
test.skip(!urunData.aktif, `${environment.toUpperCase()} JetSeyahat datası aktif değil.`);

for (const senaryo of urunData.senaryolar) {
  // Beklenen sonuç, test TANIMLANIRKEN çözülür: planlanan adımlar ve annotation buradan
  // gelir. Senaryo verisi geçersizse (ör. ödeme dahil değilken ödemede hata beklemek)
  // dosyanın tüm testlerini düşürmemek için yalnızca O test, açıklayıcı hatayla başarısız olur.
  let adimPlani: AkisAdimi[] | undefined;
  let beklenenSonucAciklamasi: string;
  let gecersizVeriHatasi: Error | undefined;
  try {
    const cozulmus = beklenenSonucuCoz(senaryo, `"${senaryo.baslik}" senaryosu`);
    // Senaryoya özel kart (varsa) da burada doğrulanır: ödeme dahil değilken kart
    // verilmişse ya da kart geçersizse yalnızca bu test açıklayıcı hatayla düşer.
    senaryoKrediKartiniDogrula(senaryo.krediKarti, cozulmus.odemeAdimiDahil, `"${senaryo.baslik}" senaryosu`);
    adimPlani = adimPlaniniOlustur(cozulmus, urunData.kabulEdilenOdemeSonuclari);
    beklenenSonucAciklamasi = beklenenSonucEtiketi(cozulmus);
  } catch (hata) {
    gecersizVeriHatasi = hata instanceof Error ? hata : new Error(String(hata));
    beklenenSonucAciklamasi = 'Geçersiz';
  }

  test(senaryo.baslik, {
    annotation: { type: 'beklenenSonuc', description: beklenenSonucAciklamasi }
  }, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (gecersizVeriHatasi || !adimPlani) {
      throw gecersizVeriHatasi ?? new Error('Senaryonun adım planı oluşturulamadı.');
    }
    const plan = adimPlani;

    // Giriş yapılır ve senaryonun acente profili (belirtilmemişse "varsayilan") seçilir.
    await testBaslangiciniHazirla({
      page,
      testInfo,
      environment,
      ortakData,
      acenteProfili: senaryo.acenteProfili
    });
    const seyahat = new JetSeyahatPage(page);
    // Sigortalı normalde ürün genelinde SABİT tek bir TC'dir (urunData.sigortaliProfili) —
    // ama dashboard'un "Senaryo Oluştur" özelliğiyle eklenen bir senaryo, kendi sigortalısını
    // serbest girilmiş bir kimlikle (senaryo.sigortaliKimligi) ya da hazır bir profil
    // anahtarıyla (senaryo.sigortaliProfili, ettirenProfili ile aynı mantık) taşıyabilir;
    // ikisi de gelirse serbest girilen kimlik önceliklidir.
    const sigortali = senaryo.sigortaliKimligi
      ?? (senaryo.sigortaliProfili ? ortakData.kimlikBilgileri.ozel[senaryo.sigortaliProfili] : undefined)
      ?? ortakData.kimlikBilgileri.ozel[urunData.sigortaliProfili];

    await test.step('JetSeyahat ekranı açılır', async () => {
      await seyahat.ac(urunData);
    });

    // Kapsam/alternatif/tarih/COVID-kayak teminatı gibi alanlar, ardından tekli/çoklu
    // sorgu tipine göre sigortalı sayısı ya da Excel yüklemesi hazırlanır.
    await test.step('Kapsam, alternatif ve poliçe bilgileri girilir', async () => {
      await seyahat.policeBilgileriniGir(urunData, senaryo);
      await seyahat.sorguTipiniHazirla(urunData, senaryo);
    });

    // Tekli sorguda sigortalı bilgileri (doğum tarihi → telefon → TC kimlik no sırasıyla)
    // girilir; çoklu sorguda bu bilgiler Excel'den geldiği için sadece "ettiren kendisi"
    // seçilir. Ardından senaryoya göre farklı özel (T.C.) veya farklı tüzel (VKN) sigorta
    // ettiren bilgileri girilir.
    await test.step('Sigortalı ve sigorta ettiren bilgileri girilir', async () => {
      if (senaryo.sorguTipi === 'tekli') {
        await seyahat.sigortaliVeEttirenAyniGir(sigortali);
      } else {
        await seyahat.ettirenAyniSec();
      }

      if (senaryo.ettiren === 'farkliOzel') {
        // Hazır profil (ettirenProfili) verilmişse ordan, "Senaryo Oluştur" ile serbest
        // girilmiş yeni bir kimlik varsa (ettirenOzelKimligi) ondan okunur.
        await seyahat.farkliOzelEttirenGir(
          senaryo.ettirenOzelKimligi ?? ortakData.kimlikBilgileri.ozel[senaryo.ettirenProfili!]
        );
      } else if (senaryo.ettiren === 'farkliTuzel') {
        await seyahat.farkliTuzelEttirenGir(
          senaryo.ettirenTuzelKimligi ?? ortakData.kimlikBilgileri.tuzel[senaryo.ettirenProfili!]
        );
      }
      await attachStepScreenshot(page, testInfo, '03 - JetSeyahat bilgileri tamamlandı');
    });

    // Kalan adımlar senaryonun beklenen sonucuna göre planlanmıştır (bkz. yukarıdaki
    // adimPlaniniOlustur): plan hangi adımda bitiyorsa test orada başarıyla sonlanır.
    const odeme = new KrediKartiOdemePage(page);
    for (const adim of plan) {
      switch (adim.tip) {
        case 'primHesaplaVeHataDogrula':
          await test.step('Prim hesaplanır ve beklenen iş kuralı mesajı doğrulanır', async () => {
            await seyahat.primHesaplaVeHataDogrula(adim.mesaj);
            await attachStepScreenshot(page, testInfo, '04 - JetSeyahat beklenen hata sonucu');
          });
          break;

        case 'primHesapla':
          // primHesapla, prim tutarının 0'dan büyük olduğunu (pozitif teklif) zaten doğrular.
          await test.step(
            adim.sonAdimMi ? 'Prim hesaplanır ve teklif oluşturulur' : 'Prim hesaplanır ve pozitif teklif doğrulanır',
            async () => {
              await seyahat.primHesapla();
              await attachStepScreenshot(page, testInfo, '04 - JetSeyahat prim sonucu');
            }
          );
          break;

        case 'odemeAtlandi':
          // Senaryo "ödeme adımı dahil değil" olarak tanımlandı — teklif oluştuğu için
          // başarılıdır; ödemeye BİLİNÇLİ olarak geçilmez (raporda görünsün diye ayrı adım).
          await test.step('Ödeme adımı senaryo gereği atlanır (teklif oluştu, test tamamlandı)', async () => {
            testInfo.annotations.push({
              type: 'bilgi',
              description: 'Ödeme adımı bu senaryoya dahil değil; teklif oluştuğu için test başarılı sayıldı.'
            });
          });
          break;

        case 'policelestirVeHataDogrula':
          await test.step('Poliçeleştirme açılır ve beklenen iş kuralı mesajı doğrulanır', async () => {
            await odeme.policelestirVeBeklenenHatayiDogrula(adim.mesaj);
            await attachStepScreenshot(page, testInfo, '05 - JetSeyahat beklenen hata sonucu');
          });
          break;

        case 'policelestirVeKartGir':
          await test.step('Poliçeleştirme açılır ve kart bilgileri girilir', async () => {
            await odeme.policelestirVeKrediKartiFormunuAc();
            // Senaryoya özel kart (dashboard > "Ödeme bilgileri") varsa o, yoksa ortak test kartı.
            await odeme.kartBilgileriniGir(senaryo.krediKarti ?? ortakData.odeme.krediKarti);
            await attachStepScreenshot(page, testInfo, '05 - JetSeyahat kart formu');
          });
          break;

        case 'odemeyiTamamlaVeDogrula':
          // Başarılı akışta ürünün kabul edilen ödeme sonuçlarından biri ("Hiçbir poliçe
          // onaylanamadı." gibi), ödemede iş kuralı hatası bekleniyorsa senaryonun kendi
          // mesajı aranır.
          await test.step(
            adim.isKuraliHatasiMi
              ? 'Ödeme tamamlanır ve beklenen iş kuralı mesajı doğrulanır'
              : 'Ödeme tamamlanır ve beklenen sonuç doğrulanır',
            async () => {
              await odeme.odemeyiTamamlaVeBeklenenHatayiDogrula(adim.kabulEdilenMesajlar);
              await attachStepScreenshot(page, testInfo, '06 - JetSeyahat ödeme sonucu');
            }
          );
          break;
      }
    }
  });
}
