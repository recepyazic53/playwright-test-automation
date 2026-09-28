// MODEL SENARYOLARI — Nöbetçi'deki her senaryo için bir Playwright testi üretir ve genel model koşucusuyla koşturur
// (tests/support/model-kosucu.ts).
//
//  - Başlık: senaryo başlığı (aynı başlık tekrar ederse kimliğin ilk 8 karakteri eklenir).
//  - Veri koşusu: senaryo tablodan birden çok satırla koşuyorsa (senaryonun "Çalıştırma biçimi" ya da koşu anı seçimi) her satır /
//    kombinasyon ayrı testtir: "Senaryo [satır-adı]"; hangi satırla koştuğu "veriKosusu" annotation'ıyla sonuca yazılır.
//  - Etiket: "@model-<senaryo UUID>" — Nöbetçi tek senaryo koşusunu bu etiketle daraltır (grep; veri koşularının hepsi aynı etiketi taşır).
//  - Koşuda kapalı senaryolar toplu koşuda üretilmez; Nöbetçi'nin listesi (TEST_SUNUCU_TUM_LISTE=1) ve tek senaryo
//    koşusu (TEST_SUNUCU_GREP_DESENI) hepsini görür.
//  - Veri: genel-veri.ts (proje ve ortam kimlikleriyle, NOBETCI_PROJE_ID + NOBETCI_ORTAM_ID; bkz. playwright.config.ts).
import { test } from '../support/fixtures';
import { genelGirisKimligi, genelGirisTarifi, genelOturumDosyasi, genelVeri } from '../support/genel-veri';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import { modelTestSuresiMs } from '../support/kosu-ayarlari';
import type { PlatformModelVerisi } from '../support/platform-veri';
import { modelEtiketi, modelTestAnahtari, modelTestBasliklari } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { beklenenSonucEtiketi, formSemasiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';

const modelVerisi = genelVeri().model;
/** Koşucunun ortamı: veri ve (yalnızca test koşarken istenen) giriş kaynakları. */
const kosuOrtami = (veri: PlatformModelVerisi): ModelKosuOrtami => ({ veri, tarif: genelGirisTarifi, kimlik: genelGirisKimligi, oturumDosyasi: genelOturumDosyasi });
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
  // Veri koşusu (tablodan çoklu satır): her satır / kombinasyon ayrı test, başlık "Senaryo [satır-adı]"; etiket senaryonunkiyle aynı.
  test(basliklar.get(modelTestAnahtari(senaryo)) ?? senaryo.baslik, {
    tag: modelEtiketi(senaryo.id),
    annotation: [
      // "Dene" senaryosu veritabanında yok: sonucu senaryosuz kaydedilir (kodlu Dene gibi).
      ...(senaryo.deneme ? [] : [{ type: 'senaryoId', description: senaryo.id }]),
      { type: 'kosucu', description: 'model' },
      ...(rozet ? [{ type: 'beklenenSonuc', description: rozet }] : []),
      // Sonuç deposu: hangi satırla / hangi model sürümüyle koştu (başarısızları tekrar çalıştırma aynısını kullanır).
      ...(senaryo.deneme ? [] : [{ type: 'veriKosusu', description: JSON.stringify({ ...(senaryo.veriKosusu ?? { anahtar: null, ad: null, satirlar: [] }), modelSurumu: senaryo.modelSurumu }) }])
    ]
  }, async ({ page }, testInfo) => {
    // Test süresi: Ayarlar > Koşu > Koşu süre limiti biliniyorsa limitten 30 sn önce dolar (limiti aşmaz; limit büyükse kullanılabilir);
    // bilinmiyorsa giriş + bağlam + adım başına 30 sn (kosu-ayarlari.ts > modelTestSuresiMs).
    const adimSayisi = Array.isArray(senaryo.model?.adimlar) ? (senaryo.model?.adimlar as unknown[]).length : 1;
    test.setTimeout(modelTestSuresiMs(adimSayisi));
    await modelSenaryosunuKos(page, testInfo, senaryo, kosuOrtami(modelVerisi as PlatformModelVerisi));
  });
}
