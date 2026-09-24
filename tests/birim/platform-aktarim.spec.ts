// KORUMA TESTLERİ — genel aktarım motoru (scripts/platform/aktarim/motor.mjs), SAHTE bir paketle
// (hiçbir projeye bağlı değil): kararlı kimlikler, tekrar çalıştırmada çift kayıt olmaması
// (atlananların raporlanması), veritabanı düzenlemelerinin korunması, kaynaktan kalkanların
// silinmesi/korunması, ortam haritasının kimliğe çevrilmesi ve gizli değerlerin diskte düz metin
// olmaması. Tarayıcı AÇMAZ.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { KasaHatasi, kasaKilitle, kasaOlustur, zarfMi } from '../../scripts/platform/kasa.mjs';
import {
  baglamProfiliKaydet, baglamProfilleriniListele, ekranAyarlariniGetir, ekranlariListele, girisProfiliGetir,
  kaynakEslemeleriniListele, ortamlariListele, senaryoGetir, senaryolariListele, testVerisiProfilleriniListele,
  veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import {
  aktarilmisProjeyiBul, aktarimiOnizle, aktarimiUygula, kararliKimlik, zarflariCoz, type AktarimPaketi
} from '../../scripts/platform/aktarim/motor.mjs';
import { HIZLI_KDF, geciciKlasor, loglariYakala, type LogYakalayici } from './platform-ortak';

const PAROLA = 'Aktarim-Kasa-Parolasi-2026';
const GIRIS_PAROLASI = 'GirisParolasi!Aktarim-5531';
const TOTP = 'JBSWY3DPEHPKAKTARIM';
const KIMLIK_NO = '98765432109';
const KART_NO = '4111999988887777';
const ACENTE_KODU = 'ACENTE-KODU-4471';
const ORTAM_URL = 'https://aktarim-ornek.invalid/giris';
const GIZLILER = [PAROLA, GIRIS_PAROLASI, TOTP, KIMLIK_NO, KART_NO, ACENTE_KODU, ORTAM_URL];

function ornekPaket(degistir: (p: AktarimPaketi) => void = () => {}): AktarimPaketi {
  const paket: AktarimPaketi = {
    surum: 1,
    adaptor: 'birim-adaptoru',
    proje: { ad: 'Birim Projesi' },
    projeAyarlari: { kosuListesiOzeti: 'ozet-1' },
    gizliOzetler: { dosyalar: 'dosya-ozeti' },
    ortamlar: [
      { anahtar: 'a', ad: 'A', tabanUrl: ORTAM_URL, varsayilan: true, ayarlar: { bilgi: 1 } },
      { anahtar: 'b', ad: 'B', tabanUrl: 'https://b.invalid/' }
    ],
    girisProfilleri: [
      { anahtar: 'a', ortam: 'a', ad: 'A kullanıcısı', kullaniciAdi: 'kullanici', parola: GIRIS_PAROLASI, ikiAsamaliTur: 'totp', totpGizli: TOTP }
    ],
    baglamProfilleri: [
      { anahtar: 'rol1', ortam: null, tur: 'Rol', ad: 'rol1', alanlar: { kod: ACENTE_KODU } },
      { anahtar: 'rol2@b', ortam: 'b', tur: 'Rol', ad: 'rol2', alanlar: { kod: 'x' } }
    ],
    testVerisiTurleri: [
      { anahtar: 'kisi', ad: 'Kişi', alanlar: [{ ad: 'kimlikNo', hassas: true }, { ad: 'sehir' }] },
      { anahtar: 'kart', ad: 'Kart', alanlar: [{ ad: 'kartNo', hassas: true }] }
    ],
    testVerisiProfilleri: [
      { anahtar: 'kisi:k1', tur: 'kisi', ortam: null, ad: 'k1', degerler: { kimlikNo: KIMLIK_NO, sehir: 'Ankara' } },
      { anahtar: 'kart:ortak@a', tur: 'kart', ortam: 'a', ad: 'ortak', degerler: { kartNo: KART_NO } }
    ],
    ekranlar: [
      { anahtar: 'form', ekranAnahtari: 'form', ad: 'Form', ayarlar: { ortamlar: { a: { alan: 1 }, b: { alan: 2 } } }, model: { semaSurumu: 1, ad: 'Form' } }
    ],
    senaryolar: [
      { anahtar: 'x.spec.ts::S1', ekran: 'form', baslik: 'S1', kosuyaDahil: true,
        icerik: { kaynak: { dosya: 'x.spec.ts', ad: 'S1' }, ortamlar: { a: { sira: 0, veri: { baslik: 'S1', kimlik: { kimlikNo: KIMLIK_NO } } } } } },
      { anahtar: 'x.spec.ts::S2', ekran: 'form', baslik: 'S2', kosuyaDahil: false, icerik: { kaynak: { dosya: 'x.spec.ts', ad: 'S2' }, ortamlar: { a: {}, b: {} } } }
    ],
    uyarilar: []
  };
  degistir(paket);
  return paket;
}

let log: LogYakalayici;
test.beforeEach(() => { log = loglariYakala(); });
test.afterEach(() => { log.birak(); log.gizliYokMu(GIZLILER); });

test.describe('Aktarım motoru (genel)', () => {
  test('ilk aktarım: varlıklar kararlı kimliklerle oluşur, gizliler diskte düz metin değil, ortam haritası kimliğe çevrilir', async () => {
    const klasor = geciciKlasor('aktarim-ilk');
    try {
      const yol = join(klasor.yol, 'platform.db');
      const vt = await veritabaniniHazirla(yol);
      // Kasa yokken önizleme: her şey yeni, gizli değer yok.
      const on = aktarimiOnizle(null, ornekPaket());
      expect(on.sayimlar.senaryo).toMatchObject({ toplam: 2, yeni: 2 });
      expect(JSON.stringify(on)).not.toContain(GIRIS_PAROLASI);
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      const sonuc = aktarimiUygula(vt, ornekPaket());
      const proje = aktarilmisProjeyiBul(vt, 'birim-adaptoru');
      expect(proje?.id).toBe(kararliKimlik('proje', 'birim-adaptoru'));
      expect(sonuc.projeId).toBe(proje?.id);
      const projeId = sonuc.projeId;
      const ortamlar = ortamlariListele(vt, projeId);
      expect(ortamlar.map((o) => o.ad).sort()).toEqual(['A', 'B']);
      const ortamA = ortamlar.find((o) => o.ad === 'A');
      expect(ortamA?.id).toBe(kararliKimlik(projeId, 'ortam', 'a'));
      expect(ortamA?.ayarlar).toEqual({ bilgi: 1 });
      const giris = girisProfiliGetir(vt, kararliKimlik(projeId, 'giris_profili', 'a'), { coz: true });
      expect(giris).toMatchObject({ ortamId: ortamA?.id, parola: GIRIS_PAROLASI, ikiAsamaliTur: 'totp', totpGizli: TOTP });
      expect(baglamProfilleriniListele(vt, projeId, 'Rol').map((b) => [b.ad, b.ortamId === null])).toEqual([['rol1', true], ['rol2', false]]);
      expect(testVerisiProfilleriniListele(vt, projeId).find((p) => p.ad === 'k1')?.degerler).toEqual({ kimlikNo: null, sehir: null }); // tüm test verisi alanları varsayılan olarak hassas
      const ekran = ekranlariListele(vt, projeId)[0];
      const ortamB = ortamlar.find((o) => o.ad === 'B');
      expect(ekranAyarlariniGetir(vt, ekran.id)).toEqual({ ortamlar: { [String(ortamA?.id)]: { alan: 1 }, [String(ortamB?.id)]: { alan: 2 } } });
      const s1 = senaryoGetir(vt, kararliKimlik(projeId, 'senaryo', 'x.spec.ts::S1'));
      expect(s1?.kosuyaDahil).toBe(true);
      const icerik = s1?.icerik as { kaynak: unknown; ortamlar: Record<string, { veri: { kimlik: { kimlikNo: string } } }> };
      expect(icerik.kaynak).toEqual({ dosya: 'x.spec.ts', ad: 'S1' }); // kaynak işaretçisi açık
      const hassas = icerik.ortamlar[String(ortamA?.id)].veri.kimlik.kimlikNo;
      expect(zarfMi(hassas)).toBe(true); // türde hassas işaretli alan adı → zarf
      expect(zarflariCoz(vt, icerik)).toMatchObject({ ortamlar: { [String(ortamA?.id)]: { veri: { kimlik: { kimlikNo: KIMLIK_NO } } } } });
      expect(senaryoGetir(vt, kararliKimlik(projeId, 'senaryo', 'x.spec.ts::S2'))?.kosuyaDahil).toBe(false);
      expect(kaynakEslemeleriniListele(vt, projeId, 'senaryo').map((e) => e.kaynakAnahtari)).toEqual(['x.spec.ts::S1', 'x.spec.ts::S2']);
      const bayt = readFileSync(yol);
      for (const gizli of GIZLILER) expect(bayt.includes(Buffer.from(gizli)), 'veritabanı dosyasında düz metin olmamalı').toBe(false);
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('tekrar aktarım çift kayıt üretmez; kaynağı aynı kalanlarda veritabanı düzenlemesi korunur, değişenler güncellenir, kalkanlar silinir/korunur', async () => {
    const klasor = geciciKlasor('aktarim-tekrar');
    try {
      const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      const { projeId } = aktarimiUygula(vt, ornekPaket());
      const say = () => vt.tek('SELECT (SELECT COUNT(*) FROM senaryolar) s, (SELECT COUNT(*) FROM baglam_profilleri) b, (SELECT COUNT(*) FROM ortamlar) o, (SELECT COUNT(*) FROM ekran_modelleri) m, (SELECT COUNT(*) FROM kaynak_eslemeleri) k');
      const ilkSayim = say();

      const ikinci = aktarimiUygula(vt, ornekPaket());
      expect(say()).toEqual(ilkSayim);
      expect(ikinci.atlananlar.ayni.length).toBe(Object.values(ikinci.sayimlar).reduce((t, x) => t + x.toplam, 0));
      expect(Object.values(ikinci.sayimlar).every((x) => x.yeni === 0 && x.guncellenecek === 0)).toBe(true);

      // Veritabanında elle düzenleme (kaynak aynı) → korunur.
      const rol1 = baglamProfilleriniListele(vt, projeId, 'Rol').find((b) => b.ad === 'rol1');
      baglamProfiliKaydet(vt, { id: rol1?.id, projeId, tur: 'Rol', ad: 'rol1', alanlar: { kod: 'ELLE-DUZENLENDI' } });
      // Kaynakta: S1 başlığı aynı ama verisi değişti, S2 kalktı, B ortamı kalktı, yeni S3 eklendi.
      const paket = ornekPaket((p) => {
        const s1 = p.senaryolar[0].icerik.ortamlar as Record<string, { veri: Record<string, unknown> }>;
        s1.a.veri = { ...s1.a.veri, yeniAlan: true };
        p.senaryolar = [p.senaryolar[0], { anahtar: 'x.spec.ts::S3', ekran: null, baslik: 'S3', kosuyaDahil: true, icerik: { ortamlar: { a: {} } } }];
        p.ortamlar = [p.ortamlar[0]];
        p.baglamProfilleri = [p.baglamProfilleri[0]];
      });
      const on = aktarimiOnizle(vt, paket);
      expect(on.sayimlar.senaryo).toMatchObject({ toplam: 2, yeni: 1, guncellenecek: 1, kaldirilacak: 1 });
      expect(on.sayimlar.ortam).toMatchObject({ ayni: 1, kaynaktaYok: 1 });
      const uc = aktarimiUygula(vt, paket);
      expect(uc.kaldirilanlar.sort()).toEqual(['baglam_profili:rol2@b', 'senaryo:x.spec.ts::S2']);
      expect(uc.kaynaktaYok).toEqual(['ortam:b']);
      expect(ortamlariListele(vt, projeId)).toHaveLength(2); // ortam otomatik silinmez
      expect(baglamProfilleriniListele(vt, projeId, 'Rol').find((b) => b.ad === 'rol1')?.alanlar).toEqual({ kod: 'ELLE-DUZENLENDI' });
      expect(senaryolariListele(vt, { projeId }).map((s) => s.baslik)).toEqual(['S1', 'S3']);
      expect(ekranlariListele(vt, projeId)).toHaveLength(1);
      expect(vt.tek('SELECT COUNT(*) AS n FROM ekran_modelleri')?.n).toBe(1); // model değişmedi → yeni sürüm yok
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('önceki aktarım varken kasa kilitliyse önizleme ve uygulama KASA_KILITLI verir', async () => {
    const klasor = geciciKlasor('aktarim-kilit');
    try {
      const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      aktarimiUygula(vt, ornekPaket());
      kasaKilitle(vt);
      for (const islem of [() => aktarimiOnizle(vt, ornekPaket()), () => aktarimiUygula(vt, ornekPaket())]) {
        try {
          islem();
          throw new Error('Hata bekleniyordu');
        } catch (hata) {
          expect(hata).toBeInstanceOf(KasaHatasi);
          expect((hata as KasaHatasi).kod).toBe('KASA_KILITLI');
        }
      }
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });
});
