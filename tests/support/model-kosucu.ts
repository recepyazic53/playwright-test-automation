// MODEL KOŞUCUSU (genel) — test kodu OLMAYAN senaryoyu (sayfa paketinden/modelden oluşturulmuş) ekran
// modeliyle koşturur. Hiçbir proje/ürün adı ya da seçicisi burada yoktur: seçiciler, adımlar, aksiyonlar,
// başarı/hata göstergeleri ve seçenekler modelden (platform veritabanı), giriş ve bağlam adımları ortamın
// giriş tarifinden (giris-motoru.ts) gelir.
//
// Akış: yasaklı adres koruması → giriş (giriş tarifi) → bağlam değiştirme (senaryonun bağlam profili) →
// ekran adresi → modelin adımları sırayla (adım kapsamı: isteğe bağlı adımlar senaryoya göre; beklenen hata
// adımında ya da kapsamdaki son adımda durulur). Her adımda:
//   1) senaryoda değeri olan alanlar: ekranda GÖRÜNÜYORSA tipine/doldurucusuna göre doldurulur; görünmüyorsa
//      atlanır ve "atlanan alanlar"a yazılır (raporlayıcı sonuçta listeler) — alan "mutlaka görünmeli"
//      işaretliyse test Beklenen/Görülen hatasıyla başarısız olur,
//   2) adımın aksiyonları (tıkla / bekle),
//   3) beklenen hata adımıysa hata göstergesinde beklenen mesaj (toleranslı eşleşme), değilse başarı
//      göstergesi (hata göstergesinde beklenmeyen bir uyarı çıkarsa Beklenen/Görülen hatası),
//   4) adım ekran görüntüsü.
// Planın kendisi (hangi adımlar, hangi alanlar, beklenen sonuç) saftır: scripts/platform/senaryolar/model-kosusu.mjs.
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { existsSync, realpathSync } from 'node:fs';
import { basename, join, relative, resolve, isAbsolute } from 'node:path';
import { DOSYA_KLASORU_DEGISKENI } from '../../scripts/platform/dosyalar/gecici-dosyalar.mjs';
import { referansCoz } from '../../scripts/platform/dosyalar/referans.mjs';
import {
  YASAK_ADRES_DEGISKENI, YUKLEME_KLASORU_DEGISKENI, adresYasakliMi, modelKosuPlani, secenekBul, yasakDesenleri, yasakliAdresMesaji,
  yuklemeDosyasiYolu, type ModelKosuPlani, type PlanAdimi, type PlanAlani, type PlanKosuTanimi
} from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import type { GirisTarifi } from '../../scripts/platform/giris/tarif.mjs';
import { beklenenGorulenMetni, beklenenMesajiBekle, mesajIceriyorMu, mesajiNormallestir } from './beklenen-sonuc';
import { baglamiDegistir, girisYap, oturumGecerliMi, oturumuKaydetmeyeHazirla, type GirisKimligi } from './giris-motoru';
import type { PlatformModelSenaryosu, PlatformModelVerisi } from './platform-veri';
import { attachStepScreenshot } from './screenshots';

const PROJE_KOKU = resolve(__dirname, '..', '..');
/** Alanın ekranda görünmesi için beklenen süre (koşullu alanlar önceki seçimden sonra çizilebilir). */
const GORUNURLUK_BEKLEME_MS = 2_000;
/** Adımın başarı/hata göstergesi için varsayılan bekleme (model: kosu.zamanAsimiSn). */
const ADIM_SURESI_SN = 30;

export type AtlananAlan = { alan: string; neden: string };

/** Ortamın taban adresi, giriş tarifindeki tam adresler ve bağlam adımlarının tam adresleri. */
function denetlenecekAdresler(tabanUrl: string, tarif: GirisTarifi | null, ekranUrl: string): string[] {
  const adresler = [tabanUrl, ekranUrl];
  if (tarif) {
    adresler.push(tarif.girisAdresi, tarif.oturumKontrolAdresi);
    for (const a of tarif.baglamDegistirme?.adimlar ?? []) if (a.islem === 'git') adresler.push(a.adres);
  }
  return adresler.filter((a) => /^https?:\/\//i.test(a));
}

/**
 * Yasaklı adres koruması: ortamın adresi (ya da tarifteki/modeldeki tam bir adres) yasaklı bir kalıba uyuyorsa
 * tarayıcı HİÇBİR yere gitmeden hata fırlatır. Ayrıca bağlama bir yakalayıcı kurulur: yasaklı host'a giden her
 * istek iptal edilir ve kaydedilir (test sonunda başarısız sayılır).
 */
export async function yasakliAdresKorumasi(page: Page, adresler: string[], desenler = yasakDesenleri(process.env[YASAK_ADRES_DEGISKENI])): Promise<string[]> {
  const engellenen: string[] = [];
  if (!desenler.length) return engellenen;
  for (const adres of adresler) {
    const kalip = adresYasakliMi(adres, desenler);
    if (kalip) throw new Error(yasakliAdresMesaji(adres, kalip));
  }
  await page.context().route('**/*', async (route) => {
    const url = route.request().url();
    if (adresYasakliMi(url, desenler)) {
      engellenen.push(new URL(url).hostname);
      await route.abort('blockedbyclient');
      return;
    }
    await route.fallback();
  });
  return engellenen;
}

/** Seçicinin ekranda GÖRÜNEN ilk öğesi (süre içinde görünmezse null). */
async function gorunurOge(page: Page, secici: string, sureMs = GORUNURLUK_BEKLEME_MS): Promise<Locator | null> {
  const l = page.locator(secici).filter({ visible: true }).first();
  try {
    await l.waitFor({ state: 'visible', timeout: sureMs });
    return l;
  } catch {
    return null;
  }
}

/** Öğenin değeri (input/select/textarea) ya da görünen metni. */
async function degerOku(l: Locator): Promise<string> {
  return l.evaluate((e) => {
    const t = e.tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return (e as HTMLInputElement).value;
    return (e as HTMLElement).innerText ?? e.textContent ?? '';
  }).catch(() => '');
}

const cssKacis = (d: string): string => d.replace(/["\\]/g, '\\$&');

/**
 * Özel ok bileşeni (okluSecim): değeri gösteren öğe (konum.secici) hedef metne gelene kadar ileri düğmesine,
 * uçta değer değişmezse ya da halka başa dönerse geri düğmesine basılır. En fazla parametreler.maksDeneme (12)
 * tıklama/yön.
 */
async function okluSec(page: Page, alan: PlanAlani, gosterge: Locator, hedefMetin: string, adimBasligi: string): Promise<void> {
  const oku = async (): Promise<string> => mesajiNormallestir(await degerOku(gosterge));
  const hedef = mesajiNormallestir(hedefMetin);
  const y = alan.yardimci;
  const yonler = [y.ileri ?? y.arttir, y.geri ?? y.azalt].filter((x): x is string => Boolean(x));
  const maks = Number(alan.parametreler.maksDeneme) > 0 ? Number(alan.parametreler.maksDeneme) : 12;
  const gorulenler = new Set<string>();
  const ilk = await oku();
  gorulenler.add(ilk);
  if (ilk === hedef) return;
  for (const yon of yonler) {
    const dugme = page.locator(yon).filter({ visible: true }).first();
    const baslangic = await oku();
    for (let i = 0; i < maks; i++) {
      const once = await oku();
      await dugme.click();
      await expect.poll(oku, { timeout: 3_000 }).not.toBe(once).catch(() => undefined);
      const simdi = await oku();
      gorulenler.add(simdi);
      if (simdi === hedef) return;
      if (simdi === once || simdi === baslangic) break; // uçta (değişmedi) ya da halka başa döndü → ters yön
    }
  }
  throw new Error(beklenenGorulenMetni(adimBasligi, `${alan.etiket}: "${hedefMetin}"`, `seçilebilen değerler: ${[...gorulenler].join(', ')}`));
}

/**
 * Dosya alanı: değer ya (a) şifreli senaryo dosyasının bu koşu için çözülmüş MUTLAK yolu (veri okuyucu
 * "nobetci-dosya://" referansını koşunun geçici klasöründeki dosyayla değiştirir; bkz. scripts/platform/dosyalar/)
 * ya da (b) izinli klasördeki bir dosyanın ADIDIR. Klasör dışı/olmayan dosya açık hata verir.
 */
function yuklenecekDosya(deger: unknown): string {
  const kosuKlasoru = process.env[DOSYA_KLASORU_DEGISKENI];
  if (typeof deger === 'string' && referansCoz(deger)) {
    throw new Error('Dosya alanı: şifreli senaryo dosyası bu koşu için çözülemedi (koşuya özel geçici klasör yok). Koşuyu Nöbetçi\'den ya da "npx playwright test" ile başlatın.');
  }
  if (typeof deger === 'string' && isAbsolute(deger) && kosuKlasoru) {
    if (!existsSync(deger)) throw new Error(`Dosya alanı: "${basename(deger).replace(/^EKSIK-/, '')}" şifreli depoda bulunamadı (silinmiş ya da bu makineye aktarılmamış olabilir).`);
    const g = relative(realpathSync(kosuKlasoru), realpathSync(deger));
    if (!g || g.startsWith('..') || isAbsolute(g)) throw new Error('Dosya alanı: koşunun geçici dosya klasörü dışındaki dosya yüklenemez.');
    return realpathSync(deger);
  }
  const klasor = resolve(process.env[YUKLEME_KLASORU_DEGISKENI] || join(PROJE_KOKU, 'veri', 'yuklenecek-dosyalar'));
  const r = yuklemeDosyasiYolu(deger, klasor, join);
  if ('hata' in r) throw new Error(`Dosya alanı: ${r.hata}.`);
  if (!existsSync(r.yol)) throw new Error(`Dosya alanı: "${String(deger)}" izinli klasörde yok (${YUKLEME_KLASORU_DEGISKENI} ya da veri/yuklenecek-dosyalar/).`);
  const gercek = realpathSync(r.yol);
  const g = relative(realpathSync(klasor), gercek);
  if (!g || g.startsWith('..') || isAbsolute(g)) throw new Error('Dosya alanı: izinli klasörün dışındaki dosya yüklenemez.');
  return gercek;
}

/** Görünen alanı tipine/doldurucusuna göre doldurur. */
async function alaniDoldur(page: Page, alan: PlanAlani, l: Locator, adimBasligi: string): Promise<void> {
  const deger = alan.deger;
  switch (alan.tip) {
    case 'okluSecim':
      await okluSec(page, alan, l, secenekBul(alan.secenekler, deger).metin, adimBasligi);
      return;
    case 'secim': {
      const s = secenekBul(alan.secenekler, deger);
      const etiket = await l.evaluate((e) => e.tagName);
      if (etiket === 'SELECT') {
        try {
          await l.selectOption({ value: s.deger }, { timeout: 5_000 });
        } catch {
          await l.selectOption({ label: s.metin }, { timeout: 5_000 });
        }
        return;
      }
      // Özel açılır liste: aç, seçeneği görünen metniyle seç.
      await l.click();
      await page.getByText(s.metin, { exact: true }).filter({ visible: true }).first().click();
      return;
    }
    case 'radyo': {
      const s = secenekBul(alan.secenekler, deger);
      const hedef = s.secici
        ? page.locator(s.secici)
        : page.locator(alan.secici as string).and(page.locator(`[value="${cssKacis(s.deger)}"]`));
      await hedef.first().check();
      return;
    }
    case 'onayKutusu':
      await l.setChecked(deger === true || deger === 'true');
      return;
    case 'tarih':
      if (alan.doldurucu === 'tarihJs') {
        await l.evaluate((e, v) => {
          (e as HTMLInputElement).value = v;
          e.dispatchEvent(new Event('input', { bubbles: true }));
          e.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(deger));
      } else {
        await l.fill(String(deger));
      }
      return;
    case 'dosya':
      await l.setInputFiles(yuklenecekDosya(deger));
      return;
    default: {
      const metin = String(deger);
      if (alan.doldurucu === 'tuslayarakYaz' || alan.doldurucu === 'telefonTuslama') {
        await l.fill('');
        await l.pressSequentially(metin, { delay: 25 });
      } else {
        await l.fill(metin);
      }
    }
  }
}

/** Hata göstergesinin (yoksa sayfanın) görünen metni; görünmüyorsa boş. */
async function hataMetni(page: Page, kosu: PlanKosuTanimi | null): Promise<string> {
  const secici = kosu?.hataGostergesi?.secici;
  if (!secici) return '';
  const l = page.locator(secici).filter({ visible: true });
  const n = await l.count().catch(() => 0);
  const metinler: string[] = [];
  for (let i = 0; i < n; i++) metinler.push(await l.nth(i).innerText().catch(() => ''));
  return metinler.join(' ').trim();
}

function basariAciklamasi(kosu: PlanKosuTanimi): string {
  const g = kosu.basariGostergesi;
  if (!g) return 'adım tamamlanır';
  return g.tur === 'metin' ? `"${g.deger}" metni görünür` : g.tur === 'url' ? `adres /${g.deger}/ desenine uyar` : `${g.deger} öğesi görünür`;
}

async function basariVarMi(page: Page, kosu: PlanKosuTanimi): Promise<boolean> {
  const g = kosu.basariGostergesi;
  if (!g) return true;
  if (g.tur === 'url') return new RegExp(g.deger).test(page.url());
  if (g.tur === 'eleman') return (await page.locator(g.deger).filter({ visible: true }).count().catch(() => 0)) > 0;
  const metin = g.secici
    ? (await Promise.all((await page.locator(g.secici).filter({ visible: true }).all()).map((x) => x.innerText().catch(() => '')))).join(' ')
    : await page.locator('body').innerText().catch(() => '');
  return mesajIceriyorMu(metin, g.deger);
}

async function aksiyonlariUygula(page: Page, kosu: PlanKosuTanimi | null, sureSn: number): Promise<void> {
  for (const a of kosu?.aksiyonlar ?? []) {
    let l = page.locator(a.secici);
    if (a.metin) l = l.filter({ hasText: a.metin });
    const zaman = (a.zamanAsimiSn ?? sureSn) * 1000;
    if (a.tur === 'tikla') await l.filter({ visible: true }).first().click({ timeout: zaman });
    else await l.first().waitFor({ state: a.durum === 'gizli' ? 'hidden' : 'visible', timeout: zaman });
  }
}

/** Adımın sonucunu doğrular: beklenen hata adımında mesaj, aksi halde başarı göstergesi (beklenmeyen uyarı = hata). */
async function adimSonucunuDogrula(page: Page, adim: PlanAdimi, plan: ModelKosuPlani): Promise<void> {
  const kosu = adim.kosu;
  const sureMs = (kosu?.zamanAsimiSn ?? ADIM_SURESI_SN) * 1000;
  if (plan.beklenen.tur === 'hata' && plan.beklenen.adim === adim.id) {
    const beklenen = plan.beklenen.mesaj;
    const oku = async (): Promise<string> => (kosu?.hataGostergesi ? hataMetni(page, kosu) : page.locator('body').innerText());
    const r = await beklenenMesajiBekle(oku, [beklenen], { zamanAsimiMs: sureMs });
    if (!r.eslesen) {
      const gorulen = r.sonGorulen || (kosu && kosu.basariGostergesi && (await basariVarMi(page, kosu)) ? `uyarı çıkmadı, ${basariAciklamasi(kosu).replace(/r$/, 'dü')}` : '');
      throw new Error(beklenenGorulenMetni(adim.baslik, beklenen, gorulen));
    }
    return;
  }
  if (!kosu || (!kosu.basariGostergesi && !kosu.hataGostergesi)) return;
  const son = Date.now() + sureMs;
  for (;;) {
    if (kosu.basariGostergesi && (await basariVarMi(page, kosu))) return;
    const uyari = await hataMetni(page, kosu);
    if (uyari) throw new Error(beklenenGorulenMetni(adim.baslik, basariAciklamasi(kosu), uyari));
    if (!kosu.basariGostergesi) return;
    if (Date.now() >= son) {
      throw new Error(beklenenGorulenMetni(adim.baslik, basariAciklamasi(kosu), `${Math.round(sureMs / 1000)} sn içinde başarı göstergesi görünmedi (sayfa: ${new URL(page.url()).pathname})`));
    }
    await page.waitForTimeout(250);
  }
}

/**
 * Koşunun ortamı: model verisi + giriş tarifi, kimlik ve paylaşılan oturum dosyası. Kaynağı çağırana aittir —
 * aktarılmış (Galaksi) ortamlarda environments.ts, genel yolda genel-veri.ts. Kimlik ve oturum dosyası yalnızca
 * gerektiğinde (giriş yapılırken) istenir.
 */
export type ModelKosuOrtami = {
  veri: PlatformModelVerisi;
  tarif: () => GirisTarifi;
  kimlik: () => GirisKimligi;
  oturumDosyasi: () => string;
};

/**
 * Model senaryosunu koşturur. Atlanan alanlar "atlananAlanlar" annotation'ı olarak eklenir (raporlayıcı
 * sonuç satırına yazar); yasaklı host'a istek denenmişse test başarısız olur.
 */
export async function modelSenaryosunuKos(page: Page, testInfo: TestInfo, s: PlatformModelSenaryosu, ortam: ModelKosuOrtami): Promise<void> {
  if (!s.model) throw new Error(`"${s.baslik}": "${s.ekran.ad || s.ekran.id}" ekranının modeli yok; model koşucusu çalışamaz.`);
  const plan = modelKosuPlani(s.model, s.veri, { altModeller: s.altModeller, mutlakaGorunmeli: s.mutlakaGorunmeli });
  if (plan.hatalar.length) throw new Error(`"${s.baslik}" model koşu planı kurulamadı: ${plan.hatalar.join(' ')}`);
  testInfo.annotations.push({ type: 'urun', description: s.ekran.ad || 'Diğer' });

  // 1) Yasaklı adres koruması: ortamın taban adresi + tarifteki/modeldeki tam adresler (tarayıcı henüz hiçbir
  //    yere gitmedi), sonra yasaklı host'a her isteği iptal eden yakalayıcı.
  const tarif = ortam.tarif();
  const engellenen = await yasakliAdresKorumasi(page, denetlenecekAdresler(ortam.veri.tabanUrl, tarif, plan.ekranUrl));

  const atlanan: AtlananAlan[] = [];
  let sira = 1;
  const ekranGoruntusu = (ad: string): Promise<void> => attachStepScreenshot(page, testInfo, `${String(sira++).padStart(2, '0')} - ${ad}`);
  try {
    await test.step('Sisteme giriş yapılır', async () => {
      if (!(await oturumGecerliMi(page, tarif))) {
        await girisYap(page, tarif, ortam.kimlik());
        const oturumDosyasi = ortam.oturumDosyasi();
        oturumuKaydetmeyeHazirla(oturumDosyasi);
        await page.context().storageState({ path: oturumDosyasi });
      }
      await ekranGoruntusu('Sisteme giriş yapıldı');
    });

    if (tarif.baglamDegistirme) {
      const tur = tarif.baglamDegistirme.baglamTuru;
      const profil = plan.baglamProfili;
      await test.step(`Bağlam değiştirilir (${profil ?? '—'})`, async () => {
        if (!profil) throw new Error(`Giriş tarifi "${tur}" bağlamını değiştiriyor ama senaryonun bağlam profili yok (modelde profil havuzlu alan ya da varsayılanı yok).`);
        const degerler = ortam.veri.baglamProfilleri[tur]?.[profil];
        if (!degerler) throw new Error(`"${profil}" ${tur} bağlam profili bu ortamda tanımlı değil (Ayarlar > Bağlam profilleri).`);
        await baglamiDegistir(page, tarif, degerler);
        await ekranGoruntusu(`Bağlam değiştirildi (${profil})`);
      });
    }

    await test.step('Ekran açılır', async () => {
      await page.goto(plan.ekranUrl, { waitUntil: 'domcontentloaded' });
      await ekranGoruntusu(`Ekran açıldı (${s.ekran.ad || plan.ekranUrl})`);
    });

    for (const adim of plan.adimlar) {
      if (!adim.dahil) continue;
      await test.step(adim.baslik, async () => {
        const sureSn = adim.kosu?.zamanAsimiSn ?? ADIM_SURESI_SN;
        for (const alan of adim.alanlar) {
          if (alan.atla) {
            if (alan.mutlakaGorunmeli) throw new Error(beklenenGorulenMetni(adim.baslik, `${alan.etiket} alanı doldurulur (mutlaka görünmeli)`, alan.atla));
            atlanan.push({ alan: alan.etiket, neden: alan.atla });
            continue;
          }
          const l = await gorunurOge(page, alan.secici as string);
          if (!l) {
            const profil = plan.baglamProfili ? ` (bağlam profili: ${plan.baglamProfili})` : '';
            if (alan.mutlakaGorunmeli) {
              throw new Error(beklenenGorulenMetni(adim.baslik, `${alan.etiket} alanı ekranda görünür (mutlaka görünmeli)`, `${alan.etiket} alanı ekranda görünmüyor${profil}`));
            }
            atlanan.push({ alan: alan.etiket, neden: `ekranda görünmüyor${profil}` });
            continue;
          }
          if (alan.yalnizGorunurluk) continue;
          await alaniDoldur(page, alan, l, adim.baslik);
        }
        await aksiyonlariUygula(page, adim.kosu, sureSn);
        await adimSonucunuDogrula(page, adim, plan);
        await ekranGoruntusu(adim.baslik);
      });
      if (adim.sonAdim) break;
    }
  } finally {
    if (atlanan.length) testInfo.annotations.push({ type: 'atlananAlanlar', description: JSON.stringify(atlanan) });
  }
  if (engellenen.length) throw new Error(`Yasaklı adrese istek engellendi: ${[...new Set(engellenen)].join(', ')}.`);
}

