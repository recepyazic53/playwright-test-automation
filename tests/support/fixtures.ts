// Bütün senaryo dosyalarının import ettiği ortak `test` nesnesi.
// Platform raporlayıcısının (scripts/platform/raporlayici.mjs) okuduğu bilgileri Playwright
// ANNOTATION'ları olarak ekleyen otomatik (auto) fixture'lar:
//  1) kosuEtiketleri: ürün (urun), akış (ozellik), koşu kimliği/türü/kapsamı — sonuçlar
//     veritabanında koşulara ve ürünlere bunlarla bağlanır (eskiden Allure etiketleriydi).
//  2) hataYakalayici: Test başarısız olduğunda (ve dashboard koşularında her zaman) son ekran
//     görüntüsünü ek olarak ekler; raporlayıcı bunu ŞİFRELİ medya deposuna taşır.
// Senaryo dosyaları `test`'i '@playwright/test' yerine buradan import etmelidir.
import { test as base } from '@playwright/test';
import { writeFileSync, renameSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { getEnvironmentName } from './environments';
import { genelKosuMu } from './genel-veri';
import { platformSenaryoKimligi } from './platform-veri';

// Klasör adı -> ürün görünen adı (platformdaki ekran adıyla aynı; bkz. projeler/galaksi/aktarim.mjs > EKRAN_ADLARI).
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

// "klasör/dosya" -> akış (özellik) görünen adı.
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
  senaryoKimligi: void;
  kosuEtiketleri: void;
  hataYakalayici: void;
  canliIzlemeYayini: void;
};

export const test = base.extend<OrtakFixturelar>({
  // Veri platform veritabanından geliyorsa testin kalıcı senaryo kimliği (UUID) "senaryoId"
  // annotation'ı olarak eklenir. Başlıklar DEĞİŞMEZ (geçmiş ve kosu-listesi anahtarları
  // "<dosya>::<başlık>" aynen çalışır); veri dosyalardan geliyorsa hiçbir şey eklenmez.
  senaryoKimligi: [
    async ({}, use, testInfo) => {
      // Genel yol (elle oluşturulan proje; playwright.model.config.ts): aktarılmış proje verisi yoktur; model testleri
      // "senaryoId" annotation'ını kendileri ekler (tests/model-kosucu/model-senaryolari.spec.ts).
      if (genelKosuMu()) {
        await use();
        return;
      }
      const dosya = relative(testInfo.project.testDir, testInfo.file).split(sep).join('/');
      const kimlik = platformSenaryoKimligi(getEnvironmentName(), `${dosya}::${testInfo.title}`);
      if (kimlik) testInfo.annotations.push({ type: 'senaryoId', description: kimlik });
      await use();
    },
    { auto: true }
  ],
  kosuEtiketleri: [
    async ({}, use, testInfo) => {
      const { epicAdi, featureAdi } = epicVeFeatureAdlariniBul(testInfo.file);
      const ekle = (type: string, description: string): void => { testInfo.annotations.push({ type, description }); };
      ekle('urun', epicAdi);
      ekle('ozellik', featureAdi);
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
