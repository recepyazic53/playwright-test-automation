import { test } from '../../support/fixtures';
import { getEnvironmentName, hasCredentials } from '../../support/environments';
import { testBaslangiciniHazirla } from '../../support/flows/test-baslangici';
import {
  JetKonutPage,
  type KonutKimlik,
  type KonutKimlikTipi,
  type KonutSigortaliDurumu
} from '../../support/pages/jet-konut.page';
import { KrediKartiOdemePage } from '../../support/pages/kredi-karti-odeme.page';
import { attachStepScreenshot } from '../../support/screenshots';
import { loadJetKonutData, loadOrtakData } from '../../support/test-data';

type Senaryo = {
  sigortaliTipi: KonutKimlikTipi;
  sigortaEttirenTipi: 'ayni' | KonutKimlikTipi;
  sigortaliDurumu: KonutSigortaliDurumu;
};

const environment = getEnvironmentName();
const ortakData = loadOrtakData(environment);
const urunData = loadJetKonutData(environment).jetKonut;
const senaryolar: Senaryo[] = (['ozel', 'tuzel'] as KonutKimlikTipi[]).flatMap(
  (sigortaliTipi) =>
    (['ayni', 'ozel', 'tuzel'] as const).flatMap((sigortaEttirenTipi) =>
      (['malSahibi', 'kiraci'] as KonutSigortaliDurumu[]).map((sigortaliDurumu) => ({
        sigortaliTipi,
        sigortaEttirenTipi,
        sigortaliDurumu
      }))
    )
);

test.describe.configure({ mode: 'default' });
test.skip(!hasCredentials(environment), `${environment.toUpperCase()} kullanıcı bilgileri eksik.`);
test.skip(!urunData.aktif, `${environment.toUpperCase()} JetKonut datası aktif değil.`);

for (const senaryo of senaryolar) {
  const ettiren = senaryo.sigortaEttirenTipi === 'ayni'
    ? 'Aynı'
    : `Farklı ${kimlikTipiMetni(senaryo.sigortaEttirenTipi)}`;
  const baslik = `Sigortalı ${kimlikTipiMetni(senaryo.sigortaliTipi)} / Sigorta Ettiren ${ettiren} / Sigortalı Durumu ${durumMetni(senaryo.sigortaliDurumu)} Testi`;

  test(baslik, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await testBaslangiciniHazirla({ page, testInfo, environment, ortakData });
    const konut = new JetKonutPage(page);
    const odeme = new KrediKartiOdemePage(page);

    await test.step('JetKonut ekranı açılır', async () => {
      await konut.ac();
    });

    await test.step('Sigortalı bilgileri girilir ve sorgulanır', async () => {
      await konut.sigortaliBilgileriniGir(
        senaryo.sigortaliTipi,
        sigortaliKimligi(senaryo.sigortaliTipi)
      );
    });

    await test.step('Sigorta ettiren seçimi yapılır', async () => {
      if (senaryo.sigortaEttirenTipi === 'ayni') {
        await konut.sigortaEttirenAyniSec();
      } else {
        await konut.farkliSigortaEttirenGir(
          senaryo.sigortaEttirenTipi,
          farkliEttirenKimligi(senaryo.sigortaEttirenTipi)
        );
      }
    });

    await test.step('Riziko ve poliçe bilgileri girilir', async () => {
      await konut.rizikoVePoliceBilgileriniGir(urunData, senaryo.sigortaliDurumu);
      await attachStepScreenshot(page, testInfo, '03 - JetKonut formu tamamlandı');
    });

    await test.step('Teminat bilgileri girilir', async () => {
      await konut.teminatlariGir(urunData, senaryo.sigortaliDurumu);
      await attachStepScreenshot(page, testInfo, '04 - JetKonut teminatları tamamlandı');
    });

    await test.step('Teklif alınır', async () => {
      await konut.teklifAl();
      await attachStepScreenshot(page, testInfo, '05 - JetKonut teklif sonucu');
    });

    await test.step('Teklif kaydedilir ve kart bilgileri girilir', async () => {
      await odeme.teklifKaydetVeKrediKartiFormunuAc();
      await odeme.kartBilgileriniGir(ortakData.odeme.krediKarti);
      await attachStepScreenshot(page, testInfo, '06 - JetKonut kart formu');
    });

    await test.step('Ödeme tamamlanır ve beklenen hata doğrulanır', async () => {
      await odeme.odemeyiTamamlaVeBeklenenHatayiDogrula(
        ortakData.odeme.krediKarti.beklenenHataMesaji
      );
      await attachStepScreenshot(page, testInfo, '07 - JetKonut ödeme sonucu');
    });
  });
}

function sigortaliKimligi(tip: KonutKimlikTipi): KonutKimlik {
  return tip === 'ozel'
    ? ortakData.kimlikBilgileri.ozel[urunData.profiller.sigortaliOzel]
    : ortakData.kimlikBilgileri.tuzel[urunData.profiller.sigortaliTuzel];
}

function farkliEttirenKimligi(tip: KonutKimlikTipi): KonutKimlik {
  return tip === 'ozel'
    ? ortakData.kimlikBilgileri.ozel[urunData.profiller.farkliOzel]
    : ortakData.kimlikBilgileri.tuzel[urunData.profiller.farkliTuzel];
}

function kimlikTipiMetni(tip: KonutKimlikTipi): string {
  return tip === 'ozel' ? 'Özel' : 'Tüzel';
}

function durumMetni(durum: KonutSigortaliDurumu): string {
  return durum === 'malSahibi' ? 'Mal Sahibi' : 'Kiracı';
}
