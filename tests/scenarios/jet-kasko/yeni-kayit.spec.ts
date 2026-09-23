// JetKasko "YK" (Yeni Kayıt / tescilsiz araç) senaryoları.
// Plaka alanına "YK" yazılınca ekran tescilsiz/yeni araç moduna geçer (isPlateYK()):
// Tescil Belge Seri No sorgusu yerine araç bilgileri marka kodu sorgusuyla elle girilir.
// jet-kasko-yk.json > senaryolar altında her araç (Özel Otomobil / Kamyon) için 6 senaryo
// tanımlıdır: Sigortalı Tipi (Özel/Tüzel) × Sigorta Ettiren (Kendisi/Farklı Kişi Özel/
// Farklı Kişi Tüzel) kombinasyonu, toplam 12 senaryo.
// Sigortalı Tipi Tüzel seçildiğinde Doğum Tarihi alanı gizlenir ve kimlik no Vergi Kimlik
// No olarak kullanılır. "Yetkili İndirimi %" alanı bazı acentelerde kapalı geliyor; hangi
// acentede açık olduğu ve girilecek yüzde ortak.json > kullaniciDegistir altındaki acente
// profiline (örn. "JetKaskoYetkiliİndirimli") tanımlanır, alan kapalıysa POM atlar. Ödeme
// adımında "Hiçbir poliçe onaylanamadı." (ve datada tanımlı
// diğer kabul edilen sonuçlar) başarı olarak kabul edilir; test kartıyla gerçek poliçe
// kesilmemesi beklenen davranıştır.
import { test } from '../../support/fixtures';
import { getEnvironmentName, hasCredentials } from '../../support/environments';
import { testBaslangiciniHazirla } from '../../support/flows/test-baslangici';
import { JetKaskoPage } from '../../support/pages/jet-kasko.page';
import { KrediKartiOdemePage } from '../../support/pages/kredi-karti-odeme.page';
import { attachStepScreenshot } from '../../support/screenshots';
import { loadJetKaskoYkData, loadOrtakData } from '../../support/test-data';

const environment = getEnvironmentName();
const ortakData = loadOrtakData(environment);
const urunData = loadJetKaskoYkData(environment).jetKaskoYk;

test.skip(!hasCredentials(environment), `${environment.toUpperCase()} kullanıcı bilgileri eksik.`);
test.skip(!urunData.aktif, `${environment.toUpperCase()} JetKasko YK datası aktif değil.`);

for (const senaryo of urunData.senaryolar) {
  test(senaryo.baslik, async ({ page }, testInfo) => {
    // TEST ortamındaki araç/marka sorgu servisleri zaman zaman geç yanıtlıyor.
    test.setTimeout(180_000);

    // Giriş yapılır ve senaryonun acente profili (belirtilmemişse "varsayilan") seçilir.
    await testBaslangiciniHazirla({
      page,
      testInfo,
      environment,
      ortakData,
      acenteProfili: senaryo.acenteProfili
    });

    const jetKasko = new JetKaskoPage(page);
    const arac = urunData.araclar[senaryo.arac];
    const sigortali =
      senaryo.sigortaliTipi === 'ozel'
        ? ortakData.kimlikBilgileri.ozel[senaryo.sigortaliProfili]
        : ortakData.kimlikBilgileri.tuzel[senaryo.sigortaliProfili];

    // Ekran açılışı sabit/değişmeyen bir aksiyon olduğu için ayrı bir adım (test.step)
    // olarak raporlanmıyor — dashboard'daki "adım bazlı başarı" tablosunda gürültü
    // yaratmasın diye. Ekran görüntüsü yine de eklenir.
    await jetKasko.ac();
    await attachStepScreenshot(page, testInfo, '03 - Jet Kasko ekranı');

    // 1) Sigortalı bilgileri ve plaka bilgileri girilerek search yapılması.
    // Sigortalı Tipi'ne (Özel/Tüzel) göre adım adı değişir; böylece dashboard'da hangi
    // sigortalı tipinde sorun yoğunlaştığı ayrı satırlarda görülebilir.
    const sigortaliStepAdi =
      senaryo.sigortaliTipi === 'ozel'
        ? 'Özel sigortalı ve plaka bilgileri girilir'
        : 'Tüzel sigortalı ve plaka bilgileri girilir';

    await test.step(sigortaliStepAdi, async () => {
      const kimlikNo =
        senaryo.sigortaliTipi === 'ozel'
          ? (sigortali as (typeof ortakData.kimlikBilgileri.ozel)[string]).tcKimlikNo
          : (sigortali as (typeof ortakData.kimlikBilgileri.tuzel)[string]).vergiKimlikNo;
      const dogumTarihi =
        senaryo.sigortaliTipi === 'ozel'
          ? (sigortali as (typeof ortakData.kimlikBilgileri.ozel)[string]).dogumTarihi
          : undefined;

      // Sigortalı Tipi (Özel/Tüzel) ve kimlik bilgisi girilir; Özel ise ayrıca doğum
      // tarihi girilir, Tüzel ise Doğum Tarihi alanı ekranda hiç gösterilmez.
      await jetKasko.sigortaliTipiVeKimlikGirYk(senaryo.sigortaliTipi, kimlikNo, dogumTarihi);
      await attachStepScreenshot(page, testInfo, '04 - Sigortalı Tipi ve kimlik bilgileri');

      // Cep telefonu ve plaka ("YK") girilip yeşil Sorgula butonuna tıklanır; bu, ekranı
      // tescilsiz/yeni araç moduna geçirir ve Araç Bilgileri alanlarını açar.
      await jetKasko.telefonVePlakaGirYk(arac.plakaIlKodu, arac.plakaNo, sigortali.cepTelefonu);
      await jetKasko.sigortaliSorgulaYk();
      await attachStepScreenshot(page, testInfo, '05 - Telefon, plaka ve sigortalı sorgusu');
    });

    // 2) Sigorta ettiren ve araç bilgileri girilir. Sigorta Ettiren'e (kendisi / farklı
    // özel / farklı tüzel) göre adım adı değişir — yetkili indirimi de bu adıma dahil,
    // çünkü aynı ekran akışının küçük, opsiyonel bir parçası.
    const ettirenStepAdi =
      senaryo.ettiren === 'ayni'
        ? 'Sigorta ettiren kendisi ve araç bilgisi girişi'
        : senaryo.ettiren === 'farkliOzel'
          ? 'Sigorta ettiren farklı özel ve araç bilgisi girişi'
          : 'Sigorta ettiren farklı tüzel ve araç bilgisi girişi';

    await test.step(ettirenStepAdi, async () => {
      // Sigorta Ettiren: kendisi / farklı kişi (özel-T.C.) / farklı kurum (tüzel-VKN).
      if (senaryo.ettiren === 'ayni') {
        await jetKasko.ettirenAyniSecYk();
      } else if (senaryo.ettiren === 'farkliOzel') {
        await jetKasko.farkliOzelEttirenGirYk(ortakData.kimlikBilgileri.ozel[senaryo.ettirenProfili!]);
      } else {
        await jetKasko.farkliTuzelEttirenGirYk(ortakData.kimlikBilgileri.tuzel[senaryo.ettirenProfili!]);
      }
      await attachStepScreenshot(page, testInfo, '06 - Sigorta ettiren bilgileri');

      // Yeni (tescilsiz) araç bilgileri girilir: Model Yılı, Marka Kodu sorgusu, Motor
      // No, Şasi No, Tescil Tarihi (senaryonun çalıştırıldığı gün) ve Araç Tipi/Sınıf/
      // Kullanım.
      await jetKasko.yeniAracBilgileriniGirYk(arac);
      await attachStepScreenshot(page, testInfo, '07 - Araç bilgileri');

      // "Yetkili İndirimi %" değeri senaryonun acente profiline (ortak.json >
      // kullaniciDegistir[...].yetkiliIndirimi) bağlıdır; alan ekranda kapalıysa POM
      // otomatik atlar, profilde değer yoksa da hiçbir şey yapılmaz.
      const acenteProfili = senaryo.acenteProfili ?? 'varsayilan';
      const acente = ortakData.kullaniciDegistir[acenteProfili];
      await jetKasko.yetkiliIndirimGirYk(acente.yetkiliIndirimi);
    });

    // 3) Prim hesaplama
    await test.step('Prim hesaplanır', async () => {
      await jetKasko.primHesaplaYk();
      await attachStepScreenshot(page, testInfo, '08 - Prim hesaplama sonucu');
    });

    // 4) Ürün Seçimi
    await test.step('Ürün seçimi', async () => {
      await jetKasko.urunSecYk(senaryo.urunAdi);
    });

    const odeme = new KrediKartiOdemePage(page);

    // 5) Poliçeleştirme süreci başlatılması
    await test.step('Poliçeleştirme süreci başlatılması', async () => {
      await odeme.policelestirVeKrediKartiFormunuAc();
    });

    // 6) Kart bilgileri girişi
    await test.step('Kart bilgileri girişi', async () => {
      await odeme.kartBilgileriniGir(ortakData.odeme.krediKarti);
      await attachStepScreenshot(page, testInfo, '09 - Kart formu');
    });

    // 7) Ödeme gönderilir ve sonuç doğrulanır: datada tanımlı kabul edilen
    // sonuçlardan biri ("Hiçbir poliçe onaylanamadı." vb.) başarı olarak kabul edilir.
    await test.step('Ödeme gönderilir ve sonuç doğrulanır', async () => {
      await odeme.odemeyiTamamlaVeBeklenenHatayiDogrula(urunData.kabulEdilenOdemeSonuclari);
      await attachStepScreenshot(page, testInfo, '10 - Ödeme sonucu');
    });
  });
}
