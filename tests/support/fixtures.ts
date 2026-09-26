// Model spec'inin import ettiği ortak `test` nesnesi.
// Platform raporlayıcısının (scripts/platform/raporlayici.mjs) okuduğu bilgileri Playwright
// ANNOTATION'ları olarak ekleyen otomatik (auto) fixture'lar:
//  1) kosuEtiketleri: koşu kimliği/türü/kapsamı — sonuçlar veritabanında koşulara bunlarla bağlanır
//     (senaryo kimliğini model spec'i kendisi ekler).
//  2) hataYakalayici: Test başarısız olduğunda (ve dashboard koşularında her zaman) son ekran
//     görüntüsünü ek olarak ekler; raporlayıcı bunu ŞİFRELİ medya deposuna taşır.
// Senaryo dosyaları `test`'i '@playwright/test' yerine buradan import etmelidir.
import { test as base } from '@playwright/test';
import { writeFileSync, renameSync } from 'node:fs';
import { ekranGoruntusuAl } from './screenshots';

type OrtakFixturelar = {
  kosuEtiketleri: void;
  hataYakalayici: void;
  canliIzlemeYayini: void;
};

export const test = base.extend<OrtakFixturelar>({
  kosuEtiketleri: [
    async ({}, use, testInfo) => {
      const ekle = (type: string, description: string): void => { testInfo.annotations.push({ type, description }); };
      // Koşu gruplama (bkz. global-setup.ts > KOSU_KIMLIGI): aynı "playwright test" çağrısındaki
      // tüm sonuçlar aynı kosuKimligi'ni taşır. kosuTuru: platformdaki ▷ ile tetiklenen tekil
      // koşular (TEST_SUNUCU_GORUNUR=1) 'tekil', normal npm run test / CI koşuları 'tam' — Sonuçlar
      // ekranındaki kartlar ve "önceki koşu" karşılaştırması yalnızca 'tam' koşulara bakar.
      const kosuKimligi = process.env.KOSU_KIMLIGI;
      if (kosuKimligi) ekle('kosuKimligi', kosuKimligi);
      // Platformdaki "Koşuyu başlat" her senaryoyu ayrı süreçte koşsa da tam koşu sayılır:
      // test-sunucu bu durumda ortak KOSU_KIMLIGI ve TEST_SUNUCU_KOSU_TURU=tam verir.
      const dashboardKosusuMu = process.env.TEST_SUNUCU_GORUNUR === '1';
      const tamKosuMu = !dashboardKosusuMu || process.env.TEST_SUNUCU_KOSU_TURU === 'tam';
      ekle('kosuTuru', tamKosuMu ? 'tam' : 'tekil');
      // kosuKapsami (yalnızca 'tam' koşularda): bir ürün seçiliyken başlatılan "Koşuyu başlat" o
      // ürünün adını taşır; Genel görünümden başlatılanlar ve terminal/CI koşuları 'Genel'dir.
      // Sonuçlar ekranı Genel trendini yalnızca 'Genel' kapsamlı koşulardan çizer.
      if (tamKosuMu) ekle('kosuKapsami', dashboardKosusuMu ? process.env.TEST_SUNUCU_KOSU_KAPSAMI || 'Genel' : 'Genel');
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

      // Hata mesajı ayrıca ek olarak EKLENMEZ: raporlayıcı testin hatasını doğrudan sonuç
      // satırına (veritabanında) yazar.
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

      // Bir önceki yakalama bitmediyse bu tik atlanır; yakalamalar adım görüntüleriyle aynı sırada ve süre sınırlıdır
      // (screenshots.ts > ekranGoruntusuAl — üst üste binen yakalamalar koşuyu takıyordu).
      let calisiyor = false;
      const araVer = setInterval(() => {
        if (calisiyor) return;
        calisiyor = true;
        ekranGoruntusuAl(page, { fullPage: false, sureMs: 5_000 })
          .then((tamponVerisi) => {
            if (!tamponVerisi) return;
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
            // Yakalama navigasyon sırasında reddedebilir — yok sayılır.
          })
          .finally(() => { calisiyor = false; });
      }, 1000);

      await use();
      clearInterval(araVer);
    },
    { auto: true }
  ]
});

export { expect } from '@playwright/test';
