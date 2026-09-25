import { test } from '../../support/fixtures';
import { getEnvironmentName, hasCredentials } from '../../support/environments';
import { testBaslangiciniHazirla } from '../../support/flows/test-baslangici';
import {
  JetDaskPage,
  type DaskKimlik,
  type DaskKimlikTipi,
  type DaskSigortaEttirenSifati
} from '../../support/pages/jet-dask.page';
import { KrediKartiOdemePage } from '../../support/pages/kredi-karti-odeme.page';
import { attachStepScreenshot } from '../../support/screenshots';
import { loadJetDaskData, loadOrtakData } from '../../support/test-data';

const environment = getEnvironmentName();
const ortakData = loadOrtakData(environment);
const urunData = loadJetDaskData(environment).jetDask;
const kimlikTipleri: DaskKimlikTipi[] = ['ozel', 'tuzel', 'pasaport'];
const sifatlar: DaskSigortaEttirenSifati[] = ['malSahibi', 'kiraci'];

test.describe.configure({ mode: 'default' });
test.skip(
  !hasCredentials(environment),
  `${environment.toUpperCase()} giriş profilini Nöbetçi > Ayarlar > Giriş profilleri'nde tanımlayın.`
);
test.skip(!urunData.aktif, `${environment.toUpperCase()} JetDASK datası aktif değil.`);

for (const kimlikTipi of kimlikTipleri) {
  for (const sifat of sifatlar) {
    const baslik = `Sigortalı ${kimlikTipiMetni(kimlikTipi)} / Sigorta Ettiren Sıfatı ${sifatMetni(sifat)} / Yeni İş Testi`;

    test(baslik, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      await testBaslangiciniHazirla({ page, testInfo, environment, ortakData });
      const dask = new JetDaskPage(page);
      const odeme = new KrediKartiOdemePage(page);

      await test.step('JetDASK yeni iş ekranı açılır', async () => {
        await dask.ac();
      });

      await test.step('Sigortalı bilgileri girilir ve sorgulanır', async () => {
        await dask.sigortaliBilgileriniGir(kimlikTipi, sigortaliKimligi(kimlikTipi));
      });

      await test.step('Adres, tapu ve poliçe bilgileri girilir', async () => {
        await dask.adresVePoliceBilgileriniGir(urunData, sifat);
        await attachStepScreenshot(page, testInfo, '03 - JetDASK formu tamamlandı');
      });

      await test.step('Prim hesaplanır', async () => {
        await dask.primHesapla();
        await attachStepScreenshot(page, testInfo, '04 - JetDASK prim sonucu');
      });

      await test.step('Poliçeleştirme açılır ve kart bilgileri girilir', async () => {
        await odeme.policelestirVeKrediKartiFormunuAc();
        await odeme.kartBilgileriniGir(ortakData.odeme.krediKarti);
        await attachStepScreenshot(page, testInfo, '05 - JetDASK kart formu');
      });

      await test.step('Ödeme tamamlanır ve beklenen hata doğrulanır', async () => {
        await odeme.odemeyiTamamlaVeBeklenenHatayiDogrula(
          urunData.kabulEdilenOdemeSonuclari,
          '/jet-satis/jet-dask/policelestir'
        );
        await attachStepScreenshot(page, testInfo, '06 - JetDASK ödeme sonucu');
      });
    });
  }
}

function sigortaliKimligi(tip: DaskKimlikTipi): DaskKimlik {
  if (tip === 'ozel') {
    return ortakData.kimlikBilgileri.ozel[urunData.profiller.sigortaliOzel];
  }
  if (tip === 'tuzel') {
    return ortakData.kimlikBilgileri.tuzel[urunData.profiller.sigortaliTuzel];
  }
  return ortakData.kimlikBilgileri.pasaport[urunData.profiller.sigortaliPasaport];
}

function kimlikTipiMetni(tip: DaskKimlikTipi): string {
  return { ozel: 'Özel', tuzel: 'Tüzel', pasaport: 'Pasaport' }[tip];
}

function sifatMetni(sifat: DaskSigortaEttirenSifati): string {
  return sifat === 'malSahibi' ? 'Mal Sahibi' : 'Kiracı';
}
