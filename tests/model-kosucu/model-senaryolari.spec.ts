// MODEL SENARYOLARI — Nöbetçi'deki her senaryo için bir Playwright testi üretir ve genel model koşucusuyla koşturur
// (tests/support/model-kosucu.ts).
//
//  - Başlık: senaryo başlığı (aynı başlık tekrar ederse kimliğin ilk 8 karakteri eklenir).
//  - Etiket: "@model-<senaryo UUID>" — Nöbetçi tek senaryo koşusunu bu etiketle daraltır (grep).
//  - Koşuda kapalı senaryolar toplu koşuda üretilmez; Nöbetçi'nin listesi (TEST_SUNUCU_TUM_LISTE=1) ve tek senaryo
//    koşusu (TEST_SUNUCU_GREP_DESENI) hepsini görür.
//  - Veri: genel-veri.ts (proje ve ortam kimlikleriyle, NOBETCI_PROJE_ID + NOBETCI_ORTAM_ID; bkz. playwright.config.ts).
import { test } from '../support/fixtures';
import { genelGirisKimligi, genelGirisTarifi, genelOturumDosyasi, genelVeri } from '../support/genel-veri';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import { modelTestSuresiMs } from '../support/kosu-ayarlari';
import type { PlatformModelVerisi } from '../support/platform-veri';
import { modelEtiketi, modelTestBasliklari } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { beklenenSonucEtiketi, formSemasiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { ekrandanOku, senaryoyaUygula, uctanUcaAdimi } from '../support/uctan-uca-adimi';

const modelVerisi = genelVeri().model;
// Uçtan uca akışın ekran adımı (Nöbetçi NOBETCI_AKIS_ADIMI ile verir): o senaryonun alanları ezilir, bitince ekrandan okunur.
const akisAdimi = uctanUcaAdimi();
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
  test(basliklar.get(senaryo.id) ?? senaryo.baslik, {
    tag: modelEtiketi(senaryo.id),
    annotation: [
      // "Dene" senaryosu veritabanında yok: sonucu senaryosuz kaydedilir (kodlu Dene gibi).
      ...(senaryo.deneme ? [] : [{ type: 'senaryoId', description: senaryo.id }]),
      { type: 'kosucu', description: 'model' },
      ...(rozet ? [{ type: 'beklenenSonuc', description: rozet }] : [])
    ]
  }, async ({ page }, testInfo) => {
    // Test süresi: Ayarlar > Koşu > Koşu süre limiti biliniyorsa limitten 30 sn önce dolar (limiti aşmaz; limit büyükse kullanılabilir);
    // bilinmiyorsa giriş + bağlam + adım başına 30 sn (kosu-ayarlari.ts > modelTestSuresiMs).
    const adimSayisi = Array.isArray(senaryo.model?.adimlar) ? (senaryo.model?.adimlar as unknown[]).length : 1;
    test.setTimeout(modelTestSuresiMs(adimSayisi));
    const akista = akisAdimi !== null && akisAdimi.senaryoId === senaryo.id;
    await modelSenaryosunuKos(page, testInfo, akista ? senaryoyaUygula(senaryo, akisAdimi) : senaryo, kosuOrtami(modelVerisi as PlatformModelVerisi));
    if (akista) await ekrandanOku(page, testInfo, akisAdimi);
  });
}
