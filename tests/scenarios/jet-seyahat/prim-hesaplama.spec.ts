// JetSeyahat prim hesaplama ve ödeme senaryoları.
// jet-seyahat.json > senaryolar altında tanımlanan her senaryo için: ekran açılır,
// kapsam/alternatif/COVID/kayak teminatı gibi poliçe bilgileri girilir, sigortalı ve
// sigorta ettiren (kendisi / farklı özel-T.C. / farklı tüzel-VKN) bilgileri girilir,
// prim hesaplanır ve ödeme adımına geçilir. Bazı senaryolar (örn. COVID Hayır +
// SEYAHAT PAKET kombinasyonu) kasıtlı olarak bir iş kuralı hatası tetikler; bu durumda
// test o hatayı görüp başarıyla sonlanır ve ödeme adımına hiç geçmez. Ödeme adımına
// geçen tüm senaryolarda "Hiçbir poliçe onaylanamadı." mesajı beklenir ve bu mesaj
// başarı olarak kabul edilir (test kartıyla gerçek poliçe kesilmemesi beklenen davranıştır).
// Bazı senaryolar farklı bir acente profiliyle (örn. 30856) çalışır; bu acentede COVID
// teminatı, kayak teminatı, Plan Kodu ve Seyahat İptal Bedeli alanları hiç gösterilmez.
import { test } from '../../support/fixtures';
import { getEnvironmentName, hasCredentials } from '../../support/environments';
import { testBaslangiciniHazirla } from '../../support/flows/test-baslangici';
import { JetSeyahatPage } from '../../support/pages/jet-seyahat.page';
import { KrediKartiOdemePage } from '../../support/pages/kredi-karti-odeme.page';
import { attachStepScreenshot } from '../../support/screenshots';
import { loadJetSeyahatData, loadOrtakData } from '../../support/test-data';

const environment = getEnvironmentName();
const ortakData = loadOrtakData(environment);
const urunData = loadJetSeyahatData(environment).jetSeyahat;

test.skip(!hasCredentials(environment), `${environment.toUpperCase()} kullanıcı bilgileri eksik.`);
test.skip(!urunData.aktif, `${environment.toUpperCase()} JetSeyahat datası aktif değil.`);

for (const senaryo of urunData.senaryolar) {
  test(senaryo.baslik, async ({ page }, testInfo) => {
    test.setTimeout(180_000);

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

    // Senaryo kasıtlı olarak bir iş kuralı hatası (örn. COVID Hayır + SEYAHAT PAKET)
    // bekliyorsa, bu hata HANGİ ADIMDA bekleniyorsa (dashboard > "Senaryo Oluştur" >
    // "Hatanın Beklendiği Adım") o adımda doğrulanır ve test burada başarıyla sonlanır;
    // sonraki adımlara hiç geçilmez. Adım belirtilmemişse (eski senaryolarla uyum için)
    // "primHesaplama" varsayılır.
    const beklenenHataAdimi = senaryo.beklenenHataMesaji
      ? senaryo.beklenenHataAdimi ?? 'primHesaplama'
      : undefined;

    if (beklenenHataAdimi === 'primHesaplama') {
      await test.step('Prim hesaplanır ve beklenen iş kuralı mesajı doğrulanır', async () => {
        await seyahat.primHesaplaVeHataDogrula(senaryo.beklenenHataMesaji!);
        await attachStepScreenshot(page, testInfo, '04 - JetSeyahat beklenen hata sonucu');
      });
      return;
    }

    await test.step('Prim hesaplanır ve pozitif teklif doğrulanır', async () => {
      await seyahat.primHesapla();
      await attachStepScreenshot(page, testInfo, '04 - JetSeyahat prim sonucu');
    });

    const odeme = new KrediKartiOdemePage(page);

    if (beklenenHataAdimi === 'policelestirme') {
      await test.step('Poliçeleştirme açılır ve beklenen iş kuralı mesajı doğrulanır', async () => {
        await odeme.policelestirVeBeklenenHatayiDogrula(senaryo.beklenenHataMesaji!);
        await attachStepScreenshot(page, testInfo, '05 - JetSeyahat beklenen hata sonucu');
      });
      return;
    }

    await test.step('Poliçeleştirme açılır ve kart bilgileri girilir', async () => {
      await odeme.policelestirVeKrediKartiFormunuAc();
      await odeme.kartBilgileriniGir(ortakData.odeme.krediKarti);
      await attachStepScreenshot(page, testInfo, '05 - JetSeyahat kart formu');
    });

    // Ödeme tamamlanır: "Hiçbir poliçe onaylanamadı." mesajı beklenen (ve başarı sayılan)
    // sonuçtur.
    await test.step('Ödeme tamamlanır ve beklenen sonuç doğrulanır', async () => {
      await odeme.odemeyiTamamlaVeBeklenenHatayiDogrula(urunData.kabulEdilenOdemeSonuclari);
      await attachStepScreenshot(page, testInfo, '06 - JetSeyahat ödeme sonucu');
    });
  });
}
