// MODEL KOŞUCUSU (genel) — test kodu OLMAYAN senaryoyu (ekran paketinden/modelden oluşturulmuş) ekran
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
//   2) adımın aksiyonları (tıkla / bekle; "görünürse" tıklama kısa sürede görünmezse atlanır, raporda not),
//   3) beklenen hata adımıysa hata göstergesinde beklenen mesaj (toleranslı eşleşme), değilse başarı
//      göstergesi (hata göstergesinde beklenmeyen bir uyarı çıkarsa Beklenen/Görülen hatası),
//   4) adım ekran görüntüsü.
// Çerçeve (iframe): alanın konum.cerceve'si (aksiyonun / göstergenin cerceve'si) varsa öğe page.frameLocator(...) ile o
// çerçevede aranır. Özel açılır liste (doldurucu "ozelSecim"): gerçek <select> gizli; görünen kutuya tıklanır, arama kutusu
// varsa seçeneğin metni yazılır ve görünen seçeneğe tıklanır (metin tam → değer → başlar → içerir; "kod - ad" listeleri kodla);
// açık kalan liste kapatılır; olmazsa GÜNCEL gizli listeye değer yazılır (input/change) ve sonuç (select.value) doğrulanır.
// Çerçevedeki tıklamadan sonra aynı çerçevede beliren sayfa içi pencere (ör. gönderim doğrulaması) adımın mesajı olur.
// Planın kendisi (hangi adımlar, hangi alanlar, beklenen sonuç) saftır: scripts/platform/senaryolar/model-kosusu.mjs.
import { expect, test, type FrameLocator, type Locator, type Page, type Request, type TestInfo } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, isAbsolute } from 'node:path';
import { dosyayiDogrula, kalanlarMetni, type DosyaTanimi } from '../../scripts/platform/dosyalar/dosya-icerigi.mjs';
import { alanaYaz, alandanCik, oneridenYaz, takvimdenYaz } from '../../scripts/platform/tarama/alan-cikisi';
import { AgIzleyici } from '../../scripts/platform/tarama/ag-sakinligi';
import { TEKRAR_NOTU, etkisizTiklamaMetni, guvenliTikla } from '../../scripts/platform/tarama/guvenli-tiklama';
import { yuklenmeBeklemesi } from '../../scripts/platform/tarama/zincir-kesfi.mjs';
import { hedefSayfayiAc } from '../../scripts/platform/tarama/tarama-motoru';
import { seciciAgaciniDuzelt } from '../../scripts/platform/tarama/secici-duzelt.mjs';
import { DOSYA_KLASORU_DEGISKENI } from '../../scripts/platform/dosyalar/gecici-dosyalar.mjs';
import { referansCoz } from '../../scripts/platform/dosyalar/referans.mjs';
import {
  YASAK_ADRES_DEGISKENI, YUKLEME_KLASORU_DEGISKENI, adresYasakliMi, gizliDegerleriMaskele, modelKosuPlani, planHatasiMetni, secenekBul, veriHatalariMetni, yasakDesenleri, yasakliAdresMesaji,
  yuklemeDosyasiYolu, type ModelKosuPlani, type PlanAdimi, type PlanAlani, type PlanBasariGostergesi, type PlanKosuTanimi
} from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { girisKokenleri, type GirisTarifi } from '../../scripts/platform/giris/tarif.mjs';
import { beklenenGorulenMetni, beklenenMesajiBekle, mesajIceriyorMu, mesajiNormallestir } from './beklenen-sonuc';
import { baglamiDegistir, girisYap, oturumGecerliMi, oturumuKapat, type GirisKimligi } from './giris-motoru';
import { oturumKilidiyle, oturumuSifreliYaz, yeniOturumuYukle } from './oturum-kasasi';
import { etkinSenaryoGirisi } from '../../scripts/platform/senaryolar/senaryo-girisi.mjs';
import type { PlatformModelSenaryosu, PlatformModelVerisi } from './platform-veri';
import { attachStepScreenshot } from './screenshots';
import { adimGoruntusuAyari, indirilenDosyaAyari, sayiAyari, secimAyari, sureAyari } from './kosu-ayarlari';
import { adimGoruntusuAlinsinMi } from '../../scripts/platform/ayarlar/kayit-kurallari.mjs';
import { mesajYakalayicisi, mesajYakalayicisiKur } from './mesaj-yakalayici';
import { gizliAdMi } from '../../scripts/platform/ayarlar/gizli-adlar.mjs';
import { sqlAdiminiKos, type SqlTanimi } from '../../scripts/platform/sql/sql-adimi.mjs';
import { ayarlaSorgula, kosuSqlAyari } from '../../scripts/platform/sql/sorgu-bagdastirici.mjs';
import { ozelBilesenIsaretle } from '../../scripts/platform/tarama/sayfa-envanteri';
import { GORUNURSE_BEKLEME_SN } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { GUVENLI_EKRAN_EYLEMLERI, ekranKapsamindaMi, type EkranKurali, type KurtarmaOlayi } from '../../scripts/platform/ayarlar/kurtarma-kurallari.mjs';

const PROJE_KOKU = resolve(__dirname, '..', '..');
// Kullanıcı kararları (Ayarlar > Koşu > Gelişmiş koşu davranışı; kosu-ayarlari.ts): ÇAĞRI anında okunur. Varsayılanlar önceki sabitlerdir.
/** Alanın ekranda görünmesi için beklenen süre (koşullu alanlar önceki seçimden sonra çizilebilir; varsayılan 2 sn). */
const gorunurlukBeklemeMs = (): number => sureAyari('NOBETCI_GORUNURLUK_BEKLEME_MS', 2_000, 1_000, 60_000);
/** Adımın başarı/hata göstergesi için varsayılan bekleme (sn; adımda kosu.zamanAsimiSn verilmişse o; varsayılan 30). */
const adimSuresiSn = (): number => sureAyari('NOBETCI_ADIM_BEKLEME_MS', 30_000, 1_000, 600_000) / 1000;
/** Alan görünmezse: 'atla' (atlanan alanlara yazılır; varsayılan) ya da 'kaldir' (test Beklenen / Görülen hatasıyla kalır). */
export const gorunmeyenAlanDavranisi = (): 'atla' | 'kaldir' => secimAyari('NOBETCI_GORUNMEYEN_ALAN', ['atla', 'kaldir'] as const, 'atla');
/** Tarayıcı onay (confirm) / soru (prompt) pencereleri: 'iptal' (varsayılan) ya da 'onayla'. Bilgi pencereleri (alert) her durumda kapatılır. */
export const onayPenceresiDavranisi = (): 'iptal' | 'onayla' => secimAyari('NOBETCI_ONAY_PENCERESI', ['iptal', 'onayla'] as const, 'iptal');

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

/** Öğenin arandığı yer: sayfa ya da (öğe bir çerçevedeyse) çerçeve(ler). */
type Kapsam = Page | FrameLocator;
/** Çerçeve (iframe) seçicileri dıştan içe (modelde konum.cerceve / aksiyon / gösterge cerceve'si); yoksa sayfanın kendisi. */
export function kapsam(page: Page, cerceve: readonly string[] | null | undefined): Kapsam {
  let k: Kapsam = page;
  for (const c of cerceve ?? []) k = k.frameLocator(c);
  return k;
}

/** Seçicinin ekranda GÖRÜNEN ilk öğesi (süre içinde görünmezse null). */
async function gorunurOge(page: Kapsam, secici: string, sureMs = gorunurlukBeklemeMs()): Promise<Locator | null> {
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
async function okluSec(page: Page, alan: PlanAlani, gosterge: Locator, hedefMetin: string, adimBasligi: string, k: Kapsam = page): Promise<void> {
  const oku = async (): Promise<string> => mesajiNormallestir(await degerOku(gosterge));
  const hedef = mesajiNormallestir(hedefMetin);
  const y = alan.yardimci;
  const yonler = [y.ileri ?? y.arttir, y.geri ?? y.azalt].filter((x): x is string => Boolean(x));
  const maks = Number(alan.parametreler.maksDeneme) > 0 ? Number(alan.parametreler.maksDeneme) : 12;
  // yanitBekle: her tıklamanın BAŞLATTIĞI, adresi bu metni içeren istek bitene kadar beklenir (ör. seçim değişince yeniden
  // yüklenen bağımlı liste; beklenmezse liste sonraki alan seçildikten sonra yenilenip seçimi sıfırlayabilir). İlk tıklamadan
  // önce sayfanın açılış istekleri (aynı listenin ilk yüklemesi) biter — yoksa bekleme o isteğe takılır.
  const yanit = typeof alan.parametreler.yanitBekle === 'string' && alan.parametreler.yanitBekle ? alan.parametreler.yanitBekle : null;
  if (yanit) await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  const tikla = async (dugme: Locator): Promise<void> => {
    if (!yanit) { await dugme.click(); return; }
    const istek = page.waitForRequest((r) => r.url().includes(yanit), { timeout: 1_500 }).catch(() => null);
    await dugme.click();
    const r = await istek;
    if (r) await (await r.response().catch(() => null))?.finished().catch(() => null);
  };
  const gorulenler = new Set<string>();
  const ilk = await oku();
  gorulenler.add(ilk);
  if (ilk === hedef) return;
  for (const yon of yonler) {
    const dugme = k.locator(yon).filter({ visible: true }).first();
    const baslangic = await oku();
    for (let i = 0; i < maks; i++) {
      const once = await oku();
      await tikla(dugme);
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
/** Gizli olabilen (özel çizimli radyo / onay kutusu) öğe: sayfada varsa ilki. */
/**
 * Radyo grubu görünür mü: girdisi ya da etiketi görünen ilk radyo (özel çizimli radyonun girdisi gizlidir, seçim etiketle yapılır;
 * hızlı testin okuması da etiketi görünen grubu alan sayar: sayfa-envanteri.ts). Görünene kadar en çok sureMs beklenir.
 */
async function gorunurRadyo(page: Kapsam, secici: string, sureMs = gorunurlukBeklemeMs()): Promise<Locator | null> {
  const hepsi = page.locator(secici);
  for (const bitis = Date.now() + sureMs; ;) {
    for (let i = 0, n = await hepsi.count().catch(() => 0); i < n; i++) {
      const r = hepsi.nth(i);
      const gorunur = await r.evaluate((e) => {
        const gorunen = (x: Element): boolean => { const k = x.getBoundingClientRect(); const s = getComputedStyle(x); return k.width > 0 && k.height > 0 && s.visibility !== 'hidden'; };
        return gorunen(e) || [...((e as HTMLInputElement).labels ?? [])].some(gorunen);
      }).catch(() => false);
      if (gorunur) return r;
    }
    if (Date.now() >= bitis) return null;
    await new Promise((c) => setTimeout(c, 250));
  }
}

async function sayfadakiOge(page: Kapsam, secici: string, sureMs = gorunurlukBeklemeMs()): Promise<Locator | null> {
  const l = page.locator(secici).first();
  try {
    await l.waitFor({ state: 'attached', timeout: sureMs });
    return l;
  } catch {
    return null;
  }
}

/** Öğe dolana kadar (metni ya da değeri boş değil) bekler. */
async function doluBekle(page: Page, secici: string, sureMs: number, adimBasligi: string, icermez?: string, kosu: PlanKosuTanimi | null = null, k: Kapsam = page): Promise<void> {
  const oge = k.locator(secici).first();
  const oku = async (): Promise<string> => (await degerOku(oge).catch(() => '')).trim();
  // icermez: geçici metin (ör. sorgu sürerken "Aranıyor…") görünürken dolu sayılmaz.
  const hazir = async (): Promise<boolean> => {
    const d = await oku();
    return d !== '' && !(icermez && d.toLocaleLowerCase('tr-TR').includes(icermez.toLocaleLowerCase('tr-TR')));
  };
  const beklenen = `"${secici}" dolar${icermez ? ` ("${icermez}" dışında)` : ''}`;
  const bitis = Date.now() + sureMs;
  for (;;) {
    if (await hazir()) return;
    // Adımın hata penceresi (ör. sorgu hatası) açılırsa zaman aşımını beklemeden düşer; akışın kabul ettiği uyarılar hariç.
    const hatalar = kosu ? (await hataMesajlari(page, kosu)).filter((m) => !(kosu.uyarilar ?? []).some((u) => mesajIceriyorMu(m, u.metin))) : [];
    if (hatalar.length) throw new Error(beklenenGorulenMetni(adimBasligi, beklenen, hatalar.join(' | ')));
    if (Date.now() >= bitis) throw new Error(beklenenGorulenMetni(adimBasligi, beklenen, `${Math.round(sureMs / 1000)} sn içinde ${icermez ? 'boş ya da geçici metinde' : 'boş'} kaldı`));
    await page.waitForTimeout(150);
  }
}

/**
 * Alan doldurulduktan sonra (doldurucu parametreleri): tus (ör. "Tab"), tikla (seçici; ör. kimlik sorgula düğmesi),
 * bekle { secici, durum: dolu | gorunur | gizli, zamanAsimiSn, icermez? } (ör. sorgulanan ad-soyadın gelmesi; icermez: dolu
 * sayılmayan geçici metin, ör. "Aranıyor").
 */
async function alanSonrasi(page: Page, alan: PlanAlani, l: Locator, adimBasligi: string, kosu: PlanKosuTanimi | null = null, kap: Kapsam = page): Promise<void> {
  const p = alan.parametreler;
  if (typeof p.tus === 'string' && p.tus) await l.press(p.tus);
  // gizle: alan doldurulunca açık kalıp sonraki tıklamaları kapatan katman (ör. takvim) gizlenir.
  if (typeof p.gizle === 'string' && p.gizle) {
    await kap.locator(p.gizle).evaluateAll((ogeler) => { for (const e of ogeler) (e as HTMLElement).style.display = 'none'; }).catch(() => undefined);
  }
  if (typeof p.tikla === 'string' && p.tikla) {
    const dugme = kap.locator(p.tikla).filter({ visible: true }).first();
    try {
      await dugme.click({ timeout: alanTiklamaSuresiMs() });
    } catch {
      throw new Error(beklenenGorulenMetni(adimBasligi, `"${p.tikla}" tıklanır`, `${alanTiklamaSuresiMs() / 1000} sn içinde tıklanamadı (görünmüyor ya da üstünü başka bir öğe kapatıyor — ör. açık kalan takvim; doldurucuParametreleri.gizle)`));
    }
  }
  const b = p.bekle;
  if (b && typeof b === 'object' && typeof (b as Record<string, unknown>).secici === 'string') {
    const k = b as { secici: string; durum?: string; zamanAsimiSn?: number; icermez?: unknown };
    // Süre verilmemişse Ayarlar > Koşu > Gelişmiş > Alan sonrası koşul beklemesi (varsayılan 20 sn).
    const sureMs = Number(k.zamanAsimiSn) > 0 ? Number(k.zamanAsimiSn) * 1000 : sureAyari('NOBETCI_ALAN_KOSUL_BEKLEME_MS', 20_000, 1_000, 600_000);
    if (k.durum === 'gorunur' || k.durum === 'gizli') await kap.locator(k.secici).first().waitFor({ state: k.durum === 'gizli' ? 'hidden' : 'visible', timeout: sureMs });
    else await doluBekle(page, k.secici, sureMs, adimBasligi, typeof k.icermez === 'string' && k.icermez ? k.icermez : undefined, kosu, kap);
  }
}

/**
 * "degerJs": değer betikle yazılır, input / change olayları tetiklenir — görünmeyen (gizli ya da özel çizimli) alanlar için
 * (sayfada olması yeter). Açılır listede seçenek önce değerle (value), sonra görünen metinle aranır.
 */
async function degerJsIleYaz(alan: PlanAlani, l: Locator, adimBasligi: string): Promise<void> {
  const s = alan.tip === 'secim' || alan.tip === 'okluSecim' ? secenekBul(alan.secenekler, alan.deger) : null;
  // Açılır listede seçenek gelene kadar beklenir (bağlı liste: üst alan seçildikten sonra dolar).
  if (s && (await l.evaluate((e) => e instanceof HTMLSelectElement).catch(() => false))) await hedefSecenekBekle(l, s, alan);
  const sonuc = await l.evaluate((e, a) => {
    const el = e as HTMLInputElement | HTMLSelectElement;
    if (el instanceof HTMLSelectElement) {
      const o = [...el.options].find((x) => x.value === a.deger) ?? [...el.options].find((x) => x.text.trim() === a.metin);
      if (!o) return false;
      el.value = o.value;
    } else {
      el.value = a.deger;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { deger: s ? s.deger : String(alan.deger), metin: s ? s.metin : String(alan.deger) });
  if (!sonuc) throw new Error(beklenenGorulenMetni(adimBasligi, `${alan.etiket}: "${s ? s.metin : String(alan.deger)}" seçilir`, 'listede böyle bir seçenek yok'));
}

/**
 * maske: değerin rakamları kalıptaki "#" yerlerine sırayla yerleştirilir (ör. "(###) ### ## ##" → "(532) 111 22 33"); maskeli
 * alanlar için (tuşlamak imleci kaydırabilir; degerJs ile tek seferde yazılır). Rakam sayısı kalıba uymazsa değer olduğu gibi kalır.
 */
function maskeUygula(maske: unknown, deger: unknown): unknown {
  if (typeof maske !== 'string' || !maske.includes('#') || (typeof deger !== 'string' && typeof deger !== 'number')) return deger;
  const rakamlar = String(deger).replace(/\D/g, '');
  if (rakamlar.length !== (maske.match(/#/g) ?? []).length) return deger;
  let i = 0;
  return maske.replace(/#/g, () => rakamlar[i++]);
}

/**
 * Zorla işaretleme (radyoZorla / onayKutusuZorla): gizli girdili özel çizimli kutular. Önce zorla tıklama denenir; öğe hiç
 * görünmüyorsa (ör. display:none — "Element is not visible") betikle tıklanır (click olayı sayfanın kendi işleyicilerini
 * çalıştırır). Sonunda durum doğrulanır.
 */
/** Zorla işaretlenecek öğenin sayfada belirmesi için en çok bekleme (Ayarlar > Koşu > Zorla işaretlenecek seçenek). */
const zorlaBeklemeMs = (): number => sureAyari('NOBETCI_ZORLA_BEKLEME_MS', 15_000);

async function zorlaIsaretle(l: Locator, isaretli: boolean, adimBasligi: string, alan: PlanAlani): Promise<void> {
  // Öğe sayfada yoksa (ör. bu araç için sunulmayan ürün) test süresi boyunca beklemek yerine açık hata.
  const beklemeMs = zorlaBeklemeMs();
  const sayfada = await l.waitFor({ state: 'attached', timeout: beklemeMs }).then(() => true, () => false);
  if (!sayfada) throw new Error(beklenenGorulenMetni(adimBasligi, `"${alan.etiket}" ${isaretli ? 'işaretli' : 'işaretsiz'}`, `seçenek sayfada yok (${beklemeMs / 1000} sn beklendi)`));
  if ((await l.isChecked({ timeout: 5_000 })) === isaretli) return;
  await l.setChecked(isaretli, { force: true, timeout: 3_000 }).catch(() => undefined);
  if ((await l.isChecked({ timeout: 5_000 })) !== isaretli) await l.evaluate((e) => (e as HTMLInputElement).click());
  if ((await l.isChecked({ timeout: 5_000 })) !== isaretli) {
    throw new Error(beklenenGorulenMetni(adimBasligi, `"${alan.etiket}" ${isaretli ? 'işaretli' : 'işaretsiz'}`, 'zorla ve betikle tıklandı, durum değişmedi'));
  }
}

/**
 * "ozelSecim": gizli <select>'e bağlı görünen aramalı liste (select2 / chosen / bootstrap-select benzeri; bileşen genel
 * kurallarla bulunur — sayfa-envanteri.ts > ozelBilesenIsaretle). Değer zaten seçiliyse dokunulmaz. Aksi halde görünen kutuya
 * tıklanır; açılan arama kutusu (odaktaki metin kutusu ya da görünen arama kutusu) varsa seçeneğin metni yazılır ve görünen
 * seçeneğe (role=option, yoksa metni tam eşleşen öğe) tıklanır. Liste değeri değişmediyse gizli listeye değer yazılır ve
 * input / change gönderilir (degerJs). Sonunda select.value doğrulanır; tutmazsa Beklenen / Görülen hatası.
 */
/**
 * Gizli <select>'te hedef seçenek (güncel öğede; liste yeniden kurulmuş olabilir): önce değer, sonra görünen metin tam, sonra
 * "kod - ad" biçimindeki metin kodla başlar / içerir. Yoksa null.
 */
/** Bağlı listelerin yavaşlama notları (adımdan sonra adım ayrıntısına yazılır; tıklama notlarıyla aynı yol). */
const yavaslamaNotlari: string[] = [];

/** Bağlı listenin bekleme sınırı: model gözlenen olağan dolma süresini biliyorsa ona göre, yoksa "Alan işlemi" ayarı. */
const listeBeklemesi = (alan: { yuklenmeMs?: number | null }): { sinirMs: number; yavasMs: number | null } => yuklenmeBeklemesi(alan.yuklenmeMs, alanTiklamaSuresiMs());

/**
 * Bağlı listelerin ölçülen dolma süreleri (alan kimliği → ms): üst alan doldurulur doldurulmaz (koşucunun kendi beklemelerinden ÖNCE) alt
 * listenin seçenekleri izlenerek ölçülür (bagliListeyiOlc). Alt alan doldurulurken yavaşlama notu bu ölçümle verilir.
 */
const olculenYuklenme = new Map<string, number>();

/**
 * Üst alan doldurulduktan hemen sonra: bu alana bağlı (modelde bagimlilik.alan) ve değeri olan alt listelerin seçeneklerinin gelmesi izlenir;
 * süre ölçülür. Liste değişip hedef seçenek belirince (ya da liste zaten hazırsa kısa bir bakıştan sonra) biter; en çok bekleme sınırı kadar.
 * önceki: üst doldurulmadan önceki seçenek imzaları.
 */
async function bagliListeyiOlc(ust: PlanAlani, altlar: PlanAlani[], k: Kapsam, onceki: Map<string, string>): Promise<void> {
  const imza = (l: Locator): Promise<string> => l.evaluate((e) => (e instanceof HTMLSelectElement ? [...e.options].map((o) => o.value).join('|') : '')).catch(() => '');
  for (const c of altlar) {
    if (c.ustId !== ust.id || c.tip !== 'secim' || !c.secici || c.deger === undefined || c.deger === null || c.deger === '') continue;
    const l = k.locator(c.secici).first();
    const s = secenekBul(c.secenekler, c.deger);
    const bas = Date.now();
    for (const bitis = bas + listeBeklemesi(c).sinirMs; Date.now() < bitis;) {
      const degisti = (await imza(l)) !== (onceki.get(c.id) ?? '');
      if ((degisti || Date.now() - bas > 300) && (await hedefSecenek(l, s))) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    olculenYuklenme.set(c.id, Date.now() - bas);
  }
}

/** Beklemenin olağandan çok uzun sürdüğü listeyi not eder (test başarısız sayılmaz; raporda adım ayrıntısı). */
function yavaslamaNotu(alan: { id?: string; etiket: string; yuklenmeMs?: number | null; ustId?: string | null }, bekleyisMs: number): void {
  const olculen = alan.id ? olculenYuklenme.get(alan.id) : undefined;
  const gecenMs = olculen !== undefined ? Math.max(bekleyisMs, olculen) : bekleyisMs;
  if (alan.id) olculenYuklenme.delete(alan.id);
  const { yavasMs } = listeBeklemesi(alan);
  if (yavasMs === null || gecenMs <= yavasMs || !alan.yuklenmeMs) return;
  const sn = (ms: number): string => (ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  yavaslamaNotlari.push(`“${alan.etiket}” listesinin seçenekleri ${sn(gecenMs)} sn'de geldi (olağan ≈ ${sn(alan.yuklenmeMs)} sn): yavaşlama`);
}

/**
 * Seçenek listede belirene kadar bekler: bağlı listenin seçenekleri üst alan seçildikten sonra sayfanın isteğiyle gelir (il → ilçe); hemen
 * bakılırsa liste henüz boştur. Ekran izlenir: seçenek belirdiği anda döner. Sınır modeldeki olağan süreden (yoksa "Alan işlemi").
 * Bulunamazsa null.
 */
async function hedefSecenekBekle(l: Locator, s: { deger: string; metin: string }, alan: { id?: string; etiket: string; yuklenmeMs?: number | null; ustId?: string | null } = { etiket: '' }): Promise<{ deger: string; metin: string } | null> {
  const bas = Date.now();
  for (const bitis = bas + listeBeklemesi(alan).sinirMs; ;) {
    const o = await hedefSecenek(l, s);
    // Seçenek geldi ama liste hâlâ kilitli (seçenekler gelirken kısa süre devre dışı kalan liste): kilitliyken yazılan değerin olayı sayfaya
    // ulaşmayabilir; etkinleşene kadar (süre sınırında) beklenir, kilitli kalırsa yine denenir.
    const kilitli = o ? await l.evaluate((e) => (e as HTMLSelectElement).disabled === true).catch(() => false) : false;
    if (o && (!kilitli || Date.now() >= bitis)) { yavaslamaNotu(alan, Date.now() - bas); return o; }
    if (Date.now() >= bitis) return null;
    await new Promise((c) => setTimeout(c, 250));
  }
}

async function hedefSecenek(l: Locator, s: { deger: string; metin: string }): Promise<{ deger: string; metin: string } | null> {
  return l.evaluate((e, a) => {
    const n = (t: string): string => t.replace(/\s+/g, ' ').trim();
    const o = [...(e as HTMLSelectElement).options].map((x) => ({ deger: x.value, metin: n(x.text) }));
    const k = n(a.metin).toLocaleLowerCase('tr-TR');
    const kucuk = (x: { metin: string }): string => x.metin.toLocaleLowerCase('tr-TR');
    return o.find((x) => x.deger === a.deger) ?? o.find((x) => x.metin === n(a.metin)) ?? (k ? o.find((x) => kucuk(x).startsWith(k)) ?? o.find((x) => kucuk(x).includes(k)) : undefined) ?? null;
  }, s).catch(() => null);
}

/**
 * Açılan listede tıklanacak görünen seçenek (aynı belgede): role=option ya da liste öğesi. Öncelik: metni tam (senaryo metni ya da
 * gizli listedeki seçeneğin metni), değeri (data-value / id sonu), sonra metin senaryo metniyle başlar, en son içerir. Bulunan öğe
 * işaretlenir; bulunamazsa false.
 */
function gorunenSecenegiIsaretle(e: Element, a: { isaret: string; metinler: string[]; deger: string; aranan: string }): boolean {
  const d = e.ownerDocument;
  const n = (t: string): string => t.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
  const gorunur = (x: Element): boolean => {
    const r = x.getBoundingClientRect();
    const st = (d.defaultView ?? window).getComputedStyle(x);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const uygun = (x: Element): boolean => !x.closest('select') && gorunur(x) && x.getAttribute('aria-disabled') !== 'true';
  // Rollü seçenekler (role=option / listbox öğesi) önce; rolsüz bileşenlerde görünen liste öğeleri (li / data-value).
  const rollu = [...d.querySelectorAll('[role="option"], [role="listbox"] li, [role="tree"] li, [role="treeitem"]')].filter(uygun);
  const rolsuz = [...d.querySelectorAll('li, [data-value]')].filter((x) => !rollu.includes(x) && uygun(x));
  const metin = (x: Element): string => n((x as HTMLElement).innerText ?? x.textContent ?? '');
  const tamlar = a.metinler.map(n).filter(Boolean);
  const aranan = n(a.aranan);
  const degerMi = (x: Element): boolean => {
    const v = x.getAttribute('data-value') ?? x.getAttribute('data-id') ?? '';
    return Boolean(a.deger) && (v === a.deger || (x.id ?? '').endsWith(`-${a.deger}`));
  };
  const kismi = (liste: Element[]): Element | undefined => (aranan ? liste.find((x) => metin(x).startsWith(aranan)) ?? liste.find((x) => metin(x).includes(aranan)) : undefined);
  const bulunan = [...rollu, ...rolsuz].find((x) => tamlar.includes(metin(x))) ?? [...rollu, ...rolsuz].find(degerMi) ?? kismi(rollu) ?? kismi(rolsuz);
  if (!bulunan) return false;
  bulunan.setAttribute('data-nobetci-ozel-secenek', a.isaret);
  return true;
}

/**
 * Bileşenin açık kalan listesi (görünen arama kutusu ya da liste kutusu; ör. select2'nin gövdeye eklenen penceresi): önce kutuya
 * yeniden tıklanır (aç / kapa), kapanmazsa belgeye "dışarı tıklama" (mousedown / mouseup) gönderilir. Escape kullanılmaz (üstteki
 * pencereyi — ör. iframe'i taşıyan açılır pencere — kapatabilir).
 */
async function acikListeyiKapat(k: Kapsam, l: Locator, isaret: string): Promise<void> {
  const acik = async (): Promise<boolean> => l.evaluate((e) => {
    const d = e.ownerDocument;
    const gorunur = (x: Element): boolean => {
      const r = x.getBoundingClientRect();
      const st = (d.defaultView ?? window).getComputedStyle(x);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    return [...d.querySelectorAll('[data-nobetci-ozel-ara], [role="listbox"]')].some((x) => !x.closest('select') && !x.hasAttribute('data-nobetci-onceden') && gorunur(x));
  }).catch(() => false);
  if (!(await acik())) return;
  if (await l.evaluate(ozelBilesenIsaretle, isaret).catch(() => false)) {
    const kutu = k.locator(`[data-nobetci-ozel="${isaret}"]`).first();
    await kutu.click({ timeout: 2_000 }).catch(() => undefined);
    await kutu.evaluate((e) => e.removeAttribute('data-nobetci-ozel'), undefined, { timeout: 1_000 }).catch(() => undefined);
  }
  if (await acik()) {
    await l.evaluate((e) => {
      const b = e.ownerDocument.body;
      for (const t of ['mousedown', 'mouseup', 'click']) b.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: e.ownerDocument.defaultView }));
    }).catch(() => undefined);
  }
}

async function ozelSec(k: Kapsam, alan: PlanAlani, l: Locator, adimBasligi: string): Promise<void> {
  const s = secenekBul(alan.secenekler, alan.deger);
  // Hedef: gizli listedeki seçenek (değer, metin tam, sonra "kod - ad" metni kodla başlar / içerir).
  // Bağlı liste: seçenekler üst alan seçildikten sonra gelir; liste dolana kadar beklenir.
  const ilk = await hedefSecenekBekle(l, s, alan);
  if (ilk === null) throw new Error(beklenenGorulenMetni(adimBasligi, `${alan.etiket}: "${s.metin}" seçilir`, `listede böyle bir seçenek yok (${Math.round(listeBeklemesi(alan).sinirMs / 1000)} sn beklendi)`));
  const hedef = ilk.deger;
  const deger = async (): Promise<string | null> => l.inputValue({ timeout: 2_000 }).catch(() => null);
  if ((await deger()) === hedef) return;
  const isaret = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  if (await l.evaluate(ozelBilesenIsaretle, isaret).catch(() => false)) {
    const kutu = k.locator(`[data-nobetci-ozel="${isaret}"]`).first();
    let aramaKutusu: Locator | null = null;
    // Tıklamadan önce zaten görünen liste kutuları (sayfanın sabit listeleri) açık kalan pencere sayılmaz.
    await l.evaluate((e) => { for (const x of e.ownerDocument.querySelectorAll('[role="listbox"]')) if ((x as HTMLElement).offsetParent) x.setAttribute('data-nobetci-onceden', ''); }).catch(() => undefined);
    try {
      await kutu.click({ timeout: 5_000 });
      // Açılan arama kutusu: bileşenin odakladığı metin kutusu ya da görünen bir arama kutusu (aynı belgede).
      const ara = await l.evaluate((e, i) => {
        const d = e.ownerDocument;
        const gorunur = (x: Element | null): boolean => {
          if (!x) return false;
          const r = x.getBoundingClientRect();
          const st = (d.defaultView ?? window).getComputedStyle(x);
          return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
        };
        const metinKutusu = (x: Element | null): x is HTMLInputElement => !!x && x.tagName === 'INPUT' && ['text', 'search', ''].includes((x as HTMLInputElement).type) && gorunur(x);
        const a = d.activeElement;
        const bulunan = metinKutusu(a) ? a : [...d.querySelectorAll('input[type="search"],input[role="searchbox"],input[role="combobox"],input[aria-autocomplete]')].find(metinKutusu);
        if (!bulunan) return false;
        bulunan.setAttribute('data-nobetci-ozel-ara', i);
        return true;
      }, isaret).catch(() => false);
      if (ara) {
        aramaKutusu = k.locator(`[data-nobetci-ozel-ara="${isaret}"]`).first();
        await aramaKutusu.fill('', { timeout: 3_000 });
        await aramaKutusu.pressSequentially(s.metin, { delay: 20, timeout: 10_000 });
      }
      // Görünen seçenek ("kod - ad" metinli listelerde senaryo kodu metnin tamamı değildir): metin tam → değer → başlar → içerir.
      // Liste arama sonucunu geç çizebilir: kısa aralıklarla aranır.
      const secenekIsareti = `${isaret}s`;
      const bilgi = { isaret: secenekIsareti, metinler: [s.metin, ilk.metin], deger: hedef, aranan: s.metin };
      let bulundu = false;
      for (const bitis = Date.now() + 3_000; !bulundu && Date.now() < bitis;) {
        bulundu = await l.evaluate(gorunenSecenegiIsaretle, bilgi).catch(() => false);
        if (!bulundu) await new Promise((c) => setTimeout(c, 100));
      }
      if (bulundu) {
        const secenek = k.locator(`[data-nobetci-ozel-secenek="${secenekIsareti}"]`).first();
        await secenek.click({ timeout: 3_000 }).catch(() => undefined);
      }
      await expect.poll(deger, { timeout: 2_000 }).toBe(hedef).catch(() => undefined);
    } catch { /* görünen bileşenden seçilemedi: yedek yol */ } finally {
      await kutu.evaluate((e) => e.removeAttribute('data-nobetci-ozel'), undefined, { timeout: 1_000 }).catch(() => undefined);
    }
    // Liste açık kaldıysa (seçilemedi ya da bileşen seçimden sonra kapanmadı) kapatılır: açık pencere sonraki alanın kutusunu ve
    // düğmeleri örter. İşaret kontrolden SONRA kaldırılır (önce kaldırılırsa açık liste görülmez).
    await acikListeyiKapat(k, l, isaret);
    // İşaretler belgeden temizlenir (seçimden sonra bileşenin penceresi belgeden kaldırılmış olabilir: öğeye bağlı temizlik beklerdi).
    await l.evaluate((e) => { for (const x of e.ownerDocument.querySelectorAll('[data-nobetci-onceden], [data-nobetci-ozel-ara], [data-nobetci-ozel-secenek], [data-nobetci-ozel]')) for (const a of ['data-nobetci-onceden', 'data-nobetci-ozel-ara', 'data-nobetci-ozel-secenek', 'data-nobetci-ozel']) x.removeAttribute(a); }).catch(() => undefined);
  }
  // Yedek yol: değer GÜNCEL öğeye (liste bu arada yeniden kurulmuş olabilir; hedef yeniden aranır) input / change olaylarıyla yazılır.
  if ((await deger()) !== hedef) {
    const guncel = (await hedefSecenek(l, s)) ?? ilk;
    await degerJsIleYaz({ ...alan, deger: guncel.deger, secenekler: [{ deger: guncel.deger, metin: guncel.metin }] }, l, adimBasligi);
  }
  const son = await deger();
  if (son !== hedef) throw new Error(beklenenGorulenMetni(adimBasligi, `${alan.etiket}: "${s.metin}" seçilir`, `liste değeri "${son ?? '?'}" kaldı (görünen kutudan ve gizli listeye yazılarak denendi)`));
}

async function alaniDoldur(page: Page, ham: PlanAlani, l: Locator, adimBasligi: string, k: Kapsam = page): Promise<void> {
  const alan = ham.parametreler.maske ? { ...ham, deger: maskeUygula(ham.parametreler.maske, ham.deger) } : ham;
  const deger = alan.deger;
  if (alan.doldurucu === 'ozelSecim') { await ozelSec(k, alan, l, adimBasligi); return; }
  if (alan.doldurucu === 'degerJs') { await degerJsIleYaz(alan, l, adimBasligi); return; }
  switch (alan.tip) {
    case 'okluSecim':
      await okluSec(page, alan, l, secenekBul(alan.secenekler, deger).metin, adimBasligi, k);
      return;
    case 'secim': {
      const s = secenekBul(alan.secenekler, deger);
      const etiket = await l.evaluate((e) => e.tagName);
      if (etiket === 'SELECT') {
        // "Gerekirse seç": değer zaten seçiliyse dokunulmaz (yeniden seçmek sayfada bağımlı alanları sıfırlayabilir).
        if (alan.doldurucu === 'secimGerekirse' && (await l.inputValue()) === s.deger) return;
        // Bağlı liste: seçenek gelene kadar beklenir (selectOption seçeneğin listede belirmesini bekler; "Alan işlemi" süresi).
        const bas = Date.now();
        try {
          await l.selectOption({ value: s.deger }, { timeout: listeBeklemesi(alan).sinirMs });
          yavaslamaNotu(alan, Date.now() - bas);
        } catch {
          await l.selectOption({ label: s.metin }, { timeout: 5_000 });
        }
        return;
      }
      // Özel açılır liste: aç, seçeneği görünen metniyle seç.
      await l.click();
      await k.getByText(s.metin, { exact: true }).filter({ visible: true }).first().click();
      return;
    }
    case 'radyo': {
      const s = secenekBul(alan.secenekler, deger);
      const hedef = s.secici
        ? k.locator(s.secici)
        : k.locator(alan.secici as string).and(k.locator(`[value="${cssKacis(s.deger)}"]`));
      if (alan.doldurucu === 'radyoZorla') { await zorlaIsaretle(hedef.first(), true, adimBasligi, alan); return; }
      // Aynı seçiciye uyan gizli kopya olabilir: görünür olan seçilir. Girdi gizli / örtülüyse (özel çizimli radyo) zorla işaretlenir
      // (hızlı testle aynı kural: hizli-test-motoru.ts > alaniDoldur).
      const gorunen = hedef.filter({ visible: true }).first();
      if (await gorunen.count()) { await gorunen.check(); return; }
      await zorlaIsaretle(hedef.first(), true, adimBasligi, alan);
      return;
    }
    case 'onayKutusu':
      if (alan.doldurucu === 'onayKutusuZorla') { await zorlaIsaretle(l, deger === true || deger === 'true', adimBasligi, alan); return; }
      await l.setChecked(deger === true || deger === 'true');
      return;
    case 'tarih':
      // Takvimden seçilen (salt okunur) alan: değer + olaylar, olmazsa takvimden gün (hızlı testle aynı kural: alan-cikisi.ts > takvimdenYaz).
      if (alan.parametreler.takvim === true) {
        const h = await takvimdenYaz(l, String(deger), alanTiklamaSuresiMs());
        if (h) throw new Error(beklenenGorulenMetni(adimBasligi, `${alan.etiket}: "${String(deger)}" seçilir`, h));
        return;
      }
      if (alan.doldurucu === 'tarihJs') {
        await l.evaluate((e, v) => {
          (e as HTMLInputElement).value = v;
          e.dispatchEvent(new Event('input', { bubbles: true }));
          e.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(deger));
      } else {
        // Ortak yazma kuralı (alan-cikisi.ts > alanaYaz): metin kutusundaki tarih (maskeli "gg.aa.yyyy") gerçek tuşlarla yazılır;
        // tarayıcının tarih denetimi (type=date) doğrudan.
        await alanaYaz(l, String(deger), { zamanAsimiMs: alanTiklamaSuresiMs() });
      }
      return;
    case 'dosya':
      await l.setInputFiles(yuklenecekDosya(deger));
      return;
    default: {
      const metin = String(deger);
      if (alan.doldurucu === 'secimGerekirse' && (await l.inputValue().catch(() => null)) === metin) return;
      // Hızlı testle AYNI yazma kuralı (alan-cikisi.ts > alanaYaz): kısa tek satırlı metin gerçek tuşlarla (maske / keyup sorgusu çalışır,
      // "yaz-sil-yaz" olmaz), uzun metin doğrudan; alandan çıkılır (change / blur ve bağlı sorgu), sayfa değeri silerse bir kez yeniden
      // tuşlanır. Doldurucu tuşlama istiyorsa (tuslayarakYaz / telefonTuslama) her zaman tuşlanır; maske parametresiyle biçimlenmiş değer
      // (kalıba göre tek seferde yazılması amaçlanır) doğrudan yazılır.
      // Otomatik tamamlama (hızlı testte öneriden seçildi): yaz → öneri listesini bekle → eşleşen öneriyi seç (alan-cikisi.ts > oneridenYaz).
      if (alan.parametreler.oneri === true) {
        const r = await oneridenYaz(l, metin, alanTiklamaSuresiMs());
        if (r !== 'secildi' && r !== 'liste-yok') throw new Error(beklenenGorulenMetni(adimBasligi, `${alan.etiket}: "${metin}" öneriden seçilir`, r));
        await alandanCik(l);
        return;
      }
      const tuslayarak = alan.doldurucu === 'tuslayarakYaz' || alan.doldurucu === 'telefonTuslama';
      await alanaYaz(l, metin, {
        tuslayarak, aralikMs: tuslayarak ? 25 : undefined, kip: ham.parametreler.maske ? 'dogrudan' : 'otomatik', zamanAsimiMs: alanTiklamaSuresiMs()
      });
    }
  }
}

/**
 * Koşuda sayfa açma: hızlı test / tarama / kayıtla aynı ortak yol (giriş sonrası kesilen gezinme, Referer isteyen siteler,
 * net::ERR_ABORTED). Hata iletisi adresi göstermez.
 */
async function sayfayiAc(page: Page, adres: string): Promise<void> {
  let yol = adres;
  try { const u = new URL(adres); yol = `${u.pathname}${u.search}`; } catch { /* göreli adres */ }
  await hedefSayfayiAc(page, adres, 30_000, yol);
}

/** Hata göstergesinin (yoksa sayfanın) görünen metni; görünmüyorsa boş. */
async function hataMetni(page: Page, kosu: PlanKosuTanimi | null): Promise<string> {
  return (await hataMesajlari(page, kosu)).join(' ').trim();
}

/**
 * Hata göstergesinin görünen metinleri ve adım başladığından beri çıkan tarayıcı uyarıları (alert/confirm), ayrı ayrı. Göstergenin
 * metinleri koşuda yakalanan mesajlara da bildirilir (mesaj-yakalayici.ts; yoklamada aynı metin bir kez sayılır).
 */
export async function hataMesajlari(page: Page, kosu: PlanKosuTanimi | null): Promise<string[]> {
  const secici = kosu?.hataGostergesi?.secici;
  const metinler: string[] = [];
  if (secici) {
    const l = kapsam(page, kosu?.hataGostergesi?.cerceve).locator(secici).filter({ visible: true });
    const n = await l.count().catch(() => 0);
    for (let i = 0; i < n; i++) metinler.push(await l.nth(i).innerText().catch(() => ''));
    mesajYakalayicisi(page)?.gostergeMetinleri(`hata:${secici}`, metinler);
  }
  metinler.push(...hataSayilanUyarilar(page, kosu), ...(pencereMesajlari.get(page) ?? []));
  return metinler.map((m) => m.trim()).filter(Boolean);
}

/**
 * Tarayıcı pencerelerinden (alert / confirm / prompt) adımın HATASI sayılanlar. Hızlı test ve doğrulama koşusuyla aynı kural:
 *  - aksiyonunda "diyalog" yanıtı olan tıklamanın açtığı pencereler beklenendir (hızlı testte görüldü, yanıtlandı): hata değildir;
 *  - bitiş koşullu adımda (hızlı test; kosu.bitisKosulu) pencere metni bitiş etiketleriyle değerlendirilir: "Bitti" metniyse başarı,
 *    "Hata" metniyse (kosu.uyarilar) hata (ikisi de sayfa metninde aranır: sayfaMetni pencereleri de okur); etiketsiz pencere hata değildir;
 *  - diğer modellerde (eski davranış) görülen her pencere adımın hatasıdır.
 */
function hataSayilanUyarilar(page: Page, kosu: PlanKosuTanimi | null): string[] {
  if (kosu?.bitisKosulu) return [];
  const beklenen = beklenenUyarilar.get(page);
  return (tarayiciUyarilari.get(page) ?? []).filter((m) => !beklenen?.has(m));
}

/**
 * Çerçevedeki (iframe) tıklamadan sonra AYNI çerçevede beliren sayfa içi pencere (ör. formun gönderim doğrulaması mesajı): tarayıcı
 * uyarısı gibi adım boyunca saklanır, koşuda yakalanan mesajlara "diyalog" olarak yazılır ve adımın hata mesajlarına girer — adım o
 * mesajla kalır (başarı göstergesi tıklamadan önce de görünüyorsa sessizce geçip sonraki adımda zaman aşımına düşmez).
 */
const pencereMesajlari = new WeakMap<Page, string[]>();
const SAYFA_ICI_PENCERE = '[role="dialog"], [role="alertdialog"], dialog[open], .ui-dialog';
/** Tıklamadan sonra pencere için en çok bekleme (çerçeve başka sayfaya giderse — ör. form gönderildi — beklenmez). */
const PENCERE_BEKLEME_MS = 1_000;

async function gorunenPencereler(k: Kapsam): Promise<string[]> {
  const metinler = await k.locator(SAYFA_ICI_PENCERE).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
  return [...new Set(metinler.map((m) => m.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

/** Tıklamadan önce: çerçevenin belgesine işaret konur (tıklamadan sonra yoksa çerçeve başka sayfaya gitmiştir) ve açık pencereler okunur. */
async function cerceveTiklamaOncesi(k: Kapsam, isaret: string): Promise<string[]> {
  await k.locator('html').first().evaluate((e, i) => { e.setAttribute('data-nobetci-tik', i); }, isaret, { timeout: 2_000 }).catch(() => undefined);
  return gorunenPencereler(k);
}

async function cerceveTiklamaSonrasi(page: Page, k: Kapsam, isaret: string, once: string[], kosu: PlanKosuTanimi | null, cerceve: readonly string[]): Promise<void> {
  const ayniCerceve = (c: readonly string[] | null | undefined): boolean => JSON.stringify(c ?? []) === JSON.stringify(cerceve);
  for (const bitis = Date.now() + PENCERE_BEKLEME_MS; ;) {
    const ayniBelge = await k.locator('html').first().evaluate((e, i) => e.getAttribute('data-nobetci-tik') === i, isaret, { timeout: 500 }).catch(() => false);
    if (!ayniBelge) return;
    const yeniler = (await gorunenPencereler(k)).filter((m) => !once.includes(m));
    if (yeniler.length) {
      // Pencere adımın başarı göstergesini taşıyorsa (başarı öğesi pencerenin içinde) hata sayılmaz; yalnız yakalanan mesaj olur.
      const basariPencerede = await Promise.all((kosu ? basariSecenekleri(kosu) : []).filter((g) => g.tur === 'eleman' && ayniCerceve(g.cerceve))
        .map((g) => k.locator(SAYFA_ICI_PENCERE).filter({ visible: true }).locator(g.deger).count().catch(() => 0)));
      const liste = pencereMesajlari.get(page) ?? [];
      pencereMesajlari.set(page, liste);
      for (const m of yeniler) {
        mesajYakalayicisi(page)?.yakala('diyalog', m);
        if (!basariPencerede.some((n) => n > 0)) liste.push(m);
      }
      await k.locator('html').first().evaluate((e) => e.removeAttribute('data-nobetci-tik'), undefined, { timeout: 500 }).catch(() => undefined);
      return;
    }
    if (Date.now() >= bitis) break;
    await page.waitForTimeout(100);
  }
  await k.locator('html').first().evaluate((e) => e.removeAttribute('data-nobetci-tik'), undefined, { timeout: 500 }).catch(() => undefined);
}

/**
 * Adımın aksiyon tıklamalarının etkisi (guvenli-tiklama.ts): notlar (ilk tıklama etkisiz kaldı, bir kez daha tıklandı) adımdan sonra
 * adım ayrıntısına yazılır; etkisiz (son tıklamadan sonra da hiçbir şey değişmedi) tıklama, başarı göstergesi görünmezse hata iletisine.
 */
type TiklamaIzi = { notlar: string[]; etkisiz: { ad: string; tekrar: boolean } | null };
const tiklamaIzleri = new WeakMap<Page, TiklamaIzi>();
function tiklamaIzi(page: Page): TiklamaIzi {
  let iz = tiklamaIzleri.get(page);
  if (!iz) { iz = { notlar: [], etkisiz: null }; tiklamaIzleri.set(page, iz); }
  return iz;
}

/** Adım başında: önceki adımın tarayıcı uyarıları, sayfa içi pencere mesajları ve etkisiz tıklama izi temizlenir. */
function adimMesajlariniTemizle(page: Page): void {
  tarayiciUyarilari.get(page)?.splice(0);
  beklenenUyarilar.get(page)?.clear();
  aksiyonDiyaloglari.delete(page);
  pencereMesajlari.get(page)?.splice(0);
  const iz = tiklamaIzleri.get(page);
  if (iz) iz.etkisiz = null;
}

/**
 * Sayfanın tarayıcı uyarıları (alert / confirm / prompt): mesajı adım boyunca saklanır. alert kapatılır; confirm / prompt
 * Ayarlar > Koşu > Gelişmiş > Tarayıcı onay pencereleri kararına göre iptal edilir (varsayılan; Playwright'ın dinleyicisiz
 * davranışıyla aynı) ya da onaylanır (prompt varsayılan değeriyle). Hata göstergesi ve beklenen mesaj bunları da okur.
 */
const tarayiciUyarilari = new WeakMap<Page, string[]>();
/** Aksiyonun "diyalog" yanıtıyla açılan (beklenen) pencerelerin metinleri: adımın hatası sayılmaz. */
const beklenenUyarilar = new WeakMap<Page, Set<string>>();
/** Son tıklama aksiyonunun pencere yanıtı (aksiyonun "diyalog"u; adım başında temizlenir). */
const aksiyonDiyaloglari = new WeakMap<Page, 'kabul' | 'iptal'>();
export function tarayiciUyarilariniDinle(page: Page): void {
  if (tarayiciUyarilari.has(page)) return;
  const liste: string[] = [];
  tarayiciUyarilari.set(page, liste);
  page.on('dialog', (d) => {
    liste.push(d.message());
    mesajYakalayicisi(page)?.yakala('diyalog', d.message());
    // Aksiyonun yanıtı (hızlı testte verilen) varsa o; yoksa Ayarlar > Koşu > Tarayıcı onay pencereleri kararı.
    const aksiyonYaniti = aksiyonDiyaloglari.get(page);
    if (aksiyonYaniti) {
      const s = beklenenUyarilar.get(page) ?? new Set<string>();
      beklenenUyarilar.set(page, s);
      s.add(d.message());
    }
    const soru = d.type() === 'confirm' || d.type() === 'prompt';
    const onayla = soru && (aksiyonYaniti ? aksiyonYaniti === 'kabul' : onayPenceresiDavranisi() === 'onayla');
    void (onayla ? d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined) : d.dismiss()).catch(() => undefined);
  });
}

/**
 * Arka plan istekleri (XHR / fetch) izi: her alan doldurulduktan sonra, o alanın başlattığı istekler (ör. seçim değişince
 * yeniden yüklenen bağımlı liste, kimlik sorgusu) bitene kadar beklenir — yoksa liste sonraki alan seçildikten sonra gelip
 * seçimi silebilir. Alan doldurulmadan önce başlamış istekler (ör. süreklilik / izleme istekleri) beklenmez. Sınırlı süre:
 * bitmeyen istek koşuyu durdurmaz (alanSonrasiEnCokMs sonra devam edilir; Ayarlar > Koşu > Gelişmiş, varsayılan 8 sn).
 */
export const alanSonrasiEnCokMs = (): number => sureAyari('NOBETCI_ARKA_PLAN_BEKLEME_MS', 8_000, 1_000, 120_000);
/** Alan sonrası tıklamanın (ör. sorgu düğmesi) en çok süresi; aşılırsa açık hatayla düşer (Ayarlar > Koşu > Alan işlemi). */
const alanTiklamaSuresiMs = (): number => sureAyari('NOBETCI_ALAN_BEKLEME_MS', 15_000);
/** İstek bittikten sonra yeni bir istek başlamadan geçmesi gereken süre (zincirleme istekler için). */
const SESSIZLIK_MS = 150;
/**
 * Hızlı testle aynı ağ sakinliği kuralı (ag-sakinligi.ts): yalnız XHR / fetch sayılır; UZUN_ISTEK_MS'den uzun bekleyen istek (uzun yoklama,
 * keep-alive) sayılmaz ve adresi öğrenilir — sürekli açık isteği olan sitede her alanda en çok süre beklenmez.
 */
const agIzleri = new WeakMap<Page, AgIzleyici>();
function agIzle(page: Page): void {
  if (!agIzleri.has(page)) agIzleri.set(page, new AgIzleyici(page, { yalnizXhr: true }));
}
/** baslangic'tan sonra başlayan arka plan istekleri bitene (ve kısa bir sessizlik olana) kadar bekler. */
async function arkaPlanIstekleriniBekle(page: Page, baslangic: number): Promise<void> {
  const iz = agIzleri.get(page);
  if (!iz) return;
  const bitis = Date.now() + alanSonrasiEnCokMs();
  while (!iz.sakinMi(baslangic, { sessizlikMs: SESSIZLIK_MS }) && Date.now() < bitis) await page.waitForTimeout(50);
}

/**
 * Sayfa metni + çerçevelerin (iframe) metni + adım boyunca çıkan tarayıcı uyarıları (öğesiz metin aramaları için; ör. bir
 * çerçevede açılan pencerenin mesajı).
 */
async function sayfaMetni(page: Page): Promise<string> {
  const govde = await page.locator('body').innerText().catch(() => '');
  const cerceveler = await Promise.all(page.frames().filter((f) => f !== page.mainFrame()).slice(0, 20)
    .map((f) => f.locator('body').innerText({ timeout: 1_000 }).catch(() => '')));
  return [govde, ...cerceveler.filter(Boolean), ...(tarayiciUyarilari.get(page) ?? [])].join('\n');
}

/** Başarı göstergesinin seçenekleri ("veya" grubunda her biri; tek göstergede kendisi). */
function basariSecenekleri(kosu: PlanKosuTanimi): PlanBasariGostergesi[] {
  const g = kosu.basariGostergesi;
  if (!g) return [];
  return g.tur === 'veya' ? g.secenekler : [g];
}

function basariAciklamasi(kosu: PlanKosuTanimi): string {
  const secenekler = basariSecenekleri(kosu);
  return secenekler.length ? secenekler.map(gostergeAciklamasi).join(' veya ') : 'adım tamamlanır';
}

function gostergeAciklamasi(g: PlanBasariGostergesi): string {
  if (g.tur === 'desen') return `${g.secici ?? "sayfanın"} metni /${g.deger}/ kalıbına uyar`;
  return g.tur === 'metin' ? `"${g.deger}" metni görünür` : g.tur === 'url' ? `adres /${g.deger}/ desenine uyar` : `${g.deger} öğesi görünür`;
}

/** Akışta bu adım için kabul edilen uyarılardan görünen (başarı beklenen senaryoda görünürse test başarısız); yoksa ''. */
async function kabulEdilenUyari(page: Page, kosu: PlanKosuTanimi): Promise<string> {
  if (!kosu.uyarilar?.length) return '';
  let sayfa: string | null = null;
  for (const u of kosu.uyarilar) {
    let metin: string;
    if (u.secici) {
      const ogeler = await Promise.all((await kapsam(page, u.cerceve).locator(u.secici).filter({ visible: true }).all()).map((x) => x.innerText().catch(() => '')));
      mesajYakalayicisi(page)?.gostergeMetinleri(`uyari:${u.secici}`, ogeler);
      metin = ogeler.join(' ');
    } else {
      metin = (sayfa ??= await sayfaMetni(page));
    }
    if (mesajIceriyorMu(metin, u.metin)) return `uyarı: "${u.metin}"`;
  }
  return '';
}

/** Görünen ilk başarı seçeneği ("veya": herhangi biri); gösterge yoksa null. */
async function gorunenBasari(page: Page, kosu: PlanKosuTanimi): Promise<PlanBasariGostergesi | null> {
  for (const g of basariSecenekleri(kosu)) if (await gostergeVarMi(page, g)) return g;
  return null;
}

async function basariVarMi(page: Page, kosu: PlanKosuTanimi): Promise<boolean> {
  return !kosu.basariGostergesi || (await gorunenBasari(page, kosu)) !== null;
}

async function gostergeVarMi(page: Page, g: PlanBasariGostergesi): Promise<boolean> {
  if (g.tur === 'url') return new RegExp(g.deger).test(page.url());
  // Gösterge öğesi bir çerçevede olabilir (cerceve).
  const k = kapsam(page, g.cerceve);
  if (g.tur === 'eleman') return (await k.locator(g.deger).filter({ visible: true }).count().catch(() => 0)) > 0;
  if (g.tur === 'desen') {
    const metin = g.secici
      ? (await Promise.all((await k.locator(g.secici).filter({ visible: true }).all()).map((x) => x.innerText().catch(() => '')))).join(' ')
      : await sayfaMetni(page);
    return new RegExp(g.deger).test(metin);
  }
  const metin = g.secici
    ? (await Promise.all((await k.locator(g.secici).filter({ visible: true }).all()).map((x) => x.innerText().catch(() => '')))).join(' ')
    : await sayfaMetni(page);
  return mesajIceriyorMu(metin, g.deger);
}

/**
 * Adımın aksiyonları sırayla. "Görünürse" tıklama (kosul: 'gorunurse'): öğe kısa bir süre (varsayılan GORUNURSE_BEKLEME_SN;
 * aksiyonun zamanAsimiSn'i, adımın süresinden bağımsız) beklenir; görünmezse atlanır ve "atlandı (görünmedi)" notu düşer.
 */
async function aksiyonlariUygula(page: Page, kosu: PlanKosuTanimi | null, sureSn: number, ekranUrl: string, atlanan: AtlananAlan[]): Promise<boolean> {
  /** Son uygulanan aksiyon "Ekrana dön" mü (baştaki ortak akış böyle bitince ekran ikinci kez açılmaz)? */
  let ekranaDonuldu = false;
  for (const a of kosu?.aksiyonlar ?? []) {
    // Ekrana dön: ekranın adresi yeniden açılır (ör. ortak akış kullanıcıyı değiştirip ana sayfaya götürdükten sonra).
    if (a.tur === 'ekranaDon') { await sayfayiAc(page, ekranUrl); ekranaDonuldu = true; continue; }
    // Şu adrese git: ekranın ortamının adresine göre yol açılır (kayıtta adres çubuğuyla / bağlantıyla gidilen sayfa). Önceki
    // adımın tıklaması hâlâ yükleniyorsa (form gönderimi, yönlendirme) o bitsin; gidilen sayfada sonraki adımlar sürer.
    if (a.tur === 'git') {
      await page.waitForLoadState('load', { timeout: 5_000 }).catch(() => undefined);
      // Yol ekranın ortamının adresine göre çözülür: ekran adresi tam adresse onunla, değilse açık sayfanın kökeniyle (yoksa bağlamın
      // baseURL'iyle: page.goto göreli adresi ona göre açar).
      const kok = /^https?:/i.test(ekranUrl) ? ekranUrl : /^https?:/i.test(page.url()) ? page.url() : null;
      await sayfayiAc(page, kok ? new URL(a.yol ?? '/', kok).href : a.yol ?? '/');
      ekranaDonuldu = false;
      continue;
    }
    // Süreli bekleme (akış diyagramındaki "Bekleme süresi"; sayfayı değiştirmez).
    if (a.tur === 'bekle' && a.sureSn && !a.secici) { await page.waitForTimeout(a.sureSn * 1000); continue; }
    if (!a.secici) continue;
    // Öğeye dokunan / bekleyen aksiyon: ekrandan sonra sayfa değişmiş olabilir.
    if (a.tur === 'tikla') ekranaDonuldu = false;
    // Tıklamada açılacak tarayıcı penceresine hızlı testte verilen yanıt (aksiyonun "diyalog"u): adımın sonuna kadar geçerli; açılan
    // pencereler beklenen sayılır (doğrulama koşusuyla aynı kural).
    if (a.tur === 'tikla' && (a.diyalog === 'kabul' || a.diyalog === 'iptal')) aksiyonDiyaloglari.set(page, a.diyalog);
    // Öğe bir çerçevede olabilir (aksiyonun cerceve'si).
    const k = kapsam(page, a.cerceve);
    let l = k.locator(a.secici);
    if (a.metin) l = l.filter({ hasText: a.metin });
    // Çerçevedeki tıklama: ardından aynı çerçevede beliren sayfa içi pencere (ör. gönderim doğrulaması) adımın mesajı olur.
    const cerceveliTikla = async (oge: Locator, zamanMs: number): Promise<void> => {
      if (!a.cerceve?.length) { await oge.click({ timeout: zamanMs }); return; }
      const isaret = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const once = await cerceveTiklamaOncesi(k, isaret);
      await oge.click({ timeout: zamanMs });
      await cerceveTiklamaSonrasi(page, k, isaret, once, kosu, a.cerceve);
    };
    // Güvenli tıklama (guvenli-tiklama.ts): sayfa sakinleşince basılır; tıklama etkisiz kalırsa (istek yok, görünüm aynı, başarı
    // göstergesi yok) bir kez daha basılır — istek başlatan / sayfayı değiştiren tıklama asla tekrarlanmaz.
    const ad = a.aciklama || a.metin || a.secici;
    const guvenliBas = async (oge: Locator, zamanMs: number): Promise<void> => {
      const r = await guvenliTikla(page, oge, {
        zamanMs, ag: agIzleri.get(page) ?? null, tikla: cerceveliTikla,
        ...(kosu?.basariGostergesi ? { basariVarMi: () => basariVarMi(page, kosu) } : {})
      });
      const iz = tiklamaIzi(page);
      if (r.tekrarlandi) iz.notlar.push(`“${ad}”: ${TEKRAR_NOTU}`);
      iz.etkisiz = r.etkisiz ? { ad, tekrar: r.tekrarlandi } : null;
    };
    if (a.tur === 'tikla' && a.kosul === 'gorunurse') {
      const oge = l.filter({ visible: true }).first();
      const gorundu = await oge.waitFor({ state: 'visible', timeout: (a.zamanAsimiSn ?? GORUNURSE_BEKLEME_SN) * 1000 }).then(() => true, () => false);
      if (gorundu) await guvenliBas(oge, sureSn * 1000);
      else atlanan.push({ alan: `“${ad}” düğmesi`, neden: 'atlandı (görünmedi)' });
      continue;
    }
    const zaman = (a.zamanAsimiSn ?? sureSn) * 1000;
    if (a.tur === 'tikla') await guvenliBas(l.filter({ visible: true }).first(), zaman);
    else if (a.durum === 'dolu') await doluBekle(page, a.secici, zaman, 'Aksiyon', undefined, null, k);
    else await l.first().waitFor({ state: a.durum === 'gizli' ? 'hidden' : 'visible', timeout: zaman });
  }
  return ekranaDonuldu;
}

/**
 * Adımın sonucunu doğrular: beklenen hata adımında mesaj, aksi halde başarı göstergesi (beklenmeyen uyarı = hata).
 * "veya" göstergesinde görünen seçeneğin açıklamasını döndürür (raporda hangi mesajın göründüğü), diğerlerinde null.
 */
async function adimSonucunuDogrula(page: Page, adim: PlanAdimi, plan: ModelKosuPlani): Promise<string | null> {
  const kosu = adim.kosu;
  const sureMs = (kosu?.zamanAsimiSn ?? adimSuresiSn()) * 1000;
  if (plan.beklenen.tur === 'hata' && plan.beklenen.adim === adim.id) {
    const beklenenler = plan.beklenen.mesajlar.length ? plan.beklenen.mesajlar : [plan.beklenen.mesaj];
    const oku = async (): Promise<string> => (kosu?.hataGostergesi ? hataMetni(page, kosu) : sayfaMetni(page));
    const r = await beklenenMesajiBekle(oku, beklenenler, { zamanAsimiMs: sureMs });
    if (r.eslesen && beklenenler.length > 1) return `uyarı "${r.eslesen}"`;
    if (!r.eslesen) {
      const gorulen = r.sonGorulen || (kosu && kosu.basariGostergesi && (await basariVarMi(page, kosu)) ? `uyarı çıkmadı, ${basariAciklamasi(kosu).replace(/r$/, 'dü')}` : '');
      throw new Error(beklenenGorulenMetni(adim.baslik, beklenenler, gorulen));
    }
    return null;
  }
  if (!kosu || (!kosu.basariGostergesi && !kosu.hataGostergesi && !kosu.uyarilar?.length)) return null;
  let son = Date.now() + sureMs;
  // Bitiş koşulu (hızlı test): "Devam" metinleri görünürken süre dolarsa bir kez daha (en çok 60 sn) beklenir; son görülen Devam
  // metni hata iletisine yazılır.
  const devamlar = kosu.bitisKosulu?.devam ?? [];
  let uzatildi = false;
  let sonDevam = '';
  for (;;) {
    const gorunen = kosu.basariGostergesi ? await gorunenBasari(page, kosu) : null;
    // Başarı ve hata birlikte görünürse hata kazanır. Her mesaj ayrı değerlendirilir: başarı mesajının KENDİSİNİ gösteren
    // pencere / uyarı (ör. ödemede kabul edilen sonuç bir uyarıda çıkar) hata sayılmaz; akışın kabul ettiği uyarılar her zaman.
    const basariMetni = gorunen && gorunen.tur === 'metin' ? gorunen.deger : null;
    const hatalar = (await hataMesajlari(page, kosu)).filter((m) => !(basariMetni && mesajIceriyorMu(m, basariMetni)));
    const kabul = await kabulEdilenUyari(page, kosu);
    if (kabul) hatalar.push(kabul);
    if (hatalar.length) throw new Error(beklenenGorulenMetni(adim.baslik, basariAciklamasi(kosu), hatalar.join(' | ')));
    if (gorunen) return kosu.basariGostergesi?.tur === 'veya' ? gostergeAciklamasi(gorunen) : null;
    if (!kosu.basariGostergesi) return null;
    if (devamlar.length) {
      const sayfa = await sayfaMetni(page);
      sonDevam = devamlar.find((d) => mesajIceriyorMu(sayfa, d)) ?? sonDevam;
    }
    if (Date.now() >= son) {
      if (kosu.bitisKosulu && !uzatildi && sonDevam && devamlar.some((d) => sonDevam === d)) {
        const sayfa = await sayfaMetni(page);
        if (devamlar.some((d) => mesajIceriyorMu(sayfa, d))) { uzatildi = true; son = Date.now() + Math.min(60_000, sureMs); continue; }
      }
      if (kosu.bitisKosulu) {
        // Etiketsiz tarayıcı penceresi (hata sayılmadı) bilgi olarak iletiye eklenir.
        const pencereler = (tarayiciUyarilari.get(page) ?? []).map((m) => m.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(-2);
        throw new Error(beklenenGorulenMetni(adim.baslik, basariAciklamasi(kosu),
          `Bitiş mesajı görülmedi (${Math.round(sureMs / 1000)} sn${uzatildi ? ' + uzatma' : ''}; sayfa: ${new URL(page.url()).pathname}${sonDevam ? `; son görülen: “${sonDevam}”` : ''}${pencereler.length ? `; tarayıcı penceresi: ${pencereler.map((m) => `“${m}”`).join(', ')}` : ''})`));
      }
      // Son aksiyon tıklaması hiçbir şey değiştirmediyse (öğe hazır olmadan tıklanmış olabilir) ileti bunu söyler.
      const etkisiz = tiklamaIzleri.get(page)?.etkisiz;
      const neden = etkisiz ? `${etkisizTiklamaMetni(etkisiz.ad, etkisiz.tekrar)}; ` : '';
      throw new Error(beklenenGorulenMetni(adim.baslik, basariAciklamasi(kosu), `${neden}${Math.round(sureMs / 1000)} sn içinde başarı göstergesi görünmedi (sayfa: ${new URL(page.url()).pathname})`));
    }
    await page.waitForTimeout(250);
  }
}

/**
 * Koşunun ortamı: model verisi + giriş tarifi, kimlik ve paylaşılan oturum dosyası (kaynak: genel-veri.ts). Kimlik ve oturum dosyası yalnızca
 * gerektiğinde (giriş yapılırken) istenir.
 */
/** Koşu boyunca SQL adımlarında okunan değerler (${akis:Ad}; açık değerler yalnız bellekte) ve gizli olanların değerleri. */
type SqlDegerleri = { degerler: Record<string, string>; gizliler: string[] };

/**
 * SQL sorgusu adımı: bağlantı ayarı koşu verisinden (veri-oku.mjs; parola yalnız bellekte), yer tutucular sürücü parametresi
 * (${akis:Ad} → önceki SQL okumaları, ${alan} → senaryo değeri). Sonuç (en çok 20 satır, gizliler maskeli) ek olarak rapora;
 * uyuşmazsa "Beklenen / Görülen" hatası.
 */
async function sqlAdiminiUygula(testInfo: TestInfo, adimBasligi: string, tanim: SqlTanimi, s: PlatformModelSenaryosu, ortam: ModelKosuOrtami, d: SqlDegerleri): Promise<void> {
  // Hedef: mantıksal veritabanı → bu ortamın eşlemesi (veri-oku.mjs çözdü) ya da doğrudan bağlantı. Çözülemezse sorgu atılmaz.
  const hedef = kosuSqlAyari(ortam.veri, tanim);
  if ('hata' in hedef) throw new Error(`${adimBasligi}: ${hedef.hata}`);
  const { ayar } = hedef;
  const kullanilan = { baglanti: hedef.baglantiAdi, ...(hedef.veritabaniAdi ? { veritabani: hedef.veritabaniAdi } : {}) };
  const r = await sqlAdiminiKos(tanim, {
    adimAdi: adimBasligi,
    gizliDegerler: d.gizliler,
    gizliSutunMu: (ad) => gizliAdMi(ad),
    coz: (ifade) => {
      if (ifade.startsWith('akis:')) return d.degerler[ifade.slice(5).trim()];
      const v = s.veri[ifade];
      return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined;
    },
    // İzinler (veritabanı okuma / yazma): koşucu kasayı açmaz; durum veri-oku.mjs çıktısından gelir.
    yurutucu: (sql, parametreler, o) => ayarlaSorgula(ayar, sql, parametreler, { ...o, izinler: ortam.veri.izinler ?? null }),
    // Sorguda okunan en çok satır: Ayarlar > Koşu > Gelişmiş (varsayılan 1000).
    satirSiniri: sayiAyari('NOBETCI_SQL_SATIR_SINIRI', 1000, 1, 100_000)
  });
  // Ek her zaman yazılır (sorgu hatasında da): hangi bağlantının kullanıldığı raporda görünür (ad; parola asla).
  await testInfo.attach(`SQL sonucu - ${adimBasligi}`, {
    contentType: 'application/json',
    body: JSON.stringify({ ...kullanilan, beklenen: r.beklenen, gorulen: r.gorulen, deneme: r.deneme, sureMs: r.sureMs, ...(r.ozet ?? {}) }, null, 2)
  });
  if (r.durum !== 'basarili') throw new Error(r.mesaj ?? `${adimBasligi}: SQL adımı başarısız.`);
  Object.assign(d.degerler, r.okunanlar);
  for (const ad of r.gizliOkunanlar) { const v = r.okunanlar[ad]; if (v && !d.gizliler.includes(v)) d.gizliler.push(v); }
}

/**
 * İndirilen dosyayı doğrulama adımı: tetikleyici düğmeye basılır, indirme (Playwright download olayı) beklenir; dosya koşunun geçici
 * klasörüne (NOBETCI_DOSYA_KLASORU; yoksa işletim sisteminin geçici klasörü) yazılır, okunup doğrulanır ve HEMEN silinir.
 * Beklentilerdeki başvurular: ${akis:Ad} → önceki SQL okumaları, ${Tablo.Sütun} → veri okuyucunun çözdüğü değerler, ${alan} → senaryo
 * değeri. Özet (her beklenti: geçti / başarısız, Beklenen / Görülen; gizliler maskeli) her zaman rapora ek olarak yazılır; dosyanın kendisi
 * yalnız Ayarlar > Koşu > Kayıt > "Doğrulanan dosya" izin verirse (varsayılan: saklanmaz). Kalan beklenti → Beklenen / Görülen hatası.
 */
async function dosyaAdiminiUygula(page: Page, testInfo: TestInfo, adimBasligi: string, tanim: DosyaTanimi, s: PlatformModelSenaryosu, d: SqlDegerleri): Promise<void> {
  const tetik = tanim.tetikleyici;
  if (!tetik?.secici) throw new Error(`${adimBasligi}: indirmeyi başlatan düğme modelde yok (dosyaKontrolu.tetikleyici).`);
  const sureMs = (tanim.zamanAsimiSn ?? adimSuresiSn()) * 1000;
  const dugme = page.locator(tetik.secici).filter({ visible: true }).first();
  const indirme = page.waitForEvent('download', { timeout: sureMs }).catch(() => null);
  try {
    await dugme.click({ timeout: sureMs });
  } catch {
    throw new Error(beklenenGorulenMetni(adimBasligi, `"${tetik.aciklama ?? tetik.secici}" düğmesine basılır`, `${Math.round(sureMs / 1000)} sn içinde tıklanamadı (görünmüyor ya da üstünü başka bir öğe kapatıyor)`));
  }
  const indirilen = await indirme;
  if (!indirilen) throw new Error(beklenenGorulenMetni(adimBasligi, 'dosya indirilir', `${Math.round(sureMs / 1000)} sn içinde indirme başlamadı`));
  const ad = indirilen.suggestedFilename();
  const kok = process.env[DOSYA_KLASORU_DEGISKENI];
  const klasor = mkdtempSync(join(kok && existsSync(kok) ? kok : tmpdir(), 'indirilen-'));
  let veri: Buffer;
  try {
    const yol = join(klasor, 'dosya');
    await indirilen.saveAs(yol);
    veri = readFileSync(yol);
  } catch (e) {
    throw new Error(beklenenGorulenMetni(adimBasligi, 'dosya indirilir', `indirme tamamlanmadı (${indirilen.url().startsWith('blob:') ? 'sayfa içi dosya' : 'ağ'}: ${(await indirilen.failure().catch(() => null)) ?? (e as Error).message})`));
  } finally {
    rmSync(klasor, { recursive: true, force: true });
    await indirilen.delete().catch(() => undefined);
  }
  const gizliler = [...d.gizliler, ...(s.tabloGizliDegerleri ?? [])];
  const coz = (ifade: string): string | undefined => {
    if (ifade.startsWith('akis:')) return d.degerler[ifade.slice(5).trim()];
    if (s.dosyaBasvurulari && Object.prototype.hasOwnProperty.call(s.dosyaBasvurulari, ifade)) return s.dosyaBasvurulari[ifade];
    const v = s.veri[ifade];
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined;
  };
  const r = dosyayiDogrula({ ad, veri }, tanim, { coz, gizliler });
  await testInfo.attach(`Dosya doğrulama - ${adimBasligi}`, { contentType: 'application/json', body: JSON.stringify(r, null, 2) });
  const sakla = indirilenDosyaAyari();
  if (sakla === 'her' || (sakla === 'yalnizHata' && !r.gecti)) {
    await testInfo.attach(`İndirilen dosya - ${r.dosya.ad}`, { contentType: DOSYA_ICERIK_TURLERI[r.dosya.bicim] ?? 'application/octet-stream', body: veri });
  }
  veri.fill(0);
  if (!r.gecti) throw new Error(kalanlarMetni(adimBasligi, r));
}

/** Rapora eklenen dosyanın içerik türü (ekin görüntülenmesi için; görüntü / video / iz türü değildir). */
const DOSYA_ICERIK_TURLERI: Record<string, string> = {
  csv: 'text/csv', metin: 'text/plain', pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

// ---- Kurtarma kuralları (Ayarlar > Proje ve ortamlar; scripts/platform/ayarlar/kurtarma-kurallari.mjs) ----
// Adım başarısız olunca senaryonun ekranını kapsayan kurallara sırayla bakılır; koşulu tutan ilk kural eylemini yapar, sonra adımı
// tekrar dener / yalnız sonucu yeniden denetler (devam) / senaryoyu baştan başlatır. Sayfayı yenileme, adımı tekrar deneme ve baştan
// başlatma YALNIZ "tekrar denenebilir" işaretli adımda (kosu.tekrarDenenebilir; baştan başlatmada tamamlanan bütün adımlar da)
// yapılır; işaretsiz adımda kural çalışmaz ve not "kayıt oluşturan adım tekrar denenmedi" olur. Notlar "kurtarma" ekiyle rapora gider.

/** Senaryoyu baştan başlatma isteği (adımın içinden en dış döngüye taşınır). */
class BastanBaslat extends Error {
  kural: EkranKurali;
  neden: string;
  eylemMetni: string;
  asil: unknown;
  constructor(kural: EkranKurali, neden: string, eylemMetni: string, asil: unknown) {
    super('Kurtarma kuralı senaryoyu baştan başlatıyor.');
    this.name = 'BastanBaslat';
    this.kural = kural;
    this.neden = neden;
    this.eylemMetni = eylemMetni;
    this.asil = asil;
  }
}

/** Kuralın koşulunun kısa metni (notta). */
function kurtarmaKosulMetni(k: EkranKurali): string {
  const c = k.kosul;
  if (c.tur === 'metin') return `metin "${c.metin}"`;
  if (c.tur === 'girisSayfasi') return 'giriş sayfasına düştü';
  if (c.tur === 'pencere') return c.metin ? `pencere "${c.metin}"` : 'pencere açıldı';
  return 'secici' in c ? `öğe ${c.secici}` : `öğe ${c.rol}${c.ad ? ` "${c.ad}"` : ''}`;
}

/** Ekran giriş sayfasında mı: adres giriş adresinin yolu ya da kullanıcı adı + parola alanları görünüyor. */
async function girisSayfasindaMi(page: Page, tarif: GirisTarifi | null): Promise<boolean> {
  if (!tarif) return false;
  try {
    const simdiki = new URL(page.url());
    const giris = new URL(tarif.girisAdresi, simdiki);
    if (giris.origin === simdiki.origin && giris.pathname.replace(/\/+$/, '') === simdiki.pathname.replace(/\/+$/, '')) return true;
  } catch { /* adres okunamadı: alanlara bakılır */ }
  const gorunur = async (s: string): Promise<boolean> => Boolean(s) && (await page.locator(s).filter({ visible: true }).count().catch(() => 0)) > 0;
  return (await gorunur(tarif.kullaniciAlani)) && (await gorunur(tarif.parolaAlani));
}

/** Kuralın koşulu şu an sayfada tutuyor mu. */
async function kurtarmaKosuluTutar(page: Page, k: EkranKurali, tarif: GirisTarifi | null): Promise<boolean> {
  const c = k.kosul;
  if (c.tur === 'metin') return mesajIceriyorMu(await sayfaMetni(page), c.metin);
  if (c.tur === 'girisSayfasi') return girisSayfasindaMi(page, tarif);
  if (c.tur === 'pencere') {
    // Tarayıcı penceresi (alert / confirm) ya da sayfadaki görünür pencere (dialog / alertdialog).
    const tarayici = tarayiciUyarilari.get(page) ?? [];
    if (tarayici.some((m) => !c.metin || mesajIceriyorMu(m, c.metin))) return true;
    const pencereler = page.locator('[role="dialog"], [role="alertdialog"], dialog[open]').filter({ visible: true });
    const metinler = await Promise.all((await pencereler.all().catch(() => [])).map((x) => x.innerText().catch(() => '')));
    return metinler.some((m) => !c.metin || mesajIceriyorMu(m, c.metin));
  }
  const l = 'secici' in c ? page.locator(c.secici) : page.getByRole(c.rol as Parameters<Page['getByRole']>[0], c.ad ? { name: c.ad } : {});
  return (await l.filter({ visible: true }).count().catch(() => 0)) > 0;
}

export type ModelKosuOrtami = {
  veri: PlatformModelVerisi;
  tarif: () => GirisTarifi;
  /** profil: giriş profilinin ADI (senaryonun giriş seçimi / "Yeniden giriş" adımı); verilmezse ortamın varsayılan profili. */
  kimlik: (profil?: string | null) => GirisKimligi;
  oturumDosyasi: () => string;
  /** Göreli tarihlerin ("bugün+7") hesaplandığı an (verilmezse koşunun anı; testler sabitler). */
  simdi?: () => Date;
};

/**
 * Koşuda yakalanan mesajlar (mesaj-yakalayici.ts): kullanıcının beklediği mesajlar (senaryonun beklenen hata mesajları ve
 * başarı göstergelerinin metinleri) "beklenen" işaretlenir; bilinen gizli değerler (giriş kimliği, adı gizli sayılan senaryo
 * alanlarının değerleri) maskelenir. Kimlik yalnızca zaten okunabiliyorsa kullanılır (yoksa hata vermez).
 */
function kosuMesajlariniHazirla(page: Page, plan: ModelKosuPlani, ortam: ModelKosuOrtami | null): void {
  const y = mesajYakalayicisiKur(page);
  if (plan.beklenen.tur === 'hata') y.beklenenEkle(plan.beklenen.mesaj, ...plan.beklenen.mesajlar);
  for (const a of plan.adimlar) {
    if (!a.dahil || !a.kosu) continue;
    for (const g of basariSecenekleri(a.kosu)) if (g.tur === 'metin') y.beklenenEkle(g.deger);
    for (const alan of a.alanlar) if (gizliAdMi(alan.etiket) || gizliAdMi(alan.anahtar)) y.gizliDegerEkle(alan.deger);
  }
  if (ortam) {
    try {
      const k = ortam.kimlik();
      y.gizliDegerEkle(k.kullaniciAdi, k.parola, k.totpGizli, k.sabitKod, ...(k.gizliEkAlanlar ?? []).map((ad) => k.ekAlanlar?.[ad]));
    } catch { /* kimlik tanımlı değil: giriş adımı kendi hatasını verir */ }
  }
}

/** Yakalanan mesajların adım adı. */
function adimAdiniBildir(page: Page, ad: string): void {
  const y = mesajYakalayicisi(page);
  if (y) y.adim = ad;
}

/** Parola tipindeki alanın değeri yakalanan mesajlarda maskelenir. */
async function parolaAlaniysaGizle(page: Page, alan: PlanAlani, l: Locator): Promise<void> {
  const y = mesajYakalayicisi(page);
  if (y && (await l.getAttribute('type', { timeout: 1_000 }).catch(() => null)) === 'password') y.gizliDegerEkle(alan.deger);
}

/**
 * Model senaryosunu koşturur. Atlanan alanlar "atlananAlanlar" annotation'ı olarak eklenir (raporlayıcı
 * sonuç satırına yazar); yasaklı host'a istek denenmişse test başarısız olur.
 */
export async function modelSenaryosunuKos(page: Page, testInfo: TestInfo, kayitliSenaryo: PlatformModelSenaryosu, ortam: ModelKosuOrtami): Promise<void> {
  // Eski kayıtlı modellerdeki iç içe metinli düğme seçicileri (`tag:text-is("…")`) çalışırken düzeltilir (bkz. secici-duzelt.mjs).
  const s: PlatformModelSenaryosu = { ...kayitliSenaryo, model: seciciAgaciniDuzelt(kayitliSenaryo.model), altModeller: seciciAgaciniDuzelt(kayitliSenaryo.altModeller) };
  if (!s.model) throw new Error(`"${s.baslik}": "${s.ekran.ad || s.ekran.id}" ekranının modeli yok; model koşucusu çalışamaz.`);
  // ${Tablo.Sütun} başvurusu çözülemediyse (ör. tabloda bu ortamda satır yok) tarayıcı açılmadan açık hatayla durulur.
  if (s.veriHatalari?.length) throw new Error(veriHatalariMetni(s.baslik, s.veriHatalari));
  const tabloGizlileri = s.tabloGizliDegerleri ?? [];
  const plan = modelKosuPlani(s.model, s.veri, {
    altModeller: s.altModeller, mutlakaGorunmeli: s.mutlakaGorunmeli, kimlikProfilleri: ortam.veri.kimlikProfilleri ?? {}, ...(ortam.simdi ? { simdi: ortam.simdi() } : {})
  });
  // Tek cümlelik gerekçe (arayüzün "Neden çalışmıyor?" metniyle aynı; senaryolar/hazirlik.mjs).
  if (plan.hatalar.length) throw new Error(planHatasiMetni(s.baslik, plan.hatalar));
  testInfo.annotations.push({ type: 'urun', description: s.ekran.ad || 'Diğer' });

  // Model "giriş gerekmez" diyorsa (ekran girişsiz açılır; akış kaydı/tarama "Giriş yapmadan aç") ya da senaryonun giriş
  // seçimi "Girişsiz" ise giriş ve bağlam değiştirme adımları atlanır; tarif istenmez. "Temiz oturum" ya da varsayılan dışı
  // bir giriş profili: kayıtlı oturum kullanılmaz (çerezler temizlenip o profille girilir). Bkz. senaryo-girisi.mjs.
  const giris = etkinSenaryoGirisi(s.giris ?? null, s.model);
  const girissiz = giris.kip === 'girissiz';
  const temizGiris = giris.kip === 'temiz' || giris.profil !== null;
  // 1) Yasaklı adres koruması: ortamın taban adresi + tarifteki/modeldeki tam adresler (tarayıcı henüz hiçbir
  //    yere gitmedi), sonra yasaklı host'a her isteği iptal eden yakalayıcı. Taban ve ekran adresi tariften ÖNCE denetlenir:
  //    tarif tanımlı olmasa da yasaklı ortamda yasaklı adres hatası verilir.
  for (const adres of denetlenecekAdresler(ortam.veri.tabanUrl, null, plan.ekranUrl)) {
    const kalip = adresYasakliMi(adres, yasakDesenleri(process.env[YASAK_ADRES_DEGISKENI]));
    if (kalip) throw new Error(yasakliAdresMesaji(adres, kalip));
  }
  const tarif = girissiz ? null : ortam.tarif();
  const engellenen = await yasakliAdresKorumasi(page, denetlenecekAdresler(ortam.veri.tabanUrl, tarif, plan.ekranUrl));
  tarayiciUyarilariniDinle(page);
  agIzle(page);
  kosuMesajlariniHazirla(page, plan, tarif ? ortam : null);
  // Seçilen / yeniden girişte kullanılacak diğer giriş profillerinin gizli değerleri de yakalanan mesajlarda maskelenir.
  const yakalayici = mesajYakalayicisi(page);
  // Gizli tablo sütunlarından gelen değerler de maskelenir.
  if (tabloGizlileri.length) yakalayici?.gizliDegerEkle(...tabloGizlileri);
  for (const profil of new Set([giris.profil, ...plan.adimlar.map((a) => a.yenidenGiris?.profil ?? null)])) {
    if (!profil || !yakalayici) continue;
    try {
      const k = ortam.kimlik(profil);
      yakalayici.gizliDegerEkle(k.kullaniciAdi, k.parola, k.totpGizli, k.sabitKod, ...(k.gizliEkAlanlar ?? []).map((ad) => k.ekAlanlar?.[ad]));
    } catch { /* profil yok: giriş adımı kendi hatasını verir */ }
  }

  const atlanan: AtlananAlan[] = [];
  /** Çalışan kurtarma kurallarının notları ("kurtarma" eki; raporlayıcı sonuca yazar). */
  const kurtarmaOlaylari: KurtarmaOlayi[] = [];
  let sira = 1;
  // Adım ekran görüntüleri (Ayarlar > Koşu > Kayıt; senaryo ezebilir): her adımda (varsayılan, bugünkü davranış) · yalnız kalan
  // adımda (başarılı adımda alınmaz; başarısız adımın görüntüsü aşağıdaki catch'te) · seçili adımlarda (modelde kosu.ekranGoruntusu
  // işaretli akış adımı; giriş / bağlam / ekran açılışı alınmaz) · kapalı.
  const adimGoruntusu = adimGoruntusuAyari(s.adimGoruntusu ?? null);
  /** Şu an koşan adımın başlığı (başarısız adımın görüntüsü için). */
  let simdikiAdim: string | null = null;
  const ekranGoruntusu = async (ad: string, adim?: PlanAdimi): Promise<void> => {
    if (!adimGoruntusuAlinsinMi(adimGoruntusu, { isaretli: adim?.kosu?.ekranGoruntusu === true })) return;
    await attachStepScreenshot(page, testInfo, `${String(sira++).padStart(2, '0')} - ${ad}`);
  };
  /** Bağlam değiştirme (tarifte varsa; senaryonun bağlam profiliyle) — ilk girişten ve yeniden girişten sonra. */
  const baglamiUygula = async (t: GirisTarifi): Promise<void> => {
    if (!t.baglamDegistirme) return;
    const tur = t.baglamDegistirme.baglamTuru;
    const profil = plan.baglamProfili;
    await test.step(`Bağlam değiştirilir (${profil ?? '—'})`, async () => {
      simdikiAdim = `Bağlam değiştirilir (${profil ?? '—'})`;
      adimAdiniBildir(page, `Bağlam değiştirilir (${profil ?? '—'})`);
      if (!profil) throw new Error(`Giriş tarifi "${tur}" bağlamını değiştiriyor ama senaryonun bağlam profili yok (modelde profil havuzlu alan ya da varsayılanı yok).`);
      const degerler = ortam.veri.baglamProfilleri[tur]?.[profil];
      if (!degerler) throw new Error(`"${profil}" ${tur} bağlam profili bu ortamda tanımlı değil (Ayarlar > Bağlam profilleri).`);
      await baglamiDegistir(page, t, degerler);
      await ekranGoruntusu(`Bağlam değiştirildi (${profil})`);
    });
  };
  const profilEki = (profil: string | null): string => (profil ? ` (${profil})` : '');
  try {
    // Senaryo "Girişsiz" seçtiyse kayıtlı oturumun çerezleri de kullanılmaz (sayfa gerçekten girişsiz açılır).
    if (girissiz && s.giris?.kip === 'girissiz' && s.model.girisGerekmez !== true) await oturumuKapat(page);
    // Adım başlığı SABİT (akis-diyagrami.mjs > BASLANGIC_ADIMLARI ile eşleşir); profil / temiz oturum ekran görüntüsünün adında.
    if (tarif) await test.step('Sisteme giriş yapılır', async () => {
      simdikiAdim = 'Sisteme giriş yapılır';
      adimAdiniBildir(page, 'Sisteme giriş yapılır');
      if (temizGiris) {
        // Kayıtlı oturum kullanılmaz: çerezler temizlenir, seçilen (ya da varsayılan) profille girilir. Varsayılan dışı profilin
        // oturumu paylaşılan oturum dosyasına YAZILMAZ (diğer senaryolar varsayılan profille devam eder).
        await oturumuKapat(page);
        await girisYap(page, tarif, ortam.kimlik(giris.profil), { izinliKokenler: girisKokenleri(ortam.veri.tabanUrl, tarif) });
        // Oturum dosyası kasa anahtarından türetilen anahtarla ŞİFRELİ yazılır (oturum-kasasi.ts; düz metin çerez diske yazılmaz).
        if (giris.profil === null) await oturumuSifreliYaz(page.context(), ortam.oturumDosyasi());
      } else if (!(await oturumGecerliMi(page, tarif))) {
        // Eşzamanlı ekran koşusunda (her senaryo ayrı süreç) giriş süreçler arası kilitle yapılır: kilidi alan süreç önce başka
        // bir sürecin bu arada yazdığı oturumu dener; geçerliyse aynı kullanıcıyla ikinci kez giriş yapılmaz (oturum düşmez).
        await oturumKilidiyle(ortam.oturumDosyasi(), async () => {
          if (await yeniOturumuYukle(page.context(), ortam.oturumDosyasi()) && await oturumGecerliMi(page, tarif)) return;
          await girisYap(page, tarif, ortam.kimlik(), { izinliKokenler: girisKokenleri(ortam.veri.tabanUrl, tarif) });
          await oturumuSifreliYaz(page.context(), ortam.oturumDosyasi());
        });
      }
      await ekranGoruntusu(`Sisteme giriş yapıldı${temizGiris ? ' (temiz oturum)' : ''}${profilEki(giris.profil)}`);
    });

    if (tarif) await baglamiUygula(tarif);

    // Akışın başındaki ortak akış blokları (plan: ekranAcilmadan; ör. ana sayfada kullanıcı değiştirme) girişten sonra açılan
    // sayfada — girişsiz senaryoda ortamın taban adresinde — EKRAN AÇILMADAN önce koşar; bitince "Ekran açılır", sonra ekran
    // adımları. Model "bastakiOrtakAkislar": "sonra" ise işaret yoktur: ekran önce açılır (eski davranış).
    const bastakiler = plan.adimlar.filter((a) => a.ekranAcilmadan === true);
    const ekranAdimlari = plan.adimlar.filter((a) => a.ekranAcilmadan !== true);
    /** Son koşan adım "Ekrana dön" ile bitti mi (baştaki blok böyle bitince ekran ikinci kez açılmaz; o dönüş ekranı açmıştır). */
    let ekranaDonuldu = false;

    const sqlDegerleri: SqlDegerleri = { degerler: {}, gizliler: [] };
    /** Adımın gövdesi (kurtarma kuralı adımı tekrar denerken yeniden çağrılır). */
    const adimGovdesi = async (adim: PlanAdimi): Promise<void> => {
        ekranaDonuldu = false;
        // SQL sorgusu adımı: sayfaya dokunmaz; sorgu beklenenle karşılaştırılır.
        if (adim.sql) { await sqlAdiminiUygula(testInfo, adim.baslik, adim.sql, s, ortam, sqlDegerleri); return; }
        // İndirilen dosyayı doğrulama adımı: düğmeye basılır, indirilen dosya beklentilerle doğrulanır.
        if (adim.dosya) {
          adimMesajlariniTemizle(page);
          await dosyaAdiminiUygula(page, testInfo, adim.baslik, adim.dosya, s, sqlDegerleri);
          await ekranGoruntusu(adim.baslik);
          return;
        }
        // Yeniden giriş: oturum kapatılır (çerezler/depolama temizlenir), ortamın tarifiyle (seçilen profille) yeniden girilir,
        // bağlam yeniden değiştirilir ve akış kaldığı sayfadan sürer. Paylaşılan oturum dosyasına yazılmaz.
        if (adim.yenidenGiris) {
          const t = tarif ?? ortam.tarif();
          const donus = page.url();
          await oturumuKapat(page);
          await girisYap(page, t, ortam.kimlik(adim.yenidenGiris.profil), { izinliKokenler: girisKokenleri(ortam.veri.tabanUrl, t) });
          await ekranGoruntusu(`${adim.baslik}: yeniden giriş yapıldı${profilEki(adim.yenidenGiris.profil)}`, adim);
          await baglamiUygula(t);
          if (/^https?:/i.test(donus)) await sayfayiAc(page, donus);
          return;
        }
        adimMesajlariniTemizle(page);
        const sureSn = adim.kosu?.zamanAsimiSn ?? adimSuresiSn();
        const gorunmeyenKaldirir = gorunmeyenAlanDavranisi() === 'kaldir';
        const doldurulanMetinler: Array<{ alan: PlanAlani; l: Locator; k: Kapsam }> = [];
        const doldurulanSecimler: Array<{ alan: PlanAlani; l: Locator; k: Kapsam }> = [];
        for (const alan of adim.alanlar) {
          if (alan.atla) {
            if (alan.mutlakaGorunmeli) throw new Error(beklenenGorulenMetni(adim.baslik, `${alan.etiket} alanı doldurulur (mutlaka görünmeli)`, alan.atla));
            atlanan.push({ alan: alan.etiket, neden: alan.atla });
            continue;
          }
          // "Zorla" doldurucular gizli (özel çizimli) girdilere yazar: görünürlük yerine sayfada varlığı yeter. Özel açılır listenin
          // (ozelSecim) gerçek <select>'i de gizlidir. Alan bir çerçevedeyse (konum.cerceve) o çerçevede aranır.
          const zorla = alan.doldurucu === 'radyoZorla' || alan.doldurucu === 'onayKutusuZorla' || alan.doldurucu === 'degerJs' || alan.doldurucu === 'ozelSecim';
          const k = kapsam(page, alan.cerceve);
          const l = zorla ? await sayfadakiOge(k, alan.secici as string)
            : alan.tip === 'radyo' ? await gorunurRadyo(k, alan.secici as string) : await gorunurOge(k, alan.secici as string);
          if (!l) {
            // Boş bırakılan (yalnız tuşa basılacak) alan görünmüyorsa sessizce geçilir (mutlaka görünmeli değilse).
            if (alan.yalnizTus && !alan.mutlakaGorunmeli) continue;
            const profil = plan.baglamProfili ? ` (bağlam profili: ${plan.baglamProfili})` : '';
            // "Mutlaka görünmeli" alan ya da Ayarlar > Koşu > Gelişmiş > Alan görünmezse = "Testi kaldır": test kalır.
            if (alan.mutlakaGorunmeli || gorunmeyenKaldirir) {
              throw new Error(beklenenGorulenMetni(adim.baslik, `${alan.etiket} alanı ekranda görünür${alan.mutlakaGorunmeli ? ' (mutlaka görünmeli)' : ''}`, `${alan.etiket} alanı ekranda görünmüyor${profil}`));
            }
            atlanan.push({ alan: alan.etiket, neden: `ekranda görünmüyor${profil}` });
            continue;
          }
          if (alan.yalnizGorunurluk) continue;
          // Bağlı liste, seçenekleri gelirken kısa süre kapalı (disabled) kalabilir: öğrenilen yüklenme beklemesi içinde etkinleşmesi beklenir.
          if (alan.ustId && (await l.isDisabled().catch(() => false))) {
            for (const bitis = Date.now() + listeBeklemesi(alan).sinirMs; Date.now() < bitis && (await l.isDisabled().catch(() => false));) await new Promise((c) => setTimeout(c, 250));
          }
          // Kapalı (disabled) alan doldurulamaz: görünmeyen alan gibi atlanır (mutlaka görünmeli ise hata).
          if (await l.isDisabled().catch(() => false)) {
            if (alan.mutlakaGorunmeli) throw new Error(beklenenGorulenMetni(adim.baslik, `${alan.etiket} alanı doldurulur (mutlaka görünmeli)`, `${alan.etiket} alanı kapalı (disabled)`));
            atlanan.push({ alan: alan.etiket, neden: 'kapalı (disabled)' });
            continue;
          }
          // Boş bırakılan alan (senaryo bu adımda iş kuralı uyarısı bekliyor): doldurulmaz; alana girilip "Doldurduktan sonra"
          // tuşuna basılır — alan boşken çıkınca çıkan uyarı (ör. "zorunludur") adımın sonucunda denetlenir.
          if (alan.yalnizTus) {
            if (zorla) continue;
            await l.focus();
            await l.press(alan.yalnizTus);
            continue;
          }
          const baslangic = Date.now();
          await parolaAlaniysaGizle(page, alan, l);
          // Bu alana bağlı alt listeler (modelde olağan dolma süresi olanlar): doldurmadan önceki seçenek imzaları; doldurur doldurmaz
          // dolma süreleri ölçülür (koşucunun ekran görüntüsü / arka plan beklemesi ölçüme karışmaz).
          const altlar = adim.alanlar.filter((c) => c.ustId === alan.id && c.yuklenmeMs);
          const onceki = new Map<string, string>();
          for (const c of altlar) if (c.secici) onceki.set(c.id, await k.locator(c.secici).first().evaluate((e) => (e instanceof HTMLSelectElement ? [...e.options].map((o) => o.value).join('|') : '')).catch(() => ''));
          await alaniDoldur(page, alan, l, adim.baslik, k);
          if (altlar.length) await bagliListeyiOlc(alan, altlar, k, onceki);
          await alanSonrasi(page, alan, l, adim.baslik, adim.kosu ?? null, k);
          await arkaPlanIstekleriniBekle(page, baslangic);
          if (!zorla && !['secim', 'okluSecim', 'radyo', 'onayKutusu', 'dosya'].includes(alan.tip)) doldurulanMetinler.push({ alan, l, k });
          if (alan.tip === 'secim') doldurulanSecimler.push({ alan, l, k });
        }
        // Sonraki bir alanın sorgusu / yeniden çizimi açılır listeyi ilk seçeneğine ("SEÇİNİZ") döndürmüş olabilir: değeri artık
        // seçilen değer olmayan listeler bir kez yeniden seçilir (metin alanlarındaki yeniden doldurmanın açılır liste karşılığı).
        for (const d of doldurulanSecimler) {
          const s = secenekBul(d.alan.secenekler, d.alan.deger);
          const simdi = await d.l.evaluate((e) => (e instanceof HTMLSelectElement ? { deger: e.value, metin: (e.selectedOptions[0]?.text ?? '').trim() } : null)).catch(() => null);
          if (!simdi || simdi.deger === s.deger || simdi.metin === s.metin) continue;
          const yenidenBaslangic = Date.now();
          await alaniDoldur(page, d.alan, d.l, adim.baslik, d.k);
          await arkaPlanIstekleriniBekle(page, yenidenBaslangic);
        }
        // Sonraki alanların sorgusu / sayfanın yeniden çizmesi önceki alanı silmiş olabilir (ör. satır yenilenir): boş kalan metin
        // alanları bir kez yeniden doldurulur (kullanıcının elle yazdığında olduğu gibi).
        for (const d of doldurulanMetinler) {
          const bos = !(await d.l.inputValue({ timeout: 1_000 }).catch(() => 'x')).trim();
          if (!bos || !String(d.alan.deger ?? '').trim()) continue;
          // "Yaz + Enter" alanı (etiket / beceri girdisi): Enter değeri ekleyip alanı boşaltır; boş kalması beklenir.
          if (d.alan.parametreler.tus === 'Enter') continue;
          const yenidenBaslangic = Date.now();
          await alaniDoldur(page, d.alan, d.l, adim.baslik, d.k);
          await arkaPlanIstekleriniBekle(page, yenidenBaslangic);
        }
        ekranaDonuldu = await aksiyonlariUygula(page, adim.kosu, sureSn, plan.ekranUrl, atlanan);
        const gorulen = await adimSonucunuDogrula(page, adim, plan);
        // "veya" grubunda hangi başarı mesajının göründüğü ekran görüntüsünün adında yazar.
        await ekranGoruntusu(gorulen ? `${adim.baslik} (görülen: ${gorulen})` : adim.baslik, adim);
    };

    // Kurtarma kuralları: bu senaryonun ekranını kapsayanlar (açık ve bu ortamı kapsayanlar veri okuyucudan gelir).
    const kurallar = (ortam.veri.kurtarmaKurallari ?? []).filter((k) => ekranKapsamindaMi(k, s.ekran.id));
    const girisTarifi = (): GirisTarifi | null => { if (tarif) return tarif; try { return ortam.tarif(); } catch { return null; } };
    const olayEkle = (k: EkranKurali, adimBasligi: string, durum: KurtarmaOlayi['durum'], deneme: number, not: string): void => {
      kurtarmaOlaylari.push({ kuralId: k.id, kural: k.ad, adim: adimBasligi, durum, deneme, not });
    };
    /** Kuralın eylemi; notta görünen kısa metni döner. */
    const eylemiUygula = async (k: EkranKurali): Promise<string> => {
      const e = k.eylem;
      if (e.tur === 'yenile') { await page.reload({ waitUntil: 'domcontentloaded' }); return 'sayfa yenilendi'; }
      if (e.tur === 'bekle') { await page.waitForTimeout(e.sn * 1000); return `${e.sn} sn beklendi`; }
      if (e.tur === 'tikla') {
        const tiklandi = await page.locator(e.secici).filter({ visible: true }).first().click({ timeout: 10_000 }).then(() => true, () => false);
        return tiklandi ? `"${e.secici}" tıklandı` : `"${e.secici}" görünmedi (tıklanamadı)`;
      }
      if (e.tur === 'pencereKapat') {
        adimMesajlariniTemizle(page);
        if (e.secici) await page.locator(e.secici).filter({ visible: true }).first().click({ timeout: 10_000 }).catch(() => undefined);
        else await page.keyboard.press('Escape').catch(() => undefined);
        return 'pencere kapatıldı';
      }
      // Girişi yenile: oturum kapatılır, ortamın giriş tarifiyle (senaryonun giriş profiliyle) yeniden girilir, ekran yeniden açılır.
      const t = girisTarifi();
      if (!t) return 'giriş tarifi yok (giriş yenilenemedi)';
      await oturumuKapat(page);
      await girisYap(page, t, ortam.kimlik(giris.profil), { izinliKokenler: girisKokenleri(ortam.veri.tabanUrl, t) });
      await baglamiUygula(t);
      await sayfayiAc(page, plan.ekranUrl);
      return 'giriş yenilendi';
    };
    /** Başarıyla tamamlanan adımlar (baştan başlatmada hepsi yeniden koşar: hepsi tekrar denenebilir olmalı). */
    const tamamlanan: PlanAdimi[] = [];
    /**
     * Adımı kurtarma kurallarıyla koşar. Adım başarısızsa koşulu tutan ilk kural (tekrar denemede aynı kural) uygulanır; kural yoksa
     * ya da tutmazsa hata olduğu gibi iletilir.
     */
    const kurtarmayla = async (adim: PlanAdimi): Promise<void> => {
      if (!kurallar.length || adim.sql || adim.yenidenGiris) { await adimGovdesi(adim); return; }
      let surdur: { kural: EkranKurali; neden: string; deneme: number; eylemMetni: string } | null = null;
      for (;;) {
        try {
          await adimGovdesi(adim);
          if (surdur) olayEkle(surdur.kural, adim.baslik, 'kurtarildi', surdur.deneme, `kurtarıldı: ${surdur.neden} → ${surdur.eylemMetni} → ${surdur.deneme}. denemede başarılı`);
          return;
        } catch (hata) {
          if (hata instanceof BastanBaslat || testInfo.expectedStatus === 'skipped') throw hata;
          let tutan: EkranKurali | null = null;
          for (const k of surdur ? [surdur.kural] : kurallar) if (await kurtarmaKosuluTutar(page, k, girisTarifi())) { tutan = k; break; }
          if (!tutan) {
            if (surdur) olayEkle(surdur.kural, adim.baslik, 'kaldi', surdur.deneme, `kurtarma denendi, yine başarısız: ${surdur.neden} → ${surdur.deneme}. denemede başka bir nedenle başarısız`);
            throw hata;
          }
          const neden: string = surdur?.neden ?? kurtarmaKosulMetni(tutan);
          const deneme: number = surdur?.deneme ?? 1;
          // Çift kayıt koruması: yenileme, tekrar deneme ve baştan başlatma yalnız "tekrar denenebilir" işaretli adımda (baştan
          // başlatmada tamamlanan adımlar da işaretli olmalı).
          const tekrarli = !(GUVENLI_EKRAN_EYLEMLERI as readonly string[]).includes(tutan.eylem.tur) || tutan.sonra.tur !== 'devam';
          const isaretli = adim.kosu?.tekrarDenenebilir === true && (tutan.sonra.tur !== 'bastan' || tamamlanan.every((a) => a.kosu?.tekrarDenenebilir === true));
          if (tekrarli && !isaretli) {
            olayEkle(tutan, adim.baslik, 'tekrarlanmadi', deneme, `kayıt oluşturan adım tekrar denenmedi: ${neden} ("${adim.baslik}"${tutan.sonra.tur === 'bastan' ? ' ya da önceki bir adım' : ''} tekrar denenebilir işaretli değil; kural: ${tutan.ad})`);
            throw hata;
          }
          if (tutan.sonra.tur === 'tekrar' && deneme - 1 >= tutan.sonra.kez) {
            olayEkle(tutan, adim.baslik, 'kaldi', deneme, `kurtarma denendi, yine başarısız: ${neden} → ${tutan.sonra.kez} tekrar denemesinden sonra da başarısız`);
            throw hata;
          }
          const eylemMetni = await eylemiUygula(tutan);
          if (tutan.sonra.tur === 'devam') {
            // Devam: adım tekrarlanmaz; yalnız sonucu (başarı göstergesi) yeniden denetlenir.
            try {
              await adimSonucunuDogrula(page, adim, plan);
            } catch (e2) {
              olayEkle(tutan, adim.baslik, 'kaldi', deneme, `kurtarma denendi, yine başarısız: ${neden} → ${eylemMetni} → adım yine başarısız`);
              throw e2;
            }
            olayEkle(tutan, adim.baslik, 'kurtarildi', deneme, `kurtarıldı: ${neden} → ${eylemMetni} → devam edildi`);
            await ekranGoruntusu(`${adim.baslik} (kurtarıldı)`, adim);
            return;
          }
          if (tutan.sonra.tur === 'bastan') throw new BastanBaslat(tutan, neden, eylemMetni, hata);
          surdur = { kural: tutan, neden, deneme: deneme + 1, eylemMetni };
        }
      }
    };

    /** Canlı ortamda "yalnızca test ortamı" adımı atlandı: sonraki adımlar da atlanır (ekran öncesi ve sonrası birlikte). */
    let canlidaDurdu = false;
    /** Adımları sırayla koşar; son adıma (sonAdim) varıldıysa true (senaryo orada biter). */
    const adimlariKos = async (liste: PlanAdimi[]): Promise<boolean> => {
      tamamlanan.length = 0;
      for (const adim of liste) {
        if (!adim.dahil) continue;
        if ((adim.yalnizTest || canlidaDurdu) && ortam.veri.canli === true) {
          // Ortak akışın "yalnızca test ortamı" adımı (ör. ödeme): canlı ortamda koşulmaz; ondan sonraki adımlar da (ona
          // bağlıdır). Beklenen iş kuralı hatası bu adımlardaysa test doğrulanamaz: açıkça atlanır (yeşil sayılmaz).
          const beklenenSira = plan.beklenen.tur === 'hata' ? plan.adimlar.findIndex((x) => x.id === (plan.beklenen as { adim: string }).adim) : -1;
          if (beklenenSira >= plan.adimlar.indexOf(adim)) {
            test.skip(true, `Beklenen iş kuralı hatası “${adim.baslik}” ya da sonraki bir adımda; bu adım yalnızca test ortamında koşar (canlıda doğrulanamaz).`);
          }
          canlidaDurdu = true;
          await test.step(`${adim.baslik} (canlı ortam: atlandı)`, async () => undefined);
          continue;
        }
        try {
          await test.step(adim.baslik, async () => {
            simdikiAdim = adim.baslik;
            adimAdiniBildir(page, adim.baslik);
            await kurtarmayla(adim);
          });
        } finally {
          // Tıklama notları ("ilk tıklama etkisizdi, bir kez daha tıklandı") adım ayrıntısına ayrı satır olarak (adım başarısız olsa da).
          for (const n of [...tiklamaIzi(page).notlar.splice(0), ...yavaslamaNotlari.splice(0)]) await test.step(`${adim.baslik} — ${n}`, async () => undefined);
        }
        tamamlanan.push(adim);
        simdikiAdim = null;
        if (adim.sonAdim) return true;
      }
      return false;
    };

    // "Senaryoyu baştan başlat" (kurtarma kuralı): bölümün başlangıç sayfası yeniden açılır ve bölümün adımları baştan koşar —
    // senaryoda en çok bir kez. Bölümler: baştaki ortak akışlar (başlangıç sayfası: girişten sonra açılan sayfa) ve ekran adımları
    // (başlangıç sayfası: ekran). Ekran adımlarında baştan başlatma baştaki ortak akışları yeniden koşmaz (etkileri oturumda kalır).
    let bastan: BastanBaslat | null = null;
    const bolumuKos = async (liste: PlanAdimi[], yenidenAc: () => Promise<void>): Promise<boolean> => {
      const canliBaslangic = canlidaDurdu;
      let buBolumde = false;
      for (;;) {
        try {
          const bitti = await adimlariKos(liste);
          if (buBolumde && bastan) olayEkle(bastan.kural, 'Senaryo', 'kurtarildi', 2, `kurtarıldı: ${bastan.neden} → ${bastan.eylemMetni} → senaryo baştan başlatıldı, 2. denemede başarılı`);
          return bitti;
        } catch (hata) {
          if (!(hata instanceof BastanBaslat)) {
            if (buBolumde && bastan) olayEkle(bastan.kural, 'Senaryo', 'kaldi', 2, `kurtarma denendi, yine başarısız: ${bastan.neden} → senaryo baştan başlatıldı, yine başarısız`);
            throw hata;
          }
          if (bastan) {
            olayEkle(hata.kural, 'Senaryo', 'kaldi', 2, `kurtarma denendi, yine başarısız: ${hata.neden} → senaryo bir kez baştan başlatıldı, yine başarısız`);
            throw hata.asil;
          }
          bastan = hata;
          buBolumde = true;
          simdikiAdim = null;
          canlidaDurdu = canliBaslangic;
          await test.step('Senaryo baştan başlatılır (kurtarma kuralı)', yenidenAc);
        }
      }
    };

    // 1) Baştaki ortak akışlar: girişten sonra açılan sayfada (girişsiz senaryoda ortamın taban adresi açılır).
    let senaryoBitti = false;
    if (bastakiler.some((a) => a.dahil)) {
      if (!tarif) await sayfayiAc(page, ortam.veri.tabanUrl);
      const baslangicAdresi = page.url();
      senaryoBitti = await bolumuKos(bastakiler, async () => {
        if (/^https?:/i.test(baslangicAdresi)) await sayfayiAc(page, baslangicAdresi);
      });
    }

    if (!senaryoBitti) {
      // 2) Ekran açılır. Baştaki blok "Ekrana dön" ile bittiyse ekran zaten o dönüşle açıldı: ikinci kez istenmez.
      await test.step('Ekran açılır', async () => {
        simdikiAdim = 'Ekran açılır';
        adimAdiniBildir(page, 'Ekran açılır');
        if (!ekranaDonuldu) await sayfayiAc(page, plan.ekranUrl);
        await ekranGoruntusu(`Ekran açıldı (${s.ekran.ad || plan.ekranUrl})`);
      });
      simdikiAdim = null;

      // Göreli tarihler (senaryo / tablo / model değeri "bugün+7" …): raporda hem ifade hem bu koşuda yazılan tarih görünür.
      const goreliler = plan.adimlar.filter((a) => a.dahil).flatMap((a) => a.alanlar).filter((a) => a.goreliIfade && !a.atla && !gizliAdMi(a.etiket) && !gizliAdMi(a.anahtar))
        .map((a) => `${a.etiket}: ${a.goreliIfade} → ${String(a.deger)}`);
      if (goreliler.length) {
        testInfo.annotations.push({ type: 'goreliTarihler', description: goreliler.join(' · ') });
        await test.step(`Göreli tarihler — ${goreliler.join(' · ')}`, async () => undefined);
      }

      // 3) Ekran adımları (akışın ortasındaki ortak akışlar dahil; bugünkü gibi).
      await bolumuKos(ekranAdimlari, async () => {
        await sayfayiAc(page, plan.ekranUrl);
      });
    }
  } catch (hata) {
    // "Yalnız başarısız adımda": testin başarısız olduğu adımın görüntüsü (ad: "NN - <adım> (başarısız adım)"). Atlama (test.skip) başarısız adım değildir.
    // Alınamazsa not düşülür, hata olduğu gibi iletilir.
    if (adimGoruntusu === 'yalnizKalan' && simdikiAdim && testInfo.expectedStatus !== 'skipped') {
      await attachStepScreenshot(page, testInfo, `${String(sira++).padStart(2, '0')} - ${simdikiAdim}`, { kalanAdim: true }).catch(() => undefined);
    }
    // Hata metninde (ör. seçenek bulunamadı) gizli tablo sütunundan gelen değer görünmesin.
    if (hata instanceof Error && tabloGizlileri.length) {
      hata.message = gizliDegerleriMaskele(hata.message, tabloGizlileri);
      if (hata.stack) hata.stack = gizliDegerleriMaskele(hata.stack, tabloGizlileri);
    }
    throw hata;
  } finally {
    // Kurtarma kuralı adımı tekrar denediyse aynı alan bir kez yazılır.
    const tekilAtlanan = [...new Map(atlanan.map((a) => [`${a.alan}\u0000${a.neden}`, a])).values()];
    if (tekilAtlanan.length) testInfo.annotations.push({ type: 'atlananAlanlar', description: JSON.stringify(tekilAtlanan) });
    if (kurtarmaOlaylari.length) testInfo.annotations.push({ type: 'kurtarma', description: JSON.stringify(kurtarmaOlaylari) });
  }
  if (engellenen.length) throw new Error(`Yasaklı adrese istek engellendi: ${[...new Set(engellenen)].join(', ')}.`);
}

