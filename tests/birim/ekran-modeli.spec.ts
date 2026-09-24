// KORUMA TESTLERİ — JetSeyahat ekran modeli (tests/ekran-modelleri/jet-seyahat.model.json).
// Tarayıcı AÇMAZ, şirket ortamına BAĞLANMAZ; yalnızca dosyaları okur. Çalıştırma:
//   npm run test:birim
// Kontroller:
//  a) Model dosyası (ve alt modeli) şemaya uyuyor.
//  b) Senaryo verisindeki (test + canli) her özellik ve değer modelde biliniyor.
//  c) Her senaryo TEK doğrulayıcıdan (scripts/dogrulama/senaryo-dogrulayici.mjs) HATASIZ geçiyor
//     (ayrıntılı kural testleri: tests/birim/senaryo-dogrulayici.spec.ts).
//  d) Sunucunun JET_SEYAHAT_FORM_ALANLARI listesi ve TS senaryo tipi = modelin senaryoda
//     ayarlanabilir alanları.
//  e) Dashboard formunun sof_* kontrolleri = modelde kayıtlı form karşılıkları (+ seçenekler).
// Bir kontrol düşerse DÜZELTİLECEK YER önce modeldir; model doğruysa kod/veri tutarsızdır.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  BEKLENEN_HATA_ADIMLARI,
  beklenenSonucuCoz
} from '../support/beklenen-sonuc';
import {
  EKRAN_MODELLERI_KLASORU,
  altModelAlanlari,
  ekranAlanlari,
  ekranModeliniYukle,
  modelFormKontrolleri,
  senaryoAnahtarHaritasi,
  senaryodaAyarlanabilirAnahtarlar,
  tumAlanlar,
  type Alan,
  type FormKontrolu,
  type Secenek,
  type YuklenmisEkranModeli
} from '../support/ekran-modeli';
import { jetSeyahatSenaryosunuDogrula } from '../support/senaryo-dogrulama';
import type { JetSeyahatTestData, OrtakTestData } from '../support/test-data';

const PROJE_KOKU = resolve(__dirname, '..', '..');
const MODEL_DOSYASI = join(EKRAN_MODELLERI_KLASORU, 'jet-seyahat.model.json');
const ORTAMLAR = ['test', 'canli'] as const;
const ISTEMCI_DOSYASI = join(PROJE_KOKU, 'scripts', 'rapor', 'dashboard-istemci.js');

type JetSeyahatUrunu = JetSeyahatTestData['jetSeyahat'];
type JetSeyahatSenaryosu = JetSeyahatUrunu['senaryolar'][number];

let onbellek: YuklenmisEkranModeli | undefined;
function model(): YuklenmisEkranModeli {
  onbellek ??= ekranModeliniYukle(MODEL_DOSYASI);
  return onbellek;
}

function urunVerisiniOku(ortam: (typeof ORTAMLAR)[number]): JetSeyahatUrunu {
  const yol = join(PROJE_KOKU, 'tests', 'data', ortam, 'jet-seyahat.json');
  return (JSON.parse(readFileSync(yol, 'utf-8')) as JetSeyahatTestData).jetSeyahat;
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
      const ortak = JSON.parse(readFileSync(join(PROJE_KOKU, 'tests', 'data', ortam, 'ortak.json'), 'utf-8')) as OrtakTestData;
      for (const senaryo of urunVerisiniOku(ortam).senaryolar) {
        senaryoSayisi++;
        const ad = `${ortam} > "${senaryo.baslik}"`;
        // Gerçek "şimdi" ile: ortak kartın süresi geçse bile (uyarı) mevcut veri hata vermemeli.
        const sonuc = jetSeyahatSenaryosunuDogrula(senaryo, ortak, ortam, new Date());
        for (const h of sonuc.hatalar) sorunlar.push(`${ad} > ${h.alan}: ${h.mesaj}`);
        try {
          beklenenSonucuCoz(senaryo, ad);
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
    expect(() => beklenenSonucuCoz(eksik, 'x')).toThrow(/odemeAdimiDahil: "Ödeme adımını dahil et" zorunludur/);
    const eski = { odemeAdimiDahil: true, beklenenHataMesaji: 'm' } as unknown as JetSeyahatSenaryosu;
    expect(() => beklenenSonucuCoz(eski, 'x')).toThrow(/artık desteklenmiyor/);
    expect(beklenenSonucuCoz({ odemeAdimiDahil: false }, 'x')).toEqual({ odemeAdimiDahil: false, beklenenSonuc: { tip: 'basarili' } });
  });

  test('d) sunucu JET_SEYAHAT_FORM_ALANLARI ve TS senaryo tipi = modelin senaryoda ayarlanabilir alanları', async () => {
    const { JET_SEYAHAT_FORM_ALANLARI } = await import('../../scripts/jet-seyahat-alanlari.mjs');
    const modelAnahtarlari = senaryodaAyarlanabilirAnahtarlar(model().model);

    // TS tipinin anahtarları: aşağıdaki nesne derleme zamanında tipe BİREBİR uymak zorunda
    // (eksik ya da fazla anahtar = typecheck hatası), çalışma anında modelle karşılaştırılır.
    const TS_SENARYO_ANAHTARLARI = {
      baslik: true, kapsam: true, alternatif: true, covidTeminati: true, sorguTipi: true, ettiren: true,
      ettirenProfili: true, ettirenOzelKimligi: true, ettirenTuzelKimligi: true, kayakTeminati: true,
      acenteProfili: true, sigortaliKimligi: true, sigortaliProfili: true, cokluSorguDosyasi: true,
      cokluSorguKisiSayisi: true, krediKarti: true, odemeAdimiDahil: true, beklenenSonuc: true
    } satisfies Record<keyof JetSeyahatSenaryosu, true>;

    const sorunlar = [
      ...farklar('Sunucu alan listesi', modelAnahtarlari, [...JET_SEYAHAT_FORM_ALANLARI], 'model', 'scripts/jet-seyahat-alanlari.mjs'),
      ...farklar('TS senaryo tipi', modelAnahtarlari, Object.keys(TS_SENARYO_ANAHTARLARI), 'model', 'test-data.ts'),
      ...(new Set(JET_SEYAHAT_FORM_ALANLARI).size !== JET_SEYAHAT_FORM_ALANLARI.length ? ['Sunucu alan listesinde tekrar var'] : [])
    ];
    expect(sorunlar, sorunlar.join('\n')).toEqual([]);
  });

  test('e) dashboard formundaki sof_* kontrolleri modelde, modeldeki form karşılıkları formda', () => {
    const kaynak = readFileSync(ISTEMCI_DOSYASI, 'utf-8');
    const formdakiler = formKontrolleriniCikar(kaynak);
    // Ayrıştırıcının formu gerçekten tanıdığından emin ol (kaynak biçimi değişirse sessizce
    // "fark yok" demesin).
    expect(formdakiler.size, 'dashboard-istemci.js içinde sof_* form kontrolü bulunamadı — ayrıştırıcı güncellenmeli').toBeGreaterThan(25);
    for (const ornek of ['sof_kapsam', 'sof_kartNo', 'sof_ettirenVkn', 'sof_sigortaliKaynak', 'sof_beklenenSonucTipi']) {
      expect(formdakiler.has(ornek), `ayrıştırıcı ${ornek} kontrolünü bulamadı`).toBe(true);
    }

    const modeldekiler = modelFormKontrolleri(model());
    const sorunlar: string[] = [];
    for (const [id, kontrol] of formdakiler) {
      const modelde = modeldekiler.get(id);
      if (!modelde) sorunlar.push(`Formda var, modelde karşılığı YOK: ${id} (${kontrol})`);
      else if (modelde.kontrol !== kontrol) sorunlar.push(`${id}: formda "${kontrol}", modelde "${modelde.kontrol}" (${modelde.alan})`);
    }
    for (const [id, { alan }] of modeldekiler) {
      if (!formdakiler.has(id)) sorunlar.push(`Modelde var (${alan}), formda YOK: ${id}`);
    }

    // Formdaki sabit seçenek listeleri modelle aynı olmalı.
    const { model: m } = model();
    const alanlar = [...ekranAlanlari(m), ...tumAlanlar(m.senaryoDuzeyi.alanlar)];
    for (const [id, degerler] of sabitSelectSecenekleri(kaynak)) {
      const alan = alanlar.find((a) => a.form?.id === id);
      const modelDegerleri = alan?.form?.secenekler?.map((s) => s.deger) ?? alan?.secenekler?.map(senaryoDegeri);
      if (!modelDegerleri) continue;
      sorunlar.push(...farklar(`${id} seçenekleri`, modelDegerleri, degerler, 'model', 'form'));
    }
    const kapsamAlternatif = kapsamAlternatifSabitiniCikar(kaynak);
    const kapsam = alanlar.find((a) => a.id === 'kapsam');
    const alternatif = alanlar.find((a) => a.id === 'alternatif');
    sorunlar.push(...farklar('Kapsam seçenekleri', (kapsam?.secenekler ?? []).map(senaryoDegeri), Object.keys(kapsamAlternatif), 'model', 'JETSEYAHAT_KAPSAM_ALTERNATIF'));
    for (const [k, liste] of Object.entries(kapsamAlternatif)) {
      const modelListe = (alternatif?.bagimlilik?.secenekHaritasi?.[k] ?? []).map(senaryoDegeri);
      sorunlar.push(...farklar(`Alternatif (${k})`, modelListe, liste, 'model', 'JETSEYAHAT_KAPSAM_ALTERNATIF'));
    }
    expect(sorunlar, `Form ↔ model farkları:\n${sorunlar.join('\n')}`).toEqual([]);
  });
});

// ---- dashboard-istemci.js ayrıştırma (tarayıcısız) ----

function girdiKontrolu(etiket: string, tip: string | undefined): FormKontrolu | undefined {
  if (etiket === 'select') return 'select';
  if (etiket === 'textarea') return 'textarea';
  const t = tip ?? 'text';
  const bilinen: readonly FormKontrolu[] = ['text', 'number', 'checkbox', 'radio', 'file', 'password'];
  return (bilinen as readonly string[]).includes(t) ? (t as FormKontrolu) : undefined;
}

/**
 * Formdaki veri girişi kontrollerinin (input/select/textarea) id'lerini ve türlerini çıkarır.
 * Düğmeler, bilgi alanları ve kaplar (div/p) dahil değildir. Radyo grupları "name" ile
 * kaydedilir. Üç kaynak: (1) düz HTML metnindeki id="sof_..." etiketleri, (2) maskeliAlan(...)
 * ile üretilen şifreli alanlar, (3) kimlikAltBlokCiz(blok, tip, 'sof_<önek>') ile önek +
 * sonek olarak üretilen kimlik alanları (tüzel/özel dalları ayrı).
 */
function formKontrolleriniCikar(kaynak: string): Map<string, FormKontrolu> {
  const sonuc = new Map<string, FormKontrolu>();
  const etiketDeseni = /<(input|select|textarea)\b[^>]*>/g;
  for (const eslesme of kaynak.matchAll(etiketDeseni)) {
    const [etiketMetni, etiket] = eslesme;
    const tip = /\btype="(\w+)"/.exec(etiketMetni)?.[1];
    const kontrol = girdiKontrolu(etiket, tip);
    const id = /\bid="(sof_\w+)"/.exec(etiketMetni)?.[1];
    const ad = /\bname="(sof_\w+)"/.exec(etiketMetni)?.[1];
    if (kontrol && kontrol === 'radio' && ad) sonuc.set(ad, 'radio');
    else if (kontrol && id) sonuc.set(id, kontrol);
  }

  // (2) maskeliAlan('sof_x', ...) → <input type="password" id="' + id + '" ...>
  const maskeliTanim = /var maskeliAlan = function[\s\S]*?\n\s{4}\};/.exec(kaynak)?.[0] ?? '';
  if (/type="password"/.test(maskeliTanim)) {
    for (const [, id] of kaynak.matchAll(/maskeliAlan\('(sof_\w+)'/g)) sonuc.set(id, 'password');
  }

  // (3) kimlikAltBlokCiz
  const govde = /function kimlikAltBlokCiz\([\s\S]*?\n {2}\}\n/.exec(kaynak)?.[0] ?? '';
  const serbest = /var serbestAlanlariHtml = tip === 'tuzel'([\s\S]*?)var radioAdi/.exec(govde)?.[1] ?? '';
  const [tuzelKismi = '', ozelKismi = ''] = serbest.split(/\n\s*: '/);
  const onekliKontroller = (metin: string): Array<[string, FormKontrolu]> => {
    const liste: Array<[string, FormKontrolu]> = [];
    for (const [etiketMetni, etiket] of metin.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
      const sonek = /\bid="' \+ alanOnEki \+ '(\w+)"/.exec(etiketMetni)?.[1];
      const kontrol = girdiKontrolu(etiket, /\btype="(\w+)"/.exec(etiketMetni)?.[1]);
      if (sonek && kontrol) liste.push([sonek, kontrol]);
    }
    return liste;
  };
  const ortak = onekliKontroller(govde.replace(serbest, ''));
  const radyoSoneki = /var radioAdi = alanOnEki \+ '(\w+)'/.exec(govde)?.[1];
  if (radyoSoneki && /name="' \+ radioAdi \+ '"/.test(govde)) ortak.push([radyoSoneki, 'radio']);
  const tuzel = onekliKontroller(tuzelKismi);
  const ozel = onekliKontroller(ozelKismi);
  for (const [, tipIfadesi, onek] of kaynak.matchAll(/kimlikAltBlokCiz\([^,]+,\s*([^,]+?),\s*'(sof_\w+)'\)/g)) {
    const turler = tipIfadesi.trim() === "'ozel'" ? [ozel] : tipIfadesi.trim() === "'tuzel'" ? [tuzel] : [ozel, tuzel];
    for (const [sonek, kontrol] of [...ortak, ...turler.flat()]) sonuc.set(onek + sonek, kontrol);
  }
  return sonuc;
}

/** Formda seçenekleri HTML'e sabit yazılmış select'ler: id → option value listesi. */
function sabitSelectSecenekleri(kaynak: string): Map<string, string[]> {
  const sonuc = new Map<string, string[]>();
  for (const [, id, icerik] of kaynak.matchAll(/<select id="(sof_\w+)">((?:<option value="[^"]*"[^>]*>[^<]*<\/option>)+)<\/select>/g)) {
    sonuc.set(id, [...icerik.matchAll(/<option value="([^"]*)"/g)].map(([, deger]) => deger));
  }
  return sonuc;
}

/** dashboard-istemci.js > JETSEYAHAT_KAPSAM_ALTERNATIF sabitini okur. */
function kapsamAlternatifSabitiniCikar(kaynak: string): Record<string, string[]> {
  const govde = /var JETSEYAHAT_KAPSAM_ALTERNATIF = (\{[\s\S]*?\});/.exec(kaynak)?.[1];
  if (!govde) throw new Error('dashboard-istemci.js içinde JETSEYAHAT_KAPSAM_ALTERNATIF bulunamadı.');
  return JSON.parse(govde.replace(/'/g, '"')) as Record<string, string[]>;
}
