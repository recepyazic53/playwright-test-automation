// KORUMA TESTLERİ — giriş tarifinde "Her girişte çalışacak akış" (giris/giris-sonrasi-akis.mjs + giriş motoru):
//  - akış modeli giriş motorunun adımlarına çevrilir (senaryo alanı → seç / doldur "{alan}", aksiyon → tıkla, başarı → görünmesini bekle;
//    pencere kapanmasını bekleme ve ekrana dönüş atlanır; desteklenmeyen şey açık hata),
//  - tarif doğrulaması seçimi ve değerleri tutar,
//  - girişten sonra akış uygulanır (aramalı kutudan seçimle; bağlı liste yalnız kutudan seçilince yüklenir), eksik değer açık hata,
//  - genel senaryodan açılan plan adımı kaynak dosyasını taşır (koşucu senaryoda aynı akış varsa tariftekini atlar).
// Güvenlik: yalnız yerel içerik (page.setContent); dışarıya istek yok. Değerler SAHTEDİR.
import { expect, test } from '@playwright/test';
import { girisSonrasiAdimlari } from '../../scripts/platform/giris/giris-sonrasi-akis.mjs';
import { girisTarifiniDogrula, type GirisTarifi } from '../../scripts/platform/giris/tarif.mjs';
import { ortakAkislariAc } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { GirisHatasi, girisSonrasiAkisiniUygula } from '../support/giris-motoru';
import { korumaliTarayici } from './giris-fikstur';

type Nesne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- model JSON'u serbestçe gezilir

/** "Kullanıcı değiştir" biçiminde akış: bağlantıya tıkla → pencere; acente + kullanıcı seç → düğme → üstte kullanıcı bilgisi. */
const AKIS: Nesne = {
  semaSurumu: 2, tur: 'ortakAkis', id: 'kullanici-degistir', ad: 'Kullanıcı değiştir', kosullar: {},
  adimlar: [
    { id: 'pencere', sira: 1, baslik: 'Pencere açılır', bolumler: [{ id: 'b1', alanlar: [{ id: 'bag', tip: 'baglanti', yapilandirma: 'aksiyon', konum: { secici: '#ac' } }] }],
      kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#ac' }], basariGostergesi: { tur: 'eleman', deger: '#pencere' }, zamanAsimiSn: 10 } },
    { id: 'sec', sira: 2, baslik: 'Seçilir', bolumler: [{ id: 'b2', alanlar: [
      { id: 'acenteKodu', tip: 'secim', etiket: { ekran: 'Acente' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'acenteKodu' }, seceneklerDurumu: 'dinamik', konum: { secici: '#acente' } },
      { id: 'acenteKullanicisi', tip: 'secim', etiket: { ekran: 'Kullanıcı' }, yapilandirma: 'senaryo', eslesme: { senaryo: 'acenteKullanicisi' }, konum: { secici: '#kullanici' } }
    ] }],
    kosu: { aksiyonlar: [{ tur: 'tikla', secici: 'button', metin: 'DEĞİŞTİR' }, { tur: 'bekle', secici: '#pencere', durum: 'gizli' }, { tur: 'ekranaDon' }],
      basariGostergesi: { tur: 'eleman', deger: '#durum.tamam' }, zamanAsimiSn: 10 } }
  ]
};

test('akış giriş adımlarına çevrilir: alan → seç "{alan}", aksiyon → tıkla, başarı → bekle; kaybolma beklemesi / ekrana dönüş atlanır', () => {
  const { adimlar, hatalar } = girisSonrasiAdimlari(AKIS);
  expect(hatalar).toEqual([]);
  expect(adimlar.map((a) => [a.islem, a.hedef?.secici ?? null, a.deger ?? a.hedef?.metin ?? null])).toEqual([
    ['tikla', '#ac', null], ['gorunurBekle', '#pencere', null],
    ['sec', '#acente', '{acenteKodu}'], ['sec', '#kullanici', '{acenteKullanicisi}'], ['tikla', 'button', 'DEĞİŞTİR'], ['gorunurBekle', '#durum.tamam', null]
  ]);
  // Desteklenmeyen: iç içe genel senaryo, bilinmeyen aksiyon.
  expect(girisSonrasiAdimlari({ adimlar: [{ id: 'x', ortakAkis: { dosya: 'a.model.json' } }] }).hatalar.join(' ')).toMatch(/iç içe genel senaryo/);
  expect(girisSonrasiAdimlari({ adimlar: [{ id: 'y', kosu: { aksiyonlar: [{ tur: 'surukle' }] } }] }).hatalar.join(' ')).toMatch(/"surukle" aksiyonu/);
});

test('tarif: her girişte çalışacak akış seçimi ve değerleri tutulur; geçersiz dosya adı reddedilir', () => {
  const temel = { girisAdresi: '/', kullaniciAlani: '#k', parolaAlani: '#p', gonderDugmesi: '#g', basariGostergesi: { tur: 'metin', deger: 'Çıkış' } };
  const d = girisTarifiniDogrula({ ...temel, girisSonrasiAkis: { dosya: 'kullanici-degistir.model.json', degerler: { acenteKodu: '30447', bos: '' } } });
  expect(d.gecerli).toBe(true);
  expect(d.tarif?.girisSonrasiAkis).toEqual({ dosya: 'kullanici-degistir.model.json', degerler: { acenteKodu: '30447' } });
  expect(girisTarifiniDogrula({ ...temel, girisSonrasiAkis: { dosya: '../x.json' } }).hatalar.join(' ')).toMatch(/Her girişte çalışacak akış geçersiz/);
  expect(girisTarifiniDogrula(temel).tarif?.girisSonrasiAkis).toBeUndefined();
});

test('girişten sonra akış uygulanır: aramalı kutulardan seçilir (kullanıcılar yalnız kutudan acente seçilince gelir); eksik değer açık hata', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await (await tarayici.newContext()).newPage();
    await page.setContent(`<a id="ac" href="#" onclick="document.getElementById('pencere').hidden=false;return false">Kullanıcı Değiştir</a>
      <div id="pencere" hidden>
        <div><select id="acente" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"><option value="">Seçin</option>
          <option value="30447">30447 - ACENTE</option><option value="30448">30448 - DİĞER</option></select></div>
        <div><select id="kullanici" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"><option value="">Seçin</option></select></div>
        <button type="button" onclick="document.getElementById('pencere').hidden=true;document.getElementById('durum').className='tamam'">DEĞİŞTİR</button>
      </div><p id="durum">kullanıcı</p>
      <script>
      function ozel(s, secince) {
        const kap = document.createElement('div'); kap.className = 'select2-container'; kap.style.cssText = 'width:200px;border:1px solid #888';
        const kutu = document.createElement('span'); kutu.className = 'select2-selection'; kutu.setAttribute('role', 'combobox'); kutu.textContent = 'Seçin'; kutu.style.cssText = 'display:block;padding:4px';
        const acilir = document.createElement('div'); acilir.hidden = true;
        const ara = document.createElement('input'); ara.type = 'search';
        const ul = document.createElement('ul'); ul.setAttribute('role', 'listbox');
        const ciz = () => { ul.replaceChildren(...[...s.options].filter((o) => o.value && o.text.includes(ara.value)).map((o) => {
          const li = document.createElement('li'); li.setAttribute('role', 'option'); li.textContent = o.text;
          li.addEventListener('click', () => { s.value = o.value; kutu.textContent = o.text; acilir.hidden = true; secince(o.value); });
          return li; })); };
        ara.addEventListener('input', ciz);
        kutu.addEventListener('click', () => { acilir.hidden = !acilir.hidden; ciz(); if (!acilir.hidden) ara.focus(); });
        acilir.append(ara, ul); kap.append(kutu, acilir); s.after(kap);
      }
      const k = document.getElementById('kullanici');
      ozel(document.getElementById('acente'), (kod) => setTimeout(() => { k.add(new Option(kod + '001 - DENEME', kod + '001')); }, 400));
      ozel(k, () => {});
      </script>`);
    const { adimlar } = girisSonrasiAdimlari(AKIS);
    const tarif = (degerler: Record<string, string>) => ({ girisSonrasi: { dosya: 'kullanici-degistir.model.json', ad: 'Kullanıcı değiştir', adimlar, degerler } }) as unknown as GirisTarifi;
    // Eksik değer: siteye dokunulmadan açık hata.
    const eksik = await girisSonrasiAkisiniUygula(page, tarif({ acenteKodu: '30447' })).then(() => null, (h: unknown) => h);
    expect(eksik).toBeInstanceOf(GirisHatasi);
    expect(String((eksik as Error).message)).toMatch(/acenteKullanicisi/);
    expect(await page.locator('#pencere').isHidden()).toBe(true);
    await girisSonrasiAkisiniUygula(page, tarif({ acenteKodu: '30447', acenteKullanicisi: '30447001' }));
    expect(await page.locator('#acente').inputValue()).toBe('30447');
    expect(await page.locator('#kullanici').inputValue()).toBe('30447001');
    await expect(page.locator('#durum')).toHaveClass('tamam');
    // Akış yoksa hiçbir şey yapılmaz; çözülemeyen akış açık hata.
    await girisSonrasiAkisiniUygula(page, {} as GirisTarifi);
    const hatali = await girisSonrasiAkisiniUygula(page, { girisSonrasi: { dosya: 'x.model.json', ad: 'x', adimlar: [], degerler: {}, hata: '"x" akışı projede yok' } } as unknown as GirisTarifi).then(() => null, (h: unknown) => h);
    expect(String((hatali as Error).message)).toMatch(/akışı projede yok/);
  } finally { await tarayici.close(); }
});

test('genel senaryodan açılan plan adımı kaynak dosyasını taşır (koşucu: senaryoda aynı akış varsa tariftekini atlar)', () => {
  const ekran = { id: 'ekran', adimlar: [{ id: 'kd', sira: 1, baslik: 'Kullanıcı değiştir', ortakAkis: { dosya: 'kullanici-degistir.model.json' } }, { id: 'form', sira: 2, baslik: 'Form', bolumler: [] }] };
  const acik = ortakAkislariAc(ekran, { 'kullanici-degistir.model.json': AKIS }) as unknown as { model: Nesne };
  const dosyalar = (acik.model.adimlar as Nesne[]).map((a) => a.ortakAkisDosyasi ?? null);
  expect(dosyalar).toEqual(['kullanici-degistir.model.json', 'kullanici-degistir.model.json', null]);
});
