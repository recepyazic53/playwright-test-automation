// KORUMA TESTİ — giriş tarifi modeli (scripts/platform/giris/tarif.mjs), hata sınıflandırma, kod kaynağı,
// elle kod dosya protokolü ve tarif deposu (ortam ayarlarında, şifreli). Tarayıcı AÇMAZ, ağa çıkmaz;
// veritabanı testleri geçici klasörde, nötr örnek projeyle (depo işlevleriyle kurulur) çalışır.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  GIRIS_HATA_KODLARI, adimOzeti, agHatasiMi, baglamAlanlari, girisAdimlariniCoz, girisAlanlari, girisSonucunuSiniflandir, girisTarifiniDogrula,
  girisTarifiOlmali, regexKacis, varsayilanGirisAdimlariMi, yerTutuculari, yerTutuculariDoldur, type GirisTarifi
} from '../../scripts/platform/giris/tarif.mjs';
import { ekAlanAdiOner, girisKaydiTaslagi, kayittanTarif } from '../../scripts/platform/giris/giris-kaydi.mjs';
import { KOD_DESENI, kodIstegiOku, kodIstegiYaz, kodYanitiniBekle, koduYanitla } from '../../scripts/platform/giris/elle-kod.mjs';
import { etkinGirisTarifi, girisTarifiKaydet, girisTarifiniSifirla } from '../../scripts/platform/giris/tarif-deposu.mjs';
import { kasaOlustur, parolayiDogrula } from '../../scripts/platform/kasa.mjs';
import {
  girisProfiliGetir, girisProfiliKaydet, girisProfilleriniListele, ortamGetir, ortamKaydet, projeKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { girisHazirMi, kodKaynagi, tarifiHazirla, GirisHatasi, type GirisKimligi } from '../support/giris-motoru';
import { hataMi, platformOkuyucusunuCalistir, type PlatformGirisBilgisi, type PlatformGirisTarifi } from '../support/platform-veri';
import { ornekGirisTarifi } from './model-fikstur';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

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
      // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
      izinleriAc(vt);
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

test.describe('Giriş adımları (girisAdimlari) ve giriş profilinin ek alanları', () => {
  const adimli = (girisAdimlari: unknown[]): Record<string, unknown> => ({ ...gecerliTarif(), girisAdimlari });

  test('eski tarif aynen: alan yoksa normalleştirilmiş tarife EKLENMEZ, etkin adımlar kullanıcı adı → parola → gönder', () => {
    const t = girisTarifiOlmali(gecerliTarif());
    expect('girisAdimlari' in t).toBe(false);
    expect(girisAdimlariniCoz(t).map((a) => a.islem)).toEqual(['kullaniciAdi', 'parola', 'gonder']);
    expect(girisAlanlari(t)).toEqual([]);
    expect(varsayilanGirisAdimlariMi([{ islem: 'kullaniciAdi' }, { islem: 'parola' }, { islem: 'gonder' }])).toBe(true);
    expect(varsayilanGirisAdimlariMi([{ islem: 'kullaniciAdi', aciklama: 'x' }, { islem: 'parola' }, { islem: 'gonder' }])).toBe(false);
  });

  test('önce / ara / sonra adımları geçerli; ek alan adları yer tutuculardan çıkar; özet değer içermez', () => {
    const t = girisTarifiOlmali(adimli([
      { islem: 'tikla', hedef: { rol: 'button', ad: 'Kabul et' } },
      { islem: 'doldur', hedef: { secici: '#firma' }, deger: '{firmaKodu}' },
      { islem: 'kullaniciAdi' },
      { islem: 'tikla', hedef: { secici: 'button', metin: 'Devam' } },
      { islem: 'parola', zamanAsimiSn: 20 },
      { islem: 'sec', hedef: { secici: '#sube' }, deger: '{sube}' },
      { islem: 'gonder', aciklama: 'Oturum aç' },
      { islem: 'gorunurBekle', hedef: { secici: '#duyuru' } }
    ]));
    expect(t.girisAdimlari?.map((a) => a.islem)).toEqual(['tikla', 'doldur', 'kullaniciAdi', 'tikla', 'parola', 'sec', 'gonder', 'gorunurBekle']);
    expect(t.girisAdimlari?.[4]).toEqual({ islem: 'parola', zamanAsimiSn: 20 });
    expect(girisAlanlari(t)).toEqual(['firmaKodu', 'sube']);
    expect(baglamAlanlari(t)).toEqual([]); // giriş adımları bağlam profilinden beslenmez
    expect(adimOzeti({ islem: 'parola' }, 5)).toBe('Adım 5 (Parolayı yaz)');
    expect(adimOzeti(t.girisAdimlari![1], 2)).toBe('Adım 2 (Doldur: #firma)');
  });

  test('özel adımlar tam bir kez ve gönderden önce; genel adım hataları "Giriş adımı n" der', () => {
    const d = girisTarifiniDogrula(adimli([
      { islem: 'kullaniciAdi' }, { islem: 'kullaniciAdi' }, { islem: 'gonder' }, { islem: 'parola' }, { islem: 'uç' }, { islem: 'kosulBekle', ifade: 'x[{a}]' }
    ]));
    expect(d.gecerli).toBe(false);
    const metin = d.hatalar.join('\n');
    for (const beklenen of [/"Kullanıcı adını yaz" adımı tam bir kez olmalıdır \(şu an 2\)/, /parola, giriş düğmesinden önce/, /Giriş adımı 5: işlem yalnızca/, /Giriş adımı 6: koşul ifadesi yer tutucu/]) {
      expect(metin).toMatch(beklenen);
    }
    expect(girisTarifiniDogrula(adimli([{ islem: 'kullaniciAdi' }, { islem: 'parola' }])).hatalar.join(' ')).toMatch(/"Giriş düğmesine bas" adımı tam bir kez/);
    expect(girisTarifiniDogrula({ ...gecerliTarif(), girisAdimlari: 'x' }).hatalar).toContain('Giriş adımları bir liste olmalıdır.');
  });

  test('"Girişi kaydet": kayıttan taslak + kullanıcının işaretleriyle tarif (değer yok; mevcut göstergeler korunur)', () => {
    const alan = (anahtar: string, tur: string, etiket: string) => ({ alan: { anahtar, tur, etiket, secici: `#${anahtar}`, adaySeciciler: [], bolum: { anahtar: 'b', baslik: '' } }, secili: true });
    const okuma = (yol: string, dokunulan: string[]) => ({ yol, gorunen: dokunulan, dokunulan, secimler: {} });
    const env = {
      kip: 'kayit', bicim: 'akis', profil: null, baslik: 'Giriş', engellenenler: [], notlar: [], mesajlar: [],
      alanlar: [alan('firma', 'text', 'Firma kodu'), alan('kad', 'text', 'Kullanıcı'), alan('sif', 'password', 'Şifre'), alan('pin', 'password', 'PIN')],
      dugmeler: [{ secici: '#devam', metin: 'Devam' }, { secici: '#gir', metin: 'Giriş' }],
      olaylar: [
        { tur: 'tik', dugme: 0, oncesi: okuma('/giris', ['firma', 'kad']) },
        { tur: 'okuma', elle: false, okuma: okuma('/giris', ['sif', 'pin']) },
        { tur: 'tik', dugme: 1, oncesi: okuma('/giris', []) },
        { tur: 'okuma', elle: false, okuma: okuma('/panel', []) }
      ]
    } as unknown as Parameters<typeof girisKaydiTaslagi>[0];
    const taslak = girisKaydiTaslagi(env);
    expect(taslak.adimlar.map((a) => (a.tur === 'alan' ? a.anahtar : a.metin))).toEqual(['firma', 'kad', 'Devam', 'sif', 'pin', 'Giriş']);
    expect(taslak.adimlar.map((a) => a.oneri)).toEqual(['ek', 'kullaniciAdi', 'tikla', 'parola', 'ek', 'gonder']);
    expect(ekAlanAdiOner('Firma kodu')).toBe('firmaKodu');
    const isaretler = [{ rol: 'ek', ad: 'firmaKodu' }, { rol: 'kullaniciAdi' }, { rol: 'tikla' }, { rol: 'parola' }, { rol: 'ek', ad: 'pin', gizli: true }, { rol: 'gonder' }];
    const mevcut = girisTarifiOlmali({ ...gecerliTarif(), hataGostergeleri: [{ tur: 'metin', deger: 'Hatalı' }] });
    const s = kayittanTarif(taslak, isaretler, mevcut, '/giris');
    expect(s.hatalar).toEqual([]);
    expect(s.ekAlanlar).toEqual([{ ad: 'firmaKodu', gizli: false, etiket: 'Firma kodu' }, { ad: 'pin', gizli: true, etiket: 'PIN' }]);
    const t = girisTarifiOlmali(s.tarif);
    expect(t).toMatchObject({ kullaniciAlani: '#kad', parolaAlani: '#sif', gonderDugmesi: '#gir', basariGostergesi: { tur: 'metin', deger: 'Çıkış' }, hataGostergeleri: [{ tur: 'metin', deger: 'Hatalı' }] });
    expect(t.girisAdimlari?.map((a) => a.islem)).toEqual(['doldur', 'kullaniciAdi', 'tikla', 'parola', 'doldur', 'gonder']);
    expect(girisAlanlari(t)).toEqual(['firmaKodu', 'pin']);
    // Yalnız kullanıcı adı + parola + gönder işaretlenirse tarif eski biçimdedir (girisAdimlari yazılmaz).
    const sade = kayittanTarif(taslak, [{ rol: 'yoksay' }, { rol: 'kullaniciAdi' }, { rol: 'yoksay' }, { rol: 'parola' }, { rol: 'yoksay' }, { rol: 'gonder' }], null, '/giris');
    expect('girisAdimlari' in sade.tarif).toBe(false);
    expect(sade.tarif.basariGostergesi).toEqual({ tur: 'url', deger: '/panel' });
    expect(sade.tarif.oturumKontrolAdresi).toBe('/panel');
    // "Bitir" anındaki sayfada görünen çıkış yazısı başarı göstergesi olur (adresten önce gelir); sorgu parametresi alınmaz.
    const sonlu = girisKaydiTaslagi({ ...env, sonSayfa: { yol: '/panel?oturum=1', cikisMetni: 'Çıkış yap' } } as typeof env);
    expect(kayittanTarif(sonlu, isaretler, null, '/giris').tarif).toMatchObject({ basariGostergesi: { tur: 'metin', deger: 'Çıkış yap' }, oturumKontrolAdresi: '/panel' });
    // Onay ekranındaki seçimler: kodun kaynağı ikinci adıma, kullanıcının yazdığı başarı yazısı göstergeye yazılır.
    const kodluTaslak = {
      ilkYol: '/giris', sonYol: '/giris', sonSayfa: { yol: '/giris', cikisMetni: null },
      adimlar: [
        { tur: 'alan', anahtar: 'k', etiket: 'Kullanıcı', alanTuru: 'text', secici: '#k', oneri: 'kullaniciAdi' },
        { tur: 'alan', anahtar: 'p', etiket: 'Şifre', alanTuru: 'password', secici: '#p', oneri: 'parola' },
        { tur: 'dugme', sira: 0, metin: 'Giriş', secici: '#g', oneri: 'gonder' },
        { tur: 'alan', anahtar: 'o', etiket: 'Kod', alanTuru: 'text', secici: '#o', oneri: 'kod' },
        { tur: 'dugme', sira: 1, metin: 'Doğrula', secici: '#d', oneri: 'kodGonder' }
      ]
    } as Parameters<typeof kayittanTarif>[0];
    const roller = kodluTaslak.adimlar.map((a) => ({ rol: a.oneri }));
    const bos = kayittanTarif(kodluTaslak, roller, null, '/giris');
    expect(bos.tarif.basariGostergesi).toEqual({ tur: 'metin', deger: '' });
    expect(bos.notlar.join(' ')).toMatch(/görünen bir yazı/);
    const tam = kayittanTarif(kodluTaslak, roller, null, '/giris', { kodKaynagi: 'elle', basariMetni: ' Ana sayfa ' });
    expect(tam.hatalar).toEqual([]);
    expect(girisTarifiOlmali(tam.tarif)).toMatchObject({
      basariGostergesi: { tur: 'metin', deger: 'Ana sayfa' }, ikinciAdim: { tur: 'sms', smsKipi: 'elle', kodAlani: '#o', gonderDugmesi: '#d' }
    });
    expect(kayittanTarif(kodluTaslak, roller, null, '/giris', { kodKaynagi: 'totp' }).tarif.ikinciAdim).toMatchObject({ tur: 'totp', smsKipi: null });
    expect(kayittanTarif(kodluTaslak, roller, null, '/giris', { kodKaynagi: 'baska' }).notlar.join(' ')).toMatch(/kodun türünü/);
    expect(kayittanTarif(taslak, [], null, null).hatalar.join(' ')).toMatch(/Kullanıcı adı alanını işaretleyin/);
    expect(kayittanTarif(taslak, [{ rol: 'ek', ad: 'firma kodu' }, ...isaretler.slice(1)], null, null).hatalar.join(' ')).toMatch(/ek alan adı/);
  });

  test('ek alanlar: gizli olan kasada ayrı ve şifreli, listede değersiz; boş gönderilince korunur; veri okuyucu testlere verir', async () => {
    test.setTimeout(120_000);
    const klasor = geciciKlasor('ek-alanlar');
    try {
      const yol = join(klasor.yol, 'platform.db');
      const parola = randomBytes(24).toString('base64url');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
      // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
      izinleriAc(vt);
      const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
      const ortamId = ortamKaydet(vt, { projeId, ad: 'Test', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
      const id = girisProfiliKaydet(vt, {
        projeId, ortamId, ad: 'Profil', kullaniciAdi: 'k', parola: 'P-1',
        ekAlanlar: [{ ad: 'firmaKodu', deger: 'FIRMA-BENZERSIZ-77' }, { ad: 'pin', gizli: true, deger: 'PIN-BENZERSIZ-4321' }]
      });
      expect(girisProfilleriniListele(vt, projeId)[0].ekAlanlar).toEqual([
        { ad: 'firmaKodu', gizli: false, deger: 'FIRMA-BENZERSIZ-77', degerVar: true }, { ad: 'pin', gizli: true, deger: null, degerVar: true }
      ]);
      expect(girisProfiliGetir(vt, id, { coz: true })?.ekAlanlar[1].deger).toBe('PIN-BENZERSIZ-4321');
      // Gizli değer gönderilmeden güncelleme → korunur; ek alanlar hiç verilmezse hepsi korunur.
      girisProfiliKaydet(vt, { id, projeId, ortamId, ad: 'Profil', kullaniciAdi: 'k', ekAlanlar: [{ ad: 'firmaKodu', deger: 'FIRMA-BENZERSIZ-77' }, { ad: 'pin', gizli: true }] });
      girisProfiliKaydet(vt, { id, projeId, ortamId, ad: 'Profil 2', kullaniciAdi: 'k' });
      expect(girisProfiliGetir(vt, id, { coz: true })?.ekAlanlar.map((e) => e.deger)).toEqual(['FIRMA-BENZERSIZ-77', 'PIN-BENZERSIZ-4321']);
      expect(() => girisProfiliKaydet(vt, { id, projeId, ortamId, ad: 'Profil', kullaniciAdi: 'k', ekAlanlar: [{ ad: 'firma kodu' }] })).toThrow(/Ek alan adı "firma kodu" geçersiz/);
      // Eski profil (ek alan yok) aynen okunur.
      const eski = girisProfiliKaydet(vt, { projeId, ad: 'Eski', kullaniciAdi: 'e', parola: 'x' });
      expect(girisProfiliGetir(vt, eski)?.ekAlanlar).toEqual([]);
      const anahtar = (await parolayiDogrula(vt, parola))?.toString('base64url') ?? '';
      vt.kapat();
      const disk = readFileSync(yol);
      expect(disk.includes(Buffer.from('PIN-BENZERSIZ-4321'))).toBe(false);
      expect(disk.includes(Buffer.from('FIRMA-BENZERSIZ-77'))).toBe(false);
      const d = platformOkuyucusunuCalistir(['genel', '--proje', projeId, '--ortam-id', ortamId], { PLATFORM_VERITABANI: yol, PLATFORM_KASA_ANAHTARI: anahtar });
      if (hataMi(d)) throw new Error(d.hata);
      expect((d as { giris: PlatformGirisBilgisi }).giris).toMatchObject({ ekAlanlar: { firmaKodu: 'FIRMA-BENZERSIZ-77', pin: 'PIN-BENZERSIZ-4321' }, gizliEkAlanlar: ['pin'] });
    } finally {
      klasor.temizle();
    }
  });
});
