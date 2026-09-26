// KORUMA TESTLERİ — platform veritabanı (scripts/platform/veritabani/): göçler, şema,
// veri erişim katmanı ve değişiklik geçmişi. Tarayıcı AÇMAZ; geçici klasörde çalışır.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { veritabaniAc } from '../../scripts/platform/veritabani/baglanti.mjs';
import { GUNCEL_SEMA_SURUMU, TABLOLAR, gocleriUygula, mevcutSemaSurumu } from '../../scripts/platform/veritabani/gocler.mjs';
import {
  DepoHatasi,
  ayarGetir,
  ayarYaz,
  baglamProfiliKaydet,
  baglamProfilleriniListele,
  degisiklikGecmisiListele,
  ekranKaydet,
  ekranModeliEkle,
  ekranModeliGetir,
  kosuBitir,
  kosuOlustur,
  kosuSonuclariniListele,
  kosuSonucuEkle,
  kosulariListele,
  ortamKaydet,
  ortamlariListele,
  projeKaydet,
  projeSil,
  sayimlar,
  senaryoGetir,
  senaryoKaydet,
  senaryoKosuyaDahilAyarla,
  senaryoSil,
  senaryolariListele,
  veritabaniniHazirla,
  yerelMakine
} from '../../scripts/platform/veritabani/depo.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test.describe('Platform veritabanı — göçler', () => {
  test('boş veritabanına tüm göçler uygulanır, tekrar açınca yeniden uygulanmaz', async () => {
    const klasor = geciciKlasor('goc');
    try {
      const yol = join(klasor.yol, 'alt', 'platform.db');
      const vt = await veritabaniAc(yol);
      const ilk = gocleriUygula(vt);
      expect(ilk.onceki).toBe(0);
      expect(ilk.simdiki).toBe(GUNCEL_SEMA_SURUMU);
      expect(ilk.uygulananlar.length).toBeGreaterThan(0);
      vt.kapat();
      expect(existsSync(yol)).toBe(true);

      const vt2 = await veritabaniAc(yol);
      const ikinci = gocleriUygula(vt2);
      expect(ikinci.uygulananlar).toEqual([]);
      expect(mevcutSemaSurumu(vt2)).toBe(GUNCEL_SEMA_SURUMU);
      const tablolar = vt2.tumu("SELECT name FROM sqlite_master WHERE type = 'table'").map((s) => String(s.name));
      for (const t of TABLOLAR) expect(tablolar).toContain(t.ad);
      expect(tablolar).toContain('meta');
      expect(tablolar).toContain('sema_surumu');
      expect(Number(vt2.tek('PRAGMA foreign_keys')?.foreign_keys)).toBe(1);
      vt2.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('uygulamadan YENİ şema sürümlü veritabanı reddedilir', async () => {
    const vt = await veritabaniAc(null);
    gocleriUygula(vt);
    vt.calistir("INSERT INTO sema_surumu (surum, ad, uygulanma) VALUES (?, 'gelecek', 'x')", [GUNCEL_SEMA_SURUMU + 1]);
    expect(() => gocleriUygula(vt)).toThrow(/daha|yeni/);
    vt.kapat();
  });

  test('yabancı anahtarlar (kaydetme/export sonrası da) etkin kalır', async () => {
    const klasor = geciciKlasor('fk');
    try {
      const vt = await veritabaniniHazirla(join(klasor.yol, 'p.db'));
      await kasaOlustur(vt, 'Birim-Kasa-Parolasi-1', { kdf: HIZLI_KDF }); // ortam adı/adresi şifreli
      const proje = projeKaydet(vt, { ad: 'Proje' }); // bir yazma = export + yeniden açma
      expect(() => ortamKaydet(vt, { projeId: 'olmayan-proje', ad: 'x', tabanUrl: 'https://ornek.test' })).toThrow();
      ortamKaydet(vt, { projeId: proje, ad: 'Test', tabanUrl: 'https://ornek.test' });
      projeSil(vt, proje); // ON DELETE CASCADE
      expect(sayimlar(vt).ortamlar).toBe(0);
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('başarısız işlem hiçbir şey yazmaz (rollback)', async () => {
    const klasor = geciciKlasor('geri');
    try {
      const yol = join(klasor.yol, 'p.db');
      const vt = await veritabaniniHazirla(yol);
      const proje = projeKaydet(vt, { ad: 'Proje' });
      expect(() =>
        vt.islem(() => {
          senaryoKaydet(vt, { projeId: proje, baslik: 'Yarım', icerik: {} });
          throw new Error('bilinçli hata');
        })
      ).toThrow('bilinçli hata');
      expect(senaryolariListele(vt, { projeId: proje })).toEqual([]);
      vt.kapat();
      const tekrar = await veritabaniniHazirla(yol);
      expect(sayimlar(tekrar).senaryolar).toBe(0);
      tekrar.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('dosya başka süreçte değişirse yazma reddedilir (sessiz ezme yok)', async () => {
    const klasor = geciciKlasor('sahip');
    try {
      const yol = join(klasor.yol, 'p.db');
      const a = await veritabaniniHazirla(yol);
      const b = await veritabaniniHazirla(yol);
      projeKaydet(b, { ad: 'B' });
      expect(() => projeKaydet(a, { ad: 'A' })).toThrow(/başka bir süreç/);
      a.kapat();
      b.kapat();
    } finally {
      klasor.temizle();
    }
  });
});

test.describe('Platform veritabanı — veri erişim katmanı', () => {
  test('CRUD + JSON doğrulama + değişiklik geçmişi', async () => {
    const vt = await veritabaniniHazirla(null);
    await kasaOlustur(vt, 'Birim-Kasa-Parolasi-1', { kdf: HIZLI_KDF });
    const makine = yerelMakine(vt);
    expect(makine.id).toMatch(/^[0-9a-f-]{36}$/);

    const proje = projeKaydet(vt, { ad: 'Genel Proje', ayarlar: { dil: 'tr' } });
    const ortam = ortamKaydet(vt, { projeId: proje, ad: 'Test', tabanUrl: 'https://ornek.test', varsayilan: true });
    ortamKaydet(vt, { projeId: proje, ad: 'Canlı', tabanUrl: 'https://canli.ornek.test', varsayilan: true });
    const ortamlar = ortamlariListele(vt, proje);
    expect(ortamlar.filter((o) => o.varsayilan).map((o) => o.ad)).toEqual(['Canlı']);
    expect(() => ortamKaydet(vt, { projeId: proje, ad: 'x', tabanUrl: 'ftp://a' })).toThrow(DepoHatasi);

    baglamProfiliKaydet(vt, { projeId: proje, tur: 'rol', ad: 'Yönetici', alanlar: { kod: 'Y1' } });
    expect(baglamProfilleriniListele(vt, proje, 'rol')).toHaveLength(1);

    const ekran = ekranKaydet(vt, { projeId: proje, anahtar: 'giris', ad: 'Giriş' });
    expect(ekranModeliEkle(vt, { ekranId: ekran, model: { alanlar: [] } }).surum).toBe(1);
    expect(ekranModeliEkle(vt, { ekranId: ekran, model: { alanlar: [1] } }).surum).toBe(2);
    expect(ekranModeliGetir(vt, ekran)?.model).toEqual({ alanlar: [1] });
    expect(ekranModeliGetir(vt, ekran, 1)?.model).toEqual({ alanlar: [] });

    const senaryo = senaryoKaydet(vt, { projeId: proje, ekranId: ekran, baslik: 'S1', icerik: { adim: 1 }, yapan: 'birim' });
    senaryoKaydet(vt, { id: senaryo, projeId: proje, ekranId: ekran, baslik: 'S1', icerik: { adim: 2 }, yapan: 'birim' });
    senaryoKosuyaDahilAyarla(vt, senaryo, false, 'birim');
    expect(senaryoGetir(vt, senaryo)).toMatchObject({ icerik: { adim: 2 }, kosuyaDahil: false });
    expect(senaryolariListele(vt, { projeId: proje, kosuyaDahil: true })).toEqual([]);
    expect(() => senaryoKaydet(vt, { projeId: proje, baslik: 'Bozuk', icerik: '{bozuk' as unknown as Record<string, unknown> })).toThrow(DepoHatasi);

    const sabitId = '0f0e0d0c-0000-4000-8000-000000000001';
    senaryoKaydet(vt, { id: sabitId, projeId: proje, baslik: 'Kararlı kimlik', icerik: {} });
    expect(senaryoGetir(vt, sabitId)?.baslik).toBe('Kararlı kimlik');

    senaryoSil(vt, senaryo, 'birim');
    const gecmis = degisiklikGecmisiListele(vt, 'senaryo', senaryo);
    expect(gecmis.map((g) => g.islem)).toEqual(['olustur', 'guncelle', 'guncelle', 'sil']);
    expect(gecmis[1].onceki?.icerik_json).toBe('{"adim":1}');
    expect(gecmis[1].sonraki?.icerik_json).toBe('{"adim":2}');
    expect(gecmis[0].yapan).toBe('birim');
    expect(gecmis[0].makineId).toBe(makine.id);

    const kosu = kosuOlustur(vt, { projeId: proje, ortamId: ortam, tur: 'tam' });
    kosuSonucuEkle(vt, { kosuId: kosu, senaryoId: sabitId, senaryoBaslik: 'Kararlı kimlik', durum: 'basarili', sureMs: 1200 });
    kosuBitir(vt, kosu, { durum: 'tamamlandi', ozet: { basarili: 1 } });
    expect(kosulariListele(vt, { projeId: proje })[0]).toMatchObject({ makineId: makine.id, durum: 'tamamlandi' });
    expect(kosuSonuclariniListele(vt, kosu)).toHaveLength(1);

    ayarYaz(vt, 'tema', { koyu: true });
    expect(ayarGetir(vt, 'tema')).toEqual({ koyu: true });
    vt.kapat();
  });

  test('şema ve motor projeye özgü kavram içermez', () => {
    const kaynaklar = ['veritabani/gocler.mjs', 'veritabani/depo.mjs', 'kasa.mjs', 'yedek.mjs', 'ice-aktarma.mjs', 'sunucu-platform.mjs',
      'aktarim/motor.mjs', 'aktarim/playwright-liste.mjs', 'aktarim/veri-oku.mjs',
      'servisler/servis-deposu.mjs', 'servisler/soap-istemcisi.mjs', 'servisler/soapui-ice-aktarma.mjs', 'servisler/servis-islemleri.mjs']
      .map((d) => readFileSync(join(__dirname, '..', '..', 'scripts', 'platform', d), 'utf-8').toLowerCase());
    for (const metin of kaynaklar) {
      for (const yasak of ['galaksi', 'jetseyahat', 'jet-seyahat', 'ödeme', 'odeme', 'poliçe', 'police']) {
        expect(metin.includes(yasak), `"${yasak}" motorda geçmemeli`).toBe(false);
      }
      // "acente" yalnızca açıklama örneği olarak geçebilir, tablo/sütun adı olarak değil.
      expect(/create table[^;]*acente/.test(metin)).toBe(false);
    }
  });
});
