// ENTEGRASYON (yerel fikstür) — giriş adımlarının DAYANIKLI oynatılması: giriş sonrası "kullanıcı değiştir / bolge seç" gibi adımlar
// sayfanın kendi açılır penceresinde (yeni sekme), çerçevede (iframe) ya da seçimden sonra yeniden yüklenen sayfada yapılır; pencere
// kendiliğinden kapanabilir. Motor hedefi açık tüm sayfalarda / çerçevelerde bulmalı, seçimden sonra yüklenmeyi beklemeli, kapanan
// pencerede adımı bitmiş saymalı ya da açık kalan sayfada sürdürmelidir ("locator.selectOption: Target page, context or browser has
// been closed" hatasının yeniden üretimi).
// Güvenlik: yalnızca 127.0.0.1'deki sahte uygulama (DNS kapalı); değerler SAHTEDİR.
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { GirisHatasi, girisYap, tarifiHazirla, type GirisKimligi } from '../support/giris-motoru';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title></head><body>${govde}</body></html>`
});

type Mod = 'dugme' | 'otomatik' | 'yenile' | 'cerceve' | 'icice';
const BOLGELER = [{ kod: 'A1', ad: 'Merkez' }, { kod: 'B2', ad: 'Şube' }];
const KULLANICILAR: Record<string, string[]> = { A1: ['A1001'], B2: ['B2001', 'B2002'] };

/** Giriş + ana sayfa + "kullanıcı değiştir" açılır penceresi (mod'a göre: düğmeyle kaydeder, seçince kendiliğinden kapanır, yenilenir, çerçevede açılır). */
class Uygulama {
  mod: Mod = 'dugme';
  aktif = 'ilk.kullanici';
  readonly kaydedilen: string[] = [];

  readonly isle = (i: FiksturIstegi): FiksturYaniti => {
    const oturumlu = i.cerezler.oturum === 'acik';
    if (i.yol === '/giris' && i.yontem === 'GET') {
      return html('Giriş', '<form method="post" action="/giris"><input id="k" name="k"><input id="p" name="p" type="password"><button id="g" type="submit">Giriş</button></form>');
    }
    if (i.yol === '/giris' && i.yontem === 'POST') {
      const f = new URLSearchParams(i.govde);
      if (f.get('k') !== 'kullanici' || f.get('p') !== 'Parola-1') return html('Giriş', '<p role="alert">Bilgiler hatalı</p>');
      return { durum: 303, tur: 'text/plain', govde: '', basliklar: { location: '/', 'set-cookie': 'oturum=acik; Path=/' } };
    }
    if (!oturumlu) return { durum: 303, tur: 'text/plain', govde: '', basliklar: { location: '/giris' } };
    if (i.yol === '/') {
      return html('Ana sayfa', `<a href="/cikis">Oturumu Kapat</a> <span id="aktif">${this.aktif}</span>
<a id="kd" href="#" onclick="window.open('/kd','kd','width=520,height=420'); return false">Kullanıcı değiştir</a>
<a id="kd-cerceve" href="#" onclick="var f=document.createElement('iframe'); f.id='modal'; f.style.cssText='position:fixed;top:30px;left:30px;width:520px;height:360px;background:#fff;z-index:99'; f.src='/kd'; document.body.append(f); return false">Kullanıcı değiştir (pencere)</a>`);
    }
    if (i.yol === '/kd' && i.yontem === 'GET') return this.pencere(i.sorgu.get('bolge') ?? '');
    const liste = /^\/kd\/liste$/.exec(i.yol);
    if (liste) return { tur: 'application/json', govde: JSON.stringify(KULLANICILAR[i.sorgu.get('bolge') ?? ''] ?? []), gecikmeMs: 150 };
    if (i.yol === '/kd/kaydet' && i.yontem === 'POST') {
      const f = new URLSearchParams(i.govde);
      const kullanici = f.get('kullanici') ?? '';
      if (!(KULLANICILAR[f.get('bolge') ?? ''] ?? []).includes(kullanici)) return { durum: 400, tur: 'text/plain', govde: 'gecersiz' };
      this.aktif = kullanici;
      this.kaydedilen.push(`${f.get('bolge')}/${kullanici}`);
      return { tur: 'text/plain', govde: 'tamam' };
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  private pencere(bolge: string): FiksturYaniti {
    const secenekler = BOLGELER.map((a) => `<option value="${a.kod}"${a.kod === bolge ? ' selected' : ''}>${a.kod} - ${a.ad}</option>`).join('');
    const kullanicilar = (KULLANICILAR[bolge] ?? []).map((k) => `<option value="${k}">${k}</option>`).join('');
    return html('Kullanıcı değiştir', `<label>Bölge <select id="bolge"><option value="">Seçiniz</option>${secenekler}</select></label>
<label>Kullanıcı <select id="kullanici"><option value="">Seçiniz</option>${kullanicilar}</select></label>
${this.mod === 'icice' ? '<button id="kaydet" class="bt-blue left" type="submit"><em><span>KULLANICI DEĞİŞTİR</span></em></button>' : '<button id="kaydet" type="button">KULLANICI DEĞİŞTİR</button>'}
<script>
const MOD = ${JSON.stringify(this.mod)};
const $ = (x) => document.getElementById(x);
const kaydet = () => fetch('/kd/kaydet', { method: 'POST', keepalive: true, body: 'bolge=' + $('bolge').value + '&kullanici=' + $('kullanici').value });
const bitir = () => { if (MOD === 'cerceve') window.top.location.href = '/'; else { window.opener.location.reload(); window.close(); } };
$('bolge').addEventListener('change', async () => {
  if (MOD === 'yenile') { location.href = '/kd?bolge=' + $('bolge').value; return; }
  const l = await (await fetch('/kd/liste?bolge=' + $('bolge').value)).json();
  $('kullanici').innerHTML = '<option value="">Seçiniz</option>' + l.map((k) => '<option value="' + k + '">' + k + '</option>').join('');
});
$('kullanici').addEventListener('change', () => { if (MOD === 'otomatik') { kaydet(); bitir(); } });
$('kaydet').addEventListener('click', async () => { await kaydet(); bitir(); });
</script>`);
  }
}

const KIMLIK: GirisKimligi = { kullaniciAdi: 'kullanici', parola: 'Parola-1', totpGizli: null, sabitKod: null, smsKipi: null, ekAlanlar: { bolge: 'B2', kullanici: 'B2001' } };

let tarayici: Browser;
let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
let uygulama: Uygulama;
let baglam: BrowserContext;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  uygulama = new Uygulama();
  sunucu = await yerelSunucu(uygulama.isle);
  tarayici = await korumaliTarayici();
});
test.afterAll(async () => {
  await tarayici?.close();
  await sunucu?.kapat();
});
test.beforeEach(async () => {
  uygulama.aktif = 'ilk.kullanici';
  uygulama.kaydedilen.length = 0;
  baglam = await tarayici.newContext({ baseURL: sunucu.adres });
});
test.afterEach(async () => { await baglam.close(); });

const tarif = (adimlar: unknown[]) => tarifiHazirla({
  girisAdresi: '/giris', kullaniciAlani: '#k', parolaAlani: '#p', gonderDugmesi: '#g',
  basariGostergesi: { tur: 'metin', deger: 'Oturumu Kapat' }, hataGostergeleri: [], zamanAsimiSn: 15, girisAdimlari: adimlar
});
const temel = [{ islem: 'kullaniciAdi' }, { islem: 'parola' }, { islem: 'gonder' }];
const sec = (secici: string, deger: string) => ({ islem: 'sec', hedef: { secici }, deger, aciklama: 'Bölge seç' });

async function giris(adimlar: unknown[], log: string[] = []): Promise<void> {
  const page = await baglam.newPage();
  await girisYap(page, tarif(adimlar), KIMLIK, { izinliKokenler: [sunucu.adres], alanBeklemeMs: 5_000, log: (m) => log.push(m) });
  // Değişiklik sunucuya ulaşana kadar (kapanan pencerenin isteği) kısa bekleme.
  await expect.poll(() => uygulama.kaydedilen.length, { timeout: 10_000 }).toBe(1);
  expect(uygulama.aktif).toBe('B2001');
}

test('açılır pencere (yeni sekme): düğmeyle açılır, bolge seçilir, kullanıcı listesi gelir, kaydedilince pencere kapanır', async () => {
  test.setTimeout(90_000);
  uygulama.mod = 'dugme';
  await giris([...temel, { islem: 'tikla', hedef: { secici: '#kd' } }, sec('#bolge', '{bolge}'), sec('#kullanici', '{kullanici}'),
    { islem: 'tikla', hedef: { secici: '#kaydet' } }]);
});

test('açılır pencere seçince kendiliğinden kaydedip kapanır: kapanan pencere adımın işi sayılır, giriş hata vermez', async () => {
  test.setTimeout(90_000);
  uygulama.mod = 'otomatik';
  await giris([...temel, { islem: 'tikla', hedef: { secici: '#kd' } }, sec('#bolge', '{bolge}'), sec('#kullanici', '{kullanici}')]);
});

test('seçince sayfa yeniden yüklenir (sunucu tarafı bağımlı liste): sonraki adım yeni sayfada, yükleme beklenerek sürer', async () => {
  test.setTimeout(90_000);
  uygulama.mod = 'yenile';
  await giris([...temel, { islem: 'tikla', hedef: { secici: '#kd' } }, sec('#bolge', '{bolge}'), sec('#kullanici', '{kullanici}'),
    { islem: 'tikla', hedef: { secici: '#kaydet' } }]);
});

test('açılır pencere aynı sayfada çerçeve (iframe) olarak açılır: hedefler çerçevede bulunur', async () => {
  test.setTimeout(90_000);
  uygulama.mod = 'cerceve';
  await giris([...temel, { islem: 'tikla', hedef: { secici: '#kd-cerceve' } }, sec('#bolge', '{bolge}'), sec('#kullanici', '{kullanici}'),
    { islem: 'tikla', hedef: { secici: '#kaydet' } }]);
});

test('"kod - ad" biçimindeki seçenek, verilen kısmi metinle seçilir (tam eşleşme yoksa)', async () => {
  test.setTimeout(90_000);
  uygulama.mod = 'dugme';
  await giris([...temel, { islem: 'tikla', hedef: { secici: '#kd' } }, sec('#bolge', 'B2 - Şu'), sec('#kullanici', '{kullanici}'),
    { islem: 'tikla', hedef: { secici: '#kaydet' } }]);
});

test('hedef hiçbir pencerede yoksa: kısa sürede açık Türkçe adım hatası (sessiz bekleme yok)', async () => {
  test.setTimeout(90_000);
  uygulama.mod = 'dugme';
  const page = await baglam.newPage();
  const basla = Date.now();
  const hata = await girisYap(page, tarif([...temel, { islem: 'tikla', hedef: { secici: '#yok-boyle-bir-dugme' }, zamanAsimiSn: 2 }]), KIMLIK, { izinliKokenler: [sunucu.adres], alanBeklemeMs: 5_000 })
    .then(() => null, (h: unknown) => h);
  expect(hata).toBeInstanceOf(GirisHatasi);
  expect((hata as GirisHatasi).kod).toBe('GIRIS_ADIMI');
  expect((hata as GirisHatasi).message).toContain('Adım 4');
  expect(Date.now() - basla).toBeLessThan(20_000);
});

test('metni iç içe öğelerde olan düğme (<button><em><span>…): eski kayıtlı `button:text-is("…")` seçicisi de bulunur ve tıklanır', async () => {
  test.setTimeout(90_000);
  uygulama.mod = 'icice';
  // Kayıt bu seçiciyi üretmişti; Playwright :text-is() yalnız metni doğrudan taşıyan en küçük öğeyle (span) eşleştiği için `button` ile hiç eşleşmiyordu.
  await giris([...temel, { islem: 'tikla', hedef: { secici: '#kd' } }, sec('#bolge', '{bolge}'), sec('#kullanici', '{kullanici}'),
    { islem: 'tikla', hedef: { secici: 'button:text-is("KULLANICI DEĞİŞTİR")' }, aciklama: '“KULLANICI DEĞİŞTİR” düğmesine bas' }]);
});
