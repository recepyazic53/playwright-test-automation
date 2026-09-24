// KORUMA TESTLERİ — genişletilmiş şifreleme (şema v2, gocler.mjs > SIFRELI_ALANLAR):
// şifreli sütunlarda diskte / geçmişte / yedekte düz metin OLMAMASI, v1 düz metninin kasa ilk
// açıldığında şifrelenmesi, kilitli kasada açık hatalar ve gizli olmayan durum özeti, parola
// değişiminde tüm şifreli sütunların yeniden şifrelenmesi, kaba kuvvet koruması.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { veritabaniAc, type Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { GUNCEL_SEMA_SURUMU, SIFRELI_ALANLAR, TABLOLAR, gocleriUygula, mevcutSemaSurumu } from '../../scripts/platform/veritabani/gocler.mjs';
import {
  HASSAS_SUTUNLAR,
  KasaHatasi,
  ParolaDenemeSiniri,
  coz,
  kasaAc,
  kasaKilitle,
  kasaOlustur,
  parolaDegistir,
  zarfMi
} from '../../scripts/platform/kasa.mjs';
import {
  ayarGetir,
  ayarYaz,
  baglamProfiliGetir,
  baglamProfiliKaydet,
  baglamProfilleriniListele,
  degisiklikGecmisiListele,
  girisProfiliGetir,
  girisProfiliKaydet,
  girisProfilleriniListele,
  kosuOlustur,
  makineleriListele,
  ortamKaydet,
  ortamlariListele,
  platformDurumOzeti,
  projeKaydet,
  senaryoKaydet,
  veritabaniniHazirla,
  yerelMakine
} from '../../scripts/platform/veritabani/depo.mjs';
import { yedekAc, yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { HIZLI_KDF, geciciKlasor, loglariYakala, type LogYakalayici } from './platform-ortak';

const PAROLA = 'Sifreleme-Kasa-Parolasi-26';
const YENI_PAROLA = 'Sifreleme-Yeni-Parola-27';
const ORTAM_ADI = 'OrtamAdiOzel7731';
const ORTAM_URL = 'https://ozel-ortam-7731.ornek.test';
const KULLANICI = 'kullanici-ozel-7731';
const SMS_NO = '+905550007731';
const BAGLAM_KODU = 'BAGLAMKODU7731';
const AYAR_DEGERI = 'AYARDEGERI7731';
const GIRIS_PAROLASI = 'GirisParolasi!7731';
const OZEL_DEGERLER = [ORTAM_ADI, ORTAM_URL, KULLANICI, SMS_NO, BAGLAM_KODU, AYAR_DEGERI, GIRIS_PAROLASI];

let log: LogYakalayici;
test.beforeEach(() => {
  log = loglariYakala();
});
test.afterEach(() => {
  log.birak();
  log.gizliYokMu([PAROLA, YENI_PAROLA, GIRIS_PAROLASI]);
});

async function kasaHatasiKodu(islem: () => Promise<unknown> | unknown): Promise<string> {
  try {
    await islem();
  } catch (hata) {
    expect(hata).toBeInstanceOf(KasaHatasi);
    return (hata as KasaHatasi).kod;
  }
  throw new Error('Hata bekleniyordu');
}

function duzMetinYok(bayt: Buffer, degerler: readonly string[], neresi: string): void {
  for (const deger of degerler) {
    expect(bayt.includes(Buffer.from(deger, 'utf8')), `"${deger.slice(0, 6)}…" ${neresi} içinde düz metin olmamalı`).toBe(false);
  }
}

/** SIFRELI_ALANLAR'daki her sütunun her dolu değeri zarf olmalı (tablo satırları + geçmiş anlık görüntüleri). */
function tumSifreliSutunlarZarf(tablolar: Record<string, Record<string, unknown>[]>): number {
  let sayi = 0;
  for (const [tablo, alanlar] of Object.entries(SIFRELI_ALANLAR)) {
    for (const satir of tablolar[tablo] ?? []) {
      for (const sutun of Object.keys(alanlar)) {
        const deger = satir[sutun];
        if (deger === null || deger === '' || deger === undefined) continue;
        expect(zarfMi(deger), `${tablo}.${sutun} zarf olmalı`).toBe(true);
        sayi++;
      }
    }
  }
  const turTablo = new Map(TABLOLAR.flatMap((t) => (t.gecmisTuru ? [[t.gecmisTuru, t.ad] as const] : [])));
  for (const g of tablolar.degisiklik_gecmisi ?? []) {
    const tablo = turTablo.get(String(g.varlik_turu)) ?? String(g.varlik_turu);
    for (const anlikMetni of [g.onceki_json, g.sonraki_json]) {
      if (typeof anlikMetni !== 'string') continue;
      const anlik = JSON.parse(anlikMetni) as Record<string, unknown>;
      for (const sutun of Object.keys(SIFRELI_ALANLAR[tablo] ?? {})) {
        const deger = anlik[sutun];
        if (deger === null || deger === '' || deger === undefined) continue;
        expect(zarfMi(deger), `geçmiş ${tablo}.${sutun} zarf olmalı`).toBe(true);
        sayi++;
      }
    }
  }
  return sayi;
}

function tabloDokumu(vt: Veritabani): Record<string, Record<string, unknown>[]> {
  return Object.fromEntries(TABLOLAR.map((t) => [t.ad, vt.tumu(`SELECT * FROM ${t.ad}`)]));
}

async function ornekVeri(vt: Veritabani): Promise<{ proje: string; ortam: string; profil: string; baglam: string }> {
  const proje = projeKaydet(vt, { ad: 'Açık Proje Adı' });
  const ortam = ortamKaydet(vt, { projeId: proje, ad: ORTAM_ADI, tabanUrl: ORTAM_URL, varsayilan: true });
  const profil = girisProfiliKaydet(vt, {
    projeId: proje, ortamId: ortam, ad: 'Profil', kullaniciAdi: KULLANICI, parola: GIRIS_PAROLASI,
    ikiAsamaliTur: 'sms', smsAyari: { telefon: SMS_NO }
  });
  // Güncelleme → geçmişe önce/sonra anlık görüntüsü yazılır.
  girisProfiliKaydet(vt, { id: profil, projeId: proje, ad: 'Profil 2', kullaniciAdi: KULLANICI, smsAyari: { telefon: SMS_NO } });
  const baglam = baglamProfiliKaydet(vt, { projeId: proje, tur: 'rol', ad: 'Görünen Ad', alanlar: { kod: BAGLAM_KODU } });
  baglamProfiliKaydet(vt, { id: baglam, projeId: proje, tur: 'rol', ad: 'Görünen Ad', alanlar: { kod: BAGLAM_KODU, ek: 1 } });
  ayarYaz(vt, 'genel', { deger: AYAR_DEGERI });
  yerelMakine(vt);
  return { proje, ortam, profil, baglam };
}

test.describe('Genişletilmiş şifreleme (şema v2)', () => {
  test('SIFRELI_ALANLAR tek kaynak: beklenen sütunlar, gizli olanlar HASSAS_SUTUNLAR ile aynı', () => {
    expect(GUNCEL_SEMA_SURUMU).toBe(2);
    expect(Object.fromEntries(Object.entries(SIFRELI_ALANLAR).map(([t, a]) => [t, Object.keys(a).sort()]))).toEqual({
      makineler: ['ad'],
      ayarlar: ['deger_json'],
      ortamlar: ['ad', 'taban_url'],
      giris_profilleri: ['kullanici_adi', 'parola', 'sms_ayari_json', 'totp_gizli'],
      baglam_profilleri: ['alanlar_json']
    });
    expect(HASSAS_SUTUNLAR).toEqual({ giris_profilleri: ['parola', 'totp_gizli'] });
  });

  test('şifreli sütunlar DB dosyasında, geçmiş anlık görüntülerinde ve yedekte düz metin olarak durmaz', async () => {
    const klasor = geciciKlasor('sifre-disk');
    try {
      const yol = join(klasor.yol, 'platform.db');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      const ids = await ornekVeri(vt);

      const bayt = readFileSync(yol);
      duzMetinYok(bayt, OZEL_DEGERLER, 'veritabanı dosyası');
      expect(bayt.includes(Buffer.from('Açık Proje Adı', 'utf8'))).toBe(true); // proje adı bilinçli olarak açık
      expect(bayt.includes(Buffer.from('Görünen Ad', 'utf8'))).toBe(true); // bağlam adı açık (liste için)
      expect(tumSifreliSutunlarZarf(tabloDokumu(vt))).toBeGreaterThanOrEqual(10);
      const gecmis = degisiklikGecmisiListele(vt, 'giris_profili', ids.profil);
      expect(zarfMi(gecmis[1].onceki?.kullanici_adi)).toBe(true);
      expect(zarfMi(gecmis[1].onceki?.sms_ayari_json)).toBe(true);

      // Okuma (kasa açık) düz metni döner.
      expect(ortamlariListele(vt, ids.proje)[0]).toMatchObject({ ad: ORTAM_ADI, tabanUrl: ORTAM_URL });
      expect(girisProfiliGetir(vt, ids.profil)).toMatchObject({ kullaniciAdi: KULLANICI, smsAyari: { telefon: SMS_NO }, parola: null });
      expect(baglamProfiliGetir(vt, ids.baglam)?.alanlar).toEqual({ kod: BAGLAM_KODU, ek: 1 });
      expect(ayarGetir(vt, 'genel')).toEqual({ deger: AYAR_DEGERI });
      expect(makineleriListele(vt)[0].ad).toBe(yerelMakine(vt).ad);

      // Yedek: dosya bütünüyle şifreli; açıldığında da sütunlar zarf olarak durur.
      const { veri } = yedekOlustur(vt);
      duzMetinYok(veri, OZEL_DEGERLER, 'yedek dosyası');
      const acik = await yedekAc(veri, PAROLA);
      acik.kasaAnahtari.fill(0);
      expect(tumSifreliSutunlarZarf(acik.tablolar)).toBeGreaterThanOrEqual(10);
      duzMetinYok(Buffer.from(JSON.stringify(acik.tablolar), 'utf8'), OZEL_DEGERLER, 'yedeğin açılmış içeriği');
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('v1 veritabanındaki düz metin: göç sonrası kasa İLK açıldığında şifrelenir, meta\'da tamamlandı işaretlenir', async () => {
    const klasor = geciciKlasor('sifre-goc');
    try {
      const yol = join(klasor.yol, 'platform.db');
      // A1 (şema v1) ile oluşturulmuş, kasası olan ve düz metin veri içeren bir veritabanı.
      const v1 = await veritabaniAc(yol);
      gocleriUygula(v1, { hedefSurum: 1 });
      expect(mevcutSemaSurumu(v1)).toBe(1);
      await kasaOlustur(v1, PAROLA, { kdf: HIZLI_KDF });
      kasaKilitle(v1);
      const z = '2026-01-01T00:00:00.000Z';
      v1.islem(() => {
        v1.calistir('INSERT INTO makineler (id, ad, olusturulma) VALUES (?, ?, ?)', ['m-eski', 'EskiMakineAdi7731', z]);
        v1.calistir('INSERT INTO projeler (id, ad, olusturulma, guncellenme) VALUES (?, ?, ?, ?)', ['p1', 'Proje', z, z]);
        v1.calistir('INSERT INTO ortamlar (id, proje_id, ad, taban_url, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?, ?)',
          ['o1', 'p1', ORTAM_ADI, ORTAM_URL, z, z]);
        v1.calistir('INSERT INTO giris_profilleri (id, proje_id, ad, kullanici_adi, sms_ayari_json, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['g1', 'p1', 'Profil', KULLANICI, JSON.stringify({ telefon: SMS_NO }), z, z]);
        v1.calistir('INSERT INTO baglam_profilleri (id, proje_id, tur, ad, alanlar_json, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['b1', 'p1', 'rol', 'Rol', JSON.stringify({ kod: BAGLAM_KODU }), z, z]);
        v1.calistir('INSERT INTO ayarlar (anahtar, deger_json, guncellenme) VALUES (?, ?, ?)', ['genel', JSON.stringify(AYAR_DEGERI), z]);
        v1.calistir(
          `INSERT INTO degisiklik_gecmisi (id, varlik_turu, varlik_id, islem, yapan, zaman, onceki_json, sonraki_json)
           VALUES (?, 'giris_profili', 'g1', 'guncelle', 'birim', ?, ?, ?)`,
          ['h1', z, JSON.stringify({ id: 'g1', kullanici_adi: KULLANICI, sms_ayari_json: '{}' }),
            JSON.stringify({ id: 'g1', kullanici_adi: KULLANICI, sms_ayari_json: JSON.stringify({ telefon: SMS_NO }) })]
        );
      });
      v1.kapat();
      expect(readFileSync(yol).includes(Buffer.from(ORTAM_URL))).toBe(true); // v1: düz metin (başlangıç durumu)

      // Yeni sürümle açılış: v2 göçü uygulanır; kasa kilitli olduğu için düz metin henüz duruyor.
      const vt = await veritabaniniHazirla(yol);
      expect(mevcutSemaSurumu(vt)).toBe(2);
      expect(platformDurumOzeti(vt)).toMatchObject({ semaSurumu: 2, sifreliAlanGocu: 'bekliyor', kasa: { olusturuldu: true, acik: false } });
      expect(await kasaHatasiKodu(() => ortamlariListele(vt, 'p1'))).toBe('KASA_KILITLI');

      await kasaAc(vt, PAROLA);
      expect(platformDurumOzeti(vt).sifreliAlanGocu).toBe('tamam');
      expect(vt.metaOku('sifreli_alan_gocu')).toBe('tamam');
      duzMetinYok(readFileSync(yol), [...OZEL_DEGERLER, 'EskiMakineAdi7731'], 'göç sonrası veritabanı dosyası');
      expect(tumSifreliSutunlarZarf(tabloDokumu(vt))).toBeGreaterThanOrEqual(9);
      // Değerler kaybolmadı: çözülünce aynısı.
      expect(ortamlariListele(vt, 'p1')[0]).toMatchObject({ ad: ORTAM_ADI, tabanUrl: ORTAM_URL });
      expect(girisProfiliGetir(vt, 'g1')).toMatchObject({ kullaniciAdi: KULLANICI, smsAyari: { telefon: SMS_NO } });
      expect(ayarGetir(vt, 'genel')).toBe(AYAR_DEGERI);
      const anlik = degisiklikGecmisiListele(vt, 'giris_profili', 'g1')[0].sonraki;
      expect(coz(vt, String(anlik?.kullanici_adi))).toBe(KULLANICI);
      expect(makineleriListele(vt).find((m) => m.id === 'm-eski')?.ad).toBe('EskiMakineAdi7731');
      // Geçmiş tablosu v2'de yeni işlem türünü kabul eder.
      vt.calistir(`INSERT INTO degisiklik_gecmisi (id, varlik_turu, varlik_id, islem, yapan, zaman) VALUES ('h2', 'senaryo', 's', 'ice_aktarma_uzerine_yazildi', 'birim', ?)`, [z]);
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('kasası hiç olmayan v1 veritabanı: kasa oluşturulunca düz metin şifrelenir', async () => {
    const v1 = await veritabaniAc(null);
    gocleriUygula(v1, { hedefSurum: 1 });
    const z = '2026-01-01T00:00:00.000Z';
    v1.calistir('INSERT INTO projeler (id, ad, olusturulma, guncellenme) VALUES (?, ?, ?, ?)', ['p1', 'Proje', z, z]);
    v1.calistir('INSERT INTO ortamlar (id, proje_id, ad, taban_url, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?, ?)', ['o1', 'p1', ORTAM_ADI, ORTAM_URL, z, z]);
    gocleriUygula(v1);
    expect(await kasaHatasiKodu(() => ortamKaydet(v1, { projeId: 'p1', ad: 'x', tabanUrl: 'https://x.test' }))).toBe('KASA_YOK');
    await kasaOlustur(v1, PAROLA, { kdf: HIZLI_KDF });
    const satir = v1.tek('SELECT ad, taban_url FROM ortamlar');
    expect(zarfMi(satir?.ad) && zarfMi(satir?.taban_url)).toBe(true);
    expect(ortamlariListele(v1, 'p1')[0].tabanUrl).toBe(ORTAM_URL);
    v1.kapat();
  });

  test('kilitli kasa: şifreli sütunlar okunamaz/yazılamaz (açık Türkçe hata); durum özeti ve açık veriler çalışır', async () => {
    const vt = await veritabaniniHazirla(null);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    const ids = await ornekVeri(vt);
    kasaKilitle(vt);

    const islemler: Array<[string, () => unknown]> = [
      ['ortam yaz', () => ortamKaydet(vt, { projeId: ids.proje, ad: 'Yeni', tabanUrl: 'https://yeni.test' })],
      ['ortam oku', () => ortamlariListele(vt, ids.proje)],
      ['giriş profili yaz', () => girisProfiliKaydet(vt, { id: ids.profil, projeId: ids.proje, ad: 'p', kullaniciAdi: 'k' })],
      ['giriş profili oku', () => girisProfiliGetir(vt, ids.profil)],
      ['giriş profili listele', () => girisProfilleriniListele(vt, ids.proje)],
      ['bağlam yaz', () => baglamProfiliKaydet(vt, { projeId: ids.proje, tur: 'rol', ad: 'x', alanlar: {} })],
      ['bağlam oku', () => baglamProfiliGetir(vt, ids.baglam)],
      ['bağlam listele', () => baglamProfilleriniListele(vt, ids.proje)],
      ['ayar yaz', () => ayarYaz(vt, 'x', 1)],
      ['ayar oku', () => ayarGetir(vt, 'genel')],
      ['makine listele', () => makineleriListele(vt)]
    ];
    for (const [ad, islem] of islemler) {
      try {
        islem();
        throw new Error(`${ad}: hata bekleniyordu`);
      } catch (hata) {
        expect(hata, ad).toBeInstanceOf(KasaHatasi);
        expect((hata as KasaHatasi).kod, ad).toBe('KASA_KILITLI');
        expect((hata as Error).message).toContain('Kasa kilitli');
      }
    }
    // Açık kalan veriler ve durum kilitliyken de çalışır; çökme yok.
    expect(baglamProfilleriniListele(vt, ids.proje, undefined, { yalnizAd: true })).toEqual([
      expect.objectContaining({ tur: 'rol', ad: 'Görünen Ad', alanlar: null })
    ]);
    senaryoKaydet(vt, { projeId: ids.proje, baslik: 'Kilitliyken senaryo', icerik: { adim: 1 } });
    kosuOlustur(vt, { projeId: ids.proje, ortamId: ids.ortam });
    expect(yerelMakine(vt).id).toBeTruthy();
    const durum = platformDurumOzeti(vt);
    expect(durum).toMatchObject({ kasa: { olusturuldu: true, acik: false }, sifreliAlanGocu: 'tamam' });
    expect(durum.sayimlar.ortamlar).toBe(1);
    duzMetinYok(Buffer.from(JSON.stringify(durum), 'utf8'), OZEL_DEGERLER, 'durum özeti');
    vt.kapat();
  });

  test('parola değişimi SIFRELI_ALANLAR\'daki tüm sütunları (geçmiş dahil) yeniden şifreler', async () => {
    const klasor = geciciKlasor('sifre-parola');
    try {
      const yol = join(klasor.yol, 'platform.db');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      await ornekVeri(vt);
      const once = tabloDokumu(vt);
      const eskiZarflar: string[] = [];
      for (const [tablo, alanlar] of Object.entries(SIFRELI_ALANLAR)) {
        for (const satir of once[tablo]) for (const s of Object.keys(alanlar)) if (zarfMi(satir[s])) eskiZarflar.push(String(satir[s]));
      }
      expect(eskiZarflar.length).toBeGreaterThanOrEqual(8);

      const sonuc = await parolaDegistir(vt, PAROLA, YENI_PAROLA);
      expect(sonuc.yenidenSifrelenen).toBeGreaterThanOrEqual(eskiZarflar.length);
      const bayt = readFileSync(yol);
      for (const z of eskiZarflar) expect(bayt.includes(Buffer.from(z)), 'eski zarf diskte kalmamalı').toBe(false);
      const sonra = tabloDokumu(vt);
      tumSifreliSutunlarZarf(sonra);
      for (const [tablo, alanlar] of Object.entries(SIFRELI_ALANLAR)) {
        for (const satir of sonra[tablo]) {
          for (const s of Object.keys(alanlar)) if (zarfMi(satir[s])) expect(() => coz(vt, String(satir[s]))).not.toThrow();
        }
      }
      vt.kapat();
      const tekrar = await veritabaniniHazirla(yol);
      await kasaAc(tekrar, YENI_PAROLA);
      expect(ayarGetir(tekrar, 'genel')).toEqual({ deger: AYAR_DEGERI });
      tekrar.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('kaba kuvvet koruması: art arda yanlış parolada 1, 2, 4 ... 30 sn bekleme; doğru parola sıfırlar', async () => {
    let saat = 1_000_000;
    const sinir = new ParolaDenemeSiniri({ simdi: () => saat });
    const beklemeler: number[] = [];
    for (let i = 0; i < 8; i++) {
      sinir.kontrolEt();
      beklemeler.push(sinir.basarisiz());
      const hata = (() => { try { sinir.kontrolEt(); return null; } catch (h) { return h as KasaHatasi; } })();
      expect(hata?.kod).toBe('COK_DENEME');
      expect(hata?.message).toMatch(/saniye bekleyip/);
      saat += beklemeler[i];
    }
    expect(beklemeler).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    sinir.basarili();
    expect(sinir.kalanMs()).toBe(0);
    expect(sinir.basarisiz()).toBe(1000);

    // Kasa açma ile: yanlış parola → hemen gelen (doğru olsa bile) deneme reddedilir, parola denenmez.
    const vt = await veritabaniniHazirla(null);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    kasaKilitle(vt);
    let zaman = 5_000_000;
    const kasaSiniri = new ParolaDenemeSiniri({ simdi: () => zaman });
    expect(await kasaHatasiKodu(() => kasaSiniri.dene(() => kasaAc(vt, 'yanlis-parola-1')))).toBe('PAROLA_YANLIS');
    const cok = await kasaSiniri.dene(() => kasaAc(vt, PAROLA)).catch((h: unknown) => h as KasaHatasi);
    expect((cok as KasaHatasi).kod).toBe('COK_DENEME');
    expect((cok as KasaHatasi).bekleSaniye).toBe(1);
    zaman += 1000;
    expect(await kasaHatasiKodu(() => kasaSiniri.dene(() => kasaAc(vt, 'yanlis-parola-2')))).toBe('PAROLA_YANLIS');
    zaman += 1500;
    expect(((await kasaSiniri.dene(() => kasaAc(vt, PAROLA)).catch((h: unknown) => h)) as KasaHatasi).kod).toBe('COK_DENEME');
    zaman += 500;
    await kasaSiniri.dene(() => kasaAc(vt, PAROLA));
    expect(kasaSiniri.ardisikHata).toBe(0);
    vt.kapat();
  });
});
