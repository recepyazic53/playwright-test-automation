// MODEL SENARYOLARI — test kodu OLMAYAN her platform senaryosu için (sayfa paketinden/modelden oluşturulmuş;
// kodlu bir teste eşlenmemiş) bir Playwright testi üretir ve genel model koşucusuyla koşturur
// (tests/support/model-kosucu.ts). Kodda tanımlı (Galaksi) testler burada ÜRETİLMEZ — tekrar koşmazlar.
//
//  - Başlık: senaryo başlığı (aynı başlık tekrar ederse kimliğin ilk 8 karakteri eklenir).
//  - Etiket: "@model-<senaryo UUID>" — Nöbetçi tek senaryo koşusunu bu etiketle daraltır (grep).
//  - Koşuda kapalı senaryolar "npm run test"te üretilmez; Nöbetçi'nin listesi (TEST_SUNUCU_TUM_LISTE=1) ve
//    tek senaryo koşusu (TEST_SUNUCU_GREP_DESENI) hepsini görür (playwright.config.ts > grepInvert ile aynı kural).
//  - Veri kaynağı iki yoldan biri:
//      aktarılmış ortam (TEST_ENV "test"/"canli"; playwright.config.ts) → platform-veri.ts + environments.ts,
//      GENEL YOL (elle oluşturulan proje/ortam; playwright.model.config.ts, NOBETCI_PROJE_ID + NOBETCI_ORTAM_ID)
//      → genel-veri.ts (adaptörsüz; proje ve ortam kimlikleriyle).
import { test } from '../support/fixtures';
import { getEnvironment, getEnvironmentName, girisKimligi, girisTarifi } from '../support/environments';
import { genelGirisKimligi, genelGirisTarifi, genelKosuMu, genelOturumDosyasi, genelVeri } from '../support/genel-veri';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import { platformModelVerisi, type PlatformModelVerisi } from '../support/platform-veri';
import { modelEtiketi, modelTestBasliklari } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { beklenenSonucEtiketi, formSemasiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';

/** Bu sürecin model verisi ve (yalnızca test koşarken istenen) giriş kaynakları. */
function kosuOrtami(): { veri: PlatformModelVerisi | null; ortam: (veri: PlatformModelVerisi) => ModelKosuOrtami } {
  if (genelKosuMu()) {
    return {
      veri: genelVeri().model,
      ortam: (veri) => ({ veri, tarif: genelGirisTarifi, kimlik: genelGirisKimligi, oturumDosyasi: genelOturumDosyasi })
    };
  }
  const ad = getEnvironmentName();
  return {
    veri: platformModelVerisi(ad),
    ortam: (veri) => ({ veri, tarif: () => girisTarifi(ad), kimlik: () => girisKimligi(ad), oturumDosyasi: () => getEnvironment(ad).login.storageState })
  };
}

const kaynak = kosuOrtami();
const modelVerisi = kaynak.veri;
const hepsi = process.env.TEST_SUNUCU_TUM_LISTE === '1' || Boolean(process.env.TEST_SUNUCU_GREP_DESENI);
// Ekranı devre dışı olan senaryolar da (ekran düzeyinde "Koşuda kapalı") yalnızca tam listede/tek koşuda üretilir.
const senaryolar = (modelVerisi?.senaryolar ?? []).filter((s) => hepsi || (s.kosuyaDahil && s.ekranEtkin !== false));
const basliklar = modelTestBasliklari(senaryolar);

/** Senaryolar tablosundaki beklenen sonuç rozeti (model yoksa annotation eklenmez). */
function beklenenSonucRozeti(model: Record<string, unknown> | null, veri: Record<string, unknown>): string | null {
  if (!model) return null;
  try {
    return beklenenSonucEtiketi(formSemasiOlustur(model), veri)?.metin ?? null;
  } catch {
    return null;
  }
}

for (const senaryo of senaryolar) {
  const rozet = beklenenSonucRozeti(senaryo.model, senaryo.veri);
  test(basliklar.get(senaryo.id) ?? senaryo.baslik, {
    tag: modelEtiketi(senaryo.id),
    annotation: [
      // "Dene" senaryosu veritabanında yok: sonucu senaryosuz kaydedilir (kodlu Dene gibi).
      ...(senaryo.deneme ? [] : [{ type: 'senaryoId', description: senaryo.id }]),
      { type: 'kosucu', description: 'model' },
      ...(rozet ? [{ type: 'beklenenSonuc', description: rozet }] : [])
    ]
  }, async ({ page }, testInfo) => {
    // Giriş + bağlam + adım başına en fazla 30 sn bekleme; adım sayısıyla ölçeklenir.
    const adimSayisi = Array.isArray(senaryo.model?.adimlar) ? (senaryo.model?.adimlar as unknown[]).length : 1;
    test.setTimeout(120_000 + adimSayisi * 30_000);
    await modelSenaryosunuKos(page, testInfo, senaryo, kaynak.ortam(modelVerisi as PlatformModelVerisi));
  });
}
