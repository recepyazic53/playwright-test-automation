// ENTEGRASYON (yerel fikstür) — otomatik algılama (scripts/platform/giris/algilama.mjs) ve genel giriş
// motoru (tests/support/giris-motoru.ts). Tarayıcı açılır ama HİÇBİR istek ağa çıkmaz: tüm istekler
// route ile yakalanıp bellekteki fikstür sayfalarından yanıtlanır (ya da 127.0.0.1'deki geçici sunucu);
// tanınmayan her istek iptal edilir ve DNS de kapalıdır (bkz. giris-fikstur.ts). Her testin sonunda
// yasak örnek alan adına (…yasak-ornek…) istek olmadığı ve iptal edilmemiş dış istek kalmadığı doğrulanır.
import { join } from 'node:path';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { captchaAlgila, girisFormunuAlgila, kodAlaniniAlgila } from '../../scripts/platform/giris/algilama.mjs';
import { KOD_YOLU_DEGISKENI, kodIstegiOku, koduYanitla } from '../../scripts/platform/giris/elle-kod.mjs';
import {
  GirisHatasi, baglamiDegistir, girisYap, oturumGecerliMi, oturumuHazirla, tarifiHazirla, type GirisKimligi
} from '../support/giris-motoru';
import { agTemizMi, girisSayfalari, korumaliBaglam, korumaliTarayici, yerelSunucu, type AgKaydi } from './giris-fikstur';
import { geciciKlasor } from './platform-ortak';

const KOKEN = 'https://giris-ornegi.invalid';
const KIMLIK: GirisKimligi = { kullaniciAdi: 'kullanici', parola: 'Parola-1', totpGizli: null, sabitKod: null, smsKipi: null };
const GIZLILER = ['Parola-1', '123456', '654321', '4321'];

let tarayici: Browser;
let baglam: BrowserContext;
let ag: AgKaydi;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { tarayici = await korumaliTarayici(); });
test.afterAll(async () => { await tarayici?.close(); });
test.beforeEach(async () => {
  ({ baglam, ag } = await korumaliBaglam(tarayici, { [KOKEN]: girisSayfalari() }, { baseURL: KOKEN }));
});
test.afterEach(async () => {
  await baglam.close();
  const { sirket, disari } = agTemizMi(ag, [KOKEN]);
  expect(sirket, 'yasak örnek alan adına istek olmamalı').toEqual([]);
  expect(disari, 'yakalanmayan dış istek olmamalı').toEqual([]);
});

/** Hata kodu + mesajı; mesajda gizli değer olmamalı. */
async function hataBekle(is: Promise<unknown>, kod: string): Promise<string> {
  const hata = await is.then(() => null, (h: unknown) => h);
  expect(hata, `${kod} bekleniyordu: ${String(hata)}`).toBeInstanceOf(GirisHatasi);
  expect((hata as GirisHatasi).kod).toBe(kod);
  const mesaj = (hata as GirisHatasi).message;
  for (const g of GIZLILER) expect(mesaj.includes(g), 'hata mesajında gizli değer olmamalı').toBe(false);
  return mesaj;
}

test.describe('Otomatik algılama (yerel fikstür sayfaları)', () => {
  const beklenen: Record<string, { kullaniciAlani: string; parolaAlani: string; gonderDugmesi: string; formVar: boolean }> = {
    '/klasik': { kullaniciAlani: '#eposta', parolaAlani: '#parola', gonderDugmesi: 'button[type="submit"]', formVar: true },
    '/goruntu': { kullaniciAlani: 'input[type="text"]', parolaAlani: 'input[type="password"]', gonderDugmesi: '#DoLogin', formVar: false },
    '/spa': { kullaniciAlani: 'input[name="kullanici"]', parolaAlani: 'input[type="password"]', gonderDugmesi: '#gir', formVar: false },
    '/otp': { kullaniciAlani: 'input[name="kullanici"]', parolaAlani: 'input[name="parola"]', gonderDugmesi: 'input[type="submit"]', formVar: true },
    '/hata': { kullaniciAlani: '#kad', parolaAlani: '#sif', gonderDugmesi: '#btn', formVar: false }
  };
  for (const [yol, b] of Object.entries(beklenen)) {
    test(`form önerisi: ${yol}`, async () => {
      const page = await baglam.newPage();
      await page.goto(yol);
      const oneri = await girisFormunuAlgila(page, { beklemeSn: 5 });
      expect(oneri).toMatchObject({ bulundu: true, ...b });
      expect(await captchaAlgila(page)).toEqual([]);
    });
  }

  test('parola alanı olmayan sayfa: açık neden; CAPTCHA yer tutucusu algılanır', async () => {
    const page = await baglam.newPage();
    await page.goto('/sayfa-yok');
    expect(await girisFormunuAlgila(page, { beklemeSn: 1 })).toMatchObject({ bulundu: false, neden: expect.stringMatching(/parola alanı bulunamadı/) });
    await page.goto('/captcha');
    const kanit = await captchaAlgila(page);
    expect(kanit.join(' ')).toMatch(/recaptcha/i);
    expect(kanit).toContain('öğe: .g-recaptcha');
  });

  test('gizli CAPTCHA alanı (hatalı denemeden sonra açılan) engel sayılmaz; görünür olunca algılanır', async () => {
    // Gerçek bir uygulamada görüldü: giriş sayfasında CAPTCHA alanı ve görseli baştan DOM'da ama
    // gizli bir kapsayıcıda duruyor; yalnızca birkaç hatalı girişten sonra görünür oluyor.
    const page = await baglam.newPage();
    await page.setContent(
      '<form><input type="text" name="Username"><input type="password" name="Password">' +
        '<div id="CaptchaContainer" style="display:none"><img src="/captcha.png" width="120" height="40">' +
        '<input type="text" name="Captcha" id="Captcha"></div><input type="submit" value="Giriş"></form>'
    );
    expect(await captchaAlgila(page)).toEqual([]);
    await page.evaluate(() => { (document.getElementById('CaptchaContainer') as HTMLElement).style.display = 'block'; });
    expect((await captchaAlgila(page)).join(' ')).toMatch(/captcha/i);
  });

  test('gönderimden sonra OTP alanı algılanır (kullanıcı/parola alanları hariç)', async () => {
    const page = await baglam.newPage();
    await page.goto('/otp');
    expect(await kodAlaniniAlgila(page, ['input[name="kullanici"]', 'input[name="parola"]'])).toBeNull();
    await page.fill('input[name="kullanici"]', 'kullanici');
    await page.fill('input[name="parola"]', 'Parola-1');
    await page.click('input[type="submit"]');
    await page.waitForURL('**/otp/giris');
    expect(await kodAlaniniAlgila(page)).toBe('#k');
  });
});

test.describe('Giriş motoru (yerel fikstür sayfaları)', () => {
  const tarif = (ek: Record<string, unknown>) => tarifiHazirla({
    kullaniciAlani: '#eposta', parolaAlani: '#parola', gonderDugmesi: 'button[type="submit"]',
    basariGostergesi: { tur: 'url', deger: '/ana$' }, hataGostergeleri: [{ tur: 'metin', deger: 'Kullanıcı adı veya parola hatalı' }],
    girisAdresi: '/klasik', zamanAsimiSn: 10, ...ek
  });

  test('başarılı giriş: klasik form (adres göstergesi), görüntü düğmesi (metin), gecikmeli SPA (öğe)', async () => {
    const loglar: string[] = [];
    const page = await baglam.newPage();
    await girisYap(page, tarif({}), KIMLIK, { log: (m) => loglar.push(m) });
    expect(new URL(page.url()).pathname).toBe('/ana');
    await baglam.clearCookies();
    await girisYap(page, tarif({
      girisAdresi: '/goruntu', kullaniciAlani: 'input[type="text"]', parolaAlani: 'input[type="password"]',
      gonderDugmesi: 'button, input[type="submit"], input[type="image"]', basariGostergesi: { tur: 'metin', deger: 'Çıkış yap' }
    }), KIMLIK);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible();
    await girisYap(page, tarif({
      girisAdresi: '/spa', kullaniciAlani: 'input[name="kullanici"]', parolaAlani: 'input[type="password"]', gonderDugmesi: '#gir',
      basariGostergesi: { tur: 'eleman', deger: 'nav >> text=Hesabım' }
    }), KIMLIK);
    expect(loglar.join('\n')).not.toContain('Parola-1');
  });

  test('yanlış parola: hata göstergesi görünür görünmez KIMLIK_HATALI (zaman aşımı beklenmez)', async () => {
    const page = await baglam.newPage();
    const bas = Date.now();
    const mesaj = await hataBekle(girisYap(page, tarif({ zamanAsimiSn: 30 }), { ...KIMLIK, parola: 'Yanlis-9' }), 'KIMLIK_HATALI');
    expect(mesaj).toMatch(/Kullanıcı adı veya parola hatalı: .*"Kullanıcı adı veya parola hatalı"/);
    expect(Date.now() - bas).toBeLessThan(10_000);
    // Aynı sayfa içi pencere (sayfa değişmeden) de yakalanır.
    await hataBekle(girisYap(page, tarif({ girisAdresi: '/hata', kullaniciAlani: '#kad', parolaAlani: '#sif', gonderDugmesi: '#btn' }), KIMLIK), 'KIMLIK_HATALI');
  });

  const otpTarifi = (ikinciAdim: Record<string, unknown>) => tarif({
    girisAdresi: '/otp', kullaniciAlani: 'input[name="kullanici"]', parolaAlani: 'input[name="parola"]', gonderDugmesi: 'input[type="submit"]',
    ikinciAdim: { hataGostergeleri: [{ tur: 'metin', deger: 'Doğrulama kodu geçersiz' }], ...ikinciAdim }
  });

  test('ikinci adım: SMS sabit kod, kod alanı otomatik bulunur; yanlış kod → IKI_ASAMALI_HATALI', async () => {
    const page = await baglam.newPage();
    await girisYap(page, otpTarifi({ tur: 'sms', smsKipi: 'sabit', gonderDugmesi: 'form button' }), { ...KIMLIK, sabitKod: '123456' });
    expect(new URL(page.url()).pathname).toBe('/ana');
    await baglam.clearCookies();
    const mesaj = await hataBekle(girisYap(page, otpTarifi({ tur: 'sms', smsKipi: 'sabit', kodAlani: '#k', gonderDugmesi: 'form button' }), { ...KIMLIK, sabitKod: '000000' }), 'IKI_ASAMALI_HATALI');
    expect(mesaj).toMatch(/Doğrulama kodu geçersiz.*sabit test kodu yanlış olabilir/);
    // Kod kaynağı yoksa form HİÇ doldurulmaz (siteye boşuna istek gitmez).
    const onceki = ag.istekler.length;
    await hataBekle(girisYap(page, otpTarifi({ tur: 'totp' }), KIMLIK), 'KOD_GEREKLI');
    expect(ag.istekler.length).toBe(onceki);
  });

  test('ikinci adım: SMS elle — kod sağlayıcı; süre dolarsa KOD_GEREKLI', async () => {
    const page = await baglam.newPage();
    const istekler: Array<{ mesaj: string; sureMs: number }> = [];
    await girisYap(page, otpTarifi({ tur: 'sms', smsKipi: 'elle', gonderDugmesi: 'form button', elleBeklemeSn: 20 }), KIMLIK, {
      kodSaglayici: async (i) => { istekler.push(i); return '123456'; }
    });
    expect(istekler).toEqual([{ mesaj: 'SMS ile gelen doğrulama kodunu girin', sureMs: 20_000 }]);
    await baglam.clearCookies();
    const mesaj = await hataBekle(girisYap(page, otpTarifi({ tur: 'sms', smsKipi: 'elle', gonderDugmesi: 'form button', elleBeklemeSn: 15 }), KIMLIK, {
      kodSaglayici: async () => null
    }), 'KOD_GEREKLI');
    expect(mesaj).toMatch(/15 sn içinde girilmedi/);
  });

  test('ikinci adım: SMS elle — Nöbetçi koşu paneli protokolü (TEST_SUNUCU_KOD_YOLU)', async () => {
    const klasor = geciciKlasor('elle-panel');
    const yol = join(klasor.yol, 'kod');
    const eski = process.env[KOD_YOLU_DEGISKENI];
    process.env[KOD_YOLU_DEGISKENI] = yol;
    // Sunucunun yerine: bekleyen isteği görünce kodu yanıtlar (panelde kullanıcının yazdığı kod).
    let gorulenMesaj = '';
    const panel = (async () => {
      for (let i = 0; i < 200; i++) {
        const istek = kodIstegiOku(yol);
        if (istek) { gorulenMesaj = istek.mesaj; koduYanitla(yol, '123456'); return; }
        await new Promise((c) => setTimeout(c, 50));
      }
    })();
    try {
      const page = await baglam.newPage();
      await girisYap(page, otpTarifi({ tur: 'sms', smsKipi: 'elle', gonderDugmesi: 'form button', elleBeklemeSn: 20 }), KIMLIK);
      await panel;
      expect(gorulenMesaj).toBe('SMS ile gelen doğrulama kodunu girin');
      expect(new URL(page.url()).pathname).toBe('/ana');
    } finally {
      if (eski === undefined) delete process.env[KOD_YOLU_DEGISKENI]; else process.env[KOD_YOLU_DEGISKENI] = eski;
      klasor.temizle();
    }
  });

  test('CAPTCHA, erişilemeyen site, bulunamayan alan ve zaman aşımı açık hatalarla ayrılır', async () => {
    const page = await baglam.newPage();
    const captcha = await hataBekle(girisYap(page, tarif({ girisAdresi: '/captcha', kullaniciAlani: 'input[name=u]', parolaAlani: 'input[name=p]' }), KIMLIK), 'CAPTCHA');
    expect(captcha).toContain('Test ortamında CAPTCHA kapatılmalı');
    const site = await hataBekle(girisYap(page, tarif({ girisAdresi: 'https://erisilemez-ornek.invalid/giris' }), KIMLIK), 'SITE_ERISILEMEDI');
    expect(site).toMatch(/Giriş sayfası açılamadı \(.*net::ERR_ADDRESS_UNREACHABLE/);
    expect(site).not.toContain('erisilemez-ornek.invalid'); // adres mesaja yazılmaz
    const alan = await hataBekle(girisYap(await baglam.newPage(), tarif({ kullaniciAlani: '#yok' }), KIMLIK, { alanBeklemeMs: 1000 }), 'ALAN_BULUNAMADI');
    expect(alan).toMatch(/Kullanıcı adı alanı \(#yok\) 1 sn içinde görünmedi \(sayfa: \/klasik\)/);
    const zaman = await hataBekle(girisYap(await baglam.newPage(), tarif({ basariGostergesi: { tur: 'metin', deger: 'Asla görünmeyen metin' }, zamanAsimiSn: 5, hataGostergeleri: [] }), KIMLIK), 'ZAMAN_ASIMI');
    expect(zaman).toMatch(/5 sn içinde "Asla görünmeyen metin" metni görünmedi \(sayfa: \/ana\)/);
  });

  test('bağlam değiştirme: profilde eksik alan → adım çalıştırılmadan açık hata', async () => {
    const page = await baglam.newPage();
    const t = tarif({ baglamDegistirme: { baglamTuru: 'Şube', adimlar: [{ islem: 'git', adres: '/sube/{subeKodu}' }, { islem: 'metinBekle', hedef: { secici: 'body' }, metin: '{subeAdi}' }] } });
    const mesaj = await hataBekle(baglamiDegistir(page, t, { subeKodu: '1' }), 'TARIF_GECERSIZ');
    expect(mesaj).toMatch(/Şube profilinde yok: subeAdi/);
    const adim = await hataBekle(baglamiDegistir(page, t, { subeKodu: '1', subeAdi: 'Merkez' }), 'BAGLAM_ADIMI');
    expect(adim).toMatch(/Adım 2 \(Metni doğrula: body\) başarısız/);
  });
});

test.describe('Giriş adımları: önce / ara / sonra adımlar ve ek alanlar (yerel fikstür /iki-sayfa)', () => {
  const PIN = '4321';
  const ekKimlik: GirisKimligi = { ...KIMLIK, ekAlanlar: { kod: 'F-77', secim: 'B2', pin: PIN }, gizliEkAlanlar: ['pin'] };
  const adimli = (araya: Array<Record<string, unknown>> = []) => tarifiHazirla({
    girisAdresi: '/iki-sayfa', kullaniciAlani: '#kad', parolaAlani: '#sif', gonderDugmesi: '#gir',
    basariGostergesi: { tur: 'metin', deger: 'Çıkış yap' }, hataGostergeleri: [{ tur: 'metin', deger: 'Bilgiler hatalı' }], zamanAsimiSn: 5,
    girisAdimlari: [
      { islem: 'tikla', hedef: { rol: 'button', ad: 'Kabul et' }, aciklama: 'Çerez onayı' },
      { islem: 'doldur', hedef: { secici: '#kod' }, deger: '{kod}' },
      { islem: 'sec', hedef: { secici: '#secim' }, deger: '{secim}' },
      { islem: 'kullaniciAdi' },
      { islem: 'tikla', hedef: { secici: 'button', metin: 'Devam' } },
      { islem: 'parola' },
      ...araya,
      { islem: 'doldur', hedef: { secici: '#pin' }, deger: '{pin}' },
      { islem: 'gonder' }
    ]
  });

  test('iki sayfalı giriş: çerez → ek alan + seçim → kullanıcı adı → Devam → parola + gizli PIN → Giriş', async () => {
    const page = await baglam.newPage();
    const log: string[] = [];
    await girisYap(page, adimli(), ekKimlik, { alanBeklemeMs: 3000, log: (m) => log.push(m) });
    await expect(page.getByText('Çıkış yap')).toBeVisible();
    expect(log.join(' ')).not.toContain(PIN);
  });

  test('ek alan profilde yoksa sayfaya gitmeden açık hata; yanlış PIN → kullanıcı adı/parola hatalı; başarısız adımda gizli değer maskelenir', async () => {
    const eksik = await hataBekle(girisYap(await baglam.newPage(), adimli(), { ...KIMLIK, ekAlanlar: { kod: 'F-77' } }), 'TARIF_GECERSIZ');
    expect(eksik).toMatch(/giriş profilinde yok: secim, pin/);
    expect(ag.istekler.some((u) => u.includes('/iki-sayfa'))).toBe(false);

    await hataBekle(girisYap(await baglam.newPage(), adimli(), { ...ekKimlik, ekAlanlar: { kod: 'F-77', secim: 'B2', pin: '9999' } }, { alanBeklemeMs: 3000 }), 'KIMLIK_HATALI');

    // PIN alanının değerini (henüz yazılmamışken) doğrulayan adım başarısız olur: hata adımı söyler, PIN'i yazmaz.
    const adim = await hataBekle(girisYap(await baglam.newPage(),
      adimli([{ islem: 'degerBekle', hedef: { secici: '#pin' }, deger: '{pin}', zamanAsimiSn: 1 }]), ekKimlik, { alanBeklemeMs: 3000 }), 'GIRIS_ADIMI');
    expect(adim).toMatch(/Adım 7 \(Değerini doğrula: #pin\) başarısız \(sayfa: \/iki-sayfa\)/);
    expect(adim).not.toContain(PIN);
  });
});

test.describe('Oturum yeniden kullanımı (127.0.0.1 geçici sunucu)', () => {
  test('ilk çağrı giriş yapıp oturumu kaydeder, ikincisi formu doldurmadan geçerli sayar; oturum yoksa false', async () => {
    const sunucu = await yerelSunucu(girisSayfalari());
    const klasor = geciciKlasor('oturum');
    try {
      const t = tarifiHazirla({
        girisAdresi: '/klasik', oturumKontrolAdresi: '/ana', kullaniciAlani: '#eposta', parolaAlani: '#parola', gonderDugmesi: 'button[type="submit"]',
        basariGostergesi: { tur: 'metin', deger: 'Çıkış yap' }
      });
      const dosya = join(klasor.yol, 'auth', 'test-profil.json');
      const s = { baseURL: sunucu.adres, tarif: t, kimlik: KIMLIK, oturumDosyasi: dosya };
      expect(await oturumuHazirla(tarayici, s)).toBe('yeni');
      expect(await oturumuHazirla(tarayici, s)).toBe('gecerli');
      expect(sunucu.istekler.filter((i) => i === 'POST /klasik/giris')).toHaveLength(1);
      const bos = await tarayici.newContext({ baseURL: sunucu.adres });
      expect(await oturumGecerliMi(await bos.newPage(), t, 1000)).toBe(false);
      await bos.close();
      expect(sunucu.istekler.every((i) => /^(GET|POST) \//.test(i))).toBe(true);
    } finally {
      await sunucu.kapat();
      klasor.temizle();
    }
  });

  test('kontrol adresi giriş sayfasına yönlendirirse zaman aşımı beklenmeden hemen geçersiz; geçerli oturum ve aynı adresli tarif eskisi gibi', async () => {
    const sunucu = await yerelSunucu(girisSayfalari());
    const klasor = geciciKlasor('oturum-yonlendirme');
    try {
      const t = tarifiHazirla({
        girisAdresi: '/klasik', oturumKontrolAdresi: '/ana', kullaniciAlani: '#eposta', parolaAlani: '#parola', gonderDugmesi: 'button[type="submit"]',
        basariGostergesi: { tur: 'metin', deger: 'Çıkış yap' }
      });
      // Oturum yok: /ana → /klasik yönlendirmesi. 15 sn'lik süre beklenmez.
      const bos = await tarayici.newContext({ baseURL: sunucu.adres });
      const once = Date.now();
      expect(await oturumGecerliMi(await bos.newPage(), t, 15_000)).toBe(false);
      expect(Date.now() - once, 'yönlendirme hemen geçersiz sayılmalı').toBeLessThan(5_000);
      await bos.close();
      // Geçerli oturum: gösterge görünür → true (davranış değişmez).
      const dosya = join(klasor.yol, 'auth', 'yonlendirme.json');
      expect(await oturumuHazirla(tarayici, { baseURL: sunucu.adres, tarif: t, kimlik: KIMLIK, oturumDosyasi: dosya })).toBe('yeni');
      const dolu = await tarayici.newContext({ baseURL: sunucu.adres, storageState: dosya });
      expect(await oturumGecerliMi(await dolu.newPage(), t, 15_000)).toBe(true);
      await dolu.close();
      // Kontrol adresi giriş sayfasıyla aynıysa yönlendirme kuralı uygulanmaz: gösterge süre boyunca beklenir (eski davranış).
      const ayni = tarifiHazirla({ ...t, oturumKontrolAdresi: '/klasik' });
      const bos2 = await tarayici.newContext({ baseURL: sunucu.adres });
      const once2 = Date.now();
      expect(await oturumGecerliMi(await bos2.newPage(), ayni, 1_500)).toBe(false);
      expect(Date.now() - once2).toBeGreaterThanOrEqual(1_400);
      await bos2.close();
    } finally {
      await sunucu.kapat();
      klasor.temizle();
    }
  });
});
