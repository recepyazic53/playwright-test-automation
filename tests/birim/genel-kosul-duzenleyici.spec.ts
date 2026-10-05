// KORUMA TESTLERİ — AKIŞ TASARIMINDA GENEL KOŞUL DÜZENLEYİCİSİ ("ne zaman görünür?"): alanın üstünde "Koşul ekle" / özet +
// "Koşulu düzenle"; düzenleyicide ekranın alanları ve akıştaki genel senaryonun alanları ("‹genel senaryo› › ‹alan›"; alanın kendisi ve
// döngü kuracak alanlar yok); karşılaştırma =, ≠, dolu, boş; değerler seçeneklerden, bağlı test verisi tablosundan (sayfa karşılığıyla)
// ya da elle; "+ VE koşul" / "+ VEYA koşul" (tek düzey). Kaydedilen koşul modelde mevcut ifade dilindedir ({ alan, esit | icinde },
// { degil }, { alan, dolu }, { ve | veya }); eski tek koşul aynen açılır. Değerlendirme: senaryo formu (görünür + zorunlu / gizli +
// kaydedilmez; genel senaryo alanı boşsa "koşullu · bilinmiyor"), koşucu (koşul sağlanmazsa atlanır; sağlanır ve "mutlaka görünmeli"
// ise görünmezse başarısız; bilinmiyorsa görünürse doldurulur). 1440 / 390 px taşma yok.
// Fikstür nötrdür (Bayi, Tip, Plan, İndirim, Açıklama; değerler SAHTE). Güvenlik: yalnız 127.0.0.1'deki sahte sayfa; ayrı Nöbetçi
// örneği, geçici veritabanı; dış istek yok.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { ifadeBirlestir, ifadedenSatirlar, kosulOzeti, kosulSatirlari, satirIfadesi } from '../../scripts/platform/tarama/gorunurluk-kosulu.mjs';
import { adimlardanBloklar, modeldenAkisEnvanteri } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import { akistanKayitEnvanteri } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import type { AkisBlogu } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { ortakAkislariAc } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { ifadeMetni } from '../../scripts/platform/senaryolar/akis-diyagrami.mjs';
import { gorunurlukleriHesapla } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model / yanıt JSON'u serbestçe gezilir (test verisi)
type Nesne = Record<string, any>;

const ORTAK_ANAHTAR = 'ortak-giris';
const ORTAK_DOSYA = `${ORTAK_ANAHTAR}.model.json`;
const ORTAK_AD = 'Ortak giriş';
const EKRAN_ANAHTAR = 'kosul-ekrani';
const EKRAN_AD = 'Koşul ekranı';
const BAYI = `${ORTAK_AD} › Bayi`;

const alan = (id: string, tip: string, etiket: string, ek: Nesne = {}): Nesne => ({
  id, tip, etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'dusuk' }, zorunlu: false, ...ek
});

/** Genel senaryo: Bayi (metin; seçenekleri yok — değerleri test verisi tablosundan). */
function ortakModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ortakAkis', id: ORTAK_ANAHTAR, ad: ORTAK_AD, aciklama: 'Genel senaryo (nötr fikstür).', kosullar: {},
    adimlar: [{ id: 'bayiAdimi', sira: 1, baslik: 'Bayi girilir', bolumler: [{ id: 'bayiBolumu', baslik: 'Bayi', alanlar: [alan('bayi', 'metin', 'Bayi')] }] }],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/**
 * Ekran: önce genel senaryo (ekran açıldıktan sonra), sonra Tip (radyo) → Plan (Tip = A ise; eski tek koşul) · İndirim · Açıklama.
 * Plan ve İndirim "mutlaka görünmeli" (akışta zorunlu).
 */
function ekranModel(): Nesne {
  return {
    semaSurumu: 2, tur: 'ekran', id: EKRAN_ANAHTAR, ad: EKRAN_AD, aciklama: 'Genel koşul fikstürü (değerler sahte).', ekranUrl: '/kosul-formu/', girisGerekmez: true,
    bastakiOrtakAkislar: 'sonra', specDosyasi: 'yok', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar' },
    kosullar: { planGorunur: { aciklama: 'Tip = A seçilince görünür.', ifade: { alan: 'tip', esit: 'A' } } },
    adimlar: [
      { id: 'ortakAdim', sira: 1, baslik: ORTAK_AD, ortakAkis: { dosya: ORTAK_DOSYA } },
      {
        id: 'bilgiler', sira: 2, baslik: 'Bilgiler girilir',
        bolumler: [{ id: 'bilgiBolumu', baslik: 'Bilgiler', alanlar: [
          alan('tip', 'radyo', 'Tip', { konum: { secici: 'input[name="tip"]', kirilganlik: 'dusuk' }, secenekler: [{ deger: 'A', metin: 'Tip A' }, { deger: 'B', metin: 'Tip B' }], seceneklerDurumu: 'tam' }),
          alan('plan', 'metin', 'Plan', { mutlakaGorunmeli: true, gorunurluk: { kosul: 'planGorunur' } }),
          alan('indirim', 'metin', 'İndirim', { mutlakaGorunmeli: true }),
          alan('aciklama', 'metin', 'Açıklama'),
          { id: 'kaydetDugmesi', tip: 'buton', yapilandirma: 'cikti', etiket: { ekran: 'Kaydet' }, konum: { secici: '#kaydet', kirilganlik: 'dusuk' } }
        ] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kaydet', aciklama: 'Kaydet' }], basariGostergesi: { tur: 'metin', deger: 'Kaydedildi', secici: '#sonuc' } }
      }
    ],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** Sahte sayfa: Plan yalnız Tip A'da, İndirim yalnız Bayi "10001" iken görünür (model koşulundan bilerek farklı: "mutlaka görünmeli"yi sınar). */
const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Koşul formu</title></head><body>
<form onsubmit="return false">
<p><label for="bayi">Bayi</label> <input id="bayi"></p>
<fieldset><legend>Tip</legend><label><input type="radio" name="tip" value="A"> Tip A</label> <label><input type="radio" name="tip" value="B"> Tip B</label></fieldset>
<p id="planSatiri" hidden><label for="plan">Plan</label> <input id="plan"></p>
<p id="indirimSatiri" hidden><label for="indirim">İndirim</label> <input id="indirim"></p>
<p><label for="aciklama">Açıklama</label> <input id="aciklama"></p>
<button id="kaydet" type="button">Kaydet</button><p id="sonuc"></p>
</form>
<script>
const $ = (id) => document.getElementById(id);
const tip = () => (document.querySelector('input[name="tip"]:checked') || {}).value || '';
const guncelle = () => { $('planSatiri').hidden = tip() !== 'A'; $('indirimSatiri').hidden = $('bayi').value !== '10001'; };
document.addEventListener('input', guncelle); document.addEventListener('change', guncelle);
$('kaydet').addEventListener('click', async () => {
  await fetch('/kosul-formu/kaydet', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bayi: $('bayi').value, tip: tip(), plan: $('plan').value, indirim: $('indirim').value, aciklama: $('aciklama').value }) });
  $('sonuc').textContent = 'Kaydedildi';
});
</script></body></html>`;

// ---- Saf işlevler ---------------------------------------------------------------------------------------------------

const ortaklar = { [ORTAK_DOSYA]: ortakModel() };
const acik = (m: Nesne): Nesne => ortakAkislariAc(m, ortaklar).model;
const kaynak = (dosya: string): Nesne => {
  if (dosya === ORTAK_DOSYA) return ortakModel();
  throw new Error(`yok: ${dosya}`);
};
const META = { ekranAnahtari: EKRAN_ANAHTAR, ekranAdi: EKRAN_AD, urlYolu: '/kosul-formu/', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
const alanlarHaritasi = (m: Nesne): Record<string, Nesne> => Object.fromEntries((m.adimlar as Nesne[]).flatMap((a) => ((a.bolumler ?? []) as Nesne[]).flatMap((b) => (b.alanlar as Nesne[]).map((x) => [x.id, x]))));
const ifadesi = (m: Nesne, id: string): unknown => { const g = alanlarHaritasi(m)[id].gorunurluk; return g ? m.kosullar[g.kosul].ifade : null; };
/** Diyagram blokları (alan grubunun koşulları değiştirilerek) → model (akisKaydet ile aynı çeviri). */
function diyagramdanModel(m: Nesne, kosullar: Record<string, unknown>): { model: Nesne | null; hatalar: string[] } {
  const env = modeldenAkisEnvanteri(m);
  const bloklar = adimlardanBloklar(m, m.adimlar, env).map((b) => (b.tur === 'alanlar' ? { ...b, kosullar: { ...(b.kosullar ?? {}), ...kosullar } } : b)) as AkisBlogu[];
  const { envanter, hatalar } = akistanKayitEnvanteri(env, bloklar);
  if (!envanter) return { model: null, hatalar: hatalar.map((h) => h.mesaj) };
  return { model: kayitPaketiOlustur({ ...META, mevcutModel: m }, envanter).paket.model as Nesne, hatalar: [] };
}
const INDIRIM_VE = { bag: 've', satirlar: [{ alan: 'bayi', ortak: true, etiket: BAYI, islem: 'esit', degerler: ['10001'] }, { alan: 'tip', islem: 'esit', degerler: ['A'] }] };
const ACIKLAMA_VEYA = { bag: 'veya', satirlar: [{ alan: 'tip', islem: 'degil', degerler: ['A', 'B'] }, { alan: 'plan', islem: 'bos', degerler: [] }, { alan: 'bayi', ortak: true, islem: 'dolu', degerler: [] }] };

test.describe('saf işlevler', () => {
  test('koşul biçimi: satır → model ifadesi (=, ≠, dolu, boş, onay); ifade → satırlar; özet; okunamayan ifade null', () => {
    expect(satirIfadesi({ islem: 'esit', degerler: ['A'] }, 'tip', false)).toEqual({ alan: 'tip', esit: 'A' });
    expect(satirIfadesi({ islem: 'esit', degerler: ['A', 'B'] }, 'tip', false)).toEqual({ alan: 'tip', icinde: ['A', 'B'] });
    expect(satirIfadesi({ islem: 'degil', degerler: ['A'] }, 'tip', false)).toEqual({ degil: { alan: 'tip', esit: 'A' } });
    expect(satirIfadesi({ islem: 'dolu', degerler: [] }, 'bayi', false)).toEqual({ alan: 'bayi', dolu: true });
    expect(satirIfadesi({ islem: 'bos', degerler: [] }, 'bayi', false)).toEqual({ alan: 'bayi', dolu: false });
    expect(satirIfadesi({ islem: 'esit', degerler: ['false'] }, 'onay', true)).toEqual({ alan: 'onay', esit: false });
    const ifade = ifadeBirlestir('veya', [{ degil: { alan: 'tip', icinde: ['A', 'B'] } }, { alan: 'plan', dolu: false }, { alan: 'onay', esit: true }]);
    expect(ifadedenSatirlar(ifade)).toEqual({ bag: 'veya', satirlar: [
      { alan: 'tip', islem: 'degil', degerler: ['A', 'B'] }, { alan: 'plan', islem: 'bos', degerler: [] }, { alan: 'onay', islem: 'esit', degerler: ['true'], onay: true }
    ] });
    // İç içe / karışık / senaryo ayarı: düzenleyicide gösterilmez (kilitli, aynen korunur). "Ekranda görünürse" bir satırdır.
    expect(ifadedenSatirlar({ ve: [{ alan: 'a', esit: '1' }, { veya: [{ alan: 'b', esit: '2' }] }] })).toBeNull();
    expect(ifadedenSatirlar({ senaryoAyari: 'x', esit: true })).toBeNull();
    expect(ifadedenSatirlar({ calismaZamani: 'gorunurse' })).toEqual({ bag: 've', satirlar: [{ alan: '', islem: 'gorunurse', degerler: [] }] });
    // Eski tek koşul aynen bir "=" satırıdır; özet.
    expect(kosulSatirlari({ secim: 'tip', degerler: ['A'] })).toEqual({ bag: 've', satirlar: [{ alan: 'tip', islem: 'esit', degerler: ['A'] }] });
    const ad = (s: { alan: string; ortak?: boolean }) => (s.ortak ? BAYI : s.alan === 'tip' ? 'Tip' : s.alan);
    expect(kosulOzeti({ secim: 'tip', degerler: ['A', 'B'] }, ad)).toBe('Tip = A ya da B ise');
    expect(kosulOzeti(INDIRIM_VE, ad)).toBe(`${BAYI} = 10001 ve Tip = A ise`);
    expect(kosulOzeti(ACIKLAMA_VEYA, ad)).toBe(`Tip ≠ A, B veya plan boş veya ${BAYI} dolu ise`);
  });

  test('diyagram → model → diyagram: VE / VEYA, =, ≠, dolu, boş ve genel senaryo alanı modele yazılır, geri okunur; eski tek koşul aynen kalır; doğrulayıcı geçer', () => {
    const m = ekranModel();
    // Eski tek koşul düzenleyicide eski biçimle açılır (geri uyum).
    const env = modeldenAkisEnvanteri(m);
    const grup = adimlardanBloklar(m, m.adimlar, env).find((b) => b.tur === 'alanlar') as Nesne;
    expect(grup.kosullar.plan).toEqual({ secim: 'tip', degerler: ['A'] });

    const { model, hatalar } = diyagramdanModel(m, { indirim: INDIRIM_VE, aciklama: ACIKLAMA_VEYA });
    expect(hatalar).toEqual([]);
    const yeni = model as Nesne;
    expect(ifadesi(yeni, 'indirim')).toEqual({ ve: [{ alan: 'bayi', esit: '10001' }, { alan: 'tip', esit: 'A' }] });
    expect(ifadesi(yeni, 'aciklama')).toEqual({ veya: [{ degil: { alan: 'tip', icinde: ['A', 'B'] } }, { alan: 'plan', dolu: false }, { alan: 'bayi', dolu: true }] });
    // Eski koşul (Plan) değişmez: aynı adlandırılmış koşul.
    expect(alanlarHaritasi(yeni).plan.gorunurluk).toEqual({ kosul: 'planGorunur' });
    expect(yeni.kosullar[alanlarHaritasi(yeni).indirim.gorunurluk.kosul].aciklama).toBe(`${BAYI} = 10001 ve Tip = Tip A ise görünür (akış tasarımı).`);
    // Ekran modeli doğrulayıcısı: genel senaryo alanına başvuru geçerli (genel senaryonun alanları okunur).
    expect(() => ekranModeliniDogrula('kosul-ekrani.model.json', yeni, kaynak)).not.toThrow();

    // Geri okuma: düzenleyici aynı satırları görür (genel senaryo alanı ortak: true).
    const geri = adimlardanBloklar(yeni, yeni.adimlar, modeldenAkisEnvanteri(yeni)).find((b) => b.tur === 'alanlar') as Nesne;
    expect(geri.kosullar.indirim).toEqual({ bag: 've', satirlar: [{ alan: 'bayi', islem: 'esit', degerler: ['10001'], ortak: true }, { alan: 'tip', islem: 'esit', degerler: ['A'] }] });
    expect(geri.kosullar.aciklama).toMatchObject({ bag: 'veya', satirlar: [{ alan: 'tip', islem: 'degil' }, { alan: 'plan', islem: 'bos' }, { alan: 'bayi', islem: 'dolu', ortak: true }] });
    expect(geri.kosullar.plan).toEqual({ secim: 'tip', degerler: ['A'] });
    expect(geri.korunanKosullar).toBeUndefined();
    // Aynı ifade yeniden kaydedilince yeni koşul adı birikmez.
    const ikinci = diyagramdanModel(yeni, { indirim: INDIRIM_VE }).model as Nesne;
    expect(alanlarHaritasi(ikinci).indirim.gorunurluk).toEqual(alanlarHaritasi(yeni).indirim.gorunurluk);

    // Düzenleyicide gösterilemeyen (iç içe) koşul salt okunur kalır.
    const icIce = ekranModel();
    icIce.kosullar.icIce = { aciklama: 'İç içe', ifade: { ve: [{ alan: 'tip', esit: 'A' }, { veya: [{ alan: 'plan', dolu: true }, { alan: 'bayi', dolu: true }] }] } };
    alanlarHaritasi(icIce).indirim.gorunurluk = { kosul: 'icIce' };
    const kilitli = adimlardanBloklar(icIce, icIce.adimlar, modeldenAkisEnvanteri(icIce)).find((b) => b.tur === 'alanlar') as Nesne;
    expect(kilitli.korunanKosullar).toEqual({ indirim: 'İç içe' });
    expect(kilitli.kosullar).not.toHaveProperty('indirim');
  });

  test('diyagram doğrulaması: değersiz =, kendine bağlı ve döngü kuran koşul reddedilir; doğrulayıcı bilinmeyen alanı ve bozuk "dolu"yu bildirir', () => {
    const m = ekranModel();
    expect(diyagramdanModel(m, { indirim: { bag: 've', satirlar: [{ alan: 'tip', islem: 'esit', degerler: [] }] } }).hatalar)
      .toEqual(['“İndirim” alanının koşulunda “Tip” için en az bir değer seçin ya da yazın.']);
    expect(diyagramdanModel(m, { indirim: { bag: 've', satirlar: [{ alan: 'indirim', islem: 'dolu', degerler: [] }] } }).hatalar)
      .toEqual(['“İndirim” alanının koşulu kendisine bağlanamaz.']);
    expect(diyagramdanModel(m, {
      indirim: { bag: 've', satirlar: [{ alan: 'aciklama', islem: 'dolu', degerler: [] }] },
      aciklama: { bag: 've', satirlar: [{ alan: 'indirim', islem: 'bos', degerler: [] }] }
    }).hatalar.join(' ')).toContain('döngü oluşturuyor');
    const bozuk = ekranModel();
    bozuk.kosullar.bozuk = { ifade: { ve: [{ alan: 'yokAlan', esit: 'x' }, { alan: 'plan', dolu: 'evet' }] } };
    expect(() => ekranModeliniDogrula('kosul-ekrani.model.json', bozuk, kaynak)).toThrow(/başvurulan alan "yokAlan" modelde yok[\s\S]*"dolu" true ya da false olmalı|"dolu" true ya da false olmalı[\s\S]*başvurulan alan "yokAlan" modelde yok/);
  });

  test('değerlendirme: form / doğrulayıcı (görünür, gizli, bilinmiyor), koşu planı (atlama, mutlaka görünmeli yalnız koşul sağlanınca) ve diyagram metni', () => {
    const yeni = acik(diyagramdanModel(ekranModel(), { indirim: INDIRIM_VE, aciklama: ACIKLAMA_VEYA }).model as Nesne);
    const g = (veri: Nesne) => gorunurlukleriHesapla(veri, { model: yeni as Nesne & { adimlar: Nesne[] } });
    // Tip B: Plan gizli; İndirim (VE) gizli — Bayi bilinmese de bir satır sağlanmıyor.
    expect(g({ tip: 'B' }).alanlar).toMatchObject({ plan: false, indirim: false });
    // Tip A, Bayi boş (genel senaryo alanı): İndirim bilinmiyor; Plan görünür.
    expect(g({ tip: 'A' }).alanlar).toMatchObject({ plan: true, indirim: null });
    expect(g({ tip: 'A', bayi: '10001' }).alanlar.indirim).toBe(true);
    expect(g({ tip: 'A', bayi: '20002' }).alanlar.indirim).toBe(false);
    // Tablodan gelen değer: bilinmiyor (koşuda belli olur; "satıra göre").
    const tablodan = g({ tip: 'A', bayi: '${Bayi listesi.Kod}' });
    expect(tablodan.alanlar.indirim).toBeNull();
    expect(tablodan.satiraGore.alanlar.indirim).toBe(true);
    // VEYA: ≠ (hiçbiri), boş, dolu.
    expect(g({ tip: 'A', plan: 'P1', bayi: '10001' }).alanlar.aciklama).toBe(true); // Bayi dolu
    expect(g({ tip: 'A', plan: '' }).alanlar.aciklama).toBe(true); // Plan boş
    expect(g({ tip: 'A', plan: 'P1' }).alanlar.aciklama).toBeNull(); // ≠ yanlış, Plan dolu, Bayi bilinmiyor
    expect(g({ tip: 'A', plan: 'P1', bayi: '1' }).alanlar.aciklama).toBe(true);

    // Koşu planı: sağlanmayan koşul → alan plana girmez (atlanır, "mutlaka görünmeli" olsa da); bilinmiyorsa "mutlaka" uygulanmaz.
    const planAlani = (veri: Nesne, id: string) => modelKosuPlani(yeni, { baslik: 'x', ...veri }).adimlar.flatMap((a) => a.alanlar).find((x) => x.id === id);
    expect(planAlani({ tip: 'B', plan: 'P1', indirim: '5' }, 'plan')).toBeUndefined();
    expect(planAlani({ tip: 'B', plan: 'P1', indirim: '5' }, 'indirim')).toBeUndefined();
    expect(planAlani({ tip: 'A', plan: 'P1', indirim: '5' }, 'plan')).toMatchObject({ deger: 'P1', mutlakaGorunmeli: true });
    expect(planAlani({ tip: 'A', plan: 'P1', indirim: '5' }, 'indirim')).toMatchObject({ deger: '5', mutlakaGorunmeli: false });
    expect(planAlani({ tip: 'A', bayi: '10001', plan: 'P1', indirim: '5' }, 'indirim')).toMatchObject({ deger: '5', mutlakaGorunmeli: true });

    // Diyagram (senaryo akışı) metni: dolu / boş okunur.
    expect(ifadeMetni({ alan: 'plan', dolu: false }, yeni)).toBe('Plan boş');
    expect(ifadeMetni({ ve: [{ alan: 'bayi', dolu: true }, { alan: 'tip', esit: 'A' }] }, yeni)).toBe('Bayi dolu ve Tip = Tip A');
  });
});

// ---- Sunucu, arayüz ve koşu ------------------------------------------------------------------------------------------

test.describe('sunucu, arayüz ve koşu (sahte sayfa)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Genel-Kosul-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';
  const gelenler: Nesne[] = [];
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const paket = (model: Nesne, anahtar: string, ad: string, urlYolu?: string): Nesne => ({
    tur: 'sayfa-paketi', surum: 1,
    meta: { ekran: { anahtar, ad, ...(urlYolu ? { urlYolu } : {}) }, olusturan: 'test', olusturulma: '2026-10-05T09:00:00Z', baglamProfilleri: [] },
    model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
  });
  const tasarim = () => api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekranId}&akisId=ana`);
  const model = async () => (await api(`/platform/ekran?projeId=${projeId}&id=${encodeURIComponent(ekranId)}`)).model as Nesne;
  const tasmaYok = async (page: Page, yer: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), yer).toBeLessThanOrEqual(0);
  const kutuTasmaz = async (l: Locator, yer: string) => expect(await l.evaluate((e) => e.scrollWidth - e.clientWidth), yer).toBeLessThanOrEqual(1);

  async function sayfaAc(adres: string, genislik: number): Promise<{ page: Page; bitir: () => Promise<void> }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 } });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    const istekler: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    baglam.on('request', (r) => { istekler.push(r.url()); });
    await page.goto(adres);
    return {
      page,
      bitir: async () => {
        expect(hatalar).toEqual([]);
        expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
        await baglam.close();
      }
    };
  }
  /** Akış tasarımı (ekranın ana akışı) açılır. */
  async function tasarimAc(genislik: number) {
    const s = await sayfaAc(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis`, genislik);
    await s.page.getByRole('button', { name: 'Düzenle' }).click();
    await expect(s.page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
    return s;
  }
  const cip = (page: Page, etiket: string) => page.locator('.tasarim-alani').filter({ has: page.locator('.ad', { hasText: new RegExp(`^${etiket}$`) }) });
  /** Akışı API'yle kaydeder (alan grubunun koşulları değiştirilerek). */
  async function kosullariKaydet(kosullar: Record<string, unknown>): Promise<Nesne> {
    const t = await tasarim();
    const bloklar = (t.bloklar as Nesne[]).map((b) => (b.tur === 'alanlar' ? { ...b, kosullar: { ...(b.kosullar ?? {}), ...kosullar } } : b));
    return api('/platform/ekran/akis/kaydet', { projeId, ekranId, akisId: 'ana', ad: 'Ana akış', bloklar, onay: true });
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'genel-kosul-'));
    fikstur = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => {
      if (i.yol === '/kosul-formu/') return { tur: 'text/html; charset=utf-8', govde: SAYFA };
      if (i.yol === '/kosul-formu/kaydet' && i.yontem === 'POST') { gelenler.push(JSON.parse(i.govde) as Nesne); return { tur: 'application/json', govde: '{}' }; }
      return { durum: 404, tur: 'text/plain', govde: 'yok' };
    });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Genel Koşul Projesi' })).proje.id);
    ortamId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam.id);
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ortakModel(), ORTAK_ANAHTAR, ORTAK_AD), senaryoIndeksleri: [], ortamIdleri: [] });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ekranModel(), EKRAN_ANAHTAR, EKRAN_AD, '/kosul-formu/'), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    const ekranlar = (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[];
    ekranId = String(ekranlar.find((e) => e.anahtar === EKRAN_ANAHTAR)?.id);
    const ortakId = String(ekranlar.find((e) => e.anahtar === ORTAK_ANAHTAR)?.id);
    // Bayi değerleri: genel senaryonun alan bağı → "Bayi listesi" tablosu (sayfa karşılığıyla).
    const tablo = String((await basarili('/platform/tablo/kaydet', {
      projeId, ad: 'Bayi listesi', tur: 'liste', sutunlar: [{ ad: 'Kod', karsiliklar: { 10001: { sayfa: 'B-10001' } } }],
      satirlar: [{ ad: 'bir', degerler: { Kod: '10001' } }, { ad: 'iki', degerler: { Kod: '20002' } }]
    })).tablo.id);
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId: ortakId, baglar: { bayi: { tablo, sutun: 'Kod' } } });
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('tasarım verisi: genel senaryonun alanları ve bağlı tablonun değerleri (sayfa karşılığıyla) gelir; eski koşul eski biçimde', async () => {
    const t = await tasarim();
    expect(t.kosulKaynaklari.ortak).toEqual([{
      dosya: ORTAK_DOSYA, ad: ORTAK_AD,
      alanlar: [{ id: 'bayi', etiket: 'Bayi', tur: 'text', secenekler: null, kismi: true, tabloDegerleri: [{ deger: '10001', metin: '10001 (sayfada: B-10001)' }, { deger: '20002', metin: '20002' }] }]
    }]);
    const grup = (t.bloklar as Nesne[]).find((b) => b.tur === 'alanlar') as Nesne;
    expect(grup.kosullar.plan).toEqual({ secim: 'tip', degerler: ['A'] });
  });

  test('akış tasarımı (1440 px): "Koşul ekle"; alan listesi (genel senaryo alanı dahil, kendisi ve döngü yok); tablo değerleri; VE; kaydet → model; özet', async () => {
    test.setTimeout(120_000);
    const { page, bitir } = await tasarimAc(1440);
    const indirim = cip(page, 'İndirim');
    const plan = cip(page, 'Plan');
    // Eski tek koşul aynen açılır: özet + "Koşulu düzenle".
    await expect(plan.locator('.kosul-ozeti')).toHaveText('Tip = Tip A ise görünür');
    await expect(plan.getByRole('button', { name: 'Plan: koşul' })).toHaveText('Koşulu düzenle');
    await expect(indirim.getByRole('button', { name: 'İndirim: koşul' })).toHaveText('Koşul ekle');

    // Tip'in koşulunda Plan yok (Plan'ın koşulu Tip'e bağlı: döngü); kendisi de yok.
    await cip(page, 'Tip').getByRole('button', { name: 'Tip: koşul' }).click();
    const tipDuz = page.getByRole('group', { name: 'Tip: ne zaman görünür' });
    const tipSecenekleri = await tipDuz.getByRole('combobox', { name: 'Alan' }).locator('option').allTextContents();
    expect(tipSecenekleri).toEqual(['Alan seçin…', 'İndirim', 'Açıklama', BAYI]);
    await tipDuz.getByRole('button', { name: 'Vazgeç' }).click();

    await indirim.getByRole('button', { name: 'İndirim: koşul' }).click();
    const duz = page.getByRole('group', { name: 'İndirim: ne zaman görünür' });
    const satir1 = duz.getByRole('group', { name: 'Koşul 1' });
    const alanSecimi = satir1.getByRole('combobox', { name: 'Alan' });
    // Ekranın alanları (kendisi yok) + genel senaryonun alanı "‹genel senaryo› › ‹alan›".
    expect(await alanSecimi.locator('option').allTextContents()).toEqual(['Alan seçin…', 'Tip', 'Plan', 'Açıklama', BAYI]);
    expect(await satir1.getByRole('combobox', { name: 'Karşılaştırma' }).locator('option').allTextContents()).toEqual(['= (şunlardan biri)', '≠ (hiçbiri)', 'dolu', 'boş', 'ekranda görünürse (koşuda belli olur)']);
    await alanSecimi.selectOption({ label: BAYI });
    // Seçeneği olmayan genel senaryo alanı: bağlı tablonun değerleri (sayfa karşılığı metinde); elle kutusu yok.
    const degerler = satir1.getByRole('group', { name: 'Değerler' });
    await expect(degerler.getByRole('checkbox')).toHaveCount(2);
    await expect(degerler).toContainText('10001 (sayfada: B-10001)');
    await expect(degerler.getByRole('textbox', { name: 'Elle değer' })).toHaveCount(0);
    await duz.getByRole('button', { name: 'Koşulu kaydet' }).click();
    await expect(duz.getByRole('alert')).toHaveText(`Koşul kaydedilemedi: “${BAYI}” için en az bir değer işaretleyin ya da yazın.`);
    await degerler.getByRole('checkbox', { name: /^10001/ }).check();
    // + VE koşul: Tip = Tip A (radyo seçenekleri; çoklu işaret).
    await duz.getByRole('button', { name: '+ VE koşul' }).click();
    await expect(duz.getByRole('button', { name: '+ VEYA koşul' })).toBeDisabled();
    const satir2 = duz.getByRole('group', { name: 'Koşul 2' });
    await satir2.getByRole('combobox', { name: 'Alan' }).selectOption({ label: 'Tip' });
    await expect(satir2.getByRole('group', { name: 'Değerler' }).getByRole('checkbox')).toHaveCount(2);
    await satir2.getByRole('checkbox', { name: 'Tip A' }).check();
    await tasmaYok(page, 'düzenleyici 1440');
    await kutuTasmaz(duz, 'düzenleyici kutusu 1440');
    await duz.screenshot({ path: test.info().outputPath('kosul-duzenleyici-1440.png') });
    await duz.getByRole('button', { name: 'Koşulu kaydet' }).click();
    await expect(indirim.locator('.kosul-ozeti')).toHaveText(`${BAYI} = 10001 ve Tip = Tip A ise görünür`);
    await expect(indirim.getByRole('button', { name: 'İndirim: koşul' })).toHaveText('Koşulu düzenle');
    await tasmaYok(page, 'özet 1440');
    await indirim.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: test.info().outputPath('kosul-ozeti-1440.png') });

    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText(/Akış kaydedildi/).first()).toBeVisible();
    const m = await model();
    expect(ifadesi(m, 'indirim')).toEqual({ ve: [{ alan: 'bayi', esit: '10001' }, { alan: 'tip', esit: 'A' }] });
    expect(ifadesi(m, 'plan')).toEqual({ alan: 'tip', esit: 'A' });
    await bitir();
  });

  test('akış tasarımı (390 px): kayıtlı koşul aynen açılır; VEYA (VE kapanır); elle değer; ≠; taşma yok; Koşulu kaldır', async () => {
    test.setTimeout(120_000);
    const { page, bitir } = await tasarimAc(390);
    const indirim = cip(page, 'İndirim');
    await expect(indirim.locator('.kosul-ozeti')).toHaveText(`${BAYI} = 10001 ve Tip = Tip A ise görünür`);
    await indirim.getByRole('button', { name: 'İndirim: koşul' }).click();
    const duz = page.getByRole('group', { name: 'İndirim: ne zaman görünür' });
    await expect(duz.getByRole('group', { name: 'Koşul 1' }).getByRole('combobox', { name: 'Alan' })).toHaveValue('ortak:bayi');
    await expect(duz.getByRole('group', { name: 'Koşul 1' }).getByRole('checkbox', { name: /^10001/ })).toBeChecked();
    await expect(duz.getByRole('group', { name: 'Koşul 2' }).getByRole('checkbox', { name: 'Tip A' })).toBeChecked();
    await expect(duz.getByRole('button', { name: '+ VEYA koşul' })).toBeDisabled();
    await tasmaYok(page, 'düzenleyici 390');
    await kutuTasmaz(duz, 'düzenleyici kutusu 390');
    await duz.getByRole('button', { name: 'Vazgeç' }).click();

    // Plan: eski tek koşul + VEYA "Açıklama ≠ X1" (seçeneksiz, bağsız alan: elle değer).
    const plan = cip(page, 'Plan');
    await plan.getByRole('button', { name: 'Plan: koşul' }).click();
    const pd = page.getByRole('group', { name: 'Plan: ne zaman görünür' });
    await expect(pd.getByRole('group', { name: 'Koşul 1' }).getByRole('radio', { name: 'Tip A' })).toHaveCount(0);
    await expect(pd.getByRole('group', { name: 'Koşul 1' }).getByRole('checkbox', { name: 'Tip A' })).toBeChecked();
    await pd.getByRole('button', { name: '+ VEYA koşul' }).click();
    await expect(pd.getByRole('button', { name: '+ VE koşul' })).toBeDisabled();
    const s2 = pd.getByRole('group', { name: 'Koşul 2' });
    await s2.getByRole('combobox', { name: 'Alan' }).selectOption({ label: 'Açıklama' });
    await s2.getByRole('combobox', { name: 'Karşılaştırma' }).selectOption('degil');
    await s2.getByRole('textbox', { name: 'Elle değer' }).fill('X1');
    await s2.getByRole('button', { name: 'Değer ekle' }).click();
    await expect(s2.getByRole('checkbox', { name: 'X1' })).toBeChecked();
    await tasmaYok(page, 'VEYA 390');
    await kutuTasmaz(pd, 'VEYA kutusu 390');
    await page.screenshot({ path: test.info().outputPath('kosul-duzenleyici-390.png'), fullPage: false });
    await pd.getByRole('button', { name: 'Koşulu kaydet' }).click();
    await expect(plan.locator('.kosul-ozeti')).toHaveText('Tip = Tip A veya Açıklama ≠ X1 ise görünür');
    await tasmaYok(page, 'özet 390');
    // Koşulu kaldır: alan her zaman görünür (kaydetmeden; sonraki testler eski koşulla sürer).
    await plan.getByRole('button', { name: 'Plan: koşul' }).click();
    await page.getByRole('group', { name: 'Plan: ne zaman görünür' }).getByRole('button', { name: 'Koşulu kaldır' }).click();
    await expect(plan.locator('.kosul-ozeti')).toHaveCount(0);
    await expect(plan.getByRole('button', { name: 'Plan: koşul' })).toHaveText('Koşul ekle');
    await bitir();
  });

  test('sunucu: kaydet → model ifadesi (≠, dolu); değersiz satır anlaşılır hatayla reddedilir', async () => {
    const red = await kosullariKaydet({ aciklama: { bag: 've', satirlar: [{ alan: 'tip', islem: 'degil', degerler: [] }] } });
    expect(red.basarili).toBe(false);
    expect((red.hatalar as Nesne[]).map((h) => h.mesaj)).toContain('“Açıklama” alanının koşulunda “Tip” için en az bir değer seçin ya da yazın.');
    // Koşu fikstürü: İndirim = Tip A VE Bayi dolu; Açıklama = Tip ≠ A.
    const y = await kosullariKaydet({
      indirim: { bag: 've', satirlar: [{ alan: 'tip', islem: 'esit', degerler: ['A'] }, { alan: 'bayi', ortak: true, etiket: BAYI, islem: 'dolu', degerler: [] }] },
      aciklama: { bag: 've', satirlar: [{ alan: 'tip', islem: 'degil', degerler: ['A'] }] }
    });
    expect(y.basarili, JSON.stringify(y.hatalar ?? y.mesaj)).toBe(true);
    const m = await model();
    expect(ifadesi(m, 'indirim')).toEqual({ ve: [{ alan: 'tip', esit: 'A' }, { alan: 'bayi', dolu: true }] });
    expect(ifadesi(m, 'aciklama')).toEqual({ degil: { alan: 'tip', esit: 'A' } });
  });

  test('senaryo formu (1440 / 390 px): koşul sağlanınca görünür, sağlanmayınca gizli ve kaydedilmez; genel senaryo alanı boşken "koşullu · bilinmiyor"', async () => {
    test.setTimeout(120_000);
    const { page, bitir } = await sayfaAc(`/#/senaryolar/yeni/${encodeURIComponent(ekranId)}`, 1440);
    const alanKap = (id: string): Locator => page.locator(`[data-alan="${id}"]`);
    const girdi = (id: string): Locator => alanKap(id).locator('.alan-govdesi input[type="text"]');
    await expect(alanKap('tip')).toBeVisible({ timeout: 20_000 });
    // Tip seçilmedi: Plan ve İndirim gizli; Açıklama (Tip ≠ A) görünür.
    await expect(alanKap('plan')).toBeHidden();
    await expect(alanKap('indirim')).toBeHidden();
    await expect(alanKap('aciklama')).toBeVisible();
    await alanKap('tip').getByRole('radio', { name: 'Tip A', exact: true }).check();
    await expect(alanKap('plan')).toBeVisible();
    await expect(alanKap('aciklama')).toBeHidden();
    // Bayi (genel senaryo) boş: İndirim bilinmiyor — görünür, "koşullu · bilinmiyor".
    await expect(alanKap('indirim')).toBeVisible();
    await expect(alanKap('indirim').locator('.kosullu-cip')).toHaveText('koşullu · bilinmiyor');
    await girdi('bayi').fill('20002');
    await expect(alanKap('indirim').locator('.kosullu-cip')).toHaveText('koşullu');
    await girdi('plan').fill('P1');
    await girdi('indirim').fill('5');
    await tasmaYok(page, 'form 1440');
    await page.setViewportSize({ width: 390, height: 900 });
    await tasmaYok(page, 'form 390');
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Tip B: Plan ve İndirim gizlenir, değerleri kaydedilmez; Açıklama görünür.
    await alanKap('tip').getByRole('radio', { name: 'Tip B', exact: true }).check();
    await expect(alanKap('plan')).toBeHidden();
    await expect(alanKap('indirim')).toBeHidden();
    await girdi('aciklama').fill('not');
    await page.getByRole('textbox', { name: 'Başlık', exact: true }).fill('Formdan B');
    await page.getByRole('button', { name: 'Senaryoyu oluştur' }).click();
    await expect(page).toHaveURL(/#\/senaryolar\/u\//);
    const liste = (await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`)).senaryolar as Nesne[];
    const id = String(liste.find((x) => x.baslik === 'Formdan B')?.id);
    const veri = ((await api(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo as Nesne).veri as Nesne;
    expect(veri).toMatchObject({ tip: 'B', bayi: '20002', aciklama: 'not' });
    expect(veri).not.toHaveProperty('plan');
    expect(veri).not.toHaveProperty('indirim');
    await bitir();
  });

  test('koşu: sağlanmayan koşul atlanır ("mutlaka görünmeli" olsa da); sağlanan + görünmeyen "mutlaka görünmeli" başarısız; bilinmiyorsa görünmeyen atlanır; hepsi görünürse doldurulur', async () => {
    test.setTimeout(300_000);
    const kos = async (baslik: string, veri: Nesne): Promise<Nesne> => {
      const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamId], veri: { baslik, ...veri } });
      const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId });
      expect(y.basarili, `${baslik}: ${String(y.mesaj ?? '')}`).toBe(true);
      return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    };
    // Tip B: Plan (Tip = A) ve İndirim (Tip = A VE Bayi dolu) sağlanmaz → atlanır; sayfa Plan'ı gizlese de test geçer.
    let once = gelenler.length;
    const atla = await kos('Koşu B', { bayi: '10001', tip: 'B', aciklama: 'not' });
    expect(atla.durum, JSON.stringify(atla.hataMesaji)).toBe('basarili');
    expect(gelenler.slice(once)).toEqual([{ bayi: '10001', tip: 'B', plan: '', indirim: '', aciklama: 'not' }]);
    // Tip A + Bayi 20002: İndirim koşulu sağlanır ve "mutlaka görünmeli"; sayfa göstermez → başarısız.
    once = gelenler.length;
    const mutlaka = await kos('Koşu mutlaka', { bayi: '20002', tip: 'A', plan: 'P1', indirim: '5' });
    expect(mutlaka.durum).toBe('basarisiz');
    expect(String(mutlaka.hataMesaji)).toContain('İndirim alanı ekranda görünür (mutlaka görünmeli)');
    expect(gelenler.slice(once)).toEqual([]);
    // Bayi boş (genel senaryo alanı): İndirim bilinmiyor → görünmüyorsa atlanır, test geçer.
    once = gelenler.length;
    const bilinmiyor = await kos('Koşu bilinmiyor', { tip: 'A', plan: 'P1', indirim: '5' });
    expect(bilinmiyor.durum, JSON.stringify(bilinmiyor.hataMesaji)).toBe('basarili');
    expect(JSON.stringify(bilinmiyor)).toContain('ekranda görünmüyor');
    expect(gelenler.slice(once)).toEqual([{ bayi: '', tip: 'A', plan: 'P1', indirim: '', aciklama: '' }]);
    // Bayi 10001 + Tip A: hepsi görünür ve doldurulur; Açıklama (Tip ≠ A) atlanır.
    once = gelenler.length;
    const tam = await kos('Koşu tam', { bayi: '10001', tip: 'A', plan: 'P1', indirim: '5', aciklama: 'yazılmaz' });
    expect(tam.durum, JSON.stringify(tam.hataMesaji)).toBe('basarili');
    expect(gelenler.slice(once)).toEqual([{ bayi: '10001', tip: 'A', plan: 'P1', indirim: '5', aciklama: '' }]);
  });
});
