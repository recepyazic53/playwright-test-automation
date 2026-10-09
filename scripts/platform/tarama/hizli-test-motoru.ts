// HIZLI TEST MOTORU (genel) — tarama alt sürecinde (tarama.spec.ts, girdi.kip = 'hizliTest') GÖRÜNÜR bir tarayıcıda çalışan
// ETKİLEŞİMLİ iş. Hiçbir proje adı / seçicisi yoktur: giriş ve bağlam adımları ortamın giriş tarifinden gelir (tarama, akış kaydı ve
// "Sayfada seç" ile aynı yol: tarama-girisi.ts).
//
// Akış: yasaklı adres denetimi (tarayıcı açılmadan) → giriş (tarif) → bağlam (en fazla bir profil) → hedef sayfa → KEŞİF (sayfa
// envanteri + eylem keşfi + görünen metinler; HİÇBİR DÜĞMEYE BASILMAZ) → sunucunun komutları (protokol.mjs > HizliKomut):
//   doldur   verilen değerleri alanlara yazar (değerler kullanıcının yazdığı ya da tablodan seçtiği; motor değer ÜRETMEZ)
//   bas      düğmeye basar; bekleme göstergesi kaybolana ve istekler bitene kadar izler (en çok 60 sn), sonra farkı çıkarır: yeni
//            metinler, yeni / kaybolan alanlar, yeni düğmeler, adres değişimi, son görüntü (JPEG; yalnız bellekte)
//   secimAc  "Başka düğmeye bas": sayfada tıklanan öğe (tıklama sayfaya İLETİLMEZ) seçiciye çevrilir
//   oku      sayfayı yeniden okur
//   dogrula  "baştan sona doğrulama koşusu": sayfayı yeniden açar, zinciri (doldur → bas) uygular, bitiş koşulunu bekler
//   bitir    tarayıcıyı kapatır
//
// GÜVENLİK: "bas" yalnız sunucunun komutuyla (kullanıcının izni / onayı) çalışır. İzin "Hayır" ise motor düğmeye BASMAZ (komut
// reddedilir) ve giriş + bağlam değiştirme BİTTİKTEN sonra, hedef sayfa açılmadan önce sayfaya form gönderimi ve düğme tıklaması
// korumaları konur (hayirKorumasiniAc; giriş / bağlam adımları normal koşudaki gibi engelsizdir). Ağ katmanında hızlı testin okuma
// aşaması ('kayit') sorgu isteklerine izin verir; keşif basışı ('tarama') sırasında yazma istekleri engellenir. Yasaklı host ve
// izinli köken engeli her aşamada sürer. Alan DEĞERLERİ sayfadan okunmaz; ekran görüntüsü diske yazılmaz.
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { Browser, BrowserContext, Dialog, Frame, Locator, Page, Request } from '@playwright/test';
import { DegerIzleyici, alanDegeriOku, alanaYaz, alandanCik, alanZatenDolu, degerTuttu, oneridenYaz, takvimdenYaz, yazmaHatasi } from './alan-cikisi';
import { AgIzleyici, UZUN_ISTEK_MS } from './ag-sakinligi';
import { TEKRAR_NOTU, etkisizTiklamaMetni, guvenliTikla, ortuyuKaldir, sakinlikBekle, sayfaParmakIzi } from './guvenli-tiklama';
import { baglamiDegistir } from '../../../tests/support/giris-motoru';
import { canliYayinKur, type CanliYayin } from '../../../tests/support/canli-yayin';
import { CANLI_DUYURU_DEGISKENI } from '../canli-akis.mjs';
import { captchaAlgila } from '../giris/algilama.mjs';
import { agHatasiMi } from '../giris/tarif.mjs';
import { adresYasakliMi, yasakDesenleri } from '../senaryolar/model-kosusu.mjs';
import { KALIPLAR, katla } from './eylem-kesfi.mjs';
import { eylemAdaylariniCikar } from './eylem-kesfi-motoru';
import { adresOzeti, istekKarari, taramaAdresleri, yasakliAdresBul, yasakliTaramaMesaji, type TaramaAsamasi } from './koruma.mjs';
import type { EngellenenIstek, HamAlan } from './paket-olusturucu.mjs';
import {
  HIZLI_BASIS_BEKLEME_EN_COK_MS, HIZLI_SECIM_KIMLIGI, HIZLI_SECIM_KOPRUSU, TARAMA_GORUNUR_DEGISKENI, taramaTarayiciAyarlari,
  type HizliAnlik, type HizliDiyalog, type HizliDoldurulan, type HizliPencere, type HizliDugme, type HizliFark, type HizliKesif, type HizliKesifDugmesi, type HizliKomut, type HizliMetin, type HizliOlay, type HizliPlan,
  type HizliTestSonucu, type TaramaGirdisi, type TaramaGirisYontemi, type TaramaOlayi
} from './protokol.mjs';
import { girisYontemiMesaji, isteklerBitsin, oturumBaglamSecenegi, taramaGirisiYap, type OturumGonderici } from './tarama-girisi';
import { ogeBilgisi, type SeciciAdayi } from './oge-secme-paneli';
import { adaySirasi } from './oge-secme-motoru';
import { beklemeDurumu, hizliMetinleriTopla, hizliPencereleri, hizliSecimSeridiKur } from './hizli-test-sayfasi';
import { dugmeTiklamaKorumasi, formGonderimKorumasi, ozelBilesenIsaretle, secimeTikla } from './sayfa-envanteri';
import { listedenSec, zincirKesfet } from './zincir-motoru';
import { listedeYokMetni, secenekBekle } from './secenek-secimi';
import { ZINCIR_SECENEK_BEKLEME_MS, gercekSecenekler, type ZincirSonucu } from './zincir-kesfi.mjs';
import { ENVANTER_BETIGI, TaramaHatasi, alanKapsami, envanterOku, hataBilgisi, hedefSayfayiAc, sayfaIciUyari, secimleriKesfet, type OlayGonderici } from './tarama-motoru';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const ilkSatir = (hata: unknown): string => String(hata instanceof Error ? hata.message : hata).replace(ANSI, '').split('\n')[0].slice(0, 300);
const adreslerGizli = (m: string): string => m.replace(/https?:\/\/\S+/g, '<adres>');
const yolu = (adres: string): string => { try { const u = new URL(adres); return `${u.pathname}${u.search}`; } catch { return '?'; } };
const nesneMi = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null && !Array.isArray(d);
const bekle = (ms: number): Promise<void> => new Promise((c) => setTimeout(c, ms));
/** Alan doldurulduktan sonra sayfanın sakinleşmesi için en çok bekleme (ms). */
const ALAN_SAKINLIK_EN_COK_MS = 8_000;
/** Basıştan sonra bundan kısa süredir bekleyen istek sayılır (gönderim / hesaplama uzun sürebilir; uzun yoklama adresi zaten öğrenilir). */
const BASIS_UZUN_ISTEK_MS = 20_000;
/** Doldurmadan sonra görünümün değişmeden kalması gereken süre (ms) ve en çok bekleme: beklemeyle (debounce) beliren alanlar için. */
const DURULMA_MS = 1_600;
const DURULMA_EN_COK_MS = 5_000;
/** Basıştan sonra hiç yeni metin görülmediyse ek bakma süresi (ms): pencerenin içi gecikmeli çizilebilir. */
const YENI_METIN_BEKLEME_MS = 4_000;
/** Metin karşılaştırması: büyük / küçük harf, Türkçe harfler ve boşluklar yok sayılır (koşucunun toleranslı içerir kuralı gibi). */
const iceriyor = (metin: string, aranan: string): boolean => Boolean(aranan.trim()) && katla(metin).includes(katla(aranan));
/** Doğru / yanlış sayılan değerler (onay kutusu). */
const dogruMu = (d: unknown): boolean => d === true || ['true', 'evet', '1', 'on', 'işaretli', 'isaretli'].includes(String(d).trim().toLocaleLowerCase('tr'));

/**
 * Sayfa içi: düğmenin / bağlantının keşifte basılabilir olup olmadığı ve sonucundan emin olunup olunamayacağı — YALNIZ öğenin
 * davranışından (adı / metni kullanılmaz). Basılmaz: devre dışı / görünmez öğe, bir alanın parçası (yanında girdi olan süsleme / simge
 * öğesi), başka belgeye giden bağlantı. Emin (yalnız sayfa içinde bir şey açar): aria-expanded / aria-controls, sekme rolü, özet
 * (summary) öğesi, "#…" / "javascript:" bağlantısı — form göndermiyorsa. Form gönderen düğme (submit) ve davranışı sayfadan
 * anlaşılamayan (yalnız betikli: type=button, onclick, sayfa içi işleyici) düğme emin değildir: izne göre kullanıcıya sorulur.
 */
function dugmeDavranisi(el: Element): { uygun: boolean; emin: boolean; neden: string } {
  const h = el as HTMLElement;
  const r = h.getBoundingClientRect();
  const st = getComputedStyle(h);
  if (!r.width || !r.height || st.visibility === 'hidden' || st.display === 'none') return { uygun: false, emin: false, neden: 'görünmüyor' };
  if ((h as HTMLButtonElement).disabled || h.getAttribute('aria-disabled') === 'true') return { uygun: false, emin: false, neden: 'devre dışı' };
  const ALAN = 'input:not([type=button]):not([type=submit]):not([type=reset]):not([type=image]), select, textarea';
  if (h.parentElement?.querySelector(ALAN) || h.closest('label')) return { uygun: false, emin: false, neden: 'bir alanın parçası' };
  // Yazısız öğe (simge): kullanıcıya neye basılacağı söylenemez.
  const ad = (h.innerText || (h as HTMLInputElement).value || h.getAttribute('aria-label') || h.getAttribute('title') || '').trim();
  if (!ad) return { uygun: false, emin: false, neden: 'yazısız' };
  const etiket = h.tagName.toLowerCase();
  const tur = (h.getAttribute('type') || '').toLowerCase();
  const form = (h as HTMLButtonElement).form ?? null;
  const gonderir = Boolean(form) && ((etiket === 'button' && (tur === '' || tur === 'submit')) || (etiket === 'input' && ['submit', 'image'].includes(tur)));
  if (gonderir) return { uygun: true, emin: false, neden: 'formu gönderir' };
  const href = etiket === 'a' ? (h.getAttribute('href') ?? '').trim() : null;
  if (href !== null && href !== '' && !href.startsWith('#') && !/^javascript:/i.test(href)) return { uygun: false, emin: false, neden: 'başka sayfaya gider' };
  if (h.hasAttribute('aria-expanded') || h.hasAttribute('aria-controls')) return { uygun: true, emin: true, neden: 'sayfa içinde bir bölümü açar / kapatır' };
  if (h.getAttribute('role') === 'tab') return { uygun: true, emin: true, neden: 'sekme' };
  if (etiket === 'summary' || h.closest('summary')) return { uygun: true, emin: true, neden: 'ayrıntıyı açar' };
  if (href !== null && href !== '') return { uygun: true, emin: true, neden: 'sayfa içi bağlantı' };
  // Yalnız betikle çalışan düğme (type=button, onclick / sayfa içi işleyici): ne yaptığı sayfadan anlaşılamaz → emin değil (sorulur).
  return { uygun: true, emin: false, neden: 'betikle çalışıyor; ne yaptığı sayfadan anlaşılamıyor' };
}

/**
 * Hayır izninin sayfa korumalarını (form gönderimi + düğme tıklaması; sayfa-envanteri.ts) GİRİŞ VE BAĞLAM DEĞİŞTİRME BİTTİKTEN SONRA
 * açar: bağlamın init betiği olarak eklenir (bundan sonraki her belge ve çerçeve, sayfanın ilk betiğinden önce korunur) ve o an açık
 * belgelere de uygulanır (korumalar tekrar kurulmaz). Bayraklı (her belgede açılıp kapanan) bir koruma yerine bu sıra seçildi: init
 * betiği yeni belgede eşzamanlı çalışır, oysa Node'dan gelen "etkin" bayrağı (exposeBinding / evaluate) belgeye ancak sonradan ulaşır;
 * bu arada sayfanın betiği korumasız kalabilirdi. Koruma açıldıktan sonra bu bağlamda yeniden giriş yapılmaz: saklanan oturumun
 * geçersizliği / baştan giriş taramaGirisiYap içinde (korumadan önce), "Tarayıcıyı yeniden aç" ise yeni bağlamla aynı sırayla çalışır.
 */
async function hayirKorumasiniAc(baglam: BrowserContext): Promise<void> {
  await baglam.addInitScript(formGonderimKorumasi);
  await baglam.addInitScript(dugmeTiklamaKorumasi);
  for (const p of baglam.pages()) {
    for (const f of p.frames()) {
      await f.evaluate(formGonderimKorumasi).catch(() => undefined);
      await f.evaluate(dugmeTiklamaKorumasi).catch(() => undefined);
    }
  }
}

export type KomutAlici = () => Promise<HizliKomut | null>;
export type HizliGonderici = (o: HizliOlay) => Promise<void>;

/** Hızlı testi yürütür; "bitir" komutu ya da pencere kapanınca döner. Hata / iptalde TaramaHatasi / GirisHatasi fırlatır. */
export async function hizliTestiYurut(
  browser: Browser, g: TaramaGirdisi, olay: OlayGonderici, komutAl: KomutAlici, gonder: HizliGonderici, oturumGonder?: OturumGonderici
): Promise<HizliTestSonucu> {
  const bildir = (o: TaramaOlayi): void => { void olay(o).catch(() => undefined); };
  const izin = g.hizliTest?.izin ?? 'hayir';
  const basabilir = izin !== 'hayir';
  await olay({ tur: 'adim', adim: 'hazirlik', durum: 'suruyor' });
  if (g.profiller.length > 1) throw new TaramaHatasi('BAGLAM_ADIMI', 'Hızlı test en fazla bir bağlam profiliyle yapılır.');
  const desenler = yasakDesenleri(g.yasakKaliplari.join(','));
  const yasak = yasakliAdresBul(taramaAdresleri(g.tabanUrl, g.hedefAdres, g.tarif, g.profiller.map((p) => p.degerler)), desenler);
  if (yasak) throw new TaramaHatasi('YASAKLI_ADRES', yasakliTaramaMesaji(yasak));

  const baglam = await browser.newContext({
    baseURL: g.tabanUrl, ...taramaTarayiciAyarlari(g).baglam, acceptDownloads: false, serviceWorkers: 'block', ...oturumBaglamSecenegi(g)
  });
  const durum: { asama: TaramaAsamasi } = { asama: 'hazirlik' };
  /** Hızlı testte ağ isteklerine kısıt yok: hangi bağlantıya gidileceğini ve neye basılacağını kullanıcı belirler (sorgu isteği de gider). */
  const okumaAsamasi: TaramaAsamasi = 'kayit';
  const engellenenler: EngellenenIstek[] = [];
  // Sayfa izleme: yalnız kısa ömürlü, anlamlı istekler sayılır (uzun yoklama / SSE / websocket / beacon / görüntü sayılmaz; ag-sakinligi.ts).
  const ag = new AgIzleyici(baglam);
  await baglam.route('**/*', async (route) => {
    const r = route.request();
    const karar = istekKarari({ yontem: r.method(), adres: r.url(), asama: durum.asama, yasakDesenleri: desenler, izinliKokenler: g.izinliKokenler });
    if (karar.izin) { await route.fallback(); return; }
    engellenenler.push({ yontem: r.method(), adres: adresOzeti(r.url()), asama: durum.asama, neden: karar.neden });
    if (engellenenler.length <= 200) bildir({ tur: 'engellendi', yontem: r.method(), adres: adresOzeti(r.url()), asama: durum.asama, neden: karar.neden });
    await route.abort('blockedbyclient');
  });
  await baglam.routeWebSocket(/.*/, (ws) => {
    const url = ws.url();
    const koken = (() => { try { return new URL(url.replace(/^ws/, 'http')).origin; } catch { return ''; } })();
    const izinsiz = g.izinliKokenler && g.izinliKokenler.length ? !g.izinliKokenler.includes(koken) : false;
    if (adresYasakliMi(url.replace(/^ws/, 'http'), desenler) || izinsiz) {
      bildir({ tur: 'engellendi', yontem: 'WS', adres: adresOzeti(url), asama: durum.asama, neden: 'websocket' });
      void ws.close();
      return;
    }
    ws.connectToServer();
  });
  await olay({ tur: 'adim', adim: 'hazirlik', durum: 'tamam' });

  const notlar: string[] = [];
  /** Sayfanın tarayıcı pencerelerinin (alert / confirm / prompt) metinleri: sonraki farka / bitiş denetimine girer. */
  const diyaloglar: string[] = [];
  /** Pencereler ve verilen yanıtlar (bu komut boyunca): basışın farkına ve modele (aksiyonun diyalog yanıtı) gider. */
  const diyalogKayitlari: HizliDiyalog[] = [];
  let kapandi = false;
  let secimCevabi: ((v: Record<string, unknown>) => void) | null = null;
  /** Komut kuyruğu: pencere sorusu / seçim beklenirken gelen başka komutlar sırayla işlenir. */
  const kuyruk: HizliKomut[] = [];
  /** Yanıt bekleyen açık pencere (yanıtlanınca çözülür). */
  let acikDiyalog: Promise<void> | null = null;
  /** Tıklama yarışı: pencere açılınca tıklama "tamam" sayılır (pencere yanıtlanana kadar tıklama dönmez). */
  let diyalogAcildi: (() => void) | null = null;
  /** Doğrulama koşusunda o anki basışın kaydedilmiş pencere yanıtı (yoksa izin kuralı). */
  let planYaniti: 'kabul' | 'iptal' | null = null;
  /** Bana sor: pencereyi kullanıcıya soracak komutun numarası (yalnız basış sırasında; diğer anlarda izin kuralı). */
  let soruNo: number | null = null;

  /**
   * Pencere sorusu (Bana sor): sunucuya bildirilir, kullanıcının yanıtı "diyalogYaniti" komutuyla gelir. Bu arada gelen başka komutlar
   * kuyruğa alınır; "bitir" gelirse ya da tarayıcı kapanırsa pencere iptal edilir (hiçbir yerde takılı kalınmaz).
   */
  async function kullaniciyaSor(no: number, tur: HizliDiyalog['tur'], mesaj: string): Promise<'kabul' | 'iptal'> {
    await gonder({ olay: 'diyalog', no, tur, mesaj }).catch(() => undefined);
    for (;;) {
      if (kapandi) return 'iptal';
      const k = await komutAl();
      if (!k) continue;
      if (k.tur === 'diyalogYaniti') return k.yanit === 'kabul' ? 'kabul' : 'iptal';
      kuyruk.push(k);
      if (k.tur === 'bitir') return 'iptal';
    }
  }

  /**
   * TEK pencere işleyicisi (sayfa açılır açılmaz kurulur; ana sekme ve açılan sekmeler): alert her zaman "Tamam"; confirm / prompt
   * doğrulama koşusunda kaydedilen yanıtla, değilse izne göre — Evet: kabul (prompt varsayılan değeriyle), Bana sor: basış sırasında
   * kullanıcıya sorulur (başka anlarda iptal), Hayır: iptal. Sayfadan ayrılma uyarısı (beforeunload) kabul edilir.
   */
  const diyalogIsle = (d: Dialog): void => {
    const tur = (['alert', 'confirm', 'prompt', 'beforeunload'].includes(d.type()) ? d.type() : 'alert') as HizliDiyalog['tur'];
    const mesaj = d.message().replace(/\s+/g, ' ').trim().slice(0, 200);
    if (mesaj) diyaloglar.push(mesaj);
    let bitti!: () => void;
    const p = new Promise<void>((c) => { bitti = c; });
    acikDiyalog = p;
    diyalogAcildi?.();
    void (async () => {
      let yanit: 'kabul' | 'iptal';
      if (tur === 'alert' || tur === 'beforeunload') yanit = 'kabul';
      else if (planYaniti) yanit = planYaniti;
      else if (izin === 'evet') yanit = 'kabul';
      else if (izin === 'sor' && soruNo !== null) yanit = await kullaniciyaSor(soruNo, tur, mesaj);
      else yanit = 'iptal';
      diyalogKayitlari.push({ tur, mesaj, yanit });
      await (yanit === 'kabul' ? d.accept(tur === 'prompt' ? d.defaultValue() : undefined) : d.dismiss()).catch(() => undefined);
      if (acikDiyalog === p) acikDiyalog = null;
      bitti();
    })();
  };
  /** Açık pencere yanıtlanana kadar bekler (pencere açıkken sayfa okunamaz). */
  const diyalogBitsin = async (): Promise<void> => { while (acikDiyalog && !kapandi) await acikDiyalog; };
  /** Pencere yanıtının günlükteki adı. */
  const yanitAdi = (x: HizliDiyalog): string => (x.tur === 'alert' ? 'Tamam' : x.yanit === 'kabul' ? 'Tamam (onaylandı)' : 'İptal');

  let yayin: CanliYayin | null = null;
  try {
    // "Başka düğmeye bas" köprüsü (şerit yalnız secimAc komutunda kurulur).
    await baglam.exposeBinding(HIZLI_SECIM_KOPRUSU, async (_kaynak, veri: Record<string, unknown>) => {
      if (secimCevabi && nesneMi(veri)) { const c = secimCevabi; secimCevabi = null; c(veri); }
      return { tamam: true };
    });
    await baglam.addInitScript({ content: ENVANTER_BETIGI });
    // Hayır izninin sayfa korumaları (form gönderimi / düğme tıklaması) burada DEĞİL, giriş ve bağlam değiştirme bittikten sonra
    // konur (hayirKorumasiniAc): giriş formu ve bağlam adımlarının form gönderimi normal koşudaki gibi engelsiz çalışır.
    // Pencere işleyicisi sayfa OLUŞTURULUR OLUŞTURULMAZ kurulur (ana sekme dahil): açılışta / ilk basışta çıkan confirm de yakalanır.
    const dinlenen = new WeakSet<Page>();
    const sayfayiDinle = (p: Page): void => { if (dinlenen.has(p)) return; dinlenen.add(p); p.on('dialog', diyalogIsle); };
    let ilkSayfa: Page | null = null;
    baglam.on('page', (p: Page) => {
      sayfayiDinle(p);
      if (ilkSayfa && p !== ilkSayfa) notlar.push('Sayfa yeni bir sekme / pencere açtı; hızlı test ilk sekmede sürer.');
    });
    const islem = await baglam.newPage();
    ilkSayfa = islem;
    // "Tarayıcıda şu an" sürekli kare akışı (yalnız izlenirken; kareler bellekte). Kurulamazsa arayüz son görüntüyü gösterir.
    yayin = await canliYayinKur(baglam, islem, { duyuruYolu: process.env[CANLI_DUYURU_DEGISKENI], gorunur: process.env[TARAMA_GORUNUR_DEGISKENI] === '1' })
      .catch(() => null);
    sayfayiDinle(islem);
    islem.on('close', () => { kapandi = true; });
    browser.on('disconnected', () => { kapandi = true; });
    if (g.tarif) {
      durum.asama = 'giris';
      await olay({ tur: 'adim', adim: 'giris', durum: 'suruyor' });
      if (!g.kimlik) throw new TaramaHatasi('TARIF_GECERSIZ', 'Bu ortam için giriş profili tanımlı değil (Ayarlar > Giriş profilleri).');
      let yontem: TaramaGirisYontemi;
      try {
        yontem = await taramaGirisiYap(islem, g, bildir, oturumGonder);
      } catch (hata) {
        await olay({ tur: 'adim', adim: 'giris', durum: 'hata', mesaj: hataBilgisi(hata).mesaj });
        throw hata;
      }
      await olay({ tur: 'giris', yontem });
      await olay({ tur: 'adim', adim: 'giris', durum: 'tamam', mesaj: girisYontemiMesaji(yontem) });
    } else {
      await olay({ tur: 'adim', adim: 'giris', durum: 'atlandi', mesaj: 'Giriş tarifi yok; sayfa girişsiz açılıyor.' });
    }
    await olay({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: 'Sayfa açılıyor…' });
    const profil = g.profiller[0] ?? { ad: null, degerler: null };
    if (profil.degerler && g.tarif?.baglamDegistirme) {
      durum.asama = 'baglam';
      // Bağlam değiştirme normal koşuyla AYNI işlev (giris-motoru.ts > baglamiDegistir): beklemeler ve hata iletileri aynı.
      await olay({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: `Bağlam değiştiriliyor (${g.tarif.baglamDegistirme.baglamTuru}: ${profil.ad ?? '—'})…` });
      try {
        await baglamiDegistir(islem, g.tarif, profil.degerler);
      } catch (hata) {
        await olay({ tur: 'adim', adim: 'hizli', durum: 'hata', mesaj: hataBilgisi(hata).mesaj });
        throw hata;
      }
      // Yazma engeli açılmadan önce bağlam değiştirmenin son isteği bitsin (açılır penceredeki form gönderimi geç kalıp engellenmesin).
      await isteklerBitsin(islem);
    }
    // Hayır izni: giriş ve bağlam TAMAMLANDI; sayfanın kendi betiği de artık form gönderemez / düğmeye basamaz (sunucu zaten "bas"
    // göndermez). Hedef sayfaya gidilmeden önce açılır: hedef belge ilk betiğinden itibaren korumalıdır.
    if (!basabilir) await hayirKorumasiniAc(baglam);
    durum.asama = okumaAsamasi;
    const ac = async (): Promise<void> => {
      await hedefSayfayiAc(islem, g.hedefAdres, taramaTarayiciAyarlari(g).sayfaAcilmaMs, g.hedefYol);
      await sakinles(islem, 10_000);
    };
    await ac();
    const captcha = await captchaAlgila(islem);
    if (captcha.length) throw new TaramaHatasi('CAPTCHA', `Hedef sayfada CAPTCHA görüldü (${captcha.slice(0, 2).join('; ')}); otomasyon CAPTCHA çözmez.`);
    if (g.tarif && (await islem.locator(g.tarif.parolaAlani).first().isVisible().catch(() => false))) {
      throw new TaramaHatasi('OTURUM_GECERSIZ', `Hedef sayfa yerine giriş sayfası açıldı (${yolu(islem.url())}): oturum geçersiz ya da bu profil sayfaya erişemiyor.`);
    }

    /**
     * Sayfa sakinleşene kadar (en çok sureMs): bekleme göstergesi yok, sayılan istek yok ve son istek etkinliğinden beri kısa bir sessizlik.
     * Sayılmayanlar (ag-sakinligi.ts): uzun yoklama / SSE / websocket / beacon / görüntü; enUzunMs'den uzun bekleyen istek (adresi
     * öğrenilir, sonraki istekleri de sayılmaz). Böylece sürekli açık isteği olan sitede her alanda süre sonuna kadar beklenmez.
     * Görülen bekleme metinlerini döner.
     */
    /**
     * Sayfa içi MESAJ pencerelerini (kapatma düğmesinden başka denetimi olmayan uyarı kutusu) kapatır; en çok 3 pencere. Metinleri
     * çağırandan önce okunmuştur. Akış penceresi (seçenek / bağlantı içeren) kalır. Doğrulama koşusunda çağrılmaz (bitiş görmeli).
     * Dönüş: kapatılan pencere var mı.
     */
    async function mesajPenceresiniKapat(): Promise<boolean> {
      let kapandi = false;
      for (let i = 0; i < 3; i++) {
        const m = await islem.evaluate(sayfaIciUyari, { yalnizMesaj: true as const }).catch(() => null);
        if (!m) break;
        kapandi = true;
        notlar.push(`Sayfanın mesaj penceresi kapatıldı: “${m.slice(0, 160)}”.`);
        await sakinles(islem, 2_000);
      }
      return kapandi;
    }

    async function sakinles(page: Page, sureMs: number, enUzunMs = UZUN_ISTEK_MS): Promise<{ metinler: string[]; zamanAsimi: boolean }> {
      const bas = Date.now();
      const metinler = new Set<string>();
      await page.waitForTimeout(100);
      while (Date.now() - bas < sureMs) {
        if (kapandi) break;
        const b = await page.evaluate(beklemeDurumu, { kaliplar: { ...KALIPLAR } }).catch(() => ({ bekliyor: true, metinler: [] as string[] }));
        for (const m of b.metinler) metinler.add(m);
        if (!b.bekliyor && ag.sakinMi(0, { enUzunMs })) return { metinler: [...metinler], zamanAsimi: false };
        await page.waitForTimeout(100);
      }
      return { metinler: [...metinler], zamanAsimi: !kapandi };
    }

    /**
     * Sayfanın görünümü değişmeyi bırakana kadar bekler (en çok sureMs): düğmeye basınca açılan pencere / form içeriği
     * gecikmeli çizilir (istek bitse de). Parmak izi: görünen metin uzunluğu + form alanı ve düğme sayısı; 1 sn değişmezse sakin.
     */
    async function gorunumSakinles(page: Page, sureMs: number): Promise<void> {
      const bas = Date.now();
      let onceki = '';
      let sabitSince = Date.now();
      while (Date.now() - bas < sureMs && !kapandi) {
        // Bağlantı biçimli düğmeler ve açılan pencereler de parmak izine girer (pencere önce boş açılıp içi sonra çizilebilir).
        const iz = await page.evaluate(() => `${document.body.innerText.length}|${document.querySelectorAll('input,select,textarea,button,a,[role="link"],[role="button"]').length}|${
          [...document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"]')].map((d) => (d as HTMLElement).innerText.length).join(',')}|${location.pathname}`).catch(() => '');
        if (iz !== onceki) { onceki = iz; sabitSince = Date.now(); } else if (Date.now() - sabitSince >= 1_000) return;
        await page.waitForTimeout(200);
      }
    }

    /** Aynı kökenli çerçeveler (iframe; en çok 10): sonuç metinleri ve doğrulamada aranan metin onların içinde de olabilir. */
    const ayniKokenCerceveler = (page: Page): Frame[] => {
      let koken = '';
      try { koken = new URL(page.url()).origin; } catch { return []; }
      return page.frames().filter((f) => f !== page.mainFrame()).filter((f) => { try { return new URL(f.url()).origin === koken; } catch { return false; } }).slice(0, 10);
    };
    /** Görünen metinler: ana belge + aynı kökenli çerçeveler (aynı metin bir kez). */
    async function metinleriTopla(page: Page): Promise<HizliMetin[]> {
      const ayar = { kaliplar: { ...KALIPLAR }, enCok: 150 };
      const l = (await page.evaluate(hizliMetinleriTopla, ayar).catch(() => [])) as HizliMetin[];
      for (const f of ayniKokenCerceveler(page)) {
        for (const m of ((await f.evaluate(hizliMetinleriTopla, ayar).catch(() => [])) as HizliMetin[])) if (!l.some((x) => x.metin === m.metin)) l.push(m);
      }
      return l.slice(0, 150);
    }
    /** Sayfanın tüm görünen yazısı (ana belge + aynı kökenli çerçeveler): bitiş / hata metni aranır. */
    async function govdeMetni(page: Page): Promise<string> {
      const parcalar = [await page.locator('body').innerText().catch(() => '')];
      for (const f of ayniKokenCerceveler(page)) parcalar.push(await f.locator('body').innerText({ timeout: 1_000 }).catch(() => ''));
      return parcalar.filter(Boolean).join('\n');
    }

    /**
     * Doldurmadan sonra sayfa görünümünün durulmasını bekler: görünüm parmak izi (görünür metin uzunluğu, görünür alan / düğme sayısı,
     * açık pencereler; guvenli-tiklama.ts) en az DURULMA_MS değişmeden kalana kadar, en çok DURULMA_EN_COK_MS. Alana yazdıktan bir süre
     * sonra (debounce / zamanlayıcı + sorgu) beliren zorunlu alanlar böylece aynı veri durağında sorulur, otomatik basıştan önce görülür.
     */
    async function gorunumDurulsun(page: Page): Promise<void> {
      const bas = Date.now();
      let onceki = await sayfaParmakIzi(page);
      let sabit = Date.now();
      while (!kapandi && Date.now() - bas < DURULMA_EN_COK_MS) {
        await page.waitForTimeout(200);
        const iz = await sayfaParmakIzi(page);
        if (iz !== onceki || !ag.sakinMi(0, { enUzunMs: UZUN_ISTEK_MS })) { onceki = iz; sabit = Date.now(); continue; }
        if (Date.now() - sabit >= DURULMA_MS) return;
      }
    }

    /** Sayfanın okuması (değer yok). goruntu: JPEG ekran görüntüsü (yalnız bellekte; sunucuya gider). */
    async function anlikOku(page: Page, goruntu: boolean): Promise<HizliAnlik> {
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      const envanter = await envanterOku(page, { degerOku: true }).catch(() => ({ alanlar: [] as HamAlan[], baslik: '' }));
      // "Devam et" listesi: sayfadaki tüm görünür düğmeler (sonradan beliren düğmeler puan sınırına takılmasın).
      const eylem = await eylemAdaylariniCikar(page, { dugmeSiniri: 60, cerceveler: true });
      const metinler = await metinleriTopla(page);
      const dugmeler: HizliDugme[] = eylem.gonderim.map((a) => ({
        secici: a.secici, metin: a.metin, kayitOlusturabilir: a.kayitOlusturabilir === true, guven: a.guven, enOlasi: a.enOlasi, baglanti: a.baglanti === true, ...(a.cerceve?.length ? { cerceve: a.cerceve } : {}),
        ...(a.pencerede ? { pencerede: true } : {}), ...(a.arkada ? { arkada: true } : {}), ...(a.alanIkonu ? { alanIkonu: true } : {})
      }));
      let resim: string | null = null;
      if (goruntu) resim = await page.screenshot({ type: 'jpeg', quality: 55, timeout: 10_000 }).then((b) => b.toString('base64'), () => null);
      return { yol: yolu(page.url()), baslik: await page.title().catch(() => ''), alanlar: envanter.alanlar, metinler, dugmeler, eylem, goruntu: resim };
    }

    /** Son doldurmada seçeneğini beklemek gereken listeler: anahtar → bekleme (ms; bağlı listenin dolma süresi ölçümü). */
    let beklemeler: Record<string, number> = {};
    /** Son doldurmada yazılan değeri tutmayan, sayfanın ESKİ değerini geri yazdığı alanlar (düzenlenemez kanıtı; alan-cikisi.ts > alanaYaz). */
    const kilitliYazilan = new Set<string>();
    /** Bir alanı doldurur (değer kullanıcının; motor üretmez). Hata metni döner (başarılıysa null). */
    async function alaniDoldur(page: Page, d: HizliDoldurulan): Promise<string | null> {
      const a = d.alan;
      const bekleMs = taramaTarayiciAyarlari(g).alanIslemMs;
      const k = alanKapsami(page, a.cerceve);
      const deger = d.deger;
      try {
        // Dosya alanı: değer, kullanıcının seçtiği dosyanın (Nöbetçi'nin şifreli deposundan) oturuma özel geçici kopyasının mutlak yolu;
        // tarayıcı dosya girdisine yüklenir (normal koşu da setInputFiles ile).
        if (a.tur === 'file') {
          const yol = typeof deger === 'string' ? deger : '';
          if (!yol || !isAbsolute(yol) || !existsSync(yol)) return `“${a.etiket ?? d.anahtar}”: dosya seçilmedi ya da hazırlanamadı; veri durağında dosyayı yeniden seçin.`;
          await k.locator(a.secici).first().setInputFiles(yol, { timeout: bekleMs });
          await sakinles(page, Math.min(bekleMs, ALAN_SAKINLIK_EN_COK_MS));
          return null;
        }
        if (a.tur === 'radio') {
          const r = (a.radyolar ?? []).find((x) => x.deger === String(deger) || (x.metin && katla(x.metin) === katla(String(deger))));
          if (!r) return `“${String(deger)}” seçeneği bu alanda yok (seçenekler: ${(a.radyolar ?? []).map((x) => x.metin ?? x.deger).join(', ')}).`;
          // Seçeneğin seçicisi yoksa (eski okuma) grubun adı + değeri.
          const secici = r.secici ?? (a.ad ? `input[type="radio"][name="${a.ad.replace(/["\\]/g, '\\$&')}"][value="${r.deger.replace(/["\\]/g, '\\$&')}"]` : null);
          if (!secici) return `“${String(deger)}” seçeneği sayfada bulunamadı.`;
          // Aynı seçiciye uyan gizli kopya olabilir: görünür olan seçilir.
          const hepsi = k.locator(secici);
          let l = hepsi.first();
          for (let i = 0, n = await hepsi.count(); i < n; i++) {
            if (await hepsi.nth(i).isVisible().catch(() => false)) { l = hepsi.nth(i); break; }
          }
          const secili = (): Promise<boolean> => l.isChecked({ timeout: 2_000 }).catch(() => false);
          // Zaten işaretliyse dokunulmaz.
          if (await secili()) return null;
          if (await l.isVisible().catch(() => false)) {
            await l.check({ timeout: bekleMs }).catch(async () => { await l.check({ timeout: 5_000, force: true }).catch(() => undefined); });
          }
          // Özel çizimli radyo (girdi gizli / sıfır boyutlu / örtülü): önce etiketine, olmazsa girdiye betikle tıklanır; tıklama sayfanın
          // kendi olaylarını (click → input → change) üretir (normal koşu aynı: model-kosucu.ts > radyoIsaretle).
          if (!(await secili())) {
            await l.evaluate((e) => {
              const r = e as HTMLInputElement;
              const etiket = r.labels?.[0];
              if (etiket && !etiket.contains(r)) etiket.click();
              if (!r.checked) r.click();
            }, undefined, { timeout: 3_000 }).catch(() => undefined);
          }
          if (!(await secili())) return `“${r.metin ?? r.deger}” seçeneği işaretlenemedi (tıklandı, etiketine ve betikle de denendi; seçim değişmedi).`;
          await sakinles(page, Math.min(bekleMs, ALAN_SAKINLIK_EN_COK_MS));
          return null;
        }
        const l = k.locator(a.secici).first();
        if (a.tur === 'checkbox') {
          // Gizli girdili özel çizimli kutu: görünen çizime (yoksa girdiye) betikle tıklanır (secimeTikla; keşif ve normal koşu aynı).
          if (a.gizliGirdi) {
            const isaretli = dogruMu(deger);
            if ((await l.isChecked({ timeout: bekleMs })) !== isaretli) await l.evaluate(secimeTikla);
            return (await l.isChecked({ timeout: 3_000 })) === isaretli ? null : `“${a.etiket ?? a.anahtar}” işaretlenemedi (betikle tıklandı, durum değişmedi).`;
          }
          await l.setChecked(dogruMu(deger), { timeout: bekleMs });
          return null;
        }
        if (a.tur === 'select' || a.tur === 'select-one' || a.tur === 'select-multiple' || a.ozelBilesen) {
          // Hedef: kaydedilen seçeneklerde değer ya da (harf duyarsız) metinle bulunan seçenek; yoksa verilen değer hem kod hem ad sayılır.
          const s = (a.secenekler ?? []).find((x) => x.deger === String(deger) || katla(x.metin) === katla(String(deger)));
          const aranan = { deger: s ? s.deger : String(deger), metin: s?.metin ?? String(deger) };
          // Bağlı liste: seçenek üst alan seçildikten sonra gelir. Normal koşuyla ORTAK kural (secenek-secimi.ts): tek döngüde her turda
          // değer YA DA metin aranır; liste dolu ve sabitse hedef yoksa erken, açık iletiyle biter.
          const bas = Date.now();
          const r = await secenekBekle(l, aranan, { sinirMs: bekleMs });
          if (!r.secenek) return `${listedeYokMetni(a.etiket ?? d.anahtar, String(deger), r)}.`;
          const hedef = r.secenek.deger;
          // Zaten bu değerdeyse yeniden seçilmez: yeniden seçmek sayfada bağlı alt listeleri boşaltıp yeniden yükletir.
          if ((await l.inputValue({ timeout: 2_000 }).catch(() => null)) === hedef) return null;
          if (a.ozelBilesen) {
            // Önce görünen kutudan (normal koşunun ozelSecim'i gibi): kutuya tıklanır, açılan listede seçeneğin görünen metnine tıklanır —
            // sayfanın bileşeni kendi gösterimini de günceller. Olmazsa gizli listeye değer + input / change olayları.
            const isaret = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
            if (await l.evaluate(ozelBilesenIsaretle, isaret).catch(() => false)) {
              const kutu = k.locator(`[data-nobetci-ozel="${isaret}"]`).first();
              try {
                await kutu.click({ timeout: 3_000 });
                const metin = r.secenek.metin ?? aranan.metin;
                // Açılan liste önce bileşenin kendi kabında (gizli listeyi saran öğe), yoksa sayfada aranır (gövdeye eklenen açılır listeler).
                const kabinda = l.locator('xpath=..').getByText(metin, { exact: true }).filter({ visible: true }).first();
                const secenek = (await kabinda.count()) ? kabinda : k.getByText(metin, { exact: true }).filter({ visible: true }).first();
                await secenek.click({ timeout: 3_000 });
                await sakinles(page, Math.min(bekleMs, ALAN_SAKINLIK_EN_COK_MS));
              } catch { /* görünen kutudan seçilemedi: yedek yol */ } finally {
                await kutu.evaluate((e) => e.removeAttribute('data-nobetci-ozel'), undefined, { timeout: 1_000 }).catch(() => undefined);
              }
              if ((await l.inputValue({ timeout: 2_000 }).catch(() => null)) === hedef) {
                if (Date.now() - bas > 300) beklemeler[d.anahtar] = Date.now() - bas;
                return null;
              }
            }
            const yazildi = await l.evaluate((el, v) => {
              const sec = el as HTMLSelectElement;
              if (![...sec.options].some((o) => o.value === v)) return false;
              sec.value = v;
              sec.dispatchEvent(new Event('input', { bubbles: true }));
              sec.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }, hedef).catch(() => false);
            if (!yazildi) return `“${String(deger)}” seçeneği seçilemedi (liste değişti).`;
          } else {
            // Seçilemezse (liste kilitli / gizli bir bileşenle sarılı): zincir keşfinin sağlam yolu (etkinleşme beklenir, olmazsa değer +
            // input / change olayları — normal koşunun özel bileşen yolu).
            await l.selectOption({ value: hedef }, { timeout: 5_000 }).catch(async () => { await listedenSec(page, a, hedef, Math.min(bekleMs, 15_000)); });
          }
          if (Date.now() - bas > 300) beklemeler[d.anahtar] = Date.now() - bas;
          return null;
        }
        // Takvimden seçilen (salt okunur) tarih alanı: değer + olaylar, olmazsa takvimden gün (alan-cikisi.ts > takvimdenYaz; normal koşu aynı).
        if (a.takvimden) {
          const h = await takvimdenYaz(l, String(deger), bekleMs);
          if (h) return h;
          await sakinles(page, Math.min(bekleMs, ALAN_SAKINLIK_EN_COK_MS));
          return null;
        }
        // Aynı değer sayfada zaten varsa (önceki turda girildi; site alanı sorgudan sonra kilitlemiş olabilir) yeniden yazılmaz.
        if (await alanZatenDolu(l, String(deger))) return null;
        // Otomatik tamamlama: yaz → öneri listesini bekle → eşleşen öneriyi seç (liste açılmazsa sıradan metin gibi devam; normal koşu aynı).
        if (a.oneri) {
          const r = await oneridenYaz(l, String(deger), bekleMs);
          if (r !== 'secildi' && r !== 'liste-yok') return `“${a.etiket ?? d.anahtar}”: ${r}`;
          await alandanCik(l);
          await sakinles(page, Math.min(bekleMs, ALAN_SAKINLIK_EN_COK_MS));
          return null;
        }
        // Ortak yazma kuralı (alan-cikisi.ts > alanaYaz): kısa tek satırlı metin gerçek tuşlarla yazılır (maske / keyup sorgusu çalışır, yaz-sil-yaz
        // olmaz); uzun metin doğrudan. Alandan çıkınca sayfanın sorgusu / yeniden çizimi beklenir (kısa üst sınır; uzun istekler sayılmaz).
        // Önceden dolu (varsayılan değerli) alanın üzerine de yazılır; değer sayfadakiyle karşılaştırılır, tutmazsa tümü seçilip silinerek
        // yeniden yazılır, yine tutmazsa açık alan hatası.
        const sonuc = await alanaYaz(l, String(deger), { zamanAsimiMs: bekleMs, sonra: async () => { await sakinles(page, Math.min(bekleMs, ALAN_SAKINLIK_EN_COK_MS)); } });
        // Değer tutmadı ve sayfa ÖNCEKİ değeri geri yazdı: alan sayfa tarafından dolduruluyor (düzenlenemez) — hata değil, sunucuya bildirilir.
        if (sonuc === 'kilitli') { kilitliYazilan.add(d.anahtar); return null; }
        const yh = await yazmaHatasi(l, String(deger), sonuc, a.etiket ?? d.anahtar);
        if (yh) return yh;
        // "Yazıp Enter'a basın" alanı (etiket / beceri girdisi): değer Enter ile eklenir (normal koşu aynı: doldurucuParametreleri.tus).
        if (a.tus) { await l.press(a.tus, { timeout: 3_000 }); await sakinles(page, Math.min(bekleMs, ALAN_SAKINLIK_EN_COK_MS)); }
        return null;
      } catch (hata) {
        const neden = await alanDurumu(k.locator(a.secici).first());
        return `“${a.etiket ?? d.anahtar}” alanı doldurulamadı, ${Math.round(bekleMs / 1000)} sn beklendi: ${neden} (${adreslerGizli(ilkSatir(hata))}).`;
      }
    }

    /** Doldurulamayan alanın neden yazılamadığını söyler (bulunamadı / görünmüyor / devre dışı / salt okunur). */
    async function alanDurumu(l: Locator): Promise<string> {
      try {
        if ((await l.count()) === 0) return 'alan sayfada bulunamadı (sayfa değişmiş ya da alan henüz açılmamış olabilir)';
        if (!(await l.isVisible())) return 'alan sayfada görünmüyor (başka bir alan doldurulunca ya da sorgu bitince açılıyor olabilir)';
        if (!(await l.isEnabled())) return 'alan devre dışı (önceki adım tamamlanmadan açılmıyor olabilir)';
        if (!(await l.isEditable())) return 'alan salt okunur';
        return 'alan görünür ve etkin, ancak başka bir öğe onu örtüyor olabilir';
      } catch {
        return 'alanın durumu okunamadı';
      }
    }

    /**
     * Basıştan sonra sayfa izleme (hızlı test ve doğrulama koşusu): istekler + bekleme göstergesi bitene kadar (sakinles), sonra görünüm
     * sakinleşene kadar; o an bekleme göstergesi / ilerleme ekranı ("…lütfen bekleyiniz", "40%", "Onaylanıyor 0 / 1") HÂLÂ görünüyorsa
     * izleme sürer (ilerleme ekranı ağ isteği olmadan da sürebilir). En çok HIZLI_BASIS_BEKLEME_EN_COK_MS (bas: izlemenin başladığı an).
     */
    async function basisiIzle(page: Page, bas: number): Promise<{ metinler: string[]; zamanAsimi: boolean }> {
      const metinler = new Set<string>();
      const kalan = (): number => HIZLI_BASIS_BEKLEME_EN_COK_MS - (Date.now() - bas);
      let zamanAsimi = false;
      for (;;) {
        const s = await sakinles(page, Math.max(kalan(), 0), BASIS_UZUN_ISTEK_MS);
        for (const m of s.metinler) metinler.add(m);
        zamanAsimi = s.zamanAsimi;
        await gorunumSakinles(page, Math.min(6_000, Math.max(kalan(), 0)));
        const b = await page.evaluate(beklemeDurumu, { kaliplar: { ...KALIPLAR } }).catch(() => ({ bekliyor: false, metinler: [] as string[] }));
        for (const m of b.metinler) metinler.add(m);
        if (!b.bekliyor || kapandi) break;
        if (kalan() <= 0) { zamanAsimi = true; break; }
        await page.waitForTimeout(300);
      }
      return { metinler: [...metinler], zamanAsimi };
    }

    /**
     * Güvenli basış (guvenli-tiklama.ts; normal koşuyla aynı kural): öğe görünür olunca sayfa sakinleşene kadar beklenir (yazma
     * izni bu bekleme bitince açılır), sonra basılır; basış etkisiz kalırsa (istek yok, görünüm aynı) bir kez daha basılır — istek
     * başlatan / sayfayı değiştiren basış asla tekrarlanmaz. Not: tekrar ya da etkisizlik (yoksa null); etkisiz: son basıştan sonra da
     * hiçbir şey değişmedi.
     */
    async function guvenliBas(page: Page, secici: string, metin: string | null, cerceve: string[] | null = null): Promise<{ not: string | null; etkisiz: boolean }> {
      // Düğme aynı kökenli bir çerçevedeyse (iframe) çerçeve seçicileriyle.
      let l = alanKapsami(page, cerceve).locator(secici);
      // Seçici birden çok öğe buluyorsa yazıyla daraltılır (yazı aday listesindeki ayırt edici ekleri taşıyabilir: bulunmazsa daraltılmaz).
      if (metin && (await l.count().catch(() => 0)) > 1) {
        const d = l.filter({ hasText: metin });
        if ((await d.count().catch(() => 0)) > 0) l = d;
      }
      const hedef = l.filter({ visible: true }).first();
      await hedef.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
      await sakinlikBekle(page, hedef, { ag });
      // Düğmeyi örten öğe (ör. açık kalan öneri listesi / açılır menü): Escape, sonra sayfanın boş bir yerine tıklanarak kapatılır;
      // kapanmazsa örten öğe açıkça söylenir (ham "locator.click: Timeout" yerine).
      // Sayfanın kendi yüklenme perdesi örtüyorsa önce kalkması beklenir (en çok Ayarlar'daki alan işlem süresi).
      await ortuyuKaldir(page, hedef, metin ?? secici, { enCokMs: taramaTarayiciAyarlari(g).alanIslemMs, ag });
      // Tıklama ile pencere yarışır: tıklama bir pencere açarsa (confirm / alert) pencere yanıtlanana kadar dönmez; pencere açılınca
      // tıklama yapılmış sayılır, pencerenin yanıtı (izin / kullanıcı) beklenir, sonra izleme sürer.
      const tikla = async (oge: Locator, ms: number): Promise<void> => {
        const acildi = new Promise<'diyalog'>((c) => { diyalogAcildi = () => c('diyalog'); });
        const t = oge.click({ timeout: ms });
        try {
          const r = await Promise.race([t.then(() => 'tamam' as const), acildi]);
          if (r === 'diyalog') t.catch(() => undefined);
        } finally { diyalogAcildi = null; }
      };
      let t: Awaited<ReturnType<typeof guvenliTikla>>;
      try {
        t = await guvenliTikla(page, hedef, { zamanMs: 15_000, ag, sakinlik: false, tikla, ad: metin ?? secici, perdeMs: taramaTarayiciAyarlari(g).alanIslemMs });
      } catch (hata) {
        const m = String(hata instanceof Error ? hata.message : hata);
        const ortu = /(<[a-z][^>]*>[^<]{0,80})(?:<\/[a-z]+>)?[^\n]*intercepts pointer events/i.exec(m)?.[1];
        if (ortu) throw new Error(`“${metin ?? secici}” düğmesine basılamadı: başka bir öğe düğmeyi örtüyor (${ortu.replace(/\s+/g, ' ').slice(0, 120)}). Açık kalan liste / pencere kapatılamadı; önce o öğede seçim yapın ya da pencereyi kapatan düğmeye basın.`);
        if (/Timeout \d+ms exceeded/i.test(m)) throw new Error(`“${metin ?? secici}” düğmesine 15 sn içinde basılamadı: düğme görünür ve etkin olmadı (sayfa değişmiş, düğme devre dışı ya da örtülü olabilir).`);
        throw hata;
      }
      await diyalogBitsin();
      return { not: t.etkisiz ? etkisizTiklamaMetni(metin ?? secici, t.tekrarlandi) : t.tekrarlandi ? TEKRAR_NOTU : null, etkisiz: t.etkisiz };
    }

    /** Düğmeye basar, sonucu bekler ve farkı çıkarır. */
    async function bas(page: Page, secici: string, metin: string | null, once: HizliAnlik, no: number, cerceve: string[] | null = null): Promise<HizliFark> {
      const onceAdres = yolu(page.url());
      const bas = Date.now();
      diyaloglar.length = 0;
      diyalogKayitlari.length = 0;
      soruNo = no;
      let sonuc: { metinler: string[]; zamanAsimi: boolean };
      const onceMetinler = new Set(once.metinler.map((m) => m.metin));
      let tiklamaNotu: string | null = null;
      // Gönderim izi: basış sırasında yazma isteği (POST / PUT / PATCH / DELETE) ya da belge gezinmesi (bitiş önerisinin denetimi).
      let gonderim = false;
      const istekIzi = (r: Request): void => {
        if (r.isNavigationRequest() && r.frame() === page.mainFrame()) gonderim = true;
        else if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()) && ['xhr', 'fetch', 'document', 'other'].includes(r.resourceType())) gonderim = true;
      };
      baglam.on('request', istekIzi);
      // Basıştan önce açık olan sayfa içi pencereler hatırlanır: sonra yalnız YENİ beliren pencere "Açılan pencere görününce bitti" önerilir.
      await page.evaluate(hizliPencereleri, { kaydet: true, isaret: '' }).catch(() => undefined);
      try {
        tiklamaNotu = (await guvenliBas(page, secici, metin, cerceve)).not;
        sonuc = await basisiIzle(page, bas);
        // Basıştan sonra hiç yeni metin görülmediyse (ör. pencere önce yalnız "Kapat" düğmesiyle açılıp içi sonra çizilir) kısa bir süre
        // daha bakılır; yeni metin belirince görünüm yeniden sakinleşene kadar beklenir.
        const yeniMetinVar = async (): Promise<boolean> => (await metinleriTopla(page))
          .some((m) => !onceMetinler.has(m.metin) && m.tur !== 'bekleme' && !m.eylem);
        const pencereAcik = (): Promise<boolean> => page.evaluate(() => [...document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"],.modal')]
          .some((d) => {
            if (d.closest('[id^="nobetci"]')) return false;
            const r = d.getBoundingClientRect();
            const s = getComputedStyle(d);
            return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
          })).catch(() => false);
        if (await pencereAcik() && !(await yeniMetinVar())) {
          for (const son = Date.now() + YENI_METIN_BEKLEME_MS; Date.now() < son && !kapandi;) {
            await page.waitForTimeout(300);
            if (await yeniMetinVar()) {
              const ek = await basisiIzle(page, Date.now());
              sonuc = { metinler: [...new Set([...sonuc.metinler, ...ek.metinler])], zamanAsimi: ek.zamanAsimi };
              break;
            }
          }
        }
      } finally {
        durum.asama = okumaAsamasi;
        baglam.off('request', istekIzi);
        soruNo = null;
      }
      await diyalogBitsin();
      const sonra = await anlikOku(page, true);
      const adresDegisti = onceAdres !== sonra.yol;
      // Sonuç niteliği: yönlendirmeden sonra (adres değişti) ya da yeni beliren başlık sayfanın sonucudur (başlık değişimi).
      const yeniler = sonra.metinler.filter((m) => !onceMetinler.has(m.metin)).map((m) => (m.baslik ? { ...m, sonuc: true } : m));
      const pencereler = diyalogKayitlari.splice(0);
      const pencereMetinleri = new Set(pencereler.map((x) => x.mesaj));
      const yeniMetinler: HizliMetin[] = [
        ...yeniler,
        // Tarayıcı penceresinin metni: bilgi penceresi (alert) basışın sonucudur; onay / soru penceresi (confirm / prompt) bir sorudur.
        ...diyaloglar.splice(0).map((m): HizliMetin => ({
          metin: m, tur: /hata|gecersiz|zorunlu|eksik|error|invalid|required/i.test(katla(m)) ? 'hata' : 'normal',
          sonuc: pencereler.some((x) => x.mesaj === m && x.tur === 'alert') || !pencereMetinleri.has(m)
        }))
      ];
      const onceAlanlar = new Set(once.alanlar.map((a) => a.anahtar));
      const sonraAlanlar = new Set(sonra.alanlar.map((a) => a.anahtar));
      const onceDugmeler = new Set(once.dugmeler.map((d) => d.secici));
      const sayfaPencereleri = await yeniPencereler(page, `p${no}`);
      return {
        basilan: { secici, metin, ...(cerceve?.length ? { cerceve } : {}) }, sureMs: Date.now() - bas, zamanAsimi: sonuc.zamanAsimi, beklemeMetinleri: sonuc.metinler,
        yeniMetinler, yeniAlanlar: sonra.alanlar.filter((a) => !onceAlanlar.has(a.anahtar)),
        kaybolanAlanlar: once.alanlar.filter((a) => !sonraAlanlar.has(a.anahtar)).map((a) => a.anahtar),
        yeniDugmeler: sonra.dugmeler.filter((d) => !onceDugmeler.has(d.secici)),
        adres: adresDegisti ? { once: onceAdres, sonra: sonra.yol } : null, anlik: sonra, tiklamaNotu,
        diyaloglar: pencereler, gonderim: gonderim || adresDegisti, ...(sayfaPencereleri.length ? { pencereler: sayfaPencereleri } : {})
      };
    }

    /**
     * Basıştan sonra YENİ beliren sayfa içi pencereler (dialog / modal) ve tek başına bulunan seçicileri (çıktı öğesi sırası: rol + ad,
     * kimlik, ad…; rakamlı metin seçicisi kullanılmaz). Seçici bulunamayan pencere önerilmez.
     */
    async function yeniPencereler(page: Page, isaret: string): Promise<HizliPencere[]> {
      const sonuc: HizliPencere[] = [];
      try {
        await page.evaluate(`window.__nobetciOgeBilgisi = ${ogeBilgisi.toString()}; 0`);
        const bulunan = await page.evaluate(hizliPencereleri, { kaydet: false, isaret });
        for (const p of bulunan) {
          for (const a of adaySirasi(p.adaylar, 'sonuc')) {
            try {
              const l = page.locator(a.secici);
              if ((await l.count()) !== 1) continue;
              if ((await l.first().getAttribute('data-nobetci-secilen', { timeout: 1_000 })) !== p.isaret) continue;
              sonuc.push({ secici: a.secici, metin: p.metin });
              break;
            } catch { /* geçersiz seçici */ }
          }
        }
      } catch { /* sayfa değişti */ }
      await page.evaluate((o) => { for (const e of document.querySelectorAll(`[data-nobetci-secilen^="${o}-"]`)) e.removeAttribute('data-nobetci-secilen'); }, isaret).catch(() => undefined);
      return sonuc;
    }

    /** "Başka düğmeye bas": kullanıcının sayfada tıkladığı öğe (ya da vazgeçme / başka komut). */
    async function sec(page: Page, no: number, amac: 'dugme' | 'bitis' = 'dugme'): Promise<HizliKomut | null> {
      const isaret = `h${no}`;
      const cevap = new Promise<Record<string, unknown>>((c) => { secimCevabi = c; });
      await page.evaluate(`window.__nobetciOgeBilgisi = ${ogeBilgisi.toString()}; 0`);
      await page.evaluate(hizliSecimSeridiKur, { kopru: HIZLI_SECIM_KOPRUSU, kimlik: HIZLI_SECIM_KIMLIGI, isaret, amac });
      await page.bringToFront().catch(() => undefined);
      // Seçim beklenirken sunucu başka komut gönderebilir (kullanıcı Nöbetçi'de vazgeçti): şerit kapanır, komut işlenir.
      let bekleyenKomut: HizliKomut | null = null;
      const komutBekle = (async (): Promise<'komut'> => {
        for (;;) {
          if (kapandi) return 'komut';
          const k = await komutAl();
          if (k) { bekleyenKomut = k; return 'komut'; }
        }
      })();
      const kazanan = await Promise.race([cevap.then((v) => v), komutBekle]);
      const temizle = async (): Promise<void> => {
        await page.evaluate(() => {
          const w = window as unknown as Record<string, unknown>;
          if (typeof w.__nobetciHizliSecimKapat === 'function') (w.__nobetciHizliSecimKapat as () => void)();
          for (const e of document.querySelectorAll('[data-nobetci-secilen^="h"]')) e.removeAttribute('data-nobetci-secilen');
        }).catch(() => undefined);
      };
      if (kazanan === 'komut') {
        secimCevabi = null;
        await temizle();
        await gonder({ olay: 'secimIptal', no });
        return bekleyenKomut;
      }
      const v = kazanan;
      if (v.tur !== 'secildi') {
        await temizle();
        await gonder({ olay: 'secimIptal', no });
        return await komutBekle.then(() => bekleyenKomut);
      }
      const adaylar = (Array.isArray(v.adaylar) ? v.adaylar : []).filter((a): a is SeciciAdayi => nesneMi(a) && typeof a.secici === 'string' && typeof a.tur === 'string').slice(0, 20);
      let secilen: string | null = null;
      // Bitiş seçiminde çıktı öğesi sırası (rakamlı metin / rol seçicisi kullanılmaz: her koşuda değişebilir).
      for (const a of adaySirasi(adaylar, amac === 'bitis' ? 'sonuc' : 'dugme')) {
        try {
          const l = page.locator(a.secici);
          if ((await l.count()) !== 1) continue;
          if ((await l.first().getAttribute('data-nobetci-secilen', { timeout: 1_000 })) !== isaret) continue;
          secilen = a.secici;
          break;
        } catch { /* geçersiz seçici */ }
      }
      await temizle();
      // Bitiş seçiminde seçicisiz de olsa öğenin yazısı metin olarak kullanılabilir (seçici boş gider; öğe bitişi için sunucu reddeder).
      if (!secilen && amac === 'bitis' && typeof v.metin === 'string' && v.metin.trim()) await gonder({ olay: 'secildi', no, oge: { secici: '', metin: v.metin.slice(0, 200) } });
      else if (!secilen) await gonder({ olay: 'hata', no, mesaj: 'Bu öğe için tek başına bulunan bir seçici üretilemedi; öğenin kendisine ya da yazısına tıklayın.' });
      else await gonder({ olay: 'secildi', no, oge: { secici: secilen, metin: typeof v.metin === 'string' ? v.metin.slice(0, amac === 'bitis' ? 200 : 120) : null } });
      return await komutBekle.then(() => bekleyenKomut);
    }

    /** Doldurulan metin alanlarından değeri sayfa tarafından silinmiş / geri alınmış (boş kalmış) olanları bir kez yeniden doldurur. */
    async function bosKalanlariYenile(page: Page, alanlar: HizliDoldurulan[], atla: string[]): Promise<Array<{ anahtar: string; mesaj: string }>> {
      const hatalar: Array<{ anahtar: string; mesaj: string }> = [];
      await page.waitForTimeout(500); // sayfanın gecikmeli sıfırlaması (zamanlayıcı) gerçekleşsin
      for (const d of alanlar) {
        if (typeof d.deger !== 'string' || !d.deger.trim() || atla.includes(d.anahtar)) continue;
        // Açılır liste: sonraki bir alanın sorgusu / yeniden çizimi listeyi ilk seçeneğine ("SEÇİNİZ") döndürmüş olabilir; değeri artık
        // seçilen değer değilse bir kez yeniden seçilir (normal koşu da aynı kuralı uygular: model-kosucu.ts).
        if (['select', 'select-one'].includes(d.alan.tur)) {
          const s = (d.alan.secenekler ?? []).find((x) => x.deger === String(d.deger) || katla(x.metin) === katla(String(d.deger)));
          const hedef = s ? s.deger : String(d.deger);
          const simdi = await alanKapsami(page, d.alan.cerceve).locator(d.alan.secici).first()
            .evaluate((e) => (e instanceof HTMLSelectElement ? e.value : null), undefined, { timeout: 1_000 }).catch(() => null);
          if (simdi === null || simdi === hedef) continue;
          const h = await alaniDoldur(page, d);
          if (h) hatalar.push({ anahtar: d.anahtar, mesaj: h });
          continue;
        }
        // Metin alanları (boşalan ya da başka alan yüzünden değişen) turuDoldur'un değer izleyicisinde yeniden yazılır.
      }
      return hatalar;
    }

    /** Yazılan değeri sayfadan yeniden okunabilen (metin girdisi gibi) alan mı: tur sonu denetimine girer. Yaz + Enter alanı Enter'dan sonra boş kalır. */
    const yaziAlaniMi = (d: HizliDoldurulan): boolean => typeof d.deger === 'string' && Boolean(d.deger.trim())
      && !['radio', 'checkbox', 'select', 'select-one', 'select-multiple', 'file'].includes(d.alan.tur) && !d.alan.ozelBilesen && !d.alan.tus;

    /**
     * Bir turun alanlarını doldurur (veri durağının "Devam et"i ve doğrulama koşusunun adımı ORTAK). Her alandan sonra önceki yazılan alanlar
     * yeniden okunur (DegerIzleyici: hangi alan hangisini değiştirdi). Tur sonunda: açılır listeler sıfırlandıysa bir kez yeniden seçilir;
     * değeri sayfa tarafından değiştirilen / boşaltılan metin alanları bir kez yeniden yazılır, yine değişirse açık ileti (“Doğum Tarihi”
     * 13.04.1998 yazıldı; “Kimlik No” doldurulunca sayfa 02.10.2026 yaptı). kontrol: sayfaya aynı değerle önceden uygulanmış alanlar
     * (yeniden yazılmaz, yalnız denetlenir). ilkHatada: ilk alan hatasında durulur (doğrulama koşusu).
     */
    async function turuDoldur(
      page: Page, alanlar: HizliDoldurulan[], kontrol: HizliDoldurulan[],
      secenek: { ilerle?: (j: number, d: HizliDoldurulan) => Promise<void>; ilkHatada?: boolean; durul?: boolean } = {}
    ): Promise<Array<{ anahtar: string; mesaj: string }>> {
      const hatalar: Array<{ anahtar: string; mesaj: string }> = [];
      const izleyici = new DegerIzleyici<string>();
      const yer = (d: HizliDoldurulan): Locator => alanKapsami(page, d.alan.cerceve).locator(d.alan.secici).first();
      const ad = (d: HizliDoldurulan): string => d.alan.etiket ?? d.anahtar;
      for (const d of kontrol) if (yaziAlaniMi(d)) await izleyici.yazildi(d.anahtar, ad(d), String(d.deger), yer(d));
      for (const [j, d] of alanlar.entries()) {
        await secenek.ilerle?.(j, d);
        const h = await alaniDoldur(page, d);
        if (h) {
          hatalar.push({ anahtar: d.anahtar, mesaj: h });
          if (secenek.ilkHatada) return hatalar;
          await izleyici.denetle(ad(d));
          continue;
        }
        // Sayfanın doldurduğu (yazılanı geri alan) alan izlenmez: yazılmadı sayılır.
        if (kilitliYazilan.has(d.anahtar)) { await izleyici.denetle(ad(d)); continue; }
        if (yaziAlaniMi(d)) await izleyici.yazildi(d.anahtar, ad(d), String(d.deger), yer(d));
        else await izleyici.denetle(ad(d));
      }
      // Sonradan silinen / geri alınan / değiştirilen alanlar (sayfa arka planda satırı yeniden çizmiş, sorgu alanı doldurmuş olabilir).
      await sakinles(page, 5_000);
      if (secenek.durul) await gorunumDurulsun(page);
      const tumu = [...alanlar, ...kontrol];
      hatalar.push(...await bosKalanlariYenile(page, tumu, hatalar.map((x) => x.anahtar)));
      if (secenek.ilkHatada && hatalar.length) return hatalar;
      const degisen = (await izleyici.degisenler()).filter((x) => !hatalar.some((h) => h.anahtar === x.oge));
      for (const x of degisen) {
        const d = tumu.find((y) => y.anahtar === x.oge);
        if (d) await alaniDoldur(page, d);
      }
      if (degisen.length) await sakinles(page, 5_000);
      for (const x of degisen) {
        const m = await izleyici.sonDurum(x.oge);
        if (m) { hatalar.push({ anahtar: x.oge, mesaj: m }); if (secenek.ilkHatada) return hatalar; continue; }
        const bozan = izleyici.bozani(x.oge);
        notlar.push(`“${x.etiket}” sonradan değişmişti (${x.mevcut.trim() || 'boş'}${bozan ? `; “${bozan}” doldurulunca` : ''}); yeniden yazıldı.`);
      }
      return hatalar;
    }

    /**
     * Doğrulama koşusu: sayfayı yeniden açar, zinciri uygular, bitiş koşulunu bekler. Her adımda / alanda / basışta ilerleme bildirilir
     * (ilerle: adim 0 = sayfa açılıyor, 1..n = planın adımı, n+1 = bitiş bekleniyor) — Nöbetçi hangi adımda olunduğunu gösterir.
     */
    async function dogrula(page: Page, plan: HizliPlan, ilerle: (adim: number, mesaj: string) => Promise<void>): Promise<{ sonuc: 'basarili' | 'basarisiz'; mesaj: string; gorulen: string[] }> {
      const toplam = plan.adimlar.length;
      await ilerle(0, 'Sayfa yeniden açılıyor…');
      await ac();
      const gorulen = new Set<string>();
      /** Son basış etkisiz kaldıysa (iki kez basıldı, hiçbir şey değişmedi) bitiş görülmezse iletiye eklenen açıklama. */
      let sonEtkisiz: string | null = null;
      const hataVar = async (): Promise<string | null> => {
        const govde = `${await govdeMetni(page)}\n${diyaloglar.join('\n')}`;
        return plan.bitis.hata.find((h) => iceriyor(govde, h)) ?? null;
      };
      for (const [i, adim] of plan.adimlar.entries()) {
        const onEk = `${i + 1}/${toplam}. adım`;
        await ilerle(i + 1, `${onEk}: başlıyor…`);
        const once = new Set((await anlikOku(page, false)).metinler.map((m) => m.metin));
        diyaloglar.length = 0;
        if (adim.alanlar.length) {
          // Hızlı testteki turla aynı kural (turuDoldur): ilk alan hatasında durulur; sayfa doldururken alanı silmiş / değiştirmişse bir kez
          // yeniden yazılır, yine değişirse açık ileti.
          const yenile = await turuDoldur(page, adim.alanlar, [], {
            ilkHatada: true, durul: true,
            ilerle: async (j, d) => { await ilerle(i + 1, `${onEk}: “${d.alan.etiket ?? d.anahtar}” dolduruluyor (${j + 1}/${adim.alanlar.length})`); }
          });
          if (yenile[0]) {
            const d = adim.alanlar.find((x) => x.anahtar === yenile[0].anahtar);
            return { sonuc: 'basarisiz', mesaj: `${i + 1}. adımda “${d?.alan.etiket ?? yenile[0].anahtar}” alanı: ${yenile[0].mesaj}`, gorulen: [...gorulen] };
          }
          // Doldururken sayfa hata gösterdiyse (ör. zorunlu alan uyarısı) düğmeye basılmaz: neden açıkça söylenir.
          const sonra = await anlikOku(page, false);
          const yeniHata = [
            ...sonra.metinler.filter((m) => m.tur === 'hata' && !once.has(m.metin)).map((m) => m.metin),
            ...diyaloglar.filter((m) => /hata|gecersiz|zorunlu|eksik|error|invalid|required/i.test(katla(m)))
          ];
          if (yeniHata.length) return { sonuc: 'basarisiz', mesaj: `${i + 1}. adımda alanlar doldurulurken sayfa hata gösterdi: “${yeniHata[0]}”. Alan sırasını ya da değerleri kontrol edin.`, gorulen: [...gorulen, ...yeniHata] };
        }
        await page.waitForTimeout(200);
        if (!adim.bas) continue;
        // Hayır izninde plan basış içeremez (zincirin yeniden kurulması yalnız doldurur; iki katmanlı kural).
        if (!basabilir) return { sonuc: 'basarisiz', mesaj: 'Basma izni “Hayır”: Nöbetçi hiçbir düğmeye basmaz.', gorulen: [...gorulen] };
        await ilerle(i + 1, `${onEk}: “${adim.bas.metin ?? adim.bas.secici}” düğmesine basıldı; sayfa izleniyor…`);
        // Bu basışta açılan pencereye hızlı testte verilen yanıt (normal koşu da aynı yanıtı verir: aksiyonun "diyalog"u).
        planYaniti = adim.bas.diyalog ?? null;
        try {
          const t = await guvenliBas(page, adim.bas.secici, adim.bas.metin, adim.bas.cerceve ?? null);
          sonEtkisiz = t.etkisiz && t.not ? `${i + 1}. adımda ${t.not}` : null;
          if (t.not) await ilerle(i + 1, `${onEk}: “${adim.bas.metin ?? adim.bas.secici}” — ${t.not}`);
          const s = await basisiIzle(page, Date.now());
          for (const m of s.metinler) gorulen.add(m);
        } catch (hata) {
          return { sonuc: 'basarisiz', mesaj: `${i + 1}. adımda “${adim.bas.metin ?? adim.bas.secici}” düğmesine basılamadı (${adreslerGizli(ilkSatir(hata))}).`, gorulen: [...gorulen] };
        } finally {
          durum.asama = okumaAsamasi;
        }
        const h = await hataVar();
        if (h) return { sonuc: 'basarisiz', mesaj: `Hata mesajı göründü: “${h}”.`, gorulen: [...gorulen, h] };
      }
      // Zinciri yeniden kurma (tarayıcı yeniden açıldı): adımlar uygulandı; bitiş koşulu beklenmez.
      if (plan.yenidenKur) return { sonuc: 'basarili', mesaj: 'Zincir yeniden kuruldu.', gorulen: [...gorulen] };
      await ilerle(toplam + 1, 'Bitiş koşulu bekleniyor…');
      const son = Date.now() + plan.zamanAsimiSn * 1000;
      for (;;) {
        const govde = `${await govdeMetni(page)}\n${diyaloglar.join('\n')}`;
        const h = plan.bitis.hata.find((x) => iceriyor(govde, x));
        if (h) return { sonuc: 'basarisiz', mesaj: `Hata mesajı göründü: “${h}”.`, gorulen: [...gorulen, h] };
        const b = plan.bitis.bitti.find((x) => iceriyor(govde, x));
        if (b) return { sonuc: 'basarili', mesaj: `Bitiş mesajı göründü: “${b}”.`, gorulen: [...gorulen, b] };
        // Bitti öğesi (açılan pencere / kutu / düğme): seçicisi görünür olunca bitti (normal koşunun "eleman" göstergesiyle aynı kural).
        for (const x of plan.bitis.ogeler ?? []) {
          if ((await alanKapsami(page, x.cerceve ?? null).locator(x.secici).filter({ visible: true }).count().catch(() => 0)) > 0) {
            return { sonuc: 'basarili', mesaj: `Bitiş öğesi göründü: “${x.secici}”.`, gorulen: [...gorulen] };
          }
        }
        if (plan.bitis.adres && yolu(page.url()).includes(plan.bitis.adres)) return { sonuc: 'basarili', mesaj: `Sayfa adresi “${plan.bitis.adres}” oldu.`, gorulen: [...gorulen] };
        for (const d of plan.bitis.devam) if (iceriyor(govde, d)) gorulen.add(d);
        if (Date.now() >= son || kapandi) return { sonuc: 'basarisiz', mesaj: `Bitiş mesajı görülmedi (${plan.zamanAsimiSn} sn)${sonEtkisiz ? `; ${sonEtkisiz}` : ''}.`, gorulen: [...gorulen] };
        await page.waitForTimeout(250);
      }
    }

    /** Keşfin sonucu (seçim keşfinin tam biçimi) → hızlı testin sade biçimi (gezinen / hata veren değerler atılır; iç içe: ust). */
    const sadeKesif = (k: import('./paket-olusturucu.mjs').Kesif): HizliKesif => ({
      secim: k.secim, ilkDeger: k.ilkDeger, tur: String(k.tur ?? ''), ust: k.ust ?? null,
      degerler: k.degerler.filter((d) => !d.gezinme && !d.hata).map((d) => ({
        deger: d.deger, metin: d.metin ?? null, gorunenler: d.gorunenler, kaybolanlar: d.kaybolanlar,
        ...(d.secenekler ? { secenekler: d.secenekler } : {}), ...(d.etkinlesenler?.length ? { etkinlesenler: d.etkinlesenler } : {}),
        ...(d.etiketler && Object.keys(d.etiketler).length ? { etiketler: d.etiketler } : {}),
        ...(d.kurallar && Object.keys(d.kurallar).length ? { kurallar: d.kurallar } : {}),
        ...(d.kilitler && Object.keys(d.kilitler).length ? { kilitler: d.kilitler } : {})
      }))
    });
    /** İç içe keşfin en çok derinliği (üst seçim → alt seçim → onun altı). */
    const IC_ICE_DERINLIK = 3;

    /**
     * Seçim keşfi: sayfa ilk açıldığında tüm alanlar boştur; bu yüzden seçim alanlarının (açılır liste, radyo, onay kutusu) her değeri
     * tek tek denenir ve her değerde beliren / kaybolan / adı değişen alanlar kaydedilir; sonunda ilk değerler geri yüklenir. İÇ İÇE: bir
     * değer seçilince beliren seçim alanları da (üst değer uygulanmışken) aynı kurallarla denenir (en çok 3 düzey; tarama-motoru.ts >
     * secimleriKesfet). Hiçbir düğmeye / bağlantıya basılmaz.
     */
    async function secimKesfi(): Promise<HizliKesif[]> {
      const sinir = taramaTarayiciAyarlari(g).kesifSecenekSiniri;
      const sakin = async (p: Page, ms: number): Promise<void> => { await sakinles(p, ms); };
      let temel;
      try { temel = await envanterOku(islem); } catch { return []; }
      let tumu: import('./paket-olusturucu.mjs').Kesif[] = [];
      try { tumu = await secimleriKesfet(islem, temel, [], ac, sakin, sinir, { derinlik: IC_ICE_DERINLIK }); } catch { tumu = []; }
      // Bağlı liste zincirinin başlangıcı yalnız açılışta görünen seçimler (iç içe olanlar üst değer uygulanmadan sayfada yoktur).
      kesifTabani = { alanlar: temel.alanlar, kesifler: tumu.filter((k) => !k.ust) };
      if (tumu.some((k) => k.ust)) await ac().catch(() => undefined); // temiz başlangıç durumu
      return tumu.filter((k) => k.degerler.length).map(sadeKesif);
    }

    /** Seçim keşfinin ilk okuması ve birinci düzey sonuçları (bağlı liste zincirinin başlangıcı). */
    let kesifTabani: { alanlar: HamAlan[]; kesifler: Parameters<typeof zincirKesfet>[2] } | null = null;

    /**
     * Bağlı liste zinciri (zincir-motoru.ts): seçim keşfinin bulduğu bağlantılardan (ör. üst liste seçilince alt liste doluyor) zincirin
     * sonuna kadar inilir; her katta birkaç değer denenir, boş kalan / hata veren / tekrarlayan listeler bulgu olur. Hiçbir düğmeye basılmaz;
     * sonunda sayfa yeniden açılır (temiz başlangıç durumu).
     */
    async function zincirKesfi(): Promise<ZincirSonucu | null> {
      if (!kesifTabani) return null;
      const t = taramaTarayiciAyarlari(g);
      const z = await zincirKesfet({
        sayfa: islem, ac, sakinles: async (p, ms) => { await sakinles(p, ms); },
        oku: async () => (await envanterOku(islem)).alanlar,
        hataMetinleri: async () => ((await islem.evaluate(hizliMetinleriTopla, { kaliplar: { ...KALIPLAR }, enCok: 150 }).catch(() => [])) as HizliMetin[])
          .filter((m) => m.tur === 'hata').map((m) => m.metin),
        durdu: () => kapandi,
        ilerleme: (m) => bildir({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: `${m} (hiçbir düğmeye basılmaz)` })
      }, kesifTabani.alanlar, kesifTabani.kesifler, { derinlik: t.zincirDerinligi, ornek: t.zincirOrnek });
      if (z.acilis) await ac().catch(() => undefined);
      return z.iliskiler.length ? z : null;
    }

    /** Verilen listelerin hepsinde gerçek seçenek görünene kadar sayfayı okur (en çok ms); yer tutucu dışında seçenek yoksa bekler. */
    async function altListelerDolsun(anahtarlar: string[], ms: number): Promise<void> {
      const son = Date.now() + Math.min(60_000, Math.max(1_000, ms));
      while (!kapandi && Date.now() < son) {
        const alanlar = (await envanterOku(islem).catch(() => ({ alanlar: [] as HamAlan[] }))).alanlar;
        if (anahtarlar.every((k) => { const a = alanlar.find((x) => x.anahtar === k); return Boolean(a && gercekSecenekler(a.secenekler).length && !a.devreDisi); })) return;
        await islem.waitForTimeout(300);
      }
    }

    /**
     * Yerinde keşif: basıştan / doldurmadan sonra beliren seçim alanları (sayfanın neresinde olursa olsun: en altta, sonradan açılan
     * bölümde, çerçevede) ilk keşifle aynı kurallarla denenir — görünen / kaybolan, etiketler, kurallar ve iç içe seçimler. Sayfa yeniden
     * açılmaz (akışın durumu korunur); seçimler sonunda ilk değerlerine döner.
     */
    async function yeniAlanKesfi(yeniSecimler: HamAlan[]): Promise<HizliKesif[]> {
      const sinir = taramaTarayiciAyarlari(g).kesifSecenekSiniri;
      const simdi = await envanterOku(islem);
      const alt = { ...simdi, alanlar: simdi.alanlar.filter((a) => yeniSecimler.some((y) => y.anahtar === a.anahtar)) };
      if (!alt.alanlar.length) return [];
      // Sayfanın dolu değerleri (sayfanın doldurduğu bağlı listeler dahil) keşiften sonra geri yüklenir: üst liste ilk değerine dönünce
      // sayfa alt listeyi boşaltıp yeniden yükleyebilir; alt listenin değeri ayrıca geri yazılmazsa kaybolur.
      const korunan = await secimDegerleriniAl(simdi.alanlar);
      try {
        const sonuc = await secimleriKesfet(islem, alt, [], async () => undefined, async (p, ms) => { await sakinles(p, ms); }, sinir, { derinlik: IC_ICE_DERINLIK });
        return sonuc.filter((k) => k.degerler.length).map(sadeKesif);
      } finally {
        await secimDegerleriniGeriYukle(korunan);
      }
    }

    /** Tekli açılır listelerin sayfadaki değerleri (keşiften önce; yalnız bellekte, geri yükleme için). */
    async function secimDegerleriniAl(alanlar: HamAlan[]): Promise<Array<{ alan: HamAlan; deger: string }>> {
      const l: Array<{ alan: HamAlan; deger: string }> = [];
      for (const a of alanlar) {
        if (a.tur !== 'select' || a.coklu) continue;
        const v = await alanKapsami(islem, a.cerceve).locator(a.secici).first().inputValue({ timeout: 1_000 }).catch(() => null);
        if (v !== null) l.push({ alan: a, deger: v });
      }
      return l;
    }
    /**
     * Keşiften sonra listeler sayfa sırasıyla eski değerlerine döner (üst önce). Alt listenin seçenekleri üst geri alınınca yeniden gelebilir:
     * seçenek gelene kadar beklenir (listedenSec). Değeri zaten aynı olan listeye dokunulmaz.
     */
    async function secimDegerleriniGeriYukle(l: Array<{ alan: HamAlan; deger: string }>): Promise<void> {
      for (const { alan: a, deger } of l) {
        if (kapandi) return;
        const simdi = await alanKapsami(islem, a.cerceve).locator(a.secici).first().inputValue({ timeout: 1_000 }).catch(() => null);
        if (simdi === null || simdi === deger) continue;
        await listedenSec(islem, a, deger, 8_000).catch(() => undefined);
        await sakinles(islem, 5_000);
      }
    }
    /** Okumada tekli açılır listenin gerçek seçeneklerinin imzası (yer tutucu hariç). */
    const secenekImzasi = (a: HamAlan | undefined): string => JSON.stringify(gercekSecenekler(a?.secenekler).map((s) => s.deger));
    /**
     * Basıştan / değer uygulamasından sonra zincir keşfinin adayları: yeni beliren tekli listeler ve önceden de sayfada olup seçenekleri
     * yeni dolan / değişen listeler. Bağ ilişkisi bilinen listeler (üst seçilince altının seçenekleri değişir) yeniden denenmez.
     */
    const zincirAdaylari = (once: HamAlan[], sonra: HamAlan[], bilinen: ReadonlySet<string>): HamAlan[] => {
      const onceki = new Map(once.map((a) => [a.anahtar, a]));
      return sonra.filter((a) => a.tur === 'select' && !a.coklu && !bilinen.has(a.anahtar)
        && (!onceki.has(a.anahtar) || (gercekSecenekler(a.secenekler).length > 0 && secenekImzasi(onceki.get(a.anahtar)) !== secenekImzasi(a))));
    };

    /**
     * Sonradan (doldurunca / basınca) beliren açılır listeler arasında bağlı liste zinciri (ör. adres bölümü bir alan doldurulunca açılır:
     * bölge → ilçe → mahalle). Sayfa YENİDEN AÇILAMAZ (akışın durumu kaybolur): zincir motorunun "baştan aç" adımı yerine bu listeler
     * ilk değerlerine geri alınır (üst liste geri alınınca sayfa altlarını kendisi boşaltır). Hiçbir düğmeye basılmaz; sonunda listeler
     * ilk değerlerindedir. En az iki yeni liste yoksa yapılmaz.
     */
    async function yerindeZincirKesfi(adaylar: HamAlan[]): Promise<ZincirSonucu | null> {
      const listeler = adaylar.filter((a) => a.tur === 'select' && !a.coklu);
      if (listeler.length < 2 || kapandi) return null;
      // Sayfanın o anki değerleri (sayfanın doldurduğu üst / alt liste dahil): keşif boyunca "baştan aç" yerine bunlara dönülür, sonunda da
      // aynı sırayla geri yüklenir (alt listenin seçenekleri gelene kadar beklenir).
      const ilk = await secimDegerleriniAl(listeler);
      const geriAl = async (): Promise<void> => { await secimDegerleriniGeriYukle(ilk); };
      const sakin = async (p: Page, ms: number): Promise<void> => { await sakinles(p, ms); };
      try {
        const simdi = await envanterOku(islem);
        const alt = { ...simdi, alanlar: simdi.alanlar.filter((a) => listeler.some((y) => y.anahtar === a.anahtar)) };
        const birinci = await secimleriKesfet(islem, alt, [], geriAl, sakin, taramaTarayiciAyarlari(g).kesifSecenekSiniri);
        await geriAl();
        const t = taramaTarayiciAyarlari(g);
        const z = await zincirKesfet({
          sayfa: islem, ac: geriAl, sakinles: async (p, ms) => { await sakinles(p, ms); }, oku: async () => (await envanterOku(islem)).alanlar, durdu: () => kapandi,
          ilerleme: (m) => bildir({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: `${m} (yeni beliren / dolan listeler; hiçbir düğmeye basılmaz)` })
        }, simdi.alanlar, birinci, { derinlik: t.zincirDerinligi, ornek: Math.min(2, t.zincirOrnek) });
        await geriAl();
        // Keşiften önceki sayfa durumu da bir gözlemdir: üst listelerin sayfadaki değerinde alt listenin seçenekleri (sayfanın doldurduğu
        // kombinasyon tabloya da girer; denenen örnek değerler arasında olmayabilir).
        const ilkDeger = new Map(ilk.map((x) => [x.alan.anahtar, x.deger]));
        const ustu = new Map(z.iliskiler.map((i) => [i.alt, i.ust]));
        for (const i of z.iliskiler) {
          const l = gercekSecenekler(simdi.alanlar.find((x) => x.anahtar === i.alt)?.secenekler);
          const secimler: Record<string, string> = {};
          for (let u: string | undefined = i.ust, n = 0; u && n < 10; u = ustu.get(u), n++) { const v = ilkDeger.get(u); if (v) secimler[u] = v; }
          if (l.length && secimler[i.ust]) z.gozlemler.unshift({ anahtar: i.alt, secimler, secenekler: l });
        }
        return z.iliskiler.length ? z : null;
      } catch {
        await geriAl().catch(() => undefined);
        return null;
      }
    }

    /**
     * Keşifte basılabilecek düğmeler (sayfada bir şey gösterebilecek): davranışı sayfadan okunur (dugmeDavranisi; ad / alan / sektör
     * listesi yok). Sayfa içinde bir şey açtığı anlaşılanlar önce; en çok "Açılır liste keşif sınırı" kadar.
     */
    async function kesifDugmeAdaylari(dugmeler: HizliDugme[]): Promise<HizliKesifDugmesi[]> {
      const sonuc: HizliKesifDugmesi[] = [];
      for (const d of dugmeler) {
        if (d.alanIkonu || d.pencerede || d.arkada || kapandi) continue;
        const l = alanKapsami(islem, d.cerceve ?? null).locator(d.secici).filter({ visible: true }).first();
        const b = await l.evaluate(dugmeDavranisi, undefined, { timeout: 1_000 }).catch(() => null);
        if (!b?.uygun) continue;
        sonuc.push({ secici: d.secici, metin: d.metin, ...(d.cerceve?.length ? { cerceve: d.cerceve } : {}), emin: b.emin, neden: b.neden });
      }
      return [...sonuc.filter((x) => x.emin), ...sonuc.filter((x) => !x.emin)].slice(0, taramaTarayiciAyarlari(g).kesifSecenekSiniri);
    }

    /**
     * Keşif basışı (akışın parçası değil; kaydedilmez): yazma istekleri engellenir, açılan tarayıcı pencereleri iptal edilir; neyin
     * değiştiği (beliren / kaybolan alanlar, açılan pencere, yeni metinler) kaydedilir, beliren seçimler iç içe keşfedilir; sonra sayfa
     * yeniden açılarak ilk durumuna döndürülür (döndürülemezse keşif yeni durumdan sürer).
     */
    async function kesifBas(k: Extract<HizliKomut, { tur: 'kesifBas' }>): Promise<void> {
      const once = await anlikOku(islem, false);
      let fark: HizliFark | null = null;
      let hata: string | null = null;
      planYaniti = 'iptal';
      try {
        durum.asama = 'tarama';
        fark = await bas(islem, k.secici, k.metin, once, k.no, k.cerceve ?? null);
      } catch (h) {
        hata = hataBilgisi(h).mesaj;
      } finally {
        durum.asama = okumaAsamasi;
        planYaniti = null;
      }
      const yeniSecimler = (fark?.yeniAlanlar ?? []).filter((a) => ['select', 'radio', 'checkbox'].includes(a.tur) && !a.devreDisi && !a.saltOkunur);
      const kesifler = yeniSecimler.length && !kapandi ? await yeniAlanKesfi(yeniSecimler).catch(() => [] as HizliKesif[]) : [];
      let geriDondu = false;
      try {
        await ac();
        sonAnlik = await anlikOku(islem, true);
        const simdi = new Set(sonAnlik.alanlar.map((a) => a.anahtar));
        geriDondu = simdi.size === kesifAnahtarlari.size && [...simdi].every((x) => kesifAnahtarlari.has(x));
      } catch {
        sonAnlik = await anlikOku(islem, true).catch(() => sonAnlik);
      }
      await gonder({ olay: 'kesifBasildi', no: k.no, fark: fark ? { ...fark, anlik: { ...fark.anlik, goruntu: null } } : null, kesifler, geriDondu, anlik: sonAnlik, hata });
    }

    // ---- Keşif (basmadan) ----
    // Tarayıcının yeniden açılması (kesifAtla): keşif yapılmaz; sayfa okunur, zinciri sunucu kendi planıyla yeniden kurar.
    const kesifAtla = g.hizliTest?.kesifAtla === true;
    await olay({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: kesifAtla ? 'Tarayıcı yeniden açıldı; zincir tekrar yürütülecek…' : 'Keşfediliyor… (seçimler tek tek denenir; hiçbir düğmeye basılmaz)' });
    const secimKesifleri = kesifAtla ? [] : await secimKesfi().catch(() => [] as HizliKesif[]);
    const zincir = kesifAtla ? null : await zincirKesfi().catch(() => null);
    let sonAnlik = await anlikOku(islem, true);
    // Keşifte basılabilecek düğmeler (basma iznine bağlı; Hayır'da hiç): sunucu izne göre basar ya da kullanıcıya sorar.
    const kesifAnahtarlari = new Set(sonAnlik.alanlar.map((a) => a.anahtar));
    const kesifDugmeleri = basabilir && !kesifAtla ? await kesifDugmeAdaylari(sonAnlik.dugmeler).catch(() => [] as HizliKesifDugmesi[]) : [];
    await gonder({ olay: 'kesif', anlik: sonAnlik, kesifler: secimKesifleri, zincir, ...(kesifDugmeleri.length ? { kesifDugmeleri } : {}) });
    await olay({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: 'Tarayıcı hazır: soruları Nöbetçi’de yanıtlayın.' });
    await islem.bringToFront().catch(() => undefined);

    // ---- Komut döngüsü ----
    for (;;) {
      if (kapandi) throw new TaramaHatasi('IPTAL', 'Hızlı test tarayıcısı kapatıldı.');
      const k = kuyruk.shift() ?? await komutAl();
      if (!k) continue;
      // Sorusu kapanmış pencerenin geç kalan yanıtı: yok sayılır.
      if (k.tur === 'diyalogYaniti') continue;
      try {
        if (k.tur === 'bitir') break;
        if (k.tur === 'oku') {
          sonAnlik = await anlikOku(islem, true);
          await gonder({ olay: 'okundu', no: k.no, anlik: sonAnlik });
        } else if (k.tur === 'doldur') {
          diyaloglar.length = 0;
          diyalogKayitlari.length = 0;
          beklemeler = {};
          kilitliYazilan.clear();
          const doldurOncesi = new Set(sonAnlik.alanlar.map((a) => a.anahtar));
          const onceAlanlar = sonAnlik.alanlar;
          // Yazılan alanlar ve sayfaya aynı değerle önceden uygulanmış (yeniden yazılmayan) alanlar: tur sonunda yeniden okunur; boşalan /
          // başka alan yüzünden değişen alan bir kez yeniden yazılır, yine değişirse alan hatası (turuDoldur).
          const hatalar = await turuDoldur(islem, k.alanlar, k.kontrol ?? [], {
            ilerle: async (j, d) => { await gonder({ olay: 'ilerleme', no: k.no, mesaj: `Alanlar dolduruluyor: “${d.alan.etiket ?? d.anahtar}” (${j + 1}/${k.alanlar.length})` }).catch(() => undefined); }
          });
          await sakinles(islem, 5_000);
          // Yerinde zincir isteği: alt listelerin seçenekleri gelene kadar (geç dolan liste: istek bittikten sonra zamanlayıcıyla dolabilir).
          if (k.bekle?.length) await altListelerDolsun(k.bekle, k.bekleMs ?? ZINCIR_SECENEK_BEKLEME_MS);
          // Beklemeyle (debounce) beliren alanlar / metinler: sayfa görünümü durulana kadar (yeni alan otomatik basıştan önce sorulsun).
          await gorunumDurulsun(islem);
          await diyalogBitsin();
          for (const x of diyalogKayitlari.splice(0)) notlar.push(`Doldururken sayfa ${x.tur === 'alert' ? 'bilgi' : 'onay'} penceresi açtı (“${x.mesaj}”): ${yanitAdi(x)}.`);
          const once = new Set(sonAnlik.metinler.map((m) => m.metin));
          sonAnlik = await anlikOku(islem, false);
          // Doldururken sayfanın gösterdiği yeni mesajlar (ör. alandan çıkınca gelen doğrulama uyarısı): kullanıcıya sorulur.
          const yeniMetinler: HizliMetin[] = [
            ...sonAnlik.metinler.filter((m) => !once.has(m.metin)),
            ...diyaloglar.splice(0).map((m): HizliMetin => ({ metin: m, tur: /hata|gecersiz|zorunlu|eksik|error|invalid|required/i.test(katla(m)) ? 'hata' : 'normal' }))
          ];
          // Yeni mesaj çıktıysa sayfa içi mesaj penceresi (uyarı kutusu) kapatılır: metni kaydedildi; açık kalırsa sonraki alanların önünü keser.
          if (yeniMetinler.length) await mesajPenceresiniKapat();
          // Doldurunca (metin uygulanınca / seçim yapılınca) beliren ya da seçenekleri yeni dolan açılır listeler arasında bağlı liste
          // zinciri (yerinde; ilk keşifle aynı zincir motoru; listeler sonunda sayfadaki değerlerine döner). Bağı bilinen listeler denenmez.
          const yeniListeler = sonAnlik.alanlar.filter((a) => !doldurOncesi.has(a.anahtar));
          const adaylar = zincirAdaylari(onceAlanlar, sonAnlik.alanlar, new Set(k.bilinenBagli ?? []));
          // kesifsiz (örnek senaryo): yerinde zincir / seçim keşfi yapılmaz — listeler değiştirilip geri alınınca sayfa bağlı alanları sıfırlayabilir.
          const zincirYeni = !k.kesifsiz && !k.bekle?.length && adaylar.length ? await yerindeZincirKesfi(adaylar).catch(() => null) : null;
          // Yerinde keşif: doldurunca (ör. bir seçim uygulanınca) beliren, henüz keşfedilmemiş seçimler ilk keşfin kurallarıyla denenir
          // (keşifte kaçırılmış olsalar bile; iç içe dahil). Seçimler sonunda ilk değerlerine döner.
          const bilinen = new Set(k.kesfedilen ?? []);
          const yeniSecimler = k.kesfedilen ? yeniListeler.filter((a) => ['select', 'radio', 'checkbox'].includes(a.tur) && !a.devreDisi && !a.saltOkunur && !bilinen.has(a.anahtar)) : [];
          const kesifler = !k.kesifsiz && yeniSecimler.length && !kapandi ? await yeniAlanKesfi(yeniSecimler).catch(() => [] as HizliKesif[]) : [];
          // Yerinde keşif seçimleri denerken sayfanın kuralları yazılmış metin alanlarını değiştirmiş olabilir (ör. bağlı tutar kutusu
          // bedeli sıfırlar): bu turda yazılan alanlar yeniden okunur, tutmayan bir kez yeniden yazılır, yine tutmazsa alan hatası.
          if (zincirYeni || kesifler.length) {
            for (const d of k.alanlar) {
              if (!yaziAlaniMi(d) || hatalar.some((h) => h.anahtar === d.anahtar) || kilitliYazilan.has(d.anahtar)) continue;
              const l = alanKapsami(islem, d.alan.cerceve).locator(d.alan.secici).first();
              if (degerTuttu(await alanDegeriOku(l), String(d.deger))) continue;
              const h = (await alaniDoldur(islem, d)) ?? (degerTuttu(await alanDegeriOku(l), String(d.deger)) ? null
                : `${String(d.deger)} yazıldı ama alanda ${((await alanDegeriOku(l)) ?? '').trim() || '(boş)'} kaldı (yeniden yazıldı, yine tutmadı). Alanın biçimini (en çok karakter, maske) ya da değeri kontrol edin.`);
              if (h) hatalar.push({ anahtar: d.anahtar, mesaj: h });
              else notlar.push(`“${d.alan.etiket ?? d.anahtar}” yeni seçimler denenirken değişmişti; yeniden yazıldı.`);
            }
            sonAnlik = await anlikOku(islem, false);
          }
          // (Yeniden yazılınca yine değişen alan hatadır: kilit kanıtı sayılmaz.)
          const kilitliler = [...kilitliYazilan].filter((x) => !hatalar.some((h) => h.anahtar === x));
          await gonder({
            olay: 'dolduruldu', no: k.no, hatalar, anlik: sonAnlik, yeniMetinler, beklemeler, ...(zincirYeni ? { zincir: zincirYeni } : {}), ...(kesifler.length ? { kesifler } : {}),
            ...(kilitliler.length ? { kilitliler } : {})
          });
        } else if (k.tur === 'bas') {
          if (!basabilir) { await gonder({ olay: 'hata', no: k.no, mesaj: 'Basma izni “Hayır”: Nöbetçi hiçbir düğmeye basmaz.' }); continue; }
          const onceAlanlar = sonAnlik.alanlar;
          const fark = await bas(islem, k.secici, k.metin, sonAnlik, k.no, k.cerceve ?? null);
          // Basıştan sonra çıkan sayfa içi mesaj penceresi kapatılır (metni farkta; keşif ve sonraki adım engellenmesin). Akış penceresi kalır.
          if (fark.yeniMetinler.length && (await mesajPenceresiniKapat())) fark.anlik = { ...(await anlikOku(islem, false)), goruntu: fark.anlik.goruntu };
          sonAnlik = fark.anlik;
          // Basıştan sonra beliren (henüz boş) seçim alanları da denenir: içlerinde koşullu alan var mı? (Sayfa yeniden açılmaz.)
          const yeniSecimler = fark.yeniAlanlar.filter((a) => ['select', 'radio', 'checkbox'].includes(a.tur) && !a.devreDisi && !a.saltOkunur);
          const kesifler = !k.kesifsiz && yeniSecimler.length ? await yeniAlanKesfi(yeniSecimler).catch(() => [] as HizliKesif[]) : [];
          // Basınca beliren ya da seçenekleri yeni dolan açılır listeler arasında bağlı liste zinciri (yerinde; ilk keşifle aynı motor).
          const adaylar = zincirAdaylari(onceAlanlar, fark.anlik.alanlar, new Set(k.bilinenBagli ?? []));
          const zincirYeni = !k.kesifsiz && adaylar.length ? await yerindeZincirKesfi(adaylar).catch(() => null) : null;
          // Keşif sayfanın değerlerini geri yükledi; son okuma (sayfanın doldurduğu değerlerle) tazelenir.
          if (kesifler.length || zincirYeni) { sonAnlik = { ...(await anlikOku(islem, false)), goruntu: fark.anlik.goruntu }; fark.anlik = sonAnlik; }
          await gonder({ olay: 'basildi', no: k.no, fark, kesifler, ...(zincirYeni ? { zincir: zincirYeni } : {}) });
        } else if (k.tur === 'kesifBas') {
          if (!basabilir) { await gonder({ olay: 'hata', no: k.no, mesaj: 'Basma izni “Hayır”: keşif hiçbir düğmeye basmaz.' }); continue; }
          await kesifBas(k);
        } else if (k.tur === 'secimAc') {
          const s = await sec(islem, k.no, k.amac === 'bitis' ? 'bitis' : 'dugme');
          if (s) kuyruk.unshift(s);
        } else if (k.tur === 'dogrula') {
          if (!basabilir && !k.plan.yenidenKur) { await gonder({ olay: 'hata', no: k.no, mesaj: 'Basma izni “Hayır”: doğrulama koşusu yapılmaz.' }); continue; }
          diyaloglar.length = 0;
          diyalogKayitlari.length = 0;
          const r = await dogrula(islem, k.plan, async (adim, mesaj) => {
            bildir({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: `Doğrulama koşusu — ${mesaj}` });
            await gonder({ olay: 'ilerleme', no: k.no, adim, toplam: k.plan.adimlar.length, mesaj }).catch(() => undefined);
          }).finally(() => { planYaniti = null; });
          await diyalogBitsin();
          bildir({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: `Doğrulama koşusu ${r.sonuc === 'basarili' ? 'başarılı' : 'başarısız'}; tarayıcı hazır.` });
          sonAnlik = await anlikOku(islem, true);
          await gonder({ olay: 'dogrulandi', no: k.no, ...r });
        }
      } catch (hata) {
        if (kapandi) throw new TaramaHatasi('IPTAL', 'Hızlı test tarayıcısı kapatıldı.');
        await gonder({ olay: 'hata', no: 'no' in k ? k.no : null, mesaj: hataBilgisi(hata).mesaj });
      }
    }
    const yazma = engellenenler.filter((e) => e.neden === 'yazma').length;
    if (yazma) notlar.push(`Basış dışında ${yazma} yazma isteği (kayıt oluşturan / gönderen) engellendi.`);
    await olay({ tur: 'adim', adim: 'hizli', durum: 'tamam', mesaj: 'Hızlı test tarayıcısı kapatıldı.' });
    return { kip: 'hizliTest', notlar };
  } finally {
    await yayin?.kapat().catch(() => undefined);
    await baglam.close().catch(() => undefined);
  }
}
