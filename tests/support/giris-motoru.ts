// GENEL GİRİŞ MOTORU — bir projenin/ortamın "giriş tarifini" (scripts/platform/giris/tarif.mjs) Playwright
// ile uygular. Hiçbir proje adı/seçicisi burada yoktur; tarif ortamın ayarlarındadır (Ayarlar > Giriş tarifi).
//   girisYap          giriş adımları (tarifte yoksa: kullanıcı adı → parola → giriş düğmesi; varsa aralarına ek alan /
//                     seçim / "Devam" gibi adımlar, "{alan}" = giriş profilinin ek alanı) → (varsa) ikinci adım
//                     (TOTP / SMS sabit kod / SMS elle) → başarı
//   oturumGecerliMi   kayıtlı oturum (storageState) hâlâ geçerli mi (form DOLDURULMAZ)
//   oturumuHazirla    global-setup: geçerli oturum dosyası varsa kullanır, yoksa giriş yapıp kaydeder
//   baglamiDegistir   giriş sonrası bağlam (rol/şube…) adımları, bağlam profili değerleriyle
// Hatalar GirisHatasi (kod + açık Türkçe mesaj): site erişilemedi, kullanıcı adı/parola hatalı (hata göstergesi
// göründü), iki aşamalı doğrulama başarısız, kod alınamadı, CAPTCHA, alan bulunamadı, zaman aşımı, bağlam
// adımı, tarif geçersiz. GİZLİ DEĞER (parola, TOTP anahtarı/kodu, SMS kodu) hiçbir mesaja/loga yazılmaz;
// mesajlarda adresin yalnızca yolu (pathname) geçer.
import { expect, type Browser, type Frame, type Locator, type Page } from '@playwright/test';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { ReadStream, WriteStream } from 'node:tty';
import {
  GIRIS_HATA_KODLARI, adimOzeti, agHatasiMi, baglamAlanlari, girisAdimlariniCoz, girisAlanlari, girisSonucunuSiniflandir, girisTarifiniDogrula,
  regexKacis, yerTutuculariDoldur,
  type BaglamAdimi, type GirisHataKodu, type GirisTarifi, type HataGostergesi, type Hedef
} from '../../scripts/platform/giris/tarif.mjs';
import { CAPTCHA_MESAJI, captchaAlgila, kodAlaniniAlgila } from '../../scripts/platform/giris/algilama.mjs';
import { KOD_YOLU_DEGISKENI, kodIstegiYaz, kodYanitiniBekle } from '../../scripts/platform/giris/elle-kod.mjs';
import { seciciAgaciniDuzelt } from '../../scripts/platform/tarama/secici-duzelt.mjs';
import { totpKoduUret } from './totp';
import { sureAyari } from './kosu-ayarlari';

/** Giriş için gereken kimlik bilgisi (giriş profilinden; şifre çözülmüş — yalnızca bellekte). */
export type GirisKimligi = {
  kullaniciAdi: string;
  parola: string;
  totpGizli: string | null;
  sabitKod: string | null;
  smsKipi: 'sabit' | 'elle' | null;
  /** Giriş profilinin ek alanları (ad → değer): tarifin giriş adımlarındaki "{ad}" yer tutucuları bunlarla dolar. */
  ekAlanlar?: Record<string, string>;
  /** Ek alanlardan gizli olanların ADLARI (değerleri hata/log metinlerinde maskelenir). */
  gizliEkAlanlar?: string[];
};

/** Elle kod sağlayıcı (test için değiştirilebilir). null = süre doldu. */
export type KodSaglayici = (istek: { mesaj: string; sureMs: number }) => Promise<string | null>;

export type GirisSecenekleri = {
  /** SMS "elle" kipinde kodu sağlar. Verilmezse: Nöbetçi paneli (TEST_SUNUCU_KOD_YOLU) ya da terminal. */
  kodSaglayici?: KodSaglayici;
  /** İlerleme günlüğü (gizli değer içermez). */
  log?: (mesaj: string) => void;
  /** Giriş alanlarının görünmesi için bekleme (varsayılan 15 sn). */
  alanBeklemeMs?: number;
  /**
   * Giriş bilgisinin yazılabileceği kökenler (tarif.mjs > girisKokenleri: ortamın taban adresi + tarifteki tam giriş adresi).
   * Verilirse kullanıcı adı, parola, ek alan ve doğrulama kodu YALNIZ sayfa bu kökenlerden birindeyken yazılır; aksi hâlde
   * KOKEN_UYUSMAZ (alan doldurulmaz). Nöbetçi'nin koşucuları (model koşucusu, tarama, akış kaydı) her zaman verir.
   */
  izinliKokenler?: readonly string[];
};

export class GirisHatasi extends Error {
  readonly kod: GirisHataKodu;
  constructor(kod: GirisHataKodu, ayrinti: string) {
    super(`${GIRIS_HATA_KODLARI[kod]}: ${ayrinti}`);
    this.name = 'GirisHatasi';
    this.kod = kod;
  }
}

// Ayarlar > Koşu > Gelişmiş > Giriş (varsayılan 15 sn; ortam değişkeni yoksa — ör. tarama — varsayılan). Çağrı anında okunur.
const oturumKontrolSuresiMs = (): number => sureAyari('NOBETCI_OTURUM_KONTROL_MS', 15_000, 1_000, 300_000);
const alanBeklemeSuresiMs = (): number => sureAyari('NOBETCI_GIRIS_ALAN_BEKLEME_MS', 15_000, 1_000, 300_000);
const YOKLAMA_ARALIGI_MS = 250;

const ilkSatir = (hata: unknown): string => String(hata instanceof Error ? hata.message : hata).split('\n')[0].slice(0, 300);
function yol(page: Page): string {
  try { return new URL(page.url()).pathname; } catch { return '?'; }
}

/** Platform verisindeki tarifi doğrular; geçersiz/yoksa GirisHatasi (TARIF_GECERSIZ). */
export function tarifiHazirla(ham: unknown, baglam = 'Bu ortam'): GirisTarifi {
  if (ham === null || ham === undefined) {
    throw new GirisHatasi('TARIF_GECERSIZ', `${baglam} için giriş tarifi tanımlı değil (Nöbetçi > Ayarlar > Giriş profilleri > Giriş tarifi).`);
  }
  const d = girisTarifiniDogrula(ham);
  if (!d.gecerli || !d.tarif) throw new GirisHatasi('TARIF_GECERSIZ', d.hatalar.join(' '));
  return d.tarif;
}

// ---------------------------------------------------------------------------------------
// İkinci adım kodu
// ---------------------------------------------------------------------------------------

type KodKaynagi = { tur: 'totp'; anahtar: string } | { tur: 'sabit'; kod: string } | { tur: 'elle' } | { tur: 'yok'; neden: string };

/** Tarifin ikinci adımı için kodun nereden geleceği (kodu ÜRETMEZ). */
export function kodKaynagi(tarif: GirisTarifi, kimlik: GirisKimligi): KodKaynagi {
  const ikinci = tarif.ikinciAdim;
  if (ikinci.tur === 'yok') return { tur: 'yok', neden: 'Tarifte ikinci adım yok.' };
  if (ikinci.tur === 'totp') {
    if (kimlik.totpGizli) return { tur: 'totp', anahtar: kimlik.totpGizli };
    if (kimlik.sabitKod) return { tur: 'sabit', kod: kimlik.sabitKod };
    return { tur: 'yok', neden: 'Giriş profilinde authenticator (TOTP) anahtarı ya da sabit kod tanımlı değil (Ayarlar > Giriş profilleri).' };
  }
  const kip = ikinci.smsKipi ?? kimlik.smsKipi ?? (kimlik.sabitKod ? 'sabit' : 'elle');
  if (kip === 'elle') return { tur: 'elle' };
  if (kimlik.sabitKod) return { tur: 'sabit', kod: kimlik.sabitKod };
  return { tur: 'yok', neden: 'SMS kipi "sabit test kodu" ama giriş profilinde sabit kod tanımlı değil (Ayarlar > Giriş profilleri).' };
}

/** Giriş için kimlik ve tarif yeterli mi (test.skip kararı için; ağ erişimi yok). */
export function girisHazirMi(tarif: GirisTarifi | null, kimlik: Partial<GirisKimligi> | null): { hazir: boolean; neden?: string } {
  if (!tarif) return { hazir: false, neden: 'Giriş tarifi tanımlı değil.' };
  if (!kimlik?.kullaniciAdi || !kimlik.parola) return { hazir: false, neden: 'Giriş profilinde kullanıcı adı ve parola tanımlı olmalı.' };
  const k = kodKaynagi(tarif, {
    kullaniciAdi: kimlik.kullaniciAdi, parola: kimlik.parola, totpGizli: kimlik.totpGizli ?? null, sabitKod: kimlik.sabitKod ?? null,
    smsKipi: kimlik.smsKipi ?? null
  });
  if (tarif.ikinciAdim.tur !== 'yok' && k.tur === 'yok') return { hazir: false, neden: k.neden };
  return { hazir: true };
}

/** Terminalden (TTY; worker'da /dev/tty) bir satır okur. TTY yoksa undefined, süre dolarsa null. */
async function terminaldenKodOku(soru: string, sureMs: number): Promise<string | null | undefined> {
  let giris: NodeJS.ReadableStream;
  let cikis: NodeJS.WritableStream;
  let kapat = (): void => {};
  if (process.stdin.isTTY) {
    giris = process.stdin;
    cikis = process.stderr;
  } else if (process.platform !== 'win32') {
    try {
      const fd = openSync('/dev/tty', 'r+');
      const okuma = new ReadStream(fd);
      const yazma = new WriteStream(fd);
      giris = okuma;
      cikis = yazma;
      kapat = () => { okuma.destroy(); yazma.destroy(); };
    } catch {
      return undefined;
    }
  } else {
    return undefined;
  }
  const rl = createInterface({ input: giris, output: cikis, terminal: true });
  try {
    return await new Promise<string | null>((coz) => {
      const zamanlayici = setTimeout(() => { cikis.write('\n'); coz(null); }, sureMs);
      rl.question(soru, (yanit) => { clearTimeout(zamanlayici); coz(yanit.trim()); });
    });
  } finally {
    rl.close();
    if (giris === process.stdin) process.stdin.pause();
    kapat();
  }
}

/** Varsayılan elle kod sağlayıcı: Nöbetçi koşu paneli, yoksa terminal. */
export const varsayilanKodSaglayici: KodSaglayici = async ({ mesaj, sureMs }) => {
  const kodYolu = process.env[KOD_YOLU_DEGISKENI];
  if (kodYolu) {
    kodIstegiYaz(kodYolu, { mesaj, sureMs });
    return kodYanitiniBekle(kodYolu, sureMs);
  }
  const kod = await terminaldenKodOku(`${mesaj} (${Math.round(sureMs / 1000)} sn içinde girin): `, sureMs);
  if (kod === undefined) {
    throw new GirisHatasi('KOD_GEREKLI',
      'SMS kodu koşu sırasında elle girilmeli ama bu koşu etkileşimli değil (terminal yok, Nöbetçi paneli yok). ' +
      "Koşuyu Nöbetçi'den ya da bir terminalden başlatın veya giriş profiline sabit test kodu tanımlayın.");
  }
  return kod;
};

async function koduAl(kaynak: KodKaynagi, tarif: GirisTarifi, secenekler: GirisSecenekleri): Promise<string> {
  switch (kaynak.tur) {
    case 'totp':
      try {
        return totpKoduUret(kaynak.anahtar);
      } catch (hata) {
        throw new GirisHatasi('KOD_GEREKLI', ilkSatir(hata));
      }
    case 'sabit':
      return kaynak.kod;
    case 'yok':
      throw new GirisHatasi('KOD_GEREKLI', kaynak.neden);
    case 'elle': {
      const ikinci = tarif.ikinciAdim;
      const sureMs = (ikinci.tur === 'yok' ? 180 : ikinci.elleBeklemeSn) * 1000;
      secenekler.log?.('SMS doğrulama kodu bekleniyor (elle girilecek).');
      const kod = await (secenekler.kodSaglayici ?? varsayilanKodSaglayici)({ mesaj: 'SMS ile gelen doğrulama kodunu girin', sureMs });
      if (!kod) throw new GirisHatasi('KOD_GEREKLI', `SMS doğrulama kodu ${Math.round(sureMs / 1000)} sn içinde girilmedi; giriş durduruldu.`);
      return kod;
    }
    default:
      throw new GirisHatasi('KOD_GEREKLI', 'Bilinmeyen kod kaynağı.');
  }
}

// ---------------------------------------------------------------------------------------
// Gözlem (başarı / hata / ikinci adım / CAPTCHA)
// ---------------------------------------------------------------------------------------

type Gozlem =
  | { tur: 'basari' }
  | { tur: 'hata'; gosterge: HataGostergesi }
  | { tur: 'ikinciAdim'; secici: string }
  | { tur: 'captcha'; kanit: string[] }
  | { tur: 'zamanAsimi' };

const ilkOge = (page: Page, secici: string): Locator => page.locator(secici).first();

async function gorunurMu(l: Locator): Promise<boolean> {
  try { return await l.isVisible(); } catch { return false; }
}

async function basariGorunurMu(page: Page, tarif: GirisTarifi): Promise<boolean> {
  const g = tarif.basariGostergesi;
  if (g.tur === 'url') return new RegExp(g.deger).test(page.url());
  if (g.tur === 'metin') return gorunurMu(page.getByText(g.deger, { exact: true }).first());
  return gorunurMu(ilkOge(page, g.deger));
}

async function hataGorunurMu(page: Page, g: HataGostergesi): Promise<boolean> {
  return gorunurMu(g.tur === 'metin' ? page.getByText(g.deger).first() : ilkOge(page, g.deger));
}

async function gozle(
  page: Page, tarif: GirisTarifi,
  beklenen: { hatalar: HataGostergesi[]; kodAlani: string | 'otomatik' | null; haric: string[] },
  sureMs: number
): Promise<Gozlem> {
  const son = Date.now() + sureMs;
  let tur = 0;
  for (;;) {
    // Asıl sayfa kapandıysa (site pencereyi değiştirdi) gözlem açık kalan en son sayfada sürer.
    const sayfa = aktifSayfa(page);
    if (await basariGorunurMu(sayfa, tarif)) return { tur: 'basari' };
    for (const g of beklenen.hatalar) if (await hataGorunurMu(sayfa, g)) return { tur: 'hata', gosterge: g };
    if (beklenen.kodAlani === 'otomatik') {
      const s = await kodAlaniniAlgila(sayfa, beklenen.haric);
      if (s) return { tur: 'ikinciAdim', secici: s };
    } else if (beklenen.kodAlani && (await gorunurMu(ilkOge(sayfa, beklenen.kodAlani)))) {
      return { tur: 'ikinciAdim', secici: beklenen.kodAlani };
    }
    if (tur++ % 4 === 0) {
      const kanit = await captchaAlgila(sayfa);
      if (kanit.length) return { tur: 'captcha', kanit };
    }
    if (Date.now() >= son) return { tur: 'zamanAsimi' };
    await sayfa.waitForTimeout(YOKLAMA_ARALIGI_MS).catch(() => undefined);
  }
}

function gostergeMetni(g: HataGostergesi): string {
  return g.tur === 'metin' ? `"${g.deger}"` : `öğe ${g.deger}`;
}

function basariMetni(tarif: GirisTarifi): string {
  const g = tarif.basariGostergesi;
  return g.tur === 'metin' ? `"${g.deger}" metni` : g.tur === 'url' ? `adres /${g.deger}/` : `öğe ${g.deger}`;
}

// ---------------------------------------------------------------------------------------
// Giriş
// ---------------------------------------------------------------------------------------

async function sayfayaGit(page: Page, adres: string, neden: string): Promise<void> {
  try {
    await page.goto(adres, { waitUntil: 'domcontentloaded' });
  } catch (hata) {
    const mesaj = ilkSatir(hata);
    if (agHatasiMi(mesaj)) throw new GirisHatasi('SITE_ERISILEMEDI', `${neden} açılamadı (${mesaj.replace(/https?:\/\/\S+/g, '<adres>')}).`);
    throw hata;
  }
}

/** Sayfa izinli bir kökende değilse giriş bilgisi yazılmaz (KOKEN_UYUSMAZ). */
function kokenDenetle(page: Page, izinli: readonly string[] | undefined, ne: string): void {
  kokenAdresiDenetle(page.url(), izinli, ne);
}

/** Adres (sayfa ya da çerçeve) izinli bir kökende değilse KOKEN_UYUSMAZ. */
function kokenAdresiDenetle(adres: string, izinli: readonly string[] | undefined, ne: string): void {
  if (!izinli) return;
  let koken = '';
  try { koken = new URL(adres).origin; } catch { koken = ''; }
  if (!izinli.includes(koken)) {
    throw new GirisHatasi('KOKEN_UYUSMAZ', `${ne} yazılmadı: sayfa ortamın adresinden farklı bir siteye (${koken || 'bilinmeyen adres'}) geçti. ` +
      'Giriş bilgisi yalnız ortamın taban adresinin ya da giriş tarifindeki giriş adresinin kökenine yazılır (Ayarlar > Ortamlar / Giriş tarifi).');
  }
}

async function captchaKontrol(page: Page): Promise<void> {
  const kanit = await captchaAlgila(page);
  if (kanit.length) throw new GirisHatasi('CAPTCHA', `${CAPTCHA_MESAJI} (kanıt: ${kanit.slice(0, 3).join('; ')})`);
}

async function alaniBekle(page: Page, secici: string, ad: string, sureMs = alanBeklemeSuresiMs()): Promise<Locator> {
  const l = ilkOge(page, secici);
  try {
    await l.waitFor({ state: 'visible', timeout: sureMs });
  } catch {
    await captchaKontrol(page);
    throw new GirisHatasi('ALAN_BULUNAMADI', `${ad} (${secici}) ${Math.round(sureMs / 1000)} sn içinde görünmedi (sayfa: ${yol(page)}). Giriş tarifindeki seçiciyi kontrol edin.`);
  }
  return l;
}

/**
 * Giriş düğmesine basıldıktan sonra sayfa girişi işleyene kadar bekler (adres değişti, giriş formu kayboldu, başarı ya da hata
 * göstergesi göründü ya da süre doldu). Sonraki adım (ör. başka bir sayfaya gitmek) girişi yarıda kesmesin.
 */
async function gonderdenSonrasiniBekle(page: Page, tarif: GirisTarifi, oncekiAdres: string, sureMs: number): Promise<void> {
  const son = Date.now() + Math.max(1_000, sureMs);
  for (;;) {
    const sayfa = aktifSayfa(page);
    if (sayfa !== page || sayfa.url() !== oncekiAdres) break;
    if (!(await gorunurMu(ilkOge(sayfa, tarif.parolaAlani)))) break;
    if (await basariGorunurMu(sayfa, tarif)) break;
    let hata = false;
    for (const g of tarif.hataGostergeleri) if (await hataGorunurMu(sayfa, g)) hata = true;
    if (hata || Date.now() >= son) break;
    await sayfa.waitForTimeout(YOKLAMA_ARALIGI_MS).catch(() => undefined);
  }
  await aktifSayfa(page).waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);
}

/**
 * Tarife göre giriş yapar. Başarı göstergesi görünene kadar bekler; aksi halde GirisHatasi.
 * page'in bağlamında baseURL tanımlı olmalıdır (tarifteki yollar ona göre).
 */
export async function girisYap(page: Page, tarifKaydi: GirisTarifi, kimlik: GirisKimligi, secenekler: GirisSecenekleri = {}): Promise<void> {
  // Eski kayıtlarda iç içe metinli düğme için yazılmış `tag:text-is("…")` seçicileri bulunamazdı: çalışırken düzeltilir (bkz. secici-duzelt.mjs).
  const tarif = seciciAgaciniDuzelt(tarifKaydi);
  if (!kimlik.kullaniciAdi || !kimlik.parola) {
    throw new GirisHatasi('TARIF_GECERSIZ', 'Giriş profilinde kullanıcı adı ve parola tanımlı olmalı (Ayarlar > Giriş profilleri).');
  }
  const ikinci = tarif.ikinciAdim;
  // Kod kaynağı giriş formunu doldurmadan ÖNCE denetlenir (eksikse siteye boşuna istek gitmesin).
  const kaynak = kodKaynagi(tarif, kimlik);
  if (ikinci.tur !== 'yok' && kaynak.tur === 'yok') throw new GirisHatasi('KOD_GEREKLI', kaynak.neden);

  // Giriş adımlarının kullandığı ek alanlar giriş profilinde olmalı (siteye gitmeden önce; değer yazılmaz).
  const ekAlanlar = kimlik.ekAlanlar ?? {};
  const eksik = girisAlanlari(tarif).filter((ad) => ekAlanlar[ad] === undefined || ekAlanlar[ad] === null);
  if (eksik.length) {
    throw new GirisHatasi('TARIF_GECERSIZ', `giriş adımları şu ek alanları kullanıyor ama giriş profilinde yok: ${eksik.join(', ')} (Ayarlar > Giriş profilleri > Ek alanlar).`);
  }
  const gizliler = [kimlik.parola, ...(kimlik.gizliEkAlanlar ?? []).map((ad) => ekAlanlar[ad])].filter((d): d is string => typeof d === 'string' && d.length > 0);

  await sayfayaGit(page, tarif.girisAdresi, 'Giriş sayfası');
  await captchaKontrol(page);
  const bekleme = secenekler.alanBeklemeMs;
  const adimlar = girisAdimlariniCoz(tarif);
  let gonderildi = false;
  let gonderdenSonraBeklendi = false;
  let gonderOncesiAdres = '';
  for (const [i, a] of adimlar.entries()) {
    const sure = a.zamanAsimiSn ? a.zamanAsimiSn * 1000 : bekleme;
    if (a.islem === 'kullaniciAdi') {
      const l = await alaniBekle(page, tarif.kullaniciAlani, 'Kullanıcı adı alanı', sure);
      kokenDenetle(page, secenekler.izinliKokenler, 'Kullanıcı adı');
      await l.fill(kimlik.kullaniciAdi);
    } else if (a.islem === 'parola') {
      const l = await alaniBekle(page, tarif.parolaAlani, 'Parola alanı', sure);
      kokenDenetle(page, secenekler.izinliKokenler, 'Parola');
      await l.fill(kimlik.parola);
    } else if (a.islem === 'gonder') {
      const dugme = await alaniBekle(page, tarif.gonderDugmesi, 'Giriş düğmesi', sure);
      gonderOncesiAdres = page.url();
      await dugme.click();
      gonderildi = true;
      secenekler.log?.('Kullanıcı adı ve parola gönderildi.');
    } else {
      try {
        // Giriş düğmesinden sonraki adımlar (ör. "kullanıcı değiştir" sayfasına gitmek) girişin tamamlanmasını bekler.
        if (gonderildi && !gonderdenSonraBeklendi) {
          gonderdenSonraBeklendi = true;
          await gonderdenSonrasiniBekle(page, tarif, gonderOncesiAdres, sure ?? Math.min(tarif.zamanAsimiSn * 1000, 15_000));
        }
        // Ek alan adımları da giriş profilinin (gizli olabilen) değerlerini yazar. Hedefli adımlarda hedefin kendi (sayfa / çerçeve)
        // adresi denetlenir: hedef açılır pencerede ya da çerçevede olabilir.
        if (!('hedef' in a)) kokenDenetle(aktifSayfa(page), secenekler.izinliKokenler, 'Giriş adımı');
        await adimiUygula(page, a, ekAlanlar, 'Giriş adımındaki sayfa', {
          kokenDenetimi: (adres) => kokenAdresiDenetle(adres, secenekler.izinliKokenler, 'Giriş adımı'), log: secenekler.log
        });
      } catch (hata) {
        if (hata instanceof GirisHatasi && hata.kod !== 'SITE_ERISILEMEDI') throw hata;
        // Gönderden sonraki adım başarısızsa önce "kullanıcı adı/parola hatalı" göstergesine bakılır.
        if (gonderildi) {
          for (const g of tarif.hataGostergeleri) {
            if (await hataGorunurMu(page, g)) {
              throw new GirisHatasi('KIMLIK_HATALI', `sayfada hata göstergesi göründü: ${gostergeMetni(g)}. Giriş profilindeki kullanıcı adı/parolayı kontrol edin.`);
            }
          }
          await captchaKontrol(page);
        }
        const neden = gizliMaskele(hata instanceof GirisHatasi ? hata.message : ilkSatir(hata), gizliler);
        throw new GirisHatasi('GIRIS_ADIMI', `${adimOzeti(a, i + 1)} başarısız (sayfa: ${yol(page)}): ${neden}`);
      }
    }
  }

  const sureMs = tarif.zamanAsimiSn * 1000;
  // Otomatik kod alanı algılaması giriş formunun kendi alanlarını (ek alanlar dahil) kod alanı sanmasın.
  const haric = [tarif.kullaniciAlani, tarif.parolaAlani,
    ...adimlar.flatMap((a) => ('hedef' in a && 'secici' in a.hedef && !a.hedef.secici.includes('{') ? [a.hedef.secici] : []))];
  const ilk = await gozle(page, tarif, {
    hatalar: tarif.hataGostergeleri,
    kodAlani: ikinci.tur === 'yok' ? null : ikinci.kodAlani || 'otomatik',
    haric
  }, sureMs);
  const ilkSinif = girisSonucunuSiniflandir({ asama: 'ilk', gozlem: ilk.tur === 'zamanAsimi' ? null : ilk.tur, ikinciAdimBekleniyor: ikinci.tur !== 'yok' });
  if (ilk.tur === 'basari') return;
  if (ilkSinif === 'KIMLIK_HATALI' && ilk.tur === 'hata') {
    throw new GirisHatasi('KIMLIK_HATALI', `sayfada hata göstergesi göründü: ${gostergeMetni(ilk.gosterge)}. Giriş profilindeki kullanıcı adı/parolayı kontrol edin.`);
  }
  if (ilk.tur === 'captcha') throw new GirisHatasi('CAPTCHA', `${CAPTCHA_MESAJI} (kanıt: ${ilk.kanit.slice(0, 3).join('; ')})`);
  if (ilk.tur === 'zamanAsimi' || ikinci.tur === 'yok' || ilk.tur !== 'ikinciAdim') {
    throw new GirisHatasi('ZAMAN_ASIMI', `giriş düğmesinden sonra ${tarif.zamanAsimiSn} sn içinde ${basariMetni(tarif)} görünmedi` +
      `${ikinci.tur === 'yok' ? '' : ' ve doğrulama kodu alanı çıkmadı'} (sayfa: ${yol(page)}). Site yavaş olabilir ya da tarifteki başarı göstergesi yanlış olabilir.`);
  }

  // İkinci adım: kod o anda üretilir/alınır (TOTP penceresi 30 sn).
  const kod = await koduAl(kaynak, tarif, secenekler);
  kokenDenetle(page, secenekler.izinliKokenler, 'Doğrulama kodu');
  await ilkOge(page, ilk.secici).fill(kod);
  await (await alaniBekle(page, ikinci.gonderDugmesi || tarif.gonderDugmesi, 'Kod gönder düğmesi', bekleme)).click();
  secenekler.log?.('Doğrulama kodu gönderildi.');
  const ikinciGozlem = await gozle(page, tarif, {
    hatalar: ikinci.hataGostergeleri.length ? ikinci.hataGostergeleri : tarif.hataGostergeleri, kodAlani: null, haric
  }, sureMs);
  if (ikinciGozlem.tur === 'basari') return;
  if (ikinciGozlem.tur === 'hata') {
    throw new GirisHatasi('IKI_ASAMALI_HATALI', `doğrulama kodu gönderildikten sonra hata göstergesi göründü: ${gostergeMetni(ikinciGozlem.gosterge)}` +
      `${kaynak.tur === 'totp' ? ' (TOTP anahtarı ya da bilgisayar saati yanlış olabilir)' : kaynak.tur === 'sabit' ? ' (sabit test kodu yanlış olabilir)' : ''}.`);
  }
  if (ikinciGozlem.tur === 'captcha') throw new GirisHatasi('CAPTCHA', `${CAPTCHA_MESAJI} (kanıt: ${ikinciGozlem.kanit.slice(0, 3).join('; ')})`);
  throw new GirisHatasi('IKI_ASAMALI_HATALI', `doğrulama kodu gönderildikten sonra ${tarif.zamanAsimiSn} sn içinde ${basariMetni(tarif)} görünmedi (sayfa: ${yol(page)}); kod kabul edilmemiş olabilir.`);
}

/** Adresin yolu (göreli adres sayfanın adresine göre çözülür; çözülemezse null). Sondaki "/" yok sayılır. */
function adresYolu(adres: string, taban: string): string | null {
  try { return new URL(adres, taban).pathname.replace(/\/+$/, '') || '/'; } catch { return null; }
}

/**
 * Oturum kontrol adresine gidilince uygulama giriş sayfasına yönlendirdi mi? Yalnız kontrol adresi giriş sayfasından
 * FARKLIYSA anlamlıdır (aynıysa geçerli oturum da o sayfada başlar; eski davranış: göstergeyi süre boyunca bekle).
 */
function giriseYonlendirildiMi(page: Page, tarif: GirisTarifi): boolean {
  const simdi = page.url();
  if (!/^https?:/i.test(simdi)) return false;
  const giris = adresYolu(tarif.girisAdresi, simdi);
  const kontrol = adresYolu(tarif.oturumKontrolAdresi, simdi);
  if (!giris || !kontrol || giris === kontrol) return false;
  return adresYolu(simdi, simdi) === giris;
}

/**
 * Kayıtlı oturum (storageState) hâlâ geçerli mi? Form DOLDURULMAZ: oturum kontrol adresine gidilir,
 * başarı göstergesi kısa sürede görünürse geçerlidir. Uygulama kontrol adresinden giriş sayfasına yönlendirirse
 * (oturum düşmüş) süre dolmadan hemen "geçersiz" sayılır; her testte zaman aşımı kadar beklenmez.
 */
export async function oturumGecerliMi(page: Page, tarif: GirisTarifi, sureMs = oturumKontrolSuresiMs()): Promise<boolean> {
  try {
    await sayfayaGit(page, tarif.oturumKontrolAdresi, 'Oturum kontrol sayfası');
  } catch (hata) {
    if (hata instanceof GirisHatasi) throw hata;
    return false;
  }
  const son = Date.now() + sureMs;
  for (;;) {
    if (await basariGorunurMu(page, tarif)) return true;
    if (giriseYonlendirildiMi(page, tarif)) return false;
    if (Date.now() >= son) return false;
    await page.waitForTimeout(YOKLAMA_ARALIGI_MS).catch(() => undefined);
  }
}

/**
 * global-setup: oturum dosyası varsa ve geçerliyse dokunmaz ('gecerli'); yoksa giriş yapıp oturumu
 * dosyaya yazar ('yeni').
 */
export async function oturumuHazirla(tarayici: Browser, s: {
  baseURL: string; tarif: GirisTarifi; kimlik: GirisKimligi; oturumDosyasi: string; secenekler?: GirisSecenekleri;
}): Promise<'gecerli' | 'yeni'> {
  if (existsSync(s.oturumDosyasi)) {
    const baglam = await tarayici.newContext({ baseURL: s.baseURL, storageState: s.oturumDosyasi });
    try {
      if (await oturumGecerliMi(await baglam.newPage(), s.tarif)) return 'gecerli';
    } finally {
      await baglam.close();
    }
  }
  const baglam = await tarayici.newContext({ baseURL: s.baseURL });
  try {
    await girisYap(await baglam.newPage(), s.tarif, s.kimlik, s.secenekler);
    oturumuKaydetmeyeHazirla(s.oturumDosyasi);
    await baglam.storageState({ path: s.oturumDosyasi });
    return 'yeni';
  } finally {
    await baglam.close();
  }
}

/** Oturum dosyasının klasörünü oluşturur. */
export function oturumuKaydetmeyeHazirla(oturumDosyasi: string): void {
  mkdirSync(dirname(oturumDosyasi), { recursive: true });
}

/**
 * Oturumu kapatır ("temiz oturum" / "yeniden giriş"): bağlamın TÜM çerezleri silinir, açık sayfanın kökeninde yerel ve oturum
 * depolaması temizlenir. Sayfa yeni bir girişe hazırdır (kayıtlı oturum dosyasına dokunulmaz).
 */
export async function oturumuKapat(page: Page): Promise<void> {
  await page.context().clearCookies();
  if (/^https?:/i.test(page.url())) {
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* depolama kapalı */ } }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------
// Bağlam değiştirme
// ---------------------------------------------------------------------------------------

/** Hedefin arandığı yer: sayfa ya da çerçeve (ikisinde de getByRole / locator vardır). */
type Kapsam = Pick<Page, 'getByRole' | 'locator'>;

function hedefLocator(kapsam: Kapsam, hedef: Hedef, degerler: Record<string, unknown>): Locator {
  if ('rol' in hedef) {
    return kapsam.getByRole(hedef.rol as Parameters<Page['getByRole']>[0], { name: yerTutuculariDoldur(hedef.ad, degerler) }).first();
  }
  let l = kapsam.locator(yerTutuculariDoldur(hedef.secici, degerler));
  if (hedef.metin !== undefined) {
    const metin = yerTutuculariDoldur(hedef.metin, degerler);
    l = l.filter({ hasText: hedef.tamMetin ? new RegExp(`^${regexKacis(metin)}$`) : metin });
  }
  return l.first();
}

/** Metindeki gizli değerleri (parola, gizli ek alanlar) maskeler (3 karakterden kısa değerler metni bozmasın diye atlanır). */
export function gizliMaskele(metin: string, gizliler: readonly string[]): string {
  let sonuc = metin;
  for (const g of [...gizliler].filter((x) => x.length >= 3).sort((x, y) => y.length - x.length)) sonuc = sonuc.split(g).join('•••');
  return sonuc;
}

// ---------------------------------------------------------------------------------------
// Dayanıklı adım oynatma: açılır pencere (yeni sekme), çerçeve (iframe), seçimden sonra yeniden yüklenen ya da kapanan sayfa
// ---------------------------------------------------------------------------------------

/** Adım süresi belirtilmediğinde hedefin bulunması için beklenen süre: eylemlerde Playwright'ın eylem, doğrulamalarda beklenti varsayılanı. */
const VARSAYILAN_EYLEM_SURESI_MS = 30_000;
const VARSAYILAN_DOGRULAMA_SURESI_MS = 5_000;
const KAPANMA_HATASI = /has been closed|Target closed|Target page, context or browser/i;
const kapanmaHatasiMi = (hata: unknown): boolean => KAPANMA_HATASI.test(String(hata instanceof Error ? hata.message : hata));

/**
 * Bağlamdaki açık sayfalar: asıl sayfa (hâlâ açıksa) önce, sonra en son açılandan eskiye. Site giriş sonrası pencereyi
 * kapatıp yenisini açarsa ya da bir açılır pencere (kullanıcı değiştir, bölge seçimi…) açarsa adımlar oralarda sürer.
 */
function acikSayfalar(page: Page): Page[] {
  let hepsi: Page[] = [];
  try { hepsi = page.context().pages(); } catch { hepsi = []; }
  const acik = hepsi.filter((p) => !p.isClosed());
  return [...acik.filter((p) => p === page), ...acik.filter((p) => p !== page).reverse()];
}
/** Adımların şu an uygulanacağı sayfa: asıl sayfa açıksa o, değilse en son açılan sayfa. */
const aktifSayfa = (page: Page): Page => acikSayfalar(page)[0] ?? page;

type BulunanHedef = { l: Locator; sayfa: Page; cerceve: Frame; gorunur: boolean };

/**
 * Hedefi tüm açık sayfaların tüm çerçevelerinde arar (asıl sayfanın ana çerçevesi önce). Görünen ilk eşleşme hemen döner;
 * yalnız gizli bir eşleşme varsa (ör. aramalı liste bileşeninin gizli <select>'i) gizliBeklemeMs kadar görünmesi beklenir, sonra
 * o döner (null: gizliyi hemen kabul etme, süre sonunda dön). Süre dolunca yalnız gizli eşleşme varsa o, hiç yoksa null.
 */
async function hedefiBul(page: Page, hedef: Hedef, degerler: Record<string, unknown>, sureMs: number, gizliBeklemeMs: number | null): Promise<BulunanHedef | null> {
  const son = Date.now() + sureMs;
  let gizli: BulunanHedef | null = null;
  let gizliSon = 0;
  for (;;) {
    for (const sayfa of acikSayfalar(page)) {
      for (const cerceve of sayfa.frames()) {
        const l = hedefLocator(cerceve, hedef, degerler);
        try {
          if ((await l.count()) === 0) continue;
          if (await l.isVisible()) return { l, sayfa, cerceve, gorunur: true };
          if (!gizli) { gizli = { l, sayfa, cerceve, gorunur: false }; gizliSon = Date.now() + (gizliBeklemeMs ?? sureMs); }
        } catch { /* sayfa / çerçeve kapandı ya da yükleniyor: sonraki yoklamada yeniden bakılır */ }
      }
    }
    if (gizli && gizliBeklemeMs !== null && Date.now() >= gizliSon) return gizli;
    if (Date.now() >= son) return gizli;
    await new Promise((c) => setTimeout(c, YOKLAMA_ARALIGI_MS));
  }
}

/** Seçim ya da tıklamadan sonra sayfa yeniden yükleniyorsa (ör. seçince kendiliğinden gönderen form) yüklenmesini bekler. */
async function sayfaSakinlessin(sayfa: Page): Promise<void> {
  if (sayfa.isClosed()) return;
  await sayfa.waitForTimeout(150).catch(() => undefined);
  await sayfa.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);
}

/** Adım uygulanırken kullanılan ek bilgiler (hepsi isteğe bağlı). */
type AdimBaglami = {
  /** Değer yazılacak hedefin (çerçevenin) adresi denetlenir; uygun değilse GirisHatasi fırlatır. */
  kokenDenetimi?: (adres: string) => void;
  /** İlerleme günlüğü (gizli değer içermez). */
  log?: (mesaj: string) => void;
};

/** Seçenek listesinde değeri ya da görünen metni verilen değerle başlayan / onu içeren ilk seçeneğin değeri ("kod - ad" gibi). */
async function seceneginDegeri(l: Locator, deger: string): Promise<string | null> {
  return l.evaluate((e, aranan) => {
    if (!(e instanceof HTMLSelectElement)) return null;
    const norm = (m: string): string => m.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
    const a = norm(aranan);
    const secenekler = Array.from(e.options).filter((o) => o.value !== '');
    const secilen = secenekler.find((o) => norm(o.text) === a) ?? secenekler.find((o) => norm(o.text).startsWith(a)) ?? secenekler.find((o) => norm(o.text).includes(a));
    return secilen ? secilen.value : null;
  }, deger).catch(() => null);
}

/**
 * Hedefli adımı (tıkla, doldur, seç, bekle…) dayanıklı uygular: hedef açık tüm sayfalarda / çerçevelerde aranır; seçimden sonra
 * sayfanın yeniden yüklenmesi beklenir; adımı yürüten pencere kapanırsa (seçince kendiliğinden kaydedip kapanan pencere, giriş
 * sonrası kapanıp yenisi açılan pencere) adım açık kalan sayfalarda sürdürülür ya da — tıklama / seçimse ve hedef başka yerde
 * yoksa — kapanan pencerenin işi sayılır.
 */
async function hedefAdimi(
  page: Page, a: Extract<BaglamAdimi, { hedef: Hedef }>, degerler: Record<string, unknown>, sureMs: number, baglam: AdimBaglami
): Promise<void> {
  const doldur = (m: string): string => yerTutuculariDoldur(m, degerler);
  const secim = a.islem === 'sec';
  for (let deneme = 0; ; deneme++) {
    const b = await hedefiBul(page, a.hedef, degerler, sureMs, secim ? 1_500 : null);
    const sayfa = b?.sayfa ?? aktifSayfa(page);
    const l = b ? b.l : hedefLocator(sayfa.mainFrame(), a.hedef, degerler);
    // Hedef hiç bulunamadıysa (ya da görünmüyorsa) eylem kısa süreyle denenir: Playwright'ın olağan hata iletisi çıksın, süre ikiye katlanmasın.
    const eylemMs = Math.max(sureMs, 1_000);
    // Süre adımda belirtilmediyse Playwright'ın kendi varsayılanı geçerlidir.
    const zaman = b && (b.gorunur || secim) ? (a.zamanAsimiSn ? { timeout: eylemMs } : {}) : { timeout: 1_500 };
    try {
      if (b && (a.islem === 'doldur' || secim)) baglam.kokenDenetimi?.(b.cerceve.url());
      switch (a.islem) {
        case 'tikla': {
          const beklemeler: Array<Promise<unknown>> = [];
          if (a.yanitBekle) {
            const beklenenYol = doldur(a.yanitBekle.yol);
            beklemeler.push(sayfa.waitForResponse((r) => new URL(r.url()).pathname === beklenenYol, zaman).then((r) => {
              if (!r.ok()) throw new Error(`${beklenenYol} yanıtı başarısız (HTTP ${r.status()}).`);
            }));
          }
          if (a.adresBekle) beklemeler.push(sayfa.waitForURL(new RegExp(yerTutuculariDoldur(a.adresBekle, degerler, { kacis: regexKacis })), zaman));
          await Promise.all([...beklemeler, l.click(zaman)]);
          return;
        }
        case 'doldur':
          await l.fill(doldur(a.deger), zaman);
          return;
        case 'sec': {
          const deger = doldur(a.deger);
          // Gizli <select> (aramalı liste bileşenlerinin arkasındaki gerçek liste) görünmese de değeri yazılır.
          const zorla = b ? !b.gorunur : false;
          try {
            await l.selectOption(deger, { timeout: Math.min(eylemMs, 2_000), force: zorla });
          } catch (hata) {
            if (kapanmaHatasiMi(hata)) throw hata;
            // "kod - ad" gibi metnin bir parçası verilmiş olabilir: ona uyan ilk seçenek seçilir; yoksa (liste geç doluyor olabilir)
            // kalan süre boyunca tam değer beklenir.
            const bulunan = await seceneginDegeri(l, deger);
            if (bulunan !== null) await l.selectOption(bulunan, { timeout: 5_000, force: zorla });
            else await l.selectOption(deger, { timeout: Math.max(eylemMs - 2_000, 1_000), force: zorla });
          }
          await sayfaSakinlessin(sayfa);
          return;
        }
        case 'gorunurBekle':
          await expect(l).toBeVisible(zaman);
          return;
        case 'degerBekle':
          await expect(l).toHaveValue(doldur(a.deger), zaman);
          return;
        case 'metinBekle':
          await expect(l).toContainText(doldur(a.metin), zaman);
          return;
        default:
          throw new GirisHatasi('TARIF_GECERSIZ', 'Bilinmeyen bağlam adımı.');
      }
    } catch (hata) {
      if (!kapanmaHatasiMi(hata)) throw hata;
      // Adımı yürüten sayfa / pencere kapandı. Açık sayfa hiç kalmadıysa tarayıcı ya da bağlam kapanmıştır: gerçek hata.
      if (!acikSayfalar(page).length || deneme >= 3) throw hata;
      baglam.log?.('Adımın çalıştığı pencere kapandı; adım açık kalan sayfalarda sürdürülüyor.');
      if (a.islem === 'tikla' || secim) {
        // Tıklama / seçim pencerenin kendiliğinden kapanmasına yol açmış olabilir: hedef başka bir sayfada yoksa iş yapılmış sayılır.
        const yeni = await hedefiBul(page, a.hedef, degerler, Math.min(sureMs, 3_000), secim ? 500 : null);
        if (!yeni) { baglam.log?.('Hedef başka pencerede yok: adım kapanan pencerede tamamlanmış sayıldı.'); return; }
      }
    }
  }
}

async function adimiUygula(
  page: Page, a: BaglamAdimi, degerler: Record<string, unknown>, sayfaAdi = 'Bağlam sayfası', baglam: AdimBaglami = {}
): Promise<void> {
  const doldur = (m: string): string => yerTutuculariDoldur(m, degerler);
  const zaman = a.zamanAsimiSn ? { timeout: a.zamanAsimiSn * 1000 } : {};
  const dogrulama = ['gorunurBekle', 'degerBekle', 'metinBekle', 'sayiBekle'].includes(a.islem);
  const sureMs = a.zamanAsimiSn ? a.zamanAsimiSn * 1000 : dogrulama ? VARSAYILAN_DOGRULAMA_SURESI_MS : VARSAYILAN_EYLEM_SURESI_MS;
  switch (a.islem) {
    case 'git':
      await sayfayaGit(aktifSayfa(page), doldur(a.adres), sayfaAdi);
      return;
    case 'adresBekle':
      await expect(aktifSayfa(page)).toHaveURL(new RegExp(yerTutuculariDoldur(a.desen, degerler, { kacis: regexKacis })), zaman);
      return;
    case 'kosulBekle':
      await aktifSayfa(page).waitForFunction(a.ifade, undefined, zaman);
      return;
    case 'bekle':
      // Sabit süre: sayfaya bağlı değil (bekleme sırasında pencere kapanıp açılsa da sürer).
      await new Promise<void>((coz) => { setTimeout(coz, a.saniye * 1000); });
      return;
    case 'tikla':
    case 'doldur':
    case 'sec':
    case 'gorunurBekle':
    case 'degerBekle':
    case 'metinBekle':
      await hedefAdimi(page, a, degerler, sureMs, baglam);
      return;
    case 'sayiBekle': {
      // Sayı kontrolünde "ilk öğe" DEĞİL, seçicinin tüm eşleşmeleri sayılır.
      const h = a.hedef;
      const sayfa = aktifSayfa(page);
      const l = 'rol' in h
        ? sayfa.getByRole(h.rol as Parameters<Page['getByRole']>[0], { name: doldur(h.ad) })
        : h.metin !== undefined
          ? sayfa.locator(doldur(h.secici)).filter({ hasText: h.tamMetin ? new RegExp(`^${regexKacis(doldur(h.metin))}$`) : doldur(h.metin) })
          : sayfa.locator(doldur(h.secici));
      await expect(l).toHaveCount(a.sayi, zaman);
      return;
    }
    default:
      throw new GirisHatasi('TARIF_GECERSIZ', 'Bilinmeyen bağlam adımı.');
  }
}

/**
 * Tarifin bağlam değiştirme adımlarını seçilen bağlam profilinin değerleriyle uygular. Tarifte bağlam
 * değiştirme yoksa hiçbir şey yapmaz. Her hata hangi adımda olduğunu söyler.
 */
export async function baglamiDegistir(page: Page, tarif: GirisTarifi, degerler: Record<string, unknown>): Promise<void> {
  const adimlar = tarif.baglamDegistirme?.adimlar ?? [];
  const eksik = baglamAlanlari(tarif).filter((ad) => degerler[ad] === undefined || degerler[ad] === null);
  if (eksik.length) {
    throw new GirisHatasi('TARIF_GECERSIZ', `bağlam adımları şu alanları kullanıyor ama seçilen ${tarif.baglamDegistirme?.baglamTuru ?? 'bağlam'} profilinde yok: ${eksik.join(', ')}.`);
  }
  for (const [i, a] of adimlar.entries()) {
    try {
      await adimiUygula(page, a, degerler);
    } catch (hata) {
      if (hata instanceof GirisHatasi && hata.kod !== 'SITE_ERISILEMEDI') throw hata;
      const neden = hata instanceof GirisHatasi ? hata.message : ilkSatir(hata);
      throw new GirisHatasi('BAGLAM_ADIMI', `${adimOzeti(a, i + 1)} başarısız (sayfa: ${yol(page)}): ${neden}`);
    }
  }
}
