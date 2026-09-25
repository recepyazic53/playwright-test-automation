// KORUMA TESTİ — giriş tarifi modeli (scripts/platform/giris/tarif.mjs), hata sınıflandırma, kod kaynağı,
// elle kod dosya protokolü ve tarif deposu (ortam ayarlarında, şifreli). Tarayıcı AÇMAZ, ağa çıkmaz;
// veritabanı testleri geçici klasörde, sahte örnek dosyalarla çalışır.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  GIRIS_HATA_KODLARI, adimOzeti, agHatasiMi, baglamAlanlari, girisSonucunuSiniflandir, girisTarifiniDogrula, girisTarifiOlmali,
  regexKacis, yerTutuculari, yerTutuculariDoldur, type GirisTarifi
} from '../../scripts/platform/giris/tarif.mjs';
import { KOD_DESENI, kodIstegiOku, kodIstegiYaz, kodYanitiniBekle, koduYanitla } from '../../scripts/platform/giris/elle-kod.mjs';
import { etkinGirisTarifi, girisTarifiKaydet, girisTarifiniSifirla } from '../../scripts/platform/giris/tarif-deposu.mjs';
import { galaksiGirisTarifi, GALAKSI_HATALI_GIRIS_METNI } from '../../projeler/galaksi/giris-tarifi.mjs';
import { adaptorBul } from '../../projeler/index.mjs';
import { kasaOlustur, parolayiDogrula } from '../../scripts/platform/kasa.mjs';
import { ortamGetir, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { aktarimiUygula, ortamKimligiBul } from '../../scripts/platform/aktarim/motor.mjs';
import { girisHazirMi, kodKaynagi, tarifiHazirla, GirisHatasi, type GirisKimligi } from '../support/giris-motoru';
import { platformOnbelleginiSifirla, platformVerisi } from '../support/platform-veri';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const gecerliTarif = (): Record<string, unknown> => ({
  kullaniciAlani: '#k', parolaAlani: '#p', gonderDugmesi: 'button[type=submit]', basariGostergesi: { tur: 'metin', deger: 'Çıkış' }
});
const kimlik = (ek: Partial<GirisKimligi> = {}): GirisKimligi => ({
  kullaniciAdi: 'u', parola: 'p', totpGizli: null, sabitKod: null, smsKipi: null, ...ek
});

test.describe('Giriş tarifi — model ve doğrulama', () => {
  test('en kısa geçerli tarif varsayılanlarla normalleşir', () => {
    const d = girisTarifiniDogrula(gecerliTarif());
    expect(d.hatalar).toEqual([]);
    expect(d.tarif).toMatchObject({
      surum: 1, girisAdresi: '/', oturumKontrolAdresi: '/', hataGostergeleri: [], ikinciAdim: { tur: 'yok' }, zamanAsimiSn: 45, baglamDegistirme: null
    });
  });

  test('Galaksi tarifleri (TEST ve CANLI) geçerli; eski davranışın seçicileri', () => {
    const testTarifi = girisTarifiOlmali(galaksiGirisTarifi({ ortamAnahtari: 'test', basariMetni: 'Oturumu Kapat' }));
    expect(testTarifi.kullaniciAlani).toBe('input[type="text"]');
    expect(testTarifi.parolaAlani).toBe('input[type="password"]');
    expect(testTarifi.gonderDugmesi).toBe('button, input[type="submit"], input[type="image"]');
    expect(testTarifi.basariGostergesi).toEqual({ tur: 'metin', deger: 'Oturumu Kapat' });
    expect(testTarifi.hataGostergeleri).toEqual([{ tur: 'metin', deger: GALAKSI_HATALI_GIRIS_METNI }]);
    expect(testTarifi.ikinciAdim).toEqual({ tur: 'yok' });
    expect(testTarifi.zamanAsimiSn).toBe(45);
    expect(testTarifi.baglamDegistirme?.baglamTuru).toBe('Acente');
    expect(baglamAlanlari(testTarifi).sort()).toEqual(['acenteKullanicisi', 'acentePartaji', 'acentePartajiSecenegi']);
    const canli = girisTarifiOlmali(galaksiGirisTarifi({ ortamAnahtari: 'canli', basariMetni: null, ikiAsamaliTur: 'totp' }));
    expect(canli.basariGostergesi.deger).toBe('Oturumu Kapat');
    expect(canli.ikinciAdim).toMatchObject({ tur: 'totp', kodAlani: '#Gauthcode', gonderDugmesi: testTarifi.gonderDugmesi, smsKipi: null });
    expect(girisTarifiOlmali(galaksiGirisTarifi({ ortamAnahtari: 'canli', ikiAsamaliTur: 'sms' })).ikinciAdim.tur).toBe('sms');
  });

  test('geçersiz tarif: tüm hatalar Türkçe ve alan adıyla listelenir', () => {
    const d = girisTarifiniDogrula({
      girisAdresi: 'ftp://x', kullaniciAlani: ' ', parolaAlani: 5, basariGostergesi: { tur: 'url', deger: '(' },
      hataGostergeleri: [{ tur: 'sayfa', deger: '' }], ikinciAdim: { tur: 'eposta', smsKipi: 'belki' }, zamanAsimiSn: 2,
      baglamDegistirme: { baglamTuru: '', adimlar: [{ islem: 'uç' }, { islem: 'kosulBekle', ifade: 'window[{alan}]' }, { islem: 'tikla', hedef: { secici: '#a', rol: 'button', ad: 'x' } }, { islem: 'sayiBekle', hedef: { secici: 'li' }, sayi: -1 }] }
    });
    expect(d.gecerli).toBe(false);
    const metin = d.hatalar.join('\n');
    for (const beklenen of [
      /Giriş adresi .*http\(s\)/, /Kullanıcı adı alanı boş olamaz/, /Parola alanı metin olmalıdır/, /Giriş düğmesi boş olamaz/,
      /Başarı göstergesi.deger geçerli bir düzenli ifade değil/, /Hata göstergeleri\[1\].tur/, /İkinci adım türü/, /SMS kipi/,
      /Giriş bekleme süresi/, /Bağlam türü boş olamaz/, /Adım 1: işlem yalnızca/, /Adım 2: koşul ifadesi yer tutucu/,
      /Adım 3: hedefte seçici ile rol birlikte/, /Adım 4: sayı/
    ]) expect(metin).toMatch(beklenen);
    expect(girisTarifiniDogrula(null).hatalar).toEqual(['Tarif bir nesne olmalıdır.']);
    expect(() => girisTarifiOlmali({})).toThrow(/Giriş tarifi geçersiz/);
    expect(() => tarifiHazirla(null, 'TEST ortamı')).toThrow(/TEST ortamı için giriş tarifi tanımlı değil/);
    expect(() => tarifiHazirla({})).toThrow(GirisHatasi);
  });

  test('yer tutucular: doldurma, eksik alan hatası, düzenli ifade kaçışı; adım özeti değer içermez', () => {
    expect(yerTutuculari('#x option[value="{kullanici}"] {kullanici} {şube.kodu}')).toEqual(['kullanici', 'şube.kodu']);
    expect(yerTutuculariDoldur('/liste/{kod}', { kod: 1001 })).toBe('/liste/1001');
    expect(() => yerTutuculariDoldur('{yok}', {})).toThrow(/"yok" alanı yok/);
    expect(yerTutuculariDoldur('^{a}$', { a: 'a.b(c)' }, { kacis: regexKacis })).toBe('^a\\.b\\(c\\)$');
    expect(new RegExp(`^${regexKacis('a.b*c')}$`).test('a.b*c')).toBe(true);
    const a = { islem: 'doldur' as const, hedef: { secici: '.ara' }, deger: '{gizliKod}' };
    expect(adimOzeti(a, 3)).toBe('Adım 3 (Doldur: .ara)');
  });

  test('hata sınıflandırma: ağ hatası metinleri ve giriş sonucu tablosu', () => {
    for (const m of ['page.goto: net::ERR_NAME_NOT_RESOLVED at https://x', 'net::ERR_CONNECTION_REFUSED', 'page.goto: Timeout 30000ms exceeded.', 'net::ERR_BLOCKED_BY_CLIENT']) {
      expect(agHatasiMi(m), m).toBe(true);
    }
    expect(agHatasiMi('locator.fill: Timeout 30000ms exceeded')).toBe(false);
    const tablo: Array<[Parameters<typeof girisSonucunuSiniflandir>[0], string | null]> = [
      [{ asama: 'ilk', gozlem: 'basari', ikinciAdimBekleniyor: false }, null],
      [{ asama: 'ilk', gozlem: 'hata', ikinciAdimBekleniyor: true }, 'KIMLIK_HATALI'],
      [{ asama: 'ilk', gozlem: 'captcha', ikinciAdimBekleniyor: false }, 'CAPTCHA'],
      [{ asama: 'ilk', gozlem: 'ikinciAdim', ikinciAdimBekleniyor: true }, null],
      [{ asama: 'ilk', gozlem: 'ikinciAdim', ikinciAdimBekleniyor: false }, 'IKI_ASAMALI_HATALI'],
      [{ asama: 'ilk', gozlem: null, ikinciAdimBekleniyor: false }, 'ZAMAN_ASIMI'],
      [{ asama: 'ikinci', gozlem: 'hata', ikinciAdimBekleniyor: true }, 'IKI_ASAMALI_HATALI'],
      [{ asama: 'ikinci', gozlem: null, ikinciAdimBekleniyor: true }, 'ZAMAN_ASIMI']
    ];
    for (const [girdi, beklenen] of tablo) expect(girisSonucunuSiniflandir(girdi), JSON.stringify(girdi)).toBe(beklenen);
    expect(Object.keys(GIRIS_HATA_KODLARI)).toContain('CAPTCHA');
  });

  test('kod kaynağı: TOTP → anahtar (yoksa sabit kod); SMS → tarif kipi > profil kipi > sabit kod varlığı', () => {
    const totp = tarifiHazirla({ ...gecerliTarif(), ikinciAdim: { tur: 'totp' } });
    expect(kodKaynagi(totp, kimlik({ totpGizli: 'JBSWY3DPEHPK3PXP' })).tur).toBe('totp');
    expect(kodKaynagi(totp, kimlik({ sabitKod: '111111' }))).toEqual({ tur: 'sabit', kod: '111111' });
    expect(kodKaynagi(totp, kimlik()).tur).toBe('yok');
    const sms = (smsKipi: 'sabit' | 'elle' | null): GirisTarifi => tarifiHazirla({ ...gecerliTarif(), ikinciAdim: { tur: 'sms', smsKipi } });
    expect(kodKaynagi(sms('elle'), kimlik({ sabitKod: '1', smsKipi: 'sabit' })).tur).toBe('elle');
    expect(kodKaynagi(sms(null), kimlik({ smsKipi: 'elle' })).tur).toBe('elle');
    expect(kodKaynagi(sms(null), kimlik({ sabitKod: '222222' }))).toEqual({ tur: 'sabit', kod: '222222' });
    expect(kodKaynagi(sms(null), kimlik()).tur).toBe('elle');
    expect(kodKaynagi(sms('sabit'), kimlik()).tur).toBe('yok');
    // test.skip kararı (hasCredentials): parola yoksa, TOTP anahtarı/sabit kod yoksa hazır değil; elle kip hazır sayılır.
    expect(girisHazirMi(null, kimlik()).hazir).toBe(false);
    expect(girisHazirMi(totp, kimlik({ parola: '' })).hazir).toBe(false);
    expect(girisHazirMi(totp, kimlik()).hazir).toBe(false);
    expect(girisHazirMi(totp, kimlik({ totpGizli: 'X' })).hazir).toBe(true);
    expect(girisHazirMi(sms('elle'), kimlik()).hazir).toBe(true);
  });
});

test.describe('Elle doğrulama kodu — dosya protokolü (motor ↔ Nöbetçi)', () => {
  test('istek → sunucu okur → kod yanıtlanır → motor alır, dosyalar silinir; süre dolunca null', async () => {
    const klasor = geciciKlasor('elle-kod');
    try {
      const yol = join(klasor.yol, 'kod');
      expect(kodIstegiOku(yol)).toBeNull();
      expect(koduYanitla(yol, '123456')).toBe(false); // bekleyen istek yok
      kodIstegiYaz(yol, { mesaj: 'SMS ile gelen doğrulama kodunu girin', sureMs: 10_000 });
      const istek = kodIstegiOku(yol);
      expect(istek?.mesaj).toBe('SMS ile gelen doğrulama kodunu girin');
      expect(istek?.kalanSn).toBeGreaterThan(5);
      expect(() => koduYanitla(yol, '12 34')).toThrow(/harf ve rakam/);
      const bekleyen = kodYanitiniBekle(yol, 5_000, { aralikMs: 50 });
      expect(koduYanitla(yol, '654321')).toBe(true);
      expect(await bekleyen).toBe('654321');
      expect(existsSync(`${yol}.istek.json`) || existsSync(`${yol}.yanit`)).toBe(false);
      kodIstegiYaz(yol, { mesaj: 'x', sureMs: 200 });
      expect(await kodYanitiniBekle(yol, 200, { aralikMs: 50 })).toBeNull();
      expect(kodIstegiOku(yol)).toBeNull();
      expect(KOD_DESENI.test('AB12')).toBe(true);
    } finally {
      klasor.temizle();
    }
  });
});

test.describe('Giriş tarifi deposu — ortam ayarlarında, şifreli; aktarım kullanıcının tarifini ezmez', () => {
  test.describe.configure({ mode: 'serial' });

  test('kaydet / etkin / proje varsayılanı / sıfırla / yeniden aktarım; veri-oku tarifi testlere verir', async () => {
    test.setTimeout(120_000);
    const klasor = geciciKlasor('tarif-deposu');
    const eskiEnv = { ...process.env };
    try {
      for (const k of Object.keys(process.env)) if (k.startsWith('PLATFORM_')) delete process.env[k];
      const adaptor = adaptorBul('galaksi');
      if (!adaptor) throw new Error('galaksi adaptörü yok');
      const paket = await adaptor.paketOlustur(ORNEK_ESKI_DOSYALAR, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => [] });
      const yol = join(klasor.yol, 'platform.db');
      const parola = randomBytes(24).toString('base64url');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
      const { projeId } = aktarimiUygula(vt, paket);
      const testId = ortamKimligiBul(vt, projeId, 'test') as string;

      // 1) Aktarım tarifi ortam ayarlarına yazdı (kaynak: kayitli).
      const ilk = etkinGirisTarifi(vt, projeId, testId, adaptor);
      expect(ilk.kaynak).toBe('kayitli');
      expect(ilk.tarif?.basariGostergesi.tur).toBe('metin');

      // 2) Tarif özelliğinden ÖNCEKİ aktarım (tarif yok) → adaptör varsayılanı = aynı tarif.
      expect(girisTarifiniSifirla(vt, projeId, testId)).toBe(true);
      const varsayilan = etkinGirisTarifi(vt, projeId, testId, adaptor);
      expect(varsayilan.kaynak).toBe('proje-varsayilani');
      expect(varsayilan.tarif).toEqual(ilk.tarif);
      expect(etkinGirisTarifi(vt, projeId, testId, null).kaynak).toBe('yok');

      // 3) Kullanıcı tarifi: geçersizse kaydedilmez; geçerliyse ortam ayarları korunarak yazılır.
      expect(() => girisTarifiKaydet(vt, projeId, testId, { kullaniciAlani: '' })).toThrow(/Giriş tarifi kaydedilemedi/);
      const ozel = { ...gecerliTarif(), kullaniciAlani: '#ozel-kullanici-alani-benzersiz', ikinciAdim: { tur: 'sms', smsKipi: 'elle' } };
      girisTarifiKaydet(vt, projeId, testId, ozel);
      expect(etkinGirisTarifi(vt, projeId, testId, adaptor)).toMatchObject({ kaynak: 'kayitli', tarif: { kullaniciAlani: '#ozel-kullanici-alani-benzersiz', ikinciAdim: { tur: 'sms', smsKipi: 'elle' } } });
      expect(ortamGetir(vt, testId)?.ayarlar.aktarim).toBeTruthy(); // diğer ayarlar korunur
      expect(() => girisTarifiKaydet(vt, 'baska-proje', testId, ozel)).toThrow(/Ortam bulunamadı/);

      // 4) Kaynağı değişen yeniden aktarım ortamı günceller ama kullanıcının tarifini EZMEZ.
      const yeniPaket = await adaptor.paketOlustur(ORNEK_ESKI_DOSYALAR, {
        projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI, TEST_BASE_URL: 'https://test-2.ornek.invalid' }, testListesi: async () => []
      });
      const sonuc = aktarimiUygula(vt, yeniPaket);
      expect(sonuc.sayimlar.ortam.guncellenecek).toBe(1);
      expect(ortamGetir(vt, testId)?.tabanUrl).toBe('https://test-2.ornek.invalid');
      expect(etkinGirisTarifi(vt, projeId, testId, adaptor).tarif?.kullaniciAlani).toBe('#ozel-kullanici-alani-benzersiz');

      // 5) Tarif diskte şifreli (sütun 'ozel'): benzersiz seçici düz metin olarak geçmez.
      const anahtar = (await parolayiDogrula(vt, parola))?.toString('base64url');
      vt.kapat();
      expect(readFileSync(yol).includes(Buffer.from('#ozel-kullanici-alani-benzersiz'))).toBe(false);

      // 6) Testlerin veri okuyucusu (ayrı süreç) etkin tarifi ve giriş profilinin SMS kipini verir.
      process.env.PLATFORM_VERITABANI = yol;
      process.env.PLATFORM_KASA_ANAHTARI = anahtar as string;
      platformOnbelleginiSifirla();
      const veri = platformVerisi('test');
      expect(veri.girisTarifi).toMatchObject({ kaynak: 'kayitli', hatalar: [], tarif: { kullaniciAlani: '#ozel-kullanici-alani-benzersiz' } });
      expect(veri.giris?.profilKimligi).toMatch(/^[0-9a-f-]{36}$/);
      expect(platformVerisi('canli').girisTarifi?.tarif.ikinciAdim).toMatchObject({ tur: 'totp', kodAlani: '#Gauthcode' });
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in eskiEnv)) delete process.env[k];
      Object.assign(process.env, eskiEnv);
      platformOnbelleginiSifirla();
      klasor.temizle();
    }
  });
});
