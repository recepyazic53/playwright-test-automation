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
import { alandanCik, alanZatenDolu } from './alan-cikisi';
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
  type HizliAnlik, type HizliDoldurulan, type HizliDugme, type HizliFark, type HizliKomut, type HizliMetin, type HizliOlay, type HizliPlan,
  type HizliTestSonucu, type TaramaGirdisi, type TaramaGirisYontemi, type TaramaOlayi
} from './protokol.mjs';
import { girisYontemiMesaji, isteklerBitsin, oturumBaglamSecenegi, taramaGirisiYap, type OturumGonderici } from './tarama-girisi';
import { ogeBilgisi, type SeciciAdayi } from './oge-secme-paneli';
import { adaySirasi } from './oge-secme-motoru';
import { beklemeDurumu, hizliMetinleriTopla, hizliSecimSeridiKur } from './hizli-test-sayfasi';
import { dugmeTiklamaKorumasi, formGonderimKorumasi } from './sayfa-envanteri';
import { ENVANTER_BETIGI, TaramaHatasi, alanKapsami, envanterOku, hataBilgisi, hedefSayfayiAc, type OlayGonderici } from './tarama-motoru';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const ilkSatir = (hata: unknown): string => String(hata instanceof Error ? hata.message : hata).replace(ANSI, '').split('\n')[0].slice(0, 300);
const adreslerGizli = (m: string): string => m.replace(/https?:\/\/\S+/g, '<adres>');
const yolu = (adres: string): string => { try { const u = new URL(adres); return `${u.pathname}${u.search}`; } catch { return '?'; } };
const nesneMi = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null && !Array.isArray(d);
const bekle = (ms: number): Promise<void> => new Promise((c) => setTimeout(c, ms));
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
  let bekleyenIstek = 0;
  baglam.on('request', () => { bekleyenIstek++; });
  baglam.on('requestfinished', () => { bekleyenIstek = Math.max(0, bekleyenIstek - 1); });
  baglam.on('requestfailed', () => { bekleyenIstek = Math.max(0, bekleyenIstek - 1); });
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

    /** Sayfa sakinleşene kadar (istek yok, bekleme göstergesi yok; en çok sureMs). Görülen bekleme metinlerini döner. */
    async function sakinles(page: Page, sureMs: number): Promise<{ metinler: string[]; zamanAsimi: boolean }> {
      const bas = Date.now();
      const metinler = new Set<string>();
      let sakin = 0;
      await page.waitForTimeout(150);
      while (Date.now() - bas < sureMs) {
        if (kapandi) break;
        const b = await page.evaluate(beklemeDurumu, { kaliplar: { ...KALIPLAR } }).catch(() => ({ bekliyor: true, metinler: [] as string[] }));
        for (const m of b.metinler) metinler.add(m);
        if (!b.bekliyor && bekleyenIstek === 0) { if (++sakin >= 3) return { metinler: [...metinler], zamanAsimi: false }; } else sakin = 0;
        await page.waitForTimeout(150);
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
        const iz = await page.evaluate(() => `${document.body.innerText.length}|${document.querySelectorAll('input,select,textarea,button').length}|${location.pathname}`).catch(() => '');
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
          if (a.ozelBilesen) {
            const tamam = await l.evaluate((el, v) => {
              const sec = el as HTMLSelectElement;
              if (![...sec.options].some((o) => o.value === v)) return false;
              sec.value = v;
              sec.dispatchEvent(new Event('input', { bubbles: true }));
              sec.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }, hedef);
            return tamam ? null : `“${String(deger)}” seçeneği bu listede yok.`;
          }
          await l.selectOption({ value: hedef }, { timeout: bekleMs }).catch(async () => { await l.selectOption({ label: String(deger) }, { timeout: 5_000 }); });
          return null;
        }
        // Aynı değer sayfada zaten varsa (önceki turda girildi; site alanı sorgudan sonra kilitlemiş olabilir) yeniden yazılmaz.
        if (await alanZatenDolu(l, String(deger))) return null;
        await l.fill(String(deger), { timeout: bekleMs });
        // Sayfa yazılanı geri almış / maske kabul etmemiş olabilir (alan boş kaldı): tuşlayarak bir kez daha denenir.
        if (!(await l.inputValue({ timeout: 1_000 }).catch(() => 'x')).trim()) {
          await l.fill('', { timeout: 2_000 }).catch(() => undefined);
          await l.pressSequentially(String(deger), { delay: 30, timeout: bekleMs });
          if (!(await l.inputValue({ timeout: 1_000 }).catch(() => 'x')).trim()) return 'Değer yazıldı ama sayfa kabul etmedi (alan boş kaldı).';
        }
        // Kullanıcı gibi alandan çık: change/blur (ve buna bağlı sorgu / doğrulama) tetiklenir.
        await alandanCik(l);
        // Alandan çıkınca sayfa sorgu / yeniden çizim yapabilir (ör. tarihten sonra satır yenilenir): bitmeden sonraki alana geçilmez.
        await sakinles(page, Math.min(bekleMs, 15_000));
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

    /** Düğmeye basar, sonucu bekler ve farkı çıkarır. */
    async function bas(page: Page, secici: string, metin: string | null, once: HizliAnlik): Promise<HizliFark> {
      const onceAdres = yolu(page.url());
      const bas = Date.now();
      durum.asama = 'kayit';
      diyaloglar.length = 0;
      let sonuc: { metinler: string[]; zamanAsimi: boolean };
      try {
        let l = page.locator(secici);
        if (metin && (await l.count().catch(() => 0)) > 1) l = l.filter({ hasText: metin });
        await l.filter({ visible: true }).first().click({ timeout: 15_000 });
        sonuc = await sakinles(page, HIZLI_BASIS_BEKLEME_EN_COK_MS);
        await gorunumSakinles(page, 6_000);
      } finally {
        durum.asama = okumaAsamasi;
      }
      const sonra = await anlikOku(page, true);
      const onceMetinler = new Set(once.metinler.map((m) => m.metin));
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
        adres: onceAdres !== sonra.yol ? { once: onceAdres, sonra: sonra.yol } : null, anlik: sonra
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
        if (['radio', 'checkbox', 'select', 'select-one', 'select-multiple', 'file'].includes(d.alan.tur) || d.alan.ozelBilesen) continue;
        const yer = alanKapsami(page, d.alan.cerceve).locator(d.alan.secici).first();
        if ((await yer.inputValue({ timeout: 1_000 }).catch(() => 'x')).trim()) continue;
        const h = await alaniDoldur(page, d);
        if (h) hatalar.push({ anahtar: d.anahtar, mesaj: h });
      }
      return hatalar;
    }

    /** Doğrulama koşusu: sayfayı yeniden açar, zinciri uygular, bitiş koşulunu bekler. */
    async function dogrula(page: Page, plan: HizliPlan): Promise<{ sonuc: 'basarili' | 'basarisiz'; mesaj: string; gorulen: string[] }> {
      await ac();
      const gorulen = new Set<string>();
      const hataVar = async (): Promise<string | null> => {
        const govde = `${await page.locator('body').innerText().catch(() => '')}\n${diyaloglar.join('\n')}`;
        return plan.bitis.hata.find((h) => iceriyor(govde, h)) ?? null;
      };
      for (const [i, adim] of plan.adimlar.entries()) {
        const once = new Set((await anlikOku(page, false)).metinler.map((m) => m.metin));
        diyaloglar.length = 0;
        for (const d of adim.alanlar) {
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
        durum.asama = 'kayit';
        try {
          let l = page.locator(adim.bas.secici);
          if (adim.bas.metin && (await l.count().catch(() => 0)) > 1) l = l.filter({ hasText: adim.bas.metin });
          await l.filter({ visible: true }).first().click({ timeout: 15_000 });
          const s = await sakinles(page, HIZLI_BASIS_BEKLEME_EN_COK_MS);
          for (const m of s.metinler) gorulen.add(m);
        } catch (hata) {
          return { sonuc: 'basarisiz', mesaj: `${i + 1}. adımda “${adim.bas.metin ?? adim.bas.secici}” düğmesine basılamadı (${adreslerGizli(ilkSatir(hata))}).`, gorulen: [...gorulen] };
        } finally {
          durum.asama = okumaAsamasi;
        }
        const h = await hataVar();
        if (h) return { sonuc: 'basarisiz', mesaj: `Hata mesajı göründü: “${h}”.`, gorulen: [...gorulen, h] };
      }
      const son = Date.now() + plan.zamanAsimiSn * 1000;
      for (;;) {
        const govde = `${await page.locator('body').innerText().catch(() => '')}\n${diyaloglar.join('\n')}`;
        const h = plan.bitis.hata.find((x) => iceriyor(govde, x));
        if (h) return { sonuc: 'basarisiz', mesaj: `Hata mesajı göründü: “${h}”.`, gorulen: [...gorulen, h] };
        const b = plan.bitis.bitti.find((x) => iceriyor(govde, x));
        if (b) return { sonuc: 'basarili', mesaj: `Bitiş mesajı göründü: “${b}”.`, gorulen: [...gorulen, b] };
        if (plan.bitis.adres && yolu(page.url()).includes(plan.bitis.adres)) return { sonuc: 'basarili', mesaj: `Sayfa adresi “${plan.bitis.adres}” oldu.`, gorulen: [...gorulen] };
        for (const d of plan.bitis.devam) if (iceriyor(govde, d)) gorulen.add(d);
        if (Date.now() >= son || kapandi) return { sonuc: 'basarisiz', mesaj: `Bitiş mesajı görülmedi (${plan.zamanAsimiSn} sn).`, gorulen: [...gorulen] };
        await page.waitForTimeout(250);
      }
    }

    // ---- Keşif (basmadan) ----
    await olay({ tur: 'adim', adim: 'hizli', durum: 'suruyor', mesaj: 'Keşfediliyor… (hiçbir düğmeye basılmaz)' });
    let sonAnlik = await anlikOku(islem, true);
    await gonder({ olay: 'kesif', anlik: sonAnlik });
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
          const hatalar: Array<{ anahtar: string; mesaj: string }> = [];
          for (const d of k.alanlar) {
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
          await gonder({ olay: 'dolduruldu', no: k.no, hatalar, anlik: sonAnlik, yeniMetinler });
        } else if (k.tur === 'bas') {
          if (!basabilir) { await gonder({ olay: 'hata', no: k.no, mesaj: 'Basma izni “Hayır”: Nöbetçi hiçbir düğmeye basmaz.' }); continue; }
          const fark = await bas(islem, k.secici, k.metin, sonAnlik);
          sonAnlik = fark.anlik;
          await gonder({ olay: 'basildi', no: k.no, fark });
        } else if (k.tur === 'secimAc') {
          siradaki = await sec(islem, k.no);
        } else if (k.tur === 'dogrula') {
          if (!basabilir) { await gonder({ olay: 'hata', no: k.no, mesaj: 'Basma izni “Hayır”: doğrulama koşusu yapılmaz.' }); continue; }
          const r = await dogrula(islem, k.plan);
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
