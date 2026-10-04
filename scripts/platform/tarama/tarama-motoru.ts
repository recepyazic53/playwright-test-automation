// OTOMATİK TARAMA MOTORU (genel) — tarama alt sürecinde (tarama.spec.ts) çalışır. Hiçbir proje adı/seçicisi yoktur:
// giriş ve bağlam adımları ortamın giriş tarifinden (giris-motoru.ts), hedef ve profiller iş girdisinden gelir.
//
// Akış: yasaklı adres denetimi (tarayıcı açılmadan) → giriş (tarif + giriş profili; CAPTCHA/kimlik/zaman aşımı açık
// hatalar) → her bağlam profili için: bağlam değiştirme (tarif adımları) → YENİ sekmede hedef sayfa (form gönderimi
// etkisiz) → sakinleşme → görünür alan envanteri → ekran görüntüsü → seçim keşfi (varsayılan açık; açılır listelerde, radyo
// gruplarında ve onay kutularında diğer seçenekler denenir; beliren/kaybolan/etkinleşen alanlar ve seçenekleri değişen bağımlı
// listeler kaydedilir, ilk değer geri yüklenir; kayıt / gönderim çağrıştıran seçimler denenmez — koruma.mjs > kesifGuvenligi).
// Envanterden sonra eylem adayları (gönderim düğmesi / başarı / hata / yönlendirme / bekleme) BASMADAN izlerden çıkarılır
// (eylem-kesfi-motoru.ts); profilin eylemAdaylari'na yazılır (öneri; modele girmez).
//
// Çerçeveler (iframe): aynı kökenli çerçevelerin alanları da okunur (sayfa-envanteri.ts; en çok 2 düzey, alanın "cerceve"si);
// başka kökenli çerçeveler notlara "okunamadı" diye yazılır. Gizli <select>'e bağlı özel açılır listeler alan olarak okunur.
//
// GÜVENLİK: düğme/bağlantıya TIKLANMAZ (sayfanın kendi betiğinin düğme tıklamaları da yutulur — dugmeTiklamaKorumasi), form
// GÖNDERİLMEZ, metin alanlarına YAZILMAZ, Enter'a basılmaz. Tarama aşamasında GET/HEAD
// dışındaki HER istek ağ katmanında iptal edilir ve kaydedilir (giriş ve bağlam değiştirme tarif güdümlüdür). Engel bağlam (context)
// düzeyindedir: çerçevelerin (iframe) istekleri de aynı kurala tabidir; form gönderim koruması (init betiği) çerçevelerde de çalışır.
// Yasaklı host'a giden her istek her aşamada iptal edilir. Oturum alt süreçte diske yazılmaz ("Koşunun saklanan oturumunu
// kullan" seçiliyse sunucu koşunun şifreli oturum dosyasını okur / günceller; bkz. tarama-girisi.ts).
import type { Browser, BrowserContext, FrameLocator, Page } from '@playwright/test';
import { GirisHatasi, baglamiDegistir } from '../../../tests/support/giris-motoru';
import { captchaAlgila } from '../giris/algilama.mjs';
import { agHatasiMi } from '../giris/tarif.mjs';
import { adresYasakliMi, yasakDesenleri } from '../senaryolar/model-kosusu.mjs';
import { KESIF_TURLERI, adresOzeti, istekKarari, kesifGuvenligi, taramaAdresleri, yasakliAdresBul, yasakliTaramaMesaji, type TaramaAsamasi } from './koruma.mjs';
import { type EngellenenIstek, type HamAlan, type HamSecenek, type Kesif, type KesifDegeri, type ProfilEnvanteri, type SayfaEnvanteri, type TaramaEnvanteri } from './paket-olusturucu.mjs';
import { taramaTarayiciAyarlari, type TaramaGirdisi, type TaramaGirisYontemi, type TaramaHataKodu, type TaramaOlayi } from './protokol.mjs';
import { girisYontemiMesaji, isteklerBitsin, oturumBaglamSecenegi, taramaGirisiYap, type OturumGonderici } from './tarama-girisi';
import { alanKilidi, dugmeTiklamaKorumasi, formGonderimKorumasi, sayfadakiAlanlar } from './sayfa-envanteri';
import { eylemAdaylariniCikar } from './eylem-kesfi-motoru';
import { zincirKesfet } from './zincir-motoru';
import type { ZincirSonucu } from './zincir-kesfi.mjs';

/**
 * Sayfa envanteri okuyucusunu her belgeye (çerçeveler dahil) veren init betiği: çerçevelerin içi kendi penceresinde okunur. Alanın
 * düzenlenebilirliği (alanKilidi; salt okuma) de aynı belgenin penceresinde.
 */
export const ENVANTER_BETIGI = `window.__nobetciAlanKilidi = ${alanKilidi.toString()}; window.__nobetciSayfadakiAlanlar = ${sayfadakiAlanlar.toString()};`;

/** Ekranın envanteri (aynı kökenli çerçeveler dahil). Init betiği yoksa (ör. betik yüklenmeden) doğrudan ana belgede okunur. */
export async function envanterOku(sayfa: Page, secenek: { degerOku?: boolean } = {}): Promise<SayfaEnvanteri> {
  const degerOku = secenek.degerOku === true;
  const hazir = await sayfa.evaluate(() => typeof (window as unknown as { __nobetciSayfadakiAlanlar?: unknown }).__nobetciSayfadakiAlanlar === 'function');
  if (hazir) return sayfa.evaluate((o) => (window as unknown as { __nobetciSayfadakiAlanlar: (d: number, o?: boolean) => SayfaEnvanteri }).__nobetciSayfadakiAlanlar(0, o), degerOku);
  return sayfa.evaluate<SayfaEnvanteri>(`(window.__nobetciAlanKilidi = window.__nobetciAlanKilidi || ${alanKilidi.toString()}, (${sayfadakiAlanlar.toString()})(0, ${degerOku}))`);
}

/** Alanın kapsamı: çerçevesi varsa o çerçeve (iç içe), yoksa sayfa. */
export function alanKapsami(sayfa: Page, cerceve: string[] | null | undefined): Page | FrameLocator {
  let k: Page | FrameLocator = sayfa;
  for (const c of cerceve ?? []) k = k.frameLocator(c);
  return k;
}

export class TaramaHatasi extends Error {
  readonly kod: TaramaHataKodu;
  constructor(kod: TaramaHataKodu, mesaj: string) {
    super(mesaj);
    this.name = 'TaramaHatasi';
    this.kod = kod;
  }
}

export type OlayGonderici = (olay: TaramaOlayi) => Promise<void>;

/** İki adresin YOLU (pathname; sondaki "/" yok sayılır) aynı mı? */
function ayniYol(a: string, b: string): boolean {
  try {
    const kok = (u: string): string => new URL(u, 'http://x.invalid').pathname.replace(/\/+$/, '') || '/';
    return kok(a) === kok(b);
  } catch { return false; }
}

/**
 * Hedef sayfayı açar (tarama, öğe seçme, akış kaydı ve hızlı test ortak). "net::ERR_ABORTED" bir erişilemezlik değil, gezinmenin
 * tamamlanmadan kesilmesidir (boş 204 yanıtı, giriş sonrası süren bir gezinmeyle çakışma, yönlendiren sayfa bilgisi (Referer) isteyen
 * siteler, dosya indirme). Kesilen gezinme ASLA "sayfa açıldı" sayılmaz (giriş sonrası ana sayfada kalıp oradan devam etmek yanlıştır):
 *  - önce giriş / bağlam değiştirmenin süren son gezinmesinin bitmesi beklenir,
 *  - kesilirse sırayla: yönlendiren sayfa bilgisiyle (Referer) ve sayfanın içinden (location.assign) yeniden denenir; sayfa hedefe geldiyse biter,
 *  - hâlâ olmuyorsa sunucunun GERÇEK yanıtı ve sayfanın şu anki yolu Türkçe hata iletisine yazılır.
 * Adresler iletide gizlenir (<adres>). @returns açılan sayfanın yolu (site başka yola yönlendirdiyse o yol; çağıran karşılaştırır)
 */
export async function hedefSayfayiAc(sayfa: Page, adres: string, zamanAsimiMs: number, hedefYol: string): Promise<string> {
  const yanitlar: string[] = [];
  const dinle = (y: import('@playwright/test').Response): void => {
    const istek = y.request();
    if (!istek.isNavigationRequest() || istek.frame() !== sayfa.mainFrame()) return;
    const durum = y.status();
    const yon = y.headers().location;
    const ek = (y.headers()['content-disposition'] ?? '').toLowerCase().startsWith('attachment');
    yanitlar.push(ek ? `HTTP ${durum}, dosya indirme yanıtı` : yon ? `HTTP ${durum}, yönlendirme` : durum === 204 || durum === 205 ? `HTTP ${durum}, boş yanıt` : `HTTP ${durum}`);
  };
  sayfa.on('response', dinle);
  const belgeVar = (): boolean => sayfa.url() !== '' && sayfa.url() !== 'about:blank';
  const secenek = { waitUntil: 'domcontentloaded' as const, timeout: zamanAsimiMs };
  try {
    // Giriş sonrası sayfanın kendi gezinmesi (oturum kurulumu, ana sayfaya yönlendirme) sürüyorsa hedefe gidiş onunla çakışıp kesilebilir.
    if (belgeVar()) await sayfa.waitForLoadState('load', { timeout: Math.min(5_000, zamanAsimiMs) }).catch(() => undefined);
    const yollar: Array<() => Promise<unknown>> = [
      () => sayfa.goto(adres, secenek),
      // Bazı siteler yönlendiren sayfa bilgisi (Referer) olmayan doğrudan gidişi keser: uygulama içinden gidiliyormuş gibi.
      ...(belgeVar() ? [
        () => sayfa.goto(adres, { ...secenek, referer: sayfa.url() }),
        async () => { await sayfa.evaluate((u) => { window.location.assign(u); }, adres); await sayfa.waitForURL((u) => ayniYol(u.toString(), adres), { timeout: zamanAsimiMs, waitUntil: 'domcontentloaded' }); }
      ] : [])
    ];
    for (let i = 0; i < yollar.length; i++) {
      try {
        await yollar[i]();
        return yolu(sayfa.url());
      } catch (hata) {
        const m = ilkSatir(hata);
        if (/Timeout/i.test(m)) throw new TaramaHatasi('ZAMAN_ASIMI', `Hedef sayfa (${hedefYol}) ${zamanAsimiMs / 1000} sn içinde açılmadı.`);
        if (/Download is starting/i.test(m)) {
          throw new TaramaHatasi('SITE_ERISILEMEDI', 'Hedef adres sayfa değil, bir dosya indirmesi başlatıyor; test edilecek sayfanın adresini yazın.');
        }
        if (!/ERR_ABORTED/i.test(m)) {
          if (agHatasiMi(m)) throw new TaramaHatasi('SITE_ERISILEMEDI', `Hedef sayfa açılamadı (${adreslerGizli(m)}).`);
          throw hata;
        }
        // Gezinme kesildi: sayfa yerleşsin; hedefteyse (kesilen gezinmeden sonra oraya varıldıysa) tamam, değilse sıradaki yol denenir.
        await sayfa.waitForLoadState('domcontentloaded', { timeout: Math.min(5_000, zamanAsimiMs) }).catch(() => undefined);
        if (belgeVar() && ayniYol(sayfa.url(), adres)) return yolu(sayfa.url());
        if (i < yollar.length - 1) await sayfa.waitForTimeout(800);
      }
    }
    const sonYanit = yanitlar.length ? yanitlar[yanitlar.length - 1] : 'sunucudan yanıt alınamadı';
    const suAn = belgeVar() ? ` Sayfa şu an: ${yolu(sayfa.url())}.` : '';
    throw new TaramaHatasi('SITE_ERISILEMEDI', `Hedef sayfa (${hedefYol}) açılırken tarayıcı gezinmeyi iptal etti (net::ERR_ABORTED; ${sonYanit}).${suAn} Adres yanlış olabilir, sunucu boş yanıt (204) ya da dosya indirmesi dönüyor olabilir, giriş / kullanıcı seçimi tamamlanmamış olabilir ya da site doğrudan adres yazılarak açılmasına izin vermiyor olabilir; adresi tarayıcıda açıp kontrol edin.`);
  } finally {
    sayfa.off('response', dinle);
  }
}

const SECIM_BEKLEME_MS = 2_500;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const ilkSatir = (hata: unknown): string => String(hata instanceof Error ? hata.message : hata).replace(ANSI, '').split('\n')[0].slice(0, 300);
const adreslerGizli = (m: string): string => m.replace(/https?:\/\/\S+/g, '<adres>');
function yolu(adres: string): string {
  try { const u = new URL(adres); return `${u.pathname}${u.search}`; } catch { return '?'; }
}
const kokVeYol = (adres: string): string => {
  try { const u = new URL(adres); return `${u.origin}${u.pathname}${u.search}`; } catch { return adres; }
};

/** Hata → { kod, mesaj } (gizli değer içermez; adresler yalnızca yol olarak). */
export function hataBilgisi(hata: unknown): { kod: TaramaHataKodu; mesaj: string } {
  if (hata instanceof TaramaHatasi) return { kod: hata.kod, mesaj: hata.message };
  if (hata instanceof GirisHatasi) return { kod: hata.kod, mesaj: hata.message };
  const m = ilkSatir(hata);
  if (agHatasiMi(m)) return { kod: 'SITE_ERISILEMEDI', mesaj: `Siteye ulaşılamadı (${adreslerGizli(m)}).` };
  if (/Timeout|zaman aşımı/i.test(m)) return { kod: 'ZAMAN_ASIMI', mesaj: `İşlem süre sınırında tamamlanmadı (${adreslerGizli(m)}).` };
  return { kod: 'BEKLENMEYEN', mesaj: `Beklenmeyen hata: ${adreslerGizli(m)}` };
}

async function gorunurMu(page: Page, secici: string): Promise<boolean> {
  try { return await page.locator(secici).first().isVisible(); } catch { return false; }
}

/** Bağlamda süren istek sayacı (sakinleşme beklemesi için). */
function istekSayaci(baglam: BrowserContext): { bekleyen: () => number } {
  let n = 0;
  baglam.on('request', () => { n++; });
  baglam.on('requestfinished', () => { n = Math.max(0, n - 1); });
  baglam.on('requestfailed', () => { n = Math.max(0, n - 1); });
  return { bekleyen: () => n };
}

/**
 * Taramayı yürütür ve envanteri döner. Hata durumunda TaramaHatasi/GirisHatasi fırlatır (hataBilgisi ile çevrilir).
 */
export async function taramayiYurut(browser: Browser, g: TaramaGirdisi, olay: OlayGonderici, oturumGonder?: OturumGonderici): Promise<TaramaEnvanteri> {
  const bildir = (o: TaramaOlayi): void => { void olay(o).catch(() => undefined); };
  // 1) Yasaklı adres denetimi: tarayıcı hiçbir yere gitmeden (sunucu da başlatmadan önce denetler).
  await olay({ tur: 'adim', adim: 'hazirlik', durum: 'suruyor' });
  const desenler = yasakDesenleri(g.yasakKaliplari.join(','));
  const yasak = yasakliAdresBul(taramaAdresleri(g.tabanUrl, g.hedefAdres, g.tarif, g.profiller.map((p) => p.degerler)), desenler);
  if (yasak) throw new TaramaHatasi('YASAKLI_ADRES', yasakliTaramaMesaji(yasak));

  // Ekran boyutu, dil, saat dilimi: Ayarlar > Koşu > Tarama ve akış kaydı (varsayılan 1366×900, tr-TR, bilgisayarın saat dilimi).
  const baglam = await browser.newContext({
    baseURL: g.tabanUrl, ...taramaTarayiciAyarlari(g).baglam, acceptDownloads: false, serviceWorkers: 'block',
    // Yalnız "Koşunun saklanan oturumunu kullan" seçiliyken: koşunun oturumu (sunucu ortamın kökenlerine sınırladı).
    ...oturumBaglamSecenegi(g)
  });
  const durum: { asama: TaramaAsamasi } = { asama: 'hazirlik' };
  const engellenenler: EngellenenIstek[] = [];
  const kaydet = (k: EngellenenIstek): void => {
    engellenenler.push(k);
    if (engellenenler.length <= 200) bildir({ tur: 'engellendi', ...k });
  };
  await baglam.route('**/*', async (route) => {
    const r = route.request();
    const karar = istekKarari({ yontem: r.method(), adres: r.url(), asama: durum.asama, yasakDesenleri: desenler, izinliKokenler: g.izinliKokenler });
    if (karar.izin) { await route.fallback(); return; }
    kaydet({ yontem: r.method(), adres: adresOzeti(r.url()), asama: durum.asama, neden: karar.neden });
    await route.abort('blockedbyclient');
  });
  // WebSocket: tarama aşamasında hiç açılmaz; yasaklı host'a hiçbir zaman.
  await baglam.routeWebSocket(/.*/, (ws) => {
    const url = ws.url();
    const koken = (() => { try { return new URL(url.replace(/^ws/, 'http')).origin; } catch { return ''; } })();
    const izinsiz = g.izinliKokenler && g.izinliKokenler.length ? !g.izinliKokenler.includes(koken) : false;
    if (durum.asama === 'tarama' || adresYasakliMi(url.replace(/^ws/, 'http'), desenler) || izinsiz) {
      kaydet({ yontem: 'WS', adres: adresOzeti(url), asama: durum.asama, neden: 'websocket' });
      void ws.close();
      return;
    }
    ws.connectToServer();
  });
  const sayac = istekSayaci(baglam);
  const sakinlesmeyiBekle = async (page: Page, enCokMs: number): Promise<void> => {
    const son = Date.now() + enCokMs;
    let sakin = 0;
    while (Date.now() < son) {
      if (sayac.bekleyen() <= 0) { sakin += 100; if (sakin >= 400) return; } else sakin = 0;
      await page.waitForTimeout(100);
    }
  };
  await olay({ tur: 'adim', adim: 'hazirlik', durum: 'tamam' });

  try {
    // 2) Giriş (tarif güdümlü; saklanan oturum ya da baştan giriş — kullanıcının seçimi).
    const islem = await baglam.newPage();
    islem.on('dialog', (d) => { void d.dismiss().catch(() => undefined); });
    if (g.tarif) {
      durum.asama = 'giris';
      await olay({ tur: 'adim', adim: 'giris', durum: 'suruyor' });
      if (!g.kimlik) throw new TaramaHatasi('TARIF_GECERSIZ', 'Bu ortam için giriş profili tanımlı değil (Ayarlar > Giriş profilleri).');
      let yontem: TaramaGirisYontemi;
      try {
        // Seçime göre saklanan oturum ya da baştan giriş (tarama-girisi.ts); giriş bilgisi yalnız ortamın kökenlerine yazılır.
        yontem = await taramaGirisiYap(islem, g, bildir, oturumGonder);
      } catch (hata) {
        await olay({ tur: 'adim', adim: 'giris', durum: 'hata', mesaj: hataBilgisi(hata).mesaj });
        throw hata;
      }
      await olay({ tur: 'giris', yontem });
      await olay({ tur: 'adim', adim: 'giris', durum: 'tamam', mesaj: girisYontemiMesaji(yontem) });
    } else {
      await olay({ tur: 'adim', adim: 'giris', durum: 'atlandi', mesaj: 'Giriş tarifi yok; sayfa girişsiz taranıyor.' });
    }

    // 3) Profiller.
    await olay({ tur: 'adim', adim: 'profiller', durum: 'suruyor' });
    const profiller: ProfilEnvanteri[] = [];
    const hataliProfiller: TaramaEnvanteri['hataliProfiller'] = [];
    for (const [sira, p] of g.profiller.entries()) {
      await olay({ tur: 'profil', sira, durum: 'suruyor', adim: 'baglam' });
      if (p.degerler && g.tarif?.baglamDegistirme) {
        durum.asama = 'baglam';
        try {
          await baglamiDegistir(islem, g.tarif, p.degerler);
        } catch (hata) {
          const b = hataBilgisi(hata);
          if (b.kod !== 'BAGLAM_ADIMI') throw hata;
          hataliProfiller.push({ profil: p.ad, mesaj: b.mesaj });
          await olay({ tur: 'profil', sira, durum: 'hata', adim: 'baglam', mesaj: b.mesaj });
          continue;
        }
        // Yazma engeli açılmadan önce bağlam değiştirmenin son isteği bitsin (açılır penceredeki form gönderimi geç kalıp engellenmesin).
        await isteklerBitsin(islem);
      }
      durum.asama = 'tarama';
      await olay({ tur: 'profil', sira, durum: 'suruyor', adim: 'tarama' });
      const sayfa = await baglam.newPage();
      const notlar: string[] = [];
      await sayfa.addInitScript(formGonderimKorumasi);
      await sayfa.addInitScript(dugmeTiklamaKorumasi);
      await sayfa.addInitScript({ content: ENVANTER_BETIGI });
      sayfa.on('dialog', (d) => { notlar.push(`Sayfa bir iletişim kutusu açtı (${d.type()}); kapatıldı.`); void d.dismiss().catch(() => undefined); });
      sayfa.on('popup', (y) => { notlar.push('Sayfa yeni bir pencere açmaya çalıştı; kapatıldı.'); void y.close().catch(() => undefined); });
      try {
        const e = await profilTara(sayfa, g, p.ad, notlar, sakinlesmeyiBekle, async (adim) => olay({ tur: 'profil', sira, durum: 'suruyor', adim }));
        profiller.push(e);
        const kesifteBelirenler = new Set(e.kesifler.flatMap((k) => k.degerler.flatMap((d) => d.gorunenler.map((a) => a.anahtar))));
        await olay({ tur: 'profil', sira, durum: 'tamam', adim: null, alanSayisi: e.alanlar.length + kesifteBelirenler.size });
      } catch (hata) {
        await olay({ tur: 'profil', sira, durum: 'hata', mesaj: hataBilgisi(hata).mesaj });
        throw hata;
      } finally {
        await sayfa.close().catch(() => undefined);
      }
    }
    if (!profiller.length) {
      throw new TaramaHatasi('BAGLAM_ADIMI', `Hiçbir bağlam profili taranamadı: ${hataliProfiller.map((h) => h.mesaj).join(' · ')}`);
    }
    await olay({ tur: 'adim', adim: 'profiller', durum: 'tamam' });
    return { profiller, hataliProfiller, engellenenler, kesifYapildi: g.kesif, kesifSecenekSiniri: taramaTarayiciAyarlari(g).kesifSecenekSiniri };
  } finally {
    await baglam.close().catch(() => undefined);
  }
}

async function profilTara(
  sayfa: Page, g: TaramaGirdisi, profil: string | null, notlar: string[],
  sakinles: (page: Page, ms: number) => Promise<void>, adimBildir: (adim: 'tarama' | 'kesif') => Promise<void>
): Promise<ProfilEnvanteri> {
  const { sayfaAcilmaMs, kesifSecenekSiniri } = taramaTarayiciAyarlari(g);
  const git = async (): Promise<void> => {
    await hedefSayfayiAc(sayfa, g.hedefAdres, sayfaAcilmaMs, g.hedefYol);
    await sayfa.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    await sakinles(sayfa, 3_000);
  };
  await adimBildir('tarama');
  await git();
  const captcha = await captchaAlgila(sayfa);
  if (captcha.length) {
    throw new TaramaHatasi('CAPTCHA', `Hedef sayfada CAPTCHA görüldü (${captcha.slice(0, 2).join('; ')}); otomasyon CAPTCHA çözmez. Test ortamında CAPTCHA kapatılmalı.`);
  }
  if (g.tarif && (await gorunurMu(sayfa, g.tarif.parolaAlani))) {
    throw new TaramaHatasi('OTURUM_GECERSIZ', `Hedef sayfa yerine giriş sayfası açıldı (${yolu(sayfa.url())}): oturum geçersiz ya da bu profil sayfaya erişemiyor.`);
  }
  const acilan = yolu(sayfa.url());
  if (acilan !== g.hedefYol) notlar.push(`Hedef ${g.hedefYol} yerine ${acilan} açıldı (yönlendirme).`);
  const envanter = await envanterOku(sayfa);
  if (envanter.ozelBilesenSayisi) notlar.push(`${envanter.ozelBilesenSayisi} özel bileşen (role=combobox/listbox) alan olarak çıkarılamadı.`);
  const cercevedeki = envanter.alanlar.filter((a) => a.cerceve?.length).length;
  if (cercevedeki) notlar.push(`${cercevedeki} alan çerçeve (iframe) içinde okundu; modelde alanın konum.cerceve'si olur.`);
  if (envanter.okunamayanCerceveSayisi) {
    notlar.push(`Sayfada ${envanter.okunamayanCerceveSayisi} çerçevenin (iframe) içi okunamadı (başka kökenden — cross-origin — ya da 2 düzeyden derin); içlerindeki alanlar taranmadı.`);
  }
  // Eylem ve doğrulama keşfi: gönderim düğmesi / başarı / hata / yönlendirme / bekleme adayları sayfadaki izlerden (BASILMAZ).
  const eylemAdaylari = await eylemAdaylariniCikar(sayfa);
  let ekranGoruntusu: string | null = null;
  try {
    ekranGoruntusu = (await sayfa.screenshot({ type: 'png', timeout: 15_000 })).toString('base64');
  } catch {
    notlar.push('Ekran görüntüsü alınamadı.');
  }
  const kesifler: Kesif[] = [];
  let zincir: ZincirSonucu | null = null;
  if (g.kesif) {
    await adimBildir('kesif');
    kesifler.push(...(await secimleriKesfet(sayfa, envanter, notlar, git, sakinles, kesifSecenekSiniri)));
    // Bağlı liste zinciri (zincir-motoru.ts): birinci düzey bağlantılardan zincirin sonuna kadar (yalnız seçim; basılmaz).
    const { zincirDerinligi, zincirOrnek } = taramaTarayiciAyarlari(g);
    try {
      const z = await zincirKesfet({ sayfa, ac: git, sakinles, oku: async () => (await envanterOku(sayfa)).alanlar }, envanter.alanlar, kesifler,
        { derinlik: zincirDerinligi, ornek: zincirOrnek });
      notlar.push(...z.notlar);
      if (z.iliskiler.length) zincir = z;
    } catch (hata) {
      notlar.push(`Bağlı liste zinciri incelenemedi: ${hataBilgisi(hata).mesaj}`);
    }
  }
  return { profil, yol: acilan, baslik: envanter.baslik, alanlar: envanter.alanlar, kesifler, ekranGoruntusu, notlar, eylemAdaylari, ...(zincir ? { zincir } : {}) };
}

/** Keşif adayı: seçim alanı + denenecek değerler (tur: açılır liste / radyo grubu / onay kutusu). */
type KesifAdayi = { alan: HamAlan; tur: 'secim' | 'radyo' | 'onay'; degerler: HamSecenek[]; kismi: boolean };

/**
 * Keşfin adayları (sayfa sırasıyla). Açılır liste: etkin, tekli, ≥ 2 seçenekli; ≤ sinir seçenekliyse hepsi, daha uzunsa yalnız ilk
 * "sinir" seçenek denenir (kismi: yalnız bağımlı liste çıkarılır). Radyo grubu: 2…sinir seçenek. Onay kutusu: işaretli / işaretsiz.
 * Güvenli düğme kuralı (koruma.mjs > kesifGuvenligi): kayıt / gönderim çağrıştıran seçim atlanır ve raporlanır.
 */
function kesifAdaylari(temel: SayfaEnvanteri, sinir: number, atlananlar: Kesif[]): KesifAdayi[] {
  const adaylar: KesifAdayi[] = [];
  for (const a of temel.alanlar) {
    if (!KESIF_TURLERI.includes(a.tur) || a.devreDisi || a.saltOkunur) continue;
    let aday: KesifAdayi | null = null;
    if (a.tur === 'select' && !a.coklu && (a.secenekler?.length ?? 0) >= 2) {
      const liste = a.secenekler ?? [];
      aday = { alan: a, tur: 'secim', degerler: liste.length <= sinir ? liste : liste.filter((s) => s.deger !== '').slice(0, sinir), kismi: liste.length > sinir };
    } else if (a.tur === 'radio' && (a.radyolar?.length ?? 0) >= 2 && (a.radyolar?.length ?? 0) <= sinir && a.radyolar?.every((r) => r.deger !== '')) {
      aday = { alan: a, tur: 'radyo', degerler: (a.radyolar ?? []).map((r) => ({ deger: r.deger, metin: r.metin ?? r.deger })), kismi: false };
    } else if (a.tur === 'checkbox') {
      aday = { alan: a, tur: 'onay', degerler: [{ deger: 'true', metin: 'işaretli' }, { deger: 'false', metin: 'işaretsiz' }], kismi: false };
    }
    if (!aday) continue;
    const g = kesifGuvenligi(a);
    if (!g.guvenli) { atlananlar.push({ secim: a.anahtar, ilkDeger: null, degerler: [], geriAlindi: true, atlandi: g.neden, tur: aday.tur }); continue; }
    adaylar.push(aday);
  }
  return adaylar;
}

/**
 * Sayfa içi: radyo / onay kutusuna TIKLAR (yalnız bu öğeye; öğe bir düğmenin / bağlantının içindeyse hiç dokunmaz). Tıklama
 * tarayıcının kendi olaylarını (click → input → change) üretir; çerçeveler arası diye sınıf yerine etiket adıyla denetlenir.
 */
function secimeTikla(el: Element): boolean {
  const t = el as HTMLInputElement;
  if (el.tagName !== 'INPUT' || !['radio', 'checkbox'].includes(t.type) || t.disabled) return false;
  if (el.closest('a[href], button, [role="button"], [role="link"]')) return false;
  t.click();
  return true;
}

/**
 * Seçim keşfi: açılır listelerde diğer seçenekler, radyo gruplarında diğer seçenekler, onay kutularında ters durum sırayla denenir
 * (Ayarlar > Koşu > Açılır liste keşif sınırı; varsayılan 8). Beliren / kaybolan alanlar, seçenekleri DEĞİŞEN diğer seçim alanları
 * (bağımlı listeler; yalnız seçenek etiketi / değeri), etkinleşen alanlar ve etiketi DEĞİŞEN alanlar (anahtar aynı, görünen ad farklı:
 * etiketler) ve düzenlenebilirliği DEĞİŞEN alanlar (kilitler; salt okumayla — alanKilidi, sayfaya yazılmaz) kaydedilir; sonunda ilk
 * değer geri yüklenir. Seçim sayfayı
 * başka adrese götürürse not düşülür ve hedefe dönülür. Keşif HİÇBİR düğmeye / bağlantıya basmaz; sayfanın betiği bassa da
 * tıklama yutulur (dugmeTiklamaKorumasi) ve yazma istekleri ağ katmanında iptal edilir.
 *
 * İÇ İÇE KEŞİF (secenek.derinlik > 1): bir değer yeni seçim alanları (açılır liste / radyo / onay kutusu) gösteriyorsa, o değer
 * uygulanmışken bu yeni seçimler de aynı kurallarla denenir (görünen / kaybolan, etiketler, kurallar); sonuçları kendi keşifleri olarak,
 * üst seçim + değerle (ust) üst keşfin ARKASINA eklenir. Alt keşifte sayfayı yeniden açmak "aç + üst değeri uygula" demektir; alt
 * seçimler sonunda ilk değerlerine, üst seçim de kendi ilk değerine geri alınır. secenek.butce: toplam iç içe keşif sayısı sınırı
 * (paylaşılır; varsayılan 8).
 */
export async function secimleriKesfet(
  sayfa: Page, temel: SayfaEnvanteri, notlar: string[], git: () => Promise<void>,
  sakinles: (page: Page, ms: number) => Promise<void>, sinir: number,
  secenek: { derinlik?: number; butce?: { kalan: number }; ust?: { secim: string; deger: string } | null } = {}
): Promise<Kesif[]> {
  const derinlik = Math.max(1, Math.min(3, secenek.derinlik ?? 1));
  const butce = secenek.butce ?? { kalan: 8 };
  const kesifler: Kesif[] = [];
  /** İç içe keşiflerin sonuçları (üst keşiften SONRA eklenir: tüketiciler üstün alanlarını önce görür). */
  const altKesifler: Kesif[] = [];
  const adaylar = kesifAdaylari(temel, sinir, kesifler);
  const anahtarlar = async (): Promise<SayfaEnvanteri> => envanterOku(sayfa);
  const adresAyni = (a: string, b: string): boolean => kokVeYol(a) === kokVeYol(b);
  for (const { alan: s, tur, degerler: denenecek, kismi } of adaylar) {
    const kapsam = alanKapsami(sayfa, s.cerceve);
    const l = kapsam.locator(s.secici).first();
    // Özel açılır listenin gerçek <select>'i gizlidir: seçim görünürlük beklenmeden yapılır (olaylar yine gönderilir).
    const zorla = s.ozelBilesen === true;
    /** Radyonun seçeneği: grubun seçicisi + değer (adsız grupta seçeneğin kendi seçicisi). */
    const radyo = (deger: string) => {
      const r = s.radyolar?.find((x) => x.deger === deger);
      return s.ad ? kapsam.locator(`${s.secici}[value="${deger.replace(/["\\]/g, '\\$&')}"]`).first() : r?.secici ? kapsam.locator(r.secici).first() : null;
    };
    const oku = async (): Promise<string | null> => {
      if (tur === 'secim') return l.inputValue({ timeout: 3_000 });
      if (tur === 'onay') return String(await l.isChecked({ timeout: 3_000 }));
      return kapsam.locator(s.secici).evaluateAll((els) => (els.find((e) => (e as HTMLInputElement).checked) as HTMLInputElement | undefined)?.value ?? null);
    };
    const uygula = async (deger: string): Promise<void> => {
      if (tur === 'secim') { await l.selectOption({ value: deger }, { timeout: 3_000, force: zorla }); return; }
      const hedef = tur === 'onay' ? l : radyo(deger);
      if (!hedef) throw new Error('seçenek bulunamadı');
      if (tur === 'onay' && String(await hedef.isChecked({ timeout: 3_000 })) === deger) return;
      if (!(await hedef.evaluate(secimeTikla, undefined, { timeout: 3_000 }))) throw new Error('güvenlik: öğe bir düğmenin/bağlantının içinde ya da devre dışı; dokunulmadı');
    };
    let ilk: string | null;
    try {
      ilk = await oku();
    } catch {
      kesifler.push({ secim: s.anahtar, ilkDeger: null, degerler: [], geriAlindi: false, atlandi: 'alan ekranda bulunamadı', tur });
      continue;
    }
    const baslangic = await anahtarlar();
    const temelAnahtarlar = new Set(baslangic.alanlar.map((a) => a.anahtar));
    const devreDisiAnahtarlar = new Set(baslangic.alanlar.filter((a) => a.devreDisi).map((a) => a.anahtar));
    // Bağımlı listeler: bu seçim değişince seçenekleri değişen diğer seçim alanları (ilk değerdeki listelere göre).
    const secenekImzasi = (a: HamAlan): string => JSON.stringify((a.secenekler ?? a.radyolar ?? []).map((x) => x.deger));
    const temelSecenekler = new Map(baslangic.alanlar.filter((a) => a.anahtar !== s.anahtar && (a.secenekler || a.radyolar)).map((a) => [a.anahtar, secenekImzasi(a)]));
    // Etiketi değişen alanlar: anahtar (alan) aynı kalır, sayfadaki görünen adı bu seçime göre değişir (ör. aynı kutu bir değerde kimlik
    // no, diğerinde vergi no sorar). Alan belirmez / kaybolmaz; yalnız adı değişir.
    const temelEtiketler = new Map(baslangic.alanlar.filter((a) => a.anahtar !== s.anahtar && a.etiket).map((a) => [a.anahtar, String(a.etiket)]));
    // Aynı alanın en çok karakter sayısı (maxlength) / deseni (pattern) de seçime göre değişebilir (ör. kimlik no 11, vergi no 10 hane).
    const kuralImzasi = (a: HamAlan): string => JSON.stringify([a.enCok ?? null, a.desen ?? null]);
    const temelKurallar = new Map(baslangic.alanlar.filter((a) => a.anahtar !== s.anahtar).map((a) => [a.anahtar, kuralImzasi(a)]));
    // Aynı alanın DÜZENLENEBİLİRLİĞİ de seçime göre değişebilir (ör. bir değerde sayfa alanı kendisi doldurup kilitler): salt okumayla
    // (alanKilidi; sayfaya yazılmaz) her değerde okunur, ilk değerdekinden farklıysa kaydedilir (radyo grupları hariç).
    const temelKilitler = new Map(baslangic.alanlar.filter((a) => a.anahtar !== s.anahtar && a.tur !== 'radio').map((a) => [a.anahtar, Boolean(a.kilit)]));
    const degerler: KesifDegeri[] = [];
    const buAlt: Kesif[] = [];
    for (const o of denenecek) {
      if (o.deger === ilk) continue;
      const onceki = sayfa.url();
      try {
        await uygula(o.deger);
      } catch (hata) {
        degerler.push({ deger: o.deger, metin: o.metin, gorunenler: [], kaybolanlar: [], gezinme: null, hata: `seçilemedi: ${adreslerGizli(ilkSatir(hata)).slice(0, 120)}` });
        continue;
      }
      await sayfa.waitForLoadState('domcontentloaded', { timeout: SECIM_BEKLEME_MS }).catch(() => undefined);
      await sakinles(sayfa, SECIM_BEKLEME_MS);
      if (!adresAyni(onceki, sayfa.url())) {
        degerler.push({ deger: o.deger, metin: o.metin, gorunenler: [], kaybolanlar: [], gezinme: yolu(sayfa.url()) });
        await git();
        continue;
      }
      let simdi: SayfaEnvanteri;
      try {
        simdi = await anahtarlar();
      } catch (hata) {
        degerler.push({ deger: o.deger, metin: o.metin, gorunenler: [], kaybolanlar: [], gezinme: null, hata: adreslerGizli(ilkSatir(hata)).slice(0, 120) });
        await git();
        continue;
      }
      const simdiAnahtarlar = new Set(simdi.alanlar.map((a) => a.anahtar));
      const gorunenler: HamAlan[] = simdi.alanlar.filter((a) => !temelAnahtarlar.has(a.anahtar));
      const secenekler: Record<string, HamSecenek[]> = {};
      for (const a of simdi.alanlar) {
        const temel = temelSecenekler.get(a.anahtar);
        if (temel === undefined || temel === secenekImzasi(a)) continue;
        secenekler[a.anahtar] = a.secenekler ?? (a.radyolar ?? []).map((x) => ({ deger: x.deger, metin: x.metin ?? x.deger }));
      }
      const etkinlesenler = simdi.alanlar.filter((a) => devreDisiAnahtarlar.has(a.anahtar) && !a.devreDisi).map((a) => a.anahtar);
      const etiketler: Record<string, string> = {};
      for (const a of simdi.alanlar) {
        const once = temelEtiketler.get(a.anahtar);
        if (once !== undefined && a.etiket && String(a.etiket) !== once) etiketler[a.anahtar] = String(a.etiket);
      }
      const kurallar: Record<string, { enCok: number | null; desen: string | null }> = {};
      for (const a of simdi.alanlar) {
        const once = temelKurallar.get(a.anahtar);
        if (once !== undefined && once !== kuralImzasi(a)) kurallar[a.anahtar] = { enCok: a.enCok ?? null, desen: a.desen ?? null };
      }
      // (Bağlı açılır listenin seçenekleri gelince etkinleşmesi bağlı liste zinciridir; kilit sayılmaz.)
      const kilitler: Record<string, boolean> = {};
      for (const a of simdi.alanlar) {
        const once = temelKilitler.get(a.anahtar);
        if (once === undefined || once === Boolean(a.kilit)) continue;
        if (a.tur === 'select' && (etkinlesenler.includes(a.anahtar) || secenekler[a.anahtar] || devreDisiAnahtarlar.has(a.anahtar))) continue;
        kilitler[a.anahtar] = Boolean(a.kilit);
      }
      degerler.push({
        deger: o.deger, metin: o.metin, gorunenler, kaybolanlar: [...temelAnahtarlar].filter((k) => !simdiAnahtarlar.has(k)), gezinme: null,
        ...(Object.keys(secenekler).length ? { secenekler } : {}), ...(etkinlesenler.length ? { etkinlesenler } : {}),
        ...(Object.keys(etiketler).length ? { etiketler } : {}), ...(Object.keys(kurallar).length ? { kurallar } : {}),
        ...(Object.keys(kilitler).length ? { kilitler } : {})
      });
      // İç içe: bu değerde beliren seçim alanları (değer uygulanmışken) aynı kurallarla denenir.
      const yeniSecimler = gorunenler.filter((a) => KESIF_TURLERI.includes(a.tur) && !a.devreDisi && !a.saltOkunur);
      if (derinlik > 1 && yeniSecimler.length && butce.kalan > 0) {
        butce.kalan--;
        const altGit = async (): Promise<void> => {
          await git();
          await uygula(o.deger);
          await sayfa.waitForLoadState('domcontentloaded', { timeout: SECIM_BEKLEME_MS }).catch(() => undefined);
          await sakinles(sayfa, SECIM_BEKLEME_MS);
        };
        try {
          const alt = { ...simdi, alanlar: simdi.alanlar.filter((a) => yeniSecimler.some((y) => y.anahtar === a.anahtar)) };
          const ic = await secimleriKesfet(sayfa, alt, notlar, altGit, sakinles, sinir, { derinlik: derinlik - 1, butce, ust: { secim: s.anahtar, deger: o.deger } });
          buAlt.push(...ic.filter((k) => k.degerler.length || k.atlandi));
        } catch (hata) {
          notlar.push(`“${s.etiket ?? s.anahtar}” = “${o.metin}” değerinde beliren seçimler denenemedi: ${adreslerGizli(ilkSatir(hata)).slice(0, 120)}`);
        }
      }
    }
    let geriAlindi = false;
    try {
      if ((await oku()) !== ilk) {
        if (ilk !== null) await uygula(ilk);
        else {
          // Başta hiçbir radyo seçili değildi: seçim kaldırılır (tıklamadan; olaylar gönderilir).
          await kapsam.locator(s.secici).evaluateAll((els) => {
            for (const e of els) {
              const r = e as HTMLInputElement;
              if (!r.checked) continue;
              r.checked = false;
              r.dispatchEvent(new Event('input', { bubbles: true }));
              r.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        }
        await sakinles(sayfa, SECIM_BEKLEME_MS);
      }
      geriAlindi = (await oku()) === ilk;
    } catch {
      geriAlindi = false;
    }
    if (!geriAlindi) {
      notlar.push(`"${s.etiket ?? s.anahtar}" ilk değerine geri alınamadı; sayfa yeniden açıldı.`);
      await git();
    }
    kesifler.push({ secim: s.anahtar, ilkDeger: ilk, degerler, geriAlindi, tur, ...(kismi ? { kismi: true } : {}), ...(secenek.ust ? { ust: secenek.ust } : {}) });
    altKesifler.push(...buAlt);
  }
  return [...kesifler, ...altKesifler];
}
