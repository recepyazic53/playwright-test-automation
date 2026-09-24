// Bütün senaryo dosyalarının import ettiği ortak `test` nesnesi.
// Allure raporunu "anlaşılır" hale getirmek için iki otomatik (auto) fixture ekler:
//  1) allureGruplama: Epic/Feature/Story etiketlerini dosya yoluna göre otomatik ayarlar
//     (Behaviors sekmesinde ürün > akış > senaryo şeklinde gruplama sağlar).
//  2) hataYakalayici: Test başarısız olduğunda, hatanın alındığı son ekran görüntüsünü ve
//     okunabilir hata mesajını "❌ HATA ANI" etiketiyle rapora ekler; böylece raporu açan
//     kişi hangi ekranda takıldığını aramadan görür.
// Senaryo dosyaları `test`'i '@playwright/test' yerine buradan import etmelidir.
import { test as base } from '@playwright/test';
import { epic, feature, label, story } from 'allure-js-commons';
import { writeFileSync, renameSync } from 'node:fs';

// Klasör adı -> Allure Epic (ürün) görünen adı.
const EPIC_ADLARI: Record<string, string> = {
  'jet-kasko': 'JetKasko',
  'jet-seyahat': 'JetSeyahat',
  'jet-dask': 'JetDASK',
  'jet-kobi': 'JetKOBİ',
  'jet-konut': 'JetKonut',
  'jet-saglik': 'JetSağlık',
  'jet-ilk-ates-konut': 'İlk Ateş Konut',
  'jet-satis': 'Jet Satış',
  trafik: 'Trafik',
  portal: 'Portal'
};

// "klasör/dosya" -> Allure Feature (akış/ekran) görünen adı.
const FEATURE_ADLARI: Record<string, string> = {
  'jet-kasko/yeni-kayit': 'Yeni Kayıt (YK)',
  'jet-kasko/teklif-olusturma': 'Teklif Oluşturma (Tescilli)',
  'jet-kasko/canli': 'Canlı Kontrol',
  'jet-seyahat/prim-hesaplama': 'Prim Hesaplama',
  'jet-seyahat/validasyon': 'Validasyon',
  'jet-dask/yeni-is-matrisi': 'Yeni İş Matrisi',
  'jet-kobi/teklif-matrisi': 'Teklif Matrisi',
  'jet-konut/teklif-matrisi': 'Teklif Matrisi',
  'jet-saglik/yeni-is-matrisi': 'Yeni İş Matrisi',
  'jet-ilk-ates-konut/teklif-matrisi': 'Teklif Matrisi',
  'jet-satis/urun-ekranlari': 'Ürün Ekranları',
  'trafik/jet-trafik': 'Teklif Alma',
  'portal/canli': 'Genel Kontrol'
};

function epicVeFeatureAdlariniBul(dosyaYolu: string): { epicAdi: string; featureAdi: string } {
  const normalizeEdilmisYol = dosyaYolu.replace(/\\/g, '/');
  const senaryoEslesme = normalizeEdilmisYol.match(/\/scenarios\/([^/]+)\/([^/]+)\.spec\.ts$/);
  const canliEslesme = normalizeEdilmisYol.match(/\/canli\/([^/]+)\.spec\.ts$/);

  if (senaryoEslesme) {
    const [, klasor, dosya] = senaryoEslesme;
    return {
      epicAdi: EPIC_ADLARI[klasor] ?? klasor,
      featureAdi: FEATURE_ADLARI[`${klasor}/${dosya}`] ?? dosya
    };
  }

  if (canliEslesme) {
    const [, dosya] = canliEslesme;
    return {
      epicAdi: EPIC_ADLARI[dosya] ?? dosya,
      featureAdi: FEATURE_ADLARI[`${dosya}/canli`] ?? 'Canlı Kontrol'
    };
  }

  return { epicAdi: 'Diğer', featureAdi: 'Diğer' };
}

type OrtakFixturelar = {
  allureGruplama: void;
  hataYakalayici: void;
  canliIzlemeYayini: void;
};

export const test = base.extend<OrtakFixturelar>({
  allureGruplama: [
    async ({}, use, testInfo) => {
      const { epicAdi, featureAdi } = epicVeFeatureAdlariniBul(testInfo.file);
      await epic(epicAdi);
      await feature(featureAdi);
      await story(testInfo.title);
      // Koşu gruplama etiketleri (bkz. global-setup.ts > KOSU_KIMLIGI ve
      // urun-hata-raporu.mjs): aynı "playwright test" çağrısındaki tüm sonuçlar aynı
      // kosuKimligi'ni taşır. kosuTuru: dashboard'daki ▷ ile tetiklenen tekil koşular
      // (TEST_SUNUCU_GORUNUR=1) 'tekil', normal npm run test / CI koşuları 'tam' — dashboard
      // üst kartları ve "önceki koşu" karşılaştırması yalnızca 'tam' koşulara bakar.
      const kosuKimligi = process.env.KOSU_KIMLIGI;
      if (kosuKimligi) await label('kosuKimligi', kosuKimligi);
      // Dashboard'daki "Koşuyu başlat" her senaryoyu ayrı süreçte koşsa da tam koşu
      // sayılır: test-sunucu bu durumda ortak KOSU_KIMLIGI ve TEST_SUNUCU_KOSU_TURU=tam verir.
      const dashboardKosusuMu = process.env.TEST_SUNUCU_GORUNUR === '1';
      const tamKosuMu = !dashboardKosusuMu || process.env.TEST_SUNUCU_KOSU_TURU === 'tam';
      await label('kosuTuru', tamKosuMu ? 'tam' : 'tekil');
      // kosuKapsami (yalnızca 'tam' koşularda): dashboard'da bir ürün seçiliyken başlatılan
      // "Koşuyu başlat" o ürünün görünen adını taşır (test-sunucu TEST_SUNUCU_KOSU_KAPSAMI
      // ile verir); Genel görünümden başlatılan koşular ve terminal/CI koşuları 'Genel'dir.
      // urun-hata-raporu.mjs, Genel trendini yalnızca 'Genel' kapsamlı koşulardan çizer.
      if (tamKosuMu) {
        const kosuKapsami = dashboardKosusuMu ? process.env.TEST_SUNUCU_KOSU_KAPSAMI || 'Genel' : 'Genel';
        await label('kosuKapsami', kosuKapsami);
      }
      await use();
    },
    { auto: true }
  ],

  hataYakalayici: [
    async ({ page }, use, testInfo) => {
      await use();

      const basariliMi = testInfo.status === testInfo.expectedStatus;
      // TEST_SUNUCU_GORUNUR, dashboard'daki ▷ Çalıştır ikonuyla tek bir senaryo
      // tetiklendiğinde test-sunucu.mjs tarafından set edilir. Normal toplu koşularda
      // (npm run test, CI) her başarılı testte ekran görüntüsü almak gereksiz artifact
      // şişirir; bu yüzden başarılı durumda SADECE dashboard'dan tetiklenen koşularda
      // ekran görüntüsü alınır — dashboard'daki sonuç popup'ında gösterilebilsin diye.
      const gorunurKosuMu = Boolean(process.env.TEST_SUNUCU_GORUNUR);

      if (!basariliMi || gorunurKosuMu) {
        const ekranGoruntusu = await page.screenshot({ fullPage: true }).catch(() => undefined);
        if (ekranGoruntusu) {
          await testInfo.attach(
            basariliMi ? '✅ BAŞARILI - Son Ekran Görüntüsü' : '❌ HATA ANI - Ekran Görüntüsü',
            { body: ekranGoruntusu, contentType: 'image/png' }
          );
        }
      }

      if (!basariliMi) {
        const hataMesajiHam = testInfo.error?.message ?? 'Hata mesajı okunamadı, trace/video dosyalarına bakınız.';
        // ANSI renk kodlarını temizle, rapor düz metin olarak göstersin.
        const hataMesaji = hataMesajiHam.replace(/\x1b\[[0-9;]*m/g, '');
        await testInfo.attach('❌ HATA ANI - Açıklama', {
          body: hataMesaji,
          contentType: 'text/plain'
        });
      }
    },
    { auto: true }
  ],

  // Dashboard'daki ▷ ile tetiklenen koşularda, kullanıcı artık ayrı bir Chrome penceresi
  // GÖRMÜYOR (koşular headless çalışır — masaüstünde pencere açılıp dağılmasın diye).
  // Bunun yerine bu fixture, test sürerken (TEST_SUNUCU_CANLI_YOLU tanımlıysa —
  // test-sunucu.mjs bunu her koşuya özel, geçici bir dosya yolu olarak set eder) SANİYEDE
  // BİR sayfanın ekran görüntüsünü o dosyaya yazar; test-sunucu.mjs'in /canli ucu bu
  // dosyayı okuyup dashboard'daki "canlı koşu paneli"ne servis eder — kullanıcı bir
  // pencere açılmadan, panelin içinden test "canlı" ilerlerken izleyebilir.
  canliIzlemeYayini: [
    async ({ page }, use) => {
      const canliYolu = process.env.TEST_SUNUCU_CANLI_YOLU;
      if (!canliYolu) {
        await use();
        return;
      }

      const araVer = setInterval(() => {
        page
          .screenshot()
          .then((tamponVerisi) => {
            try {
              // Yarım yazılmış bir dosya okunmasın diye geçici bir dosyaya yazıp
              // ardından asıl isme "rename" ediyoruz (atomik değişim).
              const gecici = `${canliYolu}.tmp`;
              writeFileSync(gecici, tamponVerisi);
              renameSync(gecici, canliYolu);
            } catch {
              // Sayfa geçiş/kapanış anındaysa yazım başarısız olabilir — sorun değil,
              // bir sonraki tikte tekrar denenir.
            }
          })
          .catch(() => {
            // page.screenshot() navigasyon sırasında reddedebilir — yok sayılır.
          });
      }, 1000);

      await use();
      clearInterval(araVer);
    },
    { auto: true }
  ]
});

export { expect } from '@playwright/test';
