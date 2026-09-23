import { test } from '../../support/fixtures';
import { getEnvironmentName, hasCredentials } from '../../support/environments';
import { testBaslangiciniHazirla } from '../../support/flows/test-baslangici';
import {
  JetSaglikPage,
  type SaglikSigortali,
  type SaglikSigortaliTipi,
  type SaglikSigortaEttiren,
  type SaglikSigortaEttirenTipi
} from '../../support/pages/jet-saglik.page';
import { KrediKartiOdemePage } from '../../support/pages/kredi-karti-odeme.page';
import { attachStepScreenshot } from '../../support/screenshots';
import { loadJetSaglikData, loadOrtakData } from '../../support/test-data';

const environment = getEnvironmentName();
const ortakData = loadOrtakData(environment);
const urunData = loadJetSaglikData(environment).jetSaglik;
const sigortaliTipleri: SaglikSigortaliTipi[] = ['yabanciKimlik', 'pasaport'];
const sigortaEttirenTipleri: SaglikSigortaEttirenTipi[] = [
  'kendisi',
  'ozel',
  'tuzel',
  'pasaport'
];

test.describe.configure({ mode: 'default' });
test.skip(
  !hasCredentials(environment),
  `${environment.toUpperCase()} kullanıcı bilgilerini yerel .env dosyasına ekleyin.`
);
test.skip(!urunData.aktif, `${environment.toUpperCase()} JetSağlık datası aktif değil.`);

for (const sigortaliTipi of sigortaliTipleri) {
  for (const sigortaEttirenTipi of sigortaEttirenTipleri) {
    const baslik = `Sigortalı ${tipMetni(sigortaliTipi)} / Sigorta Ettiren ${tipMetni(sigortaEttirenTipi)} / Yeni İş Testi`;

    test(baslik, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      await testBaslangiciniHazirla({ page, testInfo, environment, ortakData });
      const saglik = new JetSaglikPage(page);
      const odeme = new KrediKartiOdemePage(page);
      const sigortali = sigortaliKimligi(sigortaliTipi);

      await test.step('JetSağlık yeni iş ekranı açılır', async () => {
        await saglik.ac(sigortali.cepTelefonu);
      });

      await test.step('Sigortalı bilgileri girilir ve sorgulanır', async () => {
        await saglik.sigortaliBilgileriniGir(sigortaliTipi, sigortali);
      });

      await test.step('Sigorta ettiren bilgileri girilir', async () => {
        await saglik.sigortaEttirenBilgileriniGir(
          sigortaEttirenTipi,
          sigortaEttirenKimligi(sigortaEttirenTipi)
        );
      });

      await test.step('Poliçe ve sağlık beyanı bilgileri girilir', async () => {
        const sigortaliAdresi =
          sigortaliTipi === 'pasaport'
            ? ortakData.adresBilgileri[urunData.profiller.sigortaliPasaportAdresi]
            : undefined;
        await saglik.policeBilgileriniGir(urunData, sigortaliAdresi);
        await attachStepScreenshot(page, testInfo, '04 - JetSağlık formu tamamlandı');
      });

      await test.step('Prim hesaplanır', async () => {
        await saglik.primHesapla();
        await attachStepScreenshot(page, testInfo, '05 - JetSağlık prim sonucu');
      });

      await test.step('Poliçeleştirme açılır ve kart bilgileri girilir', async () => {
        await odeme.policelestirVeKrediKartiFormunuAc();
        await odeme.kartBilgileriniGir(ortakData.odeme.krediKarti);
      });

      await test.step('Ödeme sonucu doğrulanır', async () => {
        await odeme.odemeyiTamamlaVeBeklenenHatayiDogrula(
          urunData.kabulEdilenOdemeSonuclari,
          '/jet-satis/jet-saglik/policelestir'
        );
        await attachStepScreenshot(page, testInfo, '07 - JetSağlık ödeme sonucu');
      });
    });
  }
}

function sigortaliKimligi(tip: SaglikSigortaliTipi): SaglikSigortali {
  return tip === 'yabanciKimlik'
    ? ortakData.kimlikBilgileri.yabanciKimlik[urunData.profiller.sigortaliYabanciKimlik]
    : ortakData.kimlikBilgileri.pasaport[urunData.profiller.sigortaliPasaport];
}

function sigortaEttirenKimligi(
  tip: SaglikSigortaEttirenTipi
): SaglikSigortaEttiren | undefined {
  if (tip === 'kendisi') return undefined;
  if (tip === 'ozel') return ortakData.kimlikBilgileri.ozel[urunData.profiller.farkliOzel];
  if (tip === 'tuzel') return ortakData.kimlikBilgileri.tuzel[urunData.profiller.farkliTuzel];
  return ortakData.kimlikBilgileri.pasaport[urunData.profiller.farkliPasaport];
}

function tipMetni(tip: SaglikSigortaliTipi | SaglikSigortaEttirenTipi): string {
  return {
    yabanciKimlik: 'Yabancı Kimlik',
    pasaport: 'Pasaport',
    kendisi: 'Kendisi',
    ozel: 'Farklı Özel',
    tuzel: 'Farklı Tüzel'
  }[tip];
}
