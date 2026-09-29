// ÇERÇEVE (iframe) İÇİNDE ARAMALI LİSTE + GLOBAL GÖNDERİM DOĞRULAMALI FORM — koşunun formu göndermediği hatanın yeniden üretimi:
//  - ana sayfadaki bağlantı bir pencere (fancybox benzeri) içinde iframe açar; iframe'deki formda iki gizli <select>, select2 (v4)
//    benzeri görünür kutu + gövdeye eklenen arama kutusu ve role=option sonuçlarıyla sarılı; seçenek metinleri "kod - ad",
//  - sayfa betiği kanal değerini 200 ms'de bir yoklar; değişince kullanıcı listesini ister ve kullanıcı listesini (select + kutu)
//    TAMAMEN yeniden kurar,
//  - iki gönder düğmesi ("KENDİ ADI" onclick'le değer yazar; "KULLANICI DEĞİŞTİR"), onsubmit'te ekranı kilitleyen katman ve
//    bütün formlara bağlı global doğrulama (zorunlu alan boş ya da "0" ise sayfa içi mesaj penceresi, gönderim durur),
//  - başarıda iframe tamamlandı sayfasına gider, üst sayfa "/"a yenilenir (pencere kapanır).
// Testler: koşucu kanalı "kod - ad" metninden kodla seçer, kullanıcı listesi gelir, form gönderilir (sunucu POST'u görür), pencere
// kapanır ve ekrana dönülür; doğrulama mesajı çıkarsa adım o mesajla kalır (sessiz bekleme yok).
// Güvenlik: yalnızca 127.0.0.1'deki sahte uygulama (bağımlılık yok; jQuery / select2 İNDİRİLMEZ — küçük sahte betik); DNS kapalı.
// Değerler SAHTEDİR.
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { modelSenaryosunuKos, type ModelKosuOrtami } from '../support/model-kosucu';
import { mesajYakalayicisi } from '../support/mesaj-yakalayici';
import type { PlatformModelSenaryosu } from '../support/platform-veri';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';

type Nesne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe kurulur

const html = (baslik: string, govde: string, bas = ''): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>${bas}</head><body>${govde}</body></html>`
});

/** select2 (v4) benzeri küçük sahte bileşen: gizli select, yanında görünür kutu, tıklayınca gövdeye eklenen arama + role=option. */
const SAHTE_ARAMALI_LISTE = `
function aramaliListe(sel) {
  sel.classList.add('select2-hidden-accessible');
  const kap = document.createElement('span'); kap.className = 'select2 select2-container';
  kap.innerHTML = '<span class="selection"><span class="select2-selection select2-selection--single" role="combobox" aria-haspopup="true" aria-expanded="false" tabindex="0">' +
    '<span class="select2-selection__rendered" id="select2-' + sel.id + '-container"></span></span></span>';
  sel.after(kap);
  const secim = kap.querySelector('.select2-selection');
  const yazi = kap.querySelector('.select2-selection__rendered');
  const ciz = () => { const o = sel.options[sel.selectedIndex]; yazi.textContent = o ? o.text : ''; };
  sel.addEventListener('change', ciz); ciz();
  let acilir = null;
  const kapat = () => { if (!acilir) return; acilir.remove(); acilir = null; secim.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', disari, true); };
  const disari = (o) => { if (acilir && !acilir.contains(o.target) && !kap.contains(o.target)) kapat(); };
  const ac = () => {
    const r = kap.getBoundingClientRect();
    acilir = document.createElement('span');
    acilir.className = 'select2-container select2-container--open';
    acilir.style.cssText = 'position:absolute;z-index:1051;background:#fff;border:1px solid #889;left:' + (r.left + scrollX) + 'px;top:' + (r.bottom + scrollY) + 'px;width:' + Math.max(r.width, 220) + 'px';
    acilir.innerHTML = '<span class="select2-dropdown"><span class="select2-search"><input class="select2-search__field" type="search" role="searchbox" autocomplete="off"></span>' +
      '<span class="select2-results"><ul class="select2-results__options" role="listbox"></ul></span></span>';
    document.body.append(acilir);
    const ara = acilir.querySelector('input'); const ul = acilir.querySelector('ul');
    const listele = () => {
      ul.innerHTML = '';
      const q = ara.value.toLocaleLowerCase('tr');
      for (const o of sel.options) {
        if (q && !o.text.toLocaleLowerCase('tr').includes(q)) continue;
        const li = document.createElement('li'); li.className = 'select2-results__option'; li.setAttribute('role', 'option'); li.textContent = o.text;
        li.addEventListener('mouseup', () => { sel.value = o.value; kapat(); sel.dispatchEvent(new Event('change', { bubbles: true })); });
        ul.append(li);
      }
    };
    ara.addEventListener('input', listele); listele();
    secim.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', disari, true);
    ara.focus();
  };
  secim.addEventListener('mousedown', (o) => { o.preventDefault(); if (acilir) kapat(); else ac(); });
}`;

/** Pencere (iframe) içeriği: form + yoklama + yeniden kurulum + global doğrulama + kilit katmanı + mesaj penceresi. */
function pencere(kanallar: { kod: string; ad: string }[]): FiksturYaniti {
  const kanalSecenekleri = kanallar.map((k) => `<option value="${k.kod}">${k.kod} - ${k.ad}</option>`).join('');
  return html('Kullanıcı değiştir', `<form method="post" action="/kullanici-degistir" onsubmit="kilitle()">
<input type="hidden" name="__DogrulamaJetonu" value="sahte-jeton">
<table><tr><td>Kanal</td><td><select id="Kanal" name="Kanal" format="Numeric" required="true"><option value="0">Seçiniz...</option>${kanalSecenekleri}</select></td></tr>
<tr><td>Kullanıcı</td><td id="Kullanici_Secim_Kabi"><select id="Kullanici" name="Kullanici" format="Username" required="true"><option value="0">Seçiniz...</option></select></td></tr></table>
<p><button type="submit" onclick="document.getElementById('Kanal').value='99999'; document.getElementById('Kullanici').value='kendi.kullanici';"><em><span>KENDİ ADI</span></em></button>
<button type="submit"><em><span>KULLANICI DEĞİŞTİR</span></em></button></p>
</form>
<script>
${SAHTE_ARAMALI_LISTE}
function kilitle() { const k = document.createElement('div'); k.className = 'blockUI blockOverlay'; k.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.2)'; document.body.append(k); }
function kilidiAc() { document.querySelectorAll('.blockUI').forEach((e) => e.remove()); }
function mesajGoster(metin) {
  kilidiAc();
  const d = document.createElement('div'); d.className = 'ui-dialog'; d.setAttribute('role', 'dialog');
  d.style.cssText = 'position:fixed;top:20px;left:20px;z-index:2000;background:#fff;border:1px solid #c33;padding:8px';
  d.innerHTML = '<div class="ui-dialog-titlebar">Uyarı</div><div class="ui-dialog-content"></div><button type="button">Tamam</button>';
  d.querySelector('.ui-dialog-content').textContent = metin;
  d.querySelector('button').onclick = () => d.remove();
  document.body.append(d);
}
const BICIMLER = { Numeric: /^\\d+$/, Username: /^[A-Za-z0-9._]+$/ };
function formuDogrula(form) {
  for (const e of form.elements) {
    if (!e.name || e.type === 'hidden') continue;
    const v = (e.value || '').trim();
    if (e.getAttribute('required') === 'true' && (v === '' || (e.tagName === 'SELECT' && v === '0'))) { mesajGoster(e.name + ' alanı zorunludur.'); return false; }
    const b = BICIMLER[e.getAttribute('format')];
    if (v && b && !b.test(v)) { mesajGoster(e.name + ' alanı geçersiz.'); return false; }
  }
  return true;
}
document.querySelectorAll('form').forEach((f) => f.addEventListener('submit', (o) => { if (!formuDogrula(f)) o.preventDefault(); }));
aramaliListe(document.getElementById('Kanal'));
aramaliListe(document.getElementById('Kullanici'));
let sonKanal = document.getElementById('Kanal').value;
(function yokla() {
  const v = document.getElementById('Kanal').value;
  if (v !== sonKanal) {
    sonKanal = v;
    fetch('/liste/kullanici/' + encodeURIComponent(v) + '?json=true').then((r) => r.json()).then((liste) => {
      const kap = document.getElementById('Kullanici_Secim_Kabi');
      kap.innerHTML = '<select id="Kullanici" name="Kullanici" format="Username" required="true"><option value="0">Seçiniz...</option>' +
        liste.map((k) => '<option value="' + k + '">' + k + '</option>').join('') + '</select>';
      aramaliListe(document.getElementById('Kullanici'));
    });
  }
  setTimeout(yokla, 200);
})();
</script>`, '<style>body{font:14px system-ui;margin:8px} td{padding:6px 8px} .select2-hidden-accessible{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden;clip:rect(0 0 0 0);border:0;padding:0;margin:-1px}' +
    '.select2-selection{display:inline-block;min-width:220px;border:1px solid #889;padding:3px 6px;cursor:pointer} .select2-results__options{list-style:none;margin:0;padding:0} .select2-results__option{padding:3px 6px}</style>');
}

/** Ana sayfa / ekran: kullanıcı bilgisi + pencereyi (fancybox benzeri) açan bağlantı. */
function ustSayfa(baslik: string, aktif: string): FiksturYaniti {
  return html(baslik, `<div id="profil"><span class="kullaniciBilgisi">${aktif}</span> <a class="kullaniciDegistir" href="/kullanici-degistir">Kullanıcı değiştir</a></div>
<h1>${baslik}</h1><p id="icerik">Ekran içeriği</p>
<script>
document.querySelector('a.kullaniciDegistir').addEventListener('click', (o) => {
  o.preventDefault();
  const ort = document.createElement('div'); ort.id = 'fancybox-overlay'; ort.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:1100';
  const kap = document.createElement('div'); kap.id = 'fancybox-wrap'; kap.style.cssText = 'position:fixed;top:40px;left:40px;z-index:1101;background:#fff;padding:6px';
  kap.innerHTML = '<div id="fancybox-content"><iframe id="fancybox-frame" name="fancybox-frame' + Date.now() + '" frameborder="0" style="width:520px;height:300px" src="' + o.currentTarget.getAttribute('href') + '"></iframe></div>';
  document.body.append(ort, kap);
});
</script>`);
}

class Uygulama {
  aktif = 'kendi.kullanici';
  readonly postlar: string[] = [];
  readonly listeIstekleri: string[] = [];
  readonly kanallar = [{ kod: '11111', ad: 'Ad' }, { kod: '22222', ad: 'Diğer' }];
  readonly kullanicilar: Record<string, string[]> = { '11111': ['11111001', '11111002'], '22222': ['22222001'] };
  readonly isle = (i: FiksturIstegi): FiksturYaniti => {
    if (i.yol === '/') return ustSayfa('Ana sayfa', this.aktif);
    if (i.yol === '/ekran') return ustSayfa('Ekran', this.aktif);
    if (i.yol === '/kullanici-degistir' && i.yontem === 'GET') return pencere(this.kanallar);
    if (i.yol === '/kullanici-degistir' && i.yontem === 'POST') {
      const f = new URLSearchParams(i.govde);
      this.postlar.push(`Kanal=${f.get('Kanal')} Kullanici=${f.get('Kullanici')}`);
      const kanal = f.get('Kanal') ?? '';
      const kullanici = f.get('Kullanici') ?? '';
      if (!(this.kullanicilar[kanal] ?? []).includes(kullanici)) return html('Hata', '<p class="hata">Geçersiz seçim</p>');
      this.aktif = kullanici;
      return { durum: 303, tur: 'text/plain', govde: '', basliklar: { location: '/kullanici-degistir-tamamlandi' } };
    }
    if (i.yol === '/kullanici-degistir-tamamlandi') return html('Tamamlandı', '<p>Kullanıcı değiştirildi.</p><script>setTimeout(() => { window.top.location.href = "/"; }, 100);</script>');
    const liste = /^\/liste\/kullanici\/([^/]+)$/.exec(i.yol);
    if (liste) {
      const kod = decodeURIComponent(liste[1]);
      this.listeIstekleri.push(kod);
      return { tur: 'application/json', govde: JSON.stringify(this.kullanicilar[kod] ?? []), gecikmeMs: 300 };
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}

const CERCEVE = ['iframe#fancybox-frame'];

/** Kullanıcı modelindeki adımların nötr karşılığı. adim3Sn: pencerenin kapanması için bekleme. */
function model(adim3Sn = 30): Nesne {
  const alan = (id: string, etiket: string, secici: string, ek: Nesne = {}): Nesne => ({
    id, tip: 'secim', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, doldurucu: 'ozelSecim',
    konum: { secici, kirilganlik: 'dusuk', cerceve: CERCEVE }, ...ek
  });
  return {
    semaSurumu: 2, tur: 'ekran', id: 'kullanici-degistirme', ad: 'Kullanıcı değiştirme', ekranUrl: '/ekran', girisGerekmez: true, kosullar: {},
    adimlar: [
      {
        id: 'pencereAcilir', sira: 1, baslik: 'Pencere açılır', bolumler: [],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: 'a.kullaniciDegistir[href*="kullanici-degistir"]' }], basariGostergesi: { tur: 'eleman', deger: 'button[type="submit"]', cerceve: CERCEVE }, zamanAsimiSn: 10 }
      },
      {
        id: 'kullaniciSecilir', sira: 2, baslik: 'Kanal ve kullanıcı seçilir',
        bolumler: [{ id: 'secim', baslik: 'Seçim', alanlar: [
          alan('kanalKodu', 'Kanal', '#Kanal', { doldurucuParametreleri: { bekle: { secici: '#Kullanici option:nth-child(2)', durum: 'dolu', zamanAsimiSn: 20 } } }),
          alan('kanalKullanicisi', 'Kullanıcı', '#Kullanici')
        ] }],
        kosu: {
          aksiyonlar: [{ tur: 'tikla', secici: 'button[type="submit"]', metin: 'KULLANICI DEĞİŞTİR', cerceve: CERCEVE }],
          basariGostergesi: { tur: 'eleman', deger: '#profil .kullaniciBilgisi' }, zamanAsimiSn: 15
        }
      },
      {
        id: 'pencereKapanir', sira: 3, baslik: 'Pencere kapanır, ekrana dönülür', bolumler: [],
        kosu: { aksiyonlar: [{ tur: 'bekle', secici: 'iframe#fancybox-frame', durum: 'gizli', zamanAsimiSn: adim3Sn }, { tur: 'ekranaDon' }], basariGostergesi: { tur: 'eleman', deger: '#icerik' }, zamanAsimiSn: 10 }
      }
    ],
    senaryoDuzeyi: { alanlar: [] }, urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

let tarayici: Browser;
let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
let uygulama: Uygulama;

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

const senaryo = (m: Nesne, veri: Nesne): PlatformModelSenaryosu => ({
  id: 'iframe-1', baslik: 'Kullanıcı değiştirme', kosuyaDahil: true, ekran: { id: 'e1', anahtar: String(m.id), ad: String(m.ad) }, model: m, modelSurumu: 1, altModeller: {}, veri, mutlakaGorunmeli: []
});

async function kos(testInfo: TestInfo, m: Nesne, veri: Nesne): Promise<{ page: Page; hata: string | null; kapat: () => Promise<void> }> {
  const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
  const page = await baglam.newPage();
  const ortam: ModelKosuOrtami = {
    veri: { ortam: 'genel', ortamId: 'o1', tabanUrl: sunucu.adres, senaryolar: [], baglamProfilleri: {} },
    tarif: () => { throw new Error('giriş yok'); }, kimlik: () => { throw new Error('giriş yok'); }, oturumDosyasi: () => ''
  };
  let hata: string | null = null;
  try { await modelSenaryosunuKos(page, testInfo, senaryo(m, veri), ortam); } catch (e) { hata = (e as Error).message; }
  return { page, hata, kapat: () => baglam.close() };
}

test('koşu: kanal "kod - ad" metninden kodla seçilir, kullanıcı listesi gelir, KULLANICI DEĞİŞTİR formu gönderir, pencere kapanır, ekrana dönülür', async ({}, testInfo) => {
  test.setTimeout(120_000);
  uygulama.aktif = 'kendi.kullanici';
  const oncePost = uygulama.postlar.length;
  const onceListe = uygulama.listeIstekleri.length;
  const basla = Date.now();
  const { page, hata, kapat } = await kos(testInfo, model(), { kanalKodu: '11111', kanalKullanicisi: '11111001' });
  try {
    expect(hata).toBeNull();
    expect(uygulama.listeIstekleri.slice(onceListe)).toEqual(['11111']);
    expect(uygulama.postlar.slice(oncePost)).toEqual(['Kanal=11111 Kullanici=11111001']);
    expect(new URL(page.url()).pathname).toBe('/ekran');
    await expect(page.locator('#profil .kullaniciBilgisi')).toHaveText('11111001');
    await expect(page.locator('iframe#fancybox-frame')).toHaveCount(0);
    // Görünen bileşenden seçildi: zaman aşımına düşüp yedeğe geçmedi (eski davranış: kanal seçeneği aranırken 3 sn, açık kalan kanal
    // listesi kullanıcı kutusunu örttüğü için 5 sn zaman aşımı; toplam ~12 sn).
    expect(Date.now() - basla).toBeLessThan(8_000);
  } finally {
    await kapat();
  }
});

test('koşu: gönderimde sayfa içi doğrulama mesajı çıkarsa adım o mesajla kalır ve mesaj yakalanır (sessiz bekleme yok)', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const oncePost = uygulama.postlar.length;
  // Kullanıcı alanı senaryoda boş: form "Kullanıcı seçilmedi" durumunda gönderilir → global doğrulama mesajı.
  const m = model();
  const basla = Date.now();
  const { page, hata, kapat } = await kos(testInfo, m, { kanalKodu: '11111' });
  try {
    expect(hata).toContain('Kullanici alanı zorunludur.');
    expect(hata).toContain('Kanal ve kullanıcı seçilir');
    expect(uygulama.postlar.slice(oncePost)).toEqual([]);
    // Sessiz 30 sn bekleme yok: adım 2 mesajla kalır, adım 3'e geçilmez.
    expect(hata).not.toContain('30000ms');
    expect(Date.now() - basla).toBeLessThan(20_000);
    expect(mesajYakalayicisi(page)?.liste()).toEqual(expect.arrayContaining([expect.objectContaining({ kaynak: 'diyalog', metin: expect.stringContaining('Kullanici alanı zorunludur.'), adim: 'Kanal ve kullanıcı seçilir' })]));
  } finally {
    await kapat();
  }
});
