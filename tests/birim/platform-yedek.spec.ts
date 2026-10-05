// KORUMA TESTLERİ — platform yedeği (scripts/platform/yedek.mjs): dışa→içe aktarma (tam
// yükleme) gidiş-dönüşü (birebir aynı veri), yanlış parolada hiçbir şey yazılmaması, otomatik
// yedek saklama sınırı (30) ve gizli değerlerin loglara sızmaması. Seçmeli içe aktarma
// (önizleme → seçim → uygulama): platform-ice-aktarma.spec.ts.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { TABLOLAR } from '../../scripts/platform/veritabani/gocler.mjs';
import { KasaHatasi, coz, kasaAc, kasaDurumu, kasaKilitle, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import {
  baglamProfiliKaydet,
  degisiklikGecmisiListele,
  ekranKaydet,
  ekranModeliEkle,
  girisProfiliGetir,
  girisProfiliKaydet,
  kosuOlustur,
  kosuSonucuEkle,
  ortamKaydet,
  projeKaydet,
  sayimlar,
  senaryoGetir,
  senaryoKaydet,
  testVerisiProfiliGetir,
  testVerisiProfiliKaydet,
  testVerisiTuruKaydet,
  veritabaniniHazirla,
  yerelMakine
} from '../../scripts/platform/veritabani/depo.mjs';
import {
  OTOMATIK_SAKLAMA_SAYISI,
  YedekHatasi,
  otomatikYedekAl,
  yedekDosyaAdi,
  yedekIceAktar,
  yedekOlustur
} from '../../scripts/platform/yedek.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { HIZLI_KDF, geciciKlasor, loglariYakala, type LogYakalayici } from './platform-ortak';

test('yedek dosya adı: çalışma alanı adı (ASCII) + yerel tarih; bilgisayar adı yok; ad yoksa varsayılan', () => {
  const t = new Date(2026, 8, 30, 14, 5);
  expect(yedekDosyaAdi('Ekip Çalışma Alanı', t)).toBe('Ekip-Calisma-Alani-2026-09-30-1405.tayedek');
  expect(yedekDosyaAdi('İş / Test: "ön"', t)).toBe('Is-Test-on-2026-09-30-1405.tayedek');
  expect(yedekDosyaAdi(null, t)).toBe('nobetci-yedek-2026-09-30-1405.tayedek');
  expect(yedekDosyaAdi('   ', t)).toBe('nobetci-yedek-2026-09-30-1405.tayedek');
  expect(yedekDosyaAdi('x'.repeat(200), t)).toMatch(/^x{60}-2026-09-30-1405\.tayedek$/);
});

const PAROLA = 'Yedek-Kasa-Parolasi-2026';
const BASKA_PAROLA = 'Baska-Makine-Parolasi-99';
const GIRIS_PAROLASI = 'YedekGirisParolasi#5521';
const TOTP_GIZLI = 'KRSXG5CTMVRXEZLUGIZLI';
const HASSAS_VERI = 'TR330006100519786457841326';
const GIZLILER = [PAROLA, BASKA_PAROLA, GIRIS_PAROLASI, TOTP_GIZLI, HASSAS_VERI];
const GRUP_ADI = 'Yedek grubu Çağrı';

let log: LogYakalayici;
test.beforeEach(() => {
  log = loglariYakala();
});
test.afterEach(() => {
  log.birak();
  log.gizliYokMu(GIZLILER);
});

interface OrnekVeri { proje: string; profil: string; senaryo: string; veriProfili: string }

async function ornekVeritabani(yol: string | null, parola = PAROLA): Promise<{ vt: Veritabani; ids: OrnekVeri }> {
  const vt = await veritabaniniHazirla(yol);
  await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
  const proje = projeKaydet(vt, { ad: 'Örnek Proje', ayarlar: { dil: 'tr' } });
  const ortam = ortamKaydet(vt, { projeId: proje, ad: 'Test', tabanUrl: 'https://ornek.test', varsayilan: true, ayarlar: { riskli: false } });
  const profil = girisProfiliKaydet(vt, {
    projeId: proje, ortamId: ortam, ad: 'Ana', kullaniciAdi: 'kullanici', parola: GIRIS_PAROLASI,
    ikiAsamaliTur: 'totp', totpGizli: TOTP_GIZLI
  });
  baglamProfiliKaydet(vt, { projeId: proje, tur: 'sube', ad: 'Merkez', alanlar: { kod: 'M1' } });
  const tur = testVerisiTuruKaydet(vt, { projeId: proje, ad: 'Hesap', alanlar: [{ ad: 'iban', hassas: true }, { ad: 'ad' }] });
  const veriProfili = testVerisiProfiliKaydet(vt, { projeId: proje, turId: tur, ad: 'Hesap 1', degerler: { iban: HASSAS_VERI, ad: 'Deneme' } });
  // Gruplu tablo (kaynak.grup): yedekten dönüşte grup korunmalı.
  tabloKaydet(vt, { projeId: proje, ad: 'Gruplu tablo', tur: 'liste', grup: GRUP_ADI, sutunlar: [{ ad: 'Kod' }], satirlar: [{ degerler: { Kod: 'K1' } }] });
  const ekran = ekranKaydet(vt, { projeId: proje, anahtar: 'form', ad: 'Form' });
  ekranModeliEkle(vt, { ekranId: ekran, model: { alanlar: ['a'] } });
  const senaryo = senaryoKaydet(vt, { projeId: proje, ekranId: ekran, baslik: 'Senaryo 1', icerik: { adim: 1 } });
  senaryoKaydet(vt, { id: senaryo, projeId: proje, ekranId: ekran, baslik: 'Senaryo 1', icerik: { adim: 2 } });
  const kosu = kosuOlustur(vt, { projeId: proje, ortamId: ortam });
  kosuSonucuEkle(vt, { kosuId: kosu, senaryoId: senaryo, senaryoBaslik: 'Senaryo 1', durum: 'basarili' });
  return { vt, ids: { proje, profil, senaryo, veriProfili } };
}

function tabloDokumu(vt: Veritabani): Record<string, Record<string, unknown>[]> {
  const sonuc: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLOLAR) sonuc[t.ad] = vt.tumu(`SELECT * FROM ${t.ad} ORDER BY ${t.birincilAnahtar}`);
  return sonuc;
}

/** ISO zaman damgasını ileri alır (birleştirmede "yeni olan" kuralını belirlemek için). */
function zamaniAyarla(vt: Veritabani, tablo: string, id: string, zaman: string): void {
  vt.calistir(`UPDATE ${tablo} SET guncellenme = ? WHERE id = ?`, [zaman, id]);
}

test.describe('Platform yedeği', () => {
  test('dışa → içe (tam yükleme) gidiş-dönüş: yeni veritabanı birebir aynı; parola ile her şey açılır', async () => {
    const klasor = geciciKlasor('yedek-gidis');
    try {
      const { vt, ids } = await ornekVeritabani(join(klasor.yol, 'kaynak.db'));
      const asamalar: Array<[string, number]> = [];
      const { veri, manifest } = yedekOlustur(vt, { ilerleme: (a, y) => asamalar.push([a, y]) });
      expect(asamalar.at(-1)).toEqual(['tamamlandı', 100]);
      expect(manifest.sayimlar.senaryolar).toBe(1);
      expect(veri.subarray(0, 7).toString('latin1')).toBe('TAYEDEK');
      for (const gizli of [...GIZLILER, 'Örnek Proje', 'Senaryo 1', GRUP_ADI]) {
        expect(veri.includes(Buffer.from(gizli, 'utf8')), 'yedek dosyasında düz metin olmamalı').toBe(false);
      }

      const hedefYol = join(klasor.yol, 'hedef.db');
      const hedef = await veritabaniniHazirla(hedefYol);
      const hedefMakine = yerelMakine(hedef);
      const ilerleme: number[] = [];
      const sonuc = await yedekIceAktar(hedef, veri, PAROLA, { mod: 'tamYukle', ilerleme: (_a, y) => ilerleme.push(y) });
      expect(sonuc.mod).toBe('tamYukle');
      expect(ilerleme.at(-1)).toBe(100);
      expect([...ilerleme].sort((a, b) => a - b)).toEqual(ilerleme); // yüzde geri gitmez

      const once = tabloDokumu(vt);
      const sonra = tabloDokumu(hedef);
      for (const t of TABLOLAR) {
        if (t.ad === 'makineler') continue;
        expect(sonra[t.ad], `${t.ad} birebir aynı olmalı`).toEqual(once[t.ad]);
      }
      // Hedef makine kendi kimliğini korur; kaynağın makine kaydı da taşınır.
      expect(sonra.makineler.map((m) => m.id)).toEqual(expect.arrayContaining([...once.makineler.map((m) => m.id), hedefMakine.id]));
      expect(yerelMakine(hedef).id).toBe(hedefMakine.id);

      expect(kasaDurumu(hedef)).toMatchObject({ olusturuldu: true, acik: true });
      expect(girisProfiliGetir(hedef, ids.profil, { coz: true })).toMatchObject({ parola: GIRIS_PAROLASI, totpGizli: TOTP_GIZLI });
      expect(testVerisiProfiliGetir(hedef, ids.veriProfili, { coz: true })?.degerler.iban).toBe(HASSAS_VERI);
      // Tablo grubu (kaynak.grup) ve türü yedekten dönüşte korunur.
      expect(tablolariListele(hedef, ids.proje).find((t) => t.ad === 'Gruplu tablo')?.kaynak).toEqual({ tabloTuru: 'liste', grup: GRUP_ADI });

      // Diskten yeniden açınca da aynı.
      hedef.kapat();
      const tekrar = await veritabaniniHazirla(hedefYol);
      for (const t of TABLOLAR) if (t.ad !== 'makineler') expect(tabloDokumu(tekrar)[t.ad]).toEqual(once[t.ad]);
      tekrar.kapat();
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('yanlış parola / bozuk dosya: anlaşılır Türkçe hata, HİÇBİR şey yazılmaz', async () => {
    const klasor = geciciKlasor('yedek-yanlis');
    try {
      const { vt } = await ornekVeritabani(null);
      const { veri } = yedekOlustur(vt);
      const hedefYol = join(klasor.yol, 'hedef.db');
      const hedef = await veritabaniniHazirla(hedefYol);
      const onceBayt = readFileSync(hedefYol);

      {
        const hata = await yedekIceAktar(hedef, veri, 'yanlis-parola-000', { mod: 'tamYukle' }).catch((h: unknown) => h);
        expect(hata).toBeInstanceOf(KasaHatasi);
        expect((hata as KasaHatasi).kod).toBe('PAROLA_YANLIS');
        expect((hata as Error).message).toMatch(/parola.*yanlış/i);
      }
      const bozuk = Buffer.from(veri);
      bozuk[bozuk.length - 5] ^= 0xff;
      expect(await yedekIceAktar(hedef, bozuk, PAROLA, { mod: 'tamYukle' }).catch((h: unknown) => (h as KasaHatasi).kod)).toBe('PAROLA_YANLIS');
      expect(await yedekIceAktar(hedef, Buffer.from('rastgele dosya içeriği'), PAROLA, { mod: 'tamYukle' })
        .catch((h: unknown) => (h as YedekHatasi).kod)).toBe('BICIM');

      expect(readFileSync(hedefYol).equals(onceBayt)).toBe(true);
      expect(kasaDurumu(hedef).olusturuldu).toBe(false);
      expect(sayimlar(hedef).projeler).toBe(0);
      hedef.kapat();
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('tam yükleme dolu veritabanında onay ister; onayla önce güvenlik yedeği alınır', async () => {
    const klasor = geciciKlasor('yedek-onay');
    try {
      const { vt: kaynak } = await ornekVeritabani(null);
      const { veri } = yedekOlustur(kaynak);
      const { vt: dolu } = await ornekVeritabani(join(klasor.yol, 'dolu.db'), BASKA_PAROLA);
      const hata = await yedekIceAktar(dolu, veri, PAROLA, { mod: 'tamYukle' }).catch((h: unknown) => h);
      expect((hata as YedekHatasi).kod).toBe('ONAY_GEREKLI');

      const guvenlikKlasoru = join(klasor.yol, 'guvenlik');
      const sonuc = await yedekIceAktar(dolu, veri, PAROLA, { mod: 'tamYukle', onay: true, guvenlikYedegiKlasoru: guvenlikKlasoru });
      expect(sonuc.guvenlikYedegi).toContain(guvenlikKlasoru);
      expect(readdirSync(guvenlikKlasoru)).toHaveLength(1);
      // Kasa artık yedeğin kasası: eski parola geçersiz, yeni parolayla açılır.
      kasaKilitle(dolu);
      expect(await kasaAc(dolu, BASKA_PAROLA).catch((h: unknown) => (h as KasaHatasi).kod)).toBe('PAROLA_YANLIS');
      await kasaAc(dolu, PAROLA);
      // Güvenlik yedeği eski parolayla geri yüklenebilir.
      const bos = await veritabaniniHazirla(null);
      const geri = await yedekIceAktar(bos, readFileSync(sonuc.guvenlikYedegi as string), BASKA_PAROLA, { mod: 'tamYukle' });
      expect(geri.sayimlar.senaryolar).toBe(1);
      bos.kapat();
      dolu.kapat();
      kaynak.kapat();
    } finally {
      klasor.temizle();
    }
  });

  test('otomatik yedek: zaman damgalı dosya, yalnızca son 30 otomatik yedek tutulur', async () => {
    const klasor = geciciKlasor('yedek-oto');
    try {
      const { vt } = await ornekVeritabani(join(klasor.yol, 'platform.db'));
      const yedekKlasoru = join(klasor.yol, 'yedekler');
      const baslangic = Date.UTC(2026, 0, 1, 12, 0, 0);
      const uretilen: string[] = [];
      for (let i = 0; i < OTOMATIK_SAKLAMA_SAYISI + 5; i++) {
        uretilen.push(basename(otomatikYedekAl(vt, { klasor: yedekKlasoru, simdi: new Date(baslangic + i * 60_000) }).dosya));
      }
      const son = join(yedekKlasoru, uretilen.at(-1) as string);
      const dosyalar = readdirSync(yedekKlasoru).sort();
      expect(dosyalar.every((d) => /^otomatik-\d{8}-\d{6}-\d{3}\.tayedek$/.test(d))).toBe(true);
      // En eski 5 silindi, en yeni 30 kaldı.
      expect(dosyalar).toEqual(uretilen.slice(5));
      // Elle alınmış (otomatik olmayan) yedeklere dokunulmaz.
      writeFileSync(join(yedekKlasoru, 'elle-alinan.tayedek'), yedekOlustur(vt).veri);
      otomatikYedekAl(vt, { klasor: yedekKlasoru, simdi: new Date(baslangic + 99 * 60_000) });
      expect(readdirSync(yedekKlasoru)).toContain('elle-alinan.tayedek');
      expect(readdirSync(yedekKlasoru).filter((d) => d.startsWith('otomatik-'))).toHaveLength(OTOMATIK_SAKLAMA_SAYISI);

      // Kasa kilitliyken otomatik yedek alınamaz (parola bellekte tutulmaz).
      kasaKilitle(vt);
      expect(() => otomatikYedekAl(vt, { klasor: yedekKlasoru })).toThrow(/kilitli/);

      // Son otomatik yedek geri yüklenebilir.
      const bos = await veritabaniniHazirla(null);
      const geri = await yedekIceAktar(bos, readFileSync(son), PAROLA, { mod: 'tamYukle' });
      expect(geri.sayimlar.senaryolar).toBe(1);
      bos.kapat();
      vt.kapat();
    } finally {
      klasor.temizle();
    }
  });
});
