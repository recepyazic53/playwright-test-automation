// EŞDEĞERLİK (yerel fikstür) — Galaksi'nin ESKİ giriş + "Kullanıcı Değiştir" kodu (referans kopyası:
// tests/birim/fixtures/galaksi-referans/) ile YENİ genel giriş motoru + Galaksi giriş tarifi
// (projeler/galaksi/giris-tarifi.mjs) AYNI sahte Galaksi uygulamasında (giris-fikstur.ts > SahteGalaksi)
// çalıştırılır; sahte sunucunun gördüğü istek dizisi (parola/kod değerleri olmadan) ve son durum birebir
// karşılaştırılır. Galaksi taban adresi yerine SAHTE bir köken kullanılır ve tüm istekler route ile
// yakalanır: gerçek siteye (…nippon…) hiçbir istek gitmez — her testte doğrulanır.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { galaksiGirisTarifi } from '../../projeler/galaksi/giris-tarifi.mjs';
import { baglamiDegistir, girisYap, oturumGecerliMi, tarifiHazirla, GirisHatasi, type GirisKimligi } from '../support/giris-motoru';
import { totpKoduUret } from '../support/totp';
import { LoginPage } from './fixtures/galaksi-referans/login.page';
import { KullaniciDegistirPage } from './fixtures/galaksi-referans/kullanici-degistir.page';
import { SahteGalaksi, agTemizMi, korumaliBaglam, korumaliTarayici, type AgKaydi, type SahtePartaj } from './giris-fikstur';

/** Galaksi taban adresinin yerine geçen SAHTE köken (gerçek adres kullanılmaz). */
const GALAKSI = 'https://galaksi-test.ornek.invalid';
const TOTP_GIZLI = 'JBSWY3DPEHPK3PXP';
const KULLANICI = 'ornek.kullanici';
const PAROLA = 'Ornek-Parola-1';
const BASARI = 'Oturumu Kapat';
const PARTAJLAR: SahtePartaj[] = [
  { kod: '1001', ad: 'ORNEK ACENTE A', kullanicilar: ['ornek.kullanici1', 'ornek.kullanici2'] },
  { kod: '1002', ad: 'ORNEK ACENTE B', kullanicilar: ['ornek.b1'] }
];
const ACENTE = { acentePartaji: '1001', acentePartajiSecenegi: '1001 - ORNEK ACENTE A', acenteKullanicisi: 'ornek.kullanici2' };

let tarayici: Browser;
const acikBaglamlar: Array<{ baglam: BrowserContext; ag: AgKaydi }> = [];

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { tarayici = await korumaliTarayici(); });
test.afterAll(async () => { await tarayici?.close(); });
test.afterEach(async () => {
  for (const { baglam, ag } of acikBaglamlar.splice(0)) {
    await baglam.close();
    const { sirket, disari } = agTemizMi(ag, [GALAKSI]);
    expect(sirket, 'şirket alan adına istek olmamalı').toEqual([]);
    expect(disari, 'yakalanmayan dış istek olmamalı').toEqual([]);
    expect(ag.istekler.length, 'istekler yerel fikstüre gitmeli').toBeGreaterThan(0);
  }
});

async function sayfa(uygulama: SahteGalaksi, storageState?: string): Promise<Page> {
  const k = await korumaliBaglam(tarayici, { [GALAKSI]: uygulama.isle }, { baseURL: GALAKSI, storageState });
  acikBaglamlar.push(k);
  return k.baglam.newPage();
}

const kimlik = (totp: string | null): GirisKimligi => ({ kullaniciAdi: KULLANICI, parola: PAROLA, totpGizli: totp, sabitKod: null, smsKipi: null });

/** Eski akış: LoginPage.login + KullaniciDegistirPage (referans kopyası, değiştirilmemiş davranış). */
async function eskiAkis(page: Page, canli: boolean): Promise<void> {
  await new LoginPage(page, canli).login(
    { username: KULLANICI, password: PAROLA, authenticatorCode: canli ? totpKoduUret(TOTP_GIZLI) : undefined }, BASARI
  );
  await new KullaniciDegistirPage(page).acenteVeKullaniciDegistir(ACENTE);
}

/** Yeni akış: genel motor + Galaksi tarifi (aktarım adaptörünün ürettiği tarif). */
async function yeniAkis(page: Page, canli: boolean): Promise<void> {
  const tarif = tarifiHazirla(galaksiGirisTarifi({ ortamAnahtari: canli ? 'canli' : 'test', basariMetni: BASARI, ikiAsamaliTur: canli ? 'totp' : null }));
  await girisYap(page, tarif, kimlik(canli ? TOTP_GIZLI : null));
  await baglamiDegistir(page, tarif, ACENTE);
}

for (const canli of [false, true]) {
  const ad = canli ? 'CANLI (TOTP #Gauthcode)' : 'TEST (2FA yok)';
  test(`${ad}: giriş + acente/kullanıcı değiştirme — eski kod ile motor aynı istek dizisini üretir`, async () => {
    test.setTimeout(90_000);
    const eski = new SahteGalaksi({ kullanici: KULLANICI, parola: PAROLA, totpGizli: canli ? TOTP_GIZLI : null, partajlar: PARTAJLAR });
    const yeni = new SahteGalaksi({ kullanici: KULLANICI, parola: PAROLA, totpGizli: canli ? TOTP_GIZLI : null, partajlar: PARTAJLAR });
    const eskiSayfa = await sayfa(eski);
    await eskiAkis(eskiSayfa, canli);
    const yeniSayfa = await sayfa(yeni);
    await yeniAkis(yeniSayfa, canli);

    expect(yeni.olaylar).toEqual(eski.olaylar);
    // Beklenen dizi (açıkça): giriş → (CANLI: kod istenir → kodla tekrar) → ana sayfa → kullanıcı değiştir.
    expect(eski.olaylar).toEqual([
      'GET / (oturumsuz)',
      'POST DoLogin kullanici=dogru parola=dogru kod=yok',
      ...(canli ? ['POST DoLogin kullanici=dogru parola=dogru kod=dogru'] : []),
      'GET / (oturum)',
      'GET /kullanici-degistir',
      'GET /home/list-user/1001',
      'POST /kullanici-degistir kanal=1001 kullanici=ornek.kullanici2',
      'GET /kullanici-degistir-tamamlandi',
      'GET / (oturum)'
    ]);
    await expect(yeniSayfa.locator('#aktif-kullanici')).toHaveText('ornek.kullanici2');
    await expect(eskiSayfa.locator('#aktif-kullanici')).toHaveText('ornek.kullanici2');
  });
}

test('kayıtlı oturum: eski oturumGecerliMi ile motor aynı sonucu verir (form doldurulmaz)', async () => {
  const uygulama = new SahteGalaksi({ kullanici: KULLANICI, parola: PAROLA, partajlar: PARTAJLAR });
  const ilk = await sayfa(uygulama);
  const tarif = tarifiHazirla(galaksiGirisTarifi({ ortamAnahtari: 'test', basariMetni: BASARI }));
  await girisYap(ilk, tarif, kimlik(null));
  const durum = await ilk.context().storageState();
  const dosya = test.info().outputPath('oturum.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(dosya, JSON.stringify(durum));
  uygulama.olaylar.length = 0;
  expect(await new LoginPage(await sayfa(uygulama, dosya), false).oturumGecerliMi(BASARI)).toBe(true);
  const eskiOlaylar = [...uygulama.olaylar];
  uygulama.olaylar.length = 0;
  expect(await oturumGecerliMi(await sayfa(uygulama, dosya), tarif)).toBe(true);
  expect(uygulama.olaylar).toEqual(eskiOlaylar);
  expect(eskiOlaylar).toEqual(['GET / (oturum)']);
  // Oturum yoksa ikisi de false (motor: kısa bekleme).
  expect(await oturumGecerliMi(await sayfa(uygulama), tarif, 1500)).toBe(false);
});

test('yanlış parola: motor DoLogin hata penceresini görüp HEMEN "kullanıcı adı veya parola hatalı" der (eski kod 45 sn beklerdi)', async () => {
  const uygulama = new SahteGalaksi({ kullanici: KULLANICI, parola: PAROLA, partajlar: PARTAJLAR });
  const tarif = tarifiHazirla(galaksiGirisTarifi({ ortamAnahtari: 'test', basariMetni: BASARI }));
  const bas = Date.now();
  const hata = await girisYap(await sayfa(uygulama), tarif, { ...kimlik(null), parola: 'Yanlis-Parola' }).then(() => null, (h: unknown) => h);
  expect(hata).toBeInstanceOf(GirisHatasi);
  expect((hata as GirisHatasi).kod).toBe('KIMLIK_HATALI');
  expect((hata as GirisHatasi).message).toContain('"Kullanıcı veya şifrenizi hatalı yazdınız!"');
  expect((hata as GirisHatasi).message).not.toContain('Yanlis-Parola');
  expect(Date.now() - bas).toBeLessThan(10_000);
  expect(uygulama.olaylar).toEqual(['GET / (oturumsuz)', 'POST DoLogin kullanici=dogru parola=yanlis kod=yok']);
});

test('CANLI: yanlış TOTP anahtarı → iki aşamalı doğrulama hatası (anahtar/kod mesajda yok)', async () => {
  const uygulama = new SahteGalaksi({ kullanici: KULLANICI, parola: PAROLA, totpGizli: TOTP_GIZLI, partajlar: PARTAJLAR });
  const tarif = tarifiHazirla(galaksiGirisTarifi({ ortamAnahtari: 'canli', basariMetni: BASARI, ikiAsamaliTur: 'totp' }));
  const tarifHatali = { ...tarif, ikinciAdim: { ...tarif.ikinciAdim, hataGostergeleri: [{ tur: 'metin' as const, deger: 'Doğrulama kodu hatalı!' }] } };
  const hata = await girisYap(await sayfa(uygulama), tarifHatali, kimlik('GEZDGNBVGY3TQOJQ')).then(() => null, (h: unknown) => h);
  expect((hata as GirisHatasi).kod).toBe('IKI_ASAMALI_HATALI');
  expect((hata as GirisHatasi).message).toMatch(/TOTP anahtarı ya da bilgisayar saati yanlış olabilir/);
  expect((hata as GirisHatasi).message).not.toContain('GEZDGNBVGY3TQOJQ');
  expect(uygulama.olaylar.slice(-1)[0]).toBe('POST DoLogin kullanici=dogru parola=dogru kod=yanlis');
});
