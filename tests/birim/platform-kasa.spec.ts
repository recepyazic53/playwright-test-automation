// KORUMA TESTLERİ — platform kasası (scripts/platform/kasa.mjs): oluşturma/açma/yanlış
// parola/kilitleme, hassas değerlerin diskte düz metin OLMAMASI, parola değişiminde yeniden
// şifreleme ve gizli değerlerin loglara sızmaması. Tarayıcı AÇMAZ.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  KasaHatasi,
  MIN_PAROLA_UZUNLUGU,
  VARSAYILAN_KDF,
  coz,
  kasaAc,
  kasaDurumu,
  kasaKilitle,
  kasaOlustur,
  parolaDegistir,
  sifrele,
  zarfMi
} from '../../scripts/platform/kasa.mjs';
import {
  degisiklikGecmisiListele,
  girisProfiliGetir,
  girisProfiliKaydet,
  girisProfilleriniListele,
  projeKaydet,
  testVerisiProfiliGetir,
  testVerisiProfiliKaydet,
  testVerisiTuruKaydet,
  veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { HIZLI_KDF, geciciKlasor, loglariYakala, type LogYakalayici } from './platform-ortak';

const PAROLA = 'Kasa-Parolasi-Birim-2026';
const YENI_PAROLA = 'Yeni-Kasa-Parolasi-2027';
const GIRIS_PAROLASI = 'GirisParolasi!Gizli-7781';
const TOTP_GIZLI = 'JBSWY3DPEHPK3PXPGIZLI';
const KART_NO = '4111222233334444';
const GIZLILER = [PAROLA, YENI_PAROLA, GIRIS_PAROLASI, TOTP_GIZLI, KART_NO];

let log: LogYakalayici;
test.beforeEach(() => {
  log = loglariYakala();
});
test.afterEach(() => {
  log.birak();
  log.gizliYokMu(GIZLILER);
});

async function kasaHatasiKodu(islem: () => Promise<unknown> | unknown): Promise<string> {
  try {
    await islem();
  } catch (hata) {
    expect(hata).toBeInstanceOf(KasaHatasi);
    const mesaj = (hata as KasaHatasi).message;
    for (const gizli of GIZLILER) expect(mesaj.includes(gizli)).toBe(false);
    return (hata as KasaHatasi).kod;
  }
  throw new Error('Hata bekleniyordu');
}

test.describe('Platform kasası', () => {
  test('oluştur / kilitle / aç / yanlış parola / kısa parola', async () => {
    const vt = await veritabaniniHazirla(null);
    expect(kasaDurumu(vt)).toMatchObject({ olusturuldu: false, acik: false });
    expect(await kasaHatasiKodu(() => kasaAc(vt, PAROLA))).toBe('KASA_YOK');

    const kisa = 'a'.repeat(MIN_PAROLA_UZUNLUGU - 1);
    try {
      await kasaOlustur(vt, kisa);
      throw new Error('kısa parola kabul edilmemeliydi');
    } catch (hata) {
      expect((hata as KasaHatasi).kod).toBe('PAROLA_KISA');
      expect((hata as Error).message).toContain(`en az ${MIN_PAROLA_UZUNLUGU} karakter`);
    }

    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    expect(kasaDurumu(vt)).toMatchObject({ olusturuldu: true, acik: true });
    expect(await kasaHatasiKodu(() => kasaOlustur(vt, PAROLA))).toBe('KASA_VAR');

    const zarf = sifrele(vt, 'merhaba');
    expect(zarfMi(zarf)).toBe(true);
    expect(zarf.startsWith('kasa:v1:')).toBe(true);
    expect(sifrele(vt, 'merhaba')).not.toBe(zarf); // rastgele IV
    expect(coz(vt, zarf)).toBe('merhaba');

    kasaKilitle(vt);
    expect(kasaDurumu(vt).acik).toBe(false);
    expect(await kasaHatasiKodu(() => coz(vt, zarf))).toBe('KASA_KILITLI');
    expect(await kasaHatasiKodu(() => kasaAc(vt, 'yanlis-parola-123'))).toBe('PAROLA_YANLIS');
    expect(kasaDurumu(vt).acik).toBe(false);

    await kasaAc(vt, PAROLA);
    expect(coz(vt, zarf)).toBe('merhaba');
    // Zarf değiştirilirse (GCM etiketi) açılmaz.
    const bozuk = zarf.slice(0, -2) + (zarf.endsWith('A') ? 'BB' : 'AA');
    expect(await kasaHatasiKodu(() => coz(vt, bozuk))).toBe('PAROLA_YANLIS');
    vt.kapat();
  });

  test('üretim KDF parametreleri güçlü (scrypt N>=2^17) ve varsayılan olarak kullanılır', async () => {
    expect(VARSAYILAN_KDF.N).toBeGreaterThanOrEqual(2 ** 17);
    const vt = await veritabaniniHazirla(null);
    await kasaOlustur(vt, PAROLA);
    expect(kasaDurumu(vt).kdf).toEqual({ alg: 'scrypt', N: VARSAYILAN_KDF.N, r: 8, p: 1 });
    kasaKilitle(vt);
    await kasaAc(vt, PAROLA);
    vt.kapat();
  });

  test('hassas değerler diskte ASLA düz metin durmaz; kilitliyken yazılamaz, okunamaz', async () => {
    const klasor = geciciKlasor('kasa-disk');
    try {
      const yol = join(klasor.yol, 'platform.db');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      const proje = projeKaydet(vt, { ad: 'Proje' });
      const profil = girisProfiliKaydet(vt, {
        projeId: proje, ad: 'Ana kullanıcı', kullaniciAdi: 'kullanici1', parola: GIRIS_PAROLASI,
        ikiAsamaliTur: 'totp', totpGizli: TOTP_GIZLI
      });
      const tur = testVerisiTuruKaydet(vt, {
        projeId: proje, ad: 'Kart', alanlar: [{ ad: 'kartNo', hassas: true }, { ad: 'sahip' }]
      });
      const veri = testVerisiProfiliKaydet(vt, { projeId: proje, turId: tur, ad: 'Kart 1', degerler: { kartNo: KART_NO, sahip: 'Ad Soyad' } });
      // Güncelleme: geçmişe önce/sonra yazılır — orada da şifreli kalmalı.
      girisProfiliKaydet(vt, { id: profil, projeId: proje, ad: 'Ana kullanıcı 2', kullaniciAdi: 'kullanici1' });

      const bayt = readFileSync(yol);
      for (const gizli of [GIRIS_PAROLASI, TOTP_GIZLI, KART_NO, PAROLA]) {
        expect(bayt.includes(Buffer.from(gizli, 'utf8')), 'düz metin DB dosyasında olmamalı').toBe(false);
      }
      expect(bayt.includes(Buffer.from('kasa:v1:', 'utf8'))).toBe(true);
      expect(bayt.includes(Buffer.from('Ad Soyad', 'utf8'))).toBe(true); // hassas olmayan alan açık

      const gecmis = degisiklikGecmisiListele(vt, 'giris_profili', profil);
      expect(zarfMi(gecmis[1].onceki?.parola)).toBe(true);

      expect(girisProfiliGetir(vt, profil)).toMatchObject({ parolaVar: true, parola: null, totpGizli: null });
      expect(girisProfiliGetir(vt, profil, { coz: true })).toMatchObject({ parola: GIRIS_PAROLASI, totpGizli: TOTP_GIZLI });
      expect(testVerisiProfiliGetir(vt, veri)?.degerler).toEqual({ kartNo: null, sahip: 'Ad Soyad' });
      expect(testVerisiProfiliGetir(vt, veri, { coz: true })?.degerler.kartNo).toBe(KART_NO);
      expect(JSON.stringify(girisProfilleriniListele(vt, proje))).not.toContain(GIRIS_PAROLASI);

      kasaKilitle(vt);
      expect(await kasaHatasiKodu(() =>
        girisProfiliKaydet(vt, { projeId: proje, ad: 'x', kullaniciAdi: 'y', parola: 'baska-parola-1' }))).toBe('KASA_KILITLI');
      expect(await kasaHatasiKodu(() => girisProfiliGetir(vt, profil, { coz: true }))).toBe('KASA_KILITLI');
      // Kullanıcı adı da şifreli bir sütun olduğundan kilitliyken hiçbir giriş profili güncellemesi yapılamaz.
      expect(await kasaHatasiKodu(() =>
        girisProfiliKaydet(vt, { id: profil, projeId: proje, ad: 'Ana kullanıcı 3', kullaniciAdi: 'kullanici1' }))).toBe('KASA_KILITLI');
      await kasaAc(vt, PAROLA);
      expect(girisProfiliGetir(vt, profil, { coz: true })?.parola).toBe(GIRIS_PAROLASI);
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('parola değişimi tüm hassas değerleri (geçmiş dahil) tek işlemde yeniden şifreler', async () => {
    const klasor = geciciKlasor('kasa-degistir');
    try {
      const yol = join(klasor.yol, 'platform.db');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      const proje = projeKaydet(vt, { ad: 'Proje' });
      const profil = girisProfiliKaydet(vt, { projeId: proje, ad: 'p', kullaniciAdi: 'u', parola: GIRIS_PAROLASI });
      girisProfiliKaydet(vt, { id: profil, projeId: proje, ad: 'p2', kullaniciAdi: 'u' });
      const eskiZarf = String(vt.tek('SELECT parola FROM giris_profilleri WHERE id = ?', [profil])?.parola);

      expect(await kasaHatasiKodu(() => parolaDegistir(vt, 'yanlis-parola-1', YENI_PAROLA))).toBe('PAROLA_YANLIS');
      expect(await kasaHatasiKodu(() => parolaDegistir(vt, PAROLA, 'kisa'))).toBe('PAROLA_KISA');

      const sonuc = await parolaDegistir(vt, PAROLA, YENI_PAROLA);
      expect(sonuc.yenidenSifrelenen).toBeGreaterThanOrEqual(3); // profil + 2 geçmiş kaydı
      const yeniZarf = String(vt.tek('SELECT parola FROM giris_profilleri WHERE id = ?', [profil])?.parola);
      expect(yeniZarf).not.toBe(eskiZarf);
      expect(readFileSync(yol).includes(Buffer.from(eskiZarf))).toBe(false);
      expect(girisProfiliGetir(vt, profil, { coz: true })?.parola).toBe(GIRIS_PAROLASI);

      vt.kapat();
      const tekrar = await veritabaniniHazirla(yol);
      expect(await kasaHatasiKodu(() => kasaAc(tekrar, PAROLA))).toBe('PAROLA_YANLIS');
      await kasaAc(tekrar, YENI_PAROLA);
      expect(girisProfiliGetir(tekrar, profil, { coz: true })?.parola).toBe(GIRIS_PAROLASI);
      for (const kayit of degisiklikGecmisiListele(tekrar, 'giris_profili', profil)) {
        for (const anlik of [kayit.onceki, kayit.sonraki]) {
          if (anlik?.parola) expect(coz(tekrar, String(anlik.parola))).toBe(GIRIS_PAROLASI);
        }
      }
      tekrar.kapat();
    } finally {
      klasor.temizle();
    }
  });
});
