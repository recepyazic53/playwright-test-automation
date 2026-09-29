// BAŞTAKİ ORTAK AKIŞ — koşu sırası: Giriş → akışın başındaki ortak akış blokları (girişten sonra açılan sayfada; girişsizde
// ortamın taban adresinde) → "Ekran açılır" → ekran adımları. Blok "Ekrana dön" ile biterse ekran ikinci kez açılmaz. Akış
// ayarı "bastakiOrtakAkislar": "sonra" eski davranışı (ekran önce açılır) korur; akışın ortasındaki ortak akışlar değişmez.
// Testler: koşu planı / senaryo diyagramı / dışa aktarma (saf), doğrulayıcı, gerçek koşu (127.0.0.1'deki sahte uygulama: ana
// sayfada bağlantıyla açılan pencere + profil formu; istek kaydıyla ekran adresinin kaç kez ve ne zaman istendiği), akış
// diyagramı ("Ekran açılır" düğümü; kaydetme gidiş-dönüşü, API ve arayüz). Nötr fikstür; değerler sahte; dışarıya istek yok.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { ortakAkislariAc } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { modelKosuPlani } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { akisDiyagrami } from '../../scripts/platform/senaryolar/akis-diyagrami.mjs';
import { playwrightKoduUret } from '../../scripts/platform/senaryolar/playwright-disa-aktarma.mjs';
import { ekranModeliniDogrula } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import {
  AKIS_YOLU, AkisUygulamasi, HAVUZLAR, ONAY_AKIS_ANAHTARI, PROFIL_AKIS_ANAHTARI, PROFIL_YOLU, akisModeli, akisPaketi, onayAkisPaketi, profilAkisPaketi
} from './model-kosucu-ozellikleri-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir (test verisi)
type Serbest = Record<string, any>;
type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const PAROLA = `Gecici-Bastaki-${randomBytes(6).toString('hex')}`;
const PROFIL_DOSYASI = `${PROFIL_AKIS_ANAHTARI}.model.json`;
const DONUSLU_ANAHTAR = 'profil-donuslu-ortak-akis';
const ONAY_DOSYASI = `${ONAY_AKIS_ANAHTARI}.model.json`;
const VERI = { kategori: 'K1', urun: 'Ürün B' };
const goreliDegil = (ad: string): boolean => !ad.startsWith('Göreli tarihler — ');

// ---- Saf: plan, senaryo diyagramı, dışa aktarma, doğrulayıcı ------------------------------------------------------------------

/** Ekran modeli: başta "Profil" ortak akışı, ortada (hesaplamadan sonra) "Onay" ortak akışı. */
function ortakliModel(bastaki?: 'once' | 'sonra'): Serbest {
  const m = akisModeli() as Serbest;
  const [bilgiler, basvuran, hesaplama] = m.adimlar as Serbest[];
  m.adimlar = [
    { id: 'profilBlok', sira: 1, baslik: 'Profil', ortakAkis: { dosya: PROFIL_DOSYASI } },
    { ...bilgiler, sira: 2 }, { ...basvuran, sira: 3 }, { ...hesaplama, sira: 4 },
    { id: 'onayBlok', sira: 5, baslik: 'Onay', ortakAkis: { dosya: ONAY_DOSYASI } }
  ];
  if (bastaki) m.bastakiOrtakAkislar = bastaki;
  return ortakAkislariAc(m, { [PROFIL_DOSYASI]: profilAkisPaketi().model, [ONAY_DOSYASI]: onayAkisPaketi().model }).model as Serbest;
}

test('plan: yalnız akışın başındaki ortak akış adımları "ekran açılmadan" işaretlenir; ortadaki ortak akış değişmez; "sonra" ayarında işaret yok', () => {
  const plan = modelKosuPlani(ortakliModel(), VERI);
  expect(plan.hatalar).toEqual([]);
  expect(plan.adimlar.map((a) => [a.baslik, a.ekranAcilmadan === true])).toEqual([
    ['Profil penceresi açılır', true], ['Profil uygulanır', true], ['Başvuru bilgileri girilir', false], ['Başvuran bilgileri girilir', false],
    ['Tutar hesaplanır', false], ['Onay formu açılır', false], ['Onay kodu girilir, onaylanır', false]
  ]);
  expect(modelKosuPlani(ortakliModel('sonra'), VERI).adimlar.some((a) => a.ekranAcilmadan)).toBe(false);
  expect(modelKosuPlani(ortakliModel('once'), VERI).adimlar.filter((a) => a.ekranAcilmadan).length).toBe(2);
});

test('senaryo diyagramı: Giriş (girişsiz) → baştaki blok adımları → "Ekran açılır" düğümü → ekran adımları; sonuç eşlenir', () => {
  const d = akisDiyagrami(ortakliModel(), {
    sonuc: { durum: 'basarili', adimlar: ['Profil penceresi açılır', 'Profil uygulanır', 'Ekran açılır', 'Başvuru bilgileri girilir'].map((ad) => ({ ad, durum: 'basarili' })) }
  });
  expect(d.baslangic.metin).toBe('Girişsiz: ortamın taban adresi açılır (ekran giriş gerektirmez)');
  expect(d.ekranAcilisi).toEqual({ metin: 'Ekran açılır', sonuc: { durum: 'basarili', sureMs: null, hataMesaji: null } });
  expect(d.adimlar.map((a) => a.ekranAcilmadan === true)).toEqual([true, true, false, false, false, false, false]);
  expect(d.eslesmeyenler).toEqual([]);
  // "Sonra" ayarında ekran girişle açılır (bugünkü diyagram).
  const s = akisDiyagrami(ortakliModel('sonra'));
  expect(s.ekranAcilisi).toBeNull();
  expect(s.baslangic.metin).toBe('Girişsiz: ekran açılır (ekran giriş gerektirmez)');
});

test('dışa aktarma: baştaki blok taban adresinde ekran açılmadan önce; "Ekran açılır" bloktan sonra bir kez', () => {
  const r = playwrightKoduUret({
    plan: modelKosuPlani(ortakliModel(), VERI), kaynak: { ekran: 'Başvuru', senaryo: 'Baştaki', modelSurumu: 1, ortam: 'TEST', uretim: '2026-09-29T10:00:00.000Z' },
    tabanUrl: 'http://127.0.0.1:9', girisGerekli: false, girisProfili: null, tarif: null, baglam: null,
    gizlilik: { hassasAnahtarlar: [], gizliDegerler: [], kisiselAlanIdleri: [], ekGizliAdlar: [] }
  });
  const kod = r.icerik;
  const taban = kod.indexOf("await page.goto(TABAN_ADRES, { waitUntil: 'domcontentloaded' });");
  const profil = kod.indexOf('test.step("Profil uygulanır"');
  const ekran = kod.indexOf("test.step('Ekran açılır'");
  expect(taban).toBeGreaterThan(0);
  expect(profil).toBeGreaterThan(taban);
  expect(ekran).toBeGreaterThan(profil);
  expect(ekran).toBeLessThan(kod.indexOf('test.step("Başvuru bilgileri girilir"'));
  expect(kod.split("test.step('Ekran açılır'").length - 1).toBe(1);
});

test('doğrulayıcı: "bastakiOrtakAkislar" yalnız "once" / "sonra"; varsayılan akışınki kökünkiyle aynı olmalı', () => {
  const dogrula = (m: Serbest): string => { try { ekranModeliniDogrula('basvuru-akis.model.json', m, () => { throw new Error('yok'); }); return ''; } catch (e) { return (e as Error).message; } };
  expect(dogrula({ ...akisModeli(), bastakiOrtakAkislar: 'sonra' })).toBe('');
  expect(dogrula({ ...akisModeli(), bastakiOrtakAkislar: 'arada' })).toContain('"bastakiOrtakAkislar" "once" ya da "sonra" olmalı');
  const m = akisModeli() as Serbest;
  m.akislar = [{ id: 'ana', ad: 'Ana akış', varsayilan: true, adimlar: m.adimlar, bastakiOrtakAkislar: 'sonra' }];
  expect(dogrula(m)).toContain('varsayılan akışın "bastakiOrtakAkislar"ı modelinkiyle aynı olmalı');
});

// ---- Gerçek koşu ve akış diyagramı (ayrı Nöbetçi örneği, geçici veritabanı) ---------------------------------------------------

test.describe('koşu ve akış diyagramı', () => {
  test.describe.configure({ mode: 'serial' });
  let nobetci: Nobetci;
  let uygulama: AkisUygulamasi;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ekranId = '';

  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
    return y;
  }
  async function kaydetVeKos(baslik: string, akisId: string): Promise<Serbest> {
    const yeni = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, akisId, baslik, ortamIdleri: [ortamId], veri: { baslik, ...VERI } });
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: yeni.id, ortamId, canliOnay: true });
    expect(y.basarili, `${baslik}: ${y.mesaj ?? ''}`).toBe(true);
    return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Serbest;
  }
  const tasarim = async (akisId: string): Promise<Serbest> => await api(`/platform/ekran/akis/tasarim?projeId=${projeId}&ekranId=${ekranId}&akisId=${akisId}`) as Serbest;
  /** Ekranın ana akışının blokları (baştaki ortak akış bloğu hariç). */
  let ekranBloklari: Serbest[] = [];
  const ortakBlok = (dosya: string, ad: string): Serbest => ({ tur: 'ortak', dosya, ad, istegeBagli: false });
  const akisKaydet = async (ad: string, bloklar: Serbest[], ek: Nesne = {}): Promise<Yanit> => api('/platform/ekran/akis/kaydet', { projeId, ekranId, ad, bloklar, ...ek });

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'bastaki-ortak-'));
    uygulama = new AkisUygulamasi({ anaSayfa: true });
    fikstur = await yerelSunucu(uygulama.isle);
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Baştaki Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
    const tur = async (ad: string, alanlar: string[]): Promise<string> =>
      String((await basarili('/platform/test-verisi-turu/kaydet', { projeId, ad, alanlar: alanlar.map((a) => ({ ad: a, hassas: true })) })).id);
    const ozel = await tur(HAVUZLAR.ozel, ['kimlikNo', 'dogumTarihi', 'cepTelefonu']);
    await tur(HAVUZLAR.tuzel, ['vergiNo', 'cepTelefonu']);
    await basarili('/platform/test-verisi-profili/kaydet', { projeId, turId: ozel, ad: 'k1', degerler: { kimlikNo: '10000000146', dogumTarihi: '01.02.1990', cepTelefonu: '5321112233' } });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: profilAkisPaketi(), senaryoIndeksleri: [], ortamIdleri: [] });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: profilAkisPaketi({ anahtar: DONUSLU_ANAHTAR, ad: 'Profil dönüşlü (ortak)', ekranaDon: true }), senaryoIndeksleri: [], ortamIdleri: [] });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: akisPaketi({ anahtar: 'basvuru-sira', ad: 'Başvuru (sıra)' }), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Nesne[] };
    ekranId = String((liste.ekranlar.find((e) => e.ad === 'Başvuru (sıra)') as Nesne).id);
    ekranBloklari = (await tasarim('ana')).bloklar as Serbest[];
  });

  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('koşu: ana sayfadaki pencere + form ekran açılmadan önce yapılır; ekran adresi bloktan SONRA ve bir kez istenir', async () => {
    test.setTimeout(180_000);
    const akisId = String((await akisKaydet('Profil önce', [ortakBlok(PROFIL_DOSYASI, 'Profil'), ...ekranBloklari], { onay: true })).akisId);
    expect((await tasarim(akisId)).ekranAcilisSirasi).toBe(1);
    const once = uygulama.istekler.length;
    const sonuc = await kaydetVeKos('Profil önce / tutar', akisId);
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    const adlar = (sonuc.adimlar as Serbest[]).map((a) => String(a.ad)).filter(goreliDegil);
    expect(adlar.slice(0, 4)).toEqual(['Profil penceresi açılır', 'Profil uygulanır', 'Ekran açılır', 'Başvuru bilgileri girilir']);
    const istekler = uygulama.istekler.slice(once);
    const ekranIstekleri = istekler.flatMap((x, i) => (x === `GET ${AKIS_YOLU}` ? [i] : []));
    expect(ekranIstekleri, istekler.join(' | ')).toHaveLength(1);
    const anaSayfa = istekler.indexOf('GET /');
    const profil = istekler.indexOf(`POST ${PROFIL_YOLU}`);
    expect(anaSayfa, istekler.join(' | ')).toBeGreaterThanOrEqual(0);
    expect(profil).toBeGreaterThan(anaSayfa);
    expect(ekranIstekleri[0]).toBeGreaterThan(profil);
    expect(uygulama.profiller.at(-1)).toBe('Profil 2');
  });

  test('koşu: blok "Ekrana dön" ile biterse ekran ikinci kez açılmaz ("Ekran açılır" yine blok adımlarından sonra)', async () => {
    test.setTimeout(180_000);
    const akisId = String((await akisKaydet('Profil dönüşlü', [ortakBlok(`${DONUSLU_ANAHTAR}.model.json`, 'Profil dönüşlü'), ...ekranBloklari], { onay: true })).akisId);
    const once = uygulama.istekler.length;
    const sonuc = await kaydetVeKos('Profil dönüşlü / tutar', akisId);
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    const adlar = (sonuc.adimlar as Serbest[]).map((a) => String(a.ad)).filter(goreliDegil);
    expect(adlar.slice(0, 4)).toEqual(['Profil penceresi açılır', 'Profil uygulanır', 'Ekrana dönülür', 'Ekran açılır']);
    const istekler = uygulama.istekler.slice(once);
    expect(istekler.filter((x) => x === `GET ${AKIS_YOLU}`), istekler.join(' | ')).toHaveLength(1);
    expect(istekler.indexOf(`GET ${AKIS_YOLU}`)).toBeGreaterThan(istekler.indexOf(`POST ${PROFIL_YOLU}`));
  });

  test('koşu: "Baştaki ortak akışlar: ekran açıldıktan sonra" bugünkü sırayı korur (ekran önce açılır)', async () => {
    test.setTimeout(180_000);
    // Ekran önce açılır; blok ekrandan ana sayfaya gidip oradaki pencereyle profili değiştirir, "Ekrana dön" ile döner.
    const blok = ortakBlok(`${DONUSLU_ANAHTAR}.model.json`, 'Profil dönüşlü');
    const akisId = String((await akisKaydet('Profil sonra', [blok, ...ekranBloklari], { onay: true, ekranAcilisSirasi: 0 })).akisId);
    expect((await tasarim(akisId)).ekranAcilisSirasi).toBe(0);
    const once = uygulama.istekler.length;
    const sonuc = await kaydetVeKos('Profil sonra / tutar', akisId);
    // Ekranda "Profil değiştir" bağlantısı yok: blok ekranda başladığı için ilk adımı kalır (eski davranışın kanıtı).
    expect(sonuc.durum).toBe('basarisiz');
    const adlar = (sonuc.adimlar as Serbest[]).map((a) => String(a.ad)).filter(goreliDegil);
    expect(adlar.slice(0, 2)).toEqual(['Ekran açılır', 'Profil penceresi açılır']);
    const istekler = uygulama.istekler.slice(once);
    expect(istekler[0], istekler.join(' | ')).toBe(`GET ${AKIS_YOLU}`);
    expect(istekler).not.toContain(`POST ${PROFIL_YOLU}`);
  });

  test('akış diyagramı (API): "Ekran açılır"ın yeri kaydetme gidiş-dönüşünde korunur; karışık yer ve üstte ekran adımı reddedilir', async () => {
    const iki = [ortakBlok(PROFIL_DOSYASI, 'Profil'), ortakBlok(`${DONUSLU_ANAHTAR}.model.json`, 'Profil dönüşlü'), ...ekranBloklari];
    let ikiId = '';
    const kaydet = async (ekranAcilisSirasi: number): Promise<Yanit> => akisKaydet('İki blok', iki, { onay: true, ekranAcilisSirasi, ...(ikiId ? { akisId: ikiId } : {}) });
    ikiId = String((await kaydet(2)).akisId);
    expect((await tasarim(ikiId)).ekranAcilisSirasi).toBe(2);
    expect((await kaydet(0)).basarili).toBe(true);
    expect((await tasarim(ikiId)).ekranAcilisSirasi).toBe(0);
    // Karışık: biri üstte, biri altta.
    const karisik = await kaydet(1);
    expect(karisik.basarili).toBe(false);
    expect(JSON.stringify(karisik.hatalar)).toContain('hepsi “Ekran açılır”ın üstünde');
    // Ekran adımı "Ekran açılır"ın üstünde olamaz.
    const ustte = await kaydet(3);
    expect(ustte.basarili).toBe(false);
    expect(ustte.hatalar).toEqual([expect.objectContaining({ blok: 2, mesaj: expect.stringContaining('yalnız ortak akış blokları olabilir') })]);
    // Yer verilmezse (eski istemci) akışın ayarı korunur.
    expect((await akisKaydet('İki blok', iki, { onay: true, akisId: ikiId })).basarili).toBe(true);
    expect((await tasarim(ikiId)).ekranAcilisSirasi).toBe(0);
  });

  test('akış diyagramı (arayüz): "Ekran açılır" düğümü görünür, blok üstünde kalır; ↓/↑ ile yer değişir, kaydedince korunur', async () => {
    test.setTimeout(120_000);
    // Ana akış: başta profil bloğu (varsayılan: ekran açılmadan önce).
    expect((await akisKaydet('Ana akış', [ortakBlok(PROFIL_DOSYASI, 'Profil'), ...ekranBloklari], { onay: true, akisId: 'ana' })).basarili).toBe(true);
    expect((await tasarim('ana')).ekranAcilisSirasi).toBe(1);
    const tarayici = await korumaliTarayici();
    try {
      const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1400 } });
      const page = await baglam.newPage();
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/akis/ana`);
      // Ekranın Akışlar sekmesindeki diyagram da "Ekran açılır"ı baştaki bloktan sonra gösterir.
      await expect(page.locator('.akis-diyagrami .ekran-acilisi')).toBeVisible();
      const duzenle = async (): Promise<void> => {
        await page.getByRole('button', { name: 'Düzenle', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeVisible();
      };
      await duzenle();
      const diyagram = page.getByRole('list', { name: 'Akış diyagramı' });
      const isaret = diyagram.getByRole('listitem', { name: 'Ekran açılır', exact: true });
      const blok = diyagram.getByRole('listitem', { name: /^1\. blok: Ortak akış$/ });
      const ustte = async (): Promise<boolean> => ((await blok.boundingBox())?.y ?? 0) < ((await isaret.boundingBox())?.y ?? 0);
      await expect(isaret).toBeVisible();
      await expect(isaret.getByRole('button')).toHaveCount(0);
      expect(await ustte()).toBe(true);
      await expect(isaret.getByRole('combobox', { name: 'Baştaki ortak akışlar' })).toHaveValue('once');
      // Ekran adımı "Ekran açılır"ın üstüne çıkamaz.
      await expect(diyagram.getByRole('listitem', { name: /^2\. blok: / }).getByRole('button', { name: 'Yukarı taşı', exact: true })).toBeDisabled();
      // ↓: blok "Ekran açılır"ın altına geçer (ekran açıldıktan sonra).
      await blok.getByRole('button', { name: 'Aşağı taşı', exact: true }).click();
      expect(await ustte()).toBe(false);
      await expect(isaret.getByRole('combobox', { name: 'Baştaki ortak akışlar' })).toHaveValue('sonra');
      const kaydet = async (): Promise<void> => {
        await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
        const onay = page.locator('dialog.onay-diyalogu');
        await expect(onay.getByRole('heading', { name: '“Ana akış” akışı kaydedilsin mi?' })).toBeVisible();
        await onay.getByRole('button', { name: 'Kaydet', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Akışı düzenle: Ana akış' })).toBeHidden();
      };
      await kaydet();
      expect((await tasarim('ana')).ekranAcilisSirasi).toBe(0);
      // Yeniden açılınca blok altta; ↑ ile yeniden üste.
      await duzenle();
      expect(await ustte()).toBe(false);
      await blok.getByRole('button', { name: 'Yukarı taşı', exact: true }).click();
      expect(await ustte()).toBe(true);
      await kaydet();
      expect((await tasarim('ana')).ekranAcilisSirasi).toBe(1);
      await duzenle();
      expect(await ustte()).toBe(true);
    } finally {
      await tarayici.close();
    }
  });
});
