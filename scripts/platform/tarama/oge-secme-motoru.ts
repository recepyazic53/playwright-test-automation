// ÖĞE SEÇME MOTORU ("Sayfada seç"; genel) — tarama alt sürecinde (tarama.spec.ts, girdi.kip = 'ogeSecme') GÖRÜNÜR bir tarayıcıda
// çalışır. Hiçbir proje adı / seçicisi yoktur: giriş ve bağlam adımları ortamın giriş tarifinden gelir (tarama ve akış kaydıyla
// aynı yol: tarama-girisi.ts — saklanan oturum ya da baştan giriş).
//
// Akış: yasaklı adres denetimi (tarayıcı açılmadan) → giriş (tarif) → bağlam (en fazla bir profil) → hedef sayfa + sayfadaki Nöbetçi
// paneli (oge-secme-paneli.ts). Kullanıcı "Öğe seç" açıkken bir öğeye tıklar; tıklama sayfaya İLETİLMEZ. Panel öğenin seçici
// adaylarını verir; motor her adayı Playwright ile sayfada denetler (tam bir eşleşme ve tıklanan öğenin kendisi) ve ilk geçeni
// seçer — öncelik türe göre: düğme / alan için rol + ad → görünen metin → kimlik → ad / etiket → adsız rol → CSS; sonuç / göstergeler
// için değişken (rakam içeren) metinli seçiciler atlanır. Kırılganlık seçicinin türünden gelir.
//
// GÜVENLİK / GİZLİLİK: seçme aşamasında GET/HEAD dışındaki HER istek ağ katmanında iptal edilir (koruma.mjs > istekKarari, aşama
// 'secme') ve sayfada form gönderimi etkisizdir (formGonderimKorumasi): kullanıcı "Öğe seç" kapalıyken sayfayı kullansa da kayıt
// oluşmaz, form gönderilmez. Yasaklı host / izinli köken engeli her aşamada sürer. Alan DEĞERLERİ okunmaz; ekran görüntüsü alınmaz.
import type { Browser, Page } from '@playwright/test';
import { baglamiDegistir } from '../../../tests/support/giris-motoru';
import { captchaAlgila } from '../giris/algilama.mjs';
import { agHatasiMi } from '../giris/tarif.mjs';
import { adresYasakliMi, yasakDesenleri } from '../senaryolar/model-kosusu.mjs';
import { adresOzeti, istekKarari, taramaAdresleri, yasakliAdresBul, yasakliTaramaMesaji, type TaramaAsamasi } from './koruma.mjs';
import { ALAN_TURLERI, OGE_TURLERI, OGE_TUR_ADLARI, secilenOgeleriAyikla, type OgeSecmeSonucu, type SecilenOge, type SecilenOgeTuru } from './oge-isaretleri.mjs';
import type { EngellenenIstek } from './paket-olusturucu.mjs';
import { SECIM_KOPRUSU, SECIM_PANELI_KIMLIGI, taramaTarayiciAyarlari, type TaramaGirdisi, type TaramaGirisYontemi, type TaramaOlayi } from './protokol.mjs';
import { girisYontemiMesaji, isteklerBitsin, oturumBaglamSecenegi, taramaGirisiYap, type OturumGonderici } from './tarama-girisi';
import { ogeBilgisi, ogeSecmePaneliniKur, type SeciciAdayi, type SecimPaneliDurumu } from './oge-secme-paneli';
import { formGonderimKorumasi, sayfadakiAlanlar } from './sayfa-envanteri';
import { TaramaHatasi, alanKapsami, hataBilgisi, type OlayGonderici } from './tarama-motoru';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const ilkSatir = (hata: unknown): string => String(hata instanceof Error ? hata.message : hata).replace(ANSI, '').split('\n')[0].slice(0, 300);
const adreslerGizli = (m: string): string => m.replace(/https?:\/\/\S+/g, '<adres>');
const yolu = (adres: string): string => { try { const u = new URL(adres); return `${u.pathname}${u.search}`; } catch { return '?'; } };
const nesneMi = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null && !Array.isArray(d);

/** Elle alan türlerinin panelde görünen adları. */
const ALAN_TURU_ADLARI: Record<string, string> = { text: 'Metin', number: 'Sayı', date: 'Tarih', tel: 'Telefon', email: 'E-posta', textarea: 'Uzun metin', checkbox: 'Onay kutusu' };

/**
 * Seçilen türe göre adayların deneme sırası. Sonuç ve göstergelerde metni rakam içeren (her koşuda değişen) rol / metin seçicileri
 * atlanır. @param {SeciciAdayi[]} adaylar @param {SecilenOgeTuru} tur
 */
export function adaySirasi(adaylar: SeciciAdayi[], tur: SecilenOgeTuru): SeciciAdayi[] {
  const cikti = tur === 'sonuc' || tur === 'basari' || tur === 'hata';
  const sira = cikti ? ['rol', 'kimlik', 'etiket', 'rolAdsiz', 'metin', 'css'] : ['rol', 'metin', 'kimlik', 'etiket', 'rolAdsiz', 'css'];
  return adaylar.filter((a) => !(cikti && (a.tur === 'rol' || a.tur === 'metin') && /\d/.test(a.secici)))
    .map((a, i) => ({ a, i })).sort((x, y) => sira.indexOf(x.a.tur) - sira.indexOf(y.a.tur) || x.i - y.i).map((x) => x.a);
}

/** "Sayfada seç": kullanıcının seçtiği öğeleri döner. Hata / iptal durumunda TaramaHatasi / GirisHatasi fırlatır. */
export async function ogeleriSec(browser: Browser, g: TaramaGirdisi, olay: OlayGonderici, oturumGonder?: OturumGonderici): Promise<OgeSecmeSonucu> {
  const bildir = (o: TaramaOlayi): void => { void olay(o).catch(() => undefined); };
  await olay({ tur: 'adim', adim: 'hazirlik', durum: 'suruyor' });
  if (g.profiller.length > 1) throw new TaramaHatasi('BAGLAM_ADIMI', 'Öğe seçme en fazla bir bağlam profiliyle yapılır.');
  const turler: SecilenOgeTuru[] = (g.ogeTurleri?.length ? g.ogeTurleri : [...OGE_TURLERI]).filter((t) => OGE_TURLERI.includes(t));
  const desenler = yasakDesenleri(g.yasakKaliplari.join(','));
  const yasak = yasakliAdresBul(taramaAdresleri(g.tabanUrl, g.hedefAdres, g.tarif, g.profiller.map((p) => p.degerler)), desenler);
  if (yasak) throw new TaramaHatasi('YASAKLI_ADRES', yasakliTaramaMesaji(yasak));

  const baglam = await browser.newContext({
    baseURL: g.tabanUrl, ...taramaTarayiciAyarlari(g).baglam, acceptDownloads: false, serviceWorkers: 'block', ...oturumBaglamSecenegi(g)
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
  await baglam.routeWebSocket(/.*/, (ws) => {
    const url = ws.url();
    const koken = (() => { try { return new URL(url.replace(/^ws/, 'http')).origin; } catch { return ''; } })();
    const izinsiz = g.izinliKokenler && g.izinliKokenler.length ? !g.izinliKokenler.includes(koken) : false;
    if (durum.asama === 'secme' || adresYasakliMi(url.replace(/^ws/, 'http'), desenler) || izinsiz) {
      kaydet({ yontem: 'WS', adres: adresOzeti(url), asama: durum.asama, neden: 'websocket' });
      void ws.close();
      return;
    }
    ws.connectToServer();
  });
  await olay({ tur: 'adim', adim: 'hazirlik', durum: 'tamam' });

  const notlar: string[] = [];
  const ogeler: SecilenOge[] = [];
  const panelDurumu = (): SecimPaneliDurumu => ({ ogeler: ogeler.map((o) => ({ tur: o.tur, metin: o.metin, secici: o.secici, kirilganlik: o.kirilganlik })) });
  const yayinla = (): void => bildir({ tur: 'ogeler', ogeler: ogeler.map((o) => ({ ...o })) });
  let bitir: () => void = () => undefined;
  let reddet: (h: Error) => void = () => undefined;
  const bitti = new Promise<void>((c, r) => { bitir = c; reddet = r; });
  bitti.catch(() => undefined);

  /** Panelden gelen öğe: adaylar sayfada denetlenir (tek eşleşme + tıklanan öğe), ilk geçen seçici olur. */
  const ekle = async (page: Page, ham: Record<string, unknown>): Promise<void> => {
    if (ogeler.length >= 30) throw new Error('En fazla 30 öğe seçilebilir.');
    const tur = ham.tur as SecilenOgeTuru;
    if (!turler.includes(tur)) throw new Error('Bu tür burada seçilemez.');
    const isaret = typeof ham.isaret === 'string' && /^s\d{1,6}$/.test(ham.isaret) ? ham.isaret : null;
    if (!isaret) throw new Error('Öğe okunamadı.');
    const cerceve = Array.isArray(ham.cerceve) && ham.cerceve.length <= 2 && ham.cerceve.every((c) => typeof c === 'string' && c) ? ham.cerceve.map(String) : null;
    const kapsam = alanKapsami(page, cerceve);
    const adaylar = (Array.isArray(ham.adaylar) ? ham.adaylar : []).filter((a): a is SeciciAdayi => nesneMi(a) && typeof a.secici === 'string' && typeof a.tur === 'string' && typeof a.kirilganlik === 'string')
      .slice(0, 20);
    const gecen: SeciciAdayi[] = [];
    try {
      for (const a of adaySirasi(adaylar, tur)) {
        try {
          const l = kapsam.locator(a.secici);
          if ((await l.count()) !== 1) continue;
          if ((await l.first().getAttribute('data-nobetci-secilen', { timeout: 1_000 })) !== isaret) continue;
          gecen.push(a);
        } catch { /* geçersiz seçici: sonraki aday */ }
      }
    } finally {
      await kapsam.locator(`[data-nobetci-secilen="${isaret}"]`).evaluateAll((els) => { for (const e of els) e.removeAttribute('data-nobetci-secilen'); }).catch(() => undefined);
    }
    const secilen = gecen[0];
    if (!secilen) throw new Error('Bu öğe için tek başına bulunan bir seçici üretilemedi; öğenin içindeki ya da çevresindeki başka bir öğeyi seçin.');
    // Radyo / onay kutusu grubu: grubun kendi seçicisi (envanter) korunur; diğer alanlarda üretilen seçici kullanılır.
    const hamAlan = tur === 'alan' && nesneMi(ham.alan) ? ham.alan : null;
    const grup = hamAlan && (hamAlan.tur === 'radio' || typeof hamAlan.grup === 'string');
    const alan = hamAlan ? {
      ...hamAlan, ...(grup ? {} : { secici: secilen.secici, kirilganlik: secilen.kirilganlik }),
      adaySeciciler: [...new Set([...(grup ? [] : gecen.map((x) => x.secici)), ...(Array.isArray(hamAlan.adaySeciciler) ? hamAlan.adaySeciciler.map(String) : []), String(hamAlan.secici)])],
      ...(cerceve ? { cerceve } : {})
    } : undefined;
    const { ogeler: temiz, hatalar } = secilenOgeleriAyikla([{
      tur, secici: alan && grup ? alan.secici : secilen.secici, kirilganlik: alan && grup ? alan.kirilganlik : secilen.kirilganlik,
      seciciTuru: secilen.tur === 'rolAdsiz' ? 'rol' : secilen.tur, metin: ham.metin, cerceve, adaySeciciler: gecen.map((x) => x.secici), alan, alanTuru: ham.alanTuru
    }], turler);
    if (hatalar.length || !temiz.length) throw new Error(hatalar[0] ?? 'Öğe eklenemedi.');
    ogeler.push(temiz[0]);
    bildir({ tur: 'bilgi', mesaj: `Seçildi (${OGE_TUR_ADLARI[tur]}): ${temiz[0].metin ?? temiz[0].secici}` });
    yayinla();
  };

  try {
    const paneliKur = async (): Promise<void> => {
      await baglam.exposeBinding(SECIM_KOPRUSU, async (kaynak, veri: Record<string, unknown>) => {
        if (veri.tur === 'durum') return panelDurumu();
        if (durum.asama !== 'secme') throw new Error('Seçim henüz başlamadı (giriş sürüyor).');
        switch (veri.tur) {
          case 'ekle':
            if (!nesneMi(veri.oge)) throw new Error('Öğe okunamadı.');
            await ekle(kaynak.page, veri.oge);
            return panelDurumu();
          case 'kaldir': {
            const i = Number(veri.sira);
            if (Number.isInteger(i) && i >= 0 && i < ogeler.length) { ogeler.splice(i, 1); yayinla(); }
            return panelDurumu();
          }
          case 'bitir':
            if (!ogeler.length) throw new Error('Önce en az bir öğe seçin.');
            bitir();
            return { tamam: true };
          case 'iptal':
            reddet(new TaramaHatasi('IPTAL', 'Öğe seçme kullanıcı tarafından iptal edildi.'));
            return { tamam: true };
          default:
            throw new Error('Bilinmeyen panel isteği.');
        }
      });
      const turAdlari = Object.fromEntries(turler.map((t) => [t, OGE_TUR_ADLARI[t]]));
      const alanTurleri = ALAN_TURLERI.map((t) => [t, ALAN_TURU_ADLARI[t] ?? t]);
      const betik = [
        `window.__nobetciSayfadakiAlanlar = ${sayfadakiAlanlar.toString()};`,
        `window.__nobetciOgeBilgisi = ${ogeBilgisi.toString()};`,
        `(${ogeSecmePaneliniKur.toString()})(${JSON.stringify({ kopru: SECIM_KOPRUSU, kimlik: SECIM_PANELI_KIMLIGI, turler, turAdlari, alanTurleri })});`
      ].join('\n');
      await baglam.addInitScript(formGonderimKorumasi);
      await baglam.addInitScript({ content: betik });
    };

    const islem = await baglam.newPage();
    baglam.on('page', (p: Page) => {
      p.on('dialog', (d) => { void d.dismiss().catch(() => undefined); });
      if (p !== islem) notlar.push('Seçim sırasında sayfa yeni bir sekme/pencere açtı.');
    });
    // Pencere kapanınca: seçilen öğe varsa onlarla biter, yoksa iptal.
    islem.on('close', () => { if (ogeler.length) bitir(); else reddet(new TaramaHatasi('IPTAL', 'Seçim penceresi kapatıldı; öğe seçilmedi.')); });
    browser.on('disconnected', () => { if (ogeler.length) bitir(); else reddet(new TaramaHatasi('IPTAL', 'Seçim tarayıcısı kapatıldı; öğe seçilmedi.')); });
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

    await olay({ tur: 'adim', adim: 'secim', durum: 'suruyor', mesaj: 'Hazırlanıyor…' });
    const profil = g.profiller[0] ?? { ad: null, degerler: null };
    if (profil.degerler && g.tarif?.baglamDegistirme) {
      durum.asama = 'baglam';
      await baglamiDegistir(islem, g.tarif, profil.degerler);
      // Yazma engeli açılmadan önce bağlam değiştirmenin son isteği bitsin (açılır penceredeki form gönderimi geç kalıp engellenmesin).
      await isteklerBitsin(islem);
    }
    durum.asama = 'secme';
    await paneliKur();
    try {
      await islem.goto(g.hedefAdres, { waitUntil: 'domcontentloaded', timeout: taramaTarayiciAyarlari(g).sayfaAcilmaMs });
    } catch (hata) {
      const m = ilkSatir(hata);
      if (/Timeout/i.test(m)) throw new TaramaHatasi('ZAMAN_ASIMI', `Hedef sayfa (${g.hedefYol}) ${taramaTarayiciAyarlari(g).sayfaAcilmaMs / 1000} sn içinde açılmadı.`);
      if (agHatasiMi(m)) throw new TaramaHatasi('SITE_ERISILEMEDI', `Hedef sayfa açılamadı (${adreslerGizli(m)}).`);
      throw hata;
    }
    const captcha = await captchaAlgila(islem);
    if (captcha.length) throw new TaramaHatasi('CAPTCHA', `Hedef sayfada CAPTCHA görüldü (${captcha.slice(0, 2).join('; ')}); otomasyon CAPTCHA çözmez.`);
    if (g.tarif && (await islem.locator(g.tarif.parolaAlani).first().isVisible().catch(() => false))) {
      throw new TaramaHatasi('OTURUM_GECERSIZ', `Hedef sayfa yerine giriş sayfası açıldı (${yolu(islem.url())}): oturum geçersiz ya da bu profil sayfaya erişemiyor.`);
    }
    await olay({ tur: 'adim', adim: 'secim', durum: 'suruyor', mesaj: 'Tarayıcıda “Öğe seç” açık: işaretlemek istediğiniz öğeye tıklayın (tıklama sayfaya gitmez), türünü seçin; bitince “Bitir”e basın.' });
    await islem.bringToFront().catch(() => undefined);

    await bitti;
    const yazma = engellenenler.filter((e) => e.neden === 'yazma').length;
    if (yazma) notlar.push(`Seçim sırasında ${yazma} yazma isteği (kayıt oluşturan / gönderen) engellendi.`);
    await olay({ tur: 'adim', adim: 'secim', durum: 'tamam', mesaj: `${ogeler.length} öğe seçildi.` });
    return { kip: 'ogeSecme', ogeler, notlar };
  } finally {
    await baglam.close().catch(() => undefined);
  }
}
