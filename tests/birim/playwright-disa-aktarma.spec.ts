// PLAYWRIGHT KODUNA DIŞA AKTARMA — saf üretici (scripts/platform/senaryolar/playwright-disa-aktarma.mjs). Tarayıcı / ağ yok:
// üretilen metin incelenir ve TypeScript derleyicisiyle (geçici tsconfig, strict) tip denetiminden geçirilir. Değerler SAHTEDİR.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { disaAktarmaDosyaAdi, ortamDegiskeniParcasi, playwrightKoduUret, type DisaAktarmaGirdisi } from '../../scripts/platform/senaryolar/playwright-disa-aktarma.mjs';
import type { ModelKosuPlani, PlanAdimi, PlanAlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import type { GirisTarifi } from '../../scripts/platform/giris/tarif.mjs';

const KOK = resolve(__dirname, '..', '..');

const alan = (id: string, tip: string, deger: unknown, ek: Partial<PlanAlani> = {}): PlanAlani => ({
  id, etiket: id, anahtar: id, tip, doldurucu: null, deger, secici: `#${id}`, yardimci: {}, secenekler: [], parametreler: {}, mutlakaGorunmeli: false, atla: null, ...ek
});
const adim = (id: string, alanlar: PlanAlani[], ek: Partial<PlanAdimi> = {}): PlanAdimi => ({
  id, baslik: `Adım ${id}`, sira: 1, dahil: true, alanlar, kosu: null, sonAdim: false, ...ek
});

/** Her doldurma türünü içeren plan (gizli / kişisel / tablo gizli değerli alanlar dahil). */
function genisPlan(): ModelKosuPlani {
  return {
    ekranUrl: '/form/',
    baglamProfili: 'Birinci',
    beklenen: { tur: 'basari' },
    hatalar: [],
    adimlar: [
      adim('bilgi', [
        alan('urun', 'secim', 'B', { secenekler: [{ deger: 'A', metin: 'Birinci ürün' }, { deger: 'B', metin: 'İkinci ürün', senaryoDegeri: 'B' }], doldurucu: 'secimGerekirse' }),
        alan('adSoyad', 'metin', 'Örnek Kişi Adı'),
        alan('musteriParolasi', 'metin', 'GIZLI-PAROLA-DEGERI', { doldurucu: 'tuslayarakYaz' }),
        alan('hesapNo', 'metin', 'HASSAS-HESAP-DEGERI'),
        alan('kimlikNo', 'metin', 'KISISEL-KIMLIK-DEGERI', { anahtar: 'kisi.kimlikNo', etiket: 'Kişi — Kimlik no' }),
        alan('tabloDegeri', 'metin', 'TABLO-GIZLI-DEGERI'),
        alan('telefon', 'telefon', '5321112233', { doldurucu: 'telefonTuslama', parametreler: { maske: '(###) ### ## ##', tus: 'Tab', bekle: { secici: '#ad', durum: 'dolu', icermez: 'Aranıyor' } } }),
        alan('kapsam', 'okluSecim', 'UC', { doldurucu: 'okluSecim', yardimci: { ileri: '#ileri', geri: '#geri' }, secenekler: [{ deger: 'UC', metin: 'Üçüncü' }], parametreler: { maksDeneme: 4, yanitBekle: '/liste' } }),
        alan('odeme', 'radyo', 'taksit', { secici: 'input[name="odeme"]', doldurucu: 'radyoZorla', secenekler: [{ deger: 'taksit', metin: 'Taksitli' }] }),
        alan('onay', 'onayKutusu', true, { doldurucu: 'onayKutusuZorla' }),
        alan('kampanya', 'onayKutusu', 'false'),
        alan('baslangic', 'tarih', '2026-10-01', { doldurucu: 'tarihJs' }),
        alan('bitis', 'tarih', '02.10.2026'),
        alan('ozelListe', 'secim', 'X', { doldurucu: 'degerJs', secenekler: [{ deger: 'X', metin: 'İks' }] }),
        alan('belge', 'dosya', 'ornek.txt'),
        alan('ekBelge', 'dosya', 'nobetci-dosya://12345678-1234-1234-1234-123456789012/sifreli.txt'),
        alan('eksik', 'metin', 'x', { atla: 'alanın konumu (seçicisi) modelde yok', secici: null }),
        alan('zorunluGoster', 'metin', null, { mutlakaGorunmeli: true, yalnizGorunurluk: true })
      ], {
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: '#hesapla', aciklama: 'Hesapla' }, { tur: 'bekle', sureSn: 1 }, { tur: 'bekle', secici: '#sonuc', durum: 'dolu' }, { tur: 'bekle', secici: '#yukleniyor', durum: 'gizli' }],
          basariGostergesi: { tur: 'veya', secenekler: [{ tur: 'metin', deger: 'Toplam', secici: '#sonuc' }, { tur: 'desen', deger: '[1-9]', secici: '#tutar' }] },
          hataGostergesi: { secici: '#uyari' },
          uyarilar: [{ metin: 'Kabul edilen uyarı metni' }],
          zamanAsimiSn: 12
        }
      }),
      adim('sql', [], { sql: { veritabaniId: 'vt1', sql: 'SELECT durum\nFROM kayitlar WHERE no = ${akis:No}', beklenen: { tur: 'sutunDegeri', sutun: 'durum', deger: 'TAMAM' }, okumalar: [{ ad: 'No', sutun: 'no' }] } }),
      // İndirilen dosyayı doğrulama (dosya-icerigi dalı): beklentilerden biri gizli tablo değeri taşır (maskelenmeli).
      adim('dosya', [], {
        dosya: {
          bicim: 'csv', zamanAsimiSn: 15, tetikleyici: { secici: '#indir', aciklama: 'Listeyi indir' },
          beklentiler: [
            { tur: 'adDeseni', deger: 'liste-*.csv' }, { tur: 'sutunVar', deger: 'Durum' }, { tur: 'icerir', deger: 'TABLO-GIZLI-DEGERI' },
            { tur: 'hucre', sutun: 'Durum', deger: 'TAMAM', satir: { tur: 'kosul', sutun: 'No', deger: '${Siparis.No}' } }
          ]
        }
      }),
      adim('yeniden', [], { yenidenGiris: { profil: 'İkinci kullanıcı' } }),
      adim('son', [alan('not', 'metin', 'son not')], { kosu: { basariGostergesi: { tur: 'eleman', deger: '#tamam' } }, sonAdim: true }),
      adim('disarida', [alan('hic', 'metin', 'koşulmaz')], { dahil: false })
    ]
  };
}

function tarif(): GirisTarifi {
  return {
    surum: 1, girisAdresi: '/giris', oturumKontrolAdresi: '/panel', kullaniciAlani: '#kullanici', parolaAlani: '#parola', gonderDugmesi: '#gir',
    basariGostergesi: { tur: 'metin', deger: 'Hoş geldiniz' }, hataGostergeleri: [{ tur: 'metin', deger: 'Hatalı' }],
    ikinciAdim: { tur: 'totp', kodAlani: '#kod', gonderDugmesi: '#dogrula', smsKipi: null, hataGostergeleri: [], elleBeklemeSn: 180 },
    zamanAsimiSn: 20,
    girisAdimlari: [{ islem: 'kullaniciAdi' }, { islem: 'doldur', hedef: { secici: '#kurum' }, deger: '{kurumKodu}' }, { islem: 'parola' }, { islem: 'gonder' }],
    baglamDegistirme: {
      baglamTuru: 'Birim',
      adimlar: [
        { islem: 'git', adres: '/birim' },
        { islem: 'sec', hedef: { secici: '#birim' }, deger: '{birimKodu}' },
        { islem: 'tikla', hedef: { secici: '#uygula' }, adresBekle: '/panel' },
        { islem: 'metinBekle', hedef: { secici: '#aktif' }, metin: 'Birim: {birimKodu}' },
        { islem: 'doldur', hedef: { rol: 'textbox', ad: 'Birim şifresi' }, deger: '{birimSifresi}' }
      ]
    }
  };
}

function girdi(ek: Partial<DisaAktarmaGirdisi> = {}): DisaAktarmaGirdisi {
  return {
    plan: genisPlan(),
    kaynak: { ekran: 'Örnek Form', senaryo: 'Geniş / örnek senaryo', modelSurumu: 7, ortam: 'TEST', uretim: '2026-09-28T10:00:00.000Z' },
    tabanUrl: 'http://127.0.0.1:9',
    girisGerekli: true,
    girisProfili: null,
    tarif: tarif(),
    baglam: { profil: 'Birinci', degerler: { birimKodu: 'B01', birimSifresi: 'BAGLAM-GIZLI-DEGERI' } },
    gizlilik: { hassasAnahtarlar: ['hesapNo'], gizliDegerler: ['TABLO-GIZLI-DEGERI'], kisiselAlanIdleri: ['kimlikNo'], ekGizliAdlar: [] },
    ...ek
  };
}

test('gizli / kişisel değerler dosyada yok: ortam değişkenine çevrilir ve başta listelenir; diğerleri düz yazılır', () => {
  const r = playwrightKoduUret(girdi());
  for (const gizli of ['GIZLI-PAROLA-DEGERI', 'HASSAS-HESAP-DEGERI', 'KISISEL-KIMLIK-DEGERI', 'TABLO-GIZLI-DEGERI', 'BAGLAM-GIZLI-DEGERI']) expect(r.icerik).not.toContain(gizli);
  const adlar = r.ortamDegiskenleri.map((d) => d.ad);
  expect(adlar).toEqual(expect.arrayContaining([
    'NOBETCI_KULLANICI_ADI', 'NOBETCI_PAROLA', 'NOBETCI_TOTP_ANAHTARI', 'NOBETCI_GIRIS_KURUM_KODU',
    'NOBETCI_MUSTERI_PAROLASI', 'NOBETCI_HESAP_NO', 'NOBETCI_KISI_KIMLIK_NO', 'NOBETCI_TABLO_DEGERI', 'NOBETCI_BAGLAM_BIRIM_SIFRESI',
    'NOBETCI_DOSYA_EK_BELGE', 'NOBETCI_IKINCI_KULLANICI_KULLANICI_ADI', 'NOBETCI_IKINCI_KULLANICI_PAROLA'
  ]));
  for (const ad of adlar) expect(r.icerik, ad).toContain(`//   ${ad}=`);
  expect(r.icerik).toContain('await l.pressSequentially(ortamDegeri("NOBETCI_MUSTERI_PAROLASI"), { delay: 25 });');
  expect(r.icerik).toContain('await l.fill(ortamDegeri("NOBETCI_KISI_KIMLIK_NO"));');
  // Gizli olmayanlar düz: ad, maskeli telefon, bağlam kodu.
  expect(r.icerik).toContain('await l.fill("Örnek Kişi Adı");');
  expect(r.icerik).toContain('await l.pressSequentially("(532) 111 22 33", { delay: 25 });');
  expect(r.icerik).toContain('selectOption(`B01`)');
  // Kaynak ve uyarı notu.
  expect(r.icerik).toMatch(/^\/\/ Nöbetçi'den dışa aktarılan Playwright testi\.\n\/\/   Ekran: Örnek Form\n\/\/   Senaryo: Geniş \/ örnek senaryo\n\/\/   Model sürümü: 7\n\/\/   Ortam: TEST\n\/\/   Üretim zamanı: 2026-09-28T10:00:00.000Z/);
  expect(r.icerik).toContain('Bu dosya Nöbetçi DIŞINDADIR');
  expect(r.icerik).toContain("import { test, expect, type FrameLocator, type Locator, type Page, type Request } from '@playwright/test';");
  expect(r.dosyaAdi).toBe('genis-ornek-senaryo.spec.ts');
});

test('ek gizli adlar (Ayarlar > Maskeleme) da ortam değişkenine çevrilir', () => {
  const r = playwrightKoduUret(girdi({ gizlilik: { ekGizliAdlar: ['adSoyad'] } }));
  expect(r.icerik).not.toContain('Örnek Kişi Adı');
  expect(r.icerik).toContain('await l.fill(ortamDegeri("NOBETCI_AD_SOYAD"));');
});

test('giriş adımları tariften: kullanıcı adı / ek alan / parola / gönder, TOTP yardımcısı (node:crypto), başarı göstergesi; bağlam ve yeniden giriş', () => {
  const r = playwrightKoduUret(girdi());
  expect(r.icerik).toContain("import { createHmac } from 'node:crypto';");
  expect(r.icerik).toContain('function totpKodu(anahtar: string');
  const giris = r.icerik.slice(r.icerik.indexOf('async function girisYap'), r.icerik.indexOf('async function baglamiDegistir'));
  expect(giris.split('\n').filter((x) => x.trim().startsWith('await')).map((x) => x.trim())).toEqual([
    'await page.goto("/giris", { waitUntil: \'domcontentloaded\' });',
    'await page.locator("#kullanici").first().fill(ortamDegeri(`${on}KULLANICI_ADI`));',
    'await page.locator("#kurum").first().fill(`${ortamDegeri(`${on}GIRIS_KURUM_KODU`)}`);',
    'await page.locator("#parola").first().fill(ortamDegeri(`${on}PAROLA`));',
    'await page.locator("#gir").first().click();',
    "await kodAlani.waitFor({ state: 'visible', timeout: 20000 });",
    'await kodAlani.fill(totpKodu(ortamDegeri(`${on}TOTP_ANAHTARI`)));',
    'await page.locator("#dogrula").first().click();',
    'await expect(page.getByText("Hoş geldiniz", { exact: true }).first()).toBeVisible({ timeout: 20000 });'
  ]);
  expect(r.icerik).toContain("await test.step('Sisteme giriş yapılır', async () => {\n    await girisYap(page);");
  expect(r.icerik).toContain('await test.step("Bağlam değiştirilir (Birinci)", async () => {');
  expect(r.icerik).toContain('await Promise.all([page.waitForURL(new RegExp("/panel")), page.locator("#uygula").first().click()]);');
  expect(r.icerik).toContain('await expect(page.locator("#aktif").first()).toContainText(`Birim: B01`);');
  expect(r.icerik).toContain('await girisYap(page, "NOBETCI_IKINCI_KULLANICI_");');
  // Girişsiz senaryoda giriş / bağlam / TOTP yok.
  const girissiz = playwrightKoduUret(girdi({ girisGerekli: false, plan: { ...genisPlan(), adimlar: genisPlan().adimlar.filter((a) => !a.yenidenGiris) } }));
  expect(girissiz.icerik).not.toContain('girisYap');
  expect(girissiz.icerik).not.toContain('baglamiDegistir');
  expect(girissiz.icerik).not.toContain('createHmac');
  expect(girissiz.ortamDegiskenleri.map((d) => d.ad)).not.toContain('NOBETCI_PAROLA');
});

test('alan türleri koşucunun eylemleriyle: seçim (value → label), oklu seçim yardımcısı, zorla radyo / onay, tarih betiği, dosya, alan sonrası', () => {
  const r = playwrightKoduUret(girdi());
  expect(r.icerik).toContain('await secimYap(page, l, "B", "İkinci ürün", true);');
  expect(r.icerik).toContain('async function okluSec(page: Page, gosterge: Locator, yonler: string[], hedefMetin: string');
  expect(r.icerik).toContain('await okluSec(page, l, ["#ileri", "#geri"], "Üçüncü", 4, "/liste");');
  expect(r.icerik).toContain('await zorlaIsaretle(page.locator("input[name=\\"odeme\\"]").and(page.locator("[value=\\"taksit\\"]")).first(), true);');
  expect(r.icerik).toContain('await zorlaIsaretle(l, true);');
  expect(r.icerik).toContain('await l.setChecked(false);');
  expect(r.icerik).toContain('}, "2026-10-01");');
  expect(r.icerik).toContain('await l.fill("02.10.2026");');
  expect(r.icerik).toContain('await degerJsIleYaz(l, "X", "İks");');
  expect(r.icerik).toContain('await l.setInputFiles(join(YUKLEME_KLASORU, "ornek.txt"));');
  expect(r.icerik).toContain('await l.setInputFiles(ortamDegeri("NOBETCI_DOSYA_EK_BELGE"));');
  expect(r.icerik).toContain('await l.press("Tab");');
  expect(r.icerik).toContain('await doluBekle(page, "#ad", 20000, "Aranıyor");');
  expect(r.icerik).toContain('await alan(page, "#ozelListe", "ozelListe", async (l) => {');
  expect(r.icerik).toContain('}, { zorla: true });');
  expect(r.icerik).toContain('// Atlanan alan: eksik — alanın konumu (seçicisi) modelde yok');
  expect(r.icerik).toContain('await alan(page, "#zorunluGoster", "zorunluGoster", null, { zorunlu: true });');
  // Aksiyonlar ve sonuç: "veya" yardımcısı, kabul edilen uyarı yorumu.
  // Aksiyon tıklaması güvenli tıklamayla (sakinlik + etkisiz tıklamanın bir kez tekrarı; koşucuyla aynı kural).
  expect(r.icerik).toContain('await guvenliTikla(page, page.locator("#hesapla").filter({ visible: true }).first(), 12000);');
  expect(r.icerik).toContain('async function guvenliTikla(page: Page, oge: Locator, zamanMs: number, basariVarMi?: () => Promise<boolean>): Promise<void> {');
  expect(r.icerik).toContain('await page.waitForTimeout(1000);');
  expect(r.icerik).toContain('await doluBekle(page, "#sonuc", 12000);');
  expect(r.icerik).toContain('await page.locator("#yukleniyor").first().waitFor({ state: \'hidden\', timeout: 12000 });');
  expect(r.icerik).toContain('//   - "Kabul edilen uyarı metni"');
  expect(r.icerik).toContain('await basariBekle(page, { adim: "Adım bilgi", basari: [{ tur: \'metin\', deger: "Toplam", secici: "#sonuc" }, { tur: \'desen\', deger: "[1-9]", secici: "#tutar" }], hataSecici: "#uyari", uyarilar: [{ metin: "Kabul edilen uyarı metni" }], sureMs: 12000 });');
  expect(r.icerik).toContain('await expect(page.locator("#tamam").filter({ visible: true }).first()).toBeVisible({ timeout: 30000 });');
  // Kapsam dışı adım koşulmaz.
  expect(r.icerik).not.toContain('koşulmaz"');
  // Oklu seçim yoksa yardımcısı da yazılmaz.
  const sade = playwrightKoduUret(girdi({ girisGerekli: false, plan: { ...genisPlan(), adimlar: [adim('tek', [alan('ad', 'metin', 'x')], { sonAdim: true })] } }));
  expect(sade.icerik).not.toContain('function okluSec');
  expect(sade.icerik).not.toContain('function basariBekle');
  // Açılır liste: alanlar bittikten sonra seçili değer istenen değilse bir kez yeniden seçilir (koşucuyla aynı); liste yoksa yardımcı yok.
  expect(r.icerik).toContain('async function yenidenSec(page: Page, secici: string, deger: string, metin: string, cerceve: string[] = [])');
  expect(r.icerik).toMatch(/await yenidenSec\(page, "[^"]+", "B", "İkinci ürün"\);/);
  expect(r.icerik.indexOf('await yenidenSec(')).toBeGreaterThan(r.icerik.indexOf('await secimYap(page, l, "B", "İkinci ürün", true);'));
  expect(sade.icerik).not.toContain('yenidenSec');
});

test('SQL adımı: "Nöbetçi\'de koşar" yorumu + açık TODO (test.skip yok); beklenen iş kuralı hatası yardımcısı', () => {
  const r = playwrightKoduUret(girdi());
  const sql = r.icerik.slice(r.icerik.indexOf('await test.step("Adım sql"'));
  expect(sql).toContain("// Nöbetçi'de koşar: SQL kontrolü");
  expect(sql).toContain('//   SELECT durum');
  expect(sql).toContain('//   FROM kayitlar WHERE no = ${akis:No}');
  expect(sql).toContain('// TODO: bu kontrol Nöbetçi dışında yok');
  expect(r.icerik).not.toContain('test.skip');
  const plan = genisPlan();
  plan.beklenen = { tur: 'hata', adim: 'bilgi', mesaj: 'Birinci uyarı', mesajlar: ['Birinci uyarı', 'İkinci uyarı'] };
  const h = playwrightKoduUret(girdi({ plan }));
  expect(h.icerik).toContain('await beklenenUyariyiBekle(page, { adim: "Adım bilgi", beklenenler: ["Birinci uyarı", "İkinci uyarı"], hataSecici: "#uyari", sureMs: 12000 });');
  expect(h.icerik).not.toContain('await basariBekle(page, { adim: "Adım bilgi"');
});

test('yeni adım türleri: dosya kontrolü indirmeyi bekler + beklentiler yorum ve TODO; bilerek boş alanlar başta listelenir', () => {
  const r = playwrightKoduUret(girdi({ bilerekBos: ['musteriNo', 'aciklama'] }));
  const dosya = r.icerik.slice(r.icerik.indexOf('await test.step("Adım dosya"'), r.icerik.indexOf('await test.step("Adım yeniden"'));
  expect(dosya).toContain("// Nöbetçi'de koşar: indirilen dosyayı doğrulama (csv)");
  expect(dosya).toContain("const indirme = page.waitForEvent('download', { timeout: 15000 });");
  expect(dosya).toContain('await page.locator("#indir").filter({ visible: true }).first().click();');
  expect(dosya).toContain('//   Beklenti: Dosya adı "liste-*.csv" desenine uyar');
  expect(dosya).toContain('//   Beklenti: "Durum" = "TAMAM" ("No" = "${Siparis.No}" olan satırda)');
  expect(dosya).toContain('// TODO: dosya içeriği doğrulaması Nöbetçi dışında yok');
  // Gizli tablo değeri beklentide de düz yazılmaz.
  expect(r.icerik).not.toContain('TABLO-GIZLI-DEGERI');
  expect(dosya).toContain('//   Beklenti: Metin içerir: "***"');
  expect(r.icerik).toContain('// Bilerek boş bırakılan alanlar (olumsuz senaryo; kod bu alanlara değer yazmaz): musteriNo, aciklama');
  expect(playwrightKoduUret(girdi()).icerik).not.toContain('Bilerek boş');
});

test('ortam değişkeni adları ve dosya adı ASCII; çakışan ad sayı eki alır', () => {
  expect(ortamDegiskeniParcasi('Müşteri şifresi')).toBe('MUSTERI_SIFRESI');
  expect(ortamDegiskeniParcasi('kisi.tcKimlikNo')).toBe('KISI_TC_KIMLIK_NO');
  expect(disaAktarmaDosyaAdi('Çok / özel: başlık!')).toBe('cok-ozel-baslik.spec.ts');
  const plan = genisPlan();
  plan.adimlar = [adim('a', [alan('parola', 'metin', 'P1-GIZLI', { anahtar: 'parola' })], { sonAdim: true })];
  const r = playwrightKoduUret(girdi({ plan }));
  expect(r.icerik).toContain('ortamDegeri("NOBETCI_PAROLA_2")'); // giriş parolası NOBETCI_PAROLA
  expect(r.icerik).not.toContain('P1-GIZLI');
});

test('üretilen dosya TypeScript (strict) tip denetiminden geçer', () => {
  test.setTimeout(120_000);
  const klasor = join(KOK, 'test-results', `disa-aktarma-birim-${randomBytes(4).toString('hex')}`);
  mkdirSync(klasor, { recursive: true });
  try {
    const dosyalar: string[] = [];
    const plan = genisPlan();
    plan.beklenen = { tur: 'hata', adim: 'son', mesaj: 'Uyarı', mesajlar: ['Uyarı'] };
    for (const [i, g] of [girdi(), girdi({ girisGerekli: false, tarif: null, baglam: null }), girdi({ plan, canli: true })].entries()) {
      const ad = `uretilen-${i}.spec.ts`;
      writeFileSync(join(klasor, ad), playwrightKoduUret(g).icerik);
      dosyalar.push(ad);
    }
    const denetle = (liste: string[]): string => {
      writeFileSync(join(klasor, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true, types: ['node'], typeRoots: [join(KOK, 'node_modules', '@types')] },
        files: liste
      }));
      try {
        execFileSync(process.execPath, [join(KOK, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(klasor, 'tsconfig.json')], { encoding: 'utf8', stdio: 'pipe' });
        return '';
      } catch (e) {
        return `${String((e as { stdout?: string }).stdout ?? '')}${String((e as { stderr?: string }).stderr ?? '')}` || String(e);
      }
    };
    expect(denetle(dosyalar)).toBe('');
    // Denetimin gerçekten çalıştığının kanıtı: bozuk bir satır eklenince hata verir.
    writeFileSync(join(klasor, 'bozuk.spec.ts'), `${playwrightKoduUret(girdi()).icerik}\nconst sayi: number = 'metin';\n`);
    expect(denetle(['bozuk.spec.ts'])).toContain("Type 'string' is not assignable to type 'number'");
  } finally {
    rmSync(klasor, { recursive: true, force: true });
  }
});
