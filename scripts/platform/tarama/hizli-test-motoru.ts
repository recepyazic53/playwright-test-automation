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
// reddedilir), sayfaya form gönderimi ve düğme tıklaması korumaları konur, GET/HEAD dışındaki istekler engellenir. Diğer izinlerde
// yazma istekleri yalnız basış (ve doğrulama koşusu) sırasında serbesttir; keşif ve doldurma sırasında engellenir. Yasaklı host ve
// izinli köken engeli her aşamada sürer. Alan DEĞERLERİ sayfadan okunmaz; ekran görüntüsü diske yazılmaz.
import type { Browser, Locator, Page } from '@playwright/test';
import { alanaYaz, alanZatenDolu } from './alan-cikisi';
import { AgIzleyici, UZUN_ISTEK_MS } from './ag-sakinligi';
import { TEKRAR_NOTU, etkisizTiklamaMetni, guvenliTikla, sakinlikBekle } from './guvenli-tiklama';
import { baglamiDegistir } from '../../../tests/support/giris-motoru';
import { captchaAlgila } from '../giris/algilama.mjs';
import { agHatasiMi } from '../giris/tarif.mjs';
import { adresYasakliMi, yasakDesenleri } from '../senaryolar/model-kosusu.mjs';
import { KALIPLAR, katla } from './eylem-kesfi.mjs';
import { eylemAdaylariniCikar } from './eylem-kesfi-motoru';
import { adresOzeti, istekKarari, taramaAdresleri, yasakliAdresBul, yasakliTaramaMesaji, type TaramaAsamasi } from './koruma.mjs';
import type { EngellenenIstek, HamAlan } from './paket-olusturucu.mjs';
import {
  HIZLI_BASIS_BEKLEME_EN_COK_MS, HIZLI_SECIM_KIMLIGI, HIZLI_SECIM_KOPRUSU, taramaTarayiciAyarlari,
  type HizliAnlik, type HizliDoldurulan, type HizliDugme, type HizliFark, type HizliKesif, type HizliKomut, type HizliMetin, type HizliOlay, type HizliPlan,
  type HizliTestSonucu, type TaramaGirdisi, type TaramaGirisYontemi, type TaramaOlayi
} from './protokol.mjs';
import { girisYontemiMesaji, isteklerBitsin, oturumBaglamSecenegi, taramaGirisiYap, type OturumGonderici } from './tarama-girisi';
import { ogeBilgisi, type SeciciAdayi } from './oge-secme-paneli';
import { adaySirasi } from './oge-secme-motoru';
import { beklemeDurumu, hizliMetinleriTopla, hizliSecimSeridiKur } from './hizli-test-sayfasi';
import { dugmeTiklamaKorumasi, formGonderimKorumasi } from './sayfa-envanteri';
import { zincirKesfet } from './zincir-motoru';
import type { ZincirSonucu } from './zincir-kesfi.mjs';
import { ENVANTER_BETIGI, TaramaHatasi, alanKapsami, envanterOku, hataBilgisi, hedefSayfayiAc, secimleriKesfet, type OlayGonderici } from './tarama-motoru';

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
/** Basıştan sonra hiç yeni metin görülmediyse ek bakma süresi (ms): pencerenin içi gecikmeli çizilebilir. */
const YENI_METIN_BEKLEME_MS = 4_000;
/** Metin karşılaştırması: büyük / küçük harf, Türkçe harfler ve boşluklar yok sayılır (koşucunun toleranslı içerir kuralı gibi). */
const iceriyor = (metin: string, aranan: string): boolean => Boolean(aranan.trim()) && katla(metin).includes(katla(aranan));
/** Doğru / yanlış sayılan değerler (onay kutusu). */
const dogruMu = (d: unknown): boolean => d === true || ['true', 'evet', '1', 'on', 'işaretli', 'isaretli'].includes(String(d).trim().toLocaleLowerCase('tr'));

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
  /** Sayfanın tarayıcı uyarıları (alert / confirm): metinleri sonraki farka girer; pencere kapatılır (onay verilmez). */
  const diyaloglar: string[] = [];
  let kapandi = false;
  let secimCevabi: ((v: Record<string, unknown>) => void) | null = null;

  try {
    // "Başka düğmeye bas" köprüsü (şerit yalnız secimAc komutunda kurulur).
    await baglam.exposeBinding(HIZLI_SECIM_KOPRUSU, async (_kaynak, veri: Record<string, unknown>) => {
      if (secimCevabi && nesneMi(veri)) { const c = secimCevabi; secimCevabi = null; c(veri); }
      return { tamam: true };
    });
    await baglam.addInitScript({ content: ENVANTER_BETIGI });
    // Hayır izni: sayfanın kendi betiği de form gönderemez / düğmeye basamaz (sunucu zaten "bas" göndermez).
    if (!basabilir) {
      await baglam.addInitScript(formGonderimKorumasi);
      await baglam.addInitScript(dugmeTiklamaKorumasi);
    }
    const islem = await baglam.newPage();
    baglam.on('page', (p: Page) => {
      p.on('dialog', (d) => { diyaloglar.push(d.message().replace(/\s+/g, ' ').trim().slice(0, 200)); void d.dismiss().catch(() => undefined); });
      if (p !== islem) notlar.push('Sayfa yeni bir sekme / pencere açtı; hızlı test ilk sekmede sürer.');
    });
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
      await baglamiDegistir(islem, g.tarif, profil.degerler);
      // Yazma engeli açılmadan önce bağlam değiştirmenin son isteği bitsin (açılır penceredeki form gönderimi geç kalıp engellenmesin).
      await isteklerBitsin(islem);
    }
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

    /** Sayfanın okuması (değer yok). goruntu: JPEG ekran görüntüsü (yalnız bellekte; sunucuya gider). */
    async function anlikOku(page: Page, goruntu: boolean): Promise<HizliAnlik> {
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      const envanter = await envanterOku(page, { degerOku: true }).catch(() => ({ alanlar: [] as HamAlan[], baslik: '' }));
      // "Devam et" listesi: sayfadaki tüm görünür düğmeler (sonradan beliren düğmeler puan sınırına takılmasın).
      const eylem = await eylemAdaylariniCikar(page, { dugmeSiniri: 60 });
      const metinler = (await page.evaluate(hizliMetinleriTopla, { kaliplar: { ...KALIPLAR }, enCok: 150 }).catch(() => [])) as HizliMetin[];
      const dugmeler: HizliDugme[] = eylem.gonderim.map((a) => ({
        secici: a.secici, metin: a.metin, kayitOlusturabilir: a.kayitOlusturabilir === true, guven: a.guven, enOlasi: a.enOlasi
      }));
      let resim: string | null = null;
      if (goruntu) resim = await page.screenshot({ type: 'jpeg', quality: 55, timeout: 10_000 }).then((b) => b.toString('base64'), () => null);
      return { yol: yolu(page.url()), baslik: await page.title().catch(() => ''), alanlar: envanter.alanlar, metinler, dugmeler, eylem, goruntu: resim };
    }

    /** Son doldurmada seçeneğini beklemek gereken listeler: anahtar → bekleme (ms; bağlı listenin dolma süresi ölçümü). */
    let beklemeler: Record<string, number> = {};
    /** Bir alanı doldurur (değer kullanıcının; motor üretmez). Hata metni döner (başarılıysa null). */
    async function alaniDoldur(page: Page, d: HizliDoldurulan): Promise<string | null> {
      const a = d.alan;
      const bekleMs = taramaTarayiciAyarlari(g).alanIslemMs;
      const k = alanKapsami(page, a.cerceve);
      const deger = d.deger;
      try {
        if (a.tur === 'file') return 'Dosya alanı hızlı testte doldurulmaz; senaryo formunda dosya yükleyin.';
        if (a.tur === 'radio') {
          const r = (a.radyolar ?? []).find((x) => x.deger === String(deger) || (x.metin && katla(x.metin) === katla(String(deger))));
          if (!r || !r.secici) return `“${String(deger)}” seçeneği bu alanda yok.`;
          await k.locator(r.secici).first().check({ timeout: bekleMs });
          return null;
        }
        const l = k.locator(a.secici).first();
        if (a.tur === 'checkbox') { await l.setChecked(dogruMu(deger), { timeout: bekleMs }); return null; }
        if (a.tur === 'select' || a.tur === 'select-one' || a.tur === 'select-multiple' || a.ozelBilesen) {
          const s = (a.secenekler ?? []).find((x) => x.deger === String(deger) || katla(x.metin) === katla(String(deger)));
          const hedef = s ? s.deger : String(deger);
          // Zaten bu değerdeyse yeniden seçilmez: yeniden seçmek sayfada bağlı alt listeleri boşaltıp yeniden yükletir.
          if ((await l.inputValue({ timeout: 2_000 }).catch(() => null)) === hedef) return null;
          if (a.ozelBilesen) {
            // Bağlı liste: seçenek üst alan seçildikten sonra gelir; gelene kadar (en çok alan işlem süresi) beklenir.
            const yaz = (): Promise<boolean> => l.evaluate((el, v) => {
              const sec = el as HTMLSelectElement;
              if (![...sec.options].some((o) => o.value === v)) return false;
              sec.value = v;
              sec.dispatchEvent(new Event('input', { bubbles: true }));
              sec.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }, hedef);
            const bas = Date.now();
            for (const bitis = bas + bekleMs; ;) {
              if (await yaz()) { if (Date.now() - bas > 300) beklemeler[d.anahtar] = Date.now() - bas; return null; }
              if (Date.now() >= bitis) return `“${String(deger)}” seçeneği bu listede yok (${Math.round(bekleMs / 1000)} sn beklendi).`;
              await page.waitForTimeout(250);
            }
          }
          const bas = Date.now();
          await l.selectOption({ value: hedef }, { timeout: bekleMs }).catch(async () => { await l.selectOption({ label: String(deger) }, { timeout: 5_000 }); });
          if (Date.now() - bas > 300) beklemeler[d.anahtar] = Date.now() - bas;
          return null;
        }
        // Aynı değer sayfada zaten varsa (önceki turda girildi; site alanı sorgudan sonra kilitlemiş olabilir) yeniden yazılmaz.
        if (await alanZatenDolu(l, String(deger))) return null;
        // Ortak yazma kuralı (alan-cikisi.ts > alanaYaz): kısa tek satırlı metin gerçek tuşlarla yazılır (maske / keyup sorgusu çalışır, yaz-sil-yaz
        // olmaz); uzun metin doğrudan. Alandan çıkınca sayfanın sorgusu / yeniden çizimi beklenir (kısa üst sınır; uzun istekler sayılmaz).
        const sonuc = await alanaYaz(l, String(deger), { zamanAsimiMs: bekleMs, sonra: async () => { await sakinles(page, Math.min(bekleMs, ALAN_SAKINLIK_EN_COK_MS)); } });
        if (sonuc === 'silindi') return 'Değer yazıldı ama alandan çıkınca sayfa sildi (maske / doğrulama); alanın nasıl doldurulduğunu kontrol edin.';
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
    async function guvenliBas(page: Page, secici: string, metin: string | null): Promise<{ not: string | null; etkisiz: boolean }> {
      let l = page.locator(secici);
      if (metin && (await l.count().catch(() => 0)) > 1) l = l.filter({ hasText: metin });
      const hedef = l.filter({ visible: true }).first();
      await hedef.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
      await sakinlikBekle(page, hedef, { ag });
      durum.asama = 'kayit';
      const t = await guvenliTikla(page, hedef, { zamanMs: 15_000, ag, sakinlik: false });
      return { not: t.etkisiz ? etkisizTiklamaMetni(metin ?? secici, t.tekrarlandi) : t.tekrarlandi ? TEKRAR_NOTU : null, etkisiz: t.etkisiz };
    }

    /** Düğmeye basar, sonucu bekler ve farkı çıkarır. */
    async function bas(page: Page, secici: string, metin: string | null, once: HizliAnlik): Promise<HizliFark> {
      const onceAdres = yolu(page.url());
      const bas = Date.now();
      diyaloglar.length = 0;
      let sonuc: { metinler: string[]; zamanAsimi: boolean };
      const onceMetinler = new Set(once.metinler.map((m) => m.metin));
      let tiklamaNotu: string | null = null;
      try {
        tiklamaNotu = (await guvenliBas(page, secici, metin)).not;
        sonuc = await basisiIzle(page, bas);
        // Basıştan sonra hiç yeni metin görülmediyse (ör. pencere önce yalnız "Kapat" düğmesiyle açılıp içi sonra çizilir) kısa bir süre
        // daha bakılır; yeni metin belirince görünüm yeniden sakinleşene kadar beklenir.
        const yeniMetinVar = async (): Promise<boolean> => ((await page.evaluate(hizliMetinleriTopla, { kaliplar: { ...KALIPLAR }, enCok: 150 }).catch(() => [])) as HizliMetin[])
          .some((m) => !onceMetinler.has(m.metin) && m.tur !== 'bekleme');
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
      }
      const sonra = await anlikOku(page, true);
      const yeniMetinler: HizliMetin[] = [
        ...sonra.metinler.filter((m) => !onceMetinler.has(m.metin)),
        ...diyaloglar.splice(0).map((m): HizliMetin => ({ metin: m, tur: /hata|gecersiz|zorunlu|eksik|error|invalid|required/i.test(katla(m)) ? 'hata' : 'normal' }))
      ];
      const onceAlanlar = new Set(once.alanlar.map((a) => a.anahtar));
      const sonraAlanlar = new Set(sonra.alanlar.map((a) => a.anahtar));
      const onceDugmeler = new Set(once.dugmeler.map((d) => d.secici));
      return {
        basilan: { secici, metin }, sureMs: Date.now() - bas, zamanAsimi: sonuc.zamanAsimi, beklemeMetinleri: sonuc.metinler,
        yeniMetinler, yeniAlanlar: sonra.alanlar.filter((a) => !onceAlanlar.has(a.anahtar)),
        kaybolanAlanlar: once.alanlar.filter((a) => !sonraAlanlar.has(a.anahtar)).map((a) => a.anahtar),
        yeniDugmeler: sonra.dugmeler.filter((d) => !onceDugmeler.has(d.secici)),
        adres: onceAdres !== sonra.yol ? { once: onceAdres, sonra: sonra.yol } : null, anlik: sonra, tiklamaNotu
      };
    }

    /** "Başka düğmeye bas": kullanıcının sayfada tıkladığı öğe (ya da vazgeçme / başka komut). */
    async function sec(page: Page, no: number): Promise<HizliKomut | null> {
      const isaret = `h${no}`;
      const cevap = new Promise<Record<string, unknown>>((c) => { secimCevabi = c; });
      await page.evaluate(`window.__nobetciOgeBilgisi = ${ogeBilgisi.toString()}; 0`);
      await page.evaluate(hizliSecimSeridiKur, { kopru: HIZLI_SECIM_KOPRUSU, kimlik: HIZLI_SECIM_KIMLIGI, isaret });
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
      for (const a of adaySirasi(adaylar, 'dugme')) {
        try {
          const l = page.locator(a.secici);
          if ((await l.count()) !== 1) continue;
          if ((await l.first().getAttribute('data-nobetci-secilen', { timeout: 1_000 })) !== isaret) continue;
          secilen = a.secici;
          break;
        } catch { /* geçersiz seçici */ }
      }
      await temizle();
      if (!secilen) await gonder({ olay: 'hata', no, mesaj: 'Bu öğe için tek başına bulunan bir seçici üretilemedi; öğenin kendisine ya da yazısına tıklayın.' });
      else await gonder({ olay: 'secildi', no, oge: { secici: secilen, metin: typeof v.metin === 'string' ? v.metin.slice(0, 120) : null } });
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
        if (['radio', 'checkbox', 'select-multiple', 'file'].includes(d.alan.tur) || d.alan.ozelBilesen) continue;
        const yer = alanKapsami(page, d.alan.cerceve).locator(d.alan.secici).first();
        if ((await yer.inputValue({ timeout: 1_000 }).catch(() => 'x')).trim()) continue;
        const h = await alaniDoldur(page, d);
        if (h) hatalar.push({ anahtar: d.anahtar, mesaj: h });
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
        const govde = `${await page.locator('body').innerText().catch(() => '')}\n${diyaloglar.join('\n')}`;
        return plan.bitis.hata.find((h) => iceriyor(govde, h)) ?? null;
      };
      for (const [i, adim] of plan.adimlar.entries()) {
        const onEk = `${i + 1}/${toplam}. adım`;
        await ilerle(i + 1, `${onEk}: başlıyor…`);
        const once = new Set((await anlikOku(page, false)).metinler.map((m) => m.metin));
        diyaloglar.length = 0;
        for (const [j, d] of adim.alanlar.entries()) {
          await ilerle(i + 1, `${onEk}: “${d.alan.etiket ?? d.anahtar}” dolduruluyor (${j + 1}/${adim.alanlar.length})`);
          const h = await alaniDoldur(page, d);
          if (h) return { sonuc: 'basarisiz', mesaj: `${i + 1}. adımda “${d.alan.etiket ?? d.anahtar}” alanı: ${h}`, gorulen: [...gorulen] };
        }
        if (adim.alanlar.length) {
          // Sayfa doldururken alanı silmiş olabilir: sakinleşince boş kalanlar yeniden doldurulur.
          await sakinles(page, 5_000);
          const yenile = await bosKalanlariYenile(page, adim.alanlar, []);
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
        await ilerle(i + 1, `${onEk}: “${adim.bas.metin ?? adim.bas.secici}” düğmesine basıldı; sayfa izleniyor…`);
        try {
          const t = await guvenliBas(page, adim.bas.secici, adim.bas.metin);
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
      await ilerle(toplam + 1, 'Bitiş koşulu bekleniyor…');
      const son = Date.now() + plan.zamanAsimiSn * 1000;
      for (;;) {
        const govde = `${await page.locator('body').innerText().catch(() => '')}\n${diyaloglar.join('\n')}`;
        const h = plan.bitis.hata.find((x) => iceriyor(govde, x));
        if (h) return { sonuc: 'basarisiz', mesaj: `Hata mesajı göründü: “${h}”.`, gorulen: [...gorulen, h] };
        const b = plan.bitis.bitti.find((x) => iceriyor(govde, x));
        if (b) return { sonuc: 'basarili', mesaj: `Bitiş mesajı göründü: “${b}”.`, gorulen: [...gorulen, b] };
        if (plan.bitis.adres && yolu(page.url()).includes(plan.bitis.adres)) return { sonuc: 'basarili', mesaj: `Sayfa adresi “${plan.bitis.adres}” oldu.`, gorulen: [...gorulen] };
        for (const d of plan.bitis.devam) if (iceriyor(govde, d)) gorulen.add(d);
        if (Date.now() >= son || kapandi) return { sonuc: 'basarisiz', mesaj: `Bitiş mesajı görülmedi (${plan.zamanAsimiSn} sn)${sonEtkisiz ? `; ${sonEtkisiz}` : ''}.`, gorulen: [...gorulen] };
        await page.waitForTimeout(250);
      }
    }

    /** Seçim alanının değerini uygular (keşif: alanlar boşken seçimler tek tek denenir). */
    async function secimiUygula(page: Page, a: HamAlan, deger: string): Promise<void> {
      const k = alanKapsami(page, a.cerceve);
      if (a.tur === 'select') { await k.locator(a.secici).first().selectOption({ value: deger }, { timeout: 3_000, force: a.ozelBilesen === true }); return; }
      if (a.tur === 'checkbox') { await k.locator(a.secici).first().setChecked(deger === 'true', { timeout: 3_000 }); return; }
      const r = a.radyolar?.find((x) => x.deger === deger);
      const hedef = a.ad ? k.locator(`${a.secici}[value="${deger.replace(/["\\]/g, '\\$&')}"]`).first() : r?.secici ? k.locator(r.secici).first() : null;
      if (!hedef) throw new Error('seçenek bulunamadı');
      await hedef.check({ timeout: 3_000 });
    }

    /**
     * Seçim keşfi: sayfa ilk açıldığında tüm alanlar boştur; bu yüzden seçim alanlarının (açılır liste, radyo, onay kutusu) her değeri
     * tek tek denenir ve her değerde beliren / kaybolan alanlar kaydedilir; sonunda ilk değerler geri yüklenir. İKİ DÜZEY: bir değer
     * seçilince beliren seçim alanları da (üst seçim uygulanıp) ayrıca denenir. Hiçbir düğmeye / bağlantıya basılmaz.
     */
    async function secimKesfi(): Promise<HizliKesif[]> {
      const sinir = taramaTarayiciAyarlari(g).kesifSecenekSiniri;
      const notlar2: string[] = [];
      const sakin = async (p: Page, ms: number): Promise<void> => { await sakinles(p, ms); };
      const sade = (k: import('./paket-olusturucu.mjs').Kesif, ust: HizliKesif['ust']): HizliKesif => ({
        secim: k.secim, ilkDeger: k.ilkDeger, tur: String(k.tur ?? ''), ust,
        degerler: k.degerler.filter((d) => !d.gezinme && !d.hata).map((d) => ({
          deger: d.deger, metin: d.metin ?? null, gorunenler: d.gorunenler, kaybolanlar: d.kaybolanlar,
          ...(d.secenekler ? { secenekler: d.secenekler } : {}), ...(d.etkinlesenler?.length ? { etkinlesenler: d.etkinlesenler } : {})
        }))
      });
      let temel;
      try { temel = await envanterOku(islem); } catch { return []; }
      const sonuc: HizliKesif[] = [];
      let birinci: import('./paket-olusturucu.mjs').Kesif[] = [];
      try { birinci = await secimleriKesfet(islem, temel, notlar2, ac, sakin, sinir); } catch { birinci = []; }
      for (const k of birinci) if (k.degerler.length) sonuc.push(sade(k, null));
      kesifTabani = { alanlar: temel.alanlar, kesifler: birinci };
      // 2. düzey: bir değer seçilince beliren seçim alanları.
      let sayac = 0;
      for (const k of birinci) {
        const ustAlan = temel.alanlar.find((a) => a.anahtar === k.secim);
        if (!ustAlan || kapandi) continue;
        for (const d of k.degerler) {
          if (d.gezinme || d.hata || d.deger === k.ilkDeger) continue;
          const yeniSecimler = d.gorunenler.filter((a) => ['select', 'radio', 'checkbox'].includes(a.tur) && !a.devreDisi && !a.saltOkunur);
          if (!yeniSecimler.length || sayac >= 8) continue;
          sayac++;
          const ustuUygula = async (): Promise<void> => { await ac(); await secimiUygula(islem, ustAlan, d.deger); await sakinles(islem, 2_500); };
          try {
            await ustuUygula();
            const simdi = await envanterOku(islem);
            const alt = { ...simdi, alanlar: simdi.alanlar.filter((a) => yeniSecimler.some((y) => y.anahtar === a.anahtar)) };
            const ikinci = await secimleriKesfet(islem, alt, notlar2, ustuUygula, sakin, sinir);
            for (const k2 of ikinci) if (k2.degerler.length) sonuc.push(sade(k2, { secim: k.secim, deger: d.deger }));
          } catch { /* bu dal atlanır */ }
        }
      }
      if (sayac) await ac().catch(() => undefined); // temiz başlangıç durumu
      return sonuc;
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

    /** Basıştan sonra beliren seçim alanlarının keşfi (yalnız bu alanlar; sayfa yeniden açılmaz, zincirin durumu korunur). */
    async function yeniAlanKesfi(yeniSecimler: HamAlan[]): Promise<HizliKesif[]> {
      const sinir = taramaTarayiciAyarlari(g).kesifSecenekSiniri;
      const simdi = await envanterOku(islem);
      const alt = { ...simdi, alanlar: simdi.alanlar.filter((a) => yeniSecimler.some((y) => y.anahtar === a.anahtar)) };
      const sonuc = await secimleriKesfet(islem, alt, [], async () => undefined, async (p, ms) => { await sakinles(p, ms); }, sinir);
      return sonuc.filter((k) => k.degerler.length).map((k) => ({
        secim: k.secim, ilkDeger: k.ilkDeger, tur: String(k.tur ?? ''), ust: null,
        degerler: k.degerler.filter((d) => !d.gezinme && !d.hata).map((d) => ({ deger: d.deger, metin: d.metin ?? null, gorunenler: d.gorunenler, kaybolanlar: d.kaybolanlar }))
      }));
    }

    // ---- Keşif (basmadan) ----
    await olay({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: 'Keşfediliyor… (seçimler tek tek denenir; hiçbir düğmeye basılmaz)' });
    const secimKesifleri = await secimKesfi().catch(() => [] as HizliKesif[]);
    const zincir = await zincirKesfi().catch(() => null);
    let sonAnlik = await anlikOku(islem, true);
    await gonder({ olay: 'kesif', anlik: sonAnlik, kesifler: secimKesifleri, zincir });
    await olay({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: 'Tarayıcı hazır: soruları Nöbetçi’de yanıtlayın.' });
    await islem.bringToFront().catch(() => undefined);

    // ---- Komut döngüsü ----
    let siradaki: HizliKomut | null = null;
    for (;;) {
      if (kapandi) throw new TaramaHatasi('IPTAL', 'Hızlı test tarayıcısı kapatıldı.');
      const k = siradaki ?? await komutAl();
      siradaki = null;
      if (!k) continue;
      try {
        if (k.tur === 'bitir') break;
        if (k.tur === 'oku') {
          sonAnlik = await anlikOku(islem, true);
          await gonder({ olay: 'okundu', no: k.no, anlik: sonAnlik });
        } else if (k.tur === 'doldur') {
          diyaloglar.length = 0;
          beklemeler = {};
          const hatalar: Array<{ anahtar: string; mesaj: string }> = [];
          for (const [j, d] of k.alanlar.entries()) {
            await gonder({ olay: 'ilerleme', no: k.no, mesaj: `Alanlar dolduruluyor: “${d.alan.etiket ?? d.anahtar}” (${j + 1}/${k.alanlar.length})` }).catch(() => undefined);
            const h = await alaniDoldur(islem, d);
            if (h) hatalar.push({ anahtar: d.anahtar, mesaj: h });
          }
          // Sonradan silinen / geri alınan alan (sayfa arka planda satırı yeniden çizmiş olabilir): boş kalanlar bir kez yeniden doldurulur.
          await sakinles(islem, 5_000);
          hatalar.push(...await bosKalanlariYenile(islem, k.alanlar, hatalar.map((x) => x.anahtar)));
          await sakinles(islem, 5_000);
          const once = new Set(sonAnlik.metinler.map((m) => m.metin));
          sonAnlik = await anlikOku(islem, false);
          // Doldururken sayfanın gösterdiği yeni mesajlar (ör. alandan çıkınca gelen doğrulama uyarısı): kullanıcıya sorulur.
          const yeniMetinler: HizliMetin[] = [
            ...sonAnlik.metinler.filter((m) => !once.has(m.metin)),
            ...diyaloglar.splice(0).map((m): HizliMetin => ({ metin: m, tur: /hata|gecersiz|zorunlu|eksik|error|invalid|required/i.test(katla(m)) ? 'hata' : 'normal' }))
          ];
          await gonder({ olay: 'dolduruldu', no: k.no, hatalar, anlik: sonAnlik, yeniMetinler, beklemeler });
        } else if (k.tur === 'bas') {
          if (!basabilir) { await gonder({ olay: 'hata', no: k.no, mesaj: 'Basma izni “Hayır”: Nöbetçi hiçbir düğmeye basmaz.' }); continue; }
          const fark = await bas(islem, k.secici, k.metin, sonAnlik);
          sonAnlik = fark.anlik;
          // Basıştan sonra beliren (henüz boş) seçim alanları da denenir: içlerinde koşullu alan var mı? (Sayfa yeniden açılmaz.)
          const yeniSecimler = fark.yeniAlanlar.filter((a) => ['select', 'radio', 'checkbox'].includes(a.tur) && !a.devreDisi && !a.saltOkunur);
          const kesifler = yeniSecimler.length ? await yeniAlanKesfi(yeniSecimler).catch(() => [] as HizliKesif[]) : [];
          await gonder({ olay: 'basildi', no: k.no, fark, kesifler });
        } else if (k.tur === 'secimAc') {
          siradaki = await sec(islem, k.no);
        } else if (k.tur === 'dogrula') {
          if (!basabilir) { await gonder({ olay: 'hata', no: k.no, mesaj: 'Basma izni “Hayır”: doğrulama koşusu yapılmaz.' }); continue; }
          const r = await dogrula(islem, k.plan, async (adim, mesaj) => {
            bildir({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: `Doğrulama koşusu — ${mesaj}` });
            await gonder({ olay: 'ilerleme', no: k.no, adim, toplam: k.plan.adimlar.length, mesaj }).catch(() => undefined);
          });
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
    await baglam.close().catch(() => undefined);
  }
}
