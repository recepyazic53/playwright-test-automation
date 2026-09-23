import { test } from '../../support/fixtures';
import { getEnvironmentName, hasCredentials } from '../../support/environments';
import { testBaslangiciniHazirla } from '../../support/flows/test-baslangici';
import {
  JetKobiPage,
  type KobiKimlik,
  type KobiKimlikTipi,
  type KobiSigortaliDurumu
} from '../../support/pages/jet-kobi.page';
import { KrediKartiOdemePage } from '../../support/pages/kredi-karti-odeme.page';
import { attachStepScreenshot } from '../../support/screenshots';
import { loadJetKobiData, loadOrtakData } from '../../support/test-data';

type Senaryo = {
  sigortaliTipi: KobiKimlikTipi;
  sigortaEttirenTipi: 'ayni' | KobiKimlikTipi;
  sigortaliDurumu: KobiSigortaliDurumu;
};

const environment = getEnvironmentName();
const ortakData = loadOrtakData(environment);
const urunData = loadJetKobiData(environment).jetKobi;
const senaryolar: Senaryo[] = (['ozel', 'tuzel'] as KobiKimlikTipi[]).flatMap(
  (sigortaliTipi) =>
    (['ayni', 'ozel', 'tuzel'] as const).flatMap((sigortaEttirenTipi) =>
      (['malSahibi', 'kiraci'] as KobiSigortaliDurumu[]).map((sigortaliDurumu) => ({
        sigortaliTipi,
        sigortaEttirenTipi,
        sigortaliDurumu
      }))
    )
);

test.describe.configure({ mode: 'default' });
test.skip(!hasCredentials(environment), `${environment.toUpperCase()} kullanıcı bilgileri eksik.`);
test.skip(!urunData.aktif, `${environment.toUpperCase()} JetKobi datası aktif değil.`);

for (const senaryo of senaryolar) {
  const ettiren = senaryo.sigortaEttirenTipi === 'ayni'
    ? 'Aynı'
    : `Farklı ${kimlikTipiMetni(senaryo.sigortaEttirenTipi)}`;
  const baslik = `Sigortalı ${kimlikTipiMetni(senaryo.sigortaliTipi)} / Sigorta Ettiren ${ettiren} / Sigortalı Durumu ${durumMetni(senaryo.sigortaliDurumu)} Testi`;

  test(baslik, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await testBaslangiciniHazirla({ page, testInfo, environment, ortakData });
    const kobi = new JetKobiPage(page);
    const odeme = new KrediKartiOdemePage(page);

    await test.step('JetKobi ekranı açılır', async () => {
      await kobi.ac();
    });

    await test.step('Sigortalı bilgileri girilir ve sorgulanır', async () => {
      await kobi.sigortaliBilgileriniGir(
        senaryo.sigortaliTipi,
        sigortaliKimligi(senaryo.sigortaliTipi)
      );
    });

    await test.step('Sigorta ettiren seçimi yapılır', async () => {
      if (senaryo.sigortaEttirenTipi === 'ayni') {
        await kobi.sigortaEttirenAyniSec();
      } else {
        await kobi.farkliSigortaEttirenGir(
          senaryo.sigortaEttirenTipi,
          farkliEttirenKimligi(senaryo.sigortaEttirenTipi)
        );
      }
    });

    await test.step('Riziko ve poliçe bilgileri girilir', async () => {
      await kobi.rizikoVePoliceBilgileriniGir(urunData, senaryo.sigortaliDurumu);
      await attachStepScreenshot(page, testInfo, '03 - JetKobi formu tamamlandı');
    });

    await test.step('Teminat ekranı açılır ve bilgiler girilir', async () => {
      await kobi.teminatEkraniniAc();
      await kobi.teminatlariGir(urunData, senaryo.sigortaliDurumu);
      await attachStepScreenshot(page, testInfo, '04 - JetKobi teminatları tamamlandı');
    });

    await test.step('Teklif alınır', async () => {
      await kobi.teklifAl();
      await attachStepScreenshot(page, testInfo, '05 - JetKobi teklif sonucu');
    });

    await test.step('Teklif kaydedilir ve kart bilgileri girilir', async () => {
      await odeme.teklifKaydetVeKrediKartiFormunuAc();
      await odeme.kartBilgileriniGir(ortakData.odeme.krediKarti);
      await attachStepScreenshot(page, testInfo, '06 - JetKobi kart formu');
    });

    await test.step('Ödeme tamamlanır ve beklenen hata doğrulanır', async () => {
      await odeme.odemeyiTamamlaVeBeklenenHatayiDogrula(
        urunData.kabulEdilenOdemeSonuclari
      );
      await attachStepScreenshot(page, testInfo, '07 - JetKobi ödeme sonucu');
    });
  });
}

function sigortaliKimligi(tip: KobiKimlikTipi): KobiKimlik {
  return tip === 'ozel'
    ? ortakData.kimlikBilgileri.ozel[urunData.profiller.sigortaliOzel]
    : ortakData.kimlikBilgileri.tuzel[urunData.profiller.sigortaliTuzel];
}

function farkliEttirenKimligi(tip: KobiKimlikTipi): KobiKimlik {
  return tip === 'ozel'
    ? ortakData.kimlikBilgileri.ozel[urunData.profiller.farkliOzel]
    : ortakData.kimlikBilgileri.tuzel[urunData.profiller.farkliTuzel];
}

function kimlikTipiMetni(tip: KobiKimlikTipi): string {
  return tip === 'ozel' ? 'Özel' : 'Tüzel';
}

function durumMetni(durum: KobiSigortaliDurumu): string {
  return durum === 'malSahibi' ? 'Mal Sahibi' : 'Kiracı';
}
