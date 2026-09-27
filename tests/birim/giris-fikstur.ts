// GİRİŞ MOTORU TESTLERİNİN YEREL FİKSTÜRLERİ (spec DEĞİL). Hiçbir test gerçek bir siteye bağlanmaz:
// - Sayfalar bellekte üretilir ve ya Playwright route.fulfill ile (tarayıcı bağlamında TÜM istekler
//   yakalanır; tanınmayan her istek iptal edilip kaydedilir) ya da 127.0.0.1'de geçici bir http
//   sunucusuyla (Nöbetçi sunucusunun kendi tarayıcısı için) servis edilir.
// - Tarayıcı ayrıca --host-resolver-rules ile başlatılır: yakalamadan kaçan bir istek olsa bile DNS
//   çözülmez (127.0.0.1 hariç). Testler, kayıtlı hiçbir isteğin dışarı çıkmadığını ve yasak örnek
//   alan adlarına (…yasak-ornek…) hiç istek gitmediğini doğrular.
// - SahtePortal: eski bir giriş kodunun seçicilerine ve
//   bilinen DoLogin davranışına göre kurulmuş SAHTE bir giriş + "Kullanıcı Değiştir" uygulaması. Gerçek
//   sitenin kopyası değildir; yalnızca eski kodun dokunduğu DOM ve istekleri taklit eder.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { totpUret, base32Coz } from '../support/totp';

export type FiksturIstegi = { yontem: string; yol: string; sorgu: URLSearchParams; govde: string; cerezler: Record<string, string> };
export type FiksturYaniti = { durum?: number; tur?: string; govde: string; basliklar?: Record<string, string>; gecikmeMs?: number };
export type FiksturUygulamasi = (istek: FiksturIstegi) => FiksturYaniti;

/** Yasak örnek alan adı deseni: hiçbir testte bu desene istek GİTMEMELİ. */
export const SIRKET_DESENI = /yasak-ornek/i;

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title></head><body>${govde}</body></html>`
});
const json = (veri: unknown, durum = 200): FiksturYaniti => ({ durum, tur: 'application/json', govde: JSON.stringify(veri) });
const bulunamadi = (): FiksturYaniti => ({ durum: 404, tur: 'text/plain', govde: 'yok' });
/** 1x1 şeffaf GIF (input type=image için). */
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function cerezleriAyristir(baslik: string | undefined): Record<string, string> {
  const sonuc: Record<string, string> = {};
  for (const parca of (baslik ?? '').split(';')) {
    const i = parca.indexOf('=');
    if (i > 0) sonuc[parca.slice(0, i).trim()] = decodeURIComponent(parca.slice(i + 1).trim());
  }
  return sonuc;
}

// ---------------------------------------------------------------------------------------
// Genel giriş sayfası örnekleri (otomatik algılama testleri)
// ---------------------------------------------------------------------------------------

/** Ortak "giriş yapıldı" sayfası ve oturum kontrolü (tüm örnekler için). */
function oturumluMu(i: FiksturIstegi): boolean { return i.cerezler.oturum === 'acik'; }
const OTURUM_CEREZI = { 'set-cookie': 'oturum=acik; Path=/; HttpOnly' };
const anaSayfa = (): FiksturYaniti => html('Ana sayfa', '<header><a href="/cikis">Çıkış yap</a></header><h1>Hoş geldiniz</h1>');
/**
 * Yönlendirme: HTTP 3xx YERİNE sayfa içi betikle. Route ile yanıtlanan 3xx'i Chromium ağ katmanında izler ve
 * sonraki istek yakalamaya UĞRAMAZ (DNS kapalı olduğu için başarısız olur) — fikstürler bu yüzden 3xx kullanmaz.
 */
const yonlendir = (adres: string, basliklar: Record<string, string> = {}): FiksturYaniti => ({
  ...html('Yönlendiriliyor', `<script>location.replace(${JSON.stringify(adres)});</script>`), basliklar
});

/**
 * Algılama/motor testleri için giriş sayfaları. Doğru kimlik: kullanici / Parola-1, kod 123456.
 *   /klasik       klasik <form>: e-posta + parola + <button type=submit>, POST /klasik/giris
 *   /goruntu      tablo düzeni, form YOK, gönder = <input type=image> (eski portal DoLogin benzeri; JS ile)
 *   /spa          form 1,5 sn sonra çizilir, <form> yok, "Giriş yap" type=button düğmesi
 *   /otp          klasik form → ikinci adımda autocomplete=one-time-code alanı (kod 123456)
 *   /hata         yanlış parolada sayfa içi hata penceresi ("Kullanıcı adı veya parola hatalı")
 *   /captcha      reCAPTCHA benzeri yer tutucu (g-recaptcha + iframe; iframe isteği yakalanır)
 */
export function girisSayfalari(): FiksturUygulamasi {
  return (i) => {
    const temiz = i.yol.replace(/\/+$/, '') || '/';
    if (temiz === '/ana') return oturumluMu(i) ? anaSayfa() : yonlendir('/klasik');
    if (temiz === '/klasik') {
      return html('Giriş', `<main><h1>Giriş</h1>
        <form method="post" action="/klasik/giris" id="giris-formu">
          <label>Arama <input type="search" name="ara"></label>
          <label for="eposta">Kullanıcı adı</label><input id="eposta" type="text" name="eposta" autocomplete="username">
          <label for="parola">Parola</label><input id="parola" type="password" name="parola" autocomplete="current-password">
          <label><input type="checkbox" name="hatirla"> Beni hatırla</label>
          <button type="submit">Giriş yap</button>
        </form><footer><button type="button" onclick="void 0">Yardım</button></footer></main>`);
    }
    if (temiz === '/klasik/giris' && i.yontem === 'POST') {
      const f = new URLSearchParams(i.govde);
      if (f.get('eposta') === 'kullanici' && f.get('parola') === 'Parola-1') return yonlendir('/ana', OTURUM_CEREZI);
      return html('Giriş', '<p class="uyari" role="alert">Kullanıcı adı veya parola hatalı</p><a href="/klasik">Geri</a>');
    }
    if (temiz === '/goruntu') {
      return html('Portal', `<table><tr><td>Kullanıcı</td><td><input type="text" size="20"></td></tr>
        <tr><td>Şifre</td><td><input type="password" size="20"></td></tr>
        <tr><td></td><td><input type="image" id="DoLogin" src="${GIF}" alt="Giriş" width="80" height="24"></td></tr></table>
        <script>
          document.getElementById('DoLogin').addEventListener('click', async () => {
            const [k, p] = document.querySelectorAll('input[type=text], input[type=password]');
            const r = await fetch('/goruntu/giris', { method: 'POST', body: JSON.stringify({ k: k.value, p: p.value }) });
            if ((await r.json()).tamam) location.href = '/ana';
          });
        </script>`);
    }
    if (temiz === '/goruntu/giris' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as { k?: string; p?: string };
      return g.k === 'kullanici' && g.p === 'Parola-1' ? { ...json({ tamam: true }), basliklar: OTURUM_CEREZI } : json({ tamam: false });
    }
    if (temiz === '/spa') {
      return html('Uygulama', `<div id="kok">Yükleniyor…</div>
        <script>
          setTimeout(() => {
            document.getElementById('kok').innerHTML =
              '<div class="kart"><input placeholder="Kullanıcı adı" name="kullanici"><input type="password" placeholder="Parola">' +
              '<button type="button" id="gir">Giriş yap</button><p id="mesaj"></p></div>';
            document.getElementById('gir').onclick = async () => {
              const k = document.querySelector('[name=kullanici]').value;
              const p = document.querySelector('input[type=password]').value;
              const r = await fetch('/goruntu/giris', { method: 'POST', body: JSON.stringify({ k, p }) });
              if ((await r.json()).tamam) { document.getElementById('kok').innerHTML = '<nav><span>Hesabım</span></nav><h1>Panel</h1>'; history.pushState({}, '', '/spa/panel'); }
              else document.getElementById('mesaj').textContent = 'Giriş başarısız';
            };
          }, 1500);
        </script>`);
    }
    if (temiz === '/otp') {
      return html('Giriş', `<form method="post" action="/otp/giris"><input name="kullanici" type="text"><input name="parola" type="password">
        <input type="submit" value="Devam"></form>`);
    }
    if (temiz === '/otp/giris' && i.yontem === 'POST') {
      const f = new URLSearchParams(i.govde);
      if (f.get('kullanici') !== 'kullanici' || f.get('parola') !== 'Parola-1') return html('Giriş', '<p role="alert">Kullanıcı adı veya parola hatalı</p>');
      return html('Doğrulama', `<form method="post" action="/otp/kod"><label for="k">SMS ile gelen doğrulama kodu</label>
        <input id="k" name="dogrulamaKodu" inputmode="numeric" maxlength="6" autocomplete="one-time-code"><button>Onayla</button></form>`);
    }
    if (temiz === '/otp/kod' && i.yontem === 'POST') {
      const f = new URLSearchParams(i.govde);
      if (f.get('dogrulamaKodu') === '123456') return yonlendir('/ana', OTURUM_CEREZI);
      return html('Doğrulama', '<p role="alert">Doğrulama kodu geçersiz</p>');
    }
    if (temiz === '/hata') {
      return html('Giriş', `<div><input type="text" id="kad"><input type="password" id="sif"><button id="btn">GİRİŞ</button></div>
        <div id="pencere" hidden><p>Kullanıcı adı veya parola hatalı</p><button>Tamam</button></div>
        <script>document.getElementById('btn').onclick = () => { document.getElementById('pencere').hidden = false; };</script>`);
    }
    if (temiz === '/captcha') {
      return html('Giriş', `<form><input type="text" name="u"><input type="password" name="p">
        <div class="g-recaptcha" data-sitekey="ornek-anahtar"><iframe title="reCAPTCHA" src="https://www.google.com/recaptcha/api2/anchor?k=ornek" width="300" height="78"></iframe></div>
        <button type="submit">Giriş</button></form>`);
    }
    return bulunamadi();
  };
}

// ---------------------------------------------------------------------------------------
// Sahte portal (giriş + "Kullanıcı Değiştir")
// ---------------------------------------------------------------------------------------

export type SahtePartaj = { kod: string; ad: string; kullanicilar: string[] };

/**
 * Eski LoginPage / KullaniciDegistirPage'in dokunduğu DOM ve istekler:
 *   GET /                        oturum yoksa giriş sayfası: ilk input[type=text] kullanıcı, input[type=password],
 *                                gizli #Gauthcode satırı, #DoLogin (input type=image, JS ile gönderir). Önce hiç
 *                                <button> yoktur (eski gönder seçicisinin "ilk" eşleşeni DoLogin'dir).
 *                                Oturum varsa "Oturumu Kapat" bağlantısı + aktif kullanıcı.
 *   POST /Account/DoLogin        { u, p, c } → ok | kod (CANLI: 2FA gerekli) | hata (pencerede
 *                                "Kullanıcı veya şifrenizi hatalı yazdınız!")
 *   GET /kullanici-degistir      select2 benzeri şube + kullanıcı seçimi; window.CHANNEL_OLD = '0' gecikmeli
 *   GET /home/list-user/<kod>    şubenin kullanıcıları (JSON)
 *   POST /kullanici-degistir     { kanal, kullanici } → aktif kullanıcı değişir; sayfa
 *                                /kullanici-degistir-tamamlandi adresine gider
 * olaylar: sunucunun gördüğü istek sırası (parola/kod DEĞERİ yazılmaz; yalnızca doğru/yanlış).
 */
export class SahtePortal {
  readonly olaylar: string[] = [];
  private aktifKullanici: string;
  private readonly oturumlar = new Set<string>();
  private sayac = 0;

  constructor(private readonly s: {
    kullanici: string; parola: string; totpGizli?: string | null; partajlar: SahtePartaj[]; basariMetni?: string;
  }) {
    this.aktifKullanici = s.kullanici;
  }

  private kodDogruMu(kod: string | undefined): boolean {
    if (!this.s.totpGizli || !kod) return false;
    const anahtar = base32Coz(this.s.totpGizli);
    return [-1, 0, 1].some((k) => totpUret(anahtar, { zaman: Date.now() + k * 30_000 }) === kod);
  }

  readonly isle: FiksturUygulamasi = (i) => {
    const oturum = i.cerezler.PortalOturum && this.oturumlar.has(i.cerezler.PortalOturum);
    const yol = i.yol;
    if (yol === '/favicon.ico') return bulunamadi();
    if (yol === '/' && i.yontem === 'GET') {
      this.olaylar.push(`GET / (${oturum ? 'oturum' : 'oturumsuz'})`);
      if (oturum) {
        return html('Örnek Portal', `<div class="ust"><span id="aktif-kullanici">${this.aktifKullanici}</span>
          <a href="/Account/LogOff">${this.s.basariMetni ?? 'Oturumu Kapat'}</a></div><h1>Ana sayfa</h1>`);
      }
      return html('Örnek Portal Giriş', `<div id="giris"><table>
          <tr><td>Kullanıcı Adı</td><td><input type="text" id="UserName" name="UserName"></td></tr>
          <tr><td>Şifre</td><td><input type="password" id="Password" name="Password"></td></tr>
          <tr id="kodSatiri" style="display:none"><td>Doğrulama Kodu</td><td><input type="text" id="Gauthcode" maxlength="6"></td></tr>
          <tr><td></td><td><input type="image" id="DoLogin" src="${GIF}" alt="Giriş" width="90" height="26"></td></tr>
        </table></div>
        <div id="uyariPenceresi" style="display:none" role="dialog"><p id="uyariMetni"></p><button type="button" onclick="this.parentNode.style.display='none'">Tamam</button></div>
        <script>
          document.getElementById('DoLogin').addEventListener('click', async (o) => {
            o.preventDefault();
            const kodSatiri = document.getElementById('kodSatiri');
            const govde = { u: document.getElementById('UserName').value, p: document.getElementById('Password').value,
              c: kodSatiri.style.display === 'none' ? undefined : document.getElementById('Gauthcode').value };
            const r = await (await fetch('/Account/DoLogin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(govde) })).json();
            if (r.durum === 'ok') location.href = '/';
            else if (r.durum === 'kod') { kodSatiri.style.display = ''; document.getElementById('Gauthcode').focus(); }
            else { document.getElementById('uyariMetni').textContent = r.mesaj; document.getElementById('uyariPenceresi').style.display = 'block'; }
          });
        </script>`);
    }
    if (yol === '/Account/DoLogin' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as { u?: string; p?: string; c?: string };
      const kimlikDogru = g.u === this.s.kullanici && g.p === this.s.parola;
      const kodVar = g.c !== undefined;
      this.olaylar.push(`POST DoLogin kullanici=${g.u === this.s.kullanici ? 'dogru' : 'yanlis'} parola=${g.p === this.s.parola ? 'dogru' : 'yanlis'} kod=${kodVar ? (this.kodDogruMu(g.c) ? 'dogru' : 'yanlis') : 'yok'}`);
      if (!kimlikDogru) return json({ durum: 'hata', mesaj: 'Kullanıcı veya şifrenizi hatalı yazdınız!' });
      if (this.s.totpGizli && !kodVar) return json({ durum: 'kod' });
      if (this.s.totpGizli && !this.kodDogruMu(g.c)) return json({ durum: 'hata', mesaj: 'Doğrulama kodu hatalı!' });
      const kimlik = `o${++this.sayac}`;
      this.oturumlar.add(kimlik);
      return { ...json({ durum: 'ok' }), basliklar: { 'set-cookie': `PortalOturum=${kimlik}; Path=/; HttpOnly` } };
    }
    if (!oturum) {
      this.olaylar.push(`${i.yontem} ${yol} (oturumsuz → giriş)`);
      return yonlendir('/');
    }
    if (yol === '/kullanici-degistir' && i.yontem === 'GET') {
      this.olaylar.push('GET /kullanici-degistir');
      const secenekler = this.s.partajlar.map((p) => `<option value="${p.kod}">${p.kod} - ${p.ad}</option>`).join('');
      const partajlar = JSON.stringify(this.s.partajlar.map((p) => ({ kod: p.kod, metin: `${p.kod} - ${p.ad}` })));
      return html('Kullanıcı Değiştir', `<h1>Kullanıcı Değiştir</h1>
        <style>.select2-dropdown{position:absolute;background:#fff;border:1px solid #999;z-index:5} .select2-results li{padding:2px 6px;cursor:pointer}</style>
        <div><label>Şube</label><select id="ChangeChannel" style="display:none"><option value=""></option>${secenekler}</select>
          <span class="select2 select2-container" id="kanalKap"><span class="select2-selection"><span id="select2-ChangeChannel-container" role="textbox">Seçiniz</span></span></span></div>
        <div><label>Kullanıcı</label><select id="ChangeUsername" style="display:none"><option value=""></option></select>
          <span class="select2 select2-container" id="kullaniciKap"><span class="select2-selection"><span id="select2-ChangeUsername-container" role="textbox">Seçiniz</span></span></span></div>
        <button type="button" id="degistir">KULLANICI DEĞİŞTİR</button>
        <script>
          const PARTAJLAR = ${partajlar};
          setTimeout(() => { window.CHANNEL_OLD = '0'; }, 400);
          function acilir(kimlik, ogeler, sec, aramaVar) {
            document.querySelectorAll('.select2-container--open').forEach((e) => e.remove());
            const kap = document.createElement('span');
            kap.className = 'select2-container select2-container--open select2-dropdown';
            kap.innerHTML = (aramaVar ? '<input class="select2-search__field" type="search">' : '') + '<ul class="select2-results" id="select2-' + kimlik + '-results"></ul>';
            document.body.appendChild(kap);
            const ul = kap.querySelector('ul');
            const ciz = (filtre) => {
              ul.innerHTML = '';
              for (const o of ogeler) if (!filtre || o.metin.includes(filtre)) {
                const li = document.createElement('li'); li.textContent = o.metin;
                li.addEventListener('click', () => { kap.remove(); sec(o); });
                ul.appendChild(li);
              }
            };
            const ara = kap.querySelector('input');
            if (ara) ara.addEventListener('input', () => setTimeout(() => ciz(ara.value), 150)); else ciz('');
          }
          document.getElementById('select2-ChangeChannel-container').addEventListener('click', () =>
            acilir('ChangeChannel', PARTAJLAR, async (o) => {
              document.getElementById('ChangeChannel').value = o.kod;
              document.getElementById('select2-ChangeChannel-container').textContent = o.metin;
              const kullanicilar = await (await fetch('/home/list-user/' + encodeURIComponent(o.kod))).json();
              document.getElementById('ChangeUsername').innerHTML = '<option value=""></option>' + kullanicilar.map((k) => '<option value="' + k + '">' + k + '</option>').join('');
            }, true));
          document.getElementById('select2-ChangeUsername-container').addEventListener('click', () => {
            const ogeler = [...document.querySelectorAll('#ChangeUsername option')].filter((o) => o.value).map((o) => ({ kod: o.value, metin: o.value }));
            setTimeout(() => acilir('ChangeUsername', ogeler, (o) => {
              document.getElementById('ChangeUsername').value = o.kod;
              document.getElementById('select2-ChangeUsername-container').textContent = o.metin;
            }, false), 200);
          });
          document.getElementById('degistir').addEventListener('click', async () => {
            await fetch('/kullanici-degistir', { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ kanal: document.getElementById('ChangeChannel').value, kullanici: document.getElementById('ChangeUsername').value }) });
            location.href = '/kullanici-degistir-tamamlandi';
          });
        </script>`);
    }
    const listeEslesme = /^\/home\/list-user\/([^/]+)$/.exec(yol);
    if (listeEslesme && i.yontem === 'GET') {
      const kod = decodeURIComponent(listeEslesme[1]);
      this.olaylar.push(`GET /home/list-user/${kod}`);
      const p = this.s.partajlar.find((x) => x.kod === kod);
      return p ? json(p.kullanicilar) : json([], 404);
    }
    if (yol === '/kullanici-degistir' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as { kanal?: string; kullanici?: string };
      this.olaylar.push(`POST /kullanici-degistir kanal=${g.kanal} kullanici=${g.kullanici}`);
      if (g.kullanici) this.aktifKullanici = g.kullanici;
      return json({ tamam: true });
    }
    if (yol === '/kullanici-degistir-tamamlandi') {
      this.olaylar.push('GET /kullanici-degistir-tamamlandi');
      return html('Tamamlandı', '<p>Kullanıcı değiştirildi.</p>');
    }
    this.olaylar.push(`${i.yontem} ${yol} (bilinmeyen)`);
    return bulunamadi();
  };
}

// ---------------------------------------------------------------------------------------
// Ağ koruması: tarayıcı + bağlam
// ---------------------------------------------------------------------------------------

/** Dışarıya DNS çözümlemesi yapmayan tarayıcı (yalnızca 127.0.0.1/localhost çözülür). */
export function korumaliTarayici(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
  });
}

export type AgKaydi = {
  /** Bağlamda başlayan tüm isteklerin adresleri. */
  istekler: string[];
  /** Hiçbir fikstürün karşılamadığı (iptal edilen) istekler. */
  engellenen: string[];
  /** Yakalamadan KAÇIP DNS'e takılan istekler (olmamalı; olursa da ağa çıkamaz). */
  kacan: string[];
};

/**
 * Tüm istekleri yakalayan bağlam: adresin kökeni (origin) uygulamalar'da varsa fikstür yanıtlar; yoksa istek
 * İPTAL edilir ve kaydedilir. route.continue() HİÇ çağrılmaz — hiçbir istek ağa çıkmaz.
 */
export async function korumaliBaglam(
  tarayici: Browser, uygulamalar: Record<string, FiksturUygulamasi>, secenekler: { baseURL?: string; storageState?: string } = {}
): Promise<{ baglam: BrowserContext; ag: AgKaydi }> {
  const baglam = await tarayici.newContext({ baseURL: secenekler.baseURL, storageState: secenekler.storageState });
  const ag: AgKaydi = { istekler: [], engellenen: [], kacan: [] };
  baglam.on('request', (r) => { ag.istekler.push(r.url()); });
  baglam.on('requestfailed', (r) => { if (/ERR_NAME_NOT_RESOLVED/.test(r.failure()?.errorText ?? '')) ag.kacan.push(r.url()); });
  await baglam.route('**/*', async (route) => {
    const istek = route.request();
    const url = new URL(istek.url());
    const uygulama = uygulamalar[url.origin];
    if (!uygulama || url.protocol === 'data:') {
      ag.engellenen.push(istek.url());
      await route.abort('addressunreachable');
      return;
    }
    const y = uygulama({
      yontem: istek.method(), yol: url.pathname, sorgu: url.searchParams, govde: istek.postData() ?? '',
      cerezler: cerezleriAyristir(await istek.headerValue('cookie') ?? undefined)
    });
    await route.fulfill({ status: y.durum ?? 200, contentType: y.tur ?? 'text/plain', body: y.govde, headers: y.basliklar });
  });
  return { baglam, ag };
}

/**
 * Ağ kaydı özeti: yasak örnek alan adına giden istekler ve izinli kökenler DIŞINDA olup iptal EDİLMEMİŞ (yani
 * ağa çıkabilecek) istekler. İkisi de boş olmalıdır.
 */
export function agTemizMi(ag: AgKaydi, izinliKokenler: string[]): { sirket: string[]; disari: string[] } {
  const sirket = ag.istekler.filter((u) => SIRKET_DESENI.test(u));
  const disari = [
    ...ag.istekler.filter((u) => !u.startsWith('data:') && !izinliKokenler.includes(new URL(u).origin) && !ag.engellenen.includes(u)),
    ...ag.kacan
  ];
  return { sirket, disari };
}

// ---------------------------------------------------------------------------------------
// 127.0.0.1 üzerinde geçici http sunucusu (Nöbetçi sunucusunun kendi tarayıcısı için)
// ---------------------------------------------------------------------------------------

function govdeOku(req: IncomingMessage): Promise<string> {
  return new Promise((coz) => {
    const parcalar: Buffer[] = [];
    req.on('data', (p: Buffer) => parcalar.push(p));
    req.on('end', () => coz(Buffer.concat(parcalar).toString('utf8')));
  });
}

export async function yerelSunucu(uygulama: FiksturUygulamasi): Promise<{ adres: string; istekler: string[]; kapat: () => Promise<void> }> {
  const istekler: string[] = [];
  const sunucu: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    istekler.push(`${req.method} ${url.pathname}`);
    const y = uygulama({
      yontem: req.method ?? 'GET', yol: url.pathname, sorgu: url.searchParams, govde: await govdeOku(req),
      cerezler: cerezleriAyristir(req.headers.cookie)
    });
    if (y.gecikmeMs) await new Promise((coz) => setTimeout(coz, y.gecikmeMs));
    res.writeHead(y.durum ?? 200, { 'content-type': y.tur ?? 'text/plain', ...(y.basliklar ?? {}) });
    res.end(y.govde);
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  const port = (sunucu.address() as AddressInfo).port;
  return {
    adres: `http://127.0.0.1:${port}`,
    istekler,
    kapat: () => new Promise<void>((coz) => { sunucu.closeAllConnections(); sunucu.close(() => coz()); })
  };
}
