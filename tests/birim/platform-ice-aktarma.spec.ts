// KORUMA TESTLERİ — yedek içe aktarma: ÖNİZLEME → SEÇİM → UYGULAMA (scripts/platform/ice-aktarma.mjs).
// yeni / degisen / yalnizBurada grupları, maskelenen gizli değerler, alan bazında fark,
// yalnızca seçilenlerin uygulanması, üzerine yazılan yerel sürümün geçmişe yazılması, koşuların
// eklenip tekilleştirilmesi, iptal / süre dolumu, yanlış parola ve kaba kuvvet beklemesi.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { veritabaniAc, type Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { gocleriUygula } from '../../scripts/platform/veritabani/gocler.mjs';
import { KasaHatasi, ParolaDenemeSiniri, coz, kasaDurumu, kasaKilitle, kasaOlustur, zarfMi } from '../../scripts/platform/kasa.mjs';
import {
  degisiklikGecmisiListele,
  ekranKaydet,
  girisProfiliGetir,
  girisProfiliKaydet,
  kosuOlustur,
  kosuSonucuEkle,
  ortamKaydet,
  ortamlariListele,
  projeKaydet,
  sayimlar,
  senaryoGetir,
  senaryoKaydet,
  testVerisiProfiliGetir,
  testVerisiProfiliKaydet,
  testVerisiTuruKaydet,
  veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { YedekHatasi, yedekOlustur } from '../../scripts/platform/yedek.mjs';
import {
  IceAktarmaYoneticisi,
  MASKE,
  iceAktarmaHazirla,
  iceAktarmaUygula,
  type Onizleme
} from '../../scripts/platform/ice-aktarma.mjs';
import { HIZLI_KDF, geciciKlasor, loglariYakala, type LogYakalayici } from './platform-ortak';

const PAROLA_A = 'Kaynak-Makine-Parolasi-1';
const PAROLA_B = 'Hedef-Makine-Parolasi-22';
const GIRIS_PAROLASI = 'IceAktarGiris#4410';
const YENI_GIRIS_PAROLASI = 'IceAktarGirisYeni#4411';
const IBAN = 'TR000000000000000000004410';
const YENI_IBAN = 'TR000000000000000000004411';
const TOTP = 'JBSWY3DPEHPK3PXP4410';
const YENI_URL = 'https://degisen-ortam-4410.ornek.test';
const GIZLILER = [PAROLA_A, PAROLA_B, GIRIS_PAROLASI, YENI_GIRIS_PAROLASI, IBAN, YENI_IBAN, TOTP];

let log: LogYakalayici;
test.beforeEach(() => {
  log = loglariYakala();
});
test.afterEach(() => {
  log.birak();
  log.gizliYokMu(GIZLILER);
});

interface Kimlikler { proje: string; ortam: string; profil: string; veri: string; ekran: string; s1: string }

async function kaynakOlustur(yol: string | null = null): Promise<{ vt: Veritabani; ids: Kimlikler }> {
  const vt = await veritabaniniHazirla(yol);
  await kasaOlustur(vt, PAROLA_A, { kdf: HIZLI_KDF });
  const proje = projeKaydet(vt, { ad: 'Ortak Proje' });
  const ortam = ortamKaydet(vt, { projeId: proje, ad: 'Test', tabanUrl: 'https://ilk-ortam.ornek.test', varsayilan: true });
  const profil = girisProfiliKaydet(vt, {
    projeId: proje, ortamId: ortam, ad: 'Ana', kullaniciAdi: 'kullanici', parola: GIRIS_PAROLASI, ikiAsamaliTur: 'totp', totpGizli: TOTP
  });
  const tur = testVerisiTuruKaydet(vt, { projeId: proje, ad: 'Hesap', alanlar: [{ ad: 'iban', hassas: true }, { ad: 'ad' }] });
  const veri = testVerisiProfiliKaydet(vt, { projeId: proje, turId: tur, ad: 'Hesap 1', degerler: { iban: IBAN, ad: 'Deneme' } });
  const ekran = ekranKaydet(vt, { projeId: proje, anahtar: 'form', ad: 'Form' });
  const s1 = senaryoKaydet(vt, { projeId: proje, ekranId: ekran, baslik: 'Senaryo 1', icerik: { adim: 1, not: 'aynı' } });
  const kosu = kosuOlustur(vt, { projeId: proje, ortamId: ortam });
  kosuSonucuEkle(vt, { kosuId: kosu, senaryoId: s1, senaryoBaslik: 'Senaryo 1', durum: 'basarili', hataMesaji: null });
  return { vt, ids: { proje, ortam, profil, veri, ekran, s1 } };
}

/** Hazırlık → uygulama kısayolu (tek makinede). */
async function aktar(hedef: Veritabani, kaynak: Veritabani, parola: string, secim: Parameters<typeof iceAktarmaUygula>[2]) {
  const hazirlik = await iceAktarmaHazirla(hedef, yedekOlustur(kaynak).veri, parola);
  return { hazirlik, sonuc: iceAktarmaUygula(hedef, hazirlik, secim, { yapan: 'birim-test' }) };
}

function onizlemeMetni(o: Onizleme): string {
  return JSON.stringify(o);
}

test.describe('Yedek içe aktarma — önizleme → seçim → uygulama', () => {
  test('boş veritabanı: önizleme tümü "yeni"; tümü uygulanınca tam yükleme (kasa dahil) yapılır', async () => {
    const klasor = geciciKlasor('ice-bos');
    try {
      const { vt: a, ids } = await kaynakOlustur();
      const hedefYol = join(klasor.yol, 'hedef.db');
      let hedef: Veritabani | null = null;
      const yonetici = new IceAktarmaYoneticisi({
        veritabani: async (olustur) => {
          if (hedef) return hedef;
          if (!olustur && !existsSync(hedefYol)) return null;
          hedef = await veritabaniniHazirla(hedefYol);
          return hedef;
        }
      });
      const id = yonetici.baslat(yedekOlustur(a).veri, PAROLA_A);
      const durum = await yonetici.bekle(id);
      expect(durum?.durum).toBe('hazir');
      expect(existsSync(hedefYol)).toBe(false); // önizleme dosya OLUŞTURMAZ
      const o = durum?.onizleme as Onizleme;
      expect(o.yerelBos).toBe(true);
      expect(o.kasaBenimsenecek).toBe(true);
      expect(o.toplam).toMatchObject({ degisen: 0, yalnizBurada: 0 });
      expect(o.varliklar.senaryolar.yeni.map((s) => s.id)).toEqual([ids.s1]);
      expect(o.varliklar.giris_profilleri.yeni[0].dosya.parola).toBe(MASKE);
      expect(o.varliklar.giris_profilleri.yeni[0].dosya.totp_gizli).toBe(MASKE);
      expect(o.eklenecekler.kosular).toEqual({ dosyada: 1, yeni: 1 });
      for (const gizli of GIZLILER) expect(onizlemeMetni(o).includes(gizli)).toBe(false);

      const sonuc = await yonetici.uygula(id, { tumu: true });
      expect(sonuc.tamYukleme).toBe(true);
      const h = hedef as unknown as Veritabani;
      expect(kasaDurumu(h)).toMatchObject({ olusturuldu: true, acik: true });
      expect(girisProfiliGetir(h, ids.profil, { coz: true })).toMatchObject({ parola: GIRIS_PAROLASI, totpGizli: TOTP });
      expect(sayimlar(h).kosu_sonuclari).toBe(1);
      // Hazırlık alanı atıldı; aynı iş tekrar uygulanamaz.
      expect(yonetici.durum(id)).toMatchObject({ durum: 'uygulandi', onizleme: null });
      expect(await yonetici.uygula(id, { tumu: true }).catch((e: unknown) => (e as YedekHatasi).kod)).toBe('DEGISTI');
      h.kapat();
      a.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('yeni / degisen / yalnizBurada, maskeli gizli değerler, alan farkları; yalnızca seçilenler uygulanır, üzerine yazılan geçmişe gider', async () => {
    const klasor = geciciKlasor('ice-secim');
    try {
      const { vt: a, ids } = await kaynakOlustur();
      // B: kendi kasası (farklı parola) ile A'nın ilk yedeğini tamamen almış makine.
      const hedefYol = join(klasor.yol, 'b.db');
      const b = await veritabaniniHazirla(hedefYol);
      await kasaOlustur(b, PAROLA_B, { kdf: HIZLI_KDF });
      const ilk = await aktar(b, a, PAROLA_A, { tumu: true });
      expect(ilk.sonuc.tamYukleme).toBe(false);
      expect(ilk.sonuc.varliklar.senaryolar.eklenen).toBe(1);
      expect(girisProfiliGetir(b, ids.profil, { coz: true })?.parola).toBe(GIRIS_PAROLASI); // B anahtarıyla yeniden şifrelendi

      // Aynı yedek tekrar: değişen yok, hepsi "aynı".
      const tekrar = await iceAktarmaHazirla(b, yedekOlustur(a).veri, PAROLA_A);
      expect(tekrar.onizleme.toplam).toMatchObject({ yeni: 0, degisen: 0, yalnizBurada: 0 });
      expect(tekrar.onizleme.eklenecekler.kosular).toEqual({ dosyada: 1, yeni: 0 });

      // A'da değişiklikler + yeni senaryo + yeni koşu; B'de yalnızca burada olan senaryo.
      senaryoKaydet(a, { id: ids.s1, projeId: ids.proje, ekranId: ids.ekran, baslik: 'Senaryo 1', icerik: { adim: 2, not: 'aynı' } });
      const s2 = senaryoKaydet(a, { projeId: ids.proje, ekranId: ids.ekran, baslik: 'Senaryo 2 (yeni)', icerik: { adim: 1 } });
      girisProfiliKaydet(a, { id: ids.profil, projeId: ids.proje, ortamId: ids.ortam, ad: 'Ana', kullaniciAdi: 'kullanici', parola: YENI_GIRIS_PAROLASI });
      const tur = String(a.tek('SELECT tur_id FROM test_verisi_profilleri WHERE id = ?', [ids.veri])?.tur_id);
      testVerisiProfiliKaydet(a, { id: ids.veri, projeId: ids.proje, turId: tur, ad: 'Hesap 1', degerler: { iban: YENI_IBAN, ad: 'Deneme' } });
      ortamKaydet(a, { id: ids.ortam, projeId: ids.proje, ad: 'Test', tabanUrl: YENI_URL, varsayilan: true });
      kosuOlustur(a, { projeId: ids.proje });
      const s3 = senaryoKaydet(b, { projeId: ids.proje, baslik: 'Yalnızca B', icerik: {} });
      senaryoKaydet(b, { id: ids.s1, projeId: ids.proje, ekranId: ids.ekran, baslik: 'Senaryo 1', icerik: { adim: 'B', not: 'aynı' } });

      const hazirlik = await iceAktarmaHazirla(b, yedekOlustur(a).veri, PAROLA_A);
      const o = hazirlik.onizleme;
      const sn = o.varliklar.senaryolar;
      expect(sn.yeni.map((s) => s.id)).toEqual([s2]);
      expect(sn.yalnizBurada.map((s) => s.id)).toEqual([s3]);
      expect(sn.degisen).toHaveLength(1);
      expect(sn.degisen[0]).toMatchObject({ id: ids.s1, baslik: 'Senaryo 1' });
      expect(sn.degisen[0].farklar).toEqual([{ alan: 'icerik_json.adim', yerel: 'B', dosya: 2 }]);
      expect((sn.degisen[0].yerel.icerik_json as Record<string, unknown>).adim).toBe('B');
      // Gizli alan: değişti ama iki taraf da maskeli.
      const profil = o.varliklar.giris_profilleri.degisen[0];
      expect(profil.farklar).toEqual([{ alan: 'parola', yerel: MASKE, dosya: MASKE, maskeli: true }]);
      const veri = o.varliklar.test_verisi_profilleri.degisen[0];
      expect(veri.farklar).toEqual([{ alan: 'degerler_json.iban', yerel: MASKE, dosya: MASKE, maskeli: true }]);
      // 'ozel' (gizli olmayan şifreli) sütun önizlemede çözülmüş görünür.
      expect(o.varliklar.ortamlar.degisen[0].farklar).toEqual([{ alan: 'taban_url', yerel: 'https://ilk-ortam.ornek.test', dosya: YENI_URL }]);
      expect(o.eklenecekler.kosular).toEqual({ dosyada: 2, yeni: 1 });
      for (const gizli of GIZLILER) expect(onizlemeMetni(o).includes(gizli), 'önizlemede gizli düz metin olmamalı').toBe(false);

      // Yalnızca S1'in dosya sürümü seçilir; S2, profil, test verisi, ortam seçilmez.
      const onceBaytBoyu = readFileSync(hedefYol).length;
      expect(onceBaytBoyu).toBeGreaterThan(0);
      const sonuc = iceAktarmaUygula(b, hazirlik, { secimler: { senaryolar: [ids.s1] } }, { yapan: 'birim-test' });
      expect(sonuc.varliklar.senaryolar).toEqual({ eklenen: 0, uzerineYazilan: 1, ayni: 0, atlanan: 0 });
      expect(sonuc.gecmiseYazilan).toBe(1);
      expect(sonuc.eklenenler.kosular).toMatchObject({ eklenen: 1, mevcut: 1 });
      expect(sonuc.eklenenler.kosu_sonuclari).toMatchObject({ eklenen: 0, mevcut: 1 });
      expect(senaryoGetir(b, ids.s1)?.icerik).toEqual({ adim: 2, not: 'aynı' });
      expect(senaryoGetir(b, s2)).toBeUndefined();
      expect(senaryoGetir(b, s3)?.baslik).toBe('Yalnızca B'); // yalnizBurada ASLA silinmez
      expect(girisProfiliGetir(b, ids.profil, { coz: true })?.parola).toBe(GIRIS_PAROLASI);
      expect(testVerisiProfiliGetir(b, ids.veri, { coz: true })?.degerler.iban).toBe(IBAN);
      expect(ortamlariListele(b, ids.proje)[0].tabanUrl).toBe('https://ilk-ortam.ornek.test');

      const gecmis = degisiklikGecmisiListele(b, 'senaryo', ids.s1).filter((g) => g.islem === 'ice_aktarma_uzerine_yazildi');
      expect(gecmis).toHaveLength(1);
      expect(gecmis[0].onceki?.icerik_json).toBe('{"adim":"B","not":"aynı"}');
      expect(gecmis[0].yapan).toBe('birim-test');

      // İkinci tur: gizli alanlı kayıtlar seçilir → üzerine yazılan yerel sürümlerin anlık görüntüsü şifreli kalır.
      const ikinci = await iceAktarmaHazirla(b, yedekOlustur(a).veri, PAROLA_A);
      iceAktarmaUygula(b, ikinci, { secimler: { giris_profilleri: [ids.profil], test_verisi_profilleri: [ids.veri], ortamlar: [ids.ortam] } });
      expect(girisProfiliGetir(b, ids.profil, { coz: true })?.parola).toBe(YENI_GIRIS_PAROLASI);
      expect(testVerisiProfiliGetir(b, ids.veri, { coz: true })?.degerler.iban).toBe(YENI_IBAN);
      const profilGecmisi = degisiklikGecmisiListele(b, 'giris_profili', ids.profil).find((g) => g.islem === 'ice_aktarma_uzerine_yazildi');
      expect(coz(b, String(profilGecmisi?.onceki?.parola))).toBe(GIRIS_PAROLASI);
      expect(degisiklikGecmisiListele(b, 'ortamlar', ids.ortam)).toHaveLength(1); // geçmiş türü olmayan tablo da kaydedilir
      const bayt = readFileSync(hedefYol);
      for (const deger of [...GIZLILER, YENI_URL, 'https://ilk-ortam.ornek.test']) {
        expect(bayt.includes(Buffer.from(deger, 'utf8')), 'uygulama sonrası DB dosyasında düz metin olmamalı').toBe(false);
      }
      b.kapat();
      a.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('seçilen kaydın gerekli üst kaydı (yeni proje/ekran) otomatik eklenir; geçersiz seçim reddedilir', async () => {
    const { vt: a, ids } = await kaynakOlustur();
    const b = await veritabaniniHazirla(null);
    await kasaOlustur(b, PAROLA_B, { kdf: HIZLI_KDF });
    const yeniProje = projeKaydet(a, { ad: 'Yeni Proje' });
    const yeniEkran = ekranKaydet(a, { projeId: yeniProje, anahtar: 'e', ad: 'E' });
    const senaryo = senaryoKaydet(a, { projeId: yeniProje, ekranId: yeniEkran, baslik: 'Yeni projede senaryo', icerik: {} });
    const hazirlik = await iceAktarmaHazirla(b, yedekOlustur(a).veri, PAROLA_A);
    expect(() => iceAktarmaUygula(b, hazirlik, { secimler: { senaryolar: ['olmayan-kimlik'] } })).toThrow(/dosyada olmayan/);
    expect(() => iceAktarmaUygula(b, hazirlik, { secimler: { bilinmeyen: [] } })).toThrow(/bilinmeyen varlık/);
    expect(() => iceAktarmaUygula(b, hazirlik, {})).toThrow(/Seçim gönderilmedi/);
    const sonuc = iceAktarmaUygula(b, hazirlik, { secimler: { senaryolar: [senaryo] } });
    expect(sonuc.otomatikEklenenUstKayitlar).toEqual(expect.arrayContaining([
      { tablo: 'projeler', id: yeniProje }, { tablo: 'ekranlar', id: yeniEkran }
    ]));
    expect(senaryoGetir(b, senaryo)?.ekranId).toBe(yeniEkran);
    expect(senaryoGetir(b, ids.s1)).toBeUndefined();
    // A'nın koşusu her zaman eklenir; projesi/ortamı B'ye alınmadığı için bu bağlantılar null'a çekilir.
    expect(sonuc.eklenenler.kosular).toMatchObject({ eklenen: 1, baglantisiKaldirilan: 2 });
    expect(sonuc.eklenenler.kosu_sonuclari).toMatchObject({ eklenen: 1, baglantisiKaldirilan: 1 });
    b.kapat();
    a.kapat();
  });

  test('yanlış parola: hiçbir şey hazırlanmaz; art arda yanlışta bekleme; iptal ve 1 saatlik süre dolumu hazırlığı atar', async () => {
    const { vt: a } = await kaynakOlustur();
    const b = await veritabaniniHazirla(null);
    await kasaOlustur(b, PAROLA_B, { kdf: HIZLI_KDF });
    let saat = 10_000_000;
    const sinir = new ParolaDenemeSiniri({ simdi: () => saat });
    const yonetici = new IceAktarmaYoneticisi({ veritabani: async () => b, denemeSiniri: sinir, simdi: () => saat });
    const yedek = yedekOlustur(a).veri;

    const yanlis = await yonetici.bekle(yonetici.baslat(yedek, 'yanlis-parola-99'));
    expect(yanlis).toMatchObject({ durum: 'hata', kod: 'PAROLA_YANLIS', onizleme: null });
    expect(yanlis?.mesaj).toMatch(/parola.*yanlış/i);
    expect(sayimlar(b).senaryolar).toBe(0);
    // Hemen ikinci deneme (doğru parolayla bile) bekleme süresi dolmadan reddedilir.
    expect(() => yonetici.baslat(yedek, PAROLA_A)).toThrow(KasaHatasi);
    try { yonetici.baslat(yedek, PAROLA_A); } catch (h) { expect((h as KasaHatasi).kod).toBe('COK_DENEME'); }
    saat += 1000;
    await yonetici.bekle(yonetici.baslat(yedek, 'yanlis-parola-98'));
    saat += 1000;
    expect(() => yonetici.baslat(yedek, PAROLA_A)).toThrow(/saniye bekleyip/); // ikinci hatadan sonra 2 sn
    saat += 1000;

    // Doğru parola: hazır; iptal edilince uygulanamaz.
    const id = yonetici.baslat(yedek, PAROLA_A);
    expect((await yonetici.bekle(id))?.durum).toBe('hazir');
    expect(sinir.ardisikHata).toBe(0);
    expect(yonetici.iptal(id)).toBe(true);
    expect(yonetici.durum(id)).toMatchObject({ durum: 'iptal', onizleme: null });
    expect(await yonetici.uygula(id, { tumu: true }).catch((e: unknown) => (e as YedekHatasi).kod)).toBe('DEGISTI');

    // Süre dolumu: 1 saat sonra iş ve hazırlık alanı silinir.
    const id2 = yonetici.baslat(yedek, PAROLA_A);
    await yonetici.bekle(id2);
    saat += 59 * 60 * 1000;
    expect(yonetici.durum(id2)?.durum).toBe('hazir');
    saat += 2 * 60 * 1000;
    expect(yonetici.durum(id2)).toBeUndefined();
    expect(await yonetici.uygula(id2, { tumu: true }).catch((e: unknown) => (e as YedekHatasi).kod)).toBe('BULUNAMADI');

    // Yeni yükleme, bekleyen (hazır) eski önizlemeyi atar.
    const id3 = yonetici.baslat(yedek, PAROLA_A);
    await yonetici.bekle(id3);
    const id4 = yonetici.baslat(yedek, PAROLA_A);
    expect(yonetici.durum(id3)?.durum).toBe('iptal');
    await yonetici.bekle(id4);
    expect(sayimlar(b).senaryolar).toBe(0); // hiçbiri uygulanmadı
    b.kapat();
    a.kapat();
  });

  test('v1 (şema 1) yedeğindeki düz metin şifreli sütunlar içe aktarılınca şifrelenir; önizlemede gizli olmayanlar görünür', async () => {
    const klasor = geciciKlasor('ice-v1');
    try {
      const v1 = await veritabaniAc(null);
      gocleriUygula(v1, { hedefSurum: 1 });
      await kasaOlustur(v1, PAROLA_A, { kdf: HIZLI_KDF });
      const z = '2026-01-01T00:00:00.000Z';
      v1.calistir('INSERT INTO projeler (id, ad, olusturulma, guncellenme) VALUES (?, ?, ?, ?)', ['p1', 'Proje', z, z]);
      v1.calistir('INSERT INTO ortamlar (id, proje_id, ad, taban_url, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?, ?)', ['o1', 'p1', 'Eski', YENI_URL, z, z]);
      const yedek = yedekOlustur(v1).veri; // manifest.semaSurumu = 1, ortam düz metin
      const yol = join(klasor.yol, 'hedef.db');
      const b = await veritabaniniHazirla(yol);
      await kasaOlustur(b, PAROLA_B, { kdf: HIZLI_KDF });
      const hazirlik = await iceAktarmaHazirla(b, yedek, PAROLA_A);
      expect(hazirlik.onizleme.yedek.semaSurumu).toBe(1);
      expect(hazirlik.onizleme.varliklar.ortamlar.yeni[0].dosya.taban_url).toBe(YENI_URL);
      expect(zarfMi(hazirlik.tablolar.ortamlar[0].taban_url)).toBe(true); // hazırlık alanında da şifreli
      iceAktarmaUygula(b, hazirlik, { tumu: true });
      expect(ortamlariListele(b, 'p1')[0].tabanUrl).toBe(YENI_URL);
      expect(readFileSync(yol).includes(Buffer.from(YENI_URL))).toBe(false);
      b.kapat();
      v1.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('yerel kasa kilitliyse hazırlık reddedilir; önizlemeden sonra kilitlenirse / parola değişirse uygulama reddedilir', async () => {
    const { vt: a } = await kaynakOlustur();
    const b = await veritabaniniHazirla(null);
    await kasaOlustur(b, PAROLA_B, { kdf: HIZLI_KDF });
    const yedek = yedekOlustur(a).veri;
    const hazirlik = await iceAktarmaHazirla(b, yedek, PAROLA_A);
    kasaKilitle(b);
    expect(() => iceAktarmaUygula(b, hazirlik, { tumu: true })).toThrow(/Kasa kilitli/);
    expect(await iceAktarmaHazirla(b, yedek, PAROLA_A).catch((e: unknown) => (e as KasaHatasi).kod)).toBe('KASA_KILITLI');
    expect(sayimlar(b).senaryolar).toBe(0);
    b.kapat();
    a.kapat();
  });
});
