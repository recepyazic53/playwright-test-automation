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
import { expect, test, type Locator, type Page, type Request, type TestInfo } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, isAbsolute } from 'node:path';
import { dosyayiDogrula, kalanlarMetni, type DosyaTanimi } from '../../scripts/platform/dosyalar/dosya-icerigi.mjs';
import { DOSYA_KLASORU_DEGISKENI } from '../../scripts/platform/dosyalar/gecici-dosyalar.mjs';
import { referansCoz } from '../../scripts/platform/dosyalar/referans.mjs';
import {
  YASAK_ADRES_DEGISKENI, YUKLEME_KLASORU_DEGISKENI, adresYasakliMi, gizliDegerleriMaskele, modelKosuPlani, secenekBul, veriHatalariMetni, yasakDesenleri, yasakliAdresMesaji,
  yuklemeDosyasiYolu, type ModelKosuPlani, type PlanAdimi, type PlanAlani, type PlanBasariGostergesi, type PlanKosuTanimi
} from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { girisKokenleri, type GirisTarifi } from '../../scripts/platform/giris/tarif.mjs';
import { beklenenGorulenMetni, beklenenMesajiBekle, mesajIceriyorMu, mesajiNormallestir } from './beklenen-sonuc';
import { baglamiDegistir, girisYap, oturumGecerliMi, oturumuKapat, type GirisKimligi } from './giris-motoru';
import { oturumuSifreliYaz } from './oturum-kasasi';
import { etkinSenaryoGirisi } from '../../scripts/platform/senaryolar/senaryo-girisi.mjs';
import type { PlatformModelSenaryosu, PlatformModelVerisi } from './platform-veri';
import { attachStepScreenshot } from './screenshots';
import { indirilenDosyaAyari, sayiAyari, secimAyari, sureAyari } from './kosu-ayarlari';
import { mesajYakalayicisi, mesajYakalayicisiKur } from './mesaj-yakalayici';
import { gizliAdMi } from '../../scripts/platform/ayarlar/gizli-adlar.mjs';
import { sqlAdiminiKos, type SqlTanimi } from '../../scripts/platform/sql/sql-adimi.mjs';
import { ayarlaSorgula, kosuSqlAyari } from '../../scripts/platform/sql/sorgu-bagdastirici.mjs';

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

/** Seçicinin ekranda GÖRÜNEN ilk öğesi (süre içinde görünmezse null). */
async function gorunurOge(page: Page, secici: string, sureMs = gorunurlukBeklemeMs()): Promise<Locator | null> {
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
    const dugme = page.locator(yon).filter({ visible: true }).first();
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
async function sayfadakiOge(page: Page, secici: string, sureMs = gorunurlukBeklemeMs()): Promise<Locator | null> {
  const l = page.locator(secici).first();
  try {
    await l.waitFor({ state: 'attached', timeout: sureMs });
    return l;
  } catch {
    return null;
  }
}

/** Öğe dolana kadar (metni ya da değeri boş değil) bekler. */
async function doluBekle(page: Page, secici: string, sureMs: number, adimBasligi: string, icermez?: string, kosu: PlanKosuTanimi | null = null): Promise<void> {
  const oge = page.locator(secici).first();
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
async function alanSonrasi(page: Page, alan: PlanAlani, l: Locator, adimBasligi: string, kosu: PlanKosuTanimi | null = null): Promise<void> {
  const p = alan.parametreler;
  if (typeof p.tus === 'string' && p.tus) await l.press(p.tus);
  // gizle: alan doldurulunca açık kalıp sonraki tıklamaları kapatan katman (ör. takvim) gizlenir.
  if (typeof p.gizle === 'string' && p.gizle) {
    await page.locator(p.gizle).evaluateAll((ogeler) => { for (const e of ogeler) (e as HTMLElement).style.display = 'none'; }).catch(() => undefined);
  }
  if (typeof p.tikla === 'string' && p.tikla) {
    const dugme = page.locator(p.tikla).filter({ visible: true }).first();
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
    if (k.durum === 'gorunur' || k.durum === 'gizli') await page.locator(k.secici).first().waitFor({ state: k.durum === 'gizli' ? 'hidden' : 'visible', timeout: sureMs });
    else await doluBekle(page, k.secici, sureMs, adimBasligi, typeof k.icermez === 'string' && k.icermez ? k.icermez : undefined, kosu);
  }
}

/**
 * "degerJs": değer betikle yazılır, input / change olayları tetiklenir — görünmeyen (gizli ya da özel çizimli) alanlar için
 * (sayfada olması yeter). Açılır listede seçenek önce değerle (value), sonra görünen metinle aranır.
 */
async function degerJsIleYaz(alan: PlanAlani, l: Locator, adimBasligi: string): Promise<void> {
  const s = alan.tip === 'secim' || alan.tip === 'okluSecim' ? secenekBul(alan.secenekler, alan.deger) : null;
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

async function alaniDoldur(page: Page, ham: PlanAlani, l: Locator, adimBasligi: string): Promise<void> {
  const alan = ham.parametreler.maske ? { ...ham, deger: maskeUygula(ham.parametreler.maske, ham.deger) } : ham;
  const deger = alan.deger;
  if (alan.doldurucu === 'degerJs') { await degerJsIleYaz(alan, l, adimBasligi); return; }
  switch (alan.tip) {
    case 'okluSecim':
      await okluSec(page, alan, l, secenekBul(alan.secenekler, deger).metin, adimBasligi);
      return;
    case 'secim': {
      const s = secenekBul(alan.secenekler, deger);
      const etiket = await l.evaluate((e) => e.tagName);
      if (etiket === 'SELECT') {
        // "Gerekirse seç": değer zaten seçiliyse dokunulmaz (yeniden seçmek sayfada bağımlı alanları sıfırlayabilir).
        if (alan.doldurucu === 'secimGerekirse' && (await l.inputValue()) === s.deger) return;
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
      if (alan.doldurucu === 'radyoZorla') { await zorlaIsaretle(hedef.first(), true, adimBasligi, alan); return; }
      await hedef.first().check();
      return;
    }
    case 'onayKutusu':
      if (alan.doldurucu === 'onayKutusuZorla') { await zorlaIsaretle(l, deger === true || deger === 'true', adimBasligi, alan); return; }
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
      if (alan.doldurucu === 'secimGerekirse' && (await l.inputValue().catch(() => null)) === metin) return;
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
    const l = page.locator(secici).filter({ visible: true });
    const n = await l.count().catch(() => 0);
    for (let i = 0; i < n; i++) metinler.push(await l.nth(i).innerText().catch(() => ''));
    mesajYakalayicisi(page)?.gostergeMetinleri(`hata:${secici}`, metinler);
  }
  metinler.push(...(tarayiciUyarilari.get(page) ?? []));
  return metinler.map((m) => m.trim()).filter(Boolean);
}

/**
 * Sayfanın tarayıcı uyarıları (alert / confirm / prompt): mesajı adım boyunca saklanır. alert kapatılır; confirm / prompt
 * Ayarlar > Koşu > Gelişmiş > Tarayıcı onay pencereleri kararına göre iptal edilir (varsayılan; Playwright'ın dinleyicisiz
 * davranışıyla aynı) ya da onaylanır (prompt varsayılan değeriyle). Hata göstergesi ve beklenen mesaj bunları da okur.
 */
const tarayiciUyarilari = new WeakMap<Page, string[]>();
export function tarayiciUyarilariniDinle(page: Page): void {
  if (tarayiciUyarilari.has(page)) return;
  const liste: string[] = [];
  tarayiciUyarilari.set(page, liste);
  page.on('dialog', (d) => {
    liste.push(d.message());
    mesajYakalayicisi(page)?.yakala('diyalog', d.message());
    const onayla = (d.type() === 'confirm' || d.type() === 'prompt') && onayPenceresiDavranisi() === 'onayla';
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
type AgIzi = { suren: Map<Request, number>; son: number };
const agIzleri = new WeakMap<Page, AgIzi>();
function agIzle(page: Page): void {
  if (agIzleri.has(page)) return;
  const iz: AgIzi = { suren: new Map(), son: 0 };
  agIzleri.set(page, iz);
  page.on('request', (r) => {
    if (r.resourceType() !== 'xhr' && r.resourceType() !== 'fetch') return;
    iz.suren.set(r, Date.now());
    iz.son = Date.now();
  });
  const bitti = (r: Request): void => { if (iz.suren.delete(r)) iz.son = Date.now(); };
  page.on('requestfinished', bitti);
  page.on('requestfailed', bitti);
}
/** baslangic'tan sonra başlayan arka plan istekleri bitene (ve kısa bir sessizlik olana) kadar bekler. */
async function arkaPlanIstekleriniBekle(page: Page, baslangic: number): Promise<void> {
  const iz = agIzleri.get(page);
  if (!iz) return;
  const bitis = Date.now() + alanSonrasiEnCokMs();
  for (;;) {
    const suren = [...iz.suren.values()].some((t) => t >= baslangic);
    const sessiz = Date.now() - Math.max(baslangic, iz.son) >= SESSIZLIK_MS;
    if ((!suren && sessiz) || Date.now() >= bitis) return;
    await page.waitForTimeout(50);
  }
}

/** Sayfa metni + adım boyunca çıkan tarayıcı uyarıları (öğesiz metin aramaları için). */
async function sayfaMetni(page: Page): Promise<string> {
  const govde = await page.locator('body').innerText().catch(() => '');
  return [govde, ...(tarayiciUyarilari.get(page) ?? [])].join('\n');
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
      const ogeler = await Promise.all((await page.locator(u.secici).filter({ visible: true }).all()).map((x) => x.innerText().catch(() => '')));
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
  if (g.tur === 'eleman') return (await page.locator(g.deger).filter({ visible: true }).count().catch(() => 0)) > 0;
  if (g.tur === 'desen') {
    const metin = g.secici
      ? (await Promise.all((await page.locator(g.secici).filter({ visible: true }).all()).map((x) => x.innerText().catch(() => '')))).join(' ')
      : await sayfaMetni(page);
    return new RegExp(g.deger).test(metin);
  }
  const metin = g.secici
    ? (await Promise.all((await page.locator(g.secici).filter({ visible: true }).all()).map((x) => x.innerText().catch(() => '')))).join(' ')
    : await sayfaMetni(page);
  return mesajIceriyorMu(metin, g.deger);
}

async function aksiyonlariUygula(page: Page, kosu: PlanKosuTanimi | null, sureSn: number): Promise<void> {
  for (const a of kosu?.aksiyonlar ?? []) {
    // Süreli bekleme (akış diyagramındaki "Bekleme süresi").
    if (a.tur === 'bekle' && a.sureSn && !a.secici) { await page.waitForTimeout(a.sureSn * 1000); continue; }
    if (!a.secici) continue;
    let l = page.locator(a.secici);
    if (a.metin) l = l.filter({ hasText: a.metin });
    const zaman = (a.zamanAsimiSn ?? sureSn) * 1000;
    if (a.tur === 'tikla') await l.filter({ visible: true }).first().click({ timeout: zaman });
    else if (a.durum === 'dolu') await doluBekle(page, a.secici, zaman, 'Aksiyon');
    else await l.first().waitFor({ state: a.durum === 'gizli' ? 'hidden' : 'visible', timeout: zaman });
  }
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
  const son = Date.now() + sureMs;
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
    if (Date.now() >= son) {
      throw new Error(beklenenGorulenMetni(adim.baslik, basariAciklamasi(kosu), `${Math.round(sureMs / 1000)} sn içinde başarı göstergesi görünmedi (sayfa: ${new URL(page.url()).pathname})`));
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
 * değeri. Özet (her beklenti: geçti / kaldı, Beklenen / Görülen; gizliler maskeli) her zaman rapora ek olarak yazılır; dosyanın kendisi
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

export type ModelKosuOrtami = {
  veri: PlatformModelVerisi;
  tarif: () => GirisTarifi;
  /** profil: giriş profilinin ADI (senaryonun giriş seçimi / "Yeniden giriş" adımı); verilmezse ortamın varsayılan profili. */
  kimlik: (profil?: string | null) => GirisKimligi;
  oturumDosyasi: () => string;
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
export async function modelSenaryosunuKos(page: Page, testInfo: TestInfo, s: PlatformModelSenaryosu, ortam: ModelKosuOrtami): Promise<void> {
  if (!s.model) throw new Error(`"${s.baslik}": "${s.ekran.ad || s.ekran.id}" ekranının modeli yok; model koşucusu çalışamaz.`);
  // ${Tablo.Sütun} başvurusu çözülemediyse (ör. tabloda bu ortamda satır yok) tarayıcı açılmadan açık hatayla durulur.
  if (s.veriHatalari?.length) throw new Error(veriHatalariMetni(s.baslik, s.veriHatalari));
  const tabloGizlileri = s.tabloGizliDegerleri ?? [];
  const plan =modelKosuPlani(s.model, s.veri, { altModeller: s.altModeller, mutlakaGorunmeli: s.mutlakaGorunmeli, kimlikProfilleri: ortam.veri.kimlikProfilleri ?? {} });
  if (plan.hatalar.length) throw new Error(`"${s.baslik}" model koşu planı kurulamadı: ${plan.hatalar.join(' ')}`);
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
  let sira = 1;
  const ekranGoruntusu = (ad: string): Promise<void> => attachStepScreenshot(page, testInfo, `${String(sira++).padStart(2, '0')} - ${ad}`);
  /** Bağlam değiştirme (tarifte varsa; senaryonun bağlam profiliyle) — ilk girişten ve yeniden girişten sonra. */
  const baglamiUygula = async (t: GirisTarifi): Promise<void> => {
    if (!t.baglamDegistirme) return;
    const tur = t.baglamDegistirme.baglamTuru;
    const profil = plan.baglamProfili;
    await test.step(`Bağlam değiştirilir (${profil ?? '—'})`, async () => {
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
      adimAdiniBildir(page, 'Sisteme giriş yapılır');
      if (temizGiris) {
        // Kayıtlı oturum kullanılmaz: çerezler temizlenir, seçilen (ya da varsayılan) profille girilir. Varsayılan dışı profilin
        // oturumu paylaşılan oturum dosyasına YAZILMAZ (diğer senaryolar varsayılan profille devam eder).
        await oturumuKapat(page);
        await girisYap(page, tarif, ortam.kimlik(giris.profil), { izinliKokenler: girisKokenleri(ortam.veri.tabanUrl, tarif) });
        // Oturum dosyası kasa anahtarından türetilen anahtarla ŞİFRELİ yazılır (oturum-kasasi.ts; düz metin çerez diske yazılmaz).
        if (giris.profil === null) await oturumuSifreliYaz(page.context(), ortam.oturumDosyasi());
      } else if (!(await oturumGecerliMi(page, tarif))) {
        await girisYap(page, tarif, ortam.kimlik(), { izinliKokenler: girisKokenleri(ortam.veri.tabanUrl, tarif) });
        await oturumuSifreliYaz(page.context(), ortam.oturumDosyasi());
      }
      await ekranGoruntusu(`Sisteme giriş yapıldı${temizGiris ? ' (temiz oturum)' : ''}${profilEki(giris.profil)}`);
    });

    if (tarif) await baglamiUygula(tarif);

    await test.step('Ekran açılır', async () => {
      adimAdiniBildir(page, 'Ekran açılır');
      await page.goto(plan.ekranUrl, { waitUntil: 'domcontentloaded' });
      await ekranGoruntusu(`Ekran açıldı (${s.ekran.ad || plan.ekranUrl})`);
    });

    let canlidaDurdu = false;
    const sqlDegerleri: SqlDegerleri = { degerler: {}, gizliler: [] };
    for (const adim of plan.adimlar) {
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
      await test.step(adim.baslik, async () => {
        adimAdiniBildir(page, adim.baslik);
        // SQL sorgusu adımı: sayfaya dokunmaz; sorgu beklenenle karşılaştırılır.
        if (adim.sql) { await sqlAdiminiUygula(testInfo, adim.baslik, adim.sql, s, ortam, sqlDegerleri); return; }
        // İndirilen dosyayı doğrulama adımı: düğmeye basılır, indirilen dosya beklentilerle doğrulanır.
        if (adim.dosya) {
          tarayiciUyarilari.get(page)?.splice(0);
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
          await ekranGoruntusu(`${adim.baslik}: yeniden giriş yapıldı${profilEki(adim.yenidenGiris.profil)}`);
          await baglamiUygula(t);
          if (/^https?:/i.test(donus)) await page.goto(donus, { waitUntil: 'domcontentloaded' });
          return;
        }
        tarayiciUyarilari.get(page)?.splice(0);
        const sureSn = adim.kosu?.zamanAsimiSn ?? adimSuresiSn();
        const gorunmeyenKaldirir = gorunmeyenAlanDavranisi() === 'kaldir';
        for (const alan of adim.alanlar) {
          if (alan.atla) {
            if (alan.mutlakaGorunmeli) throw new Error(beklenenGorulenMetni(adim.baslik, `${alan.etiket} alanı doldurulur (mutlaka görünmeli)`, alan.atla));
            atlanan.push({ alan: alan.etiket, neden: alan.atla });
            continue;
          }
          // "Zorla" doldurucular gizli (özel çizimli) girdilere yazar: görünürlük yerine sayfada varlığı yeter.
          const zorla = alan.doldurucu === 'radyoZorla' || alan.doldurucu === 'onayKutusuZorla' || alan.doldurucu === 'degerJs';
          const l = zorla ? await sayfadakiOge(page, alan.secici as string) : await gorunurOge(page, alan.secici as string);
          if (!l) {
            const profil = plan.baglamProfili ? ` (bağlam profili: ${plan.baglamProfili})` : '';
            // "Mutlaka görünmeli" alan ya da Ayarlar > Koşu > Gelişmiş > Alan görünmezse = "Testi kaldır": test kalır.
            if (alan.mutlakaGorunmeli || gorunmeyenKaldirir) {
              throw new Error(beklenenGorulenMetni(adim.baslik, `${alan.etiket} alanı ekranda görünür${alan.mutlakaGorunmeli ? ' (mutlaka görünmeli)' : ''}`, `${alan.etiket} alanı ekranda görünmüyor${profil}`));
            }
            atlanan.push({ alan: alan.etiket, neden: `ekranda görünmüyor${profil}` });
            continue;
          }
          if (alan.yalnizGorunurluk) continue;
          // Kapalı (disabled) alan doldurulamaz: görünmeyen alan gibi atlanır (mutlaka görünmeli ise hata).
          if (await l.isDisabled().catch(() => false)) {
            if (alan.mutlakaGorunmeli) throw new Error(beklenenGorulenMetni(adim.baslik, `${alan.etiket} alanı doldurulur (mutlaka görünmeli)`, `${alan.etiket} alanı kapalı (disabled)`));
            atlanan.push({ alan: alan.etiket, neden: 'kapalı (disabled)' });
            continue;
          }
          const baslangic = Date.now();
          await parolaAlaniysaGizle(page, alan, l);
          await alaniDoldur(page, alan, l, adim.baslik);
          await alanSonrasi(page, alan, l, adim.baslik, adim.kosu ?? null);
          await arkaPlanIstekleriniBekle(page, baslangic);
        }
        await aksiyonlariUygula(page, adim.kosu, sureSn);
        const gorulen = await adimSonucunuDogrula(page, adim, plan);
        // "veya" grubunda hangi başarı mesajının göründüğü ekran görüntüsünün adında yazar.
        await ekranGoruntusu(gorulen ? `${adim.baslik} (görülen: ${gorulen})` : adim.baslik);
      });
      if (adim.sonAdim) break;
    }
  } catch (hata) {
    // Hata metninde (ör. seçenek bulunamadı) gizli tablo sütunundan gelen değer görünmesin.
    if (hata instanceof Error && tabloGizlileri.length) {
      hata.message = gizliDegerleriMaskele(hata.message, tabloGizlileri);
      if (hata.stack) hata.stack = gizliDegerleriMaskele(hata.stack, tabloGizlileri);
    }
    throw hata;
  } finally {
    if (atlanan.length) testInfo.annotations.push({ type: 'atlananAlanlar', description: JSON.stringify(atlanan) });
  }
  if (engellenen.length) throw new Error(`Yasaklı adrese istek engellendi: ${[...new Set(engellenen)].join(', ')}.`);
}

