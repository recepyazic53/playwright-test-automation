// OTOMATİK TARAMA MOTORU (genel) — tarama alt sürecinde (tarama.spec.ts) çalışır. Hiçbir proje adı/seçicisi yoktur:
// giriş ve bağlam adımları ortamın giriş tarifinden (giris-motoru.ts), hedef ve profiller iş girdisinden gelir.
//
// Akış: yasaklı adres denetimi (tarayıcı açılmadan) → giriş (tarif + giriş profili; CAPTCHA/kimlik/zaman aşımı açık
// hatalar) → her bağlam profili için: bağlam değiştirme (tarif adımları) → YENİ sekmede hedef sayfa (form gönderimi
// etkisiz) → sakinleşme → görünür alan envanteri → ekran görüntüsü → isteğe bağlı seçim keşfi (≤ 8 seçenekli her
// açılır listede her seçenek denenir, beliren/kaybolan alanlar kaydedilir, ilk değer geri yüklenir).
//
// GÜVENLİK: düğme/bağlantıya TIKLANMAZ, form GÖNDERİLMEZ, alanlara YAZILMAZ, Enter'a basılmaz. Tarama aşamasında GET/HEAD
// dışındaki HER istek ağ katmanında iptal edilir ve kaydedilir (giriş ve bağlam değiştirme tarif güdümlüdür).
// Yasaklı host'a giden her istek her aşamada iptal edilir. Oturum alt süreçte diske yazılmaz ("Koşunun saklanan oturumunu
// kullan" seçiliyse sunucu koşunun şifreli oturum dosyasını okur / günceller; bkz. tarama-girisi.ts).
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { GirisHatasi, baglamiDegistir } from '../../../tests/support/giris-motoru';
import { captchaAlgila } from '../giris/algilama.mjs';
import { agHatasiMi } from '../giris/tarif.mjs';
import { adresYasakliMi, yasakDesenleri } from '../senaryolar/model-kosusu.mjs';
import { adresOzeti, istekKarari, taramaAdresleri, yasakliAdresBul, yasakliTaramaMesaji, type TaramaAsamasi } from './koruma.mjs';
import { type EngellenenIstek, type HamAlan, type HamSecenek, type Kesif, type KesifDegeri, type ProfilEnvanteri, type SayfaEnvanteri, type TaramaEnvanteri } from './paket-olusturucu.mjs';
import { taramaTarayiciAyarlari, type TaramaGirdisi, type TaramaGirisYontemi, type TaramaHataKodu, type TaramaOlayi } from './protokol.mjs';
import { girisYontemiMesaji, oturumBaglamSecenegi, taramaGirisiYap, type OturumGonderici } from './tarama-girisi';
import { formGonderimKorumasi, sayfadakiAlanlar } from './sayfa-envanteri';

export class TaramaHatasi extends Error {
  readonly kod: TaramaHataKodu;
  constructor(kod: TaramaHataKodu, mesaj: string) {
    super(mesaj);
    this.name = 'TaramaHatasi';
    this.kod = kod;
  }
}

export type OlayGonderici = (olay: TaramaOlayi) => Promise<void>;

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
      }
      durum.asama = 'tarama';
      await olay({ tur: 'profil', sira, durum: 'suruyor', adim: 'tarama' });
      const sayfa = await baglam.newPage();
      const notlar: string[] = [];
      await sayfa.addInitScript(formGonderimKorumasi);
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
    try {
      await sayfa.goto(g.hedefAdres, { waitUntil: 'domcontentloaded', timeout: sayfaAcilmaMs });
    } catch (hata) {
      const m = ilkSatir(hata);
      if (agHatasiMi(m) && !/Timeout/i.test(m)) throw new TaramaHatasi('SITE_ERISILEMEDI', `Hedef sayfa açılamadı (${adreslerGizli(m)}).`);
      if (/Timeout/i.test(m)) throw new TaramaHatasi('ZAMAN_ASIMI', `Hedef sayfa (${g.hedefYol}) ${sayfaAcilmaMs / 1000} sn içinde açılmadı.`);
      throw hata;
    }
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
  const envanter = await sayfa.evaluate(sayfadakiAlanlar);
  if (envanter.ozelBilesenSayisi) notlar.push(`${envanter.ozelBilesenSayisi} özel bileşen (role=combobox/listbox/textbox, contenteditable) alan olarak çıkarılamadı.`);
  if (envanter.cerceveSayisi) notlar.push(`Sayfada ${envanter.cerceveSayisi} çerçeve (iframe) var; içlerindeki alanlar taranmadı.`);
  let ekranGoruntusu: string | null = null;
  try {
    ekranGoruntusu = (await sayfa.screenshot({ type: 'png', timeout: 15_000 })).toString('base64');
  } catch {
    notlar.push('Ekran görüntüsü alınamadı.');
  }
  const kesifler: Kesif[] = [];
  if (g.kesif) {
    await adimBildir('kesif');
    kesifler.push(...(await secimleriKesfet(sayfa, envanter, notlar, git, sakinles, kesifSecenekSiniri)));
  }
  return { profil, yol: acilan, baslik: envanter.baslik, alanlar: envanter.alanlar, kesifler, ekranGoruntusu, notlar };
}

/**
 * Seçim keşfi: ≤ sinir (Ayarlar > Koşu > Açılır liste keşif sınırı; varsayılan 8) seçenekli, etkin, tekli her açılır listede diğer seçenekler sırayla seçilir; beliren/kaybolan
 * alanlar ve seçenekleri DEĞİŞEN diğer seçim alanları (bağımlı listeler; yalnız seçenek etiketi/değeri) kaydedilir; sonunda
 * ilk değer geri yüklenir. Seçim sayfayı başka adrese götürürse not düşülür ve hedefe
 * dönülür. (selectOption yalnızca sayfa içi durumu değiştirir; buna bağlı yazma istekleri ağ katmanında iptal edilir.)
 */
async function secimleriKesfet(
  sayfa: Page, temel: SayfaEnvanteri, notlar: string[], git: () => Promise<void>,
  sakinles: (page: Page, ms: number) => Promise<void>, sinir: number
): Promise<Kesif[]> {
  const kesifler: Kesif[] = [];
  const adaylar = temel.alanlar.filter((a) => a.tur === 'select' && !a.coklu && !a.devreDisi && !a.saltOkunur
    && (a.secenekler?.length ?? 0) >= 2 && (a.secenekler?.length ?? 0) <= sinir);
  const anahtarlar = async (): Promise<SayfaEnvanteri> => sayfa.evaluate(sayfadakiAlanlar);
  const adresAyni = (a: string, b: string): boolean => kokVeYol(a) === kokVeYol(b);
  for (const s of adaylar) {
    const l = sayfa.locator(s.secici).first();
    let ilk: string;
    try {
      ilk = await l.inputValue({ timeout: 3_000 });
    } catch {
      kesifler.push({ secim: s.anahtar, ilkDeger: null, degerler: [], geriAlindi: false, atlandi: 'liste ekranda bulunamadı' });
      continue;
    }
    const baslangic = await anahtarlar();
    const temelAnahtarlar = new Set(baslangic.alanlar.map((a) => a.anahtar));
    // Bağımlı listeler: bu seçim değişince seçenekleri değişen diğer seçim alanları (ilk değerdeki listelere göre).
    const secenekImzasi = (a: HamAlan): string => JSON.stringify((a.secenekler ?? a.radyolar ?? []).map((x) => x.deger));
    const temelSecenekler = new Map(baslangic.alanlar.filter((a) => a.anahtar !== s.anahtar && (a.secenekler || a.radyolar)).map((a) => [a.anahtar, secenekImzasi(a)]));
    const degerler: KesifDegeri[] = [];
    for (const o of s.secenekler ?? []) {
      if (o.deger === ilk) continue;
      const onceki = sayfa.url();
      try {
        await l.selectOption({ value: o.deger }, { timeout: 3_000 });
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
      degerler.push({
        deger: o.deger, metin: o.metin, gorunenler, kaybolanlar: [...temelAnahtarlar].filter((k) => !simdiAnahtarlar.has(k)), gezinme: null,
        ...(Object.keys(secenekler).length ? { secenekler } : {})
      });
    }
    let geriAlindi = false;
    try {
      if ((await l.inputValue({ timeout: 2_000 })) !== ilk) {
        await l.selectOption({ value: ilk }, { timeout: 3_000 });
        await sakinles(sayfa, SECIM_BEKLEME_MS);
      }
      geriAlindi = (await l.inputValue({ timeout: 2_000 })) === ilk;
    } catch {
      geriAlindi = false;
    }
    if (!geriAlindi) {
      notlar.push(`"${s.etiket ?? s.anahtar}" ilk değerine geri alınamadı; sayfa yeniden açıldı.`);
      await git();
    }
    kesifler.push({ secim: s.anahtar, ilkDeger: ilk, degerler, geriAlindi });
  }
  return kesifler;
}
