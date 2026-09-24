import { test } from '../../support/fixtures';
import { getEnvironmentName, hasCredentials } from '../../support/environments';
import { testBaslangiciniHazirla } from '../../support/flows/test-baslangici';
import {
  JetIlkAtesKonutPage,
  type FireKimlik,
  type FireKimlikTipi,
  type SigortaliDurumu
} from '../../support/pages/jet-ilk-ates-konut.page';
import { KrediKartiOdemePage } from '../../support/pages/kredi-karti-odeme.page';
import { attachStepScreenshot } from '../../support/screenshots';
import { loadJetIlkAtesKonutData, loadOrtakData } from '../../support/test-data';

type Senaryo = {
  sigortaliTipi: FireKimlikTipi;
  sigortaEttirenTipi: 'ayni' | FireKimlikTipi;
  sigortaliDurumu: SigortaliDurumu;
};

const environment = getEnvironmentName();
const ortakData = loadOrtakData(environment);
const urunData = loadJetIlkAtesKonutData(environment).jetIlkAtesKonut;
const durumlar: SigortaliDurumu[] = ['malSahibi', 'kiraci'];
const senaryolar: Senaryo[] = (['ozel', 'tuzel'] as FireKimlikTipi[]).flatMap(
  (sigortaliTipi) =>
    (['ayni', 'ozel', 'tuzel'] as const).flatMap((sigortaEttirenTipi) =>
      durumlar.map((sigortaliDurumu) => ({
        sigortaliTipi,
        sigortaEttirenTipi,
        sigortaliDurumu
      }))
    )
);

// Bu uygulama aynı acente kullanıcısıyla eşzamanlı giriş/kullanıcı değişimini
// güvenilir biçimde desteklemiyor. Senaryolar bağımsız kalır ancak bu dosyada
// sırayla çalışarak birbirlerinin oturumunu bozmaz.
test.describe.configure({ mode: 'default' });

test.skip(
  !hasCredentials(environment),
  `${environment.toUpperCase()} giriş profilini Nöbetçi > Ayarlar > Giriş profilleri'nde tanımlayın.`
);
test.skip(!urunData.aktif, `${environment.toUpperCase()} Jet İlk Ateş datası aktif değil.`);

for (const senaryo of senaryolar) {
  const sigortaliTipi = basHarfleriBuyut(senaryo.sigortaliTipi);
  const ettiren = senaryo.sigortaEttirenTipi === 'ayni'
    ? 'Aynı'
    : `Farklı ${basHarfleriBuyut(senaryo.sigortaEttirenTipi)}`;
  const durum = senaryo.sigortaliDurumu === 'malSahibi' ? 'Mal Sahibi' : 'Kiracı';
  const baslik = `Sigortalı ${sigortaliTipi} / Sigorta Ettiren ${ettiren} / Sigortalı Durumu ${durum} Testi`;

  test(baslik, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await testBaslangiciniHazirla({ page, testInfo, environment, ortakData });
    const fire = new JetIlkAtesKonutPage(page);
    const odeme = new KrediKartiOdemePage(page);

    await test.step('Jet İlk Ateş Konut ekranı açılır', async () => {
      await fire.ac();
    });

    await test.step('Sigortalı bilgileri girilir ve sorgulanır', async () => {
      await fire.sigortaliBilgileriniGir(
        senaryo.sigortaliTipi,
        sigortaliKimligi(senaryo.sigortaliTipi)
      );
    });

    await test.step('Sigorta ettiren seçimi yapılır', async () => {
      if (senaryo.sigortaEttirenTipi === 'ayni') {
        await fire.sigortaEttirenAyniSec();
      } else {
        await fire.farkliSigortaEttirenGir(
          senaryo.sigortaEttirenTipi,
          farkliEttirenKimligi(senaryo.sigortaEttirenTipi)
        );
      }
    });

    await test.step('Adres ve poliçe bilgileri girilir', async () => {
      await fire.adresVePoliceBilgileriniGir(urunData, senaryo.sigortaliDurumu);
      await attachStepScreenshot(page, testInfo, '03 - Jet İlk Ateş formu tamamlandı');
    });

    await test.step('Teklif alınır', async () => {
      await fire.teklifAl();
      await attachStepScreenshot(page, testInfo, '04 - Jet İlk Ateş teklif sonucu');
    });

    await test.step('Teklif kaydedilir ve kredi kartı bilgileri girilir', async () => {
      await odeme.teklifKaydetVeKrediKartiFormunuAc();
      await odeme.kartBilgileriniGir(ortakData.odeme.krediKarti);
      await attachStepScreenshot(page, testInfo, '05 - Kredi kartı ödeme formu');
    });

    await test.step('Ödeme tamamlanır ve beklenen hata doğrulanır', async () => {
      await odeme.odemeyiTamamlaVeBeklenenHatayiDogrula(
        ortakData.odeme.krediKarti.beklenenHataMesaji
      );
      await attachStepScreenshot(page, testInfo, '06 - Beklenen ödeme sonucu');
    });
  });
}

function sigortaliKimligi(tip: FireKimlikTipi): FireKimlik {
  return tip === 'ozel'
    ? ortakData.kimlikBilgileri.ozel[urunData.profiller.sigortaliOzel]
    : ortakData.kimlikBilgileri.tuzel[urunData.profiller.sigortaliTuzel];
}

function farkliEttirenKimligi(tip: FireKimlikTipi): FireKimlik {
  return tip === 'ozel'
    ? ortakData.kimlikBilgileri.ozel[urunData.profiller.farkliOzel]
    : ortakData.kimlikBilgileri.tuzel[urunData.profiller.farkliTuzel];
}

function basHarfleriBuyut(value: FireKimlikTipi): string {
  return value === 'ozel' ? 'Özel' : 'Tüzel';
}
