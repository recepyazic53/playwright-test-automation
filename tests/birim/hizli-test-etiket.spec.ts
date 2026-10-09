// HIZLI TEST — ALAN ETİKETLERİ VE HAZIR DEĞERLER (sayfa envanteri):
//  - yan yana sütun başlıkları (D.TARİHİ | TELEFON | TC KİMLİK NO) tek etiket olmaz: her alan KENDİ sütununun başlığını alır
//    (başlık satırı <div> hücreleri de <table> th'leri de),
//  - etiketi hiç olmayan alan sayfada yakınındaki (üstündeki / solundaki) görünen metinden ad alır; teknik ad (name / id) etiket olmaz,
//  - alanın sayfada HAZIR gelen değeri okunur (metin, seçili seçenek); "SEÇİNİZ" gibi boş seçenek hazır sayılmaz.
// Güvenlik: yalnızca 127.0.0.1'deki sahte sayfa (bağımlılık yok); tarayıcı DNS çözümlemez. Değerler SAHTEDİR.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { envanterOku } from '../../scripts/platform/tarama/tarama-motoru';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';

const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Yurt dışı kayıt</title><style>
body{font:14px Arial;margin:0;padding:24px;width:1100px}
.kutu{border:2px solid #e9a92a;border-radius:10px;padding:14px;margin:10px 0}
.sira{display:flex;gap:24px;align-items:flex-end}
.hucre{display:flex;flex-direction:column;gap:2px;width:120px}
.hucre small{font-size:12px}
.baslik-satiri{display:flex;gap:10px}.baslik-satiri span{width:112px;font-size:12px}
.giris-satiri{display:flex;gap:10px}.giris-satiri input{width:104px}
.adet{display:flex;align-items:center;gap:4px}.adet button{width:20px}
table.kisi{border-collapse:collapse}table.kisi th{font-size:12px;text-align:left;padding:2px 8px}table.kisi td{padding:2px 8px}
</style></head><body>
<div class="kutu" id="bir">
  <div class="baslik-satiri" style="gap:12px"><span style="width:104px">BAŞLANGIÇ</span><span style="width:104px">BİTİŞ</span><span style="width:150px">KAPSAM</span><span style="width:150px">ALTERNATİF</span><span style="width:90px">KİŞİ SAYISI</span></div>
  <div class="giris-satiri" style="gap:12px;align-items:center">
    <div style="width:104px"><input name="from" value="30.09.2026"></div>
    <div style="width:104px"><input name="to" value="07.10.2026"></div>
    <div style="width:150px;text-align:center">◀ DÜNYA ▶</div>
    <div style="width:150px;text-align:center">◀ TÜM DÜNYA ▶</div>
    <div class="adet" style="width:90px"><button type="button">-</button><input name="kisi_sayisi" value="1" size="2"><button type="button">+</button></div>
  </div>
  <div style="margin-top:8px;width:190px">
    <div style="font-size:12px">GİDECEK ÜLKE</div>
    <div class="sarmal" style="border:1px solid #e9a92a;border-radius:6px;padding:2px"><select name="cmbCountries" style="width:100%"><option value="">SEÇİNİZ</option><option value="US">A.B.D</option><option value="FR">FRANSA</option></select></div>
  </div>
</div>
<div style="text-align:center"><select name="selectAllClientPolicy"><option value="1" selected>Tekli Sorgulama</option><option value="2">Toplu Sorgulama</option></select></div>
<div class="kutu" id="iki">
  <div>Ödeyen
    <label><input type="radio" name="odeyen" value="kendisi" checked> Kişinin Kendisi</label>
    <label><input type="radio" name="odeyen" value="baska"> Farklı Kişi / Kurum</label></div>
  <hr>
  <div class="baslik-satiri"><span>D.TARİHİ</span><span>TELEFON</span><span>TC KİMLİK NO</span><span>AD SOYAD</span></div>
  <div class="giris-satiri">
    <input name="dogum" data-x="d"><input name="insurers-1-tel"><input name="insurer-1-textbox"><input name="insurer-1-ad">
  </div>
</div>
<div class="kutu" id="dort">
  <table><tr height="50px">
    <td align="left" width="130">Kart üzerindeki isim
    </td>
    <td align="center" width="20">:
    </td>
    <td align="left" width="150"><input type="text" name="isim" id="isim" style="width:110px" maxlength="30"></td>
    <td align="left" width="130">Kart üzerindeki soyisim
    </td>
    <td align="center" width="20">:
    </td>
    <td align="left" width="150"><input type="text" name="soyisim" id="soyisim" style="width:110px" maxlength="30"></td>
  </tr></table>
</div>
<div class="kutu" id="uc">
  <table class="kisi"><thead><tr><th>Ad</th><th>Soyad</th><th>Pasaport No</th></tr></thead>
    <tbody><tr><td><input name="t_ad"></td><td><input name="t_soyad"></td><td><input name="t_pasaport"></td></tr></tbody></table>
</div>
</body></html>`;

type Alan = { ad: string | null; etiket: string | null; mevcut?: string | null; hazir?: boolean };

test.describe('Nöbetçi taraması: alan etiketleri ve hazır değerler (127.0.0.1)', () => {
  let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let page: Page;
  test.beforeAll(async () => {
    sunucu = await yerelSunucu(() => ({ tur: 'text/html; charset=utf-8', govde: SAYFA }));
    tarayici = await korumaliTarayici();
    page = await (await tarayici.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    await page.goto(`${sunucu.adres}/`);
  });
  test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });

  const oku = async (): Promise<Record<string, Alan>> => {
    const e = await envanterOku(page, { degerOku: true });
    return Object.fromEntries(e.alanlar.map((a) => [String(a.ad ?? a.anahtar), a as Alan]));
  };

  test('yan yana sütun başlıkları: her alan kendi sütununun başlığını alır (div satırı ve tablo)', async () => {
    const a = await oku();
    expect(a.dogum.etiket).toBe('D.TARİHİ');
    expect(a['insurers-1-tel'].etiket).toBe('TELEFON');
    expect(a['insurer-1-textbox'].etiket).toBe('TC KİMLİK NO');
    expect(a['insurer-1-ad'].etiket).toBe('AD SOYAD');
    expect(a.t_ad.etiket).toBe('Ad');
    expect(a.t_soyad.etiket).toBe('Soyad');
    expect(a.t_pasaport.etiket).toBe('Pasaport No');
  });

  test('tablo hücresinde "Etiket : [alan]": araya giren ":" hücresi etiket sayılmaz, alan solundaki metni alır', async () => {
    const a = await oku();
    expect(a.isim.etiket).toBe('Kart üzerindeki isim');
    expect(a.soyisim.etiket).toBe('Kart üzerindeki soyisim');
  });

  test('sütun ve satır başlıkları sayfadaki yakın metinden gelir; teknik ad etiket olmaz', async () => {
    const a = await oku();
    expect(a.from.etiket).toBe('BAŞLANGIÇ');
    expect(a.to.etiket).toBe('BİTİŞ');
    expect(a.kisi_sayisi.etiket).toBe('KİŞİ SAYISI');
    expect(a.cmbCountries.etiket).toBe('GİDECEK ÜLKE');
    for (const x of Object.values(a)) expect(x.etiket ?? '', `${x.ad}`).not.toMatch(/^(to|from|cmb|select|insurer|kisi_)/i);
  });

  test('hazır değerler: dolu alan ve seçili seçenek hazır; boş metin ve "SEÇİNİZ" boş', async () => {
    const a = await oku();
    expect(a.from).toMatchObject({ mevcut: '30.09.2026', hazir: true });
    expect(a.kisi_sayisi).toMatchObject({ mevcut: '1', hazir: true });
    expect(a.selectAllClientPolicy).toMatchObject({ mevcut: 'Tekli Sorgulama', hazir: true });
    expect(a.odeyen).toMatchObject({ mevcut: 'Kişinin Kendisi', hazir: true });
    expect(a.cmbCountries.hazir).toBe(false);
    expect(a.dogum.hazir).toBe(false);
    expect(a.t_ad.hazir).toBe(false);
  });
});
