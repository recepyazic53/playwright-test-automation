// KORUMA TESTLERİ — yedekte medya dosyaları (scripts/platform/yedek.mjs, biçim 2):
// - dışa aktarma seçeneklerinin (ekran görüntüleri / videolar / iz dosyaları) HER kombinasyonu
//   için gidiş-dönüş: seçilen türlerin dosyaları hedefte çözülebilir, seçilmeyenler
//   "yedeğe dahil edilmedi" (yedek_disi = 1) olarak gelir;
// - boş veritabanı yedeğin kasasını + medya anahtarını benimser (dosyalar olduğu gibi taşınır);
//   dolu ve FARKLI kasa parolalı veritabanında dosyalar yerel medya anahtarıyla yeniden şifrelenir;
// - sonucu içe aktarılmayan medya atlanır, kimlik üzerinden tekilleştirilir;
// - 200 MB sahte video akışla yazılır/okunur (bellek sınırı dosyadan küçük: tamamı belleğe alınsa aşılır), yedekte düz medya baytı yoktur;
// - eski biçim (1) yedek dosyası hâlâ açılır ve içe aktarılır.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, truncateSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { KasaHatasi, MEDYA_ANAHTARI_META, kasaOlustur, medyaAnahtariniHazirla } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, sonucDetayi, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { MEDYA_SIHIRLI, medyaCoz, medyaSifrele, medyaTamamenCoz } from '../../scripts/platform/medya.mjs';
import {
  BICIM_SURUMU, VARSAYILAN_MEDYA_SECIMI, YedekHatasi, yedekAc, yedekBoyutTahmini, yedekDosyasiYaz, yedekIceAktar, yedekOlustur,
  type MedyaSecimi
} from '../../scripts/platform/yedek.mjs';
import {
  IceAktarmaYoneticisi, hazirligiAt, iceAktarmaHazirla, iceAktarmaMedyasiniYaz, iceAktarmaUygula
} from '../../scripts/platform/ice-aktarma.mjs';
import { HIZLI_KDF, geciciKlasor, loglariYakala, type LogYakalayici } from './platform-ortak';

const PAROLA = 'Medya-Yedek-Parolasi-2026';
const BASKA_PAROLA = 'Hedef-Makine-Parolasi-77';
const ESKI_PAROLA = 'Eski-Bicim-Parolasi-2026'; // tests/birim/fixtures/eski-bicim-v1.tayedek (commit 1a269a0 koduyla üretildi)
const ISARET = 'DUZ-MEDYA-ISARETI-7f3a91';

let log: LogYakalayici;
test.beforeEach(() => { log = loglariYakala(); });
test.afterEach(() => {
  log.birak();
  log.gizliYokMu([PAROLA, BASKA_PAROLA, ESKI_PAROLA]);
});

type Tur = 'ekran_goruntusu' | 'video' | 'iz' | 'diger';
const ORNEK_ICERIK: Record<Tur, { icerikTuru: string; veri: Buffer }> = {
  // Gerçek dosya imzaları (PNG / WebM / ZIP) + işaret metni: yedekte düz halleri ARANIR.
  ekran_goruntusu: { icerikTuru: 'image/png', veri: Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from(`${ISARET}-png-`), randomBytes(3000)]) },
  video: { icerikTuru: 'video/webm', veri: Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.from(`${ISARET}-webm-`), randomBytes(150_000)]) },
  iz: { icerikTuru: 'application/zip', veri: Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.from(`${ISARET}-zip-`), randomBytes(20_000)]) },
  diger: { icerikTuru: 'text/markdown', veri: Buffer.from(`# Hata bağlamı\n${ISARET}-md\n`) }
};
const DUZ_IMZALAR = [Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('1a45dfa3', 'hex'), Buffer.from('504b0304', 'hex'), Buffer.from(ISARET)];

interface Kaynak { vt: Veritabani; medyaKlasoru: string; proje: string; medya: Record<string, { tur: Tur; veri: Buffer }> }

/** Kasa + bir proje + iki koşu (A ve B) + her türden şifreli medya. */
async function kaynakKur(kok: string, parola = PAROLA): Promise<Kaynak> {
  const vt = await veritabaniniHazirla(join(kok, 'platform.db'));
  await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
  const medyaKlasoru = join(kok, 'medya');
  const proje = projeKaydet(vt, { ad: 'Medya Projesi' });
  const ana = medyaAnahtariniHazirla(vt);
  const medya: Kaynak['medya'] = {};
  for (const kosu of ['kosu-a', 'kosu-b']) {
    kosuKaydet(vt, { id: kosu, projeId: proje, tur: 'tam', baslangic: '2026-01-01T10:00:00.000Z' });
    const girdiler = [];
    for (const tur of Object.keys(ORNEK_ICERIK) as Tur[]) {
      const { icerikTuru, veri } = ORNEK_ICERIK[tur];
      const { dosya, boyut } = await medyaSifrele(ana, medyaKlasoru, veri);
      const id = `${kosu}-${tur}`;
      medya[id] = { tur, veri };
      girdiler.push({ id, tur, ad: tur, icerikTuru, boyut, dosya });
    }
    sonucKaydet(vt, { id: `${kosu}-sonuc`, kosuId: kosu, projeId: proje, senaryoBaslik: `Senaryo ${kosu}`, durum: 'basarisiz', hataMesaji: 'h', medya: girdiler });
  }
  ana.fill(0);
  return { vt, medyaKlasoru, proje, medya };
}

function duzMetinYokMu(dosya: Buffer): void {
  for (const imza of DUZ_IMZALAR) expect(dosya.includes(imza), `yedekte düz medya imzası olmamalı: ${imza.toString('hex')}`).toBe(false);
}

function hazirlikKlasoruKalmadi(medyaKlasoru: string): void {
  if (!existsSync(medyaKlasoru)) return;
  expect(readdirSync(medyaKlasoru).filter((ad) => ad.startsWith('.hazirlik-'))).toEqual([]);
}

function medyaSatiri(vt: Veritabani, id: string): { dosya: string; yedek_disi: number } | undefined {
  const s = vt.tek('SELECT dosya, yedek_disi FROM medya WHERE id = ?', [id]);
  return s ? { dosya: String(s.dosya), yedek_disi: Number(s.yedek_disi) } : undefined;
}

const TUR_SECENEGI: Record<Tur, keyof typeof VARSAYILAN_MEDYA_SECIMI> = {
  ekran_goruntusu: 'ekranGoruntuleriDahil', diger: 'ekranGoruntuleriDahil', video: 'videolarDahil', iz: 'izDosyalariDahil'
};

test.describe('Yedekte medya dosyaları', () => {
  test('varsayılanlar: ekran görüntüleri açık, video ve iz kapalı; tahmin satırları medya satırlarından hesaplanır', async () => {
    const k = geciciKlasor('medya-varsayilan');
    try {
      expect(VARSAYILAN_MEDYA_SECIMI).toEqual({ ekranGoruntuleriDahil: true, videolarDahil: false, izDosyalariDahil: false });
      const kaynak = await kaynakKur(join(k.yol, 'kaynak'));
      const tahmin = yedekBoyutTahmini(kaynak.vt);
      const bayt = (t: Tur) => 2 * ORNEK_ICERIK[t].veri.length;
      expect(tahmin.secenekler.ekranGoruntuleriDahil).toEqual({ sayi: 4, bayt: bayt('ekran_goruntusu') + bayt('diger') });
      expect(tahmin.secenekler.videolarDahil).toEqual({ sayi: 2, bayt: bayt('video') });
      expect(tahmin.secenekler.izDosyalariDahil).toEqual({ sayi: 2, bayt: bayt('iz') });
      // Seçenek verilmeden alınan yedek: yalnızca ekran görüntüsü + diğer ekler.
      const hedef = join(k.yol, 'varsayilan.tayedek');
      const { manifest } = await yedekDosyasiYaz(kaynak.vt, hedef, { medyaKlasoru: kaynak.medyaKlasoru });
      expect(manifest.bicimSurumu).toBe(BICIM_SURUMU);
      expect(Object.keys(manifest.medya?.turler ?? {}).sort()).toEqual(['diger', 'ekran_goruntusu']);
      await expect(yedekDosyasiYaz(kaynak.vt, hedef, { videolarDahil: 'evet' as unknown as boolean })).rejects.toThrow(YedekHatasi);
      kaynak.vt.kapat();
    } finally {
      k.temizle();
    }
  });

  const kombinasyonlar: MedyaSecimi[] = [];
  for (const e of [true, false]) for (const v of [true, false]) for (const i of [true, false]) kombinasyonlar.push({ ekranGoruntuleriDahil: e, videolarDahil: v, izDosyalariDahil: i });

  for (const secim of kombinasyonlar) {
    const ad = `ekran=${secim.ekranGoruntuleriDahil ? 1 : 0} video=${secim.videolarDahil ? 1 : 0} iz=${secim.izDosyalariDahil ? 1 : 0}`;
    test(`gidiş-dönüş (${ad}): seçilen türler hedefte çözülür, seçilmeyenler "yedeğe dahil edilmedi"; yedekte düz medya yok`, async () => {
      const k = geciciKlasor('medya-kombinasyon');
      try {
        const kaynak = await kaynakKur(join(k.yol, 'kaynak'));
        const yedekYolu = join(k.yol, 'yedek.tayedek');
        const asamalar: string[] = [];
        const { manifest, boyut } = await yedekDosyasiYaz(kaynak.vt, yedekYolu, { ...secim, medyaKlasoru: kaynak.medyaKlasoru, ilerleme: (a) => asamalar.push(a) });
        const dosya = readFileSync(yedekYolu);
        expect(dosya.length).toBe(boyut);
        duzMetinYokMu(dosya);
        const beklenenTurler = (Object.keys(ORNEK_ICERIK) as Tur[]).filter((t) => secim[TUR_SECENEGI[t]]);
        expect(manifest.medya?.dosyaSayisi).toBe(2 * beklenenTurler.length);
        if (beklenenTurler.length) expect(asamalar.some((a) => /^medya ekleniyor \(.* MB\)$/.test(a))).toBe(true);

        // Hedef: BOŞ veritabanı (tam yükleme) → yedeğin kasası ve medya anahtarı benimsenir.
        const hedefVt = await veritabaniniHazirla(join(k.yol, 'hedef', 'platform.db'));
        const hedefMedya = join(k.yol, 'hedef', 'medya');
        const sonuc = await yedekIceAktar(hedefVt, yedekYolu, PAROLA, { mod: 'tamYukle' });
        expect(sonuc.medya).toMatchObject({ eklenen: 2 * beklenenTurler.length, yenidenSifrelenen: 0 });
        expect(hedefVt.metaOku(MEDYA_ANAHTARI_META)).toBe(kaynak.vt.metaOku(MEDYA_ANAHTARI_META));
        const hedefAnahtar = medyaAnahtariniHazirla(hedefVt);
        for (const [id, m] of Object.entries(kaynak.medya)) {
          const satir = medyaSatiri(hedefVt, id);
          expect(satir, id).toBeTruthy();
          const dahil = beklenenTurler.includes(m.tur);
          expect(satir?.yedek_disi, `${id} yedek_disi`).toBe(dahil ? 0 : 1);
          if (dahil) {
            expect((await medyaTamamenCoz(hedefAnahtar, join(hedefMedya, String(satir?.dosya)))).equals(m.veri), `${id} çözülmeli`).toBe(true);
          } else {
            expect(existsSync(join(hedefMedya, String(satir?.dosya)))).toBe(false);
          }
        }
        const detay = sonucDetayi(hedefVt, 'kosu-a-sonuc');
        expect(detay?.medya.map((m) => [m.tur, m.yedekDisi]).sort()).toEqual(
          (Object.keys(ORNEK_ICERIK) as Tur[]).map((t) => [t, !beklenenTurler.includes(t)]).sort()
        );
        hazirlikKlasoruKalmadi(hedefMedya);
        hedefAnahtar.fill(0);
        hedefVt.kapat();
        kaynak.vt.kapat();
      } finally {
        k.temizle();
      }
    });
  }

  test('dolu veritabanı + FARKLI kasa parolası: önizlemede medya sayıları, uygulamada yerel anahtarla yeniden şifreleme; tekrar içe aktarma çift dosya üretmez', async () => {
    const k = geciciKlasor('medya-farkli-kasa');
    try {
      const kaynak = await kaynakKur(join(k.yol, 'kaynak'));
      const yedekYolu = join(k.yol, 'yedek.tayedek');
      await yedekDosyasiYaz(kaynak.vt, yedekYolu, { ekranGoruntuleriDahil: true, videolarDahil: true, izDosyalariDahil: false, medyaKlasoru: kaynak.medyaKlasoru });

      const hedefKok = join(k.yol, 'hedef');
      const hedefVt = await veritabaniniHazirla(join(hedefKok, 'platform.db'));
      await kasaOlustur(hedefVt, BASKA_PAROLA, { kdf: HIZLI_KDF });
      projeKaydet(hedefVt, { ad: 'Hedefin kendi projesi' });
      const hedefMedya = join(hedefKok, 'medya');
      const hedefZarf = hedefVt.metaOku(MEDYA_ANAHTARI_META);

      const yonetici = new IceAktarmaYoneticisi({ veritabani: async () => hedefVt, medyaKlasoru: () => hedefMedya });
      const kopya = join(k.yol, 'yukleme.tayedek');
      copyFileSync(yedekYolu, kopya);
      const is = await yonetici.bekle(yonetici.baslat(kopya, PAROLA, { geciciDosya: true }));
      expect(is?.durum).toBe('hazir');
      expect(existsSync(kopya), 'yüklenen geçici dosya hazırlıktan sonra silinir').toBe(false);
      const medya = is?.onizleme?.medya;
      expect(medya?.turler.ekran_goruntusu).toMatchObject({ dosyada: 2, dosyasiYedekte: 2, eklenecek: 2, eklenecekBayt: expect.any(Number) });
      expect(medya?.turler.video).toMatchObject({ dosyada: 2, eklenecek: 2 });
      expect(medya?.turler.iz).toMatchObject({ dosyada: 2, eklenecek: 0, dahilDegil: 2 });
      expect(medya?.toplam.eklenecek).toBe(6);
      expect(readdirSync(hedefMedya).filter((a) => a.startsWith('.hazirlik-')).length).toBe(1); // şifreli hazırlık

      const sonuc = await yonetici.uygula(is?.id ?? '', { tumu: true });
      expect(sonuc.medya).toMatchObject({ eklenen: 6, yenidenSifrelenen: 6, dahilDegil: 2 });
      expect(hedefVt.metaOku(MEDYA_ANAHTARI_META), 'hedef kendi medya anahtarını korur').toBe(hedefZarf);
      const anahtar = medyaAnahtariniHazirla(hedefVt);
      for (const [id, m] of Object.entries(kaynak.medya)) {
        const satir = medyaSatiri(hedefVt, id);
        if (m.tur === 'iz') { expect(satir?.yedek_disi).toBe(1); continue; }
        expect((await medyaTamamenCoz(anahtar, join(hedefMedya, String(satir?.dosya)))).equals(m.veri)).toBe(true);
      }
      hazirlikKlasoruKalmadi(hedefMedya);
      const dosyaSayisi = readdirSync(hedefMedya).length;

      // Aynı yedek tekrar: kimlik üzerinden tekilleştirilir, yeni dosya yazılmaz.
      const tekrar = await yonetici.bekle(yonetici.baslat(yedekYolu, PAROLA));
      expect(tekrar?.onizleme?.medya.toplam.eklenecek).toBe(0);
      const ikinci = await yonetici.uygula(tekrar?.id ?? '', { tumu: true });
      expect(ikinci.medya).toMatchObject({ eklenen: 0, zatenVardi: 6 });
      expect(readdirSync(hedefMedya).length).toBe(dosyaSayisi);
      anahtar.fill(0);
      hedefVt.kapat();
      kaynak.vt.kapat();
    } finally {
      k.temizle();
    }
  });

  test('dolu veritabanı + yanlış yedek parolası: açıkça reddedilir, hiçbir medya/hazırlık dosyası kalmaz', async () => {
    const k = geciciKlasor('medya-yanlis');
    try {
      const kaynak = await kaynakKur(join(k.yol, 'kaynak'));
      // Yedek birden çok 1 MiB'lık parçaya yayılsın (kesilen SON parça ayrıca doğrulanır).
      const ana = medyaAnahtariniHazirla(kaynak.vt);
      const buyuk = await medyaSifrele(ana, kaynak.medyaKlasoru, randomBytes(3 * 1024 * 1024));
      ana.fill(0);
      sonucKaydet(kaynak.vt, {
        id: 'ek-sonuc', kosuId: 'kosu-a', projeId: kaynak.proje, senaryoBaslik: 'Ek', durum: 'basarili',
        medya: [{ id: 'ek-video', tur: 'video', ad: 'v', icerikTuru: 'video/webm', boyut: 3 * 1024 * 1024, dosya: buyuk.dosya }]
      });
      const yedekYolu = join(k.yol, 'yedek.tayedek');
      await yedekDosyasiYaz(kaynak.vt, yedekYolu, { videolarDahil: true, medyaKlasoru: kaynak.medyaKlasoru });
      const hedefVt = await veritabaniniHazirla(join(k.yol, 'hedef', 'platform.db'));
      await kasaOlustur(hedefVt, BASKA_PAROLA, { kdf: HIZLI_KDF });
      const hedefMedya = join(k.yol, 'hedef', 'medya');
      await expect(iceAktarmaHazirla(hedefVt, yedekYolu, BASKA_PAROLA, { medyaKlasoru: hedefMedya })).rejects.toMatchObject({ kod: 'PAROLA_YANLIS' });
      await expect(iceAktarmaHazirla(hedefVt, yedekYolu, BASKA_PAROLA, { medyaKlasoru: hedefMedya })).rejects.toBeInstanceOf(KasaHatasi);
      expect(existsSync(hedefMedya) ? readdirSync(hedefMedya) : []).toEqual([]);

      // Kesilmiş dosya: son parça doğrulanamaz → BICIM; hazırlık klasörü temizlenir.
      const kesik = join(k.yol, 'kesik.tayedek');
      copyFileSync(yedekYolu, kesik);
      truncateSync(kesik, statSync(kesik).size - 100);
      await expect(iceAktarmaHazirla(hedefVt, kesik, PAROLA, { medyaKlasoru: hedefMedya })).rejects.toMatchObject({ kod: 'BICIM' });
      hazirlikKlasoruKalmadi(hedefMedya);
      hedefVt.kapat();
      kaynak.vt.kapat();
    } finally {
      k.temizle();
    }
  });

  test('sonucu içe aktarılmayan medya atlanır: satırı eklenmez, dosyası yazılmaz', async () => {
    const k = geciciKlasor('medya-secim');
    try {
      const kaynak = await kaynakKur(join(k.yol, 'kaynak'));
      const yedekYolu = join(k.yol, 'yedek.tayedek');
      await yedekDosyasiYaz(kaynak.vt, yedekYolu, { videolarDahil: true, izDosyalariDahil: true, medyaKlasoru: kaynak.medyaKlasoru });
      const hedefVt = await veritabaniniHazirla(join(k.yol, 'hedef', 'platform.db'));
      await kasaOlustur(hedefVt, BASKA_PAROLA, { kdf: HIZLI_KDF });
      const hedefMedya = join(k.yol, 'hedef', 'medya');
      const hazirlik = await iceAktarmaHazirla(hedefVt, yedekYolu, PAROLA, { medyaKlasoru: hedefMedya });
      // B koşusunun sonucu bu içe aktarmada yok (ör. uygulanamayan / hariç tutulan sonuç).
      hazirlik.tablolar.kosu_sonuclari = hazirlik.tablolar.kosu_sonuclari.filter((s) => s.id !== 'kosu-b-sonuc');
      const sonuc = iceAktarmaUygula(hedefVt, hazirlik, { tumu: true });
      expect(sonuc.eklenenler.medya).toMatchObject({ eklenen: 4, atlanan: 4 });
      const medya = await iceAktarmaMedyasiniYaz(hedefVt, hazirlik);
      expect(medya).toMatchObject({ eklenen: 4, atlanan: 4 });
      hazirligiAt(hazirlik);
      expect(hedefVt.tek("SELECT COUNT(*) AS n FROM medya WHERE id LIKE 'kosu-b-%'")?.n).toBe(0);
      expect(readdirSync(hedefMedya).filter((a) => a.endsWith('.medya')).length).toBe(4);
      hazirlikKlasoruKalmadi(hedefMedya);
      hedefVt.kapat();
      kaynak.vt.kapat();
    } finally {
      k.temizle();
    }
  });

  test('büyük dosya (200 MB sahte video) akışla yazılır ve okunur; bellekte toplanmaz, hedefte birebir çözülür', async () => {
    test.setTimeout(300_000);
    const k = geciciKlasor('medya-buyuk');
    try {
      const kaynak = await kaynakKur(join(k.yol, 'kaynak'));
      const BOYUT = 200 * 1024 * 1024;
      // Ölçülen: TUTULAN bellek (çöp toplayıcı zorlanarak). Mutlak değer güvenilmez: aynı işçideki önceki testler ve Node'un
      // iç tamponları sabit ~80-100 MB taban bırakabiliyor (dosya boyutuyla büyümez; eskiden bu yüzden dalgalanıyordu).
      // Asıl denetim BÜYÜME: video belleğe biriktirilseydi işlem ilerledikçe tutulan bellek de ~işlenen bayt kadar artardı;
      // akışla işlenince ilk yarının ve ikinci yarının tepesi aynı düzeyde kalır. Ayrıca tepe dosya boyutunun altında olmalı.
      const BUYUME_SINIRI = 48 * 1024 * 1024;
      setFlagsFromString('--expose-gc');
      const vmGc = runInNewContext('gc') as () => void;
      // V8 ölü ArrayBuffer'ların belleğini ARKA PLAN iş parçacığında süpürür (--concurrent-array-buffer-sweeping):
      // tek gc() sonrası arrayBuffers, süpürme bitmediyse ölü parçaları da sayar (yerelde tek gc'de ~200 MB'ın hâlâ
      // sayıldığı görüldü). Paralel takımda CPU yükü süpürmeyi geciktirdiği için ölçüm dalgalanıyordu. İkinci gc,
      // öncekinin süpürmesinin bitmesini bekler (EnsureFinished): ölçüm yalnız gerçekten tutulan belleği gösterir.
      const gc = () => { vmGc(); vmGc(); };
      let olcum = 0;
      /** Her 4 çağrıda bir: çöp toplanır, tutulan arrayBuffers örneklenir. */
      const ornekle = (liste: number[]) => { if (++olcum % 4) return; gc(); liste.push(process.memoryUsage().arrayBuffers); };
      const buyume = (liste: number[]) => { const y = Math.floor(liste.length / 2); return Math.max(...liste.slice(y)) - Math.max(...liste.slice(0, y)); };
      const ozet = createHash('sha256');
      // Kaynak videonun kendisi de akışla (1 MiB'lık parçalar) şifrelenir; test belleğinde tutulmaz.
      async function* sahteVideo(): AsyncGenerator<Buffer> {
        for (let yazilan = 0; yazilan < BOYUT; yazilan += 1024 * 1024) {
          const p = randomBytes(Math.min(1024 * 1024, BOYUT - yazilan));
          if (yazilan === 0) Buffer.from('1a45dfa3', 'hex').copy(p);
          ozet.update(p);
          yield p;
        }
      }
      const ana = medyaAnahtariniHazirla(kaynak.vt);
      const video = await medyaSifrele(ana, kaynak.medyaKlasoru, sahteVideo());
      ana.fill(0);
      const beklenenOzet = ozet.digest('hex');
      sonucKaydet(kaynak.vt, {
        id: 'buyuk-sonuc', kosuId: 'kosu-a', projeId: kaynak.proje, senaryoBaslik: 'Büyük video', durum: 'basarisiz', hataMesaji: 'h',
        medya: [{ id: 'buyuk-video', tur: 'video', ad: 'video', icerikTuru: 'video/webm', boyut: BOYUT, dosya: video.dosya }]
      });

      const yedekYolu = join(k.yol, 'buyuk.tayedek');
      const bellek = () => { gc(); return process.memoryUsage().arrayBuffers; };
      const once = bellek();
      const ornekler: number[] = [];
      const baytlar: number[] = [];
      await yedekDosyasiYaz(kaynak.vt, yedekYolu, {
        ekranGoruntuleriDahil: false, videolarDahil: true, medyaKlasoru: kaynak.medyaKlasoru,
        ilerleme: (_a, _y, b) => { ornekle(ornekler); if (b) baytlar.push(b.islenen); }
      });
      expect(statSync(yedekYolu).size).toBeGreaterThan(BOYUT);
      expect(baytlar.length, 'medya baytı ilerlemesi parça parça bildirilir').toBeGreaterThan(10);
      expect(ornekler.length, 'bellek örnekleri').toBeGreaterThanOrEqual(6);
      expect(buyume(ornekler), 'dışa aktarmada video belleğe biriktirilmemeli (bellek işlendikçe büyümez)').toBeLessThan(BUYUME_SINIRI);
      expect(Math.max(...ornekler) - once, 'dışa aktarmada tutulan bellek dosya boyutunun altında').toBeLessThan(BOYUT / 2);

      const hedefVt = await veritabaniniHazirla(join(k.yol, 'hedef', 'platform.db'));
      await kasaOlustur(hedefVt, BASKA_PAROLA, { kdf: HIZLI_KDF });
      const hedefMedya = join(k.yol, 'hedef', 'medya');
      const once2 = bellek();
      const ornekler2: number[] = [];
      const hazirlik = await iceAktarmaHazirla(hedefVt, yedekYolu, PAROLA, { medyaKlasoru: hedefMedya, ilerleme: () => { ornekle(ornekler2); } });
      expect(hazirlik.onizleme.medya.turler.video.eklenecekBayt).toBe(BOYUT + 2 * ORNEK_ICERIK.video.veri.length);
      iceAktarmaUygula(hedefVt, hazirlik, { tumu: true });
      const sonuc = await iceAktarmaMedyasiniYaz(hedefVt, hazirlik, { ilerleme: () => { ornekle(ornekler2); } });
      expect(sonuc.yenidenSifrelenen).toBeGreaterThanOrEqual(3);
      expect(ornekler2.length, 'bellek örnekleri (içe aktarma)').toBeGreaterThanOrEqual(6);
      expect(buyume(ornekler2), 'içe aktarmada video belleğe biriktirilmemeli').toBeLessThan(BUYUME_SINIRI);
      expect(Math.max(...ornekler2) - once2, 'içe aktarmada tutulan bellek dosya boyutunun altında').toBeLessThan(BOYUT / 2);
      hazirligiAt(hazirlik);

      const satir = medyaSatiri(hedefVt, 'buyuk-video');
      const hedefOzet = createHash('sha256');
      const anahtar = medyaAnahtariniHazirla(hedefVt);
      for await (const p of medyaCoz(anahtar, join(hedefMedya, String(satir?.dosya)))) hedefOzet.update(p);
      anahtar.fill(0);
      expect(hedefOzet.digest('hex')).toBe(beklenenOzet);
      hedefVt.kapat();
      kaynak.vt.kapat();
    } finally {
      k.temizle();
    }
  });

  test('yedekteki medya kayıtları şifreli medya biçimindedir (sihirli bayt) ve yedeğin kendisinde düz imza yoktur', async () => {
    const k = geciciKlasor('medya-sihirli');
    try {
      const kaynak = await kaynakKur(join(k.yol, 'kaynak'));
      const yedekYolu = join(k.yol, 'yedek.tayedek');
      await yedekDosyasiYaz(kaynak.vt, yedekYolu, { ekranGoruntuleriDahil: true, videolarDahil: true, izDosyalariDahil: true, medyaKlasoru: kaynak.medyaKlasoru });
      const dosya = readFileSync(yedekYolu);
      duzMetinYokMu(dosya);
      // Dış şifre: iç medya başlığı ("TAMEDYA") bile yedek dosyasında görünmez.
      expect(dosya.includes(MEDYA_SIHIRLI)).toBe(false);
      const hazirlik = join(k.yol, 'hazirlik');
      const acik = await yedekAc(yedekYolu, PAROLA, { hazirlikKlasoru: hazirlik });
      expect(acik.medyaDosyalari.size).toBe(8);
      for (const { yol } of acik.medyaDosyalari.values()) {
        const ic = readFileSync(String(yol));
        expect(ic.subarray(0, MEDYA_SIHIRLI.length).equals(MEDYA_SIHIRLI)).toBe(true);
        duzMetinYokMu(ic);
      }
      acik.kasaAnahtari.fill(0);
      acik.medyaAnahtari?.fill(0);
      kaynak.vt.kapat();
    } finally {
      k.temizle();
    }
  });

  test('geriye uyum: eski biçim (1) yedek açılır ve içe aktarılır; medya satırları "yedeğe dahil edilmemişti" görünür', async () => {
    const k = geciciKlasor('medya-eski');
    try {
      const fixture = join(__dirname, 'fixtures', 'eski-bicim-v1.tayedek');
      expect(readFileSync(fixture).readUInt8(8)).toBe(1);
      const acik = await yedekAc(fixture, ESKI_PAROLA);
      expect(acik.bicimSurumu).toBe(1);
      expect(acik.medyaDosyalari.size).toBe(0);
      acik.kasaAnahtari.fill(0);

      const vt = await veritabaniniHazirla(join(k.yol, 'hedef', 'platform.db'));
      const hazirlik = await iceAktarmaHazirla(vt, readFileSync(fixture), ESKI_PAROLA);
      expect(hazirlik.onizleme.medya).toMatchObject({ bicimSurumu: 1, toplam: { eklenecek: 0, dahilDegil: 1 } });
      hazirligiAt(hazirlik);

      const sonuc = await yedekIceAktar(vt, fixture, ESKI_PAROLA, { mod: 'tamYukle' });
      expect(sonuc.manifest.bicimSurumu).toBe(1);
      const sonucId = String(vt.tek('SELECT id FROM kosu_sonuclari')?.id);
      const detay = sonucDetayi(vt, sonucId);
      expect(detay?.medya).toEqual([expect.objectContaining({ tur: 'ekran_goruntusu', yedekDisi: true })]);
      // Eski yedekten gelen veritabanının yeni yedeği (biçim 2) yine açılır.
      const { veri } = yedekOlustur(vt);
      expect(veri.readUInt8(8)).toBe(BICIM_SURUMU);
      const yeni = await yedekAc(veri, ESKI_PAROLA);
      expect(yeni.tablolar.medya).toEqual([expect.objectContaining({ yedek_disi: 1 })]);
      yeni.kasaAnahtari.fill(0);
      vt.kapat();
    } finally {
      k.temizle();
    }
  });

  test('aynı makineye medyasız yedek geri yüklenirse yereldeki dosyalar korunur ve bayrak kaldırılır', async () => {
    const k = geciciKlasor('medya-ayni');
    try {
      const kaynak = await kaynakKur(join(k.yol, 'kaynak'));
      const { veri } = yedekOlustur(kaynak.vt); // otomatik yedek: medya dosyası yok
      const sonuc = await yedekIceAktar(kaynak.vt, veri, PAROLA, { mod: 'tamYukle', onay: true, guvenlikYedegiKlasoru: join(k.yol, 'guvenlik'), medyaKlasoru: kaynak.medyaKlasoru });
      expect(sonuc.medya).toMatchObject({ zatenVardi: 8, eklenen: 0 });
      expect(kaynak.vt.tek('SELECT COUNT(*) AS n FROM medya WHERE yedek_disi = 1')?.n).toBe(0);
      kaynak.vt.kapat();
    } finally {
      k.temizle();
    }
  });
});
