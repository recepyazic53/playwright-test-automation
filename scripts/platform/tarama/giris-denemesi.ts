// "GİRİŞİ DENE" MOTORU (genel) — tarama alt sürecinde (tarama.spec.ts; girdi.kip = 'girisDenemesi') çalışır. Yalnız ortamın
// giriş tarifiyle giriş yapar: kayıtlı oturum KULLANILMAZ ve saklanmaz (boş bağlam, her seferinde baştan). Sonuç: başarılı mı,
// değilse hangi adımda neden takıldığı (giriş motorunun açık hataları), girişin bittiği sayfanın yolu, o anki ekran görüntüsü
// (yalnız bellekte) ve adım günlüğü (değer yok). Başarı göstergesi giriş sayfasında da görünüyorsa (ör. her adrese uyan desen)
// giriş başarılı SAYILMAZ: tarif hatası olarak bildirilir. Yasaklı adreslere giden her istek iptal edilir.
import type { Browser, Page } from '@playwright/test';
import { girisYap } from '../../../tests/support/giris-motoru';
import { girisKokenleri } from '../giris/tarif.mjs';
import { yasakDesenleri } from '../senaryolar/model-kosusu.mjs';
import { adresOzeti, istekKarari, taramaAdresleri, yasakliAdresBul, yasakliTaramaMesaji } from './koruma.mjs';
import { taramaTarayiciAyarlari, type GirisDenemesiSonucu, type TaramaGirdisi, type TaramaOlayi } from './protokol.mjs';
import { TaramaHatasi, hataBilgisi, type OlayGonderici } from './tarama-motoru';

function yolu(adres: string): string {
  try { const u = new URL(adres); return `${u.pathname}${u.search}`; } catch { return ''; }
}

async function goruntuAl(page: Page | null): Promise<string | null> {
  if (!page) return null;
  const b = await page.screenshot({ type: 'jpeg', quality: 60, timeout: 5_000 }).catch(() => null);
  return b ? b.toString('base64') : null;
}

export async function girisiDene(browser: Browser, g: TaramaGirdisi, olay: OlayGonderici): Promise<GirisDenemesiSonucu> {
  const bildir = (o: TaramaOlayi): void => { void olay(o).catch(() => undefined); };
  const gunluk: string[] = [];
  const log = (mesaj: string): void => { gunluk.push(mesaj.slice(0, 300)); bildir({ tur: 'bilgi', mesaj }); };
  if (!g.tarif || !g.kimlik) throw new TaramaHatasi('TARIF_GECERSIZ', 'Giriş tarifi ve giriş profili gerekli.');
  const tarif = g.tarif;

  await olay({ tur: 'adim', adim: 'hazirlik', durum: 'suruyor' });
  // Adres deseni giriş sayfasının adresine de uyuyorsa (ör. "/") giriş hiç doğrulanamaz: siteye gitmeden bildirilir.
  if (tarif.basariGostergesi.tur === 'url') {
    let girisAdresi = '';
    try { girisAdresi = new URL(tarif.girisAdresi, g.tabanUrl).href; } catch { girisAdresi = ''; }
    let uyar = false;
    try { uyar = Boolean(girisAdresi) && new RegExp(tarif.basariGostergesi.deger).test(girisAdresi); } catch { uyar = false; }
    if (uyar) {
      const h = {
        kod: 'TARIF_GECERSIZ' as const,
        mesaj: `Başarı göstergesi (adres deseni "${tarif.basariGostergesi.deger}") giriş sayfasının adresine de uyuyor; giriş başarısız olsa bile başarılı sayılır. Başarı göstergesini yalnız girişten sonra görünen bir yazı ya da girişten sonraki adrese özgü bir desen yapın (Ayarlar > Giriş tarifi).`
      };
      await olay({ tur: 'adim', adim: 'hazirlik', durum: 'hata', mesaj: h.mesaj });
      return { kip: 'girisDenemesi', basarili: false, yol: '', hata: h, goruntu: null, gunluk };
    }
  }
  const desenler = yasakDesenleri(g.yasakKaliplari.join(','));
  const yasak = yasakliAdresBul(taramaAdresleri(g.tabanUrl, g.hedefAdres, tarif, []), desenler);
  if (yasak) throw new TaramaHatasi('YASAKLI_ADRES', yasakliTaramaMesaji(yasak));
  const ayar = taramaTarayiciAyarlari(g);
  const baglam = await browser.newContext({ baseURL: g.tabanUrl, ...ayar.baglam, acceptDownloads: false, serviceWorkers: 'block' });
  let page: Page | null = null;
  try {
    await baglam.route('**/*', async (route) => {
      const r = route.request();
      const karar = istekKarari({ yontem: r.method(), adres: r.url(), asama: 'giris', yasakDesenleri: desenler, izinliKokenler: g.izinliKokenler });
      if (karar.izin) { await route.fallback(); return; }
      bildir({ tur: 'engellendi', yontem: r.method(), adres: adresOzeti(r.url()), asama: 'giris', neden: karar.neden ?? '' });
      await route.abort('blockedbyclient');
    });
    await olay({ tur: 'adim', adim: 'hazirlik', durum: 'tamam' });
    await olay({ tur: 'adim', adim: 'giris', durum: 'suruyor' });
    page = await baglam.newPage();
    try {
      await girisYap(page, tarif, g.kimlik, { log, izinliKokenler: girisKokenleri(g.tabanUrl, tarif), alanBeklemeMs: ayar.girisAlanBeklemeMs });
    } catch (hata) {
      const h = hataBilgisi(hata);
      await olay({ tur: 'adim', adim: 'giris', durum: 'hata', mesaj: h.mesaj });
      return { kip: 'girisDenemesi', basarili: false, yol: yolu(page.url()), hata: h, goruntu: await goruntuAl(page), gunluk };
    }
    // Başarı göstergesi giriş formu hâlâ ekrandayken de "görünüyorsa" (her adrese uyan desen vb.) giriş doğrulanamaz.
    const parolaGorunur = await page.locator(tarif.parolaAlani).first().isVisible().catch(() => false);
    if (parolaGorunur) {
      const h = {
        kod: 'TARIF_GECERSIZ' as const,
        mesaj: 'Başarı göstergesi görüldü ama giriş formu hâlâ ekranda: gösterge giriş sayfasında da görünüyor olabilir (ör. her adrese uyan "/" deseni). Başarı göstergesini yalnız girişten sonra görünen bir yazı yapın.'
      };
      await olay({ tur: 'adim', adim: 'giris', durum: 'hata', mesaj: h.mesaj });
      return { kip: 'girisDenemesi', basarili: false, yol: yolu(page.url()), hata: h, goruntu: await goruntuAl(page), gunluk };
    }
    await olay({ tur: 'adim', adim: 'giris', durum: 'tamam', mesaj: 'Giriş başarılı.' });
    return { kip: 'girisDenemesi', basarili: true, yol: yolu(page.url()), hata: null, goruntu: await goruntuAl(page), gunluk };
  } finally {
    await baglam.close().catch(() => undefined);
  }
}
