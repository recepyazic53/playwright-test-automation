// KORUMA TESTLERİ — JetSeyahat ekran modeli. Gerçek model ve veri platform veritabanındadır; burada
// SAHTE değerli örnekleri kullanılır (tests/birim/fixtures/ornek-eski-dosyalar/). Tarayıcı AÇMAZ,
// şirket ortamına BAĞLANMAZ. Çalıştırma: npm run test:birim
// Kontroller:
//  a) Model (ve alt modeli) şemaya uyuyor; bellekteki modeller kümesinden (veritabanı yolu) de aynı kurulur.
//  b) Örnek senaryo verisindeki (test + canli) her özellik ve değer modelde biliniyor.
//  c) Her örnek senaryo TEK doğrulayıcıdan (scripts/dogrulama/senaryo-dogrulayici.mjs) HATASIZ geçiyor
//     (ayrıntılı kural testleri: tests/birim/senaryo-dogrulayici.spec.ts).
//  d) TS senaryo tipi = modelin senaryoda ayarlanabilir alanları.
// Bir kontrol düşerse DÜZELTİLECEK YER önce modeldir; model doğruysa kod/veri tutarsızdır.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  BEKLENEN_HATA_ADIMLARI,
  beklenenSonucuCoz
} from '../support/beklenen-sonuc';
import {
  altModelAlanlari,
  ekranAlanlari,
  ekranModeliniKur,
  ekranModeliniYukle,
  senaryoAnahtarHaritasi,
  senaryodaAyarlanabilirAnahtarlar,
  tumAlanlar,
  type Alan,
  type Secenek,
  type YuklenmisEkranModeli
} from '../support/ekran-modeli';
import { jetSeyahatSenaryosunuDogrula } from '../support/senaryo-dogrulama';
import type { JetSeyahatTestData, OrtakTestData } from '../support/test-data';
import { ORNEK_MODEL_DOSYASI, ornekVeri } from './platform-ortak';

const MODEL_DOSYASI = ORNEK_MODEL_DOSYASI;
const ORTAMLAR = ['test', 'canli'] as const;

type JetSeyahatUrunu = JetSeyahatTestData['jetSeyahat'];
type JetSeyahatSenaryosu = JetSeyahatUrunu['senaryolar'][number];

let onbellek: YuklenmisEkranModeli | undefined;
function model(): YuklenmisEkranModeli {
  onbellek ??= ekranModeliniYukle(MODEL_DOSYASI);
  return onbellek;
}

function urunVerisiniOku(ortam: (typeof ORTAMLAR)[number]): JetSeyahatUrunu {
  return ornekVeri<JetSeyahatTestData>(ortam, 'jet-seyahat').jetSeyahat;
}

function nesneMi(deger: unknown): deger is Record<string, unknown> {
  return typeof deger === 'object' && deger !== null && !Array.isArray(deger);
}

/** Seçeneğin senaryo JSON'unda yazılan değeri (senaryoDegeri yoksa ekrandaki value). */
function senaryoDegeri(secenek: Secenek): string {
  return secenek.senaryoDegeri ?? secenek.deger;
}

function farklar(ad: string, beklenen: readonly string[], bulunan: readonly string[], beklenenAdi: string, bulunanAdi: string): string[] {
  const b = new Set(beklenen);
  const f = new Set(bulunan);
  return [
    ...[...b].filter((x) => !f.has(x)).map((x) => `${ad}: "${x}" ${beklenenAdi} içinde var, ${bulunanAdi} içinde YOK`),
    ...[...f].filter((x) => !b.has(x)).map((x) => `${ad}: "${x}" ${bulunanAdi} içinde var, ${beklenenAdi} içinde YOK`)
  ];
}

test.describe('JetSeyahat ekran modeli — koruma testleri', () => {
  test('a) model dosyası şemaya uyuyor (id benzersizliği, başvurular, tipler)', () => {
    const { model: m, altModeller } = model();
    expect(m.semaSurumu).toBe(1);
    expect(Object.keys(altModeller)).toEqual(['odeme-kredi-karti.model.json']);

    // Beklenen hata adımları (beklenen-sonuc.ts) modelde adım olarak var olmalı ve
    // senaryoDuzeyi > beklenenSonuc seçenekleriyle aynı olmalı.
    const adimlar = m.adimlar.map((adim) => adim.id);
    const sorunlar: string[] = [];
    for (const adim of BEKLENEN_HATA_ADIMLARI) {
      if (!adimlar.includes(adim)) sorunlar.push(`BEKLENEN_HATA_ADIMLARI > "${adim}" modelde adım değil`);
    }
    const beklenenSonuc = m.senaryoDuzeyi.alanlar.find((alan) => alan.id === 'beklenenSonuc');
    const modelAdimSecenekleri = (beklenenSonuc?.varyantlar ?? [])
      .flatMap((varyant) => varyant.alanlar?.adim?.secenekler ?? [])
      .map((secenek) => secenek.deger);
    sorunlar.push(...farklar('beklenenSonuc.adim', BEKLENEN_HATA_ADIMLARI, modelAdimSecenekleri, 'beklenen-sonuc.ts', 'model'));
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);

    // Veritabanı yolu (eski dosya adı → ham model kümesi) dosyadan yüklenenle AYNI modeli kurar.
    const oku = (ad: string): unknown => JSON.parse(readFileSync(join(dirname(MODEL_DOSYASI), ad), 'utf-8'));
    const kurulan = ekranModeliniKur('jet-seyahat.model.json', {
      'jet-seyahat.model.json': oku('jet-seyahat.model.json'), 'odeme-kredi-karti.model.json': oku('odeme-kredi-karti.model.json')
    });
    expect(kurulan.model).toEqual(m);
    expect(kurulan.altModeller).toEqual(altModeller);
    expect(() => ekranModeliniKur('jet-seyahat.model.json', { 'jet-seyahat.model.json': oku('jet-seyahat.model.json') })).toThrow(/alt model "odeme-kredi-karti\.model\.json" yüklenemedi/);
  });

  test('b) senaryo verisindeki her özellik ve değer modelde biliniyor', () => {
    const { model: m, altModeller } = model();
    const harita = senaryoAnahtarHaritasi(m);
    const alanlarById = new Map<string, Alan>(
      [...ekranAlanlari(m), ...tumAlanlar(m.senaryoDuzeyi.alanlar)].map((alan) => [alan.id, alan])
    );
    const kartAlanlari = new Set(
      altModelAlanlari(altModeller['odeme-kredi-karti.model.json'])
        .map((alan) => alan.eslesme?.kart)
        .filter((kart): kart is string => kart !== undefined)
    );
    const beklenenSonucAlani = alanlarById.get('beklenenSonuc');
    const sonucTipleri = (beklenenSonucAlani?.varyantlar ?? []).map((v) => v.tip);
    const sonucAdimlari = (beklenenSonucAlani?.varyantlar ?? [])
      .flatMap((v) => v.alanlar?.adim?.secenekler ?? [])
      .map((s) => s.deger);
    const senaryoAnahtariniBul = (alanId: string): string | undefined => {
      const senaryo = alanlarById.get(alanId)?.eslesme?.senaryo;
      return Array.isArray(senaryo) ? senaryo[0] : senaryo;
    };

    const sorunlar: string[] = [];
    let senaryoSayisi = 0;
    for (const ortam of ORTAMLAR) {
      const urun = urunVerisiniOku(ortam);

      // Ürün düzeyi anahtarlar (jetSeyahat.<anahtar>) modelin urunDuzeyi'ne karşılık gelmeli.
      sorunlar.push(...farklar(`${ortam} ürün düzeyi`, Object.keys(m.urunDuzeyi), Object.keys(urun), 'model.urunDuzeyi', 'jet-seyahat.json'));

      for (const senaryo of urun.senaryolar) {
        senaryoSayisi++;
        const kayit = senaryo as unknown as Record<string, unknown>;
        const yer = `${ortam} > "${senaryo.baslik}"`;
        for (const [anahtar, deger] of Object.entries(kayit)) {
          const alan = harita.get(anahtar);
          if (!alan) {
            sorunlar.push(`${yer}: "${anahtar}" özelliği modelde yok (ne ekran alanı ne senaryo ayarı)`);
            continue;
          }
          // Seçenek listesi olan alanlarda değer listede olmalı.
          if (alan.secenekler && typeof deger === 'string') {
            const izinli = alan.secenekler.map(senaryoDegeri);
            if (!izinli.includes(deger)) sorunlar.push(`${yer}: ${anahtar}="${deger}" modelin seçeneklerinde yok (${izinli.join(', ')})`);
          }
          // Başka alana bağlı seçenekler (ör. alternatif ← kapsam).
          const bagimlilik = alan.bagimlilik;
          if (bagimlilik?.secenekHaritasi && typeof bagimlilik.alan === 'string' && typeof deger === 'string') {
            const bagliAnahtar = senaryoAnahtariniBul(bagimlilik.alan);
            const bagliDeger = bagliAnahtar ? kayit[bagliAnahtar] : undefined;
            const liste = typeof bagliDeger === 'string' ? bagimlilik.secenekHaritasi[bagliDeger] : undefined;
            if (!liste) sorunlar.push(`${yer}: ${bagimlilik.alan}="${String(bagliDeger)}" için modelde ${anahtar} seçenek listesi yok`);
            else if (!liste.map(senaryoDegeri).includes(deger)) sorunlar.push(`${yer}: ${anahtar}="${deger}", ${bagimlilik.alan}="${String(bagliDeger)}" için modelde yok`);
          }
          // Serbest kimlik nesneleri: anahtarlar alt alanların kimlikAlani değerleri olmalı.
          if (alan.tip === 'kimlikProfili' && nesneMi(deger)) {
            const izinli = new Set(
              (alan.altAlanlar ?? []).flatMap((alt) => {
                const k = alt.eslesme?.kimlikAlani;
                return k === undefined ? [] : typeof k === 'string' ? [k] : Object.values(k);
              })
            );
            for (const k of Object.keys(deger)) if (!izinli.has(k)) sorunlar.push(`${yer}: ${anahtar}.${k} kimlik alanı modelde yok`);
          }
          if (anahtar === 'krediKarti' && nesneMi(deger)) {
            for (const k of Object.keys(deger)) if (!kartAlanlari.has(k)) sorunlar.push(`${yer}: krediKarti.${k} alt modelde (kartFormu) yok`);
          }
          if (anahtar === 'beklenenSonuc' && nesneMi(deger)) {
            for (const k of Object.keys(deger)) if (!['tip', 'adim', 'mesaj'].includes(k)) sorunlar.push(`${yer}: beklenenSonuc.${k} modelde yok`);
            if (!sonucTipleri.includes(String(deger.tip))) sorunlar.push(`${yer}: beklenenSonuc.tip="${String(deger.tip)}" modelde yok`);
            if (deger.adim !== undefined && !sonucAdimlari.includes(String(deger.adim))) sorunlar.push(`${yer}: beklenenSonuc.adim="${String(deger.adim)}" modelde yok`);
          }
        }
      }
    }
    expect(senaryoSayisi, 'Hiç senaryo okunamadı').toBeGreaterThan(0);
    expect(sorunlar, `Modelde karşılığı olmayan senaryo özellikleri/değerleri:\n${sorunlar.join('\n')}`).toEqual([]);
  });

  test('c) mevcut her senaryo tek doğrulayıcıdan HATASIZ geçiyor (uyarılar serbest) ve beklenenSonucuCoz çözüyor', () => {
    const sorunlar: string[] = [];
    let senaryoSayisi = 0;
    for (const ortam of ORTAMLAR) {
      const ortak = ornekVeri<OrtakTestData>(ortam, 'ortak');
      for (const senaryo of urunVerisiniOku(ortam).senaryolar) {
        senaryoSayisi++;
        const ad = `${ortam} > "${senaryo.baslik}"`;
        // Gerçek "şimdi" ile: ortak kartın süresi geçse bile (uyarı) mevcut veri hata vermemeli.
        const sonuc = jetSeyahatSenaryosunuDogrula(senaryo, ortak, ortam, new Date(), model());
        for (const h of sonuc.hatalar) sorunlar.push(`${ad} > ${h.alan}: ${h.mesaj}`);
        try {
          beklenenSonucuCoz(senaryo, ad, model());
        } catch (hata) {
          sorunlar.push(hata instanceof Error ? hata.message : String(hata));
        }
      }
    }
    expect(senaryoSayisi).toBeGreaterThan(0);
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);
  });

  test('c2) kural sıkı: odemeAdimiDahil zorunlu, eski beklenenHata* alanları reddedilir', () => {
    const eksik = { baslik: 'x' } as unknown as JetSeyahatSenaryosu;
    expect(() => beklenenSonucuCoz(eksik, 'x', model())).toThrow(/odemeAdimiDahil: "Ödeme adımını dahil et" zorunludur/);
    const eski = { odemeAdimiDahil: true, beklenenHataMesaji: 'm' } as unknown as JetSeyahatSenaryosu;
    expect(() => beklenenSonucuCoz(eski, 'x', model())).toThrow(/artık desteklenmiyor/);
    expect(beklenenSonucuCoz({ odemeAdimiDahil: false }, 'x', model())).toEqual({ odemeAdimiDahil: false, beklenenSonuc: { tip: 'basarili' } });
  });

  test('d) TS senaryo tipi = modelin senaryoda ayarlanabilir alanları', () => {
    const modelAnahtarlari = senaryodaAyarlanabilirAnahtarlar(model().model);

    // TS tipinin anahtarları: aşağıdaki nesne derleme zamanında tipe BİREBİR uymak zorunda
    // (eksik ya da fazla anahtar = typecheck hatası), çalışma anında modelle karşılaştırılır.
    const TS_SENARYO_ANAHTARLARI = {
      baslik: true, kapsam: true, alternatif: true, covidTeminati: true, sorguTipi: true, ettiren: true,
      ettirenProfili: true, ettirenOzelKimligi: true, ettirenTuzelKimligi: true, kayakTeminati: true,
      acenteProfili: true, sigortaliKimligi: true, sigortaliProfili: true, cokluSorguDosyasi: true,
      cokluSorguKisiSayisi: true, krediKarti: true, odemeAdimiDahil: true, beklenenSonuc: true
    } satisfies Record<keyof JetSeyahatSenaryosu, true>;

    const sorunlar = farklar('TS senaryo tipi', modelAnahtarlari, Object.keys(TS_SENARYO_ANAHTARLARI), 'model', 'test-data.ts');
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);
  });
});
