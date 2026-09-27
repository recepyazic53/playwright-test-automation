// KORUMA TESTİ — giriş tarifi modeli (scripts/platform/giris/tarif.mjs), hata sınıflandırma, kod kaynağı,
// elle kod dosya protokolü ve tarif deposu (ortam ayarlarında, şifreli). Tarayıcı AÇMAZ, ağa çıkmaz;
// veritabanı testleri geçici klasörde, nötr örnek projeyle (depo işlevleriyle kurulur) çalışır.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  GIRIS_HATA_KODLARI, adimOzeti, agHatasiMi, baglamAlanlari, girisSonucunuSiniflandir, girisTarifiniDogrula, girisTarifiOlmali,
  regexKacis, yerTutuculari, yerTutuculariDoldur, type GirisTarifi
} from '../../scripts/platform/giris/tarif.mjs';
import { KOD_DESENI, kodIstegiOku, kodIstegiYaz, kodYanitiniBekle, koduYanitla } from '../../scripts/platform/giris/elle-kod.mjs';
import { etkinGirisTarifi, girisTarifiKaydet, girisTarifiniSifirla } from '../../scripts/platform/giris/tarif-deposu.mjs';
import { kasaOlustur, parolayiDogrula } from '../../scripts/platform/kasa.mjs';
import { girisProfiliKaydet, ortamGetir, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { girisHazirMi, kodKaynagi, tarifiHazirla, GirisHatasi, type GirisKimligi } from '../support/giris-motoru';
import { hataMi, platformOkuyucusunuCalistir, type PlatformGirisBilgisi, type PlatformGirisTarifi } from '../support/platform-veri';
import { ornekGirisTarifi } from './model-fikstur';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

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

  test('örnek tarif (TOTP + bağlam değiştirme) geçerli; bağlam alanları yer tutuculardan çıkar', () => {
    const t = girisTarifiOlmali(ornekGirisTarifi());
    expect(t).toMatchObject({ girisAdresi: '/giris', oturumKontrolAdresi: '/panel', zamanAsimiSn: 20 });
    expect(t.ikinciAdim).toMatchObject({ tur: 'totp', kodAlani: '#kod', gonderDugmesi: '#dogrula' });
    expect(t.baglamDegistirme?.baglamTuru).toBe('Şube');
    expect(baglamAlanlari(t)).toEqual(['subeKodu']);
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


test.describe('Giriş tarifi deposu — ortam ayarlarında, şifreli; ortam güncellemesi kullanıcının tarifini ezmez', () => {
  test('etkin (yok / kayitli) / kaydet / sıfırla / ortam güncellemesi; veri okuyucu (genel kip) tarifi testlere verir', async () => {
    test.setTimeout(120_000);
    const klasor = geciciKlasor('tarif-deposu');
    try {
      const yol = join(klasor.yol, 'platform.db');
      const parola = randomBytes(24).toString('base64url');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
      const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
      const testId = ortamKaydet(vt, { projeId, ad: 'Test', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { digerAyar: 'korunur' } });
      const canliId = ortamKaydet(vt, { projeId, ad: 'Canlı', tabanUrl: 'https://canli.ornek.invalid', ayarlar: { canli: true } });
      girisProfiliKaydet(vt, { projeId, ortamId: testId, ad: 'Test girişi', kullaniciAdi: 'ornek.kullanici', parola: 'Ornek-Parola-1', ikiAsamaliTur: 'sms', smsAyari: { yontem: 'elle' } });

      // 1) Yeni ortamda tarif yok (proje varsayılanı kavramı yok).
      expect(etkinGirisTarifi(vt, projeId, testId)).toEqual({ tarif: null, kaynak: 'yok', hatalar: [] });
      expect(() => etkinGirisTarifi(vt, 'baska-proje', testId)).toThrow(/Ortam bulunamadı/);

      // 2) Kullanıcı tarifi: geçersizse kaydedilmez; geçerliyse ortam ayarları korunarak yazılır.
      expect(() => girisTarifiKaydet(vt, projeId, testId, { kullaniciAlani: '' })).toThrow(/Giriş tarifi kaydedilemedi/);
      expect(etkinGirisTarifi(vt, projeId, testId).kaynak).toBe('yok');
      const ozel = { ...gecerliTarif(), kullaniciAlani: '#ozel-kullanici-alani-benzersiz', ikinciAdim: { tur: 'sms', smsKipi: 'elle' } };
      girisTarifiKaydet(vt, projeId, testId, ozel);
      expect(etkinGirisTarifi(vt, projeId, testId)).toMatchObject({ kaynak: 'kayitli', hatalar: [], tarif: { kullaniciAlani: '#ozel-kullanici-alani-benzersiz', ikinciAdim: { tur: 'sms', smsKipi: 'elle' } } });
      expect(ortamGetir(vt, testId)?.ayarlar.digerAyar).toBe('korunur'); // diğer ayarlar korunur
      expect(() => girisTarifiKaydet(vt, 'baska-proje', testId, ozel)).toThrow(/Ortam bulunamadı/);

      // 3) Sıfırla → yok; yeniden kaydedilir.
      expect(girisTarifiniSifirla(vt, projeId, testId)).toBe(true);
      expect(etkinGirisTarifi(vt, projeId, testId).kaynak).toBe('yok');
      girisTarifiKaydet(vt, projeId, testId, ozel);

      // 4) Ortamın adresi değişir (ayarlar verilmeden) → kullanıcının tarifi EZİLMEZ.
      const ortam = ortamGetir(vt, testId);
      ortamKaydet(vt, { id: testId, projeId, ad: String(ortam?.ad), tabanUrl: 'https://test-2.ornek.invalid', varsayilan: true });
      expect(ortamGetir(vt, testId)?.tabanUrl).toBe('https://test-2.ornek.invalid');
      expect(etkinGirisTarifi(vt, projeId, testId).tarif?.kullaniciAlani).toBe('#ozel-kullanici-alani-benzersiz');
      girisTarifiKaydet(vt, projeId, canliId, ornekGirisTarifi());

      // 5) Tarif diskte şifreli (sütun 'ozel'): benzersiz seçici düz metin olarak geçmez.
      const anahtar = (await parolayiDogrula(vt, parola))?.toString('base64url') ?? '';
      vt.kapat();
      expect(readFileSync(yol).includes(Buffer.from('#ozel-kullanici-alani-benzersiz'))).toBe(false);

      // 6) Testlerin veri okuyucusu (ayrı süreç, genel kip) ortamın kayıtlı tarifini ve giriş profilinin SMS kipini verir.
      type Cikti = { durum?: string; girisTarifi: PlatformGirisTarifi | null; giris: PlatformGirisBilgisi | null };
      const oku = (ortamId: string): Cikti => {
        const d = platformOkuyucusunuCalistir(['genel', '--proje', projeId, '--ortam-id', ortamId], { PLATFORM_VERITABANI: yol, PLATFORM_KASA_ANAHTARI: anahtar });
        if (hataMi(d)) throw new Error(d.hata);
        return d as Cikti;
      };
      const testCiktisi = oku(testId);
      expect(testCiktisi.durum).toBe('hazir');
      expect(testCiktisi.girisTarifi).toMatchObject({ kaynak: 'kayitli', hatalar: [], tarif: { kullaniciAlani: '#ozel-kullanici-alani-benzersiz' } });
      expect(testCiktisi.giris).toMatchObject({ kullaniciAdi: 'ornek.kullanici', smsKipi: 'elle', totpGizli: null });
      expect(testCiktisi.giris?.profilKimligi).toMatch(/^[0-9a-f-]{36}$/);
      const canli = oku(canliId);
      expect(canli.girisTarifi?.tarif.ikinciAdim).toMatchObject({ tur: 'totp', kodAlani: '#kod' });
      expect(canli.giris).toBeNull(); // bu ortama özel ya da tüm ortamlar için profil yok
    } finally {
      klasor.temizle();
    }
  });
});
