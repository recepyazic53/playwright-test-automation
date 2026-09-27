// AKIŞ KAYDI MOTORU (genel) — "Akışı kaydet": tarama alt sürecinde (tarama.spec.ts, girdi.kip = 'kayit') GÖRÜNÜR bir
// tarayıcıda çalışır. Hiçbir proje adı/seçicisi yoktur: giriş ve bağlam adımları ortamın giriş tarifinden gelir.
//
// Akış: yasaklı adres denetimi (tarayıcı açılmadan) → giriş (tarif) → bağlam değiştirme (en fazla bir profil) → hedef
// sayfa + sayfadaki Nöbetçi paneli (kayit-paneli.ts). Akışı KULLANICI yürütür; panel yalnızca TOPLAR (topla → tasarla):
//   ekran okumaları (açılışta, seçim değişince, düğmeye basmadan hemen önce ve sonra, "Ekranı yeniden oku") → görülen
//   alanların YAPISI (sayfa-envanteri.ts), dokunulanlar, seçim alanlarının seçili SEÇENEĞİ (select/radyo; kayıtlı
//   seçeneklerden biri olmalı — "şu seçilince görünür" koşulları bundan çıkarılır),
//   kullanıcının listede işaretledikleri (varsayılan: dokunulan alanlar), basılan düğmeler (seçici + görünen metni),
//   "Mesaj seç" ile seçilen mesajlar, "Sıfırla" / "Bitir" / "İptal".
//   Seçenek gözlemleri (arka planda): her okumada seçim alanlarının (select/radyo) SEÇENEKLERİ ve o andaki diğer seçimler;
//   kullanıcı bir alana tıklayınca açılan listbox / combobox listesinin seçenekleri. Yalnız seçenek etiketi / değeri —
//   kullanıcının yazdığı metin kaydedilmez. Paketin test verisi tablolarına (bağımlı listelerde kombinasyonlar) çevrilir.
// Sonuç akış envanteridir (AkisEnvanteri); diyagram Nöbetçi'de taslaktan kurulur (akis-tasarimi.mjs) ve sayfa paketine
// çevrilir.
//
// GÜVENLİK / GİZLİLİK: kullanıcının bastığı düğmeler siteye GERÇEK istek gönderir (kayıt aşamasında yazma engeli yok;
// kullanıcı başlatırken onaylar, CANLI işaretli ortamda kayıt sunucuda reddedilir). Yasaklı host ve izinli köken engeli
// her aşamada sürer. Alan DEĞERLERİ hiçbir zaman okunmaz; kayıtta EKRAN GÖRÜNTÜSÜ ALINMAZ (kullanıcının girdiği bilgileri
// içerirdi). Oturum diske yazılmaz.
import type { Browser, Page } from '@playwright/test';
import { baglamiDegistir, girisYap } from '../../../tests/support/giris-motoru';
import { captchaAlgila } from '../giris/algilama.mjs';
import { agHatasiMi, girisKokenleri } from '../giris/tarif.mjs';
import { adresYasakliMi, yasakDesenleri } from '../senaryolar/model-kosusu.mjs';
import { adresOzeti, istekKarari, taramaAdresleri, yasakliAdresBul, yasakliTaramaMesaji, type TaramaAsamasi } from './koruma.mjs';
import type { EngellenenIstek, HamAlan, KayitOgesi, SecenekGozlemi } from './paket-olusturucu.mjs';
import type { AkisEnvanteri, AkisOkumasi, AkisOlayi } from './akis-tasarimi.mjs';
import { KAYIT_KOPRUSU, KAYIT_PANELI_KIMLIGI, taramaTarayiciAyarlari, type TaramaGirdisi, type TaramaOlayi } from './protokol.mjs';
import { acikListeSecenekleri, dokunulanlariBul, kayitPaneliniKur, secimDegerleri, type PanelDurumu } from './kayit-paneli';
import { sayfadakiAlanlar } from './sayfa-envanteri';
import { TaramaHatasi, hataBilgisi, type OlayGonderici } from './tarama-motoru';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const ilkSatir = (hata: unknown): string => String(hata instanceof Error ? hata.message : hata).replace(ANSI, '').split('\n')[0].slice(0, 300);
const adreslerGizli = (m: string): string => m.replace(/https?:\/\/\S+/g, '<adres>');
function yolu(adres: string): string {
  try { const u = new URL(adres); return `${u.pathname}${u.search}`; } catch { return '?'; }
}
const metin = (d: unknown, n: number): string | null => (typeof d === 'string' && d.trim() ? d.replace(/\s+/g, ' ').trim().slice(0, n) : null);
/** Panelden gelen öğe (seçici zorunlu; metin düğmenin/öğenin görünen yazısı). */
function oge(veri: Record<string, unknown>): KayitOgesi {
  const secici = metin(veri.secici, 500);
  if (!secici) throw new Error('Öğenin seçicisi çıkarılamadı; başka bir öğe seçin.');
  return { secici, metin: metin(veri.metin, 120) };
}

/** Akışı kaydeder ve kayıt envanterini döner. Hata/iptal durumunda TaramaHatasi/GirisHatasi fırlatır. */
export async function akisiKaydet(browser: Browser, g: TaramaGirdisi, olay: OlayGonderici): Promise<AkisEnvanteri> {
  const bildir = (o: TaramaOlayi): void => { void olay(o).catch(() => undefined); };
  await olay({ tur: 'adim', adim: 'hazirlik', durum: 'suruyor' });
  if (g.profiller.length > 1) throw new TaramaHatasi('BAGLAM_ADIMI', 'Akış kaydı en fazla bir bağlam profiliyle yapılır.');
  const desenler = yasakDesenleri(g.yasakKaliplari.join(','));
  const yasak = yasakliAdresBul(taramaAdresleri(g.tabanUrl, g.hedefAdres, g.tarif, g.profiller.map((p) => p.degerler)), desenler);
  if (yasak) throw new TaramaHatasi('YASAKLI_ADRES', yasakliTaramaMesaji(yasak));

  const baglam = await browser.newContext({
    // Sabit ekran boyutu (taramayla aynı düzen; dar pencerede menüler daralıp giriş göstergesi gizlenmesin). Boyut, dil ve saat
    // dilimi: Ayarlar > Koşu > Tarama ve akış kaydı (varsayılan 1366×900, tr-TR, bilgisayarın saat dilimi).
    baseURL: g.tabanUrl, ...taramaTarayiciAyarlari(g).baglam, acceptDownloads: false, serviceWorkers: 'block'
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
    if (adresYasakliMi(url.replace(/^ws/, 'http'), desenler) || izinsiz) {
      kaydet({ yontem: 'WS', adres: adresOzeti(url), asama: durum.asama, neden: 'websocket' });
      void ws.close();
      return;
    }
    ws.connectToServer();
  });
  await olay({ tur: 'adim', adim: 'hazirlik', durum: 'tamam' });

  const notlar: string[] = [];
  // Toplanan: görülen alanlar (ilk görülme sırasıyla), basılan düğmeler, seçilen mesajlar ve olay sırası.
  type Kayitli = { alan: HamAlan; secili: boolean; elle: boolean; dokunuldu: boolean };
  const alanlar = new Map<string, Kayitli>();
  const dugmeler: KayitOgesi[] = [];
  const mesajlar: KayitOgesi[] = [];
  const olaylar: AkisOlayi[] = [];
  // Seçenek gözlemleri (tekil; en çok 2000): alanın seçenekleri + o andaki diğer seçimler.
  const gozlemler: SecenekGozlemi[] = [];
  const gozlemImzalari = new Set<string>();
  const gozlemEkle = (g: SecenekGozlemi): void => {
    if (gozlemler.length >= 2000 || !g.secenekler.length) return;
    const imza = JSON.stringify([g.anahtar, g.secimler, g.secenekler]);
    if (gozlemImzalari.has(imza)) return;
    gozlemImzalari.add(imza);
    gozlemler.push(g);
  };
  /** Seçim alanının kayıtlı seçenekleri (select / radyo). */
  const alanSecenekleri = (a: HamAlan): Array<{ deger: string; metin: string }> =>
    (a.secenekler ?? (a.radyolar ?? []).map((x) => ({ deger: x.deger, metin: x.metin ?? x.deger }))).filter((x) => x.deger !== '').slice(0, 300);
  const haric = (o: Record<string, string>, k: string): Record<string, string> => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));
  let ilkBaslik = '';
  /** Son okumada görünen alanlar ve bir önceki okumada görünenler ("yeni" işareti için). */
  let sonGorunen = new Set<string>();
  let oncekiGorunen = new Set<string>();
  let bitir: () => void = () => undefined;
  let reddet: (h: Error) => void = () => undefined;
  const bitti = new Promise<void>((c, r) => { bitir = c; reddet = r; });
  // Hata yolunda (giriş / CAPTCHA) pencere kapanınca da reddedilir; beklenmediyse yakalanmamış ret olmasın.
  bitti.catch(() => undefined);

  const panelDurumu = (): PanelDurumu => ({
    alanlar: [...alanlar.values()].map(({ alan, secili, dokunuldu }) => ({
      anahtar: alan.anahtar, etiket: alan.etiket ?? alan.ad ?? '', tur: alan.tur, secili, dokunuldu,
      gorunuyor: sonGorunen.has(alan.anahtar), yeni: sonGorunen.has(alan.anahtar) && oncekiGorunen.size > 0 && !oncekiGorunen.has(alan.anahtar)
    })),
    dugmeler: dugmeler.map((d) => d.metin ?? d.secici),
    mesajlar: mesajlar.map((m) => m.metin ?? m.secici),
    listeler: new Set(gozlemler.map((g) => g.anahtar)).size
  });

  /**
   * Sayfadan gelen ekran anlığını süzer ve kaydeder: alan yapıları listeye (yeni alan; dokunulduysa işaretli), okuma
   * (görünenler, dokunulanlar, seçim alanlarının seçili SEÇENEĞİ — yalnızca kayıtlı seçeneklerden biriyse).
   */
  const anligiIsle = (ham: unknown): AkisOkumasi | null => {
    if (typeof ham !== 'object' || ham === null) return null;
    const a = ham as Record<string, unknown>;
    const liste = Array.isArray(a.alanlar) ? a.alanlar.slice(0, 500) : [];
    const gecerli = liste.filter((x): x is HamAlan => typeof x === 'object' && x !== null && typeof (x as HamAlan).anahtar === 'string' && typeof (x as HamAlan).secici === 'string'
      && typeof (x as HamAlan).tur === 'string' && Array.isArray((x as HamAlan).adaySeciciler) && typeof (x as HamAlan).bolum === 'object');
    const dokunulan = new Set(Array.isArray(a.dokunulan) ? a.dokunulan.filter((x): x is string => typeof x === 'string') : []);
    if (!ilkBaslik) ilkBaslik = metin(a.baslik, 200) ?? '';
    for (const alan of gecerli) {
      const k = alanlar.get(alan.anahtar);
      if (!k) alanlar.set(alan.anahtar, { alan, secili: dokunulan.has(alan.anahtar), elle: false, dokunuldu: dokunulan.has(alan.anahtar) });
      else {
        k.alan = alan;
        if (dokunulan.has(alan.anahtar)) { k.dokunuldu = true; if (!k.elle) k.secili = true; }
      }
    }
    const secimler: Record<string, string> = {};
    const hamSecim = typeof a.secimler === 'object' && a.secimler !== null ? a.secimler as Record<string, unknown> : {};
    for (const alan of gecerli) {
      if (alan.tur !== 'select' && alan.tur !== 'radio') continue;
      const v = hamSecim[alan.anahtar];
      const bilinen = new Set([...(alan.secenekler ?? []).map((s) => s.deger), ...(alan.radyolar ?? []).map((r) => r.deger)]);
      if (typeof v === 'string' && v !== '' && bilinen.has(v)) secimler[alan.anahtar] = v;
    }
    for (const alan of gecerli) {
      if (alan.tur === 'select' || alan.tur === 'radio') gozlemEkle({ anahtar: alan.anahtar, secimler: haric(secimler, alan.anahtar), secenekler: alanSecenekleri(alan), kaynak: 'liste' });
    }
    oncekiGorunen = sonGorunen;
    sonGorunen = new Set(gecerli.map((x) => x.anahtar));
    return { yol: metin(a.yol, 300) ?? '', gorunen: gecerli.map((x) => x.anahtar), dokunulan: [...dokunulan].filter((x) => sonGorunen.has(x)), secimler };
  };
  const ayniOkuma = (x: AkisOkumasi, y: AkisOkumasi): boolean => JSON.stringify([x.yol, x.gorunen, x.dokunulan, x.secimler]) === JSON.stringify([y.yol, y.gorunen, y.dokunulan, y.secimler]);
  const sonOkuma = (): AkisOkumasi | null => {
    for (let i = olaylar.length - 1; i >= 0; i--) {
      const o = olaylar[i];
      if (o.tur === 'okuma') return o.okuma;
      if (o.tur === 'tik') return o.oncesi;
    }
    return null;
  };
  const envanter = (profil: string | null): AkisEnvanteri => ({
    kip: 'kayit', bicim: 'akis', profil, baslik: ilkBaslik,
    alanlar: [...alanlar.values()].map(({ alan, secili }) => ({ alan, secili })), dugmeler, mesajlar, olaylar, engellenenler, notlar,
    secenekGozlemleri: gozlemler
  });

  try {
    // Panel köprüsü ve betiği bağlamdaki TÜM sayfalara (yeni sekme/pencere dahil) verilir — YALNIZCA giriş ve bağlam
    // değiştirme bittikten sonra (panel sayfanın üstünde durur; giriş sayfasında düğmelerin önüne geçip otomatik girişi
    // engelleyebilirdi). Hedef sayfaya gidişle birlikte yerleşir. Ekran okuma fonksiyonları (sayfa envanteri, dokunulanlar,
    // seçili seçenekler) panelin eşzamanlı kullanması için pencereye verilir.
    const paneliKur = async (): Promise<void> => {
      await baglam.exposeBinding(KAYIT_KOPRUSU, async (_kaynak, veri: Record<string, unknown>) => {
        if (veri.tur === 'durum') return panelDurumu();
        if (durum.asama !== 'kayit') throw new Error('Kayıt henüz başlamadı (giriş ve bağlam değiştirme sürüyor).');
        switch (veri.tur) {
          case 'okuma': {
            const o = anligiIsle(veri.anlik);
            if (!o) throw new Error('Ekran okunamadı.');
            const son = sonOkuma();
            if (veri.elle === true || !son || !ayniOkuma(son, o)) olaylar.push({ tur: 'okuma', okuma: o, elle: veri.elle === true });
            return panelDurumu();
          }
          case 'tik': {
            const d = oge(veri);
            const oncesi = anligiIsle(veri.anlik) ?? { yol: '', gorunen: [], dokunulan: [], secimler: {} };
            let i = dugmeler.findIndex((x) => x.secici === d.secici && x.metin === d.metin);
            if (i < 0) i = dugmeler.push(d) - 1;
            olaylar.push({ tur: 'tik', dugme: i, oncesi });
            bildir({ tur: 'bilgi', mesaj: `Düğmeye basıldı: ${d.metin ?? d.secici}` });
            return panelDurumu();
          }
          case 'mesaj': {
            const m = oge(veri);
            let i = mesajlar.findIndex((x) => x.secici === m.secici && x.metin === m.metin);
            if (i < 0) i = mesajlar.push(m) - 1;
            olaylar.push({ tur: 'mesaj', mesaj: i });
            bildir({ tur: 'bilgi', mesaj: `Mesaj seçildi: ${m.metin ?? m.secici}` });
            return panelDurumu();
          }
          case 'secenekler': {
            // Tıklanınca açılan listenin seçenekleri (yalnız görülmüş bir alan için; değer değil, seçenek etiketi / değeri).
            const k = typeof veri.anahtar === 'string' ? alanlar.get(veri.anahtar) : undefined;
            if (!k || !Array.isArray(veri.secenekler)) return panelDurumu();
            const secenekler = veri.secenekler.slice(0, 300).filter((x): x is { deger: string; metin: string } => typeof x === 'object' && x !== null
              && typeof (x as { deger?: unknown }).deger === 'string' && typeof (x as { metin?: unknown }).metin === 'string')
              .map((x) => ({ deger: x.deger.slice(0, 200), metin: x.metin.slice(0, 200) })).filter((x) => x.deger !== '');
            const hamSecim = typeof veri.secimler === 'object' && veri.secimler !== null ? veri.secimler as Record<string, unknown> : {};
            const secimler: Record<string, string> = {};
            for (const [an, v] of Object.entries(hamSecim)) {
              const a = alanlar.get(an)?.alan;
              if (!a || an === k.alan.anahtar || typeof v !== 'string' || !alanSecenekleri(a).some((x) => x.deger === v)) continue;
              secimler[an] = v;
            }
            gozlemEkle({ anahtar: k.alan.anahtar, secimler, secenekler, kaynak: 'acilir' });
            return panelDurumu();
          }
          case 'sec': {
            const k = typeof veri.anahtar === 'string' ? alanlar.get(veri.anahtar) : undefined;
            if (!k) throw new Error('Alan bulunamadı.');
            k.secili = veri.secili === true;
            k.elle = true;
            return panelDurumu();
          }
          case 'bitir': {
            if (![...alanlar.values()].some((k) => k.secili) && !dugmeler.length) throw new Error('Listede en az bir alan ya da basılmış bir düğme olmalı.');
            bitir();
            return { tamam: true };
          }
          case 'sifirla':
            // Kayıt baştan: görülen alanlar, düğmeler, mesajlar, olaylar silinir (tarayıcı açık kalır).
            alanlar.clear();
            dugmeler.splice(0);
            mesajlar.splice(0);
            olaylar.splice(0);
            gozlemler.splice(0);
            gozlemImzalari.clear();
            sonGorunen = new Set();
            oncekiGorunen = new Set();
            bildir({ tur: 'bilgi', mesaj: 'Kayıt sıfırlandı.' });
            return panelDurumu();
          case 'iptal':
            reddet(new TaramaHatasi('IPTAL', 'Kayıt kullanıcı tarafından iptal edildi.'));
            return { tamam: true };
          default:
            throw new Error('Bilinmeyen panel isteği.');
        }
      });
      const betik = [
        `window.__nobetciSayfadakiAlanlar = ${sayfadakiAlanlar.toString()};`,
        `window.__nobetciDokunulanlariBul = ${dokunulanlariBul.toString()};`,
        `window.__nobetciSecimDegerleri = ${secimDegerleri.toString()};`,
        `window.__nobetciAcikListe = ${acikListeSecenekleri.toString()};`,
        `(${kayitPaneliniKur.toString()})(${JSON.stringify({ kopru: KAYIT_KOPRUSU, kimlik: KAYIT_PANELI_KIMLIGI })});`
      ].join('\n');
      await baglam.addInitScript({ content: betik });
    };

    // Giriş (tarif güdümlü).
    const islem = await baglam.newPage();
    // Sitenin açtığı iletişim kutuları: kullanıcı düğmeye basarak eylemi istemiştir → kabul (onay/uyarı); metni kaydedilmez.
    baglam.on('page', (p: Page) => {
      p.on('dialog', (d) => {
        if (!notlar.includes('Akışta sayfa bir onay/uyarı kutusu açtı ve kabul edildi (model koşucusu onay kutularını şu an kabul etmez; gözden geçirin).')) {
          notlar.push('Akışta sayfa bir onay/uyarı kutusu açtı ve kabul edildi (model koşucusu onay kutularını şu an kabul etmez; gözden geçirin).');
        }
        void (d.type() === 'prompt' ? d.dismiss() : d.accept()).catch(() => undefined);
      });
      if (p !== islem) notlar.push('Akışta sayfa yeni bir sekme/pencere açtı; model tek sayfada koşar (gözden geçirin).');
    });
    islem.on('dialog', (d) => { void (d.type() === 'prompt' ? d.dismiss() : d.accept()).catch(() => undefined); });
    islem.on('close', () => reddet(new TaramaHatasi('IPTAL', 'Kayıt penceresi kapatıldı; kayıt iptal edildi.')));
    browser.on('disconnected', () => reddet(new TaramaHatasi('IPTAL', 'Kayıt tarayıcısı kapatıldı; kayıt iptal edildi.')));
    if (g.tarif) {
      durum.asama = 'giris';
      await olay({ tur: 'adim', adim: 'giris', durum: 'suruyor' });
      if (!g.kimlik) throw new TaramaHatasi('TARIF_GECERSIZ', 'Bu ortam için giriş profili tanımlı değil (Ayarlar > Giriş profilleri).');
      try {
        // Giriş bilgisi yalnız ortamın taban adresinin / tarifteki giriş adresinin kökenine yazılır.
        await girisYap(islem, g.tarif, g.kimlik, {
          log: (mesaj) => bildir({ tur: 'bilgi', mesaj }), izinliKokenler: girisKokenleri(g.tabanUrl, g.tarif),
          // Ayarlar > Koşu > Tarama ve akış kaydı > Girişte giriş alanı beklemesi.
          alanBeklemeMs: taramaTarayiciAyarlari(g).girisAlanBeklemeMs
        });
      } catch (hata) {
        await olay({ tur: 'adim', adim: 'giris', durum: 'hata', mesaj: hataBilgisi(hata).mesaj });
        throw hata;
      }
      await olay({ tur: 'adim', adim: 'giris', durum: 'tamam' });
    } else {
      await olay({ tur: 'adim', adim: 'giris', durum: 'atlandi', mesaj: 'Giriş tarifi yok; sayfa girişsiz açılıyor.' });
    }

    // Bağlam (en fazla bir profil) ve hedef sayfa.
    await olay({ tur: 'adim', adim: 'kayit', durum: 'suruyor', mesaj: 'Hazırlanıyor…' });
    const profil = g.profiller[0] ?? { ad: null, degerler: null };
    if (profil.degerler && g.tarif?.baglamDegistirme) {
      durum.asama = 'baglam';
      await baglamiDegistir(islem, g.tarif, profil.degerler);
    }
    durum.asama = 'kayit';
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
    await olay({ tur: 'adim', adim: 'kayit', durum: 'suruyor', mesaj: 'Tarayıcıda akışı yürütün; sayfadaki Nöbetçi paneli alanları ve düğmeleri toplar. Bitince “Bitir”e basın.' });
    await islem.bringToFront().catch(() => undefined);

    await bitti;
    const sonuc = envanter(profil.ad);
    await olay({ tur: 'adim', adim: 'kayit', durum: 'tamam', mesaj: `Kayıt bitti: ${sonuc.alanlar.filter((a) => a.secili).length} alan, ${dugmeler.length} düğme, ${mesajlar.length} mesaj.` });
    return sonuc;
  } finally {
    await baglam.close().catch(() => undefined);
  }
}
